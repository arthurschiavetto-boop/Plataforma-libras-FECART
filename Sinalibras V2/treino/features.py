"""
SinaLibras — extração de características (features)

ESTE ARQUIVO TEM UM GÊMEO: js/features.js
As duas versões precisam produzir exatamente os mesmos números na mesma
ordem. Se uma mudar e a outra não, o modelo lê letras erradas mesmo tendo
treinado bem. Ao alterar qualquer coisa aqui, altere lá e retreine.
"""

import math

PONTAS = [4, 8, 12, 16, 20]
PALMA = [0, 5, 9, 13, 17]
PIPS = [6, 10, 14, 18]

ANGULOS = [
    (1, 2, 3), (2, 3, 4),
    (5, 6, 7), (6, 7, 8),
    (9, 10, 11), (10, 11, 12),
    (13, 14, 15), (14, 15, 16),
    (17, 18, 19), (18, 19, 20),
]

DEDOS = [(1, 4), (5, 8), (9, 12), (13, 16), (17, 20)]

VERSAO = "v2"


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _norma(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def _dist(a, b):
    return _norma(_sub(a, b))


def _angulo(a, b, c):
    u, v = _sub(a, b), _sub(c, b)
    nu = _norma(u) or 1e-6
    nv = _norma(v) or 1e-6
    cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)
    return math.acos(max(-1.0, min(1.0, cos)))


def v1(lm):
    """Legado: 63 coordenadas cruas normalizadas pelo pulso."""
    w = lm[0]
    escala = math.hypot(lm[9][0] - w[0], lm[9][1] - w[1]) or 1.0
    out = []
    for p in lm:
        out += [(p[0] - w[0]) / escala, (p[1] - w[1]) / escala, (p[2] - w[2]) / escala]
    return out


def canonizar(lm, handedness="Right"):
    """Mão sempre 'direita', origem no pulso, tamanho 1, eixo do médio na vertical."""
    p = [list(q) for q in lm]

    if handedness == "Left":
        for q in p:
            q[0] = -q[0]

    w = list(p[0])
    for q in p:
        q[0] -= w[0]; q[1] -= w[1]; q[2] -= w[2]

    escala = max(_norma(p[9]), 1e-6)
    for q in p:
        q[0] /= escala; q[1] /= escala; q[2] /= escala

    ang = math.atan2(p[9][0], p[9][1])
    c, s = math.cos(-ang), math.sin(-ang)
    for q in p:
        x, y = q[0], q[1]
        q[0] = x * c - y * s
        q[1] = x * s + y * c
    return p, ang


def v2(lm, handedness="Right"):
    """109 números: coordenadas + curvatura + abertura + polegar + orientação."""
    p, ang_palma = canonizar(lm, handedness)
    f = []

    for q in p:
        f += [q[0], q[1], q[2]]

    for i in range(len(PONTAS)):
        for j in range(i + 1, len(PONTAS)):
            f.append(_dist(p[PONTAS[i]], p[PONTAS[j]]))

    for t in PONTAS:
        f.append(_norma(p[t]))

    centro = [0.0, 0.0, 0.0]
    for i in PALMA:
        centro[0] += p[i][0]; centro[1] += p[i][1]; centro[2] += p[i][2]
    centro = [v / len(PALMA) for v in centro]
    for t in PONTAS:
        f.append(_dist(p[t], centro))

    for a, b, c in ANGULOS:
        f.append(_angulo(p[a], p[b], p[c]))

    for i in range(len(DEDOS) - 1):
        b1, t1 = DEDOS[i]
        b2, t2 = DEDOS[i + 1]
        u, v = _sub(p[t1], p[b1]), _sub(p[t2], p[b2])
        nu = _norma(u) or 1e-6
        nv = _norma(v) or 1e-6
        cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)
        f.append(math.acos(max(-1.0, min(1.0, cos))))

    for j in PIPS:
        f.append(_dist(p[4], p[j]))
    f.append(_dist(p[4], p[5]))

    for base, ponta in DEDOS:
        f.append(_norma(p[ponta]) / (_norma(p[base]) or 1e-6))

    # Para onde a palma aponta na imagem: separa Q (apontando para baixo) de
    # M e N, que a canonização por rotação deixaria idênticas.
    f.append(math.sin(ang_palma))
    f.append(math.cos(ang_palma))

    return f


def extrair(lm, handedness="Right", versao=VERSAO):
    return v1(lm) if versao == "v1" else v2(lm, handedness)
