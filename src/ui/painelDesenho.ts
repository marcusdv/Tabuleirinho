// =====================================================================
// PAINEL DE DESENHO (HTML), à esquerda: escolhe a ferramenta (mover, régua,
// lápis, borracha, elipse, retângulo, triângulo), a cor, e tem o botão
// "Apagar tudo". A marcação e o CSS ficam no index.html.
// =====================================================================

import { criarSeletorDeCor } from "./seletorDeCor";
import { CHAVE_ALFA_DESENHO, CHAVE_COR_DESENHO, COR_INICIAL_DESENHO, CORES_FIXAS_DESENHO, CORES_RECENTES_INICIAIS } from "../config";
import { guardarPreferencia, lerPreferencia } from "./preferencias";
import { estado } from "../estado";

export type NomeFerramenta = "mover" | "regua" | "lapis" | "borracha" | "elipse" | "retangulo" | "triangulo" | "area" | "fog-cobrir" | "fog-revelar"; // (os dois "fog-" são os pincéis do painel do Fog)

export interface OpcoesPainelDesenho {
    /** O usuário escolheu uma ferramenta. */
    aoEscolher(ferramenta: NomeFerramenta): void;
    /** O usuário escolheu uma cor (0xRRGGBB). */
    aoMudarCor(cor: number): void;
    /** Mudou o nível de transparência: a opacidade (0.1 a 1) das próximas pinturas. */
    aoMudarAlfa(alfa: number): void;
    /** O usuário clicou em "Apagar tudo" (sem confirmação; Ctrl+Z desfaz). */
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

    let atual: NomeFerramenta = "mover";

    // --- Acesso rápido (abaixo do zoom): régua, lápis e borracha. Clicar na que já está ligada volta para "Mover". ---
    const atalhos = Array.from(document.querySelectorAll<HTMLButtonElement>("#atalhos-rapidos button[data-atalho]"));
    for (const atalho of atalhos) {
        atalho.addEventListener("click", () => {
            const ferramenta = atalho.dataset.atalho as NomeFerramenta;
            opcoes.aoEscolher(ferramenta === atual ? "mover" : ferramenta);
        });
    }

    // --- Ferramentas ---
    for (const botao of botoes) {
        botao.addEventListener("click", () => opcoes.aoEscolher(botao.dataset.ferramenta as NomeFerramenta));
    }
    // Esc volta para "Mover" (só se outra ferramenta estiver ligada).
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && atual !== "mover") opcoes.aoEscolher("mover");
    });

    // --- Cores: pilha das ÚLTIMAS usadas + branco e preto fixos + seletor livre ---
    // A cor e a opacidade escolhidas ficam GUARDADAS neste navegador (localStorage): ao recarregar a página a pessoa continua com a mesma cor. O que vem de lá é conferido (pode estar estragado).
    const lerCorGuardada = (): number | null => {
        const texto = lerPreferencia(CHAVE_COR_DESENHO);
        return texto !== null && /^#[0-9a-f]{6}$/i.test(texto) ? parseInt(texto.slice(1), 16) : null;
    };
    const lerAlfaGuardado = (): number | null => {
        const valor = Number(lerPreferencia(CHAVE_ALFA_DESENHO));
        return lerPreferencia(CHAVE_ALFA_DESENHO) !== null && Number.isFinite(valor) && valor >= 0.1 && valor <= 1 ? valor : null;
    };
    let corAtual = lerCorGuardada() ?? COR_INICIAL_DESENHO;
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
        seletorCor.atualizar();
        renderizarAmostras(); // só muda o destaque: escolher NÃO reordena a pilha
        guardarPreferencia(CHAVE_COR_DESENHO, corCss(cor));
        opcoes.aoMudarCor(cor);
    }
    // O seletor de cor próprio: o NÍVEL DE TRANSPARÊNCIA fica DENTRO da caixa dele (pedido do dono, 18/11/2026). O <input type="color"> continua guardando a cor.
    const alfaGuardado = lerAlfaGuardado();
    const seletorCor = criarSeletorDeCor({
        entrada: seletor,
        alfa: alfaGuardado ?? 1,
        aoMudarAlfa: (alfa) => {
            guardarPreferencia(CHAVE_ALFA_DESENHO, String(alfa));
            opcoes.aoMudarAlfa(alfa);
        },
    });
    seletor.addEventListener("input", () => {
        corAtual = parseInt(seletor.value.slice(1), 16);
        renderizarAmostras();
        guardarPreferencia(CHAVE_COR_DESENHO, corCss(corAtual));
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
    seletorCor.atualizar();
    renderizarAmostras();
    opcoes.aoMudarCor(corAtual);
    if (alfaGuardado !== null) opcoes.aoMudarAlfa(alfaGuardado); // (a camada de desenho começa com a opacidade guardada)

    // --- Apagar tudo: SEM caixa de confirmação (pedido do dono, 17/11/2026); dá para desfazer com Ctrl+Z ---
    apagarTudo.addEventListener("click", () => opcoes.aoApagarTudo());

    // (Abrir e fechar o painel é da PILHA de barras: ver ui/pilha.ts.)

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
            for (const atalho of atalhos) {
                const ligado = atalho.dataset.atalho === ferramenta;
                atalho.classList.toggle("ativo", ligado);
                atalho.setAttribute("aria-pressed", String(ligado));
            }
        },
        atualizar,
        usarCor,
    };
}
