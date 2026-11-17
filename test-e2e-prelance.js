/**
 * Teste de ponta a ponta (navegador) do pré-lance e das marcações — v1.3.0
 * ------------------------------------------------------------------------
 * Sobe o servidor numa porta livre e abre páginas reais no Chrome (sem
 * janela) com o puppeteer-core:
 *  1. Online clássico (Blitz): as pretas agendam e7-e5 na vez das brancas e
 *     ele sai sozinho logo depois de e4 (o relógio das pretas quase não anda).
 *  2. Pré-lance que fica ilegal (arrastado): cancelado em silêncio.
 *  3. Botão direito e clique em casa vazia cancelam; a opção desligada impede.
 *  4. Impostor: pré-lance com a função real (peão-dama de a2 vai até a6) é
 *     aceito pelo servidor e revela a peça para o adversário.
 *  5. Contra o bot: Cf3 agendado enquanto o bot pensa sai depois do lance dele.
 *  6. Marcações: seta com botão direito, círculo, cores com Shift/Ctrl,
 *     repetir apaga, clique esquerdo limpa, menu de contexto bloqueado,
 *     tabuleiro girado e toque longo no celular.
 *
 * Precisa do puppeteer-core e de um Chrome/Chromium. Procura em
 * PUPPETEER_CORE (ou no projeto, ou em /tmp/sockt) e em CHROME_PATH (ou
 * /usr/bin/google-chrome, /usr/bin/chromium). Sem eles, o teste é pulado.
 *
 * Execute: node test-e2e-prelance.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const assert = require('assert');
const { spawn } = require('child_process');

function carregarPuppeteer() {
  for (const t of [process.env.PUPPETEER_CORE, 'puppeteer-core', '/tmp/sockt/node_modules/puppeteer-core']) {
    if (!t) continue;
    try { return require(t); } catch (e) { /* próximo */ }
  }
  return null;
}
function acharChrome() {
  for (const c of [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}
const puppeteer = carregarPuppeteer();
const chrome = acharChrome();
if (!puppeteer || !chrome) {
  console.log('Teste do pré-lance no navegador PULADO (falta puppeteer-core ou Chrome).');
  process.exit(0);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const casa = (t) => (t.charCodeAt(1) - 49) * 8 + (t.charCodeAt(0) - 97);
const seletor = (t) => '.casa[data-square="' + casa(t) + '"]';

function portaLivre() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

let passos = 0;
function ok(msg) { passos++; console.log('  OK   ' + msg); }

/** Espera uma condição (função avaliada na página) ficar verdadeira. */
async function aguardar(p, fn, arg, ms) {
  await p.waitForFunction(fn, { timeout: ms || 6000, polling: 50 }, arg);
}

(async () => {
  const porta = await portaLivre();
  const url = 'http://127.0.0.1:' + porta;
  const servidor = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(porta) }), stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => servidor.stdout.on('data', (d) => { if (String(d).includes('http')) r(); }));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const errosJs = [];
  let codigoSaida = 0;

  async function abrir(nome, vp) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errosJs.push(nome + ': ' + e.message));
    await p.setViewport(vp || { width: 1280, height: 800 });
    await p.goto(url, { waitUntil: 'networkidle0' });
    await p.click('#btn-splash-jogar');
    await p.waitForSelector('#input-nome', { visible: true });
    await p.type('#input-nome', nome);
    await p.click('#form-nome button[type=submit]');
    await p.waitForSelector('#tela-inicio:not([hidden])');
    return p;
  }
  const clicar = async (p, de, para) => { await p.click(seletor(de)); await dormir(80); await p.click(seletor(para)); };
  const historico = (p) => p.evaluate(() => (XadrezApp.online.ativo ? XadrezApp.online.estado.historico : XadrezApp.jogo.historicoSan()).slice());
  const centroDe = (p, t) => p.$eval(seletor(t), (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  async function criarSala(host, conv, variante, modo) {
    await host.click('#btn-criar-sala');
    await host.click('#form-criar input[value="' + variante + '"]');
    await host.click('#form-criar input[value="' + modo + '"]');
    await host.click('#form-criar button[type=submit]');
    await aguardar(host, () => !!XadrezApp.online.codigo);
    const codigo = await host.evaluate(() => XadrezApp.online.codigo);
    await conv.type('#input-codigo', codigo);
    await conv.click('#form-entrar button[type=submit]');
    await host.waitForSelector('#overlay-cores [data-escolha="w"]', { visible: true });
    await host.click('#overlay-cores [data-escolha="w"]');
    await aguardar(conv, () => XadrezApp.online.cor === 'b');
    return codigo;
  }

  try {
    // ---------------- 1-3: online clássico ----------------
    const host = await abrir('Ana');
    const conv = await abrir('Beto');
    await criarSala(host, conv, 'classico', '3+0');
    await aguardar(host, () => XadrezApp.online.estado.statusSala === 'em_andamento');
    await dormir(1200); // deixa a revelação de cor sumir

    await clicar(conv, 'e7', 'e5');
    const pre = await conv.evaluate(() => XadrezApp.prelance);
    assert.deepStrictEqual(pre, { from: casa('e7'), to: casa('e5') });
    assert.ok(await conv.$eval(seletor('e7'), (el) => el.classList.contains('prelance-origem')));
    assert.ok(await conv.$eval(seletor('e5'), (el) => el.classList.contains('prelance-destino')));
    assert.ok(await conv.$eval('#aviso-prelance', (el) => !el.hidden && el.textContent.includes('e7')));
    await clicar(host, 'e2', 'e4');
    await aguardar(conv, () => XadrezApp.online.estado.historico.length === 2);
    const h1 = await historico(conv);
    assert.deepStrictEqual(h1, ['e4', 'e5']);
    assert.strictEqual(await conv.evaluate(() => XadrezApp.prelance), null);
    const relPretas = await conv.evaluate(() => XadrezApp.online.estado.relogio.b);
    assert.ok(relPretas > 180000 - 1500, 'relógio das pretas quase intacto: ' + relPretas);
    ok('pré-lance legal (e7-e5) saiu sozinho logo depois de e4 (pretas gastaram ' + (180000 - relPretas) + ' ms)');
    await dormir(600); // termina a animação do lance

    // Pré-lance arrastado que fica ilegal: Dd8-d6 (o peão de d7 continua no caminho).
    const a = await centroDe(conv, 'd8'), b = await centroDe(conv, 'd6');
    await conv.mouse.move(a.x, a.y); await conv.mouse.down();
    await conv.mouse.move(a.x + 10, a.y + 10, { steps: 3 }); await conv.mouse.move(b.x, b.y, { steps: 6 });
    await conv.mouse.up();
    assert.deepStrictEqual(await conv.evaluate(() => XadrezApp.prelance), { from: casa('d8'), to: casa('d6') });
    await clicar(host, 'g1', 'f3');
    await aguardar(conv, () => XadrezApp.online.estado.historico.length === 3);
    await dormir(700);
    assert.strictEqual((await historico(conv)).length, 3, 'nada foi jogado pelas pretas');
    assert.strictEqual(await conv.evaluate(() => XadrezApp.prelance), null);
    assert.ok(await conv.$eval('#toast', (el) => el.hidden || !/ilegal/i.test(el.textContent)), 'sem aviso de lance ilegal');
    ok('pré-lance arrastado que ficou ilegal (Dd6) foi cancelado em silêncio');

    // Vez das pretas: jogam Cc6. Na vez das brancas, testam os cancelamentos.
    await clicar(conv, 'b8', 'c6');
    await aguardar(conv, () => XadrezApp.online.estado.historico.length === 4);
    await dormir(600);
    await clicar(conv, 'g8', 'f6');
    assert.ok(await conv.evaluate(() => !!XadrezApp.prelance));
    const c = await centroDe(conv, 'h4');
    await conv.mouse.click(c.x, c.y, { button: 'right' });
    assert.strictEqual(await conv.evaluate(() => XadrezApp.prelance), null, 'botão direito cancela');
    await clicar(conv, 'g8', 'f6');
    await conv.click(seletor('a4'));
    assert.strictEqual(await conv.evaluate(() => XadrezApp.prelance), null, 'clique em casa vazia cancela');
    await conv.evaluate(() => XadrezApp.mostrarAba('opcoes'));
    await conv.click('#btn-prelance');
    assert.strictEqual(await conv.evaluate(() => XadrezApp.config.prelance), false);
    await clicar(conv, 'g8', 'f6');
    assert.strictEqual(await conv.evaluate(() => XadrezApp.prelance), null, 'opção desligada');
    await conv.click('#btn-prelance');
    assert.strictEqual(await conv.evaluate(() => XadrezApp.config.prelance), true);
    await conv.evaluate(() => XadrezApp.mostrarAba('partida'));
    ok('botão direito e clique em casa vazia cancelam; com a opção desligada não há pré-lance');

    // Só um por vez: o segundo substitui o primeiro.
    await clicar(conv, 'g8', 'f6');
    await clicar(conv, 'f8', 'c5');
    assert.deepStrictEqual(await conv.evaluate(() => XadrezApp.prelance), { from: casa('f8'), to: casa('c5') });
    await clicar(host, 'f1', 'c4');
    await aguardar(conv, () => XadrezApp.online.estado.historico.length === 6);
    assert.deepStrictEqual((await historico(conv)).slice(-1), ['Bc5']);
    ok('só um pré-lance por vez (o segundo substitui o primeiro) e ele sai (Bc5)');

    // Marcações na vez do adversário somem quando o lance dele acontece.
    await dormir(600);
    const s1 = await centroDe(conv, 'd7'), s2 = await centroDe(conv, 'd5');
    await conv.mouse.move(s1.x, s1.y); await conv.mouse.down({ button: 'right' });
    await conv.mouse.move(s2.x, s2.y, { steps: 5 }); await conv.mouse.up({ button: 'right' });
    assert.strictEqual(await conv.evaluate(() => XadrezApp.marcas.setas.size), 1, 'seta na vez do adversário');
    await clicar(host, 'b1', 'c3');
    await aguardar(conv, () => XadrezApp.online.estado.historico.length === 7);
    await dormir(500);
    assert.strictEqual(await conv.evaluate(() => XadrezApp.marcas.setas.size), 0, 'o lance apagou a seta');
    assert.strictEqual(await host.evaluate(() => XadrezApp.marcas.setas.size), 0, 'o adversário nunca viu a seta');
    ok('seta desenhada na vez do adversário (só local) e apagada quando o lance dele aconteceu');

    // ---------------- 4: Impostor ----------------
    const h2 = await abrir('Caio');
    const c2 = await abrir('Duda');
    await criarSala(h2, c2, 'impostor', 'livre');
    await aguardar(h2, () => XadrezApp.online.estado.statusSala === 'montando');
    await dormir(1200);
    // Troca as funções de a2 (peão) e d1 (dama): a2 passa a andar como dama.
    await h2.click(seletor('d1')); await dormir(150); await h2.click(seletor('a2'));
    await aguardar(h2, () => XadrezApp.online.estado.impostor.tabuleiro[8].f === 'q');
    await h2.click('#btn-montagem-pronto'); await c2.click('#btn-montagem-pronto');
    await aguardar(h2, () => XadrezApp.online.estado.statusSala === 'em_andamento');
    await clicar(h2, 'e2', 'e4');
    await aguardar(h2, () => XadrezApp.online.estado.historico.length === 1);
    await dormir(600);
    await clicar(h2, 'a2', 'a6'); // pré-lance com a geometria da DAMA
    assert.deepStrictEqual(await h2.evaluate(() => XadrezApp.prelance), { from: casa('a2'), to: casa('a6') });
    await clicar(c2, 'h7', 'h6');
    await aguardar(c2, () => XadrezApp.online.estado.historico.length === 3);
    const vistoPeloAdversario = await c2.evaluate((sq) => XadrezApp.online.estado.impostor.tabuleiro[sq], casa('a6'));
    assert.ok(vistoPeloAdversario && vistoPeloAdversario.r && vistoPeloAdversario.f === 'q', 'revelada como dama');
    ok('Impostor: pré-lance a2-a6 com a função real (dama) foi aceito e revelou a peça');

    // ---------------- 5: contra o bot ----------------
    const pb = await abrir('Eva');
    await pb.click('[data-cor-bot="w"]');
    await pb.click('#tela-inicio [data-nivel="dificil"]');
    await pb.waitForSelector('#tela-jogo:not([hidden])');
    await clicar(pb, 'e2', 'e4');
    await aguardar(pb, () => XadrezApp.bot.pensando);
    await clicar(pb, 'g1', 'f3');
    assert.ok(await pb.evaluate(() => !!XadrezApp.prelance), 'agendado enquanto o bot pensa');
    await aguardar(pb, () => XadrezApp.jogo.historicoSan().length >= 3, null, 8000);
    assert.strictEqual((await historico(pb))[2], 'Cf3');
    ok('contra o bot: Cf3 agendado enquanto ele pensava saiu logo após o lance dele');

    // ---------------- 6: marcações ----------------
    const m = await abrir('Fábio');
    await m.click('[data-modo-inicio="livre"]');
    await m.waitForSelector('#tela-jogo:not([hidden])');
    const e2 = await centroDe(m, 'e2'), e4 = await centroDe(m, 'e4'), d5 = await centroDe(m, 'd5');
    await m.mouse.move(e2.x, e2.y); await m.mouse.down({ button: 'right' });
    await m.mouse.move(e4.x, e4.y, { steps: 6 }); await m.mouse.up({ button: 'right' });
    await m.keyboard.down('Shift'); await m.mouse.click(d5.x, d5.y, { button: 'right' }); await m.keyboard.up('Shift');
    let info = await m.evaluate(() => ({
      setas: [...document.querySelectorAll('#camada-marcas .marca-seta')].map((g) => g.dataset.cor),
      circulos: [...document.querySelectorAll('#camada-marcas .marca-circulo')].map((g) => g.dataset.cor),
      botao: !document.getElementById('btn-limpar-marcas-rapido').hidden,
    }));
    assert.deepStrictEqual(info, { setas: ['verde'], circulos: ['vermelho'], botao: true });
    const bloqueado = await m.$eval(seletor('d5'), (el) => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    assert.ok(bloqueado, 'menu de contexto bloqueado no tabuleiro');
    // Ctrl = azul (troca a cor da mesma seta), repetir apaga.
    await m.keyboard.down('Control');
    await m.mouse.move(e2.x, e2.y); await m.mouse.down({ button: 'right' });
    await m.mouse.move(e4.x, e4.y, { steps: 4 }); await m.mouse.up({ button: 'right' });
    await m.keyboard.up('Control');
    assert.deepStrictEqual(await m.evaluate(() => [...XadrezApp.marcas.setas.values()]), ['azul']);
    await m.keyboard.down('Shift');
    await m.mouse.click(d5.x, d5.y, { button: 'right' });
    await m.keyboard.up('Shift');
    assert.strictEqual(await m.evaluate(() => XadrezApp.marcas.circulos.size), 0, 'repetir o círculo apaga');
    // Girar o tabuleiro: a seta é redesenhada no lugar certo (e2 fica em cima).
    const yAntes = await m.$eval('#camada-marcas polyline', (el) => el.getAttribute('points'));
    await m.evaluate(() => XadrezApp.mostrarAba('opcoes'));
    await m.click('#btn-girar');
    const yDepois = await m.$eval('#camada-marcas polyline', (el) => el.getAttribute('points'));
    assert.notStrictEqual(yAntes, yDepois, 'seta acompanha o giro');
    // Clique esquerdo comum limpa tudo.
    await m.click(seletor('h5'));
    assert.strictEqual(await m.evaluate(() => XadrezApp.marcas.setas.size + XadrezApp.marcas.circulos.size), 0);
    // Seta do cavalo em L e lance apaga as marcações.
    await m.click('#btn-girar');
    const g1 = await centroDe(m, 'g1'), f3 = await centroDe(m, 'f3');
    await m.mouse.move(g1.x, g1.y); await m.mouse.down({ button: 'right' });
    await m.mouse.move(f3.x, f3.y, { steps: 4 }); await m.mouse.up({ button: 'right' });
    const pontosL = await m.$eval('#camada-marcas polyline', (el) => el.getAttribute('points').split(' ').length);
    assert.strictEqual(pontosL, 3, 'seta do cavalo em L');
    ok('marcações: seta (botão direito), círculo, cores Shift/Ctrl, repetir apaga, giro, L do cavalo e clique esquerdo limpa');

    // Toque longo no celular marca um círculo; toque curto limpa.
    const cel = await abrir('Gil', { width: 390, height: 844, isMobile: true, hasTouch: true });
    await cel.click('[data-modo-inicio="livre"]');
    await cel.waitForSelector('#tela-jogo:not([hidden])');
    const d4 = await centroDe(cel, 'd4');
    await cel.touchscreen.touchStart(d4.x, d4.y); await dormir(700); await cel.touchscreen.touchEnd();
    assert.strictEqual(await cel.evaluate(() => XadrezApp.marcas.circulos.size), 1, 'toque longo marca');
    await cel.touchscreen.tap(d4.x, d4.y);
    await dormir(100);
    assert.strictEqual(await cel.evaluate(() => XadrezApp.marcas.circulos.size), 0, 'toque curto limpa');
    ok('celular: toque longo marca um círculo e um toque curto limpa');

    assert.deepStrictEqual(errosJs, [], 'sem erros de JavaScript nas páginas');
    console.log('\nTeste do pré-lance e das marcações no navegador: tudo certo (' + passos + ' passos).');
  } catch (e) {
    codigoSaida = 1;
    console.error('FALHOU:', e && e.stack || e);
    if (errosJs.length) console.error('Erros de JS:', errosJs);
  } finally {
    await browser.close();
    servidor.kill();
    process.exit(codigoSaida);
  }
})();
