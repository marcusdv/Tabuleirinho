// =====================================================================
// A COLUNA DA DIREITA (HTML): um painel só, da altura toda, com ABAS no alto: "Chat" e "Bolsa". Só um painel fica à vista por vez, e os dois
// têm o MESMO tamanho (o da coluna). A bolsa não é mais uma caixa flutuante: ela é a aba "Bolsa".
//
// Este módulo só cuida das ABAS: escolher qual painel aparece (a classe `aba-bolsa` do #chat), lembrar a escolha no navegador, o teclado (← →) e o
// contador de mensagens NÃO LIDAS na aba "Chat" (quando chega mensagem enquanto se está na Bolsa). O que cada painel faz é com o ui/chat.ts e o
// ui/bolsa.ts. A marcação e o CSS ficam no index.html (um script no fim dele aplica a aba guardada antes da primeira pintura: a regra é a mesma).
// =====================================================================

import { CHAVE_ABA_LATERAL } from "../config";
import { guardarPreferencia, lerPreferencia } from "./preferencias";

export type AbaLateral = "chat" | "bolsa";

export interface OpcoesLateral {
    /** A aba "Chat" passou a ficar à vista (o chat leva a lista ao fim: ela não pôde ser rolada enquanto estava escondida). */
    aoMostrarChat(): void;
}

export interface Lateral {
    readonly aba: AbaLateral;
    /** Mostra a aba pedida (e lembra a escolha). */
    escolher(aba: AbaLateral): void;
    /** O painel do chat está à vista agora? */
    chatVisivel(): boolean;
    /** Chegaram `quantas` mensagens com o chat escondido: soma no contador da aba "Chat". */
    avisarNovas(quantas: number): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarLateral(opcoes: OpcoesLateral): Lateral {
    const coluna = pegar("chat");
    const botoes: Record<AbaLateral, HTMLButtonElement> = { chat: pegar("lateral-aba-chat"), bolsa: pegar("lateral-aba-bolsa") };
    const contador = pegar("lateral-novas");
    let aba: AbaLateral = lerPreferencia(CHAVE_ABA_LATERAL) === "chat" ? "chat" : "bolsa"; // sem escolha guardada: a bolsa
    let naoLidas = 0;

    /** Aplica a aba escolhida na tela. `avisarChat` é falso na criação (o chat ainda não existe nessa hora e a lista vazia não precisa ir ao fim). */
    function mostrar(avisarChat: boolean): void {
        coluna.classList.toggle("aba-bolsa", aba === "bolsa");
        for (const nome of ["chat", "bolsa"] as const) {
            botoes[nome].setAttribute("aria-selected", String(nome === aba));
            botoes[nome].tabIndex = nome === aba ? 0 : -1; // (só a aba ativa entra na ordem do Tab; ← → passeiam entre elas)
        }
        if (aba === "chat") {
            naoLidas = 0;
            contador.hidden = true;
            if (avisarChat) opcoes.aoMostrarChat();
        }
    }

    function escolher(nova: AbaLateral): void {
        if (nova === aba) return;
        aba = nova;
        guardarPreferencia(CHAVE_ABA_LATERAL, aba); // volta como a pessoa deixou ao recarregar a página
        mostrar(true);
    }

    for (const nome of ["chat", "bolsa"] as const) {
        botoes[nome].addEventListener("click", () => escolher(nome));
        botoes[nome].addEventListener("keydown", (e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const outra: AbaLateral = nome === "chat" ? "bolsa" : "chat";
            escolher(outra);
            botoes[outra].focus();
        });
    }

    mostrar(false);
    return {
        get aba() {
            return aba;
        },
        escolher,
        chatVisivel: () => aba === "chat",
        avisarNovas(quantas) {
            if (aba === "chat") return;
            naoLidas += quantas;
            contador.textContent = naoLidas > 99 ? "99+" : String(naoLidas);
            contador.title = naoLidas === 1 ? "1 mensagem não lida" : `${naoLidas} mensagens não lidas`;
            contador.hidden = false;
        },
    };
}
