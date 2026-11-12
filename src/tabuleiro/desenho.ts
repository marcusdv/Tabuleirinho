// =====================================================================
// DESENHO: as pinturas no mapa, feitas com lápis, borracha e formas
// (elipse, retângulo e triângulo, só contorno).
//   - Os DADOS (estado.desenhos) moram em estado.ts, em CASAS.
//   - Aqui ficam o desenho na tela e o gesto do mouse (arrastar).
//
// Como cada ferramenta funciona:
//   lápis      grava os pontos por onde o mouse passa e vira um traço
//   elipse     arrasta de um CANTO até o canto oposto da caixa onde ela cabe
//   retângulo  arrasta de um CANTO até o canto oposto (a própria caixa)
//   triângulo  arrasta os cantos da caixa onde ele cabe (ponta em cima, no meio)
//   borracha   apaga o desenho INTEIRO cujo contorno ela tocar
//
// Durante o arrasto aparece uma PRÉVIA; ao soltar, o desenho entra no estado.
// As pinturas ficam por cima do mapa e da grade e por BAIXO dos tokens.
// =====================================================================

import { Graphics, type PointData } from "pixi.js";
import {
    COR_INICIAL_DESENHO,
    DISTANCIA_MIN_PONTO,
    ESPESSURA_DESENHO,
    RAIO_BORRACHA,
    TAMANHO_CASA,
    TAMANHO_MIN_FORMA,
} from "../config";
import { desenhoAtingido, verticesDoTriangulo } from "../desenhos";
import { adicionarDesenho, estado, removerDesenhos, type NovoDesenho, type Ponto } from "../estado";
import type { Camera } from "./camera";
import type { FerramentaDeArrasto } from "./ferramenta";

export type FerramentaDesenho = "lapis" | "borracha" | "elipse" | "retangulo" | "triangulo";

export interface OpcoesDesenho {
    /** As pinturas do estado mudaram (a interface atualiza, por exemplo, o botão "Apagar tudo"). */
    aoMudar(): void;
    /** Uma pintura nova foi criada com esta cor (a interface guarda a cor entre as recentes). */
    aoCriar(cor: number): void;
}

export interface CamadaDesenho extends FerramentaDeArrasto {
    /** Escolhe a ferramenta de desenho (null = nenhuma, as pinturas só são exibidas). */
    definirFerramenta(ferramenta: FerramentaDesenho | null): void;
    /** Cor (0xRRGGBB) das próximas pinturas. */
    definirCor(cor: number): void;
    /** Refaz todas as pinturas a partir do estado (ex.: depois de "Apagar tudo"). */
    redesenhar(): void;
}

