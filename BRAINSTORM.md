# Brainstorming — Tabuleirinho

> Documento vivo para anotar ideias do site. Preencha à vontade; o que está em "Decisões já tomadas" foi combinado, o resto ainda é ideia ou pergunta.

## 1. Ideia central
- **Definido:** mesa virtual (VTT) de RPG no navegador, inspirada no Roll20. Foco inicial em **D&D 5.5** (edição 2024); outros sistemas talvez depois.
- Começando **pelo tabuleiro**: depois dele vêm o multiplayer, as fichas e o resto.
- O que é o site em uma frase?
- Que problema resolve / que experiência oferece?
- Por que "Tabuleirinho"? (tema, jogo, nome, referência)

## Decisões já tomadas
### Jogo e permissões
- Jogo **online em tempo real** (cada pessoa no seu navegador).
- **DM** tem controle total: mapa, monstros, NPCs, todas as peças.
- **Jogadores** controlam apenas as suas próprias peças.
- **Modelo de permissões:** cada jogador tem o seu próprio "espaço" (carteira) com tudo o que é dele: ficha, tokens, itens, dinheiro etc. Ele controla tudo o que está no seu espaço e nada do espaço dos outros.
- O **mestre** acessa e controla tudo, em todos os espaços.

### Tecnologia do tabuleiro
- **PixiJS + TypeScript + Vite** (decidido). PixiJS porque fog of war e iluminação dinâmica estão nos planos e ele aguenta isso.
- Interface em volta do tabuleiro em HTML/CSS puro.

### Como o multiplayer vai funcionar (plano, ainda não implementado)
- O **servidor é a fonte da verdade**: guarda o estado da mesa; os navegadores só desenham.
- Conexão permanente por **WebSocket**; só se enviam **eventos pequenos** (ex.: `mover_token`, `alternar_condicao`), nunca o tabuleiro inteiro.
- O **servidor valida as permissões** ("esse token é seu, ou você é o mestre?"). Validar só no navegador permitiria trapaça.
- Durante um arrasto, enviar a posição com limite de frequência e interpolar do outro lado; ao soltar, enviar a posição final.
- Quem entra tarde (ou reconecta) recebe o estado completo uma vez, depois só os eventos.
- O estado da mesa é salvo para continuar no dia seguinte: **em arquivos na máquina do mestre**, não em banco central (ver a próxima seção).

### Protótipo do servidor (decisões tomadas em conversa; implementado)
- **Tecnologia:** Node 24 + biblioteca `ws` (WebSocket); o Node já traz só o cliente, por isso a `ws`. Tipos `@types/ws` e `@types/node` só como ferramenta de desenvolvimento. O próprio servidor entrega o site (`dist/`).
- **TypeScript compartilhado (opção "a" escolhida pelo dono):** os arquivos que o servidor reaproveita importam uns aos outros com a extensão `.ts` e usam só TypeScript apagável; nenhuma ferramenta nova (sem `tsx`, `esbuild` nem Vite para o servidor). Custo real: 6 linhas de import. Bônus: dá para testar `estado.ts` direto no Node.
- **Escopo do protótipo (decidido pelo dono):** mover tokens (soltar no mapa e na bolsa), chat e dados. O resto fica local por enquanto.
- **Como testar (decidido pelo dono): só no próprio computador, com duas abas** (sem túnel e sem expor o computador). **Em aberto:** quando testar com amigos, usar a mesma rede Wi-Fi (`HOST=0.0.0.0`) ou o túnel (Cloudflare)? O servidor escuta só em `127.0.0.1` por padrão.
- **Porta 3737** (a 3000 é muito usada por outros projetos).
- **Aprendido ao construir:** `crypto.randomInt` só aceita faixas menores que 2⁴⁸; o Vite só lê o `vite.config.ts` ao iniciar; o servidor guarda tudo na memória (reiniciar zera a mesa), então testes automáticos precisam subir um servidor limpo.
- **Persistência (conversada, ainda NÃO feita):** hoje nada sobrevive a recarregar a página ou reiniciar o servidor. Plano: uma função de serializar e restaurar o estado com número de versão (e migrações), usada tanto para salvar no navegador/exportar arquivo quanto, no servidor, para gravar a pasta da mesa em JSON (gravando em arquivo temporário e renomeando; uma ficha por arquivo e uma lixeira, para apagar durante o jogo sem risco).

### Regras de segurança do servidor (decididas em conversa; valem quando o servidor for escrito)
**Princípio:** tudo que chega de um navegador é **dado não confiável**, mesmo vindo de um amigo (o programa dele pode estar modificado). O servidor **valida tudo** e **só executa o que está numa lista permitida**. Nada que chega é executado como código.

- **NUNCA `eval`** (nem `new Function`, nem equivalentes) em texto vindo de jogadores: chat, comandos, fórmulas de ficha, nomes. Expressões são lidas por **analisadores próprios** com gramática estrita.
- **Comandos de chat (`/r` e os futuros):** o servidor recebe o texto bruto e decide sozinho. Começou com `/`? Procura numa **lista fechada** de comandos; desconhecido = erro, **só para quem digitou**. O argumento passa por gramática estrita (ex.: `^\d{1,2}d\d{1,4}([+-]\d{1,3})?$`) e é recusado antes de qualquer cálculo se fugir dela. Cada comando é uma **intenção estruturada** que passa pelas mesmas funções e **pelas mesmas checagens de permissão** dos botões da interface ("esse token é seu, ou você é o mestre?"): um comando nunca é um caminho para fazer o que o botão não deixaria.
- **Dados:** o **servidor sorteia** (`rolarDados`) com `crypto.randomInt` (imprevisível e sem viés), nunca `Math.random` nem o navegador. A rolagem é um **tipo de mensagem à parte**, criado só pelo servidor: um texto digitado no chat NUNCA vira cartão de rolagem (ninguém finge "Fulano rolou 20"). Rolagem **secreta do mestre** (`/gr`): o servidor só envia o resultado ao mestre.
- **Limites ANTES de calcular** (contra sobrecarga): quantidade de dados (`MAX_QUANTIDADE_DADOS` = 99), lados (até 1000), modificador (±`MAX_MODIFICADOR_DADOS` = 99), tamanho do texto, número de termos de uma expressão, número máximo de tokens, de desenhos (e de pontos por traço), de mensagens guardadas, de mapas e tamanho de cada imagem. Estourou = recusa com erro claro.
- **Fórmulas da ficha (`[1d20 + DEX + FOR + PROF]`):** o MESMO analisador do `/r` (uma regra de segurança escrita uma vez só). Só dados, números, variáveis e `+`/`-` (talvez parênteses e `*`); **sem funções de programação**; as variáveis só são lidas da **ficha de quem rolou**; variável inexistente = erro visível (nunca zero silencioso); tamanho máximo do texto, de termos e de profundidade.
- **Limite de frequência (rate limit)** por conexão: mensagens de chat, comandos, rolagens e, sobretudo, **eventos de arrasto** (o servidor descarta o excesso). Conexão que insiste é desconectada.
- **Permissões no servidor, sempre** (validar só no navegador permite trapaça): jogador mexe no que é dele (tokens, ficha, itens), o mestre mexe em tudo. Vale para mover, criar, editar, apagar, guardar, desenhar, condições, vida. O servidor **nunca confia em ids, donos, papéis ou nomes que vêm na mensagem**: usa a identidade da conexão (do token de entrada).
- **Validar a FORMA de cada evento:** tipos certos, números inteiros e dentro dos limites (colunas/linhas, tamanho do token 1 a 4, cor 0 a 0xffffff), ids que existem, campos desconhecidos ignorados. As regras já escritas em `estado.ts` (`criarToken`, `editarToken`, `imagemValida`, limites de nome e de mensagem) são a base: o servidor as reutiliza, e elas **continuam valendo no estado**, não só na interface.
- **Texto na tela:** sempre `textContent`, **nunca HTML** (nomes, chat, fichas, comandos). Já é a convenção da interface; o servidor também não deve devolver texto como se fosse marcação.
- **Imagens:** só tipos conhecidos (`data:image/...` das miniaturas, ou arquivos de imagem para mapas), com tamanho máximo; nunca guardar com o nome que o usuário mandou (gerar o nome no servidor).
- **Arquivos do servidor (a pasta da mesa):** servir **só** a pasta da mesa; bloquear `../` e caminhos absolutos (senão vaza o computador do mestre); nomes gerados pelo servidor; a pasta de backup fora da pasta servida.
- **Identidade:** o token de entrada (JWT) é conferido com a **chave pública**; vence em minutos, vale para UMA mesa e pode ser de uso único. A **chave privada** fica SÓ no site central, nunca no código, no repositório, nas capturas nem no programa do mestre. Usar **par de chaves** (ex.: EdDSA), NUNCA segredo compartilhado (HS256): quem confere não pode assinar. O servidor do mestre nunca vê senhas.
- **Mensagens de erro e registros (logs):** nunca incluir segredos (chaves, tokens de entrada) nem dados pessoais; erros para o jogador são curtos e sem detalhes internos.
- **Teste:** cada regra acima deve ter um teste "malicioso" (comando inválido, número gigante, evento com dono falso, caminho com `../`, texto com HTML), que precisa ser **recusado** sem derrubar o servidor.

