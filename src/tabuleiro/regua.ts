// =====================================================================
// RÉGUA: mede a distância de uma casa até outra, inclusive em CURVAS.
// O usuário arrasta (botão esquerdo apertado) do centro de uma casa ao centro de outra.
// A distância de cada trecho é a maior diferença entre colunas e linhas (a diagonal vale
// 1 casa), e cada casa vale METROS_POR_CASA metros. O resultado aparece sobre a linha e no painel.
//
// CURVAS: com o esquerdo apertado, clicar com o DIREITO fixa um ponto ali e a medida continua
// a partir dele. O total é a SOMA dos trechos (cada um medido separadamente).
//
// A medida NÃO é guardada no estado: fica na tela depois de soltar (para dar
// tempo de ler) e some ao começar outra medida ou trocar de ferramenta.
//
// COMPARTILHADA (18/11/2026): o caminho medido (os pontos, em casas) vai ao servidor e os OUTROS da cena veem a régua de quem mede, na cor dele.
// O desenho do caminho é `criarVisualDeMedida`, usado pela régua própria (dourada) e pelas dos outros (`reguasDosOutros.ts`).
// =====================================================================

import { Container, Graphics, type PointData } from "pixi.js";
import { COR_DA_MEDIDA_PADRAO, MAX_PONTOS_REGUA, TAMANHO_CASA, PX_MIN_ARRASTO_REGUA } from "../config";
import { limitar } from "../coordenadas";
import { distanciaEmCasas, metrosDaDistancia, textoDaDistancia } from "../desenhos";
import { criarRotuloDeMedida } from "./rotuloDeMedida";
import { estado } from "../estado";
import type { Camera } from "./camera";
import type { FerramentaDeArrasto } from "./ferramenta";

export interface OpcoesRegua {
    /** Começou uma medida nesta casa (o aperto do mouse): quem usa a régua para MOVER um token acha o token que está ali. */
    aoComecar?(casa: Casa): void;
    /** Soltou o mouse: `vertices` é o caminho que ficou na tela (os pontos fixados e a ponta), ou null se não houve medida (só um clique). */
    aoSoltar?(vertices: Casa[] | null): void;
    /** O caminho mudou (os vértices em casas, ou null quando a régua some): quem compartilha a régua com os outros escuta isto. */
    aoMudarCaminho?(vertices: Casa[] | null): void;
}

export interface Regua extends FerramentaDeArrasto {
    /** Liga/desliga a régua (desligando, a medida some). */
    definirAtiva(ativa: boolean): void;
    /** Redesenha a medida (o zoom mudou: o tamanho do texto e da linha na tela depende dele). */
    redesenhar(): void;
    /** O texto da medida que está à vista ("6 m\n4 quadrados"), ou null sem medida. A medida aparece só sobre o mapa (a caixa do painel Desenho não a mostra mais); isto serve aos testes. */
    readonly texto: string | null;
    /** A cor da régua: a cor de DESENHO escolhida agora (já redesenha a medida que está à vista). */
    definirCor(cor: number): void;
    /** Tira a medida da tela (a ferramenta continua ligada): usado depois que o token terminou de andar pelo caminho. */
    limpar(): void;
}

/** Um caminho de medida: os vértices em casas (o 1º é o começo; o último, a ponta). */
export interface Casa {
    col: number;
    row: number;
}

export interface VisualDeMedida {
    /** Desenha o caminho (`fixados` = quantos vértices do começo são pontos FIXADOS; o resto é a ponta que segue o mouse). Devolve o texto ("4 □ = 6 m"), ou null se sumiu (caminho null ou com menos de 2 vértices). */
    mostrar(vertices: Casa[] | null, fixados: number): string | null;
    /** Quem é o dono (mostra o nome ao lado do texto da distância; vazio = sem nome). */
    definirNome(nome: string): void;
    /** A cor da linha e do contorno do rótulo (vale no próximo desenho). */
    definirCor(cor: number): void;
}

