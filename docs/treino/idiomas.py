"""
SinaLibras — idiomas suportados.

ESTE ARQUIVO TEM UM GEMEO: js/idiomas.js
Os dois precisam listar exatamente os mesmos campos por idioma. Se
divergirem, o site vai mascarar letras diferentes das que o treino ignorou.
Os campos de aparência (pais, cor, cor2) são só do site — o treino não
precisa deles.

"excluidas" sao as letras feitas com MOVIMENTO. Elas nao tem configuracao de
mao unica, entao nao podem ser classificadas a partir de um quadro isolado.

"alfabeto" e a lista completa de classes do idioma, ou None quando ainda nao
sabemos como as pastas do dataset sao nomeadas (nesse caso o treino usa as
classes que encontrar, sem checar contra uma lista prevista).
"""

_AZ = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

# 30 sinais do alfabeto dactilológico espanhol (LSE) — inclui CH, LL, RR como
# sinais próprios (convenção tradicional do espanhol) e o Ñ.
_ES = list("ABCDEFG") + ["H", "CH"] + list("IJKL") + ["LL"] + list("MN") + \
      ["Ñ"] + list("OPQ") + ["R", "RR"] + list("STUVWXYZ")

IDIOMAS = {
    "libras": {
        "nome": "Libras",
        "pais": "Brasil",
        "cor": "#00694A",
        "cor2": "#F2C200",
        "alfabeto": _AZ,
        "excluidas": ["H", "J", "K", "X", "Z"],   # sobram 21 letras
    },
    "asl": {
        "nome": "ASL",
        "pais": "Estados Unidos",
        "cor": "#1B3A6B",
        "cor2": "#C1272D",
        "alfabeto": _AZ,
        "excluidas": ["J", "Z"],                  # sobram 24 letras
    },
    "spanish": {
        "nome": "LSE",
        "pais": "Espanha",
        "cor": "#AA151B",
        "cor2": "#F1BF00",
        # Ainda nao sabemos como as pastas dos datasets do Kaggle nomeiam CH,
        # LL, RR e Ñ (podem vir com o caractere literal, ou transliteradas
        # tipo "RR"/"Ene_til"). Deixado None ate confirmar — nesse modo o
        # treino usa as classes que encontrar, sem reclamar de "faltando".
        # Para travar no alfabeto oficial depois, troque por: _ES
        "alfabeto": None,
        # RR e Ñ: mesma configuracao de mao que R e N, so o movimento
        # diferencia (confirmado por fontes de ensino de LSE). As demais (H,
        # CH, J, LL, V, W, X, Y, Z) tambem exigem movimento, segundo pesquisa
        # do usuario sobre quais sinais do alfabeto sao estaticos de verdade.
        # Sobram 19 letras estaticas: A B C D E F G I K L M N O P Q R S T U.
        "excluidas": ["H", "CH", "J", "LL", "Ñ", "RR", "V", "W", "X", "Y", "Z"],
    },
}

PADRAO = "libras"


def excluidas(idioma):
    if idioma not in IDIOMAS:
        raise SystemExit(
            f"idioma '{idioma}' desconhecido. Disponiveis: {', '.join(IDIOMAS)}")
    return set(IDIOMAS[idioma]["excluidas"])


def letras(idioma):
    """Classes do idioma, ou None se o alfabeto nao for conhecido de antemao
    (nesse caso, usar as classes que vierem do dataset)."""
    if idioma not in IDIOMAS:
        raise SystemExit(
            f"idioma '{idioma}' desconhecido. Disponiveis: {', '.join(IDIOMAS)}")
    alfabeto = IDIOMAS[idioma].get("alfabeto")
    if alfabeto is None:
        return None
    fora = excluidas(idioma)
    return [c for c in alfabeto if c not in fora]


def nome(idioma):
    return IDIOMAS[idioma]["nome"]
