// =====================================================================
// CONFIGURAÇÕES: todos os "números mágicos" do projeto ficam aqui.
// Para ajustar o comportamento do tabuleiro, normalmente basta mexer neste arquivo.
// =====================================================================

// --- Preferências guardadas no navegador (localStorage; ver ui/preferencias.ts) ---
export const CHAVE_VISOES = "tabuleirinho.camera.visoes"; // JSON { [id do mapa]: { z: zoom, x, y } }: o zoom e a posição da câmera em cada mapa, para voltar como estava
export const CHAVE_ABA_BOLSA = "tabuleirinho.bolsa.aba"; // "tokens" ou "fichas": a última aba escolhida na bolsa
export const CHAVE_INICIATIVA_RECOLHIDA = "tabuleirinho.iniciativa.recolhida"; // "1" = a gaveta da Iniciativa está recolhida
export const CHAVE_FOG_RECOLHIDO = "tabuleirinho.fog.recolhido"; // "1" = a gaveta do Fog está recolhida
/**
 * A ESCALA do tamanho do pincel do Fog (pedido do dono, 18/11/2026): os deslizantes de largura e altura andam por ESTA lista, e não de forma linear: os tamanhos pequenos (que mais se
 * usam) ficam juntos e bem espaçados no começo, e no fim ela salta bastante. Cada valor é a METADE do lado, em casas (0,5 = 1 casa de lado). Precisa estar em ordem crescente, ter
 * todos os "tamanhos prontos" do painel (0,5; 1; 2; 3; 5; 8; 12; 20) e terminar em `RAIO_MAX_FOG` (src/fog.ts).
 */
export const ESCALA_DO_PINCEL: readonly number[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 15, 20];
// --- INICIATIVA (a ordem de combate; ver iniciativa.ts) ---
export const MAX_ENTRADAS_INICIATIVA = 60; // quantos personagens cabem na ordem
export const MAX_CARACTERES_NOME_INICIATIVA = 24; // o nome de uma entrada (de uma pessoa temporária ou de um token)
export const VALOR_MAX_INICIATIVA = 1000; // o valor da iniciativa vai de -1000 a 1000
export const CHAVE_ORDEM_PILHA = "tabuleirinho.pilha.ordem"; // a ordem das barras da pilha (Desenho/Ferramentas), ex.: "barra,ferramentas-desenho"; vazio = a de fábrica
export const CHAVE_DESENHO_RECOLHIDO = "tabuleirinho.desenho.recolhido"; // "1" = o painel de Desenho está recolhido
/** SELEÇÃO de tokens no tabuleiro: a cor e a espessura do anel dos selecionados e as cores do retângulo de seleção (Ctrl + arrastar). */
/** ANIMAÇÕES de vida no token: a piscada vermelha do DANO e a piscada verde da CURA (com barrinhas que sobem). Durações em ms. */
export const MS_ANIMACAO_DANO = 380;
export const MS_ANIMACAO_CURA = 950;
export const COR_DANO = 0xff2d2d;
export const PROFUNDIDADE_BORDA_DANO = 0.4; // quanto do raio, de fora para dentro, o vermelho do dano alcança (0 a 1)
export const ANEIS_DA_BORDA_DANO = 10; // em quantos anéis finos o vermelho é desenhado (mais anéis = degradê mais suave)
export const COR_CURA = 0x3ddc84;
export const BARRAS_DA_CURA = 7;

export const COR_SELECAO = 0xffd34d;
export const ALPHA_TILE_SELECAO = 0.25; // quão forte é o amarelo do tile do token selecionado (0 a 1; fraco de propósito)
export const ALPHA_RETANGULO_SELECAO = 0.15;

export const CHAVE_ORDEM_TOKENS = "tabuleirinho.bolsa.ordem.tokens"; // a ordem escolhida na aba Tokens (ver ORDENS em ui/bolsa.ts)
export const CHAVE_ORDEM_FICHAS = "tabuleirinho.bolsa.ordem.fichas"; // idem na aba Fichas
export const CHAVE_STATUS_AJUDA = "tabuleirinho.status.ajuda.v2"; // "1" = a pessoa deixou à MOSTRA as instruções dos status (o "?"); sem escolha guardada: OCULTAS (pedido do dono; a chave é nova de propósito: a escolha antiga, de quando o padrão era à mostra, não vale mais)
export const CHAVE_ABA_LATERAL = "tabuleirinho.lateral.aba"; // "chat" ou "bolsa": a aba da coluna da direita (sem escolha guardada: "bolsa"; o index.html repete a regra)
export const CHAVE_COLUNA_MINIMIZADA = "tabuleirinho.lateral.minimizada"; // "1" = a coluna da direita (chat e bolsa) está minimizada: só sobra a linha das abas (sem escolha guardada: aberta)
export const CHAVE_DADOS_RECOLHIDO = "tabuleirinho.dados.recolhido"; // "1" = a barra de dados está recolhida, "0" = aberta (sem valor: abre, salvo em janela baixa)
// (O index.html repete estas chaves num script que roda ANTES da primeira pintura: se mudar uma aqui, mude lá também.)

