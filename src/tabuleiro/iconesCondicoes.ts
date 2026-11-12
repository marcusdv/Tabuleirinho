// =====================================================================
// ÍCONES DAS CONDIÇÕES (texturas do PixiJS).
// Os PNGs de public/images/condicoes/ têm 256x256 px, mas aparecem no token
// com ~25 a 45 px. Desenhar uma textura grande em tamanho pequeno serrilha,
// então ligamos os MIPMAPS: a placa de vídeo gera versões pré-reduzidas da
// imagem (1/2, 1/4, 1/8...) e escolhe a mais próxima do tamanho na tela.
// (Os originais de 1024 px estão guardados em assets-originais/condicoes/.)
// =====================================================================

import { Assets, Texture } from "pixi.js";
import { CONDICOES, urlDoIcone } from "../condicoes";

/** Carrega a imagem de uma condição e devolve a textura (já com mipmaps ligados). */
async function carregarUma(id: string): Promise<Texture> {
    const textura = await Assets.load<Texture>(urlDoIcone(id));
    // Precisa ser ligado ANTES do primeiro desenho: é no primeiro envio da
    // textura para a placa de vídeo que os mipmaps são gerados.
    textura.source.autoGenerateMipmaps = true;
    return textura;
}

/**
 * Carrega os ícones de TODAS as condições do catálogo, em paralelo.
 * Devolve um mapa id -> textura. Se uma imagem faltar ou falhar, a condição
 * fica de fora do mapa (o token mostra só o disco, sem desenho) e o erro vai
 * para o console, em vez de impedir o tabuleiro de abrir.
 */
export async function carregarTexturasCondicoes(): Promise<Map<string, Texture>> {
    const texturas = new Map<string, Texture>();
    await Promise.all(
        CONDICOES.map(async (condicao) => {
            try {
                texturas.set(condicao.id, await carregarUma(condicao.id));
            } catch (erro) {
                console.warn(`Não foi possível carregar o ícone da condição "${condicao.id}".`, erro);
            }
        }),
    );
    return texturas;
}
