/**
 * Conjuntos de peças do xadrez.
 * -----------------------------
 *  - classico: peças "flat" (vetor plano moderno), silhuetas lisas e
 *              arredondadas, sem contorno, com sombra em duas cores.
 *              É o estilo PADRÃO desde a v1.3.0.
 *  - pixel:    peças 8-bit desenhadas numa grade 16×20 de <rect>, com
 *              contorno preto de 1 pixel e sombreado no lado direito.
 *  - unicode:  glifos preenchidos (♚♛♜♝♞♟) coloridos por CSS (mantido como
 *              opção leve, útil em aparelhos muito simples).
 *
 * Os dois estilos SVG são desenhos originais deste projeto (inspirados nas
 * imagens de referência do André, mas desenhados do zero).
 *
 * Todas as funções devolvem um elemento DOM pronto para o tabuleiro,
 * o painel de capturas, o diálogo de promoção e as animações.
 *
 * Estilos antigos (v1.2.x): "staunton" vira "classico" e "pixelado"/"plano"
 * viram "pixel" (ver normalizarEstilo e a migração em script.js).
 */
'use strict';

const SIMBOLOS_UNICODE = {
  // Sempre os glifos preenchidos; a cor (clara/escura) vem do CSS.
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

/** Estilos disponíveis e o padrão. */
const ESTILOS_PECAS = ['classico', 'pixel', 'unicode'];
const ESTILO_PADRAO = 'classico';

function ehBranca(peca) {
  return peca === peca.toUpperCase();
}

/** Converte nomes antigos de estilo para os atuais. */
function normalizarEstilo(estilo) {
  if (estilo === 'staunton') return 'classico';
  if (estilo === 'pixelado' || estilo === 'plano') return 'pixel';
  return ESTILOS_PECAS.indexOf(estilo) !== -1 ? estilo : ESTILO_PADRAO;
}

// ===========================================================================
// Estilo "Clássico" (flat)
// ===========================================================================

/**
 * Cores do estilo flat. Cada lado tem:
 *  - luz:   cor principal (metade esquerda da peça)
 *  - sombra: metade direita (dá volume sem contorno)
 *  - base:  degraus do pedestal, um tom abaixo
 *  - borda: traço finíssimo e suave, só para a peça não "sumir" em casas da
 *           mesma tonalidade (branca na casa clara, preta na casa escura).
 *  - det:   detalhes (olho do cavalo, corte da mitra do bispo)
 */
const CORES_FLAT = {
  w: { luz: '#ffffff', sombra: '#dde2e8', base: '#cfd5dd', borda: 'rgba(40, 48, 60, 0.42)', det: '#8e99a6' },
  b: { luz: '#3b4b5b', sombra: '#2b3743', base: '#222c36', borda: 'rgba(235, 240, 245, 0.30)', det: '#9fb0c2' },
};

/**
 * Definições SVG compartilhadas (gradientes com "corte seco": metade luz,
 * metade sombra). Ficam num <svg> escondido no documento, uma vez só, para
 * que todas as peças usem url(#...) sem repetir IDs.
 */
function garantirDefsFlat() {
  if (typeof document === 'undefined' || document.getElementById('defs-pecas-flat')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('id', 'defs-pecas-flat');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  let defs = '';
  for (const lado of ['w', 'b']) {
    const c = CORES_FLAT[lado];
    // Corte em 56%: a luz vem da esquerda, como na referência.
    defs += '<linearGradient id="flat-corpo-' + lado + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + c.luz + '"/><stop offset="0.56" stop-color="' + c.luz + '"/>' +
      '<stop offset="0.56" stop-color="' + c.sombra + '"/><stop offset="1" stop-color="' + c.sombra + '"/>' +
      '</linearGradient>';
  }
  svg.innerHTML = '<defs>' + defs + '</defs>';
  (document.body || document.documentElement).appendChild(svg);
}

/**
 * Formas do estilo flat (viewBox 0 0 45 45). Cada função devolve uma lista de
 * camadas { d | circulo | ret, tipo } onde tipo é 'corpo', 'base' ou 'det'.
 * Todas compartilham o pedestal arredondado em dois degraus.
 */
const BASE_FLAT = [
  { tipo: 'base', ret: [9.5, 37.2, 26, 4.6, 2.3] },   // degrau de baixo (x, y, w, h, raio)
  { tipo: 'base', ret: [12, 33.8, 21, 4.2, 2.0] },    // degrau de cima
];

const FORMAS_FLAT = {
  // Peão: cabeça redonda, colar e corpo em sino.
  p: [
    { tipo: 'corpo', d: 'M17.2 34 C17.6 29.5 19 26.4 20.4 24.4 H24.6 C26 26.4 27.4 29.5 27.8 34 Z' },
    { tipo: 'corpo', ret: [16.6, 21.6, 11.8, 3.4, 1.7] },
    { tipo: 'corpo', circulo: [22.5, 15.4, 5.8] },
  ],
  // Torre: corpo reto, colar e ameias retas.
  r: [
    { tipo: 'corpo', d: 'M15.6 34 L16.6 19.6 H28.4 L29.4 34 Z' },
    { tipo: 'corpo', ret: [14.2, 17, 16.6, 3.4, 1.2] },
    { tipo: 'corpo', d: 'M13.6 17.6 V8.6 H17.6 V12 H20.4 V8.6 H24.6 V12 H27.4 V8.6 H31.4 V17.6 Z' },
  ],
  // Cavalo: cabeça estilizada virada para a esquerda, com crina e olho.
  n: [
    { tipo: 'corpo', d: 'M15.4 34 C15 28.6 16.6 24.6 20.6 21.2 L14.4 23.2 C12 24 10 22 11 19.8 L15.2 12.2 C16.6 9.6 18.8 8 21.4 7.3 L22.6 4.2 L25 7.2 C30.6 8.2 34 13.4 33.6 20 C33.2 25.4 32.2 29.8 31.2 34 Z' },
    { tipo: 'det', d: 'M25 7.2 C30.6 8.2 34 13.4 33.6 20 C33.2 25.4 32.2 29.8 31.2 34 H29.2 C30.4 29.6 31.2 25.2 31.4 20.4 C31.8 14.6 29.4 10.2 24.4 8.6 Z', opac: 0.55 },
    { tipo: 'det', circulo: [19.4, 13.2, 1.3] },
  ],
  // Bispo: mitra pontuda com corte diagonal, bolinha no topo e colar.
  b: [
    { tipo: 'corpo', d: 'M17.4 34 C17.8 30 19 27.4 20.2 25.6 H24.8 C26 27.4 27.2 30 27.6 34 Z' },
    { tipo: 'corpo', ret: [16.4, 22.6, 12.2, 3.2, 1.6] },
    { tipo: 'corpo', d: 'M22.5 7.6 C27.6 11.6 29.8 15.6 29.2 19 C28.8 21.4 26.6 22.8 22.5 22.8 C18.4 22.8 16.2 21.4 15.8 19 C15.2 15.6 17.4 11.6 22.5 7.6 Z' },
    { tipo: 'corpo', circulo: [22.5, 5.8, 2.3] },
    { tipo: 'det', d: 'M23.6 11.2 L28.2 15.2 L27.6 16.8 L22.8 12.6 Z' },
  ],
  // Dama: coroa de cinco pontas com bolinhas, colar e corpo largo.
  q: [
    { tipo: 'corpo', d: 'M15 34 C15.6 29.4 17.2 26 18.6 24 H26.4 C27.8 26 29.4 29.4 30 34 Z' },
    { tipo: 'corpo', ret: [14.2, 20.8, 16.6, 3.4, 1.7] },
    { tipo: 'corpo', d: 'M14.6 21.2 L11.8 11.4 L16.6 16.6 L17.6 8.8 L20.6 15.6 L22.5 7.4 L24.4 15.6 L27.4 8.8 L28.4 16.6 L33.2 11.4 L30.4 21.2 Z' },
    { tipo: 'corpo', circulo: [11.6, 10.4, 1.9] },
    { tipo: 'corpo', circulo: [17.5, 7.8, 1.9] },
    { tipo: 'corpo', circulo: [22.5, 6.2, 2.1] },
    { tipo: 'corpo', circulo: [27.5, 7.8, 1.9] },
    { tipo: 'corpo', circulo: [33.4, 10.4, 1.9] },
  ],
  // Rei: o mais alto; cúpula lisa, colar e cruz no topo.
  k: [
    { tipo: 'corpo', d: 'M15.4 34 C16 29.6 17.4 26 18.8 23.8 H26.2 C27.6 26 29 29.6 29.6 34 Z' },
    { tipo: 'corpo', ret: [14.4, 20.6, 16.2, 3.4, 1.7] },
    { tipo: 'corpo', d: 'M15.4 20.8 C14.2 15.4 17.6 11.2 22.5 11.2 C27.4 11.2 30.8 15.4 29.6 20.8 Z' },
    { tipo: 'corpo', ret: [21.1, 1.6, 2.8, 9.8, 0.8] },
    { tipo: 'corpo', ret: [18.2, 4.2, 8.6, 2.8, 0.8] },
  ],
};

function camadaFlat(c, lado) {
  const cores = CORES_FLAT[lado];
  let fill = 'url(#flat-corpo-' + lado + ')';
  if (c.tipo === 'base') fill = cores.base;
  if (c.tipo === 'det') fill = cores.det;
  const traco = c.tipo === 'det' ? '' : ' stroke="' + cores.borda + '" stroke-width="0.55" stroke-linejoin="round"';
  const opac = c.opac ? ' fill-opacity="' + c.opac + '"' : '';
  if (c.circulo) {
    return '<circle cx="' + c.circulo[0] + '" cy="' + c.circulo[1] + '" r="' + c.circulo[2] + '" fill="' + fill + '"' + opac + traco + '/>';
  }
  if (c.ret) {
    const [x, y, w, h, raio] = c.ret;
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + raio + '" fill="' + fill + '"' + opac + traco + '/>';
  }
  return '<path d="' + c.d + '" fill="' + fill + '"' + opac + traco + '/>';
}

function svgFlat(peca) {
  garantirDefsFlat();
  const lado = ehBranca(peca) ? 'w' : 'b';
  const camadas = BASE_FLAT.concat(FORMAS_FLAT[peca.toLowerCase()] || []);
  // Pedestal primeiro (fica atrás), depois o corpo, de baixo para cima.
  const inner = camadas.map((c) => camadaFlat(c, lado)).join('');
  return '<svg class="peca-svg-img peca-flat-img" viewBox="0 0 45 45" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

// ===========================================================================
// Estilo "Pixel" (8-bit)
// ===========================================================================

/**
 * Máscaras 16×20 das peças. Só desenhamos a SILHUETA:
 *   '#' = corpo da peça, 'x' = linha de detalhe interna (cor do contorno),
 *   '.' = vazio.
 * O contorno externo de 1 pixel e o sombreado são calculados no código
 * (montarGradePixel), então todas as peças ficam coerentes entre si.
 * Todas têm a mesma base larga em degraus (as 4 últimas linhas).
 */
const MASCARAS_PIXEL = {
  k: [
    '................',
    '.......##.......',
    '.....######.....',
    '.......##.......',
    '.......##.......',
    '.....######.....',
    '....########....',
    '...##########...',
    '...##########...',
    '....########....',
    '....xxxxxxxx....',
    '.....######.....',
    '.....######.....',
    '....########....',
    '....xxxxxxxx....',
    '...##########...',
    '..############..',
    '..xxxxxxxxxxxx..',
    '.##############.',
    '................',
  ],
  q: [
    '................',
    '.#....#..#....#.',
    '................',
    '.#....#..#....#.',
    '.##..###.##..##.',
    '.###.######.###.',
    '..############..',
    '..############..',
    '...xxxxxxxxxx...',
    '....########....',
    '.....######.....',
    '.....######.....',
    '.....######.....',
    '....########....',
    '....xxxxxxxx....',
    '...##########...',
    '..############..',
    '..xxxxxxxxxxxx..',
    '.##############.',
    '................',
  ],
  b: [
    '................',
    '.......##.......',
    '................',
    '.......##.......',
    '......####......',
    '.....##x###.....',
    '....##x#####....',
    '....#x######....',
    '....########....',
    '.....######.....',
    '....xxxxxxxx....',
    '.....######.....',
    '.....######.....',
    '....########....',
    '....xxxxxxxx....',
    '...##########...',
    '..############..',
    '..xxxxxxxxxxxx..',
    '.##############.',
    '................',
  ],
  n: [
    '................',
    '.......#.#......',
    '.......####.....',
    '......######....',
    '.....########...',
    '....##x#######..',
    '...###########..',
    '..############..',
    '..####..######..',
    '...##...######..',
    '........######..',
    '.......#######..',
    '......########..',
    '.....#########..',
    '.....xxxxxxxxx..',
    '...##########...',
    '..############..',
    '..xxxxxxxxxxxx..',
    '.##############.',
    '................',
  ],
  r: [
    '................',
    '................',
    '..###.####.###..',
    '..###.####.###..',
    '..############..',
    '..############..',
    '...xxxxxxxxxx...',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '....########....',
    '...##########...',
    '...xxxxxxxxxx...',
    '...##########...',
    '..############..',
    '..xxxxxxxxxxxx..',
    '.##############.',
    '................',
  ],
  p: [
    '................',
    '................',
    '................',
    '................',
    '.......##.......',
    '......####......',
    '.....######.....',
    '.....######.....',
    '......####......',
    '.......##.......',
    '.....######.....',
    '......####......',
    '......####......',
    '.....######.....',
    '....xxxxxxxx....',
    '....########....',
    '...##########...',
    '...xxxxxxxxxx...',
    '..############..',
    '................',
  ],
};

const LARGURA_PIXEL = 16;
const ALTURA_PIXEL = 20;

/**
 * Paleta 8-bit. o = contorno, h = brilho (borda esquerda), f = corpo,
 * s = sombra (lado direito). As pretas usam o mesmo contorno preto.
 */
const CORES_PIXEL = {
  w: { o: '#121212', h: '#ffffff', f: '#e8e8e3', s: '#a6aab3' },
  b: { o: '#0a0b0e', h: '#6d778b', f: '#454d5d', s: '#272c36' },
};

/**
 * Transforma a máscara numa grade com contorno e sombreado:
 *  - toda casa vazia vizinha (acima, abaixo, à esquerda ou à direita) de um
 *    pixel da peça vira contorno (os cantos ficam livres: visual arredondado);
 *  - em cada trecho horizontal de corpo, o pixel mais à esquerda vira brilho
 *    (se o trecho tiver 4+ pixels) e o terço direito vira sombra.
 */
function montarGradePixel(mascara) {
  const g = mascara.map((linha) => linha.split(''));
  const ehPeca = (x, y) => y >= 0 && y < ALTURA_PIXEL && x >= 0 && x < LARGURA_PIXEL && (mascara[y][x] === '#' || mascara[y][x] === 'x');
  const saida = [];
  for (let y = 0; y < ALTURA_PIXEL; y++) {
    const linha = [];
    for (let x = 0; x < LARGURA_PIXEL; x++) {
      const ch = g[y][x];
      if (ch === 'x') { linha.push('o'); continue; }
      if (ch === '#') { linha.push('f'); continue; }
      // Só os 4 vizinhos diretos: os cantos ficam "arredondados", como no 8-bit.
      const vizinho = ehPeca(x - 1, y) || ehPeca(x + 1, y) || ehPeca(x, y - 1) || ehPeca(x, y + 1);
      linha.push(vizinho ? 'o' : '.');
    }
    // Sombreado por trecho contínuo de corpo.
    let x = 0;
    while (x < LARGURA_PIXEL) {
      if (linha[x] !== 'f') { x += 1; continue; }
      let fim = x;
      while (fim + 1 < LARGURA_PIXEL && linha[fim + 1] === 'f') fim += 1;
      const n = fim - x + 1;
      const sombra = n >= 3 ? Math.max(1, Math.round(n * 0.34)) : 0;
      for (let i = fim - sombra + 1; i <= fim; i++) linha[i] = 's';
      if (n >= 4) linha[x] = 'h';
      x = fim + 1;
    }
    saida.push(linha);
  }
  return saida;
}

/** Cache das grades já calculadas (são sempre as mesmas). */
const GRADES_PIXEL = {};
function gradePixel(tipo) {
  if (!GRADES_PIXEL[tipo]) GRADES_PIXEL[tipo] = montarGradePixel(MASCARAS_PIXEL[tipo]);
  return GRADES_PIXEL[tipo];
}

/** Junta pixels vizinhos da mesma cor num único <rect> (SVG menor). */
function retangulosPixel(grade, cores) {
  const rects = [];
  for (let y = 0; y < ALTURA_PIXEL; y++) {
    const linha = grade[y];
    let x = 0;
    while (x < LARGURA_PIXEL) {
      const ch = linha[x];
      if (ch === '.') { x += 1; continue; }
      let w = 1;
      while (x + w < LARGURA_PIXEL && linha[x + w] === ch) w += 1;
      rects.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + cores[ch] + '"/>');
      x += w;
    }
  }
  return rects.join('');
}

function svgPixel(peca) {
  const tipo = peca.toLowerCase();
  const cores = ehBranca(peca) ? CORES_PIXEL.w : CORES_PIXEL.b;
  const inner = retangulosPixel(gradePixel(tipo), cores);
  // viewBox 16×20 (peça "em pé"); o SVG centraliza dentro da casa quadrada.
  return '<svg class="peca-svg-img peca-pixel-img" viewBox="0 0 16 20" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

// ===========================================================================
// Montagem do elemento
// ===========================================================================

function svgMarkup(estilo, peca) {
  const e = normalizarEstilo(estilo);
  if (e === 'pixel') return svgPixel(peca);
  return svgFlat(peca);
}

/** Aplica classes e conteúdo de uma peça num elemento (novo ou existente). */
function preencherPeca(el, peca, estilo) {
  const e = normalizarEstilo(estilo);
  el.dataset.piece = peca;
  el.classList.remove('peca-unicode', 'peca-svg', 'peca-pixel', 'peca-flat', 'peca-branca', 'peca-preta');
  el.classList.add(ehBranca(peca) ? 'peca-branca' : 'peca-preta');
  if (e === 'unicode') {
    el.classList.add('peca-unicode');
    el.textContent = SIMBOLOS_UNICODE[peca.toLowerCase()] || peca;
    return;
  }
  el.classList.add('peca-svg', e === 'pixel' ? 'peca-pixel' : 'peca-flat');
  // Só redesenha se mudou (evita recriar SVGs a cada renderização).
  const chave = e + ':' + peca;
  if (el.dataset.desenho !== chave) {
    el.innerHTML = svgMarkup(e, peca);
    el.dataset.desenho = chave;
  }
}

/**
 * Cria o elemento visual de uma peça.
 * @param {string} peca  Letra (K, q, p, …)
 * @param {string} estilo  'classico' | 'pixel' | 'unicode'
 * @param {string} [classeExtra]
 * @returns {HTMLElement}
 */
function criarElementoPeca(peca, estilo, classeExtra) {
  const el = document.createElement('span');
  el.className = 'peca' + (classeExtra ? ' ' + classeExtra : '');
  preencherPeca(el, peca, estilo);
  return el;
}

/** Atualiza um elemento de peça já existente para o estilo atual. */
function aplicarEstiloEm(el, peca, estilo) {
  if (normalizarEstilo(estilo) === 'unicode') delete el.dataset.desenho;
  preencherPeca(el, peca, estilo);
}

if (typeof globalThis !== 'undefined') {
  globalThis.SIMBOLOS_UNICODE = SIMBOLOS_UNICODE;
  globalThis.ESTILOS_PECAS = ESTILOS_PECAS;
  globalThis.ESTILO_PADRAO = ESTILO_PADRAO;
  globalThis.normalizarEstilo = normalizarEstilo;
  globalThis.criarElementoPeca = criarElementoPeca;
  globalThis.aplicarEstiloEm = aplicarEstiloEm;
  globalThis.svgMarkup = svgMarkup;
}
