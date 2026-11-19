// =====================================================================
// A RODA DE PINGS (HTML em index.html, `#roda-ping`): Shift + botão esquerdo apertado no mapa e ARRASTADO abre uma roda de 12 posições centrada no ponto apertado (como no League of Legends);
// o mouse aponta um lado, e SOLTAR faz o ping daquele tipo. TODOS os 12 tipos estão na roda (também no submenu do botão direito). Cima: Ajuda, direita: Avançar, baixo: Perigo, esquerda: Sumiu.
// Soltar no meio da roda, ou sem arrastar, faz o ping comum. Esc cancela.
// Aqui só mora o desenho e a escolha do lado; quem manda o ping é o main.ts. O mouse passa por cima da roda (pointer-events: none), então os eventos continuam sendo do palco.
// =====================================================================

import { DADOS_DAS_FORMAS_DE_PING, PX_ABRIR_RODA_PING, PX_ZONA_MORTA_RODA_PING, RAIO_RODA_PING } from "../config";
import type { FormaDePing } from "../protocolo";
import { criarIconeDePing, type FormaEspecialDePing } from "./iconePing";

/**
 * As 12 POSIÇÕES da roda, no sentido do relógio a partir de cima (0 = cima, 3 = direita, 6 = baixo, 9 = esquerda; uma a cada 30°). Os quatro lados de sempre ficam nos mesmos lugares.
 * (`null` seria uma posição VAZIA: soltar ali faz o ping comum.) Mudar o tipo de uma posição é trocar uma linha aqui.
 */
export const LADOS_DA_RODA_DE_PING: readonly (FormaEspecialDePing | null)[] = [
    "ajuda", // cima
    "alvo",
    "atacar",
    "avancar", // direita
    "investigar",
    "tesouro",
    "perigo", // baixo
    "armadilha",
    "recuar",
    "sumiu", // esquerda
    "agrupar",
    "cura",
];

export interface RodaDePing {
    /** O gesto começou no ponto (x, y) da JANELA (o Shift + botão acabou de ser apertado). */
    comecar(x: number, y: number): void;
    /** O mouse andou: abre a roda (depois de andar o bastante) e destaca o lado apontado. */
    apontar(x: number, y: number): void;
    /** Soltou o botão: fecha a roda e devolve o tipo de ping escolhido ("comum" se não arrastou ou soltou no meio); `null` se o gesto foi cancelado (Esc). */
    terminar(x: number, y: number): FormaDePing | null;
    /** O gesto está em andamento? */
    readonly ativa: boolean;
}

export function criarRodaPing(): RodaDePing {
    const roda = document.getElementById("roda-ping") as HTMLElement;

    // Os lados são criados aqui, um para cada tipo da lista, espalhados em círculo (cada um guarda o deslocamento a partir do centro em `--dx` e `--dy`).
    const passo = (Math.PI * 2) / LADOS_DA_RODA_DE_PING.length;
    LADOS_DA_RODA_DE_PING.forEach((forma, i) => {
        if (forma === null) return; // (posição vazia)
        const angulo = -Math.PI / 2 + i * passo; // (o lado 0 fica em cima)
        const lado = document.createElement("div");
        lado.className = "roda-setor";
        lado.dataset.forma = forma;
        lado.dataset.nome = DADOS_DAS_FORMAS_DE_PING[forma].nome;
        const dx = Math.cos(angulo) * RAIO_RODA_PING;
        const dy = Math.sin(angulo) * RAIO_RODA_PING;
        lado.style.setProperty("--dx", `${dx.toFixed(1)}px`);
        lado.style.setProperty("--dy", `${dy.toFixed(1)}px`);
        // O nome do lado escolhido aparece para FORA da roda: à direita nos lados da direita, à esquerda nos da esquerda e, nos do meio (cima e baixo), em cima ou embaixo.
        lado.classList.toggle("nome-direita", dx > 10);
        lado.classList.toggle("nome-esquerda", dx < -10);
        lado.classList.toggle("acima", Math.abs(dx) <= 10 && dy < 0);
        lado.append(criarIconeDePing(forma));
        roda.append(lado);
    });
    const lados = [...roda.querySelectorAll<HTMLElement>("[data-forma]")]; // (o centro, "comum", também entra aqui)

    let origem: { x: number; y: number } | null = null;
    let aberta = false;
    let cancelado = false;

    /** O tipo de ping para onde o mouse (x, y) aponta, em relação ao centro da roda. */
    function escolhaEm(x: number, y: number): FormaDePing {
        if (!origem) return "comum";
        const dx = x - origem.x;
        const dy = y - origem.y;
        if (Math.hypot(dx, dy) < PX_ZONA_MORTA_RODA_PING) return "comum";
        // O lado apontado: o ângulo (0 = cima, crescendo no sentido do relógio) dividido em fatias iguais, cada uma centrada em um lado.
        const graus = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
        const fatia = 360 / LADOS_DA_RODA_DE_PING.length;
        return LADOS_DA_RODA_DE_PING[Math.round(graus / fatia) % LADOS_DA_RODA_DE_PING.length] ?? "comum";
    }

    function destacar(forma: FormaDePing): void {
        for (const lado of lados) lado.classList.toggle("escolhido", lado.dataset.forma === forma);
    }

    function encerrar(): void {
        origem = null;
        aberta = false;
        roda.hidden = true;
    }

    // Esc cancela o gesto (soltar depois não faz nada); perder o foco da janela também.
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && origem) {
            cancelado = true;
            roda.hidden = true;
            aberta = false;
        }
    });
    window.addEventListener("blur", () => {
        if (origem) cancelado = true;
        roda.hidden = true;
        aberta = false;
    });

    return {
        get ativa() {
            return origem !== null;
        },
        comecar(x, y) {
            origem = { x, y };
            aberta = false;
            cancelado = false;
            roda.hidden = true;
        },
        apontar(x, y) {
            if (!origem || cancelado) return;
            if (!aberta && Math.hypot(x - origem.x, y - origem.y) >= PX_ABRIR_RODA_PING) {
                aberta = true;
                roda.style.left = `${origem.x}px`;
                roda.style.top = `${origem.y}px`;
                roda.hidden = false;
            }
            if (aberta) destacar(escolhaEm(x, y));
        },
        terminar(x, y) {
            const resultado = cancelado ? null : aberta ? escolhaEm(x, y) : "comum";
            encerrar();
            cancelado = false;
            return resultado;
        },
    };
}
