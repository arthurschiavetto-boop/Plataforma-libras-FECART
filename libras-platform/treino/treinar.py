#!/usr/bin/env python3
"""
SinaLibras — Treino do classificador de letras.

Lê o JSON de landmarks (saída de extrair_landmarks.py), treina uma rede
neural simples e exporta os pesos num formato JSON leve que o site carrega
direto, sem precisar de TensorFlow.js nem servidor.

USO:
    pip install scikit-learn numpy
    python treinar.py --entrada dataset_landmarks.json --saida ../js/modelo.json
"""

import argparse
import json
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", default="dataset_landmarks.json")
    parser.add_argument("--saida", default="../js/modelo.json")
    args = parser.parse_args()

    with open(args.entrada, encoding="utf-8") as f:
        data = json.load(f)

    amostras = data["samples"]
    X = np.array([s["landmarks"] for s in amostras], dtype=np.float64)
    y = np.array([s["label"] for s in amostras])

    print(f"Amostras: {len(X)} | Letras: {sorted(set(y))}")

    # Padroniza as features (média 0, desvio 1) — ajuda muito a rede a treinar
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    X_tr, X_te, y_tr, y_te = train_test_split(
        Xs, y, test_size=0.2, random_state=42, stratify=y
    )

    # Rede simples: duas camadas escondidas
    modelo = MLPClassifier(
        hidden_layer_sizes=(128, 64),
        activation="relu",
        max_iter=800,
        random_state=42,
    )
    modelo.fit(X_tr, y_tr)

    pred = modelo.predict(X_te)
    print(f"\nAcurácia no teste: {accuracy_score(y_te, pred):.1%}\n")
    print(classification_report(y_te, pred))

    # --- Exporta para JSON leve que roda no navegador ---
    # Guardamos os pesos de cada camada, os parâmetros do scaler e as classes.
    # O modelo.js no site refaz a conta (multiplicação de matrizes + relu).
    export = {
        "version": 1,
        "classes": modelo.classes_.tolist(),
        "scaler": {
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
        },
        "layers": [
            {"weights": w.tolist(), "bias": b.tolist()}
            for w, b in zip(modelo.coefs_, modelo.intercepts_)
        ],
        "activation": "relu",
    }
    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(export, f)

    print(f"\nModelo exportado para: {args.saida}")
    print("Coloque modelo.json na pasta js/ e o site carrega automaticamente.")


if __name__ == "__main__":
    main()
