// =====================================================================
// A CAIXA DA INICIATIVA (HTML), a 3ª gaveta da pilha da esquerda: mostra a ordem de combate (ver `src/iniciativa.ts` para as regras) e deixa mexer nela. NÃO muda o estado:
// cada gesto vira uma AÇÃO (`opcoes.aoAcao`) que o `main.ts` manda ao servidor (ou aplica aqui, no modo local), e a caixa se redesenha quando o estado muda (`atualizar`).
//
// MODO DE EDIÇÃO (a caixa COMEÇA nele): aparecem o "+" (acrescentar uma criatura), "Limpar" e "Confirmar", a rodada vira um CAMPO para digitar, e o "Próximo turno" e o "Retornar" SOMEM; depois de "Confirmar" é o
// contrário: a rodada é só texto, aparecem "Próximo turno" e "Retornar" (acima do "Editar"), e só sobra o botão "Editar".
//
// A lista mostra cada personagem como TEXTO (o disco do token, ou uma bolinha cinza para uma criatura que não é token; o nome; o valor). Não há campos na lista:
//   - BOTÃO DIREITO num personagem: "Editar…" (a janelinha com o nome e o valor) e "Remover";
//   - ARRASTAR um personagem na lista o move (sair do critério de ordenação muda para "livre"; é o estado que decide);
//   - o personagem com a VEZ fica com um contorno dourado; empatados ganham um contorno azul suave;
//   - soltar aqui o total de uma rolagem do chat sempre ACRESCENTA um personagem novo (quem já estava fica: a pessoa tira a antiga à mão).
// Nomes entram por `textContent`/`value`: nada que o usuário escreve vira HTML.
// =====================================================================

import { VALOR_MAX_INICIATIVA } from "../config";
import { buscarToken } from "../estado";
import { iniciativa, type AcaoDaIniciativa } from "../iniciativa";
import { pintarDisco } from "./aparenciaToken";

export interface OpcoesIniciativa {
    /** A pessoa pediu uma ação na ordem de combate (o `main.ts` manda ao servidor, ou aplica aqui no modo local). */
    aoAcao(acao: AcaoDaIniciativa): void;
    /** "Limpar" apaga tudo: pergunta antes. Devolve true se a pessoa confirmou. */
    confirmarLimpar(): Promise<boolean>;
}

