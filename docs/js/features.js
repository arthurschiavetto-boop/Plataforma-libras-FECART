/**
 * SinaLibras — extração de características (features)
 *
 * ESTE ARQUIVO TEM UM GÊMEO: treino/features.py
 * As duas versões precisam produzir exatamente os mesmos números na mesma
 * ordem. Se uma mudar e a outra não, o modelo lê letras erradas mesmo tendo
 * treinado bem. Ao alterar qualquer coisa aqui, altere lá e retreine.
 *
 * v1 (legado): 63 coordenadas cruas normalizadas pelo pulso.
 * v2 (atual):  109 números. Além das coordenadas, mede curvatura dos dedos,
 *              abertura entre eles, posição do polegar e para onde a mão
 *              aponta — que é o que diferencia A, E, S, D, C, O, M, N, Q,
 *              R, F e U entre si.
 */

const HandFeatures = (() => {
  "use strict";

  const PONTAS = [4, 8, 12, 16, 20];
  const PALMA = [0, 5, 9, 13, 17];
  const PIPS = [6, 10, 14, 18];

  // articulações usadas para medir a curvatura de cada dedo
  const ANGULOS = [
    [1, 2, 3], [2, 3, 4],        // polegar
    [5, 6, 7], [6, 7, 8],        // indicador
    [9, 10, 11], [10, 11, 12],   // médio
    [13, 14, 15], [14, 15, 16],  // anelar
    [17, 18, 19], [18, 19, 20],  // mínimo
  ];

  // vetores base->ponta usados para medir a abertura entre dedos vizinhos
  const DEDOS = [[1, 4], [5, 8], [9, 12], [13, 16], [17, 20]];

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norma = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const dist = (a, b) => norma(sub(a, b));

  function angulo(a, b, c) {
    const u = sub(a, b), v = sub(c, b);
    const nu = norma(u) || 1e-6, nv = norma(v) || 1e-6;
    let cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos);
  }

  /** v1 — mantida só para o modelo antigo continuar funcionando. */
  function v1(lm) {
    const w = lm[0];
    const escala = Math.hypot(lm[9].x - w.x, lm[9].y - w.y) || 1;
    const out = [];
    for (const p of lm) {
      out.push((p.x - w.x) / escala, (p.y - w.y) / escala, (p.z - w.z) / escala);
    }
    return out;
  }

  /**
   * Coloca a mão numa posição canônica: sempre "direita", origem no pulso,
   * tamanho 1 e girada de modo que o eixo pulso -> base do médio aponte para
   * cima. Assim inclinar a mão na frente da câmera deixa de virar outra letra.
   */
  function canonizar(lm, handedness) {
    const p = lm.map((q) => [q.x, q.y, q.z]);

    if (handedness === "Left") for (const q of p) q[0] = -q[0];

    const w = p[0].slice();
    for (const q of p) { q[0] -= w[0]; q[1] -= w[1]; q[2] -= w[2]; }

    const escala = Math.max(norma(p[9]), 1e-6);
    for (const q of p) { q[0] /= escala; q[1] /= escala; q[2] /= escala; }

    const ang = Math.atan2(p[9][0], p[9][1]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    for (const q of p) {
      const x = q[0], y = q[1];
      q[0] = x * c - y * s;
      q[1] = x * s + y * c;
    }
    p.anguloPalma = ang;   // guardado: girar some com a orientação, e ela importa
    return p;
  }

  /** v2 — 107 números. */
  function v2(lm, handedness) {
    const p = canonizar(lm, handedness);
    const f = [];

    // 63 — coordenadas canônicas
    for (const q of p) f.push(q[0], q[1], q[2]);

    // 10 — distâncias entre as pontas dos dedos
    for (let i = 0; i < PONTAS.length; i++) {
      for (let j = i + 1; j < PONTAS.length; j++) f.push(dist(p[PONTAS[i]], p[PONTAS[j]]));
    }

    // 5 — ponta até o pulso
    for (const t of PONTAS) f.push(norma(p[t]));

    // 5 — ponta até o centro da palma (separa dedo dobrado de dedo esticado)
    const centro = [0, 0, 0];
    for (const i of PALMA) { centro[0] += p[i][0]; centro[1] += p[i][1]; centro[2] += p[i][2]; }
    for (let k = 0; k < 3; k++) centro[k] /= PALMA.length;
    for (const t of PONTAS) f.push(dist(p[t], centro));

    // 10 — ângulos das articulações: a medida direta da curvatura
    for (const [a, b, c] of ANGULOS) f.push(angulo(p[a], p[b], p[c]));

    // 4 — abertura entre dedos vizinhos
    for (let i = 0; i < DEDOS.length - 1; i++) {
      const [b1, t1] = DEDOS[i], [b2, t2] = DEDOS[i + 1];
      const u = sub(p[t1], p[b1]), v = sub(p[t2], p[b2]);
      const nu = norma(u) || 1e-6, nv = norma(v) || 1e-6;
      let cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv);
      f.push(Math.acos(Math.max(-1, Math.min(1, cos))));
    }

    // 5 — polegar em relação aos outros dedos: separa A de E de S
    for (const j of PIPS) f.push(dist(p[4], p[j]));
    f.push(dist(p[4], p[5]));

    // 5 — quanto cada dedo está estendido, em proporção
    for (let i = 0; i < DEDOS.length; i++) {
      const [base, ponta] = DEDOS[i];
      f.push(norma(p[ponta]) / (norma(p[base]) || 1e-6));
    }

    // 2 — para onde a palma aponta na imagem. A canonização acima remove a
    // rotação (bom: inclinar a mão não vira outra letra), mas em Q a mão
    // aponta para baixo e em M/N não. Sem isso as três se confundem.
    f.push(Math.sin(p.anguloPalma), Math.cos(p.anguloPalma));

    return f;
  }

  function extrair(lm, handedness, versao) {
    return versao === "v1" ? v1(lm) : v2(lm, handedness || "Right");
  }

  return { extrair, v1, v2, canonizar, VERSAO: "v2" };
})();

if (typeof module !== "undefined") module.exports = HandFeatures;
