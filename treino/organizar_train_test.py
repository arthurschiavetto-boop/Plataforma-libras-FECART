#!/usr/bin/env python3
"""
SinaLibras — organiza um dataset "plano" (uma pasta por letra, sem
train/test) na estrutura que o extrair_landmarks.py espera.

Antes:
    dataset/
      A/ 1.jpg 2.jpg 3.jpg ...
      B/ ...

Depois:
    dataset-organizado/
      train/A/ ...  (80% das imagens, por padrão)
      test/A/  ...  (20% restante)

Uso:
    python organizar_train_test.py --entrada dataset --saida dataset-organizado
    python organizar_train_test.py --entrada dataset --saida dataset-organizado --proporcao 0.9

Move os arquivos por padrão (mais rápido, não duplica espaço em disco). Use
--copiar se quiser manter a pasta original intacta.
"""

import argparse
import random
import shutil
from pathlib import Path

EXTENSOES_IMAGEM = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", required=True, help="pasta com uma subpasta por letra")
    ap.add_argument("--saida", required=True, help="pasta onde criar train/ e test/")
    ap.add_argument("--proporcao", type=float, default=0.8,
                    help="fração das imagens que vai para train (padrão: 0.8 = 80%%)")
    ap.add_argument("--copiar", action="store_true",
                    help="copia os arquivos em vez de mover (mantém a pasta original intacta)")
    ap.add_argument("--seed", type=int, default=42, help="semente do embaralhamento")
    args = ap.parse_args()

    raiz = Path(args.entrada)
    saida = Path(args.saida)
    if not raiz.is_dir():
        raise SystemExit(f"pasta não encontrada: {raiz}")

    transferir = shutil.copy2 if args.copiar else shutil.move
    verbo = "copiadas" if args.copiar else "movidas"

    random.seed(args.seed)
    total_train = total_test = 0

    pastas_letra = sorted(p for p in raiz.iterdir() if p.is_dir())
    if not pastas_letra:
        raise SystemExit(f"nenhuma subpasta encontrada em {raiz}")

    for pasta in pastas_letra:
        letra = pasta.name
        arquivos = sorted(f for f in pasta.iterdir()
                          if f.is_file() and f.suffix.lower() in EXTENSOES_IMAGEM)
        if not arquivos:
            print(f"  {letra}: nenhuma imagem encontrada, pulando")
            continue

        random.shuffle(arquivos)
        corte = round(len(arquivos) * args.proporcao)
        # garante pelo menos 1 imagem de teste quando há mais de uma amostra
        if corte == len(arquivos) and len(arquivos) > 1:
            corte -= 1

        treino, teste = arquivos[:corte], arquivos[corte:]

        pasta_train = saida / "train" / letra
        pasta_test = saida / "test" / letra
        pasta_train.mkdir(parents=True, exist_ok=True)
        pasta_test.mkdir(parents=True, exist_ok=True)

        for f in treino:
            transferir(str(f), str(pasta_train / f.name))
        for f in teste:
            transferir(str(f), str(pasta_test / f.name))

        total_train += len(treino)
        total_test += len(teste)
        print(f"  {letra}: {len(treino)} treino, {len(teste)} teste")

    print(f"\n{total_train + total_test} imagens {verbo} para {saida}/")
    print(f"  train: {total_train}")
    print(f"  test:  {total_test}")


if __name__ == "__main__":
    main()
