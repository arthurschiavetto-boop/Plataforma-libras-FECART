# Modelos treinados

Um arquivo por idioma, no caminho que o site espera:

```
models/
  libras/alfabeto.json
  asl/alfabeto.json
```

Gerados por `treino/treinar.py --idioma <idioma>`.

O Libras ainda funciona pelo `js/modelo.json` antigo: o carregador tenta
`models/libras/alfabeto.json` primeiro e cai nesse caminho antigo se não
achar. Copie o arquivo para `models/libras/alfabeto.json` quando quiser
organizar; nada quebra enquanto isso não acontecer.
