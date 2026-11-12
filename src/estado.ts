// =====================================================================
// ESTADO: os DADOS do jogo e as regras que os alteram.
// Este arquivo NÃO conhece o PixiJS nem o HTML: só dados e regras.
// No multiplayer, é aqui que o servidor guardará a "verdade" da mesa, e os
// navegadores apenas desenharão o que vier daqui.
// =====================================================================

import {
    COLUNAS_INICIAIS,
    COR_BORDA_INICIAL_TOKEN,
    LINHAS_INICIAIS,
    MAPA_INICIAL,
    MAX_CARACTERES_MENSAGEM,
    MAX_CARACTERES_IMAGEM_TOKEN,
    MAX_CARACTERES_NOME_TOKEN,
    MAX_CASAS,
    MAX_MENSAGENS_CHAT,
    MAX_TOKENS,
    MIN_CASAS,
    TAMANHO_MAX_TOKEN,
    TAMANHO_MIN_TOKEN,
} from "./config.ts";
import { DADOS_DISPONIVEIS, MAX_MODIFICADOR_DADOS, MAX_QUANTIDADE_DADOS } from "./config.ts";
import { buscarCondicao } from "./condicoes.ts";
import { limitar } from "./coordenadas.ts";
import { formulaDosDados, type Rolagem } from "./dados.ts";

/** Quantas casas (por lado) um token ocupa: 1 = 1x1, 2 = 2x2, 3 = 3x3, 4 = 4x4. */
export type TamanhoToken = 1 | 2 | 3 | 4;

export interface Token {
    id: number;
    nome: string; // aparece na bolsa; nunca vazio (sem nome, vira "Token N")
    imagem: string | null; // miniatura recortada (texto "data:image/webp;base64,..."); null = sem imagem (o token é preenchido com a cor)
    col: number; // coluna do CANTO SUPERIOR ESQUERDO do token (0 = primeira)
    row: number; // linha do CANTO SUPERIOR ESQUERDO do token (0 = primeira)
    cor: number; // cor do PREENCHIMENTO em hexadecimal, ex.: 0xff0000 = vermelho
    corBorda: number; // cor da BORDA (por cima da imagem, se houver)
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
        { id: 1, nome: "Token 1", imagem: null, col: 3, row: 3, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, condicoes: [], guardado: false }, //
        { id: 2, nome: "Token 2", imagem: null, col: 6, row: 5, cor: 0x3498db, corBorda: 0xffffff, size: 1, condicoes: [], guardado: false }, //
        { id: 3, nome: "Token 3", imagem: null, col: 15, row: 1, cor: 0xf098fb, corBorda: 0xffffff, size: 1, condicoes: [], guardado: false }, //
        { id: 4, nome: "Token 4", imagem: null, col: 10, row: 2, cor: 0xe74c3c, corBorda: 0xffffff, size: 2, condicoes: [], guardado: false }, //
        { id: 5, nome: "Token 5", imagem: null, col: 12, row: 6, cor: 0x9b59b6, corBorda: 0xffffff, size: 1, condicoes: [], guardado: false }, //
    ] as Token[],
};

/** Uma mensagem do chat. */
export interface Mensagem {
    id: number;
    autor: string;
    texto: string;
    rolagem?: Rolagem; // só nas mensagens de rolagem de dados (o `texto` então é a fórmula e o total)
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
    return guardarMensagem({ id: proximoIdMensagem++, autor, texto: limpo, hora: Date.now() });
}

/**
 * Guarda no chat o resultado de uma rolagem de dados. O limite de caracteres NÃO vale aqui: ele é
 * para o que se DIGITA (o texto da rolagem é montado pelo programa). O `texto` guarda a fórmula e o
 * total (ex.: "2d6+3 = 12") para quem só lê texto.
 * No multiplayer, o servidor sorteia e envia este evento.
 */
export function adicionarRolagem(autor: string, rolagem: Rolagem): Mensagem {
    const texto = `${formulaDosDados(rolagem.quantidade, rolagem.lados, rolagem.modificador)} = ${rolagem.total}`;
    return guardarMensagem({ id: proximoIdMensagem++, autor, texto, rolagem, hora: Date.now() });
}

/**
 * Guarda uma mensagem que chegou PRONTA do servidor (com o id e a hora que ELE deu). Ignora se já existe.
 * (adicionarMensagem/adicionarRolagem são para quem CRIA a mensagem: no servidor, ou no modo local.)
 */
export function receberMensagem(mensagem: Mensagem): void {
    if (estado.mensagens.some((m) => m.id === mensagem.id)) return;
    guardarMensagem(mensagem);
}

/** Troca todo o histórico do chat pelo que o servidor mandou ao entrar na mesa. */
export function definirMensagens(lista: Mensagem[]): void {
    estado.mensagens = lista.slice(-MAX_MENSAGENS_CHAT);
}

/**
 * Uma rolagem PEDIDA é válida? (dado que existe, quantidade e modificador inteiros e dentro dos limites.)
 * O servidor confere isto ANTES de sortear: sem limites, alguém pediria 9999999d9999999 e travaria a mesa.
 */
export function rolagemValida(lados: number, quantidade: number, modificador: number): boolean {
    return (
        (DADOS_DISPONIVEIS as readonly number[]).includes(lados) &&
        Number.isInteger(quantidade) &&
        quantidade >= 1 &&
        quantidade <= MAX_QUANTIDADE_DADOS &&
        Number.isInteger(modificador) &&
        Math.abs(modificador) <= MAX_MODIFICADOR_DADOS
    );
}

