// =====================================================================
// RECOLHER / EXPANDIR UM PAINEL COM ANIMAÇÃO (a barra de Ferramentas, o painel de Desenho, o de Dados e a bolsa).
//
// Em vez de a caixa mudar de tamanho de uma vez, a ALTURA dela cresce (ou encolhe) suavemente, com o TOPO parado: o conteúdo é revelado de cima
// para baixo. Como funciona: o estado final é aplicado de verdade (por `aplicar`: a classe "recolhida", o texto do botão...), a altura é medida
// antes e depois, e a altura da caixa é animada de uma para a outra (Web Animations) com o conteúdo cortado (`overflow: hidden`) durante o
// movimento. Ao RECOLHER, o conteúdo continua à vista enquanto a caixa encolhe e só some no fim; ao EXPANDIR, ele já está lá e a caixa o revela.
//
// Clicar de novo no meio da animação inverte o movimento a partir da altura em que a caixa está (sem pulo). Com `prefers-reduced-motion` (ou
// sem animação disponível) a mudança é na hora.
// =====================================================================

const DURACAO_MS = 260;
const CURVA = "cubic-bezier(0.4, 0, 0.2, 1)";

interface Pendente {
    animacao: Animation;
    finalizar: () => void;
    recolher: boolean; // o estado para onde a animação em curso está indo
}
const emCurso = new WeakMap<HTMLElement, Pendente>();

/**
 * Leva o painel ao estado `recolher` (true = recolhido) com animação. `aplicar(recolhida)` muda o que é de verdade (classe, texto do botão...)
 * e é chamada mais de uma vez: tem de ser só uma mudança de aparência, sem efeitos (guardar preferência fica de fora).
 */
export function animarRecolher(painel: HTMLElement, recolher: boolean, aplicar: (recolhida: boolean) => void): void {
    // A altura de agora (se uma animação ainda corre, é a do meio do caminho: o movimento novo parte dela, sem pulo).
    const h0 = painel.getBoundingClientRect().height;
    const anterior = emCurso.get(painel);
    if (anterior) {
        anterior.animacao.cancel();
        anterior.finalizar();
    }

    aplicar(recolher);
    const h1 = painel.getBoundingClientRect().height;
    const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof painel.animate !== "function";
    if (semAnimacao || Math.abs(h1 - h0) < 1) return;

    if (recolher) aplicar(false); // enquanto encolhe, o conteúdo continua à vista: só some quando a caixa chega ao tamanho final
    painel.style.overflow = "hidden";
    const animacao = painel.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: DURACAO_MS, easing: CURVA });
    const finalizar = (): void => {
        painel.style.overflow = "";
        if (recolher) aplicar(true);
        emCurso.delete(painel);
    };
    emCurso.set(painel, { animacao, finalizar, recolher });
    animacao.onfinish = finalizar;
}

/**
 * Alterna o painel (recolhido <-> expandido) com animação e devolve o NOVO estado (true = recolhido), para quem guarda a preferência.
 * O estado de "agora" é o de DESTINO da animação em curso, se houver (senão a classe seria a do meio do caminho).
 */
export function alternarRecolhida(painel: HTMLElement, classe: string, aplicar: (recolhida: boolean) => void): boolean {
    const pendente = emCurso.get(painel);
    const atual = pendente ? pendente.recolher : painel.classList.contains(classe);
    const novo = !atual;
    animarRecolher(painel, novo, aplicar);
    return novo;
}
