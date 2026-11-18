// =====================================================================
// APARÊNCIA DO TOKEN (HTML): o que a criação (bolsa) e a edição de tokens compartilham:
// a paleta de cores, a marcação da cor escolhida e o desenho de um "disco" (a prévia e as fichas).
// =====================================================================

import { CORES_TOKEN, SEM_BORDA } from "../config";

/** Cor numérica (0xe74c3c) para texto CSS ("#e74c3c"). */
/** (SEM_BORDA, que não é uma cor, vira branco: só serve para o seletor de cor não quebrar.) */
export const corCss = (cor: number): string => (cor < 0 ? "#ffffff" : `#${cor.toString(16).padStart(6, "0")}`);

/** Abre o seletor de arquivos de um <input type="file">. Devolve o arquivo, ou null se o usuário cancelou. */
export function escolherArquivo(entrada: HTMLInputElement): Promise<File | null> {
    return new Promise((resolve) => {
        entrada.value = ""; // permite escolher o MESMO arquivo duas vezes seguidas
        entrada.addEventListener("change", () => resolve(entrada.files?.[0] ?? null), { once: true });
        entrada.addEventListener("cancel", () => resolve(null), { once: true });
        entrada.click();
    });
}

/** Destaca, numa paleta, a amostra da cor escolhida. */
export function marcarEscolhida(paleta: HTMLElement, cor: number): void {
    for (const amostra of paleta.querySelectorAll<HTMLElement>(".amostra")) {
        amostra.classList.toggle("escolhida", amostra.dataset.cor === (cor === SEM_BORDA ? "nenhuma" : corCss(cor)));
    }
}

/** Desenha uma paleta (uma vez): um botão por cor de CORES_TOKEN. `aoEscolher` recebe a cor clicada. */
export function montarPaleta(paleta: HTMLElement, aoEscolher: (cor: number) => void, comSemBorda = false): void {
    // `comSemBorda`: a paleta da BORDA ganha, no fim, a amostra "Sem borda" (o token fica sem contorno; pedido do dono, 17/11/2026).
    const semBorda: HTMLButtonElement[] = [];
    if (comSemBorda) {
        const amostra = document.createElement("button");
        amostra.className = "amostra sem-borda";
        amostra.dataset.cor = "nenhuma";
        amostra.title = "Sem borda";
        amostra.setAttribute("aria-label", "Sem borda");
        amostra.addEventListener("click", () => aoEscolher(SEM_BORDA));
        semBorda.push(amostra);
    }
    paleta.replaceChildren(
        ...CORES_TOKEN.map((cor) => {
            const amostra = document.createElement("button");
            amostra.className = "amostra";
            amostra.dataset.cor = corCss(cor);
            amostra.style.background = corCss(cor);
            amostra.title = corCss(cor);
            amostra.setAttribute("aria-label", `Cor ${corCss(cor)}`);
            amostra.addEventListener("click", () => aoEscolher(cor));
            return amostra;
        }),
        ...semBorda,
    );
}

/**
 * Pinta um disco (da ficha ou da prévia) como o token: a cor de preenchimento por baixo, a imagem
 * por cima (se houver; onde ela é transparente aparece o preenchimento) e a borda na cor da borda.
 */
export function pintarDisco(disco: HTMLElement, cor: number, corBorda: number, imagem: string | null): void {
    disco.classList.toggle("com-imagem", imagem !== null);
    disco.style.backgroundColor = corCss(cor);
    // A miniatura é um "data:image/..." gerado por nós (estado.ts só aceita esse formato).
    disco.style.backgroundImage = imagem ? `url("${imagem}")` : "";
    disco.style.borderColor = corBorda === SEM_BORDA ? "transparent" : corCss(corBorda); // (sem borda: o anel some e a cor do token vai até a beirada)
}
