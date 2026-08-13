/**
 * SinaLibras — idiomas suportados.
 *
 * ESTE ARQUIVO TEM UM GEMEO: treino/idiomas.py
 * Os dois precisam listar exatamente as mesmas letras excluidas. Se
 * divergirem, o site vai mascarar letras diferentes das que o treino ignorou.
 *
 * "excluidas" sao as letras feitas com MOVIMENTO. Em Libras sao cinco;
 * em ASL, so J e Z.
 */

const Idiomas = (() => {
  "use strict";

  const MAPA = {
    libras: { nome: "Libras (Brasil)", excluidas: ["H", "J", "K", "X", "Z"] },
    asl: { nome: "ASL (Estados Unidos)", excluidas: ["J", "Z"] },
  };

  const PADRAO = "libras";
  const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const existe = (id) => Object.prototype.hasOwnProperty.call(MAPA, id);
  const lista = () => Object.keys(MAPA);
  const nome = (id) => (existe(id) ? MAPA[id].nome : id);
  const excluidas = (id) => (existe(id) ? MAPA[id].excluidas.slice() : []);

  function letras(id) {
    const fora = new Set(excluidas(id));
    return ALFABETO.filter((c) => !fora.has(c));
  }

  const caminhoModelo = (id) => `models/${id}/alfabeto.json`;

  return { MAPA, PADRAO, ALFABETO, existe, lista, nome, excluidas, letras, caminhoModelo };
})();

if (typeof module !== "undefined") module.exports = Idiomas;
