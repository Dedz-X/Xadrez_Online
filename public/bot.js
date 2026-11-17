/**
 * Bot de xadrez (modo "Contra o bot").
 * ------------------------------------
 * Roda no navegador, de preferência dentro de um Web Worker (bot-worker.js),
 * para não travar a interface enquanto pensa. Também funciona no Node.js
 * (testes em test-bot.js). Usa o motor chess-engine.js para gerar os lances
 * legais, então o bot NUNCA joga um lance ilegal.
 *
 * Níveis
 *  - facil:   lance aleatório, mas com preferência por capturas
 *             (70% das vezes escolhe uma captura, se houver).
 *  - medio:   minimax de profundidade 2 (o lance dele + a resposta do
 *             jogador), avaliando só o material.
 *  - dificil: alfa-beta com aprofundamento iterativo até profundidade 4,
 *             tabelas de posição (piece-square tables), ordenação de lances
 *             (capturas valiosas primeiro, "killer moves") e busca de
 *             quiescência (continua olhando capturas no fim da árvore para
 *             não "deixar a peça pendurada"). Para no limite de tempo
 *             (1,8 s por padrão) e joga o melhor lance da última profundidade
 *             terminada.
 *
 * Só para o xadrez clássico (o Impostor tem informação escondida e ficou fora
 * do escopo do bot na v1.3.0).
 */
