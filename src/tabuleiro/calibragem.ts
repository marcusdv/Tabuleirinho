// =====================================================================
// CALIBRAGEM DA GRADE: ferramenta para descobrir quantas colunas e linhas o
// tabuleiro precisa ter para a grade casar com a do mapa.
//
// Como funciona: com a ferramenta ligada, o usuário marca um retângulo sobre
// uma área do mapa que cobre N x N casas desenhadas na imagem (N é digitado no
// painel) com DOIS CLIQUES (pedido do dono, 18/11/2026): o 1º clique marca um canto,
// o retângulo acompanha o mouse, e o 2º clique marca o canto oposto e aplica.
// (Arrastar do 1º ao 2º canto, apertando e soltando, também continua valendo.)
// Pela largura e altura desse retângulo, calculamos quantas casas o
// mapa inteiro tem (ver gradeParaCasar em coordenadas.ts) e aplicamos.
//
// Este módulo cuida do arrasto e do retângulo; o painel HTML (campo de N e as
// mensagens) fica em ui/painelCalibragem.ts. Os eventos do mouse chegam por
// interacao.ts, que decide quando repassá-los para cá.
// =====================================================================

import { Application, Graphics, type PointData } from "pixi.js";
import { TAMANHO_CASA } from "../config";
import { gradeParaCasar } from "../coordenadas";
import { estado } from "../estado";
import type { Camera } from "./camera";

/** Retângulos menores que isto (px do mundo) são cliques, não medidas. */
const TAMANHO_MIN_MEDIDA = 8;

export interface OpcoesCalibragem {
    /** Quantas casas (por lado) a área marcada cobre. Vem do campo do painel. */
    casas(): number;
    /** Durante o arrasto: as colunas/linhas que a medida atual daria (sem limite). */
    aoMedir(colunas: number, linhas: number): void;
    /** Ao soltar: o usuário terminou a medida; aplicar estas colunas/linhas (sem limite). */
    aoAplicar(colunas: number, linhas: number): void;
    /** O 1º clique foi CANCELADO (botão direito ou Esc): a ferramenta continua ligada para tentar de novo. */
    aoCancelar(): void;
}

export interface Calibragem {
    /** true enquanto a ferramenta está ligada. */
    readonly ativa: boolean;
    /** true enquanto há um retângulo em andamento (depois do 1º clique, até o 2º). */
    readonly medindo: boolean;
    /** Liga ou desliga a ferramenta (muda o cursor e some com o retângulo). */
    definirAtiva(ativa: boolean): void;
    /** Apertou o botão: o 1º clique marca o 1º canto; o 2º clique marca o canto oposto e aplica (ponto na TELA). */
    comecar(ponto: PointData): void;
    /** O mouse andou durante a medida, com ou sem o botão apertado (ponto na TELA). */
    arrastar(ponto: PointData): void;
    /** Soltou o botão: se foi um ARRASTO do 1º ao 2º canto, termina a medida e aplica; se foi só o 1º clique, espera o 2º. */
    soltar(): void;
    /** Botão direito no meio da medida: CANCELA o 1º clique (a ferramenta continua ligada). */
    cliqueDireito(): void;
    /** Cancela a medida em andamento (Esc). Devolve true se havia uma. */
    cancelarMedida(): boolean;
}

export function criarCalibragem(app: Application, camera: Camera, opcoes: OpcoesCalibragem): Calibragem {
    // O retângulo vive no MUNDO (como a grade), então acompanha pan e zoom.
    // main.ts cria a calibragem depois dos tokens, então ele fica por cima de tudo.
    const retangulo = new Graphics();
    retangulo.visible = false;
    camera.mundo.addChild(retangulo);

    let ativa = false;
    // Cantos do retângulo, em coordenadas do MUNDO. null = não está medindo.
    let inicio: PointData | null = null;
    let fim: PointData | null = null;
    let primeiroApertado = false; // o botão do 1º clique ainda está apertado (se for solto sem andar, é um clique: espera o 2º)

    /** Largura e altura (px do mundo) da área marcada. */
    function tamanhoMarcado(): { largura: number; altura: number } {
        if (!inicio || !fim) return { largura: 0, altura: 0 };
        return { largura: Math.abs(fim.x - inicio.x), altura: Math.abs(fim.y - inicio.y) };
    }

    /** Colunas/linhas que a medida atual daria, ou null se o retângulo é pequeno demais. */
    function calcular(): { colunas: number; linhas: number } | null {
        const { largura, altura } = tamanhoMarcado();
        if (largura < TAMANHO_MIN_MEDIDA || altura < TAMANHO_MIN_MEDIDA) return null;
        return gradeParaCasar(largura, altura, opcoes.casas(), estado.colunas * TAMANHO_CASA, estado.linhas * TAMANHO_CASA);
    }

    function desenhar(): void {
        if (!inicio || !fim) return;
        retangulo.clear();
        retangulo
            .rect(Math.min(inicio.x, fim.x), Math.min(inicio.y, fim.y), Math.abs(fim.x - inicio.x), Math.abs(fim.y - inicio.y))
            .fill({ color: 0xffd54f, alpha: 0.18 })
            // Espessura dividida pelo zoom: ~2 px na tela em qualquer zoom (como a grade).
            .stroke({ width: 2 / camera.zoom, color: 0xffd54f });
        retangulo.visible = true;
    }

    function encerrarMedida(): void {
        inicio = null;
        fim = null;
        primeiroApertado = false;
        retangulo.visible = false;
    }

    /** Cancela o 1º clique: some o retângulo e a ferramenta fica pronta para um novo 1º clique. */
    function cancelar(): boolean {
        if (!inicio) return false;
        encerrarMedida();
        opcoes.aoCancelar();
        return true;
    }

    /** Aplica o retângulo marcado (se for grande o bastante) e termina. */
    function concluir(): void {
        const medida = calcular();
        // O tabuleiro vai mudar de tamanho: o retângulo atual deixaria de fazer sentido.
        encerrarMedida();
        if (medida) opcoes.aoAplicar(medida.colunas, medida.linhas);
    }

    return {
        get ativa() {
            return ativa;
        },
        get medindo() {
            return inicio !== null;
        },

        definirAtiva(ligada) {
            ativa = ligada;
            encerrarMedida();
            app.stage.cursor = ligada ? "crosshair" : "default";
        },

        comecar(ponto) {
            if (inicio) {
                // O 2º clique: marca o canto oposto e aplica (um 2º clique em cima do 1º, pequeno demais, só reinicia a medida).
                fim = camera.telaParaMundo(ponto);
                if (calcular()) return concluir();
                encerrarMedida();
            }
            // O 1º clique: marca o 1º canto; o retângulo passa a acompanhar o mouse.
            inicio = camera.telaParaMundo(ponto);
            fim = inicio;
            primeiroApertado = true;
        },

        arrastar(ponto) {
            if (!inicio) return;
            fim = camera.telaParaMundo(ponto);
            desenhar();
            const medida = calcular();
            if (medida) opcoes.aoMedir(medida.colunas, medida.linhas);
        },

        cliqueDireito() {
            cancelar();
        },

        cancelarMedida: cancelar,

        soltar() {
            if (!primeiroApertado) return; // (soltar o botão do 2º clique: já foi tratado ao apertar)
            primeiroApertado = false;
            // Soltou longe do 1º canto = foi um ARRASTO: já vale. Soltou no mesmo lugar = foi um clique: espera o 2º clique.
            if (calcular()) concluir();
        },
    };
}
