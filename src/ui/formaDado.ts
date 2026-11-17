// =====================================================================
// A FORMA DE CADA DADO (SVG), a mesma do chat e das rolagens d20 da ficha. Só desenho: nada do que a pessoa escreve entra aqui.
// =====================================================================

const NS_SVG = "http://www.w3.org/2000/svg";

// A FORMA de cada dado, vista de frente, COMO NA IMAGEM DE REFERÊNCIA DO DONO: d4 triângulo, d6 quadrado, d8 hexágono (ponta para cima), d10 hexágono com a ponta para cima, um pouco mais largo que o do d8 (formato do último print do dono), d12 decágono, d20 hexágono (ponta para cima), d100 um polígono de 20 lados (quase um círculo) e d1000 um círculo perfeito. `lados` = quantos lados tem o polígono e `giro` =
// onde fica o primeiro vértice (-90° = ponta para cima; 0° = ponta para a direita; 45° no quadrado deixa os lados retos). Um dado que não está na lista (não existe hoje) fica com a
// caixinha arredondada de sempre.
const FORMAS: Record<number, { lados: number; giro: number; esticar?: number }> = {
    4: { lados: 3, giro: -Math.PI / 2 },
    6: { lados: 4, giro: Math.PI / 4 },
    8: { lados: 6, giro: -Math.PI / 2 },
    10: { lados: 6, giro: -Math.PI / 2, esticar: 1.12 }, // (hexágono com a ponta para cima, um pouco MAIS LARGO que o do d8/d20: `esticar` alarga o polígono na horizontal)
    12: { lados: 10, giro: -Math.PI / 2 },
    20: { lados: 6, giro: -Math.PI / 2 },
    100: { lados: 20, giro: -Math.PI / 2 },
};

/**
 * O desenho de fundo de uma peça de dado: um SVG com um polígono regular (ver `FORMAS`) ou um círculo (d1000). A forma é centralizada e ocupa o máximo do quadrado, sem deformar. As cores vêm do CSS (`--dado-fundo` e `--dado-borda`), para o verde do máximo, o vermelho do 1 e o
 * dourado do crítico continuarem funcionando. Devolve null para um dado que não tem forma.
 */
export function formaDoDado(lados: number): SVGSVGElement | null {
    const svg = document.createElementNS(NS_SVG, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("chat-dado-forma-svg");
    if (lados === 1000) {
        const circulo = document.createElementNS(NS_SVG, "circle");
        circulo.setAttribute("cx", "50");
        circulo.setAttribute("cy", "50");
        circulo.setAttribute("r", "47");
        svg.append(circulo);
        return svg;
    }
    const forma = FORMAS[lados];
    if (!forma) return null;
    const { lados: n, giro, esticar = 1 } = forma;
    const pontos = Array.from({ length: n }, (_, i) => [Math.cos(giro + (2 * Math.PI * i) / n) * esticar, Math.sin(giro + (2 * Math.PI * i) / n)]);
    const xs = pontos.map((p) => p[0]);
    const ys = pontos.map((p) => p[1]);
    const largura = Math.max(...xs) - Math.min(...xs);
    const altura = Math.max(...ys) - Math.min(...ys);
    const escala = 94 / Math.max(largura, altura); // (uma escala só para os dois eixos: o polígono não se deforma)
    const centroX = 50 - ((Math.max(...xs) + Math.min(...xs)) / 2) * escala;
    const centroY = 50 - ((Math.max(...ys) + Math.min(...ys)) / 2) * escala;
    const poligono = document.createElementNS(NS_SVG, "polygon");
    poligono.setAttribute("points", pontos.map((p) => `${(centroX + p[0] * escala).toFixed(1)},${(centroY + p[1] * escala).toFixed(1)}`).join(" "));
    svg.append(poligono);
    return svg;
}

