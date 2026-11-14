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
    MAX_ABAS_FICHA,
    MAX_CARACTERES_NOME_ABA_FICHA,
    MAX_CARACTERES_NOME_FICHA,
    MAX_CARACTERES_NOME_GRUPO,
    MAX_GRUPOS,
    MAX_CARACTERES_NOME_TOKEN,
    MAX_CARACTERES_TEXTO_FICHA,
    MAX_CASAS,
    MAX_FICHAS,
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
import type { RolagemDeFicha } from "./formulas.ts";

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
    favorito: boolean; // marcado com a estrela na bolsa (vale para a mesa toda, por enquanto: ainda não há contas)
    grupos: number[]; // ids dos GRUPOS (ver `Grupo`) a que o token pertence; sem repetir
}

/**
 * Um GRUPO: um nome e uma cor, usados para organizar e filtrar tokens E fichas (os mesmos grupos servem aos dois; um item pode estar em
 * vários). No servidor cada grupo é um arquivo em `dados/grupos/<id>.json`.
 */
export interface Grupo {
    id: number;
    nome: string; // nunca vazio (sem nome, vira "Grupo N")
    cor: number; // cor em hexadecimal, ex.: 0x3498db
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
    // Fichas de personagem (documentos), da mais antiga para a mais nova. No multiplayer o SERVIDOR as guarda em arquivos.
    fichas: [] as Ficha[],
    // Grupos para organizar tokens e fichas (nome + cor), na ordem de criação. No multiplayer o SERVIDOR os guarda em arquivos.
    grupos: [] as Grupo[],
    // Tokens da mesa. Começa VAZIO: os tokens nascem pela bolsa ("Criar token") ou vêm dos arquivos de `dados/tokens/` do servidor
    // (ver servidor/dados.ts). Cada token é um arquivo; excluir o token apaga o arquivo.
    tokens: [] as Token[],
};

