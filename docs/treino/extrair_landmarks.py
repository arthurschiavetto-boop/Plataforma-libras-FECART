#!/usr/bin/env python3
"""
SinaLibras — extração de landmarks a partir de imagens.

Aceita duas estruturas de pasta, detectadas automaticamente:

  1) letras direto na raiz:
       dataset/A/*.jpg  dataset/B/*.jpg  ...

  2) train/test com letras dentro de cada um (em qualquer profundidade,
     cobre o caso de dataset do Kaggle vir aninhado):
       dataset/train/A/*.jpg  dataset/train/B/*.jpg  ...
       dataset/test/A/*.jpg   dataset/test/B/*.jpg   ...

Para cada imagem roda o MediaPipe Hands e salva os 21 pontos CRUS mais o lado
da mão. As features são calculadas depois, no treinar.py — guardar cru é o que
permite melhorar o extrator sem refazer a extração.

    pip install mediapipe==0.10.14 opencv-python

    python extrair_landmarks.py --idioma libras
    python extrair_landmarks.py --idioma asl

Sem --entrada/--saida, ele usa dataset-<idioma>/ e dataset-<idioma>.json.
As letras feitas com movimento são puladas conforme o idioma (ver idiomas.py).
"""

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import mediapipe as mp

import idiomas


def eh_pasta_de_letra(p: Path) -> bool:
    return len(p.name) == 1 and p.name.isalpha()


def pastas_de_letra_recursivo(base: Path):
    """
    Acha pastas cujo nome é uma única letra, em qualquer profundidade
    dentro de `base`. Para de descer assim que acha uma pasta de letra.
    """
    encontradas = []
    for p in sorted(base.iterdir()):
        if not p.is_dir():
            continue
        if eh_pasta_de_letra(p):
            encontradas.append(p)
        else:
            encontradas.extend(pastas_de_letra_recursivo(p))
    return encontradas


def pastas_de_letras(raiz: Path):
    """
    Devolve uma lista de (pasta_da_letra, rótulo_de_origem) a processar.
    Detecta sozinho se `raiz` já tem as letras, ou se tem train/ e test/.
    """
    subpastas = [p for p in raiz.iterdir() if p.is_dir()]
    nomes = {p.name.lower() for p in subpastas}

    if "train" in nomes or "test" in nomes:
        pares = []
        for divisao in ("train", "test"):
            candidatos = [p for p in subpastas if p.name.lower() == divisao]
            if not candidatos:
                print(f"aviso: pasta '{divisao}' não encontrada, pulando")
                continue
            pasta_divisao = candidatos[0]
            for pasta_letra in pastas_de_letra_recursivo(pasta_divisao):
                pares.append((pasta_letra, divisao))
        return pares

    return [(p, "raiz") for p in pastas_de_letra_recursivo(raiz)]


def formatar_tempo(segundos: float) -> str:
    segundos = int(segundos)
    if segundos < 60:
        return f"{segundos}s"
    minutos, s = divmod(segundos, 60)
    if minutos < 60:
        return f"{minutos}min{s:02d}s"
    horas, m = divmod(minutos, 60)
    return f"{horas}h{m:02d}min"