export interface PainelIniciativa {
    /** Redesenha a caixa a partir do estado (`iniciativa`). */
    atualizar(): void;
    /** Abre a gaveta, se estiver recolhida. */
    abrir(): void;
    /** O ponto da tela está sobre a caixa da iniciativa (inclusive a barra, com a gaveta recolhida)? */
    sobre(ponto: { x: number; y: number }): boolean;
    /** Destaca a caixa (um resultado de dado está sendo arrastado por cima dela). */
    destacarSoltar(ligado: boolean): void;
    /** Quando o PRÓXIMO personagem aparecer (o que o próximo pedido acrescentar), abre a janelinha de edição dele, com o foco no campo pedido. */
    editarProximaEntrada(foco: "nome" | "valor"): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarIniciativa(opcoes: OpcoesIniciativa): PainelIniciativa {
    const caixa = pegar("iniciativa");
    const lista = pegar<HTMLUListElement>("iniciativa-lista");
    const vazia = pegar("iniciativa-vazia");
        const rodada = pegar("iniciativa-rodada");
    const ordem = pegar<HTMLSelectElement>("iniciativa-ordem");
    const botaoProxima = pegar<HTMLButtonElement>("iniciativa-proxima");
    const botaoAnterior = pegar<HTMLButtonElement>("iniciativa-anterior");
    const rodadaEdicao = pegar("iniciativa-rodada-edicao");
    const campoRodada = pegar<HTMLInputElement>("iniciativa-rodada-campo");
    const botaoCriatura = pegar<HTMLButtonElement>("iniciativa-criatura");
    const botaoLimpar = pegar<HTMLButtonElement>("iniciativa-limpar");
    const botaoEditar = pegar<HTMLButtonElement>("iniciativa-editar");
    const menu = pegar("menu-iniciativa");
    const menuEditar = pegar<HTMLButtonElement>("menu-iniciativa-editar");
    const menuRemover = pegar<HTMLButtonElement>("menu-iniciativa-remover");
    const modal = pegar("modal-iniciativa");
    const campoNome = pegar<HTMLInputElement>("modal-iniciativa-nome");
    const campoValor = pegar<HTMLInputElement>("modal-iniciativa-valor");
    const botaoSalvar = pegar<HTMLButtonElement>("modal-iniciativa-salvar");
    const botaoCancelar = pegar<HTMLButtonElement>("modal-iniciativa-cancelar");
    let abrirNaProxima: "nome" | "valor" | null = null; // o próximo personagem que aparecer abre a janelinha de edição com o foco neste campo
    let idsAntes = new Set<number>();
    let idDoMenu: number | null = null;
    let idEmEdicao: number | null = null;

    // ---------------------------------------------------------------
    // Os controles
    // ---------------------------------------------------------------
    ordem.addEventListener("change", () => opcoes.aoAcao({ acao: "ordenar", ordenacao: ordem.value === "menor" ? "menor" : ordem.value === "livre" ? "livre" : "maior" }));
    botaoProxima.addEventListener("click", () => opcoes.aoAcao({ acao: "proxima" }));
    botaoAnterior.addEventListener("click", () => opcoes.aoAcao({ acao: "anterior" }));
    // Em edição a rodada é um campo: ao terminar de digitar (Enter ou sair do campo) vai ao servidor; valor que não vale volta ao que estava.
    campoRodada.addEventListener("change", () => {
        const n = Math.round(Number(campoRodada.value));
        if (campoRodada.value.trim() === "" || !Number.isFinite(n) || n === iniciativa.rodada) {
            campoRodada.value = String(iniciativa.rodada);
            return;
        }
        opcoes.aoAcao({ acao: "rodada", rodada: Math.max(0, Math.min(9999, n)) });
    });
    campoRodada.addEventListener("keydown", (e) => {
        if (e.key === "Enter") campoRodada.blur();
    });
    botaoCriatura.addEventListener("click", () => {
        abrirNaProxima = "nome";
        opcoes.aoAcao({ acao: "adicionar", nome: "Criatura", valor: 0, token: null });
    });
    botaoEditar.addEventListener("click", () => opcoes.aoAcao({ acao: iniciativa.editando ? "confirmar" : "editar" }));
    botaoLimpar.addEventListener("click", () => {
        if (iniciativa.entradas.length === 0 && iniciativa.rodada === 0) return;
        void opcoes.confirmarLimpar().then((sim) => {
            if (sim) opcoes.aoAcao({ acao: "resetar" });
        });
    });

    // ---------------------------------------------------------------
    // A janelinha "Editar" (nome e valor de um personagem)
    // ---------------------------------------------------------------
    function fecharEdicao(): void {
        modal.hidden = true;
        idEmEdicao = null;
        document.removeEventListener("keydown", aoTeclarNoModal, true);
    }
    function aoTeclarNoModal(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation(); // só a janelinha fecha
            fecharEdicao();
        } else if (e.key === "Enter" && (e.target === campoNome || e.target === campoValor)) {
            e.preventDefault();
            salvarEdicao();
        }
    }
    function abrirEdicao(id: number, foco: "nome" | "valor"): void {
        const entrada = iniciativa.entradas.find((e) => e.id === id);
        if (!entrada) return;
        idEmEdicao = id;
        campoNome.value = entrada.nome;
        campoValor.value = String(entrada.valor);
        modal.hidden = false;
        document.addEventListener("keydown", aoTeclarNoModal, true);
        const alvo = foco === "nome" ? campoNome : campoValor;
        alvo.focus();
        alvo.select();
    }
    function salvarEdicao(): void {
        const id = idEmEdicao;
        const entrada = id === null ? undefined : iniciativa.entradas.find((e) => e.id === id);
        fecharEdicao();
        if (id === null || !entrada) return;
        const nome = campoNome.value.trim();
        if (nome !== "" && nome !== entrada.nome) opcoes.aoAcao({ acao: "nome", id, nome });
        const valor = Math.round(Number(campoValor.value));
        if (campoValor.value.trim() !== "" && Number.isFinite(valor) && valor !== entrada.valor && Math.abs(valor) <= VALOR_MAX_INICIATIVA) opcoes.aoAcao({ acao: "valor", id, valor });
    }
    botaoSalvar.addEventListener("click", salvarEdicao);
    botaoCancelar.addEventListener("click", fecharEdicao);
    modal.addEventListener("pointerdown", (e) => {
        if (e.target === modal) fecharEdicao(); // clicar no fundo escuro cancela
    });

