// =====================================================================
// INTERAÇÃO: os eventos do mouse no "palco" inteiro (stage) do PixiJS.
//   - PAN (mover a visão), em QUALQUER situação (com ou sem ferramenta, até sobre um token): o botão do MEIO do mouse arrastado, ou a barra de ESPAÇO segurada + botão esquerdo
//     (pedido do dono, 18/11/2026). No CELULAR (toque), um dedo arrastando o espaço vazio move a visão.
//   - SETAS: movem a visão uma casa por toque (deslizando). Ao soltar um arrasto em movimento, a câmera ainda desliza um pouco (inércia).
//   - SHIFT + esquerdo: PING. Um clique faz o ping comum; arrastar abre a RODA DE PINGS (ui/rodaPing.ts) e soltar faz o ping do lado apontado. Vale com qualquer ferramenta e sobre tokens.
//   - BOTÃO DIREITO no vazio: abre o menu do mapa (Ping, Régua, Borracha e, para o mestre, os pincéis do fog); no meio de uma medida da régua, fixa um ponto.
//   - SELEÇÃO: Ctrl + esquerdo arrastado no vazio desenha o retângulo que seleciona tokens; o esquerdo sozinho no vazio só tira a seleção.
//   - Repassa o movimento do mouse e o soltar para os tokens (arrasto).
//   - Com uma FERRAMENTA ligada (calibrar grade, régua, lápis, borracha, formas, áreas): o botão esquerdo é dela.
//   - Exceção: no MEIO de uma medida (esquerdo apertado), o clique DIREITO vai para a
//     ferramenta (cliqueDireito): a régua fixa um ponto e continua medindo.
//
// Por que mover e soltar ficam no stage e não no token? Se o mouse anda rápido,
// ele sai de cima do token por um instante, e o token deixaria de receber
// eventos. No stage, que cobre a tela toda, sempre recebemos.
// =====================================================================

import { Application, FederatedPointerEvent } from "pixi.js";
import type { FerramentaDeArrasto } from "./ferramenta";
import type { Camera } from "./camera";
import type { CamadaTokens } from "./tokens";
import { FATOR_INERCIA_PAN, MS_JANELA_VELOCIDADE_PAN, TAMANHO_CASA, VELOCIDADE_MIN_INERCIA_PAN } from "../config";

export interface OpcoesInteracao {
    /** Clicou (com qualquer botão) num espaço vazio do tabuleiro. */
    aoClicarNoFundo(): void;
    /** Um pan (arrastar a visão) começou. */
    aoIniciarPan(): void;
    /** O pan terminou (soltou o botão). */
    aoTerminarPan(): void;
    /** Shift + botão esquerdo apertado: começa o gesto do PING (clique = ping comum; arrastar abre a roda de pings). `ponto` em pixels da tela (do canvas). */
    aoComecarPing(ponto: { x: number; y: number }): void;
    /** O mouse andou com o gesto do ping em andamento. */
    aoMoverPing(ponto: { x: number; y: number }): void;
    /** Soltou o botão: o gesto do ping terminou. */
    aoTerminarPing(ponto: { x: number; y: number }): void;
    /** Botão DIREITO apertado num espaço vazio do mapa (fora de uma medida da régua em andamento): abre o menu do mapa. `ponto` é em pixels da tela (do canvas). */
    aoClicarDireitoNoVazio(ponto: { x: number; y: number }): void;
}

