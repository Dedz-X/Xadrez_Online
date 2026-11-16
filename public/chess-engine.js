/**
 * Motor de xadrez — regras completas do jogo.
 * -------------------------------------------
 * Funciona no navegador (tag <script>) e no Node.js (require / testes perft).
 *
 * Representação do tabuleiro
 *   Vetor de 64 casas. A casa 0 é a1, 1 é b1, …, 7 é h1, 8 é a2, …, 63 é h8.
 *   Assim: arquivo (coluna) = square % 8  (0 = a, 7 = h)
 *           rank    (linha)  = Math.floor(square / 8)  (0 = 1, 7 = 8)
 *
 * Peças
 *   Brancas (maiúsculas): P peão, N cavalo, B bispo, R torre, Q dama, K rei
 *   Pretas  (minúsculas): p, n, b, r, q, k
 *   Casa vazia: null
 *
 * Internamente usamos as letras inglesas (padrão de programação de xadrez).
 * Na interface, a notação algébrica é exibida em português (C, B, T, D, R).
 */
'use strict';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Posição inicial no padrão FEN. */
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Letras dos arquivos (colunas) de 'a' a 'h'. */
const ARQUIVOS = 'abcdefgh';

/** Valor relativo das peças (usado para ordenar capturas na interface). */
const VALOR_PECA = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Direitos de roque como bitmask:
 *   1 = brancas lado do rei (O-O),  2 = brancas lado da dama (O-O-O)
 *   4 = pretas  lado do rei,         8 = pretas  lado da dama
 */
const ROQUE_BRANCAS_REI = 1;
const ROQUE_BRANCAS_DAMA = 2;
const ROQUE_PRETAS_REI = 4;
const ROQUE_PRETAS_DAMA = 8;

/** Saltos do cavalo em [arquivo, rank]. */
const DELTAS_CAVALO = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

/** Um passo do rei (e também as 8 direções deslizantes). */
const DELTAS_REI = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Direções da torre (ortogonais). */
const DELTAS_TORRE = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** Direções do bispo (diagonais). */
const DELTAS_BISPO = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// ---------------------------------------------------------------------------
// Funções auxiliares de tabuleiro
// ---------------------------------------------------------------------------

/** Converte índice 0–63 para notação algébrica ("e4", "a1", …). */
function casaParaAlgebrica(sq) {
  return ARQUIVOS[sq % 8] + String(Math.floor(sq / 8) + 1);
}

/** Converte "e4" em índice 0–63. */
function algebricaParaCasa(texto) {
  const arquivo = texto.charCodeAt(0) - 97;
  const rank = texto.charCodeAt(1) - 49;
  return rank * 8 + arquivo;
}

/** Arquivo (0–7) de uma casa. */
function arquivoDaCasa(sq) {
  return sq % 8;
}

/** Rank (0–7) de uma casa. */
function rankDaCasa(sq) {
  return Math.floor(sq / 8);
}

/** Monta o índice da casa a partir de arquivo e rank. */
function indiceCasa(arquivo, rank) {
  return rank * 8 + arquivo;
}

/** Verifica se arquivo/rank está dentro do tabuleiro. */
function noTabuleiro(arquivo, rank) {
  return arquivo >= 0 && arquivo < 8 && rank >= 0 && rank < 8;
}

/** True se a peça (letra) é branca. */
function ehBranca(peca) {
  return peca === peca.toUpperCase();
}

/** Cor da peça: 'w' para branca, 'b' para preta. */
function corDaPeca(peca) {
  return ehBranca(peca) ? 'w' : 'b';
}

/** Tipo da peça em minúsculo ('p', 'n', 'b', 'r', 'q', 'k'). */
function tipoDaPeca(peca) {
  return peca.toLowerCase();
}

/** Devolve a letra da peça na cor pedida. */
function pecaNaCor(tipo, cor) {
  const letra = tipo.toLowerCase();
  return cor === 'w' ? letra.toUpperCase() : letra;
}

// ---------------------------------------------------------------------------
// Classe principal do motor
// ---------------------------------------------------------------------------

