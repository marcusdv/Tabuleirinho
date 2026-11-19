// =====================================================================
// AS RÉGUAS DOS OUTROS: quando alguém da sua cena mede com a régua, você vê a medida dele na cor de desenho que ele escolheu (com o nome), ao vivo.
// Uma medida por pessoa; ela some quando ele solta a ferramenta, começa outra, sai ou muda de mapa (o servidor manda `caminho: null`).
// =====================================================================

import type { CasaDaRegua } from "../protocolo";
import type { Camera } from "./camera";
import { criarVisualDeMedida, type VisualDeMedida } from "./regua";

export interface ReguasDosOutros {
    /** Chegou a régua (ou o "sumiu", com `caminho` null) de `usuario`, na `cor` de desenho que ele escolheu. */
    atualizar(usuario: string, apelido: string, caminho: CasaDaRegua[] | null, cor: number): void;
    /** O zoom mudou: o tamanho da linha e do texto na tela depende dele. */
    redesenhar(): void;
    /** Some com todas (trocou de mapa). */
    limpar(): void;
}

export function criarReguasDosOutros(camera: Camera): ReguasDosOutros {
    const porUsuario = new Map<string, { visual: VisualDeMedida; caminho: CasaDaRegua[] | null }>();

    return {
        atualizar(usuario, apelido, caminho, cor) {
            let item = porUsuario.get(usuario);
            if (!item) {
                if (caminho === null) return; // (nada a apagar)
                item = { visual: criarVisualDeMedida(camera, cor), caminho: null };
                porUsuario.set(usuario, item);
            }
            item.visual.definirNome(apelido);
            item.visual.definirCor(cor);
            item.caminho = caminho;
            // Os vértices menos o último são os pontos fixados (a ponta que segue o mouse é o último).
            item.visual.mostrar(caminho, caminho ? caminho.length - 1 : 0);
        },
        redesenhar() {
            for (const { visual, caminho } of porUsuario.values()) visual.mostrar(caminho, caminho ? caminho.length - 1 : 0);
        },
        limpar() {
            for (const item of porUsuario.values()) {
                item.caminho = null;
                item.visual.mostrar(null, 0);
            }
        },
    };
}
