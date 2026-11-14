// =====================================================================
// CÂMERA: o "mundo" do PixiJS e tudo que move ou escala a visão dele.
//   - position do mundo = PAN (deslocamento da visão)
//   - scale do mundo    = ZOOM
// Tudo o que é do tabuleiro (grade, tokens) fica DENTRO do mundo, então
// mover/escalar o mundo move/escala tudo junto.
// =====================================================================

import { Application, Container, PointData } from "pixi.js";
import { MARGEM_AJUSTE, TAMANHO_CASA, ZOOM_MAX, ZOOM_MIN } from "../config";
import { limitar, limitarEixo } from "../coordenadas";
import { estado } from "../estado";

export interface Camera {
    /** O Container que agrupa o tabuleiro. Outros módulos adicionam objetos nele. */
    readonly mundo: Container;
    /** Zoom atual (1 = 100%). */
    readonly zoom: number;
    /** Chamada sempre que o zoom muda (a grade redesenha, a barra atualiza...). */
    aoMudarZoom: (() => void) | null;
    /**
     * Quanto da janela está COBERTO pelos painéis de cada lado (em pixels de tela): a pilha de barras à esquerda e a coluna do chat/bolsa à direita.
     * Só o "Ajustar o mapa à tela" usa: o mapa é encaixado na área LIVRE entre os dois, e não na janela inteira (senão ficaria parte atrás dos painéis).
     */
    areaCoberta: (() => { esquerda: number; direita: number }) | null;

    /** Mantém a câmera dentro dos limites permitidos. */
    limitar(): void;
    /** Coloca o centro do tabuleiro no centro da janela (mantém o zoom atual). */
    centralizar(): void;
    /**
     * Ajusta o zoom para o tabuleiro INTEIRO caber na área livre da janela (entre os painéis) e o centraliza ali.
     * Nunca passa de 100% (em janelas grandes, o tabuleiro fica no tamanho normal).
     */
    ajustar(): void;
    /** Move a visão por (dx, dy) pixels de tela (pan). */
    moverPor(dx: number, dy: number): void;
    /** Aplica um zoom mantendo fixo um ponto da TELA (por padrão, o centro da janela; o Ctrl + roda passa o ponto do cursor). */
    aplicarZoom(novoZoom: number, pontoFixo?: PointData): void;
    /** Converte um ponto da TELA (pixels da janela) para coordenadas do MUNDO. */
    telaParaMundo(ponto: PointData): PointData;
    /** Converte um ponto do MUNDO para a TELA. */
    mundoParaTela(x: number, y: number): PointData;
}

export function criarCamera(app: Application): Camera {
    const mundo = new Container();
    app.stage.addChild(mundo);

    let zoom = 1;

    /** Largura do tabuleiro NA TELA, em pixels (considera o zoom). */
    const larguraNaTela = (): number => estado.colunas * TAMANHO_CASA * zoom;
    /** Altura do tabuleiro NA TELA, em pixels (considera o zoom). */
    const alturaNaTela = (): number => estado.linhas * TAMANHO_CASA * zoom;

    const camera: Camera = {
        mundo,
        get zoom() {
            return zoom;
        },
        aoMudarZoom: null,
        areaCoberta: null,

        limitar() {
            mundo.x = limitarEixo(mundo.x, app.screen.width, larguraNaTela());
            mundo.y = limitarEixo(mundo.y, app.screen.height, alturaNaTela());
        },

        centralizar() {
            mundo.position.set((app.screen.width - larguraNaTela()) / 2, (app.screen.height - alturaNaTela()) / 2);
            camera.limitar();
        },

        ajustar() {
            // A área LIVRE: a janela menos o que os painéis cobrem. Se os painéis ocuparem quase tudo (janela minúscula), usa a janela inteira.
            const folga = 2 * MARGEM_AJUSTE;
            const coberta = camera.areaCoberta?.() ?? { esquerda: 0, direita: 0 };
            let esquerda = coberta.esquerda;
            let largura = app.screen.width - coberta.esquerda - coberta.direita;
            if (largura <= folga + 100) {
                esquerda = 0;
                largura = app.screen.width;
            }

            // Zoom necessário para o tabuleiro caber em cada eixo (com uma folga de cada lado).
            const paraCaberNaLargura = (largura - folga) / (estado.colunas * TAMANHO_CASA);
            const paraCaberNaAltura = (app.screen.height - folga) / (estado.linhas * TAMANHO_CASA);

            // O menor dos dois (para caber nos dois eixos), no máximo 100%.
            zoom = limitar(Math.min(1, paraCaberNaLargura, paraCaberNaAltura), ZOOM_MIN, ZOOM_MAX);
            mundo.scale.set(zoom);
            // Centraliza na área livre (e não na janela inteira).
            mundo.position.set(esquerda + (largura - larguraNaTela()) / 2, (app.screen.height - alturaNaTela()) / 2);
            camera.limitar();
            camera.aoMudarZoom?.(); // a grade refaz a espessura da linha e a barra atualiza o número
        },

        moverPor(dx, dy) {
            mundo.x += dx;
            mundo.y += dy;
            camera.limitar(); // impede de arrastar além dos limites
        },

        aplicarZoom(novoZoom, pontoFixo) {
            novoZoom = limitar(novoZoom, ZOOM_MIN, ZOOM_MAX);
            if (novoZoom === zoom) return;

            // O ponto que fica parado (o centro da janela, ou o do cursor), em coordenadas da TELA.
            const cx = pontoFixo?.x ?? app.screen.width / 2;
            const cy = pontoFixo?.y ?? app.screen.height / 2;

            // Qual ponto do MUNDO está sob o centro da janela agora?
            const ponto = camera.telaParaMundo({ x: cx, y: cy });

            zoom = novoZoom;
            mundo.scale.set(zoom);

            // Reposiciona o mundo para esse mesmo ponto continuar sob o centro.
            mundo.x = cx - ponto.x * zoom;
            mundo.y = cy - ponto.y * zoom;

            camera.limitar();
            camera.aoMudarZoom?.();
        },

        // tela = mundo.position + ponto * zoom   =>   ponto = (tela - position) / zoom
        telaParaMundo(ponto) {
            return { x: (ponto.x - mundo.x) / zoom, y: (ponto.y - mundo.y) / zoom };
        },

        mundoParaTela(x, y) {
            return { x: mundo.x + x * zoom, y: mundo.y + y * zoom };
        },
    };

    return camera;
}