### Hospedagem, contas e salvamento (arquitetura escolhida pelo dono; ainda não implementada)
**Visão geral:** cada mestre roda o PRÓPRIO servidor na máquina dele (como um servidor de Minecraft); existe um **site central** só para cadastro/login e para conectar jogador à mesa.

- **Servidor do mestre:** Node + WebSocket na máquina dele, com os arquivos da mesa (estado, mapas). Para ficar acessível pela internet usa um **túnel grátis** (ver "Túneis" abaixo). Ideal: um programa único com botão "Abrir mesa" que já liga o túnel.
- **Site central:** cadastro e login **obrigatórios** para todos (mestre e jogadores). Custo baixo: só contas e diretório, o jogo pesado roda no mestre. Sugestão: login com **Discord/Google** em vez de senha própria (menos atrito e nada de senhas para proteger).
- **Código de conexão:** ao ligar, o servidor se registra no site e recebe um **código curto** (ex.: `K7QM-4XD2`); o mestre passa o código e o jogador logado o digita no site. Assim ninguém digita endereço, o endereço do túnel pode mudar à vontade, o site só conecta a servidores registrados e confere a versão.
  - Código com 8+ caracteres sem letras confundíveis (0/O, 1/I), limite de tentativas por conta, expira quando o servidor desliga (sinal periódico de "estou vivo"), um novo por sessão.
  - **Entrada só por CONVITE do mestre (decidido pelo dono):** cadastro e login são feitos no site, e o jogador só entra na sala se o mestre o **convidou**. Ter o código sozinho não basta: o site só emite o token de entrada para contas convidadas àquela mesa (lista de convidados da mesa; o mestre pode remover/expulsar e o site para de emitir tokens para essa conta). Assim, se o código vazar, quem não foi convidado não entra.
  - Em aberto: como o mestre convida (pelo nome de usuário/e-mail da conta, por um link de convite pessoal ou os dois) e onde fica a lista de convidados (no site central ou no servidor do mestre, junto do estado da mesa); o convite é por mesa fixa ou vale por sessão; o convite expira?
  - O servidor precisa se identificar ao registrar (login do mestre ou chave do servidor), senão alguém registraria servidor falso.
- **Identidade do jogador (decidido: JWT):** o site entrega um **token de entrada** (nome para não confundir com os "tokens" do tabuleiro), no formato **JWT** assinado e temporário, vale ~2 minutos e para UMA mesa. Conteúdo: `sub` (id da conta), `nome`, `mesa` (código) e `exp` (validade); sem senha nem e-mail dentro (o conteúdo é legível, a assinatura só impede alterar). A **chave privada** (que assina) fica SÓ no site central; a **chave pública** (que só confere) fica no servidor do mestre, que recusa token adulterado, vencido ou de outra mesa. O token vai no redirecionamento do site para o servidor e é removido do endereço assim que a sessão abre. Usar biblioteca pronta (ex.: `jose`, no Node). O site precisa poder trocar o par de chaves (o servidor baixa a nova chave pública). O servidor do mestre NUNCA vê senhas. O navegador trata tudo que vem do servidor como não confiável (texto sempre como texto, nunca HTML).
- **Salvamento no computador do mestre:** uma pasta por mesa, ex.: `mesas/nome/` com `estado.json` (tokens, colunas/linhas, desenhos, condições, fichas, chat recente) e `mapas/` (as imagens, hoje `blob:` temporários).
  - O servidor grava depois de cada mudança relevante (token ao SOLTAR, não a cada pixel do arrasto), **agrupando** (esperar ~300 ms após a última mudança).
  - **Gravar sem corromper:** escrever num arquivo temporário e renomear; se o computador desligar no meio, o arquivo anterior fica intacto.
  - Ao ligar, o servidor lê a pasta e a mesa volta como estava. Se o estado crescer: foto completa de tempos em tempos + registro de eventos desde a última foto.
  - Incluir **número de versão** no `estado.json` (servidor novo converte arquivo antigo). **Backup rotativo** (últimos N estados) e "exportar mesa" (zip), porque se o disco do mestre falhar a mesa some. Limite de tamanho e compressão para os mapas.
  - Servir arquivos **só da pasta da mesa** (proteger contra `../../`, que vazaria o computador do mestre).
- **Pedir ao mestre que faça BACKUP (decisão do dono: vamos pedir; o MODO de fazer fica para DECIDIR DEPOIS):** como a mesa mora só no computador dele, o programa deve **lembrar e facilitar**, sem depender da memória do mestre. As ideias abaixo são só opções para essa decisão futura:
  - Ao abrir o servidor pela primeira vez, um aviso claro: "sua mesa fica só neste computador; faça backup".
  - Ao **desligar o servidor**, perguntar "Fazer backup agora?" (botão que gera o zip da pasta da mesa), e lembrar se o último backup é antigo (ex.: mais de 7 dias).
  - Botão "Exportar mesa" sempre à mão, e "Importar mesa" para restaurar ou levar para outro computador.
  - Backup **automático rotativo** (últimos N estados) numa pasta separada, como rede de segurança contra erro do próprio mestre; e um backup **antes de qualquer atualização** ou conversão de arquivo.
  - Sugerir guardar uma cópia FORA do computador (nuvem pessoal, pen drive). Em aberto: o programa poderia mandar o zip para uma pasta escolhida pelo mestre (ex.: Google Drive/Dropbox sincronizado).
- **ATUALIZAÇÃO e compatibilidade entre todos (decisão do dono):** todos na mesma mesa precisam falar a mesma "língua", senão dá erro ou trapaça.
  - Todo servidor e toda interface têm um **número de versão** e um **número de protocolo** (o formato das mensagens trocadas). Ao conectar, os dois se apresentam; se o protocolo for incompatível, a entrada é recusada com uma mensagem clara ("o mestre precisa atualizar" ou "atualize a página").
  - Caminho decidido: o **servidor do mestre serve a própria interface** (ver "A interface vem do servidor" acima): quem entra sempre recebe a interface exata daquele servidor, e jogadores nunca ficam em versão diferente da do mestre. A atualização passa a ser só a do servidor (a checagem de protocolo continua útil contra páginas antigas em cache).
  - O programa do mestre **checa se há versão nova ao abrir** (consultando o site central) e avisa; pode oferecer "Atualizar agora" (baixa e reinicia), com **backup automático antes**. O site pode definir uma **versão mínima** aceita: abaixo dela, o servidor não consegue registrar o código de conexão até atualizar.
  - **Arquivos antigos de mesa** são convertidos por "migrações" (versão no `estado.json`): o servidor novo lê o formato antigo e converte, sempre depois do backup. Voltar para uma versão mais velha não é garantido (por isso o backup).
  - Mudanças que quebram o protocolo devem ser raras e avisadas; mudanças compatíveis (campo novo opcional) não exigem que todos atualizem juntos.
  - Em aberto: atualização totalmente automática ou sempre com confirmação do mestre? Como avisar os jogadores durante uma sessão, se sai versão nova (provavelmente só aplicar na próxima abertura da mesa, nunca no meio do jogo).