/** A linha, os pontos e o rótulo de UMA medida, dentro do mundo (por cima de tudo). `cor` é a da linha e do contorno do rótulo. */
export function criarVisualDeMedida(camera: Camera, corInicial: number): VisualDeMedida {
    let cor = corInicial;
    const camada = new Container();
    camada.visible = false;
    camera.mundo.addChild(camada);

    const linha = new Graphics();
    // O rótulo (metros em cima; embaixo, os quadrados com o SÍMBOLO do quadrado) é o `rotuloDeMedida` compartilhado: o container dele é escalado por 1/zoom para manter o mesmo tamanho NA TELA em qualquer zoom.
    const rotuloDeMedida = criarRotuloDeMedida();
    const rotulo = rotuloDeMedida.container;
    camada.addChild(linha, rotulo);
    let nome = "";

    return {
        definirNome(novo) {
            nome = novo;
        },
        definirCor(nova) {
            cor = nova;
        },
        mostrar(vertices, fixados) {
            if (!vertices || vertices.length < 2) {
                camada.visible = false;
                return null;
            }
            // Re-adicionar ao mundo traz a régua para o TOPO (os tokens reordenados ficariam por cima).
            camera.mundo.addChild(camada);
            const z = camera.zoom;

            // Todos os vértices do caminho (os fixados + a ponta que segue o mouse), no CENTRO das casas, em pixels do mundo.
            const centros = vertices.map((c) => ({ x: (c.col + 0.5) * TAMANHO_CASA, y: (c.row + 0.5) * TAMANHO_CASA }));

            // A linha passa por todos os vértices. Espessuras divididas pelo zoom: mantêm o tamanho na tela.
            linha.clear();
            linha.moveTo(centros[0].x, centros[0].y);
            for (const c of centros.slice(1)) linha.lineTo(c.x, c.y);
            linha.stroke({ width: 3 / z, color: cor, cap: "round", join: "round" });
            centros.forEach((c, i) => {
                // As curvas fixadas (nem o começo, nem a ponta) ganham um anel em volta, para se verem.
                if (i > 0 && i < fixados) linha.circle(c.x, c.y, 11 / z).stroke({ width: 2 / z, color: cor });
                linha.circle(c.x, c.y, 6 / z).fill(cor).stroke({ width: 2 / z, color: 0x1a1a1f });
            });

            // O total é a SOMA dos trechos: cada um conta pela maior diferença entre colunas e linhas.
            let casas = 0;
            for (let i = 1; i < vertices.length; i++) {
                casas += distanciaEmCasas(vertices[i - 1].col, vertices[i - 1].row, vertices[i].col, vertices[i].row);
            }
            const mensagem = textoDaDistancia(casas); // (o texto "6 m" + "4 quadrados": serve aos testes; na tela o rótulo mostra o símbolo do quadrado)
            rotuloDeMedida.atualizar({ nome, metros: metrosDaDistancia(casas), casas, cor });
            rotulo.scale.set(1 / z);
            // O rótulo fica um pouco acima do meio do ÚLTIMO trecho (o que está sendo medido agora).
            const a = centros[centros.length - 2], b = centros[centros.length - 1];
            rotulo.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 40 / z); // (acima da linha: o rótulo tem duas linhas)

            camada.visible = true;
            return mensagem;
        },
    };
}

export function criarRegua(camera: Camera, opcoes: OpcoesRegua): Regua {
    const visual = criarVisualDeMedida(camera, COR_DA_MEDIDA_PADRAO);

    let ativa = false;
    let arrastando = false;
    let textoAtual: string | null = null; // o texto da medida à vista
    // O caminho: `pontos` são os vértices FIXADOS (o 1º é onde a medida começou; os outros, as curvas
    // fixadas com o botão direito) e `fim` é a ponta que acompanha o mouse. Vazio = sem medida.
    let pontos: Casa[] = [];
    let fim: Casa | null = null;
    let origemTela: PointData | null = null; // onde o mouse apertou (em pixels da tela): a régua só aparece depois de o mouse andar daqui

    /** A casa (coluna, linha) sob um ponto da TELA, limitada ao tabuleiro. */
    function casaEm(ponto: PointData): Casa {
        const m = camera.telaParaMundo(ponto);
        return {
            col: limitar(Math.floor(m.x / TAMANHO_CASA), 0, estado.colunas - 1),
            row: limitar(Math.floor(m.y / TAMANHO_CASA), 0, estado.linhas - 1),
        };
    }

    /** Redesenha (e conta a quem quiser saber: o painel, e a rede, que manda o caminho aos outros). */
    function desenhar(): void {
        const vertices = pontos.length > 0 && fim ? [...pontos, fim] : null;
        textoAtual = visual.mostrar(vertices, pontos.length);
        opcoes.aoMudarCaminho?.(vertices);
    }

    return {
        get ativa() {
            return ativa;
        },
        get medindo() {
            return arrastando;
        },
        get texto() {
            return textoAtual;
        },

        definirAtiva(nova) {
            ativa = nova;
            if (!nova) {
                arrastando = false;
                pontos = [];
                fim = null;
                desenhar(); // some
            }
        },

        redesenhar: desenhar,

        limpar() {
            arrastando = false;
            origemTela = null;
            pontos = [];
            fim = null;
            desenhar(); // some (e a rede avisa os outros)
        },

        definirCor(cor) {
            visual.definirCor(cor);
            if (fim) desenhar();
        },

        comecar(ponto) {
            if (!ativa) return;
            arrastando = true;
            const comeco = casaEm(ponto);
            pontos = [comeco]; // uma medida nova apaga a anterior (e suas curvas)
            fim = null; // NADA aparece ao clicar: a régua só surge quando o mouse é ARRASTADO (pedido do dono, 17/11/2026)
            origemTela = { x: ponto.x, y: ponto.y };
            desenhar();
            opcoes.aoComecar?.(comeco);
        },

        arrastar(ponto) {
            if (!arrastando) return;
            // Enquanto a régua ainda não apareceu, o mouse precisa andar um pouco (um tremor do clique não conta).
            if (fim === null && (!origemTela || Math.hypot(ponto.x - origemTela.x, ponto.y - origemTela.y) < PX_MIN_ARRASTO_REGUA)) return;
            fim = casaEm(ponto);
            desenhar();
        },

        soltar() {
            arrastando = false; // a medida continua na tela (se nunca foi arrastada, não há medida)
            origemTela = null;
            const vertices = pontos.length > 0 && fim ? [...pontos, fim] : null;
            if (fim === null) pontos = [];
            opcoes.aoSoltar?.(vertices);
        },

        // Botão direito no meio da medida: fixa um ponto onde a ponta está e a medida segue dali.
        cliqueDireito() {
            if (!arrastando || !fim) return;
            const ultimo = pontos[pontos.length - 1];
            if (ultimo.col === fim.col && ultimo.row === fim.row) return; // aquela casa já é um ponto fixo
            if (pontos.length >= MAX_PONTOS_REGUA) return;
            pontos.push({ ...fim });
            desenhar();
        },
    };
}
