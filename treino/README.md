# Treino do modelo — guia completo

Esta pasta contém tudo que transforma **imagens organizadas por letra** num
**modelo treinado** que o site carrega. Roda no seu computador, não no
navegador.

## Pré-requisitos

```bash
pip install mediapipe==0.10.14 opencv-python numpy scikit-learn
```

O MediaPipe precisa dessa versão (ou próxima) — versões muito novas mudaram
a API interna que os scripts usam. Se o Python instalado for 3.13+ e a
instalação falhar, use o Python 3.12.

## O fluxo, em duas etapas

```
imagens (pastas por letra) → extrair_landmarks.py → dataset-<idioma>.json → treinar.py → modelo
```

**1. Organize o dataset.** Uma pasta por idioma, com uma subpasta por letra
dentro. Aceita tanto letras direto na raiz quanto uma divisão `train`/`test`
— o script detecta sozinho:

```
treino/
  dataset-libras/train/A/ ...  test/A/ ...
  dataset-asl/A/ B/ ...
```

**2. Extraia os landmarks:**

```bash
python extrair_landmarks.py --idioma asl
```

Isso roda o MediaPipe em cada imagem e salva os **pontos crus da mão** (não
as características já calculadas) em `dataset-asl.json`. Guardar cru é o
que permite melhorar a fórmula das features depois sem precisar reprocessar
as imagens de novo. No final, o script mostra quantas imagens viraram
amostra e quantas foram descartadas por não ter mão detectada — é normal
perder algumas, mas se a taxa de perda for muito alta (mais de ~30%), vale
desconfiar da qualidade das imagens do dataset.

**3. Treine e exporte:**

```bash
python treinar.py --idioma asl
```

Isso calcula as features a partir dos landmarks crus, treina a rede e
imprime a acurácia e os pares de letras mais confundidos entre si — é a
lista do que recoletar primeiro, se quiser melhorar o modelo. O resultado
vai para `../models/asl/alfabeto.json` (exceto Libras, que por
compatibilidade com o modelo já publicado escreve em `../js/modelo.json`).

## As features: o coração do sistema

Cada mão vira **109 números**: coordenadas normalizadas, distância entre as
pontas dos dedos, ângulo de cada articulação, distância do polegar a cada
junta, e orientação da palma. Essa conta existe em dois lugares que
**precisam ser idênticos**:

- `features.py` (usado aqui, no treino)
- `../js/features.js` (usado no site, em tempo real)

Se você alterar a fórmula num lado sem replicar no outro, o modelo treina
normalmente mas erra tudo no site, porque está recebendo números calculados
de um jeito diferente do que aprendeu. Sempre que mexer em qualquer um dos
dois, rode:

```bash
python testar_paridade.py
```

Ele gera casos de teste e confere se as duas linguagens produzem os mesmos
números, byte a byte. Precisa do Node.js instalado.

## Idiomas: `idiomas.py`

Cada língua é uma entrada em `idiomas.py` (e no gêmeo `../js/idiomas.js`),
com três informações centrais:

- **`alfabeto`** — a lista completa de classes daquela língua, ou `None`
  quando ainda não sabemos como as pastas do dataset são nomeadas (nesse
  modo, o treino aceita qualquer classe que encontrar, sem exigir uma lista
  prevista).
- **`excluidas`** — as letras feitas com **movimento**, que não entram no
  treino porque uma pose única não capta uma trajetória. Cada exclusão
  neste projeto está documentada com a fonte que a justifica (ver comentários
  no arquivo) — nenhuma foi um palpite sem verificação.
- **`pais`, `cor`, `cor2`** — usados só pela interface, para pintar a
  página com a cor da bandeira daquele país quando a língua é escolhida.

### Tabela atual

| Idioma | Excluídas | Letras reconhecidas |
|---|---|---|
| libras | H, J, K, X, Z | 21 |
| asl | J, Z | 24 |
| spanish (LSE) | H, CH, J, LL, Ñ, RR, V, W, X, Y, Z | 19 |
| sibi | J, Z | 24 |

### Adicionar uma língua nova

1. Adiciona a entrada em `idiomas.py` **e** em `js/idiomas.js` — as duas
   listas de exclusão precisam bater exatamente.
2. Monta a pasta `dataset-<idioma>/`.
3. Roda os dois comandos (`extrair_landmarks.py` e `treinar.py`) com
   `--idioma <idioma>`.

Nenhum outro arquivo do projeto precisa mudar — o site descobre a língua
nova automaticamente a partir de `idiomas.js`.

## Ferramentas de apoio

- **`diagnostico_dataset.py`** — mostra a árvore de pastas de um dataset,
  útil pra confirmar a estrutura antes de rodar a extração de verdade.
- **`testar_paridade.py`** — já descrito acima.

## Erros comuns

**"pasta não encontrada: dataset-X"** — o nome da pasta não bate com
`dataset-<idioma>`, ou você não está rodando o comando de dentro de
`treino/`.

**Nomes de pasta corrompidos após extrair um `.zip`** (tipo `╨¢` em vez de
uma letra) — é um problema de codificação de caracteres no próprio arquivo
zip, comum em datasets com alfabetos não-latinos. A causa mais frequente é
o zip ter os nomes em UTF-8 sem a flag que avisa isso, e ferramentas de
extração assumirem uma codificação antiga por padrão.