- **Benefícios:** dados nas mãos do mestre (backup é copiar a pasta); custo de infraestrutura e armazenamento quase zero para o projeto; identidade confiável por conta; os mapas não passam pelo site central (alivia o problema de licença das imagens).
- **Riscos:** (1) o mestre precisa instalar/rodar um programa (maior atrito); (2) o navegador do jogador conecta a um servidor escolhido por outra pessoa (por isso só servidores registrados + token temporário); (3) versões diferentes de site e servidor (mandar a versão no registro e recusar incompatíveis); (4) site central fora do ar = ninguém entra (talvez aceitar por um tempo quem já estava logado); (5) o servidor do mestre fica exposto na internet (validar tudo no servidor, servir só a pasta da mesa); (6) cadastro obrigatório afasta alguns; (7) LGPD: ao guardar e-mail/conta, política de privacidade e exclusão de conta; (8) mapas grandes sobem pela internet de casa do mestre (comprimir); (9) se o mestre desliga, a mesa some até ele voltar.
- **A interface vem do servidor do mestre (decidido pelo dono):** o jogador abre a mesa e o navegador recebe a interface DO PRÓPRIO servidor da mesa; as ações dos jogadores (mover token, rolar dados, escrever no chat...) são mandadas a esse servidor, que valida, aplica e repassa a todos. Assim a versão da interface sempre combina com a do servidor. O site central não serve a interface do jogo: só cadastro/login, código de conexão e emissão do token. Consequência a resolver: o login acontece no site central e o jogo, no endereço do servidor, então o token assinado precisa passar de um para o outro (ex.: o site redireciona o jogador ao servidor levando o token temporário).
- **Ordem sugerida:** (1) servidor do mestre funcionando, com salas e só apelido, e o salvamento em arquivo; (2) depois o site central com login, código de conexão e token. O servidor já nasce validando tokens para a segunda fase entrar sem refazer o resto.
- **Em aberto:** a **carteira** do jogador (ficha, tokens, itens) vale só na mesa onde foi criada, ou vai de mesa em mesa (aí precisa morar no site central)? Um servidor deve hospedar uma mesa ou várias salas? (recomendado: salas desde o início; o mesmo código serve para o mestre rodar em casa ou numa hospedagem de verdade no futuro.)

### Túneis grátis para o servidor do mestre (comparação feita em conversa; conferir os limites atuais antes de depender de um)
- **Cloudflare Tunnel, modo rápido** (`cloudflared tunnel --url http://localhost:PORTA`): sem conta, URL muda a cada vez (`*.trycloudflare.com`), aceita WebSocket. **Recomendado para começar e testar.** Cada mestre abre o seu, sem limite prático de quantos existem.
- **Cloudflare Tunnel nomeado:** conta grátis + domínio próprio (único custo, ~R$ 40/ano); URL fixa.
- **ngrok (plano grátis):** 1 endereço fixo grátis por conta, aceita WebSocket, limite mensal de tráfego, tela de aviso para navegadores na 1ª visita.
- **Tailscale Funnel / Tailscale comum:** Funnel dá URL pública fixa; o comum cria rede privada (cada amigo instala o programa).
- **localhost.run / Pinggy:** só SSH, sem instalar nada, menos estáveis. **Playit.gg:** feito para jogos, menos natural para site web.
- **Sem túnel:** abrir porta no roteador + DNS dinâmico (DuckDNS); muitas operadoras brasileiras usam CGNAT e impedem. Redes virtuais (ZeroTier, Radmin VPN, Hamachi): cada jogador instala o programa.
- Em produção, o servidor serve a versão compilada (`npm run build`), não o servidor de desenvolvimento do Vite (que recusa endereços desconhecidos).
- Um serviço único para todos (tipo Roll20) pede servidor sempre ligado (VPS/hospedagem) e armazenamento de imagens (ex.: Cloudflare R2): caminho futuro, não necessário agora.

### Regras do tabuleiro já definidas
- **Tokens** de 1×1 a 4×4 casas (criaturas Pequenas/Médias até Imensas), encaixados na grade.
- **Sobreposição de tokens é permitida.**
- Clique **direito** num token abre, **acima** dele e com um vão, a **engrenagem** (tamanho) no canto superior **direito** e uma **lista de ações** no canto superior **esquerdo**: "Add condição" (primeiro item) e, provisoriamente, "Add dano" e "Add cura" (ainda sem função; dependem de ter vida/PV nos tokens).
- **Todos os painéis desse menu abrem para cima** (também os futuros), com altura limitada e rolagem; só vão para baixo se acima não houver espaço.
- O DM poderá **trocar o tamanho do tabuleiro** (colunas/linhas) e dar zoom em tempo real.
- **Condições** (18):
  - Ícones no token, em anel: o primeiro no topo e os outros em sentido horário.
  - No máximo **4 ícones** visíveis; com mais, o 5º lugar vira "+N" (N = quantas ficaram de fora).
  - **Só se remove** clicando de novo na condição, no painel "Add condição".
  - **Morto** é sempre o último da lista e **risca o token com um X vermelho** (não ocupa lugar no anel).
  - Ao **passar o mouse no token**, um balão lista todas as condições (altura máxima, rola se forem muitas); há **0,4 s** para o mouse chegar até o balão, e no balão cada condição mostra a **descrição**. A descrição também aparece ao passar o mouse nas condições do painel "Add condição".
  - Textos das descrições em português, com **distâncias em metros** (5 pés = 1,5 m).
- Ao abrir, o tabuleiro **se ajusta à janela** (zoom até caber inteiro, no máximo 100%), e há o botão "Ajustar à tela".

### Ajudas ao jogador (dicas para colocar no site)
Coisas que o site deve oferecer ou dizer para facilitar a vida de quem monta a mesa:
- **Como ajustar a grade ao mapa:**
  - Ajustar **um eixo por vez**: primeiro as colunas (até as linhas verticais coincidirem com as do mapa), depois as linhas; ou o contrário.
  - **Contar as colunas e as linhas do mapa e aplicar nos botões Colunas/Linhas** também resolve (já aparece no painel da calibragem).
  - Olhar o canto oposto ao início: o erro de alinhamento se acumula e aparece mais longe.
  - Usar mapas **sem margens nem bordas** (elas deslocam a grade).
  - Se o mapa informar o tamanho (ex.: "30×30" no nome ou na descrição), usar esses números.
  - Medir uma casa em pixels e dividir: colunas = largura da imagem ÷ pixels por casa (e o mesmo para as linhas). Se não der inteiro, a medida está errada ou há margem.
  - Tamanhos comuns de casa em pixels (70, 100, 128, 140, 256...) ajudam a reconhecer se a medida faz sentido.
- **Calibrar grade (já implementada):** botão "Calibrar grade" na barra; o jogador arrasta um retângulo sobre N×N casas do mapa e o site calcula colunas e linhas. Quanto mais casas no retângulo, mais preciso.
- **Ainda por fazer:** mostrar o tamanho da imagem em pixels; campo "pixels por casa"; destacar só um eixo da grade por vez; avisar quando a proporção do tabuleiro bater com a da imagem; detecção automática como sugestão.

## 2. Público
- Quem vai usar? (jogadores casuais, amigos, comunidade, loja...)
- Em que dispositivo? (celular, desktop, ambos) — hoje o uso é com mouse (clique direito, passar o mouse); toque exigiria alternativas.

