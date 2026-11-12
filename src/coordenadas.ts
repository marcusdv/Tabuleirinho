// =====================================================================
// COORDENADAS: funções PURAS (só números entram, só números saem).
// Não dependem do PixiJS nem do navegador, então podem ser testadas
// sozinhas e, no futuro, reaproveitadas no servidor.
// =====================================================================

import { ESPACO_ICONES, ICONE_CONDICAO_BASE, ICONE_CONDICAO_POR_CASA, PARTE_VISIVEL_CAMERA, TAMANHO_CASA } from "./config.ts";

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
 * Posições dos ícones de condição ao redor de um token: o primeiro no TOPO e
 * os seguintes em SENTIDO HORÁRIO. Devolve pontos relativos ao CENTRO do token.
 *   quantidade     = quantas condições o token tem
 *   raioAnel       = raio do círculo sobre o qual os centros dos ícones ficam
 *   diametroIcone  = diâmetro de cada ícone
 *
 * Os ícones ficam lado a lado (com ESPACO_ICONES entre eles), começando no
 * topo. Se passarem de uma volta inteira, o espaçamento é comprimido para
 * caberem todos no anel.
 */
export function posicoesNoAnel(quantidade: number, raioAnel: number, diametroIcone: number): { x: number; y: number }[] {
    if (quantidade <= 0) return [];

    // Passo angular (em radianos) para encostar um ícone no outro: comprimento
    // do arco = ângulo * raio  =>  ângulo = arco / raio.
    const passoIdeal = (diametroIcone + ESPACO_ICONES) / raioAnel;
    // Passo máximo para caber tudo em uma volta (2π dividido pela quantidade).
    const passo = Math.min(passoIdeal, (2 * Math.PI) / quantidade);

    return Array.from({ length: quantidade }, (_, k) => {
        // -π/2 é o topo (a tela tem o eixo y para BAIXO). Somar ângulo gira no
        // sentido horário na tela.
        const angulo = -Math.PI / 2 + k * passo;
        return { x: Math.cos(angulo) * raioAnel, y: Math.sin(angulo) * raioAnel };
    });
}

/**
 * Calcula a posição permitida do "mundo" em UM eixo (x ou y).
 *   posicao   = onde o canto do tabuleiro está na tela agora (pode ser negativo)
 *   tela      = tamanho da janela (do canvas) nesse eixo
 *   tabuleiro = tamanho do tabuleiro NA TELA nesse eixo (já multiplicado pelo zoom)
 */
export function limitarEixo(posicao: number, tela: number, tabuleiro: number): number {
    // O tabuleiro pode sair da janela (deixando espaço em branco em volta), desde que
    // uma parte dele continue visível. Se o tabuleiro ou a janela forem menores que
    // PARTE_VISIVEL_CAMERA, a parte obrigatória é o que couber.
    const visivel = Math.min(PARTE_VISIVEL_CAMERA, tabuleiro, tela);

    // Posição = onde a borda esquerda/topo do tabuleiro está na tela.
    //   mínimo: o tabuleiro foi tanto para a esquerda/cima que só sobram `visivel` px dele (na ponta direita/baixo);
    //   máximo: foi tanto para a direita/baixo que só sobram `visivel` px dele (na ponta esquerda/topo).
    return limitar(posicao, visivel - tabuleiro, tela - visivel);
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
