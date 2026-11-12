// =====================================================================
// BALÃO DO TOKEN (HTML): a "dica" que aparece quando o mouse passa por cima
// de um token, listando TODAS as condições que ele está sofrendo (inclusive
// as que ficaram escondidas atrás do "+N" no token).
// Token sem condições não mostra balão.
//
// O balão é INTERATIVO: o mouse pode ir do token até ele, e passar o mouse
// numa condição da lista mostra a DESCRIÇÃO dela. Para dar tempo de o mouse
// chegar, o balão só some DEPOIS de um pequeno atraso quando o mouse sai do
// token; entrar no balão (ou voltar ao token) cancela o atraso.
//
// TAMANHO: o balão tem altura máxima (ALTURA_MAX_BALAO); com condições demais,
// a lista rola. Ele também nunca cobre o token: a altura é limitada ao espaço
// livre acima do token e, se ali não sobra espaço, o balão vai para BAIXO dele.
// A marcação HTML e o CSS ficam no index.html.
// =====================================================================

import { buscarCondicao, urlDoIcone } from "../condicoes";
import { ALTURA_MAX_BALAO, ALTURA_MIN_BALAO } from "../config";
import { limitar } from "../coordenadas";
import { buscarToken } from "../estado";
import type { AncoraBalao } from "../tabuleiro/tokens";
import type { DicaCondicao } from "./dicaCondicao";

export interface OpcoesBalao {
    /** Pontos (em pixels da tela) acima e abaixo do token, para posicionar o balão. */
    ancora(id: number): AncoraBalao | null;
    /** Balão que descreve uma condição quando o mouse passa por cima dela. */
    dica: DicaCondicao;
}

export interface BalaoToken {
    /** Mostra o balão com as condições do token (ou nada, se ele não tem nenhuma). */
    mostrar(id: number): void;
    /** O mouse saiu do token: esconde o balão depois de um atraso (a menos que o mouse entre nele). */
    agendarEsconder(): void;
    /** Esconde o balão AGORA (arrasto, clique direito, zoom, pan...). */
    esconder(): void;
}

const MARGEM_JANELA = 6; // px mínimos entre o balão e a borda da janela
const DISTANCIA = 10; // px entre o balão e o token
const ATRASO_ESCONDER_MS = 400; // tempo para o mouse sair do token e chegar ao balão

export function criarBalaoToken(opcoes: OpcoesBalao): BalaoToken {
    const balao = document.getElementById("balao-token") as HTMLDivElement;
    const lista = document.getElementById("balao-lista") as HTMLUListElement;

    // Temporizador do atraso para esconder (undefined = nenhum agendado).
    let temporizador: number | undefined;

    function cancelarAgendamento(): void {
        window.clearTimeout(temporizador);
        temporizador = undefined;
    }

    function esconder(): void {
        cancelarAgendamento();
        balao.hidden = true;
        opcoes.dica.esconder(balao); // some junto, mas só se a descrição for DESTE balão
    }

    function agendarEsconder(): void {
        cancelarAgendamento();
        temporizador = window.setTimeout(esconder, ATRASO_ESCONDER_MS);
    }

    // O mouse entrou no balão: cancela o atraso e mantém o balão aberto.
    // Saiu do balão: recomeça a contagem (e a descrição some).
    balao.addEventListener("mouseenter", cancelarAgendamento);
    balao.addEventListener("mouseleave", () => {
        opcoes.dica.esconder(balao);
        agendarEsconder();
    });

    // Ao rolar a lista, a descrição aberta ficaria alinhada a um item que mudou de lugar:
    // some, e reaparece ao passar o mouse no próximo item.
    lista.addEventListener("scroll", () => opcoes.dica.esconder(balao));

    function mostrar(id: number): void {
        cancelarAgendamento(); // voltou ao token (ou a outro): não esconder mais
        const token = buscarToken(id);
        const ancora = opcoes.ancora(id);
        if (!token || !ancora || token.condicoes.length === 0) return esconder();

        // Refaz a lista: um item (ícone + nome) por condição, na ordem em que foram aplicadas.
        lista.replaceChildren();
        for (const condicaoId of token.condicoes) {
            const condicao = buscarCondicao(condicaoId);
            if (!condicao) continue;

            const item = document.createElement("li");
            const imagem = document.createElement("img");
            imagem.src = urlDoIcone(condicao.id);
            imagem.alt = "";
            imagem.draggable = false;
            const nome = document.createElement("span");
            nome.textContent = condicao.nome;
            item.append(imagem, nome);

            // Passar o mouse na condição mostra a descrição ao lado do balão.
            item.addEventListener("mouseenter", () => opcoes.dica.mostrar(condicao.id, balao, item));
            item.addEventListener("mouseleave", () => opcoes.dica.esconder(balao));
            lista.appendChild(item);
        }
        lista.scrollTop = 0; // sempre começa do topo da lista

        // --- Tamanho: mede a altura NATURAL (sem limite) para decidir onde e quão alto fica ---
        balao.hidden = false; // precisa estar visível para medir
        balao.classList.remove("abaixo");
        balao.style.maxHeight = "none";
        const alturaNatural = balao.offsetHeight;
        const largura = balao.offsetWidth;

        // Espaço livre acima e abaixo do token, já descontando a distância e a margem da janela.
        const espacoAcima = ancora.topo - DISTANCIA - MARGEM_JANELA;
        const espacoAbaixo = window.innerHeight - ancora.base - DISTANCIA - MARGEM_JANELA;

        // Altura desejada: a natural, mas no máximo ALTURA_MAX_BALAO (acima disso, rola).
        const desejada = Math.min(alturaNatural, ALTURA_MAX_BALAO);

        // Prefere ficar ACIMA do token. Só vai para BAIXO se não couber em cima e embaixo houver mais espaço.
        const abaixo = espacoAcima < desejada && espacoAbaixo > espacoAcima;
        const disponivel = abaixo ? espacoAbaixo : espacoAcima;
        const altura = Math.max(ALTURA_MIN_BALAO, Math.min(desejada, disponivel));

        // O balão só encolhe se for maior que a altura permitida: a lista é que rola (o título fica fixo).
        balao.style.maxHeight = `${altura}px`;
        const alturaFinal = balao.offsetHeight;
        balao.classList.toggle("abaixo", abaixo); // a setinha aponta para o lado do token

        // Centrado no token, sem sair da janela.
        const esquerda = limitar(ancora.x - largura / 2, MARGEM_JANELA, window.innerWidth - largura - MARGEM_JANELA);
        const topo = abaixo ? ancora.base + DISTANCIA : ancora.topo - alturaFinal - DISTANCIA;
        balao.style.left = `${esquerda}px`;
        balao.style.top = `${Math.max(MARGEM_JANELA, topo)}px`;

        // A setinha do balão aponta para o token mesmo quando o balão foi
        // empurrado para o lado: ela fica na posição horizontal da âncora.
        balao.style.setProperty("--seta-x", `${limitar(ancora.x - esquerda, 14, largura - 14)}px`);
    }

    return { mostrar, agendarEsconder, esconder };
}
