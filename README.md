# Tabuleirinho

Mesa virtual (VTT) de RPG no navegador, inspirada no Roll20, com foco em **D&D 5.5**. Hoje é um **protótipo**: tabuleiro, tokens, fichas, mapas, fog (névoa), condições, chat, dados, iniciativa, pings e régua funcionam, e há um servidor simples para jogar online com amigos.

> Detalhes técnicos e decisões: `CLAUDE.md`, `BRAINSTORM.md`, `TODO.md` e `docs/historico.md`. Teclas de atalho e gestos do mouse: `docs/atalhos.md`.

## Começar

Requisitos: **Node.js 22.18 ou mais novo** (o servidor roda o TypeScript direto, sem compilar) e um navegador moderno.

```
npm install
npm run dev        # modo local: http://localhost:5173 (nada é guardado)
```

> **Baixou o código do GitHub?** As pastas `node_modules/` (as bibliotecas) e `dist/` (o site pronto) **não vêm no download**: `npm install` recria a primeira e `npm run build` gera a segunda. Sem o `npm run build`, o servidor só responde "Não encontrado. (Rode `npm run build`…)".

## Jogar online

O mestre hospeda: o **servidor** roda no computador dele e **é a sala**. Enquanto ele estiver ligado, a mesa está aberta e os amigos entram por um link. (Cada servidor tem uma mesa; várias mesas ao mesmo tempo ainda não existem. Tudo o que a mesa guarda fica em `dados/`, então ao ligar de novo a sala volta como estava.)

### Passo 1: criar a sala (o mestre, no computador que vai hospedar)

```
npm install        # só na 1ª vez
npm run build      # gera o site em dist/ (refazer sempre que o código mudar)
npm run servidor   # liga a sala: site + jogo na porta 3737
```

O servidor imprime no terminal os endereços para entrar (mestre e jogador). **Deixe esse terminal aberto**: fechá-lo (ou apertar `Ctrl+C`) fecha a sala. Use sempre a porta **3737** (o servidor entrega o site); a 5173 é só do desenvolvimento.

Opções na hora de ligar (veja "Variáveis do servidor" mais abaixo): `SENHA_MESA=algo npm run servidor` pede senha a quem entra de fora, e `PORT=3738 npm run servidor` usa outra porta.

### Passo 2: entrar como mestre

No **mesmo computador do servidor**, abra no navegador:

```
http://127.0.0.1:3737/?online&nome=SeuNome&papel=mestre
```

- `?online` liga o modo online; `nome=` é o seu nome na mesa; `papel=mestre` pede o papel de mestre.
- O mestre só entra **do próprio computador do servidor** (`127.0.0.1`): quem vem de fora, por rede ou túnel, e pede mestre é recusado.
- Deu certo quando aparece no alto da tela **"● Online: SeuNome · Na mesa: …"**, com quem está na sala. Só o mestre tem, na bolsa em tela cheia (tecla **Q**), as abas **Mapas**, **Jogadores** e **Condições**.

### Passo 3: deixar os amigos entrarem

Escolha como eles chegam até o seu computador:

- **Amigos fora de casa:** crie um túnel (logo abaixo).
- **Amigos na mesma rede:** ligue o servidor com `HOST=0.0.0.0 npm run servidor` e libere a porta 3737 no firewall.
- **Só você, para testar:** abra uma segunda aba do navegador (veja o passo 4).

#### Criar o túnel no cloudflared (amigos fora de casa)

O cloudflared cria um endereço público temporário que leva até o seu servidor. É grátis, **não precisa de conta** e não exige abrir portas no roteador.

1. **Instale o cloudflared** (uma vez):
   - **Linux, sem `sudo`:**
     ```
     mkdir -p ~/bin
     curl -L -o ~/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
     chmod +x ~/bin/cloudflared
     ```
     Se o comando não for encontrado, use `~/bin/cloudflared` no lugar de `cloudflared`.
   - **macOS:** `brew install cloudflared`
   - **Windows:** `winget install --id Cloudflare.cloudflared` (depois feche e abra o terminal).
   - **Outros sistemas:** a página de downloads do cloudflared, no site da Cloudflare.
2. Com o servidor já ligado (passo 1), abra **outro terminal** e rode:
   ```
   cloudflared tunnel --url http://localhost:3737
   ```
3. Entre as mensagens aparece um endereço como **`https://algo.trycloudflare.com`**. Esse é o endereço da sua sala. Ele **muda a cada vez** que você abre o túnel.
4. Mande aos amigos o link do passo 4, com esse endereço no começo.
5. Para encerrar, `Ctrl+C` nos dois terminais. Enquanto jogam, mantenha os dois abertos e o computador ligado e sem suspender.

### Passo 4: entrar como jogador

Cada amigo abre no navegador o endereço abaixo, trocando `Ana` pelo próprio nome:

| De onde | Endereço |
|---|---|
| **Fora de casa** (pelo túnel) | `https://algo.trycloudflare.com/?online&nome=Ana&papel=jogador` |
| **Mesma rede** | `http://IP-DO-PC:3737/?online&nome=Ana&papel=jogador` |
| **No computador do servidor** (testar, numa 2ª aba) | `http://127.0.0.1:3737/?online&nome=Ana&papel=jogador` |

- **O papel é obrigatório** no endereço (`&papel=mestre` ou `&papel=jogador`): sem ele a conexão é recusada. (É um login de teste, até existirem contas.)
- Use um **nome diferente para cada pessoa**: dois jogadores com o mesmo nome contam como a mesma pessoa.
- O `IP-DO-PC` é o endereço do computador do mestre na rede: `hostname -I` no Linux, `ipconfig` no Windows, `ipconfig getifaddr en0` no macOS.
- Se a sala tem senha, acrescente `&senha=a-senha` ao endereço (só vale para quem entra de fora).
- O jogador só vê e usa o que é dele ou o que o mestre liberou. O mestre libera tokens, fichas e grupos pelo menu **Compartilhar…** (clique direito numa ficha de token da bolsa) e define os limites por jogador na aba **Jogadores**.

