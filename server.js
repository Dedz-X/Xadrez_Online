/**
 * Servidor do Xadrez Alternativo (xadrez online).
 * -----------------------------------------------
 * Express entrega o cliente estático em /public.
 * Socket.IO gerencia as salas. O motor (chess-engine.js) é a autoridade:
 * todo lance é validado aqui, os relógios correm com timestamps do servidor
 * e o resultado (mate, empate, tempo, desistência) é decidido neste processo.
 *
 * As salas ficam só na memória — suficiente para um serviço pequeno.
 * Reiniciar o servidor esvazia as partidas em andamento.
 *
 * Identidade: cada jogador é anfitrião ou convidado até o anfitrião
 * escolher as cores (depois que o segundo entra, e de novo na revanche).
 * Só então o relógio e a partida começam.
 *
 * Modo Impostor: as funções reais das peças ficam só aqui no servidor.
 * Cada jogador recebe um estado FILTRADO (estadoPublico(sala, cor)): as próprias
 * peças com a função real e as do oponente só com a aparência (e a função
 * apenas quando já foi revelada). Por isso os eventos com estado são enviados
 * jogador por jogador (emitirSala / emitirOponente), nunca para a sala inteira.
 */
'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Chess } = require('./chess-engine.js');
const { JogoImpostor, fenAparente } = require('./impostor-engine.js');

const PORT = process.env.PORT || 3000;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L
const TAMANHO_CODIGO = 5;
const MODOS = {
  livre:  { id: 'livre',  rotulo: 'Livre (sem tempo)', minutos: null, incremento: 0 },
  '10+0': { id: '10+0',   rotulo: 'Rápido 10 min',     minutos: 10,   incremento: 0 },
  '3+0':  { id: '3+0',    rotulo: 'Blitz 3 min',       minutos: 3,    incremento: 0 },
};
const ESCOLHAS_COR = new Set(['w', 'b', 'aleatoria']);

/**
 * Variantes de regra. Combinam com qualquer modo de tempo acima.
 *  - classico: xadrez normal (motor chess-engine.js).
 *  - impostor: funções secretas (motor impostor-engine.js). Depois das cores,
 *    a sala passa pelo status 'montando' até os dois clicarem em Pronto.
 */
const VARIANTES = {
  classico: { id: 'classico', rotulo: 'Clássico' },
  impostor: { id: 'impostor', rotulo: 'Impostor' },
};

/** Limpeza: sala aguardando sem ninguém, ou ambos desconectados, ou partida encerrada ociosa. */
const MS_LIMPEZA_AGUARDANDO = 30 * 60 * 1000;
const MS_LIMPEZA_DESCONECTADOS = 10 * 60 * 1000;
const MS_LIMPEZA_TERMINADA = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// App HTTP
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));
app.get('/saude', (_req, res) => res.type('text').send('ok'));
// Versão do site: fonte única é o package.json (o canto da tela mostra "v1.2.0").
const VERSAO = require('./package.json').version;
app.get('/versao', (_req, res) => res.json({ versao: VERSAO }));

const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, {
  cors: { origin: false }, // mesmo origin (o próprio Express)
  pingTimeout: 20000,
  pingInterval: 10000,
});

/** @type {Map<string, object>} codigo → sala */
const salas = new Map();

// ---------------------------------------------------------------------------
// Limitação de taxa e validação
// ---------------------------------------------------------------------------

const janelasTaxa = new Map(); // socket.id → { t, n }

function dentroDaTaxa(socket, max, janelaMs) {
  const agora = Date.now();
  let j = janelasTaxa.get(socket.id);
  if (!j || agora - j.t > janelaMs) {
    j = { t: agora, n: 0 };
    janelasTaxa.set(socket.id, j);
  }
  j.n += 1;
  return j.n <= max;
}

function codigoValido(c) {
  return typeof c === 'string' && new RegExp('^[' + ALFABETO + ']{' + TAMANHO_CODIGO + '}$').test(c);
}

function tokenValido(t) {
  return typeof t === 'string' && /^[a-f0-9]{16,64}$/.test(t);
}

function gerarCodigo() {
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    let c = '';
    const bytes = crypto.randomBytes(TAMANHO_CODIGO);
    for (let i = 0; i < TAMANHO_CODIGO; i++) c += ALFABETO[bytes[i] % ALFABETO.length];
    if (!salas.has(c)) return c;
  }
  throw new Error('Não foi possível gerar um código de sala.');
}

function gerarToken() {
  return crypto.randomBytes(16).toString('hex');
}

function ladoOposto(cor) {
  return cor === 'w' ? 'b' : 'w';
}

// ---------------------------------------------------------------------------
// Relógio e estado
// ---------------------------------------------------------------------------

