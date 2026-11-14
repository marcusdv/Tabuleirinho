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

// ---------------------------------------------------------------------
// GAVETA LATERAL (a pilha de Desenho e Ferramentas, ui/pilha.ts): em vez de a caixa crescer para baixo, o CONTEÚDO dela (a "gaveta") abre ao LADO, colado
// na parede direita da barra, revelado da esquerda para a direita (um recorte `clip-path` que cresce). Mesma duração e curva das outras animações.
// Ao recolher, a gaveta continua à vista até o recorte fechar e só então some (`aplicar(true)`); clicar de novo no meio do caminho INVERTE o movimento.
// O recorte tem folga (−30 px) nos três lados que ficam abertos, para não cortar a sombra da gaveta.
// ---------------------------------------------------------------------
const GAVETA_FECHADA = "inset(-30px 100% -30px -30px)";
const GAVETA_ABERTA = "inset(-30px -30px -30px -30px)";

interface GavetaEmCurso {
    animacao: Animation;
    recolher: boolean; // o estado para onde a animação em curso está indo
}
const gavetasEmCurso = new WeakMap<HTMLElement, GavetaEmCurso>();

/** A gaveta está (ou está indo para) RECOLHIDA? Olha o destino da animação em curso, se houver. */
export function gavetaRecolhida(caixa: HTMLElement, gaveta: HTMLElement, classe: string): boolean {
    return gavetasEmCurso.get(gaveta)?.recolher ?? caixa.classList.contains(classe);
}

/**
 * Alterna a gaveta (recolhida <-> aberta) com animação e devolve o NOVO estado (true = recolhida). `aplicar(recolhida)` muda o que é de verdade (a classe
 * que mostra/esconde a gaveta, o título do botão...) e só deve ser uma mudança de aparência.
 */
export function alternarGaveta(caixa: HTMLElement, gaveta: HTMLElement, classe: string, aplicar: (recolhida: boolean) => void): boolean {
    const pendente = gavetasEmCurso.get(gaveta);
    const novo = !gavetaRecolhida(caixa, gaveta, classe);
    const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof gaveta.animate !== "function";
    if (pendente) {
        // No meio de uma animação: inverte a partir de onde está (sem pulo).
        pendente.recolher = novo;
        pendente.animacao.reverse();
        return novo;
    }
    if (semAnimacao) {
        aplicar(novo);
        return novo;
    }
    if (!novo) aplicar(false); // abrindo: a gaveta passa a existir (recortada por inteiro) e o recorte cresce
    // A animação vai de FECHADA para ABERTA; ao recolher ela é tocada ao contrário.
    const animacao = gaveta.animate([{ clipPath: GAVETA_FECHADA }, { clipPath: GAVETA_ABERTA }], { duration: DURACAO_MS, easing: CURVA, fill: "both" });
    if (novo) {
        animacao.currentTime = DURACAO_MS; // começa de ABERTA...
        animacao.reverse(); // ...e vai até FECHADA
    }
    const registro: GavetaEmCurso = { animacao, recolher: novo };
    gavetasEmCurso.set(gaveta, registro);
    animacao.onfinish = () => {
        gavetasEmCurso.delete(gaveta);
        aplicar(registro.recolher); // o estado de verdade (recolhida: a gaveta some)
        animacao.cancel(); // (só depois: com `fill: both` a gaveta não "pisca" aberta entre o fim da animação e o `aplicar`)
    };
    return novo;
}