/** Uma mensagem do chat. */
export interface Mensagem {
    id: number;
    autor: string;
    texto: string;
    rolagem?: Rolagem; // só nas mensagens de rolagem de dados (o `texto` então é a fórmula e o total)
    rolagemFicha?: RolagemDeFicha; // só nas mensagens de uma ROLAGEM DE FICHA (o `texto` então é o nome, a fórmula e o total)
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
 * Guarda no chat o resultado de uma ROLAGEM DE FICHA (ex.: o "Ataque com espada" de uma ficha). Como nas rolagens de dados, o limite de
 * caracteres não vale (o texto é montado pelo programa). O `texto` guarda o nome, a fórmula e o total para quem só lê texto.
 * No multiplayer, o servidor sorteia e envia este evento.
 */
export function adicionarRolagemDeFicha(autor: string, rolagemFicha: RolagemDeFicha): Mensagem {
    const texto = `${rolagemFicha.nome}: ${rolagemFicha.formula} = ${rolagemFicha.total}`;
    return guardarMensagem({ id: proximoIdMensagem++, autor, texto, rolagemFicha, hora: Date.now() });
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

// ---------------------------------------------------------------------
// FICHAS: cada ficha é um DOCUMENTO (nome + de 1 a 6 abas, cada uma com o seu texto). No multiplayer o servidor guarda cada uma num arquivo JSON.
// A ficha é CRIADA NO MESMO INSTANTE do clique em "Criar ficha": nasce VAZIA (só com o nome) e o arquivo já existe. O texto se
// escreve depois, abrindo a ficha, e pode levar muito tempo (abrir, fechar, voltar): por isso não se espera ele ficar pronto.
// Toda ficha tem um número de VERSÃO: começa em 1 e sobe 1 a cada vez que é salva por cima. Assim, quando duas pessoas
// editam a mesma ficha, o servidor percebe que uma delas está com uma cópia ANTIGA e recusa o salvamento dela (em vez de
// apagar, sem aviso, o que a outra fez). Existem CRIAR, EDITAR (nome e abas, com a checagem de versão) e EXCLUIR.
// Por enquanto a ficha não se liga a nenhum token.
// ---------------------------------------------------------------------

/**
 * Uma ABA (página) da ficha. Uma ficha tem de 1 a MAX_ABAS_FICHA abas, todas dentro do MESMO arquivo. Cada aba tem o seu texto e as suas
 * ROLAGENS, mas as VARIÁVEIS valem para a ficha inteira (uma variável escrita numa aba pode ser usada nas outras).
 */
export interface AbaFicha {
    nome: string; // nunca vazio (sem nome, vira "Página N")
    texto: string;
}

export interface Ficha {
    id: number;
    nome: string; // nunca vazio (sem nome, vira "Ficha N")
    abas: AbaFicha[]; // de 1 a MAX_ABAS_FICHA; o conteúdo livre da ficha (variáveis e rolagens) fica no texto de cada aba
    versao: number; // 1, 2, 3... (sobe a cada salvamento)
    criadaEm: number; // milissegundos desde 1970 (Date.now())
    alteradaEm: number;
    favorito: boolean; // marcada com a estrela na bolsa (mudar isto NÃO sobe a versão: não é o conteúdo da ficha)
    grupos: number[]; // ids dos GRUPOS a que a ficha pertence (idem: não sobe a versão)
}

let proximoIdFicha = 1;

/**
 * Monta uma ficha NOVA e VAZIA (chamada "Ficha N", versão 1, sem texto) SEM guardá-la na lista: o nome e o texto se definem
 * depois, ao abrir a ficha. Devolve null se a mesa já tem MAX_FICHAS (a regra vale aqui, e não só na interface: o servidor a
 * repete). O servidor usa esta função (para gravar o arquivo ANTES de guardar a ficha) e o modo local usa `criarFicha`.
 */
export function montarFicha(): Ficha | null {
    if (estado.fichas.length >= MAX_FICHAS) return null;
    const id = proximoIdFicha++;
    const agora = Date.now();
    return { id, nome: `Ficha ${id}`, abas: [{ nome: nomePadraoDaAba(0), texto: "" }], versao: 1, criadaEm: agora, alteradaEm: agora, favorito: false, grupos: [] };
}

/** Guarda na lista uma ficha que já está pronta (a que o servidor mandou, ou a que acabou de ser montada). Mesma id: substitui. */
export function receberFicha(ficha: Ficha): void {
    const posicao = estado.fichas.findIndex((f) => f.id === ficha.id);
    if (posicao >= 0) estado.fichas[posicao] = ficha;
    else {
        estado.fichas.push(ficha);
        estado.fichas.sort((a, b) => a.id - b.id);
    }
    proximoIdFicha = Math.max(proximoIdFicha, ficha.id + 1);
}

/** Troca todas as fichas pela lista que o servidor mandou ao entrar na mesa (ou pela que foi lida dos arquivos ao ligar o servidor). */
export function definirFichas(lista: Ficha[], proximoIdMinimo = 1): void {
    estado.fichas = [...lista].sort((a, b) => a.id - b.id);
    proximoIdFicha = estado.fichas.reduce((maior, f) => Math.max(maior, f.id + 1), proximoIdMinimo);
}

/** Nome da ficha: sem caracteres de controle, espaços aparados e repetidos juntados, cortado ao máximo. Vazio vira "Ficha N". */
export function normalizarNomeFicha(id: number, nome: string): string {
    const limpo = nome.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_NOME_FICHA).trim();
    return limpo || `Ficha ${id}`;
}

/** Texto da ficha: quebras de linha normalizadas (\r\n vira \n) e sem caracteres de controle (menos quebra de linha e tabulação). */
export function normalizarTextoFicha(texto: string): string {
    return texto.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** O nome de uma aba sem nome: "Página 1", "Página 2"... (`posicao` conta a partir de 0). */
export function nomePadraoDaAba(posicao: number): string {
    return `Página ${posicao + 1}`;
}

/** Nome de aba: mesma limpeza do nome da ficha, cortado a MAX_CARACTERES_NOME_ABA_FICHA. Vazio vira "Página N". */
export function normalizarNomeAba(posicao: number, nome: string): string {
    const limpo = nome.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_NOME_ABA_FICHA).trim();
    return limpo || nomePadraoDaAba(posicao);
}

/** Quantos caracteres de texto a ficha tem, SOMANDO todas as abas (é isso que o limite MAX_CARACTERES_TEXTO_FICHA mede). */
export function tamanhoDoTextoDasAbas(abas: readonly { texto: string }[]): number {
    return abas.reduce((soma, aba) => soma + aba.texto.length, 0);
}

/** Limpa uma lista de abas (nomes e textos). Devolve null se não tem de 1 a MAX_ABAS_FICHA abas. */
export function normalizarAbas(abas: readonly AbaFicha[]): AbaFicha[] | null {
    if (abas.length < 1 || abas.length > MAX_ABAS_FICHA) return null;
    return abas.map((aba, i) => ({ nome: normalizarNomeAba(i, aba.nome), texto: normalizarTextoFicha(aba.texto) }));
}

/** As duas listas de abas são iguais (mesma quantidade, nomes e textos)? */
export function abasIguais(a: readonly AbaFicha[], b: readonly AbaFicha[]): boolean {
    return a.length === b.length && a.every((aba, i) => aba.nome === b[i].nome && aba.texto === b[i].texto);
}

/** O que dá para mudar numa ficha que já existe (o que faltar fica como está). `abas` troca a lista INTEIRA de abas. */
export interface MudancasFicha {
    nome?: string;
    abas?: AbaFicha[];
}

/** O resultado de pedir uma edição: a ficha como ficaria, ou o motivo de a edição ser recusada. */
export type ResultadoEdicaoFicha =
    | { ok: true; ficha: Ficha; mudou: boolean } // `mudou` = false: nada mudou de verdade (a versão não sobe)
    | { ok: false; erro: "nao_existe" | "versao_antiga" | "texto_longo" | "abas_invalidas" };

/**
 * Monta a ficha como ela ficaria depois da edição, SEM guardá-la na lista (o servidor grava o arquivo ANTES de guardar).
 * `versaoBase` é a versão que a pessoa tinha na tela ao abrir: se a ficha já está numa versão MAIS NOVA, alguém a salvou nesse meio
 * tempo e a edição é recusada ("versao_antiga"), para ninguém apagar o trabalho do outro sem perceber. Nome e texto passam pela mesma
 * limpeza da criação; um texto acima de MAX_CARACTERES_TEXTO_FICHA é recusado (não cortado, para não perder o fim sem avisar). Se nada
 * mudou, a versão NÃO sobe. A regra vale aqui, e não só na interface: o servidor a repete.
 */
export function montarEdicaoDaFicha(id: number, versaoBase: number, mudancas: MudancasFicha): ResultadoEdicaoFicha {
    const atual = estado.fichas.find((f) => f.id === id);
    if (!atual) return { ok: false, erro: "nao_existe" };
    if (atual.versao !== versaoBase) return { ok: false, erro: "versao_antiga" };
    const nome = mudancas.nome === undefined ? atual.nome : normalizarNomeFicha(id, mudancas.nome);
    const abas = mudancas.abas === undefined ? atual.abas : normalizarAbas(mudancas.abas);
    if (abas === null) return { ok: false, erro: "abas_invalidas" };
    if (tamanhoDoTextoDasAbas(abas) > MAX_CARACTERES_TEXTO_FICHA) return { ok: false, erro: "texto_longo" };
    if (nome === atual.nome && abasIguais(abas, atual.abas)) return { ok: true, ficha: atual, mudou: false };
    return { ok: true, ficha: { ...atual, nome, abas, versao: atual.versao + 1, alteradaEm: Date.now() }, mudou: true };
}

/** Modo local: monta a edição e já a guarda (só na memória da aba). */
export function editarFicha(id: number, versaoBase: number, mudancas: MudancasFicha): ResultadoEdicaoFicha {
    const resultado = montarEdicaoDaFicha(id, versaoBase, mudancas);
    if (resultado.ok && resultado.mudou) receberFicha(resultado.ficha);
    return resultado;
}

/** Modo local: monta a ficha vazia e já a guarda. Devolve null se a mesa já tem o máximo de fichas. */
export function criarFicha(): Ficha | null {
    const ficha = montarFicha();
    if (ficha) receberFicha(ficha);
    return ficha;
}

/** Tira a ficha da lista (o arquivo e o editor aberto são problema de quem chama). O id NÃO é reaproveitado. Devolve false se ela não existe. */
export function excluirFicha(id: number): boolean {
    const posicao = estado.fichas.findIndex((f) => f.id === id);
    if (posicao < 0) return false;
    estado.fichas.splice(posicao, 1);
    return true;
}

/**
 * Confere uma ficha que veio de FORA (um arquivo lido do disco, que alguém pode ter editado à mão). Devolve uma ficha limpa
 * (só os campos conhecidos) ou null se qualquer campo estiver errado. Nunca lança erro.
 */
export function fichaValida(bruto: unknown): Ficha | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const f = bruto as Record<string, unknown>;
    const inteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor);
    if (!inteiro(f.id) || f.id < 1 || !inteiro(f.versao) || f.versao < 1 || !inteiro(f.criadaEm) || !inteiro(f.alteradaEm)) return null;
    if (typeof f.nome !== "string" || f.nome.trim() === "" || f.nome.length > MAX_CARACTERES_NOME_FICHA) return null;
    // Arquivos ANTIGOS (de antes das abas) têm só `texto`: viram uma ficha de uma aba só, "Página 1". Os novos têm `abas`.
    let abas: AbaFicha[];
    if (Array.isArray(f.abas)) {
        if (f.abas.length < 1 || f.abas.length > MAX_ABAS_FICHA) return null;
        abas = [];
        for (const bruta of f.abas as unknown[]) {
            if (typeof bruta !== "object" || bruta === null) return null;
            const { nome, texto } = bruta as Record<string, unknown>;
            if (typeof nome !== "string" || nome.trim() === "" || nome.length > MAX_CARACTERES_NOME_ABA_FICHA || typeof texto !== "string") return null;
            abas.push({ nome, texto });
        }
    } else if (typeof f.texto === "string") {
        abas = [{ nome: nomePadraoDaAba(0), texto: f.texto }];
    } else {
        return null;
    }
    if (tamanhoDoTextoDasAbas(abas) > MAX_CARACTERES_TEXTO_FICHA) return null;
    return { id: f.id, nome: f.nome, abas, versao: f.versao, criadaEm: f.criadaEm, alteradaEm: f.alteradaEm, favorito: f.favorito === true, grupos: gruposDoArquivo(f.grupos) };
}