function novoRelogio(modo) {
  const ms = modo.minutos == null ? 0 : modo.minutos * 60 * 1000;
  return {
    w: ms,
    b: ms,
    ativo: null,
    iniciadoEm: null, // Date.now() quando o relógio ativo começou a correr
  };
}

/** Debita o tempo decorrido do lado ativo. */
function aplicarGasto(sala) {
  if (!sala.relogio.ativo || !sala.relogio.iniciadoEm) return;
  if (sala.modo.minutos == null) return;
  const gasto = Date.now() - sala.relogio.iniciadoEm;
  sala.relogio[sala.relogio.ativo] = Math.max(0, sala.relogio[sala.relogio.ativo] - gasto);
  sala.relogio.iniciadoEm = Date.now();
}

function relogioPublico(sala) {
  const r = { w: sala.relogio.w, b: sala.relogio.b, ativo: sala.relogio.ativo };
  if (sala.status === 'em_andamento' && sala.relogio.ativo && sala.relogio.iniciadoEm && sala.modo.minutos != null) {
    const gasto = Date.now() - sala.relogio.iniciadoEm;
    r[sala.relogio.ativo] = Math.max(0, r[sala.relogio.ativo] - gasto);
  }
  return r;
}

function verificarFlag(sala) {
  if (sala.status !== 'em_andamento' || sala.modo.minutos == null) return false;
  aplicarGasto(sala);
  const lado = sala.relogio.ativo;
  if (!lado || sala.relogio[lado] > 0) return false;
  sala.relogio[lado] = 0;
  sala.relogio.iniciadoEm = null;
  sala.relogio.ativo = null;
  const adversario = ladoOposto(lado);
  if (!sala.jogo.temMaterialParaMate(adversario)) {
    encerrar(sala, { tipo: 'empate-tempo', vencedor: null, motivo: 'empate-tempo' });
  } else {
    encerrar(sala, { tipo: 'tempo', vencedor: adversario, motivo: 'tempo' });
  }
  return true;
}

function encerrar(sala, resultado) {
  sala.status = 'terminado';
  sala.resultado = resultado;
  sala.relogio.iniciadoEm = null;
  sala.relogio.ativo = null;
  sala.propostaEmpatePor = null;
  sala.ultimoEvento = Date.now();
}


