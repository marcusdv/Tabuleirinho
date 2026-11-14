// =====================================================================
// MODAL "AÇÕES DOS TOKENS" (HTML): a lista das ações da MESA (Dano, Cura e as que o dono criar) e o formulário de "Nova ação". É UMA regra para todos os tokens, como os
// status. Abre pelo "+ Nova ação" do menu do token. Cada mudança (criar, excluir) é avisada na hora por `aoMudar` com a lista INTEIRA. A marcação e o CSS ficam no index.html
// (ids "modal-acoes-*"). Os nomes entram por textContent.
// =====================================================================

import { MAX_ACOES_MESA, MAX_CARACTERES_NOME_ACAO } from "../config";
import { estado, type AcaoNova } from "../estado";

export interface OpcoesModalAcoes {
    /** A lista de ações mudou (a lista inteira, já com a ação nova ou sem a excluída). */
    aoMudar(acoes: AcaoNova[]): void;
}

export interface ModalAcoes {
    abrir(): void;
    /** A lista da mesa mudou (por esta pessoa ou outra): refaz a lista, se o modal está aberto. */
    atualizar(): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarModalAcoes(opcoes: OpcoesModalAcoes): ModalAcoes {
    const janela = pegar("modal-acoes");
    const lista = pegar("modal-acoes-lista");
    const campoNome = pegar<HTMLInputElement>("modal-acoes-nome");
    const campoEfeito = pegar<HTMLSelectElement>("modal-acoes-efeito");
    const campoStatus = pegar<HTMLSelectElement>("modal-acoes-status");
    const botaoAdicionar = pegar<HTMLButtonElement>("modal-acoes-adicionar");
    const botaoFechar = pegar<HTMLButtonElement>("modal-acoes-fechar");
    campoNome.maxLength = MAX_CARACTERES_NOME_ACAO;
    let focoAnterior: HTMLElement | null = null;

    const nomeDoStatus = (id: number): string => estado.statusDaMesa.find((s) => s.id === id)?.nome ?? "(status excluído)";
    const listaAtual = (): AcaoNova[] => estado.acoesDaMesa.map((a) => ({ ...a }));

    function desenhar(): void {
        if (estado.acoesDaMesa.length === 0) {
            const vazio = document.createElement("p");
            vazio.className = "modal-acoes-ajuda";
            vazio.textContent = "Nenhuma ação. Crie uma abaixo.";
            lista.replaceChildren(vazio);
        } else {
            lista.replaceChildren(
                ...estado.acoesDaMesa.map((acao) => {
                    const linha = document.createElement("div");
                    linha.className = "modal-acoes-linha";
                    const nome = document.createElement("strong");
                    nome.textContent = acao.nome;
                    const efeito = document.createElement("span");
                    efeito.textContent = `${acao.efeito === "reduzir" ? "tira do" : "soma ao"} ${nomeDoStatus(acao.status)}`;
                    const excluir = document.createElement("button");
                    excluir.type = "button";
                    excluir.textContent = "✕";
                    excluir.title = `Excluir a ação ${acao.nome}`;
                    excluir.setAttribute("aria-label", `Excluir a ação ${acao.nome}`);
                    excluir.addEventListener("click", () => opcoes.aoMudar(listaAtual().filter((a) => a.id !== acao.id)));
                    linha.append(nome, efeito, excluir);
                    return linha;
                }),
            );
        }
        // Os status que a ação pode mudar (os da mesa).
        const escolhido = campoStatus.value;
        campoStatus.replaceChildren(
            ...estado.statusDaMesa.map((s) => {
                const opcao = document.createElement("option");
                opcao.value = String(s.id);
                opcao.textContent = s.nome;
                return opcao;
            }),
        );
        if (escolhido && estado.statusDaMesa.some((s) => String(s.id) === escolhido)) campoStatus.value = escolhido;
        const cheio = estado.acoesDaMesa.length >= MAX_ACOES_MESA;
        botaoAdicionar.disabled = cheio || estado.statusDaMesa.length === 0;
        botaoAdicionar.title = cheio ? `No máximo ${MAX_ACOES_MESA} ações` : estado.statusDaMesa.length === 0 ? "Crie um status antes (na bolsa, em \"Status\")" : "";
    }

    function adicionar(): void {
        if (botaoAdicionar.disabled) return;
        const nome = campoNome.value.trim();
        if (nome === "") {
            campoNome.focus();
            return;
        }
        opcoes.aoMudar([...listaAtual(), { nome, status: Number(campoStatus.value), efeito: campoEfeito.value === "aumentar" ? "aumentar" : "reduzir" }]);
        campoNome.value = "";
        campoNome.focus();
    }

    function fechar(): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        focoAnterior?.focus();
        focoAnterior = null;
    }

    function aoTeclar(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation();
            fechar();
        } else if (e.key === "Enter" && document.activeElement === campoNome) {
            e.preventDefault();
            adicionar();
        }
    }

    botaoAdicionar.addEventListener("click", adicionar);
    botaoFechar.addEventListener("click", fechar);
    janela.addEventListener("click", (e) => {
        if (e.target === janela) fechar();
    });

    return {
        abrir() {
            focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            desenhar();
            janela.hidden = false;
            document.addEventListener("keydown", aoTeclar, true);
            campoNome.focus();
        },
        atualizar() {
            if (!janela.hidden) desenhar();
        },
    };
}