// ---------------------------------------------------------------------
// GRUPOS e FAVORITOS (tokens e fichas)
// ---------------------------------------------------------------------

let proximoIdGrupo = 1; // sempre sobe (um id apagado não é reaproveitado)

/** Nome do grupo: sem caracteres de controle, espaços aparados e juntados, cortado ao máximo. Vazio vira "Grupo N". */
export function normalizarNomeGrupo(id: number, nome: string): string {
    const limpo = nome.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_NOME_GRUPO).trim();
    return limpo || `Grupo ${id}`;
}

/** Só os ids que existem como grupo, sem repetir e na ordem em que chegaram (a regra vale no servidor também: nada de grupo fantasma). */
export function limparGrupos(ids: number[]): number[] {
    const existentes = new Set(estado.grupos.map((g) => g.id));
    return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && existentes.has(id)))];
}

/** O campo `grupos` lido de um ARQUIVO (que pode faltar, nos arquivos antigos, ou vir estragado): só inteiros positivos, sem repetir, até MAX_GRUPOS. */
function gruposDoArquivo(bruto: unknown): number[] {
    if (!Array.isArray(bruto)) return [];
    return [...new Set((bruto as unknown[]).filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id >= 1))].slice(0, MAX_GRUPOS);
}

/** Monta um grupo NOVO sem guardá-lo (o servidor grava o arquivo antes). Devolve null se a mesa já tem MAX_GRUPOS. */
export function montarGrupo(nome: string, cor: number): Grupo | null {
    if (estado.grupos.length >= MAX_GRUPOS) return null;
    const id = proximoIdGrupo++;
    return { id, nome: normalizarNomeGrupo(id, nome), cor: limitar(Math.round(cor), 0, 0xffffff) };
}

