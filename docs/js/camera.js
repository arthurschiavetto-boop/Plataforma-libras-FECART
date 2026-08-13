/**
 * SinaLibras — câmera, rastreamento e gravação de sinal
 *
 * A câmera roda continuamente para dar retorno visual, mas nenhuma letra é
 * registrada sozinha. O usuário aperta gravar: o sistema conta até um,
 * acumula os vetores de probabilidade de todos os quadros da janela de
 * captura e decide pela média. Uma média sobre ~40 quadros é muito mais
 * estável do que a leitura de um quadro isolado.
 */

(() => {
  "use strict";

  const PREPARO_MS = 1800;    // contagem antes de valer
  const CAPTURA_MS = 1600;    // janela em que os quadros contam
  const CONF_MIN = 0.55;      // abaixo disso a leitura é declarada incerta
  const MARGEM_MIN = 0.12;    // distância mínima entre 1º e 2º lugar
  const QUADROS_MIN = 12;     // amostras mínimas para aceitar a gravação

  const $ = (id) => document.getElementById(id);

  const video = $("video");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");

  const overlayIdle = $("overlayIdle");
  const overlayLoading = $("overlayLoading");
  const overlayError = $("overlayError");
  const loadingMsg = $("loadingMsg");
  const errorTitle = $("errorTitle");
  const errorMsg = $("errorMsg");

  const btnRequest = $("btnRequest");
  const btnRetry = $("btnRetry");
  const btnStop = $("btnStop");
  const stageBar = $("stageBar");
  const cameraSelect = $("cameraSelect");

  const btnRecord = $("btnRecord");
  const recProgress = $("recProgress");
  const recordHint = $("recordHint");
  const cue = $("cue");
  const cueText = $("cueText");
  const handFlag = $("handFlag");

  const resultLetter = $("resultLetter");
  const resultVerdict = $("resultVerdict");
  const ranking = $("ranking");
  const logList = $("logList");
  const btnClearLog = $("btnClearLog");
  const seletorIdioma = $("idioma");

  const DASH = 339.3;   // circunferência do anel de progresso

  let currentStream = null;
  let hands = null;
  let rafId = null;
  let processing = false;

  let modoGravacao = "parado";   // parado | preparo | capturando
  let acumulado = {};            // por mão: { soma[], quadros }
  let inicioFase = 0;
  let historico = [];

  const NOME_MAO = { Right: "direita", Left: "esquerda" };

  // ── UI ──────────────────────────────────────────────────

  function showOverlay(which) {
    overlayIdle.classList.toggle("hidden", which !== "idle");
    overlayLoading.classList.toggle("hidden", which !== "loading");
    overlayError.classList.toggle("hidden", which !== "error");
  }

  function setDiag(el, text, state) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "fail");
    if (state) el.classList.add(state);
  }

  function setProgresso(fracao) {
    recProgress.style.strokeDashoffset = String(DASH * (1 - fracao));
  }

  function montarGradeLetras() {
    const grid = $("letterGrid");
    if (!grid || !SignModel.isReady()) return;
    const validas = new Set(SignModel.labels());
    grid.innerHTML = "";
    for (const letra of Idiomas.ALFABETO) {
      const el = document.createElement("span");
      el.textContent = letra;
      if (!validas.has(letra)) el.classList.add("off");
      grid.appendChild(el);
    }

    const texto = $("scopeText");
    if (texto) {
      const fora = SignModel.excluded();
      texto.innerHTML =
        `As <strong>${validas.size} letras</strong> de configuração fixa do alfabeto ` +
        `manual de ${Idiomas.nome(SignModel.idioma())}. ` +
        `<strong>${fora.join(", ")} ${fora.length > 1 ? "ficam" : "fica"} de fora</strong>: ` +
        `${fora.length > 1 ? "são feitas" : "é feita"} com movimento e não ` +
        `${fora.length > 1 ? "existem" : "existe"} como pose única, então não ` +
        `${fora.length > 1 ? "podem" : "pode"} ser ${fora.length > 1 ? "classificadas" : "classificada"} ` +
        `a partir de quadros isolados.`;
    }
  }

  function montarSeletorIdioma() {
    if (!seletorIdioma) return;
    seletorIdioma.innerHTML = "";
    for (const id of Idiomas.lista()) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = Idiomas.nome(id);
      seletorIdioma.appendChild(opt);
    }
    seletorIdioma.value = Idiomas.PADRAO;
  }

  /** Troca o idioma: recarrega o modelo e limpa a leitura anterior. */
  async function trocarIdioma(id) {
    modoGravacao = "parado";
    btnRecord.classList.remove("is-recording");
    btnRecord.disabled = true;
    cue.classList.add("hidden");
    setProgresso(0);
    ranking.classList.add("hidden");
    resultLetter.classList.remove("uncertain");
    resultLetter.textContent = "—";
    resultVerdict.textContent = `Carregando ${Idiomas.nome(id)}…`;

    const ok = await SignModel.load(id);
    setDiag($("diagModel"),
      ok ? `${SignModel.labels().length} letras · features ${SignModel.featureVersion()}` : "não carregado",
      ok ? "ok" : "fail");
    montarGradeLetras();

    if (ok) {
      resultVerdict.textContent = "Nenhuma gravação ainda.";
      btnRecord.disabled = !currentStream;
      recordHint.textContent = currentStream ? "Gravar sinal" : "Ligue a câmera para gravar";
    } else {
      resultVerdict.textContent =
        `Modelo de ${Idiomas.nome(id)} ainda não treinado. ` +
        `Colete e treine em "Coletar e treinar".`;
      recordHint.textContent = "Modelo indisponível";
    }
  }

  // ── gravação ────────────────────────────────────────────

  function podeGravar() {
    return currentStream && SignModel.isReady() && modoGravacao === "parado";
  }

  function iniciarGravacao() {
    if (!podeGravar()) return;
    modoGravacao = "preparo";
    inicioFase = performance.now();
    acumulado = {};
    btnRecord.classList.add("is-recording");
    cue.classList.remove("hidden");
    recordHint.textContent = "Posicione a mão e segure o gesto";
    setProgresso(0);
  }

  function tickGravacao() {
    if (modoGravacao === "parado") return;
    const decorrido = performance.now() - inicioFase;

    if (modoGravacao === "preparo") {
      const restante = Math.ceil((PREPARO_MS - decorrido) / 600);
      cue.classList.remove("rec-on");
      cueText.textContent = String(Math.max(restante, 1));
      setProgresso(0);
      if (decorrido >= PREPARO_MS) {
        modoGravacao = "capturando";
        inicioFase = performance.now();
        cue.classList.add("rec-on");
        cueText.textContent = "gravando — segure o gesto";
        recordHint.textContent = "Gravando…";
      }
      return;
    }

    setProgresso(Math.min(decorrido / CAPTURA_MS, 1));
    if (decorrido >= CAPTURA_MS) encerrarGravacao();
  }

  function encerrarGravacao() {
    modoGravacao = "parado";
    btnRecord.classList.remove("is-recording");
    cue.classList.add("hidden");
    cue.classList.remove("rec-on");
    recordHint.textContent = "Gravar sinal";
    setProgresso(0);

    const letras = SignModel.labels();
    const leituras = [];

    for (const lado of Object.keys(acumulado)) {
      const { soma, quadros } = acumulado[lado];
      if (quadros < QUADROS_MIN) continue;
      const media = soma.map((v) => v / quadros);
      const ordem = media
        .map((p, i) => ({ letra: letras[i], p }))
        .sort((a, b) => b.p - a.p);
      leituras.push({ lado, ordem, quadros, margem: ordem[0].p - ordem[1].p });
    }

    if (!leituras.length) {
      ranking.classList.add("hidden");
      mostrarIncerto("A mão não ficou visível o suficiente. Enquadre a mão inteira e grave de novo.");
      return;
    }

    leituras.sort((a, b) => b.ordem[0].p - a.ordem[0].p);
    const principal = leituras[0];
    mostrarRanking(principal.ordem.slice(0, 3), leituras);

    if (principal.ordem[0].p < CONF_MIN || principal.margem < MARGEM_MIN) {
      mostrarIncerto(
        `Leitura ambígua entre ${principal.ordem[0].letra} e ${principal.ordem[1].letra}. ` +
        "Ajuste o ângulo da mão e grave de novo."
      );
      return;
    }

    resultLetter.classList.remove("uncertain");
    resultLetter.textContent = principal.ordem[0].letra;

    const maoTxt = leituras.length > 1
      ? `mão ${NOME_MAO[principal.lado] || principal.lado}`
      : `média de ${principal.quadros} quadros`;
    resultVerdict.textContent =
      `Confiança ${(principal.ordem[0].p * 100).toFixed(0)}% · ${maoTxt}`;

    registrarNoHistorico(principal.ordem[0].letra, principal.ordem[0].p);
  }

  function mostrarIncerto(motivo) {
    resultLetter.classList.add("uncertain");
    resultLetter.textContent = "sem leitura";
    resultVerdict.textContent = motivo;
  }

  function mostrarRanking(top, leituras) {
    ranking.classList.remove("hidden");
    ranking.innerHTML = "";

    if (leituras && leituras.length > 1) {
      const nota = document.createElement("p");
      nota.className = "hands-note";
      nota.textContent = leituras
        .map((l) => `${NOME_MAO[l.lado] || l.lado}: ${l.ordem[0].letra} ` +
                    `(${(l.ordem[0].p * 100).toFixed(0)}%)`)
        .join(" · ");
      ranking.appendChild(nota);
    }

    for (const { letra, p } of top) {
      const row = document.createElement("div");
      row.className = "rank-row";
      row.innerHTML =
        `<b>${letra}</b><div class="rank-bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` +
        `<span>${(p * 100).toFixed(0)}%</span>`;
      ranking.appendChild(row);
    }
  }

  function registrarNoHistorico(letra, conf) {
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    historico.unshift({ letra, conf, hora });
    historico = historico.slice(0, 8);
    desenharHistorico();
  }

  function desenharHistorico() {
    logList.innerHTML = "";
    if (!historico.length) {
      logList.innerHTML = '<li class="log-empty">As leituras aparecem aqui.</li>';
      return;
    }
    for (const item of historico) {
      const li = document.createElement("li");
      li.innerHTML = `<b>${item.letra}</b>${(item.conf * 100).toFixed(0)}%<em>${item.hora}</em>`;
      logList.appendChild(li);
    }
  }

  // ── MediaPipe ───────────────────────────────────────────

  function initHands() {
    if (hands || typeof Hands === "undefined") return;
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    // Duas mãos: o alfabeto de Libras é de uma mão só, mas alfabetos como o
    // da BSL usam as duas, e o modelo classifica cada mão separadamente.
    hands.setOptions({
      maxNumHands: 2,
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

    const maos = results.multiHandLandmarks || [];
    handFlag.classList.toggle("hidden", maos.length > 0);

    for (let h = 0; h < maos.length; h++) {
      desenharMao(maos[h]);
      if (modoGravacao !== "capturando") continue;

      // MediaPipe reporta o lado já considerando a imagem espelhada
      const lado = results.multiHandedness?.[h]?.label || "Right";
      const probs = SignModel.probabilities(maos[h], lado);
      if (!probs) continue;

      if (!acumulado[lado]) {
        acumulado[lado] = { soma: new Array(probs.length).fill(0), quadros: 0 };
      }
      const acc = acumulado[lado];
      for (let i = 0; i < probs.length; i++) acc.soma[i] += probs[i];
      acc.quadros++;
    }

    ctx.restore();
    tickGravacao();
  }

  function desenharMao(lm) {
    if (typeof drawConnectors !== "undefined" && typeof HAND_CONNECTIONS !== "undefined") {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "#3a2be0", lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: "#ffffff", fillColor: "#3a2be0", lineWidth: 2, radius: 4 });
    } else {
      ctx.fillStyle = "#3a2be0";
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
      try {
        await hands.send({ image: video });
      } catch (e) {
        console.error("Erro no MediaPipe:", e);
      }
      processing = false;
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  // ── câmera ──────────────────────────────────────────────

  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setDiag($("diagDevices"), String(cams.length), cams.length ? "ok" : "fail");
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

  async function startCamera(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError("Navegador incompatível",
        "Este navegador não permite acesso à câmera. Use uma versão atual do Chrome, Edge ou Firefox.");
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
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      currentStream = stream;
      video.srcObject = stream;

      await listCameras();
      updatePermissionDiag("granted");

      showOverlay("none");
      stageBar.classList.remove("hidden");
      btnRecord.disabled = !SignModel.isReady();
      recordHint.textContent = SignModel.isReady()
        ? "Gravar sinal"
        : "Modelo não carregado — verifique js/modelo.json";

      loadingMsg.textContent = "Carregando detecção de mãos…";
      initHands();
      video.onloadeddata = renderLoop;
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
    modoGravacao = "parado";
    btnRecord.disabled = true;
    btnRecord.classList.remove("is-recording");
    cue.classList.add("hidden");
    setProgresso(0);
    ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleCameraError(err) {
    console.error("Erro de câmera:", err.name, err.message);
    const messages = {
      NotAllowedError: ["Acesso negado",
        "A permissão foi bloqueada. Clique no ícone de câmera na barra de endereço, libere o acesso e tente de novo."],
      PermissionDeniedError: ["Acesso negado",
        "A permissão de câmera foi negada. Ajuste nas configurações do navegador."],
      NotFoundError: ["Nenhuma câmera encontrada",
        "O acesso foi autorizado, mas não há webcam conectada. Conecte uma e tente de novo."],
      DevicesNotFoundError: ["Nenhuma câmera encontrada",
        "O acesso foi autorizado, mas não há webcam conectada."],
      NotReadableError: ["Câmera ocupada",
        "Outro aplicativo está usando a câmera. Feche-o e tente de novo."],
      TrackStartError: ["Câmera ocupada",
        "Não foi possível iniciar a câmera. Verifique se outro aplicativo a está usando."],
      OverconstrainedError: ["Configuração não suportada",
        "Esta câmera não aceita as configurações pedidas. Escolha outra."],
      SecurityError: ["Conexão insegura",
        "A câmera só funciona em HTTPS ou em localhost."],
    };
    const [title, msg] = messages[err.name] ||
      ["Não foi possível acessar a câmera",
       "Ocorreu um erro inesperado. Verifique as permissões e tente de novo."];

    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      updatePermissionDiag("denied");
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      updatePermissionDiag("granted");
      setDiag($("diagDevices"), "0", "fail");
    }
    showError(title, msg);
  }

  function showError(title, msg) {
    errorTitle.textContent = title;
    errorMsg.textContent = msg;
    stageBar.classList.add("hidden");
    showOverlay("error");
  }

  // ── diagnóstico ─────────────────────────────────────────

  function updatePermissionDiag(state) {
    const map = { granted: ["concedida", "ok"], denied: ["negada", "fail"], prompt: ["aguardando", null] };
    const [label, css] = map[state] || ["indeterminado", null];
    setDiag($("diagPermission"), label, css);
  }

  function runDiagnostics() {
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setDiag($("diagSupport"), hasMedia ? "suportado" : "não suportado", hasMedia ? "ok" : "fail");
    setDiag($("diagSecure"), window.isSecureContext ? "ok" : "atenção",
            window.isSecureContext ? "ok" : "fail");

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "camera" })
        .then((res) => {
          updatePermissionDiag(res.state);
          res.onchange = () => updatePermissionDiag(res.state);
        })
        .catch(() => setDiag($("diagPermission"), "indeterminado"));
    } else {
      setDiag($("diagPermission"), "indeterminado");
    }

    const mp = typeof Hands !== "undefined";
    setDiag($("diagMediapipe"), mp ? "carregado" : "indisponível", mp ? "ok" : "fail");
    return hasMedia;
  }

  // ── eventos ─────────────────────────────────────────────

  btnRequest.addEventListener("click", () => startCamera());
  btnRetry.addEventListener("click", () => startCamera());
  btnRecord.addEventListener("click", iniciarGravacao);
  cameraSelect.addEventListener("change", (e) => startCamera(e.target.value));
  window.addEventListener("beforeunload", stopCamera);

  btnStop.addEventListener("click", () => {
    stopCamera();
    stageBar.classList.add("hidden");
    showOverlay("idle");
  });

  btnClearLog.addEventListener("click", () => {
    historico = [];
    desenharHistorico();
  });

  if (seletorIdioma) {
    seletorIdioma.addEventListener("change", (e) => {
      historico = [];
      desenharHistorico();
      trocarIdioma(e.target.value);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      iniciarGravacao();
    }
  });

  // ── início ──────────────────────────────────────────────

  (function init() {
    const supported = runDiagnostics();
    if (!supported) {
      showError("Navegador incompatível",
        "Este navegador não permite acesso à câmera. Use uma versão atual do Chrome, Edge ou Firefox.");
      btnRequest.disabled = true;
    }
    listCameras();
    setProgresso(0);

    montarSeletorIdioma();
    trocarIdioma(Idiomas.PADRAO);
  })();
})();
