// =====================================================================
// COORDENADAS: funções PURAS (só números entram, só números saem).
// Não dependem do PixiJS nem do navegador, então podem ser testadas
// sozinhas e, no futuro, reaproveitadas no servidor.
// =====================================================================

import {
    ESPACO_ICONES,
    MARGEM_ICONES_RODAPE,
    ICONE_CONDICAO_BASE,
    ICONE_CONDICAO_POR_CASA,
    MAX_CASAS,
    MIN_CASAS,
    MARGEM_LIVRE_CAMERA,
    PX_POR_CASA_ESTIMADO,
    TAMANHO_CASA,
    TAMANHOS_DE_CASA_COMUNS,
    TOLERANCIA_PX_GRADE,
} from "./config.ts";

/** Limita um valor ao intervalo [min, max]. */
export function limitar(valor: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, valor));
}

/**
 * Descobre, em UM eixo, a casa do CANTO SUPERIOR ESQUERDO onde um token deve
 * encaixar, a partir do pixel do seu CENTRO.
 *   centro        = pixel do centro do token (x ou y, em coordenadas do mundo)
 *   size          = quantas casas o token ocupa (1, 2, 3 ou 4)
 *   totalDeCasas  = colunas (eixo x) ou linhas (eixo y) do tabuleiro
 *
 * Por que não "a casa que contém o centro"? Num token 2x2 o centro cai em cima
 * de uma LINHA da grade, não dentro de uma casa. Já o canto superior esquerdo
 * é sempre um ponto de grade: arredondamos para a linha mais próxima.
 */
export function casaMaisProxima(centro: number, size: number, totalDeCasas: number): number {
    const canto = centro - (size * TAMANHO_CASA) / 2; // pixel do canto superior/esquerdo
    // O maior valor permitido é (total - size): o token tem que caber INTEIRO.
    return limitar(Math.round(canto / TAMANHO_CASA), 0, totalDeCasas - size);
}

/** Diâmetro (px) do ícone de condição para um token de `size` x `size` casas. */
export function diametroDoIcone(size: number): number {
    return TAMANHO_CASA * (ICONE_CONDICAO_BASE + ICONE_CONDICAO_POR_CASA * size);
}

/**
 * Quantos ícones de condição cabem no RODAPÉ de um tile de `size` x `size` casas (um ao lado do outro, com ESPACO_ICONES entre eles e MARGEM_ICONES_RODAPE nas pontas). Sempre pelo menos 1.
 */
export function capacidadeDoRodape(size: number): number {
    const largura = TAMANHO_CASA * size - 2 * MARGEM_ICONES_RODAPE;
    return Math.max(1, Math.floor((largura + ESPACO_ICONES) / (diametroDoIcone(size) + ESPACO_ICONES)));
}

/**
 * Posições dos ícones de condição no RODAPÉ do tile de um token: o primeiro no canto de baixo à ESQUERDA e os seguintes indo para a DIREITA. Devolve os CENTROS, relativos ao centro do
 * token (como o resto do desenho do token), na ordem em que as condições foram aplicadas. `quantidade` não deve passar de `capacidadeDoRodape(size)` (o que passa não cabe no tile).
 */
export function posicoesNoRodape(quantidade: number, size: number): { x: number; y: number }[] {
    const diametro = diametroDoIcone(size);
    const metade = (TAMANHO_CASA * size) / 2;
    const y = metade - MARGEM_ICONES_RODAPE - diametro / 2;
    return Array.from({ length: Math.max(0, quantidade) }, (_, k) => ({ x: -metade + MARGEM_ICONES_RODAPE + diametro / 2 + k * (diametro + ESPACO_ICONES), y }));
}

/**
 * Calcula a posição permitida do "mundo" em UM eixo (x ou y).
 *   posicao   = onde o canto do tabuleiro está na tela agora (pode ser negativo)
 *   tela      = tamanho da janela (do canvas) nesse eixo
 *   tabuleiro = tamanho do tabuleiro NA TELA nesse eixo (já multiplicado pelo zoom)
 */
export function limitarEixo(posicao: number, tela: number, tabuleiro: number): number {
    // Posição = onde a borda esquerda/topo do tabuleiro está na tela. O espaço vazio além do mapa nunca passa de MARGEM_LIVRE_CAMERA quando o mapa SAI da tela:
    //   mínimo: o mapa foi para a esquerda/cima até sobrar a margem vazia na ponta direita/baixo (a borda de trás do mapa em `tela - margem`);
    //   máximo: o mapa foi para a direita/baixo até sobrar a margem vazia na ponta esquerda/topo.
    // Mas se o mapa CABE inteiro na tela, qualquer posição em que ele apareça inteiro vale (senão o "Ajustar à tela", que o centra entre os painéis, seria puxado alguns pixels
    // pela margem): por isso o mínimo nunca passa de 0 e o máximo nunca fica abaixo de `tela - tabuleiro` (a borda de trás do mapa na borda da tela).
    const minimo = Math.min(tela - MARGEM_LIVRE_CAMERA - tabuleiro, 0);
    const maximo = Math.max(MARGEM_LIVRE_CAMERA, tela - tabuleiro);
    return limitar(posicao, minimo, maximo);
}

