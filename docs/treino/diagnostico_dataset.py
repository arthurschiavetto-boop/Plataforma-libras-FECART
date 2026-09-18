"""
SinaLibras — diagnostico da estrutura do dataset.

Roda de dentro de treino/:  python diagnostico_dataset.py
Mostra as pastas (ate 3 niveis) e quantos arquivos tem em cada uma,
para achar onde as imagens realmente estao.
"""

from pathlib import Path

# procura "dataset" ao lado deste arquivo, nao no diretorio de onde foi chamado
raiz = Path(__file__).resolve().parent / "dataset"

if not raiz.is_dir():
    print(f"pasta '{raiz}' nao encontrada nesse diretorio")
    raise SystemExit

def listar(pasta, profundidade=0, max_profundidade=3):
    if profundidade > max_profundidade:
        return
    itens = sorted(pasta.iterdir())
    subpastas = [i for i in itens if i.is_dir()]
    arquivos = [i for i in itens if i.is_file()]

    prefixo = "  " * profundidade
    if arquivos:
        print(f"{prefixo}{pasta.name}/  ({len(arquivos)} arquivos)")
    else:
        print(f"{prefixo}{pasta.name}/")

    for sub in subpastas[:30]:
        listar(sub, profundidade + 1, max_profundidade)
    if len(subpastas) > 30:
        print(f"{prefixo}  ... e mais {len(subpastas) - 30} pastas")

listar(raiz)