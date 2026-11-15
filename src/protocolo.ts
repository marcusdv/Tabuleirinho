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

import { MAX_ABAS_FICHA, MAX_ACOES_MESA, MAX_CARACTERES_APELIDO, MAX_CARACTERES_IMAGEM_TOKEN, MAX_CARACTERES_NOME_VARIAVEL, MAX_CARACTERES_QUANTIA_ACAO, MAX_CARACTERES_TEXTO_FICHA, MAX_GRUPOS, MAX_STATUS_TOKEN, MAX_VALOR_VARIAVEL_QUE_MUDA } from "./config.ts";
import { lerAcaoDaIniciativa, type AcaoDaIniciativa, type Iniciativa } from "./iniciativa.ts";
import type { AbaFicha, AcaoDaMesa, AcaoNova, Ficha, Grupo, Mensagem, MudancasToken, StatusDoToken, StatusNovo, Token, ValorDeStatus } from "./estado.ts";

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
    | { tipo: "ajustar_valor_ficha"; ficha: number; nome: string; delta: number } // SOMAR `delta` (+ ou -) ao valor atual de uma variável que muda da ficha: o SERVIDOR limita ao intervalo, grava e avisa todos
    | { tipo: "iniciativa"; acao: AcaoDaIniciativa } // uma ação na ordem de COMBATE (adicionar, remover, mover, valor, ordenar, resetar, próxima vez...): o SERVIDOR aplica, guarda e avisa todos
    | { tipo: "arrastar_resultado"; token: number; mensagem: number } // o TOTAL de uma rolagem do chat foi solto num token: ele perde essa quantidade do status marcado; o SERVIDOR lê o total da mensagem (o navegador não manda número)
    | { tipo: "aplicar_acao"; token: number; acao: number; valor: string } // aplicar uma ação (Dano, Cura...) a um token: `valor` = um número ou dados ("2d6+3"); o SERVIDOR sorteia e aplica
    | { tipo: "definir_acoes"; acoes: AcaoNova[] } // mudar as AÇÕES da mesa inteira (criar, excluir)
    | { tipo: "definir_status"; status: StatusNovo[] } // mudar os STATUS (barras) da MESA INTEIRA: vale para todos os tokens e peças; o SERVIDOR guarda e avisa todos
    | { tipo: "definir_tamanho"; colunas: number; linhas: number } // mudar o tamanho do tabuleiro (trocar de mapa, botões de colunas/linhas, Alinhar mapa): o SERVIDOR é quem decide e avisa todos
    | { tipo: "colocar_modelo"; modelo: number; col: number; row: number; valores?: { id: number; atual: number }[]; condicoes?: string[] } // arrastar um token da BOLSA para o tabuleiro: o SERVIDOR cria uma PEÇA (cópia temporária); `valores`/`condicoes` só no "Desfazer" de uma remoção
    | { tipo: "enviar_mensagem"; texto: string }
    | { tipo: "rolar_dados"; lados: number; quantidade: number; modificador: number }
    | { tipo: "criar_token"; nome: string; cor: number; corBorda: number; tamanho: number; imagem: string | null; ficha?: number | null } // o SERVIDOR dá o id e cria o arquivo (`ficha` = "Gerar um token" a partir de uma ficha)
    | { tipo: "editar_token"; id: number; mudancas: MudancasToken } // nome, tamanho, cores e/ou imagem
    | { tipo: "excluir_token"; id: number } // apaga o token E o arquivo dele
    | { tipo: "criar_ficha" } // sem dados: o SERVIDOR dá o id e o nome ("Ficha N") e cria o arquivo NA HORA (a ficha nasce vazia)
    | { tipo: "editar_ficha"; id: number; versao: number; nome?: string; abas?: AbaFicha[] } // `versao` = a que a pessoa tinha na tela ao abrir; `abas` = a lista INTEIRA de abas (1 a 6)
    | { tipo: "excluir_ficha"; id: number } // apaga a ficha E o arquivo dela
    | { tipo: "marcar_ficha"; id: number; favorito?: boolean; grupos?: number[] } // estrela e/ou grupos da ficha: NÃO sobe a versão (não é o conteúdo)
    | { tipo: "criar_grupo"; nome: string; cor: number } // o SERVIDOR dá o id e cria o arquivo em dados/grupos/
    | { tipo: "editar_grupo"; id: number; nome?: string; cor?: number }
    | { tipo: "excluir_grupo"; id: number } // apaga o grupo E a marca dele em todos os tokens e fichas (os itens ficam)
    | { tipo: "rolar_ficha"; id: number; versao: number; aba: number; indice: number; token?: number | null }; // rola a rolagem de posição `indice` da ABA `aba` da ficha SALVA (na versão `versao`)

