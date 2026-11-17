/**
 * Testes de unidade do chat rápido (validação das mensagens e limite de envio).
 * Execute: node test-chat.js
 */
'use strict';

const assert = require('assert');
const ChatRapido = require('./chat-rapido.js');
const ChatPublico = require('./public/chat-rapido.js');

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

console.log('Chat rápido');

teste('as mensagens têm IDs únicos e só frases ou emojis', () => {
  const ids = ChatRapido.MENSAGENS.map((m) => m.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const m of ChatRapido.MENSAGENS) {
    assert.ok(m.tipo === 'frase' || m.tipo === 'emoji');
    assert.ok(/^[a-z]+$/.test(m.id), 'ID simples: ' + m.id);
    assert.ok(m.texto && m.texto.indexOf('<') === -1);
  }
  // As frases pedidas estão lá.
  for (const t of ['Boa jogada!', 'Oops', 'Bom jogo!', 'Obrigado!', 'Pensa rápido!', '👍', '😂', '😮', '😢', '🔥']) {
    assert.ok(ChatRapido.MENSAGENS.some((m) => m.texto === t), 'falta: ' + t);
  }
});

teste('IDs válidos são aceitos', () => {
  assert.strictEqual(ChatRapido.mensagemPorId('boa').texto, 'Boa jogada!');
  assert.strictEqual(ChatRapido.mensagemPorId('fogo').texto, '🔥');
});

teste('texto livre, HTML, tipos estranhos e IDs inexistentes são recusados', () => {
  for (const ruim of ['Boa jogada!', '<script>alert(1)</script>', 'BOA', '', ' boa', 'boa ', null, undefined, 12,
    { id: 'boa' }, ['boa'], 'constructor', '__proto__', 'toString', 'x'.repeat(5000)]) {
    assert.strictEqual(ChatRapido.mensagemPorId(ruim), null, 'deveria recusar: ' + String(ruim).slice(0, 30));
  }
});

teste('limite: no máximo 4 mensagens em 10 s e 0,7 s entre elas', () => {
  const permitir = ChatRapido.criarLimitador({ max: 4, janelaMs: 10000, intervaloMs: 700 });
  assert.ok(permitir('a', 0));
  assert.ok(!permitir('a', 300), 'rápido demais');
  assert.ok(permitir('a', 800));
  assert.ok(permitir('a', 1600));
  assert.ok(permitir('a', 2400));
  assert.ok(!permitir('a', 3200), '5ª mensagem dentro de 10 s');
  assert.ok(permitir('b', 3200), 'outro jogador tem o próprio limite');
  assert.ok(permitir('a', 10100), 'depois da janela volta a liberar');
});

teste('a cópia em public/ é idêntica à do servidor', () => {
  const fs = require('fs');
  assert.strictEqual(fs.readFileSync(__dirname + '/chat-rapido.js', 'utf8'), fs.readFileSync(__dirname + '/public/chat-rapido.js', 'utf8'));
  assert.deepStrictEqual(ChatPublico.MENSAGENS, ChatRapido.MENSAGENS);
});

console.log('\n----------------------------------------');
if (falhas) {
  console.log(falhas + ' teste(s) do chat falharam.');
  process.exit(1);
}
console.log('Todos os testes do chat passaram.');
