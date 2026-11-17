// =====================================================================
// A INICIATIVA (a ordem de combate): COMPARTILHADO entre o navegador e o servidor (só dados e regras, sem PixiJS nem HTML; imports com `.ts`).
//
// Uma lista de ENTRADAS (cada uma: nome, valor da iniciativa e, se for um token, o id dele; uma "pessoa temporária" não tem token), de quem é a VEZ e a RODADA. Regras decididas pelo dono:
//   - Ordenar por: maior → menor, menor → maior ou LIVRE. Arrastar uma entrada para uma posição que não segue o critério escolhido passa sozinho para "livre".
//   - Empate: as entradas empatadas ficam do jeito que chegaram (ou como a pessoa as arrastou): nenhum desempate automático.
//   - Quem morre NÃO tem a vez pulada: os próprios jogadores passam a vez. Para tirar alguém da fila, "remover".
//   - A caixa tem um MODO DE EDIÇÃO: nele aparecem "+ Criatura" e "Limpar" e o "Próximo turno" some; ele só volta a valer depois de "Confirmar". A caixa COMEÇA em edição, e volta a ficar
//     em edição ao "Limpar" e sempre que alguém é ADICIONADO (de qualquer jeito: "+ Criatura", menu do token ou arrastando o resultado de um dado para a caixa).
// O SERVIDOR é o dono deste estado (o navegador pede uma AÇÃO; o servidor aplica com estas mesmas funções e avisa todos). Nada aqui lança erro: os problemas voltam como mensagens.
// =====================================================================

import { MAX_CARACTERES_NOME_INICIATIVA, MAX_ENTRADAS_INICIATIVA, VALOR_MAX_INICIATIVA } from "./config.ts";

export type OrdenacaoIniciativa = "maior" | "menor" | "livre";

export interface EntradaIniciativa {
    id: number; // identifica a entrada (nunca é reaproveitado)
    nome: string;
    valor: number;
    token: number | null; // o id do token (a peça no tabuleiro); null = pessoa temporária
}

export interface Iniciativa {
    entradas: EntradaIniciativa[]; // na ordem em que aparecem na lista
    vez: number | null; // o id da entrada que está com a vez (null = o combate ainda não começou)
    rodada: number; // 0 = ainda não começou
    ordenacao: OrdenacaoIniciativa;
    editando: boolean; // "em edição": o "Próximo turno" fica desligado até confirmar
    proximoId: number;
}

/** O que a pessoa pode pedir. O servidor confere cada campo (`lerAcaoDaIniciativa`). */
export type AcaoDaIniciativa =
    /** `rolar` (só com `token`): o SERVIDOR (ou o modo local) usa a rolagem "Iniciativa" da ficha do token e ignora o `valor`; sem essa rolagem, o valor é 0. */
    | { acao: "adicionar"; nome: string; valor: number; token: number | null; rolar?: boolean }
    | { acao: "remover"; id: number }
    | { acao: "mover"; id: number; para: number } // `para` = a posição (0 = a primeira) em que a entrada fica
    | { acao: "valor"; id: number; valor: number }
    | { acao: "nome"; id: number; nome: string }
    | { acao: "ordenar"; ordenacao: OrdenacaoIniciativa }
    | { acao: "resetar" }
    | { acao: "proxima" }
    | { acao: "anterior" } // "Retornar": devolve a vez a quem veio antes (do primeiro da rodada 2 em diante, volta ao último da rodada anterior)
    | { acao: "rodada"; rodada: number } // a pessoa digitou o número da rodada (no modo de edição): de 0 a RODADA_MAX
    | { acao: "editar" }
    | { acao: "confirmar" };

export type ResultadoDaIniciativa = { ok: true; id?: number } | { ok: false; erro: string };

export function novaIniciativa(): Iniciativa {
    return { entradas: [], vez: null, rodada: 0, ordenacao: "maior", editando: true, proximoId: 1 };
}

/** O estado da iniciativa da mesa (um objeto só: quem o lê vê sempre o valor atual). */
export const iniciativa: Iniciativa = novaIniciativa();

const RODADA_MAX = 9999;
const limitar = (n: number, minimo: number, maximo: number): number => Math.min(maximo, Math.max(minimo, n));
const eInteiro = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** Nome limpo: sem caracteres de controle, espaços juntados, até o limite; vazio vira "Criatura". */
export function limparNomeIniciativa(bruto: unknown): string {
    const texto = typeof bruto === "string" ? bruto : "";
    const limpo = texto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_NOME_INICIATIVA).trim();
    return limpo || "Criatura";
}

const limparValor = (v: number): number => limitar(Math.round(v), -VALOR_MAX_INICIATIVA, VALOR_MAX_INICIATIVA);