class Chess {
  /**
   * @param {string} [fen] Posição FEN. Se omitido, começa no lance inicial.
   */
  constructor(fen) {
    /** @type {(string|null)[]} Tabuleiro de 64 casas. */
    this.board = new Array(64).fill(null);
    /** @type {'w'|'b'} Lado que joga. */
    this.lado = 'w';
    /** @type {number} Bitmask dos direitos de roque. */
    this.roque = 0;
    /** @type {number|null} Casa alvo de en passant, ou null. */
    this.epCasa = null;
    /** Relógio da regra dos 50 lances (meio-lances sem captura nem peão). */
    this.meioLances = 0;
    /** Número do lance completo (incrementa depois da jogada das pretas). */
    this.lanceCompleto = 1;
    /**
     * Pilha de estados para desfazer / perft.
     * Cada item guarda o suficiente para restaurar a posição.
     */
    this.historico = [];
    /** Lista de lances já feitos, com notação SAN, para a interface. */
    this.pgn = [];

    this.carregarFen(fen || START_FEN);
  }

  /** Reinicia o jogo na posição inicial. */
  resetar() {
    this.carregarFen(START_FEN);
  }

  /**
   * Carrega uma posição no formato FEN.
   * Ex.: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
   */
  carregarFen(fen) {
    const partes = fen.trim().split(/\s+/);
    const linhas = partes[0].split('/');
    this.board.fill(null);

    // FEN descreve o tabuleiro de a8 (rank 7) até h1 (rank 0).
    for (let rankFen = 0; rankFen < 8; rankFen++) {
      const rank = 7 - rankFen;
      let arquivo = 0;
      for (const ch of linhas[rankFen]) {
        if (ch >= '1' && ch <= '8') {
          arquivo += Number(ch);
        } else {
          this.board[indiceCasa(arquivo, rank)] = ch;
          arquivo += 1;
        }
      }
    }

    this.lado = partes[1] === 'b' ? 'b' : 'w';

    this.roque = 0;
    const direitos = partes[2] || '-';
    if (direitos.includes('K')) this.roque |= ROQUE_BRANCAS_REI;
    if (direitos.includes('Q')) this.roque |= ROQUE_BRANCAS_DAMA;
    if (direitos.includes('k')) this.roque |= ROQUE_PRETAS_REI;
    if (direitos.includes('q')) this.roque |= ROQUE_PRETAS_DAMA;

    this.epCasa = !partes[3] || partes[3] === '-' ? null : algebricaParaCasa(partes[3]);
    this.meioLances = partes[4] ? Number(partes[4]) : 0;
    this.lanceCompleto = partes[5] ? Number(partes[5]) : 1;
    this.historico = [];
    this.pgn = [];
  }

  /** Exporta a posição atual em FEN. */
  fen() {
    const linhas = [];
    for (let rankFen = 0; rankFen < 8; rankFen++) {
      const rank = 7 - rankFen;
      let vazio = 0;
      let linha = '';
      for (let arquivo = 0; arquivo < 8; arquivo++) {
        const peca = this.board[indiceCasa(arquivo, rank)];
        if (!peca) {
          vazio += 1;
        } else {
          if (vazio) {
            linha += String(vazio);
            vazio = 0;
          }
          linha += peca;
        }
      }
      if (vazio) linha += String(vazio);
      linhas.push(linha);
    }

    let direitos = '';
    if (this.roque & ROQUE_BRANCAS_REI) direitos += 'K';
    if (this.roque & ROQUE_BRANCAS_DAMA) direitos += 'Q';
    if (this.roque & ROQUE_PRETAS_REI) direitos += 'k';
    if (this.roque & ROQUE_PRETAS_DAMA) direitos += 'q';
    if (!direitos) direitos = '-';

    const ep = this.epCasa === null ? '-' : casaParaAlgebrica(this.epCasa);
    return [linhas.join('/'), this.lado, direitos, ep, this.meioLances, this.lanceCompleto].join(' ');
  }

  /** Cópia rasa do tabuleiro (útil para a interface). */
  obterTabuleiro() {
    return this.board.slice();
  }

  /** 'w' ou 'b'. */
  vez() {
    return this.lado;
  }

  // -------------------------------------------------------------------------
  // Ataques e xeque
  // -------------------------------------------------------------------------

