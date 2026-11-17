/**
 * Interface do xadrez local e online.
 * -----------------------------------
 * O motor (chess-engine.js) cuida das regras. Neste arquivo:
 *  - a tela inicial, as configurações e o tabuleiro;
 *  - a partida local (dois jogadores no mesmo computador);
 *  - a partida online (o servidor é a autoridade; daqui só enviamos lances).
 *
 * Relógio local: desfazer restaura o tempo de antes do lance; flag encerra o jogo.
 * Relógio online: o servidor envia os tempos; aqui só exibimos.
 * Desfazer fica desativado nas partidas online.
 *
 * Modo Impostor (só online): o servidor manda em estado.impostor.tabuleiro a
 * visão filtrada deste jogador (as próprias peças com a função real, as do
 * oponente só com a aparência). Desenhamos a aparência e, por cima, um selo
 * com a função real (nas nossas peças disfarçadas e nas peças reveladas).
 *
 * v1.3.0
 *  - Contra o bot (modoApp 'bot'): partida local em que um lado é o bot.
 *    O bot pensa num Web Worker (bot-worker.js), sem travar a interface.
 *  - Espectador (online.espectador): só assiste; recebe o estado público.
 *  - Chat rápido: frases prontas e emojis (chat-rapido.js), só online.
 *  - Revisar partida: depois do fim, navega lance a lance em qualquer modo.
 *    No Impostor, a revisão mostra a função real de cada peça.
 *  - Painel com subabas (Partida / Histórico / Chat / Opções).
 *  - Marcações (marcacoes.js): setas e círculos com o botão direito (ou toque
 *    longo no celular), só locais, a qualquer momento.
 *  - Pré-lance (prelance.js): online e contra o bot, agenda um lance na vez
 *    do adversário; ele sai sozinho assim que o adversário joga (se for legal).
 */
'use strict';

const MODOS = {
  livre:  { id: 'livre',  rotulo: 'Livre (sem tempo)', minutos: null, incremento: 0 },
  '10+0': { id: '10+0',   rotulo: 'Rápido 10 min',     minutos: 10,   incremento: 0 },
  '3+0':  { id: '3+0',    rotulo: 'Blitz 3 min',       minutos: 3,    incremento: 0 },
};
const TEMAS = ['madeira', 'verde', 'oceano'];
const CORES_TEMA = { madeira: '#12141a', verde: '#151714', oceano: '#04141c' };
const CONFIG_CHAVE = 'xadrez-config';
const CONFIG_PADRAO = {
  som: true,
  volume: 0.7,
  pacoteSom: 'moderno',
  tema: 'madeira',
  estiloPecas: 'classico',
  dicasLances: true,
  coordenadas: true,
  nome: '',
  nomeLocalPretas: 'Jogador 2',
  /** Chat rápido: true = não mostrar as mensagens do oponente. */
  chatMudo: false,
  /** Pré-lance (online e contra o bot): ligado por padrão. */
  prelance: true,
  /** Preferências do modo contra o bot (lembradas para a próxima vez). */
  botNivel: 'medio',
  botCor: 'w',
  /**
   * Versão do formato da configuração. A 2 (v1.3.0) trocou os estilos de
   * peça: quem tinha "staunton"/"unicode" passa para "classico" (o novo
   * padrão) e quem tinha "pixelado" passa para "pixel".
   */
  versaoConfig: 2,
};

const DURACAO_LANCE = 220;
const DURACAO_ENCAIXE = 150;

const TEXTOS_STATUS = {
  em_andamento: 'Partida em andamento',
  xeque: 'Xeque!',
  'xeque-mate': 'Xeque-mate',
  'empate-afogamento': 'Empate por afogamento',
  'empate-material': 'Empate por material insuficiente',
  'empate-50': 'Empate pela regra dos 50 lances',
  'empate-acordo': 'Empate por acordo',
  'empate-tempo': 'Empate — o adversário não pode dar mate',
  montando: 'Montando as peças (modo Impostor)…',
  'aguardando-jogadores': 'Aguardando os jogadores…',
};

const NOMES_FUNCAO = { k: 'Rei', q: 'Dama', r: 'Torre', b: 'Bispo', n: 'Cavalo', p: 'Peão' };

// ------------------------------------------------------------------------
// Configurações (valem para o modo local e o online)
// ------------------------------------------------------------------------

function sanitizarNome(n) {
  if (typeof n !== 'string') n = n == null ? '' : String(n);
  n = n.replace(/[\u0000-\u001F\u007F-\u009F<>&"'`]/g, '').replace(/\s+/g, ' ').trim();
  if (n.length > 20) n = n.slice(0, 20).trim();
  return n;
}
function nomeDoUsuario() {
  return sanitizarNome(config && config.nome);
}

function carregarConfig() {
  try {
    const bruto = localStorage.getItem(CONFIG_CHAVE);
    if (bruto) {
      const c = Object.assign({}, CONFIG_PADRAO, JSON.parse(bruto));
      let mudou = false;
      // Migração dos estilos de peça da v1.2.x para os novos (ver CONFIG_PADRAO).
      if (!c.versaoConfig || c.versaoConfig < 2) {
        const antigo = c.estiloPecas;
        c.estiloPecas = (antigo === 'pixelado' || antigo === 'plano') ? 'pixel' : 'classico';
        c.versaoConfig = 2;
        mudou = true;
      }
      const estiloOk = normalizarEstilo(c.estiloPecas);
      if (estiloOk !== c.estiloPecas) { c.estiloPecas = estiloOk; mudou = true; }
      const nome = sanitizarNome(c.nome);
      const nomeP = sanitizarNome(c.nomeLocalPretas) || 'Jogador 2';
      if (nome !== (c.nome || '')) { c.nome = nome; mudou = true; }
      else c.nome = nome;
      if (nomeP !== (c.nomeLocalPretas || '')) { c.nomeLocalPretas = nomeP; mudou = true; }
      else c.nomeLocalPretas = nomeP;
      if (mudou) {
        try { localStorage.setItem(CONFIG_CHAVE, JSON.stringify(c)); } catch (e) { /* ignore */ }
      }
      return c;
    }
  } catch (e) { /* ignore */ }
  const c = Object.assign({}, CONFIG_PADRAO);
  try {
    const t = localStorage.getItem('xadrez-tema');
    if (TEMAS.indexOf(t) !== -1) c.tema = t;
    if (localStorage.getItem('xadrez-mudo') === '1') c.som = false;
  } catch (e) { /* ignore */ }
  return c;
}

let config = carregarConfig();

function salvarConfig() {
  try { localStorage.setItem(CONFIG_CHAVE, JSON.stringify(config)); } catch (e) { /* ignore */ }
}

if (typeof SonsXadrez !== 'undefined' && SonsXadrez.configurar) {
  SonsXadrez.configurar(function () {
    return { som: config.som, volume: config.volume, pacoteSom: config.pacoteSom };
  });
}

function som(nome) {
  if (typeof SonsXadrez !== 'undefined') SonsXadrez.tocar(nome);
}

// ------------------------------------------------------------------------
// Estado da partida
// ------------------------------------------------------------------------

const jogo = new Chess();
let brancasEmbaixo = true;
let selecionada = null;
let lancesDaSelecao = [];
let promocaoPendente = null;
let arraste = null;
let animando = false;
/** Pré-lance agendado: {from, to} ou null (só um por vez). */
let prelance = null;
/** Setas e círculos desenhados pelo jogador (só locais). */
const marcas = MarcacoesTabuleiro.novoEstado();
/** Seta sendo desenhada com o botão direito: {de, para, cor} ou null. */
let marcaArrastando = null;
/** Qual posição as marcações acompanham (mudou de posição → apagam). */
let chaveDasMarcas = '';
let modoAtual = MODOS.livre;
let modoApp = 'inicio'; // 'inicio' | 'local' | 'bot' | 'online'

/**
 * Partida contra o bot. corJogador é a cor do humano; o bot joga a outra.
 * idPedido descarta respostas antigas do Worker (ex.: depois de desfazer).
 */
const NOMES_NIVEL = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };
const bot = {
  nivel: 'medio',
  corJogador: 'w',
  pensando: false,
  idPedido: 0,
  worker: null,
};

/**
 * Revisão da partida: lista de posições (uma por meio-lance, a 0 é o início)
 * e o índice que está na tela. Cada posição: { tabuleiro, visao, ultimo }.
 */
const revisao = { ativa: false, indice: 0, posicoes: [] };

const relogio = { w: 0, b: 0, ativo: null, ultimoTick: 0, pausado: true };
let historicoRelogio = [];
let fimPorTempo = null;
let partidaIniciada = false;
let idLoopRelogio = null;
let ultimoSegundoTicado = null;

/** Sessão online. token fica em sessionStorage (aba) e localStorage (reabrir). */
const online = {
  ativo: false,
  codigo: null,
  token: null,
  cor: null,
  papel: null,
  estado: null,
  aguardando: false,
  escolhendoCores: false,
  /** true quando só estamos assistindo (sem cor, sem token). */
  espectador: false,
};
let socket = null;
let relogioOnline = null;
/** Impostor: primeira peça escolhida para a troca de funções na montagem. */
let selecaoMontagem = null;

// DOM
const elTelaSplash = document.getElementById('tela-splash');
const elTelaNome = document.getElementById('tela-nome');
const elTelaInicio = document.getElementById('tela-inicio');
const elTelaJogo = document.getElementById('tela-jogo');
const elTabuleiro = document.getElementById('tabuleiro');
const elCoordEsq = document.getElementById('coordenadas-esq');
const elCoordBase = document.getElementById('coordenadas-base');
const elFantasma = document.getElementById('fantasma');
const elTextoVez = document.getElementById('texto-vez');
const elPecaVez = document.getElementById('peca-vez');
const elStatus = document.getElementById('status-jogo');
const elModoAtual = document.getElementById('modo-atual');
const elSuaCor = document.getElementById('sua-cor');
const elHistorico = document.getElementById('historico');
const elCapBrancas = document.getElementById('capturadas-brancas');
const elCapPretas = document.getElementById('capturadas-pretas');
const elModalPromocao = document.getElementById('modal-promocao');
const elModalModos = document.getElementById('modal-modos');
const elModalCriar = document.getElementById('modal-criar');
const elModalConfig = document.getElementById('modal-config');
const elModalEmpate = document.getElementById('modal-empate');
const elModalConfirma = document.getElementById('modal-confirma');
const elBtnModosCancelar = document.getElementById('btn-modos-cancelar');
const elCartaoRelogios = document.getElementById('cartao-relogios');
const elRelW = document.getElementById('rel-brancas');
const elRelB = document.getElementById('rel-pretas');
const elBoxW = document.getElementById('relogio-w');
const elBoxB = document.getElementById('relogio-b');
const elFaixaOnline = document.getElementById('faixa-online');
const elOverlayEspera = document.getElementById('overlay-espera');
const elOverlayCores = document.getElementById('overlay-cores');
const elMenuCoresAnfitriao = document.getElementById('menu-cores-anfitriao');
const elEsperaCoresConvidado = document.getElementById('espera-cores-convidado');
const elRevelarCor = document.getElementById('revelar-cor');
const elTextoRevelarCor = document.getElementById('texto-revelar-cor');
const elAvisoConexao = document.getElementById('aviso-conexao');
const elBtnRevanche = document.getElementById('btn-revanche');
const elBtnDesfazer = document.getElementById('btn-desfazer');
const elBtnGirar = document.getElementById('btn-girar');
const elBtnNovo = document.getElementById('btn-novo');
const elSubtitulo = document.getElementById('subtitulo-jogo');
const elToast = document.getElementById('toast');
const elModalBot = document.getElementById('modal-bot');
const elBtnRevisar = document.getElementById('btn-revisar');
const elBarraRevisao = document.getElementById('barra-revisao');
const elCamadaMarcas = document.getElementById('camada-marcas');
const elAvisoPrelance = document.getElementById('aviso-prelance');

// ------------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------------

function movimentoReduzido() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }
function elementoCasa(sq) { return elTabuleiro.querySelector('.casa[data-square="' + sq + '"]'); }
function pontoDaCasa(sq) {
  const el = elementoCasa(sq);
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function estiloPecas() { return normalizarEstilo(config.estiloPecas); }

// ------------------------------------------------------------------------
// Modo Impostor (auxiliares)
// ------------------------------------------------------------------------

/** A partida online atual é do modo Impostor? */
function ehImpostor() {
  return !!(online.ativo && online.estado && online.estado.variante === 'impostor' && online.estado.impostor);
}
/** Estamos na fase de montagem (troca de funções antes do relógio)? */
function emMontagem() {
  return ehImpostor() && online.estado.statusSala === 'montando';
}
/** Visão filtrada do tabuleiro enviada pelo servidor (ou null no clássico). */
function visaoImpostor() {
  if (revisao.ativa) return revisao.posicoes[revisao.indice].visao;
  return ehImpostor() ? online.estado.impostor.tabuleiro : null;
}
/** Impostor terminado: o servidor já revelou todas as funções. */
function impostorRevelado() {
  return ehImpostor() && online.estado.statusSala === 'terminado' && !!online.estado.impostor.revelacao;
}
/** Letra da peça como ela APARECE (maiúscula = branca), no formato do motor. */
function letraDaVisao(v) {
  if (!v) return null;
  return v.c === 'w' ? v.a.toUpperCase() : v.a;
}
/** Tabuleiro de letras que desenhamos: aparências no Impostor, motor no clássico. */
function tabuleiroVisivel() {
  if (revisao.ativa) return revisao.posicoes[revisao.indice].tabuleiro;
  const visao = visaoImpostor();
  return visao ? visao.map(letraDaVisao) : jogo.obterTabuleiro();
}
/**
 * Lances (dicas) da peça em `sq`. No Impostor usamos a função real das nossas
 * peças; quem decide se o lance é legal é sempre o servidor.
 */
function lancesDaCasa(sq) {
  if (ehImpostor()) {
    if (emMontagem()) return [];
    return Impostor.lancesDica(visaoImpostor(), sq, ultimoLanceAtual());
  }
  return jogo.lances(sq);
}

function partidaAcabou() {
  if (online.ativo && online.estado) {
    return online.estado.statusSala === 'terminado' || !!online.estado.resultado;
  }
  return !!fimPorTempo || jogo.jogoAcabou();
}

function interacaoBloqueada() {
  if (animando || partidaAcabou() || promocaoPendente || revisao.ativa) return true;
  if (!elModalModos.hidden || !elModalCriar.hidden || !elModalConfig.hidden || !elModalBot.hidden) return true;
  if (online.espectador) return true;
  // Na vez do bot só dá para agendar um pré-lance (se estiver ligado).
  if (modoApp === 'bot' && (bot.pensando || jogo.vez() !== bot.corJogador)) return !emModoPrelance();
  if (online.ativo && online.estado) {
    const st = online.estado.statusSala;
    if (st === 'aguardando' || st === 'escolhendo-cores' || st === 'montando') return true;
  }
  if (online.ativo && (online.aguardando || online.escolhendoCores)) return true;
  if (elOverlayCores && !elOverlayCores.hidden && elRevelarCor && elRevelarCor.hidden) return true;
  return false;
}

function toast(msg) {
  elToast.textContent = msg;
  elToast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { elToast.hidden = true; }, 2800);
}

function confirmar(titulo, texto) {
  return new Promise((resolve) => {
    document.getElementById('titulo-confirma').textContent = titulo;
    document.getElementById('texto-confirma').textContent = texto;
    elModalConfirma.hidden = false;
    const limpar = (valor) => {
      elModalConfirma.hidden = true;
      document.getElementById('btn-confirma-sim').onclick = null;
      document.getElementById('btn-confirma-nao').onclick = null;
      resolve(valor);
    };
    document.getElementById('btn-confirma-sim').onclick = () => limpar(true);
    document.getElementById('btn-confirma-nao').onclick = () => limpar(false);
  });
}

