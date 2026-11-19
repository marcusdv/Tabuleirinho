# Atalhos de teclado e de mouse — Tabuleirinho

A lista do que existe hoje. **Ao criar ou mudar um atalho, atualizar este arquivo** e mostrar o atalho entre parênteses na dica do mouse do botão (regra do dono, 14/11/2026), ex.: "Régua (R)".
Atalhos de uma letra só moram em `src/ui/atalhos.ts` (não valem enquanto se digita num campo de texto, nem com Ctrl, Alt ou Cmd apertados). Os outros ficam junto da tela a que pertencem (a coluna "Onde" diz o arquivo).

## Teclado — no mapa

| Tecla | O que faz | Onde |
|---|---|---|
| **R** | Liga a régua; de novo, volta a Mover | `ui/atalhos.ts` |
| **A** | Liga a ferramenta de **Área** (com a última forma escolhida); de novo, volta a Mover | `ui/atalhos.ts` |
| **Q** | Abre a bolsa em tela cheia (mesmo com a aba "Chat" à frente: a coluna troca sozinha para a "Bolsa"); de novo, fecha | `ui/atalhos.ts` |
| **← ↑ → ↓** | Move a visão **1 casa** por toque, no sentido da seta (segurar repete). Só com o foco no mapa (não num campo, botão ou janela) | `tabuleiro/interacao.ts` |
| **Espaço** (segurado) + botão esquerdo | Arrasta a tela | `tabuleiro/interacao.ts` |
| **Esc** | Volta a Mover (desliga a ferramenta), fecha menus e janelas, tira a seleção | vários |
| **Delete** | Remove os tokens selecionados do tabuleiro (com "Desfazer") | `main.ts` |
| **Ctrl+Z** | Desfaz o último desenho seu | `main.ts` |
| **Ctrl+Y** ou **Ctrl+Shift+Z** | Refaz o desenho desfeito | `main.ts` |

## Teclado — na bolsa e nas janelas

| Tecla | O que faz | Onde |
|---|---|---|
| **Ctrl+A** | Seleciona tudo na bolsa em tela cheia | `ui/bolsa.ts` |
| **Esc** | Na bolsa em tela cheia: limpa a pesquisa, depois a seleção, depois fecha | `ui/bolsa.ts` |
| **Ctrl+S** | Salva a ficha aberta | `ui/editorFicha.ts` |
| **Ctrl+B** / **Ctrl+I** | Negrito e itálico no texto da ficha | `ui/editorFicha.ts` |
| **Enter** | Confirma a caixa ou o campo em foco | vários |
| **↑ ↓ → ←** | No menu do botão direito: andam pelos itens; → abre os tipos de ping, ← volta | `ui/menuMapa.ts` |

## Mouse — no mapa

| Gesto | O que faz |
|---|---|
| **Botão do meio** arrastado | Arrasta a tela (com qualquer ferramenta, até sobre um token) |
| **Espaço + esquerdo** arrastado | O mesmo (veja acima) |
| **Ctrl + roda** | Zoom em torno do cursor |
| **Ctrl + esquerdo** arrastado no vazio | Retângulo de seleção de tokens |
| **Ctrl + clique** num token | Liga e desliga o token na seleção |
| **Esquerdo** no vazio | Tira a seleção |
| **Shift + esquerdo** (clique) | Ping comum no ponto clicado (vale com qualquer ferramenta e sobre tokens) |
| **Shift + esquerdo** arrastado | Abre a **roda de pings** (12 posições, com os 12 tipos) no ponto apertado: o mouse aponta um lado e soltar faz o ping dele. Do alto, no sentido do relógio: **Ajuda** (cima), Alvo, Atacar, **Avançar** (direita), Investigar, Tesouro, **Perigo** (baixo), Armadilha, Recuar, **Sumiu** (esquerda), Agrupar e Cura. No meio: ping comum. **Esc** cancela |
| **Direito** no vazio | Menu do mapa: **Lápis**, **Borracha**, **Ping** (e o submenu com os 12 tipos: Sumiu, Perigo, Avançar, Ajuda, Agrupar, Alvo, Atacar, Recuar, Armadilha, Investigar, Tesouro, Cura), **Área** (submenu com as 5 formas, cada uma com o tamanho que você usou por último, e as áreas rápidas: Bola de Fogo, Mãos Flamejantes, Relâmpago, Onda Trovejante, Aura de 3 m), **Régua**, **Limpar áreas**, **Borracha** e, só para o mestre, **Borracha de fog** e **Pincel de fog** |
| **Direito** num token | Engrenagem e lista de ações do token |
| **Clique** na caixa de um personagem na **iniciativa** | Faz um **ping** em cima do token dele no tabuleiro (para todos acharem de quem é a vez); arrastar a caixa só reordena |
| **Direito**, com a régua medindo (esquerdo apertado) | Fixa um ponto e a medida continua dali (curvas) |
| **Régua** começando em cima de um **token seu** (que você pode usar) | Seleciona o token; ao soltar, o botão **Mover** aparece junto da ponta: clicar leva o token pelo caminho, deslizando e parando um instante em cada ponto fixado |
| **Esquerdo** com a ferramenta de **Área** ligada | **Cone, linha e cubo:** clique na origem e depois na direção (a área acompanha o mouse e mostra a medida "6 m = 4 □"; o 2º clique fixa), ou arraste e solte. **Esfera e emanação:** um clique (ou apertar, ajustar e soltar) coloca. **Emanação sobre um token:** o token passa a emanar (clique de novo com os mesmos valores para parar). Antes de clicar, um "fantasma" (sempre apontando para a direita) acompanha o mouse |
| **Direito** com uma área sendo posicionada | Cancela a área (o menu não abre) |

### Toque (celular)

Um dedo arrastando o espaço vazio move a visão. Com uma ferramenta ligada o dedo é dela (volte a Mover pelo ponteiro do Acesso rápido). Zoom por pinça e dois dedos: ainda não existem.

## Ideias para depois (ainda NÃO feitas)

Abrir o Desenho e o Fog por tecla, trocar de aba da coluna da direita, rolar o último dado, lápis e borracha por letra. Ver `BRAINSTORM.md` ("ATALHOS DE TECLADO").
