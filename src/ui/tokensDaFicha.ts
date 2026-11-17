// =====================================================================
// TOKENS DA FICHA (HTML): a caixa das LIGAÇÕES entre uma ficha e os tokens da bolsa (pedido do dono, 17/11/2026). Abre pelo clique direito da ficha
// ("Tokens da ficha" e "Adicionar a um token"). Mostra os tokens ligados a ela (cada um com "Tirar") e, embaixo, os outros tokens da bolsa com uma
// PESQUISA e o botão "Botar". Tirar só desfaz a LIGAÇÃO: o token continua existindo. Uma ficha ÚNICA (tem recursos) aceita um token só: com um já
// ligado, os "Botar" ficam apagados, com a razão na dica (o servidor também recusa). Se a ficha única já tem vários tokens, um aviso em VERMELHO pede para deixar só um.
// Os nomes entram por textContent (nunca como HTML).
// =====================================================================

import { estado, fichaUnicaComVariosTokens, modelosDaFicha, motivoFichaOcupada, type Ficha, type Token } from "../estado";
import { pintarDisco } from "./aparenciaToken";

export interface OpcoesTokensDaFicha {
    /** Liga o token à ficha (`idFicha`) ou desfaz a ligação (`null`). Quem trata manda ao servidor (que confere a regra da ficha única) ou aplica no modo local. */
    aoLigar(token: Token, idFicha: number | null): void;
}

export interface TokensDaFicha {
    /** Abre a caixa desta ficha. `focarBusca`: já com o cursor na pesquisa dos tokens para botar. */
    abrir(ficha: Ficha, focarBusca?: boolean): void;
    /** Os tokens ou as fichas mudaram: refaz as listas se a caixa está aberta (fecha se a ficha foi excluída). */
    atualizar(): void;
    readonly aberta: boolean;
}

const pegar = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Sem maiúsculas nem acentos (a pesquisa ignora os dois). */
function simplificar(texto: string): string {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function criarTokensDaFicha(opcoes: OpcoesTokensDaFicha): TokensDaFicha {
    const janela = pegar("tokens-ficha");
    const titulo = pegar("tokens-ficha-titulo");
    const aviso = pegar("tokens-ficha-aviso");
    const listaLigados = pegar("tokens-ficha-ligados");
    const vazioLigados = pegar("tokens-ficha-sem-ligados");
    const campoBusca = pegar<HTMLInputElement>("tokens-ficha-busca");
    const listaLivres = pegar("tokens-ficha-livres");
    const vazioLivres = pegar("tokens-ficha-sem-livres");
    const botaoFechar = pegar<HTMLButtonElement>("tokens-ficha-fechar");

    let idDaFicha: number | null = null;

    /** Uma linha: o disco do token, o nome e um botão. */
    function linha(token: Token, rotuloBotao: string, aoClicar: () => void, apagado: string | null, extra = ""): HTMLLIElement {
        const item = document.createElement("li");
        const disco = document.createElement("span");
        disco.className = "disco";
        pintarDisco(disco, token.cor, token.corBorda, token.imagem);
        const nome = document.createElement("span");
        nome.className = "tokens-ficha-nome";
        nome.textContent = extra === "" ? token.nome : `${token.nome} ${extra}`;
        const botao = document.createElement("button");
        botao.type = "button";
        botao.textContent = rotuloBotao;
        if (apagado) {
            botao.disabled = true;
            botao.title = apagado;
        } else {
            botao.addEventListener("click", aoClicar);
        }
        item.append(disco, nome, botao);
        return item;
    }

    function desenhar(): void {
        const ficha = estado.fichas.find((f) => f.id === idDaFicha);
        if (!ficha) {
            janela.hidden = true;
            idDaFicha = null;
            return;
        }
        titulo.textContent = `Tokens da ficha: ${ficha.nome}`;
        const ligados = modelosDaFicha(ficha.id);
        const demais = fichaUnicaComVariosTokens(ficha.id);
        aviso.hidden = !demais;
        if (demais) aviso.textContent = `⚠ Esta ficha é única (tem recursos), mas ${ligados.length} tokens estão ligados a ela. Deixe só um.`;
        listaLigados.replaceChildren(...ligados.map((t) => linha(t, "Tirar", () => opcoes.aoLigar(t, null), null)));
        vazioLigados.hidden = ligados.length > 0;

        const busca = simplificar(campoBusca.value.trim());
        const livres = estado.tokens
            .filter((t) => t.copiaDe === null && t.ficha !== ficha.id && (busca === "" || simplificar(t.nome).includes(busca)))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id - b.id);
        // Ficha única já ocupada: nenhum "Botar" vale (o motivo vai na dica de cada botão).
        const ocupada = motivoFichaOcupada(ficha.id, null);
        listaLivres.replaceChildren(
            ...livres.map((t) => {
                const outra = t.ficha === null ? undefined : estado.fichas.find((f) => f.id === t.ficha);
                return linha(t, "Botar", () => opcoes.aoLigar(t, ficha.id), ocupada, outra ? `(troca a ficha "${outra.nome}")` : "");
            }),
        );
        vazioLivres.hidden = livres.length > 0;
        vazioLivres.textContent = busca === "" ? "Nenhum outro token na bolsa." : "Nenhum token encontrado.";
    }

    function fechar(): void {
        janela.hidden = true;
        idDaFicha = null;
    }

    botaoFechar.addEventListener("click", fechar);
    campoBusca.addEventListener("input", desenhar);
    janela.addEventListener("pointerdown", (e) => {
        if (e.target === janela) fechar(); // o fundo escurecido
    });
    document.addEventListener(
        "keydown",
        (e) => {
            if (janela.hidden || e.key !== "Escape") return;
            e.stopPropagation(); // só esta caixa fecha
            fechar();
        },
        true,
    );

    return {
        abrir(ficha, focarBusca = false) {
            idDaFicha = ficha.id;
            campoBusca.value = "";
            desenhar();
            janela.hidden = false;
            if (focarBusca) campoBusca.focus();
            else botaoFechar.focus();
        },
        atualizar() {
            if (!janela.hidden) desenhar();
        },
        get aberta() {
            return !janela.hidden;
        },
    };
}
