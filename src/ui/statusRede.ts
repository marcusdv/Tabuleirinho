// =====================================================================
// STATUS DA REDE (HTML): uma "pílula" no topo, no meio, só no modo online: mostra se está conectado, quem você é
// e quem está na mesa. A marcação e o CSS ficam no index.html (id "rede-status").
// =====================================================================

import type { Jogador } from "../protocolo";

export interface StatusRede {
    /** Entrou na mesa com este apelido (o servidor pode ter limpado o que você digitou). */
    mostrarEntrada(apelido: string): void;
    /** A lista de quem está na mesa mudou. */
    mostrarJogadores(lista: Jogador[]): void;
    /** A conexão caiu (false) ou voltou (true). */
    mostrarConexao(conectada: boolean): void;
    /** O servidor recusou um pedido: mostra o motivo por uns instantes. */
    mostrarErro(motivo: string): void;
}

export function criarStatusRede(): StatusRede {
    const pilula = document.getElementById("rede-status") as HTMLElement;
    pilula.hidden = false;
    let voce = "";
    let jogadores: Jogador[] = [];
    let conectada = false;
    let aviso = "";
    let temporizador = 0;

    /** O texto entra por textContent (os apelidos vêm de outras pessoas: nunca como HTML). */
    function desenhar(): void {
        pilula.classList.toggle("offline", !conectada);
        pilula.classList.toggle("com-aviso", aviso !== "");
        if (aviso !== "") pilula.textContent = `⚠ ${aviso}`;
        else if (!conectada) pilula.textContent = "○ Conectando ao servidor…";
        else {
            // Duas linhas (pedido do dono, 17/11/2026): em cima quem está online; EMBAIXO quem está na MESMA CENA (o mesmo mapa) que você.
            const linha1 = document.createElement("span");
            linha1.textContent = `● Online: ${voce} · Na mesa: ${jogadores.map((j) => j.apelido).join(", ")}`;
            const linha2 = document.createElement("span");
            linha2.className = "rede-status-cena";
            const nestaCena = jogadores.filter((j) => j.naMinhaCena !== false).map((j) => j.apelido);
            linha2.textContent = `Na cena: ${nestaCena.length > 0 ? nestaCena.join(", ") : "—"}`;
            pilula.replaceChildren(linha1, linha2);
        }
    }
    desenhar();

    return {
        mostrarEntrada(apelido) {
            voce = apelido;
            conectada = true;
            desenhar();
        },
        mostrarJogadores(lista) {
            jogadores = lista;
            desenhar();
        },
        mostrarConexao(ligada) {
            conectada = ligada;
            desenhar();
        },
        mostrarErro(motivo) {
            aviso = motivo;
            desenhar();
            window.clearTimeout(temporizador);
            temporizador = window.setTimeout(() => {
                aviso = "";
                desenhar();
            }, 3000);
        },
    };
}
