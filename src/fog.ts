// =====================================================================
// FOG (NÉVOA) DE GUERRA (código COMPARTILHADO entre navegador e servidor: sem DOM, sem PixiJS; imports com ".ts").
//
// O fog de um mapa é uma MÁSCARA de bits (1 = coberto, 0 = revelado) numa grade mais fina que a do tabuleiro: cada casa tem SUB_FOG × SUB_FOG pontinhos. Assim o mestre PINTA o fog
// livremente (pincel redondo de qualquer tamanho; pedido do dono, 17/11/2026) e a máscara continua pequena: um tabuleiro de 100 × 100 casas cabe em 80 KB (e um comum, de 30 × 20,
// em menos de 5 KB). O mesmo código pinta no navegador (na hora, para o mestre ver) e no servidor (que é o dono da verdade e guarda): pintar é determinístico.
//
// SÓ O MESTRE edita o fog (o servidor confere). O fog esconde o mapa, e o SERVIDOR também esconde dos jogadores as peças e os desenhos que estão sob o fog (ver servidor/visao.ts).
// =====================================================================

import { MAX_CASAS } from "./config.ts";

/** Quantos pontinhos de fog por lado de uma casa (8 × 8 = 64 por casa). */
export const SUB_FOG = 8;
/** O maior raio do pincel (em casas) e o máximo de pinceladas por pedido. */
export const RAIO_MAX_FOG = 20;
export const RAIO_MIN_FOG = 0.25;
export const MAX_TRACOS_FOG = 400;

export interface MascaraDeFog {
    colunas: number;
    linhas: number;
    /** 1 bit por pontinho, linha por linha (largura = colunas × SUB_FOG). */
    bits: Uint8Array;
}

/** Os formatos do pincel (os mesmos do painel de Desenho): círculo, quadrado e triângulo (com a ponta para cima). */
export type FormaDeFog = "circulo" | "quadrado" | "triangulo" | "retangulo"; // (o retângulo vem do modo "Área": arrastar uma caixa)
export const FORMAS_DE_FOG: readonly FormaDeFog[] = ["circulo", "quadrado", "triangulo", "retangulo"];

/** Uma pincelada: o centro (em casas, com fração), o "raio" (em casas: o círculo tem esse raio; o quadrado, metade do lado; o triângulo, metade da base e da altura), o formato e se COBRE ou REVELA. */
export interface TracoDeFog {
    x: number;
    y: number;
    raio: number;
    cobrir: boolean;
    /** Sem formato = círculo (as pinceladas antigas). */
    forma?: FormaDeFog;
    /** A METADE da altura (e `raio` é a metade da largura): o pincel pode ser mais largo que alto (elipse, retângulo, triângulo achatado). Sem ela, a altura é igual à largura. */
    raioY?: number;
    /** POR CASA (pedido do dono, 18/11/2026): a forma é feita de casas INTEIRAS, como os gabaritos de área de RPG (entra a casa cujo CENTRO está dentro do círculo ou do triângulo). Só vale com `x`/`y` alinhados à grade. */
    casas?: boolean;
}

/** Uma fileira de casas seguidas: a primeira casa (col, row) e quantas são. */
export interface FileiraDeCasas {
    col: number;
    row: number;
    largura: number;
}

const largura = (m: MascaraDeFog): number => m.colunas * SUB_FOG;
const altura = (m: MascaraDeFog): number => m.linhas * SUB_FOG;

/** Uma máscara nova, toda coberta (ou toda revelada). */
export function novaMascara(colunas: number, linhas: number, coberta: boolean): MascaraDeFog {
    const c = Math.min(MAX_CASAS, Math.max(1, Math.round(colunas)));
    const l = Math.min(MAX_CASAS, Math.max(1, Math.round(linhas)));
    const bits = new Uint8Array(Math.ceil((c * SUB_FOG * l * SUB_FOG) / 8));
    if (coberta) bits.fill(0xff);
    return { colunas: c, linhas: l, bits };
}

const pegarBit = (m: MascaraDeFog, px: number, py: number): boolean => {
    const i = py * largura(m) + px;
    return (m.bits[i >> 3] & (1 << (i & 7))) !== 0;
};
function pôrBit(m: MascaraDeFog, px: number, py: number, coberto: boolean): void {
    const i = py * largura(m) + px;
    if (coberto) m.bits[i >> 3] |= 1 << (i & 7);
    else m.bits[i >> 3] &= ~(1 << (i & 7));
}

/** Cobre ou revela TUDO. */
export function preencherMascara(m: MascaraDeFog, cobrir: boolean): void {
    m.bits.fill(cobrir ? 0xff : 0);
}

