// =====================================================================
// CONFIGURAÇÕES: todos os "números mágicos" do projeto ficam aqui.
// Para ajustar o comportamento do tabuleiro, normalmente basta mexer neste arquivo.
// =====================================================================

// --- Preferências guardadas no navegador (localStorage; ver ui/preferencias.ts) ---
export const CHAVE_ABA_BOLSA = "tabuleirinho.bolsa.aba"; // "tokens" ou "fichas": a última aba escolhida na bolsa
export const CHAVE_BARRA_RECOLHIDA = "tabuleirinho.barra.recolhida"; // "1" = a barra de Ferramentas está recolhida
export const CHAVE_ORDEM_PILHA = "tabuleirinho.pilha.ordem"; // a ordem das barras da pilha (Desenho/Ferramentas), ex.: "barra,ferramentas-desenho"; vazio = a de fábrica
export const CHAVE_DESENHO_RECOLHIDO = "tabuleirinho.desenho.recolhido"; // "1" = o painel de Desenho está recolhido
export const CHAVE_ORDEM_TOKENS = "tabuleirinho.bolsa.ordem.tokens"; // a ordem escolhida na aba Tokens (ver ORDENS em ui/bolsa.ts)
export const CHAVE_ORDEM_FICHAS = "tabuleirinho.bolsa.ordem.fichas"; // idem na aba Fichas
export const CHAVE_ABA_LATERAL = "tabuleirinho.lateral.aba"; // "chat" ou "bolsa": a aba da coluna da direita (sem escolha guardada: "bolsa"; o index.html repete a regra)
export const CHAVE_DADOS_RECOLHIDO = "tabuleirinho.dados.recolhido"; // "1" = a barra de dados está recolhida, "0" = aberta (sem valor: abre, salvo em janela baixa)
// (O index.html repete estas chaves num script que roda ANTES da primeira pintura: se mudar uma aqui, mude lá também.)

// --- Tabuleiro ---
export const COLUNAS_INICIAIS = 18; // quantas casas na horizontal ao abrir
export const LINHAS_INICIAIS = 10; // quantas casas na vertical ao abrir
export const TAMANHO_CASA = 64; // lado de cada casa, em pixels (no zoom 100%)

// Limites do tamanho do tabuleiro (em casas) pela barra de ferramentas.
// O mínimo tem que ser >= TAMANHO_MAX_TOKEN, senão um token não caberia.
export const MIN_CASAS = 5;
export const MAX_CASAS = 100;

// --- PREVER colunas e linhas de um mapa pelo TAMANHO da imagem (coordenadas.ts: `preverGrade`) ---
// Muitos mapas prontos são feitos com um número FIXO de pixels por quadrado (70 px é o padrão do Roll20, 50 e 100 px também são comuns). Se a largura e a
// altura da imagem são (quase) múltiplos exatos de um destes tamanhos, a previsão é tomada como EXATA; a ordem é a de preferência.
export const TAMANHOS_DE_CASA_COMUNS = [70, 50, 100, 140, 200, 128, 64]; // (50 antes de 100: 1000×700 cabe nos dois, e 20×14 casas é a escala mais comum em mapas táticos)
export const TOLERANCIA_PX_GRADE = 2; // quantos pixels a imagem pode "sobrar/faltar" para ainda contar como múltiplo exato de uma casa
export const TEMPO_AVISO_MAPA_MS = 9000; // quanto tempo o aviso da previsão fica na tela
export const PX_POR_CASA_ESTIMADO = 70; // sem tamanho exato, a estimativa parte de casas de ~70 px (o padrão mais comum)

// --- Mapa (imagem de fundo) ---
// Imagem carregada ao abrir (teste). Fica em public/, por isso o endereço começa em "/".
// Depois virá de um botão "Imagem de fundo". null = só a grade, sem imagem.
export const MAPA_INICIAL: string | null = "/images/maps/lago_arruinado.png";