/** Coloca a mensagem no fim da lista; passando de MAX_MENSAGENS_CHAT, as mais antigas saem. */
function guardarMensagem(mensagem: Mensagem): Mensagem {
    estado.mensagens.push(mensagem);
    if (estado.mensagens.length > MAX_MENSAGENS_CHAT)
        estado.mensagens.splice(0, estado.mensagens.length - MAX_MENSAGENS_CHAT);
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

/**
 * Cria um token NOVO, que já nasce guardado na BOLSA (o usuário o coloca no mapa depois, arrastando).
 * O tamanho e a cor são limitados aos valores válidos, e o nome é aparado e cortado a
 * MAX_CARACTERES_NOME_TOKEN (vazio, vira "Token N"). A regra vale aqui, e não só na interface:
 * o servidor precisará dela. Devolve o token criado, ou null se a mesa já tem MAX_TOKENS.
 * No multiplayer, é aqui que enviaremos o evento "criar_token" (o servidor é quem dá o id).
 */
export function criarToken(
    cor: number,
    size: number,
    nome = "",
    imagem: string | null = null,
    corBorda: number = COR_BORDA_INICIAL_TOKEN,
): Token | null {
    if (estado.tokens.length >= MAX_TOKENS) return null;
    const id = Math.max(0, ...estado.tokens.map((t) => t.id)) + 1; // sempre maior que os existentes
    const token: Token = {
        id,
        nome: nome.trim().slice(0, MAX_CARACTERES_NOME_TOKEN) || `Token ${id}`,
        imagem: imagemValida(imagem) ? imagem : null,
        col: 0,
        row: 0, // só valem quando o token for colocado no mapa
        cor: limitar(Math.round(cor), 0, 0xffffff),
        corBorda: limitar(Math.round(corBorda), 0, 0xffffff),
        size: limitar(Math.round(size), TAMANHO_MIN_TOKEN, TAMANHO_MAX_TOKEN) as TamanhoToken,
        condicoes: [],
        guardado: true,
    };
    estado.tokens.push(token);
    return token;
}

/**
 * A imagem de um token só vale se for uma miniatura em texto ("data:image/...") e não passar do limite:
 * assim ninguém enche a memória (nem a rede, no multiplayer) com uma foto inteira. O servidor precisará desta regra.
 */
function imagemValida(imagem: string | null): imagem is string {
    return imagem !== null && imagem.startsWith("data:image/") && imagem.length <= MAX_CARACTERES_IMAGEM_TOKEN;
}

/** O que dá para mudar num token que já existe (o que faltar fica como está). */
export interface MudancasToken {
    nome?: string;
    size?: number;
    cor?: number; // preenchimento
    corBorda?: number;
    imagem?: string | null; // miniatura nova, ou null para tirar a imagem (uma imagem inválida é ignorada)
}

/**
 * Edita nome, tamanho, cores e imagem de um token. As mesmas
 * regras da criação valem aqui: nome aparado e cortado a MAX_CARACTERES_NOME_TOKEN (vazio volta a "Token N"),
 * tamanho de 1 a 4 e cores válidas. Se o token cresce e passaria da borda do tabuleiro, é empurrado para dentro.
 * Devolve o token alterado, ou null se ele não existe. No multiplayer, aqui enviaremos o evento "editar_token".
 */
export function editarToken(id: number, mudancas: MudancasToken): Token | null {
    const token = buscarToken(id);
    if (!token) return null;
    if (mudancas.nome !== undefined) token.nome = mudancas.nome.trim().slice(0, MAX_CARACTERES_NOME_TOKEN) || `Token ${token.id}`;
    if (mudancas.cor !== undefined) token.cor = limitar(Math.round(mudancas.cor), 0, 0xffffff);
    if (mudancas.corBorda !== undefined) token.corBorda = limitar(Math.round(mudancas.corBorda), 0, 0xffffff);
    if (mudancas.imagem !== undefined && (mudancas.imagem === null || imagemValida(mudancas.imagem))) token.imagem = mudancas.imagem;
    if (mudancas.size !== undefined) {
        token.size = limitar(Math.round(mudancas.size), TAMANHO_MIN_TOKEN, TAMANHO_MAX_TOKEN) as TamanhoToken;
        token.col = limitar(token.col, 0, estado.colunas - token.size);
        token.row = limitar(token.row, 0, estado.linhas - token.size);
    }
    return token;
}

/**
 * Troca a imagem de um token (null = tirar a imagem; o token volta a ser preenchido com a cor).
 * Devolve o token alterado, ou null se o token não existe ou a imagem não é válida.
 * No multiplayer, é aqui que enviaremos o evento "mudar_imagem_token".
 */
export function definirImagemToken(id: number, imagem: string | null): Token | null {
    const token = buscarToken(id);
    if (!token || (imagem !== null && !imagemValida(imagem))) return null;
    token.imagem = imagem;
    return token;
}

/**
 * O token pode ficar com o canto superior esquerdo em (col, row)? Só vale com números INTEIROS e o bloco
 * inteiro dentro do tabuleiro (é o mesmo encaixe que a interface faz; o servidor repete a conta, não confia nela).
 */
export function posicaoValida(token: Token, col: number, row: number): boolean {
    return (
        Number.isInteger(col) &&
        Number.isInteger(row) &&
        col >= 0 &&
        row >= 0 &&
        col <= estado.colunas - token.size &&
        row <= estado.linhas - token.size
    );
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