function linkDaSala(codigo) {
  return location.origin + '/?sala=' + codigo;
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Link copiado.');
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Link copiado.');
      return true;
    } catch (e2) {
      toast('Não foi possível copiar. Código: ' + texto);
      return false;
    }
  }
}

// ------------------------------------------------------------------------
// Temas e configurações
// ------------------------------------------------------------------------

function aplicarTema(id, opcoes) {
  const tema = TEMAS.indexOf(id) !== -1 ? id : 'madeira';
  const atual = document.documentElement.getAttribute('data-tema');
  document.documentElement.setAttribute('data-tema', tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', CORES_TEMA[tema]);
  if (config.tema !== tema) {
    config.tema = tema;
    salvarConfig();
  }
  sincronizarBotoesConfig();
  if ((!opcoes || !opcoes.silencioso) && tema !== atual) som('tema');
}

function aplicarPreferenciasVisuais() {
  elCoordEsq.classList.toggle('oculto', !config.coordenadas);
  elCoordBase.classList.toggle('oculto', !config.coordenadas);
}

function atualizarControleSom() {
  const btn = document.getElementById('cfg-som');
  const rotulo = document.getElementById('cfg-som-rotulo');
  if (!btn) return;
  const ligado = !!config.som;
  btn.setAttribute('aria-checked', ligado ? 'true' : 'false');
  if (rotulo) rotulo.textContent = ligado ? 'Som: ligado' : 'Som: desligado';
}

function alternarMudo() {
  config.som = !config.som;
  salvarConfig();
  atualizarControleSom();
  sincronizarBotoesConfig();
  if (config.som) {
    if (SonsXadrez && SonsXadrez.garantirAudio) SonsXadrez.garantirAudio();
    som('clique');
  }
}

function sincronizarBotoesConfig() {
  const vol = document.getElementById('cfg-volume');
  const volV = document.getElementById('cfg-volume-valor');
  const dicas = document.getElementById('cfg-dicas');
  const coords = document.getElementById('cfg-coordenadas');
  atualizarControleSom();
  if (vol) vol.value = String(Math.round((config.volume || 0) * 100));
  if (volV) volV.textContent = Math.round((config.volume || 0) * 100) + '%';
  if (dicas) dicas.checked = !!config.dicasLances;
  if (coords) coords.checked = !!config.coordenadas;
  const inNome = document.getElementById('cfg-nome');
  const inPretas = document.getElementById('cfg-nome-pretas');
  if (inNome && document.activeElement !== inNome) inNome.value = config.nome || '';
  if (inPretas && document.activeElement !== inPretas) inPretas.value = config.nomeLocalPretas || 'Jogador 2';
  document.querySelectorAll('#modal-config [data-cfg]').forEach((btn) => {
    const chave = btn.getAttribute('data-cfg');
    btn.setAttribute('aria-pressed', String(config[chave] === btn.getAttribute('data-valor')));
  });
  // Atalhos da aba Opções e o "silenciar" do chat.
  document.querySelectorAll('[data-estilo-rapido]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-estilo-rapido') === estiloPecas()));
  });
  const somRapido = document.getElementById('btn-som-rapido');
  if (somRapido) {
    somRapido.setAttribute('aria-pressed', String(!!config.som));
    somRapido.textContent = config.som ? '🔊 Som ligado' : '🔇 Som desligado';
  }
  for (const id of ['cfg-chat-mudo', 'cfg-chat-mudo-geral']) {
    const el = document.getElementById(id);
    if (el) el.checked = !!config.chatMudo;
  }
  if (typeof sincronizarCorBot === 'function') sincronizarCorBot();
  if (typeof sincronizarBotaoPrelance === 'function') sincronizarBotaoPrelance();
  atualizarAmostraPecas();
}

function atualizarAmostraPecas() {
  const el = document.getElementById('amostra-pecas');
  if (!el) return;
  el.innerHTML = '';
  ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'].forEach((p) => {
    el.appendChild(criarElementoPeca(p, estiloPecas()));
  });
}

function abrirConfig() {
  sincronizarBotoesConfig();
  elModalConfig.hidden = false;
  som('menu');
}
function fecharConfig() { elModalConfig.hidden = true; }

// ------------------------------------------------------------------------
// Telas
// ------------------------------------------------------------------------

/** Mostra uma tela: 'splash' (abertura), 'nome', 'inicio' (menu) ou 'jogo'. */
function mostrarTela(nome) {
  if (elTelaSplash) elTelaSplash.hidden = nome !== 'splash';
  if (elTelaNome) elTelaNome.hidden = nome !== 'nome';
  elTelaInicio.hidden = nome !== 'inicio';
  elTelaJogo.hidden = nome !== 'jogo';
}

function irParaInicio() {
  mostrarTela(nomeDoUsuario() ? 'inicio' : 'nome');
}

function voltarAoInicio() {
  if (online.ativo && socket) {
    socket.emit(online.espectador ? 'pararDeAssistir' : 'sairSala');
  }
  cancelarPensamentoBot();
  sairRevisao({ semRender: true });
  prelance = null;
  MarcacoesTabuleiro.limpar(marcas);
  elModalBot.hidden = true;
  online.espectador = false;
  online.ativo = false;
  online.codigo = null;
  online.token = null;
  online.cor = null;
  online.papel = null;
  online.estado = null;
  online.aguardando = false;
  online.escolhendoCores = false;
  if (elOverlayCores) elOverlayCores.hidden = true;
  if (elRevelarCor) elRevelarCor.hidden = true;
  modoApp = 'inicio';
  promocaoPendente = null;
  fecharPromocao();
  elModalEmpate.hidden = true;
  pausarRelogio();
  irParaInicio();
}

// ------------------------------------------------------------------------
// Tabuleiro
// ------------------------------------------------------------------------

function ordemDasCasas() {
  const casas = [];
  for (let linha = 0; linha < 8; linha++) {
    for (let coluna = 0; coluna < 8; coluna++) {
      const arquivo = brancasEmbaixo ? coluna : 7 - coluna;
      const rank = brancasEmbaixo ? 7 - linha : linha;
      casas.push(rank * 8 + arquivo);
    }
  }
  return casas;
}

function criarTabuleiro() {
  elTabuleiro.innerHTML = '';
  for (const sq of ordemDasCasas()) {
    const casa = document.createElement('div');
    casa.className = 'casa';
    casa.dataset.square = String(sq);
    casa.setAttribute('role', 'gridcell');
    const arquivo = sq % 8;
    const rank = Math.floor(sq / 8);
    casa.classList.add((arquivo + rank) % 2 === 0 ? 'escura' : 'clara');
    casa.addEventListener('mousedown', noMouseDown);
    casa.addEventListener('click', noClique);
    casa.addEventListener('touchstart', noTouchStart, { passive: false });
    elTabuleiro.appendChild(casa);
  }
  desenharCoordenadas();
  aplicarPreferenciasVisuais();
}

function desenharCoordenadas() {
  const arquivos = brancasEmbaixo ? 'abcdefgh' : 'hgfedcba';
  const ranks = brancasEmbaixo ? '87654321' : '12345678';
  elCoordEsq.innerHTML = '';
  elCoordBase.innerHTML = '';
  for (const r of ranks) {
    const s = document.createElement('span');
    s.textContent = r;
    elCoordEsq.appendChild(s);
  }
  for (const a of arquivos) {
    const s = document.createElement('span');
    s.textContent = a;
    elCoordBase.appendChild(s);
  }
}

function historicoAtual() {
  if (online.ativo && online.estado && online.estado.historico) return online.estado.historico;
  return jogo.historicoSan();
}
function capturadasAtuais() {
  if (online.ativo && online.estado && online.estado.capturadas) return online.estado.capturadas;
  return jogo.pecasCapturadas();
}
function ultimoLanceAtual() {
  if (revisao.ativa) return revisao.posicoes[revisao.indice].ultimo;
  if (online.ativo && online.estado && online.estado.ultimoLance) return online.estado.ultimoLance;
  return jogo.ultimoLance();
}

function statusEfetivo() {
  if (emMontagem()) return 'montando';
  if (online.espectador && online.estado && !online.estado.resultado &&
      (online.estado.statusSala === 'aguardando' || online.estado.statusSala === 'escolhendo-cores')) {
    return 'aguardando-jogadores';
  }
  if (online.ativo && online.estado) {
    if (online.estado.resultado) return online.estado.resultado.tipo;
    return online.estado.statusJogo || 'em_andamento';
  }
  if (fimPorTempo) return fimPorTempo.tipo;
  return jogo.status();
}

function resultadoAtual() {
  if (online.ativo && online.estado) return online.estado.resultado;
  return fimPorTempo;
}

function renderizar(opcoes) {
  const tabuleiro = tabuleiroVisivel();
  const visao = visaoImpostor();
  const ultimo = ultimoLanceAtual();
  const status = statusEfetivo();
  let reiEmXeque = -1;
  if (!revisao.ativa && (status === 'xeque' || status === 'xeque-mate')) {
    // No Impostor o rei em xeque já foi revelado: é a peça com função de rei.
    reiEmXeque = visao
      ? visao.findIndex((v) => v && v.c === jogo.vez() && v.f === 'k')
      : jogo.casaDoRei(jogo.vez());
  }
  const destinos = new Map();
  if (config.dicasLances) {
    for (const lance of lancesDaSelecao) {
      destinos.set(lance.to, lance.captured ? 'captura' : 'vazio');
    }
  }

  // Pré-lance some se a partida acabou, se entramos na revisão ou se a opção foi desligada.
  if (prelance && (partidaAcabou() || revisao.ativa || !config.prelance)) prelance = null;
  elTabuleiro.classList.toggle('modo-prelance', selecionada !== null && emModoPrelance());

  for (const casa of elTabuleiro.children) {
    const sq = Number(casa.dataset.square);
    casa.classList.toggle('selecionada', selecionada === sq || (emMontagem() && selecaoMontagem === sq));
    casa.classList.toggle('prelance-origem', !!(prelance && prelance.from === sq));
    casa.classList.toggle('prelance-destino', !!(prelance && prelance.to === sq));
    casa.classList.toggle('em-xeque', reiEmXeque === sq);
    casa.classList.toggle('ultimo-lance', !!(ultimo && (ultimo.from === sq || ultimo.to === sq)));
    casa.classList.toggle('destino-vazio', destinos.get(sq) === 'vazio');
    casa.classList.toggle('destino-captura', destinos.get(sq) === 'captura');

    const peca = tabuleiro[sq];
    const atual = casa.querySelector('.peca');
    atualizarSeloImpostor(casa, visao ? visao[sq] : null);
    if (!peca) {
      if (atual) atual.remove();
      casa.removeAttribute('aria-label');
      continue;
    }
    if (atual) {
      aplicarEstiloEm(atual, peca, estiloPecas());
      atual.classList.remove('escondida', 'arrastando');
    } else {
      casa.appendChild(criarElementoPeca(peca, estiloPecas()));
    }
    const cor = peca === peca.toUpperCase() ? 'branca' : 'preta';
    let rotulo = nomeDaPeca(peca) + ' ' + cor + ' em ' + casaParaAlgebrica(sq);
    const v = visao && visao[sq];
    if (v && v.f && v.f !== v.a) rotulo += ' (anda como ' + NOMES_FUNCAO[v.f].toLowerCase() + ')';
    if (v && v.r) rotulo += ', revelada';
    casa.setAttribute('aria-label', rotulo);
  }
  atualizarPainel(status, opcoes && opcoes.capturaRecente);
  atualizarAvisoPrelance();
  // Mudou a posição mostrada (lance novo, outra partida, outro ponto da
  // revisão)? As marcações eram da posição anterior: apagam.
  const chave = [modoApp, online.codigo || '', revisao.ativa ? 'r' + revisao.indice : 'j', historicoAtual().length].join(':');
  if (chave !== chaveDasMarcas) {
    chaveDasMarcas = chave;
    MarcacoesTabuleiro.limpar(marcas);
    marcaArrastando = null;
  }
  desenharMarcacoes();
}

/**
 * Impostor: marca a casa e coloca o selo com a função real.
 *  - peça revelada (todos veem): contorno colorido + selo destacado;
 *  - peça nossa disfarçada (só nós vemos): selo discreto com a função real.
 * O selo fica fora do elemento .peca, porque ele é redesenhado ao trocar o estilo.
 */
/** Legenda do painel depois do fim do Impostor (funções reveladas a todos). */
const LEGENDA_FIM_IMPOSTOR =
  '<span class="legenda-item"><span class="amostra-selo amostra-selo-final" aria-hidden="true">♛</span> selo dourado: função real da impostora</span>' +
  '<span class="legenda-item">sem selo: a peça era o que parecia</span>';

function atualizarSeloImpostor(casa, v) {
  let selo = casa.querySelector('.selo-funcao');
  const minha = !!(v && v.c === online.cor);
  const revelada = !!(v && v.r);
  // No fim (e na revisão) tudo é público: todo impostor ganha o selo "final".
  const fim = !!(v && v.f && (revisao.ativa || impostorRevelado()));
  const impostora = !!(v && v.f && v.f !== v.a);
  const disfarcada = !!(impostora && !revelada && (minha || fim));
  casa.classList.toggle('peca-revelada', revelada);
  casa.classList.toggle('peca-disfarcada', disfarcada && !fim);
  casa.classList.toggle('peca-impostora-fim', fim && impostora && !revelada);
  if (!v || !v.f || !(revelada || disfarcada)) {
    if (selo) selo.remove();
    return;
  }
  if (!selo) {
    selo = document.createElement('span');
    selo.className = 'selo-funcao';
    selo.setAttribute('aria-hidden', 'true');
    casa.appendChild(selo);
  }
  selo.textContent = SIMBOLOS_UNICODE[v.f] || '?';
  selo.classList.toggle('selo-revelado', revelada);
  selo.classList.toggle('selo-final', fim && !revelada);
  selo.classList.toggle('selo-preta', v.c === 'b');
  selo.title = (revelada ? 'Revelada: ' : (fim ? 'Era ' : 'Anda como ')) + NOMES_FUNCAO[v.f];
}

function nomeDaPeca(peca) {
  const nomes = { k: 'rei', q: 'dama', r: 'torre', b: 'bispo', n: 'cavalo', p: 'peão' };
  return nomes[peca.toLowerCase()] || peca;
}

