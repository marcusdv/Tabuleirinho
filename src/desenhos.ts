// =====================================================================
// DESENHOS: geometria pura das pinturas e da régua (sem PixiJS, sem HTML).
// Todas as medidas estão em CASAS, como no estado.
// =====================================================================

import { METROS_POR_CASA } from "./config.ts";
import type { Desenho, Ponto } from "./estado.ts";

/** Distância do ponto `p` ao segmento de `a` até `b`. */
function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const quadrado = dx * dx + dy * dy;
    // t = onde a projeção de p cai no segmento (0 = em a, 1 = em b), limitado ao segmento.
    const t = quadrado === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / quadrado));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Uma caixa: canto superior esquerdo (x,y), largura e altura (em casas). */
interface Caixa {
    x: number;
    y: number;
    largura: number;
    altura: number;
}

/** Os 3 vértices do triângulo de um desenho: ponta em cima (no meio) e base embaixo. */
export function verticesDoTriangulo(d: Caixa): Ponto[] {
    return [
        { x: d.x + d.largura / 2, y: d.y }, // ponta
        { x: d.x, y: d.y + d.altura }, // base à esquerda
        { x: d.x + d.largura, y: d.y + d.altura }, // base à direita
    ];
}

/** Quantos lados tem o polígono que representa a elipse ao testar a borracha (mais lados = mais exato). */
const LADOS_DA_ELIPSE = 64;

/**
 * O CONTORNO de uma forma, como uma lista de vértices que se fecha no primeiro.
 * Para a elipse é uma aproximação com vários lados, boa o bastante para a borracha.
 */
function contornoDaForma(d: Extract<Desenho, { largura: number }>): Ponto[] {
    switch (d.tipo) {
        case "retangulo":
            return [
                { x: d.x, y: d.y },
                { x: d.x + d.largura, y: d.y },
                { x: d.x + d.largura, y: d.y + d.altura },
                { x: d.x, y: d.y + d.altura },
            ];
        case "triangulo":
            return verticesDoTriangulo(d);
        case "elipse": {
            const cx = d.x + d.largura / 2;
            const cy = d.y + d.altura / 2;
            return Array.from({ length: LADOS_DA_ELIPSE }, (_, k) => {
                const angulo = (2 * Math.PI * k) / LADOS_DA_ELIPSE;
                return { x: cx + (Math.cos(angulo) * d.largura) / 2, y: cy + (Math.sin(angulo) * d.altura) / 2 };
            });
        }
    }
}

/** Meia espessura do traço, em casas, somada à folga ao testar a borracha. */
const MEIA_ESPESSURA = 0.04;

/**
 * A borracha, com centro em `p` e alcance `folga` (casas), toca neste desenho?
 * Em todos os casos é preciso chegar perto da LINHA (as formas são só contorno: tocar no
 * meio vazio de uma forma não a apaga).
 */
export function desenhoAtingido(d: Desenho, p: Ponto, folga: number): boolean {
    const alcance = folga + MEIA_ESPESSURA;

    if (d.tipo === "livre") {
        if (d.pontos.length === 1) return Math.hypot(p.x - d.pontos[0].x, p.y - d.pontos[0].y) <= alcance;
        for (let i = 1; i < d.pontos.length; i++) {
            if (distanciaAoSegmento(p, d.pontos[i - 1], d.pontos[i]) <= alcance) return true;
        }
        return false;
    }

    // Formas: testa cada lado do contorno (o último vértice liga de volta ao primeiro).
    const vertices = contornoDaForma(d);
    for (let i = 0; i < vertices.length; i++) {
        if (distanciaAoSegmento(p, vertices[i], vertices[(i + 1) % vertices.length]) <= alcance) return true;
    }
    return false;
}

/**
 * Distância da régua entre duas casas, em casas. A diagonal conta como UMA casa
 * (a maior diferença entre colunas e linhas), a regra básica do D&D.
 */
export function distanciaEmCasas(col0: number, row0: number, col1: number, row1: number): number {
    return Math.max(Math.abs(col1 - col0), Math.abs(row1 - row0));
}

/** Texto da régua, ex.: "4 □ = 6 m" ou "3 □ = 4,5 m" (□ = casas; m = metros). */
export function textoDaDistancia(casas: number): string {
    const metros = (casas * METROS_POR_CASA).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    return `${casas} □ = ${metros} m`;
}
