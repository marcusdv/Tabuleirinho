// =====================================================================
// MENU DO BOTÃO DIREITO no espaço vazio do mapa (HTML em index.html, `#menu-mapa`): Lápis, Borracha, Ping (com um submenu com os outros tipos: Sumiu, Perigo, Avançar, Ajuda, Agrupar, Alvo...) e Régua (de todos) e, só para o mestre, a Borracha e o Pincel de fog.
// Clicar no item Ping, e não numa das formas do submenu, faz o ping COMUM.
// Abre junto ao cursor; fecha ao clicar fora, com Esc, ao perder o foco da janela ou ao escolher um item. Quem decide o que cada item faz é o main.ts (callbacks).
// O servidor é quem decide de verdade (o ping e a régua só chegam a quem pode ver; os pincéis do fog só o mestre usa): os itens do mestre só são escondidos aqui (classe `so-mestre`).
// =====================================================================

import { DADOS_DAS_FORMAS_DE_PING, FORMAS_ESPECIAIS_DE_PING } from "../config";
import type { FormaDePing } from "../protocolo";
import { criarIconeDePing } from "./iconePing";
import type { NomeFerramenta } from "./painelDesenho";

export interface OpcoesMenuMapa {
    /** Escolheu um ping (`forma`: "comum" se clicou no item Ping): o ponto é o que estava sob o cursor quando o menu abriu (em casas, com fração). */
    aoPingar(col: number, row: number, forma: FormaDePing): void;
    /** Escolheu uma ferramenta (Lápis, Borracha, Régua ou um pincel do fog). */
    aoEscolher(ferramenta: NomeFerramenta): void;
    /** O fog do mapa atual está ligado? (sem fog, os pincéis ficam desabilitados) */
    fogAtivo(): boolean;
}

export interface MenuMapa {
    /** Abre o menu na posição (x, y) da JANELA; (col, row) é o ponto do mapa sob o cursor, usado pelo "Ping". */
    abrir(x: number, y: number, col: number, row: number): void;
    fechar(): void;
}

export function criarMenuMapa(opcoes: OpcoesMenuMapa): MenuMapa {
    const menu = document.getElementById("menu-mapa") as HTMLElement;
    // O submenu do Ping: um item por tipo especial, montado da tabela do config.ts (nome, dica e ícone).
    const extras = menu.querySelector<HTMLElement>(".menu-mapa-extras") as HTMLElement;
    for (const forma of FORMAS_ESPECIAIS_DE_PING) {
        const dados = DADOS_DAS_FORMAS_DE_PING[forma];
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.dataset.acao = `ping:${forma}`;
        item.title = dados.dica;
        const icone = document.createElement("span");
        icone.className = "menu-mapa-icone";
        icone.append(criarIconeDePing(forma));
        item.append(icone, dados.nome); // (o nome entra como TEXTO)
        extras.append(item);
    }
    const itens = [...menu.querySelectorAll<HTMLButtonElement>("button[data-acao]")];
    let ponto = { col: 0, row: 0 };

    function fechar(): void {
        menu.hidden = true;
    }

    for (const item of itens) {
        item.addEventListener("click", () => {
            const acao = item.dataset.acao as string;
            fechar();
            if (acao === "ping") opcoes.aoPingar(ponto.col, ponto.row, "comum");
            else if (acao.startsWith("ping:")) opcoes.aoPingar(ponto.col, ponto.row, acao.slice(5) as FormaDePing);
            else opcoes.aoEscolher(acao as NomeFerramenta);
        });
    }

    // Fecha ao apertar em qualquer outro lugar (na captura: vem ANTES de o canvas tratar o mesmo clique, que pode abrir o menu de novo), com Esc e ao perder o foco da janela.
    document.addEventListener(
        "pointerdown",
        (e) => {
            if (!menu.hidden && !menu.contains(e.target as Node)) fechar();
        },
        true,
    );
    // Teclado: Esc fecha; ↑ e ↓ andam pelos itens; → abre o submenu do Ping (e ← volta a ele).
    document.addEventListener("keydown", (e) => {
        if (menu.hidden) return;
        if (e.key === "Escape") return fechar();
        if (!menu.contains(document.activeElement)) return;
        const principais = itens.filter((i) => !i.disabled && i.offsetParent !== null && !i.closest(".menu-mapa-extras"));
        const doSubmenu = itens.filter((i) => i.closest(".menu-mapa-extras"));
        const atual = document.activeElement as HTMLButtonElement;
        const lista = doSubmenu.includes(atual) ? doSubmenu : principais;
        const posicao = lista.indexOf(atual);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            lista[(posicao + (e.key === "ArrowDown" ? 1 : lista.length - 1)) % lista.length]?.focus();
        } else if (e.key === "ArrowRight" && atual.dataset.acao === "ping") {
            e.preventDefault();
            doSubmenu[0]?.focus();
        } else if (e.key === "ArrowLeft" && doSubmenu.includes(atual)) {
            e.preventDefault();
            principais[0]?.focus();
        }
    });
    window.addEventListener("blur", fechar);
    // O menu do próprio navegador não deve abrir em cima do nosso.
    menu.addEventListener("contextmenu", (e) => e.preventDefault());

    return {
        fechar,
        abrir(x, y, col, row) {
            ponto = { col, row };
            const fogLigado = opcoes.fogAtivo();
            for (const item of itens) {
                if (!item.dataset.acao?.startsWith("fog-")) continue;
                item.disabled = !fogLigado;
                item.title = fogLigado ? (item.dataset.acao === "fog-revelar" ? "Borracha de fog: pinta para REVELAR o mapa" : "Pincel de fog: pinta para COBRIR o mapa de novo") : "Ligue o fog neste mapa (barra Fog) para usar este pincel";
            }
            menu.hidden = false;
            menu.classList.remove("extras-esquerda");
            // Dentro da janela: se não couber à direita/embaixo do cursor, abre para o outro lado.
            const largura = menu.offsetWidth;
            const altura = menu.offsetHeight;
            menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - largura - 4))}px`;
            menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - altura - 4))}px`;
            // O submenu do Ping abre à direita; se não couber (menu perto da borda direita da janela), abre à esquerda.
            menu.classList.toggle("extras-esquerda", menu.getBoundingClientRect().right + 170 > window.innerWidth);
            // E na altura: o submenu (uma lista comprida) é empurrado para dentro da janela se o menu abriu perto de cima ou de baixo.
            const grupo = extras.parentElement as HTMLElement;
            extras.style.display = "flex";
            extras.style.visibility = "hidden";
            const alturaDoSubmenu = extras.offsetHeight;
            extras.style.display = "";
            extras.style.visibility = "";
            const topoDoGrupo = grupo.getBoundingClientRect().top;
            let deslocamento = -5;
            if (topoDoGrupo + deslocamento + alturaDoSubmenu > window.innerHeight - 4) deslocamento = window.innerHeight - 4 - alturaDoSubmenu - topoDoGrupo;
            if (topoDoGrupo + deslocamento < 4) deslocamento = 4 - topoDoGrupo;
            extras.style.top = `${deslocamento}px`;
            // O foco vai para o primeiro item: setas e Enter funcionam no teclado.
            itens.find((i) => !i.disabled && i.offsetParent !== null)?.focus({ preventScroll: true });
        },
    };
}
