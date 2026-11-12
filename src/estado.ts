// =====================================================================
// ESTADO: os DADOS do jogo e as regras que os alteram.
// Este arquivo NÃO conhece o PixiJS nem o HTML: só dados e regras.
// No multiplayer, é aqui que o servidor guardará a "verdade" da mesa, e os
// navegadores apenas desenharão o que vier daqui.
// =====================================================================

import { COLUNAS_INICIAIS, LINHAS_INICIAIS, MAPA_INICIAL, MAX_CARACTERES_MENSAGEM, MAX_CASAS, MAX_MENSAGENS_CHAT, MIN_CASAS, TAMANHO_MAX_TOKEN, TAMANHO_MIN_TOKEN } from "./config";
import { buscarCondicao } from "./condicoes";
import { limitar } from "./coordenadas";

/** Quantas casas (por lado) um token ocupa: 1 = 1x1, 2 = 2x2, 3 = 3x3, 4 = 4x4. */
export type TamanhoToken = 1 | 2 | 3 | 4;

export interface Token {
    id: number;
    col: number; // coluna do CANTO SUPERIOR ESQUERDO do token (0 = primeira)
    row: number; // linha do CANTO SUPERIOR ESQUERDO do token (0 = primeira)
    cor: number; // cor em hexadecimal, ex.: 0xff0000 = vermelho
    size: TamanhoToken; // ocupa size x size casas (ex.: 3 = bloco de 3x3)
    condicoes: string[]; // ids das condições (ver condicoes.ts), na ORDEM em que foram aplicadas
    guardado: boolean; // true = está na BOLSA (fora do tabuleiro); col/row só valem quando false
}

/**
 * O estado da mesa. É um objeto (e não variáveis soltas) porque outros
 * arquivos precisam LER valores que mudam em tempo real: um "let" exportado
 * não pode ser reatribuído de fora, mas as propriedades de um objeto podem.
 */
export const estado = {
    colunas: COLUNAS_INICIAIS, // largura do tabuleiro, em casas
    linhas: LINHAS_INICIAIS, // altura do tabuleiro, em casas
    // Imagem de fundo, esticada sobre o tabuleiro inteiro (null = sem imagem).
    mapa: (MAPA_INICIAL ? { url: MAPA_INICIAL } : null) as { url: string } | null,
    // Pinturas feitas no mapa (lápis e formas), da mais antiga para a mais nova.
    desenhos: [] as Desenho[],
    // Mensagens do chat, da mais antiga para a mais nova.
    mensagens: [] as Mensagem[],
    tokens: [
        { id: 1, col: 3, row: 3, cor: 0xe74c3c, size: 1, condicoes: [], guardado: false }, // vermelho
        { id: 2, col: 6, row: 5, cor: 0x3498db, size: 1, condicoes: [], guardado: false }, // azul
        { id: 3, col: 15, row: 1, cor: 0x3498db, size: 3, condicoes: [], guardado: false }, // azul
        { id: 4, col: 10, row: 2, cor: 0x2ecc71, size: 2, condicoes: [], guardado: false }, // verde 2x2
        { id: 5, col: 12, row: 6, cor: 0x9b59b6, size: 4, condicoes: [], guardado: false }, // roxo 4x4
    ] as Token[],
};

/** Uma mensagem do chat. */
export interface Mensagem {
    id: number;
    autor: string;
    texto: string;
    hora: number; // quando foi enviada (milissegundos desde 1970, como Date.now())
}

let proximoIdMensagem = 1;


/**
 * Guarda uma mensagem do chat (as mais antigas saem quando passa de MAX_MENSAGENS_CHAT).
 * No multiplayer, aqui enviaremos o evento "enviar_mensagem" ao servidor.
 * Devolve a mensagem criada, ou null se o texto está vazio ou passa de MAX_CARACTERES_MENSAGEM caracteres
 * (a regra também vale aqui, e não só na interface: o servidor precisará dela).
 */
export function adicionarMensagem(autor: string, texto: string): Mensagem | null {
    const limpo = texto.trim();
    if (limpo === "" || limpo.length > MAX_CARACTERES_MENSAGEM) return null;
    const mensagem: Mensagem = { id: proximoIdMensagem++, autor, texto: limpo, hora: Date.now() };
    estado.mensagens.push(mensagem);
    if (estado.mensagens.length > MAX_MENSAGENS_CHAT) estado.mensagens.splice(0, estado.mensagens.length - MAX_MENSAGENS_CHAT);
    return mensagem;
}

/** Um ponto em CASAS (pode ser fracionário: 3,5 = o meio da quarta casa). */
export interface Ponto {
    x: number;
    y: number;
}

/**
 * Uma pintura no mapa. Todas as medidas são em CASAS (não em pixels), como o resto do estado.
 *   livre      traço do lápis: lista de pontos
 *   elipse     cabe numa "caixa": canto superior esquerdo (x,y), largura e altura
 *   retangulo  a própria caixa: canto superior esquerdo (x,y), largura e altura
 *   triangulo  cabe na caixa, com a ponta em cima, no meio
 * As formas são só CONTORNO (sem preenchimento).
 */
export type Desenho =
    | { id: number; tipo: "livre"; cor: number; pontos: Ponto[] }
    | { id: number; tipo: "elipse"; cor: number; x: number; y: number; largura: number; altura: number }
    | { id: number; tipo: "retangulo"; cor: number; x: number; y: number; largura: number; altura: number }
    | { id: number; tipo: "triangulo"; cor: number; x: number; y: number; largura: number; altura: number };

