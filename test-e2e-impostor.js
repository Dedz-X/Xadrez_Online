/**
 * Teste de ponta a ponta do modo Impostor.
 * ----------------------------------------
 * Sobe o servidor numa porta livre, conecta dois clientes socket.io e joga:
 * criar sala Impostor → entrar → cores → montagem (trocas, reconexão) →
 * Pronto → lances com revelação e xeque que revela o rei → captura de peça
 * secreta → desistência → revanche (volta para a montagem).
 * Em TODOS os pacotes recebidos, confere que nenhum segredo do oponente vazou.
 *
 * Execute: node test-e2e-impostor.js
 * Precisa do socket.io-client, que NÃO é dependência do projeto. Ele é
 * procurado no projeto e, se não houver, em /tmp/sockt/node_modules
 * (ou no caminho da variável SOCKET_IO_CLIENT).
 */
'use strict';

const path = require('path');
const net = require('net');
const assert = require('assert');
const { spawn } = require('child_process');

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

function portaLivre() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

/** Cliente que registra tudo o que recebe (para a checagem de vazamento). */
function novoCliente(url, rotulo) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  s.rotulo = rotulo;
  s.recebidos = [];
  s.onAny((evento, dados) => s.recebidos.push({ evento, dados }));
  return s;
}

/** Espera o próximo `evento` (que satisfaça `filtro`), com tempo limite. */
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
 * Checagem de segredo: em qualquer pacote recebido por `cor`, uma peça do
 * oponente só pode trazer a função (f) se estiver revelada (r = true), e nunca
 * traz id nem "moveu". Também procura a função secreta conhecida (`proibido`).
 */
