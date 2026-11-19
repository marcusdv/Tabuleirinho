// =====================================================================
// CÂMERA: o "mundo" do PixiJS e tudo que move ou escala a visão dele.
//   - position do mundo = PAN (deslocamento da visão)
//   - scale do mundo    = ZOOM
// Tudo o que é do tabuleiro (grade, tokens) fica DENTRO do mundo, então
// mover/escalar o mundo move/escala tudo junto.
// =====================================================================

import { Application, Container, PointData } from "pixi.js";
import { MARGEM_AJUSTE, MS_SUAVIZAR_CAMERA, TAMANHO_CASA, ZOOM_MAX, ZOOM_MIN } from "../config";
import { limitar, limitarEixo } from "../coordenadas";
import { estado } from "../estado";

export interface Camera {
    /** O Container que agrupa o tabuleiro. Outros módulos adicionam objetos nele. */
    readonly mundo: Container;
    /** Zoom atual (1 = 100%). */
    readonly zoom: number;
    /** Chamada sempre que o zoom muda (a grade redesenha, a barra atualiza...). */
    aoMudarZoom: (() => void) | null;
    /** Chamada sempre que a VISÃO muda (pan, zoom, ajustar, centralizar, restaurar): quem guarda "onde a câmera estava" em cada mapa escuta isto. */
    aoMudarVisao: (() => void) | null;
    /** Posição do mundo na tela (o pan), em pixels. */
    readonly x: number;
    readonly y: number;
    /** Volta a uma visão guardada (zoom e posição), respeitando os limites atuais. */
    restaurar(zoom: number, x: number, y: number): void;
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
    /** Move a visão DESLIZANDO (suave, em vários quadros). Os pedidos se SOMAM: apertar a seta várias vezes anda várias casas sem perder nenhuma. */
    deslizarPor(dx: number, dy: number): void;
    /** Interrompe um deslize em andamento (ao começar um arrasto, um zoom ou um ajuste). */
    pararDeslize(): void;
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

    // O DESLIZE: o que ainda falta andar (em pixels de tela). A cada quadro a câmera anda uma fração disso (suavização exponencial: rápido no começo, mansinho no fim).
    let faltaX = 0;
    let faltaY = 0;
    let deslizando = false; // (o ouvinte do relógio está ligado?)
    function passoDoDeslize(tk: { deltaMS: number }): void {
        const fracao = 1 - Math.exp(-tk.deltaMS / MS_SUAVIZAR_CAMERA);
        let dx = faltaX * fracao;
        let dy = faltaY * fracao;
        // Quando falta quase nada, termina de uma vez (sem ficar tremendo em frações de pixel).
        if (Math.hypot(faltaX, faltaY) < 0.5) {
            dx = faltaX;
            dy = faltaY;
        }
        const antes = { x: mundo.x, y: mundo.y };
        camera.moverPor(dx, dy);
        faltaX -= dx;
        faltaY -= dy;
        // Bateu num limite da câmera (não andou o que devia): o que sobrou nesse eixo é descartado.
        if (Math.abs(mundo.x - antes.x - dx) > 0.01) faltaX = 0;
        if (Math.abs(mundo.y - antes.y - dy) > 0.01) faltaY = 0;
        if (faltaX === 0 && faltaY === 0) camera.pararDeslize();
    }

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
        aoMudarVisao: null,
        areaCoberta: null,
        get x() {
            return mundo.x;
        },
        get y() {
            return mundo.y;
        },

        restaurar(z, x, y) {
            camera.pararDeslize();
            zoom = limitar(z, ZOOM_MIN, ZOOM_MAX);
            mundo.scale.set(zoom);
            mundo.position.set(x, y);
            camera.limitar();
            camera.aoMudarZoom?.();
            camera.aoMudarVisao?.();
        },

        limitar() {
            mundo.x = limitarEixo(mundo.x, app.screen.width, larguraNaTela());
            mundo.y = limitarEixo(mundo.y, app.screen.height, alturaNaTela());
        },

        centralizar() {
            camera.pararDeslize();
            mundo.position.set((app.screen.width - larguraNaTela()) / 2, (app.screen.height - alturaNaTela()) / 2);
            camera.limitar();
            camera.aoMudarVisao?.();
        },

        ajustar() {
            camera.pararDeslize();
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
            camera.aoMudarVisao?.();
        },

        deslizarPor(dx, dy) {
            if (!deslizando) {
                deslizando = true;
                app.ticker.add(passoDoDeslize);
            }
            faltaX += dx;
            faltaY += dy;
        },

        pararDeslize() {
            if (deslizando) app.ticker.remove(passoDoDeslize);
            deslizando = false;
            faltaX = 0;
            faltaY = 0;
        },

        moverPor(dx, dy) {
            mundo.x += dx;
            mundo.y += dy;
            camera.limitar(); // impede de arrastar além dos limites
            camera.aoMudarVisao?.();
        },

        aplicarZoom(novoZoom, pontoFixo) {
            camera.pararDeslize();
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
            camera.aoMudarVisao?.();
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
