// =====================================================================
// MENU DO BOTÃO DIREITO no espaço vazio do mapa (HTML em index.html, `#menu-mapa`): Lápis, Borracha, Ping (com um submenu com os outros tipos: Sumiu, Perigo, Avançar, Ajuda, Agrupar, Alvo...),
// ÁREA (com um submenu: as 5 formas e as áreas rápidas, como Bola de Fogo), Régua (de todos), "Limpar áreas" e, só para o mestre, os pincéis do fog.
// Clicar no item Ping, e não numa das formas do submenu, faz o ping COMUM; clicar no item Área liga a ferramenta com a última forma.
// Abre junto ao cursor; fecha ao clicar fora, com Esc, ao perder o foco da janela ou ao escolher um item. Quem decide o que cada item faz é o main.ts (callbacks).
// O servidor é quem decide de verdade (o ping e a régua só chegam a quem pode ver; os pincéis do fog só o mestre usa): os itens do mestre só são escondidos aqui (classe `so-mestre`).
// =====================================================================

import { AREAS_RAPIDAS, DADOS_DAS_FORMAS_DE_AREA, DADOS_DAS_FORMAS_DE_PING, FORMAS_DE_AREA, FORMAS_ESPECIAIS_DE_PING } from "../config";
import { metrosParaCasas, type FormaDeArea } from "../areas";
import type { FormaDePing } from "../protocolo";
import { criarIconeDePing } from "./iconePing";
import type { NomeFerramenta } from "./painelDesenho";

export interface OpcoesMenuMapa {
    /** Escolheu um ping (`forma`: "comum" se clicou no item Ping): o ponto é o que estava sob o cursor quando o menu abriu (em casas, com fração). */
    aoPingar(col: number, row: number, forma: FormaDePing): void;
    /** Escolheu uma ferramenta (Lápis, Borracha, Régua ou um pincel do fog). */
    aoEscolher(ferramenta: NomeFerramenta): void;
    /** Escolheu uma área: `forma` e, nas áreas rápidas, o tamanho em casas (`null` = o tamanho que já estava guardado para a forma; sem forma, a última usada). */
    aoEscolherArea(forma: FormaDeArea | null, casas: number | null): void;
    /** Escolheu "Limpar áreas". */
    aoLimparAreas(): void;
    /** Há áreas no mapa que esta pessoa pode apagar? (sem elas, "Limpar áreas" fica desabilitado) */
    haAreasParaLimpar(): boolean;
    /** O tamanho guardado de uma forma de área, em texto ("4,5 m"): aparece no item do submenu. */
    tamanhoDaArea(forma: FormaDeArea): string;
    /** O fog do mapa atual está ligado? (sem fog, os pincéis ficam desabilitados) */
    fogAtivo(): boolean;
}

/** Um item que depende do PONTO clicado: "Remover área" (com o símbolo da forma) ou "Remover emanação", sempre com um ✕ vermelho no canto do ícone. */
export interface ItemSobOPonto {
    texto: string;
    dica?: string;
    /** A classe do ícone SVG da forma (ex.: "icone-cone"). */
    icone: string;
    aoClicar(): void;
}

export interface MenuMapa {
    /** Abre o menu na posição (x, y) da JANELA; (col, row) é o ponto do mapa sob o cursor, usado pelo "Ping". `sob` são os itens que dependem do ponto (remover a área ou a emanação que está embaixo do cursor). */
    abrir(x: number, y: number, col: number, row: number, sob?: ItemSobOPonto[]): void;
    fechar(): void;
}