function atualizarPainel(status, capturaRecente) {
  const vezBrancas = jogo.vez() === 'w';
  const nomeVez = nomeDoLado(vezBrancas ? 'w' : 'b');
  const corVez = vezBrancas ? 'Brancas' : 'Pretas';
  elTextoVez.textContent = (nomeVez && nomeVez !== corVez) ? nomeVez : corVez;
  elPecaVez.innerHTML = '';
  elPecaVez.appendChild(criarElementoPeca(vezBrancas ? 'K' : 'k', estiloPecas()));

  let textoStatus = montarMensagemStatus(status);
  if (modoApp === 'bot' && bot.pensando && !partidaAcabou()) textoStatus = '🤖 O bot está pensando…';
  if (revisao.ativa) textoStatus = '🔍 Revisando — ' + textoStatus;
  elStatus.textContent = textoStatus;
  elStatus.className = 'status-jogo ' + classeDoStatus(status) + (modoApp === 'bot' && bot.pensando ? ' pensando' : '');
  const rotuloVariante = online.ativo && online.estado && online.estado.variante === 'impostor' ? ' · Impostor' : '';
  if (modoApp === 'bot') {
    elModoAtual.textContent = 'Modo: Contra o bot · ' + NOMES_NIVEL[bot.nivel];
  } else {
    elModoAtual.textContent = 'Modo: ' + (online.estado && online.estado.rotuloModo ? online.estado.rotuloModo : modoAtual.rotulo) + rotuloVariante;
  }
  const elLegenda = document.getElementById('legenda-impostor');
  if (elLegenda) {
    // No fim do Impostor a legenda muda: tudo foi revelado para todos.
    const fimRevelado = ehImpostor() && (revisao.ativa || impostorRevelado());
    if (!elLegenda.dataset.original) elLegenda.dataset.original = elLegenda.innerHTML;
    const html = fimRevelado ? LEGENDA_FIM_IMPOSTOR : elLegenda.dataset.original;
    if (elLegenda.innerHTML !== html) elLegenda.innerHTML = html;
    elLegenda.hidden = !ehImpostor() || (online.espectador && !fimRevelado);
  }

  if (online.ativo && online.espectador) {
    elSuaCor.hidden = false;
    elSuaCor.textContent = '👁️ Você está assistindo';
  } else if (online.ativo && online.cor) {
    elSuaCor.hidden = false;
    elSuaCor.textContent = 'Você joga com as ' + (online.cor === 'w' ? 'brancas' : 'pretas');
  } else if (modoApp === 'bot') {
    elSuaCor.hidden = false;
    elSuaCor.textContent = 'Você joga com as ' + (bot.corJogador === 'w' ? 'brancas' : 'pretas');
  } else {
    elSuaCor.hidden = true;
  }

  desenharHistorico();

  const caps = revisao.ativa ? revisao.posicoes[revisao.indice].capturadas : capturadasAtuais();
  preencherCapturas(elCapBrancas, caps.w || [], capturaRecente);
  preencherCapturas(elCapPretas, caps.b || [], capturaRecente);

  atualizarBotoesDaPartida();
  atualizarNomesNaInterface();
  pintarRelogios();
}

/** Histórico em duas colunas; depois do fim, cada lance é clicável (revisão). */
function desenharHistorico() {
  const sans = historicoAtual();
  const clicavel = podeRevisar();
  elHistorico.innerHTML = '';
  elHistorico.classList.toggle('clicavel', clicavel);
  const atual = revisao.ativa ? revisao.indice : -1;
  for (let i = 0; i < sans.length; i += 2) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = (i / 2 + 1) + '.';
    li.appendChild(num);
    for (const ply of [i, i + 1]) {
      const el = document.createElement(clicavel && sans[ply] ? 'button' : 'span');
      el.className = 'lance';
      el.textContent = sans[ply] || '';
      if (clicavel && sans[ply]) {
        el.type = 'button';
        // A posição DEPOIS do meio-lance `ply` é a de índice ply + 1.
        el.dataset.ply = String(ply + 1);
        el.setAttribute('aria-label', 'Ver a posição depois de ' + sans[ply]);
      }
      if (atual === ply + 1) el.classList.add('lance-atual');
      li.appendChild(el);
    }
    elHistorico.appendChild(li);
  }
  const foco = elHistorico.querySelector('.lance-atual') || elHistorico.lastElementChild;
  if (foco && !document.getElementById('painel-historico').hidden) foco.scrollIntoView({ block: 'nearest' });
  const dica = document.getElementById('dica-historico');
  if (dica) dica.hidden = !clicavel;
}

/**
 * Mostra só as ações que fazem sentido agora (as secundárias ficam na aba
 * Opções). Online: Desistir/Empate durante a partida, Revanche no fim.
 * Local e bot: Novo jogo. Em qualquer modo, Revisar partida no fim.
 */
function atualizarBotoesDaPartida() {
  const acabou = partidaAcabou();
  const jogador = online.ativo && !online.espectador;
  const emAndamento = online.ativo && online.estado && online.estado.statusSala === 'em_andamento';
  document.getElementById('btn-desistir').hidden = !(jogador && emAndamento && !acabou);
  document.getElementById('btn-empate').hidden = !(jogador && emAndamento && !acabou);
  elBtnRevanche.hidden = !(jogador && acabou);
  if (jogador && online.estado && online.estado.revanche && online.papel) {
    elBtnRevanche.textContent = online.estado.revanche[online.papel] ? 'Aguardando oponente…' : 'Revanche';
  }
  elBtnRevisar.hidden = !podeRevisar() || revisao.ativa;
  elBtnNovo.hidden = online.ativo;
  elBtnNovo.textContent = modoApp === 'bot' ? 'Nova partida contra o bot' : 'Novo jogo';

  const local = !online.ativo;
  elBtnDesfazer.hidden = !local;
  elBtnDesfazer.disabled = !local || historicoAtual().length === 0 || !!fimPorTempo || animando || partidaAcabou() || revisao.ativa ||
    (modoApp === 'bot' && historicoAtual().length < 1);
  elBtnGirar.disabled = animando;
  const btnInicio = document.getElementById('btn-inicio');
  btnInicio.textContent = online.espectador ? 'Parar de assistir' : (online.ativo ? 'Sair da sala' : 'Voltar ao início');
}

function preencherCapturas(el, pecas, capturaRecente) {
  el.innerHTML = '';
  let jaDestacou = false;
  const nos = [];
  for (let i = pecas.length - 1; i >= 0; i--) {
    const s = criarElementoPeca(pecas[i], estiloPecas());
    if (capturaRecente && pecas[i] === capturaRecente && !jaDestacou) {
      s.classList.add('nova-captura');
      jaDestacou = true;
    }
    nos.push(s);
  }
  nos.reverse().forEach((n) => el.appendChild(n));
}

function nomeDoLado(cor) {
  if (modoApp === 'bot') {
    if (cor !== bot.corJogador) return '🤖 Bot (' + NOMES_NIVEL[bot.nivel] + ')';
    return nomeDoUsuario() || 'Você';
  }
  if (online.ativo && online.estado && online.estado.nomes) {
    const n = sanitizarNome(online.estado.nomes[cor]);
    if (n) return n;
  }
  if (cor === 'w') return nomeDoUsuario() || 'Brancas';
  return sanitizarNome(config.nomeLocalPretas) || 'Jogador 2';
}

function rotuloVencedor(cor) {
  const n = nomeDoLado(cor);
  const padrao = cor === 'w' ? 'Brancas' : 'Pretas';
  if (!n || n === padrao) return padrao + ' vencem';
  return n + ' venceu';
}

function montarMensagemStatus(status) {
  const res = resultadoAtual();
  if (status === 'xeque-mate') {
    const cor = (res && res.vencedor) ? res.vencedor : (jogo.vez() === 'w' ? 'b' : 'w');
    return 'Xeque-mate — ' + rotuloVencedor(cor) + '!';
  }
  if (status === 'tempo') {
    const cor = res && res.vencedor ? res.vencedor : 'w';
    return rotuloVencedor(cor) + ' no tempo';
  }
  if (status === 'desistencia') {
    const cor = res && res.vencedor ? res.vencedor : 'w';
    return rotuloVencedor(cor) + ' — desistência';
  }
  return TEXTOS_STATUS[status] || '';
}


function preencherBarraLado(el, cor) {
  if (!el) return;
  const nome = nomeDoLado(cor);
  const rotulo = cor === 'w' ? 'Brancas' : 'Pretas';
  const nEl = el.querySelector('.barra-nome');
  const cEl = el.querySelector('.barra-cor');
  const tEl = el.querySelector('.barra-tempo');
  if (nEl) nEl.textContent = nome || rotulo;
  if (cEl) cEl.textContent = rotulo;
  if (tEl) {
    const temRelogio = !elCartaoRelogios.hidden && modoAtual && modoAtual.minutos != null;
    tEl.textContent = temRelogio ? (document.getElementById(cor === 'w' ? 'rel-brancas' : 'rel-pretas').textContent) : '';
    tEl.hidden = !temRelogio;
  }
  el.classList.toggle('ativo', relogio.ativo === cor && !elCartaoRelogios.hidden);
}

function atualizarNomesNaInterface() {
  const nw = nomeDoLado('w');
  const nb = nomeDoLado('b');
  const elW = document.getElementById('nome-rel-w');
  const elB = document.getElementById('nome-rel-b');
  if (elW) elW.textContent = nw && nw !== 'Brancas' ? nw : '';
  if (elB) elB.textContent = nb && nb !== 'Pretas' ? nb : '';

  const topo = document.getElementById('barra-lado-topo');
  const base = document.getElementById('barra-lado-base');
  const corBase = brancasEmbaixo ? 'w' : 'b';
  const corTopo = brancasEmbaixo ? 'b' : 'w';
  if (topo) preencherBarraLado(topo, corTopo);
  if (base) preencherBarraLado(base, corBase);

  const espera = document.getElementById('nome-espera');
  if (espera) {
    const eu = nomeDoUsuario();
    const op = online.estado && online.estado.nomes && (
      online.papel === 'anfitriao' ? online.estado.nomes.convidado : online.estado.nomes.anfitriao
    );
    espera.textContent = eu ? ('Você: ' + eu + (op ? '  ·  Oponente: ' + sanitizarNome(op) : '')) : '';
  }
  const nomesCores = document.getElementById('nomes-cores');
  if (nomesCores && online.estado && online.estado.nomes) {
    const a = sanitizarNome(online.estado.nomes.anfitriao) || 'Anfitrião';
    const c = sanitizarNome(online.estado.nomes.convidado) || 'Convidado';
    nomesCores.textContent = a + '  ·  ' + c;
  } else if (nomesCores) {
    nomesCores.textContent = '';
  }
}

function classeDoStatus(status) {
  if (status === 'xeque') return 'xeque';
  if (status === 'xeque-mate' || status === 'desistencia' || status === 'tempo') return 'mate';
  if (String(status).indexOf('empate') === 0) return 'empate';
  return 'andamento';
}

// ------------------------------------------------------------------------
// Relógios (locais; no online só exibem o que o servidor manda)
// ------------------------------------------------------------------------

function iniciarRelogiosDoModo(modo) {
  fimPorTempo = null;
  historicoRelogio = [];
  ultimoSegundoTicado = null;
  if (modo.minutos == null) {
    relogio.w = 0; relogio.b = 0; relogio.ativo = null; relogio.pausado = true;
    elCartaoRelogios.hidden = true;
    pintarRelogios();
    return;
  }
  const ms = modo.minutos * 60 * 1000;
  relogio.w = ms; relogio.b = ms;
  relogio.ativo = 'w';
  relogio.pausado = false;
  relogio.ultimoTick = performance.now();
  elCartaoRelogios.hidden = false;
  pintarRelogios();
  garantirLoopRelogio();
}

function garantirLoopRelogio() {
  if (idLoopRelogio != null) return;
  const passo = (agora) => {
    idLoopRelogio = requestAnimationFrame(passo);
    tickRelogio(agora);
  };
  idLoopRelogio = requestAnimationFrame(passo);
}

function tickRelogio(agora) {
  // No modo online, interpolamos o último retrato enviado pelo servidor.
  if (online.ativo) {
    if (relogioOnline) {
      const r = relogioOnline;
      relogio.w = r.w;
      relogio.b = r.b;
      if (r.ativo && !relogio.pausado && online.estado && online.estado.statusSala === 'em_andamento') {
        const gasto = Date.now() - r.recebidoEm;
        relogio[r.ativo] = Math.max(0, r[r.ativo] - gasto);
      }
      relogio.ativo = r.ativo;
      talvezTickTempoBaixo();
      pintarRelogios();
    }
    return;
  }
  if (relogio.pausado || !relogio.ativo || modoAtual.minutos == null || fimPorTempo) {
    relogio.ultimoTick = agora;
    return;
  }
  const dt = agora - relogio.ultimoTick;
  relogio.ultimoTick = agora;
  relogio[relogio.ativo] = Math.max(0, relogio[relogio.ativo] - dt);
  if (relogio[relogio.ativo] <= 0) {
    relogio[relogio.ativo] = 0;
    tratarTempoEsgotado(relogio.ativo);
  } else {
    talvezTickTempoBaixo();
  }
  pintarRelogios();
}

function pausarRelogio() {
  if (!online.ativo && !relogio.pausado && relogio.ativo && !fimPorTempo) {
    tickRelogio(performance.now());
  }
  relogio.pausado = true;
}
function retomarRelogio() {
  if (online.ativo) return;
  if (modoAtual.minutos == null || fimPorTempo || partidaAcabou()) return;
  relogio.pausado = false;
  relogio.ultimoTick = performance.now();
  if (!relogio.ativo) relogio.ativo = jogo.vez();
  garantirLoopRelogio();
  pintarRelogios();
}

function aposLanceRelogio() {
  if (online.ativo || modoAtual.minutos == null) return;
  const quemJogou = jogo.vez() === 'w' ? 'b' : 'w';
  if (!relogio.pausado) tickRelogio(performance.now());
  if (fimPorTempo) return;
  relogio[quemJogou] += modoAtual.incremento * 1000;
  if (partidaAcabou()) {
    pausarRelogio();
    relogio.ativo = null;
    pintarRelogios();
    return;
  }
  relogio.ativo = jogo.vez();
  relogio.pausado = false;
  relogio.ultimoTick = performance.now();
  pintarRelogios();
}

function tratarTempoEsgotado(lado) {
  if (fimPorTempo || online.ativo) return;
  relogio[lado] = 0;
  relogio.pausado = true;
  relogio.ativo = null;
  const adversario = lado === 'w' ? 'b' : 'w';
  if (!jogo.temMaterialParaMate(adversario)) {
    fimPorTempo = { tipo: 'empate-tempo', vencedor: null };
  } else {
    fimPorTempo = { tipo: 'tempo', vencedor: adversario };
  }
  limparSelecao();
  som('fim');
  renderizar();
}

