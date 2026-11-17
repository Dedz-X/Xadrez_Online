/**
 * Efeitos sonoros via Web Audio API (sem arquivos externos, funciona em file://).
 *
 * Pacotes:
 *  - moderno: tons curtos e suaves (osciladores)
 *  - classico: batidas de madeira (ruído filtrado + ressonância grave)
 *
 * O AudioContext só é criado/resumido no primeiro gesto do usuário.
 * O volume e o mudo vêm das configurações (callback obterConfig).
 */
'use strict';

(function (raiz) {
  let audioCtx = null;
  let master = null;
  let obterConfig = function () { return { som: true, volume: 0.7, pacoteSom: 'moderno' }; };

  function configurarSons(fn) {
    obterConfig = fn || obterConfig;
  }

  function garantirAudio() {
    try {
      const AC = raiz.AudioContext || raiz.webkitAudioContext;
      if (!AC) return null;
      if (!audioCtx) {
        audioCtx = new AC();
        master = audioCtx.createGain();
        master.gain.value = 0.7;
        master.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') {
        const p = audioCtx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
      const cfg = obterConfig();
      if (master) {
        const vol = cfg.som === false ? 0 : Math.max(0, Math.min(1, Number(cfg.volume)));
        master.gain.value = vol;
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function destino() {
    return master || audioCtx.destination;
  }

  /** Tom sintético do pacote moderno. */
  function tom(freq, dur, tipo, vol, atraso, freqFim) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (atraso || 0);
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = tipo || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (freqFim != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqFim), t0 + dur);
    }
    const v = vol == null ? 0.06 : vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(destino());
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /**
   * Batida de madeira: ataque de ruído (o “toc” do contato) + corpo grave
   * ressonante que some rápido, com pequena variação de afinação.
   */
  function baterMadeira(opcoes) {
    if (!audioCtx) return;
    opcoes = opcoes || {};
    const t0 = audioCtx.currentTime + (opcoes.atraso || 0);
    const vary = 1 + (Math.random() * 0.12 - 0.06);
    const vol = opcoes.vol == null ? 0.7 : opcoes.vol;

    // Ruído curto com envelope exponencial.
    const durBuf = 0.05;
    const n = Math.floor(audioCtx.sampleRate * durBuf);
    const buffer = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.09));
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;

    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (opcoes.freqRuido || 1150) * vary;
    bp.Q.value = opcoes.q || 5.5;

    const gN = audioCtx.createGain();
    const pico = (opcoes.picoRuido || 0.45) * vol;
    gN.gain.setValueAtTime(0.0001, t0);
    gN.gain.exponentialRampToValueAtTime(pico, t0 + 0.0025);
    gN.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.032);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(gN);
    gN.connect(destino());
    src.start(t0);
    src.stop(t0 + durBuf);

    // Corpo da madeira (senóide grave que cai).
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    const fCorpo = (opcoes.freqCorpo || 175) * vary;
    osc.frequency.setValueAtTime(fCorpo, t0);
    osc.frequency.exponentialRampToValueAtTime(fCorpo * 0.65, t0 + 0.13);
    const gC = audioCtx.createGain();
    gC.gain.setValueAtTime(0.0001, t0);
    gC.gain.exponentialRampToValueAtTime((opcoes.picoCorpo || 0.22) * vol, t0 + 0.006);
    gC.gain.exponentialRampToValueAtTime(0.0001, t0 + (opcoes.durCorpo || 0.14));
    osc.connect(gC);
    gC.connect(destino());
    osc.start(t0);
    osc.stop(t0 + 0.18);

    // Parcial médio (brilho da tábua).
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime((opcoes.freqParcial || 430) * vary, t0);
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.exponentialRampToValueAtTime((opcoes.picoParcial || 0.07) * vol, t0 + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    osc2.connect(g2);
    g2.connect(destino());
    osc2.start(t0);
    osc2.stop(t0 + 0.07);
  }

  const moderno = {
    mover: function () { tom(430, 0.07, 'triangle', 0.055); },
    capturar: function () { tom(240, 0.05, 'square', 0.035); tom(150, 0.11, 'triangle', 0.05, 0.03); },
    roque: function () { tom(330, 0.07, 'triangle', 0.05); tom(440, 0.09, 'triangle', 0.045, 0.07); },
    xeque: function () { tom(820, 0.08, 'sine', 0.055); tom(620, 0.11, 'sine', 0.045, 0.08); },
    promocao: function () { tom(523, 0.09, 'sine', 0.05); tom(659, 0.09, 'sine', 0.045, 0.08); tom(784, 0.14, 'sine', 0.04, 0.16); },
    ilegal: function () { tom(170, 0.11, 'triangle', 0.04, 0, 120); },
    inicio: function () { tom(392, 0.09, 'sine', 0.05); tom(523, 0.13, 'sine', 0.045, 0.1); },
    fim: function () { tom(523, 0.14, 'sine', 0.05); tom(392, 0.14, 'sine', 0.04, 0.12); tom(262, 0.22, 'sine', 0.04, 0.26); },
    tempoBaixo: function () { tom(1180, 0.045, 'sine', 0.04); },
    clique: function () { tom(720, 0.035, 'triangle', 0.03); },
    menu: function () { tom(480, 0.06, 'sine', 0.04); tom(640, 0.07, 'sine', 0.03, 0.05); },
    tema: function () { tom(500, 0.055, 'sine', 0.035); tom(740, 0.07, 'sine', 0.03, 0.05); },
    selecionar: function () { tom(640, 0.045, 'triangle', 0.035); },
    // Modo Impostor: peça revelada (um "desmascarar" descendente e misterioso).
    revelar: function () { tom(660, 0.08, 'sine', 0.045); tom(494, 0.08, 'sine', 0.045, 0.08); tom(370, 0.16, 'triangle', 0.04, 0.16); },
  };

  const classico = {
    mover: function () {
      baterMadeira({ freqRuido: 1280, freqCorpo: 190, freqParcial: 520, vol: 0.7, picoRuido: 0.4, picoCorpo: 0.18 });
    },
    capturar: function () {
      // Dois toques: o da peça capturada e o da peça que chega, mais graves e fortes.
      baterMadeira({ freqRuido: 900, freqCorpo: 130, freqParcial: 340, vol: 0.85, picoRuido: 0.5, picoCorpo: 0.28, durCorpo: 0.16 });
      baterMadeira({ atraso: 0.07, freqRuido: 1100, freqCorpo: 160, freqParcial: 400, vol: 0.75, picoRuido: 0.42, picoCorpo: 0.22 });
    },
    roque: function () {
      baterMadeira({ freqRuido: 1200, freqCorpo: 180, vol: 0.65 });
      baterMadeira({ atraso: 0.14, freqRuido: 1050, freqCorpo: 155, vol: 0.7, picoCorpo: 0.2 });
    },
    xeque: function () {
      baterMadeira({ freqRuido: 1400, freqCorpo: 200, vol: 0.65 });
      // Alerta curto, ainda “de tabuleiro”, não um bip eletrônico.
      tom(700, 0.09, 'triangle', 0.03, 0.05);
    },
    promocao: function () {
      baterMadeira({ freqRuido: 1250, freqCorpo: 180, vol: 0.7 });
      tom(523, 0.1, 'sine', 0.03, 0.08);
      tom(784, 0.14, 'sine', 0.025, 0.16);
    },
    ilegal: function () {
      baterMadeira({ freqRuido: 500, freqCorpo: 90, freqParcial: 200, vol: 0.55, picoRuido: 0.25, picoCorpo: 0.2, q: 2.5, durCorpo: 0.18 });
    },
    inicio: function () {
      baterMadeira({ freqRuido: 1100, freqCorpo: 200, vol: 0.55 });
      tom(392, 0.1, 'sine', 0.03, 0.08);
    },
    fim: function () {
      baterMadeira({ freqRuido: 900, freqCorpo: 150, vol: 0.6 });
      tom(330, 0.2, 'sine', 0.03, 0.1);
      tom(220, 0.28, 'sine', 0.025, 0.22);
    },
    tempoBaixo: function () {
      baterMadeira({ freqRuido: 1600, freqCorpo: 280, vol: 0.4, picoCorpo: 0.1, durCorpo: 0.06, picoRuido: 0.28 });
    },
    clique: function () {
      baterMadeira({ freqRuido: 1800, freqCorpo: 320, vol: 0.28, picoRuido: 0.22, picoCorpo: 0.06, durCorpo: 0.05 });
    },
    menu: function () {
      baterMadeira({ freqRuido: 1300, freqCorpo: 220, vol: 0.4 });
    },
    tema: function () {
      baterMadeira({ freqRuido: 1400, freqCorpo: 240, vol: 0.35 });
    },
    selecionar: function () {
      baterMadeira({ freqRuido: 1500, freqCorpo: 260, vol: 0.32, picoRuido: 0.25, picoCorpo: 0.08, durCorpo: 0.07 });
    },
    // Modo Impostor: peça revelada (duas batidas de madeira, a segunda mais grave).
    revelar: function () {
      baterMadeira({ freqRuido: 1100, freqCorpo: 260, vol: 0.5 });
      setTimeout(function () { baterMadeira({ freqRuido: 800, freqCorpo: 150, vol: 0.6 }); }, 140);
    },
  };

  const PACOTES = { moderno: moderno, classico: classico };

  function som(nome) {
    try {
      const cfg = obterConfig();
      if (cfg.som === false) return;
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        const p = audioCtx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
      if (master) {
        master.gain.value = Math.max(0, Math.min(1, Number(cfg.volume)));
      }
      const pacote = PACOTES[cfg.pacoteSom] || PACOTES.moderno;
      const fn = pacote[nome] || PACOTES.moderno[nome];
      if (fn) fn();
    } catch (e) { /* áudio nunca deve quebrar o jogo */ }
  }

  function tiposSom() {
    return Object.keys(moderno);
  }

  raiz.SonsXadrez = {
    tocar: som,
    garantirAudio: garantirAudio,
    configurar: configurarSons,
    tipos: tiposSom(),
    pacotes: Object.keys(PACOTES),
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
