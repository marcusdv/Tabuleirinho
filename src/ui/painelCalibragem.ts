// =====================================================================
// PAINEL DA CALIBRAGEM (HTML): aparece no canto inferior direito, enquanto a
// ferramenta "Alinhar mapa" está ligada. Tem o campo "quantas casas o
// retângulo cobre", o resultado da medida e o botão de concluir.
// A marcação e o CSS ficam no index.html; aqui só ligamos os elementos.
// =====================================================================

import { MAX_CASAS, MIN_CASAS } from "../config";

export interface OpcoesPainelCalibragem {
    /** O usuário quer sair da calibragem (botão Concluir ou tecla Esc). */
    aoConcluir(): void;
}

export interface PainelCalibragem {
    abrir(): void;
    fechar(): void;
    /** Quantas casas (por lado) o retângulo cobre, conforme o campo (sempre um inteiro >= 1). */
    casas(): number;
    /** Mensagem enquanto o usuário arrasta (valores brutos da medida). */
    mostrarMedida(colunas: number, linhas: number): void;
    /** Mensagem depois de aplicar (valores brutos; os usados já vêm limitados). */
    mostrarAplicado(colunasBrutas: number, linhasBrutas: number, colunas: number, linhas: number): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarPainelCalibragem(opcoes: OpcoesPainelCalibragem): PainelCalibragem {
    const painel = pegar("painel-calibragem");
    const campo = pegar<HTMLInputElement>("calibragem-casas");
    const resultado = pegar("calibragem-resultado");

    const TEXTO_INICIAL = "Arraste sobre o mapa.";

    function casas(): number {
        const n = Math.floor(Number(campo.value));
        return Number.isFinite(n) && n >= 1 ? n : 1;
    }

    /** Aviso quando o valor medido passa dos limites do tabuleiro. */
    function aviso(colunas: number, linhas: number): string {
        const fora = [colunas, linhas].some((v) => v < MIN_CASAS || v > MAX_CASAS);
        return fora ? ` (o tabuleiro vai de ${MIN_CASAS} a ${MAX_CASAS} casas)` : "";
    }

    // O "× 3" do texto repete o número do campo (o retângulo cobre N x N casas).
    const eco = pegar("calibragem-casas-eco");
    campo.addEventListener("input", () => (eco.textContent = String(casas())));

    pegar("calibragem-concluir").addEventListener("click", opcoes.aoConcluir);
    // Esc também sai (só enquanto o painel está aberto).
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !painel.hidden) opcoes.aoConcluir();
    });

    return {
        abrir() {
            resultado.textContent = TEXTO_INICIAL;
            painel.hidden = false;
        },
        fechar() {
            painel.hidden = true;
        },
        casas,

        mostrarMedida(colunas, linhas) {
            resultado.textContent = `Medindo: ${colunas} colunas × ${linhas} linhas${aviso(colunas, linhas)}`;
        },

        mostrarAplicado(colunasBrutas, linhasBrutas, colunas, linhas) {
            resultado.textContent = `Aplicado: ${colunas} colunas × ${linhas} linhas${aviso(colunasBrutas, linhasBrutas)}. Arraste de novo para refazer.`;
        },
    };
}
