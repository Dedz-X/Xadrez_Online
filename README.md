# Xadrez online

Jogo de xadrez para dois jogadores: **partida local** no mesmo computador ou **partida online** em salas com código. O servidor (Node.js + Express + Socket.IO) é a autoridade das regras e dos relógios. O cliente roda no navegador, sem etapa de compilação.

Modos: **Livre (sem tempo)**, **Rápido 10 min** e **Blitz 3 min** (sem acréscimo).

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

- **Jogar local:** os dois usam o mesmo computador (hot-seat). As brancas começam. Desfazer, girar o tabuleiro, temas e animações funcionam como na versão offline.
- **Jogar online — Criar sala:** escolha só o modo. Você recebe um código curto (como `K7X2Q`) e um link de convite (`?sala=CODIGO`) para copiar.
- **Jogar online — Entrar com código:** o convidado entra com o código. Em seguida o anfitrião vê o menu **Quem joga de brancas?** (Eu de brancas, Eu de pretas ou Aleatório). O convidado espera essa escolha. A partida e os relógios só começam depois. No Aleatório, cada um vê uma revelação curta (“Você joga de Brancas/Pretas”).
- Na partida online o servidor valida cada lance. Há **Desistir**, **Propor empate** e **Revanche**. Na revanche o menu de cores aparece de novo (com a sugestão de inverter). O desfazer fica desativado online.
- Se a conexão cair, recarregue a página: o jogo retoma com o mesmo tabuleiro e relógio (a identidade fica salva no navegador). Salas abandonadas são apagadas depois de alguns minutos.

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

## Testes do motor

Na pasta do projeto:

```bat
npm test
```

Isso roda a suíte *perft* (contagem de lances legais) do motor de xadrez.

## Estrutura

- `server.js` — servidor HTTP e salas Socket.IO
- `chess-engine.js` — regras do xadrez (usado no servidor e no cliente)
- `public/` — página, estilos, interface, peças SVG e sons (Web Audio)
