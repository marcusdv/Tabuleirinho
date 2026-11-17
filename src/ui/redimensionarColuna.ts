// =====================================================================
// REDIMENSIONAR A COLUNA DA DIREITA (chat e bolsa; pedido do dono, 17/11/2026): uma alça no CANTO de cima à esquerda. Arrastar para a direita estreita a coluna e para baixo diminui a altura (ela fica
// presa no canto de baixo à direita); para o outro lado aumenta. Há uma largura e uma altura MÍNIMAS (para o layout não quebrar) e a largura máxima. O tamanho é lembrado no navegador.
// Como o resto da tela se organiza pela variável `--largura-chat`, as outras caixas acompanham a coluna sozinhas. A altura é a variável `--topo-chat` (onde a coluna começa, de cima).
// =====================================================================

import { ALTURA_MIN_COLUNA, CHAVE_TAMANHO_COLUNA, LARGURA_MAX_COLUNA, LARGURA_MIN_COLUNA } from "../config";
import { lerPreferencia, guardarPreferencia } from "./preferencias";

export function criarRedimensionadorDaColuna(): void {
    const coluna = document.getElementById("chat");
    const alca = document.getElementById("chat-redimensionar");
    if (!coluna || !alca) return;
    const col: HTMLElement = coluna; // (tipo sem null para as funções abaixo)
    const raiz = document.documentElement;

    /** O tamanho que vale agora (a largura vem do CSS, a menos que a pessoa tenha mexido). */
    const larguraAtual = (): number => col.getBoundingClientRect().width;
    const topoAtual = (): number => col.getBoundingClientRect().top;

    /** Aplica um tamanho (dentro dos limites) e o mostra. `topo` = quantos pixels a col fica abaixo do alto da janela. */
    function aplicar(largura: number, topo: number): { largura: number; topo: number } {
        const l = Math.round(Math.max(LARGURA_MIN_COLUNA, Math.min(Math.min(LARGURA_MAX_COLUNA, window.innerWidth * 0.6), largura)));
        const t = Math.round(Math.max(0, Math.min(window.innerHeight - ALTURA_MIN_COLUNA, topo)));
        raiz.style.setProperty("--largura-chat", `${l}px`);
        raiz.style.setProperty("--topo-chat", `${t}px`);
        col.classList.toggle("reduzida", t > 0);
        return { largura: l, topo: t };
    }

    // O tamanho de uma visita anterior.
    const guardado = lerPreferencia(CHAVE_TAMANHO_COLUNA);
    if (guardado) {
        const [l, t] = guardado.split(",").map(Number);
        if (Number.isFinite(l) && Number.isFinite(t)) aplicar(l, t);
    }
    // Janela menor que antes: a col volta a caber.
    window.addEventListener("resize", () => {
        if (raiz.style.getPropertyValue("--topo-chat") !== "" || raiz.style.getPropertyValue("--largura-chat") !== "") aplicar(larguraAtual(), topoAtual());
    });

    alca.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        alca.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const y0 = e.clientY;
        const l0 = larguraAtual();
        const t0 = topoAtual();
        col.classList.add("redimensionando");
        const mover = (m: PointerEvent): void => {
            aplicar(l0 - (m.clientX - x0), t0 + (m.clientY - y0)); // (para a direita estreita; para baixo diminui)
        };
        const soltar = (): void => {
            alca.removeEventListener("pointermove", mover);
            alca.removeEventListener("pointerup", soltar);
            alca.removeEventListener("pointercancel", soltar);
            col.classList.remove("redimensionando");
            guardarPreferencia(CHAVE_TAMANHO_COLUNA, `${Math.round(larguraAtual())},${Math.round(topoAtual())}`);
        };
        alca.addEventListener("pointermove", mover);
        alca.addEventListener("pointerup", soltar);
        alca.addEventListener("pointercancel", soltar);
    });
    // Duplo clique na alça: volta ao tamanho de fábrica.
    alca.addEventListener("dblclick", () => {
        raiz.style.removeProperty("--largura-chat");
        raiz.style.removeProperty("--topo-chat");
        col.classList.remove("reduzida");
        guardarPreferencia(CHAVE_TAMANHO_COLUNA, "");
    });
}
