// =====================================================================
// ÍCONES DAS CONDIÇÕES (texturas do PixiJS).
// Os PNGs de public/images/condicoes/ têm 256x256 px, mas aparecem no token
// com ~25 a 45 px. Desenhar uma textura grande em tamanho pequeno serrilha,
// então ligamos os MIPMAPS: a placa de vídeo gera versões pré-reduzidas da
// imagem (1/2, 1/4, 1/8...) e escolhe a mais próxima do tamanho na tela.
// (Os originais de 1024 px estão guardados em assets-originais/condicoes/.)
// =====================================================================

import { Assets, Texture } from "pixi.js";
import { CONDICOES, buscarCondicao, urlDoIcone } from "../condicoes";

// De onde veio a textura de cada condição (o endereço do PNG de fábrica, ou o "print" enviado pelo mestre): só se recarrega a condição cujo ícone MUDOU.
const origemDaTextura = new Map<string, string>();

/** Carrega a imagem de uma condição e devolve a textura (já com mipmaps ligados). */
async function carregarUma(url: string): Promise<Texture> {
    const textura = await Assets.load<Texture>(url);
    // Precisa ser ligado ANTES do primeiro desenho: é no primeiro envio da
    // textura para a placa de vídeo que os mipmaps são gerados.
    textura.source.autoGenerateMipmaps = true;
    return textura;
}

/**
 * Carrega os ícones de TODAS as condições da lista de agora, em paralelo.
 * Devolve um mapa id -> textura. Se uma imagem faltar ou falhar, a condição
 * fica de fora do mapa (o token mostra só o disco, sem desenho) e o erro vai
 * para o console, em vez de impedir o tabuleiro de abrir.
 */
export async function carregarTexturasCondicoes(): Promise<Map<string, Texture>> {
    const texturas = new Map<string, Texture>();
    await atualizarTexturasCondicoes(texturas);
    return texturas;
}

/**
 * Põe o mapa de texturas em dia com a lista de condições de AGORA (o mestre pode ter criado, editado ou excluído): tira as que não existem mais e carrega as novas e as que
 * trocaram de ícone. O mapa é alterado NO LUGAR (os tokens guardam o mesmo mapa). Devolve true se algo mudou (quem chama redesenha os tokens).
 */
export async function atualizarTexturasCondicoes(texturas: Map<string, Texture>): Promise<boolean> {
    let mudou = false;
    for (const id of [...texturas.keys()]) {
        if (buscarCondicao(id)) continue;
        texturas.delete(id);
        origemDaTextura.delete(id);
        mudou = true;
    }
    await Promise.all(
        CONDICOES.map(async (condicao) => {
            const url = urlDoIcone(condicao.id);
            if (texturas.has(condicao.id) && origemDaTextura.get(condicao.id) === url) return;
            try {
                texturas.set(condicao.id, await carregarUma(url));
                origemDaTextura.set(condicao.id, url);
                mudou = true;
            } catch (erro) {
                console.warn(`Não foi possível carregar o ícone da condição "${condicao.id}".`, erro);
            }
        }),
    );
    return mudou;
}