// --- Régua ---
export const METROS_POR_CASA = 1.5; // cada casa do tabuleiro vale 1,5 m (5 pés do livro)
export const MAX_PONTOS_REGUA = 30; // quantos pontos (início + curvas) cabem numa medida da régua

// --- Desenho (lápis, borracha e formas: elipse, retângulo e triângulo, só contorno) ---
export const ESPESSURA_DESENHO = 4; // espessura do traço, em pixels do MUNDO (cresce e encolhe com o zoom)
export const RAIO_BORRACHA = 14; // raio da borracha, em pixels de TELA (não muda com o zoom)
export const DISTANCIA_MIN_PONTO = 3; // o lápis só grava um novo ponto a cada tantos pixels do mundo
export const TAMANHO_MIN_FORMA = 6; // formas menores que isto (pixels do mundo) são cliques e não viram desenho
export const COR_INICIAL_DESENHO = 0xff5252;
// Cores prontas do painel de desenho (além do seletor de cor livre).
// As amostras são: uma PILHA das últimas cores usadas (a mais recente primeiro), que começa com estas,
// seguida de duas cores FIXAS (branco e preto). A pilha tem sempre o mesmo tamanho: ao entrar uma
// cor nova, a mais antiga sai.
export const CORES_RECENTES_INICIAIS = [0xff5252, 0xff9800, 0xffd54f, 0x4caf50, 0x29b6f6, 0x7e57c2];
export const CORES_FIXAS_DESENHO = [0xffffff, 0x000000];

// --- Chat ---
export const AUTOR_PROVISORIO = "Você"; // nome nas mensagens enquanto não há contas de usuário
export const MAX_MENSAGENS_CHAT = 100; // quantas mensagens são guardadas (as mais antigas saem)
export const MAX_CARACTERES_MENSAGEM = 72; // limite de caracteres de uma mensagem
export const DURACAO_ANIMACAO_CHAT = 320; // ms: a mensagem nova entra e as outras deslizam para a direita
export const SUAVIDADE_ROLAGEM_CHAT = 90; // ms: quanto maior, mais macia (e lenta) a rolagem da roda do mouse no chat; 0 = sem suavização
export const MAX_CARTOES_ANIMADOS = 20; // só os primeiros cartões (os visíveis) deslizam; os outros estão fora da tela

// --- Rede (protótipo do servidor; ver servidor/servidor.ts e src/protocolo.ts) ---
export const PORTA_SERVIDOR = 3737; // porta do servidor (o Vite, no desenvolvimento, repassa o endereço /ws para ela). Incomum de propósito: a 3000 costuma estar ocupada por outros projetos
export const MAX_CARACTERES_APELIDO = 20; // o apelido de quem entra na mesa é cortado a este tamanho
export const TAMANHO_MAX_MENSAGEM_REDE = 262144; // bytes (256 KB): o servidor recusa mensagens maiores que isto. Tem de caber a imagem de um token (até MAX_CARACTERES_IMAGEM_TOKEN = 150 mil caracteres) e o texto de uma ficha no pior caso (25000 caracteres de controle viram "\u0001", 6 bytes cada: ~150 KB)
export const MAX_MENSAGENS_POR_SEGUNDO = 40; // por conexão: o excesso é ignorado (e quem insiste é desconectado)
export const MS_ESPERA_GRAVACAO_TOKEN = 300; // o servidor espera este tempo antes de gravar a posição de um token que andou (vários movimentos seguidos viram uma gravação só)
export const SEGUNDOS_PARA_ENTRAR = 5; // quem conecta e não se apresenta ("entrar") neste tempo é desconectado

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

// --- Câmera ---
// O tabuleiro pode ser arrastado para qualquer lado, deixando muito espaço em branco em volta,
// mas pelo menos esta parte dele (em pixels de TELA, em cada eixo) continua visível para ele
// nunca sumir. Quanto MENOR o número, mais livre a movimentação.
export const PARTE_VISIVEL_CAMERA = 240;
// Ao "ajustar à tela", sobra esta folga (px) de cada lado do tabuleiro.
export const MARGEM_AJUSTE = 24;

