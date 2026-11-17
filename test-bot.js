/**
 * Testes do bot (public/bot.js).
 * ------------------------------
 *  - Em várias partidas (bot × bot, nos 3 níveis), TODO lance escolhido é
 *    legal segundo o motor chess-engine.js.
 *  - O bot acha mate em 1 nos níveis médio e difícil.
 *  - O difícil não entrega a dama de graça e respeita o limite de tempo.
 *  - Sem lances (mate/afogamento), o bot devolve null.
 * Execute: node test-bot.js
 */
'use strict';

const assert = require('assert');
const { Chess } = require('./chess-engine.js');
const Bot = require('./public/bot.js');

let falhas = 0;
function teste(nome, fn) {
  try {
    fn();
    console.log('  OK   ' + nome);
  } catch (e) {
    falhas += 1;
    console.log('  FALHOU ' + nome + '\n         ' + (e && e.message));
  }
}

/** Confere que o lance existe entre os legais da posição. */
function ehLegal(jogo, lance) {
  return jogo.lances().some((l) => l.from === lance.from && l.to === lance.to &&
    (!l.promotion || l.promotion.toLowerCase() === (lance.promotion || 'q')));
}

console.log('Bot');

teste('bot × bot: todos os lances são legais (fácil, médio e difícil)', () => {
  let total = 0;
  const confrontos = [['facil', 'facil'], ['medio', 'facil'], ['dificil', 'medio'], ['facil', 'dificil']];
  confrontos.forEach(([nivelW, nivelB], i) => {
    const jogo = new Chess();
    for (let ply = 0; ply < 70 && !jogo.jogoAcabou(); ply++) {
      const nivel = jogo.vez() === 'w' ? nivelW : nivelB;
      // Difícil com tempo curto para o teste não demorar.
      const r = Bot.escolherLance(jogo.fen(), nivel, { semente: 1000 * i + ply + 1, tempoMs: 250 });
      assert.ok(r.lance, 'o bot devolveu lance em ' + jogo.fen());
      assert.ok(ehLegal(jogo, r.lance), 'lance ilegal ' + JSON.stringify(r.lance) + ' em ' + jogo.fen());
      assert.ok(jogo.mover(r.lance), 'o motor aceitou o lance');
      total += 1;
    }
  });
  console.log('         (' + total + ' lances conferidos)');
});

teste('promoção, roque e en passant chegam no formato que o motor aceita', () => {
  const posicoes = [
    '8/P6k/8/8/8/8/7K/8 w - - 0 1',            // promoção
    'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',     // roques
    'k7/8/8/3pP3/8/8/8/7K w - d6 0 1',          // en passant
  ];
  for (const fen of posicoes) {
    for (const nivel of Bot.NIVEIS) {
      for (let s = 1; s <= 5; s++) {
        const jogo = new Chess(fen);
        const r = Bot.escolherLance(fen, nivel, { semente: s, tempoMs: 300 });
        assert.ok(ehLegal(jogo, r.lance), nivel + ' em ' + fen);
      }
    }
  }
});

teste('médio e difícil acham mate em 1', () => {
  const casos = [
    { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', mate: [0, 56] },                                  // Ta8#
    { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', mate: [39, 53] },  // Dxf7#
  ];
  for (const c of casos) {
    for (const nivel of ['medio', 'dificil']) {
      const r = Bot.escolherLance(c.fen, nivel, { semente: 7 });
      assert.deepStrictEqual([r.lance.from, r.lance.to], c.mate, nivel + ' não achou o mate em ' + c.fen);
    }
  }
});

teste('difícil não deixa a dama pendurada e captura a peça solta', () => {
  // A dama branca em d4 está atacada pelo peão de e5 (pretas jogam): o bot captura.
  const r = Bot.escolherLance('rnb1kbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR b KQkq - 0 3', 'dificil', { tempoMs: 800 });
  assert.deepStrictEqual([r.lance.from, r.lance.to], [36, 27], 'esperava exd4, veio ' + JSON.stringify(r.lance));
});

teste('difícil responde dentro do limite (≤ 2 s) e chega à profundidade 3 ou 4', () => {
  const fen = 'r2q1rk1/1b2bppp/p2ppn2/1p6/3NP3/1BN1B3/PPP2PPP/R2Q1RK1 w - - 0 12';
  const r = Bot.escolherLance(fen, 'dificil', { tempoMs: 1800 });
  assert.ok(r.ms <= 2000, 'demorou ' + r.ms + ' ms');
  assert.ok(r.profundidade >= 3, 'profundidade ' + r.profundidade);
  console.log('         (' + r.ms + ' ms, profundidade ' + r.profundidade + ', ' + r.nos + ' nós)');
});

teste('sem lances legais (mate ou afogamento) o bot devolve null', () => {
  assert.strictEqual(Bot.escolherLance('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'dificil').lance, null); // afogamento
  assert.strictEqual(Bot.escolherLance('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', 'medio').lance, null);   // mate
});

console.log('\n----------------------------------------');
if (falhas) {
  console.log(falhas + ' teste(s) do bot falharam.');
  process.exit(1);
}
console.log('Todos os testes do bot passaram.');
