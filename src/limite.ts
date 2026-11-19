// =====================================================================
// LIMITE ANTI-SPAM ("balde que enche aos poucos"): puro, sem DOM, COMPARTILHADO (o servidor é quem manda de verdade; o navegador usa o mesmo cálculo
// só para avisar a pessoa sem ir ao servidor).
//
// Como funciona: o balde guarda até `capacidade` "fichas". Cada ação gasta uma; uma ficha nova entra a cada `msRecarga` milissegundos (até encher).
// Sem ficha, a ação é RECUSADA. Resultado: uma rajada curta passa (até a capacidade) e depois só uma ação a cada `msRecarga`.
// Ex.: capacidade 3 e msRecarga 1000 = 3 rolagens de uma vez e depois 1 por segundo.
// =====================================================================

export interface Balde {
    fichas: number; // quantas ações ainda cabem (pode ser fracionário: a recarga é contínua)
    ultimo: number; // quando foi a última conta (ms, Date.now())
}

/** Um balde CHEIO. */
export const novoBalde = (capacidade: number, agora: number = Date.now()): Balde => ({ fichas: capacidade, ultimo: agora });

/** Tenta gastar uma ficha. Devolve true se a ação pode acontecer, false se o limite foi atingido (nesse caso nada é gasto). */
export function gastar(balde: Balde, capacidade: number, msRecarga: number, agora: number = Date.now()): boolean {
    const passou = Math.max(0, agora - balde.ultimo); // (relógio que andou para trás não dá fichas)
    balde.fichas = Math.min(capacidade, balde.fichas + passou / msRecarga);
    balde.ultimo = agora;
    if (balde.fichas < 1) return false;
    balde.fichas -= 1;
    return true;
}

/** Passou o tempo mínimo desde a última vez? (o "mini delay" entre um ping e o seguinte; `ultimo` em ms, 0 = nunca) */
export const passouOIntervalo = (ultimo: number, msMinimo: number, agora: number = Date.now()): boolean => agora - ultimo >= msMinimo || agora < ultimo;

/**
 * A página está PARADA (alt-tab, aba oculta, janela minimizada)? Então o que chega pela rede (pings) não deve ser mostrado: com a tela parada, tudo se acumularia e apareceria de uma vez quando ela voltasse.
 * `oculta` = `document.hidden`; `msSemQuadro` = há quantos ms o último quadro foi desenhado.
 */
export const paginaParada = (oculta: boolean, msSemQuadro: number, msLimite: number): boolean => oculta || msSemQuadro > msLimite;
