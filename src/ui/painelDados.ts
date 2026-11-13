// =====================================================================
// PAINEL DE DADOS (HTML): a barra GRUDADA no lado esquerdo do chat, onde se escolhe o
// dado (d4 a d1000), a quantidade e o modificador, e se rola. O resultado vai para o
// chat (main.ts). A barra é RETRÁTIL: a aba entre os dados e o chat a recolhe, e sobra só a
// aba "Dados" colada no chat. Em janelas com menos de 1184 px a barra fica EM CIMA do chat (CSS).
//
// A marcação e o CSS ficam no index.html (o painel está DENTRO do #chat, por isso
// acompanha a posição e a largura dele); aqui só ligamos os elementos.
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

    // --- Recolher/expandir: como na barra de Ferramentas e no painel de Desenho (sobram o nome e o botão; o DUPLO clique no NOME também alterna) ---
    function recolher(recolhido: boolean): void {
        painel.classList.toggle("recolhida", recolhido);
        alternar.textContent = recolhido ? "▾" : "▴"; // ▾ = expandir (para baixo), ▴ = recolher
        alternar.title = recolhido ? "Abrir os dados" : "Recolher os dados";
        alternar.setAttribute("aria-expanded", String(!recolhido));
    }
    // DUPLO clique em QUALQUER ponto da área de cima (o cabeçalho onde fica o nome "Dados", não só nas letras) recolhe/expande.
    const cabecalhoDados = painel.querySelector<HTMLElement>(".cabecalho")!;
    cabecalhoDados.title = "Duplo clique para recolher ou expandir (arraste para mover)";
    cabecalhoDados.addEventListener("dblclick", (e) => {
        if (!(e.target as HTMLElement).closest("button, input")) alternar.click();
    });
    alternar.addEventListener("click", () => {
        const recolhido = alternarRecolhida(painel, "recolhida", recolher); // (com animação: a altura cresce/encolhe, de cima para baixo)
        guardarPreferencia(CHAVE_DADOS_RECOLHIDO, recolhido ? "1" : "0"); // lembra ao recarregar a página
    });
    // Ao abrir a página: como a pessoa deixou da última vez. Sem escolha guardada, em janelas BAIXAS (menos de 720 px) ele começa recolhido,
    // para sobrar espaço no tabuleiro. (O index.html já aplicou isto antes da primeira pintura: aqui só se confirma.)
    const guardadoDados = lerPreferencia(CHAVE_DADOS_RECOLHIDO);
    recolher(guardadoDados === null ? window.innerHeight < 720 : guardadoDados === "1");

    atualizar();
}