/** A lista está na ordem que `ordenacao` diz? ("livre" sempre está.) */
export function estaOrdenada(entradas: readonly EntradaIniciativa[], ordenacao: OrdenacaoIniciativa): boolean {
    if (ordenacao === "livre") return true;
    for (let i = 1; i < entradas.length; i++) {
        if (ordenacao === "maior" && entradas[i].valor > entradas[i - 1].valor) return false;
        if (ordenacao === "menor" && entradas[i].valor < entradas[i - 1].valor) return false;
    }
    return true;
}

/** Ordena pelo critério (estável: os empates ficam na ordem em que estavam). "Livre" não mexe. */
function reordenar(): void {
    if (iniciativa.ordenacao === "livre") return;
    const sinal = iniciativa.ordenacao === "maior" ? -1 : 1;
    iniciativa.entradas.sort((a, b) => sinal * (a.valor - b.valor)); // (o sort do JavaScript é estável)
}

/** Aplica uma ação ao estado da iniciativa. Valida tudo; qualquer problema volta como `{ ok: false, erro }` e nada muda. */
export function aplicarAcaoDaIniciativa(pedido: AcaoDaIniciativa): ResultadoDaIniciativa {
    const entradas = iniciativa.entradas;
    const posicaoDe = (id: number): number => entradas.findIndex((e) => e.id === id);
    switch (pedido.acao) {
        case "adicionar": {
            if (entradas.length >= MAX_ENTRADAS_INICIATIVA) return { ok: false, erro: `A iniciativa já tem o máximo de ${MAX_ENTRADAS_INICIATIVA} personagens.` };
            const entrada: EntradaIniciativa = { id: iniciativa.proximoId++, nome: limparNomeIniciativa(pedido.nome), valor: limparValor(pedido.valor), token: pedido.token };
            entradas.push(entrada);
            reordenar();
            iniciativa.editando = true; // alguém CHEGOU: a caixa volta ao modo de edição (confirmar de novo antes de passar a vez)
            return { ok: true, id: entrada.id };
        }
        case "remover": {
            const i = posicaoDe(pedido.id);
            if (i < 0) return { ok: false, erro: "Esse personagem não está na iniciativa." };
            entradas.splice(i, 1);
            if (iniciativa.vez === pedido.id) iniciativa.vez = entradas.length === 0 ? null : entradas[Math.min(i, entradas.length - 1)].id; // (a vez passa para quem estava logo depois)
            if (entradas.length === 0) iniciativa.vez = null;
            return { ok: true };
        }
        case "mover": {
            const i = posicaoDe(pedido.id);
            if (i < 0) return { ok: false, erro: "Esse personagem não está na iniciativa." };
            const [entrada] = entradas.splice(i, 1);
            entradas.splice(limitar(pedido.para, 0, entradas.length), 0, entrada);
            if (!estaOrdenada(entradas, iniciativa.ordenacao)) iniciativa.ordenacao = "livre"; // arrastou para fora do critério: vira ordenação livre
            return { ok: true };
        }
        case "valor": {
            const entrada = entradas.find((e) => e.id === pedido.id);
            if (!entrada) return { ok: false, erro: "Esse personagem não está na iniciativa." };
            entrada.valor = limparValor(pedido.valor);
            reordenar();
            return { ok: true };
        }
        case "nome": {
            const entrada = entradas.find((e) => e.id === pedido.id);
            if (!entrada) return { ok: false, erro: "Esse personagem não está na iniciativa." };
            entrada.nome = limparNomeIniciativa(pedido.nome);
            return { ok: true };
        }
        case "ordenar":
            iniciativa.ordenacao = pedido.ordenacao;
            reordenar();
            return { ok: true };
        case "resetar":
            iniciativa.entradas = [];
            iniciativa.vez = null;
            iniciativa.rodada = 0;
            iniciativa.editando = true; // (vazia, a caixa volta a começar em edição)
            return { ok: true };
        case "proxima": {
            if (iniciativa.editando) return { ok: false, erro: "Confirme a ordem (botão Confirmar) antes de passar a vez." };
            if (entradas.length === 0) return { ok: false, erro: "A iniciativa está vazia." };
            const i = iniciativa.vez === null ? -1 : posicaoDe(iniciativa.vez);
            if (i < 0) {
                iniciativa.vez = entradas[0].id; // (começa o combate)
                iniciativa.rodada = Math.max(1, iniciativa.rodada);
            } else if (i === entradas.length - 1) {
                iniciativa.vez = entradas[0].id; // (deu a volta: nova rodada)
                iniciativa.rodada += 1;
            } else iniciativa.vez = entradas[i + 1].id;
            return { ok: true };
        }
        case "anterior": {
            if (iniciativa.editando) return { ok: false, erro: "Confirme a ordem (botão Confirmar) antes de voltar a vez." };
            const i = iniciativa.vez === null ? -1 : posicaoDe(iniciativa.vez);
            if (i < 0) return { ok: false, erro: "O combate ainda não começou." };
            if (i > 0) iniciativa.vez = entradas[i - 1].id;
            else if (iniciativa.rodada > 1) {
                iniciativa.vez = entradas[entradas.length - 1].id; // (voltou para o fim da rodada anterior)
                iniciativa.rodada -= 1;
            } else return { ok: false, erro: "Já é o primeiro turno do combate." };
            return { ok: true };
        }
        case "rodada":
            if (!eInteiro(pedido.rodada)) return { ok: false, erro: "A rodada precisa ser um número inteiro." };
            iniciativa.rodada = limitar(pedido.rodada, 0, RODADA_MAX);
            return { ok: true };
        case "editar":
            iniciativa.editando = true;
            return { ok: true };
        case "confirmar":
            iniciativa.editando = false;
            return { ok: true };
    }
}

