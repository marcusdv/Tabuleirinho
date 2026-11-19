// =====================================================================
// ÁREAS DE EFEITO (cone, linha, esfera, cubo e emanação): a geometria PURA (sem PixiJS, sem HTML), COMPARTILHADA com o servidor, que confere o que chega da rede.
// Todas as medidas são em CASAS (1 casa = 1,5 m). Uma área é guardada só pelos seus PARÂMETROS (`DadosDaArea`); as casas que ela cobre são CALCULADAS aqui (`casasDaArea`),
// sempre do mesmo jeito, para todo mundo ver a mesma coisa.
// O FORMATO segue os gabaritos dos livros (as imagens de referência do dono, 19/11/2026): as distâncias contam a DIAGONAL como 1,5 casa ("5-10-5": a 1ª diagonal vale 1 casa, a 2ª vale 2...),
// o que faz o círculo virar um OCTÓGONO ("+" gordo) e o cone ortogonal virar um LOSANGO:
//   esfera    octógono ao redor de um ponto (o centro); o tamanho é o RAIO (5 pés = 2×2 casas com o centro num cruzamento, 10 pés = 4×4 sem os cantos...)
//   cone      um leque de 90° a partir da ponta, cortado pela distância: na ortogonal vira um losango, na diagonal um triângulo de cantos abaulados. A ponta não entra.
//   linha     reta de 1 casa de largura a partir de uma ponta; na diagonal alcança menos casas (60 pés na diagonal ≈ 8 casas). A casa de quem lança não entra.
//   cubo      um quadrado de lado N com uma face (ou um canto) na origem.
//   emanação  sai do CORPO da criatura (um bloco de 1×1 a 4×4 casas) em todas as direções: um Médio de 5 pés = 3×3 casas, de 10 pés = 5×5 sem os cantos. O corpo também é pintado.
// PREENCHIMENTO POR CASA (pedido do dono, 19/11/2026): uma casa entra na área quando o CENTRO dela está dentro da forma. Assim a área sempre é feita de casas inteiras.
// =====================================================================

import { ALFA_MAX_EMANACAO, ALFA_MIN_EMANACAO, FORMAS_DE_AREA, LIMITE_COORDENADA_DESENHO, MAX_EMANACAO_TOKEN, MAX_TAMANHO_AREA, MAX_TAMANHO_DA_CRIATURA_NA_AREA, METROS_POR_CASA } from "./config.ts";

export { FORMAS_DE_AREA };
export type FormaDeArea = (typeof FORMAS_DE_AREA)[number];

/** Os parâmetros de uma área (é tudo o que viaja pela rede e vai para o arquivo). */
export interface DadosDaArea {
    forma: FormaDeArea;
    /** A origem, em casas (pode ter fração). Na emanação é o canto superior esquerdo do corpo da criatura (números inteiros). */
    x: number;
    y: number;
    /** A direção, em radianos (0 = para a direita, π/2 = para baixo). Só vale para cone, linha e cubo. */
    angulo: number;
    /** O tamanho: comprimento (cone e linha), raio (esfera), lado (cubo) ou alcance (emanação), em casas inteiras. */
    casas: number;
    /** O lado do corpo da criatura, em casas (1 a 4). Só vale para a emanação. */
    bloco: number;
}

export interface CasaDaArea {
    col: number;
    row: number;
}

/** Uma folga minúscula para os testes "dentro da forma" não falharem por arredondamento de ponto flutuante. */
const FOLGA = 1e-6;

/** Quantas casas valem estes metros (arredondado; pelo menos 1 e no máximo MAX_TAMANHO_AREA). */
export function metrosParaCasas(metros: number): number {
    if (!Number.isFinite(metros)) return 1;
    return Math.min(MAX_TAMANHO_AREA, Math.max(1, Math.round(metros / METROS_POR_CASA)));
}

/** Os metros de N casas, como número. */
export const casasParaMetros = (casas: number): number => casas * METROS_POR_CASA;

/**
 * O PONTO DE ORIGEM que o mouse (em casas, com fração) escolhe, já ENCAIXADO na grade:
 *   linha     no centro da casa (a linha passa pelo meio das casas)
 *   cone, esfera e cubo   no centro, na borda ou no canto mais próximos (de meia em meia casa): num canto o cone sai "da quina" (diagonal), no meio da borda sai "de frente" (ortogonal)
 *   emanação  na casa sob o mouse (o canto superior esquerdo dela)
 */
