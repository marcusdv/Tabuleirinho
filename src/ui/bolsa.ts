// =====================================================================
// BOLSA (HTML): um painel no canto inferior direito onde se GUARDAM tokens.
//   - Arrastar um token do tabuleiro até aqui e soltar o guarda (ele some do mapa).
//   - Arrastar uma fichinha daqui para o mapa coloca o token na casa onde soltar.
//
// O arrasto de um token do mapa é do PixiJS (tokens.ts). Este módulo cuida do
// painel e do arrasto que COMEÇA aqui: como o clique começa num elemento HTML,
// acompanhamos o mouse pelo documento e repassamos ao tokens.ts por callbacks.
// A marcação e o CSS ficam no index.html.
// =====================================================================

import type { PointData } from "pixi.js";
import { estado } from "../estado";

export interface OpcoesBolsa {
    /**
     * O usuário apertou o mouse numa fichinha: começar a arrastar aquele token.
     * Devolve false se não for possível agora (a bolsa então não acompanha o mouse).
     */
    aoComecarArrasto(id: number, ponto: PointData): boolean;
    /** O mouse andou durante o arrasto (ponto na TELA). */
    aoArrastar(ponto: PointData): void;
    /** O usuário soltou o botão do mouse. */
    aoSoltar(): void;
}

export interface Bolsa {
    /** Refaz a lista de fichinhas conforme os tokens guardados no estado. */
    atualizar(): void;
    /** O ponto da TELA está em cima da bolsa? */
    contem(ponto: PointData): boolean;
    /** Liga/desliga o destaque "pode soltar aqui". */
    marcarAlvo(sobre: boolean): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarBolsa(opcoes: OpcoesBolsa): Bolsa {
    const bolsa = pegar("bolsa");
    const itens = pegar("bolsa-itens");
    const vazia = pegar("bolsa-vazia");
    const contagem = pegar("bolsa-contagem");

    /** Cor numérica (0xe74c3c) para texto CSS ("#e74c3c"). */
    const corCss = (cor: number): string => `#${cor.toString(16).padStart(6, "0")}`;

    /** Acompanha o mouse pelo documento até soltar (o clique começou fora do canvas). */
    function acompanhar(): void {
        const mover = (e: PointerEvent): void => opcoes.aoArrastar({ x: e.clientX, y: e.clientY });
        const terminar = (): void => {
            document.removeEventListener("pointermove", mover);
            document.removeEventListener("pointerup", terminar);
            document.removeEventListener("pointercancel", terminar);
            opcoes.aoSoltar();
        };
        document.addEventListener("pointermove", mover);
        document.addEventListener("pointerup", terminar);
        document.addEventListener("pointercancel", terminar);
    }

    function atualizar(): void {
        const guardados = estado.tokens.filter((t) => t.guardado);
        contagem.textContent = guardados.length > 0 ? `(${guardados.length})` : "";
        vazia.hidden = guardados.length > 0;

        itens.replaceChildren(
            ...guardados.map((token) => {
                const ficha = document.createElement("button");
                ficha.className = "ficha";
                ficha.title = `Token ${token.id} (${token.size}×${token.size}): arraste para o mapa`;
                ficha.setAttribute("aria-label", `Token ${token.id}, ${token.size} por ${token.size}`);

                const disco = document.createElement("span");
                disco.className = "disco";
                disco.style.background = corCss(token.cor);
                const tamanho = document.createElement("small");
                tamanho.textContent = `${token.size}×${token.size}`;
                ficha.append(disco, tamanho);

                ficha.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0) return; // só o botão esquerdo
                    e.preventDefault(); // sem selecionar texto nem arrastar a "imagem" do botão
                    if (opcoes.aoComecarArrasto(token.id, { x: e.clientX, y: e.clientY })) acompanhar();
                });
                return ficha;
            }),
        );
    }

    atualizar();

    return {
        atualizar,
        contem(ponto) {
            const r = bolsa.getBoundingClientRect();
            return ponto.x >= r.left && ponto.x <= r.right && ponto.y >= r.top && ponto.y <= r.bottom;
        },
        marcarAlvo(sobre) {
            bolsa.classList.toggle("alvo", sobre);
        },
    };
}
