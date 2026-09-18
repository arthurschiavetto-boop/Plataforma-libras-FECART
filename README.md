# SinaLibras

Reconhecimento do alfabeto manual de línguas de sinais em tempo real, direto
no navegador — sem servidor, sem enviar vídeo pra lugar nenhum. Você faz o
sinal na frente da câmera, o site diz qual letra é.

Hoje o sistema reconhece **quatro línguas**:

| Língua | País | Letras reconhecidas | Acurácia no teste |
|---|---|---|---|
| Libras | Brasil | 21 | 99,7% |
| ASL | Estados Unidos | 24 | 99,2% |
| LSE | Espanha | 19 | 98,3% |
| SIBI | Indonésia | 24 | 96,3% |

Projeto acadêmico desenvolvido na FECAP.

## O que o site faz

- **Reconhecimento ao vivo** — liga a câmera, faz o sinal, aperta gravar. O
  sistema mostra a letra, a confiança e o histórico da sessão.
- **Troca de língua** — cada língua tem sua própria cor (a da bandeira do
  país) e seu próprio modelo treinado. A troca é instantânea.
- **Alfabeto interativo** — mostra todas as letras da língua escolhida.
  Clicar numa abre uma tela com a imagem de como fazer o sinal e um botão
  para praticar aquela letra especificamente.
- **Modo prática** — ao escolher uma letra pra praticar, o resultado da
  gravação vira "acertou" ou "errou" em vez de só mostrar a letra lida.

## Como abrir

O acesso à câmera do navegador exige **contexto seguro**: só funciona em
`localhost` ou HTTPS, nunca abrindo o `index.html` direto (`file://`).

```bash
python3 -m http.server 8000
```

Abre `http://localhost:8000`.

No ar, o projeto está publicado via GitHub Pages.

## Como funciona por baixo

```
câmera → MediaPipe Hands → 21 pontos da mão → 109 números → rede neural → letra
```

1. **MediaPipe Hands** (Google) identifica a mão no vídeo e devolve 21
   pontos (landmarks) com coordenadas x, y, z.
2. Esses pontos viram **109 números** que descrevem a geometria da mão:
   distância entre as pontas dos dedos, ângulo de cada articulação (o que
   diferencia um dedo dobrado de um esticado), posição do polegar, e pra
   onde a palma está apontando. Essa conta é feita de forma **idêntica** em
   Python (`treino/features.py`) e em JavaScript (`js/features.js`) — os
   dois são testados automaticamente pra garantir que produzem os mesmos
   números (`treino/testar_paridade.py`).
3. Uma **rede neural densa** (109 entradas → 128 → 64 → uma saída por
   letra), treinada com scikit-learn, classifica esse vetor de números.
4. O resultado final não vem de um quadro só: o sistema grava ~1,5s,
   calcula a média das probabilidades de todos os quadros, e só então
   decide a letra. Se a mais provável e a segunda colocada ficarem perto
   demais, o resultado vira "ambíguo" em vez de chutar.

## Por que algumas letras não aparecem

Cada língua de sinais tem letras feitas com **movimento** (a mão traça uma
trajetória, não fica parada numa pose). Uma foto ou um quadro de vídeo
isolado não capta isso — então essas letras ficam de fora do treino e da
classificação. No alfabeto interativo elas continuam visíveis (é conteúdo
de aprendizado válido), só não têm o botão de praticar.

O critério de quais letras são essas, por língua, está documentado com a
fonte em `treino/idiomas.py`.

## Ferramentas usadas

| Camada | Ferramenta |
|---|---|
| Detecção da mão | MediaPipe Hands (Google, via CDN) |
| Cálculo das features | Python (treino) e JavaScript (site) |
| Treino do modelo | Python + scikit-learn (MLPClassifier) |
| Extração de imagem | OpenCV |
| Inferência no navegador | JavaScript puro — sem TensorFlow.js, sem framework |
| Interface | HTML, CSS e JavaScript vanilla |
| Hospedagem | GitHub Pages |

## Estrutura do projeto

```
docs/
├── index.html              Página única do site
├── css/
│   └── style.css
├── js/
│   ├── idiomas.js          Idiomas suportados (gêmeo de treino/idiomas.py)
│   ├── features.js         Features da mão (gêmeo de treino/features.py)
│   ├── modelo.js           Executa a rede treinada no navegador
│   ├── camera.js           Câmera, MediaPipe, gravação, toda a interface
│   └── modelo.json         Modelo de Libras (caminho de compatibilidade)
├── models/
│   ├── asl/alfabeto.json
│   ├── spanish/alfabeto.json
│   └── sibi/alfabeto.json
├── img/alfabeto/            Imagens de cada letra (ver COMO-ADICIONAR-IMAGENS.md)
└── treino/                 Scripts Python para gerar novos modelos
```

## Ressalvas metodológicas

Vale registrar, com honestidade, as limitações conhecidas do projeto:

- **Volume de dado desigual entre línguas.** Libras e ASL têm dezenas de
  milhares de amostras; LSE e SIBI, algumas centenas por letra — a acurácia
  mais baixa dessas duas reflete isso, não um problema de arquitetura.
- **Generalização entre pessoas.** O modelo foi validado com split
  aleatório dos dados de treino, mas testes ao vivo com pessoas diferentes
  das que estavam nas fotos originais mostram mais confusão em algumas
  letras do que o número de acurácia sugere. É a limitação mais importante
  do projeto pra documentar no relatório.
- **Letras com movimento** ficam de fora da classificação em todas as
  línguas, pelo motivo explicado acima.

## Próximos passos possíveis

- Reconhecimento de sinais com movimento, via modelo sequencial (LSTM)
  sobre uma janela de quadros, em vez de uma pose só
- Suporte a sinais de duas mãos (pausado neste projeto — ver notas em
  versões anteriores do histórico do repositório)
- Ampliar o dataset de LSE e SIBI para reduzir o gap de acurácia
