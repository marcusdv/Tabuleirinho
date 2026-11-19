// =====================================================================
// AS ÁREAS DOS OUTROS: quando alguém da sua cena está POSICIONANDO uma área de efeito, você vê a prévia dela ao vivo, na cor de desenho que ele escolheu, com o nome e a medida ("Ana: 6 m\n4 quadrados").
// Uma por pessoa; ela some quando ele fixa a área (aí ela vira um desenho comum), cancela, sai ou muda de mapa (o servidor manda `area: null`).
// =====================================================================

import type { DadosDaArea } from "../areas";
import type { Camera } from "./camera";
import { criarVisualDeArea, type VisualDeArea } from "./formaDeArea";

export interface AreasDosOutros {
    /** Chegou a prévia (ou o "sumiu", com `area` null) de `usuario`, na `cor` de desenho que ele escolheu e com a opacidade `alfa` do preenchimento (sem ela, a de fábrica). */
    atualizar(usuario: string, apelido: string, area: DadosDaArea | null, cor: number, alfa?: number): void;
    /** O zoom mudou: o tamanho do texto na tela depende dele. */
    redesenhar(): void;
    /** Some com todas (trocou de mapa). */
    limpar(): void;
}

export function criarAreasDosOutros(camera: Camera): AreasDosOutros {
    const porUsuario = new Map<string, VisualDeArea>();
    return {
        atualizar(usuario, apelido, area, cor, alfa) {
            let visual = porUsuario.get(usuario);
            if (!visual) {
                if (area === null) return; // (nada a apagar)
                visual = criarVisualDeArea(camera);
                porUsuario.set(usuario, visual);
            }
            visual.mostrar(area, cor, apelido, alfa);
        },
        redesenhar() {
            for (const visual of porUsuario.values()) visual.redesenhar();
        },
        limpar() {
            for (const visual of porUsuario.values()) visual.mostrar(null, 0);
        },
    };
}
