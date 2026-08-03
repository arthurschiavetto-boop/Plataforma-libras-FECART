# Como treinar seu reconhecedor de sinais

Este guia explica o que fazer **depois** de coletar dados com o `coletor.html`.

## Lembre-se da divisão de trabalho

O MediaPipe Hands **já vem treinado** e você não mexe nele. Ele só extrai os 21 pontos da mão. Quem aprende a reconhecer os sinais é um **classificador seu**, que recebe esses pontos e devolve o nome do sinal.

```
imagem → [MediaPipe Hands: já pronto] → 63 números → [SEU classificador] → "letra A"
```

Você treina apenas a segunda caixa.

## Passo 1 — Coletar os dados

Abra o `coletor.html`, digite a etiqueta (ex.: "A") e capture. Use o modo rajada para juntar muitas amostras rápido. Recomendações:

- 50 a 100 amostras por sinal, no mínimo, para começar
- varie posição, distância da câmera, inclinação da mão e iluminação
- se possível, peça para outras pessoas gravarem também (mãos diferentes)
- ao terminar, clique em **Baixar dataset (JSON)**

O arquivo gerado tem este formato:

```json
{
  "version": 1,
  "featureLength": 63,
  "samples": [
    { "label": "A", "landmarks": [0.0, 0.0, 0.0, ...], "timestamp": 123 }
  ]
}
```

Cada `landmarks` é uma lista de 63 números (21 pontos × 3 coordenadas), já normalizados em relação ao pulso.

## Passo 2 — Treinar o modelo

Há dois caminhos, do mais simples ao mais completo.

### Caminho A — letras estáticas (sem movimento)

Para sinais que são uma pose fixa (A, B, L, V...), cada amostra é independente. Um classificador simples resolve. Exemplo em Python com scikit-learn:

```python
import json
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import classification_report

# 1. Carrega o dataset exportado
with open("dataset-libras.json", encoding="utf-8") as f:
    data = json.load(f)

X = np.array([s["landmarks"] for s in data["samples"]])  # (N, 63)
y = np.array([s["label"] for s in data["samples"]])       # (N,)

# 2. Separa treino e teste
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 3. Treina uma rede simples
model = MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=500)
model.fit(X_train, y_train)

# 4. Avalia
print(classification_report(y_test, model.predict(X_test)))

# 5. Salva o modelo
import joblib
joblib.dump(model, "modelo-libras.joblib")
```

### Caminho B — sinais com movimento (dinâmicos)

Letras como H, J, K, X, Z e palavras inteiras dependem da **trajetória ao longo do tempo**. Uma pose isolada não basta — é preciso uma sequência de frames. Aí o modelo indicado é uma rede recorrente (LSTM). Isso muda a coleta: em vez de uma amostra por frame, você grava uma sequência de N frames por exemplo. É um passo mais avançado; comece pelas estáticas.

## Passo 3 — Usar o modelo no site

O `treinar.py` já exporta `js/modelo.json` com os pesos da rede. O `modelo.js`
executa essa rede em JavaScript puro — não é preciso TensorFlow.js nem servidor.

1. Colete com o `coletor.html`.
2. Treine com o `treino/treinar.py`.
3. Substitua o `js/modelo.json` gerado.

Um detalhe que não pode ser esquecido: a função `normalizeLandmarks` existe em
três lugares (coletor, `modelo.js` e `extrair_landmarks.py`) e as três precisam
fazer exatamente a mesma conta. Se divergirem, o modelo lê letras erradas mesmo
tendo treinado bem.

## Resumo

| Etapa | Ferramenta | O que faz |
|-------|-----------|-----------|
| Coletar | `coletor.html` | grava landmarks etiquetados |
| Treinar | Python (scikit-learn / TensorFlow) | aprende os padrões |
| Usar | `modelo.js` | executa a rede no navegador |
