/**
 * Web Worker do bot.
 * ------------------
 * Roda numa thread separada do navegador: o tabuleiro e os botões continuam
 * respondendo enquanto o bot pensa. Recebe { id, fen, nivel } e devolve
 * { id, lance, nos, profundidade, ms } (ou { id, erro }).
 */
/* global importScripts, BotXadrez */
'use strict';

importScripts('chess-engine.js', 'bot.js');

self.onmessage = function (evento) {
  const pedido = evento.data || {};
  try {
    const r = BotXadrez.escolherLance(pedido.fen, pedido.nivel, { tempoMs: pedido.tempoMs || 1800 });
    self.postMessage(Object.assign({ id: pedido.id }, r));
  } catch (e) {
    self.postMessage({ id: pedido.id, erro: String((e && e.message) || e) });
  }
};
