/**
 * SinaLibras — execução do modelo treinado (rede densa em JS puro)
 *
 * As features vêm do features.js. O modelo.json diz qual versão ele espera
 * no campo "features"; modelos antigos, sem esse campo, são tratados como v1.
 *
 * Cada idioma tem seu próprio arquivo em models/<idioma>/alfabeto.json.
 * As letras feitas com movimento (ver idiomas.js) têm suas saídas zeradas
 * antes do softmax, então nunca aparecem como resposta. Em Libras são
 * cinco; em ASL, só J e Z.
 */

const SignModel = (() => {
  "use strict";

  let model = null;
  let ready = false;
  let keep = [];
  let versaoFeatures = "v1";
  let idiomaAtual = null;

  /**
   * Carrega o modelo de um idioma a partir de models/<idioma>/alfabeto.json.
   * Para o Libras, tambem aceita o caminho antigo js/modelo.json, assim o
   * site continua funcionando antes de mover o arquivo de lugar.
   */
  async function load(idioma = Idiomas.PADRAO) {
    const caminhos = [Idiomas.caminhoModelo(idioma)];
    if (idioma === "libras") caminhos.push("js/modelo.json");

    try {
      let res = null;
      for (const caminho of caminhos) {
        const tentativa = await fetch(caminho).catch(() => null);
        if (tentativa && tentativa.ok) { res = tentativa; break; }
      }
      if (!res) throw new Error(`modelo de ${idioma} não encontrado`);

      model = await res.json();
      idiomaAtual = idioma;
      versaoFeatures = model.features || "v1";

      const EXCLUIDAS = Idiomas.excluidas(idioma);

      const esperado = model.scaler.mean.length;
      const gerado = versaoFeatures === "v1" ? 63 : 109;
      if (esperado !== gerado) {
        throw new Error(
          `modelo espera ${esperado} features mas ${versaoFeatures} gera ${gerado}`);
      }

      keep = model.classes
        .map((c, i) => (EXCLUIDAS.includes(c) ? -1 : i))
        .filter((i) => i >= 0);
      ready = true;
      return true;
    } catch (e) {
      console.error("Falha ao carregar o modelo:", e.message);
      ready = false;
      return false;
    }
  }

  const isReady = () => ready;
  const labels = () => keep.map((i) => model.classes[i]);
  const excluded = () => Idiomas.excluidas(idiomaAtual);
  const featureVersion = () => versaoFeatures;
  const idioma = () => idiomaAtual;

  function standardize(f) {
    const { mean, scale } = model.scaler;
    return f.map((v, i) => (v - mean[i]) / scale[i]);
  }

  function denseLayer(input, layer, applyRelu) {
    const { weights, bias } = layer;   // weights: [entradas][neurônios]
    const out = new Array(bias.length);
    for (let j = 0; j < bias.length; j++) {
      let sum = bias[j];
      for (let i = 0; i < input.length; i++) sum += input[i] * weights[i][j];
      out[j] = applyRelu && sum < 0 ? 0 : sum;
    }
    return out;
  }

  /**
   * Vetor de probabilidades sobre as letras estáticas, alinhado com labels().
   * Usado quadro a quadro; a média dos vetores decide a letra no final.
   */
  function probabilities(lm, handedness) {
    if (!ready || !lm || lm.length < 21) return null;

    let x = standardize(HandFeatures.extrair(lm, handedness, versaoFeatures));
    for (let i = 0; i < model.layers.length; i++) {
      x = denseLayer(x, model.layers[i], i < model.layers.length - 1);
    }

    const logits = keep.map((i) => x[i]);
    const max = Math.max(...logits);
    const exps = logits.map((v) => Math.exp(v - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / total);
  }

  function classify(lm, handedness) {
    const p = probabilities(lm, handedness);
    if (!p) return { letter: null, confidence: 0 };
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return { letter: labels()[best], confidence: p[best] };
  }

  return { load, isReady, classify, probabilities, labels, excluded, featureVersion, idioma };
})();
