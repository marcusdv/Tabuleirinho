// =====================================================================
// FERRAMENTA DE ARRASTO: o "contrato" das ferramentas que usam o botão esquerdo
// do mouse sobre o tabuleiro (calibrar grade, régua, lápis, borracha, formas).
// interacao.ts só conhece este contrato: quando uma ferramenta está ativa, o
// botão esquerdo é repassado a ela (em vez de mover a visão ou pegar tokens).
// =====================================================================

import type { PointData } from "pixi.js";

export interface FerramentaDeArrasto {
    /** true enquanto a ferramenta está escolhida (ligada). */
    readonly ativa: boolean;
    /** true enquanto o usuário está arrastando com ela. */
    readonly medindo: boolean;
    /** Apertou o botão esquerdo (ponto na TELA). */
    comecar(ponto: PointData): void;
    /** O mouse andou durante o arrasto (ponto na TELA). */
    arrastar(ponto: PointData): void;
    /** Soltou o botão. */
    soltar(): void;
    /**
     * OPCIONAL. O botão DIREITO foi apertado enquanto o esquerdo continua apertado (no meio de um arrasto).
     * A régua usa isso para fixar um ponto e continuar medindo (distâncias com curvas).
     */
    cliqueDireito?(): void;
    /**
     * OPCIONAL. O mouse andou SEM nenhum botão apertado, com a ferramenta ligada (ponto na TELA). A ferramenta de área usa isso para mostrar um "fantasma" da área junto ao cursor.
     */
    passar?(ponto: PointData): void;
}
