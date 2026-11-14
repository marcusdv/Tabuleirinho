// =====================================================================
// BARRA DE FERRAMENTAS (HTML): zoom, colunas e linhas, e recolher/expandir.
// A marcação HTML e o CSS ficam no index.html; aqui só ligamos os botões.
// =====================================================================

import { MAX_CASAS, MIN_CASAS, PASSO_ZOOM, ZOOM_MAX, ZOOM_MIN } from "../config";
import { restaurarPilha } from "./pilha";
import { estado } from "../estado";
import type { Camera } from "../tabuleiro/camera";

export interface OpcoesBarra {
    /** Pediu para adicionar/remover colunas e/ou linhas do tabuleiro. */
    aoMudarTamanhoTabuleiro(deltaColunas: number, deltaLinhas: number): void;
    /** Clicou em "Alinhar mapa" (liga ou desliga a ferramenta). */
    aoAlternarCalibragem(): void;
    /** O usuário escolheu um arquivo de imagem para ser o mapa. */
    aoEscolherMapa(arquivo: File): void;
    /** Clicou em "Voltar ao padrão" (zoom 100% e tamanho inicial do tabuleiro). */
    aoVoltarAoPadrao(): void;
}

export interface Barra {
    /** Atualiza os números exibidos e desativa botões que chegaram ao limite. */
    atualizar(): void;
    /** Destaca o botão "Alinhar mapa" enquanto a ferramenta está ligada. */
    marcarCalibragem(ligada: boolean): void;
}

/** Atalho para buscar um elemento da página pelo id. */
function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarBarra(camera: Camera, opcoes: OpcoesBarra): Barra {
    function atualizar(): void {
        pegar("zoom-valor").textContent = `${Math.round(camera.zoom * 100)}%`;
        // Campos digitáveis: não sobrescreve enquanto o usuário está digitando neles.
        const colunas = pegar<HTMLInputElement>("colunas-valor");
        const linhas = pegar<HTMLInputElement>("linhas-valor");
        if (document.activeElement !== colunas) colunas.value = String(estado.colunas);
        if (document.activeElement !== linhas) linhas.value = String(estado.linhas);

        pegar<HTMLButtonElement>("zoom-menos").disabled = camera.zoom <= ZOOM_MIN;
        pegar<HTMLButtonElement>("zoom-mais").disabled = camera.zoom >= ZOOM_MAX;
        pegar<HTMLButtonElement>("colunas-menos").disabled = estado.colunas <= MIN_CASAS;
        pegar<HTMLButtonElement>("colunas-mais").disabled = estado.colunas >= MAX_CASAS;
        pegar<HTMLButtonElement>("linhas-menos").disabled = estado.linhas <= MIN_CASAS;
        pegar<HTMLButtonElement>("linhas-mais").disabled = estado.linhas >= MAX_CASAS;
        // Sem mapa não há o que calibrar.
        pegar<HTMLButtonElement>("calibrar-alternar").disabled = estado.mapa === null;
    }

    function marcarCalibragem(ligada: boolean): void {
        const botao = pegar<HTMLButtonElement>("calibrar-alternar");
        botao.classList.toggle("ativo", ligada);
        botao.setAttribute("aria-pressed", String(ligada));
    }

    // Liga cada botão HTML à sua ação.
    pegar("zoom-mais").addEventListener("click", () => camera.aplicarZoom(camera.zoom * PASSO_ZOOM));
    pegar("zoom-menos").addEventListener("click", () => camera.aplicarZoom(camera.zoom / PASSO_ZOOM));
    pegar("zoom-ajustar").addEventListener("click", () => camera.ajustar());
    pegar("colunas-mais").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(1, 0));
    pegar("colunas-menos").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(-1, 0));
    pegar("linhas-mais").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(0, 1));
    pegar("linhas-menos").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(0, -1));
    pegar("calibrar-alternar").addEventListener("click", () => opcoes.aoAlternarCalibragem());

    // Digitar o número de colunas/linhas: ao confirmar (Enter ou sair do campo), manda a DIFERENÇA
    // para o mesmo caminho dos botões +/- (limites de MIN/MAX_CASAS, tokens puxados para dentro...).
    function ligarCampo(id: string, eixo: "colunas" | "linhas"): void {
        const campo = pegar<HTMLInputElement>(id);
        function aplicar(): void {
            const digitado = Math.round(Number(campo.value));
            // Vazio ou inválido: ignora e volta a mostrar o valor atual.
            if (campo.value.trim() !== "" && Number.isFinite(digitado)) {
                const delta = digitado - estado[eixo];
                if (delta !== 0) opcoes.aoMudarTamanhoTabuleiro(eixo === "colunas" ? delta : 0, eixo === "linhas" ? delta : 0);
            }
            campo.value = String(estado[eixo]); // mostra o valor realmente usado (já limitado)
        }
        campo.addEventListener("change", aplicar);
        campo.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                aplicar();
                campo.blur(); // devolve o foco: atalhos e o mouse voltam ao tabuleiro
            }
        });
    }
    ligarCampo("colunas-valor", "colunas");
    ligarCampo("linhas-valor", "linhas");

    pegar("voltar-padrao").addEventListener("click", () => opcoes.aoVoltarAoPadrao());
    pegar("reorganizar-telas").addEventListener("click", restaurarPilha); // as barras da pilha voltam à ordem de fábrica

    // "Escolher mapa": o botão aparente abre o seletor de arquivos do navegador
    // (o <input type="file"> fica escondido; o navegador só permite abri-lo por um clique do usuário).
    const campoArquivo = pegar<HTMLInputElement>("mapa-arquivo");
    pegar("mapa-escolher").addEventListener("click", () => campoArquivo.click());
    campoArquivo.addEventListener("change", () => {
        const arquivo = campoArquivo.files?.[0];
        if (arquivo) opcoes.aoEscolherMapa(arquivo);
        // Limpa a escolha: sem isso, escolher DE NOVO o mesmo arquivo não dispararia "change".
        campoArquivo.value = "";
    });

    // (Abrir e fechar a barra é da PILHA de barras: ver ui/pilha.ts.)

    atualizar();
    return { atualizar, marcarCalibragem };
}
