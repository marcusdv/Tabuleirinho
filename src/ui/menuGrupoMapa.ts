// =====================================================================
// PAINEL DE AÇÕES DOS TOKENS NO TABULEIRO (HTML): abre no clique direito, para UM token ou para VÁRIOS selecionados (pedido do dono, 17/11/2026). Só oferece o que TODOS os tokens
// podem receber: se todos têm o status de uma ação (Dano, Cura...), a ação aparece. Clicar numa ação abre um CAMPO dentro do próprio painel (sem janela): digite um número ou dados
// (ex.: 7, 2d6+3), veja a conta logo abaixo e aperte Enter. Com vários tokens os dados são rolados UMA vez (o mesmo total para todos). "Add condição" liga a condição escolhida em todos.
// Um token só também ganha as "extras" (Adicionar à iniciativa, + Nova ação). O "Remover do tabuleiro" de vários continua no cartão de aviso EMBAIXO, como antes.
// Fecha com Esc, com um clique fora ou ao aplicar. Os nomes entram por textContent (nunca como HTML).
// =====================================================================

import { CONDICOES, urlDoIcone } from "../condicoes";
import { limitar } from "../coordenadas";
import { formulaDosDados } from "../dados";
import { acoesEmComum, lerQuantia, rotuloDoStatus, statusDaAcao, type AcaoDaMesa, type Token } from "../estado";

export interface OpcoesMenuGrupoMapa {
    /** A pessoa digitou o valor de uma ação (Dano, Cura...) e apertou Enter: aplicar nestes tokens (um número ou dados). */
    aoAplicar(acaoId: number, texto: string, tokens: Token[]): void;
    /** Escolheu uma condição: `ligar` = ligar em todos (se todos já a têm, desliga de todos). */
    aoCondicao(condicaoId: string, ligar: boolean, tokens: Token[]): void;
}

/** Um item a mais no fim do painel (só para um token: "Adicionar à iniciativa", "+ Nova ação"). */
export interface ExtraDoPainel {
    texto: string;
    dica?: string;
    aoClicar(): void;
}

export interface MenuGrupoMapa {
    /** Abre o painel perto de (x, y), da tela, para estes tokens. */
    abrir(x: number, y: number, tokens: Token[], extras?: ExtraDoPainel[]): void;
    fechar(): void;
}