// --- Tokens ---
export const TAMANHO_MIN_TOKEN = 1; // um token ocupa no mínimo 1x1 casa
export const TAMANHO_MAX_TOKEN = 4; // e no máximo 4x4 casas
export const FOLGA_TOKEN = 6; // espaço (px) entre o círculo do token e a borda do bloco
export const MAX_TOKENS = 100; // quantos tokens a mesa aceita no total (no mapa + na bolsa)
export const MAX_CARACTERES_NOME_TOKEN = 20; // o nome do token é cortado a este tamanho

// --- Fichas (documentos de texto guardados no servidor; ver estado.ts e servidor/fichas.ts) ---
export const ATRASO_ROLAGEM_MS = 100; // pausa curta (pedido do dono) entre pedir uma rolagem (dados ou ficha) e o resultado aparecer no chat. Os testes zeram isto pelo gancho do `npm run dev`
// LIMITE ANTI-SPAM por pessoa (balde que enche aos poucos; ver limite.ts). O SERVIDOR faz valer; o navegador só avisa. Valores escolhidos pelo Claude (ajuste à vontade):
export const RAJADA_ROLAGENS = 5; // quantas rolagens (dados e fichas, juntas) cabem de uma vez (o dono pediu 5)...
export const MS_RECARGA_ROLAGEM = 1000; // ...e depois vale 1 rolagem a cada tanto
export const RAJADA_CHAT = 5; // quantas mensagens de chat de uma vez...
export const MS_RECARGA_CHAT = 2000; // ...e depois vale 1 mensagem a cada tanto
export const MAX_GRUPOS = 50; // quantos grupos (de tokens e fichas) a mesa aceita
export const MAX_CARACTERES_NOME_GRUPO = 20; // nome do grupo (aparado e cortado a isto)
export const COR_INICIAL_GRUPO = 0x3498db; // a cor sugerida ao criar um grupo (as amostras são as de CORES_TOKEN)
export const TAMANHO_MAX_ARQUIVO_GRUPO = 4096; // bytes: ao ligar, o servidor ignora arquivos de grupo maiores que isto
export const MAX_FICHAS = 200; // quantas fichas a mesa aceita
export const MAX_CARACTERES_NOME_FICHA = 40; // o nome da ficha é cortado a este tamanho
export const MAX_ABAS_FICHA = 6; // quantas ABAS (páginas) uma ficha pode ter: continua sendo UM arquivo só em dados/fichas
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
export const MAX_PROFUNDIDADE_FORMULA = 50; // profundidade da conta (cada parêntese aninhado conta 4: cabem 12 níveis)
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
export const LADO_MAX_EDICAO_IMAGEM = 2048; // fotos maiores são reduzidas ao abrir o editor (poupa memória)
export const VISAO_RECORTE = 320; // lado (px) da área do editor de recorte
export const DIAMETRO_RECORTE = 280; // diâmetro (px) do círculo de recorte dentro dessa área
// Zoom do recorte: 1 = a imagem mal cobre o círculo. Abaixo de 1 a imagem fica MENOR que o círculo (sobra espaço
// vazio em volta, que sai transparente e herda o preenchimento do token); acima de 1 aproxima.
export const ZOOM_MIN_RECORTE = 0.2;
export const ZOOM_MAX_RECORTE = 6;

// --- Bolsa expandida: criação de tokens ---
// Paleta de cores do token: as coloridas primeiro; branco e preto, fixos, por último.
export const CORES_TOKEN = [
    0xe74c3c, 0xf39c12, 0xf1c40f, 0x2ecc71, 0x1abc9c, 0x3498db,
    0x9b59b6, 0xf098fb, 0x8d6e63, 0x95a5a6, 0xffffff, 0x000000,
];
export const COR_INICIAL_TOKEN = 0x3498db; // cor marcada ao abrir a bolsa
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