// --- Tabuleiro ---
export const COLUNAS_INICIAIS = 25; // quantas casas na horizontal ao abrir
export const LINHAS_INICIAIS = 22; // quantas casas na vertical ao abrir
export const TAMANHO_CASA = 64; // lado de cada casa, em pixels (no zoom 100%)

// Limites do tamanho do tabuleiro (em casas) pela barra de ferramentas.
// O mínimo tem que ser >= TAMANHO_MAX_TOKEN, senão um token não caberia.
export const MIN_CASAS = 5;
export const MAX_CASAS = 256; // (era 100; pedido do dono, 18/11/2026: mapas de até 12600 px cabem com casas de 50 px = 252 casas)

// --- PREVER colunas e linhas de um mapa pelo TAMANHO da imagem (coordenadas.ts: `preverGrade`) ---
// Muitos mapas prontos são feitos com um número FIXO de pixels por quadrado (70 px é o padrão do Roll20, 50 e 100 px também são comuns). Se a largura e a
// altura da imagem são (quase) múltiplos exatos de um destes tamanhos, a previsão é tomada como EXATA; a ordem é a de preferência.
export const TAMANHOS_DE_CASA_COMUNS = [70, 50, 100, 140, 200, 128, 64]; // (50 antes de 100: 1000×700 cabe nos dois, e 20×14 casas é a escala mais comum em mapas táticos)
export const TOLERANCIA_PX_GRADE = 2; // quantos pixels a imagem pode "sobrar/faltar" para ainda contar como múltiplo exato de uma casa
export const TEMPO_AVISO_MAPA_MS = 9000; // quanto tempo o aviso da previsão fica na tela
// --- Ajustes da GRADE (barra "Tabuleiro": mostrar/esconder, espessura da linha e cor). Online, a ESPESSURA e a COR são da MESA (vêm do servidor, `dados/mesa.json`; só o mestre muda); "mostrar/esconder" é de cada pessoa. Sem servidor, tudo fica no navegador. Depois serão da CENA. ---
export const CHAVE_GRADE = "tabuleirinho.grade"; // JSON no navegador: { mostrar, espessura, cor } (online só o `mostrar` vale; o resto vem do servidor)
export const ALFA_GRADE_PADRAO = 0.85; // opacidade da linha da grade quando a pessoa escolhe a COR (1 = opaco; o "nível de transparência" do seletor de cor da grade muda isto)
export const ESPESSURA_GRADE_PADRAO = 1; // px NA TELA (a linha é desenhada com a espessura dividida pelo zoom, então não muda ao dar zoom)
export const ESPESSURA_GRADE_MIN = 0; // 0 px = SEM grade (pedido do dono: para quem prefere jogar sem as linhas)
export const ESPESSURA_GRADE_MAX = 4;
export const PASSO_ESPESSURA_GRADE = 0.5;
export const TEMPO_DESFAZER_MS = 8000; // quanto tempo o "Desfazer" de remover um token do tabuleiro fica à disposição
export const PX_POR_CASA_ESTIMADO = 70; // sem tamanho exato, a estimativa parte de casas de ~70 px (o padrão mais comum)

// --- Mapa (imagem de fundo) ---
// Imagem carregada ao abrir (teste). Fica em public/, por isso o endereço começa em "/".
// Depois virá de um botão "Imagem de fundo". null = só a grade, sem imagem.
export const MAPA_INICIAL: string | null = "/images/maps/caverna.png";