export function ativarInteracao(
    app: Application,
    camera: Camera,
    tokens: CamadaTokens,
    ferramentas: FerramentaDeArrasto[],
    opcoes: OpcoesInteracao,
): void {
    app.stage.eventMode = "static";
    // hitArea define a região que "conta" para eventos: a tela toda.
    app.stage.hitArea = app.screen;

    // O botão direito normalmente abre o menu do navegador. Aqui ele é usado
    // para abrir as opções do token, então desligamos o menu padrão no canvas.
    app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // O gesto do PING (Shift + esquerdo) está em andamento?
    let pingando = false;

    // Última posição do mouse NA TELA enquanto o pan está ativo. null = sem pan.
    let panning: { x: number; y: number } | null = null;

    /** A ferramenta ligada agora (no máximo uma; quem liga uma desliga as outras). */
    const ferramentaLigada = (): FerramentaDeArrasto | undefined => ferramentas.find((f) => f.ativa);
    /** A ferramenta que está no meio de um arrasto. */
    const ferramentaArrastando = (): FerramentaDeArrasto | undefined => ferramentas.find((f) => f.medindo);

    // O botão direito está apertado AGORA? Evita tratar o mesmo aperto duas vezes.
    let direitoApertado = false;

    /**
     * Botão direito apertado no meio de um arrasto: se a ferramenta usa isso (a régua), ela recebe
     * o aviso. Devolve true se ela tratou (então o evento NÃO deve virar pan nem outra coisa).
     */
    function fixarPonto(): boolean {
        const ferramenta = ferramentaArrastando();
        if (!ferramenta?.cliqueDireito) return false;
        ferramenta.cliqueDireito();
        return true;
    }

    // As últimas posições do mouse durante o pan (com a hora), para medir a velocidade ao soltar e dar a INÉRCIA.
    let amostras: { t: number; x: number; y: number }[] = [];

    /** Ao soltar um pan em movimento, a câmera continua deslizando um pouco (se o mouse parou antes de soltar, ou andava devagar, não desliza). */
    function darInercia(agora: number): void {
        const todas = amostras;
        amostras = [];
        if (todas.length < 2) return;
        const ultima = todas[todas.length - 1];
        if (agora - ultima.t > MS_JANELA_VELOCIDADE_PAN) return; // o mouse ficou parado antes de soltar: pára onde está
        // A velocidade vem das amostras dos últimos ms ANTES da última (no mínimo as duas últimas: com a tela pesada os eventos chegam espaçados).
        let usadas = todas.filter((a) => ultima.t - a.t <= MS_JANELA_VELOCIDADE_PAN);
        if (usadas.length < 2) usadas = todas.slice(-2);
        const primeira = usadas[0];
        const ms = ultima.t - primeira.t;
        if (ms <= 0) return;
        const vx = (ultima.x - primeira.x) / ms;
        const vy = (ultima.y - primeira.y) / ms;
        if (Math.hypot(vx, vy) < VELOCIDADE_MIN_INERCIA_PAN) return;
        camera.deslizarPor(vx * FATOR_INERCIA_PAN, vy * FATOR_INERCIA_PAN);
    }

    /** A hora em que o NAVEGADOR gerou o evento (não a de quando o Pixi o processou, que se atrasa quando a tela está pesada). */
    const horaDe = (evento: FederatedPointerEvent): number => "timeStamp" in evento.nativeEvent ? evento.nativeEvent.timeStamp : performance.now();

    /** Começa o pan a partir deste ponto. */
    function comecarPan(evento: FederatedPointerEvent): void {
        camera.pararDeslize(); // (agarrar a tela pára um deslize em andamento)
        panning = { x: evento.global.x, y: evento.global.y };
        amostras = [{ t: horaDe(evento), x: evento.global.x, y: evento.global.y }];
        app.stage.cursor = "grabbing";
        opcoes.aoIniciarPan();
    }

    // O botão do meio faz o navegador abrir o "rolar automático" (em alguns sistemas): desligamos no canvas.
    app.canvas.addEventListener("mousedown", (e) => {
        if (e.button === 1) e.preventDefault();
    });

    // --- Barra de ESPAÇO segurada = o botão esquerdo vira "arrastar a tela". Ignorada enquanto se digita num campo (chat, ficha, nomes...). ---
    let espaco = false;
    const digitando = (alvo: EventTarget | null): boolean =>
        alvo instanceof HTMLElement && (alvo.isContentEditable || alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT");
    const cursorParado = (): string => (espaco ? "grab" : ferramentaLigada() ? "crosshair" : "default");
    document.addEventListener("keydown", (e) => {
        if (e.code !== "Space" || digitando(e.target)) return;
        e.preventDefault(); // (sem isto o espaço "clicaria" no botão que estiver com o foco)
        if (e.repeat || espaco) return;
        espaco = true;
        if (!panning) app.stage.cursor = cursorParado();
    });
    document.addEventListener("keyup", (e) => {
        if (e.code !== "Space") return;
        if (!digitando(e.target)) e.preventDefault();
        espaco = false;
        if (!panning) app.stage.cursor = cursorParado();
    });
    // --- SETAS: movem a visão UMA CASA por toque, no sentido da seta (segurar repete). Só quando o foco não está num campo, botão, aba ou janela (as setas lá têm outro uso). ---
    const sentidoDaSeta: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }; // (a seta para a direita mostra o que está à direita: o mundo anda para a esquerda)
    document.addEventListener("keydown", (e) => {
        const sentido = sentidoDaSeta[e.key];
        if (!sentido || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (e.target !== document.body && e.target !== app.canvas) return; // (o foco está em outra coisa: ela cuida das setas)
        e.preventDefault();
        const passo = TAMANHO_CASA * camera.zoom;
        camera.deslizarPor(sentido[0] * passo, sentido[1] * passo);
    });

    // Se a janela perde o foco com o espaço apertado, o "soltou" nunca chega: desliga para não ficar preso.
    window.addEventListener("blur", () => {
        espaco = false;
        if (!panning) app.stage.cursor = cursorParado();
    });

    // PAN com o botão do MEIO, ou com o ESQUERDO + espaço. Fica na fase de CAPTURA e interrompe o evento: assim um token ou uma ferramenta embaixo do mouse NÃO o recebem.
    app.stage.on("pointerdowncapture", (evento: FederatedPointerEvent) => {
        const doMeio = evento.button === 1;
        const comEspaco = evento.button === 0 && espaco;
        // Shift + esquerdo (sem espaço): o gesto do PING. Também interrompe o evento, para valer com qualquer ferramenta e em cima de um token.
        const comShift = evento.button === 0 && evento.shiftKey && !espaco;
        if (!doMeio && !comEspaco && !comShift) return;
        evento.stopPropagation();
        opcoes.aoClicarNoFundo();
        if (comShift) {
            pingando = true;
            opcoes.aoComecarPing({ x: evento.global.x, y: evento.global.y });
            return;
        }
        comecarPan(evento);
    });

    app.stage.on("pointerdown", (evento: FederatedPointerEvent) => {
        // evento.target é quem recebeu o clique. Se for o próprio stage, o clique
        // foi num espaço vazio (e não num token).
        if (evento.target === app.stage && evento.button === 0 && !ferramentaLigada()) {
            opcoes.aoClicarNoFundo();
            tokens.limparSelecao();
            // Toque (celular): um dedo no vazio move a visão (não há botão do meio nem espaço). Mouse: só o Ctrl + esquerdo começa o retângulo de seleção (o esquerdo sozinho só tira a seleção).
            if (evento.pointerType === "touch") comecarPan(evento);
            else if (evento.ctrlKey || evento.metaKey) tokens.iniciarRetangulo(evento.global);
            return;
        }
        if (evento.target === app.stage) opcoes.aoClicarNoFundo();

        // Botão DIREITO: no meio de uma medida da régua fixa um ponto; num espaço vazio, abre o menu do mapa (Ping, Régua, Borracha...); em cima de um token quem trata é o token.
        if (evento.button === 2) {
            if (direitoApertado) return;
            direitoApertado = true;
            if (fixarPonto()) return;
            if (evento.target === app.stage) opcoes.aoClicarDireitoNoVazio({ x: evento.global.x, y: evento.global.y });
            return;
        }

        // Com uma ferramenta ligada, o botão esquerdo é DELA.
        const ferramenta = ferramentaLigada();
        if (ferramenta && evento.button === 0) ferramenta.comecar(evento.global);
    });

    app.stage.on("pointermove", (evento: FederatedPointerEvent) => {
        // Apertar um SEGUNDO botão com o primeiro já apertado NÃO gera "pointerdown" (regra dos eventos
        // de ponteiro): chega como "pointermove" com `button` = o botão que mudou e `buttons` = os que
        // estão apertados agora. É assim que pegamos o direito apertado com o esquerdo segurando.
        if (evento.button === 2) {
            const apertado = (evento.buttons & 2) !== 0;
            if (apertado && !direitoApertado) {
                direitoApertado = true;
                if (fixarPonto()) return;
            } else if (!apertado) {
                direitoApertado = false;
            }
        }
        if (pingando) {
            opcoes.aoMoverPing({ x: evento.global.x, y: evento.global.y });
            return;
        }
        if (tokens.selecionando) {
            tokens.arrastarRetangulo(evento.global);
            return;
        }
        if (panning) {
            // Move a câmera pela DIFERENÇA entre a posição atual do mouse e a
            // anterior. Usamos coordenadas da tela (global), não do mundo,
            // porque é o próprio mundo que está se movendo.
            camera.moverPor(evento.global.x - panning.x, evento.global.y - panning.y);
            panning = { x: evento.global.x, y: evento.global.y };
            amostras.push({ t: horaDe(evento), x: evento.global.x, y: evento.global.y });
            if (amostras.length > 12) amostras.shift();
            return;
        }
        const arrastando = ferramentaArrastando();
        if (arrastando) {
            arrastando.arrastar(evento.global);
            return;
        }
        ferramentaLigada()?.passar?.(evento.global); // (sem botão apertado: a ferramenta de área mostra o "fantasma" junto ao cursor)
        tokens.arrastarPara(evento.global);
    });

    function soltar(evento?: FederatedPointerEvent): void {
        if (evento?.button === 2) direitoApertado = false;
        if (pingando) {
            pingando = false;
            if (evento) opcoes.aoTerminarPing({ x: evento.global.x, y: evento.global.y });
            return;
        }
        if (tokens.selecionando) {
            tokens.soltarRetangulo();
            return;
        }
        if (panning) {
            // Era um pan: apenas encerra, não há token para encaixar.
            panning = null;
            darInercia(evento ? horaDe(evento) : performance.now());
            opcoes.aoTerminarPan();
            app.stage.cursor = cursorParado();
            return;
        }
        const arrastando = ferramentaArrastando();
        if (arrastando) {
            arrastando.soltar();
            return;
        }
        tokens.soltar();
    }
    // "pointerup": soltou dentro da janela. "pointerupoutside": soltou fora
    // do canvas (ex.: o mouse saiu da janela). Tratamos os dois igual.
    app.stage.on("pointerup", soltar);
    app.stage.on("pointerupoutside", soltar);
}