export function encaixarOrigem(forma: FormaDeArea, ponto: { x: number; y: number }): { x: number; y: number } {
    const meia = (v: number): number => Math.round(v * 2) / 2;
    switch (forma) {
        case "linha":
            return { x: Math.floor(ponto.x) + 0.5, y: Math.floor(ponto.y) + 0.5 };
        case "emanacao":
            return { x: Math.floor(ponto.x), y: Math.floor(ponto.y) };
        default:
            return { x: meia(ponto.x), y: meia(ponto.y) };
    }
}

/** A direção (em radianos) da origem até o mouse; `anterior` é mantida quando o mouse está em cima da origem (sem direção). */
export function direcaoAte(origem: { x: number; y: number }, ponto: { x: number; y: number }, anterior = 0): number {
    const dx = ponto.x - origem.x;
    const dy = ponto.y - origem.y;
    return Math.hypot(dx, dy) < 0.15 ? anterior : Math.atan2(dy, dx);
}

/** Esta forma precisa de uma DIREÇÃO escolhida com o mouse (2 cliques)? As outras são colocadas com um clique só. */
export const precisaDeDirecao = (forma: FormaDeArea): boolean => forma === "cone" || forma === "linha" || forma === "cubo";

/**
 * A caixa (em casas, de canto a canto) do CUBO: o lado `casas`, alinhada à grade. A direção (de 45° em 45°) decide como ele toca a origem: nas direções retas uma FACE fica na origem (e o cubo
 * fica centrado nela); nas diagonais é um CANTO. O cubo sempre começa na borda da casa e fica FORA da casa da origem (com a origem no centro de uma casa, ele começa na borda dessa casa).
 */
export function caixaDoCubo(area: DadosDaArea): { x0: number; y0: number; x1: number; y1: number } {
    const s = area.casas;
    const oito = (((Math.round(area.angulo / (Math.PI / 4)) % 8) + 8) % 8); // 0 = direita, 1 = baixo-direita, 2 = baixo... (de 45° em 45°)
    // Onde o cubo COMEÇA ao avançar para a direita/baixo (o primeiro cruzamento à frente da origem) e onde TERMINA ao ir para a esquerda/cima (o último atrás dela).
    const depoisX = Math.ceil(area.x - FOLGA);
    const depoisY = Math.ceil(area.y - FOLGA);
    const antesX = Math.floor(area.x + FOLGA);
    const antesY = Math.floor(area.y + FOLGA);
    const meioX = Math.round(area.x - s / 2); // (nas direções retas, o cubo fica centrado na face que toca a origem)
    const meioY = Math.round(area.y - s / 2);
    switch (oito) {
        case 0: return { x0: depoisX, y0: meioY, x1: depoisX + s, y1: meioY + s }; // →
        case 1: return { x0: depoisX, y0: depoisY, x1: depoisX + s, y1: depoisY + s }; // ↘
        case 2: return { x0: meioX, y0: depoisY, x1: meioX + s, y1: depoisY + s }; // ↓
        case 3: return { x0: antesX - s, y0: depoisY, x1: antesX, y1: depoisY + s }; // ↙
        case 4: return { x0: antesX - s, y0: meioY, x1: antesX, y1: meioY + s }; // ←
        case 5: return { x0: antesX - s, y0: antesY - s, x1: antesX, y1: antesY }; // ↖
        case 6: return { x0: meioX, y0: antesY - s, x1: meioX + s, y1: antesY }; // ↑
        default: return { x0: depoisX, y0: antesY - s, x1: depoisX + s, y1: antesY }; // ↗
    }
}

/** A distância no padrão dos livros ("5-10-5"): a diagonal vale 1,5 casa, então o círculo vira um octógono. `dx` e `dy` em casas (com fração). */
export const distanciaOctogonal = (dx: number, dy: number): number => {
    const a = Math.abs(dx);
    const b = Math.abs(dy);
    return Math.max(a, b) + Math.min(a, b) / 2;
};

