#!/usr/bin/env python3
"""
SinaLibras — treino do classificador de letras.

Lê o dataset de landmarks CRUS (saída do coletor ou do extrair_landmarks.py),
calcula as features com o treino/features.py, treina uma rede densa e exporta
os pesos em JSON. O site executa essa rede em JavaScript puro — não precisa de
TensorFlow.js nem de servidor.

    pip install scikit-learn numpy

    python treinar.py --idioma libras
    python treinar.py --idioma asl

Sem --entrada/--saida ele lê dataset-<idioma>.json e escreve o modelo em
../models/<idioma>/alfabeto.json — exceto para libras, que por padrão ainda
escreve em ../js/modelo.json, para não quebrar o site atual.

Datasets antigos (com o campo "landmarks" de 63 números já normalizados)
continuam funcionando: o script detecta e treina em modo v1, mas avisa que a
qualidade é bem menor.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler

import features as F
import idiomas


def carregar(caminho, excluidas):
    with open(caminho, encoding="utf-8") as f:
        data = json.load(f)

    amostras = data["samples"]
    X, y, versao = [], [], F.VERSAO

    if amostras and "raw" in amostras[0]:
        for s in amostras:
            if s["label"].upper() in excluidas:
                continue
            X.append(F.v2(s["raw"], s.get("handedness", "Right")))
            y.append(s["label"].upper())
    else:
        versao = "v1"
        print("AVISO: dataset antigo (features já normalizadas). Treinando em v1.")
        print("       Recolete com o coletor novo para ganhar bastante precisão.\n")
        for s in amostras:
            if s["label"].upper() in excluidas:
                continue
            X.append(s["landmarks"])
            y.append(s["label"].upper())

    return np.array(X, dtype=np.float64), np.array(y), versao


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--idioma", default=idiomas.PADRAO,
                    choices=list(idiomas.IDIOMAS))
    ap.add_argument("--entrada", default=None,
                    help="padrão: dataset-<idioma>.json")
    ap.add_argument("--saida", default=None,
                    help="padrão: ../js/modelo.json para libras, "
                         "../models/<idioma>/alfabeto.json para os demais")
    ap.add_argument("--teste", type=float, default=0.2)
    args = ap.parse_args()

    entrada = args.entrada or f"dataset-{args.idioma}.json"
    if args.saida:
        saida = Path(args.saida)
    elif args.idioma == "libras":
        saida = Path("..") / "js" / "modelo.json"
    else:
        saida = Path("..") / "models" / args.idioma / "alfabeto.json"
    saida.parent.mkdir(parents=True, exist_ok=True)

    print(f"idioma: {idiomas.nome(args.idioma)}")
    X, y, versao = carregar(entrada, idiomas.excluidas(args.idioma))
    classes = sorted(set(y))
    print(f"{len(X)} amostras · {len(classes)} letras · features {versao} ({X.shape[1]} números)")

    esperadas = set(idiomas.letras(args.idioma))
    faltando_classe = esperadas - set(classes)
    if faltando_classe:
        print(f"AVISO: sem amostras para {', '.join(sorted(faltando_classe))} — "
              "o modelo não vai reconhecer essas letras")

    poucas = [c for c in classes if (y == c).sum() < 60]
    if poucas:
        print(f"Letras com menos de 60 amostras: {', '.join(poucas)}")

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    # Algumas versões do scikit-learn quebram com early_stopping e rótulos de
    # texto; treinamos com códigos inteiros e traduzimos de volta no final.
    enc = LabelEncoder()
    yi = enc.fit_transform(y)

    X_tr, X_te, y_tr, y_te = train_test_split(
        Xs, yi, test_size=args.teste, random_state=42, stratify=yi)

    modelo = MLPClassifier(
        hidden_layer_sizes=(256, 128),
        activation="relu",
        alpha=1e-3,
        max_iter=1200,
        early_stopping=True,
        n_iter_no_change=25,
        random_state=42,
    )
    modelo.fit(X_tr, y_tr)

    pred = modelo.predict(X_te)
    rotulos = list(enc.classes_)
    print(f"\nAcurácia no teste: {accuracy_score(y_te, pred):.1%}\n")
    print(classification_report(y_te, pred, target_names=rotulos, zero_division=0))

    # Pares confundidos: a lista do que recoletar primeiro.
    cm = confusion_matrix(y_te, pred, labels=range(len(rotulos)))
    erros = [(rotulos[i], rotulos[j], int(cm[i][j]))
             for i in range(len(rotulos)) for j in range(len(rotulos))
             if i != j and cm[i][j] > 0]
    erros.sort(key=lambda t: -t[2])
    if erros:
        print("Confusões: " + ", ".join(f"{a}->{b} ({n})" for a, b, n in erros[:10]))
    else:
        print("Nenhuma confusão no conjunto de teste.")

    export = {
        "version": 2,
        "features": versao,
        "idioma": args.idioma,
        "nome": idiomas.nome(args.idioma),
        "classes": rotulos,
        "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
        "layers": [{"weights": w.tolist(), "bias": b.tolist()}
                   for w, b in zip(modelo.coefs_, modelo.intercepts_)],
        "activation": "relu",
    }
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(export, f)

    print(f"\nModelo salvo em {saida}")


if __name__ == "__main__":
    main()
