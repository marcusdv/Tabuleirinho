# Tabuleirinho

Uma mesa virtual (VTT) de RPG no navegador, inspirada no Roll20, com foco em **D&D 5.5**.
Hoje é um **protótipo**: o tabuleiro, os tokens, os desenhos, o chat e os dados funcionam, e há um
servidor simples para jogar online com amigos (só tokens soltos, chat e dados são sincronizados).

> Detalhes técnicos e decisões do projeto: `CLAUDE.md` e `BRAINSTORM.md`.

## Requisitos

- **Node.js 24 ou mais novo** (o servidor roda TypeScript direto, sem compilar).
- Um navegador moderno (Chrome, Firefox, Edge...).

## Instalação (uma vez só)

```
npm install
```

## Jogar sozinho (modo local)

```
npm run dev
```

Abra http://localhost:5173. Tudo vale só na sua aba; nada é guardado.

## Jogar online com amigos (hospedar uma sessão)

Quem **hospeda** é o mestre: o servidor roda no computador dele e os amigos entram por um link.

### Passo a passo

**1. Gere o site** (de novo, sempre que o código mudar):

```
npm run build
```

**2. Ligue o servidor do jogo** (deixe este terminal aberto):

```
npm run servidor
```

Ele entrega o site e atende o jogo na porta **3737**. Para testar no seu próprio computador,
abra http://127.0.0.1:3737/?online&nome=Ana

**3. Abra um túnel para a internet** (em **outro terminal**, deixe-o aberto).
O túnel dá um endereço público para os seus amigos. O jeito mais simples é o
[`cloudflared`](https://github.com/cloudflare/cloudflared) (grátis, sem conta):

```
cloudflared tunnel --url http://127.0.0.1:3737
```

Ele imprime um endereço parecido com `https://palavras-aleatorias.trycloudflare.com`.

**4. Mande o link aos amigos**, acrescentando `/?online&nome=` e o nome de cada um:

```
https://palavras-aleatorias.trycloudflare.com/?online&nome=Beto
```

No topo da tela aparece "● Online: Beto · Na mesa: Ana, Beto".

**5. Para encerrar**, aperte `Ctrl+C` nos dois terminais.

### Instalar o cloudflared (Linux, sem `sudo`)

```
mkdir -p ~/bin
curl -L -o ~/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/bin/cloudflared
~/bin/cloudflared --version
```

(Em outros sistemas, veja as instruções no site do cloudflared. Se `cloudflared` não for
encontrado, use o caminho completo `~/bin/cloudflared`.)

### Mesma rede Wi-Fi (sem túnel)

Rode `HOST=0.0.0.0 npm run servidor` e os amigos abrem `http://IP-DO-SEU-PC:3737/?online&nome=Beto`
(se houver firewall, libere a porta 3737).

### Cuidados (leia antes de convidar)

- **O link dá acesso total.** Ainda não há login nem permissões: quem tiver o link mexe em qualquer
  token. Mande só para quem você confia.
- **O link muda** toda vez que você liga o túnel; mande o novo antes de cada sessão.
- **Os dois terminais precisam ficar abertos** e o seu computador ligado e sem suspender.
- **Tokens e fichas são gravados**: cada um é um arquivo (em `dados/tokens/` e `dados/fichas/`), que sobrevive a reiniciar o
  servidor. O resto (chat) volta ao início se o servidor reiniciar. **A mesa começa sem tokens**: crie os seus pela bolsa. A pasta `dados/` é **sua**: faça backup dela e não a envie
  para o git nem para outras pessoas (`DADOS=/outra/pasta npm run servidor` troca o lugar).
- **Só estas ações são sincronizadas:** criar, editar, excluir e soltar tokens (no mapa ou na bolsa), chat, dados, e criar, editar e excluir fichas.
  Mapa, desenhos, régua, condições dos tokens e tamanho do tabuleiro
  **são locais** e diferem entre as pessoas.
- Se mudar o código, rode o `npm run build` de novo e **reinicie** o servidor.

### Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| O link abre com erro / o túnel mostra `connection refused` | O servidor não está rodando. Rode `npm run servidor` (depois do `npm run build`). |
| `A porta 3737 já está em uso` | Já há um servidor rodando. Feche-o ou use `PORT=3738 npm run servidor` (e aponte o túnel para a nova porta). |
| A página abre mas fica "Conectando ao servidor…" | Faltou `?online` no endereço, ou o servidor caiu. Recarregue. |
| Mudei o código e nada mudou | Falta `npm run build` e reiniciar o servidor. |
| Aparecem tokens que eu não criei, ou algo novo não funciona | O servidor ou o `dist/` são de uma versão antiga: `npm run build` e reinicie o servidor. |
| No `npm run dev` aparece `ws proxy error ECONNREFUSED` | Você abriu uma aba com `?online` sem o servidor ligado. Rode `npm run servidor`. |

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Site em modo de desenvolvimento (http://localhost:5173) |
| `npm run build` | Confere os tipos e gera o site em `dist/` |
| `npm run servidor` | Servidor do jogo (porta 3737) |
| `npm run test:e2e` | Testes de ponta a ponta (precisa do `npm run dev` ligado) |
| `npx tsc --noEmit` | Só confere os tipos do navegador |
