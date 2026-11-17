# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/)
(`MAJOR.MINOR.PATCH`):

- **MAJOR** (x.0.0): alteração incompatível, que quebra o que já existia
  (por exemplo, uma API ou um protocolo de sala que clientes antigos não entendem).
- **MINOR** (1.x.0): funcionalidade nova, de forma compatível
  (por exemplo, um modo, um tema ou um estilo de peças a mais).
- **PATCH** (1.0.x): correção compatível de defeito, texto ou comportamento.

## [Não lançado]

## [1.2.0] - 2026-11-16

### Adicionado

- **Modo Impostor** (variante escolhida ao criar a sala, combinável com Livre,
  Rápido 10 min e Blitz 3 min). Depois das cores, cada jogador vê só as próprias
  peças e troca em segredo a *função* delas (como cada uma anda), mantendo as
  quantidades: 8 peões, 2 torres, 2 cavalos, 2 bispos, 1 dama e 1 rei. Toque em
  duas peças para trocar; há **Resetar** e **Pronto**, sem limite de tempo, e o
  oponente vê “Oponente montando…”. O relógio só começa quando os dois clicam
  em Pronto.
- Revelação no Impostor: a peça que faz um lance impossível para a sua aparência
  fica revelada (contorno roxo e selo com a função real, visíveis para os dois);
  o rei verdadeiro é revelado ao levar xeque. Peças capturadas continuam em
  segredo. Som próprio de revelação nos dois pacotes (Moderno e Clássico).
- Motor do Impostor (`impostor-engine.js`, no servidor e em `public/`), com
  roque só para o rei verdadeiro, promoção de qualquer peça com função de peão,
  xeque/mate/afogamento pelas funções reais e histórico em notação longa.
- Segurança: o servidor guarda as funções reais e envia a cada jogador um estado
  filtrado; as funções secretas do oponente nunca saem do servidor.
- Nova identidade: o site passa a se chamar **Xadrez Alternativo** (título,
  cabeçalhos, README e descrição do pacote) e ganha um **logo** original em SVG
  (`public/logo.svg`, cavalo com máscara de impostor), usado também como favicon
  e legível nos 3 temas.
- **Tela de abertura** com o logo, o nome e o botão **Jogar** (leva ao nome e
  depois ao menu), com animação de entrada suave que respeita
  `prefers-reduced-motion`. Links de convite pulam a abertura.
- **Versão no canto** inferior direito (ex.: `v1.2.0`), pequena e discreta, atrás
  do conteúdo e sem receber cliques. A fonte única é o `package.json`, exposto
  pelo servidor em `GET /versao`.
- Testes: `test-impostor.js` (unidade do motor Impostor) e
  `test-e2e-impostor.js` (dois clientes socket.io contra um servidor local,
  conferindo que nenhum segredo vaza). `npm test` roda perft + Impostor.

### Alterado

- Telas de escolha redesenhadas, com visual mais moderno e consistente nos 3
  temas e do celular (360 px, inclusive deitado) ao ultrawide: nome, menu
  principal, criar sala (variante Clássico × Impostor e tempo Livre/Rápido/Blitz
  como cartões com ícone e descrição curta), escolha de cores (cartões com o rei
  branco, o rei preto e o dado) e barra de montagem do Impostor. Alvos de toque
  com pelo menos 44 px.
- Variante (Clássico/Impostor) aparece no painel (“Modo: Blitz 3 min · Impostor”)
  e no subtítulo da partida. A revanche mantém a variante e volta para a montagem.
- Eventos com estado passaram a ser enviados jogador a jogador (necessário para
  o estado filtrado). No modo clássico o conteúdo é o mesmo de antes.

### Corrigido

- Celular deitado (ex.: 844×390): o tabuleiro agora cabe na altura da tela,
  com a faixa da sala e o painel numa coluna ao lado; telas de nome e de início
  ficam compactas, e a engrenagem não cobre mais a faixa da sala.
- Configurações: título e **Fechar** fixos e só o conteúdo rola (o botão
  Fechar não some mais, nem em Full HD).
- Engrenagem com 45 px e abaixo dos diálogos abertos; interruptor de som,
  controle de volume e “Copiar link” com área de toque de pelo menos 44 px.
