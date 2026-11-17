/**
 * Motor do modo Impostor.
 * -----------------------
 * Variante de xadrez com informação escondida. Antes da partida, cada jogador
 * redistribui as 16 "funções" (o jeito de andar) entre as suas 16 peças:
 * 8 de peão, 2 de torre, 2 de cavalo, 2 de bispo, 1 de dama e 1 de rei.
 * A peça continua com a APARÊNCIA da casa onde começou (o oponente vê um
 * peão em e2), mas anda conforme a sua FUNÇÃO real (que pode ser bispo).
 *
 * Funciona no navegador (tag <script>) e no Node.js (servidor e testes),
 * igual ao chess-engine.js. Este arquivo NÃO altera o modo clássico.
 *
 * Representação
 *   Vetor de 64 casas (0 = a1 … 63 = h8), como no chess-engine.js.
 *   Cada casa tem null ou um objeto de peça:
 *     {
 *       id:        casa inicial da peça (0–63), serve de identidade
 *       cor:       'w' ou 'b'
 *       aparencia: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'  (o que o oponente vê)
 *       funcao:    'p' | 'n' | 'b' | 'r' | 'q' | 'k'  (como ela anda de verdade)
 *       revelada:  true quando a função real já é pública
 *       moveu:     true depois do primeiro lance da peça
 *     }
 *
 * Regras do modo (combinadas com o André):
 *  1. Montagem: troca livre das funções entre as próprias peças, sem limite de tempo.
 *  2. O oponente só vê a aparência; cada um sempre vê as funções das próprias peças.
 *  3. Revelação: a peça é revelada quando faz um lance que a peça APARENTE não
 *     poderia fazer no xadrez clássico. Se o lance também seria possível para
 *     a aparência, ela continua em segredo. O rei verdadeiro é revelado ao levar xeque.
 *  4. Peça capturada continua em segredo (só a aparência vai para a lista).
 *  5. Roque só para o rei verdadeiro, nas casas clássicas, sem ter se movido.
 *  6. Qualquer peça com função de peão promove na última fileira.
 *  7. Xeque, mate e afogamento usam as funções reais e o rei verdadeiro.
 *
 * Decisões documentadas (ver README):
 *  - Peão (função): anda para a frente da sua cor; o passo duplo só vale na
 *    fileira inicial dos peões da sua cor (2ª para brancas, 7ª para pretas) e se
 *    a peça ainda não se moveu; en passant só para a função de peão, e só contra
 *    uma peça com função de peão que acabou de dar o passo duplo.
 *  - Uma peça com função de peão que começou na 1ª fileira anda normalmente para
 *    a frente (sem passo duplo).
 *  - "Lance possível para a aparência" é avaliado só pela geometria e pelas peças
 *    no caminho (sem considerar xeques), porque o oponente não conhece os reis.
 *  - Uma peça com APARÊNCIA de peão que chega à última fileira sem promover é
 *    revelada (um peão de verdade teria que promover).
 *  - Peça promovida passa a ter a nova função e fica revelada.
 *  - Regra dos 50 lances: desligada neste modo (ela dependeria das funções
 *    secretas e poderia vazar informação). Material insuficiente: só rei contra rei.
 *  - Na queda de bandeira, é empate só se o adversário tiver apenas o rei.
 */
