/**
 * Marcações no tabuleiro (setas e círculos) — Xadrez Alternativo v1.3.0
 * ------------------------------------------------------------------------
 * Como no Lichess/chess.com: botão DIREITO arrastando de uma casa a outra
 * desenha uma seta; botão direito sem arrastar marca um círculo na casa.
 * As marcações são só locais (ninguém mais vê) e servem para planejar.
 *
 * Este arquivo tem só a lógica e o desenho em SVG; quem liga os eventos do
 * mouse/toque é o script.js. Funciona no navegador (global
 * `MarcacoesTabuleiro`) e no Node (testes).
 *
 * Coordenadas do SVG: viewBox "0 0 8 8", ou seja, 1 unidade = 1 casa.
 * Assim a camada se ajusta sozinha a qualquer tamanho de tabuleiro.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.MarcacoesTabuleiro = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Paleta (mesmas ideias do Lichess). */
  const CORES = {
    verde: '#15781b',
    vermelho: '#c0262b',
    azul: '#1f56c8',
    amarelo: '#e6a100',
  };

  /**
   * Cor conforme as teclas seguradas:
   * normal = verde; Shift = vermelho; Ctrl ou Alt = azul; Shift+Ctrl (ou
   * Shift+Alt) = amarelo. (Meta/⌘ conta como Ctrl no Mac.)
   */
  function corPorModificadores(ev) {
    const shift = !!(ev && ev.shiftKey);
    const ctrl = !!(ev && (ev.ctrlKey || ev.altKey || ev.metaKey));
    if (shift && ctrl) return 'amarelo';
    if (shift) return 'vermelho';
    if (ctrl) return 'azul';
    return 'verde';
  }

  /** Estado vazio: setas por "de-para" e círculos por casa → nome da cor. */
  function novoEstado() {
    return { setas: new Map(), circulos: new Map() };
  }
  function quantidade(estado) {
    return estado.setas.size + estado.circulos.size;
  }
  function limpar(estado) {
    estado.setas.clear();
    estado.circulos.clear();
  }

  /**
   * Liga/desliga uma marcação. Repetir a mesma (mesma cor) apaga; repetir
   * com outra cor só troca a cor.
   */
  function alternar(mapa, chave, cor) {
    if (mapa.get(chave) === cor) mapa.delete(chave);
    else mapa.set(chave, cor);
  }
  function alternarSeta(estado, de, para, cor) {
    if (de === para) return alternarCirculo(estado, de, cor);
    alternar(estado.setas, de + '-' + para, cor);
  }
  function alternarCirculo(estado, sq, cor) {
    alternar(estado.circulos, sq, cor);
  }

  /** Centro da casa no SVG, respeitando o tabuleiro girado. */
  function centro(sq, brancasEmbaixo) {
    const arquivo = sq % 8;
    const rank = Math.floor(sq / 8);
    const col = brancasEmbaixo ? arquivo : 7 - arquivo;
    const lin = brancasEmbaixo ? 7 - rank : rank;
    return { x: col + 0.5, y: lin + 0.5 };
  }

  /** O lance de/para tem o formato de um salto de cavalo (1x2)? */
  function ehSaltoDeCavalo(de, para) {
    const dc = Math.abs((para % 8) - (de % 8));
    const df = Math.abs(Math.floor(para / 8) - Math.floor(de / 8));
    return (dc === 1 && df === 2) || (dc === 2 && df === 1);
  }

  /**
   * Pontos da seta: [início, (canto do L), base da ponta] e o triângulo da
   * ponta. Seta de cavalo sai em "L": primeiro anda as 2 casas, depois 1.
   */
  function geometriaSeta(de, para, brancasEmbaixo) {
    const a = centro(de, brancasEmbaixo);
    const b = centro(para, brancasEmbaixo);
    const pontos = [a];
    if (ehSaltoDeCavalo(de, para)) {
      const longoNoX = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
      pontos.push(longoNoX ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
    }
    // Último trecho: do penúltimo ponto até o centro do destino.
    const p = pontos[pontos.length - 1];
    const dx = b.x - p.x, dy = b.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const COMPRIMENTO_PONTA = 0.42, MEIA_LARGURA = 0.27, FOLGA = 0.12;
    const ponta = { x: b.x - ux * FOLGA, y: b.y - uy * FOLGA };
    const baseDaPonta = { x: ponta.x - ux * COMPRIMENTO_PONTA, y: ponta.y - uy * COMPRIMENTO_PONTA };
    pontos.push(baseDaPonta);
    const triangulo = [
      ponta,
      { x: baseDaPonta.x - uy * MEIA_LARGURA, y: baseDaPonta.y + ux * MEIA_LARGURA },
      { x: baseDaPonta.x + uy * MEIA_LARGURA, y: baseDaPonta.y - ux * MEIA_LARGURA },
    ];
    // O traço começa um pouco à frente do centro da origem (não cobre a peça toda).
    const q = pontos[1];
    const sx = q.x - a.x, sy = q.y - a.y;
    const sd = Math.hypot(sx, sy) || 1;
    pontos[0] = { x: a.x + (sx / sd) * 0.18, y: a.y + (sy / sd) * 0.18 };
    return { pontos: pontos, triangulo: triangulo };
  }

  const n = (v) => Math.round(v * 1000) / 1000;
  const lista = (pts) => pts.map((p) => n(p.x) + ',' + n(p.y)).join(' ');

  /** SVG (texto) de uma seta. `previa` = seta sendo arrastada (mais clara). */
  function svgSeta(de, para, cor, brancasEmbaixo, previa) {
    const g = geometriaSeta(de, para, brancasEmbaixo);
    const c = CORES[cor] || CORES.verde;
    const op = previa ? 0.5 : 0.8;
    return '<g class="marca-seta" data-de="' + de + '" data-para="' + para + '" data-cor="' + cor + '" opacity="' + op + '">' +
      '<polyline points="' + lista(g.pontos) + '" fill="none" stroke="' + c + '" stroke-width="0.17" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<polygon points="' + lista(g.triangulo) + '" fill="' + c + '"/></g>';
  }

  /** SVG (texto) de um círculo em volta da casa. */
  function svgCirculo(sq, cor, brancasEmbaixo) {
    const p = centro(sq, brancasEmbaixo);
    const c = CORES[cor] || CORES.verde;
    return '<circle class="marca-circulo" data-casa="' + sq + '" data-cor="' + cor + '" cx="' + n(p.x) + '" cy="' + n(p.y) +
      '" r="0.45" fill="none" stroke="' + c + '" stroke-width="0.08" opacity="0.85"/>';
  }

  /**
   * Desenha tudo dentro do <svg>. `previa` (opcional) = {de, para, cor} da
   * seta que está sendo arrastada agora.
   */
  function desenhar(svg, estado, brancasEmbaixo, previa) {
    if (!svg) return;
    let html = '';
    for (const [sq, cor] of estado.circulos) html += svgCirculo(Number(sq), cor, brancasEmbaixo);
    for (const [chave, cor] of estado.setas) {
      const [de, para] = chave.split('-').map(Number);
      html += svgSeta(de, para, cor, brancasEmbaixo, false);
    }
    if (previa && previa.para != null && previa.para !== previa.de) {
      html += svgSeta(previa.de, previa.para, previa.cor, brancasEmbaixo, true);
    }
    svg.innerHTML = html;
  }

  return {
    CORES: CORES,
    corPorModificadores: corPorModificadores,
    novoEstado: novoEstado,
    quantidade: quantidade,
    limpar: limpar,
    alternarSeta: alternarSeta,
    alternarCirculo: alternarCirculo,
    centro: centro,
    ehSaltoDeCavalo: ehSaltoDeCavalo,
    geometriaSeta: geometriaSeta,
    desenhar: desenhar,
  };
});
