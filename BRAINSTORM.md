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
- Estado salvo em banco para a mesa continuar no dia seguinte.

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
- Engrenagem do token (clique direito), com aumentar/diminuir o tamanho.
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

### Régua e desenho (feitos; ideias e perguntas)
- Já funciona: régua (1 casa = 1,5 m), lápis, borracha, elipse, retângulo, triângulo, cores recentes e "Apagar tudo".
- **Em aberto:** (1) a diagonal da régua conta 1 casa; preferem a regra 5-10-5 do D&D (a cada duas diagonais, uma conta dobrada)? (2) a borracha apaga o desenho inteiro; querem apagar pedaços (pixel a pixel)? (3) as formas não "encaixam" na grade; querem encaixe nos cantos das casas (útil para áreas de magia)? (4) círculo/cone/linha de área de efeito como formas prontas; (5) desfazer/refazer; (6) quem pode desenhar: só o mestre, ou cada jogador (e se os desenhos podem ser privados); (7) os desenhos ainda não são salvos nem enviados (entram junto com o servidor).

### Bolsa de tokens (feita; ideias para evoluir)
- Já funciona: guardar arrastando o token até a bolsa; colocar arrastando a fichinha para o mapa.
- **Multiplayer:** a bolsa é a candidata natural a "carteira" de cada jogador: o que está guardado não aparece para os outros, e o mestre vê todas.
- Ideias: mostrar as condições na fichinha, dar nome aos tokens, outros itens além de tokens (dinheiro, objetos), recolher/expandir a bolsa, limite de itens.
- **Em aberto:** a bolsa fica no canto da JANELA (como hoje) ou presa ao mapa? Soltar o token na bolsa deve pedir confirmação?

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
- Precisa de banco de dados / login? (sim, para salvar mesas e separar mestre/jogadores; escolha em aberto)
- Onde vai ficar hospedado?

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
- [ ] Régua
- [ ] Desenho livre
- [ ] Servidor em tempo real (WebSocket) e salas
- [ ] Contas e papéis (mestre/jogador) com validação no servidor
- [ ] Fichas e dados
- [ ] Esboçar as páginas além da mesa
