/**
 * SinaLibras — idiomas suportados.
 *
 * ESTE ARQUIVO TEM UM GEMEO: treino/idiomas.py
 * Os dois precisam listar exatamente os mesmos campos por idioma. Se
 * divergirem, o site vai mascarar letras diferentes das que o treino ignorou.
 *
 * "cor" e "cor2" vêm da bandeira do país que fala a língua — são elas que
 * pintam a interface quando o idioma é trocado.
 *
 * "alfabeto" é a lista completa de classes do idioma, ou null quando ainda
 * não sabemos como as pastas do dataset são nomeadas — nesse modo o
 * seletor de coleta pela webcam esconde o idioma, e o site mostra as
 * classes que o próprio modelo trouxer.
 */

const Idiomas = (() => {
  "use strict";

  const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const ES = ["A","B","C","D","E","F","G","H","CH","I","J","K","L","LL","M","N","Ñ",
              "O","P","Q","R","RR","S","T","U","V","W","X","Y","Z"];

  const MAPA = {
    libras: {
      nome: "Libras", pais: "Brasil",
      cor: "#00694A", cor2: "#F2C200",
      alfabeto: AZ, excluidas: ["H", "J", "K", "X", "Z"],
    },
    asl: {
      nome: "ASL", pais: "Estados Unidos",
      cor: "#1B3A6B", cor2: "#C1272D",
      alfabeto: AZ, excluidas: ["J", "Z"],
    },
    spanish: {
      nome: "LSE", pais: "Espanha",
      cor: "#AA151B", cor2: "#F1BF00",
      // null até confirmarmos como as pastas do dataset nomeiam CH/LL/RR/Ñ
      alfabeto: null,
      // RR e Ñ: mesma configuração de mão que R e N, só o movimento
      // diferencia. As demais (H, CH, J, LL, V, W, X, Y, Z) também exigem
      // movimento, segundo pesquisa sobre quais sinais são estáticos de
      // verdade. Sobram 19 estáticas: A B C D E F G I K L M N O P Q R S T U.
      excluidas: ["H", "CH", "J", "LL", "Ñ", "RR", "V", "W", "X", "Y", "Z"],
    },
    sibi: {
      nome: "SIBI", pais: "Indonésia",
      cor: "#CE1126", cor2: "#FFFFFF",
      // Alfabeto A-Z padrão, uma mão só (o SIBI foi historicamente adaptado
      // a partir do alfabeto manual americano). Confirmado no quadro do
      // próprio dataset: J tem gancho e Z tem o traço em zigue-zague no ar
      // — mesmas duas dinâmicas do ASL.
      alfabeto: AZ, excluidas: ["J", "Z"],
    },
  };

  const PADRAO = "libras";
  const ALFABETO = AZ;   // mantido por compatibilidade com quem já usava isso

  const existe = (id) => Object.prototype.hasOwnProperty.call(MAPA, id);
  const lista = () => Object.keys(MAPA);
  const nome = (id) => (existe(id) ? MAPA[id].nome : id);
  const pais = (id) => (existe(id) ? MAPA[id].pais : "");
  const cores = (id) => (existe(id) ? [MAPA[id].cor, MAPA[id].cor2] : ["#5C5C6B", "#92929F"]);
  const excluidas = (id) => (existe(id) ? MAPA[id].excluidas.slice() : []);

  /** Classes do idioma, ou null se o alfabeto não é conhecido de antemão. */
  function letras(id) {
    const alfabeto = existe(id) ? MAPA[id].alfabeto : null;
    if (!alfabeto) return null;
    const fora = new Set(excluidas(id));
    return alfabeto.filter((c) => !fora.has(c));
  }

  /** Só os idiomas com alfabeto conhecido — os que fazem sentido coletar
   * pela webcam em treinar.html (ela monta um botão por letra). */
  const listaColetavel = () => lista().filter((id) => letras(id) !== null);

  const caminhoModelo = (id) => `models/${id}/alfabeto.json`;

  return {
    MAPA, PADRAO, ALFABETO, existe, lista, listaColetavel,
    nome, pais, cores, excluidas, letras, caminhoModelo,
  };
})();

if (typeof module !== "undefined") module.exports = Idiomas;
