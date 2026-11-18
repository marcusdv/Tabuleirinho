// =====================================================================
// A PILHA DE BARRAS (HTML), na borda ESQUERDA da tela: "Desenho" e "Iniciativa" (o Tabuleiro foi para a aba Mapas da bolsa). Cada uma é uma BARRA estreita, e todas têm SEMPRE a mesma largura,
// por isso dá para empilhá-las. Clicar numa barra abre o CONTEÚDO dela PARA BAIXO, dentro da própria caixa, empurrando as barras de baixo
// (pedido do dono, 17/11/2026; só UMA fica aberta por vez: abrir uma fecha a outra; a altura cresce com animação, ver `alternarRecolhida` em animarPainel.ts).
//
// ARRASTAR uma barra dentro da pilha TROCA a ordem delas (as outras se afastam para abrir o lugar, e a barra se encaixa onde foi solta). A ordem fica
// guardada no navegador. Clicar (sem arrastar) abre/fecha. As barras NÃO saem da pilha: não há mais caixas soltas pela tela.
//
// A marcação e o CSS ficam no index.html (um script no fim dele aplica a ordem e o que está aberto ANTES da primeira pintura: as regras são as mesmas).
// =====================================================================

import { CHAVE_DESENHO_RECOLHIDO, CHAVE_FOG_RECOLHIDO, CHAVE_INICIATIVA_RECOLHIDA, CHAVE_ORDEM_PILHA } from "../config";
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

const DISTANCIA_MINIMA = 4; // px que o mouse precisa andar para um clique virar arrasto
const ORDEM_DE_FABRICA = ["ferramentas-desenho", "iniciativa", "fog"]; // de cima para baixo: Desenho, Iniciativa e Fog (a do Fog é só do mestre)

let restaurarAtual: (() => void) | null = null;

/** Devolve as barras à ordem de fábrica (o botão "Reorganizar telas" da barra de Ferramentas). */
export function restaurarPilha(): void {
    restaurarAtual?.();
}

