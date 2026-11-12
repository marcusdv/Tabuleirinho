# CLAUDE.md — Tabuleirinho

## Sobre o projeto
**Tabuleirinho**: uma mesa virtual (VTT) de RPG no navegador, inspirada no Roll20, com foco inicial em **D&D 5.5** (edição 2024). O jogo será online em tempo real: o mestre (DM) controla tudo e cada jogador controla o que é seu. Decisões de produto e ideias em aberto ficam em `BRAINSTORM.md`.

## Estado atual
- **Só o tabuleiro existe** (protótipo rodando local, sem servidor, sem contas, sem persistência).
- Já funciona: grade, tokens arrastáveis com encaixe, pan, zoom (e "ajustar à tela"), mudar colunas/linhas, tokens de 1×1 a 4×4, barra de ferramentas flutuante e retrátil.
- **Condições nos tokens:** 18 condições (ícones em anel, distintivo "+N", balão ao passar o mouse, descrições). *Morto* risca o token com um **X vermelho**.
- Clique direito num token: **engrenagem** (tamanho) no canto superior **direito** e, no canto superior **esquerdo**, uma **lista de ações** ("Add condição", e os provisórios "Add dano" e "Add cura").
- **Imagem de fundo (teste):** `public/images/maps/cachoeira.png`, carregada ao abrir (`MAPA_INICIAL` em `config.ts`). A barra tem **"Escolher mapa"** (seção Mapa): abre o seletor de arquivos e troca a imagem (endereço `blob:` temporário, só nesta aba; recusa o que não é imagem e imagens maiores que o limite de textura da placa de vídeo). O tamanho do tabuleiro NÃO muda ao trocar o mapa. A ferramenta "Calibrar grade" (barra, seção Mapa) ajuda a achar colunas/linhas.
- Ainda não existe: servidor/multiplayer, enviar o mapa a outros jogadores, régua, desenho livre, fichas, dados, chat, fog of war.

## Stack
- **PixiJS 8** (desenho do tabuleiro, WebGL) + **TypeScript** + **Vite**.
- Interface em volta do tabuleiro (barra, menus, balões) é **HTML/CSS puro**, sem framework.
- Servidor (futuro): Node.js + WebSocket, com o servidor como fonte da verdade (ver `BRAINSTORM.md`).

