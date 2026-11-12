// =====================================================================
// GRADE: o fundo quadriculado do tabuleiro e o destaque da casa de destino
// (o quadrado claro que aparece enquanto arrastamos um token).
// =====================================================================

import { Graphics } from "pixi.js";
import { TAMANHO_CASA } from "../config";
import { estado } from "../estado";
import type { Camera } from "./camera";

export interface Grade {
    /** (Re)desenha a grade conforme colunas, linhas e zoom atuais. */
    desenhar(): void;
    /** Mostra ou esconde as linhas da grade (o destaque de arrasto não é afetado). */
    definirVisivel(visivel: boolean): void;
    /** Mostra o destaque com o tamanho de um token, numa casa. */
    mostrarDestaque(size: number, col: number, row: number): void;
    /** Move o destaque para outra casa (canto superior esquerdo). */
    moverDestaque(col: number, row: number): void;
    esconderDestaque(): void;
}

export function criarGrade(camera: Camera): Grade {
    const grade = new Graphics();
    const destaque = new Graphics();
    destaque.visible = false;

    // A ordem de addChild define quem fica por cima: grade, depois destaque.
    // Os tokens são adicionados depois (em tokens.ts), então ficam acima dos dois.
    camera.mundo.addChild(grade);
    camera.mundo.addChild(destaque);

    function desenhar(): void {
        const largura = estado.colunas * TAMANHO_CASA;
        const altura = estado.linhas * TAMANHO_CASA;

        grade.clear(); // apaga o desenho anterior antes de redesenhar

        // Fundo do tabuleiro (um retângulo cobrindo tudo). Só sem mapa: com mapa,
        // um fundo opaco esconderia a imagem que está por baixo.
        const temMapa = estado.mapa !== null;
        if (!temMapa) grade.rect(0, 0, largura, altura).fill(0x2b2b33);

        // Linhas verticais: uma a cada TAMANHO_CASA, incluindo a borda direita.
        for (let c = 0; c <= estado.colunas; c++) {
            grade.moveTo(c * TAMANHO_CASA, 0).lineTo(c * TAMANHO_CASA, altura);
        }
        // Linhas horizontais, incluindo a borda de baixo.
        for (let l = 0; l <= estado.linhas; l++) {
            grade.moveTo(0, l * TAMANHO_CASA).lineTo(largura, l * TAMANHO_CASA);
        }
        // A espessura é dividida pelo zoom: como o mundo é escalado, isso mantém
        // a linha com ~1 pixel NA TELA em qualquer zoom (sem sumir nem engrossar).
        // Sobre um mapa, linhas escuras semitransparentes aparecem melhor e deixam a imagem visível.
        grade.stroke(
            temMapa
                ? { width: 1 / camera.zoom, color: 0x000000, alpha: 0.5 }
                : { width: 1 / camera.zoom, color: 0x55555f },
        );
    }

    desenhar();

    return {
        desenhar,

        definirVisivel(visivel) {
            // Esconder (em vez de apagar) mantém o desenho pronto: ao reexibir, nada é refeito.
            grade.visible = visivel;
        },

        mostrarDestaque(size, col, row) {
            destaque.clear();
            destaque.rect(0, 0, size * TAMANHO_CASA, size * TAMANHO_CASA).fill({ color: 0xffffff, alpha: 0.2 }); // branco, 20% opaco
            destaque.position.set(col * TAMANHO_CASA, row * TAMANHO_CASA);
            destaque.visible = true;
        },

        moverDestaque(col, row) {
            destaque.position.set(col * TAMANHO_CASA, row * TAMANHO_CASA);
        },

        esconderDestaque() {
            destaque.visible = false;
        },
    };
}
