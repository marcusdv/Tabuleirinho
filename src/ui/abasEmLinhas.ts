// =====================================================================
// ABAS EM LINHAS IGUAIS (pedido do dono, 17/11/2026): quando a coluna fica estreita e as abas não cabem numa linha, elas passam para a linha de baixo, mas SEMPRE em linhas do mesmo tamanho
// e com abas da mesma largura (4 abas que não cabem viram 2 + 2, e não 3 + 1). Como funciona: mede a aba mais larga; vê quantas cabem por linha; divide as abas em linhas iguais e dá a cada uma
// a mesma fração da largura. Refaz quando o container muda de tamanho ou quando uma aba aparece ou some (ex.: as abas só do mestre).
// =====================================================================

/**
 * `container`: a faixa das abas. `seletor`: quais filhos são abas. `reservaPx`: espaço que outros itens da linha ocupam (ex.: o botão de minimizar), descontado da largura disponível.
 */
export function organizarAbasEmLinhas(container: HTMLElement, seletor: string, reservaPx = 0, vao = 2): void {
    let ocupado = false;
    function refazer(): void {
        if (ocupado) return;
        ocupado = true;
        const abas = [...container.querySelectorAll<HTMLElement>(seletor)].filter((a) => getComputedStyle(a).display !== "none");
        // Mede o tamanho NATURAL de cada aba (sem a divisão anterior).
        for (const a of abas) {
            a.style.flex = "0 0 auto";
            a.style.width = "";
        }
        const estilo = getComputedStyle(container);
        const largura = container.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight) - reservaPx;
        const maisLarga = Math.max(0, ...abas.map((a) => a.getBoundingClientRect().width));
        if (abas.length > 0 && largura > 0 && maisLarga > 0) {
            const cabemPorLinha = Math.max(1, Math.floor((largura + vao) / (maisLarga + vao)));
            const linhas = Math.ceil(abas.length / cabemPorLinha);
            const porLinha = Math.ceil(abas.length / linhas); // (4 abas em 2 linhas: 2 por linha)
            const parte = `calc(${100 / porLinha}% - ${(vao * (porLinha - 1)) / porLinha}px - ${reservaPx / porLinha}px)`;
            for (const a of abas) {
                a.style.flex = `0 0 ${parte}`;
            }
        } else {
            for (const a of abas) a.style.flex = "";
        }
        ocupado = false;
    }
    new ResizeObserver(refazer).observe(container);
    // (Não observa o atributo `style`: é nele que esta própria função escreve.) O papel (`body.jogador`) esconde abas só do mestre: também vale refazer quando ele muda.
    new MutationObserver(refazer).observe(container, { attributes: true, subtree: true, attributeFilter: ["class", "hidden"] });
    new MutationObserver(refazer).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    refazer();
}