## 3. Funcionalidades
### Já funciona (protótipo do tabuleiro)
- Grade quadriculada com tamanho ajustável (colunas e linhas).
- Tokens arrastáveis, com encaixe na grade, e tamanhos 1×1 a 4×4.
- Pan (arrastar a visão), zoom e "ajustar à tela".
- Barra de ferramentas flutuante, fixa na direita e retrátil.
- Clique direito num token: engrenagem com **"Editar token"** (nome, tamanho, imagem e duas cores) e lista com "Add condição".
- **Régua** (inclusive em curvas) e **desenho** (lápis, borracha, elipse, retângulo, triângulo, cores), calibragem de grade e "Escolher mapa".
- **Bolsa de tokens** em três tamanhos (pequena; média com pesquisa e arrasto; tela cheia para criar e editar), tokens com **nome**, **imagem recortada** e cores de preenchimento e borda.
- **Dados** (d4 a d1000) e **chat** (só a interface, no navegador; com mensagem nova avisando por uma setinha).
- **18 condições** (ícones + descrições) aplicáveis aos tokens, com anel de ícones, "+N", balão com rolagem, descrições e o X vermelho do Morto.

### Essenciais (pedidas por você para o tabuleiro)
- Trocar a **imagem de fundo** do tabuleiro.
- **Desenhar** no tabuleiro.
- **Régua** para medir distâncias.
- Mais opções na engrenagem do token (além do tamanho e das condições).

### Desejáveis (se der tempo)
- Fichas de personagem de D&D 5.5.
- Rolagem de dados e chat.
- Fog of war e iluminação dinâmica.

### Dados (feitos no navegador; falta o servidor)
- Já existe a barra de dados ao lado do chat (d4 a d1000, quantidade, modificador) e o cartão de rolagem no chat.
- **Em aberto:** (1) o servidor deve sortear (anti-trapaça) e mandar o resultado a todos; (2) rolagens secretas do mestre (que só ele vê); (3) rolar com vantagem/desvantagem (2d20, pegando o maior/menor); (4) destacar 20 natural e 1 natural no d20; (5) dados diferentes na mesma rolagem (ex.: 1d8+2d6+3); (6) atalho de texto no chat (`/r 2d6+3`).

### Chat (só a interface feita; ideias e perguntas)
- Já existe: faixa horizontal embaixo (a mais nova à esquerda), campo com limite de 72 caracteres, animações e barra de rolagem própria. Ainda é local: nada é enviado a outros jogadores.
- **PERFIL do jogador no chat: COR própria e FOTO (pedido do dono; anotado, NÃO feito; depende das contas):** cada usuário **escolhe a sua própria cor** e **a sua foto**. A foto aparece **no topo de cada mensagem** do chat e **nos cartões de rolagem** (dados e fichas), junto do nome; a cor identifica a pessoa (nome, borda do cartão ou fundo da foto). Pontos a decidir: (1) **onde guardar**: é dado de CONTA, então combina com a tabela `perfis` do Supabase (campos `cor` e `avatar`; ver `BANCO.md`: "campos extras entram aqui depois"), e o servidor do mestre receberia cor e foto pelo token assinado ou por um pedido ao entrar (decidir: o token de entrada deve ficar pequeno, então a foto talvez seja buscada à parte); (2) **a foto**: reaproveitar o recorte do token (miniatura WebP pequena, uns 64 px, com limite de bytes e conferência de que é uma imagem) em vez de aceitar qualquer arquivo; (3) **segurança**: foto e cor vêm de fora, então o servidor confere formato, tamanho e valor (cor só como número 0 a 0xffffff), e a interface usa `textContent`/estilo por propriedade, nunca HTML; (4) **sem foto**: um círculo com a inicial do apelido na cor escolhida; (5) enquanto não há contas, dá para testar com cor e foto guardadas no navegador (`localStorage`) e enviadas no pedido `entrar`; (6) combinar com a ideia de "cor do jogador" para os tokens que ele controla e para o cursor/régua dele em tempo real.
- **Quem ENTRA na mesa só vê o chat DE AGORA EM DIANTE (pedido do dono; anotado, NÃO feito):** hoje o `estado_inicial` manda ao jogador que chega TODO o histórico do chat (até 100 mensagens). A ideia é ele receber só as mensagens que chegarem DEPOIS de entrar, sem o que foi dito antes. Efeitos a tratar quando for fazer: (1) o servidor para de mandar `mensagens` no `estado_inicial` (ou manda vazio) e continua guardando o histórico para quem já estava; (2) quem **reconecta** depois de uma queda: recebe o que perdeu enquanto estava fora, ou também começa do zero? (decidir); (3) o teste `rede` 6 ("Caio entra depois e já vê o histórico do chat") passa a esperar o contrário; (4) pergunta em aberto: o mestre deve ver sempre o histórico todo? E as rolagens secretas (mestre) dependem disso. 
- **EXPANDIR o chat arrastando para a DIREITA (pedido do dono; fazer mais tarde):** uma alça na borda direita da caixa do chat para aumentar a largura (hoje é `max(336px, min(680px, 100vw − 384px))`, fixa). Pontos a decidir/cuidar: guardar a largura escolhida no `localStorage` como as outras preferências; limite máximo (não passar da coluna da bolsa à direita: `100vw − 384px`) e mínimo (336 px); o botão "Reorganizar telas" volta à largura de fábrica; a faixa de mensagens e a barra de rolagem própria precisam acompanhar o novo tamanho (já usam `ResizeObserver`); conferir a barra de dados e o painel de Desenho, que dependem do espaço livre acima do chat. **DECIDIDO pelo dono: só HORIZONTAL; a altura do chat NÃO aumenta** (nada de arrastar a borda de cima).
- **Próximo:** rolagem de dados no chat (ex.: `/r 1d20+3`, ou botões de dado), mostrando o resultado em cartões diferentes das mensagens; o servidor deve sortear os dados (validar no servidor, como o resto).
- **Em aberto:** (1) 72 caracteres basta para comandos e falas (ex.: `/r 2d6+1d4+5` cabe)? (2) mensagens privadas (sussurro) entre jogador e mestre; (3) histórico guardado no servidor e por quanto tempo; (4) nomes e cores dos jogadores nas mensagens (hoje "Você"); (5) o chat recolher/expandir como os outros painéis.

### Régua e desenho (feitos; ideias e perguntas)
- Já funciona: régua (1 casa = 1,5 m), lápis, borracha, elipse, retângulo, triângulo, cores recentes e "Apagar tudo".
- **Régua com curvas (feito):** esquerdo apertado + clique direito fixa um ponto e a medida segue; o total soma os trechos. Ideias: desfazer o último ponto fixado (ex.: Backspace), mostrar o parcial de cada trecho, um jeito de continuar uma medida depois de soltar.
- **Em aberto:** (1) a diagonal da régua conta 1 casa; preferem a regra 5-10-5 do D&D (a cada duas diagonais, uma conta dobrada)? (2) a borracha apaga o desenho inteiro; querem apagar pedaços (pixel a pixel)? (3) as formas não "encaixam" na grade; querem encaixe nos cantos das casas (útil para áreas de magia)? (4) círculo/cone/linha de área de efeito como formas prontas; (5) desfazer/refazer; (6) quem pode desenhar: só o mestre, ou cada jogador (e se os desenhos podem ser privados); (7) os desenhos ainda não são salvos nem enviados (entram junto com o servidor).

