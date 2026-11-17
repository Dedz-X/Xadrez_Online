# Xadrez Alternativo

![Logo](public/logo.svg)

Jogo de xadrez para dois jogadores, com o modo alternativo **Impostor**: **partida local** no mesmo computador ou **partida online** em salas com código. O servidor (Node.js + Express + Socket.IO) é a autoridade das regras e dos relógios. O cliente roda no navegador, sem etapa de compilação.

Modos: **Livre (sem tempo)**, **Rápido 10 min** e **Blitz 3 min** (sem acréscimo).
Variantes online: **Clássico** e **Impostor** (funções secretas — veja abaixo).

## Requisitos

- Node.js 18 ou superior (a versão LTS atual serve)
- npm (vem junto com o Node)
- Um navegador moderno (Chrome, Edge, Firefox)

No Windows, confira a instalação no Prompt de Comando ou no PowerShell:

```bat
node -v
npm -v
```

## Como rodar na sua máquina (Windows)

1. Abra a pasta do projeto (onde está este `README.md` e o arquivo `package.json`).
2. Instale as dependências (só precisa fazer uma vez, ou depois de puxar atualizações):

```bat
npm install
```

3. Inicie o servidor:

```bat
npm start
```

4. No navegador, acesse:

```
http://localhost:3000
```

Para jogar online com outra pessoa na mesma rede, use o IP da sua máquina no lugar de `localhost` (por exemplo `http://192.168.0.10:3000`). Para jogar pela internet, faça o deploy (veja abaixo).

Para encerrar o servidor, pressione `Ctrl+C` na janela em que ele está rodando.

## Como jogar

- **Abertura:** a primeira tela mostra o logo, o nome e o botão **Jogar**. Na primeira vez ele leva à tela do nome; depois, direto ao menu. Quem abre um link de convite (`?sala=CODIGO`) pula a abertura.

- **Jogar local:** os dois usam o mesmo computador (hot-seat). As brancas começam. Desfazer, girar o tabuleiro, temas e animações funcionam como na versão offline.
- **Jogar online — Criar sala:** escolha o modo de tempo e a variante (Clássico ou Impostor). Você recebe um código curto (como `K7X2Q`) e um link de convite (`?sala=CODIGO`) para copiar.
- **Jogar online — Entrar com código:** o convidado entra com o código. Em seguida o anfitrião vê o menu **Quem joga de brancas?** (Eu de brancas, Eu de pretas ou Aleatório). O convidado espera essa escolha. A partida e os relógios só começam depois. No Aleatório, cada um vê uma revelação curta (“Você joga de Brancas/Pretas”).
- Na partida online o servidor valida cada lance. Há **Desistir**, **Propor empate** e **Revanche**. Na revanche o menu de cores aparece de novo (com a sugestão de inverter). O desfazer fica desativado online.
- Se a conexão cair, recarregue a página: o jogo retoma com o mesmo tabuleiro e relógio (a identidade fica salva no navegador). Salas abandonadas são apagadas depois de alguns minutos.

## Modo Impostor

Xadrez com informação escondida. Cada peça tem uma **aparência** (o que o
oponente vê, dada pela casa onde ela começou) e uma **função** (como ela anda
de verdade).

1. **Montagem.** Depois das cores, cada jogador vê só as próprias peças e troca
   as funções entre elas: toque numa peça e depois em outra para trocar.
   As quantidades ficam iguais (8 peões, 2 torres, 2 cavalos, 2 bispos, 1 dama
   e 1 rei, apenas embaralhados). Exemplo: se 2 peões viram bispos, os 2 bispos
   originais passam a ter outra função (como peão). O rei também pode ser
   qualquer peça. Há **Resetar** e **Pronto**, sem limite de tempo. O
   oponente vê “Oponente montando…”. O relógio só começa quando os dois
   clicam em Pronto (dá para clicar em **Editar** antes disso).
2. **Durante a partida** você vê a função real das suas peças (um selo no canto
   quando ela é diferente da aparência). O oponente só vê as aparências.
3. **Revelação.** Uma peça é revelada quando faz um lance que a peça *aparente*
   não poderia fazer no xadrez clássico (por exemplo, uma “torre” andando na
   diagonal). Se o lance também seria possível para a aparência, ela continua
   em segredo. O **rei verdadeiro** é revelado quando leva xeque. Peça revelada
   ganha um contorno roxo e um selo roxo com a função real, para os dois
   jogadores, até o fim da partida.
4. **Captura.** A peça capturada continua em segredo: a lista de capturadas e o
   histórico mostram só a aparência.
5. **Roque** só para o rei verdadeiro: a peça com função de rei em e1/e8 e uma
   peça com função de torre em a1/h1 (a8/h8), sem terem se movido, com as casas
   entre elas vazias, sem estar em xeque e sem passar por casa atacada.