/** Guarda (ou atualiza, se o id já existe) um grupo pronto. */
export function receberGrupo(grupo: Grupo): void {
    const posicao = estado.grupos.findIndex((g) => g.id === grupo.id);
    if (posicao >= 0) estado.grupos[posicao] = grupo;
    else {
        estado.grupos.push(grupo);
        estado.grupos.sort((a, b) => a.id - b.id);
    }
    proximoIdGrupo = Math.max(proximoIdGrupo, grupo.id + 1);
}

/** Troca todos os grupos pela lista que o servidor mandou ao entrar (ou pela lida dos arquivos). */
export function definirGrupos(lista: Grupo[], proximoIdMinimo = 1): void {
    estado.grupos = [...lista].sort((a, b) => a.id - b.id);
    proximoIdGrupo = estado.grupos.reduce((maior, g) => Math.max(maior, g.id + 1), proximoIdMinimo);
}

/** Confere um grupo lido de um arquivo (pode ter sido editado à mão). Devolve o grupo limpo ou null. */
export function grupoValido(bruto: unknown): Grupo | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const g = bruto as Record<string, unknown>;
    const inteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor);
    if (!inteiro(g.id) || g.id < 1 || !inteiro(g.cor) || g.cor < 0 || g.cor > 0xffffff) return null;
    if (typeof g.nome !== "string" || g.nome.trim() === "" || g.nome.length > MAX_CARACTERES_NOME_GRUPO) return null;
    return { id: g.id, nome: g.nome, cor: g.cor };
}

