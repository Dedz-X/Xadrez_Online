# Xadrez Alternativo

![Logo](public/logo.svg)

Jogo de xadrez no navegador, com o modo alternativo **Impostor**. Dá para jogar no mesmo computador, contra o bot ou online em salas com código (com chat rápido) e modo espectador. O servidor é a autoridade das regras e dos relógios. O cliente roda no navegador, sem etapa de compilação.

## Funcionalidades

- **Local (mesmo PC):** os dois jogadores usam o mesmo computador. As brancas começam.
- **Contra o bot:** escolha a cor e a dificuldade — **Fácil**, **Médio** (pensa 2 lances) ou **Difícil** (pensa até 4 lances). Só xadrez clássico, sem relógio. O bot roda num Web Worker.
- **Online:** crie uma sala e compartilhe o código (ou o link `?sala=CODIGO`). O anfitrião escolhe quem joga de brancas. Há desistir, propor empate e revanche.
- **Chat rápido:** frases prontas e emojis, conferidos pelo servidor. Espectadores leem, mas não enviam.
- **Assistir:** entre com o código de uma sala para acompanhar ao vivo, só olhando.
- **Tempos:** Livre (sem tempo), Rápido 10 min e Blitz 3 min, sem acréscimo.
- **Variantes online:** Clássico e Impostor. No Impostor, cada peça tem uma aparência e uma função secreta; as funções reais ficam no servidor.
- **Na partida:** revisão lance a lance ao terminar, marcações (setas e círculos), pré-lance, estilos de peças (Clássico, Pixel e Simples) e configurações de som, tema e dicas.

## Como rodar localmente

- Node.js 18 ou superior
- npm
- Um navegador moderno (Chrome, Edge ou Firefox)

Na pasta do projeto:

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Para encerrar o servidor, pressione `Ctrl+C`.

Na mesma rede, outra pessoa acessa pelo IP da máquina no lugar de `localhost` (por exemplo `http://192.168.0.10:3000`).

## Tecnologias

- **Node.js** 18 ou superior (`npm start` executa `node server.js`)
- **Express** e **Socket.IO**
- Cliente no navegador (HTML, CSS e JavaScript), sem compilação

A versão atual é **1.3.0**. O histórico está em [CHANGELOG.md](CHANGELOG.md).