(function (raiz, fabrica) {
  'use strict';
  const api = fabrica();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Impostor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Constantes
  // -------------------------------------------------------------------------

  const ARQUIVOS = 'abcdefgh';

  /** Peças da 1ª fileira, de a até h, na posição clássica. */
  const FILEIRA_PECAS = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

  /** Quantidade de cada função por jogador (as funções só são permutadas). */
  const QUANTIDADES = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

  /** Letras em português para o histórico (peão não tem letra). */
  const LETRA_PT = { p: '', n: 'C', b: 'B', r: 'T', q: 'D', k: 'R' };

  const DELTAS_CAVALO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const DELTAS_REI = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const DELTAS_TORRE = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DELTAS_BISPO = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  // -------------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------------

  function casaParaAlgebrica(sq) { return ARQUIVOS[sq % 8] + String(Math.floor(sq / 8) + 1); }
  function arquivoDe(sq) { return sq % 8; }
  function rankDe(sq) { return Math.floor(sq / 8); }
  function noTabuleiro(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
  function oposta(cor) { return cor === 'w' ? 'b' : 'w'; }
  function letraNaCor(tipo, cor) { return cor === 'w' ? tipo.toUpperCase() : tipo; }

  /** Direção de avanço do peão da cor (+1 sobe, -1 desce). */
  function direcaoPeao(cor) { return cor === 'w' ? 1 : -1; }
  /** Fileira inicial dos peões da cor (onde o passo duplo é permitido). */
  function rankInicialPeao(cor) { return cor === 'w' ? 1 : 6; }
  /** Fileira de promoção da cor. */
  function rankPromocao(cor) { return cor === 'w' ? 7 : 0; }

  /** Lista das 16 casas iniciais de uma cor, com a peça clássica de cada uma. */
  function casasIniciais(cor) {
    const lista = [];
    const rankPecas = cor === 'w' ? 0 : 7;
    const rankPeoes = cor === 'w' ? 1 : 6;
    for (let f = 0; f < 8; f++) {
      lista.push({ id: rankPecas * 8 + f, tipo: FILEIRA_PECAS[f] });
      lista.push({ id: rankPeoes * 8 + f, tipo: 'p' });
    }
    return lista;
  }

  /** Funções clássicas de uma cor: { idDaCasa: tipo }. */
  function funcoesClassicas(cor) {
    const mapa = {};
    for (const c of casasIniciais(cor)) mapa[c.id] = c.tipo;
    return mapa;
  }

  /**
   * Confere se `mapa` é uma permutação válida das funções de `cor`:
   * as mesmas 16 casas iniciais e exatamente as quantidades de QUANTIDADES.
   */
  function funcoesValidas(cor, mapa) {
    if (!mapa || typeof mapa !== 'object') return false;
    const ids = casasIniciais(cor).map((c) => String(c.id));
    const chaves = Object.keys(mapa);
    if (chaves.length !== 16) return false;
    const contagem = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    for (const id of ids) {
      const tipo = mapa[id];
      if (!Object.prototype.hasOwnProperty.call(contagem, tipo)) return false;
      contagem[tipo] += 1;
    }
    for (const t of Object.keys(QUANTIDADES)) if (contagem[t] !== QUANTIDADES[t]) return false;
    return true;
  }

  // -------------------------------------------------------------------------
  // Geração de lances (compartilhada pelo motor e pelas dicas do cliente)
  // -------------------------------------------------------------------------

  /**
   * Gera lances "geométricos" de uma peça do tipo `tipo` e cor `cor` em `sq`,
   * olhando só para a ocupação do tabuleiro (sem filtrar xeque nem roque).
   *
   * @param {function(number): ('w'|'b'|null)} corEm  cor da peça em cada casa
   * @param {object} opcoes
   *   duplo:  true se o passo duplo de peão é permitido nesta peça
   *   ep:     casa alvo de en passant (ou null)
   * @returns {{to:number, captura:boolean, enPassant?:boolean, promocao?:boolean}[]}
   */
  function lancesGeometricos(corEm, sq, tipo, cor, opcoes) {
    const dest = [];
    const f0 = arquivoDe(sq);
    const r0 = rankDe(sq);
    const op = opcoes || {};

    const saltos = (deltas) => {
      for (const [df, dr] of deltas) {
        const f = f0 + df, r = r0 + dr;
        if (!noTabuleiro(f, r)) continue;
        const para = r * 8 + f;
        const c = corEm(para);
        if (c !== cor) dest.push({ to: para, captura: !!c });
      }
    };
    const deslizantes = (deltas) => {
      for (const [df, dr] of deltas) {
        let f = f0 + df, r = r0 + dr;
        while (noTabuleiro(f, r)) {
          const para = r * 8 + f;
          const c = corEm(para);
          if (!c) dest.push({ to: para, captura: false });
          else {
            if (c !== cor) dest.push({ to: para, captura: true });
            break;
          }
          f += df; r += dr;
        }
      }
    };

    if (tipo === 'n') saltos(DELTAS_CAVALO);
    else if (tipo === 'k') saltos(DELTAS_REI);
    else if (tipo === 'b') deslizantes(DELTAS_BISPO);
    else if (tipo === 'r') deslizantes(DELTAS_TORRE);
    else if (tipo === 'q') deslizantes(DELTAS_REI);
    else if (tipo === 'p') {
      const dir = direcaoPeao(cor);
      const promo = rankPromocao(cor);
      const r1 = r0 + dir;
      if (noTabuleiro(f0, r1) && !corEm(r1 * 8 + f0)) {
        dest.push({ to: r1 * 8 + f0, captura: false, promocao: r1 === promo });
        const r2 = r0 + 2 * dir;
        if (op.duplo && noTabuleiro(f0, r2) && !corEm(r2 * 8 + f0)) {
          dest.push({ to: r2 * 8 + f0, captura: false, duplo: true });
        }
      }
      for (const df of [-1, 1]) {
        const f = f0 + df;
        if (!noTabuleiro(f, r1)) continue;
        const para = r1 * 8 + f;
        const c = corEm(para);
        if (c && c !== cor) dest.push({ to: para, captura: true, promocao: r1 === promo });
        else if (!c && op.ep === para) dest.push({ to: para, captura: true, enPassant: true });
      }
    }
    return dest;
  }

  /** A peça `tipo`/`cor` em `de` ataca a casa `alvo`? (peão ataca só na diagonal) */
  function ataca(corEm, de, tipo, cor, alvo) {
    if (tipo === 'p') {
      const r = rankDe(de) + direcaoPeao(cor);
      return rankDe(alvo) === r && Math.abs(arquivoDe(alvo) - arquivoDe(de)) === 1;
    }
    // Para as demais, o ataque é igual ao movimento (alvo ocupado pelo inimigo
    // ou vazio — tratamos o alvo como "capturável").
    const corAlvoOriginal = corEm(alvo);
    const corEmAlvo = (sq) => (sq === alvo ? (corAlvoOriginal && corAlvoOriginal !== cor ? corAlvoOriginal : oposta(cor)) : corEm(sq));
    return lancesGeometricos(corEmAlvo, de, tipo, cor, {}).some((l) => l.to === alvo);
  }

  // -------------------------------------------------------------------------
  // Motor da partida (usado pelo servidor — conhece todas as funções)
  // -------------------------------------------------------------------------

  class JogoImpostor {
    constructor() {
      /** @type {(object|null)[]} */
      this.board = new Array(64).fill(null);
      this.lado = 'w';
      /** Casa alvo de en passant (só após passo duplo de uma peça com função de peão). */
      this.epCasa = null;
      this.lanceCompleto = 1;
      /** Lances públicos já jogados (o que pode ir para os dois jogadores). */
      this.pgn = [];
      /** Aparências das peças capturadas, por cor da peça capturada. */
      this.capturadas = { w: [], b: [] };
      for (const cor of ['w', 'b']) {
        for (const c of casasIniciais(cor)) {
          this.board[c.id] = { id: c.id, cor: cor, aparencia: c.tipo, funcao: c.tipo, revelada: false, moveu: false };
        }
      }
    }

    // ---------------------------- Montagem ----------------------------------

    /** Mapa atual { idDaCasa: função } das peças de `cor` (só antes do 1º lance). */
    funcoesDe(cor) {
      const mapa = {};
      for (const p of this.board) if (p && p.cor === cor) mapa[p.id] = p.funcao;
      return mapa;
    }

    /** Aplica uma permutação completa de funções. Devolve false se for inválida. */
    definirFuncoes(cor, mapa) {
      if (this.pgn.length) return false;
      if (!funcoesValidas(cor, mapa)) return false;
      for (const p of this.board) if (p && p.cor === cor) p.funcao = mapa[p.id];
      return true;
    }

    /** Troca as funções de duas peças da mesma cor (casas `a` e `b`). */
    trocarFuncoes(cor, a, b) {
      if (this.pgn.length || a === b) return false;
      const pa = this.board[a], pb = this.board[b];
      if (!pa || !pb || pa.cor !== cor || pb.cor !== cor) return false;
      const t = pa.funcao;
      pa.funcao = pb.funcao;
      pb.funcao = t;
      return true;
    }

    /** Volta as funções de `cor` para as clássicas. */
    resetarFuncoes(cor) {
      return this.definirFuncoes(cor, funcoesClassicas(cor));
    }

    // ---------------------------- Consultas ---------------------------------

    vez() { return this.lado; }

    _corEm(tab) { return (sq) => (tab[sq] ? tab[sq].cor : null); }

    /** Casa do rei VERDADEIRO (peça com função de rei) da cor. */
    casaDoRei(cor, tab) {
      const t = tab || this.board;
      for (let i = 0; i < 64; i++) if (t[i] && t[i].cor === cor && t[i].funcao === 'k') return i;
      return -1;
    }

    /** A casa `sq` está atacada pela cor `porCor`, usando as funções reais? */
    casaAtacada(sq, porCor, tab) {
      const t = tab || this.board;
      const corEm = this._corEm(t);
      for (let i = 0; i < 64; i++) {
        const p = t[i];
        if (p && p.cor === porCor && ataca(corEm, i, p.funcao, p.cor, sq)) return true;
      }
      return false;
    }

    emXeque(cor, tab) {
      const c = cor || this.lado;
      const rei = this.casaDoRei(c, tab);
      return rei >= 0 && this.casaAtacada(rei, oposta(c), tab);
    }

    // ---------------------------- Lances -----------------------------------

    /** Lances pseudo-legais da peça em `sq` (pelas funções reais). */
    _pseudo(sq) {
      const p = this.board[sq];
      if (!p) return [];
      const corEm = this._corEm(this.board);
      const duplo = p.funcao === 'p' && !p.moveu && rankDe(sq) === rankInicialPeao(p.cor);
      const base = lancesGeometricos(corEm, sq, p.funcao, p.cor, { duplo: duplo, ep: this.epCasa });
      const lista = [];
      for (const g of base) {
        if (g.promocao) {
          for (const t of ['q', 'r', 'b', 'n']) lista.push({ from: sq, to: g.to, promotion: t, enPassant: false, castle: null });
        } else {
          lista.push({ from: sq, to: g.to, promotion: null, enPassant: !!g.enPassant, castle: null });
        }
      }
      if (p.funcao === 'k') this._roques(sq, p, lista);
      return lista;
    }

    /**
     * Roque do rei verdadeiro: rei (função) na casa clássica e uma peça com
     * função de torre no canto, nenhum dos dois se moveu, casas entre eles
     * vazias, rei fora de xeque e sem atravessar casa atacada.
     */
    _roques(sq, rei, lista) {
      const cor = rei.cor;
      const base = cor === 'w' ? 0 : 56;
      if (rei.moveu || sq !== base + 4) return;
      const inimigo = oposta(cor);
      if (this.casaAtacada(sq, inimigo)) return;
      const t = this.board;
      const torreOk = (casa) => t[casa] && t[casa].cor === cor && t[casa].funcao === 'r' && !t[casa].moveu;
      // Curto: rei e→g, torre h→f.
      if (torreOk(base + 7) && !t[base + 5] && !t[base + 6] &&
          !this.casaAtacada(base + 5, inimigo) && !this.casaAtacada(base + 6, inimigo)) {
        lista.push({ from: sq, to: base + 6, promotion: null, enPassant: false, castle: cor === 'w' ? 'K' : 'k' });
      }
      // Longo: rei e→c, torre a→d (b também precisa estar vazia).
      if (torreOk(base) && !t[base + 1] && !t[base + 2] && !t[base + 3] &&
          !this.casaAtacada(base + 3, inimigo) && !this.casaAtacada(base + 2, inimigo)) {
        lista.push({ from: sq, to: base + 2, promotion: null, enPassant: false, castle: cor === 'w' ? 'Q' : 'q' });
      }
    }

    /** Tabuleiro (cópia rasa) depois do lance — para testar se o rei fica em xeque. */
    _simular(l) {
      const t = this.board.slice();
      const p = t[l.from];
      t[l.to] = p;
      t[l.from] = null;
      if (l.enPassant) t[l.to - direcaoPeao(p.cor) * 8] = null;
      if (l.castle) {
        const base = p.cor === 'w' ? 0 : 56;
        if (l.castle === 'K' || l.castle === 'k') { t[base + 5] = t[base + 7]; t[base + 7] = null; }
        else { t[base + 3] = t[base]; t[base] = null; }
      }
      return t;
    }

    /** Lances legais do lado da vez (opcionalmente só da casa `deCasa`). */
    lances(deCasa) {
      const cor = this.lado;
      const origens = typeof deCasa === 'number' ? [deCasa] : [...Array(64).keys()];
      const legais = [];
      for (const sq of origens) {
        const p = this.board[sq];
        if (!p || p.cor !== cor) continue;
        for (const l of this._pseudo(sq)) {
          if (!this.emXeque(cor, this._simular(l))) legais.push(l);
        }
      }
      return legais;
    }

    /**
     * O lance segue o movimento da peça, mas deixaria o rei verdadeiro em xeque?
     * (Usado só para dar uma mensagem mais clara quando o servidor recusa.)
     */
    deixariaReiEmXeque(from, to) {
      const p = this.board[from];
      if (!p || p.cor !== this.lado) return false;
      const pseudo = this._pseudo(from).filter((l) => l.to === to);
      return pseudo.length > 0 && pseudo.every((l) => this.emXeque(p.cor, this._simular(l)));
    }

    /**
     * O lance de `de` para `para` seria possível para a APARÊNCIA da peça no
     * xadrez clássico? (Só geometria e peças no caminho; ver decisões no topo.)
     */
    _possivelParaAparencia(p, l) {
      if (l.castle) return p.aparencia === 'k';
      const corEm = this._corEm(this.board);
      const duplo = p.aparencia === 'p' && rankDe(l.from) === rankInicialPeao(p.cor);
      const geo = lancesGeometricos(corEm, l.from, p.aparencia, p.cor, { duplo: duplo, ep: this.epCasa });
      if (!geo.some((g) => g.to === l.to)) return false;
      // Um peão de verdade que chega à última fileira teria que promover.
      if (p.aparencia === 'p' && rankDe(l.to) === rankPromocao(p.cor) && !l.promotion) return false;
      return true;
    }

    /**
     * Joga um lance {from, to, promotion}. Devolve o lance PÚBLICO (sem segredos)
     * ou null se for ilegal. O lance público contém:
     *   from, to, piece (letra da aparência antes do lance), captured (aparência),
     *   promotion, castle, enPassant, san, revelou: [{ casa, funcao }]
     */
    mover(entrada) {
      const from = entrada.from;
      const to = entrada.to;
      const promo = entrada.promotion ? String(entrada.promotion).toLowerCase() : null;
      const legais = this.lances(from).filter((l) => l.to === to);
      if (!legais.length) return null;
      let l = legais[0];
      if (l.promotion) l = legais.find((x) => x.promotion === (promo || 'q')) || null;
      if (!l) return null;

      const p = this.board[from];
      const cor = p.cor;
      const revelou = [];
      const aparenciaAntes = p.aparencia;
      const funcaoAntes = p.funcao;
      const reveladaAntes = p.revelada;

      // Revelação por lance impossível para a aparência (avaliada ANTES de mover).
      if (!p.revelada && !this._possivelParaAparencia(p, l)) {
        p.revelada = true;
      }

      // Captura (no en passant a peça capturada fica atrás do destino).
      const casaCap = l.enPassant ? to - direcaoPeao(cor) * 8 : to;
      const capturada = this.board[casaCap];
      if (capturada) {
        // Peça capturada continua em segredo: guardamos só a aparência.
        this.capturadas[capturada.cor].push(letraNaCor(capturada.aparencia, capturada.cor));
      }

      // Aplica no tabuleiro.
      this.board = this._simular(l);
      p.moveu = true;
      if (l.castle) {
        const base = cor === 'w' ? 0 : 56;
        const torre = this.board[l.castle === 'K' || l.castle === 'k' ? base + 5 : base + 3];
        if (torre) torre.moveu = true;
      }
      if (l.promotion) {
        // Promoção: nova função, nova aparência e peça revelada.
        p.funcao = l.promotion;
        p.aparencia = l.promotion;
        p.revelada = true;
      }
      if (p.revelada && !reveladaAntes) revelou.push({ casa: to, funcao: p.funcao });

      // En passant só no lance seguinte a um passo duplo de função de peão.
      this.epCasa = (p.funcao === 'p' && !l.promotion && Math.abs(to - from) === 16) ? (from + to) / 2 : null;
      if (this.lado === 'b') this.lanceCompleto += 1;
      this.lado = oposta(this.lado);

      // O rei verdadeiro que leva xeque é revelado.
      let sufixo = '';
      if (this.emXeque(this.lado)) {
        const casaRei = this.casaDoRei(this.lado);
        const rei = this.board[casaRei];
        if (!rei.revelada) {
          rei.revelada = true;
          revelou.push({ casa: casaRei, funcao: 'k' });
        }
        sufixo = this.lances().length === 0 ? '#' : '+';
      }

      const publico = {
        from: from,
        to: to,
        piece: letraNaCor(aparenciaAntes, cor),
        captured: capturada ? letraNaCor(capturada.aparencia, capturada.cor) : null,
        promotion: l.promotion ? letraNaCor(l.promotion, cor) : null,
        castle: l.castle,
        enPassant: !!l.enPassant,
        revelou: revelou,
      };
      // Peça já revelada usa a letra da função real; senão, a da aparência.
      const letra = reveladaAntes ? funcaoAntes : aparenciaAntes;
      publico.san = this._notacao(publico, letra, p, reveladaAntes) + sufixo;
      this.pgn.push(publico);
      return publico;
    }

    /**
     * Notação longa com a letra da APARÊNCIA, ou da função se a peça já era
     * revelada (ex.: "Cg1-f3", "e2xd3", "e7-e8=D").
     * Se o lance revelou a peça, acrescenta "⚑" e a letra da função real.
     * Usamos a notação longa para não precisar de desambiguação (que poderia
     * vazar informação sobre as funções escondidas).
     */
    _notacao(pub, letraTipo, peca, reveladaAntes) {
      if (pub.castle) return (pub.castle === 'K' || pub.castle === 'k') ? 'O-O' : 'O-O-O';
      let s = LETRA_PT[letraTipo] + casaParaAlgebrica(pub.from) + (pub.captured ? 'x' : '-') + casaParaAlgebrica(pub.to);
      if (pub.promotion) s += '=' + LETRA_PT[pub.promotion.toLowerCase()];
      else if (!reveladaAntes && peca.revelada) s += ' ⚑' + (LETRA_PT[peca.funcao] || 'P');
      return s;
    }

    ultimoLance() { return this.pgn.length ? this.pgn[this.pgn.length - 1] : null; }
    historicoSan() { return this.pgn.map((l) => l.san); }
    pecasCapturadas() { return { w: this.capturadas.w.slice(), b: this.capturadas.b.slice() }; }

    // ---------------------------- Término ----------------------------------

    emXequeMate() { return this.emXeque(this.lado) && this.lances().length === 0; }
    emAfogamento() { return !this.emXeque(this.lado) && this.lances().length === 0; }

    /** Só rei contra rei (com duas peças no tabuleiro, ambas são os reis). */
    materialInsuficiente() {
      let n = 0;
      for (const p of this.board) if (p) n += 1;
      return n <= 2;
    }

    emEmpate() { return this.emAfogamento() || this.materialInsuficiente(); }
    jogoAcabou() { return this.emXequeMate() || this.emEmpate(); }

    /** Na queda de bandeira: a cor ainda tem alguma peça além do rei? */
    temMaterialParaMate(cor) {
      let n = 0;
      for (const p of this.board) if (p && p.cor === cor) n += 1;
      return n > 1;
    }

    status() {
      if (this.emXequeMate()) return 'xeque-mate';
      if (this.emAfogamento()) return 'empate-afogamento';
      if (this.materialInsuficiente()) return 'empate-material';
      if (this.emXeque(this.lado)) return 'xeque';
      return 'em_andamento';
    }

    // ---------------------------- Visão filtrada ---------------------------

    /**
     * Tabuleiro como o jogador `cor` pode vê-lo. Cada casa: null ou
     *   { c: cor, a: aparência, r: revelada, f?: função, m?: moveu, id?: casa inicial }
     * A função real (f) só aparece nas peças do próprio jogador ou nas reveladas.
     * Com `esconderOponente` (montagem), as peças do oponente nem aparecem.
     */
    tabuleiroPara(cor, esconderOponente) {
      return this.board.map((p) => {
        if (!p) return null;
        const minha = p.cor === cor;
        if (!minha && esconderOponente) return null;
        const v = { c: p.cor, a: p.aparencia, r: !!p.revelada };
        if (minha) { v.f = p.funcao; v.m = !!p.moveu; v.id = p.id; }
        else if (p.revelada) v.f = p.funcao;
        return v;
      });
    }

    /**
     * Tabuleiro com TODAS as funções reais, para o fim da partida (v1.3.0).
     * Só é enviado pelo servidor quando a partida já terminou: aí não há mais
     * segredo, e a revisão mostra quem era cada peça. Mesmo formato de
     * tabuleiroPara, sempre com f (função), m (moveu) e id (casa inicial).
     */
    tabuleiroFinal() {
      return this.board.map((p) => (p ? { c: p.cor, a: p.aparencia, r: !!p.revelada, f: p.funcao, m: !!p.moveu, id: p.id } : null));
    }
  }

  // -------------------------------------------------------------------------
  // Funções para o cliente (só com a visão filtrada)
  // -------------------------------------------------------------------------

  /** FEN só com as aparências (sem roque nem en passant): não revela nada. */
  function fenAparente(tabFiltrado, lado, lanceCompleto) {
    const linhas = [];
    for (let r = 7; r >= 0; r--) {
      let linha = '', vazio = 0;
      for (let f = 0; f < 8; f++) {
        const v = tabFiltrado[r * 8 + f];
        if (!v) { vazio += 1; continue; }
        if (vazio) { linha += vazio; vazio = 0; }
        linha += letraNaCor(v.a, v.c);
      }
      if (vazio) linha += vazio;
      linhas.push(linha);
    }
    return linhas.join('/') + ' ' + lado + ' - - 0 ' + (lanceCompleto || 1);
  }

  /**
   * Dicas de lance para as PRÓPRIAS peças, no cliente. Usa a função real da
   * peça e trata as peças do oponente só como obstáculos. Não filtra xeque
   * (o cliente não conhece as funções do oponente): quem decide é o servidor.
   *
   * @param {object[]} tab  tabuleiro filtrado (tabuleiroPara)
   * @param {object|null} ultimo  último lance público (para o en passant)
   * @returns {{to:number, captured:boolean, promotion:boolean}[]}
   */
  function lancesDica(tab, sq, ultimo) {
    const v = tab[sq];
    if (!v || !v.f) return [];
    const cor = v.c;
    const corEm = (i) => (tab[i] ? tab[i].c : null);
    // En passant possível se o último lance foi um avanço de 2 casas, em linha
    // reta, a partir da fileira de peões do oponente (o servidor confirma).
    let ep = null;
    if (v.f === 'p' && ultimo && !ultimo.castle) {
      const alvo = tab[ultimo.to];
      const inimigo = oposta(cor);
      if (alvo && alvo.c === inimigo && Math.abs(ultimo.to - ultimo.from) === 16 &&
          rankDe(ultimo.from) === rankInicialPeao(inimigo)) {
        ep = (ultimo.from + ultimo.to) / 2;
      }
    }
    const duplo = v.f === 'p' && !v.m && rankDe(sq) === rankInicialPeao(cor);
    const lista = lancesGeometricos(corEm, sq, v.f, cor, { duplo: duplo, ep: ep })
      .map((g) => ({ to: g.to, captured: g.captura, promotion: !!g.promocao }));
    // Roque (sem checar casas atacadas — isso o cliente não sabe).
    const base = cor === 'w' ? 0 : 56;
    if (v.f === 'k' && !v.m && sq === base + 4) {
      const torreOk = (c) => tab[c] && tab[c].c === cor && tab[c].f === 'r' && !tab[c].m;
      if (torreOk(base + 7) && !tab[base + 5] && !tab[base + 6]) lista.push({ to: base + 6, captured: false, promotion: false });
      if (torreOk(base) && !tab[base + 1] && !tab[base + 2] && !tab[base + 3]) lista.push({ to: base + 2, captured: false, promotion: false });
    }
    return lista;
  }

  return {
    JogoImpostor: JogoImpostor,
    QUANTIDADES: QUANTIDADES,
    LETRA_PT: LETRA_PT,
    casasIniciais: casasIniciais,
    funcoesClassicas: funcoesClassicas,
    funcoesValidas: funcoesValidas,
    fenAparente: fenAparente,
    lancesDica: lancesDica,
  };
});
