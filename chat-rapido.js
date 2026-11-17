/**
 * Chat rápido das partidas online.
 * --------------------------------
 * Sem texto livre: só frases prontas e emojis, identificados por um ID curto.
 * O cliente envia apenas o ID; o servidor confere se ele existe nesta lista e
 * reenvia o ID (o texto é montado de novo em cada navegador). Assim não há
 * como mandar ofensa, link ou HTML pelo chat, e nem é preciso moderação.
 *
 * Funciona no navegador (tag <script>, vira window.ChatRapido) e no Node.js
 * (servidor e testes). Uma cópia idêntica fica em public/chat-rapido.js.
 */
(function (raiz, fabrica) {
  'use strict';
  const api = fabrica();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ChatRapido = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Mensagens permitidas. A ordem é a ordem dos botões na interface. */
  const MENSAGENS = [
    { id: 'oi', tipo: 'frase', texto: 'Oi! Boa sorte!' },
    { id: 'boa', tipo: 'frase', texto: 'Boa jogada!' },
    { id: 'oops', tipo: 'frase', texto: 'Oops' },
    { id: 'pensa', tipo: 'frase', texto: 'Pensa rápido!' },
    { id: 'calma', tipo: 'frase', texto: 'Tô pensando…' },
    { id: 'bomjogo', tipo: 'frase', texto: 'Bom jogo!' },
    { id: 'obrigado', tipo: 'frase', texto: 'Obrigado!' },
    { id: 'revanche', tipo: 'frase', texto: 'Revanche?' },
    { id: 'joinha', tipo: 'emoji', texto: '👍' },
    { id: 'risada', tipo: 'emoji', texto: '😂' },
    { id: 'surpresa', tipo: 'emoji', texto: '😮' },
    { id: 'triste', tipo: 'emoji', texto: '😢' },
    { id: 'fogo', tipo: 'emoji', texto: '🔥' },
    { id: 'mascara', tipo: 'emoji', texto: '🎭' },
  ];

  const POR_ID = new Map(MENSAGENS.map((m) => [m.id, m]));

  /** Devolve a mensagem do ID, ou null se o ID não existir / for de tipo estranho. */
  function mensagemPorId(id) {
    if (typeof id !== 'string' || id.length > 20) return null;
    return POR_ID.get(id) || null;
  }

  /**
   * Limite de envio por remetente (chave = socket ou jogador):
   *  - no máximo `max` mensagens a cada `janelaMs`;
   *  - e um intervalo mínimo de `intervaloMs` entre duas mensagens.
   * Devolve uma função permitir(chave, agora?) → true/false.
   */
  function criarLimitador(opcoes) {
    const max = (opcoes && opcoes.max) || 4;
    const janelaMs = (opcoes && opcoes.janelaMs) || 10000;
    const intervaloMs = (opcoes && opcoes.intervaloMs) || 700;
    const historico = new Map(); // chave → [instantes]
    function permitir(chave, agora) {
      const t = agora == null ? Date.now() : agora;
      const lista = (historico.get(chave) || []).filter((x) => t - x < janelaMs);
      const ultimo = lista.length ? lista[lista.length - 1] : -Infinity;
      if (lista.length >= max || t - ultimo < intervaloMs) {
        historico.set(chave, lista);
        return false;
      }
      lista.push(t);
      historico.set(chave, lista);
      return true;
    }
    permitir.esquecer = (chave) => historico.delete(chave);
    return permitir;
  }

  return {
    MENSAGENS: MENSAGENS,
    mensagemPorId: mensagemPorId,
    criarLimitador: criarLimitador,
  };
});
