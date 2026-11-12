// =====================================================================
// CONFIGURAÇÕES: todos os "números mágicos" do projeto ficam aqui.
// Para ajustar o comportamento do tabuleiro, normalmente basta mexer neste arquivo.
// =====================================================================

// --- Tabuleiro ---
export const COLUNAS_INICIAIS = 18; // quantas casas na horizontal ao abrir
export const LINHAS_INICIAIS = 10; // quantas casas na vertical ao abrir
export const TAMANHO_CASA = 64; // lado de cada casa, em pixels (no zoom 100%)

// Limites do tamanho do tabuleiro (em casas) pela barra de ferramentas.
// O mínimo tem que ser >= TAMANHO_MAX_TOKEN, senão um token não caberia.
export const MIN_CASAS = 5;
export const MAX_CASAS = 100;

// --- Mapa (imagem de fundo) ---
// Imagem carregada ao abrir (teste). Fica em public/, por isso o endereço começa em "/".
// Depois virá de um botão "Imagem de fundo". null = só a grade, sem imagem.
export const MAPA_INICIAL: string | null = "/images/maps/lago_arruinado.png";

// --- Régua ---
export const METROS_POR_CASA = 1.5; // cada casa do tabuleiro vale 1,5 m (5 pés do livro)

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
export const MAX_CARTOES_ANIMADOS = 20; // só os primeiros cartões (os visíveis) deslizam; os outros estão fora da tela

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
