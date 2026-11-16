/**
 * Conjuntos de peças do xadrez.
 * -----------------------------
 *  - unicode:  glifos preenchidos (♚♛♜♝♞♟) coloridos por CSS
 *              (brancas claras com contorno escuro; pretas escuras com contorno claro)
 *  - staunton: conjunto SVG clássico, no espírito das peças Staunton
 *              (desenhos originais deste projeto)
 *  - pixelado: conjunto 16×16 em estilo 8-bit, desenhado com retângulos SVG
 *
 * Todas as funções devolvem um elemento DOM pronto para o tabuleiro,
 * o painel de capturas, o diálogo de promoção e as animações.
 */
'use strict';

const SIMBOLOS_UNICODE = {
  // Sempre os glifos preenchidos; a cor (clara/escura) vem do CSS.
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function ehBranca(peca) {
  return peca === peca.toUpperCase();
}

function coresStaunton(peca) {
  return ehBranca(peca)
    ? { fill: '#f3efe6', stroke: '#2a241c', sw: 1.35, det: '#2a241c' }
    : { fill: '#2c2722', stroke: '#e4dcd0', sw: 1.35, det: '#e4dcd0' };
}

function coresPlano(peca) {
  return ehBranca(peca)
    ? { fill: '#f0e6d2', stroke: '#c8b89a', sw: 0.9, det: '#b7a584' }
    : { fill: '#3b3530', stroke: '#1c1916', sw: 0.9, det: '#1c1916' };
}

function attrs(c, extra) {
  return 'fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="' + c.sw +
    '" stroke-linejoin="round" stroke-linecap="round"' + (extra ? ' ' + extra : '');
}

/**
 * Peças Staunton: pedestal em dois degraus + corpo reconhecível.
 * viewBox 0 0 45 45 em todas.
 */
function pathStaunton(tipo, c) {
  const a = attrs(c);
  const base =
    '<path ' + a + ' d="M10 38.5h25v3H10z"/>' +
    '<path ' + a + ' d="M12 35h21v3.5H12z"/>' +
    '<path ' + a + ' d="M14.5 35c1.2-2.2 4-3 8-3s6.8.8 8 3"/>';

  if (tipo === 'p') {
    return base +
      '<path ' + a + ' d="M16.5 35c.6-5 2.4-8 6-8s5.4 3 6 8z"/>' +
      '<circle ' + a + ' cx="22.5" cy="20.5" r="5.4"/>';
  }
  if (tipo === 'r') {
    return base +
      '<path ' + a + ' d="M16 35v-13h13v13z"/>' +
      '<path ' + a + ' d="M14.5 22h16v3h-16z"/>' +
      '<path ' + a + ' d="M14.5 11h3.2v8.5H14.5zM19.2 11h3.3v8.5H19.2zM22.5 11h3.3v8.5H22.5zM27.3 11H30.5v8.5H27.3z"/>' +
      '<path ' + a + ' d="M14.5 11h16v2.2h-16z"/>';
  }
  if (tipo === 'n') {
    return base +
      '<path ' + a + ' d="M16 35c0-4 1-9 2.2-12 0.3-4 0.2-7.5 3.3-10.2 0.3-1.8 1.2-3.4 2.8-3.6l1.4-2.4 1.3 2c1.6.3 3.4 1.6 4.6 3.6 1.4 2.4 1.6 5.2.8 7.4-.4 1.2-1.6 1.6-2.2.6-.2 1.6.6 3.6 1.2 5.4.8 2.6.4 6.2-1 9.2z"/>' +
      '<circle fill="' + c.det + '" cx="27.2" cy="16.6" r="1.15"/>' +
      '<path ' + a + ' fill="none" d="M22.5 13.5c1.6.2 2.8 1.2 3.2 2.4"/>';
  }
  if (tipo === 'b') {
    return base +
      '<path ' + a + ' d="M17 35c.8-6 2.2-10 5.5-13.2 3.3 3.2 4.7 7.2 5.5 13.2z"/>' +
      '<path ' + a + ' d="M22.5 22c-4.2-3.6-5.4-7.4-3.6-11.2 1-2 2.4-3.2 3.6-3.8 1.2.6 2.6 1.8 3.6 3.8 1.8 3.8.6 7.6-3.6 11.2z"/>' +
      '<circle ' + a + ' cx="22.5" cy="6.4" r="1.7"/>' +
      '<path stroke="' + c.det + '" stroke-width="1.4" fill="none" d="M22.5 14.5v6.5M20 17.8h5"/>';
  }
  if (tipo === 'q') {
    return base +
      '<path ' + a + ' d="M16 35c.8-7 2.6-12 6.5-14.5 3.9 2.5 5.7 7.5 6.5 14.5z"/>' +
      '<path ' + a + ' d="M14.8 20.5l1.6-8.6 2.8 5.6 1.6-7.2 1.7 7.2 2.8-5.6 1.6 8.6z"/>' +
      '<circle ' + a + ' cx="15.6" cy="10.6" r="1.7"/>' +
      '<circle ' + a + ' cx="19.2" cy="8.2" r="1.7"/>' +
      '<circle ' + a + ' cx="22.5" cy="6.6" r="1.9"/>' +
      '<circle ' + a + ' cx="25.8" cy="8.2" r="1.7"/>' +
      '<circle ' + a + ' cx="29.4" cy="10.6" r="1.7"/>' +
      '<path ' + a + ' d="M16.5 21.5h12v2.4h-12z"/>';
  }
  // rei
  return base +
    '<path ' + a + ' d="M16.2 35c.9-7 2.8-12.2 6.3-14.6 3.5 2.4 5.4 7.6 6.3 14.6z"/>' +
    '<path ' + a + ' d="M16.5 21.2h12v3.2h-12z"/>' +
    '<path ' + a + ' d="M18 21.2c.6-3.4 2-5.4 4.5-5.4s3.9 2 4.5 5.4z"/>' +
    '<path ' + a + ' d="M20.9 6.2h3.2v9.2h-3.2z"/>' +
    '<path ' + a + ' d="M17.6 9.2h10v3h-10z"/>';
}

/**
 * Peças planas: silhuetas geométricas, pouco traço, visual contemporâneo.
 */
function pathPlano(tipo, c) {
  const a = attrs(c);
  const base = '<path ' + a + ' d="M11 39h23l-2-4H13z"/>';

  if (tipo === 'p') {
    return base +
      '<path ' + a + ' d="M16.5 35l2-9h8l2 9z"/>' +
      '<circle ' + a + ' cx="22.5" cy="20" r="6"/>';
  }
  if (tipo === 'r') {
    return base +
      '<path ' + a + ' d="M15 35v-17h15v17z"/>' +
      '<path ' + a + ' d="M13.5 10h4v9h-4zM18.4 10h4.2v9H18.4zM22.4 10H26.6v9H22.4zM27.5 10H31.5v9h-4z"/>';
  }
  if (tipo === 'n') {
    return base +
      '<path ' + a + ' d="M16 35l1.5-13 3-9 3-5 2 3 5 4 1 6-3 2 2 6-2 9z"/>' +
      '<circle fill="' + c.det + '" cx="27" cy="16" r="1.3"/>';
  }
  if (tipo === 'b') {
    return base +
      '<path ' + a + ' d="M17 35l3.2-14-3.2-11c2-3 5-5 5.5-5s3.5 2 5.5 5l-3.2 11L28 35z"/>' +
      '<circle fill="' + c.det + '" cx="22.5" cy="16" r="1.3"/>';
  }
  if (tipo === 'q') {
    return base +
      '<path ' + a + ' d="M16 35l2-14-4-12 5 6 3.5-8 3.5 8 5-6-4 12 2 14z"/>' +
      '<circle ' + a + ' cx="22.5" cy="6.5" r="2.1"/>';
  }
  return base +
    '<path ' + a + ' d="M16.5 35l2.2-14h7.6l2.2 14z"/>' +
    '<path ' + a + ' d="M17.5 21h10l-1.5-6h-7z"/>' +
    '<path ' + a + ' d="M21.1 5h2.8v10h-2.8z"/>' +
    '<path ' + a + ' d="M18.2 8.2h8.6v2.5H18.2z"/>';
}

function svgMarkup(estilo, peca) {
  const tipo = peca.toLowerCase();
  if (estilo === 'pixelado' || estilo === 'plano') {
    return svgPixelado(peca);
  }
  const c = coresStaunton(peca);
  const inner = pathStaunton(tipo, c);
  return '<svg class="peca-svg-img" viewBox="0 0 45 45" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

/**
 * Cria o elemento visual de uma peça.
 * @param {string} peca  Letra (K, q, p, …)
 * @param {string} estilo  'unicode' | 'staunton' | 'pixelado'
 * @param {string} [classeExtra]
 * @returns {HTMLElement}
 */

/**
 * Peças pixeladas 16×16 (estilo 8-bit).
 * Cada célula é um <rect> com shape-rendering="crispEdges".
 * Brancas: preenchimento claro + contorno escuro.
 * Pretas:  preenchimento escuro + contorno claro (lê-se em qualquer tema).
 * Grade: "." vazio, "o" contorno, "#" preenchimento.
 */
const CORES_PIXEL = {
  w: { fill: '#F6EBD0', outline: '#2A2218' },
  b: { fill: '#2A241C', outline: '#F0E6D2' },
};

const GRADES_PIXEL = {
  k: [
    '.......oo.......',
    '......o##o......',
    '.......oo.......',
    '.....oooooo.....',
    '....o######o....',
    '...o########o...',
    '...o##oooo##o...',
    '...o##o..o##o...',
    '...o##oooo##o...',
    '...o########o...',
    '...o########o...',
    '....o######o....',
    '.....oooooo.....',
    '....o######o....',
    '...o########o...',
    '....oooooooo....',
  ],
  q: [
    '..o..o.oo.o..o..',
    '.o#o.o####o.o#o.',
    '.o##o######o##o.',
    '..o#o######o#o..',
    '...o########o...',
    '...o#oooooo#o...',
    '...o########o...',
    '...o########o...',
    '...o########o...',
    '....o######o....',
    '.....oooooo.....',
    '....o######o....',
    '...o########o...',
    '...o########o...',
    '....o######o....',
    '.....oooooo.....',
  ],
  r: [
    '.oo..oooo..oo...',
    '.o#oo####oo#o...',
    '.o##########o...',
    '.oooooooooooo...',
    '..o########o....',
    '..o########o....',
    '..o########o....',
    '..o########o....',
    '..o########o....',
    '..o########o....',
    '..o########o....',
    '.o##########o...',
    '.o##########o...',
    'o############o..',
    'o############o..',
    'oooooooooooooo..',
  ],
  b: [
    '.......oo.......',
    '......o##o......',
    '.....o####o.....',
    '....o#oooo#o....',
    '....o##oo##o....',
    '.....o####o.....',
    '......o##o......',
    '.....o####o.....',
    '....o######o....',
    '...o########o...',
    '....o######o....',
    '.....oooooo.....',
    '....o######o....',
    '...o########o...',
    '....o######o....',
    '.....oooooo.....',
  ],
  n: [
    '.......oo.......',
    '......o##ooo....',
    '.....o######o...',
    '....o###o####o..',
    '....o##o.o###o..',
    '...o###o..ooo...',
    '...o####o.......',
    '...o#####oo.....',
    '....o######o....',
    '.....o#####o....',
    '.....o####o.....',
    '....o#####o.....',
    '...o#######o....',
    '..o#########o...',
    '.o###########o..',
    '.ooooooooooooo..',
  ],
  p: [
    '................',
    '......oooo......',
    '.....o####o.....',
    '.....o####o.....',
    '......oooo......',
    '.....o####o.....',
    '....o######o....',
    '.....o####o.....',
    '......o##o......',
    '......o##o......',
    '.....o####o.....',
    '....o######o....',
    '...o########o...',
    '...o########o...',
    '....o######o....',
    '.....oooooo.....',
  ],
};

function retangulosPixel(grade, cores) {
  const rects = [];
  for (let y = 0; y < 16; y++) {
    const linha = grade[y];
    let x = 0;
    while (x < 16) {
      const ch = linha[x];
      if (ch !== 'o' && ch !== '#') { x += 1; continue; }
      const cor = ch === 'o' ? cores.outline : cores.fill;
      let w = 1;
      while (x + w < 16 && linha[x + w] === ch) w += 1;
      rects.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + cor + '"/>');
      x += w;
    }
  }
  return rects.join('');
}

function svgPixelado(peca) {
  const tipo = peca.toLowerCase();
  const grade = GRADES_PIXEL[tipo];
  const cores = ehBranca(peca) ? CORES_PIXEL.w : CORES_PIXEL.b;
  const inner = retangulosPixel(grade, cores);
  return '<svg class="peca-svg-img peca-pixel" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

function criarElementoPeca(peca, estilo, classeExtra) {
  const el = document.createElement('span');
  el.className = 'peca' + (classeExtra ? ' ' + classeExtra : '');
  el.dataset.piece = peca;
  el.classList.add(ehBranca(peca) ? 'peca-branca' : 'peca-preta');
  if (!estilo || estilo === 'unicode') {
    el.classList.add('peca-unicode');
    el.textContent = SIMBOLOS_UNICODE[peca.toLowerCase()] || peca;
  } else {
    el.classList.add('peca-svg');
    if (estilo === 'pixelado' || estilo === 'plano') el.classList.add('peca-pixel');
    el.innerHTML = svgMarkup(estilo, peca);
  }
  return el;
}

/** Atualiza um elemento de peça já existente para o estilo atual. */
function aplicarEstiloEm(el, peca, estilo) {
  el.dataset.piece = peca;
  el.classList.remove('peca-unicode', 'peca-svg', 'peca-pixel', 'peca-branca', 'peca-preta');
  el.classList.add(ehBranca(peca) ? 'peca-branca' : 'peca-preta');
  if (!estilo || estilo === 'unicode') {
    el.classList.add('peca-unicode');
    el.textContent = SIMBOLOS_UNICODE[peca.toLowerCase()] || peca;
  } else {
    el.classList.add('peca-svg');
    if (estilo === 'pixelado' || estilo === 'plano') el.classList.add('peca-pixel');
    el.innerHTML = svgMarkup(estilo, peca);
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.SIMBOLOS_UNICODE = SIMBOLOS_UNICODE;
  globalThis.criarElementoPeca = criarElementoPeca;
  globalThis.aplicarEstiloEm = aplicarEstiloEm;
  globalThis.svgMarkup = svgMarkup;
}