/** Um desenho ainda sem id (o id é dado ao adicionar). */
export type NovoDesenho = Desenho extends infer D ? (D extends { id: number } ? Omit<D, "id"> : never) : never;

let proximoIdDesenho = 1;

/** Guarda uma nova pintura. No multiplayer, aqui enviaremos o evento "desenhar" ao servidor. */
export function adicionarDesenho(novo: NovoDesenho): Desenho {
    const desenho = { ...novo, id: proximoIdDesenho++ } as Desenho;
    estado.desenhos.push(desenho);
    return desenho;
}

/** Apaga as pinturas com estes ids (usado pela borracha). */
export function removerDesenhos(ids: number[]): void {
    estado.desenhos = estado.desenhos.filter((d) => !ids.includes(d.id));
}

/** Apaga TODAS as pinturas do mapa. */
export function apagarTodosDesenhos(): void {
    estado.desenhos = [];
}

/**
 * Troca a imagem de fundo (null = tirar a imagem). No multiplayer, é aqui que
 * enviaremos o evento "mudar_mapa" ao servidor.
 */
export function definirMapa(url: string | null): void {
    estado.mapa = url ? { url } : null;
}

/** Procura um token pelo id. */
export function buscarToken(id: number): Token | undefined {
    return estado.tokens.find((t) => t.id === id);
}

/**
 * Ponto onde a posição de um token muda ao ser ARRASTADO.
 * Hoje só altera a memória local. No futuro, aqui enviaremos um evento
 * ao servidor ("mover_token") e ele avisará todos os jogadores.
 */
export function moverToken(id: number, col: number, row: number): void {
    const token = buscarToken(id);
    if (!token) return;
    token.col = col;
    token.row = row;
}

/**
 * Guarda um token na BOLSA: ele sai do tabuleiro (mantém tamanho, cor e condições).
 * No multiplayer, é aqui que enviaremos o evento "guardar_token".
 */
export function guardarToken(id: number): void {
    const token = buscarToken(id);
    if (token) token.guardado = true;
}

/** Tira um token da bolsa e o coloca no tabuleiro, com o canto superior esquerdo em (col, row). */
export function colocarToken(id: number, col: number, row: number): void {
    const token = buscarToken(id);
    if (!token) return;
    token.guardado = false;
    token.col = col;
    token.row = row;
}

/**
 * Adiciona/remove colunas e linhas. Valores positivos adicionam (à direita
 * e embaixo, então os tokens existentes NÃO mudam de lugar); negativos removem.
 * Devolve a lista de tokens que MUDARAM de lugar (ver definirTamanhoTabuleiro).
 */
export function redimensionarTabuleiro(deltaColunas: number, deltaLinhas: number): Token[] {
    return definirTamanhoTabuleiro(estado.colunas + deltaColunas, estado.linhas + deltaLinhas);
}

/**
 * Define o tamanho do tabuleiro (em casas) de uma vez. Os valores são limitados
 * a MIN_CASAS..MAX_CASAS. Usado pelos botões de colunas/linhas e pela calibragem
 * da grade (que descobre o tamanho a partir do mapa).
 *
 * Se o tabuleiro encolher, tokens que ficaram fora (ou que não cabem mais
 * inteiros) são puxados para dentro. O limite considera o tamanho do token:
 * um 3x3 só pode ter o canto esquerdo até (colunas - 3).
 *
 * Devolve a lista de tokens que MUDARAM de lugar, para o desenho atualizá-los.
 */
export function definirTamanhoTabuleiro(colunas: number, linhas: number): Token[] {
    estado.colunas = limitar(colunas, MIN_CASAS, MAX_CASAS);
    estado.linhas = limitar(linhas, MIN_CASAS, MAX_CASAS);

    const movidos: Token[] = [];
    for (const token of estado.tokens) {
        const col = limitar(token.col, 0, estado.colunas - token.size);
        const row = limitar(token.row, 0, estado.linhas - token.size);
        if (col !== token.col || row !== token.row) {
            moverToken(token.id, col, row);
            movidos.push(token);
        }
    }
    return movidos;
}

/**
 * Liga/desliga uma condição de um token: se ele ainda NÃO tem a condição, ela
 * é adicionada (no fim da lista); se JÁ tem, é removida. É a única forma de
 * remover uma condição: clicar de novo nela.
 *
 * Devolve o token alterado, ou null se o token ou a condição não existem.
 */
export function alternarCondicao(tokenId: number, condicaoId: string): Token | null {
    const token = buscarToken(tokenId);
    if (!token || !buscarCondicao(condicaoId)) return null;

    const posicao = token.condicoes.indexOf(condicaoId);
    if (posicao >= 0) {
        token.condicoes.splice(posicao, 1); // já tinha: remove
    } else {
        token.condicoes.push(condicaoId); // não tinha: adiciona
    }
    return token;
}

/**
 * Aumenta (+1) ou diminui (-1) o tamanho de um token.
 * O canto superior esquerdo é mantido, e se o token crescido passaria da
 * borda do tabuleiro, ele é empurrado para dentro.
 *
 * Devolve o token alterado, ou null se nada mudou (já estava no limite
 * ou o id não existe).
 */
export function mudarTamanhoToken(id: number, delta: number): Token | null {
    const token = buscarToken(id);
    if (!token) return null;

    const novo = limitar(token.size + delta, TAMANHO_MIN_TOKEN, TAMANHO_MAX_TOKEN) as TamanhoToken;
    if (novo === token.size) return null;

    token.size = novo;
    token.col = limitar(token.col, 0, estado.colunas - novo);
    token.row = limitar(token.row, 0, estado.linhas - novo);
    return token;
}