### Bolsa de tokens (feita; ideias para evoluir)
- Já funciona: guardar arrastando o token até a bolsa; colocar arrastando a fichinha para o mapa.
- **Bolsa expandida (feita):** clicar na bolsa a expande (quase a tela toda) e abre a área **Criar token**, com tamanho (1×1 a 4×4) e cor (paleta + seletor livre); o token novo nasce guardado na bolsa e é arrastado para o mapa com a bolsa fechada. A bolsa expandida é o lugar das **funções futuras**.
- **Imagem do token (feita):** escolher uma foto, arrastar/dar zoom num círculo de recorte e confirmar; guarda só uma miniatura WebP de 256 px (a foto original é descartada na hora). O token tem duas cores independentes (preenchimento e borda); a imagem fica por cima do preenchimento, e as partes transparentes herdam a cor de preenchimento. O botão direito numa ficha da bolsa altera ou remove a imagem. Nome, tamanho e cores de um token que já existe se editam pelo clique direito (item "Editar token" no mapa e na ficha da bolsa); a imagem se troca/remove pelo menu da ficha. Em aberto: editar a imagem também pelo token no mapa; quem pode editar um token no multiplayer (só o mestre, ou o dono do token?). Em aberto: formato quadrado (ou outros recortes)?; imagens do token enviadas ao servidor do mestre e aos jogadores (a miniatura de ~10 KB torna isso leve); biblioteca de imagens reaproveitáveis entre tokens; trocar a imagem de um token que já está no mapa (hoje só pela ficha, na bolsa); GIF animado vira um quadro só; resolução 256 px fica mole em zoom acima de ~250%.
- **Nome do token (feito):** definido ao criar (campo "Nome", até 20 caracteres; vazio vira "Token N") e mostrado na ficha da bolsa. Em aberto: renomear depois; mostrar o nome no token do mapa (ao passar o mouse ou sempre embaixo); nomes repetidos são permitidos?
- **Ideias para a bolsa expandida:** imagem no lugar da cor (o PixiJS já faz: `Sprite` com máscara circular); editar/apagar/duplicar um token guardado (excluir token já existe; duplicar ainda não); arrastar da bolsa expandida direto para o mapa (ela fecharia ao pegar a ficha); salvar "modelos" de token (ex.: goblin 1×1 vermelho) para criar vários; limite `MAX_TOKENS` = 100 (muda?); quem pode criar tokens no multiplayer (só o mestre, ou cada jogador na própria carteira?) e quem vê cada ficha.
- **Multiplayer:** a bolsa é a candidata natural a "carteira" de cada jogador: o que está guardado não aparece para os outros, e o mestre vê todas.
- Ideias: mostrar as condições na fichinha, dar nome aos tokens, outros itens além de tokens (dinheiro, objetos), recolher/expandir a bolsa, limite de itens.
- **Em aberto:** a bolsa fica no canto da JANELA (como hoje) ou presa ao mapa? Soltar o token na bolsa deve pedir confirmação?

### Organização da bolsa: seleção, grupos, favoritos e ordenação (FEITO; pedido do dono)
- **Seleção como no Windows:** o 1º clique seleciona, o 2º abre; Ctrl/Shift, retângulo de seleção e Ctrl+A **só na bolsa em tela cheia** (na do canto, um item por vez); exclusão em grupo com UMA confirmação; ficha totalmente vazia exclui sem perguntar.
- **Grupos:** nome + cor, **os mesmos para tokens e fichas**, um item em vários grupos; criar, renomear, trocar a cor e excluir (os itens continuam). Servem para **filtrar** e **ordenar** (por enquanto só isso). No canto são uma lista suspensa; na tela cheia, chips.
- **Favoritos:** estrela em cada item, filtro ★ e ordem "Favoritos primeiro".
- **Ordenação:** Mais recentes (**padrão**), Menos recentes, Favoritos primeiro, Por grupo, Nome (A–Z). A data é a de CRIAÇÃO (decisão do dono).
- **Favoritos por JOGADOR (decisão do dono; depende das contas):** hoje a estrela é um campo do próprio token/ficha e vale para quem estiver na mesa (não há contas ainda). Quando houver usuários, cada um terá os seus. **Não vão para o banco do Supabase** (são dados de jogo, só em arquivos locais); onde exatamente ficam (arquivo no servidor do mestre, chaveado pelo `usuarioId` do token, ou no navegador do jogador) é uma **pergunta em aberto**.
- **A TRATAR NO FUTURO (anotado a pedido do dono, 13/11/2026):** (1) **o favorito passa a ser por jogador** quando houver contas (hoje a estrela vale para a mesa toda); (2) **as permissões dos grupos** (quem cria, edita e exclui grupos) e, em geral, o que cada pessoa pode fazer com tokens e fichas de outras (hoje não há regra nenhuma). Os dois dependem do sistema de usuários.
- **Grupos × permissões (em aberto):** hoje QUALQUER pessoa na mesa cria, renomeia e exclui qualquer grupo (como tudo mais: não há permissões). Com contas, decidir: grupos só do mestre? grupos pessoais de cada jogador? grupos compartilhados que só o mestre edita?

### Ideias que valem a pena (sugeridas pelo Claude; NADA decidido: o dono escolhe)
- **LIXEIRA / desfazer exclusão (boa ideia, APROVADA pelo dono; fazer mais tarde):** ao excluir ficha ou token, mover o arquivo para `dados/lixeira/` (com data) em vez de apagar, e um "Restaurar" na bolsa (e esvaziar a lixeira de tempos em tempos). Excluir em grupo é perigoso sem isso. A pasta nova `dados/lixeira/` seguiria a regra das outras (pasta no git, conteúdo nunca).
- **Histórico de versões da ficha:** as fichas já têm número de versão; guardar as anteriores e permitir "ver" e "voltar" a uma delas (e comparar o que mudou).
- **Arrastar para um grupo:** arrastar itens da lista até o chip de um grupo (na tela cheia) para adicioná-los, e arrastar para fora para tirar.
- **Duplicar token/ficha** (ex.: 5 goblins a partir de um modelo, com "Goblin 1..5") e **modelos de ficha/monstro** (uma biblioteca pronta para criar a partir dela).
- **Importar/exportar ficha** (arquivo .json; ou colar o texto) e **exportar/importar a mesa inteira** (backup manual, junto do backup automático já planejado).
- **LOCALIZAR dentro da ficha (pedido do dono; fazer mais tarde):** uma busca na janela de edição para **encontrar palavras** no texto (Ctrl+F dentro da ficha: campo de busca, destaque de todas as ocorrências, "próxima/anterior" com Enter e Shift+Enter, contador "3 de 12" e, se a ficha tem várias páginas, avisar em que página cada uma está; talvez "substituir" depois). Cuidado técnico: o campo de texto tem uma camada de cores por cima (precisa ficar alinhada), então os destaques devem entrar nessa camada sem mudar o tamanho das letras.
- **Pesquisa dentro do CONTEÚDO das fichas** (hoje só pelo nome) e "recentemente abertas".
- **Editor de ficha com a formatação ao vivo** (estilo Obsidian: a linha só mostra as marcas enquanto o cursor está nela); exige trocar o campo de texto por um editor linha a linha (mexe em quase todos os testes de ficha).
- **Visualização da ficha com as rolagens CLICÁVEIS** (mostrando só o nome da rolagem como botão) e um modo "folha de personagem" só de leitura para o jogador.
- **Permissões por grupo:** liberar um grupo inteiro de tokens/fichas para um jogador de uma vez (ex.: "Goblins do mestre", "Personagens do João").
- **Pastas / grupos aninhados** (se a lista de grupos crescer demais) e **cor do grupo aparecendo no token do mapa** (um aro ou um selo), para reconhecer a facção no tabuleiro.
- **Atalhos de teclado na bolsa** (setas para andar pela grade, Enter abre, Delete exclui, F para favoritar) e **seleção por teclado**.
- **Ordenar fichas pela data de ALTERAÇÃO** (hoje é a de criação) e mostrar "alterada há 3 dias" na dica.
- **Aviso de limite:** quando a mesa se aproxima de `MAX_TOKENS`/`MAX_FICHAS`/`MAX_GRUPOS`, mostrar quantos restam.