  /** Localiza o rei da cor pedida. Devolve o índice da casa ou -1. */
  casaDoRei(cor) {
    const alvo = cor === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) {
      if (this.board[i] === alvo) return i;
    }
    return -1;
  }

  /**
   * Verifica se a casa `sq` está atacada pela cor `porCor`.
   * Usado para detectar xeque, validar roque e filtrar lances ilegais.
   */
  casaAtacada(sq, porCor) {
    const arquivo = arquivoDaCasa(sq);
    const rank = rankDaCasa(sq);

    // Cavalos
    for (const [df, dr] of DELTAS_CAVALO) {
      const f = arquivo + df;
      const r = rank + dr;
      if (!noTabuleiro(f, r)) continue;
      const peca = this.board[indiceCasa(f, r)];
      if (peca && tipoDaPeca(peca) === 'n' && corDaPeca(peca) === porCor) {
        return true;
      }
    }

    // Peões (atacam na diagonal, no sentido contrário ao que avançam).
    // Um peão branco em (f-1, r-1) ou (f+1, r-1) ataca `sq`.
    const dirPeao = porCor === 'w' ? -1 : 1;
    for (const df of [-1, 1]) {
      const f = arquivo + df;
      const r = rank + dirPeao;
      if (!noTabuleiro(f, r)) continue;
      const peca = this.board[indiceCasa(f, r)];
      if (peca && tipoDaPeca(peca) === 'p' && corDaPeca(peca) === porCor) {
        return true;
      }
    }

    // Rei (um passo em qualquer direção)
    for (const [df, dr] of DELTAS_REI) {
      const f = arquivo + df;
      const r = rank + dr;
      if (!noTabuleiro(f, r)) continue;
      const peca = this.board[indiceCasa(f, r)];
      if (peca && tipoDaPeca(peca) === 'k' && corDaPeca(peca) === porCor) {
        return true;
      }
    }

    // Peças deslizantes: torre/dama (ortogonal) e bispo/dama (diagonal)
    if (this._deslizanteAtaca(arquivo, rank, DELTAS_TORRE, porCor, 'r')) return true;
    if (this._deslizanteAtaca(arquivo, rank, DELTAS_BISPO, porCor, 'b')) return true;

    return false;
  }

  /**
   * Percorre direções a partir de (arquivo, rank) e verifica se encontra
   * uma peça do tipo `tipo` (torre ou bispo) ou uma dama da cor `porCor`.
   */
  _deslizanteAtaca(arquivo, rank, deltas, porCor, tipo) {
    for (const [df, dr] of deltas) {
      let f = arquivo + df;
      let r = rank + dr;
      while (noTabuleiro(f, r)) {
        const peca = this.board[indiceCasa(f, r)];
        if (peca) {
          if (corDaPeca(peca) === porCor) {
            const t = tipoDaPeca(peca);
            if (t === tipo || t === 'q') return true;
          }
          break; // peça bloqueia o raio, seja amiga ou inimiga
        }
        f += df;
        r += dr;
      }
    }
    return false;
  }

  /** O lado `cor` está em xeque? */
  emXeque(cor) {
    const rei = this.casaDoRei(cor || this.lado);
    if (rei < 0) return false;
    const inimigo = (cor || this.lado) === 'w' ? 'b' : 'w';
    return this.casaAtacada(rei, inimigo);
  }

  // -------------------------------------------------------------------------
  // Geração de lances
  // -------------------------------------------------------------------------

  /**
   * Gera lances pseudo-legais (ainda podem deixar o próprio rei em xeque)
   * e depois filtra os ilegais. Se `deCasa` for informado, só lances dessa casa.
   * @returns {object[]} lista de objetos de lance
   */
  lances(deCasa) {
    const cor = this.lado;
    const pseudo = [];

    if (typeof deCasa === 'number') {
      const peca = this.board[deCasa];
      if (peca && corDaPeca(peca) === cor) {
        this._gerarLancesDaPeca(deCasa, peca, pseudo);
      }
    } else {
      for (let sq = 0; sq < 64; sq++) {
        const peca = this.board[sq];
        if (peca && corDaPeca(peca) === cor) {
          this._gerarLancesDaPeca(sq, peca, pseudo);
        }
      }
    }

    // Filtra lances que deixariam o próprio rei em xeque.
    const legais = [];
    for (const lance of pseudo) {
      this._aplicarLance(lance);
      const ilegal = this.emXeque(cor);
      this._desfazerLance();
      if (!ilegal) legais.push(lance);
    }
    return legais;
  }

  /** Atalho no estilo chess.js: moves(). */
  moves(opcoes) {
    if (opcoes && typeof opcoes.square === 'number') return this.lances(opcoes.square);
    if (opcoes && typeof opcoes.square === 'string') return this.lances(algebricaParaCasa(opcoes.square));
    return this.lances();
  }

  _gerarLancesDaPeca(sq, peca, dest) {
    const tipo = tipoDaPeca(peca);
    if (tipo === 'p') this._gerarLancesPeao(sq, peca, dest);
    else if (tipo === 'n') this._gerarSaltos(sq, peca, dest, DELTAS_CAVALO);
    else if (tipo === 'b') this._gerarDeslizantes(sq, peca, dest, DELTAS_BISPO);
    else if (tipo === 'r') this._gerarDeslizantes(sq, peca, dest, DELTAS_TORRE);
    else if (tipo === 'q') this._gerarDeslizantes(sq, peca, dest, DELTAS_REI);
    else if (tipo === 'k') {
      this._gerarSaltos(sq, peca, dest, DELTAS_REI);
      this._gerarRoques(sq, peca, dest);
    }
  }

  /**
   * Cria um objeto de lance.
   * Campos: from, to, piece, captured, promotion, enPassant, castle.
   */
  _criarLance(de, para, peca, extras) {
    const lance = {
      from: de,
      to: para,
      piece: peca,
      captured: extras && extras.captured !== undefined ? extras.captured : this.board[para],
      promotion: (extras && extras.promotion) || null,
      enPassant: !!(extras && extras.enPassant),
      castle: (extras && extras.castle) || null,
    };
    return lance;
  }

  _gerarSaltos(sq, peca, dest, deltas) {
    const arquivo = arquivoDaCasa(sq);
    const rank = rankDaCasa(sq);
    const cor = corDaPeca(peca);
    for (const [df, dr] of deltas) {
      const f = arquivo + df;
      const r = rank + dr;
      if (!noTabuleiro(f, r)) continue;
      const para = indiceCasa(f, r);
      const alvo = this.board[para];
      if (!alvo || corDaPeca(alvo) !== cor) {
        dest.push(this._criarLance(sq, para, peca));
      }
    }
  }

  _gerarDeslizantes(sq, peca, dest, deltas) {
    const arquivo = arquivoDaCasa(sq);
    const rank = rankDaCasa(sq);
    const cor = corDaPeca(peca);
    for (const [df, dr] of deltas) {
      let f = arquivo + df;
      let r = rank + dr;
      while (noTabuleiro(f, r)) {
        const para = indiceCasa(f, r);
        const alvo = this.board[para];
        if (!alvo) {
          dest.push(this._criarLance(sq, para, peca));
        } else {
          if (corDaPeca(alvo) !== cor) {
            dest.push(this._criarLance(sq, para, peca));
          }
          break;
        }
        f += df;
        r += dr;
      }
    }
  }

  /**
   * Peão: avanço de 1, avanço duplo no rank inicial, capturas diagonais,
   * en passant e promoção (gera 4 lances: dama, torre, bispo, cavalo).
   */
  _gerarLancesPeao(sq, peca, dest) {
    const cor = corDaPeca(peca);
    const arquivo = arquivoDaCasa(sq);
    const rank = rankDaCasa(sq);
    const dir = cor === 'w' ? 1 : -1;
    const rankInicial = cor === 'w' ? 1 : 6;
    const rankPromocao = cor === 'w' ? 7 : 0;

    // Avanço simples
    const r1 = rank + dir;
    if (noTabuleiro(arquivo, r1) && !this.board[indiceCasa(arquivo, r1)]) {
      const para = indiceCasa(arquivo, r1);
      this._adicionarPeao(dest, sq, para, peca, null, false, r1 === rankPromocao);

      // Avanço duplo (as duas casas precisam estar vazias)
      const r2 = rank + dir * 2;
      if (rank === rankInicial && noTabuleiro(arquivo, r2) && !this.board[indiceCasa(arquivo, r2)]) {
        dest.push(this._criarLance(sq, indiceCasa(arquivo, r2), peca));
      }
    }

    // Capturas diagonais (incluindo en passant)
    for (const df of [-1, 1]) {
      const f = arquivo + df;
      const r = rank + dir;
      if (!noTabuleiro(f, r)) continue;
      const para = indiceCasa(f, r);
      const alvo = this.board[para];
      if (alvo && corDaPeca(alvo) !== cor) {
        this._adicionarPeao(dest, sq, para, peca, alvo, false, r === rankPromocao);
      } else if (this.epCasa === para) {
        // A peça capturada no en passant está "atrás" da casa de destino.
        const capturada = this.board[indiceCasa(f, rank)];
        dest.push(this._criarLance(sq, para, peca, { captured: capturada, enPassant: true }));
      }
    }
  }

  /** Se for promoção, gera os 4 tipos; senão, um único lance. */
  _adicionarPeao(dest, de, para, peca, capturada, enPassant, promove) {
    if (promove) {
      const cor = corDaPeca(peca);
      for (const tipo of ['q', 'r', 'b', 'n']) {
        dest.push(this._criarLance(de, para, peca, {
          captured: capturada,
          promotion: pecaNaCor(tipo, cor),
        }));
      }
    } else {
      dest.push(this._criarLance(de, para, peca, { captured: capturada, enPassant: enPassant }));
    }
  }

  /**
   * Roque: o rei anda duas casas em direção à torre, e a torre "pula" para
   * o outro lado. Condições (FIDE):
   *  1. Rei e torre envolvidos ainda não se moveram (direitos de roque).
   *  2. Não há peças entre eles.
   *  3. O rei não está em xeque, não atravessa casa atacada e não termina em xeque.
   *     (O xeque final é filtrado depois, em lances(); aqui checamos origem e passagem.)
   */
  _gerarRoques(sq, peca, dest) {
    const cor = corDaPeca(peca);
    const inimigo = cor === 'w' ? 'b' : 'w';

    // Se o rei já está em xeque, o roque é proibido.
    if (this.casaAtacada(sq, inimigo)) return;

    if (cor === 'w' && sq === 4) {
      // Roque curto das brancas: e1 → g1, torre h1 → f1
      if ((this.roque & ROQUE_BRANCAS_REI) && !this.board[5] && !this.board[6]) {
        if (!this.casaAtacada(5, inimigo) && !this.casaAtacada(6, inimigo)) {
          dest.push(this._criarLance(4, 6, peca, { castle: 'K' }));
        }
      }
      // Roque longo das brancas: e1 → c1, torre a1 → d1 (b1 também deve estar vazia)
      if ((this.roque & ROQUE_BRANCAS_DAMA) && !this.board[3] && !this.board[2] && !this.board[1]) {
        if (!this.casaAtacada(3, inimigo) && !this.casaAtacada(2, inimigo)) {
          dest.push(this._criarLance(4, 2, peca, { castle: 'Q' }));
        }
      }
    }

    if (cor === 'b' && sq === 60) {
      if ((this.roque & ROQUE_PRETAS_REI) && !this.board[61] && !this.board[62]) {
        if (!this.casaAtacada(61, inimigo) && !this.casaAtacada(62, inimigo)) {
          dest.push(this._criarLance(60, 62, peca, { castle: 'k' }));
        }
      }
      if ((this.roque & ROQUE_PRETAS_DAMA) && !this.board[59] && !this.board[58] && !this.board[57]) {
        if (!this.casaAtacada(59, inimigo) && !this.casaAtacada(58, inimigo)) {
          dest.push(this._criarLance(60, 58, peca, { castle: 'q' }));
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Aplicar / desfazer lance (núcleo do motor e do perft)
  // -------------------------------------------------------------------------

  /**
   * Aplica o lance no tabuleiro e empilha o estado anterior.
   * Não calcula notação SAN (isso fica para mover(), usado pela interface).
   */
  _aplicarLance(lance) {
    this.historico.push({
      lance: lance,
      roque: this.roque,
      epCasa: this.epCasa,
      meioLances: this.meioLances,
      lanceCompleto: this.lanceCompleto,
      lado: this.lado,
      // A peça que estava na casa de destino (pode ser null).
      // No en passant a casa de destino está vazia — a capturada fica noutro lugar.
      capturadaNoDestino: this.board[lance.to],
    });

    const { from, to, piece, promotion, enPassant, castle } = lance;

    // Move a peça (ou a peça promovida).
    this.board[to] = promotion || piece;
    this.board[from] = null;

    // En passant: remove o peão capturado, que está na mesma rank de origem.
    if (enPassant) {
      const dir = corDaPeca(piece) === 'w' ? -1 : 1;
      this.board[to + dir * 8] = null;
    }

    // Roque: além do rei, move a torre.
    if (castle === 'K') {
      this.board[5] = 'R';
      this.board[7] = null;
    } else if (castle === 'Q') {
      this.board[3] = 'R';
      this.board[0] = null;
    } else if (castle === 'k') {
      this.board[61] = 'r';
      this.board[63] = null;
    } else if (castle === 'q') {
      this.board[59] = 'r';
      this.board[56] = null;
    }

    // Atualiza direitos de roque: rei ou torre que se move, ou torre capturada.
    this._atualizarRoque(from, to, piece, lance.captured);

    // En passant só vale no lance imediatamente seguinte a um avanço duplo de peão.
    this.epCasa = null;
    if (tipoDaPeca(piece) === 'p' && Math.abs(to - from) === 16) {
      this.epCasa = (from + to) / 2;
    }

    // Relógio dos 50 lances: zera em captura ou movimento de peão.
    if (tipoDaPeca(piece) === 'p' || lance.captured) {
      this.meioLances = 0;
    } else {
      this.meioLances += 1;
    }

    if (this.lado === 'b') this.lanceCompleto += 1;
    this.lado = this.lado === 'w' ? 'b' : 'w';
  }

  _atualizarRoque(from, to, piece, capturada) {
    // Rei se moveu → perde os dois direitos daquela cor.
    if (piece === 'K') this.roque &= ~(ROQUE_BRANCAS_REI | ROQUE_BRANCAS_DAMA);
    if (piece === 'k') this.roque &= ~(ROQUE_PRETAS_REI | ROQUE_PRETAS_DAMA);

    // Torre se moveu da casa original.
    if (from === 0 || to === 0) this.roque &= ~ROQUE_BRANCAS_DAMA;
    if (from === 7 || to === 7) this.roque &= ~ROQUE_BRANCAS_REI;
    if (from === 56 || to === 56) this.roque &= ~ROQUE_PRETAS_DAMA;
    if (from === 63 || to === 63) this.roque &= ~ROQUE_PRETAS_REI;
  }

  /** Restaura o estado no topo da pilha. */
  _desfazerLance() {
    const estado = this.historico.pop();
    if (!estado) return null;

    const lance = estado.lance;
    const { from, to, piece, enPassant, castle } = lance;

    this.board[from] = piece;
    this.board[to] = estado.capturadaNoDestino;

    // Recoloca o peão capturado en passant.
    if (enPassant) {
      const dir = corDaPeca(piece) === 'w' ? -1 : 1;
      this.board[to + dir * 8] = lance.captured;
    }

    // Devolve a torre à casa original no roque.
    if (castle === 'K') {
      this.board[7] = 'R';
      this.board[5] = null;
    } else if (castle === 'Q') {
      this.board[0] = 'R';
      this.board[3] = null;
    } else if (castle === 'k') {
      this.board[63] = 'r';
      this.board[61] = null;
    } else if (castle === 'q') {
      this.board[56] = 'r';
      this.board[59] = null;
    }

    this.roque = estado.roque;
    this.epCasa = estado.epCasa;
    this.meioLances = estado.meioLances;
    this.lanceCompleto = estado.lanceCompleto;
    this.lado = estado.lado;
    return lance;
  }

  // -------------------------------------------------------------------------
  // API pública de jogo
  // -------------------------------------------------------------------------

  /**
   * Joga um lance legal.
   * Aceita um objeto {from, to, promotion} (números ou "e2"/"e4")
   * ou um objeto já gerado por lances().
   * Devolve o lance jogado (com san) ou null se for ilegal.
   */
  mover(entrada) {
    const from = typeof entrada.from === 'string' ? algebricaParaCasa(entrada.from) : entrada.from;
    const to = typeof entrada.to === 'string' ? algebricaParaCasa(entrada.to) : entrada.to;
    let promo = entrada.promotion || null;
    if (promo) {
      // Aceita 'q'/'Q'/'dama' etc. Normaliza para a letra na cor certa.
      const mapa = { q: 'q', d: 'q', dama: 'q', r: 'r', t: 'r', torre: 'r', b: 'b', bispo: 'b', n: 'n', c: 'n', cavalo: 'n' };
      const tipo = mapa[String(promo).toLowerCase()] || String(promo).toLowerCase();
      promo = pecaNaCor(tipo, this.lado);
    }

    const legais = this.lances(from);
    let escolhido = null;
    for (const lance of legais) {
      if (lance.to !== to) continue;
      if (lance.promotion) {
        if (promo && lance.promotion === promo) {
          escolhido = lance;
          break;
        }
      } else {
        escolhido = lance;
        break;
      }
    }
    // Se promoveu e o usuário ainda não escolheu, assume dama (a interface
    // deve mostrar o diálogo antes de chamar mover).
    if (!escolhido && promo === null) {
      for (const lance of legais) {
        if (lance.to === to && lance.promotion && tipoDaPeca(lance.promotion) === 'q') {
          escolhido = lance;
          break;
        }
      }
    }
    if (!escolhido) return null;

    const san = this._notacaoSan(escolhido, legais);
    this._aplicarLance(escolhido);
    escolhido.san = san + this._sufixoXequeMate();
    this.pgn.push(escolhido);
    return escolhido;
  }

  /** Desfaz o último lance. Devolve o lance desfeito ou null. */
  desfazer() {
    if (!this.historico.length) return null;
    this.pgn.pop();
    return this._desfazerLance();
  }

  /**
   * Último lance jogado (para destacar na interface), ou null.
   */
  ultimoLance() {
    if (!this.pgn.length) return null;
    return this.pgn[this.pgn.length - 1];
  }

  /** Histórico em notação algébrica portuguesa. */
  historicoSan() {
    return this.pgn.map((l) => l.san);
  }

  /**
   * Peças capturadas até agora, separadas por cor da peça (não de quem capturou).
   * { w: ['P', ...], b: ['q', ...] }
   */
  pecasCapturadas() {
    const w = [];
    const b = [];
    for (const lance of this.pgn) {
      if (!lance.captured) continue;
      if (corDaPeca(lance.captured) === 'w') w.push(lance.captured);
      else b.push(lance.captured);
    }
    const ordem = (a, b2) => VALOR_PECA[tipoDaPeca(b2)] - VALOR_PECA[tipoDaPeca(a)];
    w.sort(ordem);
    b.sort(ordem);
    return { w, b };
  }

  // -------------------------------------------------------------------------
  // Término da partida
  // -------------------------------------------------------------------------

  emXequeMate() {
    return this.emXeque(this.lado) && this.lances().length === 0;
  }

  emAfogamento() {
    return !this.emXeque(this.lado) && this.lances().length === 0;
  }

  /**
   * Material insuficiente para dar mate: K vs K, K+B vs K, K+N vs K,
   * e K+B vs K+B com bispos da mesma cor de casa.
   */
  materialInsuficiente() {
    const pecas = [];
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (p && tipoDaPeca(p) !== 'k') pecas.push({ peca: p, sq: i });
    }
    if (pecas.length === 0) return true; // K vs K

    // Qualquer peão, torre ou dama ainda pode dar mate.
    for (const item of pecas) {
      const t = tipoDaPeca(item.peca);
      if (t === 'p' || t === 'r' || t === 'q') return false;
    }

    if (pecas.length === 1) {
      const t = tipoDaPeca(pecas[0].peca);
      return t === 'b' || t === 'n'; // K+B vs K ou K+N vs K
    }

    if (pecas.length === 2) {
      const [a, c] = pecas;
      if (tipoDaPeca(a.peca) === 'b' && tipoDaPeca(c.peca) === 'b') {
        // Bispos da mesma cor de casa → empate; cores diferentes → ainda é mate possível.
        const corCasa = (sq) => (arquivoDaCasa(sq) + rankDaCasa(sq)) % 2;
        return corCasa(a.sq) === corCasa(c.sq);
      }
    }

    return false;
  }

  /** Regra dos 50 lances: 100 meio-lances sem captura nem peão. */
  regra50Lances() {
    return this.meioLances >= 100;
  }

  emEmpate() {
    return this.emAfogamento() || this.materialInsuficiente() || this.regra50Lances();
  }

  jogoAcabou() {
    return this.emXequeMate() || this.emEmpate();
  }

  /**
   * A cor tem material suficiente para, em tese, dar mate em um rei solitário?
   * Usado na exceção de “perdi no tempo, mas o adversário não pode dar mate”
   * (vira empate). K, K+B, K+N e K+CC (dois cavalos) não bastam; peão, torre,
   * dama, dois bispos, bispo+cavalo ou três cavalos bastam.
   */
  temMaterialParaMate(cor) {
    let peoes = 0, torres = 0, damas = 0, bispos = 0, cavalos = 0;
    for (let i = 0; i < 64; i++) {
      const peca = this.board[i];
      if (!peca || corDaPeca(peca) !== cor) continue;
      const tipo = tipoDaPeca(peca);
      if (tipo === 'p') peoes += 1;
      else if (tipo === 'r') torres += 1;
      else if (tipo === 'q') damas += 1;
      else if (tipo === 'b') bispos += 1;
      else if (tipo === 'n') cavalos += 1;
    }
    if (peoes || torres || damas) return true;
    if (bispos >= 2) return true;
    if (bispos >= 1 && cavalos >= 1) return true;
    if (cavalos >= 3) return true;
    return false;
  }

  /**
   * Texto de status em português para a interface.
   * 'em_andamento' | 'xeque' | 'xeque-mate' | 'empate-afogamento' |
   * 'empate-material' | 'empate-50'
   */
  status() {
    if (this.emXequeMate()) return 'xeque-mate';
    if (this.emAfogamento()) return 'empate-afogamento';
    if (this.materialInsuficiente()) return 'empate-material';
    if (this.regra50Lances()) return 'empate-50';
    if (this.emXeque(this.lado)) return 'xeque';
    return 'em_andamento';
  }

  // -------------------------------------------------------------------------
  // Notação algébrica (português): C cavalo, B bispo, T torre, D dama, R rei
  // -------------------------------------------------------------------------

  _letraSan(peca) {
    const mapa = { p: '', n: 'C', b: 'B', r: 'T', q: 'D', k: 'R' };
    return mapa[tipoDaPeca(peca)];
  }

  /**
   * Monta a notação SAN (sem +/#; o sufixo é acrescentado depois de jogar).
   * Desambigua quando duas peças iguais podem ir à mesma casa (ex.: Cbd2, T1a3).
   */
  _notacaoSan(lance, legais) {
    if (lance.castle === 'K' || lance.castle === 'k') return 'O-O';
    if (lance.castle === 'Q' || lance.castle === 'q') return 'O-O-O';

    const dest = casaParaAlgebrica(lance.to);
    const tipo = tipoDaPeca(lance.piece);
    let texto = '';

    if (tipo === 'p') {
      // Peão: "e4" ou "exd5". Promoção: "e8=D" / "exd8=D".
      if (lance.captured) texto += ARQUIVOS[arquivoDaCasa(lance.from)] + 'x' + dest;
      else texto += dest;
      if (lance.promotion) texto += '=' + this._letraSan(lance.promotion);
      return texto;
    }

    texto = this._letraSan(lance.piece);

    // Desambiguação: outras peças do mesmo tipo que também chegam em `to`.
    const rivais = legais.filter((l) =>
      l !== lance &&
      l.piece === lance.piece &&
      l.to === lance.to &&
      !l.castle
    );
    if (rivais.length) {
      const mesmoArquivo = rivais.some((l) => arquivoDaCasa(l.from) === arquivoDaCasa(lance.from));
      const mesmoRank = rivais.some((l) => rankDaCasa(l.from) === rankDaCasa(lance.from));
      if (!mesmoArquivo) {
        texto += ARQUIVOS[arquivoDaCasa(lance.from)];
      } else if (!mesmoRank) {
        texto += String(rankDaCasa(lance.from) + 1);
      } else {
        texto += casaParaAlgebrica(lance.from);
      }
    }

    if (lance.captured) texto += 'x';
    texto += dest;
    if (lance.promotion) texto += '=' + this._letraSan(lance.promotion);
    return texto;
  }

  /** Depois de aplicar o lance, o oponente (agora this.lado) está em xeque ou mate? */
  _sufixoXequeMate() {
    if (this.emXeque(this.lado)) {
      return this.lances().length === 0 ? '#' : '+';
    }
    return '';
  }

  // -------------------------------------------------------------------------
  // Perft — conta todos os lances legais até a profundidade dada.
  // Usado para validar o gerador de lances.
  // Na posição inicial: profundidade 1 = 20, 2 = 400, 3 = 8902, 4 = 197281.
  // -------------------------------------------------------------------------

  perft(profundidade) {
    if (profundidade === 0) return 1;
    const lista = this.lances();
    if (profundidade === 1) return lista.length;
    let total = 0;
    for (const lance of lista) {
      this._aplicarLance(lance);
      total += this.perft(profundidade - 1);
      this._desfazerLance();
    }
    return total;
  }

  /**
   * Perft "divide": mostra quantos nós cada lance da raiz produz.
   * Útil para achar divergências contra uma tabela conhecida.
   */
  perftDivide(profundidade) {
    const lista = this.lances();
    const linhas = [];
    let total = 0;
    for (const lance of lista) {
      this._aplicarLance(lance);
      const n = profundidade <= 1 ? 1 : this.perft(profundidade - 1);
      this._desfazerLance();
      const nome = casaParaAlgebrica(lance.from) + casaParaAlgebrica(lance.to) +
        (lance.promotion ? tipoDaPeca(lance.promotion) : '');
      linhas.push({ move: nome, nodes: n });
      total += n;
    }
    return { linhas, total };
  }
}

// Exporta tanto para Node.js (testes) quanto para o navegador (interface).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Chess,
    START_FEN,
    casaParaAlgebrica,
    algebricaParaCasa,
  };
} else {
  globalThis.Chess = Chess;
  globalThis.START_FEN = START_FEN;
  globalThis.casaParaAlgebrica = casaParaAlgebrica;
  globalThis.algebricaParaCasa = algebricaParaCasa;
}