function formatarTempo(ms) {
  const total = Math.max(0, Math.ceil(ms));
  if (total < 10000) {
    const decimosTotais = Math.ceil(total / 100);
    return '0:' + String(Math.floor(decimosTotais / 10)).padStart(2, '0') + '.' + (decimosTotais % 10);
  }
  const segsTotais = Math.ceil(total / 1000);
  const h = Math.floor(segsTotais / 3600);
  const m = Math.floor((segsTotais % 3600) / 60);
  const s = segsTotais % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function pintarRelogios() {
  if (!elRelW) return;
  const semTempo = online.ativo
    ? !(online.estado && MODOS[online.estado.modo] && MODOS[online.estado.modo].minutos != null)
    : modoAtual.minutos == null;
  if (semTempo) {
    elCartaoRelogios.hidden = true;
  } else {
    elCartaoRelogios.hidden = false;
  }
  elRelW.textContent = semTempo ? '—' : formatarTempo(relogio.w);
  elRelB.textContent = semTempo ? '—' : formatarTempo(relogio.b);
  elRelW.setAttribute('data-ms', String(Math.round(relogio.w)));
  elRelB.setAttribute('data-ms', String(Math.round(relogio.b)));
  const ativo = !relogio.pausado && relogio.ativo && !partidaAcabou();
  elBoxW.classList.toggle('ativo', ativo && relogio.ativo === 'w');
  elBoxB.classList.toggle('ativo', ativo && relogio.ativo === 'b');
  elBoxW.classList.toggle('tempo-baixo', !semTempo && relogio.w < 10000);
  elBoxB.classList.toggle('tempo-baixo', !semTempo && relogio.b < 10000);
  const topo = document.getElementById('barra-lado-topo');
  const base = document.getElementById('barra-lado-base');
  if (topo || base) {
    const corBase = brancasEmbaixo ? 'w' : 'b';
    const corTopo = brancasEmbaixo ? 'b' : 'w';
    if (topo) preencherBarraLado(topo, corTopo);
    if (base) preencherBarraLado(base, corBase);
  }
}

function salvarRetratoRelogio() { historicoRelogio.push({ w: relogio.w, b: relogio.b }); }
function restaurarRetratoRelogio() {
  const r = historicoRelogio.pop();
  if (!r) return;
  relogio.w = r.w; relogio.b = r.b;
  fimPorTempo = null;
  if (modoAtual.minutos == null) { relogio.ativo = null; relogio.pausado = true; }
  else { relogio.ativo = jogo.vez(); relogio.pausado = false; relogio.ultimoTick = performance.now(); }
  pintarRelogios();
}

function talvezTickTempoBaixo() {
  if (relogio.pausado || !relogio.ativo || partidaAcabou()) return;
  const ms = relogio[relogio.ativo];
  if (ms <= 0 || ms >= 10000) { ultimoSegundoTicado = null; return; }
  const seg = Math.ceil(ms / 1000);
  if (seg !== ultimoSegundoTicado) {
    ultimoSegundoTicado = seg;
    som('tempoBaixo');
  }
}

// ------------------------------------------------------------------------
// Animações
// ------------------------------------------------------------------------

function criarPecaVoadora(pecaOuSimbolo, x, y, ehLetra) {
  const el = document.createElement('div');
  el.className = 'peca-voadora';
  if (ehLetra || (pecaOuSimbolo && pecaOuSimbolo.length === 1 && SIMBOLOS_UNICODE[pecaOuSimbolo])) {
    const inner = criarElementoPeca(pecaOuSimbolo, estiloPecas());
    inner.style.cursor = 'default';
    el.appendChild(inner);
    if (estiloPecas() !== 'unicode') el.classList.add('peca-svg');
  } else {
    el.textContent = pecaOuSimbolo;
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  return el;
}

function esconderPecaNaCasa(sq) {
  const peca = elementoCasa(sq) && elementoCasa(sq).querySelector('.peca');
  if (peca) peca.classList.add('escondida');
}

async function deslizarPeca(peca, de, para, duracao) {
  if (movimentoReduzido()) return;
  const el = criarPecaVoadora(peca, de.x, de.y, true);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  el.style.transition = 'transform ' + duracao + 'ms cubic-bezier(0.22, 0.8, 0.28, 1)';
  el.style.transform = 'translate(-50%, -50%) translate(' + (para.x - de.x) + 'px,' + (para.y - de.y) + 'px)';
  await esperar(duracao);
  el.remove();
}

async function animarCapturaVisual(peca, sq) {
  const casa = elementoCasa(sq);
  if (casa) casa.classList.add('flash-captura');
  const ponto = pontoDaCasa(sq);
  if (!movimentoReduzido()) {
    const el = criarPecaVoadora(peca, ponto.x, ponto.y, true);
    el.classList.add('peca-capturada-anim');
    await esperar(DURACAO_LANCE);
    el.remove();
  } else {
    await esperar(80);
  }
  if (casa) casa.classList.remove('flash-captura');
}

function casasDaTorreNoRoque(lance) {
  if (lance.castle === 'K') return { from: 7, to: 5, peca: 'R' };
  if (lance.castle === 'Q') return { from: 0, to: 3, peca: 'R' };
  if (lance.castle === 'k') return { from: 63, to: 61, peca: 'r' };
  if (lance.castle === 'q') return { from: 56, to: 59, peca: 'r' };
  return null;
}
function casaCaptura(lance) {
  if (!lance.captured) return null;
  if (lance.enPassant) {
    const dir = (lance.piece === lance.piece.toUpperCase()) ? -1 : 1;
    return lance.to + dir * 8;
  }
  return lance.to;
}

async function animarLance(lance, opts) {
  opts = opts || {};
  const inverso = !!opts.inverso;
  const duracao = opts.origemPixel && !inverso ? DURACAO_ENCAIXE : DURACAO_LANCE;
  const deSq = inverso ? lance.to : lance.from;
  const paraSq = inverso ? lance.from : lance.to;
  const pecaMovente = inverso && lance.promotion ? lance.piece : (lance.promotion || lance.piece);
  const origem = opts.origemPixel || pontoDaCasa(deSq);
  const destino = pontoDaCasa(paraSq);
  esconderPecaNaCasa(deSq);
  const roque = casasDaTorreNoRoque(lance);
  if (roque) esconderPecaNaCasa(inverso ? roque.to : roque.from);
  const capSq = casaCaptura(lance);
  const tarefas = [];
  if (!inverso && capSq != null && lance.captured) {
    esconderPecaNaCasa(capSq);
    tarefas.push(animarCapturaVisual(lance.captured, capSq));
  }
  tarefas.push(deslizarPeca(pecaMovente, origem, destino, duracao));
  if (roque) {
    const rd = inverso ? roque.to : roque.from;
    const rp = inverso ? roque.from : roque.to;
    tarefas.push(deslizarPeca(roque.peca, pontoDaCasa(rd), pontoDaCasa(rp), duracao));
  }
  await Promise.all(tarefas);
}

function tocarSomDoLance(lance) {
  const status = statusEfetivo();
  if (lance.promotion) som('promocao');
  else if (lance.castle) som('roque');
  else if (lance.captured) som('capturar');
  else som('mover');
  if (status === 'xeque') setTimeout(() => som('xeque'), 90);
  else if (status === 'xeque-mate' || String(status).indexOf('empate') === 0 || status === 'tempo' || status === 'desistencia') {
    setTimeout(() => som('fim'), 160);
  }
}

// ------------------------------------------------------------------------
// Seleção e lances (local e online)
// ------------------------------------------------------------------------

function limparSelecao() { selecionada = null; lancesDaSelecao = []; }

function pecaDaVezEh(peca, cor) {
  return peca && ((peca === peca.toUpperCase() ? 'w' : 'b') === cor);
}

function corPermitida() {
  if (online.ativo) return online.cor; // espectador: null (não move nada)
  if (modoApp === 'bot') return bot.corJogador;
  return jogo.vez();
}

function selecionarCasa(sq, opcoes) {
  const peca = tabuleiroVisivel()[sq];
  const cor = corPermitida();
  const pre = emModoPrelance();
  if (!pecaDaVezEh(peca, cor) || (!pre && online.ativo && jogo.vez() !== online.cor)) {
    limparSelecao();
    renderizar();
    if (opcoes && opcoes.somIlegalSeFalhar) som('ilegal');
    return false;
  }
  selecionada = sq;
  lancesDaSelecao = lancesParaSelecao(sq);
  renderizar();
  som('selecionar');
  return true;
}

async function tentarMover(de, para, origemPixel) {
  // Vez do adversário: em vez de jogar, agenda o pré-lance.
  if (emModoPrelance()) {
    const ok = destinosPrelance(de).some((l) => l.to === para);
    if (ok) definirPrelance(de, para);
    return ok;
  }
  const candidatas = lancesDaCasa(de).filter((l) => l.to === para);
  if (!candidatas.length) return false;
  if (candidatas[0].promotion) {
    promocaoPendente = { from: de, to: para, origemPixel: origemPixel || null };
    abrirPromocao(jogo.vez());
    return true;
  }
  if (online.ativo) {
    enviarLanceOnline({ from: de, to: para }, origemPixel);
    return true;
  }
  await executarLanceLocal({ from: de, to: para }, origemPixel);
  return true;
}

async function executarLanceLocal(entrada, origemPixel) {
  if (animando) return false;
  if (modoAtual.minutos != null && !relogio.pausado) {
    tickRelogio(performance.now());
    if (fimPorTempo) { renderizar(); return false; }
  }
  animando = true;
  elBtnDesfazer.disabled = true;
  elBtnGirar.disabled = true;
  salvarRetratoRelogio();
  const feito = jogo.mover(entrada);
  if (!feito) {
    if (historicoRelogio.length) historicoRelogio.pop();
    animando = false;
    som('ilegal');
    renderizar();
    return false;
  }
  limparSelecao();
  aposLanceRelogio();
  tocarSomDoLance(feito);
  try { await animarLance(feito, { origemPixel: origemPixel || null }); }
  finally {
    animando = false;
    renderizar({ capturaRecente: feito.captured });
  }
  // Contra o bot: depois do lance do jogador, é a vez do bot pensar.
  if (modoApp === 'bot' && !partidaAcabou() && jogo.vez() !== bot.corJogador) pedirLanceBot();
  return true;
}

function enviarLanceOnline(entrada, origemPixel) {
  limparSelecao();
  renderizar();
  online._origemPixel = origemPixel || null;
  online._esperandoLance = { from: entrada.from, to: entrada.to };
  emitirQuandoPronto('lance', entrada);
}

async function confirmarPromocao(tipo) {
  if (!promocaoPendente) return;
  const p = promocaoPendente;
  promocaoPendente = null;
  fecharPromocao();
  const entrada = { from: p.from, to: p.to, promotion: tipo };
  if (online.ativo) enviarLanceOnline(entrada, p.origemPixel);
  else await executarLanceLocal(entrada, p.origemPixel);
}

function noClique(evento) {
  if (arraste && arraste.consumido) { arraste = null; return; }
  arraste = null;
  const sq = Number(evento.currentTarget.dataset.square);
  if (emMontagem()) { cliqueMontagem(sq); return; }
  if (interacaoBloqueada()) return;
  if (emModoPrelance()) { cliquePrelance(sq); return; }
  if (selecionada === null) { selecionarCasa(sq); return; }
  if (selecionada === sq) { limparSelecao(); renderizar(); return; }
  const legal = lancesDaSelecao.some((l) => l.to === sq);
  if (legal) tentarMover(selecionada, sq);
  else selecionarCasa(sq, { somIlegalSeFalhar: true });
}

function noMouseDown(evento) {
  if (evento.button !== 0 || interacaoBloqueada()) return;
  const sq = Number(evento.currentTarget.dataset.square);
  const peca = tabuleiroVisivel()[sq];
  if (!pecaDaVezEh(peca, corPermitida())) return;
  if (online.ativo && jogo.vez() !== online.cor && !emModoPrelance()) return;
  arraste = { from: sq, peca: peca, iniciado: false, consumido: false, x: evento.clientX, y: evento.clientY };
}
function noTouchStart(evento) {
  if (interacaoBloqueada()) return;
  const t = evento.changedTouches[0];
  const sq = Number(evento.currentTarget.dataset.square);
  const peca = tabuleiroVisivel()[sq];
  if (!pecaDaVezEh(peca, corPermitida())) return;
  if (online.ativo && jogo.vez() !== online.cor && !emModoPrelance()) return;
  arraste = { from: sq, peca: peca, iniciado: false, consumido: false, x: t.clientX, y: t.clientY, toque: true };
}

function iniciarArrasteVisual() {
  if (!arraste || arraste.iniciado) return;
  arraste.iniciado = true;
  selecionada = arraste.from;
  lancesDaSelecao = lancesParaSelecao(arraste.from);
  renderizar();
  const pecaEl = elTabuleiro.querySelector('[data-square="' + arraste.from + '"] .peca');
  if (pecaEl) pecaEl.classList.add('arrastando');
  elFantasma.hidden = false;
  elFantasma.innerHTML = '';
  elFantasma.className = 'fantasma';
  const vis = criarElementoPeca(arraste.peca, estiloPecas());
  elFantasma.appendChild(vis);
  if (estiloPecas() !== 'unicode') elFantasma.classList.add('peca-svg');
  moverFantasma(arraste.x, arraste.y);
}
function moverFantasma(x, y) {
  elFantasma.style.left = x + 'px';
  elFantasma.style.top = y + 'px';
  if (arraste) { arraste.x = x; arraste.y = y; }
}
function casaSobPonteiro(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const casa = el.closest ? el.closest('.casa') : null;
  if (!casa || !elTabuleiro.contains(casa)) return null;
  return Number(casa.dataset.square);
}
function noMovePointer(x, y, ev) {
  if (!arraste) return;
  const dx = x - arraste.x, dy = y - arraste.y;
  if (!arraste.iniciado && (dx * dx + dy * dy) > 16) {
    if (arraste.toque && ev && ev.cancelable) ev.preventDefault();
    iniciarArrasteVisual();
  }
  if (arraste.iniciado) {
    if (arraste.toque && ev && ev.cancelable) ev.preventDefault();
    moverFantasma(x, y);
  }
}
function encerrarArraste(x, y) {
  if (!arraste) return;
  const origem = arraste.from;
  const era = arraste.iniciado;
  const ponto = { x: x, y: y };
  encerrarFantasma();
  if (!era) return;
  arraste.consumido = true;
  const destino = casaSobPonteiro(x, y);
  if (destino === null || destino === origem) {
    if (destino === null) som('ilegal');
    renderizar();
    return;
  }
  const eraPrelance = emModoPrelance();
  tentarMover(origem, destino, ponto).then((ok) => {
    if (ok) return;
    if (eraPrelance) { cancelarPrelance(); return; } // soltou fora: cancela em silêncio
    som('ilegal');
    renderizar();
  });
}
function encerrarFantasma() {
  elFantasma.hidden = true;
  elFantasma.innerHTML = '';
  const p = elTabuleiro.querySelector('.peca.arrastando');
  if (p) p.classList.remove('arrastando');
}

document.addEventListener('mousemove', (e) => { if (arraste) noMovePointer(e.clientX, e.clientY, e); });
document.addEventListener('mouseup', (e) => { if (arraste) encerrarArraste(e.clientX, e.clientY); });
document.addEventListener('touchmove', (e) => {
  if (!arraste) return;
  if (e.cancelable) e.preventDefault();
  const toque = e.changedTouches[0];
  noMovePointer(toque.clientX, toque.clientY, e);
}, { passive: false });
document.addEventListener('touchend', (e) => {
  if (!arraste) return;
  const t = e.changedTouches[0];
  encerrarArraste(t.clientX, t.clientY);
});
document.addEventListener('touchcancel', () => {
  if (!arraste) return;
  encerrarFantasma();
  arraste = null;
  renderizar();
});

// ------------------------------------------------------------------------
// Pré-lance (online e contra o bot)
// ------------------------------------------------------------------------

/**
 * Dá para agendar um pré-lance agora? Só na vez do ADVERSÁRIO, com a opção
 * ligada, numa partida online em andamento (jogador, não espectador) ou
 * contra o bot. No modo local (dois no mesmo PC) não existe pré-lance.
 */
function emModoPrelance() {
  if (!config.prelance || revisao.ativa || promocaoPendente || partidaAcabou()) return false;
  if (modoApp === 'bot') return bot.pensando || jogo.vez() !== bot.corJogador;
  if (online.ativo && !online.espectador && online.cor && online.estado) {
    return online.estado.statusSala === 'em_andamento' && jogo.vez() !== online.cor;
  }
  return false;
}

/**
 * Destinos de pré-lance da nossa peça em `sq`, no formato de `lancesDaCasa`
 * ({to, captured}). No Impostor usamos a FUNÇÃO real da peça.
 */
function destinosPrelance(sq) {
  const cor = corPermitida();
  let tipo = null, jaMoveu = false;
  const visao = visaoImpostor();
  if (visao) {
    const v = visao[sq];
    if (!v || v.c !== cor || !v.f) return [];
    tipo = v.f;
    jaMoveu = !!v.m;
  } else {
    const peca = jogo.obterTabuleiro()[sq];
    if (!pecaDaVezEh(peca, cor)) return [];
    tipo = peca.toLowerCase();
  }
  return PreLance.destinosGeometricos(tipo, cor, sq, { jaMoveu: jaMoveu })
    .map((to) => ({ to: to, captured: false }));
}

/** Lances que a seleção mostra: normais na nossa vez, pré-lance na do adversário. */
function lancesParaSelecao(sq) {
  return emModoPrelance() ? destinosPrelance(sq) : lancesDaCasa(sq);
}

/** Clique no tabuleiro durante a vez do adversário. */
function cliquePrelance(sq) {
  if (selecionada === null) {
    // Clique em casa vazia ou peça do adversário: cancela o pré-lance.
    if (!selecionarCasa(sq)) cancelarPrelance();
    return;
  }
  if (selecionada === sq) { limparSelecao(); renderizar(); return; }
  if (lancesDaSelecao.some((l) => l.to === sq)) { definirPrelance(selecionada, sq); return; }
  if (!selecionarCasa(sq)) cancelarPrelance();
}

function definirPrelance(de, para) {
  prelance = { from: de, to: para };
  limparSelecao();
  renderizar();
  som('selecionar');
}

function cancelarPrelance() {
  const tinha = !!prelance || selecionada !== null;
  prelance = null;
  limparSelecao();
  if (tinha) renderizar();
}

function atualizarAvisoPrelance() {
  if (!elAvisoPrelance) return;
  elAvisoPrelance.hidden = !prelance;
  if (prelance) {
    elAvisoPrelance.textContent = '⚡ Pré-lance: ' + casaParaAlgebrica(prelance.from) + ' → ' +
      casaParaAlgebrica(prelance.to) + ' (botão direito cancela)';
  }
}

/** Agora é a nossa vez de verdade (para executar o pré-lance)? */
function nossaVezDeVerdade() {
  if (partidaAcabou() || revisao.ativa) return false;
  if (modoApp === 'bot') return !bot.pensando && jogo.vez() === bot.corJogador;
  if (online.ativo && !online.espectador && online.estado) {
    return online.estado.statusSala === 'em_andamento' && jogo.vez() === online.cor;
  }
  return false;
}

/**
 * Chamado logo depois do lance do adversário. Se houver pré-lance e ele for
 * legal na nova posição, ele é jogado na hora (com dama na promoção). Se não
 * for, é cancelado em silêncio. No relógio, o tempo gasto é só o de enviar.
 */
async function executarPrelanceSePossivel() {
  // Uma seleção feita na vez do adversário mostrava destinos de pré-lance:
  // agora que é a nossa vez, troca pelos lances legais de verdade.
  if (selecionada !== null && nossaVezDeVerdade()) {
    if (pecaDaVezEh(tabuleiroVisivel()[selecionada], corPermitida())) lancesDaSelecao = lancesDaCasa(selecionada);
    else limparSelecao();
  }
  if (!prelance) { renderizar(); return; }
  if (!nossaVezDeVerdade()) { renderizar(); return; }
  const p = prelance;
  prelance = null;
  limparSelecao();
  const lance = pecaDaVezEh(tabuleiroVisivel()[p.from], corPermitida())
    ? PreLance.resolverPrelance(p, lancesDaCasa(p.from))
    : null;
  if (!lance) { renderizar(); return; } // ilegal agora: cancela em silêncio
  if (online.ativo) {
    online._prelanceEnviado = true;
    enviarLanceOnline(lance, null);
  } else {
    await executarLanceLocal(lance);
  }
}

function sincronizarBotaoPrelance() {
  const b = document.getElementById('btn-prelance');
  if (!b) return;
  b.setAttribute('aria-pressed', String(!!config.prelance));
  b.textContent = config.prelance ? '⚡ Pré-lance: ligado' : '⚡ Pré-lance: desligado';
}
document.getElementById('btn-prelance').addEventListener('click', () => {
  config.prelance = !config.prelance;
  salvarConfig();
  if (!config.prelance) cancelarPrelance();
  sincronizarBotaoPrelance();
  toast(config.prelance ? 'Pré-lance ligado.' : 'Pré-lance desligado.');
  renderizar();
});

// ------------------------------------------------------------------------
// Marcações: setas e círculos (botão direito; toque longo no celular)
// ------------------------------------------------------------------------

function desenharMarcacoes() {
  MarcacoesTabuleiro.desenhar(elCamadaMarcas, marcas, brancasEmbaixo, marcaArrastando);
  const n = MarcacoesTabuleiro.quantidade(marcas);
  const rapido = document.getElementById('btn-limpar-marcas-rapido');
  if (rapido) rapido.hidden = n === 0;
  const geral = document.getElementById('btn-limpar-marcas');
  if (geral) geral.disabled = n === 0;
}

function limparMarcacoes() {
  if (!MarcacoesTabuleiro.quantidade(marcas) && !marcaArrastando) return;
  MarcacoesTabuleiro.limpar(marcas);
  marcaArrastando = null;
  desenharMarcacoes();
}

// O menu do botão direito não abre em cima do tabuleiro.
elTabuleiro.addEventListener('contextmenu', (e) => e.preventDefault());
elCamadaMarcas.addEventListener('contextmenu', (e) => e.preventDefault());

// Botão esquerdo comum no tabuleiro: limpa as marcações (como no Lichess).
// Botão direito: cancela o pré-lance (se houver) ou começa uma marcação.
elTabuleiro.addEventListener('mousedown', (e) => {
  if (e.button === 0) { limparMarcacoes(); return; }
  if (e.button !== 2) return;
  e.preventDefault();
  if (prelance || (selecionada !== null && emModoPrelance())) { cancelarPrelance(); return; }
  const casa = e.target.closest('.casa');
  if (!casa) return;
  const sq = Number(casa.dataset.square);
  marcaArrastando = { de: sq, para: sq, cor: MarcacoesTabuleiro.corPorModificadores(e) };
}, true);
document.addEventListener('mousemove', (e) => {
  if (!marcaArrastando) return;
  const sq = casaSobPonteiro(e.clientX, e.clientY);
  if (sq !== null && sq !== marcaArrastando.para) {
    marcaArrastando.para = sq;
    desenharMarcacoes(); // prévia da seta
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button !== 2 || !marcaArrastando) return;
  const m = marcaArrastando;
  marcaArrastando = null;
  const fim = casaSobPonteiro(e.clientX, e.clientY);
  if (fim !== null) {
    // A cor vale pelas teclas seguradas ao SOLTAR (dá para escolher no meio).
    const cor = (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) ? MarcacoesTabuleiro.corPorModificadores(e) : m.cor;
    MarcacoesTabuleiro.alternarSeta(marcas, m.de, fim, cor);
  }
  desenharMarcacoes();
});

// Celular: segurar o dedo ~0,5 s numa casa marca (ou desmarca) um círculo.
// Um toque curto comum limpa as marcações, como o clique esquerdo.
const TOQUE_LONGO_MS = 500;
let toqueLongo = null;
elTabuleiro.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) { if (toqueLongo) clearTimeout(toqueLongo.timer); toqueLongo = null; return; }
  const t = e.touches[0];
  const casa = e.target.closest('.casa');
  if (!casa) return;
  const sq = Number(casa.dataset.square);
  const estado = { sq: sq, x: t.clientX, y: t.clientY, disparou: false, timer: 0 };
  estado.timer = setTimeout(() => {
    estado.disparou = true;
    // Se o dedo estava numa peça, o arraste dela é cancelado.
    if (arraste && !arraste.iniciado) arraste = null;
    MarcacoesTabuleiro.alternarCirculo(marcas, sq, 'verde');
    desenharMarcacoes();
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) { /* sem vibração */ } }
  }, TOQUE_LONGO_MS);
  toqueLongo = estado;
}, { capture: true, passive: true });
document.addEventListener('touchmove', (e) => {
  if (!toqueLongo || toqueLongo.disparou) return;
  const t = e.touches[0];
  if (!t) return;
  const dx = t.clientX - toqueLongo.x, dy = t.clientY - toqueLongo.y;
  if (dx * dx + dy * dy > 100) { clearTimeout(toqueLongo.timer); toqueLongo = null; }
}, { passive: true });
elTabuleiro.addEventListener('touchend', (e) => {
  if (!toqueLongo) return;
  const estado = toqueLongo;
  toqueLongo = null;
  clearTimeout(estado.timer);
  if (estado.disparou) {
    // O toque longo não vira clique (não seleciona nem move peça).
    if (e.cancelable) e.preventDefault();
    engolirProximoClique();
  } else {
    limparMarcacoes();
  }
}, { capture: true, passive: false });
elTabuleiro.addEventListener('touchcancel', () => {
  if (toqueLongo) clearTimeout(toqueLongo.timer);
  toqueLongo = null;
}, true);

