// =====================================================================
// DICA DA CONDIÇÃO (HTML): o balão com a DESCRIÇÃO de uma condição.
// É usado em dois lugares, por isso existe um só elemento compartilhado:
//   - no menu "Add condição", ao passar o mouse numa condição;
//   - no balão do token, ao passar o mouse numa das condições listadas.
// O texto vem do catálogo (condicoes.ts). A marcação HTML e o CSS ficam no index.html.
// =====================================================================

import { buscarCondicao } from "../condicoes";
import { limitar } from "../coordenadas";

export interface DicaCondicao {
    /**
     * Mostra a descrição de uma condição AO LADO de um painel, alinhada a um
     * item dele. `painel` é o balão/menu onde o mouse está e `item` é a linha
     * ou o botão da condição sob o mouse.
     */
    mostrar(condicaoId: string, painel: HTMLElement, item: HTMLElement): void;
    /**
     * Esconde a descrição. Se `dono` for informado, só esconde quando a descrição
     * atual foi aberta por ESSE painel. Isso evita que o balão do token (com o seu
     * temporizador) apague a descrição aberta pelo menu "Add condição", e vice-versa.
     */
    esconder(dono?: HTMLElement): void;
}

const MARGEM_JANELA = 6; // px mínimos entre a dica e a borda da janela
const DISTANCIA = 8; // px entre o painel e a dica

export function criarDicaCondicao(): DicaCondicao {
    const dica = document.getElementById("dica-condicao") as HTMLDivElement;
    const titulo = document.getElementById("dica-condicao-titulo") as HTMLElement;
    const lista = document.getElementById("dica-condicao-lista") as HTMLUListElement;

    // Painel que abriu a descrição que está na tela agora (null = nenhum).
    let donoAtual: HTMLElement | null = null;

    function esconder(dono?: HTMLElement): void {
        // Pedido de OUTRO painel: não é dele a descrição, então ignora.
        if (dono && dono !== donoAtual) return;
        dica.hidden = true;
        donoAtual = null;
    }

    function mostrar(condicaoId: string, painel: HTMLElement, item: HTMLElement): void {
        const condicao = buscarCondicao(condicaoId);
        if (!condicao) return esconder();

        donoAtual = painel; // este painel passa a ser o dono da descrição

        // Preenche o título e uma linha (<li>) por item da descrição.
        titulo.textContent = condicao.nome;
        lista.replaceChildren(
            ...condicao.descricao.map((linha) => {
                const li = document.createElement("li");
                li.textContent = linha;
                return li;
            }),
        );

        // Precisa estar visível para medir o tamanho antes de posicionar.
        dica.hidden = false;
        const largura = dica.offsetWidth;
        const altura = dica.offsetHeight;

        const caixaPainel = painel.getBoundingClientRect();
        const caixaItem = item.getBoundingClientRect();

        // Preferência: à DIREITA do painel. Se não couber na janela, vai para a ESQUERDA.
        let x = caixaPainel.right + DISTANCIA;
        if (x + largura > window.innerWidth - MARGEM_JANELA) x = caixaPainel.left - DISTANCIA - largura;
        x = limitar(x, MARGEM_JANELA, window.innerWidth - largura - MARGEM_JANELA);

        // Verticalmente centrada no item, sem sair da janela.
        const y = limitar(caixaItem.top + caixaItem.height / 2 - altura / 2, MARGEM_JANELA, window.innerHeight - altura - MARGEM_JANELA);

        dica.style.left = `${x}px`;
        dica.style.top = `${y}px`;
    }

    return { mostrar, esconder };
}