/** Monta o grupo como ficaria depois de editar (nome e/ou cor), sem guardar. null se ele não existe. */
export function montarEdicaoDoGrupo(id: number, mudancas: { nome?: string; cor?: number }): Grupo | null {
    const atual = estado.grupos.find((g) => g.id === id);
    if (!atual) return null;
    return {
        id,
        nome: mudancas.nome === undefined ? atual.nome : normalizarNomeGrupo(id, mudancas.nome),
        cor: mudancas.cor === undefined ? atual.cor : limitar(Math.round(mudancas.cor), 0, 0xffffff),
    };
}

/**
 * Tira o grupo da lista E de todos os tokens e fichas que o tinham (os itens continuam; só perdem a marca). Devolve os ids dos tokens
 * e das fichas que foram mudados (o servidor regrava esses arquivos). Devolve null se o grupo não existe.
 */
export function excluirGrupo(id: number): { tokens: number[]; fichas: number[] } | null {
    const posicao = estado.grupos.findIndex((g) => g.id === id);
    if (posicao < 0) return null;
    estado.grupos.splice(posicao, 1);
    const tokens: number[] = [];
    const fichas: number[] = [];
    for (const t of estado.tokens) {
        if (t.grupos.includes(id)) {
            t.grupos = t.grupos.filter((g) => g !== id);
            tokens.push(t.id);
        }
    }
    for (const f of estado.fichas) {
        if (f.grupos.includes(id)) {
            f.grupos = f.grupos.filter((g) => g !== id);
            fichas.push(f.id);
        }
    }
    return { tokens, fichas };
}