// --- Régua ---
export const METROS_POR_CASA = 1.5; // cada casa do tabuleiro vale 1,5 m (5 pés do livro)
export const RAJADA_PINGS = 5; // LIMITE ANTI-SPAM dos pings (pedido do dono: "5 por segundo"): quantos pings cabem de uma vez...
export const MS_RECARGA_PING = 200; // ...e depois vale 1 ping a cada tanto (= 5 por segundo). A Riot não publica o limite do League of Legends; este é o do dono
export const MS_ENTRE_ENVIOS_REGUA = 30; // o servidor ignora uma atualização da régua de quem acabou de mandar outra (o navegador manda a cada MS_ENVIO_REGUA)
export const MS_ENVIO_REGUA = 70; // com a régua à vista, o navegador a manda aos outros no máximo a cada tanto (e sempre manda o último estado)
// Os TIPOS DE PING. O "comum" é só um ponto (na cor do desenho de quem pinga); os especiais têm um SÍMBOLO (um SVG de `public/images/svgs/pings/`), um NOME, uma COR fixa e uma dica.
// Para criar um tipo novo: o SVG na pasta + uma entrada aqui (e, se quiser na roda, uma linha em `LADOS_DA_RODA_DE_PING`, em ui/rodaPing.ts). O menu, a roda e o mapa se montam desta tabela.
export const FORMAS_ESPECIAIS_DE_PING = ["sumiu", "perigo", "avancar", "ajuda", "agrupar", "alvo", "atacar", "recuar", "armadilha", "investigar", "tesouro", "cura"] as const; // (a ORDEM é a do submenu)
export const FORMAS_DE_PING = ["comum", ...FORMAS_ESPECIAIS_DE_PING] as const;
export const DADOS_DAS_FORMAS_DE_PING: Record<(typeof FORMAS_ESPECIAIS_DE_PING)[number], { nome: string; cor: number; arquivo: string; dica: string }> = {
    sumiu: { nome: "Sumiu", cor: 0xffd54f, arquivo: "interrogacao", dica: "Sumiu: alguém ou algo sumiu daqui (? amarelo)" },
    perigo: { nome: "Perigo", cor: 0xe53935, arquivo: "perigo", dica: "Perigo: há ameaça mortal aqui (caveira vermelha)" },
    avancar: { nome: "Avançar", cor: 0x43a047, arquivo: "avancar", dica: "Avançar: vamos para lá (setas verdes)" },
    ajuda: { nome: "Ajuda", cor: 0x42a5f5, arquivo: "escudo", dica: "Ajuda: preciso de ajuda ou de proteção aqui (escudo azul)" },
    agrupar: { nome: "Agrupar", cor: 0x7c4dff, arquivo: "agrupar", dica: "Agrupar: venham todos para cá (violeta)" },
    alvo: { nome: "Alvo", cor: 0xff5252, arquivo: "alvo", dica: "Alvo: foquem este inimigo (mira vermelha)" },
    atacar: { nome: "Atacar", cor: 0xec407a, arquivo: "atacar", dica: "Atacar: ataquem aqui (rosa)" },
    recuar: { nome: "Recuar", cor: 0xff7043, arquivo: "recuar", dica: "Recuar: voltem, saiam daí (laranja-avermelhado)" },
    armadilha: { nome: "Armadilha", cor: 0xab47bc, arquivo: "armadilha", dica: "Armadilha: desconfio deste ponto (roxo)" },
    investigar: { nome: "Investigar", cor: 0x26c6da, arquivo: "investigar", dica: "Investigar: olhem este detalhe (ciano)" },
    tesouro: { nome: "Tesouro", cor: 0xffc400, arquivo: "tesouro", dica: "Tesouro: algo valioso aqui (dourado)" },
    cura: { nome: "Cura", cor: 0x00e676, arquivo: "cura", dica: "Cura: preciso de cura ou de ajuda (coração verde)" },
};
export const RAIO_RODA_PING = 112; // a distância (px) do centro da roda de pings até o centro de cada lado
export const COR_DA_MEDIDA_PADRAO = 0xffd54f; // a cor da régua enquanto nenhuma cor de desenho foi escolhida
export const MARGEM_SETA_PING = 34; // a seta do ping fora da tela fica a este tanto (px) da borda da área livre
export const PX_ABRIR_RODA_PING = 18; // com o Shift apertado, o mouse precisa andar este tanto (px) para a RODA DE PINGS abrir (menos que isso é um clique: ping comum)
export const PX_ZONA_MORTA_RODA_PING = 30; // dentro deste raio (px) do centro da roda, soltar faz o ping COMUM; fora dele vale o lado para onde o mouse aponta
export const MS_SUBIDA_PING = 560; // o símbolo do ping SOBE do chão (do ponto clicado para cima) neste tempo, com um pulinho no fim
export const ALTURA_SIMBOLO_PING = 46; // a altura do símbolo do ping NA TELA (px; não muda com o zoom)
export const MS_PING_VISIVEL = 3200; // quanto tempo o anel do ping pulsa no mapa
export const MS_SETA_PING = 4500; // quanto tempo a SETA fica na borda da tela quando o ping caiu fora da tela
export const MAX_PONTOS_REGUA = 30; // quantos pontos (início + curvas) cabem numa medida da régua

