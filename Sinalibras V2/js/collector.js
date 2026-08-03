/**
 * SinaLibras — Coletor de dataset
 *
 * Captura os 21 landmarks da mão (via MediaPipe Hands) e os armazena com uma
 * ETIQUETA (o nome do sinal). No fim, exporta tudo como JSON para você treinar
 * um classificador.
 *
 * Formato de cada amostra:
 *   { label: "A", landmarks: [63 números normalizados], timestamp: 12345 }
 *
 * Os 63 números são os 21 pontos (x, y, z) já NORMALIZADOS em relação ao pulso,
 * para que a posição da mão na tela não influencie — só a forma do gesto importa.
 */

(() => {
  "use strict";

  // --- Elementos ---
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const overlayIdle = document.getElementById("overlayIdle");
  const overlayLoading = document.getElementById("overlayLoading");
  const overlayError = document.getElementById("overlayError");
  const loadingMsg = document.getElementById("loadingMsg");
  const errorTitle = document.getElementById("errorTitle");
  const errorMsg = document.getElementById("errorMsg");

  const btnRequest = document.getElementById("btnRequest");
  const btnRetry = document.getElementById("btnRetry");
  const btnStop = document.getElementById("btnStop");
  const statusBar = document.getElementById("statusBar");
  const handStatus = document.getElementById("handStatus");

  const collector = document.getElementById("collector");
  const labelInput = document.getElementById("labelInput");
  const modeSingle = document.getElementById("modeSingle");
  const modeBurst = document.getElementById("modeBurst");
  const btnCapture = document.getElementById("btnCapture");
  const captureHint = document.getElementById("captureHint");
  const totalCount = document.getElementById("totalCount");
  const labelList = document.getElementById("labelList");
  const btnExport = document.getElementById("btnExport");
  const btnClear = document.getElementById("btnClear");

  // --- Estado ---
  let currentStream = null;
  let hands = null;
  let rafId = null;
  let processing = false;

  let latestLandmarks = null;  // últimos landmarks brutos detectados
  let latestHandedness = "Right";
  let captureMode = "single";  // "single" ou "burst"
  let bursting = false;

  // O dataset guarda os landmarks CRUS, não as features.
  // Assim dá para melhorar o extrator e retreinar sem recoletar nada.
  const dataset = [];

  // --- UI helpers ---
  function showOverlay(which) {
    overlayIdle.classList.toggle("hidden", which !== "idle");
    overlayLoading.classList.toggle("hidden", which !== "loading");
    overlayError.classList.toggle("hidden", which !== "error");
  }

  /**
   * Guarda os 21 pontos como vieram do MediaPipe, junto com o lado da mão.
   * As features são calculadas depois, no treino (treino/features.py), e no
   * site (js/features.js). Guardar cru é o que permite trocar de extrator
   * sem jogar o dataset fora.
   */
  function rawLandmarks(lm) {
    return lm.map((p) => [p.x, p.y, p.z]);
  }

  // --- MediaPipe ---
  function initHands() {
    if (hands || typeof Hands === "undefined") return;
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,        // coletor foca em UMA mão por vez
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });
    hands.onResults(onHandResults);
  }

  function onHandResults(results) {
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const handsLm = results.multiHandLandmarks || [];

    if (handsLm.length > 0) {
      latestLandmarks = handsLm[0];
      latestHandedness = results.multiHandedness?.[0]?.label || "Right";
      drawHand(latestLandmarks);
      handStatus.textContent = "Mão detectada ✓";
      btnCapture.disabled = !labelInput.value.trim();
      captureHint.textContent = labelInput.value.trim()
        ? "Pronto para capturar."
        : "Digite a etiqueta do sinal acima.";
    } else {
      latestLandmarks = null;
      handStatus.textContent = "Aguardando mão…";
      btnCapture.disabled = true;
      captureHint.textContent = "Posicione a mão na frente da câmera.";
    }

    ctx.restore();
  }

  function drawHand(lm) {
    if (typeof drawConnectors !== "undefined" && typeof HAND_CONNECTIONS !== "undefined") {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "#4f8cff", lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: "#36d399", lineWidth: 1, radius: 4 });
    } else {
      ctx.fillStyle = "#36d399";
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  async function renderLoop() {
    if (!currentStream || !hands) return;
    if (!processing && video.readyState >= 2) {
      processing = true;
      try { await hands.send({ image: video }); }
      catch (e) { console.error("MediaPipe:", e); }
      processing = false;
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  // --- Captura de amostras ---
  function captureOne() {
    const label = labelInput.value.trim();
    if (!label || !latestLandmarks) return;

    dataset.push({
      label: label,
      raw: rawLandmarks(latestLandmarks),
      handedness: latestHandedness,
      timestamp: Date.now(),
    });
    refreshSummary();
  }

  function startBurst() {
    const label = labelInput.value.trim();
    if (!label) return;
    bursting = true;
    btnCapture.disabled = true;
    let collected = 0;
    const durationMs = 3000;
    const intervalMs = 100; // ~10 amostras por segundo
    const start = Date.now();

    const timer = setInterval(() => {
      if (latestLandmarks) {
        dataset.push({
          label,
          raw: rawLandmarks(latestLandmarks),
          handedness: latestHandedness,
          timestamp: Date.now(),
        });
        collected++;
        captureHint.textContent = `Gravando rajada… ${collected} amostras`;
        refreshSummary();
      }
      if (Date.now() - start >= durationMs) {
        clearInterval(timer);
        bursting = false;
        captureHint.textContent = `Rajada concluída: ${collected} amostras de "${label}".`;
        btnCapture.disabled = false;
      }
    }, intervalMs);
  }

  // --- Resumo do dataset ---
  function refreshSummary() {
    totalCount.textContent = String(dataset.length);

    // Conta amostras por etiqueta
    const counts = {};
    for (const s of dataset) counts[s.label] = (counts[s.label] || 0) + 1;

    const labels = Object.keys(counts).sort();
    if (labels.length === 0) {
      labelList.innerHTML = '<li class="empty">Nenhuma amostra ainda.</li>';
    } else {
      labelList.innerHTML = labels
        .map((l) => `<li><span class="lbl">${escapeHtml(l)}</span><span class="cnt">${counts[l]}</span></li>`)
        .join("");
    }

    const hasData = dataset.length > 0;
    btnExport.disabled = !hasData;
    btnClear.disabled = !hasData;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // --- Exportar dataset ---
  function exportDataset() {
    const payload = {
      version: 2,
      created: new Date().toISOString(),
      pointCount: 21,
      format: "raw",          // landmarks crus; features calculadas no treino
      samples: dataset,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataset-libras-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearDataset() {
    if (!confirm("Apagar todas as amostras coletadas? Esta ação não pode ser desfeita.")) return;
    dataset.length = 0;
    refreshSummary();
  }

  // --- Câmera (mesma base do tradutor) ---
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("Navegador incompatível", "Use uma versão atual do Chrome, Edge ou Firefox.");
      return;
    }
    loadingMsg.textContent = "Solicitando acesso à câmera…";
    showOverlay("loading");
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      currentStream = stream;
      video.srcObject = stream;

      showOverlay("none");
      statusBar.classList.remove("hidden");
      collector.classList.remove("hidden");

      loadingMsg.textContent = "Carregando modelo de detecção…";
      initHands();
      video.onloadeddata = () => renderLoop();
      if (video.readyState >= 2) renderLoop();
    } catch (err) {
      handleCameraError(err);
    }
  }

  function stopCamera() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    video.srcObject = null;
    ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleCameraError(err) {
    console.error("Câmera:", err.name, err.message);
    const messages = {
      NotAllowedError: ["Acesso negado", "Libere a permissão da câmera na barra de endereço e tente de novo."],
      NotFoundError: ["Permissão concedida, mas sem câmera", "Nenhuma webcam detectada. Conecte uma e tente de novo."],
      NotReadableError: ["Câmera em uso", "Feche outros aplicativos que usam a câmera e tente novamente."],
      SecurityError: ["Contexto inseguro", "A câmera só funciona em HTTPS ou localhost."],
    };
    const [title, msg] = messages[err.name] || ["Erro ao acessar a câmera", "Verifique as permissões e tente de novo."];
    statusBar.classList.add("hidden");
    collector.classList.add("hidden");
    errorTitle.textContent = title;
    errorMsg.textContent = msg;
    showOverlay("error");
  }

  function showError(title, msg) {
    errorTitle.textContent = title;
    errorMsg.textContent = msg;
    showOverlay("error");
  }

  // --- Eventos ---
  btnRequest.addEventListener("click", startCamera);
  btnRetry.addEventListener("click", startCamera);
  btnStop.addEventListener("click", () => {
    stopCamera();
    statusBar.classList.add("hidden");
    collector.classList.add("hidden");
    showOverlay("idle");
  });

  labelInput.addEventListener("input", () => {
    btnCapture.disabled = !(labelInput.value.trim() && latestLandmarks);
  });

  modeSingle.addEventListener("click", () => {
    captureMode = "single";
    modeSingle.classList.add("active");
    modeBurst.classList.remove("active");
    btnCapture.textContent = "Capturar amostra";
  });
  modeBurst.addEventListener("click", () => {
    captureMode = "burst";
    modeBurst.classList.add("active");
    modeSingle.classList.remove("active");
    btnCapture.textContent = "Gravar rajada (3s)";
  });

  btnCapture.addEventListener("click", () => {
    if (bursting) return;
    if (captureMode === "single") captureOne();
    else startBurst();
  });

  btnExport.addEventListener("click", exportDataset);
  btnClear.addEventListener("click", clearDataset);
  window.addEventListener("beforeunload", stopCamera);

  // --- Init ---
  refreshSummary();
})();
