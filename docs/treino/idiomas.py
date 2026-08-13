"""
SinaLibras — idiomas suportados.

ESTE ARQUIVO TEM UM GEMEO: js/idiomas.js
Os dois precisam listar exatamente as mesmas letras excluidas. Se divergirem,
o site vai mascarar letras diferentes das que o treino ignorou.

"excluidas" sao as letras feitas com MOVIMENTO. Elas nao tem configuracao de
mao unica, entao nao podem ser classificadas a partir de um quadro isolado.
"""

IDIOMAS = {
    "libras": {
        "nome": "Libras (Brasil)",
        "excluidas": ["H", "J", "K", "X", "Z"],   # sobram 21 letras
    },
    "asl": {
        "nome": "ASL (Estados Unidos)",
        "excluidas": ["J", "Z"],                  # sobram 24 letras
    },
}

PADRAO = "libras"


def excluidas(idioma):
    if idioma not in IDIOMAS:
        raise SystemExit(
            f"idioma '{idioma}' desconhecido. Disponiveis: {', '.join(IDIOMAS)}")
    return set(IDIOMAS[idioma]["excluidas"])


def letras(idioma):
    """Letras que o idioma reconhece, em ordem alfabetica."""
    fora = excluidas(idioma)
    return [c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if c not in fora]


def nome(idioma):
    return IDIOMAS[idioma]["nome"]