/** O que dá para marcar numa ficha SEM mexer no conteúdo dela. */
export interface MarcacaoFicha {
    favorito?: boolean;
    grupos?: number[];
}

/**
 * Monta a ficha com a nova marcação (favorito e/ou grupos), SEM guardá-la. A VERSÃO e a data de alteração NÃO mudam: estrela e grupo não são o
 * conteúdo da ficha, então marcar nunca causa conflito com quem a está editando. null se a ficha não existe.
 */
export function montarMarcacaoDaFicha(id: number, marcacao: MarcacaoFicha): Ficha | null {
    const atual = estado.fichas.find((f) => f.id === id);
    if (!atual) return null;
    return {
        ...atual,
        favorito: marcacao.favorito === undefined ? atual.favorito : marcacao.favorito === true,
        grupos: marcacao.grupos === undefined ? atual.grupos : limparGrupos(marcacao.grupos),
    };
}

/** Modo local: marca a ficha e já guarda. Devolve a ficha, ou null se não existe. */
export function marcarFicha(id: number, marcacao: MarcacaoFicha): Ficha | null {
    const ficha = montarMarcacaoDaFicha(id, marcacao);
    if (ficha) receberFicha(ficha);
    return ficha;
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

let proximoIdToken = 1; // sempre sobe (um id apagado não é reaproveitado)

/** Nome do token: sem caracteres de controle (quebra de linha, etc.), aparado e cortado a MAX_CARACTERES_NOME_TOKEN. */
const limparNomeToken = (nome: string): string => nome.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CARACTERES_NOME_TOKEN).trim();

/**
 * Monta um token NOVO, que já nasce guardado na BOLSA (o usuário o coloca no mapa depois, arrastando), SEM guardá-lo na lista.
 * O tamanho e a cor são limitados aos valores válidos, e o nome é aparado e cortado a MAX_CARACTERES_NOME_TOKEN (vazio, vira
 * "Token N"). A regra vale aqui, e não só na interface: o servidor a repete (ele dá o id e grava o arquivo ANTES de guardar o
 * token). Devolve null se a mesa já tem MAX_TOKENS. O modo local usa `criarToken`.
 */
export function montarToken(
    cor: number,
    size: number,
    nome = "",
    imagem: string | null = null,
    corBorda: number = COR_BORDA_INICIAL_TOKEN,
): Token | null {
    if (estado.tokens.length >= MAX_TOKENS) return null;
    const id = proximoIdToken++;
    return {
        id,
        nome: limparNomeToken(nome) || `Token ${id}`,
        imagem: imagemValida(imagem) ? imagem : null,
        col: 0,
        row: 0, // só valem quando o token for colocado no mapa
        cor: limitar(Math.round(cor), 0, 0xffffff),
        corBorda: limitar(Math.round(corBorda), 0, 0xffffff),
        size: limitar(Math.round(size), TAMANHO_MIN_TOKEN, TAMANHO_MAX_TOKEN) as TamanhoToken,
        condicoes: [],
        guardado: true,
        favorito: false,
        grupos: [],
    };
}

/**
 * Guarda na lista um token que já está pronto (o que o servidor mandou, ou o que acabou de ser montado). Se o id já existe,
 * ATUALIZA o objeto que está lá (campo a campo): o desenho e os menus guardam referências a ele. Devolve o token que ficou na lista.
 */
export function receberToken(token: Token): Token {
    proximoIdToken = Math.max(proximoIdToken, token.id + 1);
    const existente = buscarToken(token.id);
    if (!existente) {
        estado.tokens.push(token);
        return token;
    }
    Object.assign(existente, token, { condicoes: [...token.condicoes], grupos: [...token.grupos] });
    return existente;
}