/** Lê uma AÇÃO que veio de fora (a rede): confere a forma e os limites de cada campo. null se não vale. */
export function lerAcaoDaIniciativa(bruto: unknown): AcaoDaIniciativa | null {
    if (typeof bruto !== "object" || bruto === null) return null;
    const a = bruto as Record<string, unknown>;
    const texto = (v: unknown): v is string => typeof v === "string" && v.length <= 200;
    switch (a.acao) {
        case "adicionar":
            if (!texto(a.nome) || !eInteiro(a.valor) || !(a.token === null || (eInteiro(a.token) && a.token >= 1))) return null;
            return { acao: "adicionar", nome: a.nome, valor: a.valor, token: a.token, ...(a.rolar === true && a.token !== null && { rolar: true }) };
        case "remover":
            return eInteiro(a.id) ? { acao: "remover", id: a.id } : null;
        case "mover":
            return eInteiro(a.id) && eInteiro(a.para) ? { acao: "mover", id: a.id, para: a.para } : null;
        case "valor":
            return eInteiro(a.id) && eInteiro(a.valor) ? { acao: "valor", id: a.id, valor: a.valor } : null;
        case "nome":
            return eInteiro(a.id) && texto(a.nome) ? { acao: "nome", id: a.id, nome: a.nome } : null;
        case "ordenar":
            return a.ordenacao === "maior" || a.ordenacao === "menor" || a.ordenacao === "livre" ? { acao: "ordenar", ordenacao: a.ordenacao } : null;
        case "rodada":
            return eInteiro(a.rodada) ? { acao: "rodada", rodada: a.rodada } : null;
        case "resetar":
        case "proxima":
        case "anterior":
        case "editar":
        case "confirmar":
            return { acao: a.acao };
        default:
            return null;
    }
}

/** Confere uma iniciativa que veio de FORA (arquivo ou rede) e a devolve limpa; null se não é uma iniciativa. */
export function lerIniciativa(bruto: unknown): Iniciativa | null {
    if (typeof bruto !== "object" || bruto === null) return null;
    const b = bruto as Record<string, unknown>;
    if (!Array.isArray(b.entradas)) return null;
    const entradas: EntradaIniciativa[] = [];
    const usados = new Set<number>();
    for (const e of b.entradas.slice(0, MAX_ENTRADAS_INICIATIVA)) {
        if (typeof e !== "object" || e === null) continue;
        const x = e as Record<string, unknown>;
        if (!eInteiro(x.id) || x.id < 1 || usados.has(x.id) || !eInteiro(x.valor)) continue;
        usados.add(x.id);
        entradas.push({ id: x.id, nome: limparNomeIniciativa(x.nome), valor: limparValor(x.valor), token: eInteiro(x.token) && x.token >= 1 ? x.token : null });
    }
    const maior = entradas.reduce((m, e) => Math.max(m, e.id), 0);
    return {
        entradas,
        vez: eInteiro(b.vez) && usados.has(b.vez) ? b.vez : null,
        rodada: eInteiro(b.rodada) ? limitar(b.rodada, 0, RODADA_MAX) : 0,
        ordenacao: b.ordenacao === "menor" || b.ordenacao === "livre" ? b.ordenacao : "maior",
        editando: b.editando !== false, // (sem o campo, ou com qualquer valor que não seja false: em edição)
        proximoId: Math.max(eInteiro(b.proximoId) ? b.proximoId : 1, maior + 1),
    };
}

/** Troca o estado da mesa por este (lido de fora). Um valor que não vale deixa a iniciativa vazia. */
export function definirIniciativa(bruto: unknown): void {
    Object.assign(iniciativa, lerIniciativa(bruto) ?? novaIniciativa());
}

/** Uma cópia simples do estado (para a rede e o arquivo). */
export function iniciativaComoObjeto(): Iniciativa {
    return { ...iniciativa, entradas: iniciativa.entradas.map((e) => ({ ...e })) };
}