// --- Desenho (lápis, borracha e formas: elipse, retângulo e triângulo, só contorno) ---
export const ESPESSURA_DESENHO = 4; // espessura do traço, em pixels do MUNDO (cresce e encolhe com o zoom)
export const RAIO_BORRACHA = 14; // raio da borracha, em pixels de TELA (não muda com o zoom)
export const DISTANCIA_MIN_PONTO = 3; // o lápis só grava um novo ponto a cada tantos pixels do mundo
export const TAMANHO_MIN_FORMA = 6; // formas menores que isto (pixels do mundo) são cliques e não viram desenho
export const COR_INICIAL_DESENHO = 0xff5a5f; // (paleta viva de 17/11/2026: coral-vermelho)
// Cores prontas do painel de desenho (além do seletor de cor livre).
// As amostras são: uma PILHA das últimas cores usadas (a mais recente primeiro), que começa com estas,
// seguida de duas cores FIXAS (branco e preto). A pilha tem sempre o mesmo tamanho: ao entrar uma
// cor nova, a mais antiga sai.
export const CORES_RECENTES_INICIAIS = [0xff5a5f, 0xff9f43, 0xffd23f, 0x7ed957, 0x3ec7e0, 0x9b7bff]; // (cores vivas, que aparecem bem sobre o mapa; pedido do dono, 17/11/2026)
export const CORES_FIXAS_DESENHO = [0xffffff, 0x000000];

// --- Chat ---
export const AUTOR_PROVISORIO = "Você"; // nome nas mensagens enquanto não há contas de usuário
export const MAX_MENSAGENS_CHAT = 100; // quantas mensagens são guardadas (as mais antigas saem)
export const MAX_CARACTERES_MENSAGEM = 72; // limite de caracteres de uma mensagem
export const DURACAO_ANIMACAO_CHAT = 320; // ms: a mensagem nova entra e as outras deslizam para a direita

// --- Rede (protótipo do servidor; ver servidor/servidor.ts e src/protocolo.ts) ---
export const PORTA_SERVIDOR = 3737; // porta do servidor (o Vite, no desenvolvimento, repassa o endereço /ws para ela). Incomum de propósito: a 3000 costuma estar ocupada por outros projetos
export const MAX_CARACTERES_APELIDO = 20; // o apelido de quem entra na mesa é cortado a este tamanho
export const TAMANHO_MAX_MENSAGEM_REDE = 262144; // bytes (256 KB): o servidor recusa mensagens maiores que isto. Tem de caber a imagem de um token (até MAX_CARACTERES_IMAGEM_TOKEN = 150 mil caracteres) e o texto de uma ficha no pior caso (25000 caracteres de controle viram "\u0001", 6 bytes cada: ~150 KB)
export const MAX_MENSAGENS_POR_SEGUNDO = 40; // por conexão: o excesso é ignorado (e quem insiste é desconectado)
export const MS_ESPERA_GRAVACAO_TOKEN = 300; // o servidor espera este tempo antes de gravar a posição de um token que andou (vários movimentos seguidos viram uma gravação só)
export const SEGUNDOS_PARA_ENTRAR = 5; // quem conecta e não se apresenta ("entrar") neste tempo é desconectado
export const SEGUNDOS_BATIMENTO = 15; // o servidor "chama" cada conexão (ping) a cada tanto tempo; quem não responde até a próxima chamada é considerada caída e sai da lista de online

// --- Dados (a barra de dados ao lado do chat) ---
export const DADOS_DISPONIVEIS = [4, 6, 8, 10, 12, 20, 100, 1000]; // d4, d6, d8, d10, d12, d20, d100, d1000
export const DADO_INICIAL = 20; // dado escolhido ao abrir
export const MAX_QUANTIDADE_DADOS = 99; // quantos dados de uma vez (mínimo 1)
export const MAX_MODIFICADOR_DADOS = 99; // o modificador vai de -99 a +99
export const MAX_DADOS_NO_CARTAO = 12; // o cartão do chat mostra no máximo estes dados individuais (e "…")

