#!/usr/bin/env python3
"""Confere se treino/features.py e js/features.js produzem os mesmos números.

Rode sempre que mexer em um dos dois. Precisa do node instalado.

    python testar_paridade.py
"""

import json
import random
import subprocess
import sys
import tempfile

import features

random.seed(7)

casos = []
for _ in range(8):
    for lado in ("Right", "Left"):
        lm = [[random.uniform(0, 1), random.uniform(0, 1), random.uniform(-0.2, 0.2)]
              for _ in range(21)]
        casos.append({"lm": lm, "lado": lado})

with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(casos, f)
    entrada = f.name

script = """
const H = require('../js/features.js');
const casos = require(process.argv[1]);
const saida = casos.map(c => {
  const lm = c.lm.map(p => ({x: p[0], y: p[1], z: p[2]}));
  return {v1: H.v1(lm), v2: H.v2(lm, c.lado)};
});
console.log(JSON.stringify(saida));
"""

try:
    out = subprocess.run(["node", "-e", script, entrada],
                         capture_output=True, text=True, check=True)
except FileNotFoundError:
    sys.exit("node não encontrado — instale o Node.js para rodar este teste")
except subprocess.CalledProcessError as e:
    sys.exit(f"erro ao rodar o features.js:\n{e.stderr}")

js = json.loads(out.stdout)

pior_v1 = pior_v2 = 0.0
for caso, resultado in zip(casos, js):
    lm, lado = caso["lm"], caso["lado"]
    for a, b, nome in ((features.v1(lm), resultado["v1"], "v1"),
                       (features.v2(lm, lado), resultado["v2"], "v2")):
        if len(a) != len(b):
            sys.exit(f"{nome}: tamanhos diferentes — Python {len(a)}, JS {len(b)}")
        d = max(abs(x - y) for x, y in zip(a, b))
        if nome == "v1":
            pior_v1 = max(pior_v1, d)
        else:
            pior_v2 = max(pior_v2, d)

print(f"v1: {len(features.v1(casos[0]['lm']))} valores | divergência máxima {pior_v1:.2e}")
print(f"v2: {len(features.v2(casos[0]['lm']))} valores | divergência máxima {pior_v2:.2e}")

if max(pior_v1, pior_v2) < 1e-10:
    print("\nOK — Python e JavaScript estão em paridade.")
else:
    sys.exit("\nDIVERGENTE — corrija antes de treinar, o modelo vai ler errado.")
