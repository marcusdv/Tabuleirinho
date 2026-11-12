// =====================================================================
// PAINEL DE DESENHO (HTML), à esquerda: escolhe a ferramenta (mover, régua,
// lápis, borracha, elipse, retângulo, triângulo), a cor, e tem o botão
// "Apagar tudo". A marcação e o CSS ficam no index.html.
// =====================================================================

import { COR_INICIAL_DESENHO, CORES_FIXAS_DESENHO, CORES_RECENTES_INICIAIS } from "../config";
import { estado } from "../estado";

export type NomeFerramenta = "mover" | "regua" | "lapis" | "borracha" | "elipse" | "retangulo" | "triangulo";

export interface OpcoesPainelDesenho {
    /** O usuário escolheu uma ferramenta. */
    aoEscolher(ferramenta: NomeFerramenta): void;
    /** O usuário escolheu uma cor (0xRRGGBB). */
    aoMudarCor(cor: number): void;
    /** O usuário confirmou "Apagar tudo". */
    aoApagarTudo(): void;
}

export interface PainelDesenho {
    /** Destaca o botão da ferramenta escolhida. */
    marcar(ferramenta: NomeFerramenta): void;
    /** Atualiza o que depende do estado (o botão "Apagar tudo" só vale com pinturas). */
    atualizar(): void;
    /** Uma pintura foi feita com esta cor: ela vai para a frente da pilha de cores recentes. */
    usarCor(cor: number): void;
    /** Mostra a medida da régua no painel (null = esconde). */
    mostrarDistancia(texto: string | null): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/** Cor numérica (0xe74c3c) para texto CSS ("#e74c3c"). */
const corCss = (cor: number): string => `#${cor.toString(16).padStart(6, "0")}`;

export function criarPainelDesenho(opcoes: OpcoesPainelDesenho): PainelDesenho {
    const painel = pegar("ferramentas-desenho");
    const botoes = Array.from(painel.querySelectorAll<HTMLButtonElement>("button[data-ferramenta]"));
    const seletor = pegar<HTMLInputElement>("desenho-cor");
    const amostras = pegar("desenho-amostras");
    const apagarTudo = pegar<HTMLButtonElement>("desenho-apagar-tudo");
    const distancia = pegar("regua-resultado");

    let atual: NomeFerramenta = "mover";

    // --- Ferramentas ---
    for (const botao of botoes) {
        botao.addEventListener("click", () => opcoes.aoEscolher(botao.dataset.ferramenta as NomeFerramenta));
    }
    // Esc volta para "Mover" (só se outra ferramenta estiver ligada).
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && atual !== "mover") opcoes.aoEscolher("mover");
    });

    // --- Cores: pilha das ÚLTIMAS usadas + branco e preto fixos + seletor livre ---
    let corAtual = COR_INICIAL_DESENHO;
    // Pilha das cores recentes: a mais recente na frente. Tem sempre o mesmo tamanho.
    const recentes = [...CORES_RECENTES_INICIAIS];

    /** Cria o botão de uma amostra (destacado se for a cor escolhida agora). */
    function criarAmostra(cor: number): HTMLButtonElement {
        const amostra = document.createElement("button");
        amostra.className = "amostra";
        amostra.classList.toggle("escolhida", cor === corAtual);
        amostra.dataset.cor = corCss(cor);
        amostra.style.background = corCss(cor);
        amostra.title = corCss(cor);
        amostra.setAttribute("aria-label", `Cor ${corCss(cor)}`);
        amostra.addEventListener("click", () => escolherCor(cor));
        return amostra;
    }

    /** Refaz as amostras: as recentes primeiro e, por último, as duas fixas (branco e preto). */
    function renderizarAmostras(): void {
        amostras.replaceChildren(...[...recentes, ...CORES_FIXAS_DESENHO].map(criarAmostra));
    }

    function escolherCor(cor: number): void {
        corAtual = cor;
        seletor.value = corCss(cor);
        renderizarAmostras(); // só muda o destaque: escolher NÃO reordena a pilha
        opcoes.aoMudarCor(cor);
    }
    seletor.addEventListener("input", () => {
        corAtual = parseInt(seletor.value.slice(1), 16);
        renderizarAmostras();
        opcoes.aoMudarCor(corAtual);
    });

    /** Uma pintura foi feita com `cor`: vai para a frente da pilha (a mais antiga sai). */
    function usarCor(cor: number): void {
        if (CORES_FIXAS_DESENHO.includes(cor)) return; // branco e preto já têm lugar fixo
        const posicao = recentes.indexOf(cor);
        if (posicao >= 0) recentes.splice(posicao, 1); // já estava na pilha: sai de onde estava
        recentes.unshift(cor);
        recentes.length = Math.min(recentes.length, CORES_RECENTES_INICIAIS.length); // descarta a mais antiga
        renderizarAmostras();
    }

    seletor.value = corCss(corAtual);
    renderizarAmostras();
    opcoes.aoMudarCor(corAtual);

    // --- Apagar tudo (pede confirmação: não dá para desfazer) ---
    apagarTudo.addEventListener("click", () => {
        if (window.confirm("Apagar todas as pinturas do mapa?")) opcoes.aoApagarTudo();
    });

    // --- Recolher/expandir o painel ---
    const alternar = pegar<HTMLButtonElement>("desenho-alternar");
    alternar.addEventListener("click", () => {
        const recolhido = painel.classList.toggle("recolhida");
        alternar.textContent = recolhido ? "▾" : "▴"; // ▾ = expandir (para baixo), ▴ = recolher
        alternar.title = recolhido ? "Expandir painel" : "Recolher painel";
        alternar.setAttribute("aria-expanded", String(!recolhido));
    });

    function atualizar(): void {
        apagarTudo.disabled = estado.desenhos.length === 0;
    }
    atualizar();

    return {
        marcar(ferramenta) {
            atual = ferramenta;
            for (const botao of botoes) {
                const ligado = botao.dataset.ferramenta === ferramenta;
                botao.classList.toggle("ativo", ligado);
                botao.setAttribute("aria-pressed", String(ligado));
            }
        },
        atualizar,
        usarCor,
        mostrarDistancia(texto) {
            distancia.hidden = texto === null;
            distancia.textContent = texto === null ? "" : `Distância: ${texto}`;
        },
    };
}