// --- Zoom --- (1 = 100%). Cada clique multiplica/divide por PASSO_ZOOM.
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 3;
export const PASSO_ZOOM = 1.25;
/** Ctrl + roda do mouse: cada unidade de rolagem multiplica o zoom por e^(-delta × isto). 0,001 faz um "clique" da roda (100) valer ~1,1× (mais suave que o PASSO_ZOOM; era 0,002, forte demais para o dono). */
// --- STATUS do token (as barras embaixo dele no tabuleiro: HP e outras) ---
/** Quantos status (barras) um token pode ter. */
export const MAX_STATUS_TOKEN = 20;
/** Quantas barras a "Prévia das barras" (embaixo da prévia do token, na bolsa em tela cheia) mostra: só as primeiras, para a prévia ter altura fixa e não empurrar a lista de tokens. */
export const BARRAS_NA_PREVIA_STATUS = 3;

// --- AÇÕES dos tokens (Dano, Cura e as que o dono criar): mudam o valor de um status de uma peça (ex.: tirar PV) ---
/** Quantas ações a mesa pode ter. */
export const MAX_ACOES_MESA = 12;
/** Tamanho máximo do nome de uma ação (ex.: "Dano", "Cura", "Veneno"). */
export const MAX_CARACTERES_NOME_ACAO = 20;
/** Tamanho máximo do texto do valor de uma ação (um número, ou dados como "2d6+3"). */
export const MAX_CARACTERES_QUANTIA_ACAO = 40;
/** O maior valor que uma ação pode somar ou tirar de uma vez. */
export const MAX_QUANTIA_ACAO = 1_000_000;
/** O TAMANHO da coluna da direita (chat e bolsa), que a pessoa ajusta arrastando o canto de cima à esquerda (pedido do dono, 17/11/2026): largura e altura mínimas (para o layout não quebrar) e a largura máxima. */
export const LARGURA_MIN_COLUNA = 260;
export const LARGURA_MAX_COLUNA = 720;
export const ALTURA_MIN_COLUNA = 280;
export const CHAVE_TAMANHO_COLUNA = "tabuleirinho.coluna.tamanho";
/** A régua só aparece depois de o mouse andar pelo menos isto (px da tela) com o botão apertado: um clique simples não desenha nada (pedido do dono, 17/11/2026: dá a ideia de que é preciso ARRASTAR para medir). */
export const PX_MIN_ARRASTO_REGUA = 4;
/** DESENHOS COMPARTILHADOS (17/11/2026): quantos desenhos um mapa guarda no servidor, quantos pontos tem um traço do lápis e até onde (em casas) um ponto pode ir (o tabuleiro tem no máximo 100 casas de lado). */
export const MAX_DESENHOS_POR_MAPA = 3000;
export const MAX_PONTOS_DO_TRACO = 1500;
export const LIMITE_COORDENADA_DESENHO = 300;
/** Quantas ações de desenho a pessoa consegue desfazer com Ctrl+Z (e refazer com Ctrl+Y). */
export const MAX_HISTORICO_DESENHO = 100;
/** Quantos tokens uma ação em ÁREA (dano, cura ou condição em vários tokens selecionados) pode atingir de uma vez. */
export const MAX_TOKENS_ACAO_EM_GRUPO = 50;
/** Tamanho máximo do NOME de um status (ex.: "HP", "Mana"). */
export const MAX_CARACTERES_NOME_STATUS = 12;
/** O status que todo token novo tem: a barra de vida "HP", que lê a variável PV:: da ficha atribuída ao token. */
export const STATUS_PADRAO_NOME = "HP";
export const STATUS_PADRAO_VARIAVEL = "PV";
export const COR_STATUS_HP = 0x4cd17a;
/** As cores oferecidas ao criar um status novo (a próxima que ainda não está em uso). */
export const CORES_STATUS = [0x4cd17a, 0x4f8cff, 0xff9f43, 0xb05ce8, 0xf5b83d, 0xe5484d];
/** A barra no tabuleiro: altura e vão entre uma barra e a próxima (em pixels do mundo, antes do zoom). */
export const ALTURA_BARRA_STATUS = 8; // barras FINAS (já foram 14 e 10; pedido do dono): o número "100/100" ainda cabe DENTRO dela, com a letra pequena
export const TAMANHO_NUMERO_BARRA = 13; // tamanho da letra do número e do nome da barra (era 16; o texto é feito com o dobro e reduzido à metade, então fica nítido)
export const VAO_BARRA_TOKEN = 1; // px entre a BORDA do círculo do token e a primeira barra (a barra encosta no círculo, não no bloco)
export const VAO_BARRA_STATUS = 2;

/** Duplo clique num token do tabuleiro: o 2º aperto no mesmo token vale se vier em até isto (ms) e com o mouse parado (até PX_DUPLO_CLIQUE pixels de tela). */
export const MS_DUPLO_CLIQUE = 400;
export const PX_DUPLO_CLIQUE = 5;
export const SENSIBILIDADE_ZOOM_RODA = 0.001;

