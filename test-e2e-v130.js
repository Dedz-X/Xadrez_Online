/**
 * Teste de ponta a ponta da v1.3.0: espectador, chat rápido e revelação total
 * no fim do Impostor.
 * ------------------------------------------------------------------------
 * Sobe o servidor numa porta livre e usa três clientes socket.io:
 * anfitrião (brancas), convidado (pretas) e um espectador.
 *  1. O espectador tenta entrar numa sala cheia, recebe a oferta de assistir
 *     e entra como espectador; os jogadores veem "1 espectador".
 *  2. Durante a montagem e a partida, o espectador NUNCA recebe uma função
 *     secreta (só aparências e peças reveladas) nem a revelação total.
 *  3. Chat: IDs válidos chegam a todos; texto livre, IDs inválidos, mensagens
 *     do espectador e excesso de mensagens são recusados.
 *  4. Fim da partida: todos (inclusive o espectador) recebem as funções reais,
 *     e refazer os lances com elas reproduz o tabuleiro final (base da revisão).
 *  5. Sala clássica: o espectador recebe o FEN e a lista de lances.
 *
 * Execute: node test-e2e-v130.js  (precisa do socket.io-client, como o
 * test-e2e-impostor.js: no projeto, em /tmp/sockt ou em SOCKET_IO_CLIENT).
 */
'use strict';

const path = require('path');
const net = require('net');
const assert = require('assert');
const { spawn } = require('child_process');
const { JogoImpostor } = require('./impostor-engine.js');
const { Chess } = require('./chess-engine.js');

function carregarCliente() {
  const tentativas = [process.env.SOCKET_IO_CLIENT, 'socket.io-client', '/tmp/sockt/node_modules/socket.io-client'];
  for (const t of tentativas) {
    if (!t) continue;
    try { return require(t); } catch (e) { /* tenta o próximo */ }
  }
  console.error('socket.io-client não encontrado. Instale fora do projeto, ex.: cd /tmp/sockt && npm i socket.io-client');
  process.exit(2);
}
const { io } = carregarCliente();

const casa = (t) => (t.charCodeAt(1) - 49) * 8 + (t.charCodeAt(0) - 97);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function portaLivre() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function novoCliente(url, rotulo) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  s.rotulo = rotulo;
  s.recebidos = [];
  s.onAny((evento, dados) => s.recebidos.push({ evento, dados }));
  return s;
}

function esperar(s, evento, filtro, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { s.off(evento, fn); reject(new Error(s.rotulo + ': tempo esgotado esperando ' + evento)); }, ms || 4000);
    function fn(d) {
      if (filtro && !filtro(d)) return;
      clearTimeout(t);
      s.off(evento, fn);
      resolve(d);
    }
    s.on(evento, fn);
  });
}

/**
 * Nenhum pacote recebido pelo espectador antes do fim pode ter função de peça
 * não revelada, id/moveu de qualquer peça ou a revelação total.
 */
function conferirEspectadorSemSegredo(cliente) {
  let estados = 0;
  for (const { evento, dados } of cliente.recebidos) {
    const e = dados && dados.estado;
    if (!e || !e.impostor) continue;
    if (e.statusSala === 'terminado') continue; // no fim tudo é público
    estados += 1;
    assert.strictEqual(e.impostor.revelacao, null, 'revelação total vazou em ' + evento);
    e.impostor.tabuleiro.forEach((v, sq) => {
      if (!v) return;
      assert.ok(!('id' in v) && !('m' in v), 'id/moveu vazou ao espectador em ' + evento + ' casa ' + sq);
      if (!v.r) assert.ok(!('f' in v), 'função secreta vazou ao espectador em ' + evento + ' casa ' + sq);
    });
  }
  return estados;
}