### Novas abas da bolsa: GRUPOS e CONDIÇÕES customizadas (pedido do dono; NÃO feito, anotado para depois)
- **Aba "Grupos":** um lugar na bolsa para **editar os grupos** (criar, renomear, trocar a cor, excluir, e ver quantos tokens e fichas há em cada um), em vez de só pelo clique direito no chip. As abas da bolsa passam a ser **Tokens, Fichas, Grupos e Condições**.
- **Aba "Condições": condições CUSTOMIZADAS, compartilhadas pela MESA TODA** (decisão do dono). **As condições de fábrica de hoje (as 18, com ícone e descrição) serão APAGADAS do app**: o catálogo passa a ser só o que o mestre e os usuários criarem. Cada condição teria nome, descrição, ícone e, talvez, um visual especial (como o X do "Morto").
- **O que cada condição tem (decisão do dono):** **nome** e **descrição**; **imagem** à escolha (com o mesmo recorte do token); **cor de FUNDO** (aparece quando a imagem tem partes transparentes ou não há imagem: o ícone de hoje é desenhado sobre um disco claro); **cor da BORDA, fina**; e os **EFEITOS** que aparecem **POR CIMA do token, exatamente como hoje**: o ícone no anel da borda do token (até 4, o primeiro no topo e os outros em sentido horário), o distintivo "+N" quando passa de 4, o balão com a lista ao passar o mouse e, nas condições especiais, o **visual por cima do token inteiro** (como o X vermelho do "Morto", que não ocupa lugar no anel). Ou seja: o desenho de hoje é mantido; só muda de onde vêm os dados (ícone, cores e efeito passam a ser escolhidos pela pessoa, em vez de fixos no código). Em aberto: lista fechada de efeitos para escolher ("ícone no anel", "X por cima", "aro colorido", "tarja"...), sem nunca aceitar código ou HTML.
- **ÍCONES das condições: BIBLIOTECA de ícones prontos (SVG) no site (conversa de 13/11/2026; o dono AINDA VAI PESQUISAR os ícones; nada a fazer até ele trazê-los).** Conclusões da conversa: (1) ícones vetoriais SVG são baratos (~0,3 a 1 KB cada; 1000 ícones = poucas centenas de KB, carregados uma vez e só desenhados os usados); PNG de 256 px seria pesado demais (10 a 30 MB para 1000); (2) o custo real é **escolher/curar os ícones, ter uma pesquisa com palavras em português** (nomes costumam vir em inglês) e **respeitar a LICENÇA**; (3) fontes citadas: **game-icons.net** (milhares de ícones de RPG; CC BY 3.0: precisa de **página de créditos** com os autores), **Lucide/Tabler** (ISC/MIT, sem crédito, estilo de app); evitar ícones oficiais de D&D (Wizards of the Coast); a licença dos 18 ícones de hoje é desconhecida (mais um motivo para apagá-los); (4) ao trazer os ícones: anotar **fonte, autor e licença de cada pacote**; formato SVG de preferência (o Claude converte/reduz outros formatos); (5) segurança: os ícones são arquivos NOSSOS e estáticos: o jogador só escolhe o nome do ícone e as cores, **ninguém envia imagem**; (6) ordem sugerida: biblioteca + cores → **desenhar o próprio ícone** (de preferência pixel art 16×16, minúsculo e fácil de limitar; ou traço livre) → **enviar imagem** (reaproveitando o recorte do token) como extra.
- **Quem cria:** o mestre **ou os usuários** ("o mestre ou usuários poderão fazer extras"); como são da mesa inteira, todos veem as mesmas. Quem pode criar, editar e excluir (só o mestre? cada um as suas?) entra nas **permissões** (ainda não existem).
- **Onde guardar:** no servidor do mestre, como grupos, tokens e fichas: um arquivo por condição em `dados/condicoes/<id>.json` (com o ícone como miniatura WebP em texto, como a imagem do token, ou um arquivo de imagem ao lado); **nada no banco do Supabase**. Pasta nova: repetir as duas linhas no `.gitignore` e o `.gitkeep`.
- **Coisas a decidir quando for fazer:** (1) o que acontece com os tokens que já têm condições de fábrica (o `token.condicoes` guarda o ID do arquivo do ícone: ao apagar o catálogo, esses ids ficam sem condição; descartar a marca ao carregar, como já se faz com grupo inexistente); (2) oferecer um **pacote inicial opcional** (as 18 atuais) que o mestre pode importar em um clique, em vez de a mesa nascer sem nenhuma condição; (3) o ícone: escolher uma imagem e recortar (igual à imagem do token) ou escolher de uma biblioteca; (4) o limite de condições por mesa (`MAX_CONDICOES`) e de tamanho do ícone; (5) o que muda no código: `condicoes.ts` deixa de ser um catálogo fixo e vira dados da mesa (`estado.condicoes`), com protocolo (`criar/editar/excluir_condicao`) e eventos como os dos grupos; `iconesCondicoes.ts` passa a carregar a textura de cada ícone sob demanda; o painel "Add condição" e o balão leem o catálogo da mesa; os testes de condições (que ainda nem foram migrados) dependem do catálogo de fábrica e teriam de ser refeitos.

### Fichas e personagens (planejado; ainda NÃO implementado)
- **Modelo conversado:** o **personagem** é o objeto que une as peças (token(s), ficha e, depois, itens, a bolsa dele e o dono). Token e ficha podem existir sozinhos e ser ligados depois, **em qualquer ordem** (criar o token e depois a ficha, ou o contrário). Cada ligação fica guardada em UM lugar só (ex.: `token.personagemId` e `ficha.personagemId`; "quais tokens tem este personagem" é uma busca), para nada ficar inconsistente no multiplayer.
- **Primeira versão (decidido pelo dono): a ficha é só um TEXTO LIVRE.**
- **Interface desejada pelo dono:** na bolsa, uma **segunda aba "Personagens"**, para criar personagens; dali (e do token) dá para clicar na ficha ou no token e **atribuir um ao outro**.
- **Ficha FUTURA (só documentada, para não esquecer; não fazer agora): texto livre com ÁREAS separadas e um sistema de cálculo em texto.**
  - A ficha terá áreas (ex.: atributos, ataques, magias, notas) e **modificadores que são VARIÁVEIS** (ex.: `DEX`, `FOR`, `PROF`), que poderão ser usadas dentro do texto.
  - **Exemplo do dono:** `Ataque com arma.[1d20 + DEX + FOR + PROF]`. O texto fora dos colchetes é só um rótulo; o que está entre `[ ]` é uma **expressão calculável**: dados (`1d20`), números e variáveis da ficha somados.
  - Ideias de como funcionaria: (1) a expressão vira um botão/link na ficha, e clicar nela **rola** (reaproveitando `rolarDados` e o cartão de rolagem do chat, que já mostra a fórmula, os dados e o total); (2) as variáveis valem o que está na ficha naquele momento (mudar `DEX` muda todas as fórmulas); (3) a fórmula é lida por um **analisador próprio** de expressões (dados, números, variáveis, `+`/`-`, talvez parênteses e `*`), **nunca `eval`** (segurança: o texto vem de jogadores); (4) no multiplayer, **o servidor sorteia** e calcula, como nos dados de hoje.
  - Perguntas em aberto desse sistema: sintaxe das áreas e das variáveis; modificador derivado (ex.: `DEX` calculado a partir do atributo, ou digitado direto?); variável inexistente (erro visível na ficha); vantagem/desvantagem e críticos dentro da expressão; dados de dano separados do ataque; condições e bônus temporários que mudam as variáveis.
- **Em aberto (conversa anterior):** uma ficha pode ter vários tokens (ex.: 5 goblins com a mesma ficha-modelo, cada um com a própria vida)? Quem vê a ficha (só o dono e o mestre, ou uma parte pública)? A ficha mora na mesa ou na conta do jogador (ver a "carteira" e a hospedagem acima)? O personagem precisa existir como objeto próprio desde já?

