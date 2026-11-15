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
    MAX_PECAS,
    MAX_TOKENS,
    MIN_CASAS,
    TAMANHO_MAX_TOKEN,
    TAMANHO_MIN_TOKEN,
} from "./config.ts";
import { COR_STATUS_HP, DADOS_DISPONIVEIS, MAX_ACOES_MESA, MAX_CARACTERES_NOME_ACAO, MAX_QUANTIA_ACAO, MAX_CARACTERES_NOME_STATUS, MAX_CARACTERES_NOME_VARIAVEL, MAX_MODIFICADOR_DADOS, MAX_QUANTIDADE_DADOS, MAX_STATUS_TOKEN, MAX_VALOR_VARIAVEL_QUE_MUDA, STATUS_PADRAO_NOME, STATUS_PADRAO_VARIAVEL } from "./config.ts";
import { buscarCondicao } from "./condicoes.ts";
import { limitar } from "./coordenadas.ts";
import { formulaDosDados, rolarDados, type Rolagem } from "./dados.ts";
import { analisarAbas, type RolagemDeFicha } from "./formulas.ts";

/** Quantas casas (por lado) um token ocupa: 1 = 1x1, 2 = 2x2, 3 = 3x3, 4 = 4x4. */
export type TamanhoToken = 1 | 2 | 3 | 4;

/**
 * Um STATUS de um token (ex.: a barra de vida "HP"): o nome que aparece, a VARIÁVEL da ficha atribuída de onde vem o valor (ex.: "PV", da linha
 * `PV:: 20`) e a cor da barra. É a DEFINIÇÃO (fica no token); o valor atual existe só enquanto o token está no tabuleiro (`Token.valores`).
 */
export interface StatusDoToken {
    id: number; // identifica o status dentro do token (não muda ao renomear: os valores dependem dele)
    nome: string;
    variavel: string; // nome da variável da ficha (sem os "::"); vazio = sem ligação (não vira barra)
    cor: number;
    mostrar: boolean; // "Exibir status": a barra aparece no tabuleiro (desligado: o valor continua existindo, só não se vê)
    numeros: boolean; // "Exibir números": o "atual/máx" aparece DENTRO da barra
    /** Em quais GRUPOS de tokens este status vale: `null` = TODOS os tokens (inclusive os sem grupo); uma lista = só os tokens que pertencem a ALGUM desses grupos; lista VAZIA (nada marcado) = NENHUM token (pedido do dono). */
    grupos: number[] | null;
    /** Só vale quando `grupos` é uma LISTA: o status vale também para os tokens que NÃO têm grupo nenhum ("Tokens sem grupo", pedido do dono). Com `grupos: null` (todos) não importa. Sem o campo (arquivos antigos): desligado. */
    semGrupo: boolean;
}

/** O que o cliente manda ao criar/editar status: o `id` só vem nos que já existiam (os novos ganham um id). */
export interface StatusNovo {
    id?: number;
    nome: string;
    variavel: string;
    cor: number;
    mostrar?: boolean; // sem o campo vale ligado
    numeros?: boolean;
    grupos?: number[] | null; // sem o campo (ou null) vale para TODOS os tokens
    semGrupo?: boolean; // também vale para os tokens sem grupo (só conta com uma lista de grupos); sem o campo vale desligado
}

/**
 * Uma AÇÃO da mesa (a lista que aparece no menu do token ao clicar nele com o botão direito): muda o valor de UM status da peça. "Dano" tira do HP; "Cura" soma ao HP; o dono
 * pode criar outras (ex.: "Veneno", que tira de PV; "Gastar mana", que tira de MANA). É UMA regra para a mesa inteira, como os status.
 */
export interface AcaoDaMesa {
    id: number; // identifica a ação (nunca reaproveitado)
    nome: string;
    status: number; // o `id` do status que a ação muda
    efeito: "reduzir" | "aumentar";
}

/** O que o cliente manda ao criar/editar ações: o `id` só vem nas que já existiam. */
export interface AcaoNova {
    id?: number;
    nome: string;
    status: number;
    efeito: "reduzir" | "aumentar";
}

/** O valor TEMPORÁRIO de um status enquanto o token está no tabuleiro: perde-se quando ele volta para a bolsa. */
export interface ValorDeStatus {
    id: number; // o id do status
    atual: number;
    max: number;
}

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
    ficha: number | null; // id da FICHA atribuída a este token (uma ficha pode ter VÁRIOS tokens; um token tem no máximo UMA); null = sem ficha
    status: StatusDoToken[]; // as barras (HP etc.) que o token mostra embaixo dele no tabuleiro; todo token novo tem o HP (variável PV da ficha)
    valores: ValorDeStatus[]; // os valores TEMPORÁRIOS (atual/máximo), só enquanto o token está no tabuleiro e tem ficha; [] na bolsa
    /**
     * null = um token da BOLSA (o "modelo": fica na bolsa para sempre, nunca vai para o tabuleiro). Um número = uma PEÇA: a cópia TEMPORÁRIA que nasce no
     * tabuleiro quando se arrasta o modelo (o id dele); copia o visual, a ficha e os status do modelo, mas tem as CONDIÇÕES e os VALORES (PV...) só dela.
     * Várias peças do mesmo modelo compartilham a mesma ficha e guardam status diferentes. Remover a peça do tabuleiro a APAGA.
     */
    copiaDe: number | null;
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
    /** Os STATUS (barras: HP etc.): UMA regra para a MESA INTEIRA. Todo token e toda peça copiam esta lista (o servidor a guarda em `dados/mesa.json`); só os VALORES (PV atual) são de cada peça. */
    statusDaMesa: [{ id: 1, nome: STATUS_PADRAO_NOME, variavel: STATUS_PADRAO_VARIAVEL, cor: COR_STATUS_HP, mostrar: true, numeros: true, grupos: null, semGrupo: false }] as StatusDoToken[],
    /** As AÇÕES da mesa (Dano, Cura...): também UMA regra para todos (o servidor a guarda em `dados/mesa.json`). De fábrica: Dano e Cura, que mexem no status 1 (o HP). */
    acoesDaMesa: acoesPadrao(), // (Dano e Cura; a função é declarada mais abaixo, e as declarações de função já existem quando este objeto é criado)
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
    token?: number; // o id do TOKEN pelo qual a ficha foi aberta ao rolar (o chat mostra o ícone dele); só o id: se o token sumir, volta o ícone padrão
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
export function adicionarRolagemDeFicha(autor: string, rolagemFicha: RolagemDeFicha, token?: number): Mensagem {
    const texto = `${rolagemFicha.nome}: ${rolagemFicha.formula} = ${rolagemFicha.total}`;
    return guardarMensagem({ id: proximoIdMensagem++, autor, texto, rolagemFicha, hora: Date.now(), ...(token !== undefined && { token }) });
}

