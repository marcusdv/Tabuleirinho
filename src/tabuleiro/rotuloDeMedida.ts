// =====================================================================
// O RÓTULO DE MEDIDA (a "caixa de distância"), compartilhado pela RÉGUA e pela prévia das ÁREAS (pedido do dono, 19/11/2026): duas linhas, os METROS em cima e, embaixo, o número de QUADRADOS seguido do
// SÍMBOLO do quadrado (o SVG do dono, `public/images/svgs/quadrado.svg`, e não a palavra "quadrados"). Ex.:  "6 m"  /  "4 ▢".
// O símbolo é o SVG pintado de BRANCO (o arquivo é preto; o fundo do rótulo é escuro) e vira uma textura, carregada uma vez; enquanto ela não chega, só o número aparece, e o rótulo se refaz quando ela chega.
// Quem usa escala o `container` por 1/zoom (o tamanho na tela fica o mesmo em qualquer zoom) e o põe no lugar.
// =====================================================================

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

/** O quadrado, em pixels do desenho do rótulo (a altura do texto). */
const LADO_DO_SIMBOLO = 15;
const TAMANHO_DA_TEXTURA = 96;

let textura: Texture | null = null;
let carregando: Promise<void> | null = null;
const aoCarregar = new Set<() => void>();

/** Lê o SVG do quadrado, pinta de branco e faz a textura (uma vez). Quem já criou rótulos é avisado para se refazer. */
function carregarSimbolo(): void {
    carregando ??= (async () => {
        try {
            const resposta = await fetch("/images/svgs/quadrado.svg");
            if (!resposta.ok) return;
            const branco = (await resposta.text()).replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, "#ffffff");
            const endereco = URL.createObjectURL(new Blob([branco], { type: "image/svg+xml" }));
            try {
                const imagem = new Image();
                imagem.src = endereco;
                await imagem.decode();
                const tela = document.createElement("canvas");
                tela.width = TAMANHO_DA_TEXTURA;
                tela.height = TAMANHO_DA_TEXTURA;
                tela.getContext("2d")?.drawImage(imagem, 0, 0, TAMANHO_DA_TEXTURA, TAMANHO_DA_TEXTURA);
                textura = Texture.from(tela);
            } finally {
                URL.revokeObjectURL(endereco);
            }
            for (const refazer of aoCarregar) refazer();
        } catch {
            /* sem o símbolo, o rótulo mostra só o número */
        }
    })();
}

export interface DadosDoRotulo {
    /** De quem é a medida (vazio na própria): vem antes dos metros ("Ana: 6 m"). */
    nome?: string;
    /** Os metros, já formatados ("6", "4,5"). */
    metros: string;
    /** Quantos quadrados. */
    casas: number;
    /** A cor do contorno do rótulo (0xRRGGBB). */
    cor: number;
}

export interface RotuloDeMedida {
    /** O rótulo pronto, com a origem no CENTRO dele. Escale por 1/zoom e posicione. */
    readonly container: Container;
    /** Refaz o texto, o símbolo e o fundo. */
    atualizar(dados: DadosDoRotulo): void;
    /** Para quem o criou: já não é mais preciso refazer quando o símbolo chegar. */
    destruir(): void;
}

export function criarRotuloDeMedida(): RotuloDeMedida {
    const container = new Container();
    const fundo = new Graphics();
    const estilo = { fontFamily: "system-ui, sans-serif", fontSize: 15, fontWeight: "600" as const, fill: 0xffffff, align: "center" as const };
    const linhaDeCima = new Text({ text: "", style: estilo });
    linhaDeCima.anchor.set(0.5, 0);
    const numero = new Text({ text: "", style: estilo });
    numero.anchor.set(0, 0);
    const simbolo = new Sprite();
    simbolo.width = LADO_DO_SIMBOLO;
    simbolo.height = LADO_DO_SIMBOLO;
    container.addChild(fundo, linhaDeCima, numero, simbolo);
    let ultimo: DadosDoRotulo | null = null;

    function atualizar(dados: DadosDoRotulo): void {
        ultimo = dados;
        carregarSimbolo();
        linhaDeCima.text = `${dados.nome ? `${dados.nome}: ` : ""}${dados.metros} m`;
        numero.text = String(dados.casas);
        const temSimbolo = textura !== null;
        if (temSimbolo) {
            simbolo.texture = textura as Texture;
            simbolo.width = LADO_DO_SIMBOLO;
            simbolo.height = LADO_DO_SIMBOLO;
        }
        simbolo.visible = temSimbolo;
        // A linha de baixo: o número, um espacinho e o quadrado, centralizados juntos.
        const folga = temSimbolo ? 4 : 0;
        const larguraDeBaixo = numero.width + (temSimbolo ? folga + LADO_DO_SIMBOLO : 0);
        const alturaDeBaixo = Math.max(numero.height, LADO_DO_SIMBOLO);
        const largura = Math.max(linhaDeCima.width, larguraDeBaixo) + 16;
        const altura = linhaDeCima.height + alturaDeBaixo + 8 + 2;
        const topo = -altura / 2;
        linhaDeCima.position.set(0, topo + 4);
        const yDeBaixo = topo + 4 + linhaDeCima.height + 2;
        numero.position.set(-larguraDeBaixo / 2, yDeBaixo + (alturaDeBaixo - numero.height) / 2);
        simbolo.position.set(-larguraDeBaixo / 2 + numero.width + folga, yDeBaixo + (alturaDeBaixo - LADO_DO_SIMBOLO) / 2);
        fundo.clear().roundRect(-largura / 2, topo, largura, altura, Math.min(12, altura / 2)).fill({ color: 0x1a1a1f, alpha: 0.92 }).stroke({ width: 1.5, color: dados.cor });
    }
    const refazer = (): void => {
        if (ultimo) atualizar(ultimo);
    };
    aoCarregar.add(refazer);

    return {
        container,
        atualizar,
        destruir() {
            aoCarregar.delete(refazer);
            container.destroy({ children: true });
        },
    };
}
