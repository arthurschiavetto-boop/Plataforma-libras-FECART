# Modelos treinados

Um arquivo por língua, no caminho que o site espera:

```
models/
  asl/alfabeto.json
  spanish/alfabeto.json    (LSE)
  sibi/alfabeto.json
```

Cada `alfabeto.json` guarda os pesos da rede neural treinada (não é
reconhecível como texto — é uma exportação direta dos coeficientes) mais a
lista de classes e a versão das features usadas.

Gerados por `../treino/treinar.py --idioma <idioma>` — veja o guia completo
em `../treino/README.md`.

## Libras é um caso à parte

O modelo de Libras não está em `models/libras/`, e sim em `../js/modelo.json`
— é o caminho original do projeto, mantido por compatibilidade. O
carregador do site (`js/modelo.js`) tenta `models/libras/alfabeto.json`
primeiro e cai automaticamente nesse caminho antigo se não encontrar. Não é
preciso mover nada; os dois formatos funcionam.

## Não edite estes arquivos manualmente

São gerados por script, não por mão. Qualquer ajuste (adicionar/remover
letra, mudar exclusões) deve ser feito em `treino/idiomas.py` e retreinado,
para que o modelo e o código continuem consistentes entre si.
