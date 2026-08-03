#!/usr/bin/env python3
"""
SinaLibras — extração de landmarks a partir de imagens.

Lê um dataset organizado em pastas por letra:

    dataset/
      A/ A_001.jpg, A_002.jpg, ...
      B/ ...

Para cada imagem roda o MediaPipe Hands e salva os 21 pontos CRUS mais o lado
da mão. As features são calculadas depois, no treinar.py — guardar cru é o que
permite melhorar o extrator sem refazer a extração.

    pip install mediapipe==0.10.14 opencv-python
    python extrair_landmarks.py --entrada dataset --saida dataset.json
"""

import argparse
import json
from collections import Counter
from pathlib import Path

import cv2
import mediapipe as mp

EXCLUIDAS = {"H", "J", "K", "X", "Z"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--entrada", default="dataset", help="pasta com subpastas por letra")
    ap.add_argument("--saida", default="dataset.json")
    ap.add_argument("--incluir-dinamicas", action="store_true",
                    help="não pular H, J, K, X e Z")
    args = ap.parse_args()

    hands = mp.solutions.hands.Hands(
        static_image_mode=True, max_num_hands=1, min_detection_confidence=0.4)

    raiz = Path(args.entrada)
    amostras = []
    perdidas = Counter()

    for pasta in sorted(raiz.iterdir()):
        if not pasta.is_dir():
            continue
        letra = pasta.name.upper()
        if letra in EXCLUIDAS and not args.incluir_dinamicas:
            print(f"pulando {letra} (letra com movimento)")
            continue

        for img_path in sorted(pasta.iterdir()):
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            res = hands.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            if not res.multi_hand_landmarks:
                perdidas[letra] += 1
                continue
            lm = [[p.x, p.y, p.z] for p in res.multi_hand_landmarks[0].landmark]
            lado = res.multi_handedness[0].classification[0].label
            amostras.append({"label": letra, "raw": lm, "handedness": lado})

    payload = {"version": 2, "pointCount": 21, "format": "raw", "samples": amostras}
    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(f"\n{len(amostras)} amostras salvas em {args.saida}")
    if perdidas:
        print("mão não detectada:", dict(perdidas.most_common()))
        print("(essas letras costumam ser as que o modelo erra depois)")


if __name__ == "__main__":
    main()
