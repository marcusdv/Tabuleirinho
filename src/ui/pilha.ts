// =====================================================================
// A PILHA DE BARRAS (HTML), na borda ESQUERDA da tela: "Desenho", "Área", "Fog" e "Iniciativa" (o Tabuleiro foi para a aba Mapas da bolsa). Cada uma é uma BARRA estreita, e todas têm SEMPRE a mesma
// largura, por isso dá para empilhá-las. Clicar numa barra abre o CONTEÚDO dela PARA BAIXO, dentro da própria caixa, empurrando as barras de baixo
// (pedido do dono, 17/11/2026; só UMA fica aberta por vez: abrir uma fecha a outra; a altura cresce com animação, ver `alternarRecolhida` em animarPainel.ts).
//
// A ORDEM É FIXA (pedido do dono, 19/11/2026: "remover a possibilidade de reorganizar a pilha lateral"): antes dava para arrastar uma barra para trocar de lugar; isso saiu, junto com o botão
// "Reorganizar telas" e a ordem guardada no navegador.
//
// A marcação e o CSS ficam no index.html (um script no fim dele aplica a ordem e o que está aberto ANTES da primeira pintura: as regras são as mesmas).
// =====================================================================

import { CHAVE_AREA_RECOLHIDA, CHAVE_DESENHO_RECOLHIDO, CHAVE_FOG_RECOLHIDO, CHAVE_INICIATIVA_RECOLHIDA } from "../config";
import { alternarRecolhida } from "./animarPainel";
import { guardarPreferencia, lerPreferencia } from "./preferencias";

interface Barra {
    id: string; // o id do elemento da caixa
    nome: string;
    chave: string; // a preferência: "1" = recolhida
    caixa: HTMLElement;
    botao: HTMLButtonElement;
    gaveta: HTMLElement;
    cabecalho: HTMLElement;
}

const ORDEM_DE_FABRICA = ["ferramentas-desenho", "area", "fog", "iniciativa"]; // de cima para baixo: Desenho, Área, Fog e Iniciativa (a do Fog é só do mestre; ordem pedida pelo dono em 19/11/2026)

export function criarPilha(): void {
    const pegar = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
    const barras: Barra[] = [
        { id: "ferramentas-desenho", nome: "Desenho", chave: CHAVE_DESENHO_RECOLHIDO, botao: "desenho-alternar" },
        { id: "area", nome: "Área", chave: CHAVE_AREA_RECOLHIDA, botao: "area-alternar" },
        { id: "iniciativa", nome: "Iniciativa", chave: CHAVE_INICIATIVA_RECOLHIDA, botao: "iniciativa-alternar" },
        { id: "fog", nome: "Fog", chave: CHAVE_FOG_RECOLHIDO, botao: "fog-alternar" },
    ].map((d) => {
        const caixa = pegar(d.id);
        return { id: d.id, nome: d.nome, chave: d.chave, caixa, botao: pegar(d.botao) as HTMLButtonElement, gaveta: caixa.querySelector<HTMLElement>(".conteudo")!, cabecalho: caixa.querySelector<HTMLElement>(".cabecalho")! };
    });

    // ---------------------------------------------------------------
    // Ordem (o `order` do CSS, de cada barra): FIXA
    // ---------------------------------------------------------------
    const barrasEmOrdem = (): Barra[] => ORDEM_DE_FABRICA.map((id) => barras.find((b) => b.id === id)!);
    for (const barra of barras) barra.caixa.style.order = String(ORDEM_DE_FABRICA.indexOf(barra.id));

    // ---------------------------------------------------------------
    // Abrir e fechar a gaveta
    // ---------------------------------------------------------------
    function aplicarEstado(barra: Barra, recolhida: boolean): void {
        barra.caixa.classList.toggle("recolhida", recolhida);
        barra.botao.title = recolhida ? `Abrir ${barra.nome}` : `Fechar ${barra.nome}`;
        barra.botao.setAttribute("aria-expanded", String(!recolhida));
    }
    /** INVERTE o estado de UMA barra, com animação (a altura cresce ou encolhe), e guarda a escolha. (`_recolher` só documenta o destino: quem chama já conferiu que ele é o oposto do atual.) */
    function definir(barra: Barra, _recolher: boolean): void {
        const recolhida = alternarRecolhida(barra.caixa, "recolhida", (r) => aplicarEstado(barra, r));
        barra.botao.classList.toggle("recolhido", recolhida); // a SETA gira junto com a gaveta (CSS: mesma duração e curva)
        guardarPreferencia(barra.chave, recolhida ? "1" : "0");
    }
    /** Clicou numa barra: ela abre (ou fecha) PARA BAIXO; ao abrir, a OUTRA fecha (só uma aberta por vez; pedido do dono, 17/11/2026). */
    function alternar(barra: Barra): void {
        const abrir = barra.caixa.classList.contains("recolhida");
        definir(barra, !abrir);
        if (abrir) for (const outra of barras) if (outra !== barra && !outra.caixa.classList.contains("recolhida")) definir(outra, true);
    }

    // O que estava aberto da última vez (sem escolha guardada: tudo recolhido). Só UMA fica aberta (se por engano duas estavam, vale a de cima).
    let jaAberta = false;
    for (const barra of barrasEmOrdem()) {
        let recolhida = lerPreferencia(barra.chave) !== "0";
        if (!recolhida && jaAberta) {
            recolhida = true;
            guardarPreferencia(barra.chave, "1");
        }
        if (!recolhida) jaAberta = true;
        aplicarEstado(barra, recolhida);
        barra.botao.classList.toggle("recolhido", recolhida); // (a seta já nasce na posição certa, sem girar)
    }

    // ---------------------------------------------------------------
    // Clicar no cabeçalho abre/fecha a gaveta
    // ---------------------------------------------------------------
    for (const barra of barras) {
        barra.cabecalho.title = "Clique para abrir ou fechar";
        barra.cabecalho.addEventListener("click", () => alternar(barra));
    }
}
