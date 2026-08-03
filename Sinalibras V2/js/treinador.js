/**
 * SinaLibras — coleta e treino no navegador
 *
 * Grava amostras por letra, treina a rede com o rede.js e exporta o
 * modelo.json. O dataset guarda os landmarks CRUS, então dá para melhorar o
 * extrator de features depois e retreinar sem recoletar nada.
 */

(() => {
  "use strict";

  // Letras de configuração fixa. H, J, K, X e Z são feitas com movimento e
  // não têm pose única, por isso ficam de fora.
  const LETRAS = "ABCDEFGILMNOPQRSTUVWY".split("");
  const RAJADA_MS = 2000;
  const MIN_POR_LETRA = 30;
  const CHAVE_ARMAZENAMENTO = "sinalibras.dataset.v2";

  const $ = (id) => document.getElementById(id);

  const video = $("video");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  let stream = null, hands = null, rafId = null, processing = false;
  let ultimaMao = null, ultimoLado = "Right";
  let gravando = null;          // { letra, fim }
  let amostras = [];            // { label, raw, handedness }
  let modeloTreinado = null;

  // ── coleta ──────────────────────────────────────────────

  function montarBotoes() {
    const wrap = $("letterButtons");
    wrap.innerHTML = "";
    for (const letra of LETRAS) {
      const b = document.createElement("button");
      b.className = "letter-btn";
      b.dataset.letra = letra;
      b.innerHTML = `<b>${letra}</b><span>0</span>`;
      b.disabled = true;
      b.onclick = () => iniciarRajada(letra);
      wrap.appendChild(b);
    }
  }

  function atualizarContagens() {
    const contagem = {};
    for (const a of amostras) contagem[a.label] = (contagem[a.label] || 0) + 1;

    for (const b of document.querySelectorAll(".letter-btn")) {
      const n = contagem[b.dataset.letra] || 0;
      b.querySelector("span").textContent = String(n);
      b.classList.toggle("ok", n >= MIN_POR_LETRA);
      b.classList.toggle("parcial", n > 0 && n < MIN_POR_LETRA);
    }

    $("totalCount").textContent = String(amostras.length);

    const completas = LETRAS.filter((l) => (contagem[l] || 0) >= MIN_POR_LETRA);
    const prontas = completas.length >= 2;
    $("btnTrain").disabled = !prontas || gravando !== null;
    $("btnDownloadData").disabled = amostras.length === 0;
    $("btnClear").disabled = amostras.length === 0;

    if (!amostras.length) {
      $("trainStatus").textContent = `Colete pelo menos ${MIN_POR_LETRA} amostras de cada letra.`;
    } else if (!prontas) {
      $("trainStatus").textContent =
        `${completas.length} de ${LETRAS.length} letras com ${MIN_POR_LETRA}+ amostras.`;
    } else {
      const faltando = LETRAS.length - completas.length;
      $("trainStatus").textContent = faltando
        ? `Pronto para treinar. Ainda faltam ${faltando} letras — o modelo não vai reconhecer essas.`
        : "Todas as letras cobertas. Pode treinar.";
    }
  }

  function iniciarRajada(letra) {
    if (!stream || gravando) return;
    gravando = { letra, fim: performance.now() + RAJADA_MS };
    $("cue").classList.remove("hidden");
    $("cueText").textContent = letra;
    $("rajadaInfo").textContent = `gravando ${letra}…`;
    for (const b of document.querySelectorAll(".letter-btn")) b.disabled = true;
    $("btnTrain").disabled = true;
  }

  function encerrarRajada() {
    gravando = null;
    $("cue").classList.add("hidden");
    $("rajadaInfo").textContent = "rajada de 2s";
    for (const b of document.querySelectorAll(".letter-btn")) b.disabled = !stream;
    salvarLocal();
    atualizarContagens();
  }

  function salvarLocal() {
    try {
      localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(amostras));
    } catch (e) {
      console.warn("Não deu para guardar no navegador:", e.message);
    }
  }

  function carregarLocal() {
    try {
      const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO);
      if (bruto) amostras = JSON.parse(bruto);
    } catch (e) {
      console.warn("Não deu para ler o dataset guardado:", e.message);
    }
  }

  // ── treino ──────────────────────────────────────────────

  async function treinar() {
    const X = amostras.map((a) => HandFeatures.v2(
      a.raw.map((p) => ({ x: p[0], y: p[1], z: p[2] })), a.handedness));
    const y = amostras.map((a) => a.label);

    $("btnTrain").disabled = true;
    $("progress").classList.remove("hidden");
    $("result").classList.add("hidden");

    const r = await RedeNeural.treinar(X, y, {
      epocas: 60,
      onProgresso: ({ epoca, epocas, perda, acuraciaValidacao }) => {
        $("progressBar").style.width = `${(epoca / epocas) * 100}%`;
        $("trainStatus").textContent =
          `Época ${epoca}/${epocas} · erro ${perda.toFixed(3)} · ` +
          `acerto ${(acuraciaValidacao * 100).toFixed(0)}%`;
      },
    });

    modeloTreinado = r.modelo;
    $("progress").classList.add("hidden");
    $("btnTrain").disabled = false;
    $("btnDownloadModel").disabled = false;
    $("trainStatus").textContent =
      `Treino concluído · ${(r.acuracia * 100).toFixed(1)}% em ${r.totalValidacao} amostras de validação`;

    const caixa = $("result");
    caixa.classList.remove("hidden");
    if (!r.confusoes.length) {
      caixa.innerHTML = "<p class='ok-msg'>Nenhuma confusão na validação.</p>";
    } else {
      caixa.innerHTML =
        "<p class='eyebrow'>Ainda confunde · recolete estas primeiro</p>" +
        r.confusoes.slice(0, 8)
          .map(([par, n]) => `<span class="confusao">${par} <em>${n}</em></span>`)
          .join("");
    }
  }

  function baixar(nome, dados) {
    const blob = new Blob([JSON.stringify(dados)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── câmera ──────────────────────────────────────────────

  function showOverlay(qual) {
    $("overlayIdle").classList.toggle("hidden", qual !== "idle");
    $("overlayLoading").classList.toggle("hidden", qual !== "loading");
    $("overlayError").classList.toggle("hidden", qual !== "error");
  }

  function initHands() {
    if (hands || typeof Hands === "undefined") return;
    hands = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    hands.setOptions({
      maxNumHands: 1,   // uma mão por amostra, para não etiquetar a errada
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });
    hands.onResults(aoResultado);
  }

  function aoResultado(res) {
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const maos = res.multiHandLandmarks || [];
    $("handFlag").classList.toggle("hidden", maos.length > 0);
    $("handStatus").textContent = maos.length ? "mão detectada" : "aguardando mão";

    if (maos.length) {
      ultimaMao = maos[0];
      ultimoLado = res.multiHandedness?.[0]?.label || "Right";
      desenharMao(ultimaMao);

      if (gravando) {
        amostras.push({
          label: gravando.letra,
          raw: ultimaMao.map((p) => [p.x, p.y, p.z]),
          handedness: ultimoLado,
        });
        $("cueText").textContent = `${gravando.letra} · ${amostras.length}`;
      }
    } else {
      ultimaMao = null;
    }

    ctx.restore();
    if (gravando && performance.now() >= gravando.fim) encerrarRajada();
  }

  function desenharMao(lm) {
    if (typeof drawConnectors !== "undefined" && typeof HAND_CONNECTIONS !== "undefined") {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "#3a2be0", lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: "#ffffff", fillColor: "#3a2be0", lineWidth: 2, radius: 4 });
    }
  }

  async function renderLoop() {
    if (!stream || !hands) return;
    if (!processing && video.readyState >= 2) {
      processing = true;
      try { await hands.send({ image: video }); } catch (e) { console.error(e); }
      processing = false;
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  async function startCamera() {
    showOverlay("loading");
    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      showOverlay("none");
      $("stageBar").classList.remove("hidden");
      for (const b of document.querySelectorAll(".letter-btn")) b.disabled = false;
      initHands();
      video.onloadeddata = renderLoop;
      if (video.readyState >= 2) renderLoop();
      atualizarContagens();
    } catch (err) {
      $("errorTitle").textContent = err.name === "NotFoundError"
        ? "Nenhuma câmera encontrada" : "Não foi possível acessar a câmera";
      $("errorMsg").textContent = err.name === "NotAllowedError"
        ? "A permissão foi bloqueada. Libere no ícone da barra de endereço e tente de novo."
        : "Verifique se a webcam está conectada e não está em uso por outro aplicativo.";
      showOverlay("error");
    }
  }

  function stopCamera() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
    for (const b of document.querySelectorAll(".letter-btn")) b.disabled = true;
  }

  // ── eventos ─────────────────────────────────────────────

  $("btnRequest").onclick = startCamera;
  $("btnRetry").onclick = startCamera;
  $("btnStop").onclick = () => {
    stopCamera();
    $("stageBar").classList.add("hidden");
    showOverlay("idle");
  };

  $("btnTrain").onclick = treinar;

  $("btnDownloadModel").onclick = () => {
    if (modeloTreinado) baixar("modelo.json", modeloTreinado);
  };

  $("btnDownloadData").onclick = () => baixar(
    `dataset-sinalibras-${Date.now()}.json`,
    { version: 2, pointCount: 21, format: "raw", samples: amostras });

  $("fileInput").onchange = async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
      const dados = JSON.parse(await arquivo.text());
      const novas = (dados.samples || []).filter((s) => s.raw);
      if (!novas.length) throw new Error("dataset sem landmarks crus");
      amostras = amostras.concat(novas);
      salvarLocal();
      atualizarContagens();
    } catch (err) {
      $("trainStatus").textContent = `Não deu para ler o arquivo: ${err.message}`;
    }
    e.target.value = "";
  };

  $("btnClear").onclick = () => {
    if (!confirm("Apagar todas as amostras coletadas? Não dá para desfazer.")) return;
    amostras = [];
    modeloTreinado = null;
    $("btnDownloadModel").disabled = true;
    $("result").classList.add("hidden");
    salvarLocal();
    atualizarContagens();
  };

  window.addEventListener("beforeunload", stopCamera);

  // ── início ──────────────────────────────────────────────

  montarBotoes();
  carregarLocal();
  atualizarContagens();
})();