let engolirClique = false;
function engolirProximoClique() {
  engolirClique = true;
  setTimeout(() => { engolirClique = false; }, 450);
}
elTabuleiro.addEventListener('click', (e) => {
  if (!engolirClique) return;
  engolirClique = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

document.getElementById('btn-limpar-marcas').addEventListener('click', limparMarcacoes);
document.getElementById('btn-limpar-marcas-rapido').addEventListener('click', limparMarcacoes);

// ------------------------------------------------------------------------
// Montagem do modo Impostor
// ------------------------------------------------------------------------

/**
 * Toque/clique na montagem: a 1ª peça nossa fica selecionada; a 2ª troca a
 * função com ela (o servidor guarda a montagem e devolve o novo estado).
 */
function cliqueMontagem(sq) {
  if (!elModalConfig.hidden || !elModalConfirma.hidden) return;
  const v = visaoImpostor()[sq];
  if (online.estado.impostor.montagem.eu) {
    toast('Você já está pronto. Toque em “Editar” para mudar.');
    return;
  }
  if (!v || v.c !== online.cor) {
    selecaoMontagem = null;
    renderizar();
    return;
  }
  if (selecaoMontagem === null || selecaoMontagem === sq) {
    selecaoMontagem = selecaoMontagem === sq ? null : sq;
    som('selecionar');
    renderizar();
    return;
  }
  const a = selecaoMontagem;
  selecaoMontagem = null;
  emitirQuandoPronto('trocarFuncoes', { a: a, b: sq });
  som('mover');
}

/** Mostra/atualiza a barra de montagem (textos e botões). */
function atualizarBarraMontagem() {
  const el = document.getElementById('barra-montagem');
  if (!el) return;
  // O espectador não monta nada: vê só o tabuleiro e o status.
  const ativa = emMontagem() && !online.espectador;
  el.hidden = !ativa;
  // Classe usada no CSS para encolher o tabuleiro e caber a barra (telas largas).
  elTelaJogo.classList.toggle('em-montagem', ativa);
  if (!ativa) { selecaoMontagem = null; return; }
  const m = online.estado.impostor.montagem;
  const elStatus = document.getElementById('status-montagem');
  if (m.eu) elStatus.textContent = m.oponente ? 'Começando…' : 'Você está pronto. Aguardando o oponente…';
  else elStatus.textContent = m.oponente ? 'O oponente já está pronto. Falta você!' : 'Oponente montando…';
  elStatus.classList.toggle('pronto', !!m.oponente);
  document.getElementById('btn-montagem-pronto').textContent = m.eu ? 'Editar' : 'Pronto';
  document.getElementById('btn-montagem-resetar').disabled = !!m.eu;
}

document.getElementById('btn-montagem-pronto').addEventListener('click', () => {
  if (!emMontagem()) return;
  selecaoMontagem = null;
  emitirQuandoPronto('prontoMontagem', { pronto: !online.estado.impostor.montagem.eu });
});
document.getElementById('btn-montagem-resetar').addEventListener('click', () => {
  if (!emMontagem() || online.estado.impostor.montagem.eu) return;
  selecaoMontagem = null;
  emitirQuandoPronto('resetarFuncoes');
});

/** Avisa (som + mensagem) quando um lance revela peças no Impostor. */
function avisarRevelacoes(lance) {
  if (!lance || !lance.revelou || !lance.revelou.length) return;
  setTimeout(() => som('revelar'), 140);
  const textos = lance.revelou.map((r) => (r.funcao === 'k'
    ? 'o rei verdadeiro foi revelado'
    : 'peça revelada: anda como ' + NOMES_FUNCAO[r.funcao].toLowerCase()));
  toast('🎭 ' + textos.join(' · ').replace(/^./, (c) => c.toUpperCase()) + '!');
}

// ------------------------------------------------------------------------
// Partida local
// ------------------------------------------------------------------------

function abrirMenuModosLocal() {
  pausarRelogio();
  elModalModos.hidden = false;
  som('menu');
}

/**
 * Começa uma partida no navegador: local (dois jogadores) ou contra o bot.
 * @param {string} idModo  tempo (livre, 10+0, 3+0); contra o bot é sempre livre
 * @param {{nivel:string, cor:string}} [contraBot]  se informado, um lado é o bot
 */
function iniciarPartidaLocal(idModo, contraBot) {
  const modo = contraBot ? MODOS.livre : (MODOS[idModo] || MODOS.livre);
  modoAtual = modo;
  modoApp = contraBot ? 'bot' : 'local';
  cancelarPensamentoBot();
  sairRevisao({ semRender: true });
  online.ativo = false;
  online.estado = null;
  online.espectador = false;
  fecharPromocao();
  elModalModos.hidden = true;
  elModalBot.hidden = true;
  elFaixaOnline.hidden = true;
  elOverlayEspera.hidden = true;
  promocaoPendente = null;
  animando = false;
  document.querySelectorAll('.peca-voadora').forEach((el) => el.remove());
  jogo.resetar();
  prelance = null;
  limparSelecao();
  partidaIniciada = true;
  fimPorTempo = null;
  if (contraBot) {
    bot.nivel = NOMES_NIVEL[contraBot.nivel] ? contraBot.nivel : 'medio';
    let cor = contraBot.cor;
    if (cor === 'aleatoria') cor = Math.random() < 0.5 ? 'w' : 'b';
    bot.corJogador = cor === 'b' ? 'b' : 'w';
    brancasEmbaixo = bot.corJogador === 'w';
    elSubtitulo.textContent = 'Contra o bot · ' + NOMES_NIVEL[bot.nivel];
  } else {
    brancasEmbaixo = true;
    elSubtitulo.textContent = 'Dois jogadores no mesmo computador';
  }
  mostrarTela('jogo');
  atualizarAbasVisiveis();
  criarTabuleiro();
  iniciarRelogiosDoModo(modo);
  renderizar();
  som('inicio');
  // O bot de brancas abre a partida.
  if (modoApp === 'bot' && bot.corJogador === 'b') pedirLanceBot();
}

// ------------------------------------------------------------------------
// Contra o bot (o cálculo roda num Web Worker: a interface não trava)
// ------------------------------------------------------------------------

/** Respostas pendentes do Worker: id do pedido → função que recebe o resultado. */
const respostasBot = new Map();

function garantirWorkerBot() {
  if (bot.worker !== null) return bot.worker || null;
  try {
    bot.worker = new Worker('bot-worker.js');
    bot.worker.onmessage = (e) => {
      const r = e.data || {};
      const fn = respostasBot.get(r.id);
      respostasBot.delete(r.id);
      if (fn) fn(r);
    };
    bot.worker.onerror = () => {
      // Sem Worker (ex.: arquivo aberto direto do disco): calcula aqui mesmo.
      bot.worker = false;
      for (const [id, fn] of respostasBot) {
        respostasBot.delete(id);
        fn(null);
      }
    };
  } catch (e) {
    bot.worker = false;
  }
  return bot.worker || null;
}

/** Invalida qualquer resposta do bot que ainda esteja a caminho. */
function cancelarPensamentoBot() {
  bot.idPedido += 1;
  bot.pensando = false;
}

/** Pede ao bot o próximo lance e joga quando ele responder. */
function pedirLanceBot() {
  if (modoApp !== 'bot' || partidaAcabou() || jogo.vez() === bot.corJogador) return;
  const id = ++bot.idPedido;
  bot.pensando = true;
  renderizar();
  const fen = jogo.fen();
  const inicio = performance.now();

  const aoResponder = async (r) => {
    if (id !== bot.idPedido || modoApp !== 'bot') return; // pedido antigo
    if (!r) {
      // O Worker falhou: calcula na thread principal (com tempo menor).
      r = BotXadrez.escolherLance(fen, bot.nivel, { tempoMs: 1200 });
    }
    // Um respiro mínimo, para o lance do bot não "piscar" na tela.
    const resta = 380 - (performance.now() - inicio);
    if (resta > 0) await esperar(resta);
    while (animando) await esperar(30);
    if (id !== bot.idPedido || modoApp !== 'bot') return;
    bot.pensando = false;
    if (!r || !r.lance) { renderizar(); return; }
    await executarLanceLocal(r.lance);
    await executarPrelanceSePossivel();
  };

  const w = garantirWorkerBot();
  if (w) {
    respostasBot.set(id, aoResponder);
    w.postMessage({ id: id, fen: fen, nivel: bot.nivel, tempoMs: 1800 });
  } else {
    setTimeout(() => aoResponder(null), 30);
  }
}

/** Seleção de cor (♔ ♚ 🎲) nos cartões do bot; fica salva na configuração. */
function sincronizarCorBot() {
  document.querySelectorAll('[data-cor-bot]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-cor-bot') === (config.botCor || 'w')));
  });
  document.querySelectorAll('[data-nivel]').forEach((b) => {
    b.classList.toggle('nivel-lembrado', b.getAttribute('data-nivel') === config.botNivel);
  });
}
document.addEventListener('click', (e) => {
  const corBtn = e.target.closest('[data-cor-bot]');
  if (corBtn) {
    config.botCor = corBtn.getAttribute('data-cor-bot');
    salvarConfig();
    sincronizarCorBot();
    return;
  }
  const nivelBtn = e.target.closest('[data-nivel]');
  if (nivelBtn) {
    config.botNivel = nivelBtn.getAttribute('data-nivel');
    salvarConfig();
    iniciarPartidaLocal('livre', { nivel: config.botNivel, cor: config.botCor || 'w' });
  }
});
document.getElementById('btn-bot-cancelar').addEventListener('click', () => { elModalBot.hidden = true; });