function conferirSemVazamento(cliente, cor, proibidos) {
  let estados = 0;
  for (const { evento, dados } of cliente.recebidos) {
    const e = dados && dados.estado;
    if (e && e.impostor && e.impostor.tabuleiro) {
      estados += 1;
      e.impostor.tabuleiro.forEach((v, sq) => {
        if (!v || v.c === cor) return;
        assert.ok(!('id' in v) && !('m' in v), cliente.rotulo + ': id/moveu do oponente vazou em ' + evento);
        if (!v.r) assert.ok(!('f' in v), cliente.rotulo + ': função secreta vazou em ' + evento + ' casa ' + sq);
      });
      if (e.fen) {
        for (const p of proibidos) {
          // O FEN só pode ter aparências: a dama secreta das pretas (aparência
          // de peão em d7) não pode aparecer como "q" fora de d8.
          assert.ok(!(p.fen && p.fen(e.fen)), cliente.rotulo + ': FEN revelou segredo');
        }
      }
    }
    const lance = dados && dados.lance;
    if (lance) {
      for (const chave of Object.keys(lance)) {
        assert.ok(['from', 'to', 'piece', 'captured', 'promotion', 'castle', 'enPassant', 'san', 'revelou'].includes(chave),
          cliente.rotulo + ': campo inesperado no lance: ' + chave);
      }
    }
    const texto = JSON.stringify(dados || {});
    for (const p of proibidos) {
      if (p.texto) assert.ok(texto.indexOf(p.texto) === -1, cliente.rotulo + ': texto proibido em ' + evento + ': ' + p.texto);
    }
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

  const A = novoCliente(url, 'Anfitrião(brancas)');
  const B = novoCliente(url, 'Convidado(pretas)');
  const passo = (t) => console.log('  OK   ' + t);

  // 1) Criar sala Impostor + Blitz 3 min.
  A.emit('criarSala', { modo: '3+0', variante: 'impostor', nome: 'Ana' });
  const entrouA = await esperar(A, 'entrouSala');
  assert.strictEqual(entrouA.estado.variante, 'impostor');
  assert.strictEqual(entrouA.estado.rotuloVariante, 'Impostor');
  passo('sala Impostor criada: ' + entrouA.codigo + ' (' + entrouA.estado.rotuloModo + ' · ' + entrouA.estado.rotuloVariante + ')');

  // 2) Convidado entra pelo código.
  const coresA = esperar(A, 'escolherCores');
  B.emit('entrarSala', { codigo: entrouA.codigo, nome: 'Bia' });
  const entrouB = await esperar(B, 'entrouSala');
  await coresA;
  passo('convidado entrou e o menu de cores abriu');

  // 3) Anfitrião escolhe brancas → status "montando".
  const defA = esperar(A, 'coresDefinidas');
  const defB = esperar(B, 'coresDefinidas');
  A.emit('escolherCor', { escolha: 'w' });
  const [cA, cB] = await Promise.all([defA, defB]);
  assert.strictEqual(cA.cor, 'w');
  assert.strictEqual(cB.cor, 'b');
  assert.strictEqual(cA.estado.statusSala, 'montando');
  assert.ok(cA.estado.impostor.tabuleiro.every((v) => !v || v.c === 'w'), 'na montagem as brancas só veem as próprias peças');
  assert.ok(cB.estado.impostor.tabuleiro.every((v) => !v || v.c === 'b'), 'na montagem as pretas só veem as próprias peças');
  passo('cores definidas; montagem mostra só as próprias peças');

  // 4) Montagem.
  // Brancas: e2 vira bispo (troca com f1).
  A.emit('trocarFuncoes', { a: casa('e2'), b: casa('f1') });
  const eA = await esperar(A, 'estado');
  assert.strictEqual(eA.estado.impostor.tabuleiro[casa('e2')].f, 'b');
  assert.strictEqual(eA.estado.impostor.tabuleiro[casa('f1')].f, 'p');
  // Pretas: rei vai para h7 (aparência de peão) e a dama vai para d7.
  B.emit('trocarFuncoes', { a: casa('e8'), b: casa('h7') });
  await esperar(B, 'estado');
  B.emit('trocarFuncoes', { a: casa('d8'), b: casa('d7') });
  await esperar(B, 'estado');
  // Troca inválida (peça do oponente) é recusada.
  B.emit('trocarFuncoes', { a: casa('a7'), b: casa('a2') });
  await esperar(B, 'erro');
  passo('trocas de função feitas (e troca com peça do oponente recusada)');

  // 5) Reconexão durante a montagem: as pretas caem e voltam com o token.
  const desconectouVisto = esperar(A, 'oponenteDesconectado');
  B.disconnect();
  await desconectouVisto;
  const B2 = novoCliente(url, 'Convidado(pretas, reconectado)');
  B2.emit('reconectar', { codigo: entrouA.codigo, token: entrouB.token, nome: 'Bia' });
  const volta = await esperar(B2, 'entrouSala');
  assert.strictEqual(volta.estado.statusSala, 'montando');
  assert.strictEqual(volta.estado.impostor.tabuleiro[casa('h7')].f, 'k', 'a montagem das pretas foi preservada');
  assert.strictEqual(volta.estado.impostor.tabuleiro[casa('d7')].f, 'q');
  passo('reconexão durante a montagem preservou as funções');

  // 6) Pronto dos dois → partida começa.
  A.emit('prontoMontagem', { pronto: true });
  const avisoB = await esperar(B2, 'estado', (d) => d.estado.impostor.montagem.oponente);
  assert.ok(avisoB.estado.impostor.montagem.oponente && !avisoB.estado.impostor.montagem.eu);
  const iniA = esperar(A, 'partidaIniciada');
  const iniB = esperar(B2, 'partidaIniciada');
  B2.emit('prontoMontagem', { pronto: true });
  const [pA] = await Promise.all([iniA, iniB]);
  assert.strictEqual(pA.estado.statusSala, 'em_andamento');
  assert.ok(pA.estado.relogio.ativo === 'w', 'relógio das brancas ligado');
  assert.strictEqual(pA.estado.impostor.tabuleiro[casa('h7')].f, undefined, 'brancas não sabem onde está o rei preto');
  passo('os dois clicaram em Pronto e a partida começou (relógio rodando)');

  // 7) 1. e2-d3: peão aparente anda na diagonal → revelado como bispo,
  //    e dá xeque no rei preto disfarçado em h7 → rei revelado.
  const lA = esperar(A, 'lanceFeito');
  const lB = esperar(B2, 'lanceFeito');
  A.emit('lance', { from: casa('e2'), to: casa('d3') });
  const [m1] = await Promise.all([lA, lB]);
  assert.deepStrictEqual(m1.lance.revelou.map((r) => r.funcao).sort(), ['b', 'k']);
  assert.strictEqual(m1.estado.statusJogo, 'xeque');
  const vistaA = m1.estado.impostor.tabuleiro;
  assert.ok(vistaA[casa('h7')].r && vistaA[casa('h7')].f === 'k', 'rei preto revelado para as brancas');
  assert.strictEqual(vistaA[casa('d7')].f, undefined, 'a dama secreta continua secreta');
  assert.ok(m1.lance.san.indexOf('⚑B') !== -1 && m1.lance.san.endsWith('+'), 'histórico: ' + m1.lance.san);
  passo('lance impossível revelou o bispo e o xeque revelou o rei (' + m1.lance.san + ')');

  // 8) Lance que deixa o rei verdadeiro em xeque é recusado.
  B2.emit('lance', { from: casa('a7'), to: casa('a6') });
  const ileg = await esperar(B2, 'lanceIlegal');
  passo('servidor recusou lance que mantém o rei em xeque (' + ileg.motivo + ')');

  // 9) 1... g7-g6 bloqueia (lance normal de peão, sem revelar).
  const w0 = esperar(A, 'lanceFeito');
  B2.emit('lance', { from: casa('g7'), to: casa('g6') });
  const m2 = await w0;
  assert.deepStrictEqual(m2.lance.revelou, []);
  // 2. Bd3-b5  2... a7-a6  3. Bb5xd7 (captura a dama secreta disfarçada de peão).
  const chegou = (s, para) => esperar(s, 'lanceFeito', (d) => d.lance.to === casa(para));
  let w = chegou(B2, 'b5');
  A.emit('lance', { from: casa('d3'), to: casa('b5') });
  await w;
  w = chegou(A, 'a6');
  B2.emit('lance', { from: casa('a7'), to: casa('a6') });
  await w;
  w = chegou(A, 'd7');
  A.emit('lance', { from: casa('b5'), to: casa('d7') });
  const m3 = await w;
  assert.strictEqual(m3.lance.captured, 'p', 'captura mostra só a aparência');
  assert.deepStrictEqual(m3.estado.capturadas.b, ['p']);
  passo('captura da dama secreta: lista e histórico mostram só o peão aparente (' + m3.lance.san + ')');

  // 10) Nenhum segredo vazou para as brancas em nenhum pacote.
  const proibidosParaBrancas = [{ fen: (fen) => /q/.test(fen.split(' ')[0].split('/')[1]) }]; // 7ª fileira com "q"
  const n = conferirSemVazamento(A, 'w', proibidosParaBrancas);
  conferirSemVazamento(B, 'b', []);
  conferirSemVazamento(B2, 'b', []);
  passo('nenhum segredo vazou (' + n + ' estados das brancas conferidos, ' + A.recebidos.length + ' pacotes)');

  // 11) Revanche mantém a variante e volta para a montagem.
  B2.emit('desistir');
  await esperar(A, 'fimDeJogo');
  const recA = esperar(A, 'escolherCores', (d) => d.revanche);
  A.emit('revanche');
  B2.emit('revanche');
  const rc = await recA;
  assert.strictEqual(rc.estado.variante, 'impostor');
  const novaA = esperar(A, 'coresDefinidas');
  A.emit('escolherCor', { escolha: 'b' });
  const nd = await novaA;
  assert.strictEqual(nd.estado.statusSala, 'montando');
  assert.strictEqual(nd.cor, 'b');
  assert.ok(nd.estado.impostor.tabuleiro.every((v) => !v || (v.c === 'b' && v.f === v.a)), 'nova montagem começa com as funções clássicas');
  passo('revanche manteve o Impostor e voltou para a montagem');

  // 12) O modo clássico continua igual (sem campo impostor, FEN normal).
  const C = novoCliente(url, 'Clássico');
  C.emit('criarSala', { modo: 'livre', nome: 'Caio' });
  const ec = await esperar(C, 'entrouSala');
  assert.strictEqual(ec.estado.variante, 'classico');
  assert.strictEqual(ec.estado.impostor, null);
  assert.ok(ec.estado.fen.startsWith('rnbqkbnr/pppppppp'));
  passo('sala clássica continua igual (variante padrão = clássico)');

  for (const s of [A, B2, C]) s.disconnect();
  console.log('\nTeste de ponta a ponta do Impostor: tudo certo.');
}

principal()
  .then(() => { servidor.kill(); process.exit(0); })
  .catch((e) => { console.error('\nFALHOU: ' + (e && e.stack || e)); if (servidor) servidor.kill(); process.exit(1); });