export function criarDesenho(camera: Camera, opcoes: OpcoesDesenho): CamadaDesenho {
    // Duas camadas: as pinturas prontas e a prévia do que está sendo arrastado.
    // Criadas ANTES dos tokens (main.ts), então ficam por baixo deles.
    const fixos = new Graphics();
    const previa = new Graphics();
    camera.mundo.addChild(fixos, previa);

    let ferramenta: FerramentaDesenho | null = null;
    let cor = COR_INICIAL_DESENHO;

    // O gesto em andamento (null = nada sendo arrastado). Tudo em CASAS.
    let inicio: Ponto | null = null;
    let fim: Ponto | null = null;
    let pontos: Ponto[] = []; // traço do lápis

    /** Ponto da TELA -> ponto em casas. */
    function emCasas(ponto: PointData): Ponto {
        const m = camera.telaParaMundo(ponto);
        return { x: m.x / TAMANHO_CASA, y: m.y / TAMANHO_CASA };
    }

    /** Desenha UMA pintura (pronta ou prévia) num Graphics. */
    function desenharUm(g: Graphics, d: NovoDesenho): void {
        const T = TAMANHO_CASA;
        switch (d.tipo) {
            case "livre":
                if (d.pontos.length === 1) {
                    // Um clique sem arrastar vira um pontinho.
                    g.circle(d.pontos[0].x * T, d.pontos[0].y * T, ESPESSURA_DESENHO / 2).fill(d.cor);
                    return;
                }
                g.moveTo(d.pontos[0].x * T, d.pontos[0].y * T);
                for (const p of d.pontos.slice(1)) g.lineTo(p.x * T, p.y * T);
                g.stroke({ width: ESPESSURA_DESENHO, color: d.cor, cap: "round", join: "round" });
                return;
            case "elipse":
                // ellipse(centro x, centro y, raio horizontal, raio vertical)
                g.ellipse((d.x + d.largura / 2) * T, (d.y + d.altura / 2) * T, (d.largura / 2) * T, (d.altura / 2) * T);
                break;
            case "retangulo":
                g.rect(d.x * T, d.y * T, d.largura * T, d.altura * T);
                break;
            case "triangulo":
                g.poly(verticesDoTriangulo(d).flatMap((v) => [v.x * T, v.y * T]));
                break;
        }
        // Formas: só o CONTORNO na cor escolhida (sem preenchimento).
        g.stroke({ width: ESPESSURA_DESENHO, color: d.cor, join: "round" });
    }

    function redesenhar(): void {
        fixos.clear();
        for (const d of estado.desenhos) desenharUm(fixos, d);
    }

    /** O desenho que o gesto atual produziria (ou null se é pequeno demais / não é de desenhar). */
    function formaAtual(): NovoDesenho | null {
        if (!ferramenta || !inicio || !fim) return null;
        const minimo = TAMANHO_MIN_FORMA / TAMANHO_CASA; // em casas
        const dx = fim.x - inicio.x;
        const dy = fim.y - inicio.y;

        switch (ferramenta) {
            case "lapis":
                return { tipo: "livre", cor, pontos: [...pontos] };
            case "elipse":
            case "retangulo":
            case "triangulo": {
                // As três são definidas pela CAIXA entre o ponto onde apertou e o ponto atual
                // (funciona arrastando para qualquer lado).
                const largura = Math.abs(dx);
                const altura = Math.abs(dy);
                if (largura < minimo || altura < minimo) return null; // pequeno demais: é um clique, ou uma linha
                return { tipo: ferramenta, cor, x: Math.min(inicio.x, fim.x), y: Math.min(inicio.y, fim.y), largura, altura };
            }
            default:
                return null; // borracha não produz desenho
        }
    }

    function desenharPrevia(): void {
        previa.clear();
        const forma = formaAtual();
        if (forma) desenharUm(previa, forma);
    }

    /** A borracha, com centro em `p`, apaga os desenhos que toca. */
    function apagarEm(p: Ponto): void {
        // O alcance é fixo NA TELA (RAIO_BORRACHA px): em casas, depende do zoom.
        const folga = RAIO_BORRACHA / camera.zoom / TAMANHO_CASA;
        const ids = estado.desenhos.filter((d) => desenhoAtingido(d, p, folga)).map((d) => d.id);
        if (ids.length === 0) return;
        removerDesenhos(ids);
        redesenhar();
        opcoes.aoMudar();
    }

    /** Apaga também ENTRE dois pontos: com o mouse rápido, os eventos pulam e a borracha deixaria falhas. */
    function apagarAoLongo(a: Ponto, b: Ponto): void {
        const passo = RAIO_BORRACHA / camera.zoom / TAMANHO_CASA / 2;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / passo));
        for (let i = 1; i <= n; i++) apagarEm({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
    }

    function cancelarGesto(): void {
        inicio = null;
        fim = null;
        pontos = [];
        previa.clear();
    }

    redesenhar();

    return {
        get ativa() {
            return ferramenta !== null;
        },
        get medindo() {
            return inicio !== null;
        },

        definirFerramenta(nova) {
            ferramenta = nova;
            cancelarGesto();
        },
        definirCor(nova) {
            cor = nova;
        },
        redesenhar,

        comecar(ponto) {
            if (!ferramenta) return;
            inicio = emCasas(ponto);
            fim = inicio;
            pontos = [inicio];
            if (ferramenta === "borracha") apagarEm(inicio);
            else desenharPrevia();
        },

        arrastar(ponto) {
            if (!ferramenta || !inicio || !fim) return;
            const anterior = fim;
            fim = emCasas(ponto);

            if (ferramenta === "borracha") {
                apagarAoLongo(anterior, fim);
                return;
            }
            if (ferramenta === "lapis") {
                // Só grava um novo ponto depois de andar o suficiente (evita milhares de pontos).
                const ultimo = pontos[pontos.length - 1];
                if (Math.hypot(fim.x - ultimo.x, fim.y - ultimo.y) * TAMANHO_CASA >= DISTANCIA_MIN_PONTO) pontos.push(fim);
            }
            desenharPrevia();
        },

        soltar() {
            const forma = ferramenta === "borracha" ? null : formaAtual();
            cancelarGesto();
            if (!forma) return;
            adicionarDesenho(forma); // 1) estado
            redesenhar(); // 2) desenho
            opcoes.aoMudar();
            opcoes.aoCriar(forma.cor);
        },
    };
}