/**
 * O token que pode aparecer como "quem rolou" numa rolagem da ficha `idDaFicha`: só vale se ele existe E tem ESSA ficha atribuída (senão alguém
 * poderia assinar uma rolagem com o ícone de qualquer token). Devolve o id, ou undefined (o chat então usa o ícone padrão).
 */
export function tokenDaRolagem(idDaFicha: number, idDoToken: number | null | undefined): number | undefined {
    if (idDoToken === null || idDoToken === undefined) return undefined;
    return estado.tokens.find((t) => t.id === idDoToken)?.ficha === idDaFicha ? idDoToken : undefined;
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
// VALORES ATUAIS das variáveis que MUDAM durante o jogo ("OURO::0:150:999999999"): ficha -> NOME em MAIÚSCULAS -> valor. O texto da ficha só diz o mínimo, o inicial e o
// máximo; o valor de AGORA vive aqui, à parte (mudá-lo não é editar a ficha: não sobe a versão e nunca causa conflito). Quem não tem valor aqui vale o inicial, e o
// motor (`formulas.ts`) sempre mantém o valor dentro de mínimo e máximo. Por enquanto só na memória (modo local); o servidor vai guardar em arquivo.
const valoresAtuaisDasFichas = new Map<number, Map<string, number>>();

/** Os valores atuais das variáveis que mudam de uma ficha (nome em MAIÚSCULAS -> valor), ou undefined se nenhuma mudou ainda. */
export function valoresAtuaisDaFicha(id: number): ReadonlyMap<string, number> | undefined {
    return valoresAtuaisDasFichas.get(id);
}

/** Grava o valor atual de uma variável que muda. Só inteiros seguros; quem chama já deve ter limitado ao intervalo (a leitura limita de novo). */
export function definirValorAtualDaFicha(id: number, nome: string, valor: number): void {
    if (!Number.isSafeInteger(valor)) return;
    let valores = valoresAtuaisDasFichas.get(id);
    if (!valores) valoresAtuaisDasFichas.set(id, (valores = new Map()));
    valores.set(nome.toUpperCase(), valor);
}

/** Os valores atuais de UMA ficha como objeto simples (para a rede e o arquivo): NOME em MAIÚSCULAS -> valor. (`Object.fromEntries`: um nome como "__proto__" vira só uma chave.) */
export function valoresDaFichaComoObjeto(id: number): Record<string, number> {
    return Object.fromEntries(valoresAtuaisDasFichas.get(id) ?? []);
}

/** Os valores atuais de TODAS as fichas (para gravar em `dados/mesa.json` e mandar no `estado_inicial`): id da ficha -> NOME -> valor. Só entram fichas que têm algum valor. */
export function todosOsValoresDasFichas(): Record<string, Record<string, number>> {
    return Object.fromEntries([...valoresAtuaisDasFichas].filter(([, v]) => v.size > 0).map(([id, v]) => [String(id), Object.fromEntries(v)]));
}

/** Troca os valores atuais de UMA ficha pelos que vieram de FORA (arquivo ou rede). Confere tudo: nome de variável válido (em MAIÚSCULAS) e valor inteiro dentro do limite; o resto é ignorado. */
export function definirValoresDaFicha(id: number, bruto: unknown): void {
    const valores = new Map<string, number>();
    if (typeof bruto === "object" && bruto !== null && !Array.isArray(bruto)) {
        for (const [nome, valor] of Object.entries(bruto)) {
            if (nome.length > MAX_CARACTERES_NOME_VARIAVEL || !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(nome)) continue;
            if (typeof valor !== "number" || !Number.isSafeInteger(valor) || Math.abs(valor) > MAX_VALOR_VARIAVEL_QUE_MUDA) continue;
            valores.set(nome.toUpperCase(), valor);
        }
    }
    if (valores.size > 0) valoresAtuaisDasFichas.set(id, valores);
    else valoresAtuaisDasFichas.delete(id);
}

/** Troca os valores de TODAS as fichas de uma vez (ao ligar o servidor ou receber o `estado_inicial`). Só vale para fichas que existem. */
export function definirTodosOsValoresDasFichas(bruto: unknown): void {
    valoresAtuaisDasFichas.clear();
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return;
    for (const [chave, valores] of Object.entries(bruto)) {
        const id = Number(chave);
        if (Number.isSafeInteger(id) && estado.fichas.some((f) => f.id === id)) definirValoresDaFicha(id, valores);
    }
}

export type ResultadoDoValor = { ok: true; nome: string; antes: number; depois: number } | { ok: false; erro: string };

/**
 * MUDA o valor atual de uma variável que muda, SOMANDO `delta` (positivo ou negativo): o servidor aplica as mudanças como somas, não como "valor novo", para duas
 * pessoas mexendo ao mesmo tempo não se atropelarem. O resultado é sempre limitado ao mínimo e ao máximo escritos no texto da ficha. A variável precisa existir
 * na ficha, ser do tipo "NOME::mín:inicial:máx" e estar sem erro.
 */
export function ajustarValorDaFicha(idFicha: number, nome: string, delta: number): ResultadoDoValor {
    const ficha = estado.fichas.find((f) => f.id === idFicha);
    if (!ficha) return { ok: false, erro: "Essa ficha não existe." };
    if (!Number.isSafeInteger(delta) || Math.abs(delta) > 2 * MAX_VALOR_VARIAVEL_QUE_MUDA) return { ok: false, erro: "Mudança de valor inválida." };
    const variavel = analisarAbas(ficha.abas.map((a) => a.texto), valoresAtuaisDaFicha(idFicha))[0].variaveis.find(
        (v) => v.erro === null && v.muda !== null && v.valor !== null && v.nome.toUpperCase() === nome.toUpperCase(),
    );
    if (!variavel || !variavel.muda || variavel.valor === null) return { ok: false, erro: "Esse recurso não existe nesta ficha." };
    const depois = limitar(variavel.valor + delta, variavel.muda.min, variavel.muda.max);
    definirValorAtualDaFicha(idFicha, variavel.nome, depois);
    return { ok: true, nome: variavel.nome, antes: variavel.valor, depois };
}

/** A ficha tem alguma variável que MUDA? Então é uma ficha de JOGADOR (uma ficha, um token por tela); as fichas básicas (monstros) não têm. */
export function fichaDeJogador(idFicha: number | null): boolean {
    const ficha = idFicha === null ? undefined : estado.fichas.find((f) => f.id === idFicha);
    if (!ficha || ficha.abas.length === 0) return false;
    return analisarAbas(ficha.abas.map((a) => a.texto))[0].variaveis.some((v) => v.muda !== null);
}

/**
 * REGRA DAS FICHAS DE JOGADOR: uma ficha com variáveis que mudam só pode ter UM token por TELA (todos os tokens dela, em telas diferentes, compartilham o mesmo
 * status: o da ficha). Hoje só existe uma tela: então uma ficha de jogador só pode ter uma peça no tabuleiro. Devolve o MOTIVO de não poder colocar mais um token
 * deste modelo no tabuleiro, ou null se pode. (As fichas básicas, de monstro, não têm limite: cada peça tem os seus valores.)
 */
export function motivoParaNaoColocar(modelo: Token): string | null {
    if (modelo.ficha === null || !fichaDeJogador(modelo.ficha)) return null;
    if (!estado.tokens.some((t) => !t.guardado && t.ficha === modelo.ficha)) return null;
    const ficha = estado.fichas.find((f) => f.id === modelo.ficha);
    return `"${ficha?.nome ?? "Esta ficha"}" é uma Ficha Token Único (tem recursos): só pode ter um token por tela, e ele já está no tabuleiro.`;
}

/**
 * Refaz os valores das barras dos tokens que estão no tabuleiro com esta ficha: as barras ligadas a uma variável que muda são um ESPELHO do valor da ficha (ao vivo), e as
 * outras mantêm o valor atual que já tinham (limitado ao novo máximo). Chamar depois de mudar um valor atual ou o texto da ficha. Devolve os tokens refeitos (para redesenhar).
 */
export function sincronizarValoresDaFicha(idFicha: number): Token[] {
    const afetados = estado.tokens.filter((t) => t.ficha === idFicha && !t.guardado);
    for (const token of afetados) token.valores = valoresIniciais(token, token.valores);
    return afetados;
}

export function excluirFicha(id: number): boolean {
    const posicao = estado.fichas.findIndex((f) => f.id === id);
    if (posicao < 0) return false;
    estado.fichas.splice(posicao, 1);
    valoresAtuaisDasFichas.delete(id);
    for (const token of estado.tokens) if (token.ficha === id) token.ficha = null; // os tokens dela ficam SEM ficha (continuam existindo)
    return true;
}

/** A ficha existe? (para o token só poder apontar para uma ficha de verdade) */
export function fichaExiste(id: unknown): id is number {
    return typeof id === "number" && estado.fichas.some((f) => f.id === id);
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
export function excluirGrupo(id: number): { tokens: number[]; fichas: number[]; status: boolean } | null {
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
    // O grupo também sai dos STATUS da mesa que o citavam (ficam só com os outros grupos; lista vazia = nenhum token). Se algum mudou, os tokens recebem a lista nova e as peças refazem os valores.
    let status = false;
    for (const st of estado.statusDaMesa) {
        if (Array.isArray(st.grupos) && st.grupos.includes(id)) {
            st.grupos = st.grupos.filter((g) => g !== id); // (se era o último grupo, a lista fica vazia: o status não vale para nenhum token, como "nada marcado")
            status = true;
        }
    }
    if (status) {
        aplicarStatusDaMesaAosTokens();
        for (const peca of estado.tokens) if (peca.copiaDe !== null) peca.valores = valoresIniciais(peca, peca.valores);
    }
    return { tokens, fichas, status };
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
    if (!token) return;
    token.guardado = true;
    token.valores = []; // os status TEMPORÁRIOS se perdem ao voltar para a bolsa (um token novo no tabuleiro começa de novo, a partir da ficha)
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
    ficha: number | null = null,
): Token | null {
    if (quantosModelos() >= MAX_TOKENS) return null;
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
        ficha: fichaExiste(ficha) ? ficha : null, // (uma ficha que não existe é ignorada)
        status: statusDaMesaCopiada(), // (os status são da MESA: o token nasce com a lista dela)
        valores: [],
        copiaDe: null,
    };
}

/**
 * Completa os campos que um token pode NÃO trazer quando vem de um servidor mais ANTIGO (ou do `semear` dos testes): sem `copiaDe` é um token da bolsa, sem
 * `status` tem o HP de fábrica, sem `valores`, `ficha`, `favorito`, `grupos` ou `condicoes` valem "nada". Assim o navegador nunca quebra por um campo que falta.
 */
function completarToken(token: Token): void {
    const t = token as Partial<Token> & Token;
    if (t.copiaDe === undefined) t.copiaDe = null;
    if (t.ficha === undefined) t.ficha = null;
    if (!Array.isArray(t.status)) t.status = statusDaMesaCopiada();
    for (const s of t.status) {
        if (s.mostrar === undefined) s.mostrar = true; // (servidor mais antigo: sem os dois campos de exibição)
        if (s.numeros === undefined) s.numeros = true;
        if (s.grupos === undefined) s.grupos = null; // (servidor mais antigo: o status valia para todos)
        if (s.semGrupo === undefined) s.semGrupo = false;
    }
    if (!Array.isArray(t.valores)) t.valores = [];
    if (!Array.isArray(t.grupos)) t.grupos = [];
    if (!Array.isArray(t.condicoes)) t.condicoes = [];
    if (t.favorito === undefined) t.favorito = false;
}

/** Quantos tokens da BOLSA (modelos, sem contar as peças do tabuleiro) a mesa tem. */
export function quantosModelos(): number {
    return estado.tokens.filter((t) => t.copiaDe === null).length;
}

/** As PEÇAS (cópias no tabuleiro) de um modelo. */
export function pecasDoModelo(idDoModelo: number): Token[] {
    return estado.tokens.filter((t) => t.copiaDe === idDoModelo);
}

/**
 * Monta uma PEÇA nova: a cópia temporária de um modelo (token da bolsa), já no tabuleiro em (col, row), SEM guardá-la na lista. Copia o visual, a ficha e os
 * status do modelo; as condições começam vazias e os VALORES dos status nascem agora, lendo a ficha (ver `valoresIniciais`). Devolve null se o modelo não
 * existe (ou ele mesmo é uma peça), se a posição não vale ou se a mesa já tem MAX_PECAS.
 */
export function montarPeca(idDoModelo: number, col: number, row: number): Token | null {
    const modelo = buscarToken(idDoModelo);
    if (!modelo || modelo.copiaDe !== null) return null;
    if (estado.tokens.length - quantosModelos() >= MAX_PECAS) return null;
    if (!posicaoValida(modelo, col, row)) return null;
    if (motivoParaNaoColocar(modelo) !== null) return null; // ficha de jogador: só um token por tela (quem chama mostra o motivo)
    const peca: Token = {
        id: proximoIdToken++,
        nome: modelo.nome,
        imagem: modelo.imagem,
        col,
        row,
        cor: modelo.cor,
        corBorda: modelo.corBorda,
        size: modelo.size,
        condicoes: [],
        guardado: false,
        favorito: false,
        grupos: [],
        ficha: modelo.ficha,
        status: modelo.status.map((s) => ({ ...s })),
        valores: [],
        copiaDe: modelo.id,
    };
    peca.valores = valoresIniciais(peca);
    return peca;
}

/** Modo local: monta a peça e já a guarda na lista. */
export function criarPeca(idDoModelo: number, col: number, row: number): Token | null {
    const peca = montarPeca(idDoModelo, col, row);
    return peca ? receberToken(peca) : null;
}

/**
 * Põe numa peça o estado que ela tinha (o "Desfazer" de uma remoção): o valor ATUAL de cada status (limitado ao máximo que a ficha dá agora) e as condições
 * (só as que existem). Dados que não fazem sentido são ignorados.
 */
export function restaurarEstadoDaPeca(peca: Token, valores: readonly { id: number; atual: number }[] = [], condicoes: readonly string[] = []): void {
    for (const v of valores) {
        const alvo = peca.valores.find((x) => x.id === v.id);
        const status = peca.status.find((s) => s.id === v.id);
        if (status && ligacaoComVariavelQueMuda(peca, status.variavel)) continue; // ligada a uma variável que muda (ficha de jogador): o valor da FICHA é o que vale
        if (alvo && Number.isSafeInteger(v.atual)) alvo.atual = limitar(v.atual, 0, alvo.max);
    }
    peca.condicoes = [...new Set(condicoes.filter((c) => typeof c === "string" && buscarCondicao(c)))];
}

/** Tira o token da lista e, se ele é um MODELO, também as peças dele. Devolve os ids removidos (vazio se o token não existe). */
export function excluirTokenComPecas(id: number): number[] {
    const token = buscarToken(id);
    if (!token) return [];
    const ids = token.copiaDe === null ? [id, ...pecasDoModelo(id).map((p) => p.id)] : [id];
    estado.tokens = estado.tokens.filter((t) => !ids.includes(t.id));
    return ids;
}

/** Depois de editar um MODELO: as peças dele copiam o visual, a ficha e a definição dos status (nome, cores, imagem, tamanho...). `refazerValores`: a ficha ou os status mudaram (os valores são refeitos; trocar de ficha recomeça). */
function sincronizarPecas(modelo: Token, refazerValores: boolean): void {
    for (const peca of pecasDoModelo(modelo.id)) {
        const fichaMudou = peca.ficha !== modelo.ficha;
        peca.nome = modelo.nome;
        peca.imagem = modelo.imagem;
        peca.cor = modelo.cor;
        peca.corBorda = modelo.corBorda;
        peca.size = modelo.size;
        peca.ficha = modelo.ficha;
        peca.status = modelo.status.map((s) => ({ ...s }));
        peca.col = limitar(peca.col, 0, estado.colunas - peca.size);
        peca.row = limitar(peca.row, 0, estado.linhas - peca.size);
        if (refazerValores || fichaMudou) peca.valores = valoresIniciais(peca, fichaMudou ? [] : peca.valores);
    }
}

/**
 * Guarda na lista um token que já está pronto (o que o servidor mandou, ou o que acabou de ser montado). Se o id já existe,
 * ATUALIZA o objeto que está lá (campo a campo): o desenho e os menus guardam referências a ele. Devolve o token que ficou na lista.
 */
export function receberToken(token: Token): Token {
    completarToken(token);
    proximoIdToken = Math.max(proximoIdToken, token.id + 1);
    const existente = buscarToken(token.id);
    if (!existente) {
        estado.tokens.push(token);
        return token;
    }
    Object.assign(existente, token, { condicoes: [...token.condicoes], grupos: [...token.grupos], status: token.status.map((s) => ({ ...s })), valores: token.valores.map((v) => ({ ...v })) });
    return existente;
}

/** Troca todos os tokens pela lista que o servidor mandou ao entrar na mesa (ou pela que foi lida dos arquivos ao ligar o servidor). */
export function definirTokens(lista: Token[], proximoIdMinimo = 1): void {
    lista.forEach(completarToken);
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
    ficha: number | null = null,
): Token | null {
    const token = montarToken(cor, size, nome, imagem, corBorda, ficha);
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
        ficha: inteiro(t.ficha) && t.ficha >= 1 ? t.ficha : null, // (arquivos ANTIGOS não têm o campo: valem "sem ficha"; se a ficha já não existe, o servidor solta ao ligar)
        status: limparStatus(t.status) ?? statusPadrao(), // (arquivos antigos, sem a lista: o HP de fábrica)
        valores: [],
        copiaDe: inteiro(t.copiaDe) && t.copiaDe >= 1 ? t.copiaDe : null, // (arquivos ANTIGOS não têm o campo: são tokens da bolsa)
    };
    if (token.copiaDe !== null) {
        // Uma PEÇA vive no tabuleiro: com posição que não vale, é um arquivo estragado (e é ignorada).
        token.guardado = false;
        if (!posicaoValida(token, token.col, token.row)) return null;
    }
    if (!token.guardado && Array.isArray(t.valores)) {
        // Os valores temporários de um token que estava no tabuleiro quando o servidor parou: só os de status que existem, com números sãos.
        for (const v of t.valores as unknown[]) {
            const x = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
            if (inteiro(x.id) && inteiro(x.atual) && inteiro(x.max) && x.max >= 1 && x.atual >= 0 && x.atual <= x.max && token.status.some((s) => s.id === x.id) && !token.valores.some((o) => o.id === x.id)) {
                token.valores.push({ id: x.id, atual: x.atual, max: x.max });
            }
        }
    }
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

/** Uma CÓPIA da lista de status da mesa (cada token e cada peça guarda a sua cópia). */
export function statusDaMesaCopiada(): StatusDoToken[] {
    return estado.statusDaMesa.map((s) => ({ ...s }));
}

/**
 * Muda os STATUS da MESA INTEIRA (a regra vale para TODOS os tokens e peças, sem escolher nenhum): limpa a lista (`limparStatus`), guarda em `estado.statusDaMesa` e copia para
 * todos os tokens. Os VALORES das peças só são refeitos (relendo a ficha, mantendo o PV atual dos que continuam) quando a ESTRUTURA muda (status criado, excluído, reordenado ou
 * ligado a outra variável); mudar só o visual (nome, cor, "Exibir status", "Exibir números") não mexe nos valores. Devolve todos os tokens (todos mudaram de visual).
 */
export function definirStatusDaMesa(bruto: unknown): Token[] {
    const maiorIdDaMesa = estado.statusDaMesa.reduce((m, s) => Math.max(m, s.id), 0);
    const lista = limparStatus(bruto, maiorIdDaMesa);
    if (!lista) return [];
    const antes = estado.statusDaMesa;
    const estruturaMudou = lista.length !== antes.length || lista.some((s, i) => s.id !== antes[i].id || s.variavel !== antes[i].variavel || JSON.stringify(s.grupos) !== JSON.stringify(antes[i].grupos) || s.semGrupo !== antes[i].semGrupo); // (trocar os GRUPOS, ou ligar "Tokens sem grupo", muda em quem o status vale)
    estado.statusDaMesa = lista;
    for (const token of estado.tokens) {
        token.status = statusDaMesaCopiada();
        if (estruturaMudou && (token.copiaDe !== null || !token.guardado)) token.valores = valoresIniciais(token, token.valores);
    }
    return estado.tokens;
}

/** Os grupos de um token: o dele, ou, numa PEÇA, os do token da bolsa de onde ela veio (a peça não tem grupos próprios). */
export function gruposDoToken(token: Token): number[] {
    return token.copiaDe === null ? token.grupos : (buscarToken(token.copiaDe)?.grupos ?? []);
}

/** Os status que VALEM para este token: os da mesa cujos grupos incluem algum grupo do token (`grupos: null` = todos os tokens, com ou sem grupo; lista vazia = nenhum). */
export function statusAplicaveis(token: Token): StatusDoToken[] {
    const meus = gruposDoToken(token);
    return token.status.filter((s) => !Array.isArray(s.grupos) || s.grupos.some((g) => meus.includes(g)) || (s.semGrupo && meus.length === 0)); // ("Tokens sem grupo": vale para quem não está em nenhum grupo)
}

/** Ao LIGAR o servidor: guarda a lista lida de `dados/mesa.json` (depois de os grupos serem lidos: os ids de grupos que não existem são descartados), sem mexer nos tokens. */
export function carregarStatusDaMesa(bruto: unknown): void {
    const lista = limparStatus(bruto);
    if (lista) estado.statusDaMesa = lista;
}

/** As ações de fábrica: Dano (tira do HP) e Cura (soma ao HP). */
export function acoesPadrao(): AcaoDaMesa[] {
    return [
        { id: 1, nome: "Dano", status: 1, efeito: "reduzir" },
        { id: 2, nome: "Cura", status: 1, efeito: "aumentar" },
    ];
}

/** Confere e limpa uma lista de ações que veio de FORA (janela, arquivo ou rede): até MAX_ACOES_MESA, nome limpo (vazio vira "Ação"), efeito válido, ids sem repetir (os novos ganham um). null se não é uma lista. */
export function limparAcoes(bruto: unknown, idJaUsado = 0): AcaoDaMesa[] | null {
    if (!Array.isArray(bruto)) return null;
    const itens = bruto.slice(0, MAX_ACOES_MESA).map((a): Record<string, unknown> => (typeof a === "object" && a !== null ? (a as Record<string, unknown>) : {}));
    let maiorId = itens.reduce((m, a) => (typeof a.id === "number" && Number.isSafeInteger(a.id) && a.id > m ? a.id : m), idJaUsado);
    const usados = new Set<number>();
    return itens.map((a) => {
        const id = typeof a.id === "number" && Number.isSafeInteger(a.id) && a.id >= 1 && !usados.has(a.id) ? a.id : ++maiorId;
        usados.add(id);
        const nome = (typeof a.nome === "string" ? a.nome : "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CARACTERES_NOME_ACAO).trim();
        const status = typeof a.status === "number" && Number.isSafeInteger(a.status) ? a.status : 0;
        return { id, nome: nome || "Ação", status, efeito: a.efeito === "aumentar" ? "aumentar" : "reduzir" };
    });
}

/** Muda as AÇÕES da mesa inteira. Devolve a lista nova (ou null se a lista não presta). */
export function definirAcoesDaMesa(bruto: unknown): AcaoDaMesa[] | null {
    const maiorIdDaMesa = estado.acoesDaMesa.reduce((m, a) => Math.max(m, a.id), 0);
    const lista = limparAcoes(bruto, maiorIdDaMesa);
    if (lista) estado.acoesDaMesa = lista;
    return lista;
}

/** Ao ligar o servidor (ou ao entrar na mesa): guarda a lista de ações lida de `dados/mesa.json`. */
export function carregarAcoesDaMesa(bruto: unknown): void {
    const lista = limparAcoes(bruto);
    if (lista) estado.acoesDaMesa = lista;
}

/** O que uma pessoa escreveu como valor de uma ação: um número ("7") ou dados ("2d6+3", "d8"). null se não é nenhum dos dois. */
export type Quantia = { tipo: "numero"; valor: number } | { tipo: "dados"; lados: number; quantidade: number; modificador: number };
export function lerQuantia(texto: string): Quantia | null {
    const t = texto.trim().toLowerCase().replace(/\s+/g, "");
    if (/^\d{1,7}$/.test(t)) return { tipo: "numero", valor: Math.min(Number(t), MAX_QUANTIA_ACAO) };
    const m = /^(\d{1,2})?d(\d{1,4})([+-]\d{1,6})?$/.exec(t);
    if (!m) return null;
    const quantidade = m[1] === undefined ? 1 : Number(m[1]);
    const lados = Number(m[2]);
    const modificador = m[3] === undefined ? 0 : Number(m[3]);
    return rolagemValida(lados, quantidade, modificador) ? { tipo: "dados", lados, quantidade, modificador } : null;
}

export type ResultadoDeAcao =
    | { ok: true; nomeStatus: string; antes: number; depois: number; max: number; quantia: number; detalhe: string; fichaAlterada?: number } // `fichaAlterada`: o valor mudou NA FICHA (variável que muda): quem chama avisa todos e grava
    | { ok: false; erro: string };

/**
 * Aplica uma AÇÃO ao valor de um status de um token: soma ou tira a quantia (um número, ou dados que são rolados AGORA com `sortear`) e deixa o valor entre 0 e o máximo.
 * Muda `token.valores`. O servidor usa esta função (com o sorteio dele) e o modo local também. Sem o status, ou sem valor (token sem ficha ou sem a variável): erro.
 */
export function aplicarAcao(token: Token, acaoId: number, texto: string, sortear: () => number): ResultadoDeAcao {
    const acao = estado.acoesDaMesa.find((a) => a.id === acaoId);
    if (!acao) return { ok: false, erro: "Essa ação não existe." };
    const status = statusAplicaveis(token).find((s) => s.id === acao.status);
    if (!status) return { ok: false, erro: `Este token não usa o status desta ação.` };
    const valor = token.valores.find((v) => v.id === status.id);
    // Ficha de JOGADOR: se o status lê uma variável que MUDA, a ação muda o valor DA FICHA (e a barra, que a espelha, acompanha), limitado ao mínimo e ao máximo dela.
    const ligacao = ligacaoComVariavelQueMuda(token, status.variavel);
    if (!valor && !ligacao) return { ok: false, erro: `"${status.nome}" não tem valor neste token: ele precisa de uma ficha com a variável ${status.variavel || "do status"}.` };
    const quantia = lerQuantia(texto);
    if (!quantia) return { ok: false, erro: "Escreva um número (ex.: 7) ou dados (ex.: 2d6+3)." };
    let total: number;
    let detalhe: string;
    if (quantia.tipo === "numero") {
        total = quantia.valor;
        detalhe = String(quantia.valor);
    } else {
        const r = rolarDados(quantia.lados, quantia.quantidade, quantia.modificador, sortear); // (o sorteio é injetado: no servidor, o dele)
        total = Math.min(Math.max(0, r.total), MAX_QUANTIA_ACAO); // (uma conta que dá negativo não "cura ao contrário": vale 0)
        detalhe = `${formulaDosDados(quantia.quantidade, quantia.lados, quantia.modificador)} [${r.resultados.join(", ")}]`;
    }
    if (ligacao) {
        const depois = limitar(acao.efeito === "reduzir" ? ligacao.atual - total : ligacao.atual + total, ligacao.min, ligacao.max);
        definirValorAtualDaFicha(ligacao.ficha, ligacao.nome, depois);
        sincronizarValoresDaFicha(ligacao.ficha); // (a barra deste token, e a de qualquer outro dela, passa a mostrar o valor novo)
        return { ok: true, nomeStatus: status.nome, antes: ligacao.atual, depois, max: ligacao.max, quantia: total, detalhe, fichaAlterada: ligacao.ficha };
    }
    if (!valor) return { ok: false, erro: "Valor do status indisponível." }; // (não acontece: conferido acima)
    const antes = valor.atual;
    const depois = limitar(acao.efeito === "reduzir" ? antes - total : antes + total, 0, valor.max);
    valor.atual = depois;
    return { ok: true, nomeStatus: status.nome, antes, depois, max: valor.max, quantia: total, detalhe };
}

/** Se o status (a variável que ele lê) está ligado a uma variável que MUDA da ficha do token, devolve os dados dela (ficha, nome, intervalo e valor atual); senão, null. */
function ligacaoComVariavelQueMuda(token: Token, variavel: string): { ficha: number; nome: string; min: number; max: number; atual: number } | null {
    const ficha = token.ficha === null || variavel === "" ? undefined : estado.fichas.find((f) => f.id === token.ficha);
    if (!ficha || ficha.abas.length === 0) return null;
    const v = analisarAbas(ficha.abas.map((a) => a.texto), valoresAtuaisDaFicha(ficha.id))[0].variaveis.find(
        (x) => x.erro === null && x.valor !== null && x.nome.toUpperCase() === variavel.toUpperCase(),
    );
    if (!v || !v.muda || v.valor === null) return null;
    return { ficha: ficha.id, nome: v.nome, min: v.muda.min, max: v.muda.max, atual: v.valor };
}

/** A frase curta que vai para o chat depois de uma ação (cabe nos 72 caracteres de uma mensagem). */
export function frasePraChatDaAcao(token: Token, acaoId: number, r: Extract<ResultadoDeAcao, { ok: true }>): string {
    const acao = estado.acoesDaMesa.find((a) => a.id === acaoId);
    return `${token.nome}: ${acao?.nome ?? "Ação"} ${r.quantia} (${r.nomeStatus} ${r.antes}→${r.depois})`.slice(0, MAX_CARACTERES_MENSAGEM);
}

/** Copia a lista da mesa para todos os tokens (sem tocar nos valores): usado ao LIGAR o servidor, depois de ler os arquivos (cada arquivo traz uma cópia, que pode estar velha). */
export function aplicarStatusDaMesaAosTokens(): void {
    for (const token of estado.tokens) token.status = statusDaMesaCopiada();
}

/** O status de fábrica: o HP, que lê a variável PV:: da ficha. */
export function statusPadrao(): StatusDoToken[] {
    return [{ id: 1, nome: STATUS_PADRAO_NOME, variavel: STATUS_PADRAO_VARIAVEL, cor: COR_STATUS_HP, mostrar: true, numeros: true, grupos: null, semGrupo: false }];
}

/**
 * Confere e limpa uma lista de status que veio de FORA (a janela de edição, um arquivo, um pedido da rede). Devolve a lista pronta (até MAX_STATUS_TOKEN
 * itens; nome limpo e cortado, vazio vira "Status"; variável só com letras, números e "_" e sem começar por número, senão fica vazia; cor válida; ids sem
 * repetir, e os novos ganham um id) ou null se não é uma lista. Nunca lança erro.
 */
export function limparStatus(bruto: unknown, idJaUsado = 0): StatusDoToken[] | null {
    if (!Array.isArray(bruto)) return null;
    const itens = bruto.slice(0, MAX_STATUS_TOKEN).map((s): Record<string, unknown> => (typeof s === "object" && s !== null ? (s as Record<string, unknown>) : {}));
    let maiorId = itens.reduce((m, s) => (typeof s.id === "number" && Number.isSafeInteger(s.id) && s.id > m ? s.id : m), idJaUsado); // (um status novo nunca reaproveita o id de um que já existiu: os valores das peças dependem dele)
    const usados = new Set<number>();
    return itens.map((s) => {
        let id = typeof s.id === "number" && Number.isSafeInteger(s.id) && s.id >= 1 && !usados.has(s.id) ? s.id : ++maiorId;
        usados.add(id);
        const nome = (typeof s.nome === "string" ? s.nome : "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_CARACTERES_NOME_STATUS).trim();
        let variavel = (typeof s.variavel === "string" ? s.variavel : "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, MAX_CARACTERES_NOME_VARIAVEL);
        if (/^\p{N}/u.test(variavel)) variavel = ""; // (uma variável não pode começar por número)
        const cor = typeof s.cor === "number" && Number.isFinite(s.cor) ? limitar(Math.round(s.cor), 0, 0xffffff) : COR_STATUS_HP;
        const grupos = Array.isArray(s.grupos) ? limparGrupos(s.grupos.filter((g): g is number => typeof g === "number")) : null; // (sem a lista = TODOS os tokens; lista vazia = NENHUM; ids de grupos que não existem são descartados)
        return { id, nome: nome || "Status", variavel, cor, mostrar: s.mostrar !== false, numeros: s.numeros !== false, grupos, semGrupo: grupos !== null && s.semGrupo === true }; // (sem o campo, os dois ficam ligados)
    });
}

/**
 * Os valores dos status de um token, lidos da FICHA atribuída a ele: cada status com uma variável (ex.: PV) que existe na ficha, sem erro e com valor
 * MAIOR QUE ZERO vira { atual, max }. `atual` e `max` começam iguais ao valor da variável, a não ser que `antigos` já tenha o valor atual daquele status
 * (aí ele é mantido, limitado ao novo máximo). Sem ficha, sem variável ou com erro: o status não ganha valor (e portanto não aparece barra).
 */
export function valoresIniciais(token: Token, antigos: readonly ValorDeStatus[] = []): ValorDeStatus[] {
    const ficha = token.ficha === null ? undefined : estado.fichas.find((f) => f.id === token.ficha);
    if (!ficha || ficha.abas.length === 0) return [];
    const variaveis = analisarAbas(ficha.abas.map((a) => a.texto), valoresAtuaisDaFicha(ficha.id))[0].variaveis; // (as variáveis valem para a ficha inteira)
    const valores: ValorDeStatus[] = [];
    for (const s of statusAplicaveis(token)) {
        if (s.variavel === "") continue;
        const v = variaveis.find((x) => x.erro === null && x.valor !== null && x.nome.toUpperCase() === s.variavel.toUpperCase());
        if (!v || v.valor === null) continue;
        if (v.muda) {
            // Ligada a uma variável que MUDA (ficha de jogador): a barra é um ESPELHO do valor atual da ficha, ao vivo, e continua aparecendo mesmo com o valor em 0.
            if (v.muda.max >= 1) valores.push({ id: s.id, atual: v.valor, max: v.muda.max });
            continue;
        }
        if (v.valor < 1) continue;
        const max = v.valor;
        const antigo = antigos.find((a) => a.id === s.id);
        valores.push({ id: s.id, atual: antigo ? limitar(antigo.atual, 0, max) : max, max });
    }
    return valores;
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
    ficha?: number | null; // a ficha atribuída (null = tirar a ficha); um id que não é de uma ficha existente é ignorado
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
    const fichaAntes = token.ficha;
    const gruposAntes = token.grupos.join(",");
    if (mudancas.ficha === null || fichaExiste(mudancas.ficha)) token.ficha = mudancas.ficha ?? null;
    // No tabuleiro, trocar a ficha refaz os valores dos status (recomeça: a ficha é outra).
    if (!token.guardado && token.ficha !== fichaAntes) token.valores = valoresIniciais(token, []);
    if (mudancas.size !== undefined) {
        token.size = limitar(Math.round(mudancas.size), TAMANHO_MIN_TOKEN, TAMANHO_MAX_TOKEN) as TamanhoToken;
        token.col = limitar(token.col, 0, estado.colunas - token.size);
        token.row = limitar(token.row, 0, estado.linhas - token.size);
    }
    if (token.copiaDe === null) sincronizarPecas(token, token.ficha !== fichaAntes || token.grupos.join(",") !== gruposAntes); // (mudar os grupos do token muda quais status valem para as peças dele) // (editar o modelo atualiza todas as peças dele)
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
    const vinhaDaBolsa = token.guardado;
    token.guardado = false;
    token.col = col;
    token.row = row;
    if (vinhaDaBolsa) token.valores = valoresIniciais(token); // saiu da bolsa: os status nascem agora, lendo as variáveis da ficha (mover no tabuleiro NÃO os refaz)
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