/** O ponto (dx, dy), relativo ao centro e em unidades de `r`, está dentro do formato? */
function dentroDaForma(forma: FormaDeFog | undefined, dx: number, dy: number, r: number, ry: number): boolean {
    if (forma === "retangulo" || forma === "quadrado") return Math.abs(dx) <= r && Math.abs(dy) <= ry;
    if (forma === "triangulo") return dy >= -ry && dy <= ry && Math.abs(dx) <= (r * (dy + ry)) / (2 * ry); // (a ponta em cima, a base embaixo)
    return (dx * dx) / (r * r) + (dy * dy) / (ry * ry) <= 1; // (círculo, ou elipse se a altura for diferente)
}

/**
 * A forma feita de CASAS INTEIRAS: centro (x, y) e metades (raio, raioY), tudo em casas. Entra a casa cujo CENTRO cai dentro da forma (a regra dos gabaritos de D&D: um círculo de 4 × 4
 * casas perde os 4 cantos). Devolve fileiras de casas seguidas, de cima para baixo (poucas para desenhar, e é o que o servidor e o navegador pintam).
 */
export function casasDaForma(forma: FormaDeFog | undefined, x: number, y: number, raio: number, raioY: number = raio): FileiraDeCasas[] {
    const fileiras: FileiraDeCasas[] = [];
    for (let row = Math.floor(y - raioY); row < Math.ceil(y + raioY); row++) {
        let atual: FileiraDeCasas | null = null;
        for (let col = Math.floor(x - raio); col < Math.ceil(x + raio); col++) {
            if (!dentroDaForma(forma, col + 0.5 - x, row + 0.5 - y, raio, raioY)) {
                atual = null;
            } else if (atual) {
                atual.largura++;
            } else {
                atual = { col, row, largura: 1 };
                fileiras.push(atual);
            }
        }
    }
    return fileiras;
}

/** Um pedaço reto (horizontal ou vertical) do contorno de uma forma de casas, em casas. */
export interface SegmentoDeContorno {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * O CONTORNO EXTERNO de uma forma de casas (pedido do dono, 18/11/2026: sem as linhas de dentro): só os lados de casa que dão para FORA da forma, com os que estão em linha juntados
 * num segmento só. Um círculo de 2 × 2 casas devolve 4 segmentos (o quadrado de fora), e não as linhas que separam as casas.
 */
export function contornoDasCasas(fileiras: readonly FileiraDeCasas[]): SegmentoDeContorno[] {
    const tem = new Set<string>();
    for (const f of fileiras) for (let c = f.col; c < f.col + f.largura; c++) tem.add(`${c},${f.row}`);
    const horizontais = new Map<number, number[]>(); // y -> os x (casas) que têm um lado de fora nessa altura
    const verticais = new Map<number, number[]>(); // x -> os y (casas) que têm um lado de fora nessa coluna
    const somar = (mapa: Map<number, number[]>, chave: number, valor: number): void => {
        const lista = mapa.get(chave);
        if (lista) lista.push(valor);
        else mapa.set(chave, [valor]);
    };
    for (const f of fileiras) {
        for (let c = f.col; c < f.col + f.largura; c++) {
            if (!tem.has(`${c},${f.row - 1}`)) somar(horizontais, f.row, c); // (lado de cima)
            if (!tem.has(`${c},${f.row + 1}`)) somar(horizontais, f.row + 1, c); // (lado de baixo)
            if (!tem.has(`${c - 1},${f.row}`)) somar(verticais, c, f.row); // (lado esquerdo)
            if (!tem.has(`${c + 1},${f.row}`)) somar(verticais, c + 1, f.row); // (lado direito)
        }
    }
    const segmentos: SegmentoDeContorno[] = [];
    const juntar = (mapa: Map<number, number[]>, horizontal: boolean): void => {
        for (const [fixo, lista] of mapa) {
            lista.sort((a, b) => a - b);
            let inicio = lista[0];
            let fim = lista[0];
            const fechar = (): void => {
                segmentos.push(horizontal ? { x1: inicio, y1: fixo, x2: fim + 1, y2: fixo } : { x1: fixo, y1: inicio, x2: fixo, y2: fim + 1 });
            };
            for (let i = 1; i < lista.length; i++) {
                if (lista[i] === fim + 1) fim = lista[i];
                else {
                    fechar();
                    inicio = fim = lista[i];
                }
            }
            fechar();
        }
    };
    juntar(horizontais, true);
    juntar(verticais, false);
    return segmentos;
}

/** Pinta (ou limpa) as casas INTEIRAS da forma, sem cortar nenhuma ao meio. Casas fora do tabuleiro são ignoradas. */
function pintarCasas(m: MascaraDeFog, t: TracoDeFog): void {
    for (const f of casasDaForma(t.forma, t.x, t.y, t.raio, t.raioY ?? t.raio)) {
        if (f.row < 0 || f.row >= m.linhas) continue;
        const col0 = Math.max(0, f.col);
        const col1 = Math.min(m.colunas, f.col + f.largura);
        for (let py = f.row * SUB_FOG; py < (f.row + 1) * SUB_FOG; py++) {
            for (let px = col0 * SUB_FOG; px < col1 * SUB_FOG; px++) pôrBit(m, px, py, t.cobrir);
        }
    }
}

/** Aplica uma pincelada (círculo, quadrado ou triângulo). Pontos fora do tabuleiro são ignorados. */
export function pintarTraco(m: MascaraDeFog, t: TracoDeFog): void {
    if (t.casas) return pintarCasas(m, t);
    const cx = t.x * SUB_FOG;
    const cy = t.y * SUB_FOG;
    const r = t.raio * SUB_FOG;
    const ry = (t.raioY ?? t.raio) * SUB_FOG;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(largura(m) - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(altura(m) - 1, Math.ceil(cy + ry));
    for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
            const dx = px + 0.5 - cx;
            const dy = py + 0.5 - cy;
            if (dentroDaForma(t.forma, dx, dy, r, ry)) pôrBit(m, px, py, t.cobrir);
        }
    }
}

