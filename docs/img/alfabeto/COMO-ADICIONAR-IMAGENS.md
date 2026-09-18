# Como adicionar as imagens do alfabeto

O site procura a imagem de cada letra neste caminho:

```
img/alfabeto/<idioma>/<LETRA>.png
```

Onde `<idioma>` é exatamente um destes: `libras`, `asl`, `spanish`, `sibi`.

## Exemplos

| Para mostrar... | Salve o arquivo em |
|---|---|
| Letra A em Libras | `img/alfabeto/libras/A.png` |
| Letra B em Libras | `img/alfabeto/libras/B.png` |
| Letra G em ASL | `img/alfabeto/asl/G.png` |
| Letra Ñ em espanhol | `img/alfabeto/spanish/Ñ.png` |
| Letra W em SIBI | `img/alfabeto/sibi/W.png` |

## Regras

1. **O nome do arquivo é a letra em MAIÚSCULA**, seguida de `.png`.
   `A.png`, não `a.png` nem `letra-a.png`.

2. **Tem que ser `.png`.** Se a sua imagem for `.jpg`, converta antes
   (abrir no Paint e "Salvar como PNG" resolve).

3. **Não precisa ter todas de uma vez.** O site mostra as que existirem e,
   para as que faltam, exibe um espaço reservado com a letra escrita. Você
   pode ir adicionando aos poucos.

4. **Formato ideal:** quadrada (ex.: 400x400), fundo limpo, mão bem
   enquadrada. Mas qualquer proporção funciona — o site ajusta.

## Como testar se funcionou

1. Abra o site.
2. Escolha a língua no topo.
3. Clique no botão **Alfabeto**.
4. Clique numa letra.

Se a imagem aparecer, deu certo. Se aparecer o espaço reservado dizendo
"imagem ainda não adicionada", confira o nome do arquivo e a pasta.

## Bônus: o quadro/pôster com o alfabeto inteiro

Além da imagem de cada letra, o site tem um botão **"Ver o alfabeto completo
numa imagem"** dentro da tela do Alfabeto. Ele mostra uma imagem só, com
todas as letras juntas — os quadros de referência que às vezes vêm prontos
(tipo os que já usamos pra identificar letras com movimento no Ucraniano e
no Espanhol).

Salve em:

```
img/alfabeto/<idioma>/completo.png
```

Exemplos:

| Para mostrar... | Salve o arquivo em |
|---|---|
| Quadro completo de Libras | `img/alfabeto/libras/completo.png` |
| Quadro completo de ASL | `img/alfabeto/asl/completo.png` |
| Quadro completo de LSE | `img/alfabeto/spanish/completo.png` |
| Quadro completo de SIBI | `img/alfabeto/sibi/completo.png` |

Mesmas regras: nome exato `completo.png`, formato PNG. Enquanto não existir,
o botão mostra um espaço reservado com o caminho do arquivo que falta.

## Onde conseguir as imagens

- Fotos das mãos de vocês mesmos (mais autêntico, e vira conteúdo original
  do projeto)
- Tabelas de alfabeto manual disponíveis publicamente, desde que você
  tenha direito de usar
- Desenhos/ilustrações feitos por vocês

Se usar imagem de terceiros, vale citar a fonte no relatório.