## Comandos
- `npm install` — instala as dependências.
- `npm run dev` — servidor de desenvolvimento (http://localhost:5173), recarrega ao salvar.
- `npm run build` — checa os tipos e gera a versão final em `dist/`.
- `npx tsc --noEmit` — só checa os tipos (rápido, sem navegador).
- **Testes e2e (ponta a ponta) em `tests/e2e/`**: abrem o site num Chrome sem janela e clicam, arrastam e digitam como uma pessoa. Com `npm run dev` ligado, rodar `npm run test:e2e` (todos) ou `npm run test:e2e -- chat bolsa` (só os que têm esses nomes no arquivo). Cada teste é `nome.teste.mjs`; o que eles dividem fica em `tests/e2e/ajuda.mjs` (abrir a página, `ok()`, `lerEstado`, `lerCamera`...). Para ser rápido, os testes **trocam o mapa de verdade por um mapa liso** (sem mudar o app) e **esperam a página avisar que está pronta** (`window.__tabuleirinho.pronto`, um gancho que só existe no `npm run dev` e não vai para a versão final) em vez de esperar tempos fixos. Prefira **ler o estado/câmera pelo gancho** (`lerEstado`, `lerCamera`) a medir pixels: é mais rápido e não quebra quando entram painéis novos na tela. **Ao mudar a interface, rodar os testes e ajustar os que dependem do que mudou** (coordenadas, textos, tamanhos): a maioria dos "FALHA" que apareceram até aqui eram testes desatualizados, e não bugs. Ainda NÃO migrados (testes antigos, escritos para o tabuleiro 24×12, a refazer): condições, balão de condições, engrenagem/tamanho do token, pares de tokens, morto/inconsciente. Também vale conferir em janelas pequenas (ex.: 1024×768) e com fontes diferentes (a do sistema do dono do projeto é monoespaçada): em janela grande com fonte normal tudo cabe e problemas de enquadramento não aparecem.

## Estrutura do código (`src/`)
```
main.ts               só cria os módulos e os liga (sem lógica)
config.ts             todas as constantes (tamanho da casa, limites de zoom, ícones, menus, balão...)
condicoes.ts          catálogo das condições: id, nome, descrição, visual (só dados, sem PixiJS)
desenhos.ts           geometria pura dos desenhos e da régua (borracha, distância, texto "4 □ = 6 m")
estado.ts             DADOS e regras: tokens, colunas/linhas, mover, redimensionar, condições (sem PixiJS)
coordenadas.ts        funções puras de coordenadas e do anel de ícones (sem PixiJS)
tabuleiro/
  camera.ts           mundo do PixiJS, pan, zoom, ajustar à janela, limites, tela <-> mundo
  ferramenta.ts       contrato das ferramentas de arrasto (ativa, medindo, comecar/arrastar/soltar)
  desenho.ts          pinturas no mapa: lápis, borracha, elipse, retângulo, triângulo (por baixo dos tokens)
  regua.ts            régua: mede de uma casa a outra (por cima de tudo)
  calibragem.ts       ferramenta "Calibrar grade": retângulo de medição sobre o mapa
  mapa.ts             imagem de fundo, esticada sobre o tabuleiro inteiro (fica por baixo da grade)
  grade.ts            grade quadriculada e destaque da casa de destino
  tokens.ts           desenho e arrasto dos tokens: corpo, X do Morto, ícones de condição
  iconesCondicoes.ts  carrega as imagens das condições (texturas com mipmaps)
  interacao.ts        eventos do mouse no palco: pan e repasse para os tokens
ui/
  barra.ts            barra de ferramentas (zoom, ajustar, colunas, linhas, recolher)
  menuToken.ts        engrenagem, lista de ações ("Add condição"...), painel de tamanho e painel de condições
  chat.ts             chat embaixo: mensagens da esquerda para a direita, animações e barra de rolagem própria
  bolsa.ts            a bolsa (canto inferior direito): fichinhas dos tokens guardados e arrasto que começa nela
  painelDesenho.ts    painel da esquerda: ferramentas, cores (pilha de recentes + branco/preto) e Apagar tudo
  painelCalibragem.ts painel da calibragem (campo de N casas, resultado, Concluir)
  balaoToken.ts       balão com as condições do token (ao passar o mouse)
  dicaCondicao.ts     balão com a DESCRIÇÃO de uma condição (compartilhado)
public/images/condicoes/   ícones PNG 256×256 das condições (o nome do arquivo é o id da condição)
assets-originais/condicoes/ originais 1024×1024 dos ícones (backup; não é servido nem entra no build)
```
O HTML e o CSS da barra, dos menus e dos balões ficam em `index.html` (os módulos de `ui/` só ligam os botões pelos ids).

## Convenções
- **Estado separado do desenho.** `estado.ts` guarda os dados e as regras; `tabuleiro/` e `ui/` só desenham e reagem. Toda mudança nos dados passa por uma função de `estado.ts` (`moverToken`, `redimensionarTabuleiro`, `mudarTamanhoToken`, `alternarCondicao`), e depois o desenho é atualizado. Isso prepara o multiplayer: essas funções serão o ponto onde enviaremos eventos ao servidor.
- **Posições em casas, não em pixels.** `col`/`row` de um token é o **canto superior esquerdo** do seu bloco; `size` é o lado em casas (1 a 4). Pixels só existem no desenho.
- **Condições são guardadas por id** (`token.condicoes: string[]`, na ordem em que foram aplicadas). O `id` é o nome do arquivo do ícone, sem acento. Para criar uma condição: PNG em `public/images/condicoes/` + uma entrada em `condicoes.ts`. O campo opcional `visual` muda como ela aparece no token (`"x-vermelho"` = X por cima do token, sem ocupar lugar no anel).
- **Constantes só em `config.ts`.** Não espalhar números mágicos pelo código.
- **Módulos de `tabuleiro/` e `ui/` são fábricas** (`criarCamera`, `criarGrade`, `criarTokens`...) que recebem suas dependências e devolvem um objeto com a API. Os avisos sobem por callbacks (`aoClicarDireito`, `aoMudarZoom`...), e `main.ts` conecta tudo.
- **Painéis do menu do token abrem PARA CIMA** (acima dos botões), para nunca cobrir o token. A altura é limitada ao espaço livre acima, com rolagem se preciso; só vão para baixo se acima não houver espaço útil (`ALTURA_MIN_PAINEL`). **Vale para todo painel novo:** registrá-lo em `paineis` no `menuToken.ts`. O balão do token (ao passar o mouse) segue a mesma ideia: acima, com altura máxima e rolagem, passando para baixo só se faltar espaço.
- **A descrição da condição (`dicaCondicao`) é compartilhada** pelo menu e pelo balão do token, por isso tem **dono**: `esconder(dono)` só esconde se a descrição foi aberta por esse painel. Sem isso, o temporizador do balão apagava a descrição do menu.
- **Código em português** (nomes e comentários) e **bem comentado**, de forma didática: o dono do projeto quer entender como cada parte funciona.
- **Distâncias nas descrições em metros** (5 pés = 1,5 m), como no livro em português.
- Tokens maiores são desenhados por baixo dos menores. Sobreposição de tokens é permitida.

## Como trabalhar neste projeto
- Responder em português do Brasil.
- Antes de executar ações (ler/editar arquivos, rodar comandos, instalar pacotes), explicar o que vai fazer e por quê.
- Ao terminar, explicar o que foi feito.
- Se algo falhar, explicar o motivo antes de tentar de novo.
- **O dono do projeto também edita o código** (valores em `config.ts`/`estado.ts`, por exemplo). Reler o arquivo antes de editar e não desfazer mudanças dele.
- **O servidor do Vite pode ficar com uma versão antiga de um arquivo** quando vários `Edit` seguidos mudam o mesmo arquivo em sequência muito rápida (já aconteceu: o X do Morto "não aparecia" porque a última edição não tinha sido recompilada). Depois de editar, conferir o que é servido (`curl http://127.0.0.1:5173/src/<arquivo>.ts`) ou "tocar" os arquivos (`touch`) para forçar a recompilação. Diante de "o código está certo mas não funciona", suspeitar disso primeiro.
- Consultar `BRAINSTORM.md` antes de tomar decisões de produto ou design; se algo estiver em aberto, perguntar.
- Preferir soluções simples; não adicionar dependências sem necessidade.
- Ao registrar uma interpretação de pedido ambíguo (ex.: qual "máximo" mudar), dizer qual foi usada para o dono poder corrigir.

## Decisões tomadas
- **PixiJS** (e não Konva) para o tabuleiro: o objetivo inclui fog of war e iluminação dinâmica, em que o PixiJS aguenta bem e uma biblioteca de canvas 2D comum não.
- **Vite** só como ferramenta de build/desenvolvimento (sem Next: não há páginas, SSR nem API no front-end).
- **Encaixe de tokens pelo canto superior esquerdo** (`Math.round`), limitado para o token caber inteiro no tabuleiro. Funciona para tamanhos pares e ímpares.
- **Zoom em torno do centro da janela**; a câmera nunca deixa o tabuleiro sair todo da tela (margem de 64 px).
- **Ao abrir, o zoom é ajustado para o tabuleiro caber inteiro na janela** (no máximo 100%), e o botão "Ajustar à tela" volta a essa visão. Sem isso, em janelas menores os tokens das pontas ficavam fora da tela e pareciam ter sumido.
- Ao **encolher o tabuleiro**, tokens que ficariam fora são puxados para dentro (podem acabar na mesma casa).
- Ao **aumentar um token** perto da borda, ele é empurrado para dentro, mantendo o canto superior esquerdo sempre que couber.
- **Barra de ferramentas** flutuante, fixa no canto superior direito e retrátil, por cima do canvas.
- **Menu do token:** aparece **acima** do token, com um vão (`AFASTAMENTO_OPCOES_TOKEN`): a **lista de ações** (de cima para baixo: "Add condição" = primeiro item, depois "Add dano" e "Add cura", estes dois PROVISÓRIOS e sem função, pois ainda não há vida/PV) alinhada à borda esquerda do token, e a **engrenagem** alinhada à borda direita. Em token estreito (ex.: 1×1) a lista chega até o canto direito, e a engrenagem vai para a direita da lista. Cada painel abre para cima a partir do seu botão (condições: do "Add condição"; tamanho: da engrenagem). Fecham com clique fora, Esc, zoom, pan ou começar a arrastar. Novos itens da lista: botão com a classe `acao-token` dentro de `#acoes-token`.
- **Condições:** ícones em anel na borda do token, o primeiro no topo e os outros em sentido horário. No máximo **4 ícones** (`MAX_ICONES_CONDICAO`); com mais, o 5º lugar vira um distintivo "+N". A única forma de remover uma condição é clicar de novo nela no painel "Add condição". **"Morto" é sempre o último da lista** (fora da ordem alfabética) e desenha um X vermelho com contorno escuro, sem ocupar lugar no anel nem entrar na conta do "+N".
- **Balão ao passar o mouse no token** lista todas as condições; o mouse tem **0,4 s** para ir do token até o balão, e no balão cada condição mostra a descrição. Tem altura máxima (`ALTURA_MAX_BALAO`) com rolagem. A descrição também aparece ao passar o mouse numa condição do painel "Add condição".
- **Ícones das condições** são PNGs 256×256 (reduzidos dos originais de 1024) com mipmaps ligados, desenhados sobre um disco claro (os PNGs são pretos/brancos com fundo transparente e sumiriam no tabuleiro escuro).
- **Ícones gerados por mim:** `Morto.png` (X vermelho) e `Inconsciente.png` (rosto dormindo com "Zz"); a imagem de referência não tinha os arquivos. Podem ser trocados por ícones do dono do projeto (mesmo nome de arquivo).
- **Descrições das condições** vêm da imagem "Conditions" enviada pelo dono, traduzidas para português. "Sangrando" não existe nessa imagem: usa o texto de *Death* (testes de morte). "Morto" também não existe: a descrição só explica o que é, sem regras inventadas. *Burning* continua sem ícone nem entrada no catálogo.
- **Painel de condições** se dimensiona pelo nome mais comprido (`width: max-content`, 4 colunas iguais, nomes sem quebra de linha), para funcionar com qualquer fonte do sistema.
- **Imagem de fundo presa ao tabuleiro:** é esticada para cobrir todas as colunas e linhas; o usuário ajusta colunas/linhas manualmente até os quadrados do mapa casarem com a grade. **Imagens sem margens nem bordas** (decisão do dono). Sem mapa, a grade pinta o fundo escuro; com mapa, não pinta e usa linhas pretas semitransparentes. Colunas e linhas independentes esticam a imagem (ela só volta à proporção quando as contagens estão certas).
- **Calibrar grade:** com a ferramenta ligada, o botão esquerdo arrasta um retângulo sobre N×N casas do mapa e `gradeParaCasar` (em `coordenadas.ts`) calcula colunas/linhas por regra de três, em cada eixo à parte; os botões direito/do meio fazem pan; os tokens ficam sem mouse (`tokens.definirInterativo`). A **grade do tabuleiro fica escondida** enquanto calibra (`grade.definirVisivel`), para só aparecer a grade do mapa. O painel fica no **canto inferior direito**, empilhado acima da bolsa (em janelas com menos de 720 px de altura ele vai para baixo, à esquerda, ao lado do painel de desenho, para não se sobrepor à barra). O resultado é limitado a MIN/MAX_CASAS e o painel avisa. As dicas para o jogador estão em `BRAINSTORM.md` ("Ajudas ao jogador").
- **Bolsa de tokens:** painel no canto inferior direito (HTML, `ui/bolsa.ts`). Arrastar um token do mapa até ela o **guarda** (`token.guardado = true`: some do mapa, mantém tamanho, cor e condições); arrastar a fichinha para o mapa o **coloca** na casa onde soltar (encaixado); soltar de volta na bolsa mantém guardado. O arrasto que começa na bolsa é acompanhado pelo documento (o clique nasce fora do canvas) e repassado a `tokens.iniciarArrastoDaBolsa/arrastarPara/soltar`; quem decide "está sobre a bolsa" é `bolsa.contem` (retângulo do elemento). O estado só muda ao SOLTAR (`guardarToken`/`colocarToken` em `estado.ts`). O painel da calibragem fica empilhado acima da bolsa (`#canto-inferior-direito`). Durante a calibragem, a bolsa não solta tokens.
- **Câmera livre:** o tabuleiro pode ser arrastado para qualquer lado, desde que `PARTE_VISIVEL_CAMERA` (240 px de tela, por eixo) dele continue visível. Não há mais centralização forçada quando o tabuleiro cabe na janela. "Ajustar à tela" e "Voltar ao padrão" centralizam.
- **Colunas e linhas** podem ser digitadas na barra (Enter ou sair do campo aplica; limitado a 5–100; vazio volta ao valor atual).
- **Tamanho inicial do tabuleiro: 18 × 10** (`COLUNAS_INICIAIS`/`LINHAS_INICIAIS`). O botão **"Voltar ao padrão"** da barra devolve o tabuleiro a esse tamanho, o zoom a 100% e centraliza a visão (tokens que ficariam fora são puxados para dentro). Ao mudar o tamanho inicial, conferir se os tokens iniciais de `estado.ts` cabem.
- **Ferramentas de arrasto** (calibrar grade, régua, lápis, borracha, elipse, retângulo, triângulo) seguem o contrato de `tabuleiro/ferramenta.ts`: com uma ligada, o botão esquerdo é dela, os tokens ficam sem mouse e o direito/do meio move a visão. **Só uma fica ligada por vez** (`escolherFerramenta` em `main.ts`); "Mover" (ou Esc) é o normal. A bolsa também não solta tokens com uma ferramenta ligada.
- **Painel de desenho** (esquerda, recolhível). **Régua:** de uma casa a outra, distância = maior diferença entre colunas e linhas (diagonal = 1 casa), 1 casa = `METROS_POR_CASA` = 1,5 m, texto "4 □ = 6 m" (no mapa e no painel); a medida some ao trocar de ferramenta e não é guardada. **Desenhos** ficam em `estado.desenhos`, em CASAS, por cima do mapa e da grade e **por baixo dos tokens** (um desenho sob um token fica escondido por ele). Elipse, retângulo e triângulo são definidos pela caixa entre os dois cantos do arrasto e são **só contorno**. **Borracha:** apaga o desenho inteiro cujo contorno/traço ela tocar (não pixel a pixel; tocar no meio vazio de uma forma não apaga). **Apagar tudo** pede confirmação e fica desativado sem pinturas.
- **Cores do desenho:** 8 amostras = 6 recentes (pilha: a última cor USADA para desenhar vai para a frente, a mais antiga sai; escolher sem desenhar não reordena) + branco e preto sempre no fim (nunca entram na pilha). Constantes em `config.ts`.
- **Calibrar grade:** o padrão é um retângulo de **5 × 5** quadrados.
- **Chat (só a interface, `ui/chat.ts`):** fixo embaixo, no centro (até 680 px de largura e ~148 de altura; mínimo de 420 px em janelas estreitas, definido pelo dono; a largura é `100vw − 720px` para reservar a coluna da direita). As mensagens correm da **esquerda para a direita**: a **mais nova entra na ponta esquerda** e empurra as anteriores para a direita (as antigas saem pela direita); a roda do mouse rola a faixa na horizontal. Cada mensagem é um cartão (autor, hora, texto) e o texto entra por `textContent` (nunca como HTML). As mensagens ficam em `estado.mensagens` (`adicionarMensagem`, no máximo `MAX_MENSAGENS_CHAT` = 100; o autor é provisório, `AUTOR_PROVISORIO` = "Você"). **Limite de 72 caracteres** (`MAX_CARACTERES_MENSAGEM`): o campo corta ao digitar/colar, o contador mostra "N/72", e a regra também vale em `adicionarMensagem` (o servidor precisará dela). Placeholder do campo: só "Escreva uma mensagem"; a faixa vazia não tem texto de dica.
- **Animações do chat:** a mensagem nova entra com fade + deslize e as que já estavam deslizam para a direita (técnica **FLIP**: o layout já está na posição final e cada cartão anima `transform` a partir de onde estava, sem recalcular layout por quadro). Se chega outra mensagem no meio, cada cartão continua de onde está (lê o `transform` atual antes de reiniciar). Só os primeiros `MAX_CARTOES_ANIMADOS` cartões animam; `prefers-reduced-motion` desliga tudo. O chat é **incremental** (um mapa id -> cartão): só se insere o novo.
- **Barra de rolagem do chat:** a nativa está escondida; a barra é PRÓPRIA (`#chat-rolagem`), em cima das mensagens, só uma trilha fina com um cursor dourado de largura proporcional ao que está visível (mínimo 24 px), que arrasta, rola ao clicar na trilha e acompanha a roda do mouse, o teclado, mensagens novas e o redimensionamento (`ResizeObserver`). Sem o que rolar, fica apagada.
- **Janelas baixas (< 720 px):** o painel da calibragem fica embaixo, ao lado do painel de desenho e acima do chat (`bottom: 172px`; ajustar se a altura do chat mudar). Com o chat no mínimo de 420 px, em janelas com menos de ~1120 px de largura ele pode cobrir parte do painel da calibragem enquanto ela está aberta..
- **Sobreposição de tokens permitida.**