### Mestre × jogador (papéis de teste)

- **Mestre** pede `papel=mestre` e só consegue **do próprio computador do servidor**. Quem vem de fora (rede ou túnel) e pede mestre é recusado: o servidor reconhece o túnel e ninguém de fora se promove a mestre.
- **Jogador** pede `papel=jogador`, de qualquer lugar (também serve para testar o outro lado numa segunda aba).
- O mestre controla tudo. O **jogador só vê e usa o que é dele ou o que o mestre liberou**, mas todos veem as peças no tabuleiro. Quem cria um token ou uma ficha é o **dono** (limite padrão de 5 de cada por jogador; o mestre muda isso na aba **Jogadores** da bolsa em tela cheia). As liberações (leitor e editor) ficam em `dados/permissoes.json`.
- Na aba **Jogadores** o mestre também pode **dar o poder de mestre** a outra pessoa, banir e desbanir. Quem recebe esse poder o mantém entre as sessões (guardado em `dados/permissoes.json`).
- **A pessoa é identificada pelo nome** (`&nome=`): dois jogadores com o mesmo nome contam como a mesma pessoa. Isso é provisório; as contas virão depois.

### Cuidados

- Ainda não há login: o papel é só uma escolha no endereço (de quem vem de fora, só o `jogador` é aceito). **Contas e login virão depois.**
- Os dois terminais ficam abertos e o computador ligado e sem suspender.
- O que a mesa guarda é **gravado em `dados/`**, que é **sua**: faça backup e não a envie ao git (`DADOS=/outra/pasta npm run servidor` troca o lugar). Ali ficam: `fichas/`, `tokens/`, `pecas/`, `grupos/`, `pastas/` e `mapas/` (com as imagens); e os arquivos `mesa.json` (tamanho do tabuleiro, status, ações, valores e a **iniciativa**), `permissoes.json`, `desenhos.json`, `cenas.json` (tamanho e grade de cada mapa), `fog.json` (a névoa), `condicoes.json` (as condições da mesa) e `usuarios.json` (favoritos de cada pessoa). **Só o chat** segue a vida do servidor (some ao reiniciar).
- **Backup da campanha:** na aba **Jogadores** (só o mestre, só online) o botão **"Baixar backup da campanha"** baixa um `.zip` com a pasta `dados/` inteira.
- Os **desenhos** (lápis, formas e borracha) são **compartilhados**: cada mapa tem os seus, gravados em `dados/desenhos.json`; todos desenham, o mestre apaga todos e cada jogador apaga os próprios; **Ctrl+Z** e **Ctrl+Y** desfazem e refazem os seus. A **régua** também é vista pelos outros da mesma cena enquanto você mede (na sua cor de desenho), mas **não é guardada**. Os **pings** (botão direito no mapa, ou Shift + clique) aparecem para todos da cena e somem sozinhos (limite de 5 por segundo por pessoa). A câmera é só de cada pessoa (a de cada mapa é lembrada no navegador, assim como a cor de desenho).
- **Senha da mesa (opcional):** `SENHA_MESA=algo npm run servidor` exige `&senha=algo` no endereço de quem entra **de fora** (rede ou túnel); o mestre no computador do servidor não precisa.
- Mudou o código? `npm run build` e reinicie o servidor.

### Problemas comuns

| Sintoma | Solução |
|---|---|
| Link com erro / túnel com `connection refused` | O servidor não está rodando: `npm run build` e `npm run servidor`. |
| A página diz "Não encontrado. (Rode `npm run build`…)" | Falta gerar o site (a pasta `dist/` não vem no download): `npm run build`. |
| `A porta 3737 já está em uso` | Há outro servidor rodando. Feche-o, ou use `PORT=3738 npm run servidor` (e aponte o túnel para a nova porta). |
| Fica em "Conectando ao servidor…" | Faltou `?online` no endereço, ou o servidor caiu. |
| Mudei o código e nada mudou | Falta `npm run build` e reiniciar o servidor. |
| `ws proxy error ECONNREFUSED` no `npm run dev` | Aba com `?online` sem o servidor ligado. |
| "Faltou o papel no endereço" | Acrescente `&papel=mestre` (no computador do servidor) ou `&papel=jogador`. |

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Site em desenvolvimento (http://localhost:5173) |
| `npm run build` | Confere os tipos (navegador e servidor) e gera o site em `dist/` |
| `npm run servidor` | Servidor do jogo (porta 3737) |
| `npm run test:unidade` | Testes rápidos do código compartilhado e do servidor (menos de 1 segundo) |
| `npm run test:e2e` | Testes de ponta a ponta (precisa do `npm run dev` ligado) |
| `npx tsc --noEmit` | Só confere os tipos do navegador (`npx tsc -p servidor/tsconfig.json` confere os do servidor) |

### Variáveis do servidor

| Variável | O que faz |
|---|---|
| `PORT` | Porta do servidor (padrão 3737) |
| `HOST` | `0.0.0.0` para aceitar a rede local (padrão: só este computador) |
| `DADOS` | Outra pasta de dados no lugar de `dados/` |
| `SENHA_MESA` | Exige senha de quem entra de fora (veja "Cuidados") |
| `SITE` | Outra pasta do site no lugar de `dist/` |
| `SEM_EXEMPLOS=1` | Não cria as fichas e os mapas de exemplo na primeira vez |
