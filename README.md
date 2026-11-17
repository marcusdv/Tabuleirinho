# Tabuleirinho

Mesa virtual (VTT) de RPG no navegador, inspirada no Roll20, com foco em **D&D 5.5**. Hoje é um **protótipo**: tabuleiro, tokens, fichas, mapas, chat, dados e iniciativa funcionam, e há um servidor simples para jogar online com amigos.

> Detalhes técnicos e decisões: `CLAUDE.md`, `BRAINSTORM.md`, `TODO.md` e `docs/historico.md`.

## Começar

Requisitos: **Node.js 24+** e um navegador moderno.

```
npm install
npm run dev        # modo local: http://localhost:5173 (nada é guardado)
```

## Jogar online

O mestre hospeda: o servidor roda no computador dele e os amigos entram por um link.

```
npm run build      # gera o site (refazer sempre que o código mudar)
npm run servidor   # terminal 1: site + jogo na porta 3737
cloudflared tunnel --url http://localhost:3737   # terminal 2 (só para amigos fora de casa)
```

O túnel imprime um endereço `https://algo.trycloudflare.com` (grátis, sem conta, **muda a cada vez**). Para encerrar, `Ctrl+C` nos dois terminais. Use sempre a porta **3737** (o servidor entrega o site); a 5173 é só do desenvolvimento.

### Como cada pessoa entra

O **papel é obrigatório** no endereço (`&papel=mestre` ou `&papel=jogador`): sem ele a conexão é recusada. (É um login de teste, até existirem contas.)

| Quem | Endereço |
|---|---|
| **Você (mestre)**, no computador do servidor | `http://127.0.0.1:3737/?online&nome=SeuNome&papel=mestre` |
| Amigos **fora de casa** | `https://algo.trycloudflare.com/?online&nome=Ana&papel=jogador` |
| Amigos na **mesma rede** | `http://IP-DO-PC:3737/?online&nome=Ana&papel=jogador` (ligue com `HOST=0.0.0.0 npm run servidor` e libere a porta 3737 no firewall) |

### Mestre × jogador (papéis de teste)

- **Mestre** pede `papel=mestre` e só consegue **do próprio computador do servidor**. Quem vem de fora (rede ou túnel) e pede mestre é recusado: o servidor reconhece o túnel e ninguém de fora se promove a mestre.
- **Jogador** pede `papel=jogador`, de qualquer lugar (também serve para testar o outro lado numa segunda aba).
- O mestre controla tudo. O **jogador só vê e usa o que é dele ou o que o mestre liberou**, mas todos veem as peças no tabuleiro. Quem cria um token ou uma ficha é o **dono** (limite de 5 de cada por jogador). As liberações (leitor e editor) ficam em `dados/permissoes.json`.
- **A pessoa é identificada pelo nome** (`&nome=`): dois jogadores com o mesmo nome contam como a mesma pessoa. Isso é provisório; as contas virão depois.

### Cuidados

- Ainda não há login: o papel é só uma escolha no endereço (de quem vem de fora, só o `jogador` é aceito). **Contas e login virão depois.**
- Os dois terminais ficam abertos e o computador ligado e sem suspender.
- Tokens, fichas, grupos, mapas, as permissões e as regras da mesa são **gravados em `dados/`**, que é **sua**: faça backup e não a envie ao git (`DADOS=/outra/pasta npm run servidor` troca o lugar). Chat e iniciativa seguem a vida do servidor.
- Os **desenhos** (lápis, formas e borracha) são **compartilhados**: cada mapa tem os seus, gravados em `dados/desenhos.json`; todos desenham, o mestre apaga todos e cada jogador apaga os próprios; **Ctrl+Z** e **Ctrl+Y** desfazem e refazem os seus. A régua e a câmera são só de cada pessoa (a câmera de cada mapa é lembrada no navegador).
- Mudou o código? `npm run build` e reinicie o servidor.

### Instalar o cloudflared (Linux, sem `sudo`)

```
mkdir -p ~/bin
curl -L -o ~/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/bin/cloudflared
```

Se o comando não for encontrado, use `~/bin/cloudflared`. Outros sistemas: site do cloudflared.

### Problemas comuns

| Sintoma | Solução |
|---|---|
| Link com erro / túnel com `connection refused` | O servidor não está rodando: `npm run build` e `npm run servidor`. |
| `A porta 3737 já está em uso` | Há outro servidor rodando. Feche-o, ou use `PORT=3738 npm run servidor` (e aponte o túnel para a nova porta). |
| Fica em "Conectando ao servidor…" | Faltou `?online` no endereço, ou o servidor caiu. |
| Mudei o código e nada mudou | Falta `npm run build` e reiniciar o servidor. |
| `ws proxy error ECONNREFUSED` no `npm run dev` | Aba com `?online` sem o servidor ligado. |
| "Faltou o papel no endereço" | Acrescente `&papel=mestre` (no computador do servidor) ou `&papel=jogador`. |

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Site em desenvolvimento (http://localhost:5173) |
| `npm run build` | Confere os tipos e gera o site em `dist/` |
| `npm run servidor` | Servidor do jogo (porta 3737) |
| `npm run test:e2e` | Testes de ponta a ponta (precisa do `npm run dev` ligado) |
| `npx tsc --noEmit` | Só confere os tipos do navegador |
