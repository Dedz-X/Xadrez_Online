/**
 * Testes do pré-lance e das marcações (v1.3.0)
 * ------------------------------------------------------------------------
 * Usa os mesmos módulos do navegador (public/prelance.js e
 * public/marcacoes.js) com o motor clássico e o do Impostor.
 *
 * Execute: node test-prelance.js
 */
'use strict';

const assert = require('assert');
const { Chess } = require('./chess-engine.js');
const { JogoImpostor, lancesDica } = require('./impostor-engine.js');
const PreLance = require('./public/prelance.js');
const Marcas = require('./public/marcacoes.js');

const casa = (t) => (t.charCodeAt(1) - 49) * 8 + (t.charCodeAt(0) - 97);
const nomes = (lista) => lista.map((sq) => 'abcdefgh'[sq % 8] + (Math.floor(sq / 8) + 1)).sort();

let falhas = 0;
function teste(nome, fn) {
  try { fn(); console.log('  OK   ' + nome); } catch (e) { falhas++; console.log('  FALHOU ' + nome + '\n       ' + e.message); }
}

/** Simula o cliente: pré-lance agendado → adversário joga → resolve com os lances legais. */
function executarPrelance(jogo, pre) {
  const lance = PreLance.resolverPrelance(pre, jogo.lances(pre.from));
  if (!lance) return null;
  return jogo.mover(lance);
}

console.log('Pré-lance');

teste('destinos geométricos ignoram bloqueios (torre, bispo, dama, cavalo, peão, rei)', () => {
  assert.deepStrictEqual(nomes(PreLance.destinosGeometricos('n', 'w', casa('g1'))), ['e2', 'f3', 'h3']);
  // Bispo em f1 "atravessa" o peão de e2: dá para agendar Bc4 antes de e4.
  assert.ok(nomes(PreLance.destinosGeometricos('b', 'w', casa('f1'))).includes('c4'));
  assert.strictEqual(PreLance.destinosGeometricos('r', 'b', casa('a8')).length, 14);
  assert.strictEqual(PreLance.destinosGeometricos('q', 'w', casa('d4')).length, 27);
  assert.deepStrictEqual(nomes(PreLance.destinosGeometricos('p', 'w', casa('e2'))), ['d3', 'e3', 'e4', 'f3']);
  assert.deepStrictEqual(nomes(PreLance.destinosGeometricos('p', 'b', casa('a7'))), ['a5', 'a6', 'b6']);
  assert.deepStrictEqual(nomes(PreLance.destinosGeometricos('p', 'w', casa('e2'), { jaMoveu: true })), ['d3', 'e3', 'f3']);
  // Rei na casa inicial também agenda o roque (g1 e c1).
  assert.ok(nomes(PreLance.destinosGeometricos('k', 'w', casa('e1'))).includes('g1'));
  assert.ok(nomes(PreLance.destinosGeometricos('k', 'w', casa('e1'))).includes('c1'));
});

teste('pré-lance legal na nova posição é executado (1.e4 … Cf3 agendado; pretas jogam e5)', () => {
  const j = new Chess();
  j.mover({ from: casa('e2'), to: casa('e4') });
  const pre = { from: casa('g1'), to: casa('f3') }; // agendado na vez das pretas
  j.mover({ from: casa('e7'), to: casa('e5') });     // adversário joga
  const feito = executarPrelance(j, pre);
  assert.ok(feito, 'deveria ter jogado');
  assert.deepStrictEqual(j.historicoSan(), ['e4', 'e5', 'Cf3']);
});

teste('pré-lance Bc4 agendado na vez das pretas sai logo depois do lance delas', () => {
  const j = new Chess();
  j.mover({ from: casa('e2'), to: casa('e4') });
  j.mover({ from: casa('e7'), to: casa('e5') });
  // Vez das brancas: jogam Cf3. Nas pretas, as brancas agendam Bf1-c4
  // (o caminho f1-e2-d3-c4 já está livre porque o peão de e2 saiu).
  j.mover({ from: casa('g1'), to: casa('f3') });
  const pre = { from: casa('f1'), to: casa('c4') };
  j.mover({ from: casa('b8'), to: casa('c6') }); // pretas jogam
  assert.ok(executarPrelance(j, pre));
  assert.strictEqual(j.historicoSan().slice(-1)[0], 'Bc4');
});

teste('pré-lance ilegal na nova posição é cancelado (nada é jogado)', () => {
  const j = new Chess();
  j.mover({ from: casa('e2'), to: casa('e4') }); // brancas
  j.mover({ from: casa('a7'), to: casa('a6') }); // pretas
  // Na vez das brancas, as pretas agendam Bf8-b4 — mas o peão de e7 bloqueia.
  const pre = { from: casa('f8'), to: casa('b4') };
  j.mover({ from: casa('d2'), to: casa('d4') }); // brancas jogam
  const antes = j.historicoSan().length;
  assert.strictEqual(executarPrelance(j, pre), null, 'deveria cancelar');
  assert.strictEqual(j.historicoSan().length, antes, 'nada pode ter sido jogado');
});

