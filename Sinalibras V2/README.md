# SinaLibras

Plataforma acessível de visão computacional para tradução da Língua Brasileira de Sinais (Libras) em tempo real, com foco em inclusão social e aprendizado gamificado.

O sistema usa o **Google MediaPipe Hands** para rastrear as mãos a partir de uma câmera convencional, sem hardware especializado, e classifica os sinais para conversão em texto.

## Status atual

- Solicitação de permissão de webcam com fluxo completo de estados
- Tratamento de todos os erros, inclusive **"autorizou mas não tem câmera"**
- Rastreamento de mãos em tempo real com MediaPipe Hands (21 landmarks por mão)
- Desenho do esqueleto da mão sobre o vídeo (canvas)
- Classificação do alfabeto manual por regras geométricas (letras estáticas)
- Leitura estabilizada (a letra só muda após alguns frames consistentes)
- Painel de diagnóstico do sistema

## Como rodar

O acesso à câmera exige **contexto seguro**: funciona em `localhost` ou via HTTPS.

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Abrir o `index.html` por `file://` não funciona para a câmera.

## Estrutura

```
.
├── index.html        Página principal (carrega o MediaPipe via CDN)
├── treinar.html      Coleta + treino no navegador (sem Python)
├── coletor.html      Coletor de dataset (só exporta o JSON cru)
├── css/
│   ├── style.css
│   └── coletor.css
├── js/
│   ├── features.js   Características da mão (gêmeo de treino/features.py)
│   ├── rede.js       Treino da rede neural em JavaScript
│   ├── treinador.js  Coleta e treino na página treinar.html
│   ├── modelo.js     Executa a rede treinada no navegador
│   ├── camera.js     Câmera, MediaPipe e gravação do sinal
│   ├── collector.js  Coleta de amostras
│   └── modelo.json   Pesos exportados pelo treino
└── treino/
    ├── features.py   Características da mão (gêmeo de js/features.js)
    ├── extrair_landmarks.py
    └── treinar.py
```

## Como o reconhecimento funciona

1. **Captura**: `getUserMedia` fornece o stream da webcam ao elemento `<video>`.
2. **Detecção**: cada frame é enviado ao MediaPipe Hands, que devolve 21 pontos (landmarks) por mão, com coordenadas x, y, z normalizadas (0 a 1).
3. **Classificação**: `modelo.js` executa a rede treinada sobre os 21 landmarks. As letras H, J, K, X e Z são mascaradas antes do softmax por exigirem movimento.
4. **Saída**: nada é registrado sozinho. O usuário grava um sinal; o sistema
   tira a média dos vetores de probabilidade de todos os quadros da janela de
   captura e responde uma vez só. Se a letra vencedora ficar perto demais da
   segunda, o resultado é declarado ambíguo em vez de chutar.

## Próximas etapas

- Sinais com movimento (H, J, K, X, Z) e dinâmicos → classificador treinado (LSTM)
- Coleta de dataset com a comunidade surda
- Integração de expressões faciais (MediaPipe Face Mesh)
- Camada de gamificação (desafios, pontuação, conquistas)

---

Projeto acadêmico desenvolvido na FECAP.


## Treinar o modelo

Dois caminhos, mesmo formato de saída:

**No navegador** (recomendado) — abra `treinar.html`, grave as rajadas de cada
letra, clique em *Treinar modelo* e baixe o `modelo.json` por cima de
`js/modelo.json`. O dataset fica guardado no navegador entre sessões e pode ser
baixado como backup.

**Em Python** — se preferir, `treino/treinar.py` faz o mesmo a partir de um
dataset exportado, e `treino/extrair_landmarks.py` converte pastas de imagens.
Rode `treino/testar_paridade.py` sempre que mexer em `features.js` ou
`features.py`: os dois precisam produzir números idênticos.
