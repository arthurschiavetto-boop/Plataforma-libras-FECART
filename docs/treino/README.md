# Treino do classificador — passo a passo

Esta pasta tem os dois scripts Python que transformam suas **imagens** num
**modelo** que o site usa. Rode na sua máquina (não no navegador).

## Pré-requisitos

```bash
pip install mediapipe opencv-python numpy scikit-learn
```

## Passo 1 — Extrair os landmarks das imagens

Seu dataset são fotos organizadas em pastas por letra (`dataset/A/`, `dataset/B/`...).
Este script roda o MediaPipe sobre cada foto e gera os 63 números de cada uma.

```bash
python extrair_landmarks.py --entrada dataset --saida dataset_landmarks.json
```

Ao final ele mostra quantas imagens viraram amostras e quantas foram puladas
(quando o MediaPipe não acha a mão na foto — é normal acontecer com algumas).

## Passo 2 — Treinar e exportar o modelo

```bash
python treinar.py --entrada dataset_landmarks.json --saida ../js/modelo.json
```

Isso treina a rede, mostra a acurácia por letra e salva o `modelo.json`
direto na pasta `js/` do site.

## Passo 3 — Usar no site

Não precisa fazer nada além de gerar o `modelo.json`. Quando o site abre, ele
tenta carregar esse arquivo automaticamente:

- **Se o `modelo.json` existe** → usa o modelo treinado (todas as letras do dataset).
- **Se não existe** → o botão de gravação fica desativado e o diagnóstico avisa.

O painel de diagnóstico mostra qual está ativo.

## Por que as imagens precisam virar landmarks?

O site não reconhece a partir da foto — ele reconhece a partir dos 63 números
que o MediaPipe extrai. A normalização (em relação ao pulso) é **idêntica** nos
três lugares: `extrair_landmarks.py`, `collector.js` e `modelo.js`. Se você mudar
a conta num lugar, mude nos três, senão o modelo treinado não bate com o que o
site envia em tempo real.

## Sobre as letras com movimento (H, J, K, X, Z)

Essas letras têm trajetória, e uma foto isolada não captura isso. O modelo vai
aprender a "pose" delas, mas pode confundir, porque a informação do movimento
não está numa foto só. Para reconhecê-las bem, e para chegar em palavras de
verdade, o caminho é trabalhar com **sequências de frames** — veja o
`GUIA_TREINO.md` na raiz do projeto.


---

## Fluxo atual (features v2)

O dataset guarda os **landmarks crus**, não as features. As features são
calculadas em `treino/features.py` (treino) e em `js/features.js` (site) — os
dois arquivos precisam produzir exatamente os mesmos números.

```
python extrair_landmarks.py --entrada dataset --saida dataset.json   # se tiver fotos
#   ou colete pelo coletor.html e baixe o JSON

python treinar.py --entrada dataset.json --saida ../js/modelo.json
```

O `treinar.py` imprime os pares mais confundidos ao final — é a lista do que
recoletar primeiro.

H, J, K, X e Z são puladas automaticamente: são feitas com movimento e não têm
pose única.


---

## Vários idiomas

Os idiomas ficam em `treino/idiomas.py` (gêmeo de `js/idiomas.js`). Cada um
declara as letras feitas com movimento, que não entram no treino:

| Idioma | Excluídas | Letras reconhecidas |
|--------|-----------|---------------------|
| libras | H, J, K, X, Z | 21 |
| asl    | J, Z          | 24 |

Estrutura de pastas esperada, uma por idioma:

```
treino/
  dataset-libras/train/A/ ... test/A/ ...
  dataset-asl/train/A/ ... test/A/ ...
```

Fluxo por idioma:

```
python extrair_landmarks.py --idioma asl
python treinar.py --idioma asl
```

Sem `--entrada`/`--saida` ele usa `dataset-<idioma>/`, gera
`dataset-<idioma>.json` e escreve o modelo em `../models/<idioma>/alfabeto.json`
(exceto libras, que por padrão continua escrevendo em `../js/modelo.json`,
para não quebrar o modelo já publicado).

Para acrescentar um terceiro idioma: adicionar a entrada em `idiomas.py` **e**
em `js/idiomas.js` (as duas precisam bater), montar a pasta do dataset e
rodar os mesmos dois comandos. Nenhum outro código muda.
