/**
 * SinaLibras — Módulo de classificação de sinais
 *
 * Recebe os 21 landmarks de uma mão (vindos do MediaPipe Hands) e tenta
 * reconhecer letras do alfabeto manual de Libras usando REGRAS GEOMÉTRICAS.
 *
 * Por que regras e não machine learning, neste momento?
 *  - Letras estáticas (como A, B, C, L, U, V) têm configuração de dedos
 *    determinística: dá pra reconhecer só olhando quais dedos estão
 *    estendidos ou dobrados. Isso não precisa de treino nem dataset.
 *  - Letras com MOVIMENTO (H, J, K, X, Z) e sinais dinâmicos vão precisar
 *    de um classificador treinado (LSTM) numa etapa futura.
 *
 * ── Topologia dos 21 landmarks do MediaPipe Hands ──
 *   0: pulso
 *   1-4:   polegar   (1=base ... 4=ponta)
 *   5-8:   indicador (5=base ... 8=ponta)
 *   9-12:  médio     (9=base ... 12=ponta)
 *   13-16: anelar    (13=base ... 16=ponta)
 *   17-20: mínimo    (17=base ... 20=ponta)
 */

const SignClassifier = (() => {
  "use strict";

  // Índices das pontas e das juntas (PIP) de cada dedo
  const TIPS = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
  const PIPS = { index: 6, middle: 10, ring: 14, pinky: 18 };
  const MCPS = { index: 5, middle: 9, ring: 13, pinky: 17 };

  /**
   * Verifica se um dedo (exceto o polegar) está estendido.
   * Lógica: se a PONTA está mais "acima" (y menor) que a junta PIP, o dedo
   * está esticado. O eixo Y cresce para baixo na imagem.
   */
  function isFingerExtended(lm, finger) {
    return lm[TIPS[finger]].y < lm[PIPS[finger]].y;
  }

  /**
   * O polegar é tratado à parte: ele se estende para o lado, não para cima.
   * Comparamos a posição horizontal (x) da ponta com a junta.
   * Como o vídeo é espelhado, consideramos ambos os lados.
   */
  function isThumbExtended(lm) {
    const tip = lm[TIPS.thumb];
    const ip = lm[3]; // junta interfalângica do polegar
    const dist = Math.abs(tip.x - ip.x);
    return dist > 0.04; // afastamento horizontal mínimo
  }

  /**
   * Monta um "vetor de estado" dos dedos: true = estendido, false = dobrado.
   * É esse padrão que cada letra do alfabeto vai comparar.
   */
  function getFingerStates(lm) {
    return {
      thumb: isThumbExtended(lm),
      index: isFingerExtended(lm, "index"),
      middle: isFingerExtended(lm, "middle"),
      ring: isFingerExtended(lm, "ring"),
      pinky: isFingerExtended(lm, "pinky"),
    };
  }

  /**
   * Regras das letras do alfabeto manual de Libras.
   * Cada entrada compara o estado dos cinco dedos (T=polegar, I=indicador,
   * M=médio, A=anelar, m=mínimo). Algumas letras compartilham configuração
   * de dedos e só diferem por orientação/movimento — essas ficam para a
   * etapa de ML. Aqui cobrimos as estáticas mais distintas.
   *
   * Formato: [polegar, indicador, médio, anelar, mínimo]
   */
  const RULES = [
    { letter: "A", pattern: [false, false, false, false, false] }, // punho fechado, polegar ao lado
    { letter: "B", pattern: [false, true, true, true, true] },      // quatro dedos retos, polegar dobrado
    { letter: "L", pattern: [true, true, false, false, false] },    // polegar + indicador em "L"
    { letter: "U", pattern: [false, true, true, false, false] },    // indicador e médio juntos pra cima
    { letter: "V", pattern: [false, true, true, false, false], spread: true }, // como U, mas dedos separados
    { letter: "W", pattern: [false, true, true, true, false] },     // três dedos
    { letter: "Y", pattern: [true, false, false, false, true] },    // polegar e mínimo ("hang loose")
    { letter: "I", pattern: [false, false, false, false, true] },   // só o mínimo
    { letter: "D", pattern: [false, true, false, false, false] },   // só o indicador
  ];

  /**
   * Distância euclidiana 2D entre dois landmarks.
   */
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * Detecta se os dedos indicador e médio estão separados (para diferenciar
   * V de U). Compara a distância entre as pontas com a largura da mão.
   */
  function isSpread(lm) {
    const fingerGap = dist(lm[TIPS.index], lm[TIPS.middle]);
    const handWidth = dist(lm[MCPS.index], lm[MCPS.pinky]);
    return fingerGap > handWidth * 0.6;
  }

  /**
   * Função principal: recebe os landmarks e devolve a letra reconhecida
   * com um valor de confiança (0 a 1).
   */
  function classify(lm) {
    if (!lm || lm.length < 21) {
      return { letter: null, confidence: 0 };
    }

    const states = getFingerStates(lm);
    const current = [states.thumb, states.index, states.middle, states.ring, states.pinky];
    const spread = isSpread(lm);

    let best = { letter: null, confidence: 0 };

    for (const rule of RULES) {
      // Conta quantos dos cinco dedos batem com o padrão da regra
      let matches = 0;
      for (let i = 0; i < 5; i++) {
        if (current[i] === rule.pattern[i]) matches++;
      }
      let confidence = matches / 5;

      // Ajuste fino para regras que dependem de separação dos dedos
      if (rule.spread !== undefined) {
        if (rule.spread === spread) confidence += 0.0;
        else confidence -= 0.4; // penaliza se a separação não bate
      }

      if (confidence > best.confidence) {
        best = { letter: rule.letter, confidence: Math.max(0, Math.min(1, confidence)) };
      }
    }

    // Só consideramos válido acima de um limiar, pra evitar ruído
    if (best.confidence < 0.8) {
      return { letter: null, confidence: best.confidence };
    }
    return best;
  }

  return { classify, getFingerStates };
})();
