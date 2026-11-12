// =====================================================================
// INTERAÇÃO: os eventos do mouse no "palco" inteiro (stage) do PixiJS.
//   - PAN: arrastar um espaço vazio move a visão sobre o tabuleiro.
//   - Repassa o movimento do mouse e o soltar para os tokens (arrasto).
//   - Com uma FERRAMENTA ligada (calibrar grade, régua, lápis, borracha, formas):
//     o botão esquerdo é dela, e o direito ou o do meio faz o pan.
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

export interface OpcoesInteracao {
    /** Clicou (com qualquer botão) num espaço vazio do tabuleiro. */
    aoClicarNoFundo(): void;
    /** Um pan (arrastar a visão) começou. */
    aoIniciarPan(): void;
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

    app.stage.on("pointerdown", (evento: FederatedPointerEvent) => {
        // evento.target é quem recebeu o clique. Se for o próprio stage, o clique
        // foi num espaço vazio (e não num token).
        if (evento.target === app.stage) opcoes.aoClicarNoFundo();

        const ferramenta = ferramentaLigada();
        if (ferramenta) {
            // Com uma ferramenta ligada, o botão esquerdo é DELA; os outros caem no pan, logo abaixo.
            if (evento.button === 0) {
                ferramenta.comecar(evento.global);
                return;
            }
            // Direito com uma medida em andamento: fixa um ponto em vez de mover a visão.
            if (evento.button === 2 && !direitoApertado) {
                direitoApertado = true;
                if (fixarPonto()) return;
            }
        } else if (evento.button !== 0) {
            return; // normal: só o botão esquerdo faz pan
        }
        // O token trata o seu pointerdown primeiro; depois o evento "sobe" até o
        // stage (bubbling). Se um token acabou de ser pego, NÃO iniciamos o pan.
        if (tokens.arrastando) return;

        panning = { x: evento.global.x, y: evento.global.y };
        app.stage.cursor = "grabbing";
        opcoes.aoIniciarPan();
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
        if (panning) {
            // Move a câmera pela DIFERENÇA entre a posição atual do mouse e a
            // anterior. Usamos coordenadas da tela (global), não do mundo,
            // porque é o próprio mundo que está se movendo.
            camera.moverPor(evento.global.x - panning.x, evento.global.y - panning.y);
            panning = { x: evento.global.x, y: evento.global.y };
            return;
        }
        const arrastando = ferramentaArrastando();
        if (arrastando) {
            arrastando.arrastar(evento.global);
            return;
        }
        tokens.arrastarPara(evento.global);
    });

    function soltar(evento?: FederatedPointerEvent): void {
        if (evento?.button === 2) direitoApertado = false;
        if (panning) {
            // Era um pan: apenas encerra, não há token para encaixar.
            panning = null;
            app.stage.cursor = ferramentaLigada() ? "crosshair" : "default";
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