teste('pré-lance de captura cancelado quando a peça-alvo saiu da casa', () => {
  const j = new Chess();
  for (const [a, b] of [['e2', 'e4'], ['d7', 'd5']]) j.mover({ from: casa(a), to: casa(b) });
  // Vez das brancas; agendam exd5 só depois do lance das pretas? Simulamos: brancas jogam Cc3,
  // pretas jogam dxe4 (o peão de d5 sai) → o pré-lance e4xd5 das brancas não existe mais.
  j.mover({ from: casa('b1'), to: casa('c3') });
  const pre = { from: casa('e4'), to: casa('d5') };
  j.mover({ from: casa('d5'), to: casa('e4') });
  assert.strictEqual(executarPrelance(j, pre), null);
});

teste('promoção no pré-lance vira dama automaticamente', () => {
  const j = new Chess('8/4P3/8/8/8/k7/8/4K3 b - - 0 1'); // vez das pretas; peão branco em e7
  const pre = { from: casa('e7'), to: casa('e8') };
  j.mover({ from: casa('a3'), to: casa('b3') }); // pretas jogam
  const feito = executarPrelance(j, pre);
  assert.ok(feito && String(feito.promotion).toLowerCase() === 'q', 'promoveu a dama');
  assert.strictEqual(j.obterTabuleiro()[casa('e8')], 'Q');
});

teste('Impostor: o pré-lance usa a FUNÇÃO real (peão com função de dama) e revela a peça', () => {
  const j = new JogoImpostor();
  // Brancas: a peça de a2 (aparência peão) recebe a função de dama, e a de d1 a de peão.
  const fw = {};
  const visao0 = j.tabuleiroPara('w');
  for (const v of visao0) if (v && v.c === 'w') fw[v.id] = v.f;
  fw[casa('a2')] = 'q';
  fw[casa('d1')] = 'p';
  j.definirFuncoes('w', fw);
  j.mover({ from: casa('e2'), to: casa('e4') });
  // Na vez das pretas, as brancas agendam a2→a6 (geometria de DAMA, não de peão).
  const tipo = j.tabuleiroPara('w')[casa('a2')].f;
  assert.strictEqual(tipo, 'q');
  assert.ok(PreLance.destinosGeometricos(tipo, 'w', casa('a2'), { jaMoveu: false }).includes(casa('a6')));
  const pre = { from: casa('a2'), to: casa('a6') };
  j.mover({ from: casa('h7'), to: casa('h6') }); // pretas
  const visao = j.tabuleiroPara('w');
  const lance = PreLance.resolverPrelance(pre, lancesDica(visao, pre.from, null));
  assert.ok(lance, 'lance legal para a dama escondida');
  const feito = j.mover(lance);
  assert.ok(feito, 'o motor (servidor) aceitou');
  const depois = j.tabuleiroPara('b')[casa('a6')];
  assert.ok(depois && depois.r && depois.f === 'q', 'a peça foi revelada como dama para o adversário');
});

console.log('Marcações');

teste('cores pelos modificadores (normal, Shift, Ctrl/Alt, Shift+Ctrl)', () => {
  assert.strictEqual(Marcas.corPorModificadores({}), 'verde');
  assert.strictEqual(Marcas.corPorModificadores({ shiftKey: true }), 'vermelho');
  assert.strictEqual(Marcas.corPorModificadores({ ctrlKey: true }), 'azul');
  assert.strictEqual(Marcas.corPorModificadores({ altKey: true }), 'azul');
  assert.strictEqual(Marcas.corPorModificadores({ shiftKey: true, ctrlKey: true }), 'amarelo');
});

teste('repetir a mesma seta/círculo apaga; outra cor troca a cor', () => {
  const e = Marcas.novoEstado();
  Marcas.alternarSeta(e, casa('e2'), casa('e4'), 'verde');
  Marcas.alternarCirculo(e, casa('d5'), 'vermelho');
  assert.strictEqual(Marcas.quantidade(e), 2);
  Marcas.alternarSeta(e, casa('e2'), casa('e4'), 'azul');
  assert.strictEqual(e.setas.get(casa('e2') + '-' + casa('e4')), 'azul');
  Marcas.alternarSeta(e, casa('e2'), casa('e4'), 'azul');
  Marcas.alternarCirculo(e, casa('d5'), 'vermelho');
  assert.strictEqual(Marcas.quantidade(e), 0);
  Marcas.alternarSeta(e, casa('c3'), casa('c3'), 'verde'); // mesma casa = círculo
  assert.strictEqual(e.circulos.size, 1);
});

teste('seta respeita o tabuleiro girado e a do cavalo sai em L', () => {
  const normal = Marcas.centro(casa('a1'), true);
  const girado = Marcas.centro(casa('a1'), false);
  assert.deepStrictEqual(normal, { x: 0.5, y: 7.5 });
  assert.deepStrictEqual(girado, { x: 7.5, y: 0.5 });
  assert.ok(Marcas.ehSaltoDeCavalo(casa('g1'), casa('f3')));
  assert.strictEqual(Marcas.geometriaSeta(casa('g1'), casa('f3'), true).pontos.length, 3, 'L = 3 pontos');
  assert.strictEqual(Marcas.geometriaSeta(casa('e2'), casa('e4'), true).pontos.length, 2, 'reta = 2 pontos');
});

console.log('\n' + '-'.repeat(40));
if (falhas) { console.log(falhas + ' teste(s) falharam.'); process.exit(1); }
console.log('Todos os testes do pré-lance e das marcações passaram.');
