// =====================================================================
// PAINEL DE DADOS (HTML): uma BARRA "Dados" no pé da coluna da direita (embaixo do chat ou da bolsa). Clicar nela
// expande a caixa onde se escolhe o dado (d4 a d1000), a quantidade e o modificador, e se rola. O resultado vai para o
// chat (main.ts). Recolhida, sobra só a barra.
//
// A marcação e o CSS ficam no index.html (o painel está DENTRO do #chat, por isso acompanha a largura dele);
// aqui só ligamos os elementos.
// =====================================================================

import { CHAVE_DADOS_RECOLHIDO, DADO_INICIAL, DADOS_DISPONIVEIS, MAX_MODIFICADOR_DADOS, MAX_QUANTIDADE_DADOS } from "../config";
import { limitar } from "../coordenadas";
import { formulaDosDados } from "../dados";
import { alternarRecolhida } from "./animarPainel";
import { guardarPreferencia, lerPreferencia } from "./preferencias";

export interface OpcoesPainelDados {
    /** O usuário apertou "Rolar" com estes valores. */
    aoRolar(lados: number, quantidade: number, modificador: number): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarPainelDados(opcoes: OpcoesPainelDados): void {
    const painel = pegar("dados");
    const lista = pegar("dados-lados");
    const alternar = pegar<HTMLButtonElement>("dados-alternar");
    const campoQuantidade = pegar<HTMLInputElement>("dados-qtd");
    const campoModificador = pegar<HTMLInputElement>("dados-mod");
    const botaoRolar = pegar<HTMLButtonElement>("dados-rolar");

    // O que está escolhido agora.
    let lados = DADO_INICIAL;
    let quantidade = 1;
    let modificador = 0;

    // --- Os botões dos dados (d4 ... d1000), criados a partir de DADOS_DISPONIVEIS ---
    const botoesDados = new Map<number, HTMLButtonElement>();
    for (const n of DADOS_DISPONIVEIS) {
        const botao = document.createElement("button");
        botao.className = "dado";
        botao.textContent = `d${n}`;
        botao.setAttribute("aria-label", `Dado de ${n} lados`);
        botao.addEventListener("click", () => {
            lados = n;
            atualizar();
        });
        lista.appendChild(botao);
        botoesDados.set(n, botao);
    }

    /** Põe na tela o que está escolhido: dado destacado, números e a fórmula do botão Rolar. */
    function atualizar(): void {
        for (const [n, botao] of botoesDados) {
            botao.classList.toggle("escolhido", n === lados);
            botao.setAttribute("aria-pressed", String(n === lados));
        }
        // Não sobrescreve o campo enquanto o usuário está digitando nele.
        if (document.activeElement !== campoQuantidade) campoQuantidade.value = String(quantidade);
        if (document.activeElement !== campoModificador) campoModificador.value = String(modificador);
        pegar<HTMLButtonElement>("dados-qtd-menos").disabled = quantidade <= 1;
        pegar<HTMLButtonElement>("dados-qtd-mais").disabled = quantidade >= MAX_QUANTIDADE_DADOS;
        pegar<HTMLButtonElement>("dados-mod-menos").disabled = modificador <= -MAX_MODIFICADOR_DADOS;
        pegar<HTMLButtonElement>("dados-mod-mais").disabled = modificador >= MAX_MODIFICADOR_DADOS;
        // O quadrado tem SÓ a fórmula (o texto "Rolar" é o rótulo que fica em cima dele).
        // O <span> é criado UMA vez e depois só muda o texto. Recriá-lo a cada atualização perdia o clique: ao digitar
        // uma quantidade e clicar direto em "Rolar", o campo perde o foco no mousedown, o painel se atualiza e o <span> onde
        // o mouse estava era trocado por outro; o navegador então não dispara o "click" e a rolagem não acontecia.
        let formula = botaoRolar.firstElementChild as HTMLElement | null;
        if (!formula) {
            formula = document.createElement("span");
            formula.className = "rolar-formula";
            botaoRolar.replaceChildren(formula);
        }
        formula.textContent = formulaDosDados(quantidade, lados, modificador);
        ajustarFormula();
    }

    /**
     * Ajusta o tamanho da letra da fórmula: a maior que cabe inteira no quadrado, de 26 px até 11 px.
     * Fórmulas curtas ("1d20") ficam grandes; compridas ("20d1000-100") encolhem, sem cortar nem quebrar.
     */
    const FONTE_MAX = 26;
    const FONTE_MIN = 11;
    function ajustarFormula(): void {
        const formula = botaoRolar.firstElementChild as HTMLElement | null;
        const disponivel = botaoRolar.clientWidth - 12; // desconta o respiro das laterais
        if (!formula || disponivel <= 0) return; // painel recolhido (sem tamanho): ajusta quando aparecer
        let tamanho = FONTE_MAX;
        formula.style.fontSize = `${tamanho}px`;
        while (tamanho > FONTE_MIN && formula.offsetWidth > disponivel) {
            tamanho -= 1;
            formula.style.fontSize = `${tamanho}px`;
        }
    }
    // O quadrado muda de largura (janela redimensionada, painel aberto/recolhido): ajusta de novo.
    new ResizeObserver(ajustarFormula).observe(botaoRolar);

    // --- Quantidade e modificador: botões − e + e digitação direta (sempre dentro dos limites) ---
    const definirQuantidade = (valor: number): void => {
        quantidade = limitar(Math.round(valor), 1, MAX_QUANTIDADE_DADOS);
        atualizar();
    };
    const definirModificador = (valor: number): void => {
        modificador = limitar(Math.round(valor), -MAX_MODIFICADOR_DADOS, MAX_MODIFICADOR_DADOS);
        atualizar();
    };
    pegar("dados-qtd-menos").addEventListener("click", () => definirQuantidade(quantidade - 1));
    pegar("dados-qtd-mais").addEventListener("click", () => definirQuantidade(quantidade + 1));
    pegar("dados-mod-menos").addEventListener("click", () => definirModificador(modificador - 1));
    pegar("dados-mod-mais").addEventListener("click", () => definirModificador(modificador + 1));

    /** Ao confirmar um campo digitado (Enter ou sair dele): vazio ou inválido volta ao valor atual. */
    function ligarCampo(campo: HTMLInputElement, definir: (valor: number) => void): void {
        const confirmar = (): void => {
            const digitado = campo.value.trim() === "" ? NaN : Number(campo.value);
            if (Number.isFinite(digitado)) definir(digitado);
            campo.value = campo === campoQuantidade ? String(quantidade) : String(modificador); // mostra o valor realmente usado
        };
        campo.addEventListener("change", confirmar);
        campo.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                confirmar();
                campo.blur();
            }
        });
    }
    ligarCampo(campoQuantidade, definirQuantidade);
    ligarCampo(campoModificador, definirModificador);

    botaoRolar.addEventListener("click", () => opcoes.aoRolar(lados, quantidade, modificador));

    // --- Recolher/expandir: o painel é uma BARRA no pé da coluna da direita; clicar em QUALQUER ponto dela (não só no botão) alterna. A caixa abre para
    // CIMA, então a setinha aponta ▴ quando está recolhida (clique para abrir) e ▾ quando está aberta (clique para fechar): ela GIRA 180° (CSS). ---
    function recolher(recolhido: boolean): void {
        painel.classList.toggle("recolhida", recolhido);
        alternar.title = recolhido ? "Abrir os dados" : "Recolher os dados";
        alternar.setAttribute("aria-expanded", String(!recolhido));
    }
    const barraDados = painel.querySelector<HTMLElement>(".cabecalho")!;
    barraDados.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button") === null) alternar.click(); // (o botão já tem o seu próprio clique)
    });
    alternar.addEventListener("click", () => {
        const recolhido = alternarRecolhida(painel, "recolhida", recolher); // (com animação: a altura cresce/encolhe, de cima para baixo)
        alternar.classList.toggle("recolhido", recolhido); // a SETA gira junto com a caixa (CSS: mesma duração e curva)
        guardarPreferencia(CHAVE_DADOS_RECOLHIDO, recolhido ? "1" : "0"); // lembra ao recarregar a página
    });
    // Ao abrir a página: como a pessoa deixou da última vez. Sem escolha guardada, ele começa RECOLHIDO (só a bolsa começa aberta).
    // (O index.html já aplicou isto antes da primeira pintura: aqui só se confirma.)
    const dadosComecamRecolhidos = lerPreferencia(CHAVE_DADOS_RECOLHIDO) !== "0";
    recolher(dadosComecamRecolhidos);
    alternar.classList.toggle("recolhido", dadosComecamRecolhidos); // (a seta já nasce na posição certa, sem girar)

    atualizar();
}
