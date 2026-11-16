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
  estiloPecas: 'unicode',
  dicasLances: true,
  coordenadas: true,
  nome: '',
  nomeLocalPretas: 'Jogador 2',
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
};

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
      if (c.estiloPecas === 'plano') { c.estiloPecas = 'pixelado'; mudou = true; }
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
let modoAtual = MODOS.livre;
let modoApp = 'inicio'; // 'inicio' | 'local' | 'online'

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
};
let socket = null;
let relogioOnline = null;

// DOM
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
function estiloPecas() { return config.estiloPecas || 'unicode'; }

function partidaAcabou() {
  if (online.ativo && online.estado) {
    return online.estado.statusSala === 'terminado' || !!online.estado.resultado;
  }
  return !!fimPorTempo || jogo.jogoAcabou();
}

function interacaoBloqueada() {
  if (animando || partidaAcabou() || promocaoPendente) return true;
  if (!elModalModos.hidden || !elModalCriar.hidden || !elModalConfig.hidden) return true;
  if (online.ativo && online.estado) {
    const st = online.estado.statusSala;
    if (st === 'aguardando' || st === 'escolhendo-cores') return true;
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

function mostrarTela(nome) {
  if (elTelaNome) elTelaNome.hidden = nome !== 'nome';
  elTelaInicio.hidden = nome !== 'inicio';
  elTelaJogo.hidden = nome !== 'jogo';
}

function irParaInicio() {
  mostrarTela(nomeDoUsuario() ? 'inicio' : 'nome');
}

function voltarAoInicio() {
  if (online.ativo && socket) {
    socket.emit('sairSala');
  }
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
  if (online.ativo && online.estado && online.estado.ultimoLance) return online.estado.ultimoLance;
  return jogo.ultimoLance();
}

function statusEfetivo() {
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
  const tabuleiro = jogo.obterTabuleiro();
  const ultimo = ultimoLanceAtual();
  const status = statusEfetivo();
  const reiEmXeque = (status === 'xeque' || status === 'xeque-mate') ? jogo.casaDoRei(jogo.vez()) : -1;
  const destinos = new Map();
  if (config.dicasLances) {
    for (const lance of lancesDaSelecao) {
      destinos.set(lance.to, lance.captured ? 'captura' : 'vazio');
    }
  }

  for (const casa of elTabuleiro.children) {
    const sq = Number(casa.dataset.square);
    casa.classList.toggle('selecionada', selecionada === sq);
    casa.classList.toggle('em-xeque', reiEmXeque === sq);
    casa.classList.toggle('ultimo-lance', !!(ultimo && (ultimo.from === sq || ultimo.to === sq)));
    casa.classList.toggle('destino-vazio', destinos.get(sq) === 'vazio');
    casa.classList.toggle('destino-captura', destinos.get(sq) === 'captura');

    const peca = tabuleiro[sq];
    const atual = casa.querySelector('.peca');
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
    casa.setAttribute('aria-label', nomeDaPeca(peca) + ' ' + cor + ' em ' + casaParaAlgebrica(sq));
  }
  atualizarPainel(status, opcoes && opcoes.capturaRecente);
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

  elStatus.textContent = montarMensagemStatus(status);
  elStatus.className = 'status-jogo ' + classeDoStatus(status);
  elModoAtual.textContent = 'Modo: ' + (online.estado && online.estado.rotuloModo ? online.estado.rotuloModo : modoAtual.rotulo);

  if (online.ativo && online.cor) {
    elSuaCor.hidden = false;
    elSuaCor.textContent = 'Você joga com as ' + (online.cor === 'w' ? 'brancas' : 'pretas');
  } else {
    elSuaCor.hidden = true;
  }

  const sans = historicoAtual();
  elHistorico.innerHTML = '';
  for (let i = 0; i < sans.length; i += 2) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = (i / 2 + 1) + '.';
    const branca = document.createElement('span');
    branca.className = 'lance';
    branca.textContent = sans[i];
    const preta = document.createElement('span');
    preta.className = 'lance';
    preta.textContent = sans[i + 1] || '';
    li.append(num, branca, preta);
    elHistorico.appendChild(li);
  }
  if (elHistorico.lastElementChild) elHistorico.lastElementChild.scrollIntoView({ block: 'nearest' });

  const caps = capturadasAtuais();
  preencherCapturas(elCapBrancas, caps.w || [], capturaRecente);
  preencherCapturas(elCapPretas, caps.b || [], capturaRecente);

  const onlineBloqueiaDesfazer = online.ativo;
  elBtnDesfazer.disabled = onlineBloqueiaDesfazer || historicoAtual().length === 0 || !!fimPorTempo || animando || partidaAcabou();
  elBtnGirar.disabled = animando;

  const acabou = partidaAcabou();
  elBtnRevanche.hidden = !(online.ativo && acabou);
  atualizarNomesNaInterface();
  if (online.ativo && online.estado && online.estado.revanche && online.papel) {
    elBtnRevanche.textContent = online.estado.revanche[online.papel] ? 'Aguardando oponente…' : 'Revanche';
  } else if (online.ativo && acabou) {
    elBtnRevanche.textContent = 'Revanche';
  }

  pintarRelogios();
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
  if (online.ativo) return online.cor;
  return jogo.vez();
}

function selecionarCasa(sq, opcoes) {
  const peca = jogo.obterTabuleiro()[sq];
  const cor = corPermitida();
  if (!pecaDaVezEh(peca, cor) || (online.ativo && jogo.vez() !== online.cor)) {
    limparSelecao();
    renderizar();
    if (opcoes && opcoes.somIlegalSeFalhar) som('ilegal');
    return false;
  }
  selecionada = sq;
  lancesDaSelecao = jogo.lances(sq);
  renderizar();
  som('selecionar');
  return true;
}

async function tentarMover(de, para, origemPixel) {
  const candidatas = jogo.lances(de).filter((l) => l.to === para);
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
  if (interacaoBloqueada()) return;
  const sq = Number(evento.currentTarget.dataset.square);
  if (selecionada === null) { selecionarCasa(sq); return; }
  if (selecionada === sq) { limparSelecao(); renderizar(); return; }
  const legal = lancesDaSelecao.some((l) => l.to === sq);
  if (legal) tentarMover(selecionada, sq);
  else selecionarCasa(sq, { somIlegalSeFalhar: true });
}

function noMouseDown(evento) {
  if (evento.button !== 0 || interacaoBloqueada()) return;
  const sq = Number(evento.currentTarget.dataset.square);
  const peca = jogo.obterTabuleiro()[sq];
  if (!pecaDaVezEh(peca, corPermitida())) return;
  if (online.ativo && jogo.vez() !== online.cor) return;
  arraste = { from: sq, peca: peca, iniciado: false, consumido: false, x: evento.clientX, y: evento.clientY };
}
function noTouchStart(evento) {
  if (interacaoBloqueada()) return;
  const t = evento.changedTouches[0];
  const sq = Number(evento.currentTarget.dataset.square);
  const peca = jogo.obterTabuleiro()[sq];
  if (!pecaDaVezEh(peca, corPermitida())) return;
  if (online.ativo && jogo.vez() !== online.cor) return;
  arraste = { from: sq, peca: peca, iniciado: false, consumido: false, x: t.clientX, y: t.clientY, toque: true };
}

function iniciarArrasteVisual() {
  if (!arraste || arraste.iniciado) return;
  arraste.iniciado = true;
  selecionada = arraste.from;
  lancesDaSelecao = jogo.lances(arraste.from);
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
  tentarMover(origem, destino, ponto).then((ok) => {
    if (!ok) { som('ilegal'); renderizar(); }
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
// Partida local
// ------------------------------------------------------------------------

function abrirMenuModosLocal() {
  pausarRelogio();
  elModalModos.hidden = false;
  som('menu');
}

function iniciarPartidaLocal(idModo) {
  const modo = MODOS[idModo] || MODOS.livre;
  modoAtual = modo;
  modoApp = 'local';
  online.ativo = false;
  online.estado = null;
  fecharPromocao();
  elModalModos.hidden = true;
  elFaixaOnline.hidden = true;
  elOverlayEspera.hidden = true;
  promocaoPendente = null;
  animando = false;
  document.querySelectorAll('.peca-voadora').forEach((el) => el.remove());
  jogo.resetar();
  brancasEmbaixo = true;
  limparSelecao();
  partidaIniciada = true;
  fimPorTempo = null;
  elSubtitulo.textContent = 'Dois jogadores no mesmo computador';
  mostrarTela('jogo');
  criarTabuleiro();
  iniciarRelogiosDoModo(modo);
  renderizar();
  som('inicio');
}

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

  atualizarAvisoConexao(estado);
  atualizarOverlaysSala(estado);
  document.getElementById('texto-codigo').textContent = estado.codigo || '-----';
}

function oponenteEstaDesconectado(estado) {
  if (!estado || !estado.conectados) return false;
  if (estado.statusSala === 'aguardando') return false;
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
}

function atualizarOverlaysSala(estado) {
  const st = estado && estado.statusSala;
  online.aguardando = st === 'aguardando';
  online.escolhendoCores = st === 'escolhendo-cores';
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
  if (!elOverlayCores) return;
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
  online.ativo = true;
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
  criarTabuleiro();
  aplicarEstadoOnline(dados.estado);
  renderizar();
}

function ligarEventosSocket(s) {
  s.on('connect_error', () => toast('Não foi possível conectar ao servidor.'));
  s.on('erro', (d) => toast((d && d.mensagem) || 'Erro de conexão.'));
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
    // Compatibilidade: se um estado antigo emitir isto, só sincroniza.
    if (d.estado) aplicarEstadoOnline(d.estado);
    if (elOverlayEspera) elOverlayEspera.hidden = true;
    online.aguardando = false;
    renderizar();
  });
  s.on('lanceFeito', async (d) => {
    const lance = d.lance;
    const origemPixel = online._origemPixel;
    online._origemPixel = null;
    online._esperandoLance = null;
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
    const st = statusEfetivo();
    if (st === 'xeque') som('xeque');
    else if (st === 'xeque-mate' || String(st).indexOf('empate') === 0 || st === 'tempo' || st === 'desistencia') som('fim');
  });
  s.on('lanceIlegal', (d) => {
    online._origemPixel = null;
    online._esperandoLance = null;
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
    if (d.de !== online.cor) {
      elModalEmpate.hidden = false;
      som('menu');
    } else {
      toast('Proposta de empate enviada.');
    }
  });
  s.on('empateRecusado', (d) => {
    aplicarEstadoOnline(d.estado);
    elModalEmpate.hidden = true;
    if (d.por !== online.cor) toast('O oponente recusou o empate.');
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

document.getElementById('btn-jogar-local').addEventListener('click', () => abrirMenuModosLocal());
document.getElementById('btn-criar-sala').addEventListener('click', () => {
  elModalCriar.hidden = false;
  som('menu');
});
document.getElementById('btn-criar-cancelar').addEventListener('click', () => { elModalCriar.hidden = true; });
document.getElementById('form-criar').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const modo = fd.get('modo');
  elModalCriar.hidden = true;
  emitirQuandoPronto('criarSala', { modo: modo, nome: nomeDoUsuario() });
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
  abrirMenuModosLocal();
});
document.getElementById('btn-inicio').addEventListener('click', async () => {
  if (modoApp !== 'inicio' && partidaIniciada && !partidaAcabou()) {
    const ok = await confirmar('Voltar ao início?', 'A partida atual será deixada.');
    if (!ok) return;
  }
  voltarAoInicio();
});

async function desfazerJogada() {
  if (online.ativo || animando || fimPorTempo || historicoAtual().length === 0) return;
  if (promocaoPendente) { promocaoPendente = null; fecharPromocao(); }
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
  if (btn.id === 'cfg-som' || btn.id === 'btn-config' || btn.id === 'btn-jogar-local' || btn.id === 'btn-criar-sala') return;
  if (btn.hasAttribute('data-tema-escolha') || btn.hasAttribute('data-modo') || btn.hasAttribute('data-cfg')) return;
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

(function arranqueTelas() {
  const params = new URLSearchParams(location.search);
  const sala = (params.get('sala') || '').toUpperCase().trim();
  if (sala) document.getElementById('input-codigo').value = sala;
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