/** Um item de menu com ícone (um elemento) e o nome (entra como TEXTO). */
function criarItem(acao: string, icone: Node, nome: string, dica: string, tamanho?: string): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.acao = acao;
    item.title = dica;
    const caixa = document.createElement("span");
    caixa.className = "menu-mapa-icone";
    caixa.append(icone);
    item.append(caixa, nome);
    if (tamanho !== undefined) {
        const medida = document.createElement("span");
        medida.className = "menu-mapa-medida";
        medida.textContent = tamanho;
        item.append(medida);
    }
    return item;
}
const iconeSvg = (classe: string): HTMLElement => {
    const span = document.createElement("span");
    span.className = `icone-svg ${classe}`;
    return span;
};
export const ICONE_DA_FORMA: Record<FormaDeArea, string> = { cone: "icone-cone", linha: "icone-linha", circulo: "icone-circulo", cubo: "icone-quadrado", emanacao: "icone-emanacao" };
const comVirgula = (metros: number): string => metros.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function criarMenuMapa(opcoes: OpcoesMenuMapa): MenuMapa {
    const menu = document.getElementById("menu-mapa") as HTMLElement;
    const grupos = [...menu.querySelectorAll<HTMLElement>(".menu-mapa-grupo")];
    const extrasDe = (grupo: HTMLElement): HTMLElement => grupo.querySelector<HTMLElement>(".menu-mapa-extras") as HTMLElement;
    const grupoDo = (acao: string): HTMLElement => grupos.find((g) => g.querySelector(`:scope > button[data-acao="${acao}"]`) !== null) as HTMLElement;

    // O submenu do Ping: um item por tipo especial, montado da tabela do config.ts (nome, dica e ícone).
    for (const forma of FORMAS_ESPECIAIS_DE_PING) {
        const dados = DADOS_DAS_FORMAS_DE_PING[forma];
        extrasDe(grupoDo("ping")).append(criarItem(`ping:${forma}`, criarIconeDePing(forma), dados.nome, dados.dica));
    }
    // O submenu da Área: as 5 formas (o tamanho guardado de cada uma aparece ao lado, preenchido ao abrir o menu), um traço e as áreas rápidas.
    const extrasDaArea = extrasDe(grupoDo("area"));
    for (const forma of FORMAS_DE_AREA) {
        const dados = DADOS_DAS_FORMAS_DE_AREA[forma];
        extrasDaArea.append(criarItem(`area:${forma}`, iconeSvg(ICONE_DA_FORMA[forma]), dados.nome, dados.dica, ""));
    }
    const separador = document.createElement("div");
    separador.className = "menu-mapa-separador";
    separador.setAttribute("role", "separator");
    extrasDaArea.append(separador);
    for (const rapida of AREAS_RAPIDAS) {
        const dados = DADOS_DAS_FORMAS_DE_AREA[rapida.forma];
        extrasDaArea.append(
            criarItem(`area:${rapida.forma}:${metrosParaCasas(rapida.metros)}`, iconeSvg(ICONE_DA_FORMA[rapida.forma]), rapida.nome, `${dados.nome} de ${comVirgula(rapida.metros)} m, de uma vez só (forma e tamanho)`, `${comVirgula(rapida.metros)} m`),
        );
    }

    const itens = [...menu.querySelectorAll<HTMLButtonElement>("button[data-acao]")];
    const sobEl = menu.querySelector<HTMLElement>("#menu-mapa-sob") as HTMLElement; // (os itens "Remover área / emanação": refeitos a cada abertura)
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
            else if (acao === "area") opcoes.aoEscolherArea(null, null);
            else if (acao.startsWith("area:")) {
                const [, forma, casas] = acao.split(":");
                opcoes.aoEscolherArea(forma as FormaDeArea, casas === undefined ? null : Number(casas));
            } else if (acao === "area-limpar") opcoes.aoLimparAreas();
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
    // Teclado: Esc fecha; ↑ e ↓ andam pelos itens; → abre o submenu do item (Ping, Área) e ← volta a ele.
    document.addEventListener("keydown", (e) => {
        if (menu.hidden) return;
        if (e.key === "Escape") return fechar();
        if (!menu.contains(document.activeElement)) return;
        const principais = [...itens, ...sobEl.querySelectorAll<HTMLButtonElement>("button")].filter((i) => !i.disabled && i.offsetParent !== null && !i.closest(".menu-mapa-extras"));
        const atual = document.activeElement as HTMLButtonElement;
        const grupoAtual = atual.closest<HTMLElement>(".menu-mapa-grupo");
        const doSubmenu = grupoAtual ? [...extrasDe(grupoAtual).querySelectorAll<HTMLButtonElement>("button")] : [];
        const dentroDoSubmenu = doSubmenu.includes(atual);
        const lista = dentroDoSubmenu ? doSubmenu : principais;
        const posicao = lista.indexOf(atual);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            lista[(posicao + (e.key === "ArrowDown" ? 1 : lista.length - 1)) % lista.length]?.focus();
        } else if (e.key === "ArrowRight" && grupoAtual && !dentroDoSubmenu) {
            e.preventDefault();
            doSubmenu[0]?.focus();
        } else if (e.key === "ArrowLeft" && dentroDoSubmenu) {
            e.preventDefault();
            grupoAtual?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
        }
    });
    window.addEventListener("blur", fechar);
    // O menu do próprio navegador não deve abrir em cima do nosso.
    menu.addEventListener("contextmenu", (e) => e.preventDefault());

    /** Põe um submenu dentro da janela na ALTURA: ele é empurrado se o menu abriu perto de cima ou de baixo. */
    function ajustarAlturaDoSubmenu(grupo: HTMLElement): void {
        const extras = extrasDe(grupo);
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
    }

    return {
        fechar,
        abrir(x, y, col, row, sob = []) {
            ponto = { col, row };
            // Os itens do PONTO: um traço e um botão por área (ou emanação) embaixo do cursor, com o símbolo da forma e um ✕ vermelho. (O texto entra como TEXTO.)
            sobEl.replaceChildren(
                ...(sob.length > 0 ? [Object.assign(document.createElement("div"), { className: "menu-mapa-separador" })] : []),
                ...sob.map((item) => {
                    const botao = criarItem("sob", (() => {
                        const caixa = document.createElement("span");
                        caixa.className = "extra-icone";
                        caixa.append(iconeSvg(item.icone));
                        const x = document.createElement("span");
                        x.className = "extra-x";
                        x.textContent = "✕";
                        x.setAttribute("aria-hidden", "true");
                        caixa.append(x);
                        return caixa;
                    })(), item.texto, item.dica ?? "");
                    botao.addEventListener("click", () => {
                        fechar();
                        item.aoClicar();
                    });
                    return botao;
                }),
            );
            const fogLigado = opcoes.fogAtivo();
            for (const item of itens) {
                if (!item.dataset.acao?.startsWith("fog-")) continue;
                item.disabled = !fogLigado;
                item.title = fogLigado ? (item.dataset.acao === "fog-revelar" ? "Borracha de fog: pinta para REVELAR o mapa" : "Pincel de fog: pinta para COBRIR o mapa de novo") : "Ligue o fog neste mapa (barra Fog) para usar este pincel";
            }
            // "Limpar áreas" só vale se há áreas que esta pessoa pode apagar; as 5 formas mostram o tamanho que ficou guardado.
            const limpar = itens.find((i) => i.dataset.acao === "area-limpar") as HTMLButtonElement;
            limpar.disabled = !opcoes.haAreasParaLimpar();
            for (const forma of FORMAS_DE_AREA) {
                const medida = itens.find((i) => i.dataset.acao === `area:${forma}`)?.querySelector<HTMLElement>(".menu-mapa-medida");
                if (medida) medida.textContent = opcoes.tamanhoDaArea(forma);
            }
            menu.hidden = false;
            menu.classList.remove("extras-esquerda");
            // Dentro da janela: se não couber à direita/embaixo do cursor, abre para o outro lado.
            const largura = menu.offsetWidth;
            const altura = menu.offsetHeight;
            menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - largura - 4))}px`;
            menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - altura - 4))}px`;
            // Os submenus abrem à direita; se não couberem (menu perto da borda direita da janela), abrem à esquerda.
            menu.classList.toggle("extras-esquerda", menu.getBoundingClientRect().right + 200 > window.innerWidth);
            for (const grupo of grupos) ajustarAlturaDoSubmenu(grupo);
            // O foco vai para o primeiro item: setas e Enter funcionam no teclado.
            itens.find((i) => !i.disabled && i.offsetParent !== null)?.focus({ preventScroll: true });
        },
    };
}
