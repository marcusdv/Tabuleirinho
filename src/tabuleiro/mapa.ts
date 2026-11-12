// =====================================================================
// MAPA: a imagem de fundo do tabuleiro.
// A imagem fica PRESA ao tabuleiro: ela é esticada para cobrir todas as
// colunas e linhas. Assim, ao aumentar ou diminuir colunas/linhas pela barra,
// as casas mudam de tamanho em relação à imagem, e o usuário ajusta até os
// quadrados do mapa coincidirem com os da grade.
// (Por isso a imagem não deve ter margens nem bordas: elas deslocariam a grade.)
// =====================================================================

import { Assets, Sprite, Texture } from "pixi.js";
import { TAMANHO_CASA } from "../config";
import { definirMapa, estado } from "../estado";
import type { Camera } from "./camera";

export interface Mapa {
    /** Refaz o tamanho da imagem conforme colunas e linhas atuais. */
    ajustar(): void;
    /** Carrega a imagem de estado.mapa (ou remove o fundo se for null). */
    carregar(): Promise<void>;
    /**
     * Troca o mapa por uma imagem escolhida pelo usuário (arquivo do computador).
     * Devolve null se deu certo, ou o texto do problema (e o mapa atual continua).
     */
    carregarArquivo(arquivo: File): Promise<string | null>;
}

/**
 * Maior largura/altura de imagem que a placa de vídeo aceita (geralmente 4096 a 16384).
 * Imagens maiores não funcionam como textura, então recusamos com um aviso.
 * Perguntamos a um WebGL temporário, porque o PixiJS não expõe esse número.
 */
function limiteDeTextura(): number {
    const gl = document.createElement("canvas").getContext("webgl");
    return gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 4096;
}

export function criarMapa(camera: Camera): Mapa {
    // Sprite = uma imagem desenhada na cena. Começa invisível até a textura chegar.
    const imagem = new Sprite();
    imagem.visible = false;

    // Adicionado ANTES da grade (ver main.ts), então fica por baixo dela e dos tokens.
    camera.mundo.addChild(imagem);

    function ajustar(): void {
        // width/height do Sprite o ESTICAM até o tamanho pedido (sem manter a proporção):
        // é isso que faz a imagem acompanhar o tabuleiro.
        imagem.width = estado.colunas * TAMANHO_CASA;
        imagem.height = estado.linhas * TAMANHO_CASA;
    }

    async function carregar(): Promise<void> {
        if (!estado.mapa) {
            imagem.visible = false;
            return;
        }
        try {
            const textura = await Assets.load<Texture>(estado.mapa.url);
            // Mipmaps: sem eles a imagem serrilha quando o zoom a reduz bastante.
            textura.source.autoGenerateMipmaps = true;
            imagem.texture = textura;
            ajustar();
            imagem.visible = true;
        } catch (erro) {
            // Imagem faltando não deve impedir o tabuleiro de abrir.
            console.warn(`Não foi possível carregar o mapa "${estado.mapa.url}".`, erro);
        }
    }

    // Endereço temporário (blob:) do arquivo escolhido, para liberar a memória ao trocar de mapa.
    let urlTemporaria: string | null = null;

    async function carregarArquivo(arquivo: File): Promise<string | null> {
        if (!arquivo.type.startsWith("image/")) return "Esse arquivo não é uma imagem.";

        // Endereço temporário que aponta para o arquivo, só nesta aba do navegador.
        const url = URL.createObjectURL(arquivo);
        try {
            // O endereço blob: não tem extensão (.png), então dizemos ao PixiJS qual leitor usar.
            const textura = await Assets.load<Texture>({ src: url, loadParser: "loadTextures" });

            const limite = limiteDeTextura();
            if (textura.width > limite || textura.height > limite) {
                await Assets.unload(url);
                URL.revokeObjectURL(url);
                return `Imagem grande demais (${textura.width}×${textura.height}). Este computador aceita até ${limite}×${limite} px.`;
            }

            textura.source.autoGenerateMipmaps = true;
            imagem.texture = textura;

            // Deu certo: libera o mapa temporário anterior (se havia) e passa a usar este.
            if (urlTemporaria) {
                await Assets.unload(urlTemporaria);
                URL.revokeObjectURL(urlTemporaria);
            }
            urlTemporaria = url;
            definirMapa(url);
            ajustar();
            imagem.visible = true;
            return null;
        } catch (erro) {
            URL.revokeObjectURL(url);
            console.warn("Não foi possível abrir a imagem escolhida.", erro);
            return "Não foi possível abrir essa imagem.";
        }
    }

    return { ajustar, carregar, carregarArquivo };
}
