// =====================================================================
// MODAL DE UMA AÇÃO (HTML): o que abre ao clicar numa ação do menu do token (Dano, Cura e as que o dono criou). A pessoa escreve o VALOR (um número, ex.: 7, ou dados,
// ex.: 2d6+3) e o modal mostra o CÁLCULO antes de aplicar: "HP: 10 − 7 = 3". Com dados, a conta diz que eles serão rolados ao aplicar (quem sorteia é o servidor).
// A marcação e o CSS ficam no index.html (ids "modal-acao-*"). Esc cancela, Enter aplica. Tudo entra por textContent.
// =====================================================================

import { limitar } from "../coordenadas";
import { formulaDosDados } from "../dados";
import { lerQuantia } from "../estado";

export interface DadosModalAcao {
    /** Ex.: "Dano em Goblin Guerreiro". */
    titulo: string;
    /** O nome do status que a ação muda (ex.: "HP") e o valor dele agora. */
    nomeStatus: string;
    atual: number;
    max: number;
    efeito: "reduzir" | "aumentar";
    /** A pessoa confirmou: aplicar com este texto (um número ou dados). */
    aoAplicar(texto: string): void;
}

export interface ModalAcao {
    abrir(dados: DadosModalAcao): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarModalAcao(): ModalAcao {
    const janela = pegar("modal-acao");
    const titulo = pegar("modal-acao-titulo");
    const statusAtual = pegar("modal-acao-status");
    const campo = pegar<HTMLInputElement>("modal-acao-valor");
    const calculo = pegar("modal-acao-calculo");
    const botaoCancelar = pegar<HTMLButtonElement>("modal-acao-cancelar");
    const botaoAplicar = pegar<HTMLButtonElement>("modal-acao-aplicar");
    let dados: DadosModalAcao | null = null;
    let focoAnterior: HTMLElement | null = null;

    /** Refaz a conta a cada tecla: o que vai acontecer com o valor. */
    function calcular(): void {
        if (!dados) return;
        calculo.classList.remove("erro");
        botaoAplicar.disabled = true;
        if (campo.value.trim() === "") {
            calculo.textContent = "";
            return;
        }
        const quantia = lerQuantia(campo.value);
        if (!quantia) {
            calculo.classList.add("erro");
            calculo.textContent = "Não entendi: escreva um número (ex.: 7) ou dados (ex.: 2d6+3).";
            return;
        }
        const sinal = dados.efeito === "reduzir" ? "−" : "+";
        if (quantia.tipo === "numero") {
            const depois = limitar(dados.efeito === "reduzir" ? dados.atual - quantia.valor : dados.atual + quantia.valor, 0, dados.max);
            calculo.textContent = `${dados.nomeStatus}: ${dados.atual} ${sinal} ${quantia.valor} = ${depois}`;
        } else {
            calculo.textContent = `${dados.nomeStatus}: ${dados.atual} ${sinal} (${formulaDosDados(quantia.quantidade, quantia.lados, quantia.modificador)} será rolado ao aplicar)`;
        }
        botaoAplicar.disabled = false;
    }

    function fechar(): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        dados = null;
        focoAnterior?.focus();
        focoAnterior = null;
    }

    function aplicar(): void {
        if (!dados || botaoAplicar.disabled) return;
        const { aoAplicar } = dados;
        const texto = campo.value;
        fechar();
        aoAplicar(texto);
    }

    function aoTeclar(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation(); // só este modal fecha (o menu do token e a bolsa por baixo ficam como estão)
            fechar();
        } else if (e.key === "Enter" && document.activeElement === campo) {
            e.preventDefault();
            aplicar();
        }
    }

    campo.addEventListener("input", calcular);
    botaoCancelar.addEventListener("click", fechar);
    botaoAplicar.addEventListener("click", aplicar);
    janela.addEventListener("click", (e) => {
        if (e.target === janela) fechar(); // clicou no fundo escuro
    });

    return {
        abrir(novos) {
            dados = novos;
            focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            titulo.textContent = novos.titulo;
            statusAtual.textContent = `${novos.nomeStatus} agora: ${novos.atual}/${novos.max}`;
            campo.value = "";
            calcular();
            janela.hidden = false;
            document.addEventListener("keydown", aoTeclar, true);
            campo.focus();
        },
    };
}