/** Troca todos os tokens pela lista que o servidor mandou ao entrar na mesa (ou pela que foi lida dos arquivos ao ligar o servidor). */
export function definirTokens(lista: Token[], proximoIdMinimo = 1): void {
    estado.tokens = [...lista];
    proximoIdToken = estado.tokens.reduce((maior, t) => Math.max(maior, t.id + 1), proximoIdMinimo);
}

/** Modo local: monta o token e já o guarda na lista. Devolve null se a mesa já tem o máximo de tokens. */
export function criarToken(
    cor: number,
    size: number,
    nome = "",
    imagem: string | null = null,
    corBorda: number = COR_BORDA_INICIAL_TOKEN,
): Token | null {
    const token = montarToken(cor, size, nome, imagem, corBorda);
    return token ? receberToken(token) : null;
}

/** Tira o token da lista (o desenho e o arquivo são problema de quem chama). Devolve false se ele não existe. */
export function excluirToken(id: number): boolean {
    const posicao = estado.tokens.findIndex((t) => t.id === id);
    if (posicao < 0) return false;
    estado.tokens.splice(posicao, 1);
    return true;
}

/**
 * Confere um token que veio de FORA (um arquivo lido do disco, que alguém pode ter editado à mão). Devolve um token limpo (só os
 * campos conhecidos) ou null se qualquer campo estiver errado. Um token que diz estar no mapa mas fora do tabuleiro volta para a
 * bolsa. Nunca lança erro.
 */
export function tokenValido(bruto: unknown): Token | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const t = bruto as Record<string, unknown>;
    const inteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor);
    const cor = (valor: unknown): valor is number => inteiro(valor) && valor >= 0 && valor <= 0xffffff;
    if (!inteiro(t.id) || t.id < 1 || !inteiro(t.col) || !inteiro(t.row) || !cor(t.cor) || !cor(t.corBorda)) return null;
    if (!inteiro(t.size) || t.size < TAMANHO_MIN_TOKEN || t.size > TAMANHO_MAX_TOKEN) return null;
    if (typeof t.nome !== "string" || t.nome.trim() === "" || t.nome.length > MAX_CARACTERES_NOME_TOKEN) return null;
    if (t.imagem !== null && (typeof t.imagem !== "string" || !imagemValida(t.imagem))) return null;
    if (typeof t.guardado !== "boolean") return null;
    if (!Array.isArray(t.condicoes) || t.condicoes.some((c) => typeof c !== "string" || !buscarCondicao(c))) return null;
    const token: Token = {
        id: t.id,
        nome: t.nome,
        imagem: t.imagem,
        col: t.col,
        row: t.row,
        cor: t.cor,
        corBorda: t.corBorda,
        size: t.size as TamanhoToken,
        condicoes: [...new Set(t.condicoes as string[])], // sem repetir, na ordem
        guardado: t.guardado,
        favorito: t.favorito === true, // (arquivos ANTIGOS não têm estes dois campos: valem "não favorito" e "sem grupos")
        grupos: gruposDoArquivo(t.grupos),
    };
    if (!token.guardado && !posicaoValida(token, token.col, token.row)) token.guardado = true;
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
    favorito?: boolean;
    grupos?: number[]; // a lista INTEIRA de grupos do token (ids que não existem são descartados)
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
    if (mudancas.nome !== undefined) token.nome = limparNomeToken(mudancas.nome) || `Token ${token.id}`;
    if (mudancas.cor !== undefined) token.cor = limitar(Math.round(mudancas.cor), 0, 0xffffff);
    if (mudancas.corBorda !== undefined) token.corBorda = limitar(Math.round(mudancas.corBorda), 0, 0xffffff);
    if (mudancas.imagem !== undefined && (mudancas.imagem === null || imagemValida(mudancas.imagem))) token.imagem = mudancas.imagem;
    if (mudancas.favorito !== undefined) token.favorito = mudancas.favorito === true;
    if (mudancas.grupos !== undefined) token.grupos = limparGrupos(mudancas.grupos);
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