// --- Câmera ---
// A câmera deixa sobrar, além da borda do mapa, NO MÁXIMO este tanto de espaço vazio (em pixels de TELA, em cada eixo; pedido do dono, 18/11/2026: "menos espaço livre além do mapa").
// Um pouco mais que a largura de cada painel lateral (~340 px), para dar para tirar a borda do mapa de trás deles. Quanto MENOR o número, mais presa a câmera fica ao mapa.
export const MARGEM_LIVRE_CAMERA = 360;
// Ao "ajustar à tela", sobra esta folga (px) de cada lado do tabuleiro.
export const MARGEM_AJUSTE = 24;
export const MS_SUAVIZAR_CAMERA = 70; // o deslize da câmera (setas e inércia do arrasto): a cada instante ela anda a fração `1 - e^(-tempo / isto)` do que falta. Menor = mais seco, maior = mais "mole"
export const FATOR_INERCIA_PAN = 110; // ao SOLTAR um arrasto em movimento, a câmera ainda desliza: velocidade (px por ms) × isto = distância (px) que falta percorrer
export const MS_JANELA_VELOCIDADE_PAN = 90; // a velocidade do arrasto é medida nos últimos ms; se o mouse ficou parado antes de soltar, não há inércia
export const VELOCIDADE_MIN_INERCIA_PAN = 0.15; // px por ms: abaixo disto soltar não desliza (um arrasto lento e preciso pára onde parou)

// --- Tokens ---
export const TAMANHO_MIN_TOKEN = 1; // um token ocupa no mínimo 1x1 casa
export const TAMANHO_MAX_TOKEN = 4; // e no máximo 4x4 casas
export const FOLGA_TOKEN = 6; // espaço (px) entre o círculo do token e a borda do bloco
export const MAX_TOKENS = 100; // quantos tokens (os da BOLSA, os "modelos") a mesa aceita
export const MAX_PECAS = 300; // quantas PEÇAS (as cópias temporárias que ficam no tabuleiro, feitas ao arrastar um token da bolsa) a mesa aceita
export const MAX_CARACTERES_NOME_TOKEN = 20; // o nome do token é cortado a este tamanho

