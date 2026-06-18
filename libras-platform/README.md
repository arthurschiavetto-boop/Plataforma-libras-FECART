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
├── css/
│   └── style.css
└── js/
    ├── signs.js      Classificação dos sinais por regras geométricas
    └── camera.js     Permissão, captura e integração com MediaPipe Hands
```

## Como o reconhecimento funciona

1. **Captura**: `getUserMedia` fornece o stream da webcam ao elemento `<video>`.
2. **Detecção**: cada frame é enviado ao MediaPipe Hands, que devolve 21 pontos (landmarks) por mão, com coordenadas x, y, z normalizadas (0 a 1).
3. **Classificação**: `signs.js` lê o estado dos dedos (estendido/dobrado) e compara com as regras de cada letra do alfabeto manual.
4. **Saída**: a letra reconhecida aparece na tela, estabilizada para não oscilar.

## Próximas etapas

- Sinais com movimento (H, J, K, X, Z) e dinâmicos → classificador treinado (LSTM)
- Coleta de dataset com a comunidade surda
- Integração de expressões faciais (MediaPipe Face Mesh)
- Camada de gamificação (desafios, pontuação, conquistas)

---

Projeto acadêmico desenvolvido na FECAP.