- Celular e tablet em pé (360×640, 768×1024): o tabuleiro respeita a altura da
  tela para as duas barras de jogador (com o relógio) aparecerem inteiras.
- Telas largas (Full HD e ultrawide): tabuleiro e painel maiores.

## [1.1.0] - 2026-11-16

### Adicionado

- Tela inicial **Seu nome** (1 a 20 caracteres), persistida no navegador e
  editável depois em Configurações. No jogo online os dois nomes aparecem
  nos relógios, na sala de espera, no menu de cores e no resultado
  (por exemplo, “André venceu”). No jogo local dá para nomear Brancas e
  Pretas (o padrão é o nome salvo e “Jogador 2”). O servidor sanitiza o
  texto (sem injeção de HTML).

- Layout pensado para celular, em retrato (~360–430 px) e em paisagem:
  o tabuleiro ocupa a largura, os painéis empilham abaixo, os alvos de
  toque são maiores, os diálogos rolam e relógios/nomes ficam acima e
  abaixo do tabuleiro. O arraste de uma peça não rola a página.

### Alterado

- O ligar/desligar do som ficou só em **⚙️ Configurações**, com o interruptor
  “Som: ligado/desligado” ao lado do volume. O botão 🔊/🔇 saiu do cabeçalho.
  A preferência continua salva no navegador e o interruptor é usável pelo teclado.

### Corrigido

- O ícone da peça no cartão “Vez de” deixava transbordar o distintivo (o rei
  encostava no rótulo e no nome da cor). Agora o ícone cabe no distintivo nos
  três estilos (Unicode, Staunton e Pixelado), nas duas cores e também em telas
  estreitas. O mesmo ajuste vale para o painel de capturas, o diálogo de
  promoção e a amostra nas configurações.

- No estilo Unicode, as peças brancas e pretas usavam glifos diferentes
  (preenchido vs. contorno) e acabavam parecendo invertidas. Agora os dois
  lados usam o mesmo glifo preenchido, colorido por CSS: brancas claras com
  contorno escuro, pretas escuras com contorno claro, no tabuleiro, nas
  capturas, no cartão da vez, na promoção e no histórico.

## [1.0.0] - 2026-11-16

### Adicionado

- Jogo local (hot-seat) com regras completas: lances legais, roque, en passant,
  promoção, xeque, xeque-mate, afogamento, material insuficiente e regra dos 50 lances.
- Animações de movimento e de captura (também no roque e no desfazer local),
  respeitando `prefers-reduced-motion`.
- Três modos de jogo, todos sem acréscimo: Livre (sem tempo), Rápido 10 min e Blitz 3 min.
- Relógio com aviso de tempo baixo, flag e empate quando o adversário não tem material para mate.
- Sons gerados no próprio navegador (Web Audio, sem arquivos externos), com os pacotes
  Moderno e Clássico (toques de madeira), volume, mudo e persistência.
- Três temas visuais: Madeira, Clássico (verde) e Oceano.
- Três estilos de peças: Unicode, Staunton (SVG) e Pixelado (grade 16×16 em estilo 8-bit).
- Tela de configurações (som, tema, estilo das peças, dicas de lances e coordenadas),
  persistida no navegador; o estilo antigo “Plano” é migrado para Pixelado.
- Modo online com salas em memória, código curto e link de convite (`?sala=CODIGO`).
- Menu “Quem joga de brancas?” depois que o segundo jogador entra
  (anfitrião de brancas, de pretas ou aleatório, com revelação no sorteio).
  Na revanche o menu reaparece, com a sugestão de inverter as cores.
  A partida e os relógios só começam após essa escolha.
- Desistência, proposta de empate (aceitar/recusar) e revanche nas partidas online.
- Reconexão com o mesmo tabuleiro e relógio (inclusive durante a escolha de cores);
  indicador de oponente desconectado; limpeza de salas abandonadas.
- Servidor autoritativo (Node.js + Express + Socket.IO): valida lances, conduz os
  relógios e decide o resultado; no online só se movimentam as peças do próprio lado.
- Publicação no Render (plano gratuito), com `npm start` e porta definida pelo ambiente.

[Não lançado]: https://github.com/dede213453/Xadrez_Online/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/dede213453/Xadrez_Online/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dede213453/Xadrez_Online/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dede213453/Xadrez_Online/releases/tag/v1.0.0