/** Os testes "o centro desta casa está dentro?" de cada forma, dados os parâmetros. (cx, cy) é o centro da casa, em casas. */
function dentroDe(area: DadosDaArea): (cx: number, cy: number) => boolean {
    const { x, y, casas } = area;
    switch (area.forma) {
        case "circulo":
            return (cx, cy) => distanciaOctogonal(cx - x, cy - y) <= casas + FOLGA;
        case "cone": {
            const ux = Math.cos(area.angulo);
            const uy = Math.sin(area.angulo);
            return (cx, cy) => {
                const dx = cx - x;
                const dy = cy - y;
                const ao_longo = dx * ux + dy * uy; // quanto avançou na direção do cone
                const de_lado = Math.abs(dx * uy - dy * ux); // quanto se afastou do eixo
                // O leque tem 90° (de lado ≤ ao longo) e a distância corta o fundo: assim o cone ortogonal vira um losango e o diagonal, um triângulo abaulado.
                return ao_longo > FOLGA && de_lado <= ao_longo + FOLGA && distanciaOctogonal(dx, dy) <= casas + FOLGA;
            };
        }
        case "linha": {
            const ux = Math.cos(area.angulo);
            const uy = Math.sin(area.angulo);
            return (cx, cy) => {
                const dx = cx - x;
                const dy = cy - y;
                const ao_longo = dx * ux + dy * uy;
                const de_lado = Math.abs(dx * uy - dy * ux);
                return ao_longo > 0.5 + FOLGA && de_lado <= 0.5 + FOLGA && distanciaOctogonal(dx, dy) <= casas + FOLGA; // (a casa de quem lança, no começo, fica de fora)
            };
        }
        case "cubo": {
            const c = caixaDoCubo(area);
            return (cx, cy) => cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1;
        }
        case "emanacao": {
            // Quantas casas a casa (col, row) está para fora do corpo da criatura em cada eixo (0 = dentro do corpo naquele eixo); a distância é a "5-10-5" inteira.
            const b = area.bloco;
            return (cx, cy) => {
                const col = Math.floor(cx);
                const row = Math.floor(cy);
                const kx = col < x ? x - col : col > x + b - 1 ? col - (x + b - 1) : 0;
                const ky = row < y ? y - row : row > y + b - 1 ? row - (y + b - 1) : 0;
                return Math.max(kx, ky) + Math.floor(Math.min(kx, ky) / 2) <= casas;
            };
        }
    }
}

/** As casas que a área cobre (com a regra "o centro da casa está dentro"), de cima para baixo e da esquerda para a direita. Só casas de coordenada ≥ 0 (o mapa não tem casas negativas). */
export function casasDaArea(area: DadosDaArea): CasaDaArea[] {
    // A caixa onde olhar: o alcance da forma em volta da origem (com 1 casa de folga).
    const alcance = area.casas + (area.forma === "emanacao" ? area.bloco : 0) + 1;
    const dentro = dentroDe(area);
    const resultado: CasaDaArea[] = [];
    const rowIni = Math.max(0, Math.floor(area.y - alcance));
    const rowFim = Math.ceil(area.y + alcance);
    const colIni = Math.max(0, Math.floor(area.x - alcance));
    const colFim = Math.ceil(area.x + alcance);
    for (let row = rowIni; row <= rowFim; row++) {
        for (let col = colIni; col <= colFim; col++) if (dentro(col + 0.5, row + 0.5)) resultado.push({ col, row });
    }
    return resultado;
}

/** Confere uma área que veio de FORA (pedido da rede ou arquivo): devolve só os campos conhecidos, ou null se qualquer coisa estiver errada. Nunca lança erro. */
export function limparDadosDaArea(bruto: unknown): DadosDaArea | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const a = bruto as Record<string, unknown>;
    const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LIMITE_COORDENADA_DESENHO;
    if (!(FORMAS_DE_AREA as readonly unknown[]).includes(a.forma)) return null;
    if (!numero(a.x) || !numero(a.y) || !numero(a.angulo) || Math.abs(a.angulo) > 100) return null;
    if (!Number.isInteger(a.casas) || (a.casas as number) < 1 || (a.casas as number) > MAX_TAMANHO_AREA) return null;
    if (!Number.isInteger(a.bloco) || (a.bloco as number) < 1 || (a.bloco as number) > MAX_TAMANHO_DA_CRIATURA_NA_AREA) return null;
    return { forma: a.forma as FormaDeArea, x: a.x, y: a.y, angulo: Math.round(a.angulo * 1000) / 1000, casas: a.casas as number, bloco: a.bloco as number };
}

/**
 * A BORDA de um conjunto de casas, como laços fechados de vértices (em casas): cada lado de casa que NÃO tem vizinha da área vira uma aresta (percorrida no sentido horário, com a área à direita) e as
 * arestas são ligadas ponta com ponta. Os vértices alinhados são fundidos (um lado reto vira um segmento só). Onde duas casas se tocam só pelo canto, a borda pode se dividir em dois laços: tudo bem.
 */