export function criarMenuGrupoMapa(opcoes: OpcoesMenuGrupoMapa): MenuGrupoMapa {
    const menu = document.getElementById("menu-grupo-mapa") as HTMLElement;
    let alvos: Token[] = [];
    let ponto = { x: 0, y: 0 }; // onde o painel foi aberto (para o re-encaixe quando ele CRESCE: o campo de valor e a grade de condições)

    /** Mantém o painel inteiro dentro da janela (chamado ao abrir e quando ele cresce). */
    function caber(): void {
        const caixa = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(ponto.x, window.innerWidth - caixa.width - 4))}px`;
        menu.style.top = `${Math.max(4, Math.min(ponto.y, window.innerHeight - caixa.height - 4))}px`;
    }

    function fechar(): void {
        menu.hidden = true;
        alvos = [];
        document.removeEventListener("pointerdown", aoApertarFora, true);
        document.removeEventListener("keydown", aoTeclar, true);
    }
    function aoApertarFora(e: PointerEvent): void {
        if (!menu.contains(e.target as Node)) fechar();
    }
    function aoTeclar(e: KeyboardEvent): void {
        if (e.key !== "Escape") return;
        fechar(); // (sem `stopPropagation`: o mesmo Esc também fecha a engrenagem do token, que escuta a janela)
    }

    function botao(texto: string, aoClicar: () => void, dica = ""): HTMLButtonElement {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.textContent = texto;
        if (dica) b.title = dica;
        b.addEventListener("click", aoClicar);
        return b;
    }

    /** A CONTA que aparece embaixo do campo, a cada tecla: o que vai acontecer. Um token: "HP: 10 − 7 = 3". Vários: o que vale para todos. `ok` = o texto é válido (Enter aplica). */
    function previa(acao: AcaoDaMesa, texto: string): { texto: string; erro: boolean; ok: boolean } {
        if (texto.trim() === "") return { texto: "", erro: false, ok: false };
        const quantia = lerQuantia(texto);
        if (!quantia) return { texto: "Não entendi: escreva um número (ex.: 7) ou dados (ex.: 2d6+3).", erro: true, ok: false };
        const sinal = acao.efeito === "reduzir" ? "−" : "+";
        const quantidade = quantia.tipo === "numero" ? String(quantia.valor) : formulaDosDados(quantia.quantidade, quantia.lados, quantia.modificador);
        // Vários tokens: só a quantidade e quantos tokens (sem explicações; os dados são rolados uma vez, o mesmo total para todos).
        if (alvos.length > 1) return { texto: `${sinal} ${quantidade} em ${alvos.length} tokens`, erro: false, ok: true };
        const status = statusDaAcao(alvos[0], acao);
        const valor = status ? alvos[0].valores.find((v) => v.id === status.id) : undefined;
        if (!status || !valor || valor.oculto) return { texto: `${sinal} ${quantidade}`, erro: false, ok: true }; // (um status que esta pessoa não pode ver: sem a conta, só a quantidade)
        const nome = rotuloDoStatus(status);
        if (quantia.tipo === "numero") {
            const depois = limitar(acao.efeito === "reduzir" ? valor.atual - quantia.valor : valor.atual + quantia.valor, 0, valor.max);
            return { texto: `${nome}: ${valor.atual} ${sinal} ${quantia.valor} = ${depois}`, erro: false, ok: true };
        }
        return { texto: `${nome}: ${valor.atual} ${sinal} ${quantidade}`, erro: false, ok: true };
    }

    /** O CAMPO que abre dentro do painel, logo abaixo do botão da ação clicada (só um por vez). */
    function abrirCampo(acao: AcaoDaMesa, depoisDe: HTMLElement): void {
        menu.querySelector(".linha-valor-grupo")?.remove();
        menu.querySelectorAll("button.aberta").forEach((b) => b.classList.remove("aberta"));
        depoisDe.classList.add("aberta");
        const bloco = document.createElement("div");
        bloco.className = "linha-valor-grupo";
        const linha = document.createElement("div");
        linha.className = "linha";
        const campo = document.createElement("input");
        campo.type = "text";
        campo.placeholder = "Valor ou dados (ex.: 7, 2d6+3)";
        campo.autocomplete = "off";
        campo.setAttribute("aria-label", `Valor de ${acao.nome}`);
        const aplicarBotao = document.createElement("button");
        aplicarBotao.type = "button";
        aplicarBotao.className = "aplicar";
        aplicarBotao.textContent = acao.nome;
        aplicarBotao.disabled = true;
        linha.append(campo, aplicarBotao);
        const conta = document.createElement("p");
        conta.className = "previa";
        bloco.append(linha, conta);
        depoisDe.after(bloco);

        const atualizar = (): void => {
            const p = previa(acao, campo.value);
            conta.textContent = p.texto;
            conta.classList.toggle("erro", p.erro);
            aplicarBotao.disabled = !p.ok;
        };
        const aplicar = (): void => {
            if (aplicarBotao.disabled) return;
            const texto = campo.value;
            const lista = alvos;
            fechar();
            opcoes.aoAplicar(acao.id, texto, lista);
        };
        campo.addEventListener("input", atualizar);
        campo.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
            }
        });
        aplicarBotao.addEventListener("click", aplicar);
        caber();
        campo.focus();
    }

    /** A grade das condições: as que TODOS já têm ficam marcadas (clicar nelas desliga de todos); as outras ligam em todos. */
    function desenharCondicoes(): void {
        const grade = document.createElement("div");
        grade.className = "grade-condicoes-grupo";
        for (const condicao of CONDICOES) {
            let todosTem = alvos.every((t) => t.condicoes.includes(condicao.id)); // (muda a cada clique: a caixa FICA ABERTA para escolher várias condições)
            const b = document.createElement("button");
            b.type = "button";
            b.className = `condicao-grupo${todosTem ? " ativa" : ""}`;
            const dicaDe = (): string => (alvos.length === 1 ? (todosTem ? `${condicao.nome}: clique para tirar` : `${condicao.nome}: colocar`) : todosTem ? `${condicao.nome}: todos têm; clique para tirar de todos` : `${condicao.nome}: colocar em todos`);
            b.title = dicaDe();
            const imagem = document.createElement("img");
            imagem.src = urlDoIcone(condicao.id);
            imagem.alt = "";
            imagem.draggable = false;
            const rotulo = document.createElement("span");
            rotulo.textContent = condicao.nome;
            b.append(imagem, rotulo);
            b.addEventListener("click", () => {
                // NÃO fecha a caixa (pedido do dono, 17/11/2026): a pessoa pode escolher várias condições seguidas. O botão muda na hora (o servidor confirma depois).
                todosTem = !todosTem;
                opcoes.aoCondicao(condicao.id, todosTem, alvos);
                b.classList.toggle("ativa", todosTem);
                b.title = dicaDe();
            });
            grade.append(b);
        }
        menu.querySelector(".grade-condicoes-grupo")?.remove();
        menu.append(grade);
        caber();
    }

    return {
        abrir(x, y, tokens, extras = []) {
            alvos = [...tokens];
            const titulo = document.createElement("h1");
            titulo.textContent = alvos.length === 1 ? alvos[0].nome : `${alvos.length} tokens selecionados`;
            const itens: HTMLElement[] = [titulo];
            const comuns = acoesEmComum(alvos);
            for (const acao of comuns) {
                const b = botao(acao.nome, () => abrirCampo(acao, b), alvos.length === 1 ? `${acao.nome}: digite o valor aqui mesmo` : `${acao.nome} em todos os selecionados (os dados são rolados uma vez: o mesmo total para todos)`);
                itens.push(b);
            }
            if (comuns.length === 0) {
                const nada = document.createElement("p");
                nada.className = "grupo-vazio";
                nada.textContent = alvos.length === 1 ? "Este token não tem status para receber dano ou cura (precisa de uma ficha com a variável do status)." : "Nenhuma ação vale para todos (algum não tem o status ou a ficha).";
                itens.push(nada);
            }
            itens.push(botao("Add condição ▾", () => desenharCondicoes(), alvos.length === 1 ? "Colocar ou tirar uma condição" : "Colocar uma condição em todos os selecionados"));
            for (const extra of extras) {
                itens.push(
                    botao(extra.texto, () => {
                        fechar();
                        extra.aoClicar();
                    }, extra.dica ?? ""),
                );
            }
            menu.replaceChildren(...itens);
            menu.hidden = false;
            ponto = { x, y };
            caber(); // (dentro da janela: se não couber à direita ou embaixo, recua)
            document.addEventListener("pointerdown", aoApertarFora, true);
            document.addEventListener("keydown", aoTeclar, true);
        },
        fechar,
    };
}
