/**
 * Pré-lance (premove) — Xadrez Alternativo v1.3.0
 * ------------------------------------------------------------------------
 * Funções puras (sem DOM), usadas pelo navegador e pelos testes em Node.
 *
 * Ideia: na vez do adversário o jogador "agenda" um lance. Como ainda não
 * sabemos o que o adversário vai jogar, os destinos oferecidos são
 * GEOMÉTRICOS: a peça anda como anda, ignorando quem está no caminho (igual
 * ao Lichess). Assim dá para agendar uma recaptura numa casa que hoje ainda
 * tem peça nossa, ou um lance por uma linha que o adversário vai abrir.
 *
 * Quando chega a nossa vez, `resolverPrelance` confere o lance agendado com a
 * lista de lances LEGAIS da nova posição. Se não estiver lá, o pré-lance é
 * cancelado em silêncio. Promoção vira dama automaticamente.
 *
 * No modo Impostor o "tipo" é a FUNÇÃO real da nossa peça (como ela anda de
 * verdade), não a aparência. O servidor continua validando tudo.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PreLance = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const coluna = (sq) => sq % 8;
  const fileira = (sq) => Math.floor(sq / 8);
  const dentro = (c, f) => c >= 0 && c < 8 && f >= 0 && f < 8;

  const DIAGONAIS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const RETAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const SALTOS_CAVALO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  /**
   * Casas para onde uma peça poderia ir num pré-lance (sem olhar bloqueios).
   * @param {string} tipo  'p','n','b','r','q','k' (função da peça)
   * @param {string} cor   'w' ou 'b'
   * @param {number} sq    casa de origem (0 = a1 … 63 = h8)
   * @param {object} [op]  { jaMoveu: bool } — sem isso, olhamos a casa inicial
   * @returns {number[]} casas de destino, sem repetição
   */
  function destinosGeometricos(tipo, cor, sq, op) {
    const c0 = coluna(sq), f0 = fileira(sq);
    const fora = new Set();
    const add = (c, f) => { if (dentro(c, f)) fora.add(f * 8 + c); };
    const raios = (dirs) => {
      for (const [dc, df] of dirs) {
        for (let c = c0 + dc, f = f0 + df; dentro(c, f); c += dc, f += df) add(c, f);
      }
    };
    const jaMoveu = !!(op && op.jaMoveu);
    switch (tipo) {
      case 'p': {
        const frente = cor === 'w' ? 1 : -1;
        const inicial = cor === 'w' ? 1 : 6;
        add(c0, f0 + frente);
        if (f0 === inicial && !jaMoveu) add(c0, f0 + 2 * frente);
        // Capturas (inclusive en passant): sempre na diagonal da frente.
        add(c0 - 1, f0 + frente);
        add(c0 + 1, f0 + frente);
        break;
      }
      case 'n':
        for (const [dc, df] of SALTOS_CAVALO) add(c0 + dc, f0 + df);
        break;
      case 'b': raios(DIAGONAIS); break;
      case 'r': raios(RETAS); break;
      case 'q': raios(DIAGONAIS); raios(RETAS); break;
      case 'k': {
        for (const [dc, df] of DIAGONAIS.concat(RETAS)) add(c0 + dc, f0 + df);
        // Roque: o rei na casa inicial (e1/e8) pode agendar g e c.
        const base = cor === 'w' ? 0 : 7;
        if (f0 === base && c0 === 4 && !jaMoveu) { add(6, base); add(2, base); }
        break;
      }
      default: break;
    }
    return Array.from(fora);
  }

  /**
   * Confere o pré-lance com os lances legais da nova posição.
   * @param {{from:number,to:number}} prelance
   * @param {Array<{to:number,promotion?:any}>} lancesLegais  lances da peça em `from`
   * @returns {{from:number,to:number,promotion?:string}|null}  null = cancelar
   */
  function resolverPrelance(prelance, lancesLegais) {
    if (!prelance || !Array.isArray(lancesLegais)) return null;
    const candidatos = lancesLegais.filter((l) => l && l.to === prelance.to);
    if (!candidatos.length) return null;
    const lance = { from: prelance.from, to: prelance.to };
    if (candidatos.some((l) => l.promotion)) lance.promotion = 'q'; // dama automática
    return lance;
  }

  return { destinosGeometricos: destinosGeometricos, resolverPrelance: resolverPrelance };
});
