/**
 * Testes de perft (contagem de lances legais) para validar o motor.
 * Execute: node test-perft.js
 *
 * Valores conhecidos: https://www.chessprogramming.org/Perft_Results
 */
'use strict';

const { Chess } = require('./chess-engine.js');

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Posição "Kiwipete" — exercita roques, en passant e promoções laterais.
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

// Posição 3 do wiki — peões, xeque e en passant tático.
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';

// Posição 4 — promoções e xeques pesados.
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';

const casos = [
  { nome: 'Posição inicial', fen: START, esperados: { 1: 20, 2: 400, 3: 8902, 4: 197281 } },
  { nome: 'Kiwipete', fen: KIWIPETE, esperados: { 1: 48, 2: 2039, 3: 97862 } },
  { nome: 'Posição 3', fen: POS3, esperados: { 1: 14, 2: 191, 3: 2812, 4: 43238 } },
  { nome: 'Posição 4', fen: POS4, esperados: { 1: 6, 2: 264, 3: 9467 } },
];

let falhas = 0;
const inicio = Date.now();

for (const caso of casos) {
  const jogo = new Chess(caso.fen);
  console.log('\n== ' + caso.nome + ' ==');
  console.log(caso.fen);
  for (const [dStr, esperado] of Object.entries(caso.esperados)) {
    const d = Number(dStr);
    const t0 = Date.now();
    const obtido = jogo.perft(d);
    const ms = Date.now() - t0;
    const ok = obtido === esperado;
    if (!ok) falhas += 1;
    console.log(
      '  depth ' + d + ': ' + obtido + ' ' +
      (ok ? 'OK' : 'FALHOU (esperado ' + esperado + ')') +
      '  (' + ms + ' ms)'
    );
  }
}

console.log('\n----------------------------------------');
console.log(falhas === 0 ? 'Todos os testes passaram.' : falhas + ' teste(s) falharam.');
console.log('Tempo total: ' + (Date.now() - inicio) + ' ms');
process.exit(falhas === 0 ? 0 : 1);