let servidor;
async function principal() {
  const porta = await portaLivre();
  const url = 'http://127.0.0.1:' + porta;
  servidor = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: Object.assign({}, process.env, { PORT: String(porta) }), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    servidor.stdout.on('data', (b) => { if (String(b).includes('Xadrez online')) resolve(); });
    servidor.on('exit', () => reject(new Error('servidor saiu')));
  });
  console.log('Servidor de teste em ' + url);
  const passo = (t) => console.log('  OK   ' + t);

  const A = novoCliente(url, 'Anfitrião(brancas)');
  const B = novoCliente(url, 'Convidado(pretas)');
  const E = novoCliente(url, 'Espectador');

  // Sala Impostor com dois jogadores.
  A.emit('criarSala', { modo: 'livre', variante: 'impostor', nome: 'Ana' });
  const entrouA = await esperar(A, 'entrouSala');
  const codigo = entrouA.codigo;
  const coresA = esperar(A, 'escolherCores');
  B.emit('entrarSala', { codigo: codigo, nome: 'Bia' });
  await esperar(B, 'entrouSala');
  await coresA;
  const defA = esperar(A, 'coresDefinidas');
  const defB = esperar(B, 'coresDefinidas');
  A.emit('escolherCor', { escolha: 'w' });
  await Promise.all([defA, defB]);

  // 1) Sala cheia → oferta de assistir → espectador.
  E.emit('entrarSala', { codigo: codigo, nome: 'Edu' });
  const cheia = await esperar(E, 'erro');
  assert.ok(cheia.podeAssistir, 'sala cheia oferece assistir');
  const avisoA = esperar(A, 'espectadores', (d) => d.quantidade === 1);
  E.emit('assistirSala', { codigo: codigo, nome: 'Edu' });
  const ve = await esperar(E, 'entrouComoEspectador');
  await avisoA;
  assert.strictEqual(ve.estado.statusSala, 'montando');
  assert.strictEqual(ve.estado.espectadores, 1);
  assert.strictEqual(ve.estado.impostor.tabuleiro.filter(Boolean).length, 32, 'o espectador vê as 32 aparências na montagem');
  passo('sala cheia ofereceu assistir; o espectador entrou e os jogadores veem 1 espectador');

  // Montagem: brancas e2 ↔ f1 (e2 vira bispo); pretas: rei em h7, dama em d7.
  A.emit('trocarFuncoes', { a: casa('e2'), b: casa('f1') });
  await esperar(A, 'estado');
  B.emit('trocarFuncoes', { a: casa('e8'), b: casa('h7') });
  await esperar(B, 'estado');
  B.emit('trocarFuncoes', { a: casa('d8'), b: casa('d7') });
  await esperar(B, 'estado');
  A.emit('prontoMontagem', { pronto: true });
  await esperar(E, 'estado', (d) => d.estado.impostor.montagem.w);
  const iniE = esperar(E, 'partidaIniciada');
  B.emit('prontoMontagem', { pronto: true });
  const pe = await iniE;
  assert.strictEqual(pe.estado.statusSala, 'em_andamento');
  passo('o espectador acompanhou a montagem (vê quem está pronto, nunca as funções)');

  // Lances: 1. e2-d3 (revela bispo e o rei preto em h7), 1... g7-g6, 2. Bd3-b5, 2... a7-a6.
  const jogar = async (s, de, para) => {
    const visto = esperar(E, 'lanceFeito', (d) => d.lance.to === casa(para));
    s.emit('lance', { from: casa(de), to: casa(para) });
    return visto;
  };
  const m1 = await jogar(A, 'e2', 'd3');
  assert.deepStrictEqual(m1.lance.revelou.map((r) => r.funcao).sort(), ['b', 'k']);
  assert.strictEqual(m1.estado.impostor.tabuleiro[casa('h7')].f, 'k', 'o espectador vê o rei revelado');
  assert.strictEqual(m1.estado.impostor.tabuleiro[casa('d7')].f, undefined, 'a dama secreta continua secreta para o espectador');
  await jogar(B, 'g7', 'g6');
  await jogar(A, 'd3', 'b5');
  await jogar(B, 'a7', 'a6');
  passo('o espectador recebeu os lances ao vivo, só com o que é público');

  // 3) Chat rápido.
  const chA = esperar(A, 'chatMensagem');
  const chB = esperar(B, 'chatMensagem');
  const chE = esperar(E, 'chatMensagem');
  A.emit('chat', { id: 'boa' });
  const [ma, mb, me] = await Promise.all([chA, chB, chE]);
  for (const m of [ma, mb, me]) {
    assert.strictEqual(m.id, 'boa');
    assert.strictEqual(m.cor, 'w');
    assert.strictEqual(m.nome, 'Ana');
    assert.ok(!('texto' in m), 'o servidor manda só o ID');
  }
  await dormir(750);
  for (const ruim of ['Você é ruim!', '<b>oi</b>', 'xyz', 42, null]) {
    B.emit('chat', { id: ruim });
    const rec = await esperar(B, 'chatRecusado');
    assert.ok(/inválida/.test(rec.motivo), 'motivo: ' + rec.motivo);
  }
  E.emit('chat', { id: 'boa' });
  const recE = await esperar(E, 'chatRecusado');
  assert.ok(/jogadores/.test(recE.motivo));
  // Excesso: 6 mensagens seguidas → a 2ª já é recusada (intervalo mínimo).
  let aceitas = 0;
  let recusadas = 0;
  const contaA = (m) => { if (m.papel === 'convidado') aceitas += 1; };
  const contaR = () => { recusadas += 1; };
  A.on('chatMensagem', contaA);
  B.on('chatRecusado', contaR);
  for (let i = 0; i < 6; i++) B.emit('chat', { id: 'fogo' });
  await dormir(400);
  A.off('chatMensagem', contaA);
  B.off('chatRecusado', contaR);
  assert.strictEqual(aceitas, 1, 'só uma passou no limite');
  assert.strictEqual(recusadas, 5);
  passo('chat: ID válido chegou aos 3; texto livre, ID inválido, espectador e excesso foram recusados');

  // 2) Nada secreto chegou ao espectador até aqui.
  const n = conferirEspectadorSemSegredo(E);
  passo('o espectador não recebeu nenhuma função secreta (' + n + ' estados conferidos)');

  // 4) Fim: as pretas desistem → revelação total para todos.
  const fimE = esperar(E, 'fimDeJogo');
  const fimA = esperar(A, 'fimDeJogo');
  B.emit('desistir');
  const [fe, fa] = await Promise.all([fimE, fimA]);
  for (const f of [fe, fa]) {
    const rev = f.estado.impostor.revelacao;
    assert.ok(rev && rev.funcoes, 'revelação presente');
    assert.strictEqual(Object.keys(rev.funcoes).length, 32);
    assert.strictEqual(rev.funcoes[casa('h7')], 'k', 'rei preto começou em h7');
    assert.strictEqual(rev.funcoes[casa('d7')], 'q', 'dama preta começou em d7');
    assert.strictEqual(rev.funcoes[casa('e8')], 'p');
    assert.strictEqual(rev.funcoes[casa('e2')], 'b');
    assert.ok(f.estado.impostor.tabuleiro.every((v) => !v || v.f), 'todas as peças com função no fim');
    assert.strictEqual(f.estado.impostor.tabuleiro[casa('d7')].f, 'q', 'a dama secreta aparece no fim');
  }
  // Refazendo os lances públicos com as funções reveladas chegamos ao mesmo tabuleiro.
  const j = new JogoImpostor();
  const fw = {}, fb = {};
  for (const [id, f] of Object.entries(fe.estado.impostor.revelacao.funcoes)) (Number(id) < 32 ? fw : fb)[id] = f;
  assert.ok(j.definirFuncoes('w', fw) && j.definirFuncoes('b', fb));
  for (const l of fe.estado.lances) assert.ok(j.mover({ from: l.from, to: l.to, promotion: l.promotion }), 'lance refeito: ' + l.san);
  const final = j.tabuleiroFinal();
  fe.estado.impostor.tabuleiro.forEach((v, sq) => {
    if (!v) return assert.strictEqual(final[sq], null);
    assert.strictEqual(final[sq].f, v.f, 'casa ' + sq);
    assert.strictEqual(final[sq].a, v.a, 'casa ' + sq);
  });
  passo('no fim todos recebem as funções reais, e refazer os lances reproduz o tabuleiro (revisão)');

  // 5) Espectador numa sala clássica: FEN e lances.
  const C1 = novoCliente(url, 'Clássico A');
  const C2 = novoCliente(url, 'Clássico B');
  C1.emit('criarSala', { modo: 'livre', nome: 'Caio' });
  const ec = await esperar(C1, 'entrouSala');
  C2.emit('entrarSala', { codigo: ec.codigo, nome: 'Duda' });
  await esperar(C2, 'entrouSala');
  await esperar(C1, 'escolherCores');
  const d1 = esperar(C1, 'coresDefinidas');
  C1.emit('escolherCor', { escolha: 'w' });
  await d1;
  const E2 = novoCliente(url, 'Espectador clássico');
  E2.emit('assistirSala', { codigo: ec.codigo });
  await esperar(E2, 'entrouComoEspectador');
  const lanceE2 = esperar(E2, 'lanceFeito');
  C1.emit('lance', { from: 'e2', to: 'e4' });
  const le = await lanceE2;
  assert.strictEqual(le.estado.lances.length, 1);
  assert.strictEqual(le.estado.lances[0].san, 'e4');
  const ref = new Chess();
  ref.mover({ from: le.estado.lances[0].from, to: le.estado.lances[0].to });
  assert.strictEqual(le.estado.fen, ref.fen());
  // Ao sair, os jogadores veem o número cair para 0.
  const zero = esperar(C1, 'espectadores', (d) => d.quantidade === 0);
  E2.emit('pararDeAssistir');
  await zero;
  passo('espectador de sala clássica recebe FEN e lances; ao sair, o contador volta a 0');

  for (const s of [A, B, E, C1, C2, E2]) s.disconnect();
  console.log('\nTeste de ponta a ponta da v1.3.0: tudo certo.');
}

principal()
  .then(() => { servidor.kill(); process.exit(0); })
  .catch((e) => { console.error('\nFALHOU: ' + (e && e.stack || e)); if (servidor) servidor.kill(); process.exit(1); });