export function lacosDoContorno(casas: { col: number; row: number }[], tem: (col: number, row: number) => boolean): [number, number][][] {
    const saidas = new Map<string, [number, number][]>(); // vértice -> para onde saem as arestas dele
    const adicionar = (x0: number, y0: number, x1: number, y1: number): void => {
        const chave = `${x0},${y0}`;
        const lista = saidas.get(chave);
        if (lista) lista.push([x1, y1]);
        else saidas.set(chave, [[x1, y1]]);
    };
    for (const { col, row } of casas) {
        if (!tem(col, row - 1)) adicionar(col, row, col + 1, row); // em cima: da esquerda para a direita
        if (!tem(col + 1, row)) adicionar(col + 1, row, col + 1, row + 1); // à direita: de cima para baixo
        if (!tem(col, row + 1)) adicionar(col + 1, row + 1, col, row + 1); // embaixo: da direita para a esquerda
        if (!tem(col - 1, row)) adicionar(col, row + 1, col, row); // à esquerda: de baixo para cima
    }
    const lacos: [number, number][][] = [];
    for (const [chaveInicial, primeiras] of saidas) {
        while (primeiras.length > 0) {
            const [x0, y0] = chaveInicial.split(",").map(Number);
            const laco: [number, number][] = [[x0, y0]];
            let atual: [number, number] = primeiras.shift() as [number, number];
            while (`${atual[0]},${atual[1]}` !== chaveInicial) {
                laco.push(atual);
                const proximas = saidas.get(`${atual[0]},${atual[1]}`);
                const proxima = proximas?.shift();
                if (!proxima) break; // (não acontece: toda borda fecha)
                atual = proxima;
            }
            // Funde os vértices alinhados: só ficam os cantos.
            const cantos = laco.filter((v, i) => {
                const antes = laco[(i + laco.length - 1) % laco.length];
                const depois = laco[(i + 1) % laco.length];
                return (v[0] - antes[0]) * (depois[1] - v[1]) !== (v[1] - antes[1]) * (depois[0] - v[0]);
            });
            if (cantos.length >= 3) lacos.push(cantos);
        }
    }
    return lacos;
}

/** A chave de uma casa, para guardar num `Set` (as colunas e linhas cabem em 512). */
export const chaveDaCasa = (col: number, row: number): number => col * 512 + row;

/** Faz o `Set` de casas de uma área (para o contorno e para a borracha). */
export const conjuntoDeCasas = (casas: CasaDaArea[]): Set<number> => new Set(casas.map((c) => chaveDaCasa(c.col, c.row)));

/** A EMANAÇÃO DE UM TOKEN: ele emana uma área (como as formas acima, `emanacao`) a partir do corpo dele, na cor e na transparência escolhidas. `null` no token = não emana. */
export interface EmanacaoDoToken {
    /** O alcance, em casas inteiras (1 = 1,5 m). */
    casas: number;
    /** A cor (0xRRGGBB). */
    cor: number;
    /** A opacidade do preenchimento (ALFA_MIN_EMANACAO a ALFA_MAX_EMANACAO; menor = mais transparente). */
    alfa: number;
}

/** Confere uma emanação que veio de FORA (pedido da rede ou arquivo): devolve só os campos conhecidos, ou null se algo estiver errado. Nunca lança erro. */
export function limparEmanacao(bruto: unknown): EmanacaoDoToken | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const e = bruto as Record<string, unknown>;
    if (!Number.isInteger(e.casas) || (e.casas as number) < 1 || (e.casas as number) > MAX_EMANACAO_TOKEN) return null;
    if (!Number.isInteger(e.cor) || (e.cor as number) < 0 || (e.cor as number) > 0xffffff) return null;
    if (typeof e.alfa !== "number" || !Number.isFinite(e.alfa)) return null;
    const alfa = Math.min(ALFA_MAX_EMANACAO, Math.max(ALFA_MIN_EMANACAO, Math.round(e.alfa * 100) / 100)); // (a transparência fora da faixa é puxada para dentro dela)
    return { casas: e.casas as number, cor: e.cor as number, alfa };
}

/** Os parâmetros da ÁREA que o token emana (para `casasDaArea`): o corpo dele (canto e lado) e o alcance. */
export const areaDaEmanacao = (token: { col: number; row: number; size: number }, emanacao: EmanacaoDoToken): DadosDaArea => ({
    forma: "emanacao",
    x: token.col,
    y: token.row,
    angulo: 0,
    casas: emanacao.casas,
    bloco: token.size,
});