// ------------------------------------------------------------------------
// Partida online
// ------------------------------------------------------------------------

function garantirSocket() {
  if (!socket) {
    socket = io({ autoConnect: false });
    ligarEventosSocket(socket);
  }
  if (!socket.connected) socket.connect();
  return socket;
}

/** Garante que o emit só sai depois que o socket conectou (evita perder o evento). */
function emitirQuandoPronto(evento, dados) {
  const s = garantirSocket();
  if (s.connected) s.emit(evento, dados);
  else s.once('connect', () => s.emit(evento, dados));
}

function salvarSessao(codigo, token) {
  try {
    sessionStorage.setItem('xadrez-token-' + codigo, token);
    localStorage.setItem('xadrez-token-' + codigo, token);
  } catch (e) { /* ignore */ }
}
function tokenDaSala(codigo) {
  try {
    return sessionStorage.getItem('xadrez-token-' + codigo) || localStorage.getItem('xadrez-token-' + codigo);
  } catch (e) { return null; }
}

function aplicarEstadoOnline(estado) {
  online.estado = estado;
  if (estado.fen) jogo.carregarFen(estado.fen);
  if (estado.modo && MODOS[estado.modo]) modoAtual = MODOS[estado.modo];
  if (estado.relogio) {
    relogioOnline = {
      w: estado.relogio.w,
      b: estado.relogio.b,
      ativo: estado.relogio.ativo,
      recebidoEm: Date.now(),
    };
    relogio.w = estado.relogio.w;
    relogio.b = estado.relogio.b;
    relogio.ativo = estado.relogio.ativo;
    relogio.pausado = estado.statusSala !== 'em_andamento' || !estado.relogio.ativo;
    if (MODOS[estado.modo] && MODOS[estado.modo].minutos != null) {
      elCartaoRelogios.hidden = false;
      garantirLoopRelogio();
    } else {
      elCartaoRelogios.hidden = true;
    }
  }
  if (estado.resultado) fimPorTempo = estado.resultado;
  else fimPorTempo = null;

  if (estado.statusSala !== 'em_andamento') prelance = null;
  // Nova partida na mesma sala (revanche): sai da revisão da anterior.
  if (revisao.ativa && estado.statusSala !== 'terminado') sairRevisao({ semRender: true });

  atualizarAvisoConexao(estado);
  atualizarOverlaysSala(estado);
  atualizarBarraMontagem();
  atualizarEspectadores(estado.espectadores || 0);
  document.getElementById('texto-codigo').textContent = estado.codigo || '-----';
  if (online.ativo) {
    elSubtitulo.textContent = (online.espectador ? '👁️ Assistindo · ' : '') + 'Partida online' +
      (estado.variante === 'impostor' ? ' · modo Impostor 🎭' : '');
  }
}

/** Contador "👁️ N" na faixa da sala (jogadores e espectadores veem). */
function atualizarEspectadores(n) {
  if (online.estado) online.estado.espectadores = n;
  const el = document.getElementById('contador-espectadores');
  const num = document.getElementById('numero-espectadores');
  if (num) num.textContent = String(n);
  if (el) {
    el.hidden = !(online.ativo && n > 0);
    el.title = n === 1 ? '1 pessoa assistindo' : n + ' pessoas assistindo';
  }
  const selo = document.getElementById('selo-assistindo');
  if (selo) selo.hidden = !online.espectador;
}

function oponenteEstaDesconectado(estado) {
  if (!estado || !estado.conectados) return false;
  if (estado.statusSala === 'aguardando') return false;
  if (online.espectador) {
    // Para quem assiste, "desconectado" é qualquer um dos dois jogadores.
    return estado.conectados.anfitriao === false || (!!estado.nomes.convidado && estado.conectados.convidado === false);
  }
  if (online.papel) {
    const op = online.papel === 'anfitriao' ? 'convidado' : 'anfitriao';
    if (typeof estado.conectados[op] === 'boolean') return !estado.conectados[op];
  }
  if (online.cor && (online.cor === 'w' || online.cor === 'b')) {
    const oposta = online.cor === 'w' ? 'b' : 'w';
    if (typeof estado.conectados[oposta] === 'boolean') return !estado.conectados[oposta];
  }
  return false;
}

function atualizarAvisoConexao(estado) {
  elAvisoConexao.hidden = !oponenteEstaDesconectado(estado);
  elAvisoConexao.textContent = online.espectador
    ? 'Um jogador desconectou — aguardando reconexão…'
    : 'Oponente desconectado — aguardando reconexão…';
}

function atualizarOverlaysSala(estado) {
  const st = estado && estado.statusSala;
  online.aguardando = st === 'aguardando';
  online.escolhendoCores = st === 'escolhendo-cores';
  if (online.espectador) {
    // O espectador não convida nem escolhe cores: só o status no painel.
    elOverlayEspera.hidden = true;
    if (elOverlayCores) elOverlayCores.hidden = true;
    return;
  }
  elOverlayEspera.hidden = !online.aguardando;
  if (online.aguardando && estado && estado.codigo) {
    document.getElementById('codigo-espera').textContent = estado.codigo;
    document.getElementById('texto-codigo').textContent = estado.codigo;
  }
  if (st === 'escolhendo-cores') {
    mostrarMenuCores(estado, estado.sugestaoCorAnfitriao, false);
  } else if (online.revelandoCor || (elRevelarCor && !elRevelarCor.hidden)) {
    // Mantém o overlay só para a revelação curta.
  } else if (elOverlayCores) {
    elOverlayCores.hidden = true;
    online.escolhendoCores = false;
  }
}

function mostrarMenuCores(estado, sugestao, revanche) {
  if (!elOverlayCores || online.espectador) return;
  elOverlayEspera.hidden = true;
  online.aguardando = false;
  online.escolhendoCores = true;
  elOverlayCores.hidden = false;
  if (elRevelarCor) elRevelarCor.hidden = true;
  const titulo = document.getElementById('titulo-cores');
  if (titulo) titulo.textContent = revanche ? 'Revanche — quem joga de brancas?' : 'Quem joga de brancas?';
  const souAnfitriao = online.papel === 'anfitriao';
  if (elMenuCoresAnfitriao) elMenuCoresAnfitriao.hidden = !souAnfitriao;
  if (elEsperaCoresConvidado) elEsperaCoresConvidado.hidden = souAnfitriao;
  const sug = sugestao || (estado && estado.sugestaoCorAnfitriao) || 'w';
  document.querySelectorAll('#overlay-cores [data-escolha]').forEach((btn) => {
    btn.classList.toggle('sugerido', btn.getAttribute('data-escolha') === sug);
  });
}

function revelarCorDefinida(cor, aleatorio) {
  if (!elOverlayCores || !elRevelarCor || !elTextoRevelarCor) return Promise.resolve();
  elOverlayCores.hidden = false;
  if (elMenuCoresAnfitriao) elMenuCoresAnfitriao.hidden = true;
  if (elEsperaCoresConvidado) elEsperaCoresConvidado.hidden = true;
  elRevelarCor.hidden = false;
  const rotulo = cor === 'w' ? 'Brancas' : 'Pretas';
  const frase = 'Você joga de ' + rotulo;
  const reduzido = movimentoReduzido();
  if (aleatorio && !reduzido) {
    elTextoRevelarCor.textContent = 'Sorteando as cores…';
    return new Promise((resolve) => {
      setTimeout(() => { elTextoRevelarCor.textContent = frase; }, 700);
      setTimeout(() => {
        elRevelarCor.hidden = true;
        elOverlayCores.hidden = true;
        resolve();
      }, 1800);
    });
  }
  elTextoRevelarCor.textContent = frase;
  const ms = reduzido ? 0 : 1200;
  return new Promise((resolve) => {
    setTimeout(() => {
      elRevelarCor.hidden = true;
      elOverlayCores.hidden = true;
      resolve();
    }, ms);
  });
}

function aplicarCoresEComecar(dados) {
  online.cor = dados.cor;
  if (dados.papel) online.papel = dados.papel;
  if (dados.cor === 'w' || dados.cor === 'b') brancasEmbaixo = dados.cor === 'w';
  online.escolhendoCores = false;
  online.revelandoCor = true;
  limparSelecao();
  criarTabuleiro();
  if (dados.estado) aplicarEstadoOnline(dados.estado);
  renderizar();
  som('inicio');
  return revelarCorDefinida(dados.cor, !!dados.aleatorio).finally(() => {
    online.revelandoCor = false;
  });
}

function entrarNaInterfaceOnline(dados) {
  cancelarPensamentoBot();
  sairRevisao({ semRender: true });
  online.ativo = true;
  online.espectador = false;
  online.codigo = dados.codigo;
  online.token = dados.token;
  online.papel = dados.papel || online.papel;
  online.cor = (dados.cor === 'w' || dados.cor === 'b') ? dados.cor : (dados.cor || null);
  modoApp = 'online';
  partidaIniciada = true;
  salvarSessao(dados.codigo, dados.token);
  if (online.cor === 'w' || online.cor === 'b') brancasEmbaixo = online.cor === 'w';
  else brancasEmbaixo = true;
  elFaixaOnline.hidden = false;
  elSubtitulo.textContent = 'Partida online';
  mostrarTela('jogo');
  atualizarAbasVisiveis();
  criarTabuleiro();
  restaurarChat(dados.chat);
  aplicarEstadoOnline(dados.estado);
  renderizar();
}

/** Entra na sala só para assistir (sem cor e sem token). */
function entrarComoEspectador(dados) {
  cancelarPensamentoBot();
  sairRevisao({ semRender: true });
  online.ativo = true;
  online.espectador = true;
  online.codigo = dados.codigo;
  online.token = null;
  online.cor = null;
  online.papel = null;
  modoApp = 'online';
  partidaIniciada = true;
  brancasEmbaixo = true;
  elFaixaOnline.hidden = false;
  mostrarTela('jogo');
  atualizarAbasVisiveis();
  criarTabuleiro();
  restaurarChat(dados.chat);
  aplicarEstadoOnline(dados.estado);
  renderizar();
  som('inicio');
  toast('👁️ Você está assistindo. Só os jogadores mexem nas peças.');
}

/** Pede ao servidor para assistir a sala `codigo`. */
function assistirSala(codigo) {
  const c = String(codigo || '').toUpperCase().trim();
  if (!c) return;
  emitirQuandoPronto('assistirSala', { codigo: c, nome: nomeDoUsuario() || undefined });
}

function ligarEventosSocket(s) {
  s.on('connect_error', () => toast('Não foi possível conectar ao servidor.'));
  // Se a conexão cair e voltar sozinha, volta para a mesma sala.
  s.on('connect', () => {
    if (!s._jaConectou) { s._jaConectou = true; return; }
    if (!online.ativo || !online.codigo) return;
    if (online.espectador) s.emit('assistirSala', { codigo: online.codigo, nome: nomeDoUsuario() || undefined });
    else if (online.token) s.emit('reconectar', { codigo: online.codigo, token: online.token, nome: nomeDoUsuario() });
  });
  s.on('erro', async (d) => {
    const msg = (d && d.mensagem) || 'Erro de conexão.';
    if (d && d.podeAssistir && d.codigo) {
      // Sala cheia (ou partida já encerrada): oferece entrar como espectador.
      const ok = await confirmar(msg, 'Quer assistir a esta partida como espectador?');
      if (ok) assistirSala(d.codigo);
      return;
    }
    toast(msg);
  });
  s.on('entrouComoEspectador', (d) => entrarComoEspectador(d));
  s.on('espectadores', (d) => {
    if (!online.ativo || !d) return;
    atualizarEspectadores(Number(d.quantidade) || 0);
  });
  s.on('chatMensagem', (m) => adicionarMensagemChat(m, true));
  s.on('chatRecusado', (d) => toast((d && d.motivo) || 'Mensagem não enviada.'));
  s.on('entrouSala', (d) => {
    entrarNaInterfaceOnline(d);
    /* O som de início só toca quando as cores são definidas (coresDefinidas). */
  });
  s.on('escolherCores', (d) => {
    if (d.estado) aplicarEstadoOnline(d.estado);
    mostrarMenuCores(d.estado, d.sugestao, !!d.revanche);
    renderizar();
  });
  s.on('coresDefinidas', (d) => {
    aplicarCoresEComecar(d);
  });
  s.on('partidaIniciada', (d) => {
    // Impostor: os dois clicaram em Pronto e o relógio começou.
    if (d.estado) aplicarEstadoOnline(d.estado);
    if (elOverlayEspera) elOverlayEspera.hidden = true;
    online.aguardando = false;
    renderizar();
    if (ehImpostor()) {
      som('inicio');
      toast('A partida começou! As brancas jogam.');
    }
  });
  s.on('lanceFeito', async (d) => {
    const lance = d.lance;
    const origemPixel = online._origemPixel;
    online._origemPixel = null;
    online._esperandoLance = null;
    online._prelanceEnviado = false;
    animando = true;
    if (lance.promotion) som('promocao');
    else if (lance.castle) som('roque');
    else if (lance.captured) som('capturar');
    else som('mover');
    aplicarEstadoOnline(d.estado);
    // Recoloca o tabuleiro visualmente no estado ANTERIOR? Já aplicamos FEN novo.
    // Para animar, precisamos do DOM antigo. Vamos: se o DOM ainda não foi
    // redesenhado, as peças estão no lugar antigo. aplicarEstado só mudou o motor.
    // Então animamos agora e só então renderizamos.
    try { await animarLance(lance, { origemPixel: origemPixel }); }
    finally {
      animando = false;
      renderizar({ capturaRecente: lance.captured });
    }
    // Ajusta o som de xeque/fim com o status já aplicado
    avisarRevelacoes(lance);
    const st = statusEfetivo();
    if (st === 'xeque') som('xeque');
    else if (st === 'xeque-mate' || String(st).indexOf('empate') === 0 || st === 'tempo' || st === 'desistencia') som('fim');
    // Foi o lance do adversário? Então sai o nosso pré-lance (se houver).
    if (!online.espectador && jogo.vez() === online.cor) executarPrelanceSePossivel();
  });
  s.on('lanceIlegal', (d) => {
    online._origemPixel = null;
    online._esperandoLance = null;
    // Pré-lance recusado pelo servidor (ex.: no Impostor, deixaria o rei em
    // xeque): cancela em silêncio, sem som nem aviso.
    const eraPrelance = online._prelanceEnviado;
    online._prelanceEnviado = false;
    if (eraPrelance) {
      if (online.estado) aplicarEstadoOnline(online.estado);
      renderizar();
      return;
    }
    som('ilegal');
    toast((d && d.motivo) || 'Lance ilegal.');
    if (online.estado) aplicarEstadoOnline(online.estado);
    renderizar();
  });
  s.on('relogio', (d) => {
    if (!d || !d.relogio || !online.estado) return;
    online.estado.relogio = d.relogio;
    relogioOnline = { w: d.relogio.w, b: d.relogio.b, ativo: d.relogio.ativo, recebidoEm: Date.now() };
  });
  s.on('fimDeJogo', (d) => {
    aplicarEstadoOnline(d.estado);
    renderizar();
    som('fim');
  });
  s.on('propostaEmpate', (d) => {
    aplicarEstadoOnline(d.estado);
    if (online.espectador) {
      toast('🤝 As ' + (d.de === 'w' ? 'brancas' : 'pretas') + ' propuseram empate.');
    } else if (d.de !== online.cor) {
      elModalEmpate.hidden = false;
      som('menu');
    } else {
      toast('Proposta de empate enviada.');
    }
  });
  s.on('empateRecusado', (d) => {
    aplicarEstadoOnline(d.estado);
    elModalEmpate.hidden = true;
    if (online.espectador) toast('O empate foi recusado.');
    else if (d.por !== online.cor) toast('O oponente recusou o empate.');
  });
  s.on('revancheIniciada', (d) => {
    // Compatibilidade: a revanche agora reabre o menu de cores (escolherCores).
    if (d.cor) online.cor = d.cor;
    if (d.token) {
      online.token = d.token;
      salvarSessao(online.codigo, d.token);
    }
    if (d.cor === 'w' || d.cor === 'b') brancasEmbaixo = d.cor === 'w';
    limparSelecao();
    criarTabuleiro();
    if (d.estado) aplicarEstadoOnline(d.estado);
    renderizar();
  });
  s.on('oponenteDesconectado', (d) => {
    if (d.estado) aplicarEstadoOnline(d.estado);
    elAvisoConexao.hidden = false;
    renderizar();
  });
  s.on('oponenteReconectou', (d) => {
    if (d.estado) aplicarEstadoOnline(d.estado);
    elAvisoConexao.hidden = true;
    renderizar();
  });
  s.on('estado', (d) => {
    if (d.estado) { aplicarEstadoOnline(d.estado); renderizar(); }
  });
  s.on('salaEncerrada', (d) => {
    toast((d && d.motivo) || 'A sala foi encerrada.');
    voltarAoInicio();
  });
  s.on('substituido', (d) => toast((d && d.motivo) || 'Conectado em outra janela.'));
}