### Fichas como DOCUMENTOS no servidor (decidido em conversa; CRIAR, EDITAR e EXCLUIR estão implementados; a ligação com token, ainda NÃO: o dono quer deixar para mais tarde)
- **Onde fica:** a carteira (bolsa) tem duas abas, **Tokens** e **Fichas** (a aba já existe, só como lugar reservado). A aba Fichas é a **área de criar fichas novas** (como "Criar token" é a dos tokens).
- **Cada ficha é um DOCUMENTO próprio**, guardado **no servidor** (arquivo na máquina do mestre): dá para abrir de novo e **sobrescrever** ao salvar. Formato: **um arquivo JSON por ficha** (`id`, `nome`, `dono`, `abas`, `versao`, datas). `abas` é uma lista de 1 a 6 páginas `{ nome, texto }` **dentro do mesmo arquivo**: cada aba tem as suas rolagens e as variáveis valem para a ficha toda (arquivos antigos, só com `texto`, são lidos como uma aba "Página 1"). O nome do arquivo é só o `id` gerado pelo servidor, nunca texto digitado por alguém (evita `../`). Gravação **atômica** (escreve num arquivo temporário e renomeia). É a primeira persistência do projeto e a base do backup.
- **O MESTRE gera a ficha para o jogador poder controlá-la:** o mestre cria a ficha e a atribui a um jogador (campo `dono`); a partir daí o jogador a edita. O mestre também pode criar fichas sem dono (NPCs, monstros) e editar qualquer uma.
- **Por enquanto só o MESTRE vê as fichas** (decisão do dono). Ver a ficha do próprio jogador, e o que é público, fica para depois.
- **Ligação com o token: ADIADA** (decisão do dono). A ficha existe sozinha; o campo `fichaId`/`personagemId` no token vem depois.
- **Conflito de edição (decidido pelo dono: ficha COM VERSÕES; IMPLEMENTADO):** cada ficha leva um número de `versao`; o servidor recusa um salvamento feito sobre uma versão antiga ("esta ficha mudou, recarregue"), para duas pessoas não apagarem o trabalho uma da outra sem perceber. Alternativa mais simples: a última a salvar vence.
- **Excluir (decidido pelo dono: SIM, com tela de confirmação):** **excluir token está FEITO** (direto na engrenagem e no menu da ficha da bolsa, com a caixa de confirmar do jogo; apaga o arquivo). **Excluir ficha também está FEITO** (clique direito no documento da grade, ou a tecla Delete; apaga o arquivo; com a caixa de confirmar).
- **Criar = um clique, arquivo na hora (decidido pelo dono; IMPLEMENTADO):** o botão "+ Criar ficha" cria na hora uma ficha vazia ("Ficha N", versão 1) e o arquivo dela. Não se espera o texto ficar pronto: escrever pode levar muito tempo, e a pessoa pode abrir e fechar. O nome e o texto se definem ao abrir/editar (a versão sobe a cada salvamento).
- **Organização (decidido pelo dono; IMPLEMENTADO a grade):** a aba Fichas é uma **grande GRADE de documentos, como a de tokens** (folha + nome + versão); o mestre clica num documento para **abrir e editar quando quiser** (abrir/editar: NÃO implementado).
- **Pasta de dados (decidido pelo dono; IMPLEMENTADO):** `dados/fichas/` e `dados/tokens/`. As **pastas** vão no git e no pacote (para existirem), o **conteúdo nunca** (git, GitHub, download do usuário final): é do dono do servidor, que o customiza. `.gitignore` com `.gitkeep`; `DADOS=` troca o lugar.
- **TOKENS são arquivos em `dados/tokens/<id>.json` (decisão do dono; IMPLEMENTADO):** o app não tem token de fábrica (a mesa começa vazia); o servidor carrega a pasta ao ligar e grava criar, editar, mover e excluir. O arquivo é só o id (o nome do token fica DENTRO do JSON: nome em caminho de arquivo é inseguro, repete e renomear não é atômico). A imagem do token fica dentro do JSON, em base64. **Em aberto:** as condições ainda não são gravadas; como o dono edita à mão com segurança (um formato de validação mais claro, mensagem de erro por campo); duplicar token; modelos de token.
- **Limites hoje:** `MAX_FICHAS` = 200; o texto de uma ficha terá no máximo `MAX_CARACTERES_TEXTO_FICHA` = 25000 caracteres (cerca de 8 páginas de Word; escolha do dono) (recusado, não cortado); a mensagem da rede é de no máximo 256 KB (cabe a imagem de um token e o texto de uma ficha).
- **Em aberto:** muitos arquivos (não é problema para centenas de fichas; para milhares, índice ou SQLite); modo local (sem servidor): as fichas ficam só na memória da aba (hoje) ou no `localStorage`?; renomear a ficha (ao salvar); quem vê o quê quando houver papéis (hoje, online, todos veem as fichas).

### Variáveis, rolagens e o MENU DE ROLAGENS DO TOKEN (decidido em conversa)
- **Sintaxe decidida (IMPLEMENTADA a leitura e o cálculo, em `src/formulas.ts`):** variável = uma linha `NOME:: valor` (o valor é uma conta com outras variáveis; a divisão arredonda para baixo, como no D&D). Rolagem = **`(Nome)[fórmula]`**: o **NOME fica entre parênteses, colado aos colchetes da fórmula**, e serve de **referência visual** (é o que o jogador lê no menu); sem nome vale a própria fórmula. Exemplo: `(Ataque com espada)[1d20 + MOD_FOR + PROF]`. No editor da ficha o texto é colorido (variáveis, nome da rolagem e fórmula; erro com sublinhado vermelho), um painel lateral mostra as variáveis e as rolagens já calculadas e as dicas de uso ficam sempre à vista; o botão "Instruções" (só na tela expandida das fichas) explica tudo com exemplos.
- **MENU DE ROLAGENS DO TOKEN (decisão do dono; NÃO feito):** quando um token estiver **ligado a uma ficha**, o **clique direito** nele mostra um **menu de rolagens** com **todas as rolagens que aparecem na ficha dele e têm uma fórmula**, cada uma identificada pelo seu NOME (a referência visual). Clicar numa rolagem a **executa** (o servidor sorteia, como nos dados de hoje) e o resultado vai para o chat, com o nome da rolagem. Depende de uma coisa ainda por fazer (a outra já está pronta): **(1) a ligação ficha ↔ token** (adiada por pedido do dono, "para mais tarde") e **(2) o servidor rolar a fórmula: FEITO** (`rolar_ficha`: o servidor sorteia e o chat tem o cartão com o nome da rolagem; falta só o menu no token). Esse menu deve entrar junto com a lista de ações do token ("Add condição"...) ou na engrenagem (a decidir).
- **ROLAGENS SECRETAS (ideia do dono; NÃO feito):** **clicar com o botão DIREITO numa rolagem a faz em SEGREDO** (em vez do clique esquerdo, que rola para todos). Vale onde houver rolagens clicáveis: o nome da rolagem no texto da ficha, o item da lista no editor e o futuro menu de rolagens do token. Pontos a decidir: **quem vê** o resultado (só o mestre? o mestre e quem rolou?), **como aparece no chat** (um cartão marcado como "secreta", com um cadeado, só para quem pode ver; e o que os outros veem: nada, ou "Ana fez uma rolagem secreta"), se o mestre pode "revelar" depois, e se o histórico do chat guarda a rolagem secreta. **Depende de papéis** (mestre × jogador), que ainda não existem. No servidor, a mensagem secreta precisa ser enviada só aos que podem ver (nunca a todos com o navegador escondendo: um navegador alterado a mostraria).
- **Em aberto:** rolagem com erro (variável inexistente...) aparece no menu desabilitada, com o motivo, ou fica fora?; vantagem/desvantagem (`2d20kh1`), crítico e dano separado do ataque; funções `min`/`max`/`piso`; variáveis automáticas do D&D (modificadores, bônus de proficiência por nível); quem pode rolar a ficha de quem (hoje, online, todos veem tudo); o nome do personagem no cartão do chat; linhas de anotação com `::` que viram "variável com erro" (falso positivo conhecido).