/** O que o servidor AVISA aos navegadores. */
export type EventoDoServidor =
    | { tipo: "estado_inicial"; voce: Jogador; colunas: number; linhas: number; status: StatusDoToken[]; acoes: AcaoDaMesa[]; tokens: Token[]; mensagens: Mensagem[]; fichas: Ficha[]; grupos: Grupo[]; valores: Record<string, Record<string, number>>; iniciativa: Iniciativa }
    | { tipo: "token_criado"; token: Token } // já gravado no disco do servidor; nasce guardado na bolsa
    | { tipo: "iniciativa_definida"; iniciativa: Iniciativa } // a ordem de combate inteira, como ficou depois de uma ação
    | { tipo: "valores_ficha"; id: number; valores: Record<string, number> } // os valores atuais das variáveis que mudam de uma ficha (NOME em MAIÚSCULAS -> valor): o SERVIDOR já limitou; cada navegador refaz as barras dos tokens dela
    | { tipo: "valores_atualizados"; id: number; valores: ValorDeStatus[] } // os valores (PV...) de uma peça mudaram (uma ação foi aplicada)
    | { tipo: "acoes_definidas"; acoes: AcaoDaMesa[] } // a lista de ações da mesa mudou
    | { tipo: "status_definidos"; status: StatusDoToken[]; pecas: { id: number; valores: ValorDeStatus[] }[] } // a regra dos status mudou para todos; `pecas`: os valores (PV...) de cada peça, que o servidor já refez
    | { tipo: "tamanho_definido"; colunas: number; linhas: number } // o tamanho do tabuleiro mudou (já limitado ao permitido); cada navegador puxa para dentro os tokens que ficaram fora
    | { tipo: "peca_criada"; token: Token } // uma PEÇA nova no tabuleiro (cópia de um token da bolsa), já gravada no servidor
    | { tipo: "token_editado"; token: Token } // o token inteiro, como ficou
    | { tipo: "token_excluido"; id: number }
    | { tipo: "ficha_criada"; ficha: Ficha }
    | { tipo: "ficha_excluida"; id: number }
    | { tipo: "ficha_editada"; ficha: Ficha } // já gravada no disco do servidor (a ficha inteira, com a versão nova)
    | { tipo: "ficha_conflito"; ficha: Ficha } // só para quem pediu: a ficha mudou desde que ele a abriu; esta é a versão ATUAL // já gravada no disco do servidor
    | { tipo: "grupo_criado"; grupo: Grupo }
    | { tipo: "grupo_editado"; grupo: Grupo }
    | { tipo: "grupo_excluido"; id: number } // quem recebe tira o grupo também de todos os tokens e fichas (`excluirGrupo`)
    | { tipo: "jogadores"; lista: Jogador[] }
    | { tipo: "token_colocado"; id: number; col: number; row: number; valores?: ValorDeStatus[] } // `valores`: os status temporários (nascem ao sair da bolsa; o SERVIDOR os calcula lendo a ficha)
    | { tipo: "token_guardado"; id: number }
    | { tipo: "mensagem"; mensagem: Mensagem } // texto do chat OU cartão de rolagem (criados só pelo servidor)
    | { tipo: "erro"; motivo: string };

/** Limite do texto de um pedido ANTES de qualquer outra conta (o estado.ts aplica o limite de verdade). */
const TEXTO_MAX_BRUTO = 1000;

const eInteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor);
const eTexto = (valor: unknown, maximo: number): valor is string => typeof valor === "string" && valor.length <= maximo;