// --- Fichas (documentos de texto guardados no servidor; ver estado.ts e servidor/fichas.ts) ---
export const ATRASO_ROLAGEM_MS = 100; // pausa curta (pedido do dono) entre pedir uma rolagem (dados ou ficha) e o resultado aparecer no chat. Os testes zeram isto pelo gancho do `npm run dev`
// LIMITE ANTI-SPAM por pessoa (balde que enche aos poucos; ver limite.ts). O SERVIDOR faz valer; o navegador só avisa. Valores escolhidos pelo Claude (ajuste à vontade):
export const RAJADA_ROLAGENS = 5; // quantas rolagens (dados e fichas, juntas) cabem de uma vez (o dono pediu 5)...
export const MS_RECARGA_ROLAGEM = 1000; // ...e depois vale 1 rolagem a cada tanto
export const RAJADA_CHAT = 5; // quantas mensagens de chat de uma vez...
export const MS_RECARGA_CHAT = 2000; // ...e depois vale 1 mensagem a cada tanto
export const MAX_GRUPOS = 50; // quantos grupos (de tokens e fichas) a mesa aceita
export const MAX_PASTAS = 300; // quantas PASTAS (de tokens e de fichas, somadas) a mesa aceita
export const MAX_CARACTERES_NOME_PASTA = 40;
export const TAMANHO_MAX_ARQUIVO_PASTA = 4 * 1024; // bytes: o arquivo de uma pasta é pequeno (id, nome, tipo, pai)
export const MAX_CARACTERES_NOME_GRUPO = 20; // nome do grupo (aparado e cortado a isto)
export const COR_INICIAL_GRUPO = 0x4f8cff; // a cor sugerida ao criar um grupo (as amostras são as de CORES_TOKEN)
export const TAMANHO_MAX_ARQUIVO_GRUPO = 4096; // bytes: ao ligar, o servidor ignora arquivos de grupo maiores que isto
// --- A BIBLIOTECA DE MAPAS (imagens que o MESTRE envia ao servidor; todos veem o mapa atual) ---
export const MAX_BYTES_MAPA = 20 * 1024 * 1024; // bytes: o servidor RECUSA uma imagem de mapa maior que isto (20 MB; antes 10 MB, pedido do dono, 18/11/2026), antes mesmo de lê-la inteira
export const LADO_MAPA_RECOMENDADO = 8192; // pixels: acima disto o mapa é "grande demais": muitas placas de vídeo o reduzem e ele pesa no desempenho; a aba Mapas recomenda excluir (só um aviso, o limite de verdade é o de baixo)
export const LADO_MINIATURA_MAPA = 320; // pixels: o maior lado da miniatura de um mapa na aba Mapas (só o mestre a vê; o navegador a gera reduzindo a imagem que baixou)
export const MAX_LADO_MAPA = 12600; // pixels: o lado maior de um mapa (lido no cabeçalho da imagem); acima disto muitas placas de vídeo não conseguem desenhar a textura, e uma imagem pequena em bytes pode ter bilhões de pixels
export const MAX_MAPAS = 40; // quantos mapas a biblioteca guarda
export const MAX_BYTES_TOTAL_MAPAS = 400 * 1024 * 1024; // bytes: a soma de todos os mapas guardados (o disco do dono do servidor não enche por abuso)
export const MAX_CARACTERES_NOME_MAPA = 40; // o nome que se dá a um mapa (só texto)
export const MAX_FICHAS = 200; // quantas fichas a mesa aceita
export const MAX_CARACTERES_NOME_FICHA = 40; // o nome da ficha é cortado a este tamanho
export const MAX_ABAS_FICHA = 6; // quantas ABAS (páginas) uma ficha pode ter: continua sendo UM arquivo só em dados/fichas
export const MAX_FICHAS_FIXADAS = 5; // quantas janelas de ficha podem estar FIXADAS ao mesmo tempo (fora elas, ainda cabe mais uma janela solta, que troca de ficha)
export const MAX_CARACTERES_NOME_ABA_FICHA = 20; // o nome de uma aba é cortado a este tamanho (vazio vira "Página N")
export const MAX_CARACTERES_TEXTO_FICHA = 25000; // o texto de uma ficha (cerca de 8 páginas de Word) é a SOMA de todas as abas; passar disto é recusado (não é cortado, para não perder o fim sem avisar)
export const TAMANHO_MAX_ARQUIVO_TOKEN = 262144; // bytes (256 KB): ao ligar, o servidor ignora arquivos de token maiores que isto. Tem de caber a imagem máxima (150 mil caracteres) e o resto
export const TAMANHO_MAX_ARQUIVO_FICHA = 131072; // bytes (128 KB): ao ligar, o servidor ignora arquivos de ficha maiores que isto (alguém pode ter mexido na pasta). Tem de caber o texto máximo: 25000 caracteres valem até ~75 KB em UTF-8

// --- Variáveis e fórmulas das fichas (ver formulas.ts). Limites de SEGURANÇA: o texto vem de jogadores e o servidor também o analisa ---
export const MAX_CARACTERES_FORMULA = 200; // uma fórmula ou o valor de uma variável (ex.: "1d20 + MOD_FOR + PROF")
export const MAX_CARACTERES_NOME_VARIAVEL = 30; // o nome de uma variável (ex.: "MOD_FOR")
export const MAX_CARACTERES_NOME_ROLAGEM = 60; // o nome de uma rolagem, entre parênteses (ex.: "Ataque com espada")
export const MAX_VARIAVEIS_POR_FICHA = 100; // além destas, as linhas "NOME:: valor" são ignoradas (limita o trabalho por ficha)
export const MAX_ROLAGENS_POR_FICHA = 100; // idem para as rolagens "(Nome)[fórmula]"
export const MAX_CARTOES_POR_FICHA = 40; // idem para os CARTÕES (Nome)"""texto""" (magias, itens...): além destes, são ignorados
export const MAX_CARACTERES_CARTAO = 3000; // o texto de dentro das aspas triplas de UM cartão (maior que isto, o cartão dá erro e não vai ao chat)
export const MAX_EXPRESSOES_POR_CARTAO = 20; // quantos [cálculos ou rolagens] cabem dentro de UM cartão (cada um é calculado/rolado quando o cartão vai ao chat)
export const MAX_PROFUNDIDADE_FORMULA = 50; // profundidade da conta (cada parêntese aninhado conta 4: cabem 12 níveis)
export const MAX_VALOR_VARIAVEL_QUE_MUDA = 999_999_999; // as variáveis que MUDAM durante o jogo ("OURO::0:150:999999999"): mínimo, inicial e máximo ficam entre -999.999.999 e +999.999.999
export const MAX_VALOR_FORMULA = 1_000_000_000; // nenhum número (nem resultado de conta) pode passar disto: evita estouro e números absurdos

