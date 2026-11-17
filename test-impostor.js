/**
 * Testes de unidade do motor do modo Impostor.
 * Execute: node test-impostor.js
 */
'use strict';

const assert = require('assert');
const { JogoImpostor, funcoesClassicas, funcoesValidas, lancesDica } = require('./impostor-engine.js');

const casa = (t) => (t.charCodeAt(1) - 49) * 8 + (t.charCodeAt(0) - 97);

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

/** Monta uma posição vazia e coloca as peças pedidas. */
function posicao(lado, pecas) {
  const j = new JogoImpostor();
  j.board.fill(null);
  j.lado = lado;
  for (const p of pecas) {
    const sq = casa(p.em);
    j.board[sq] = {
      id: p.id != null ? p.id : sq,
      cor: p.cor,
      aparencia: p.a,
      funcao: p.f || p.a,
      revelada: false,
      moveu: !!p.moveu,
    };
  }
  return j;
}

const mover = (j, de, para, promo) => j.mover({ from: casa(de), to: casa(para), promotion: promo || null });

console.log('\n== Montagem ==');

teste('funções clássicas são válidas e permutações erradas são recusadas', () => {
  const m = funcoesClassicas('w');
  assert.ok(funcoesValidas('w', m));
  const errado = Object.assign({}, m, { [casa('a2')]: 'q' }); // duas damas
  assert.ok(!funcoesValidas('w', errado));
  assert.ok(!funcoesValidas('b', m)); // casas das brancas não servem às pretas
});

teste('trocar funções mantém as quantidades (2 peões viram bispos, bispos viram peões)', () => {
  const j = new JogoImpostor();
  assert.ok(j.trocarFuncoes('w', casa('a2'), casa('c1')));
  assert.ok(j.trocarFuncoes('w', casa('h2'), casa('f1')));
  assert.strictEqual(j.board[casa('a2')].funcao, 'b');
  assert.strictEqual(j.board[casa('c1')].funcao, 'p');
  assert.ok(funcoesValidas('w', j.funcoesDe('w')));
  assert.ok(!j.trocarFuncoes('w', casa('a2'), casa('a7')), 'não pode trocar com peça do oponente');
});

console.log('\n== Revelação ==');

teste('lance impossível para a aparência revela (peão com função de bispo anda na diagonal)', () => {
  const j = new JogoImpostor();
  j.trocarFuncoes('w', casa('e2'), casa('f1')); // e2 aparenta peão, anda como bispo
  // e2 anda na diagonal para f3 (casa vazia) — um peão de verdade não pode.
  const l = mover(j, 'e2', 'f3');
  assert.ok(l, 'lance deveria ser legal');
  assert.ok(j.board[casa('f3')].revelada, 'deveria ficar revelada');
  assert.deepStrictEqual(l.revelou, [{ casa: casa('f3'), funcao: 'b' }]);
  assert.ok(l.san.indexOf('⚑B') !== -1);
});

teste('lance possível para a aparência mantém o segredo (torre com função de dama anda reto)', () => {
  const j = posicao('w', [
    { em: 'e1', cor: 'w', a: 'k' }, { em: 'e8', cor: 'b', a: 'k' },
    { em: 'a1', cor: 'w', a: 'r', f: 'q' },
  ]);
  const l = mover(j, 'a1', 'a5');
  assert.ok(l);
  assert.ok(!j.board[casa('a5')].revelada);
  assert.deepStrictEqual(l.revelou, []);
  // Agora na diagonal: impossível para torre → revela.
  mover(j, 'e8', 'f8');
  const l2 = mover(j, 'a5', 'c7');
  assert.ok(l2 && j.board[casa('c7')].revelada);
});

teste('peão com função de torre avançando 2 casas da fileira inicial continua em segredo', () => {
  const j = new JogoImpostor();
  j.trocarFuncoes('w', casa('e2'), casa('a1'));
  const l = mover(j, 'e2', 'e4');
  assert.ok(l && !j.board[casa('e4')].revelada);
  assert.strictEqual(j.epCasa, null, 'en passant só vale para função de peão');
});

console.log('\n== Rei disfarçado e xeque ==');

