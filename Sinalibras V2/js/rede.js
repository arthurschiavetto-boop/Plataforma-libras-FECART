/**
 * SinaLibras — treino da rede no próprio navegador
 *
 * Rede densa (entrada -> 128 -> 64 -> classes) com ReLU, softmax e Adam.
 * Trabalha em Float32Array e devolve o modelo já no formato que o
 * modelo.js carrega, então não é preciso Python para treinar.
 */

const RedeNeural = (() => {
  "use strict";

  function iniciarPesos(n, fanIn) {
    const a = new Float32Array(n);
    const s = Math.sqrt(2 / fanIn);
    for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * s;
    return a;
  }

  function criar(d, h1, h2, C) {
    return {
      d, h1, h2, C,
      W1: iniciarPesos(d * h1, d), b1: new Float32Array(h1),
      W2: iniciarPesos(h1 * h2, h1), b2: new Float32Array(h2),
      W3: iniciarPesos(h2 * C, h2), b3: new Float32Array(C),
    };
  }

  const chaves = ["W1", "b1", "W2", "b2", "W3", "b3"];

  function zeros(rede) {
    const o = {};
    for (const k of chaves) o[k] = new Float32Array(rede[k].length);
    return o;
  }

  /** Propaga uma amostra. Reaproveita os buffers para não alocar por chamada. */
  function frente(rede, x, buf) {
    const { d, h1, h2, C, W1, b1, W2, b2, W3, b3 } = rede;

    for (let j = 0; j < h1; j++) {
      let s = b1[j];
      for (let i = 0; i < d; i++) s += x[i] * W1[i * h1 + j];
      buf.z1[j] = s > 0 ? s : 0;
    }
    for (let j = 0; j < h2; j++) {
      let s = b2[j];
      for (let i = 0; i < h1; i++) s += buf.z1[i] * W2[i * h2 + j];
      buf.z2[j] = s > 0 ? s : 0;
    }
    let max = -Infinity;
    for (let j = 0; j < C; j++) {
      let s = b3[j];
      for (let i = 0; i < h2; i++) s += buf.z2[i] * W3[i * C + j];
      buf.saida[j] = s;
      if (s > max) max = s;
    }
    let soma = 0;
    for (let j = 0; j < C; j++) { buf.saida[j] = Math.exp(buf.saida[j] - max); soma += buf.saida[j]; }
    for (let j = 0; j < C; j++) buf.saida[j] /= soma;
  }

  /** Acumula os gradientes de uma amostra em `g`. Devolve a perda. */
  function tras(rede, x, alvo, buf, g) {
    const { d, h1, h2, C, W2, W3 } = rede;

    const perda = -Math.log(Math.max(buf.saida[alvo], 1e-9));

    for (let j = 0; j < C; j++) buf.d3[j] = buf.saida[j] - (j === alvo ? 1 : 0);

    for (let i = 0; i < h2; i++) {
      let s = 0;
      for (let j = 0; j < C; j++) {
        g.W3[i * C + j] += buf.z2[i] * buf.d3[j];
        s += W3[i * C + j] * buf.d3[j];
      }
      buf.d2[i] = buf.z2[i] > 0 ? s : 0;
    }
    for (let j = 0; j < C; j++) g.b3[j] += buf.d3[j];

    for (let i = 0; i < h1; i++) {
      let s = 0;
      for (let j = 0; j < h2; j++) {
        g.W2[i * h2 + j] += buf.z1[i] * buf.d2[j];
        s += W2[i * h2 + j] * buf.d2[j];
      }
      buf.d1[i] = buf.z1[i] > 0 ? s : 0;
    }
    for (let j = 0; j < h2; j++) g.b2[j] += buf.d2[j];

    for (let i = 0; i < d; i++) {
      const xi = x[i];
      for (let j = 0; j < h1; j++) g.W1[i * h1 + j] += xi * buf.d1[j];
    }
    for (let j = 0; j < h1; j++) g.b1[j] += buf.d1[j];

    return perda;
  }

  function aplicarAdam(rede, g, m, v, passo, lr, decaimento, tamLote) {
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const corr1 = 1 - Math.pow(b1, passo);
    const corr2 = 1 - Math.pow(b2, passo);
    for (const k of chaves) {
      const P = rede[k], G = g[k], M = m[k], V = v[k];
      const usaDecaimento = k[0] === "W";
      for (let i = 0; i < P.length; i++) {
        let grad = G[i] / tamLote;
        if (usaDecaimento) grad += decaimento * P[i];
        M[i] = b1 * M[i] + (1 - b1) * grad;
        V[i] = b2 * V[i] + (1 - b2) * grad * grad;
        P[i] -= lr * (M[i] / corr1) / (Math.sqrt(V[i] / corr2) + eps);
        G[i] = 0;
      }
    }
  }

  function padronizar(X, d) {
    const n = X.length;
    const media = new Float32Array(d);
    const desvio = new Float32Array(d);
    for (const linha of X) for (let i = 0; i < d; i++) media[i] += linha[i];
    for (let i = 0; i < d; i++) media[i] /= n;
    for (const linha of X) {
      for (let i = 0; i < d; i++) {
        const dv = linha[i] - media[i];
        desvio[i] += dv * dv;
      }
    }
    for (let i = 0; i < d; i++) desvio[i] = Math.sqrt(desvio[i] / n) || 1;
    return { media, desvio };
  }

  function embaralhar(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  /**
   * X: array de arrays de números. y: array de rótulos (texto).
   * onProgresso({ epoca, epocas, perda, acuraciaValidacao }).
   */
  async function treinar(X, y, opts = {}) {
    const {
      epocas = 70, tamLote = 32, lr = 0.004,
      decaimento = 1e-4, fracaoValidacao = 0.2,
      h1 = 128, h2 = 64, onProgresso = null,
    } = opts;

    const classes = [...new Set(y)].sort();
    const indiceClasse = new Map(classes.map((c, i) => [c, i]));
    const d = X[0].length;
    const C = classes.length;

    // separação estratificada: cada letra contribui para treino e validação
    const porClasse = new Map(classes.map((c) => [c, []]));
    y.forEach((rot, i) => porClasse.get(rot).push(i));

    const idxTreino = [], idxVal = [];
    for (const c of classes) {
      const ids = porClasse.get(c);
      embaralhar(ids);
      const corte = Math.max(1, Math.round(ids.length * fracaoValidacao));
      idxVal.push(...ids.slice(0, corte));
      idxTreino.push(...ids.slice(corte));
    }

    const Xf = X.map((linha) => Float32Array.from(linha));
    const { media, desvio } = padronizar(idxTreino.map((i) => Xf[i]), d);
    for (const linha of Xf) {
      for (let i = 0; i < d; i++) linha[i] = (linha[i] - media[i]) / desvio[i];
    }
    const alvos = y.map((rot) => indiceClasse.get(rot));

    const rede = criar(d, h1, h2, C);
    const g = zeros(rede), m = zeros(rede), v = zeros(rede);
    const buf = {
      z1: new Float32Array(h1), z2: new Float32Array(h2),
      d1: new Float32Array(h1), d2: new Float32Array(h2),
      d3: new Float32Array(C), saida: new Float32Array(C),
    };

    let passo = 0;
    let melhorAcuracia = 0;
    let melhorRede = null;

    for (let epoca = 1; epoca <= epocas; epoca++) {
      embaralhar(idxTreino);
      let perdaTotal = 0;

      for (let inicio = 0; inicio < idxTreino.length; inicio += tamLote) {
        const lote = idxTreino.slice(inicio, inicio + tamLote);
        for (const i of lote) {
          frente(rede, Xf[i], buf);
          perdaTotal += tras(rede, Xf[i], alvos[i], buf, g);
        }
        passo++;
        aplicarAdam(rede, g, m, v, passo, lr, decaimento, lote.length);
      }

      let acertos = 0;
      for (const i of idxVal) {
        frente(rede, Xf[i], buf);
        let melhor = 0;
        for (let j = 1; j < C; j++) if (buf.saida[j] > buf.saida[melhor]) melhor = j;
        if (melhor === alvos[i]) acertos++;
      }
      const acuracia = acertos / idxVal.length;

      if (acuracia >= melhorAcuracia) {
        melhorAcuracia = acuracia;
        melhorRede = {};
        for (const k of chaves) melhorRede[k] = rede[k].slice();
      }

      if (onProgresso) {
        onProgresso({
          epoca, epocas,
          perda: perdaTotal / idxTreino.length,
          acuraciaValidacao: acuracia,
        });
      }
      await new Promise((r) => setTimeout(r, 0));   // devolve a vez à interface
    }

    for (const k of chaves) rede[k] = melhorRede[k];

    // matriz de confusão na validação: mostra o que ainda está sendo trocado
    const confusao = new Map();
    for (const i of idxVal) {
      frente(rede, Xf[i], buf);
      let melhor = 0;
      for (let j = 1; j < C; j++) if (buf.saida[j] > buf.saida[melhor]) melhor = j;
      if (melhor !== alvos[i]) {
        const par = `${classes[alvos[i]]}→${classes[melhor]}`;
        confusao.set(par, (confusao.get(par) || 0) + 1);
      }
    }

    return {
      acuracia: melhorAcuracia,
      confusoes: [...confusao.entries()].sort((a, b) => b[1] - a[1]),
      totalValidacao: idxVal.length,
      modelo: exportar(rede, classes, media, desvio),
    };
  }

  /** Formato lido pelo modelo.js — o mesmo que o treinar.py gera. */
  function exportar(rede, classes, media, desvio) {
    const matriz = (arr, linhas, colunas) => {
      const out = [];
      for (let i = 0; i < linhas; i++) {
        const linha = new Array(colunas);
        for (let j = 0; j < colunas; j++) linha[j] = arr[i * colunas + j];
        out.push(linha);
      }
      return out;
    };
    return {
      version: 2,
      features: HandFeatures.VERSAO,
      classes,
      scaler: { mean: Array.from(media), scale: Array.from(desvio) },
      layers: [
        { weights: matriz(rede.W1, rede.d, rede.h1), bias: Array.from(rede.b1) },
        { weights: matriz(rede.W2, rede.h1, rede.h2), bias: Array.from(rede.b2) },
        { weights: matriz(rede.W3, rede.h2, rede.C), bias: Array.from(rede.b3) },
      ],
      activation: "relu",
    };
  }

  return { treinar };
})();
