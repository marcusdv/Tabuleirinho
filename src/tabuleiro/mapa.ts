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
     * Baixa a imagem de `url` (null = sem mapa) e, SÓ quando ela chegou, a põe no lugar da atual: até lá a imagem antiga continua à vista e nada muda. `aindaVale` é perguntado depois do download: se a troca
     * já foi superada por outra, a imagem é descartada e nada muda. Devolve true se trocou (ou se não havia o que baixar), false se falhou ou foi superada.
     */
    carregarDe(url: string | null, aindaVale: () => boolean): Promise<boolean>;
    /**
     * Troca o mapa por uma imagem escolhida pelo usuário (arquivo do computador).
     * Devolve null se deu certo, ou o texto do problema (e o mapa atual continua).
     */
    carregarArquivo(arquivo: File): Promise<string | null>;
    /** O tamanho ORIGINAL (em pixels) da imagem carregada agora, ou null se não há mapa. (Mesmo que a imagem tenha sido REDUZIDA para caber na placa de vídeo, o tamanho dito aqui é o do arquivo.) */
    tamanhoDaImagem(): { largura: number; altura: number } | null;
    /** Se a imagem do mapa atual foi REDUZIDA porque a placa de vídeo deste computador não aceita uma textura tão grande: de que tamanho para qual (senão, null). */
    reducao(): { de: { largura: number; altura: number }; para: { largura: number; altura: number } } | null;
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

/**
 * Se a imagem é maior do que a placa de vídeo deste computador aceita como textura, devolve uma cópia REDUZIDA (mesma proporção; o maior lado = o limite da placa); senão, null.
 * Só a nitidez muda: o mapa é esticado sobre o tabuleiro inteiro, então as colunas, as linhas e as casas continuam as mesmas.
 */
function reduzirParaAPlaca(textura: Texture): Texture | null {
    const limite = limiteDeTextura();
    const maior = Math.max(textura.width, textura.height);
    if (maior <= limite) return null;
    const fator = limite / maior;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(textura.width * fator));
    canvas.height = Math.max(1, Math.floor(textura.height * fator));
    const contexto = canvas.getContext("2d");
    if (!contexto) return null;
    contexto.imageSmoothingQuality = "high";
    contexto.drawImage(textura.source.resource as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    return Texture.from(canvas);
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

    let tamanhoOriginal: { largura: number; altura: number } | null = null; // o tamanho do ARQUIVO da imagem de agora (antes de qualquer redução)
    let reduzida: ReturnType<Mapa["reducao"]> = null;
    let texturaReduzida: Texture | null = null; // a cópia reduzida de agora (é nossa: precisa ser destruída ao trocar)

    /** Põe `textura` (já carregada de `url`) no mapa, reduzindo-a antes se a placa de vídeo não a aceitar. Devolve a textura que ficou em uso. */
    async function usarTextura(textura: Texture, url: string): Promise<Texture> {
        const original = { largura: textura.width, altura: textura.height };
        const menor = reduzirParaAPlaca(textura);
        const usar = menor ?? textura;
        if (menor) await Assets.unload(url).catch(() => undefined); // (o original enorme sai da memória: só a cópia reduzida fica)
        usar.source.autoGenerateMipmaps = true; // (mipmaps: sem eles a imagem serrilha quando o zoom a reduz bastante)
        imagem.texture = usar;
        const anterior = texturaReduzida;
        texturaReduzida = menor;
        anterior?.destroy(true);
        tamanhoOriginal = original;
        reduzida = menor ? { de: original, para: { largura: menor.width, altura: menor.height } } : null;
        return usar;
    }

    let urlDaBiblioteca: string | null = null; // o mapa da biblioteca que está carregado agora (para liberar o anterior ao trocar)

    async function carregar(): Promise<void> {
        const url = estado.mapa?.url ?? null;
        await carregarDe(url, () => (estado.mapa?.url ?? null) === url);
    }

    async function carregarDe(url: string | null, aindaVale: () => boolean): Promise<boolean> {
        if (url === null) {
            imagem.visible = false;
            return true;
        }
        try {
            // O endereço de um mapa da biblioteca (/mapas/<id>) não tem extensão (.png): diz-se ao PixiJS qual leitor usar. Enquanto a imagem nova baixa, a antiga continua à vista.
            const textura = await Assets.load<Texture>(/\.(png|jpe?g|webp)$/i.test(url) ? url : { src: url, loadParser: "loadTextures" });
            if (!aindaVale()) return false; // (outra troca chegou enquanto esta baixava: esta já não vale)
            const antes = urlDaBiblioteca;
            const reduziu = (await usarTextura(textura, url)) !== textura; // (a imagem grande demais para a placa de vídeo é reduzida aqui)
            ajustar();
            imagem.visible = true;
            // A imagem de um mapa anterior da biblioteca (até 20 MB) sai da memória da placa de vídeo.
            if (antes !== null && antes !== url) await Assets.unload(antes).catch(() => undefined);
            urlDaBiblioteca = url.startsWith("/mapas/") && !reduziu ? url : null;
            return true;
        } catch (erro) {
            // Imagem faltando não deve impedir o tabuleiro de abrir.
            console.warn(`Não foi possível carregar o mapa "${url}".`, erro);
            return false;
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

            await usarTextura(textura, url); // (grande demais para a placa de vídeo deste computador? é reduzida: só a nitidez muda)

            // Deu certo: libera o mapa temporário anterior (se havia) e passa a usar este.
            if (urlTemporaria) {
                await Assets.unload(urlTemporaria).catch(() => undefined); // (se a imagem foi reduzida, o original já tinha saído da memória)
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

    function tamanhoDaImagem(): { largura: number; altura: number } | null {
        return imagem.visible ? tamanhoOriginal : null; // (o tamanho do ARQUIVO, mesmo que a textura em uso tenha sido reduzida; o Sprite é esticado sobre o tabuleiro)
    }

    return { ajustar, carregar, carregarDe, carregarArquivo, tamanhoDaImagem, reducao: () => reduzida };
}