// ------------------------------------------------------------------------
// Sons de lance online: tocamos o tipo do lance na recepção; xeque/fim
// foram duplicados acima de propósito após aplicar o estado. Evitamos o
// xeque/fim precoce em tocarSomDoLance quando o estado ainda é o antigo.
// Ajustamos tocarSomDoLance no handler para só o som do tipo do lance.
// (O handler já chama som('xeque')/som('fim') depois.)
// ------------------------------------------------------------------------

// ------------------------------------------------------------------------
// Subabas do painel (Partida / Histórico / Chat / Opções)
// ------------------------------------------------------------------------

let abaAtual = 'partida';

function mostrarAba(nome) {
  const botao = document.querySelector('.aba[data-aba="' + nome + '"]');
  if (!botao || botao.hidden) nome = 'partida';
  abaAtual = nome;
  document.querySelectorAll('.aba').forEach((b) => {
    const ativa = b.getAttribute('data-aba') === nome;
    b.setAttribute('aria-selected', String(ativa));
    b.tabIndex = ativa ? 0 : -1;
  });
  document.querySelectorAll('.painel-aba').forEach((p) => {
    p.hidden = p.id !== 'painel-' + nome;
  });
  if (nome === 'chat') zerarNaoLidas();
  if (nome === 'historico') {
    const foco = elHistorico.querySelector('.lance-atual') || elHistorico.lastElementChild;
    if (foco) foco.scrollIntoView({ block: 'nearest' });
  }
}

/** O chat só existe nas partidas online. */
function atualizarAbasVisiveis() {
  const abaChat = document.getElementById('aba-chat');
  abaChat.hidden = !online.ativo;
  document.getElementById('painel-chat').classList.toggle('so-leitura', !!online.espectador);
  const aviso = document.getElementById('chat-aviso');
  aviso.hidden = !online.espectador;
  aviso.textContent = online.espectador ? 'Espectadores só leem o chat.' : '';
  document.querySelectorAll('[data-chat-id]').forEach((b) => { b.disabled = !!online.espectador; });
  mostrarAba(abaChat.hidden && abaAtual === 'chat' ? 'partida' : abaAtual);
}

document.querySelector('.abas').addEventListener('click', (e) => {
  const b = e.target.closest('.aba');
  if (b) mostrarAba(b.getAttribute('data-aba'));
});
// Teclado nas abas: setas esquerda/direita trocam de aba (padrão ARIA).
document.querySelector('.abas').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const abas = Array.from(document.querySelectorAll('.aba')).filter((b) => !b.hidden);
  const i = abas.findIndex((b) => b.getAttribute('data-aba') === abaAtual);
  const prox = abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
  mostrarAba(prox.getAttribute('data-aba'));
  prox.focus();
  e.preventDefault();
  e.stopPropagation();
});

// ------------------------------------------------------------------------
// Revisar partida (qualquer modo, depois do fim)
// ------------------------------------------------------------------------

/** Dá para revisar? Só com a partida terminada e (no Impostor) já revelada. */
function podeRevisar() {
  if (!partidaIniciada || modoApp === 'inicio' || !partidaAcabou()) return false;
  if (!historicoAtual().length) return false;
  if (ehImpostor()) return impostorRevelado();
  return true;
}

/** Lista dos lances jogados como {from, to, promotion}, em qualquer modo. */
function lancesParaRevisao() {
  if (online.ativo && online.estado) return online.estado.lances || [];
  return jogo.pgn.map((l) => ({ from: l.from, to: l.to, promotion: l.promotion }));
}

/**
 * Refaz a partida do início, guardando uma "foto" depois de cada meio-lance.
 * No Impostor usamos as funções reveladas pelo servidor no fim: cada foto tem
 * a visão completa (aparência + função real), e o selo mostra quem era quem.
 */
function construirPosicoesRevisao() {
  const lances = lancesParaRevisao();
  const posicoes = [];
  if (ehImpostor()) {
    const funcoes = online.estado.impostor.revelacao.funcoes;
    const j = new Impostor.JogoImpostor();
    const fw = {}, fb = {};
    for (const id of Object.keys(funcoes)) (Number(id) < 32 ? fw : fb)[id] = funcoes[id];
    j.definirFuncoes('w', fw);
    j.definirFuncoes('b', fb);
    const foto = (ultimo) => {
      const visao = j.tabuleiroFinal();
      return { visao: visao, tabuleiro: visao.map(letraDaVisao), ultimo: ultimo, capturadas: j.pecasCapturadas() };
    };
    posicoes.push(foto(null));
    for (const l of lances) {
      const feito = j.mover({ from: l.from, to: l.to, promotion: l.promotion });
      if (!feito) break;
      posicoes.push(foto(feito));
    }
    return posicoes;
  }
  const c = new Chess();
  posicoes.push({ tabuleiro: c.obterTabuleiro(), visao: null, ultimo: null, capturadas: c.pecasCapturadas() });
  for (const l of lances) {
    const feito = c.mover({ from: l.from, to: l.to, promotion: l.promotion });
    if (!feito) break;
    posicoes.push({ tabuleiro: c.obterTabuleiro(), visao: null, ultimo: feito, capturadas: c.pecasCapturadas() });
  }
  return posicoes;
}

/** Entra na revisão mostrando a posição `indice` (0 = antes do 1º lance). */
function entrarRevisao(indice) {
  if (!podeRevisar()) return;
  if (!revisao.ativa) {
    revisao.posicoes = construirPosicoesRevisao();
    revisao.ativa = true;
    limparSelecao();
    elBarraRevisao.hidden = false;
    elTelaJogo.classList.add('em-revisao');
    mostrarAba('historico');
  }
  irParaPosicao(indice == null ? 0 : indice, { semSom: true });
}

function irParaPosicao(indice, opcoes) {
  if (!revisao.ativa) return;
  const max = revisao.posicoes.length - 1;
  const novo = Math.max(0, Math.min(max, indice));
  const mudou = novo !== revisao.indice;
  revisao.indice = novo;
  const ultimo = revisao.posicoes[novo].ultimo;
  if (mudou && !(opcoes && opcoes.semSom) && ultimo) som(ultimo.captured ? 'capturar' : 'mover');
  const sans = historicoAtual();
  const texto = document.getElementById('texto-revisao');
  texto.textContent = novo === 0
    ? 'Início · 0/' + max
    : (Math.ceil(novo / 2) + (novo % 2 ? '. ' : '… ') + (sans[novo - 1] || '') + ' · ' + novo + '/' + max);
  elBarraRevisao.querySelector('[data-revisao="primeiro"]').disabled = novo === 0;
  elBarraRevisao.querySelector('[data-revisao="anterior"]').disabled = novo === 0;
  elBarraRevisao.querySelector('[data-revisao="proximo"]').disabled = novo === max;
  elBarraRevisao.querySelector('[data-revisao="ultimo"]').disabled = novo === max;
  renderizar();
}

function sairRevisao(opcoes) {
  if (!revisao.ativa) return;
  revisao.ativa = false;
  revisao.posicoes = [];
  revisao.indice = 0;
  elBarraRevisao.hidden = true;
  elTelaJogo.classList.remove('em-revisao');
  if (!(opcoes && opcoes.semRender)) renderizar();
}

elBtnRevisar.addEventListener('click', () => entrarRevisao(0));
elBarraRevisao.addEventListener('click', (e) => {
  const b = e.target.closest('[data-revisao]');
  if (!b || b.disabled) return;
  const acao = b.getAttribute('data-revisao');
  if (acao === 'sair') return sairRevisao();
  if (acao === 'primeiro') irParaPosicao(0);
  if (acao === 'anterior') irParaPosicao(revisao.indice - 1);
  if (acao === 'proximo') irParaPosicao(revisao.indice + 1);
  if (acao === 'ultimo') irParaPosicao(revisao.posicoes.length - 1);
});
// Clique num lance do histórico: vai direto para aquela posição.
elHistorico.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ply]');
  if (!b) return;
  const ply = Number(b.getAttribute('data-ply'));
  if (!revisao.ativa) entrarRevisao(ply);
  else irParaPosicao(ply);
});
// Setas do teclado: ← → navegam; Home/End vão às pontas. Com a partida
// terminada, ← também abre a revisão no penúltimo lance.
document.addEventListener('keydown', (e) => {
  if (elTelaJogo.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  const alvo = e.target;
  if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.closest('.abas'))) return;
  if (!elModalConfig.hidden || !elModalConfirma.hidden || !elModalPromocao.hidden) return;
  if (!revisao.ativa) {
    if (e.key === 'ArrowLeft' && podeRevisar()) {
      entrarRevisao(historicoAtual().length - 1);
      e.preventDefault();
    }
    return;
  }
  const mapa = { ArrowLeft: -1, ArrowRight: 1 };
  if (e.key in mapa) irParaPosicao(revisao.indice + mapa[e.key]);
  else if (e.key === 'Home') irParaPosicao(0);
  else if (e.key === 'End') irParaPosicao(revisao.posicoes.length - 1);
  else return;
  e.preventDefault();
});

// ------------------------------------------------------------------------
// Chat rápido (só online; o servidor valida o ID e o limite de envio)
// ------------------------------------------------------------------------

let naoLidas = 0;
let ultimoEnvioChat = 0;

function montarBotoesChat() {
  const frases = document.getElementById('chat-frases');
  const emojis = document.getElementById('chat-emojis');
  for (const m of ChatRapido.MENSAGENS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = m.tipo === 'emoji' ? 'botao botao-emoji' : 'botao botao-frase';
    b.textContent = m.texto;
    b.dataset.chatId = m.id;
    b.setAttribute('aria-label', 'Enviar: ' + m.texto);
    (m.tipo === 'emoji' ? emojis : frases).appendChild(b);
  }
}
montarBotoesChat();

function enviarChat(id) {
  if (!online.ativo || online.espectador) return;
  // Trava local curta (o servidor tem o limite de verdade).
  const agora = Date.now();
  if (agora - ultimoEnvioChat < 700) { toast('Calma! Espere um pouco.'); return; }
  ultimoEnvioChat = agora;
  emitirQuandoPronto('chat', { id: id });
}
document.getElementById('painel-chat').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chat-id]');
  if (b && !b.disabled) enviarChat(b.getAttribute('data-chat-id'));
});

function zerarNaoLidas() {
  naoLidas = 0;
  const el = document.getElementById('chat-nao-lidas');
  if (el) el.hidden = true;
}

/** Limpa o registro e recoloca as mensagens que o servidor guardou. */
function restaurarChat(lista) {
  document.getElementById('chat-registro').innerHTML = '';
  zerarNaoLidas();
  for (const m of lista || []) adicionarMensagemChat(m, false);
}

/** Lado do tabuleiro (topo/base) onde fica o jogador que mandou a mensagem. */
function ladoDoBalao(m) {
  const corBase = brancasEmbaixo ? 'w' : 'b';
  if (m.cor === 'w' || m.cor === 'b') return m.cor === corBase ? 'base' : 'topo';
  return m.papel === online.papel ? 'base' : 'topo';
}

/**
 * Mostra uma mensagem: no registro (aba Chat) e, ao vivo, num balão perto
 * do nome do jogador. Com o chat silenciado, só aparecem as nossas.
 */
function adicionarMensagemChat(m, aoVivo) {
  const msg = m && ChatRapido.mensagemPorId(m.id);
  if (!msg) return;
  const minha = !online.espectador && m.papel === online.papel;
  if (config.chatMudo && !minha) return;
  const nome = minha ? 'Você' : (sanitizarNome(m.nome) || (m.cor === 'w' ? 'Brancas' : m.cor === 'b' ? 'Pretas' : 'Oponente'));

  const registro = document.getElementById('chat-registro');
  const li = document.createElement('li');
  li.className = minha ? 'chat-minha' : '';
  const quem = document.createElement('strong');
  quem.textContent = nome + ': ';
  const texto = document.createElement('span');
  texto.textContent = msg.texto;
  li.append(quem, texto);
  registro.appendChild(li);
  while (registro.children.length > 40) registro.firstElementChild.remove();
  registro.scrollTop = registro.scrollHeight;

  if (!aoVivo) return;
  const balao = document.getElementById(ladoDoBalao(m) === 'base' ? 'balao-base' : 'balao-topo');
  balao.textContent = (minha ? '' : nome + ': ') + msg.texto;
  balao.classList.toggle('balao-emoji', msg.tipo === 'emoji');
  balao.hidden = false;
  balao.classList.remove('balao-sumindo');
  clearTimeout(balao._t);
  clearTimeout(balao._t2);
  balao._t = setTimeout(() => balao.classList.add('balao-sumindo'), 3200);
  balao._t2 = setTimeout(() => { balao.hidden = true; balao.classList.remove('balao-sumindo'); }, 3600);
  if (!minha) {
    som('selecionar');
    if (abaAtual !== 'chat') {
      naoLidas += 1;
      const el = document.getElementById('chat-nao-lidas');
      el.textContent = String(naoLidas);
      el.hidden = false;
    }
  }
}

function definirChatMudo(mudo) {
  config.chatMudo = !!mudo;
  salvarConfig();
  sincronizarBotoesConfig();
  if (mudo) {
    document.getElementById('balao-topo').hidden = true;
    document.getElementById('balao-base').hidden = true;
  }
}
document.getElementById('cfg-chat-mudo').addEventListener('change', (e) => definirChatMudo(e.target.checked));
document.getElementById('cfg-chat-mudo-geral').addEventListener('change', (e) => definirChatMudo(e.target.checked));

