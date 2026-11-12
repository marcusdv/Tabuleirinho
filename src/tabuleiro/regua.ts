// =====================================================================
// RÉGUA: mede a distância de uma casa até outra.
// O usuário arrasta do centro de uma casa ao centro de outra. A distância é a
// maior diferença entre colunas e linhas (a diagonal vale 1 casa), e cada casa
// vale METROS_POR_CASA metros. O resultado aparece sobre a linha e no painel.
//
// A medida NÃO é guardada no estado: fica na tela depois de soltar (para dar
// tempo de ler) e some ao começar outra medida ou trocar de ferramenta.
// =====================================================================

import { Container, Graphics, Text, type PointData } from "pixi.js";
import { TAMANHO_CASA } from "../config";
import { limitar } from "../coordenadas";
import { distanciaEmCasas, textoDaDistancia } from "../desenhos";
import { estado } from "../estado";
import type { Camera } from "./camera";
import type { FerramentaDeArrasto } from "./ferramenta";

const COR_REGUA = 0xffd54f;

export interface OpcoesRegua {
    /** A medida mudou: o texto ("4 casas = 6 m"), ou null quando a régua some. */
    aoMedir(texto: string | null): void;
}

export interface Regua extends FerramentaDeArrasto {
    /** Liga/desliga a régua (desligando, a medida some). */
    definirAtiva(ativa: boolean): void;
    /** Redesenha a medida (o zoom mudou: o tamanho do texto e da linha na tela depende dele). */
    redesenhar(): void;
}

interface Casa {
    col: number;
    row: number;
}

export function criarRegua(camera: Camera, opcoes: OpcoesRegua): Regua {
    const camada = new Container();
    camada.visible = false;
    camera.mundo.addChild(camada);

    const linha = new Graphics();
    // O rótulo (texto + fundo) fica num Container à parte para podermos escalá-lo por 1/zoom:
    // assim ele mantém o mesmo tamanho NA TELA em qualquer zoom.
    const rotulo = new Container();
    const fundo = new Graphics();
    const texto = new Text({ text: "", style: { fontFamily: "system-ui, sans-serif", fontSize: 15, fontWeight: "600", fill: 0xffffff } });
    texto.anchor.set(0.5);
    rotulo.addChild(fundo, texto);
    camada.addChild(linha, rotulo);

    let ativa = false;
    let arrastando = false;
    let inicio: Casa | null = null;
    let fim: Casa | null = null;

    /** A casa (coluna, linha) sob um ponto da TELA, limitada ao tabuleiro. */
    function casaEm(ponto: PointData): Casa {
        const m = camera.telaParaMundo(ponto);
        return {
            col: limitar(Math.floor(m.x / TAMANHO_CASA), 0, estado.colunas - 1),
            row: limitar(Math.floor(m.y / TAMANHO_CASA), 0, estado.linhas - 1),
        };
    }

    function desenhar(): void {
        if (!inicio || !fim) {
            camada.visible = false;
            opcoes.aoMedir(null);
            return;
        }
        // Re-adicionar ao mundo traz a régua para o TOPO (os tokens reordenados ficariam por cima).
        camera.mundo.addChild(camada);
        const z = camera.zoom;

        // Centros das duas casas, em pixels do mundo.
        const x0 = (inicio.col + 0.5) * TAMANHO_CASA;
        const y0 = (inicio.row + 0.5) * TAMANHO_CASA;
        const x1 = (fim.col + 0.5) * TAMANHO_CASA;
        const y1 = (fim.row + 0.5) * TAMANHO_CASA;

        // Espessuras divididas pelo zoom: a linha e as bolinhas mantêm o tamanho na tela.
        linha.clear();
        linha.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 3 / z, color: COR_REGUA, cap: "round" });
        for (const [x, y] of [[x0, y0], [x1, y1]]) {
            linha.circle(x, y, 6 / z).fill(COR_REGUA).stroke({ width: 2 / z, color: 0x1a1a1f });
        }

        const mensagem = textoDaDistancia(distanciaEmCasas(inicio.col, inicio.row, fim.col, fim.row));
        texto.text = mensagem;
        const larguraRotulo = texto.width + 16;
        const alturaRotulo = texto.height + 8;
        fundo.clear().roundRect(-larguraRotulo / 2, -alturaRotulo / 2, larguraRotulo, alturaRotulo, alturaRotulo / 2)
            .fill({ color: 0x1a1a1f, alpha: 0.92 })
            .stroke({ width: 1.5, color: COR_REGUA });
        rotulo.scale.set(1 / z);
        rotulo.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 24 / z); // um pouco acima do meio da linha

        camada.visible = true;
        opcoes.aoMedir(mensagem);
    }

    return {
        get ativa() {
            return ativa;
        },
        get medindo() {
            return arrastando;
        },

        definirAtiva(nova) {
            ativa = nova;
            if (!nova) {
                arrastando = false;
                inicio = null;
                fim = null;
                desenhar(); // some
            }
        },

        redesenhar: desenhar,

        comecar(ponto) {
            if (!ativa) return;
            arrastando = true;
            inicio = casaEm(ponto);
            fim = inicio;
            desenhar();
        },

        arrastar(ponto) {
            if (!arrastando) return;
            fim = casaEm(ponto);
            desenhar();
        },

        soltar() {
            arrastando = false; // a medida continua na tela
        },
    };
}