def imprimir_progresso(feito, total, inicio, largura=30):
    decorrido = time.time() - inicio
    fracao = feito / total if total else 1
    preenchido = int(largura * fracao)
    barra = "#" * preenchido + "-" * (largura - preenchido)

    velocidade = feito / decorrido if decorrido > 0 else 0
    restante = (total - feito) / velocidade if velocidade > 0 else 0

    msg = (f"\r[{barra}] {feito}/{total} ({fracao*100:5.1f}%) "
           f"· decorrido {formatar_tempo(decorrido)} "
           f"· restante ~{formatar_tempo(restante)}   ")
    sys.stdout.write(msg)
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--idioma", default=idiomas.PADRAO,
                    choices=list(idiomas.IDIOMAS),
                    help="qual alfabeto está sendo extraído")
    ap.add_argument("--entrada", default=None,
                    help="pasta com as letras, ou com train/ e test/ dentro "
                         "(padrão: dataset-<idioma>)")
    ap.add_argument("--saida", default=None,
                    help="arquivo de saída (padrão: dataset-<idioma>.json)")
    ap.add_argument("--incluir-dinamicas", action="store_true",
                    help="não pular as letras feitas com movimento")
    args = ap.parse_args()

    excluidas = idiomas.excluidas(args.idioma)
    entrada = args.entrada or f"dataset-{args.idioma}"
    saida = args.saida or f"dataset-{args.idioma}.json"

    print(f"idioma: {idiomas.nome(args.idioma)} · "
          f"{len(idiomas.letras(args.idioma))} letras estáticas · "
          f"excluídas: {', '.join(sorted(excluidas))}", flush=True)

    hands = mp.solutions.hands.Hands(
        static_image_mode=True, max_num_hands=1, min_detection_confidence=0.4)

    raiz = Path(entrada)
    if not raiz.is_dir():
        raise SystemExit(f"pasta não encontrada: {raiz}")

    tarefas = pastas_de_letras(raiz)
    if not tarefas:
        raise SystemExit(f"nenhuma subpasta de letra encontrada em {raiz}")

    tarefas_validas = []
    for pasta_letra, origem in tarefas:
        letra = pasta_letra.name.upper()
        if letra in excluidas and not args.incluir_dinamicas:
            continue
        tarefas_validas.append((pasta_letra, origem, letra))

    origens = {origem for _, origem, _ in tarefas_validas}
    if origens != {"raiz"}:
        print(f"estrutura detectada: {' + '.join(sorted(origens))}", flush=True)

    print("contando imagens...", flush=True)
    arquivos_por_pasta = []
    total_arquivos = 0
    for pasta_letra, origem, letra in tarefas_validas:
        arquivos = [f for f in pasta_letra.iterdir() if f.is_file()]
        arquivos_por_pasta.append((letra, arquivos))
        total_arquivos += len(arquivos)

    print(f"{total_arquivos} imagens em {len(tarefas_validas)} pastas · começando extração\n", flush=True)

    amostras = []
    perdidas = Counter()
    por_letra = Counter()

    feito = 0
    inicio = time.time()
    ultimo_print = 0.0

    for letra, arquivos in arquivos_por_pasta:
        for img_path in arquivos:
            img = cv2.imread(str(img_path))
            if img is not None:
                res = hands.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                if res.multi_hand_landmarks:
                    lm = [[p.x, p.y, p.z] for p in res.multi_hand_landmarks[0].landmark]
                    lado = res.multi_handedness[0].classification[0].label
                    amostras.append({"label": letra, "raw": lm, "handedness": lado})
                    por_letra[letra] += 1
                else:
                    perdidas[letra] += 1
            else:
                perdidas[letra] += 1

            feito += 1
            agora = time.time()
            if agora - ultimo_print > 0.2 or feito == total_arquivos:
                imprimir_progresso(feito, total_arquivos, inicio)
                ultimo_print = agora

    print()  # fecha a linha da barra de progresso

    payload = {"version": 2, "idioma": args.idioma, "pointCount": 21,
               "format": "raw", "samples": amostras}
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    total_tempo = time.time() - inicio
    print(f"\nconcluído em {formatar_tempo(total_tempo)}")
    print(f"{len(amostras)} amostras salvas em {saida}\n")

    print("amostras por letra:")
    for letra in sorted(por_letra):
        print(f"  {letra}: {por_letra[letra]}")

    todas = {letra for _, _, letra in tarefas_validas}
    faltando = todas - set(por_letra)
    if faltando:
        print(f"\naviso: nenhuma amostra para {', '.join(sorted(faltando))}")

    if perdidas:
        print("\nmão não detectada:", dict(perdidas.most_common()))
        print("(essas letras costumam ser as que o modelo erra depois — considere")
        print(" olhar essas imagens: podem estar cortadas, borradas, ou com a mão")
        print(" muito na borda do quadro)")


if __name__ == "__main__":
    main()