export function criarPilha(): void {
    const pegar = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
    const barras: Barra[] = [
        { id: "ferramentas-desenho", nome: "Desenho", chave: CHAVE_DESENHO_RECOLHIDO, botao: "desenho-alternar" },
        { id: "iniciativa", nome: "Iniciativa", chave: CHAVE_INICIATIVA_RECOLHIDA, botao: "iniciativa-alternar" },
        { id: "fog", nome: "Fog", chave: CHAVE_FOG_RECOLHIDO, botao: "fog-alternar" },
    ].map((d) => {
        const caixa = pegar(d.id);
        return { id: d.id, nome: d.nome, chave: d.chave, caixa, botao: pegar(d.botao) as HTMLButtonElement, gaveta: caixa.querySelector<HTMLElement>(".conteudo")!, cabecalho: caixa.querySelector<HTMLElement>(".cabecalho")! };
    });

    // ---------------------------------------------------------------
    // Ordem (o `order` do CSS, de cada barra)
    // ---------------------------------------------------------------
    let ordem: string[] = lerOrdem();

    function lerOrdem(): string[] {
        const guardada = (lerPreferencia(CHAVE_ORDEM_PILHA) ?? "").split(",");
        const valida = guardada.length === ORDEM_DE_FABRICA.length && ORDEM_DE_FABRICA.every((id) => guardada.includes(id));
        return valida ? guardada : [...ORDEM_DE_FABRICA];
    }
    function aplicarOrdem(): void {
        for (const barra of barras) barra.caixa.style.order = String(ordem.indexOf(barra.id));
    }
    const barrasEmOrdem = (): Barra[] => ordem.map((id) => barras.find((b) => b.id === id)!);

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
    aplicarOrdem();

    // ---------------------------------------------------------------
    // Clicar abre/fecha; ARRASTAR troca de lugar
    // ---------------------------------------------------------------
    let engolirClique = false;

    for (const barra of barras) {
        barra.cabecalho.classList.add("alca-arrastar");
        barra.cabecalho.title = "Clique para abrir ou fechar; arraste para trocar de lugar";
        barra.cabecalho.addEventListener("click", () => {
            if (engolirClique) return; // o "click" que o navegador dispara ao soltar um arrasto não vale
            alternar(barra);
        });
        barra.cabecalho.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            comecarArrasto(barra, e);
        });
    }

    function comecarArrasto(barra: Barra, e: PointerEvent): void {
        const antes = barrasEmOrdem();
        const posicaoInicial = antes.indexOf(barra);
        const retangulos = antes.map((b) => b.caixa.getBoundingClientRect());
        const vao = antes.length > 1 ? retangulos[1].top - retangulos[0].bottom : 0;
        const meu = retangulos[posicaoInicial];
        const passo = meu.height + vao; // quanto as outras andam quando a barra arrastada passa por elas (as gavetas têm alturas diferentes)
        const topoMin = retangulos[0].top - meu.top; // até onde a barra pode subir e descer (as pontas da pilha)
        const topoMax = retangulos[retangulos.length - 1].bottom - meu.bottom;
        const inicioY = e.clientY;
        let arrastando = false;
        let novaPosicao = posicaoInicial;

        function aoMover(ev: PointerEvent): void {
            const dy = ev.clientY - inicioY;
            if (!arrastando) {
                if (Math.abs(dy) < DISTANCIA_MINIMA) return;
                arrastando = true;
                barra.caixa.classList.add("arrastando-caixa");
                for (const b of barras) b.caixa.classList.add("na-pilha"); // (as outras ganham a transição suave ao se afastar)
            }
            const deslocamento = Math.min(Math.max(dy, topoMin), topoMax);
            barra.caixa.style.translate = `0 ${deslocamento}px`;
            // Onde a barra se encaixaria: conta quantas das outras têm o centro ACIMA do centro dela.
            const centro = meu.top + deslocamento + meu.height / 2;
            novaPosicao = antes.filter((_, i) => i !== posicaoInicial && retangulos[i].top + retangulos[i].height / 2 < centro).length;
            // As outras se afastam para abrir o lugar: as que ficam entre a posição de origem e a nova andam o tamanho da barra arrastada.
            antes.forEach((b, i) => {
                if (b === barra) return;
                let anda = 0;
                if (posicaoInicial < novaPosicao && i > posicaoInicial && i <= novaPosicao) anda = -passo;
                if (posicaoInicial > novaPosicao && i >= novaPosicao && i < posicaoInicial) anda = passo;
                b.caixa.style.translate = anda === 0 ? "" : `0 ${anda}px`;
            });
        }

        function soltou(): void {
            document.removeEventListener("pointermove", aoMover);
            document.removeEventListener("pointerup", soltou);
            document.removeEventListener("pointercancel", soltou);
            if (!arrastando) return;
            barra.caixa.classList.remove("arrastando-caixa");
            // A nova ordem: a barra sai da posição de origem e entra na nova.
            const resto = antes.filter((b) => b !== barra);
            resto.splice(novaPosicao, 0, barra);
            ordem = resto.map((b) => b.id);
            // Troca a ordem de verdade e tira os deslocamentos SEM transição (senão as barras "voltariam" deslizando).
            for (const b of barras) {
                b.caixa.classList.remove("na-pilha");
                b.caixa.style.translate = "";
            }
            aplicarOrdem();
            guardarPreferencia(CHAVE_ORDEM_PILHA, ordem.join(","));
            engolirClique = true; // o navegador ainda dispara um "click" depois de soltar: este não vale
            setTimeout(() => (engolirClique = false), 0);
        }

        document.addEventListener("pointermove", aoMover);
        document.addEventListener("pointerup", soltou);
        document.addEventListener("pointercancel", soltou);
    }

    restaurarAtual = () => {
        ordem = [...ORDEM_DE_FABRICA];
        aplicarOrdem();
        guardarPreferencia(CHAVE_ORDEM_PILHA, "");
    };
}
