/**
 * SinaLibras — Executor do modelo treinado (rede neural em JS puro)
 *
 * Carrega o modelo.json exportado pelo treinar.py e faz a predição no
 * navegador, sem bibliotecas. A rede é pequena (poucas camadas densas),
 * então basta multiplicar matrizes e aplicar ReLU.
 *
 * Se o modelo.json não existir, fica inativo e o site usa as regras
 * geométricas do signs.js como reserva.
 */

const SignModel = (() => {
  "use strict";

  let model = null;
  let ready = false;

  async function load(url = "js/modelo.json") {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("modelo.json não encontrado");
      model = await res.json();
      ready = true;
      console.log("Modelo treinado carregado:", model.classes.length, "classes");
      return true;
    } catch (e) {
      console.log("Sem modelo treinado — usando regras geométricas.", e.message);
      ready = false;
      return false;
    }
  }

  function isReady() {
    return ready;
  }

  // Padroniza a entrada igual ao StandardScaler do treino
  function standardize(features) {
    const { mean, scale } = model.scaler;
    return features.map((v, i) => (v - mean[i]) / scale[i]);
  }

  function relu(v) {
    return v < 0 ? 0 : v;
  }

  // Uma camada densa: saída = entrada · pesos + bias
  function denseLayer(input, layer, applyRelu) {
    const { weights, bias } = layer; // weights: [entradas][neurônios]
    const nOut = bias.length;
    const out = new Array(nOut).fill(0);
    for (let j = 0; j < nOut; j++) {
      let sum = bias[j];
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * weights[i][j];
      }
      out[j] = applyRelu ? relu(sum) : sum;
    }
    return out;
  }

  function softmax(arr) {
    const max = Math.max(...arr);
    const exps = arr.map((v) => Math.exp(v - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / total);
  }

  /**
   * Normaliza os 21 landmarks crus do MediaPipe em 63 números, igual ao
   * coletor e ao script de extração — os três PRECISAM usar a mesma conta.
   */
  function normalizeLandmarks(lm) {
    const wrist = lm[0];
    const scaleRef = Math.hypot(lm[9].x - wrist.x, lm[9].y - wrist.y) || 1;
    const flat = [];
    for (const p of lm) {
      flat.push((p.x - wrist.x) / scaleRef);
      flat.push((p.y - wrist.y) / scaleRef);
      flat.push((p.z - wrist.z) / scaleRef);
    }
    return flat;
  }

  /**
   * Recebe os landmarks crus e devolve { letter, confidence }.
   */
  function classify(lm) {
    if (!ready || !lm || lm.length < 21) {
      return { letter: null, confidence: 0 };
    }
    let x = standardize(normalizeLandmarks(lm));

    // Passa por todas as camadas; ReLU em todas menos a última
    for (let i = 0; i < model.layers.length; i++) {
      const isLast = i === model.layers.length - 1;
      x = denseLayer(x, model.layers[i], !isLast);
    }

    const probs = softmax(x);
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    const confidence = probs[bestIdx];

    // Limiar para evitar respostas chutadas
    if (confidence < 0.7) {
      return { letter: null, confidence };
    }
    return { letter: model.classes[bestIdx], confidence };
  }

  return { load, isReady, classify };
})();
