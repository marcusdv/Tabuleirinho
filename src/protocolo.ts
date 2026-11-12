// =====================================================================
// PROTOCOLO da rede: o formato das mensagens trocadas entre o navegador e o servidor (WebSocket, em JSON).
// Este arquivo é COMPARTILHADO (o servidor e o navegador usam o mesmo): sem PixiJS, sem HTML.
//
//   - PedidoDoCliente: o que o navegador PEDE (mover um token, escrever no chat, rolar dados...).
//   - EventoDoServidor: o que o servidor AVISA a todos depois de validar e aplicar um pedido.
//
// REGRA DE SEGURANÇA (BRAINSTORM.md): tudo que chega de um navegador é dado NÃO confiável. `lerPedido` confere a
// FORMA de cada pedido (tipos certos, nenhum campo a mais) e devolve um objeto limpo, ou null. O sentido
// (o token existe? essa posição cabe? o texto passa do limite?) é conferido depois, pelas regras de estado.ts.
// =====================================================================

import { MAX_CARACTERES_APELIDO } from "./config.ts";
import type { Mensagem, Token } from "./estado.ts";

/** Um jogador conectado à mesa. */
export interface Jogador {
    id: number;
    apelido: string;
}

/** O que o navegador PEDE ao servidor. */
export type PedidoDoCliente =
    | { tipo: "entrar"; apelido: string }
    | { tipo: "colocar_token"; id: number; col: number; row: number } // soltar um token no mapa (mover ou tirar da bolsa)
    | { tipo: "guardar_token"; id: number } // soltar um token na bolsa
    | { tipo: "enviar_mensagem"; texto: string }
    | { tipo: "rolar_dados"; lados: number; quantidade: number; modificador: number };

/** O que o servidor AVISA aos navegadores. */
export type EventoDoServidor =
    | { tipo: "estado_inicial"; voce: Jogador; colunas: number; linhas: number; tokens: Token[]; mensagens: Mensagem[] }
    | { tipo: "jogadores"; lista: Jogador[] }
    | { tipo: "token_colocado"; id: number; col: number; row: number }
    | { tipo: "token_guardado"; id: number }
    | { tipo: "mensagem"; mensagem: Mensagem } // texto do chat OU cartão de rolagem (criados só pelo servidor)
    | { tipo: "erro"; motivo: string };

/** Limite do texto de um pedido ANTES de qualquer outra conta (o estado.ts aplica o limite de verdade). */
const TEXTO_MAX_BRUTO = 1000;

const eInteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor);
const eTexto = (valor: unknown, maximo: number): valor is string => typeof valor === "string" && valor.length <= maximo;

/**
 * Confere a FORMA de um pedido que veio da rede (já convertido de JSON). Devolve um pedido limpo (só os campos
 * conhecidos) ou null se for qualquer outra coisa. Nunca lança erro, não importa o que chegue.
 */
export function lerPedido(bruto: unknown): PedidoDoCliente | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const p = bruto as Record<string, unknown>;
    switch (p.tipo) {
        case "entrar":
            return eTexto(p.apelido, TEXTO_MAX_BRUTO) ? { tipo: "entrar", apelido: p.apelido } : null;
        case "colocar_token":
            return eInteiro(p.id) && eInteiro(p.col) && eInteiro(p.row) ? { tipo: "colocar_token", id: p.id, col: p.col, row: p.row } : null;
        case "guardar_token":
            return eInteiro(p.id) ? { tipo: "guardar_token", id: p.id } : null;
        case "enviar_mensagem":
            return eTexto(p.texto, TEXTO_MAX_BRUTO) ? { tipo: "enviar_mensagem", texto: p.texto } : null;
        case "rolar_dados":
            return eInteiro(p.lados) && eInteiro(p.quantidade) && eInteiro(p.modificador)
                ? { tipo: "rolar_dados", lados: p.lados, quantidade: p.quantidade, modificador: p.modificador }
                : null;
        default:
            return null; // tipo desconhecido: só existe o que está na lista acima
    }
}

/** Apelido limpo: sem caracteres de controle, espaços aparados e cortado ao máximo. Vazio vira "Jogador N". */
export function limparApelido(apelido: string, id: number): string {
    const limpo = apelido.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_APELIDO).trim();
    return limpo === "" ? `Jogador ${id}` : limpo;
}