// --- Imagem do token ---
// A imagem escolhida é RECORTADA e REDUZIDA na hora (como um "print"): só essa miniatura é guardada,
// e a foto original é descartada. A imagem fica POR CIMA do preenchimento (as partes transparentes
// mostram a cor de preenchimento) e a borda colorida fica por cima de tudo.
export const TAMANHO_IMAGEM_TOKEN = 256; // lado (px) da miniatura guardada (um token 4×4 mede ~244 px no zoom 100%)
export const QUALIDADE_IMAGEM_TOKEN = 0.85; // qualidade do WebP (0 a 1): menor = arquivo mais leve
export const MAX_CARACTERES_IMAGEM_TOKEN = 150_000; // tamanho máximo do texto da miniatura ("data:image/webp;base64,...")
export const LARGURA_BORDA_TOKEN = 3; // espessura (px) da borda do token (a mesma com ou sem imagem)
export const COR_BORDA_INICIAL_TOKEN = 0xffffff; // cor da borda marcada ao abrir a bolsa (branco, como sempre foi)
export const LADO_MAX_EDICAO_IMAGEM = 2450; // fotos maiores são reduzidas ao abrir o editor (poupa memória)
export const VISAO_RECORTE = 320; // lado (px) da área do editor de recorte
export const DIAMETRO_RECORTE = 280; // diâmetro (px) do círculo de recorte dentro dessa área
// Zoom do recorte: 1 = a imagem mal cobre o círculo. Abaixo de 1 a imagem fica MENOR que o círculo (sobra espaço
// vazio em volta, que sai transparente e herda o preenchimento do token); acima de 1 aproxima.
export const ZOOM_MIN_RECORTE = 1; // (era 0.2: afastar deixava a imagem MENOR que o círculo, com uma moldura da cor do token; agora a imagem sempre PREENCHE o token até a borda, pedido do dono, 17/11/2026)
export const ZOOM_MAX_RECORTE = 6;

// --- Bolsa expandida: criação de tokens ---
// Paleta de cores do token (e dos grupos): cores VIVAS e harmônicas (pedido do dono, 17/11/2026: "cores mais interessantes"): carmim, coral, âmbar, lima, esmeralda, turquesa,
// azul, índigo, violeta e magenta; branco e grafite, fixos, por último.
export const CORES_TOKEN = [
    0xe5484d, 0xff7a45, 0xf5b83d, 0x9bd448, 0x2fc28a, 0x1fb5c9,
    0x4f8cff, 0x7c6cf6, 0xb05ce8, 0xf06aa8, 0xffffff, 0x1f2430,
];
export const COR_INICIAL_TOKEN = 0x4f8cff; // cor marcada ao abrir a bolsa (azul)
export const TAMANHO_INICIAL_TOKEN = 1; // tamanho marcado ao abrir a bolsa (1 = 1×1)

// --- Ícones de condições (desenhados em anel na borda do token) ---
// Diâmetro do ícone = TAMANHO_CASA * (BASE + POR_CASA * size): cresce com o token.
// Ex.: token 1x1 -> 0,4 casa (~26 px); token 4x4 -> 0,7 casa (~45 px).
export const ICONE_CONDICAO_BASE = 0.3;
export const ICONE_CONDICAO_POR_CASA = 0.1;
export const ESPACO_ICONES = 2; // folga (px) entre ícones vizinhos no anel
// Quantos ícones aparecem no token. Com MAIS condições que isso, o lugar seguinte
// vira um distintivo "+N" (N = quantas ficaram de fora). O balão ao passar o
// mouse sempre lista todas.
export const MAX_ICONES_CONDICAO = 4;

// --- Menu do token (botões e painéis que abrem com o clique direito) ---
// Vão (px) entre os botões e o canto superior esquerdo do token: quanto maior, mais longe do token.
export const AFASTAMENTO_OPCOES_TOKEN = 12;
// Vão (px) entre os botões e o painel que eles abrem.
export const DISTANCIA_PAINEL = 6;
// Altura mínima (px) útil de um painel. Se acima dos botões não couber nem isso, o painel vai para baixo.
export const ALTURA_MIN_PAINEL = 140;

// --- Balão com as condições do token (ao passar o mouse) ---
// Altura máxima (px). Com mais condições que cabem, a lista ganha barra de rolagem.
export const ALTURA_MAX_BALAO = 260;
// Altura mínima (px) que o balão mantém ao se espremer para caber acima ou abaixo do token.
export const ALTURA_MIN_BALAO = 90;