    // ---------------------------------------------------------------
    // O menu do botão direito ("Editar…" e "Remover")
    // ---------------------------------------------------------------
    function fecharMenu(): void {
        menu.hidden = true;
        idDoMenu = null;
    }
    function abrirMenu(id: number, x: number, y: number): void {
        idDoMenu = id;
        menu.hidden = false;
        menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - 8)}px`;
        menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - 8)}px`;
    }
    menuEditar.addEventListener("click", () => {
        const id = idDoMenu;
        fecharMenu();
        if (id !== null) abrirEdicao(id, "nome");
    });
    menuRemover.addEventListener("click", () => {
        const id = idDoMenu;
        fecharMenu();
        if (id !== null) opcoes.aoAcao({ acao: "remover", id });
    });
    document.addEventListener("pointerdown", (e) => {
        if (!menu.hidden && !menu.contains(e.target as Node)) fecharMenu();
    });
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape" && !menu.hidden) {
                e.stopPropagation();
                fecharMenu();
            }
        },
        true,
    );
    window.addEventListener("blur", fecharMenu);

    // ---------------------------------------------------------------
    // Arrastar um personagem para reorganizar
    // ---------------------------------------------------------------
    function ligarArrasto(item: HTMLLIElement, id: number): void {
        item.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const inicio = { x: e.clientX, y: e.clientY };
            const posicaoInicial = Array.from(lista.children).indexOf(item);
            let destino = posicaoInicial; // onde o personagem ficaria se fosse solto agora
            let arrastando = false;
            item.setPointerCapture(e.pointerId);
            // IMPORTANTE: o elemento NÃO é reposicionado no DOM durante o arrasto (mudar um elemento de lugar faz o navegador perder a captura do ponteiro e o arrasto para no meio).
            // Ele acompanha o mouse por `transform`, e uma LINHA dourada no personagem vizinho mostra onde vai cair.
            const limparMarcas = (): void => {
                for (const c of Array.from(lista.children)) c.classList.remove("insercao-acima", "insercao-abaixo");
            };
            const mover = (ev: PointerEvent): void => {
                if (!arrastando) {
                    if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 4) return;
                    arrastando = true;
                    item.classList.add("arrastando");
                }
                item.style.transform = `translateY(${ev.clientY - inicio.y}px)`;
                // A posição final: quantos dos OUTROS personagens têm o meio acima do ponteiro.
                const outros = Array.from(lista.children).filter((c) => c !== item) as HTMLElement[];
                destino = outros.filter((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2 < ev.clientY; }).length;
                limparMarcas();
                if (outros.length > 0) {
                    if (destino < outros.length) outros[destino].classList.add("insercao-acima");
                    else outros[outros.length - 1].classList.add("insercao-abaixo");
                }
            };
            const terminar = (cancelou: boolean): void => {
                item.removeEventListener("pointermove", mover);
                item.removeEventListener("pointerup", soltar);
                item.removeEventListener("pointercancel", cancelar);
                item.removeEventListener("lostpointercapture", cancelar);
                if (item.hasPointerCapture(e.pointerId)) item.releasePointerCapture(e.pointerId);
                item.classList.remove("arrastando");
                item.style.transform = "";
                limparMarcas();
                if (!arrastando) return;
                if (cancelou || destino === posicaoInicial) return;
                opcoes.aoAcao({ acao: "mover", id, para: destino });
            };
            const soltar = (): void => terminar(false);
            const cancelar = (): void => terminar(true);
            item.addEventListener("pointermove", mover);
            item.addEventListener("pointerup", soltar);
            item.addEventListener("pointercancel", cancelar);
            item.addEventListener("lostpointercapture", cancelar); // (a captura se perdeu por algum motivo: abandona, sem deixar o personagem "preso")
        });
    }

    // ---------------------------------------------------------------
    // Desenhar
    // ---------------------------------------------------------------
    function atualizar(): void {
        fecharMenu();
        const editando = iniciativa.editando;
        ordem.value = iniciativa.ordenacao;
        // O que aparece em cada modo (pedido do dono): em EDIÇÃO, "+ Criatura", "Limpar" e "Confirmar"; CONFIRMADO, a rodada e o "Próximo turno" (e só o "Editar").
        rodada.hidden = editando; // confirmado: o texto "Rodada N"; em edição: o campo para digitar a rodada
        rodadaEdicao.hidden = !editando;
        botaoProxima.hidden = editando;
        botaoAnterior.hidden = editando;
        botaoCriatura.hidden = !editando;
        botaoLimpar.hidden = !editando;
        botaoEditar.textContent = editando ? "Confirmar" : "Editar";
        botaoEditar.classList.toggle("principal", editando);
        rodada.textContent = iniciativa.rodada > 0 ? `Rodada ${iniciativa.rodada}` : "Rodada —";
        botaoProxima.disabled = iniciativa.entradas.length === 0;
        botaoAnterior.disabled = iniciativa.vez === null;
        if (document.activeElement !== campoRodada) campoRodada.value = String(iniciativa.rodada);
        vazia.hidden = iniciativa.entradas.length > 0;
        const novos: HTMLLIElement[] = [];
        iniciativa.entradas.forEach((entrada, i) => {
            const item = document.createElement("li");
            item.className = "iniciativa-item" + (entrada.id === iniciativa.vez ? " vez" : "");
            const vizinhos = [iniciativa.entradas[i - 1], iniciativa.entradas[i + 1]];
            if (vizinhos.some((v) => v && v.valor === entrada.valor)) item.classList.add("empate");
            item.dataset.id = String(entrada.id);
            item.title = (entrada.id === iniciativa.vez ? "Com a vez agora. " : "") + "Arraste para mudar a posição; botão direito: editar ou remover";
            const disco = document.createElement("span");
            disco.className = "iniciativa-disco";
            const token = entrada.token === null ? undefined : buscarToken(entrada.token);
            if (token) pintarDisco(disco, token.cor, token.corBorda, token.imagem);
            else disco.textContent = entrada.nome.charAt(0).toUpperCase();
            const nome = document.createElement("span");
            nome.className = "iniciativa-nome";
            nome.textContent = entrada.nome;
            const valor = document.createElement("span");
            valor.className = "iniciativa-valor";
            valor.textContent = String(entrada.valor);
            item.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                abrirMenu(entrada.id, e.clientX, e.clientY);
            });
            item.append(disco, nome, valor);
            ligarArrasto(item, entrada.id);
            novos.push(item);
        });
        lista.replaceChildren(...novos);
        // Acabou de acrescentar alguém ("+ Criatura", "Adicionar à iniciativa"): a janelinha de edição dele abre, com o foco no campo certo.
        if (abrirNaProxima) {
            const novo = iniciativa.entradas.find((e) => !idsAntes.has(e.id));
            if (novo) {
                const foco = abrirNaProxima;
                abrirNaProxima = null;
                abrirEdicao(novo.id, foco);
            }
        }
        idsAntes = new Set(iniciativa.entradas.map((e) => e.id));
    }

    atualizar();
    return {
        atualizar,
        abrir() {
            if (caixa.classList.contains("recolhida")) caixa.querySelector<HTMLElement>(".cabecalho")?.click();
        },
        sobre(ponto) {
            const alvo = document.elementFromPoint(ponto.x, ponto.y);
            return !!alvo && caixa.contains(alvo);
        },
        destacarSoltar(ligado) {
            caixa.classList.toggle("soltando", ligado);
        },
        editarProximaEntrada(foco) {
            abrirNaProxima = foco;
        },
    };
}