function sanitizarNome(n) {
  if (typeof n !== 'string') n = n == null ? '' : String(n);
  n = n.replace(/[\u0000-\u001F\u007F-\u009F<>&"'`]/g, '').replace(/\s+/g, ' ').trim();
  if (n.length > 20) n = n.slice(0, 20).trim();
  return n;
}

function aplicarNome(jogador, nome) {
  if (!jogador) return;
  const n = sanitizarNome(nome);
  if (n) jogador.nome = n;
}

function corDoPapel(sala, papel) {
  if (!sala.corAnfitriao) return null;
  return papel === 'anfitriao' ? sala.corAnfitriao : ladoOposto(sala.corAnfitriao);
}

/** Cria o motor certo para a variante da sala. */
function novoJogo(sala) {
  return sala.variante.id === 'impostor' ? new JogoImpostor() : new Chess();
}

/**
 * Parte do estado só do modo Impostor, já filtrada para o jogador `cor`.
 * Nunca inclui funções secretas do oponente.
 */
function estadoImpostor(sala, cor) {
  const montando = sala.status === 'montando';
  // Na montagem (e antes das cores) cada um vê só as próprias peças.
  const esconder = montando || sala.status === 'escolhendo-cores' || sala.status === 'aguardando';
  const tabuleiro = sala.jogo.tabuleiroPara(cor, esconder);
  const pronto = sala.montagem || { w: false, b: false };
  return {
    tabuleiro: tabuleiro,
    montagem: {
      eu: !!(cor && pronto[cor]),
      oponente: !!(cor && pronto[ladoOposto(cor)]),
    },
    // FEN só com as aparências visíveis (sem roque nem en passant).
    fenAparente: fenAparente(tabuleiro, sala.jogo.vez(), sala.jogo.lanceCompleto),
  };
}

/**
 * Estado enviado a um jogador. No clássico é igual para os dois; no Impostor
 * depende de `cor` (cor de quem vai receber; null = espectador / sem cor).
 */
function estadoPublico(sala, cor) {
  const impostor = sala.variante.id === 'impostor';
  const extraImpostor = impostor ? estadoImpostor(sala, cor || null) : null;
  const statusJogo = sala.resultado
    ? sala.resultado.tipo
    : (sala.jogo.status ? sala.jogo.status() : 'em_andamento');
  const a = sala.participantes && sala.participantes.anfitriao;
  const c = sala.participantes && sala.participantes.convidado;
  return {
    codigo: sala.codigo,
    modo: sala.modo.id,
    rotuloModo: sala.modo.rotulo,
    variante: sala.variante.id,
    rotuloVariante: sala.variante.rotulo,
    statusSala: sala.status,
    // No Impostor o FEN real revelaria as funções: mandamos só as aparências.
    fen: impostor ? extraImpostor.fenAparente : sala.jogo.fen(),
    impostor: impostor ? { tabuleiro: extraImpostor.tabuleiro, montagem: extraImpostor.montagem } : null,
    vez: sala.jogo.vez(),
    historico: sala.jogo.historicoSan(),
    capturadas: sala.jogo.pecasCapturadas(),
    ultimoLance: sala.jogo.ultimoLance(),
    statusJogo: statusJogo,
    relogio: relogioPublico(sala),
    resultado: sala.resultado,
    propostaEmpatePor: sala.propostaEmpatePor,
    revanche: {
      anfitriao: !!(sala.revanche && sala.revanche.anfitriao),
      convidado: !!(sala.revanche && sala.revanche.convidado),
    },
    conectados: {
      anfitriao: !!(a && a.conectado),
      convidado: !!(c && c.conectado),
      w: !!(sala.jogadores.w && sala.jogadores.w.conectado),
      b: !!(sala.jogadores.b && sala.jogadores.b.conectado),
    },
    corAnfitriao: sala.corAnfitriao || null,
    sugestaoCorAnfitriao: sala.sugestaoCorAnfitriao || 'w',
    nomes: {
      anfitriao: (a && a.nome) || null,
      convidado: (c && c.nome) || null,
      w: (sala.jogadores.w && sala.jogadores.w.nome) || null,
      b: (sala.jogadores.b && sala.jogadores.b.nome) || null,
    },
  };
}

/**
 * Envia `evento` para cada jogador da sala, com o estado filtrado para a cor
 * dele. `extra` são campos adicionais iguais para todos.
 */
function emitirSala(sala, evento, extra) {
  for (const papel of ['anfitriao', 'convidado']) {
    const j = sala.participantes[papel];
    if (!j || !j.socketId) continue;
    const cor = corDoPapel(sala, papel);
    io.to(j.socketId).emit(evento, Object.assign({}, extra || {}, { estado: estadoPublico(sala, cor) }));
  }
}

/** Como emitirSala, mas só para o outro jogador (não o `papel` informado). */
function emitirOponente(sala, papel, evento, extra) {
  const outro = papel === 'anfitriao' ? 'convidado' : 'anfitriao';
  const j = sala.participantes[outro];
  if (!j || !j.socketId) return;
  io.to(j.socketId).emit(evento, Object.assign({}, extra || {}, { estado: estadoPublico(sala, corDoPapel(sala, outro)) }));
}

function emitirEstado(sala, extra) {
  emitirSala(sala, 'estado', extra);
}

function jogadorPorToken(sala, token) {
  if (!sala.participantes) return null;
  for (const papel of ['anfitriao', 'convidado']) {
    const j = sala.participantes[papel];
    if (j && j.token === token) {
      return { papel: papel, cor: corDoPapel(sala, papel), jogador: j };
    }
  }
  return null;
}

function sincronizarJogadoresPorCor(sala) {
  if (!sala.corAnfitriao || !sala.participantes.convidado) {
    sala.jogadores = { w: null, b: null };
    return;
  }
  const a = sala.participantes.anfitriao;
  const c = sala.participantes.convidado;
  if (sala.corAnfitriao === 'w') {
    sala.jogadores = { w: a, b: c };
  } else {
    sala.jogadores = { w: c, b: a };
  }
}

function atualizarCorDosSockets(sala) {
  for (const papel of ['anfitriao', 'convidado']) {
    const j = sala.participantes[papel];
    if (j && j.socketId) {
      const s = io.sockets.sockets.get(j.socketId);
      if (s) {
        s.data.papel = papel;
        s.data.cor = corDoPapel(sala, papel);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Criação / entrada / reconexão
// ---------------------------------------------------------------------------

function criarSala(modoId, nome, varianteId) {
  const modo = MODOS[modoId];
  if (!modo) return null;
  const variante = VARIANTES[varianteId] || VARIANTES.classico;

  const codigo = gerarCodigo();
  const token = gerarToken();
  const sala = {
    codigo: codigo,
    modo: modo,
    variante: variante,
    /** Impostor: quem já clicou em Pronto na montagem. */
    montagem: { w: false, b: false },
    participantes: {
      anfitriao: {
        token: token,
        socketId: null,
        conectado: false,
        ultimoVisto: Date.now(),
        nome: sanitizarNome(nome) || null,
      },
      convidado: null,
    },
    jogadores: { w: null, b: null },
    corAnfitriao: null,
    sugestaoCorAnfitriao: 'w',
    jogo: variante.id === 'impostor' ? new JogoImpostor() : new Chess(),
    relogio: novoRelogio(modo),
    status: 'aguardando',
    resultado: null,
    propostaEmpatePor: null,
    revanche: { anfitriao: false, convidado: false },
    criadoEm: Date.now(),
    ultimoEvento: Date.now(),
  };
  salas.set(codigo, sala);
  return { sala: sala, papel: 'anfitriao', token: token };
}

function sentar(sala, tokenExistente, nome) {
  if (tokenExistente) {
    const achou = jogadorPorToken(sala, tokenExistente);
    if (achou) {
      aplicarNome(achou.jogador, nome);
      return { papel: achou.papel, cor: achou.cor, token: achou.jogador.token, reconectou: true };
    }
  }
  if (sala.status === 'terminado' && !tokenExistente) return { erro: 'Esta partida já terminou.' };
  if (sala.participantes.convidado) return { erro: 'A sala está cheia.' };
  const token = gerarToken();
  sala.participantes.convidado = {
    token: token,
    socketId: null,
    conectado: false,
    ultimoVisto: Date.now(),
    nome: sanitizarNome(nome) || null,
  };
  sala.ultimoEvento = Date.now();
  return { papel: 'convidado', cor: null, token: token, reconectou: false };
}

function iniciarPartidaAposCores(sala) {
  sala.jogo = novoJogo(sala);
  sala.relogio = novoRelogio(sala.modo);
  sala.resultado = null;
  sala.propostaEmpatePor = null;
  sala.revanche = { anfitriao: false, convidado: false };
  sala.ultimoEvento = Date.now();
  if (sala.variante.id === 'impostor') {
    // Impostor: antes do relógio, cada um monta as funções (sem limite de tempo).
    sala.status = 'montando';
    sala.montagem = { w: false, b: false };
    return;
  }
  comecarRelogioEPartida(sala);
}

/** Coloca a partida em andamento e liga o relógio das brancas. */
function comecarRelogioEPartida(sala) {
  sala.status = 'em_andamento';
  sala.ultimoEvento = Date.now();
  if (sala.modo.minutos != null) {
    sala.relogio.ativo = 'w';
    sala.relogio.iniciadoEm = Date.now();
  }
}

function atribuirCores(sala, escolha) {
  let corAnfitriao = escolha;
  let aleatorio = false;
  if (escolha === 'aleatoria') {
    aleatorio = true;
    corAnfitriao = crypto.randomBytes(1)[0] < 128 ? 'w' : 'b';
  }
  if (corAnfitriao !== 'w' && corAnfitriao !== 'b') return null;
  sala.corAnfitriao = corAnfitriao;
  sincronizarJogadoresPorCor(sala);
  atualizarCorDosSockets(sala);
  return { corAnfitriao: corAnfitriao, aleatorio: aleatorio };
}

function irParaEscolhaDeCores(sala, sugestao) {
  sala.status = 'escolhendo-cores';
  sala.corAnfitriao = null;
  sala.jogadores = { w: null, b: null };
  sala.sugestaoCorAnfitriao = sugestao || sala.sugestaoCorAnfitriao || 'w';
  sala.resultado = null;
  sala.propostaEmpatePor = null;
  sala.revanche = { anfitriao: false, convidado: false };
  sala.jogo = novoJogo(sala);
  sala.montagem = { w: false, b: false };
  sala.relogio = novoRelogio(sala.modo);
  sala.ultimoEvento = Date.now();
  atualizarCorDosSockets(sala);
}

function ligarSocket(sala, papel, socket) {
  const j = sala.participantes[papel];
  if (!j) return;
  if (j.socketId && j.socketId !== socket.id) {
    const antigo = io.sockets.sockets.get(j.socketId);
    if (antigo) {
      antigo.data.codigo = null;
      antigo.emit('substituido', { motivo: 'Você conectou em outra janela.' });
    }
  }
  j.socketId = socket.id;
  j.conectado = true;
  j.ultimoVisto = Date.now();
  socket.data.codigo = sala.codigo;
  socket.data.token = j.token;
  socket.data.papel = papel;
  socket.data.cor = corDoPapel(sala, papel);
  socket.join('sala:' + sala.codigo);
}

function desconectarSocket(socket) {
  const codigo = socket.data && socket.data.codigo;
  const token = socket.data && socket.data.token;
  if (!codigo || !token) return;
  const sala = salas.get(codigo);
  if (!sala) return;
  const achou = jogadorPorToken(sala, token);
  if (!achou) return;
  if (achou.jogador.socketId !== socket.id) return; // já foi substituído
  achou.jogador.conectado = false;
  achou.jogador.socketId = null;
  achou.jogador.ultimoVisto = Date.now();
  sala.ultimoEvento = Date.now();
  emitirOponente(sala, achou.papel, 'oponenteDesconectado', {
    cor: achou.cor,
    papel: achou.papel,
  });
}

// ---------------------------------------------------------------------------
// Ações de jogo
// ---------------------------------------------------------------------------

function aplicarLance(sala, cor, entrada) {
  if (sala.status !== 'em_andamento') return { erro: 'A partida não está em andamento.' };
  if (verificarFlag(sala)) return { flagged: true };
  if (sala.jogo.vez() !== cor) return { erro: 'Não é a sua vez.' };

  // Aceita índice (12) ou notação ("e2"); o motor Impostor trabalha só com índices.
  const paraIndice = (v) => (typeof v === 'string' ? (v.charCodeAt(1) - 49) * 8 + (v.charCodeAt(0) - 97) : v);
  const from = paraIndice(entrada.from);
  const to = paraIndice(entrada.to);
  if (from == null || to == null) return { erro: 'Lance inválido.' };

  const feito = sala.jogo.mover({
    from: from,
    to: to,
    promotion: entrada.promotion || null,
  });
  if (!feito) {
    // Impostor: o jogador não vê as funções do oponente, então explicamos o motivo.
    if (sala.variante.id === 'impostor' && sala.jogo.deixariaReiEmXeque(from, to)) {
      return { erro: 'Lance ilegal: seu rei ficaria em xeque.' };
    }
    return { erro: 'Lance ilegal.' };
  }

  sala.propostaEmpatePor = null;
  sala.revanche = { anfitriao: false, convidado: false };
  sala.ultimoEvento = Date.now();

  if (sala.modo.minutos != null) {
    // O gasto até este instante já foi debitado em verificarFlag/aplicarGasto.
    sala.relogio.iniciadoEm = Date.now();
    if (sala.jogo.jogoAcabou()) {
      sala.relogio.ativo = null;
      sala.relogio.iniciadoEm = null;
    } else {
      sala.relogio.ativo = sala.jogo.vez();
    }
  }

  if (sala.jogo.emXequeMate()) {
    encerrar(sala, { tipo: 'xeque-mate', vencedor: cor, motivo: 'xeque-mate' });
  } else if (sala.jogo.emEmpate()) {
    encerrar(sala, { tipo: sala.jogo.status(), vencedor: null, motivo: sala.jogo.status() });
  }

  return { lance: feito };
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  socket.data = socket.data || {};

  socket.on('criarSala', (dados) => {
    if (!dentroDaTaxa(socket, 8, 10000)) return socket.emit('erro', { mensagem: 'Muitas tentativas. Espere um instante.' });
    const modoId = dados && dados.modo;
    if (!MODOS[modoId]) {
      return socket.emit('erro', { mensagem: 'Modo inválido.' });
    }
    try {
      const varianteId = dados && dados.variante;
      if (varianteId != null && !VARIANTES[varianteId]) {
        return socket.emit('erro', { mensagem: 'Variante inválida.' });
      }
      const criado = criarSala(modoId, dados && dados.nome, varianteId);
      ligarSocket(criado.sala, criado.papel, socket);
      socket.emit('entrouSala', {
        codigo: criado.sala.codigo,
        cor: null,
        papel: criado.papel,
        token: criado.token,
        estado: estadoPublico(criado.sala, null),
        criador: true,
      });
    } catch (e) {
      socket.emit('erro', { mensagem: 'Não foi possível criar a sala.' });
    }
  });

  socket.on('entrarSala', (dados) => {
    if (!dentroDaTaxa(socket, 12, 10000)) return socket.emit('erro', { mensagem: 'Muitas tentativas. Espere um instante.' });
    const codigo = dados && String(dados.codigo || '').toUpperCase().trim();
    const token = dados && dados.token;
    if (!codigoValido(codigo)) return socket.emit('erro', { mensagem: 'Código de sala inválido.' });
    if (token && !tokenValido(token)) return socket.emit('erro', { mensagem: 'Identidade inválida.' });
    const sala = salas.get(codigo);
    if (!sala) return socket.emit('erro', { mensagem: 'Sala não encontrada.' });

    const lugar = sentar(sala, token || null, dados && dados.nome);
    if (lugar.erro) return socket.emit('erro', { mensagem: lugar.erro });

    const acabouDeCompletar = !lugar.reconectou && lugar.papel === 'convidado' && sala.status === 'aguardando';
    ligarSocket(sala, lugar.papel, socket);
    if (acabouDeCompletar) {
      irParaEscolhaDeCores(sala, sala.sugestaoCorAnfitriao || 'w');
    }
    socket.emit('entrouSala', {
      codigo: sala.codigo,
      cor: corDoPapel(sala, lugar.papel),
      papel: lugar.papel,
      token: lugar.token,
      estado: estadoPublico(sala, corDoPapel(sala, lugar.papel)),
      criador: lugar.papel === 'anfitriao',
      reconectou: !!lugar.reconectou,
    });
    if (acabouDeCompletar || sala.status === 'escolhendo-cores') {
      emitirSala(sala, 'escolherCores', {
        sugestao: sala.sugestaoCorAnfitriao || 'w',
      });
    } else {
      emitirOponente(sala, lugar.papel, 'oponenteReconectou', {
        cor: corDoPapel(sala, lugar.papel),
        papel: lugar.papel,
      });
    }
  });

  socket.on('reconectar', (dados) => {
    if (!dentroDaTaxa(socket, 15, 10000)) return socket.emit('erro', { mensagem: 'Muitas tentativas. Espere um instante.' });
    const codigo = dados && String(dados.codigo || '').toUpperCase().trim();
    const token = dados && dados.token;
    if (!codigoValido(codigo) || !tokenValido(token)) {
      return socket.emit('erro', { mensagem: 'Não foi possível reconectar.' });
    }
    const sala = salas.get(codigo);
    if (!sala) return socket.emit('erro', { mensagem: 'Sala não encontrada. Ela pode ter expirado.' });
    const achou = jogadorPorToken(sala, token);
    if (!achou) return socket.emit('erro', { mensagem: 'Esta identidade não pertence à sala.' });

    verificarFlag(sala);
    aplicarNome(achou.jogador, dados && dados.nome);
    ligarSocket(sala, achou.papel, socket);
    socket.emit('entrouSala', {
      codigo: sala.codigo,
      cor: achou.cor,
      papel: achou.papel,
      token: achou.jogador.token,
      estado: estadoPublico(sala, achou.cor),
      criador: achou.papel === 'anfitriao',
      reconectou: true,
    });
    if (sala.status === 'escolhendo-cores') {
      socket.emit('escolherCores', {
        estado: estadoPublico(sala, achou.cor),
        sugestao: sala.sugestaoCorAnfitriao || 'w',
      });
    }
    emitirOponente(sala, achou.papel, 'oponenteReconectou', {
      cor: achou.cor,
      papel: achou.papel,
    });
  });

  socket.on('atualizarNome', (dados) => {
    if (!dentroDaTaxa(socket, 8, 5000)) return;
    const sala = salas.get(socket.data.codigo);
    if (!sala || !socket.data.papel) return;
    const j = sala.participantes[socket.data.papel];
    if (!j) return;
    aplicarNome(j, dados && dados.nome);
    sala.ultimoEvento = Date.now();
    emitirEstado(sala);
  });

  socket.on('escolherCor', (dados) => {
    if (!dentroDaTaxa(socket, 10, 5000)) return;
    const sala = salas.get(socket.data.codigo);
    if (!sala || socket.data.papel !== 'anfitriao') {
      return socket.emit('erro', { mensagem: 'Só o anfitrião escolhe as cores.' });
    }
    if (sala.status !== 'escolhendo-cores') {
      return socket.emit('erro', { mensagem: 'Não é o momento de escolher as cores.' });
    }
    if (!sala.participantes.convidado) {
      return socket.emit('erro', { mensagem: 'Ainda falta o oponente.' });
    }
    const escolha = dados && dados.escolha;
    if (!ESCOLHAS_COR.has(escolha)) {
      return socket.emit('erro', { mensagem: 'Escolha de cor inválida.' });
    }
    const atrib = atribuirCores(sala, escolha);
    if (!atrib) return socket.emit('erro', { mensagem: 'Não foi possível atribuir as cores.' });
    iniciarPartidaAposCores(sala);
    for (const papel of ['anfitriao', 'convidado']) {
      const j = sala.participantes[papel];
      if (!j || !j.socketId) continue;
      const cor = corDoPapel(sala, papel);
      io.to(j.socketId).emit('coresDefinidas', {
        cor: cor,
        aleatorio: atrib.aleatorio,
        papel: papel,
        estado: estadoPublico(sala, cor),
      });
    }
  });

  // -------------------------------------------------------------------------
  // Montagem do modo Impostor (só no status 'montando')
  // -------------------------------------------------------------------------

  /** Valida o pedido de montagem e devolve a sala, ou null (já avisando o erro). */
  function salaEmMontagem() {
    const sala = salas.get(socket.data.codigo);
    const cor = socket.data.cor;
    if (!sala || !cor) { socket.emit('erro', { mensagem: 'Você não está em uma sala.' }); return null; }
    if (sala.variante.id !== 'impostor' || sala.status !== 'montando') {
      socket.emit('erro', { mensagem: 'Não é o momento de montar as peças.' });
      return null;
    }
    return sala;
  }

  socket.on('trocarFuncoes', (dados) => {
    if (!dentroDaTaxa(socket, 40, 5000)) return;
    const sala = salaEmMontagem();
    if (!sala) return;
    const cor = socket.data.cor;
    if (sala.montagem[cor]) return socket.emit('erro', { mensagem: 'Clique em “Editar” para mudar a montagem.' });
    const a = dados && dados.a;
    const b = dados && dados.b;
    const casaOk = (v) => Number.isInteger(v) && v >= 0 && v <= 63;
    if (!casaOk(a) || !casaOk(b) || !sala.jogo.trocarFuncoes(cor, a, b)) {
      return socket.emit('erro', { mensagem: 'Troca inválida.' });
    }
    sala.ultimoEvento = Date.now();
    // Só quem trocou precisa do novo tabuleiro; o oponente não vê nada mudar.
    socket.emit('estado', { estado: estadoPublico(sala, cor) });
  });

  socket.on('resetarFuncoes', () => {
    if (!dentroDaTaxa(socket, 10, 5000)) return;
    const sala = salaEmMontagem();
    if (!sala) return;
    const cor = socket.data.cor;
    if (sala.montagem[cor]) return;
    sala.jogo.resetarFuncoes(cor);
    sala.ultimoEvento = Date.now();
    socket.emit('estado', { estado: estadoPublico(sala, cor) });
  });

  socket.on('prontoMontagem', (dados) => {
    if (!dentroDaTaxa(socket, 10, 5000)) return;
    const sala = salaEmMontagem();
    if (!sala) return;
    const cor = socket.data.cor;
    sala.montagem[cor] = !(dados && dados.pronto === false);
    sala.ultimoEvento = Date.now();
    if (sala.montagem.w && sala.montagem.b) {
      comecarRelogioEPartida(sala);
      emitirSala(sala, 'partidaIniciada');
    } else {
      emitirEstado(sala);
    }
  });

  socket.on('lance', (dados) => {
    if (!dentroDaTaxa(socket, 20, 2000)) return socket.emit('erro', { mensagem: 'Calma — muitos lances seguidos.' });
    const sala = salas.get(socket.data.codigo);
    const cor = socket.data.cor;
    if (!sala || !cor) return socket.emit('erro', { mensagem: 'Você não está em uma sala.' });
    if (typeof dados !== 'object' || dados == null) return socket.emit('lanceIlegal', { motivo: 'Dados inválidos.' });

    const entrada = {
      from: dados.from,
      to: dados.to,
      promotion: dados.promotion || null,
    };
    // Aceita "e2" ou 12, mas rejeita tipos estranhos.
    const fromOk = (typeof entrada.from === 'number' && entrada.from >= 0 && entrada.from <= 63)
      || (typeof entrada.from === 'string' && /^[a-h][1-8]$/.test(entrada.from));
    const toOk = (typeof entrada.to === 'number' && entrada.to >= 0 && entrada.to <= 63)
      || (typeof entrada.to === 'string' && /^[a-h][1-8]$/.test(entrada.to));
    if (!fromOk || !toOk) return socket.emit('lanceIlegal', { motivo: 'Casa inválida.' });
    if (entrada.promotion && !/^[qrbnQRBN]$/.test(String(entrada.promotion))) {
      return socket.emit('lanceIlegal', { motivo: 'Promoção inválida.' });
    }

    const resultado = aplicarLance(sala, cor, entrada);
    if (resultado.flagged) {
      emitirSala(sala, 'fimDeJogo');
      return;
    }
    if (resultado.erro) {
      return socket.emit('lanceIlegal', { motivo: resultado.erro });
    }
    // No Impostor o lance já vem do motor sem segredos (só aparências e revelações).
    emitirSala(sala, 'lanceFeito', { lance: resultado.lance });
  });

  socket.on('desistir', () => {
    if (!dentroDaTaxa(socket, 8, 5000)) return;
    const sala = salas.get(socket.data.codigo);
    const cor = socket.data.cor;
    if (!sala || !cor) return;
    if (sala.status !== 'em_andamento') return socket.emit('erro', { mensagem: 'A partida não está em andamento.' });
    verificarFlag(sala);
    if (sala.status !== 'em_andamento') {
      emitirSala(sala, 'fimDeJogo');
      return;
    }
    encerrar(sala, { tipo: 'desistencia', vencedor: ladoOposto(cor), motivo: 'desistencia' });
    emitirSala(sala, 'fimDeJogo');
  });

  socket.on('proporEmpate', () => {
    if (!dentroDaTaxa(socket, 8, 5000)) return;
    const sala = salas.get(socket.data.codigo);
    const cor = socket.data.cor;
    if (!sala || !cor || sala.status !== 'em_andamento') return;
    if (verificarFlag(sala)) {
      emitirSala(sala, 'fimDeJogo');
      return;
    }
    if (sala.propostaEmpatePor === cor) return;
    if (sala.propostaEmpatePor === ladoOposto(cor)) {
      // O oponente já havia proposto: isto conta como aceite.
      encerrar(sala, { tipo: 'empate-acordo', vencedor: null, motivo: 'empate-acordo' });
      emitirSala(sala, 'fimDeJogo');
      return;
    }
    sala.propostaEmpatePor = cor;
    sala.ultimoEvento = Date.now();
    emitirSala(sala, 'propostaEmpate', { de: cor });
  });

  socket.on('responderEmpate', (dados) => {
    if (!dentroDaTaxa(socket, 8, 5000)) return;
    const sala = salas.get(socket.data.codigo);
    const cor = socket.data.cor;
    if (!sala || !cor || sala.status !== 'em_andamento') return;
    if (!sala.propostaEmpatePor || sala.propostaEmpatePor === cor) return;
    const aceitar = !!(dados && dados.aceitar);
    if (aceitar) {
      encerrar(sala, { tipo: 'empate-acordo', vencedor: null, motivo: 'empate-acordo' });
      emitirSala(sala, 'fimDeJogo');
    } else {
      sala.propostaEmpatePor = null;
      sala.ultimoEvento = Date.now();
      emitirSala(sala, 'empateRecusado', { por: cor });
    }
  });

  socket.on('revanche', () => {
    if (!dentroDaTaxa(socket, 8, 5000)) return;
    const sala = salas.get(socket.data.codigo);
    const papel = socket.data.papel;
    if (!sala || !papel || sala.status !== 'terminado') return;
    sala.revanche[papel] = true;
    sala.ultimoEvento = Date.now();
    if (sala.revanche.anfitriao && sala.revanche.convidado) {
      // Nova escolha de cores; a sugestão padrão é inverter a partida anterior.
      const previa = sala.corAnfitriao || 'w';
      irParaEscolhaDeCores(sala, ladoOposto(previa));
      emitirSala(sala, 'escolherCores', {
        sugestao: sala.sugestaoCorAnfitriao,
        revanche: true,
      });
    } else {
      emitirEstado(sala);
    }
  });

  socket.on('sairSala', () => {
    desconectarSocket(socket);
    if (socket.data.codigo) socket.leave('sala:' + socket.data.codigo);
    socket.data.codigo = null;
    socket.data.token = null;
    socket.data.cor = null;
    socket.data.papel = null;
  });

  socket.on('disconnect', () => {
    desconectarSocket(socket);
    janelasTaxa.delete(socket.id);
  });
});

// Relógios: detecta flag mesmo quando ninguém move, e envia tempos atualizados.
setInterval(() => {
  for (const sala of salas.values()) {
    if (sala.status !== 'em_andamento' || sala.modo.minutos == null) continue;
    if (verificarFlag(sala)) {
      emitirSala(sala, 'fimDeJogo');
    } else {
      io.to('sala:' + sala.codigo).emit('relogio', { relogio: relogioPublico(sala) });
    }
  }
}, 250);

// Limpeza de salas abandonadas.
setInterval(() => {
  const agora = Date.now();
  for (const [codigo, sala] of salas) {
    const a = sala.participantes && sala.participantes.anfitriao;
    const c = sala.participantes && sala.participantes.convidado;
    const algum = (a && a.conectado) || (c && c.conectado);
    let expirar = false;
    if ((sala.status === 'aguardando' || sala.status === 'escolhendo-cores') && agora - sala.criadoEm > MS_LIMPEZA_AGUARDANDO) expirar = true;
    if (!algum && agora - sala.ultimoEvento > MS_LIMPEZA_DESCONECTADOS) {
      const aAgo = a ? agora - a.ultimoVisto : Infinity;
      const cAgo = c ? agora - c.ultimoVisto : Infinity;
      if (Math.min(aAgo, cAgo) > MS_LIMPEZA_DESCONECTADOS) expirar = true;
    }
    if (sala.status === 'terminado' && !algum && agora - sala.ultimoEvento > MS_LIMPEZA_TERMINADA) expirar = true;
    if (expirar) {
      io.to('sala:' + codigo).emit('salaEncerrada', { motivo: 'A sala expirou por inatividade.' });
      salas.delete(codigo);
    }
  }
}, 30000);

servidorHttp.listen(PORT, '0.0.0.0', () => {
  console.log('Xadrez online em http://localhost:' + PORT);
});