(function (raiz, fabrica) {
  'use strict';
  const ChessRef = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./chess-engine.js').Chess
    : raiz.Chess;
  const api = fabrica(ChessRef);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.BotXadrez = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Chess) {
  'use strict';

  const NIVEIS = ['facil', 'medio', 'dificil'];

  /** Valor das peças em centipeões (100 = um peão). */
  const VALOR = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;

  // -------------------------------------------------------------------------
  // Tabelas de posição (do ponto de vista das BRANCAS, a8 primeiro → h1 por
  // último, como se lê o tabuleiro). Valores clássicos e simples: cavalos
  // e bispos no centro, peões avançando, rei protegido no meio-jogo.
  // -------------------------------------------------------------------------
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0,
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20,
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20,
    ],
    // Final de partida: o rei deve ir para o centro.
    kFinal: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50,
    ],
  };

  /**
   * Índice na tabela para a casa `sq` (0 = a1) de uma peça da cor `cor`.
   * As tabelas estão escritas do lado das brancas com a 8ª fileira em cima;
   * para as pretas, espelhamos verticalmente.
   */
  function indicePst(sq, cor) {
    const arquivo = sq % 8;
    const rank = Math.floor(sq / 8);
    const linha = cor === 'w' ? 7 - rank : rank;
    return linha * 8 + arquivo;
  }

  function tipo(p) { return p.toLowerCase(); }
  function corDe(p) { return p === p.toUpperCase() ? 'w' : 'b'; }

  // -------------------------------------------------------------------------
  // Avaliação
  // -------------------------------------------------------------------------

  /** Material puro, do ponto de vista de quem joga (jogo.vez()). */
  function avaliarMaterial(jogo) {
    let s = 0;
    for (const p of jogo.board) {
      if (!p) continue;
      const v = VALOR[tipo(p)];
      s += corDe(p) === 'w' ? v : -v;
    }
    return jogo.vez() === 'w' ? s : -s;
  }

  /** Material + tabelas de posição, do ponto de vista de quem joga. */
  function avaliarCompleto(jogo) {
    let s = 0;
    let materialSemReis = 0;
    for (const p of jogo.board) if (p && tipo(p) !== 'k' && tipo(p) !== 'p') materialSemReis += VALOR[tipo(p)];
    // Final: sem damas, ou pouco material de peças no tabuleiro.
    const final = materialSemReis <= 1300;
    for (let sq = 0; sq < 64; sq++) {
      const p = jogo.board[sq];
      if (!p) continue;
      const t = tipo(p);
      const cor = corDe(p);
      const tabela = t === 'k' && final ? PST.kFinal : PST[t];
      const v = VALOR[t] + tabela[indicePst(sq, cor)];
      s += cor === 'w' ? v : -v;
    }
    return jogo.vez() === 'w' ? s : -s;
  }

  // -------------------------------------------------------------------------
  // Auxiliares de busca
  // -------------------------------------------------------------------------

  /** Nota para ordenar lances: capturas valiosas por peças baratas primeiro (MVV-LVA). */
  function notaOrdenacao(l, killers) {
    let n = 0;
    if (l.captured) n += 10 * VALOR[tipo(l.captured)] - VALOR[tipo(l.piece)] + 10000;
    if (l.enPassant) n += 10000 + 900;
    if (l.promotion) n += 8000 + VALOR[tipo(l.promotion)];
    if (killers && killers.some((k) => k && k.from === l.from && k.to === l.to)) n += 5000;
    if (l.castle) n += 50;
    return n;
  }

  function ordenar(lista, killers, primeiro) {
    const notas = new Map();
    for (const l of lista) {
      let n = notaOrdenacao(l, killers);
      // O melhor lance da iteração anterior é testado antes de tudo.
      if (primeiro && l.from === primeiro.from && l.to === primeiro.to && l.promotion === primeiro.promotion) n += 1e6;
      notas.set(l, n);
    }
    return lista.sort((a, b) => notas.get(b) - notas.get(a));
  }

  function chaveLance(l) {
    return { from: l.from, to: l.to, promotion: l.promotion ? tipo(l.promotion) : null };
  }

  /** Erro interno usado para abortar a busca quando o tempo acaba. */
  function TempoEsgotado() {}

  // -------------------------------------------------------------------------
  // Fácil
  // -------------------------------------------------------------------------

  function lanceFacil(jogo, aleatorio) {
    const lista = jogo.lances();
    if (!lista.length) return null;
    const capturas = lista.filter((l) => l.captured);
    if (capturas.length && aleatorio() < 0.7) {
      // Entre as capturas, as de peças mais valiosas têm mais chance.
      const pesos = capturas.map((l) => 1 + VALOR[tipo(l.captured)] / 100);
      let r = aleatorio() * pesos.reduce((a, b) => a + b, 0);
      for (let i = 0; i < capturas.length; i++) {
        r -= pesos[i];
        if (r <= 0) return capturas[i];
      }
      return capturas[capturas.length - 1];
    }
    return lista[Math.floor(aleatorio() * lista.length)];
  }

  // -------------------------------------------------------------------------
  // Médio: minimax (forma negamax) de profundidade 2, só material
  // -------------------------------------------------------------------------

  function negamaxMaterial(jogo, prof, ply, estat) {
    estat.nos += 1;
    const lista = jogo.lances();
    if (!lista.length) return jogo.emXeque(jogo.vez()) ? -MATE + ply : 0;
    if (prof === 0) return avaliarMaterial(jogo);
    let melhor = -Infinity;
    for (const l of lista) {
      jogo._aplicarLance(l);
      const v = -negamaxMaterial(jogo, prof - 1, ply + 1, estat);
      jogo._desfazerLance();
      if (v > melhor) melhor = v;
    }
    return melhor;
  }

  function lanceMedio(jogo, aleatorio, estat) {
    const lista = jogo.lances();
    if (!lista.length) return null;
    let melhorValor = -Infinity;
    let melhores = [];
    for (const l of lista) {
      jogo._aplicarLance(l);
      const v = -negamaxMaterial(jogo, 1, 1, estat);
      jogo._desfazerLance();
      if (v > melhorValor) { melhorValor = v; melhores = [l]; }
      else if (v === melhorValor) melhores.push(l);
    }
    // Empates de valor (muito comuns só com material): sorteia entre eles,
    // preferindo capturas e lances centrais para não parecer "bobo".
    const bons = melhores.filter((l) => l.captured);
    const pool = bons.length ? bons : melhores;
    return pool[Math.floor(aleatorio() * pool.length)];
  }

  // -------------------------------------------------------------------------
  // Difícil: alfa-beta + quiescência + aprofundamento iterativo
  // -------------------------------------------------------------------------

  function quiescencia(jogo, alfa, beta, ply, ctx) {
    ctx.nos += 1;
    if ((ctx.nos & 1023) === 0 && Date.now() > ctx.limite) throw new TempoEsgotado();
    const parado = avaliarCompleto(jogo);
    if (parado >= beta) return beta;
    if (parado > alfa) alfa = parado;
    if (ply > ctx.plyMaxQ) return alfa;
    const capturas = ordenar(jogo.lances().filter((l) => l.captured || l.promotion), null, null);
    for (const l of capturas) {
      jogo._aplicarLance(l);
      const v = -quiescencia(jogo, -beta, -alfa, ply + 1, ctx);
      jogo._desfazerLance();
      if (v >= beta) return beta;
      if (v > alfa) alfa = v;
    }
    return alfa;
  }

  function alfaBeta(jogo, prof, alfa, beta, ply, ctx) {
    ctx.nos += 1;
    if ((ctx.nos & 1023) === 0 && Date.now() > ctx.limite) throw new TempoEsgotado();
    const lista = jogo.lances();
    if (!lista.length) return jogo.emXeque(jogo.vez()) ? -MATE + ply : 0;
    if (jogo.meioLances >= 100) return 0;
    if (prof === 0) return quiescencia(jogo, alfa, beta, ply, ctx);
    ordenar(lista, ctx.killers[ply], null);
    for (const l of lista) {
      jogo._aplicarLance(l);
      const v = -alfaBeta(jogo, prof - 1, -beta, -alfa, ply + 1, ctx);
      jogo._desfazerLance();
      if (v >= beta) {
        // Lance "assassino": cortou a busca; testamos cedo em posições irmãs.
        if (!l.captured) {
          const k = ctx.killers[ply] || (ctx.killers[ply] = [null, null]);
          k[1] = k[0];
          k[0] = { from: l.from, to: l.to };
        }
        return beta;
      }
      if (v > alfa) alfa = v;
    }
    return alfa;
  }

  function lanceDificil(jogo, opcoes, estat) {
    const raiz = jogo.lances();
    if (!raiz.length) return null;
    if (raiz.length === 1) return raiz[0];
    const ctx = {
      nos: 0,
      limite: Date.now() + (opcoes.tempoMs || 1800),
      killers: [],
      plyMaxQ: 8,
      // Altura da pilha de desfazer no início: se o tempo acabar no meio da
      // árvore, desfazemos tudo o que ficou aplicado até voltar aqui.
      base: jogo.historico.length,
    };
    let melhor = ordenar(raiz.slice(), null, null)[0];
    const profMax = opcoes.profundidade || 4;
    for (let prof = 1; prof <= profMax; prof++) {
      let alfa = -Infinity;
      let melhorDaIteracao = null;
      try {
        const lista = ordenar(raiz.slice(), ctx.killers[0], melhor);
        for (const l of lista) {
          jogo._aplicarLance(l);
          const v = -alfaBeta(jogo, prof - 1, -Infinity, -alfa, 1, ctx);
          jogo._desfazerLance();
          if (v > alfa) { alfa = v; melhorDaIteracao = l; }
        }
      } catch (e) {
        if (!(e instanceof TempoEsgotado)) throw e;
        // Tempo acabou no meio da iteração: desfaz o que ficou aplicado.
        while (jogo.historico.length > ctx.base) jogo._desfazerLance();
        break;
      }
      if (melhorDaIteracao) melhor = melhorDaIteracao;
      estat.profundidade = prof;
      estat.valor = alfa;
      if (alfa >= MATE - 100) break; // achou mate: não precisa ir mais fundo
    }
    estat.nos += ctx.nos;
    return melhor;
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  /** Gerador pseudoaleatório simples com semente (testes reproduzíveis). */
  function criarAleatorio(semente) {
    if (semente == null) return Math.random;
    let s = semente >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /**
   * Escolhe o lance do bot.
   * @param {string} fen  posição atual (FEN)
   * @param {'facil'|'medio'|'dificil'} nivel
   * @param {object} [opcoes]  { tempoMs, profundidade, semente }
   * @returns {{lance: {from:number, to:number, promotion:string|null}|null,
   *            nos:number, profundidade:number, ms:number}}
   */
  function escolherLance(fen, nivel, opcoes) {
    opcoes = opcoes || {};
    const inicio = Date.now();
    const jogo = new Chess(fen);
    const aleatorio = criarAleatorio(opcoes.semente);
    const estat = { nos: 0, profundidade: 0, valor: null };
    let lance = null;
    if (nivel === 'facil') lance = lanceFacil(jogo, aleatorio);
    else if (nivel === 'medio') { lance = lanceMedio(jogo, aleatorio, estat); estat.profundidade = 2; }
    else lance = lanceDificil(jogo, opcoes, estat);
    return {
      lance: lance ? chaveLance(lance) : null,
      nos: estat.nos,
      profundidade: estat.profundidade,
      ms: Date.now() - inicio,
    };
  }

  return {
    NIVEIS: NIVEIS,
    escolherLance: escolherLance,
    avaliarCompleto: avaliarCompleto,
    avaliarMaterial: avaliarMaterial,
  };
});
