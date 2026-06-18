#!/usr/bin/env python3
"""
SinaLibras — Extração de landmarks a partir de imagens.

Lê o dataset organizado em pastas por letra:

    dataset/
      A/ A_001.jpg, A_002.jpg, ...
      B/ ...
      ...

Para cada imagem, roda o MediaPipe Hands, extrai os 21 pontos da mão,
normaliza em relação ao pulso (mesma lógica do coletor do site) e salva
tudo num único arquivo JSON pronto para o treino.

USO:
    pip install mediapipe opencv-python numpy
    python extrair_landmarks.py --entrada dataset --saida dataset_landmarks.json
"""

import argparse
import json
import os
import math

import cv2
import mediapipe as mp


def normalizar(landmarks):
    """
    Recebe os 21 pontos do MediaPipe e devolve 63 números normalizados
    em relação ao pulso (ponto 0) e à escala da mão (pulso -> base do médio).
    IGUAL à função normalizeLandmarks() do collector.js — precisam casar,
    senão o modelo treinado não funciona no site.
    """
    pulso = landmarks[0]
    base_medio = landmarks[9]
    escala = math.hypot(base_medio.x - pulso.x, base_medio.y - pulso.y) or 1.0

    plano = []
    for p in landmarks:
        plano.append((p.x - pulso.x) / escala)
        plano.append((p.y - pulso.y) / escala)
        plano.append((p.z - pulso.z) / escala)
    return plano


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entrada", default="dataset", help="pasta com subpastas por letra")
    parser.add_argument("--saida", default="dataset_landmarks.json", help="arquivo JSON de saída")
    args = parser.parse_args()

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=True,      # imagens isoladas, não vídeo
        max_num_hands=1,
        min_detection_confidence=0.5,
    )

    amostras = []
    sem_mao = 0
    total = 0

    # Cada subpasta é uma etiqueta (o nome da letra)
    etiquetas = sorted(
        d for d in os.listdir(args.entrada)
        if os.path.isdir(os.path.join(args.entrada, d))
    )

    for etiqueta in etiquetas:
        pasta = os.path.join(args.entrada, etiqueta)
        arquivos = [f for f in os.listdir(pasta) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        print(f"[{etiqueta}] {len(arquivos)} imagens...")

        for nome in arquivos:
            total += 1
            caminho = os.path.join(pasta, nome)
            img = cv2.imread(caminho)
            if img is None:
                continue
            # MediaPipe espera RGB; OpenCV carrega em BGR
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            resultado = hands.process(rgb)

            if not resultado.multi_hand_landmarks:
                sem_mao += 1
                continue

            pontos = resultado.multi_hand_landmarks[0].landmark
            amostras.append({
                "label": etiqueta,
                "landmarks": normalizar(pontos),
                "source": nome,
            })

    hands.close()

    saida = {
        "version": 1,
        "featureLength": 63,
        "pointCount": 21,
        "samples": amostras,
    }
    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(saida, f)

    print()
    print(f"Total de imagens lidas:    {total}")
    print(f"Sem mão detectada:         {sem_mao}")
    print(f"Amostras salvas:           {len(amostras)}")
    print(f"Arquivo gerado:            {args.saida}")
    if sem_mao:
        print(f"\nObs.: {sem_mao} imagens foram puladas porque o MediaPipe não")
        print("achou uma mão nelas (fundo confuso, mão cortada, etc). É normal.")


if __name__ == "__main__":
    main()