/** O ponto (col, row), em casas e com fração, está COBERTO pelo fog? Fora da máscara conta como coberto. */
export function cobertoEm(m: MascaraDeFog, col: number, row: number): boolean {
    const px = Math.floor(col * SUB_FOG);
    const py = Math.floor(row * SUB_FOG);
    if (px < 0 || py < 0 || px >= largura(m) || py >= altura(m)) return true;
    return pegarBit(m, px, py);
}

/** Confere uma pincelada que veio de FORA (um pedido da rede): números finitos, raio dentro do limite. null se não vale. */
export function limparTraco(bruto: unknown): TracoDeFog | null {
    if (typeof bruto !== "object" || bruto === null) return null;
    const t = bruto as Record<string, unknown>;
    const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    if (!n(t.x) || !n(t.y) || !n(t.raio) || typeof t.cobrir !== "boolean") return null;
    if (Math.abs(t.x) > MAX_CASAS + RAIO_MAX_FOG || Math.abs(t.y) > MAX_CASAS + RAIO_MAX_FOG) return null;
    if (t.forma !== undefined && !FORMAS_DE_FOG.includes(t.forma as FormaDeFog)) return null;
    const forma = (t.forma as FormaDeFog | undefined) ?? "circulo";
    const teto = forma === "retangulo" ? MAX_CASAS : RAIO_MAX_FOG; // (uma área arrastada pode ser grande)
    const lado = (v: number): number => Math.min(teto, Math.max(RAIO_MIN_FOG, Math.round(v * 100) / 100));
    const saida: TracoDeFog = { x: Math.round(t.x * 100) / 100, y: Math.round(t.y * 100) / 100, raio: lado(t.raio), cobrir: t.cobrir, forma };
    if (forma === "retangulo" && !n(t.raioY)) return null;
    if (n(t.raioY)) saida.raioY = lado(t.raioY);
    if (t.casas === true && forma !== "retangulo") saida.casas = true; // (a caixa arrastada da "Área" não é por casa)
    return saida;
}

// ---------------------------------------------------------------------
// Texto (base64): como a máscara vai pela rede e para o disco. Escrito à mão porque o navegador e o Node têm funções diferentes para isso.
// ---------------------------------------------------------------------

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function mascaraParaTexto(m: MascaraDeFog): string {
    let saida = "";
    const b = m.bits;
    for (let i = 0; i < b.length; i += 3) {
        const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
        saida += LETRAS[(n >> 18) & 63] + LETRAS[(n >> 12) & 63] + (i + 1 < b.length ? LETRAS[(n >> 6) & 63] : "=") + (i + 2 < b.length ? LETRAS[n & 63] : "=");
    }
    return saida;
}

/** Lê o texto de volta. Devolve null se o tamanho não bate com `colunas` × `linhas` ou se há caracteres que não são base64. */
export function mascaraDoTexto(colunas: number, linhas: number, texto: unknown): MascaraDeFog | null {
    if (typeof texto !== "string" || !Number.isSafeInteger(colunas) || !Number.isSafeInteger(linhas) || colunas < 1 || linhas < 1 || colunas > MAX_CASAS || linhas > MAX_CASAS) return null;
    const esperado = Math.ceil((colunas * SUB_FOG * linhas * SUB_FOG) / 8);
    if (texto.length > Math.ceil(esperado / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) return null;
    const bits = new Uint8Array(esperado);
    let saida = 0;
    for (let i = 0; i < texto.length; i += 4) {
        const v = [0, 1, 2, 3].map((k) => (texto[i + k] === "=" || texto[i + k] === undefined ? 0 : LETRAS.indexOf(texto[i + k])));
        const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
        const faltam = (texto[i + 2] === "=" ? 2 : 0) || (texto[i + 3] === "=" ? 1 : 0);
        for (const byte of [(n >> 16) & 255, (n >> 8) & 255, n & 255].slice(0, 3 - faltam)) if (saida < esperado) bits[saida++] = byte;
    }
    return saida === esperado ? { colunas, linhas, bits } : null;
}