6. **Promoção.** Qualquer peça com função de peão que chega à última fileira
   promove (com a escolha normal). A peça promovida fica revelada com a nova função.
7. **Xeque, mate e afogamento** usam as funções reais e o rei verdadeiro. O
   servidor recusa lances que deixariam o seu rei verdadeiro em xeque (“seu rei
   ficaria em xeque”).

Regras que precisamos definir:

- **Peão (função):** anda para a frente da sua cor. O passo duplo só vale na
  fileira inicial dos peões da sua cor (2ª para as brancas, 7ª para as pretas) e
  se a peça ainda não se moveu. Uma peça com função de peão que começou na 1ª
  fileira anda uma casa por vez. **En passant** só para a função de peão, contra
  uma peça com função de peão que acabou de dar o passo duplo.
- **“Possível para a aparência”** considera só o desenho do movimento e as peças
  no caminho (não considera xeques, porque ninguém conhece o rei do outro).
  Uma peça com aparência de peão que chega à última fileira sem promover é
  revelada (um peão de verdade teria que promover). O roque nunca revela
  (só a peça de e1/e8 pode rocar, e ela já parece um rei).
- **Regra dos 50 lances:** desligada neste modo (dependeria das funções secretas
  e poderia vazar informação). **Material insuficiente:** só rei contra rei.
  **Tempo esgotado:** empate apenas se quem sobrou tiver só o rei.
- **Histórico:** notação longa com a letra da aparência (ou da função, se a peça
  já foi revelada), por exemplo `Cg1-f3`, `e2xd3`, `e7-e8=D`. Quando o lance
  revela a peça aparece `⚑` com a letra da função real (`e2-d3 ⚑B+`). A notação
  longa evita a desambiguação, que poderia vazar informação.
- **Dicas de lance:** nas suas peças elas usam a função real e tratam as peças
  do oponente só como obstáculos (o navegador não sabe as funções dele). Quem
  decide se o lance é legal é sempre o servidor.

Segurança: as funções reais ficam só no servidor. Cada jogador recebe um estado
filtrado (as próprias peças com a função; as do oponente só com a aparência, e
a função apenas depois de revelada). O teste `test-e2e-impostor.js` confere isso.

Abra **⚙️ Configurações** para som (ligar/desligar e volume), pacote de som (**Moderno** ou **Clássico**, com batidas de madeira), tema do tabuleiro, estilo das peças, dicas de lance e coordenadas.

## Publicar no Render (serviço web gratuito)

1. Crie um repositório no GitHub e envie esta pasta (sem `node_modules`):

```bat
git init
git add .
git commit -m "Xadrez online"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

2. No [Render](https://render.com), faça login (pode ser com o GitHub).
3. Clique em **New** → **Web Service** e selecione o repositório.
4. Preencha:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
5. Crie o serviço e aguarde o deploy. O Render define a variável `PORT` automaticamente; o servidor já a utiliza.
6. O endereço público será algo como `https://seu-servico.onrender.com`.

Observação: no plano gratuito o serviço pode “dormir” após um tempo sem tráfego. A primeira visita seguinte demora um pouco para acordar.


## Versões

O histórico de versões está em [CHANGELOG.md](CHANGELOG.md).
Este projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/)
(`MAJOR.MINOR.PATCH`). A versão atual é **1.2.0**.
A fonte única da versão é o `package.json`: o servidor a expõe em `GET /versao`
e o site mostra discretamente no canto inferior direito (ex.: `v1.2.0`).

## Testes do motor

Na pasta do projeto:

```bat
npm test
```

Isso roda a suíte *perft* (contagem de lances legais) do motor de xadrez e os
testes de unidade do modo Impostor (`test-impostor.js`).

O teste de ponta a ponta do Impostor sobe o servidor numa porta livre e joga com
dois clientes. Ele usa o `socket.io-client`, que não é dependência do projeto:
instale-o fora da pasta (por exemplo em `/tmp/sockt`) ou aponte a variável
`SOCKET_IO_CLIENT` para ele, e rode:

```bat
npm run test:e2e
```

## Estrutura

- `server.js` — servidor HTTP e salas Socket.IO
- `chess-engine.js` — regras do xadrez (usado no servidor e no cliente; cópia idêntica em `public/`)
- `impostor-engine.js` — regras do modo Impostor (cópia idêntica em `public/`)
- `test-perft.js`, `test-impostor.js`, `test-e2e-impostor.js` — testes
- `public/` — página, estilos, interface, peças SVG e sons (Web Audio)
- `public/logo.svg` — logo (cavalo com máscara de impostor), usado também como favicon
