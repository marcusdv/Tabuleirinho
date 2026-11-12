// =====================================================================
// DADOS: a lógica pura das rolagens (sem HTML, sem PixiJS e SEM imports, de
// propósito: assim ela pode ser testada direto no Node, sem navegador).
//
// ATENÇÃO (multiplayer): hoje o sorteio acontece no navegador de quem rola. No jogo
// online o SERVIDOR é quem deve sortear e mandar o resultado, senão um jogador
// poderia trapacear mexendo no próprio navegador. A função `rolarDados` será a mesma,
// só que rodando no servidor.
// =====================================================================

/** O resultado de uma rolagem. */
export interface Rolagem {
    lados: number; // dado de quantos lados (6 = d6)
    quantidade: number; // quantos dados foram rolados
    modificador: number; // somado ao total (pode ser negativo)
    resultados: number[]; // o que saiu em cada dado, na ordem
    total: number; // soma dos dados + modificador
}

/**
 * Rola `quantidade` dados de `lados` lados e soma o `modificador`.
 * `aleatorio` devolve um número de 0 (incluso) até 1 (excluso), como Math.random; é um
 * parâmetro para os testes poderem controlar o sorteio.
 */
export function rolarDados(lados: number, quantidade: number, modificador: number, aleatorio: () => number = Math.random): Rolagem {
    const resultados: number[] = [];
    for (let i = 0; i < quantidade; i++) {
        // aleatorio() em [0,1) vezes `lados` vai de 0 a lados-1,999...; floor + 1 dá de 1 até `lados`, todos igualmente prováveis.
        // O Math.min protege caso um sorteador devolva exatamente 1.
        resultados.push(Math.min(lados, Math.floor(aleatorio() * lados) + 1));
    }
    const total = resultados.reduce((soma, r) => soma + r, 0) + modificador;
    return { lados, quantidade, modificador, resultados, total };
}

/** O modificador como texto: "+3", "-2" ou "" (zero não aparece). */
function textoDoModificador(modificador: number): string {
    return modificador > 0 ? `+${modificador}` : modificador < 0 ? `${modificador}` : "";
}

/** A fórmula da rolagem, ex.: "2d6+3", "1d20", "3d8-1". */
export function formulaDosDados(quantidade: number, lados: number, modificador: number): string {
    return `${quantidade}d${lados}${textoDoModificador(modificador)}`;
}

/**
 * Os dados individuais e o modificador, ex.: "[4, 5] +3". Passando de `maximo` dados, mostra só os
 * primeiros e termina com "…" (para o texto caber no cartão do chat).
 */
export function detalheDaRolagem(rolagem: Rolagem, maximo = 12): string {
    const mostrados = rolagem.resultados.slice(0, maximo).join(", ");
    const lista = rolagem.resultados.length > maximo ? `${mostrados}, …` : mostrados;
    const modificador = textoDoModificador(rolagem.modificador);
    return `[${lista}]${modificador ? " " + modificador : ""}`;
}