teste('xeque no rei disfarçado: é detectado pelas funções reais e revela o rei', () => {
  // Rei verdadeiro das pretas está em h7 com aparência de peão.
  const j = posicao('w', [
    { em: 'a1', cor: 'w', a: 'k' },
    { em: 'h7', cor: 'b', a: 'p', f: 'k' },
    { em: 'e8', cor: 'b', a: 'k', f: 'p' },
    { em: 'd1', cor: 'w', a: 'q' },
  ]);
  const l = mover(j, 'd1', 'd3'); // ataca h7 pela diagonal d3-h7
  assert.ok(l);
  assert.ok(j.emXeque('b'));
  assert.strictEqual(j.status(), 'xeque');
  assert.ok(j.board[casa('h7')].revelada, 'o rei verdadeiro deveria ser revelado');
  assert.ok(!j.board[casa('e8')].revelada, 'o rei aparente (peão real) continua secreto');
  assert.ok(l.san.endsWith('+'));
});

teste('lance que expõe o rei verdadeiro é recusado', () => {
  // Rei verdadeiro branco em a1 com aparência de torre; peça em b2 está cravada.
  const j = posicao('w', [
    { em: 'a1', cor: 'w', a: 'r', f: 'k' },
    { em: 'b2', cor: 'w', a: 'p', f: 'n' },
    { em: 'h8', cor: 'b', a: 'p', f: 'b' }, // peão aparente que é bispo
    { em: 'e8', cor: 'b', a: 'k' },
  ]);
  assert.strictEqual(mover(j, 'b2', 'c4'), null, 'sair da diagonal expõe o rei');
  assert.ok(mover(j, 'a1', 'a2'), 'o rei pode sair');
});

teste('xeque-mate com funções reais', () => {
  const j = posicao('w', [
    { em: 'g1', cor: 'w', a: 'k' },
    { em: 'a1', cor: 'w', a: 'p', f: 'r' }, // peão aparente que é torre
    { em: 'b2', cor: 'w', a: 'n', f: 'r' },
    { em: 'h8', cor: 'b', a: 'b', f: 'k' }, // bispo aparente que é o rei
  ]);
  mover(j, 'b2', 'b7');
  mover(j, 'h8', 'g8');
  mover(j, 'a1', 'a8');
  assert.strictEqual(j.status(), 'xeque-mate');
});

console.log('\n== Roque e promoção ==');

teste('roque vale para o rei verdadeiro nas casas clássicas', () => {
  const j = posicao('w', [
    { em: 'e1', cor: 'w', a: 'k' }, { em: 'h1', cor: 'w', a: 'r' }, { em: 'a1', cor: 'w', a: 'r' },
    { em: 'e8', cor: 'b', a: 'k' },
  ]);
  const l = mover(j, 'e1', 'g1');
  assert.ok(l && l.castle === 'K');
  assert.strictEqual(j.board[casa('f1')].funcao, 'r');
  assert.strictEqual(j.board[casa('g1')].funcao, 'k');
  assert.strictEqual(l.san, 'O-O');
});

teste('sem roque se o rei verdadeiro não está em e1 ou se a "torre" não tem função de torre', () => {
  // Rei aparente em e1 é, na verdade, um peão: não pode rocar.
  const j = posicao('w', [
    { em: 'e1', cor: 'w', a: 'k', f: 'n' }, { em: 'h1', cor: 'w', a: 'r' },
    { em: 'd2', cor: 'w', a: 'p', f: 'k' },
    { em: 'e8', cor: 'b', a: 'k' },
  ]);
  assert.ok(!j.lances(casa('e1')).some((l) => l.castle));
  // Rei verdadeiro em e1, mas h1 tem função de bispo.
  const j2 = posicao('w', [
    { em: 'e1', cor: 'w', a: 'k' }, { em: 'h1', cor: 'w', a: 'r', f: 'b' },
    { em: 'e8', cor: 'b', a: 'k' },
  ]);
  assert.ok(!j2.lances(casa('e1')).some((l) => l.castle));
  // Roque proibido se passar por casa atacada (bispo disfarçado de peão ataca f1).
  const j3 = posicao('w', [
    { em: 'e1', cor: 'w', a: 'k' }, { em: 'h1', cor: 'w', a: 'r' },
    { em: 'b5', cor: 'b', a: 'p', f: 'b' }, { em: 'h8', cor: 'b', a: 'k' },
  ]);
  assert.ok(!j3.lances(casa('e1')).some((l) => l.castle && l.to === casa('g1')));
});

