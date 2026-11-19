// =====================================================================
// O DESENHO DE UMA ÁREA DE EFEITO no mapa (a geometria está em src/areas.ts):
//   - `pintarArea`: pinta as CASAS da área (preenchimento por casa), a linha em volta (seguindo as bordas das casas) e a bolinha da origem. Usado pelos desenhos FIXADOS (tabuleiro/desenho.ts).
//   - `criarVisualDeArea`: a área ainda sendo POSICIONADA (a sua e as dos outros), com o RÓTULO da medida no estilo da régua ("6 m\n4 quadrados"). O rótulo só existe na prévia:
//     depois de a área ser fixada ele some (pedido do dono, 19/11/2026).
// =====================================================================

import { Container, Graphics } from "pixi.js";
import { casasDaArea, chaveDaCasa, conjuntoDeCasas, lacosDoContorno, type DadosDaArea } from "../areas";
import { ALFA_PREENCHIMENTO_AREA, ESPESSURA_CONTORNO_AREA, TAMANHO_CASA } from "../config";
import { metrosDaDistancia, textoDaArea } from "../desenhos";
import { criarRotuloDeMedida } from "./rotuloDeMedida";
import { estado } from "../estado";
import type { Camera } from "./camera";

/** A caixa das casas de uma área (em casas): o canto de cima e o de baixo. `null` se a área não cobre nenhuma casa. */
export interface CaixaDaArea {
    col0: number;
    row0: number;
    col1: number;
    row1: number;
}

/**
 * Pinta a área num Graphics: o preenchimento (cada casa inteira), o contorno (só os lados das casas que NÃO têm vizinha da área, então a linha acompanha a forma "em degraus") e a origem.
 * `cor` é 0xRRGGBB e `alfa` é a OPACIDADE do preenchimento (a transparência escolhida pela pessoa: menor = mais transparente); o contorno é um pouco mais forte que o preenchimento.
 * Devolve a caixa das casas (o rótulo da prévia se apoia nela).
 */
export function pintarArea(g: Graphics, area: DadosDaArea, cor: number, alfa: number): CaixaDaArea | null {
    const T = TAMANHO_CASA;
    const casas = casasDaArea(area).filter((c) => c.col < estado.colunas && c.row < estado.linhas); // (o que passa da borda do tabuleiro não é pintado)
    const conjunto = conjuntoDeCasas(casas);

    // 1) o preenchimento: um retângulo por casa, todos de uma vez.
    for (const c of casas) g.rect(c.col * T, c.row * T, T, T);
    g.fill({ color: cor, alpha: alfa });

    // 2) o contorno: a borda da área, seguida de ponta a ponta em laços contínuos (cada lado solto se sobreporia nos cantos e, com transparência, deixaria tracinhos mais escuros).
    for (const laco of lacosDoContorno(casas, (col, row) => conjunto.has(chaveDaCasa(col, row)))) g.poly(laco.flatMap(([x, y]) => [x * T, y * T]), true);
    if (casas.length > 0) g.stroke({ width: ESPESSURA_CONTORNO_AREA, color: cor, alpha: Math.min(1, alfa + 0.3), join: "miter" });

    // 3) a origem: uma bolinha (menos na emanação, cuja origem é o corpo inteiro da criatura).
    if (area.forma !== "emanacao") g.circle(area.x * T, area.y * T, 5).fill(cor).stroke({ width: 2, color: 0x1a1a1f });

    if (casas.length === 0) return null;
    let col0 = Infinity, row0 = Infinity, col1 = -Infinity, row1 = -Infinity;
    for (const c of casas) {
        col0 = Math.min(col0, c.col);
        row0 = Math.min(row0, c.row);
        col1 = Math.max(col1, c.col);
        row1 = Math.max(row1, c.row);
    }
    return { col0, row0, col1, row1 };
}

export interface VisualDeArea {
    /** Mostra a área (ou, com `null`, a esconde). `nome` é de quem está posicionando (vazio na própria); `alfa` é a opacidade do preenchimento. */
    mostrar(area: DadosDaArea | null, cor: number, nome?: string, alfa?: number): void;
    /** Refaz o desenho com o que já foi mostrado (o zoom mudou: o tamanho do rótulo na tela depende dele). */
    redesenhar(): void;
    /** O texto do rótulo à vista ("6 m\n4 quadrados"), ou null sem área. (Para os testes.) */
    readonly texto: string | null;
}

/** A prévia de UMA área: o desenho e o rótulo da medida, por cima de tudo no mundo. */
export function criarVisualDeArea(camera: Camera): VisualDeArea {
    const camada = new Container();
    camada.visible = false;
    camera.mundo.addChild(camada);
    const forma = new Graphics();
    // O rótulo é o MESMO da régua (`rotuloDeMedida`: metros em cima, quadrados com o símbolo embaixo); o container dele é escalado por 1/zoom para manter o tamanho NA TELA em qualquer zoom.
    const rotuloDeMedida = criarRotuloDeMedida();
    const rotulo = rotuloDeMedida.container;
    camada.addChild(forma, rotulo);

    let ultima: { area: DadosDaArea; cor: number; nome: string; alfa: number } | null = null;
    let textoAtual: string | null = null;

    function desenhar(): void {
        if (!ultima) {
            camada.visible = false;
            textoAtual = null;
            return;
        }
        const { area, cor, nome, alfa } = ultima;
        camera.mundo.addChild(camada); // (re-adicionar traz a prévia para o TOPO)
        const z = camera.zoom;
        forma.clear();
        const caixa = pintarArea(forma, area, cor, alfa);

        textoAtual = textoDaArea(area); // (o texto "6 m" + "4 quadrados": serve aos testes; na tela o rótulo mostra o símbolo do quadrado)
        rotuloDeMedida.atualizar({ nome, metros: metrosDaDistancia(area.casas), casas: area.casas, cor });
        rotulo.scale.set(1 / z);
        // O rótulo fica um pouco acima do meio do topo da área (ou da origem, se a área não cobre casa nenhuma).
        const T = TAMANHO_CASA;
        const meioX = caixa ? ((caixa.col0 + caixa.col1 + 1) / 2) * T : area.x * T;
        const topoY = caixa ? caixa.row0 * T : area.y * T;
        rotulo.position.set(meioX, topoY - 38 / z);
        camada.visible = true;
    }

    return {
        get texto() {
            return textoAtual;
        },
        mostrar(area, cor, nome = "", alfa = ALFA_PREENCHIMENTO_AREA) {
            ultima = area ? { area, cor, nome, alfa } : null;
            desenhar();
        },
        redesenhar: desenhar,
    };
}
