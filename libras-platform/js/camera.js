/**
 * SinaLibras — Câmera + MediaPipe Hands
 *
 * Este módulo:
 *  1. Pede SEMPRE autorização da câmera ao usuário (o popup do navegador
 *     aparece mesmo sem webcam física conectada).
 *  2. Trata todos os estados de erro, incluindo "nenhuma câmera encontrada"
 *     — caso de quem autoriza mas não tem webcam.
 *  3. Inicializa o MediaPipe Hands e processa cada frame do vídeo.
 *  4. Desenha os 21 landmarks no canvas e classifica o sinal.
 */

(() => {
  "use strict";

  // --- Elementos da interface ---
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
  const cameraSelect = document.getElementById("cameraSelect");

  const output = document.getElementById("output");
  const outputLetter = document.getElementById("outputLetter");
  const confBar = document.getElementById("confBar");
  const handCount = document.getElementById("handCount");

  // Elementos da soletração
  const wordOutput = document.getElementById("wordOutput");
  const btnSpace = document.getElementById("btnSpace");
  const btnBackspace = document.getElementById("btnBackspace");
  const btnClearWord = document.getElementById("btnClearWord");
  const btnSpeak = document.getElementById("btnSpeak");

  const diagSupport = document.getElementById("diagSupport");
  const diagSecure = document.getElementById("diagSecure");
  const diagPermission = document.getElementById("diagPermission");
  const diagDevices = document.getElementById("diagDevices");
  const diagMediapipe = document.getElementById("diagMediapipe");

  let currentStream = null;
  let hands = null;          // instância do MediaPipe Hands
  let rafId = null;          // id do requestAnimationFrame
  let processing = false;    // evita sobreposição de frames

  // Estabiliza a leitura: só troca a letra após N frames iguais
  let lastLetter = null;
  let stableCount = 0;
  const STABLE_FRAMES = 6;

  // Soletração: palavra em construção e trava para não repetir a letra
  let currentWord = "";
  let committed = false;

  // --- Utilidades de UI ---

  function showOverlay(which) {
    overlayIdle.classList.toggle("hidden", which !== "idle");
    overlayLoading.classList.toggle("hidden", which !== "loading");
    overlayError.classList.toggle("hidden", which !== "error");
  }

  function setDiag(el, text, state) {
    el.textContent = text;
    el.classList.remove("ok", "fail");
    if (state) el.classList.add(state);
  }

  // --- Diagnóstico inicial ---

  function runDiagnostics() {
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setDiag(diagSupport, hasMedia ? "suportado" : "não suportado", hasMedia ? "ok" : "fail");

    const secure = window.isSecureContext;
    setDiag(diagSecure, secure ? "ok" : "atenção", secure ? "ok" : "fail");

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "camera" })
        .then((res) => {
          updatePermissionDiag(res.state);
          res.onchange = () => updatePermissionDiag(res.state);
        })
        .catch(() => setDiag(diagPermission, "indeterminado"));
    } else {
      setDiag(diagPermission, "indeterminado");
    }

    setDiag(diagMediapipe, typeof Hands !== "undefined" ? "carregado" : "indisponível",
            typeof Hands !== "undefined" ? "ok" : "fail");

    return hasMedia;
  }

  function updatePermissionDiag(state) {
    const map = {
      granted: ["concedida", "ok"],
      denied: ["negada", "fail"],
      prompt: ["aguardando", null],
    };
    const [label, css] = map[state] || ["indeterminado", null];
    setDiag(diagPermission, label, css);
  }

  // --- Lista de câmeras ---

  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setDiag(diagDevices, String(cams.length), cams.length ? "ok" : "fail");

      cameraSelect.innerHTML = "";
      cams.forEach((cam, i) => {
        const opt = document.createElement("option");
        opt.value = cam.deviceId;
        opt.textContent = cam.label || `Câmera ${i + 1}`;
        cameraSelect.appendChild(opt);
      });
      cameraSelect.style.display = cams.length > 1 ? "" : "none";
      return cams;
    } catch (err) {
      console.error("Erro ao listar câmeras:", err);
      return [];
    }
  }

  // --- MediaPipe Hands ---

  function initHands() {
    if (hands || typeof Hands === "undefined") return;

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(onHandResults);
  }

  /**
   * Callback chamado pelo MediaPipe a cada frame processado.
   * Recebe os landmarks detectados e desenha + classifica.
   */
  function onHandResults(results) {
    // Ajusta o canvas ao tamanho do vídeo
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Espelha o desenho para acompanhar o vídeo espelhado
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    const handsLm = results.multiHandLandmarks || [];
    handCount.textContent = String(handsLm.length);

    if (handsLm.length > 0) {
      for (const lm of handsLm) {
        drawLandmarks(lm);
      }
      // Classifica usando a primeira mão detectada
      // Usa o modelo treinado se houver; senão, as regras geométricas
      const result = SignModel.isReady()
        ? SignModel.classify(handsLm[0])
        : SignClassifier.classify(handsLm[0]);
      updateSignOutput(result);
    } else {
      updateSignOutput({ letter: null, confidence: 0 });
    }

    ctx.restore();
  }

  /**
   * Desenha as conexões e os pontos da mão no canvas.
   * Usa as utilidades do MediaPipe quando disponíveis; senão, desenha manual.
   */
  function drawLandmarks(lm) {
    const w = canvas.width;
    const h = canvas.height;

    // Conexões entre os landmarks (esqueleto da mão)
    if (typeof drawConnectors !== "undefined" && typeof HAND_CONNECTIONS !== "undefined") {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "#4f8cff", lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: "#36d399", lineWidth: 1, radius: 4 });
    } else {
      // Fallback: desenha só os pontos
      ctx.fillStyle = "#36d399";
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Atualiza a área de saída com a letra detectada, estabilizando a leitura
   * para não ficar piscando entre letras a cada frame. Quando uma letra
   * fica estável, ela é "confirmada" e adicionada à palavra em construção
   * (apenas uma vez por gesto, não a cada frame).
   */
  function updateSignOutput(result) {
    const pct = Math.round(result.confidence * 100);
    confBar.style.width = pct + "%";

    if (result.letter && result.letter === lastLetter) {
      stableCount++;
    } else {
      lastLetter = result.letter;
      stableCount = 0;
      committed = false; // nova letra: libera para confirmar de novo
    }

    if (result.letter && stableCount >= STABLE_FRAMES) {
      outputLetter.textContent = result.letter;
      // Confirma a letra na palavra só uma vez por gesto estável
      if (!committed) {
        commitLetter(result.letter);
        committed = true;
      }
    } else if (!result.letter) {
      outputLetter.textContent = "—";
    }
  }

  /**
   * Sistema de soletração: junta letras confirmadas numa palavra.
   * Como o dataset é de letras, "palavra" aqui = sequência de letras
   * soletradas (datilologia). Sinais de palavras inteiras virão depois.
   */
  function commitLetter(letter) {
    currentWord += letter;
    if (wordOutput) wordOutput.textContent = currentWord;
  }

  function addSpace() {
    if (currentWord && !currentWord.endsWith(" ")) {
      currentWord += " ";
      wordOutput.textContent = currentWord;
    }
  }

  function backspace() {
    currentWord = currentWord.slice(0, -1);
    wordOutput.textContent = currentWord || "—";
  }

  function clearWord() {
    currentWord = "";
    wordOutput.textContent = "—";
  }

  function speakWord() {
    if (!currentWord.trim()) return;
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(currentWord.trim());
      u.lang = "pt-BR";
      speechSynthesis.speak(u);
    }
  }

  /**
   * Loop de envio de frames para o MediaPipe. Usa requestAnimationFrame
   * e evita enfileirar frames enquanto um ainda está sendo processado.
   */
  async function renderLoop() {
    if (!currentStream || !hands) return;
    if (!processing && video.readyState >= 2) {
      processing = true;
      try {
        await hands.send({ image: video });
      } catch (e) {
        console.error("Erro no MediaPipe:", e);
      }
      processing = false;
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  // --- Iniciar / parar câmera ---

  async function startCamera(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("Navegador incompatível",
        "Seu navegador não oferece suporte ao acesso à câmera. Tente uma versão atual do Chrome, Edge ou Firefox.");
      return;
    }

    loadingMsg.textContent = "Solicitando acesso à câmera…";
    showOverlay("loading");

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };

    try {
      stopCamera();
      // É AQUI que o navegador exibe o popup de permissão ao usuário,
      // mesmo que não exista webcam (o erro só vem depois de autorizar).
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;
      video.srcObject = stream;

      await listCameras();
      updatePermissionDiag("granted");

      showOverlay("none");
      statusBar.classList.remove("hidden");
      output.classList.remove("hidden");

      // Inicializa o rastreamento de mãos
      loadingMsg.textContent = "Carregando modelo de detecção de mãos…";
      initHands();
      video.onloadeddata = () => {
        renderLoop();
      };
      // Caso o vídeo já esteja pronto
      if (video.readyState >= 2) renderLoop();
    } catch (err) {
      handleCameraError(err);
    }
  }

  function stopCamera() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    video.srcObject = null;
    ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleCameraError(err) {
    console.error("Erro de câmera:", err.name, err.message);

    const messages = {
      NotAllowedError: {
        title: "Acesso negado",
        msg: "Você bloqueou o acesso à câmera. Clique no ícone de câmera/cadeado na barra de endereço, libere a permissão e tente de novo.",
      },
      PermissionDeniedError: {
        title: "Acesso negado",
        msg: "A permissão de câmera foi negada. Ajuste nas configurações do navegador e tente novamente.",
      },
      NotFoundError: {
        title: "Permissão concedida, mas sem câmera",
        msg: "Você autorizou o acesso, mas nenhuma webcam foi detectada no dispositivo. Conecte uma câmera e clique em \"Tentar de novo\" — o reconhecimento de sinais começa automaticamente.",
      },
      DevicesNotFoundError: {
        title: "Permissão concedida, mas sem câmera",
        msg: "Você autorizou o acesso, mas nenhuma webcam foi detectada. Conecte uma câmera e tente de novo.",
      },
      NotReadableError: {
        title: "Câmera em uso",
        msg: "A câmera já está sendo usada por outro aplicativo. Feche os demais programas e tente novamente.",
      },
      TrackStartError: {
        title: "Câmera em uso",
        msg: "Não foi possível iniciar a câmera. Verifique se outro aplicativo a está usando.",
      },
      OverconstrainedError: {
        title: "Configuração não suportada",
        msg: "A câmera selecionada não atende às configurações solicitadas. Tente outra câmera.",
      },
      SecurityError: {
        title: "Contexto inseguro",
        msg: "O acesso à câmera só funciona em conexões seguras (HTTPS) ou em localhost.",
      },
    };

    const info = messages[err.name] || {
      title: "Não foi possível acessar a câmera",
      msg: "Ocorreu um erro inesperado ao acessar a câmera. Verifique as permissões e tente de novo.",
    };

    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      updatePermissionDiag("denied");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      // O usuário CONCEDEU a permissão — só não tem câmera
      updatePermissionDiag("granted");
      setDiag(diagDevices, "0", "fail");
    }

    showError(info.title, info.msg);
  }

  function showError(title, msg) {
    errorTitle.textContent = title;
    errorMsg.textContent = msg;
    statusBar.classList.add("hidden");
    output.classList.add("hidden");
    showOverlay("error");
  }

  // --- Eventos ---

  btnRequest.addEventListener("click", () => startCamera());
  btnRetry.addEventListener("click", () => startCamera());

  btnStop.addEventListener("click", () => {
    stopCamera();
    statusBar.classList.add("hidden");
    output.classList.add("hidden");
    showOverlay("idle");
  });

  cameraSelect.addEventListener("change", (e) => startCamera(e.target.value));
  window.addEventListener("beforeunload", stopCamera);

  // Botões da soletração
  if (btnSpace) btnSpace.addEventListener("click", addSpace);
  if (btnBackspace) btnBackspace.addEventListener("click", backspace);
  if (btnClearWord) btnClearWord.addEventListener("click", clearWord);
  if (btnSpeak) btnSpeak.addEventListener("click", speakWord);

  // --- Inicialização ---

  function init() {
    const supported = runDiagnostics();
    if (!supported) {
      showError("Navegador incompatível",
        "Seu navegador não oferece suporte ao acesso à câmera. Tente uma versão atual do Chrome, Edge ou Firefox.");
      btnRequest.disabled = true;
    }
    listCameras();
    // Tenta carregar o modelo treinado; se não existir, segue com as regras
    SignModel.load().then((ok) => {
      setDiag(diagMediapipe,
        typeof Hands !== "undefined" ? (ok ? "modelo treinado ativo" : "carregado (regras)") : "indisponível",
        typeof Hands !== "undefined" ? "ok" : "fail");
    });
  }

  init();
})();
