/**
 * SinaLingua — tour de boas-vindas
 *
 * Apresentação guiada que aparece na primeira visita.
 *
 * A ideia central: existe UM único foco de luz — um retângulo transparente
 * cercado por uma sombra gigante, que é o que escurece o resto da tela. Ele
 * não pisca de um elemento para outro: as suas medidas são animadas, então
 * a luz DESLIZA pela página, como uma câmera acompanhando o assunto.
 *
 * Isso também evita um problema clássico: elevar o elemento destacado acima
 * da cortina não funciona quando ele está dentro de um cabeçalho fixo
 * (position: sticky cria uma camada própria, que nenhum z-index de filho
 * atravessa). Como aqui o destaque é um buraco na cortina, e não uma
 * camada por cima, qualquer elemento da página pode ser iluminado.
 */

const Tour = (() => {
  "use strict";

  const CHAVE = "sinalingua.tour.visto";
  const FOLGA = 12;          // respiro entre a luz e a borda do elemento
  const DURACAO = 620;       // igual à transição do CSS, para sincronizar

  const PASSOS = [
    {
      titulo: "SinaLingua",
      texto: "Sua mão vira letra em quatro línguas de sinais diferentes.",
      abertura: true,
      botao: "Começar",
    },
    {
      alvo: "langPills",
      titulo: "Escolha a língua",
      texto: "Cada país tem seu próprio alfabeto manual e seu próprio modelo " +
             "treinado. Toque para trocar — a página inteira muda de cor junto.",
    },
    {
      alvo: "btnAlfabeto",
      titulo: "Veja as letras",
      texto: "Abre o alfabeto da língua escolhida. Toque numa letra para ver a " +
             "foto de como fazer o sinal, ou veja o quadro completo de uma vez.",
    },
    {
      alvo: "btnRequest",
      titulo: "Agora é com você",
      texto: "Ligue a câmera, faça um sinal e grave. O vídeo é processado no " +
             "seu próprio aparelho — nenhuma imagem sai daqui.",
      botao: "Entendi",
    },
    {
      // último passo: a luz se abre até cobrir a tela, devolvendo o site
      abrirTudo: true,
    },
  ];

  let indice = 0;
  let el = null;   // elementos do tour, criados uma vez só

  const $ = (id) => document.getElementById(id);
  const semMovimento = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function jaViu() {
    try {
      return localStorage.getItem(CHAVE) === "1";
    } catch (e) {
      return false;   // navegador sem localStorage: mostra o tour, sem quebrar
    }
  }

  function marcarVisto() {
    try {
      localStorage.setItem(CHAVE, "1");
    } catch (e) {
      /* sem localStorage o tour reaparece na próxima visita — só isso */
    }
  }

  function montar() {
    const raiz = document.createElement("div");
    raiz.id = "tour";
    raiz.className = "tour hidden";
    raiz.innerHTML = `
      <div class="tour-luz" id="tourLuz"></div>

      <div class="tour-cartao" id="tourCartao" role="dialog" aria-modal="true"
           aria-labelledby="tourTitulo">
        <div class="tour-passos" id="tourPassos"></div>
        <h2 class="tour-titulo" id="tourTitulo"></h2>
        <p class="tour-texto" id="tourTexto"></p>
        <div class="tour-acoes">
          <button class="btn btn-outline btn-sm hidden" id="tourVoltar">Voltar</button>
          <button class="btn btn-primary btn-sm" id="tourProximo">Começar</button>
        </div>
      </div>

      <button class="tour-pular" id="tourPular">Pular tutorial <span aria-hidden="true">›››</span></button>`;
    document.body.appendChild(raiz);

    el = {
      raiz,
      luz: $("tourLuz"),
      cartao: $("tourCartao"),
      titulo: $("tourTitulo"),
      texto: $("tourTexto"),
      passos: $("tourPassos"),
      pular: $("tourPular"),
      voltar: $("tourVoltar"),
      proximo: $("tourProximo"),
    };

    el.pular.onclick = encerrar;
    el.voltar.onclick = () => irPara(indice - 1);
    el.proximo.onclick = () => irPara(indice + 1);

    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, { passive: true });
  }

  function aoTeclar(e) {
    if (!el || el.raiz.classList.contains("hidden")) return;
    if (e.key === "Escape") return encerrar();
    if (e.key === "ArrowRight" || e.key === "Enter") irPara(indice + 1);
    if (e.key === "ArrowLeft") irPara(indice - 1);
  }

  /** Mede o alvo do passo atual e devolve onde a luz deve ficar. */
  function medirAlvo(passo) {
    const centro = {
      top: window.innerHeight / 2,
      left: window.innerWidth / 2,
      width: 0,
      height: 0,
      raio: 999,
    };

    // passo final: a luz cresce até engolir a tela, revelando o site
    if (passo.abrirTudo) {
      const d = Math.max(window.innerWidth, window.innerHeight) * 1.6;
      return {
        top: window.innerHeight / 2 - d / 2,
        left: window.innerWidth / 2 - d / 2,
        width: d,
        height: d,
        raio: d,
      };
    }

    // abertura: sem alvo, a tela fica toda escura
    if (!passo.alvo) return centro;

    const alvo = $(passo.alvo);
    if (!alvo) return centro;

    const r = alvo.getBoundingClientRect();
    return {
      top: r.top - FOLGA,
      left: r.left - FOLGA,
      width: r.width + FOLGA * 2,
      height: r.height + FOLGA * 2,
      raio: 999,
    };
  }

  /** Coloca o cartão perto da luz, sempre dentro da tela. */
  function posicionarCartao(luz, passo) {
    const c = el.cartao;

    if (passo.abertura || passo.abrirTudo || !passo.alvo) {
      c.classList.add("tour-cartao-centro");
      c.style.top = "";
      c.style.left = "";
      return;
    }

    c.classList.remove("tour-cartao-centro");
    const cr = c.getBoundingClientRect();
    const margem = 20;

    // abaixo do alvo quando couber; acima quando não couber
    let top = luz.top + luz.height + margem;
    if (top + cr.height > window.innerHeight - 16) {
      top = Math.max(16, luz.top - cr.height - margem);
    }

    // centralizado no alvo, mas preso dentro da janela
    let left = luz.left + luz.width / 2 - cr.width / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - cr.width - 16));

    c.style.top = `${top}px`;
    c.style.left = `${left}px`;
  }

  function posicionar() {
    if (!el || el.raiz.classList.contains("hidden")) return;
    const passo = PASSOS[indice];
    const luz = medirAlvo(passo);

    el.luz.style.top = `${luz.top}px`;
    el.luz.style.left = `${luz.left}px`;
    el.luz.style.width = `${luz.width}px`;
    el.luz.style.height = `${luz.height}px`;
    el.luz.style.borderRadius = `${luz.raio}px`;

    posicionarCartao(luz, passo);
  }

  function irPara(novo) {
    // passou do último: encerra
    if (novo >= PASSOS.length) return encerrar();
    indice = Math.max(0, novo);
    const passo = PASSOS[indice];

    // o passo final não tem cartão: é só a luz se abrindo
    if (passo.abrirTudo) {
      el.cartao.classList.add("hidden");
      el.pular.classList.add("hidden");
      posicionar();
      setTimeout(encerrar, semMovimento() ? 0 : DURACAO);
      return;
    }

    el.cartao.classList.remove("hidden");
    el.titulo.textContent = passo.titulo;
    el.texto.textContent = passo.texto;
    el.proximo.textContent = passo.botao || "Próximo";
    el.voltar.classList.toggle("hidden", indice === 0);
    el.cartao.classList.toggle("tour-cartao-abertura", !!passo.abertura);

    el.passos.innerHTML = PASSOS
      .filter((p) => !p.abrirTudo)
      .map((_, i) => `<i class="${i === indice ? "atual" : ""}"></i>`)
      .join("");

    // se o alvo estiver fora da tela, rola até ele ANTES de medir
    const alvo = passo.alvo ? $(passo.alvo) : null;
    if (alvo) {
      const r = alvo.getBoundingClientRect();
      const fora = r.top < 80 || r.bottom > window.innerHeight - 80;
      if (fora) {
        alvo.scrollIntoView({
          behavior: semMovimento() ? "auto" : "smooth",
          block: "center",
        });
        // espera a rolagem terminar para medir a posição final
        setTimeout(posicionar, semMovimento() ? 0 : 420);
        return;
      }
    }

    posicionar();
  }

  function encerrar() {
    if (!el) return;
    el.raiz.classList.add("hidden");
    el.cartao.classList.remove("hidden");
    el.pular.classList.remove("hidden");
    document.body.classList.remove("tour-ativo");
    marcarVisto();
  }

  function comecar() {
    if (!el) montar();
    document.body.classList.add("tour-ativo");
    el.raiz.classList.remove("hidden");
    indice = 0;
    // coloca a luz já no lugar antes de mostrar, para não animar do canto
    posicionar();
    irPara(0);
  }

  function comecarSePrimeiraVez() {
    if (jaViu()) return;
    setTimeout(comecar, 500);   // deixa a interface montar antes de medir
  }

  return { comecar, comecarSePrimeiraVez };
})();
