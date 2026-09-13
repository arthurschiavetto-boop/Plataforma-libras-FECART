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
  // Limiares de aceitação da leitura. Foram afrouxados depois dos testes com
  // o grupo: letras como G (ASL) e O (SIBI) ficavam "sem leitura" porque
  // passavam raspando. Numa demonstração, mostrar a melhor aposta com uma
  // ressalva é mais útil que recusar a responder — a recusa total fica só
  // para quando o modelo realmente não tem opinião.
  const CONF_MIN = 0.35;      // abaixo disso a leitura é declarada incerta
  const MARGEM_MIN = 0.05;    // distância mínima entre 1º e 2º lugar
  const CONF_FRACA = 0.60;    // entre CONF_MIN e isto, mostra mas avisa
  const QUADROS_MIN = 8;      // amostras mínimas para aceitar a gravação

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
  const langPills = $("langPills");

  const modalAlfabeto = $("modalAlfabeto");
  const btnAlfabeto = $("btnAlfabeto");
  const btnFecharAlfabeto = $("btnFecharAlfabeto");
  const btnFecharLetra = $("btnFecharLetra");
  const btnVoltarGrade = $("btnVoltarGrade");
  const btnPraticarLetra = $("btnPraticarLetra");
  const viewGrade = $("viewGrade");
  const viewLetra = $("viewLetra");
  const viewQuadro = $("viewQuadro");
  const btnQuadroCompleto = $("btnQuadroCompleto");
  const btnVoltarDoQuadro = $("btnVoltarDoQuadro");
  const btnFecharQuadro = $("btnFecharQuadro");
  let letraAberta = null;
  const alvoChip = $("alvoChip");
  const alvoLetra = $("alvoLetra");
  const btnLimparAlvo = $("btnLimparAlvo");

  // letra que o usuário escolheu praticar no alfabeto (null = nenhuma)
  let alvo = null;

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

  /**
   * Nível 1 do alfabeto: a grade. TODAS as letras são clicáveis, inclusive
   * as feitas com movimento — elas continuam fazendo parte do alfabeto e
   * mostrar como são é conteúdo útil, mesmo que o modelo não as reconheça.
   * A diferença é que só as estáticas podem virar alvo de prática.
   */
  function montarGradeLetras() {
    const grid = $("letterGrid");
    if (!grid || !SignModel.isReady()) return;
    const idioma = SignModel.idioma();
    const validas = new Set(SignModel.labels());
    const todas = Idiomas.letras(idioma) || SignModel.labels();

    grid.innerHTML = "";
    todas.forEach((letra, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = letra;
      btn.className = validas.has(letra) ? "" : "off";
      btn.classList.toggle("ativa", alvo === letra);
      // entrada em cascata: as letras aparecem em sequência, não de uma vez
      btn.style.setProperty("--atraso", `${Math.min(i * 16, 420)}ms`);
      btn.onclick = () => abrirLetra(letra);
      grid.appendChild(btn);
    });

    const modalTitulo = $("modalTitulo");
    if (modalTitulo) modalTitulo.textContent = `Alfabeto em ${Idiomas.nome(idioma)}`;

    const texto = $("scopeText");
    if (texto) {
      const fora = SignModel.excluded();
      let html = `A câmera reconhece <strong>${validas.size} letras</strong> ` +
                 `deste alfabeto.`;
      if (fora.length) {
        const plural = fora.length > 1;
        html += ` <strong>${fora.join(", ")}</strong> ${plural ? "aparecem" : "aparece"} ` +
                `só como referência: ${plural ? "são feitas" : "é feita"} com movimento, ` +
                `e um movimento não cabe numa pose só.`;
      }
      texto.innerHTML = html;
    }
  }

  /** Nível 2: a letra escolhida, com a imagem de como fazer o sinal. */
  function abrirLetra(letra) {
    const idioma = SignModel.idioma();
    const reconhecida = SignModel.labels().includes(letra);
    letraAberta = letra;

    $("letraGrande").textContent = letra;
    $("letraIdioma").textContent = `${Idiomas.nome(idioma)} · ${Idiomas.pais(idioma)}`;

    $("letraNota").textContent = reconhecida
      ? "A câmera reconhece esta letra. Faça o sinal e grave para testar."
      : "Esta letra é feita com movimento, então a câmera não consegue " +
        "reconhecê-la a partir de uma pose só.";

    btnPraticarLetra.classList.toggle("hidden", !reconhecida);

    montarFigura(idioma, letra);

    viewGrade.classList.add("hidden");
    viewLetra.classList.remove("hidden");
    viewLetra.classList.remove("entrando");
    void viewLetra.offsetWidth;   // reinicia a animação
    viewLetra.classList.add("entrando");
    btnVoltarGrade.focus();
  }

  /**
   * Carrega img/alfabeto/<idioma>/<LETRA>.png. Se o arquivo ainda não
   * existir, mostra um espaço reservado explicando o que falta — o site
   * funciona igual, só sem a ilustração daquela letra.
   */
  function montarFigura(idioma, letra) {
    const figura = $("letraFigura");
    figura.innerHTML = "";
    figura.classList.add("carregando");

    const img = new Image();
    img.alt = `Como fazer a letra ${letra} em ${Idiomas.nome(idioma)}`;

    img.onload = () => {
      figura.classList.remove("carregando");
      figura.innerHTML = "";
      figura.appendChild(img);
    };

    img.onerror = () => {
      figura.classList.remove("carregando");
      figura.innerHTML =
        `<div class="figura-vazia">` +
        `<span>${letra}</span>` +
        `<p>Imagem ainda não adicionada</p>` +
        `<code>img/alfabeto/${idioma}/${letra}.png</code>` +
        `</div>`;
    };

    img.src = Idiomas.caminhoImagem(idioma, letra);
  }

  /** Tela extra: o pôster com o alfabeto inteiro numa imagem só, em vez de
   * letra por letra. Mesma lógica de carregamento/espaço reservado da
   * figura de uma letra, só que uma imagem por idioma inteiro. */
  function abrirQuadroCompleto() {
    const idioma = SignModel.idioma();
    $("quadroLegenda").innerHTML =
      `Alfabeto completo de <strong>${Idiomas.nome(idioma)}</strong> — ${Idiomas.pais(idioma)}.`;

    const figura = $("quadroFigura");
    figura.innerHTML = "";
    figura.classList.add("carregando");

    const img = new Image();
    img.alt = `Alfabeto completo de ${Idiomas.nome(idioma)}`;
    img.onload = () => {
      figura.classList.remove("carregando");
      figura.innerHTML = "";
      figura.appendChild(img);
    };
    img.onerror = () => {
      figura.classList.remove("carregando");
      figura.innerHTML =
        `<div class="figura-vazia">` +
        `<span>${Idiomas.nome(idioma)}</span>` +
        `<p>Imagem do quadro completo ainda não adicionada</p>` +
        `<code>img/alfabeto/${idioma}/completo.png</code>` +
        `</div>`;
    };
    img.src = Idiomas.caminhoImagemCompleta(idioma);

    viewGrade.classList.add("hidden");
    viewQuadro.classList.remove("hidden");
    viewQuadro.classList.remove("entrando");
    void viewQuadro.offsetWidth;
    viewQuadro.classList.add("entrando");
    btnVoltarDoQuadro.focus();
  }

  function voltarDoQuadro() {
    viewQuadro.classList.add("hidden");
    viewGrade.classList.remove("hidden");
    btnQuadroCompleto.focus();
  }

  function voltarParaGrade() {
    viewLetra.classList.add("hidden");
    viewGrade.classList.remove("hidden");
    letraAberta = null;
    btnFecharAlfabeto.focus();
  }

  function definirAlvo(letra) {
    alvo = letra;
    if (alvo) {
      alvoLetra.textContent = alvo;
      alvoChip.classList.remove("hidden");
      fecharAlfabeto();
    } else {
      alvoChip.classList.add("hidden");
    }
    montarGradeLetras();
  }

  function abrirAlfabeto() {
    if (!SignModel.isReady()) return;
    montarGradeLetras();
    viewLetra.classList.add("hidden");
    viewQuadro.classList.add("hidden");
    viewGrade.classList.remove("hidden");
    letraAberta = null;
    modalAlfabeto.classList.remove("hidden");
    btnFecharAlfabeto.focus();
  }

  function fecharAlfabeto() {
    modalAlfabeto.classList.add("hidden");
  }

  /** Pinta a interface com as cores da bandeira do país que fala a língua. */
  function aplicarTema(id) {
    const [cor, cor2] = Idiomas.cores(id);
    const raiz = document.documentElement.style;
    raiz.setProperty("--accent", cor);
    raiz.setProperty("--accent2", cor2);
    raiz.setProperty("--accent-wash", misturarComBranco(cor, 0.93));
  }

  /** Versão bem clara da cor, para usar como fundo de bloco. */
  function misturarComBranco(hex, quantoBranco) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (canal) => Math.round(canal + (255 - canal) * quantoBranco);
    const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // ── efeitos visuais ─────────────────────────────────────

  const semMovimento = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Onda a partir do ponto exato onde a pessoa clicou. */
  function ondaDeClique(e) {
    const btn = e.currentTarget;
    if (semMovimento()) return;
    const r = btn.getBoundingClientRect();
    const tamanho = Math.max(r.width, r.height);
    const onda = document.createElement("span");
    onda.className = "onda";
    onda.style.width = onda.style.height = `${tamanho}px`;
    onda.style.left = `${e.clientX - r.left - tamanho / 2}px`;
    onda.style.top = `${e.clientY - r.top - tamanho / 2}px`;
    btn.appendChild(onda);
    setTimeout(() => onda.remove(), 620);
  }

  /** Faíscas de acerto — só quando a letra praticada é a certa. */
  function estourarFaiscas() {
    if (semMovimento()) return;
    const caixa = $("resultLetter");
    if (!caixa) return;
    const r = caixa.getBoundingClientRect();
    const pai = caixa.closest(".readout");
    const rp = pai.getBoundingClientRect();
    const x = r.left - rp.left + r.width * 0.3;
    const y = r.top - rp.top + r.height * 0.5;

    for (let i = 0; i < 18; i++) {
      const f = document.createElement("i");
      f.className = "faisca";
      const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
      const dist = 60 + Math.random() * 80;
      f.style.left = `${x}px`;
      f.style.top = `${y}px`;
      f.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
      f.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
      f.style.animationDelay = `${Math.random() * 90}ms`;
      pai.appendChild(f);
      setTimeout(() => f.remove(), 900);
    }
  }

  /** Clarão no painel quando uma letra é reconhecida. */
  function clarao() {
    if (semMovimento()) return;
    const painel = document.querySelector(".readout");
    if (!painel) return;
    painel.classList.remove("clarao");
    void painel.offsetWidth;
    painel.classList.add("clarao");
    setTimeout(() => painel.classList.remove("clarao"), 640);
  }

  /** Números da faixa de dados contam até o valor, em vez de só aparecer. */
  function contarAte(el, alvoTexto) {
    if (!el) return;
    const numero = parseFloat(String(alvoTexto).replace(",", "."));
    if (semMovimento() || Number.isNaN(numero)) {
      el.textContent = alvoTexto;
      return;
    }
    const temPercent = String(alvoTexto).includes("%");
    const casas = String(alvoTexto).includes(",") ? 1 : 0;
    const inicio = performance.now();
    const duracao = 700;

    (function passo(agora) {
      const p = Math.min((agora - inicio) / duracao, 1);
      const suave = 1 - Math.pow(1 - p, 3);
      const v = (numero * suave).toFixed(casas).replace(".", ",");
      el.textContent = temPercent ? `${v}%` : v;
      if (p < 1) requestAnimationFrame(passo);
      else el.textContent = alvoTexto;
    })(inicio);
  }

  /** O quadro da câmera inclina de leve seguindo o mouse. */
  function ligarInclinacao() {
    const frame = $("frame");
    if (!frame || semMovimento()) return;
    frame.addEventListener("mousemove", (e) => {
      const r = frame.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      frame.style.transform =
        `perspective(1100px) rotateY(${px * 3.2}deg) rotateX(${-py * 3.2}deg)`;
    });
    frame.addEventListener("mouseleave", () => { frame.style.transform = ""; });
  }

  function montarPilulas() {
    if (!langPills) return;
    langPills.innerHTML = "";
    for (const id of Idiomas.lista()) {
      const [cor, cor2] = Idiomas.cores(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lang-pill";
      btn.dataset.idioma = id;
      btn.style.setProperty("--pill-cor", cor);
      btn.style.setProperty("--pill-cor2", cor2);
      btn.setAttribute("aria-pressed", String(id === Idiomas.PADRAO));
      btn.innerHTML =
        `<span class="pill-chip" aria-hidden="true"></span>` +
        `<span class="pill-nome">${Idiomas.nome(id)}</span>` +
        `<span class="pill-pais">${Idiomas.pais(id)}</span>`;
      btn.onclick = () => {
        if (btn.getAttribute("aria-pressed") === "true") return;
        btn.classList.remove("escolhida");
        void btn.offsetWidth;
        btn.classList.add("escolhida");
        setTimeout(() => btn.classList.remove("escolhida"), 640);
        trocarIdioma(id);
      };
      langPills.appendChild(btn);
    }
  }

  function marcarPilulaAtiva(id) {
    for (const b of langPills.querySelectorAll(".lang-pill")) {
      b.setAttribute("aria-pressed", String(b.dataset.idioma === id));
    }
  }

  /** Troca o idioma: repinta a interface, recarrega o modelo e zera a
   * leitura e o alvo anteriores (letras não valem entre alfabetos). */
  async function trocarIdioma(id) {
    modoGravacao = "parado";
    btnRecord.classList.remove("is-recording");
    btnRecord.disabled = true;
    cue.classList.add("hidden");
    setProgresso(0);
    ranking.classList.add("hidden");
    resultLetter.className = "glyph";
    resultLetter.textContent = "—";
    resultVerdict.textContent = `Carregando ${Idiomas.nome(id)}…`;

    aplicarTema(id);
    marcarPilulaAtiva(id);
    definirAlvo(null);
    historico = [];
    desenharHistorico();

    contarAte($("statIdiomas"), String(Idiomas.lista().length));
    contarAte($("statAcuracia"), Idiomas.acuracia(id) || "—");

    const sub = $("heroSub");
    if (sub) {
      sub.textContent =
        `A câmera lê os pontos da sua mão e o modelo diz qual letra do ` +
        `alfabeto manual de ${Idiomas.pais(id)} você formou.`;
    }

    const ok = await SignModel.load(id);
    setDiag($("diagModel"),
      ok ? `${SignModel.labels().length} letras, features ${SignModel.featureVersion()}` : "não carregado",
      ok ? "ok" : "fail");
    montarGradeLetras();

    if (btnAlfabeto) btnAlfabeto.disabled = !ok;

    contarAte($("statLetras"), ok ? String(SignModel.labels().length) : "—");

    if (ok) {
      resultVerdict.textContent = "Nenhuma gravação ainda.";
      btnRecord.disabled = !currentStream;
      recordHint.textContent = currentStream ? "Gravar sinal" : "Ligue a câmera para gravar";
    } else {
      resultVerdict.textContent =
        `O modelo de ${Idiomas.nome(id)} ainda não foi treinado. ` +
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
        document.body.classList.add("gravando");
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
    document.body.classList.remove("gravando");
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

    const lida = principal.ordem[0].letra;
    const confianca = (principal.ordem[0].p * 100).toFixed(0);
    const fraca = principal.ordem[0].p < CONF_FRACA || principal.margem < 0.12;

    resultLetter.className = "glyph entrando";
    resultLetter.textContent = lida;

    const maoTxt = leituras.length > 1
      ? `pela mão ${NOME_MAO[principal.lado] || principal.lado}`
      : `pela média de ${principal.quadros} quadros`;

    clarao();

    if (alvo) {
      // com uma letra escolhida para praticar, o retorno é acertou ou não
      const acertou = lida === alvo;
      resultLetter.classList.add(acertou ? "acerto" : "erro");
      if (acertou) estourarFaiscas();
      resultVerdict.textContent = acertou
        ? `É o ${alvo}. ${confianca}% de confiança ${maoTxt}.`
        : `Você fez ${lida}, o alvo era ${alvo}. Tente de novo.`;
    } else if (fraca) {
      // passou do piso, mas por pouco: mostra a aposta e avisa que é incerta
      resultLetter.classList.add("duvida");
      resultVerdict.textContent =
        `Provavelmente ${lida}, mas com pouca certeza (${confianca}%). ` +
        `${principal.ordem[1].letra} ficou perto.`;
    } else {
      resultVerdict.textContent = `${confianca}% de confiança ${maoTxt}.`;
    }

    registrarNoHistorico(lida, principal.ordem[0].p);
  }

  function mostrarIncerto(motivo) {
    resultLetter.className = "glyph uncertain";
    resultLetter.textContent = "sem leitura";
    resultVerdict.textContent = motivo;
  }

  function mostrarRanking(top, leituras) {
    ranking.classList.remove("hidden");
    ranking.innerHTML = "";

    if (leituras && leituras.length > 1) {
      const nota = document.createElement("p");
      nota.className = "hands-note";
      nota.textContent = "Duas mãos no quadro: " + leituras
        .map((l) => `a ${NOME_MAO[l.lado] || l.lado} leu ${l.ordem[0].letra} ` +
                    `(${(l.ordem[0].p * 100).toFixed(0)}%)`)
        .join(", ") + ".";
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
    // turquesa (#40E0D0): a mesma cor da comunidade surda que estrutura a
    // interface inteira — o esqueleto da mão é o elemento mais visível do
    // projeto, então é onde ela mais aparece
    const TURQ = "#40e0d0";
    if (typeof drawConnectors !== "undefined" && typeof HAND_CONNECTIONS !== "undefined") {
      drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: TURQ, lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: "#ffffff", fillColor: TURQ, lineWidth: 1.5, radius: 4 });
    } else {
      ctx.fillStyle = TURQ;
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
      document.body.classList.add("camera-on");
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
    document.body.classList.remove("camera-on");
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

  btnAlfabeto.addEventListener("click", abrirAlfabeto);
  btnFecharAlfabeto.addEventListener("click", fecharAlfabeto);
  btnFecharLetra.addEventListener("click", fecharAlfabeto);
  btnVoltarGrade.addEventListener("click", voltarParaGrade);
  btnQuadroCompleto.addEventListener("click", abrirQuadroCompleto);
  btnVoltarDoQuadro.addEventListener("click", voltarDoQuadro);
  btnFecharQuadro.addEventListener("click", fecharAlfabeto);
  btnLimparAlvo.addEventListener("click", () => definirAlvo(null));

  btnPraticarLetra.addEventListener("click", () => {
    if (letraAberta) definirAlvo(letraAberta);
  });

  // clicar no fundo escuro fecha o alfabeto
  modalAlfabeto.addEventListener("click", (e) => {
    if (e.target === modalAlfabeto) fecharAlfabeto();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalAlfabeto.classList.contains("hidden")) {
      // dentro de uma letra ou do quadro completo, Esc volta para a grade
      // em vez de fechar tudo
      if (!viewLetra.classList.contains("hidden")) voltarParaGrade();
      else if (!viewQuadro.classList.contains("hidden")) voltarDoQuadro();
      else fecharAlfabeto();
      return;
    }
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

    montarPilulas();
    ligarInclinacao();
    for (const b of document.querySelectorAll(".btn")) {
      b.addEventListener("click", ondaDeClique);
    }
    trocarIdioma(Idiomas.PADRAO);
  })();
})();