// ------------------------------------------------------------------------
// Atalhos da aba Opções
// ------------------------------------------------------------------------

document.getElementById('btn-som-rapido').addEventListener('click', () => alternarMudo());
document.getElementById('btn-config-completa').addEventListener('click', abrirConfig);
document.querySelectorAll('[data-estilo-rapido]').forEach((b) => {
  b.addEventListener('click', () => {
    config.estiloPecas = b.getAttribute('data-estilo-rapido');
    salvarConfig();
    sincronizarBotoesConfig();
    renderizar();
    som('clique');
  });
});

// ------------------------------------------------------------------------
// Diálogos e botões
// ------------------------------------------------------------------------

function abrirPromocao(cor) {
  elModalPromocao.querySelectorAll('.botao-promocao').forEach((btn) => {
    const tipo = btn.getAttribute('data-peca');
    const letra = cor === 'w' ? tipo.toUpperCase() : tipo;
    const slot = btn.querySelector('[data-simbolo]');
    slot.innerHTML = '';
    slot.appendChild(criarElementoPeca(letra, estiloPecas()));
  });
  elModalPromocao.hidden = false;
}
function fecharPromocao() { elModalPromocao.hidden = true; }

document.getElementById('opcoes-promocao').addEventListener('click', (e) => {
  const btn = e.target.closest('.botao-promocao');
  if (btn) confirmarPromocao(btn.getAttribute('data-peca'));
});

elModalModos.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-modo]');
  if (btn) iniciarPartidaLocal(btn.getAttribute('data-modo'));
});
elBtnModosCancelar.addEventListener('click', () => {
  elModalModos.hidden = true;
  if (modoApp === 'inicio') return;
  if (partidaIniciada && !partidaAcabou()) retomarRelogio();
});

// Cartão "Local (mesmo PC)": os três tempos começam a partida direto.
document.querySelectorAll('[data-modo-inicio]').forEach((btn) => {
  btn.addEventListener('click', () => iniciarPartidaLocal(btn.getAttribute('data-modo-inicio')));
});
document.getElementById('form-assistir').addEventListener('submit', (e) => {
  e.preventDefault();
  assistirSala(document.getElementById('input-assistir').value);
});
document.getElementById('btn-criar-sala').addEventListener('click', () => {
  elModalCriar.hidden = false;
  som('menu');
});
document.getElementById('btn-criar-cancelar').addEventListener('click', () => { elModalCriar.hidden = true; });
document.getElementById('form-criar').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const modo = fd.get('modo');
  const variante = fd.get('variante') || 'classico';
  elModalCriar.hidden = true;
  emitirQuandoPronto('criarSala', { modo: modo, variante: variante, nome: nomeDoUsuario() });
});
document.getElementById('form-entrar').addEventListener('submit', (e) => {
  e.preventDefault();
  const codigo = document.getElementById('input-codigo').value.toUpperCase().trim();
  if (!codigo) return;
  const token = tokenDaSala(codigo);
  emitirQuandoPronto('entrarSala', { codigo: codigo, token: token || undefined, nome: nomeDoUsuario() || undefined });
});

if (elOverlayCores) {
  elOverlayCores.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-escolha]');
    if (!btn || online.papel !== 'anfitriao') return;
    const escolha = btn.getAttribute('data-escolha');
    if (!escolha) return;
    emitirQuandoPronto('escolherCor', { escolha: escolha });
  });
}

function copiarConvite() {
  if (online.codigo) copiarTexto(linkDaSala(online.codigo));
}
document.getElementById('btn-copiar-link').addEventListener('click', copiarConvite);
document.getElementById('btn-copiar-link-espera').addEventListener('click', copiarConvite);
document.getElementById('btn-cancelar-espera').addEventListener('click', () => voltarAoInicio());

document.getElementById('btn-desistir').addEventListener('click', async () => {
  if (!online.ativo || partidaAcabou()) return;
  if (online.estado && online.estado.statusSala !== 'em_andamento') return;
  const ok = await confirmar('Desistir?', 'Você perderá a partida.');
  if (ok) emitirQuandoPronto('desistir');
});
document.getElementById('btn-empate').addEventListener('click', () => {
  if (!online.ativo || partidaAcabou()) return;
  if (online.estado && online.estado.statusSala !== 'em_andamento') return;
  emitirQuandoPronto('proporEmpate');
});
document.getElementById('btn-empate-aceitar').addEventListener('click', () => {
  elModalEmpate.hidden = true;
  emitirQuandoPronto('responderEmpate', { aceitar: true });
});
document.getElementById('btn-empate-recusar').addEventListener('click', () => {
  elModalEmpate.hidden = true;
  emitirQuandoPronto('responderEmpate', { aceitar: false });
});
elBtnRevanche.addEventListener('click', () => {
  if (!online.ativo || !partidaAcabou()) return;
  emitirQuandoPronto('revanche');
  elBtnRevanche.textContent = 'Aguardando oponente…';
});

elBtnNovo.addEventListener('click', async () => {
  if (online.ativo) {
    const ok = !partidaIniciada || partidaAcabou() || await confirmar('Sair da partida?', 'Você deixará a sala atual.');
    if (ok) voltarAoInicio();
    return;
  }
  if (modoApp === 'bot') {
    sincronizarCorBot();
    elModalBot.hidden = false;
    som('menu');
    return;
  }
  abrirMenuModosLocal();
});
document.getElementById('btn-inicio').addEventListener('click', async () => {
  if (modoApp !== 'inicio' && partidaIniciada && !partidaAcabou() && !online.espectador) {
    const ok = await confirmar('Voltar ao início?', 'A partida atual será deixada.');
    if (!ok) return;
  }
  voltarAoInicio();
});

async function desfazerJogada() {
  if (online.ativo || animando || fimPorTempo || historicoAtual().length === 0 || revisao.ativa) return;
  if (promocaoPendente) { promocaoPendente = null; fecharPromocao(); }
  if (modoApp === 'bot') { await desfazerContraBot(); return; }
  const ultimo = jogo.ultimoLance();
  animando = true;
  elBtnDesfazer.disabled = true;
  jogo.desfazer();
  restaurarRetratoRelogio();
  try { if (ultimo) await animarLance(ultimo, { inverso: true }); else renderizar(); }
  finally {
    animando = false;
    renderizar();
    if (!partidaAcabou()) retomarRelogio();
  }
}
/**
 * Contra o bot, "Desfazer" volta até a última vez em que era a vez do
 * jogador (desfaz o lance do bot e o do jogador). Se o bot estava pensando,
 * o pensamento é cancelado e só o lance do jogador é desfeito.
 */
async function desfazerContraBot() {
  cancelarPensamentoBot();
  prelance = null;
  animando = true;
  try {
    let desfeitos = 0;
    while (jogo.historicoSan().length && (desfeitos === 0 || jogo.vez() !== bot.corJogador)) {
      const ultimo = jogo.ultimoLance();
      jogo.desfazer();
      desfeitos += 1;
      if (ultimo) await animarLance(ultimo, { inverso: true });
      renderizar();
    }
  } finally {
    animando = false;
    renderizar();
  }
  // Se voltou para o começo com o bot de brancas, ele joga de novo.
  if (jogo.vez() !== bot.corJogador) pedirLanceBot();
}
elBtnDesfazer.addEventListener('click', () => desfazerJogada());
elBtnGirar.addEventListener('click', () => {
  if (animando) return;
  brancasEmbaixo = !brancasEmbaixo;
  criarTabuleiro();
  renderizar();
});

function ajustarRolagemDoTabuleiro() {
  if (!elTelaJogo || elTelaJogo.hidden) return;
  const area = document.querySelector('.area-tabuleiro');
  if (!area) return;
  const barra = document.getElementById('barra-lado-topo');
  const barrasVisiveis = barra && getComputedStyle(barra).display !== 'none';
  if (barrasVisiveis && window.matchMedia('(max-width: 860px) and (orientation: landscape)').matches) {
    area.scrollIntoView({ block: 'start', inline: 'nearest' });
  }
}
window.addEventListener('resize', () => {
  if (ajustarRolagemDoTabuleiro._t) clearTimeout(ajustarRolagemDoTabuleiro._t);
  ajustarRolagemDoTabuleiro._t = setTimeout(ajustarRolagemDoTabuleiro, 80);
});
window.addEventListener('orientationchange', () => setTimeout(ajustarRolagemDoTabuleiro, 120));

document.getElementById('btn-config').addEventListener('click', abrirConfig);
document.getElementById('btn-config-fechar').addEventListener('click', fecharConfig);
document.getElementById('cfg-som').addEventListener('click', () => alternarMudo());
document.getElementById('cfg-volume').addEventListener('input', (e) => {
  config.volume = Number(e.target.value) / 100;
  document.getElementById('cfg-volume-valor').textContent = e.target.value + '%';
  salvarConfig();
  if (SonsXadrez && SonsXadrez.garantirAudio) SonsXadrez.garantirAudio();
});
document.getElementById('cfg-volume').addEventListener('change', () => som('mover'));
document.getElementById('cfg-dicas').addEventListener('change', (e) => {
  config.dicasLances = e.target.checked;
  salvarConfig();
  renderizar();
});
document.getElementById('cfg-coordenadas').addEventListener('change', (e) => {
  config.coordenadas = e.target.checked;
  salvarConfig();
  aplicarPreferenciasVisuais();
});
document.getElementById('modal-config').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cfg]');
  if (!btn) return;
  const chave = btn.getAttribute('data-cfg');
  const valor = btn.getAttribute('data-valor');
  if (config[chave] === valor) return;
  config[chave] = valor;
  salvarConfig();
  if (chave === 'tema') aplicarTema(valor);
  if (chave === 'pacoteSom') som('mover');
  if (chave === 'estiloPecas') {
    atualizarAmostraPecas();
    if (!elTelaJogo.hidden) renderizar();
    som('clique');
  }
  sincronizarBotoesConfig();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!elModalConfig.hidden) { fecharConfig(); return; }
  if (!elModalBot.hidden) { elModalBot.hidden = true; return; }
  if (revisao.ativa && elModalConfirma.hidden) { sairRevisao(); return; }
  if (!elModalCriar.hidden) { elModalCriar.hidden = true; return; }
  if (!elModalModos.hidden) { elBtnModosCancelar.click(); return; }
  if (!elModalConfirma.hidden) { document.getElementById('btn-confirma-nao').click(); return; }
  if (!elModalPromocao.hidden) return;
  if (animando) return;
  limparSelecao();
  if (!elTelaJogo.hidden) renderizar();
});

document.addEventListener('pointerdown', () => { if (SonsXadrez) SonsXadrez.garantirAudio(); }, { passive: true });
document.addEventListener('keydown', () => { if (SonsXadrez) SonsXadrez.garantirAudio(); });

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.disabled) return;
  if (btn.id === 'cfg-som' || btn.id === 'btn-som-rapido' || btn.id === 'btn-config' || btn.id === 'btn-criar-sala' || btn.id === 'btn-splash-jogar') return;
  if (btn.hasAttribute('data-tema-escolha') || btn.hasAttribute('data-modo') || btn.hasAttribute('data-cfg')) return;
  if (btn.hasAttribute('data-revisao') || btn.hasAttribute('data-chat-id') || btn.hasAttribute('data-estilo-rapido') || btn.hasAttribute('data-nivel') || btn.hasAttribute('data-modo-inicio')) return;
  if (btn.closest('#tabuleiro') || btn.closest('#opcoes-promocao')) return;
  som('clique');
});

// ------------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------------

globalThis.XadrezApp = {
  get socket() { return socket; },
  get online() { return online; },
  get jogo() { return jogo; },
  get config() { return config; },
  get bot() { return bot; },
  get revisao() { return revisao; },
  get prelance() { return prelance; },
  get marcas() { return marcas; },
  iniciarPartidaLocal: iniciarPartidaLocal,
  entrarRevisao: entrarRevisao,
  irParaPosicao: irParaPosicao,
  mostrarAba: mostrarAba,
  garantirSocket: garantirSocket,
  emitirQuandoPronto: emitirQuandoPronto,
  abrirPromocao: abrirPromocao,
};

function salvarNomeDoCampo(el, chave, fallback) {
  const n = sanitizarNome(el.value) || (fallback || '');
  el.value = n;
  if (config[chave] === n) return;
  config[chave] = n;
  salvarConfig();
  if (chave === 'nome' && online.ativo) emitirQuandoPronto('atualizarNome', { nome: n });
  if (elTelaJogo && !elTelaJogo.hidden) renderizar();
}

if (document.getElementById('form-nome')) {
  document.getElementById('form-nome').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = sanitizarNome(document.getElementById('input-nome').value);
    if (!n) {
      document.getElementById('input-nome').focus();
      return;
    }
    config.nome = n;
    salvarConfig();
    som('clique');
    mostrarTela('inicio');
    const params = new URLSearchParams(location.search);
    const sala = (params.get('sala') || '').toUpperCase().trim();
    if (sala) {
      const token = tokenDaSala(sala);
      if (token) emitirQuandoPronto('reconectar', { codigo: sala, token: token, nome: n });
      else emitirQuandoPronto('entrarSala', { codigo: sala, nome: n });
    }
  });
}
const cfgNome = document.getElementById('cfg-nome');
const cfgNomeP = document.getElementById('cfg-nome-pretas');
if (cfgNome) {
  cfgNome.addEventListener('change', () => salvarNomeDoCampo(cfgNome, 'nome', ''));
}
if (cfgNomeP) {
  cfgNomeP.addEventListener('change', () => salvarNomeDoCampo(cfgNomeP, 'nomeLocalPretas', 'Jogador 2'));
}

aplicarTema(config.tema, { silencioso: true });
atualizarControleSom();
sincronizarBotoesConfig();
aplicarPreferenciasVisuais();
garantirLoopRelogio();

/** Lê a versão (fonte única: package.json, via servidor) e mostra no canto. */
function carregarVersao() {
  const el = document.getElementById('versao-app');
  if (!el || typeof fetch !== 'function') return;
  fetch('/versao', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d && d.versao) el.textContent = 'v' + d.versao; })
    .catch(() => { /* sem versão, sem problema */ });
}
carregarVersao();

/** Botão "Jogar" da abertura: segue para o nome (1ª vez) ou direto ao menu. */
document.getElementById('btn-splash-jogar').addEventListener('click', () => {
  if (SonsXadrez && SonsXadrez.garantirAudio) SonsXadrez.garantirAudio();
  som('menu');
  if (!nomeDoUsuario()) {
    if (document.getElementById('input-nome')) document.getElementById('input-nome').value = '';
    mostrarTela('nome');
    setTimeout(() => { const i = document.getElementById('input-nome'); if (i) i.focus(); }, 50);
  } else {
    mostrarTela('inicio');
  }
});

(function arranqueTelas() {
  const params = new URLSearchParams(location.search);
  const sala = (params.get('sala') || '').toUpperCase().trim();
  if (sala) document.getElementById('input-codigo').value = sala;
  // Sem convite, começa pela tela de abertura. Com ?sala=, vai direto ao fluxo.
  if (!sala) {
    mostrarTela('splash');
    return;
  }
  if (!nomeDoUsuario()) {
    if (document.getElementById('input-nome')) document.getElementById('input-nome').value = '';
    mostrarTela('nome');
    return;
  }
  mostrarTela('inicio');
  if (!sala) return;
  const token = tokenDaSala(sala);
  if (token) {
    emitirQuandoPronto('reconectar', { codigo: sala, token: token, nome: nomeDoUsuario() });
  } else {
    emitirQuandoPronto('entrarSala', { codigo: sala, nome: nomeDoUsuario() });
  }
})();