### Ideias malucas
-

## 4. Páginas / telas
| Página | Objetivo | Observações |
|--------|----------|-------------|
| Mesa (tabuleiro) | Jogar | Existe como protótipo |
| Home   |          |             |
|        |          |             |

## 5. Visual e tom
- Hoje: tema escuro, tokens como círculos coloridos, ícones de condição pretos/brancos sobre disco claro.
- Estilo (colorido, minimalista, retrô, madeira/tabuleiro físico...)
- Referências de sites que você gosta:
- Cores / fontes: a fonte da interface vem do sistema (`system-ui`); no computador do dono do projeto ela aparece **monoespaçada**. Definir uma lista de fontes fixa deixaria a interface igual em qualquer máquina.

## 6. Tecnologia
- **Front-end:** PixiJS 8 + TypeScript + Vite (decidido).
- **Servidor (a decidir):** sugestão de Node.js + TypeScript, para compartilhar tipos e o `estado.ts` / `condicoes.ts` com o front-end.
- Banco de dados / login: **decidido o desenho** (ver "Hospedagem, contas e salvamento"): estado da mesa em arquivos na máquina do mestre; cadastro/login num site central. Em aberto: qual login (Discord/Google ou senha própria) e onde hospedar o site central.
- Onde vai ficar hospedado? Servidor de cada mesa: na máquina do mestre, com túnel grátis. Site central: a decidir (hospedagem grátis basta no começo).

## 7. Conteúdo
- Textos, imagens, regras de jogos, etc. — quem produz e de onde vem?
- Imagens de tokens e mapas: upload do usuário, banco próprio, ambos?
- **Ícones das condições:** estão em `public/images/condicoes/` (256×256); os originais de 1024×1024 estão em `assets-originais/condicoes/`. **`Morto.png` e `Inconsciente.png` foram gerados** (a imagem de referência não tinha os arquivos) e podem ser trocados por ícones seus, com o mesmo nome de arquivo.
- **Descrições das condições:** tradução do resumo "Conditions" que você enviou. Conferir se o texto bate com as regras que a sua mesa usa.

## 8. Perguntas em aberto
- **"Sangrando":** não existe na imagem de descrições; usa o texto de *Death* (testes de morte). Está certo, ou na sua mesa "sangrando" é outra coisa (ex.: dano por turno)?
- **"Morto" e "Inconsciente":** os ícones são provisórios (gerados). Quer trocar? "Inconsciente" aparece só como ícone no anel; quer também uma marca no token (como o X do Morto)?
- **Condição sem ícone no catálogo:** *Burning* (queimando), que está na imagem. Quer adicioná-la? Precisamos do ícone.
- **Limite de ícones:** interpretei "máximo −1 do limite atual" como o número de ícones visíveis (5 → 4). Se era outro máximo (zoom, tamanho do token...), é só dizer.
- **Barra de ferramentas × painéis:** o painel de condições, quando abre para cima num token baixo, cobre a barra de ferramentas do canto superior direito enquanto está aberto. Aceitável, ou prefere evitar?
- **Balão depois de arrastar:** depois de soltar um token, o balão de condições só reaparece quando o mouse sai do token e volta (o PixiJS só avisa "entrou" na entrada). Preferem que reapareça logo após soltar?
- **Imagem de fundo (decidido):** presa ao tabuleiro, esticada sobre todas as colunas/linhas; o usuário ajusta colunas/linhas à mão até casar com a grade, e **não usa imagens com margens/bordas**. Em aberto: ao trocar de mapa, ajustar o tabuleiro à proporção da imagem automaticamente?, mostrar a proporção da imagem × a do tabuleiro, limite de tamanho de textura da GPU.
- **Guia de ajuste da grade (ideia do dono, para quando houver botão de imagem):** ao colocar um mapa, dar dicas de como alinhar a grade. Ajustar primeiro só as colunas (linhas verticais) e depois só as linhas (horizontais), ou o contrário. Possíveis dicas: mostrar passo a passo ("1. ajuste as colunas até as linhas verticais coincidirem; 2. ajuste as linhas"), destacar na tela só o eixo que está sendo ajustado, avisar quando a proporção do tabuleiro bater com a da imagem, e lembrar de usar imagens sem margens/bordas.
- **Descobrir colunas/linhas de antemão (ideia do dono, junto do botão de imagem):** (1) mostrar o tamanho da imagem em pixels; (2) campo "pixels por casa": o site calcula colunas = largura ÷ px e linhas = altura ÷ px e avisa se a divisão não der inteira (sinal de medida errada ou margem na imagem); (3) ferramenta "Calibrar": arrastar um quadrado sobre uma ou várias casas do mapa e o site propõe colunas/linhas; (4) talvez detecção automática do espaçamento da grade como sugestão (falha em mapas sem grade desenhada). Em qualquer caso o jogador ainda ajusta o último número à mão.
- **Tokens ao encolher o tabuleiro:** hoje são puxados para dentro e podem ficar na mesma casa. Preferem bloquear a remoção de colunas/linhas que contenham tokens?
- **Tokens grandes ao soltar:** o token arrastado fica por cima dos outros até ser reordenado. Os maiores devem voltar para baixo ao soltar?
- **Auto-pan:** a câmera deve andar sozinha ao arrastar um token até a borda da janela?
- **Barra "fixada":** hoje é fixa no canto. Querem poder arrastá-la para outro lugar ou fixá-la/soltá-la com um alfinete?
- **Formato dos tokens:** círculos hoje; com imagens, recorte circular ou quadrado?
- **Quem pode aplicar condições:** só o mestre, ou cada jogador nos seus próprios tokens? (hoje qualquer um; entra nas regras de permissão do servidor)

## 9. Próximos passos
- [x] Escolher tecnologias do tabuleiro (PixiJS + TypeScript + Vite)
- [x] Primeira versão do tabuleiro: grade, tokens arrastáveis, pan, zoom
- [x] Tamanhos de token (1×1 a 4×4) e engrenagem de opções
- [x] Separar o código em módulos
- [x] Condições nos tokens (ícones, "+N", balão, descrições, Morto com X vermelho, Inconsciente)
- [x] Ajustar o tabuleiro à janela ao abrir
- [x] Menu do token afastado do token e com painéis que abrem para cima
- [x] Imagem de fundo (teste fixo, presa ao tabuleiro)
- [x] Calibrar grade (arrastar um retângulo sobre N×N casas do mapa)
- [x] Botão "Escolher mapa" (arquivo local; falta enviar ao servidor)
- [x] Régua (com curvas)
- [x] Desenho livre (lápis, borracha e formas)
- [x] Bolsa de tokens em três tamanhos, com criação, edição, nome, imagem e pesquisa de tokens
- [x] Dados e chat (interface no navegador; falta o servidor sortear e distribuir)
- [x] **Protótipo do servidor** (Node + `ws`, na máquina do mestre): dois navegadores veem o mesmo tabuleiro; sincroniza soltar token (mapa e bolsa), chat e dados, com sorteio no servidor e as regras de segurança aplicadas; testado só no próprio computador, com duas abas (`servidor/servidor.ts`, `tests/e2e/rede.teste.mjs`)
- [ ] Servidor em tempo real: migrar o RESTO das ações (criar e editar tokens, imagens, condições, desenho, régua, mapa, tamanho do tabuleiro), salas, permissões (mestre e jogadores) e salvamento do estado em arquivo (1ª fase)
- [ ] Túnel (Cloudflare rápido) para os amigos entrarem; testar de verdade
- [ ] Site central: cadastro/login, código de conexão e token assinado (2ª fase)
- [ ] Contas e papéis (mestre/jogador) com validação no servidor
- [ ] Fichas de personagem (os dados já existem no navegador)
- [ ] Esboçar as páginas além da mesa