/** Uma lista de ids de grupos: só inteiros, no máximo MAX_GRUPOS (o sentido, se o grupo existe, é conferido por `limparGrupos`). null se for outra coisa. */
function lerListaDeIds(bruto: unknown): number[] | null {
    if (!Array.isArray(bruto) || bruto.length > MAX_GRUPOS || !bruto.every(eInteiro)) return null;
    return [...(bruto as number[])];
}

/** A lista de status de um token: no máximo MAX_STATUS_TOKEN itens, cada um com nome e variável (texto curto), cor (inteiro) e, se já existia, o id. O estado.ts (`limparStatus`) limpa o conteúdo. null se for outra coisa. */
function lerListaDeStatus(bruto: unknown): StatusNovo[] | null {
    if (!Array.isArray(bruto) || bruto.length > MAX_STATUS_TOKEN) return null;
    const lista: StatusNovo[] = [];
    for (const s of bruto) {
        if (typeof s !== "object" || s === null || Array.isArray(s)) return null;
        const x = s as Record<string, unknown>;
        if (!eTexto(x.nome, TEXTO_MAX_BRUTO) || !eTexto(x.variavel, TEXTO_MAX_BRUTO) || !eInteiro(x.cor)) return null;
        if (x.id !== undefined && !eInteiro(x.id)) return null;
        if ((x.mostrar !== undefined && typeof x.mostrar !== "boolean") || (x.numeros !== undefined && typeof x.numeros !== "boolean")) return null;
        let grupos: number[] | null | undefined;
        if (x.grupos !== undefined && x.grupos !== null) {
            if (!Array.isArray(x.grupos) || x.grupos.length > MAX_GRUPOS || !x.grupos.every(eInteiro)) return null; // (a lista de grupos em que o status vale; o estado.ts descarta os que não existem)
            grupos = [...(x.grupos as number[])];
        } else grupos = x.grupos;
        lista.push({ ...(x.id !== undefined && { id: x.id }), nome: x.nome, variavel: x.variavel, cor: x.cor, ...(x.mostrar !== undefined && { mostrar: x.mostrar }), ...(x.numeros !== undefined && { numeros: x.numeros }), ...(grupos !== undefined && { grupos }), ...(x.semGrupo === true && { semGrupo: true }), ...(x.recebeArrasto === true && { recebeArrasto: true }) });
    }
    return lista;
}

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
        case "ajustar_valor_ficha":
            return eInteiro(p.ficha) && eTexto(p.nome, MAX_CARACTERES_NOME_VARIAVEL) && eInteiro(p.delta) && Math.abs(p.delta) <= 2 * MAX_VALOR_VARIAVEL_QUE_MUDA ? { tipo: "ajustar_valor_ficha", ficha: p.ficha, nome: p.nome, delta: p.delta } : null;
        case "iniciativa": {
            const acao = lerAcaoDaIniciativa(p.acao);
            return acao ? { tipo: "iniciativa", acao } : null;
        }
        case "arrastar_resultado":
            return eInteiro(p.token) && eInteiro(p.mensagem) ? { tipo: "arrastar_resultado", token: p.token, mensagem: p.mensagem } : null;
        case "aplicar_acao":
            return eInteiro(p.token) && eInteiro(p.acao) && eTexto(p.valor, MAX_CARACTERES_QUANTIA_ACAO) ? { tipo: "aplicar_acao", token: p.token, acao: p.acao, valor: p.valor } : null;
        case "definir_acoes": {
            if (!Array.isArray(p.acoes) || p.acoes.length > MAX_ACOES_MESA) return null;
            const acoes: AcaoNova[] = [];
            for (const a of p.acoes) {
                const x = typeof a === "object" && a !== null ? (a as Record<string, unknown>) : null;
                if (!x || !eTexto(x.nome, TEXTO_MAX_BRUTO) || !eInteiro(x.status) || (x.efeito !== "reduzir" && x.efeito !== "aumentar")) return null;
                if (x.id !== undefined && !eInteiro(x.id)) return null;
                acoes.push({ ...(x.id !== undefined && { id: x.id }), nome: x.nome, status: x.status, efeito: x.efeito });
            }
            return { tipo: "definir_acoes", acoes };
        }
        case "definir_status": {
            const status = lerListaDeStatus(p.status);
            return status === null ? null : { tipo: "definir_status", status };
        }
        case "definir_tamanho":
            return eInteiro(p.colunas) && eInteiro(p.linhas) ? { tipo: "definir_tamanho", colunas: p.colunas, linhas: p.linhas } : null;
        case "colocar_modelo": {
            if (!eInteiro(p.modelo) || !eInteiro(p.col) || !eInteiro(p.row)) return null;
            let valores: { id: number; atual: number }[] | undefined;
            if (p.valores !== undefined) {
                if (!Array.isArray(p.valores) || p.valores.length > MAX_STATUS_TOKEN) return null;
                valores = [];
                for (const v of p.valores) {
                    const x = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
                    if (!eInteiro(x.id) || !eInteiro(x.atual)) return null;
                    valores.push({ id: x.id, atual: x.atual });
                }
            }
            let condicoes: string[] | undefined;
            if (p.condicoes !== undefined) {
                if (!Array.isArray(p.condicoes) || p.condicoes.length > 40 || !p.condicoes.every((c) => eTexto(c, 40))) return null;
                condicoes = [...(p.condicoes as string[])];
            }
            return { tipo: "colocar_modelo", modelo: p.modelo, col: p.col, row: p.row, ...(valores && { valores }), ...(condicoes && { condicoes }) };
        }
        case "enviar_mensagem":
            return eTexto(p.texto, TEXTO_MAX_BRUTO) ? { tipo: "enviar_mensagem", texto: p.texto } : null;
        case "rolar_dados":
            return eInteiro(p.lados) && eInteiro(p.quantidade) && eInteiro(p.modificador)
                ? { tipo: "rolar_dados", lados: p.lados, quantidade: p.quantidade, modificador: p.modificador }
                : null;
        case "criar_token":
            return eTexto(p.nome, TEXTO_MAX_BRUTO) &&
                eInteiro(p.cor) &&
                eInteiro(p.corBorda) &&
                eInteiro(p.tamanho) &&
                (p.imagem === null || eTexto(p.imagem, MAX_CARACTERES_IMAGEM_TOKEN)) &&
                (p.ficha === undefined || p.ficha === null || eInteiro(p.ficha))
                ? { tipo: "criar_token", nome: p.nome, cor: p.cor, corBorda: p.corBorda, tamanho: p.tamanho, imagem: p.imagem, ...(p.ficha !== undefined && { ficha: p.ficha }) }
                : null;
        case "editar_token": {
            if (!eInteiro(p.id) || typeof p.mudancas !== "object" || p.mudancas === null || Array.isArray(p.mudancas)) return null;
            const m = p.mudancas as Record<string, unknown>;
            const mudancas: MudancasToken = {};
            // Só entram os campos conhecidos; um campo presente com o tipo errado invalida o pedido inteiro.
            if (m.nome !== undefined) { if (!eTexto(m.nome, TEXTO_MAX_BRUTO)) return null; mudancas.nome = m.nome; }
            if (m.size !== undefined) { if (!eInteiro(m.size)) return null; mudancas.size = m.size; }
            if (m.cor !== undefined) { if (!eInteiro(m.cor)) return null; mudancas.cor = m.cor; }
            if (m.corBorda !== undefined) { if (!eInteiro(m.corBorda)) return null; mudancas.corBorda = m.corBorda; }
            if (m.imagem !== undefined) {
                if (m.imagem !== null && !eTexto(m.imagem, MAX_CARACTERES_IMAGEM_TOKEN)) return null;
                mudancas.imagem = m.imagem;
            }
            if (m.favorito !== undefined) { if (typeof m.favorito !== "boolean") return null; mudancas.favorito = m.favorito; }
            if (m.grupos !== undefined) { const g = lerListaDeIds(m.grupos); if (g === null) return null; mudancas.grupos = g; }
            if (m.ficha !== undefined) { if (m.ficha !== null && !eInteiro(m.ficha)) return null; mudancas.ficha = m.ficha; }
            return { tipo: "editar_token", id: p.id, mudancas };
        }
        case "excluir_token":
            return eInteiro(p.id) ? { tipo: "excluir_token", id: p.id } : null;
        case "marcar_ficha": {
            if (!eInteiro(p.id)) return null;
            if (p.favorito !== undefined && typeof p.favorito !== "boolean") return null;
            const grupos = p.grupos === undefined ? undefined : lerListaDeIds(p.grupos);
            if (grupos === null) return null;
            return { tipo: "marcar_ficha", id: p.id, ...(p.favorito !== undefined && { favorito: p.favorito }), ...(grupos !== undefined && { grupos }) };
        }
        case "criar_grupo":
            return eTexto(p.nome, TEXTO_MAX_BRUTO) && eInteiro(p.cor) ? { tipo: "criar_grupo", nome: p.nome, cor: p.cor } : null;
        case "editar_grupo":
            if (!eInteiro(p.id) || (p.nome !== undefined && !eTexto(p.nome, TEXTO_MAX_BRUTO)) || (p.cor !== undefined && !eInteiro(p.cor))) return null;
            return { tipo: "editar_grupo", id: p.id, ...(p.nome !== undefined && { nome: p.nome }), ...(p.cor !== undefined && { cor: p.cor }) };
        case "excluir_grupo":
            return eInteiro(p.id) ? { tipo: "excluir_grupo", id: p.id } : null;
        case "criar_ficha":
            return { tipo: "criar_ficha" }; // qualquer outro campo que venha junto é descartado
        case "excluir_ficha":
            return eInteiro(p.id) ? { tipo: "excluir_ficha", id: p.id } : null;
        case "rolar_ficha":
            return eInteiro(p.id) && eInteiro(p.versao) && eInteiro(p.aba) && eInteiro(p.indice) && (p.token === undefined || p.token === null || eInteiro(p.token))
                ? { tipo: "rolar_ficha", id: p.id, versao: p.versao, aba: p.aba, indice: p.indice, ...(p.token !== undefined && { token: p.token }) }
                : null;
        case "editar_ficha": {
            if (!eInteiro(p.id) || !eInteiro(p.versao)) return null;
            if (p.nome !== undefined && !eTexto(p.nome, TEXTO_MAX_BRUTO)) return null;
            // (a limpeza só ENCURTA o texto, então este limite bruto já é o de verdade; o sentido — inclusive o limite da SOMA dos textos — é conferido por montarEdicaoDaFicha)
            let abas: AbaFicha[] | undefined;
            if (p.abas !== undefined) {
                if (!Array.isArray(p.abas) || p.abas.length < 1 || p.abas.length > MAX_ABAS_FICHA) return null;
                abas = [];
                for (const bruta of p.abas as unknown[]) {
                    if (typeof bruta !== "object" || bruta === null) return null;
                    const { nome, texto } = bruta as Record<string, unknown>;
                    if (!eTexto(nome, TEXTO_MAX_BRUTO) || !eTexto(texto, MAX_CARACTERES_TEXTO_FICHA)) return null;
                    abas.push({ nome, texto }); // (só estes dois campos: qualquer outro é descartado)
                }
            }
            if (abas && abas.reduce((soma, aba) => soma + aba.texto.length, 0) > MAX_CARACTERES_TEXTO_FICHA) return null; // (a SOMA das abas também tem o limite: recusa antes de qualquer trabalho)
            return { tipo: "editar_ficha", id: p.id, versao: p.versao, ...(p.nome !== undefined && { nome: p.nome }), ...(abas !== undefined && { abas }) };
        }
        default:
            return null; // tipo desconhecido: só existe o que está na lista acima
    }
}

/** Apelido limpo: sem caracteres de controle, espaços aparados e cortado ao máximo. Vazio vira "Jogador N". */
export function limparApelido(apelido: string, id: number): string {
    const limpo = apelido.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_APELIDO).trim();
    return limpo === "" ? `Jogador ${id}` : limpo;
}
