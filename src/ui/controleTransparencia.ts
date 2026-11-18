// =====================================================================
// CONTROLE DE TRANSPARÊNCIA (HTML): o "nível de transparência" que acompanha um seletor de cor (pedido do dono, 18/11/2026: todos os seletores de cor do site).
// É um deslizante de 0% (opaco) a 90% (quase invisível) com o valor ao lado e uma faixa de prévia (xadrez + a cor): ver `css/transparencia.css`.
// O resto do jogo guarda a OPACIDADE (alfa, de 0.1 a 1, onde 1 = opaco), mais fácil de usar no desenho; este controle só traduz.
// =====================================================================

export const TRANSPARENCIA_MAX = 90; // % (acima disto a cor sumiria: o mínimo de opacidade é 10%)

export interface OpcoesTransparencia {
    /** A opacidade de partida (0.1 a 1; 1 = opaco). */
    alfa?: number;
    /** A pessoa mexeu: a nova opacidade (0.1 a 1). */
    aoMudar(alfa: number): void;
}

export interface ControleTransparencia {
    /** O elemento (o rótulo com o deslizante) para pôr na tela. */
    readonly elemento: HTMLElement;
    /** Põe uma opacidade de fora (sem avisar `aoMudar`). */
    definir(alfa: number): void;
    /** A opacidade de agora. */
    valor(): number;
    /** A cor da prévia (0xRRGGBB ou "#rrggbb"). */
    definirCor(cor: number | string): void;
}

/** Opacidade (0 a 1, com 2 casas) -> transparência em % inteiro. */
const alfaParaPorcentoDeTransparencia = (alfa: number): number => Math.round((1 - alfa) * 100);

/** Limita uma opacidade ao que o jogo aceita (0.1 a 1, com 2 casas). */
export const limitarAlfa = (alfa: number): number => (Number.isFinite(alfa) ? Math.min(1, Math.max(0.1, Math.round(alfa * 100) / 100)) : 1);

/** Monta o controle: "Transparência  [━━●━━━]  25%". Fica ao lado/abaixo do seletor de cor, quem chama decide onde por (`elemento`). */
export function criarControleTransparencia(opcoes: OpcoesTransparencia): ControleTransparencia {
    const rotulo = document.createElement("label");
    rotulo.className = "transparencia";
    rotulo.title = "Nível de transparência: 0% é opaco; quanto maior, mais transparente";
    const texto = document.createElement("span");
    texto.className = "transparencia-rotulo";
    texto.textContent = "Transparência";
    const faixa = document.createElement("input");
    faixa.type = "range";
    faixa.min = "0";
    faixa.max = String(TRANSPARENCIA_MAX);
    faixa.step = "5";
    faixa.setAttribute("aria-label", "Nível de transparência, em porcentagem");
    const valor = document.createElement("span");
    valor.className = "transparencia-valor";
    const previa = document.createElement("span");
    previa.className = "transparencia-previa";
    previa.setAttribute("aria-hidden", "true");
    rotulo.append(texto, faixa, valor, previa);

    let alfa = limitarAlfa(opcoes.alfa ?? 1);
    function mostrar(): void {
        faixa.value = String(alfaParaPorcentoDeTransparencia(alfa));
        valor.textContent = `${alfaParaPorcentoDeTransparencia(alfa)}%`;
        previa.style.setProperty("--alfa", String(alfa));
    }
    faixa.addEventListener("input", () => {
        alfa = limitarAlfa(1 - Number(faixa.value) / 100);
        mostrar();
        opcoes.aoMudar(alfa);
    });
    mostrar();

    return {
        elemento: rotulo,
        definir(novo) {
            alfa = limitarAlfa(novo);
            mostrar();
        },
        valor: () => alfa,
        definirCor(cor) {
            previa.style.setProperty("--cor", typeof cor === "number" ? `#${cor.toString(16).padStart(6, "0")}` : cor);
        },
    };
}