/**
 * CALIBRAR A GRADE: descobre quantas colunas e linhas o tabuleiro precisa ter
 * para a grade casar com a do mapa.
 *
 * O usuário marca, sobre o mapa, uma área que cobre `casas` x `casas` casas
 * DESENHADAS no mapa. Essa área tem `larguraMarcada` x `alturaMarcada` (pixels do
 * mundo), e o mapa ocupa o tabuleiro inteiro (`larguraTabuleiro` x `alturaTabuleiro`).
 * Por regra de três: se `casas` casas ocupam a largura marcada, o tabuleiro todo
 * (mapa inteiro) tem  casas x larguraTabuleiro / larguraMarcada  casas.
 *
 * Cada eixo é calculado à parte, então funciona mesmo com a imagem esticada.
 * Os valores devolvidos estão ARREDONDADOS mas NÃO limitados a MIN/MAX_CASAS.
 */
export function gradeParaCasar(
    larguraMarcada: number,
    alturaMarcada: number,
    casas: number,
    larguraTabuleiro: number,
    alturaTabuleiro: number,
): { colunas: number; linhas: number } {
    return {
        colunas: Math.round((casas * larguraTabuleiro) / larguraMarcada),
        linhas: Math.round((casas * alturaTabuleiro) / alturaMarcada),
    };
}

/** A previsão de colunas e linhas de um mapa. */
export interface PrevisaoDeGrade {
    colunas: number;
    linhas: number;
    /** Quantos pixels da imagem tem cada casa, nessa previsão (para mostrar ao usuário). */
    pxPorCasa: number;
    /** true = a imagem é um múltiplo EXATO de um tamanho de casa comum (70, 100, 50...); false = é só uma ESTIMATIVA. */
    exata: boolean;
}

/**
 * PREVÊ as colunas e as linhas de um mapa só pelo TAMANHO da imagem (sem olhar o desenho).
 *
 * 1) Tenta os tamanhos de casa comuns (TAMANHOS_DE_CASA_COMUNS, na ordem de preferência): se a largura e a altura são, nos dois eixos, múltiplos de
 *    um deles com sobra de até TOLERANCIA_PX_GRADE pixels, e as contagens cabem em MIN_CASAS..MAX_CASAS, é uma previsão EXATA (ex.: 1000×700 com casas de
 *    50 px = 20 × 14).
 * 2) Senão, ESTIMA: parte de casas de ~PX_POR_CASA_ESTIMADO px e deriva as linhas pela PROPORÇÃO da imagem, para as casas saírem QUADRADAS (um mapa de
 *    1946×1362 dá 28 colunas e 20 linhas, e não 28 × 19,5 arredondado de forma independente).
 *
 * Devolve null se a largura ou a altura não são números positivos. Os valores ficam sempre dentro de MIN_CASAS..MAX_CASAS.
 */
export function preverGrade(larguraImagem: number, alturaImagem: number): PrevisaoDeGrade | null {
    if (!Number.isFinite(larguraImagem) || !Number.isFinite(alturaImagem) || larguraImagem <= 0 || alturaImagem <= 0) return null;

    for (const casa of TAMANHOS_DE_CASA_COMUNS) {
        const colunas = Math.round(larguraImagem / casa);
        const linhas = Math.round(alturaImagem / casa);
        if (colunas < MIN_CASAS || colunas > MAX_CASAS || linhas < MIN_CASAS || linhas > MAX_CASAS) continue;
        if (Math.abs(larguraImagem - colunas * casa) <= TOLERANCIA_PX_GRADE && Math.abs(alturaImagem - linhas * casa) <= TOLERANCIA_PX_GRADE) {
            return { colunas, linhas, pxPorCasa: casa, exata: true };
        }
    }

    const colunas = limitar(Math.round(larguraImagem / PX_POR_CASA_ESTIMADO), MIN_CASAS, MAX_CASAS);
    const linhas = limitar(Math.round((colunas * alturaImagem) / larguraImagem), MIN_CASAS, MAX_CASAS); // (casas quadradas: a proporção da imagem)
    return { colunas, linhas, pxPorCasa: Math.round(larguraImagem / colunas), exata: false };
}