teste('cavalo com função de peão promove na última fileira e fica revelado', () => {
  const j = posicao('w', [
    { em: 'a1', cor: 'w', a: 'k' }, { em: 'h1', cor: 'b', a: 'k' },
    { em: 'c7', cor: 'w', a: 'n', f: 'p', moveu: true },
  ]);
  const l = mover(j, 'c7', 'c8', 'q');
  assert.ok(l);
  const p = j.board[casa('c8')];
  assert.strictEqual(p.funcao, 'q');
  assert.strictEqual(p.aparencia, 'q');
  assert.ok(p.revelada);
  assert.strictEqual(l.promotion, 'Q');
});

teste('peão com função de peão vindo da 1ª fileira não dá passo duplo; en passant só para função de peão', () => {
  const j = posicao('w', [
    { em: 'e1', cor: 'w', a: 'k', f: 'k' }, { em: 'h8', cor: 'b', a: 'k' },
    { em: 'b1', cor: 'w', a: 'n', f: 'p' },
    { em: 'e5', cor: 'w', a: 'p', f: 'p', moveu: true },
    { em: 'd7', cor: 'b', a: 'p', f: 'p' },
  ]);
  assert.deepStrictEqual(j.lances(casa('b1')).map((l) => l.to), [casa('b2')]);
  j.lado = 'b';
  mover(j, 'd7', 'd5');
  assert.strictEqual(j.epCasa, casa('d6'));
  const l = mover(j, 'e5', 'd6');
  assert.ok(l && l.enPassant && l.captured === 'p');
  assert.strictEqual(j.board[casa('d5')], null);
});

teste('aparência de peão chegando ao fim sem promover é revelada', () => {
  const j = posicao('w', [
    { em: 'a1', cor: 'w', a: 'k' }, { em: 'h1', cor: 'b', a: 'k' },
    { em: 'c7', cor: 'w', a: 'p', f: 'r', moveu: true },
  ]);
  mover(j, 'c7', 'c8');
  assert.ok(j.board[casa('c8')].revelada);
});

console.log('\n== Segredo ==');

teste('visão filtrada não contém funções do oponente; capturadas só com aparência', () => {
  const j = new JogoImpostor();
  j.trocarFuncoes('b', casa('e7'), casa('d8')); // e7 é a dama das pretas
  const vistaW = j.tabuleiroPara('w');
  assert.strictEqual(vistaW[casa('e7')].f, undefined);
  assert.strictEqual(vistaW[casa('e7')].a, 'p');
  assert.strictEqual(vistaW[casa('e2')].f, 'p');
  const vistaB = j.tabuleiroPara('b');
  assert.strictEqual(vistaB[casa('e7')].f, 'q');
  assert.ok(j.tabuleiroPara('w', true).every((v, i) => !v || v.c === 'w'), 'montagem esconde o oponente');
  // Captura da "dama secreta": a lista mostra só o peão aparente.
  mover(j, 'd2', 'd4'); mover(j, 'e7', 'e5'); mover(j, 'd4', 'e5');
  assert.deepStrictEqual(j.pecasCapturadas().b, ['p']);
  assert.ok(JSON.stringify(j.ultimoLance()).indexOf('"q"') === -1);
});

teste('dicas do cliente usam a função real e tratam o oponente como obstáculo', () => {
  const j = new JogoImpostor();
  j.trocarFuncoes('w', casa('e2'), casa('g1')); // e2 anda como cavalo
  const dicas = lancesDica(j.tabuleiroPara('w'), casa('e2'), null).map((d) => d.to).sort();
  assert.deepStrictEqual(dicas, [casa('c3'), casa('d4'), casa('f4'), casa('g3')].sort());
});

console.log('\n----------------------------------------');
console.log(falhas === 0 ? 'Todos os testes do Impostor passaram.' : falhas + ' teste(s) falharam.');
process.exit(falhas === 0 ? 0 : 1);
