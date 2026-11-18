// =====================================================================
// AS PASTAS DA BOLSA (HTML), na bolsa em TELA CHEIA (pedido do dono, 17/11/2026): tokens e fichas podem ser organizados em PASTAS (pasta dentro de pasta), separadas
// por tipo. Em cada aba aparece:
//   - a BARRA das pastas, logo acima da grade: o caminho ("Todas › Monstros › Goblins", cada parte clicável) e o botão "+ Pasta" (o nome se digita ali mesmo);
//   - os LADRILHOS das pastas que estão na pasta aberta, no começo da grade (duplo clique abre; botão direito: Abrir, Renomear, Compartilhar…, Excluir);
//   - e só os itens que estão na pasta aberta (pesquisando, aparecem os de todas as pastas).
// ARRASTAR um item (ou os selecionados) até um ladrilho, ou até uma parte do caminho, o põe nessa pasta; arrastar um ladrilho faz o mesmo com a pasta.
// Na bolsa do canto as pastas não aparecem (lá a lista é corrida). Quem manda no servidor é o main.ts (callbacks); os nomes entram por textContent/value (nunca como HTML).
// =====================================================================

import { caminhoDaPasta, estado, type Pasta } from "../estado";

type TipoDePasta = "tokens" | "fichas";

export interface OpcoesPastasDaBolsa {
    aoCriar(tipo: TipoDePasta, nome: string, pai: number | null): void;
    aoRenomear(pasta: Pasta, nome: string): void;
    aoMoverPasta(pasta: Pasta, pai: number | null): void;
    aoExcluir(pasta: Pasta): void;
    aoMoverItens(tipo: TipoDePasta, ids: number[], pasta: number | null): void;
    aoCompartilhar(pasta: Pasta): void;
    /** Esta pessoa é o mestre? (só ele compartilha) */
    ehMestre(): boolean;
    /** A pasta aberta mudou (as listas da bolsa precisam ser refeitas). */
    aoMudarPasta(): void;
}

export interface PastasDaBolsa {
    /** A pasta aberta em cada aba (null = a raiz). */
    atual(tipo: TipoDePasta): number | null;
    /** Só os itens que estão na pasta aberta (um item numa pasta que esta pessoa não vê conta como da raiz). */
    filtrar<T extends { pasta?: number | null }>(tipo: TipoDePasta, lista: T[]): T[];
    /** A barra (caminho + "+ Pasta") de cada aba: o elemento é criado uma vez; `atualizarBarra` refaz o conteúdo. */
    barra(tipo: TipoDePasta): HTMLElement;
    atualizarBarra(tipo: TipoDePasta): void;
    /** Os ladrilhos das pastas que estão na pasta aberta (para pôr no começo da grade). */
    ladrilhos(tipo: TipoDePasta, tag: "div" | "li"): HTMLElement[];
    /** Liga o ARRASTO de um item (só na tela cheia): `ids()` diz quais vão junto (os selecionados, se ele está entre eles). */
    ligarArrastoDoItem(el: HTMLElement, tipo: TipoDePasta, ids: () => number[]): void;
    /** Acabou de soltar um arrasto? (o "click" que o navegador dispara depois não deve selecionar nem abrir o item) */
    engolirClique(): boolean;
}

const LIMIAR_ARRASTO = 6; // px que o mouse anda antes de virar arrasto

export function criarPastasDaBolsa(opcoes: OpcoesPastasDaBolsa): PastasDaBolsa {
    const aberta: Record<TipoDePasta, number | null> = { tokens: null, fichas: null };
    const barras: Record<TipoDePasta, HTMLElement> = { tokens: document.createElement("div"), fichas: document.createElement("div") };
    for (const tipo of ["tokens", "fichas"] as const) barras[tipo].className = "bolsa-pastas-barra";
    let ultimoSoltar = 0;

    /** A pasta existe (e esta pessoa a vê), é deste tipo? */
    const existe = (tipo: TipoDePasta, id: number | null | undefined): id is number => id != null && estado.pastas.some((p) => p.id === id && p.tipo === tipo);
    /** A pasta aberta ainda existe? (pode ter sido apagada, ou deixado de ser vista) Senão, volta à de cima que existe. */
    function conferirAberta(tipo: TipoDePasta): void {
        while (aberta[tipo] !== null && !existe(tipo, aberta[tipo])) aberta[tipo] = estado.pastas.find((p) => p.id === aberta[tipo])?.pai ?? null;
    }
    function irPara(tipo: TipoDePasta, id: number | null): void {
        aberta[tipo] = id;
        opcoes.aoMudarPasta();
    }

    // ---------------------------------------------------------------
    // O menu do botão direito de um ladrilho
    // ---------------------------------------------------------------
    let menu: HTMLElement | null = null;
    function fecharMenu(): void {
        menu?.remove();
        menu = null;
        document.removeEventListener("pointerdown", aoApertarFora, true);
    }
    function aoApertarFora(e: PointerEvent): void {
        if (menu && !menu.contains(e.target as Node)) fecharMenu();
    }
    function abrirMenu(pasta: Pasta, x: number, y: number, renomear: () => void): void {
        fecharMenu();
        menu = document.createElement("div");
        menu.className = "menu-pasta";
        menu.setAttribute("role", "menu");
        const item = (texto: string, acao: () => void): HTMLButtonElement => {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("role", "menuitem");
            b.textContent = texto;
            b.addEventListener("click", () => {
                fecharMenu();
                acao();
            });
            return b;
        };
        menu.append(item("Abrir", () => irPara(pasta.tipo, pasta.id)), item("Renomear", renomear));
        if (opcoes.ehMestre()) menu.append(item("Compartilhar…", () => opcoes.aoCompartilhar(pasta)));
        if (pasta.pai !== null) menu.append(item("Tirar desta pasta (subir um nível)", () => opcoes.aoMoverPasta(pasta, caminhoDaPasta(pasta.pai).at(-2)?.id ?? null)));
        menu.append(item("Excluir pasta", () => opcoes.aoExcluir(pasta)));
        document.body.append(menu);
        const caixa = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
        document.addEventListener("pointerdown", aoApertarFora, true);
    }

    /** Um campo de texto no lugar de um elemento, para digitar um nome (Enter confirma, Esc ou sair do campo cancela). */
    function pedirNome(lugar: HTMLElement, inicial: string, aoConfirmar: (nome: string) => void, aoCancelar: () => void): void {
        const campo = document.createElement("input");
        campo.type = "text";
        campo.className = "bolsa-pasta-campo";
        campo.maxLength = 40;
        campo.value = inicial;
        campo.setAttribute("aria-label", "Nome da pasta");
        let terminou = false;
        const terminar = (confirmar: boolean): void => {
            if (terminou) return;
            terminou = true;
            const nome = campo.value.trim();
            if (confirmar && nome !== "") aoConfirmar(nome);
            else aoCancelar();
        };
        campo.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.isComposing) terminar(true);
            if (e.key === "Escape") terminar(false);
        });
        campo.addEventListener("blur", () => terminar(true));
        campo.addEventListener("pointerdown", (e) => e.stopPropagation());
        lugar.replaceChildren(campo);
        campo.focus();
        campo.select();
    }

    // ---------------------------------------------------------------
    // O ARRASTO (itens e pastas) até um alvo: um ladrilho de pasta ou uma parte do caminho (data-pasta-alvo: o id, ou "raiz")
    // ---------------------------------------------------------------
    function arrastar(e: PointerEvent, rotulo: string, aoSoltar: (alvo: number | null) => void, podeSoltarEm: (alvo: number | null) => boolean): void {
        const inicio = { x: e.clientX, y: e.clientY };
        let fantasma: HTMLElement | null = null;
        let alvoAtual: HTMLElement | null = null;
        const alvoSob = (x: number, y: number): HTMLElement | null => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-pasta-alvo]") ?? null;
        const idDoAlvo = (el: HTMLElement): number | null => (el.dataset.pastaAlvo === "raiz" ? null : Number(el.dataset.pastaAlvo));
        const mover = (m: PointerEvent): void => {
            if (!fantasma) {
                if (Math.hypot(m.clientX - inicio.x, m.clientY - inicio.y) < LIMIAR_ARRASTO) return;
                fantasma = document.createElement("div");
                fantasma.className = "bolsa-pasta-fantasma";
                fantasma.textContent = rotulo;
                document.body.append(fantasma);
            }
            fantasma.style.left = `${m.clientX + 12}px`;
            fantasma.style.top = `${m.clientY + 12}px`;
            const alvo = alvoSob(m.clientX, m.clientY);
            const valido = alvo && podeSoltarEm(idDoAlvo(alvo)) ? alvo : null;
            if (valido !== alvoAtual) {
                alvoAtual?.classList.remove("alvo-de-soltar");
                valido?.classList.add("alvo-de-soltar");
                alvoAtual = valido;
            }
        };
        const soltar = (): void => {
            document.removeEventListener("pointermove", mover);
            document.removeEventListener("pointerup", soltar);
            document.removeEventListener("pointercancel", soltar);
            if (!fantasma) return; // (foi só um clique)
            fantasma.remove();
            ultimoSoltar = Date.now();
            alvoAtual?.classList.remove("alvo-de-soltar");
            if (alvoAtual) aoSoltar(idDoAlvo(alvoAtual));
        };
        document.addEventListener("pointermove", mover);
        document.addEventListener("pointerup", soltar);
        document.addEventListener("pointercancel", soltar);
    }

    function atualizarBarra(tipo: TipoDePasta): void {
        conferirAberta(tipo);
        const barra = barras[tipo];
        const caminho = document.createElement("nav");
        caminho.className = "bolsa-pastas-caminho";
        caminho.setAttribute("aria-label", "Pasta aberta");
        const parte = (texto: string, id: number | null, atual: boolean): HTMLButtonElement => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "bolsa-pastas-parte" + (atual ? " atual" : "");
            b.textContent = texto;
            b.dataset.pastaAlvo = id === null ? "raiz" : String(id); // (dá para SOLTAR itens aqui)
            b.title = atual ? "Pasta aberta" : `Abrir "${texto}" (ou solte itens aqui para pô-los nela)`;
            b.addEventListener("click", () => irPara(tipo, id));
            return b;
        };
        const pastasDoCaminho = caminhoDaPasta(aberta[tipo]);
        caminho.append(parte(tipo === "tokens" ? "📁 Todos os tokens" : "📁 Todas as fichas", null, pastasDoCaminho.length === 0));
        for (const [i, p] of pastasDoCaminho.entries()) {
            const sep = document.createElement("span");
            sep.className = "bolsa-pastas-sep";
            sep.textContent = "›";
            caminho.append(sep, parte(p.nome, p.id, i === pastasDoCaminho.length - 1));
        }
        const nova = document.createElement("button");
        nova.type = "button";
        nova.className = "bolsa-botao-pequeno bolsa-pastas-nova";
        nova.textContent = "+ Pasta";
        nova.title = "Criar uma pasta aqui (depois é só arrastar tokens ou fichas para ela)";
        const lugarDoBotao = document.createElement("span");
        lugarDoBotao.className = "bolsa-pastas-lugar";
        lugarDoBotao.append(nova);
        nova.addEventListener("click", () =>
            pedirNome(lugarDoBotao, "Nova pasta", (nome) => opcoes.aoCriar(tipo, nome, aberta[tipo]), () => lugarDoBotao.replaceChildren(nova)),
        );
        barra.replaceChildren(caminho, lugarDoBotao);
    }

    return {
        atual: (tipo) => {
            conferirAberta(tipo);
            return aberta[tipo];
        },
        filtrar(tipo, lista) {
            conferirAberta(tipo);
            const alvo = aberta[tipo];
            return lista.filter((item) => (existe(tipo, item.pasta) ? item.pasta : null) === alvo);
        },
        barra: (tipo) => barras[tipo],
        atualizarBarra,
        ladrilhos(tipo, tag) {
            conferirAberta(tipo);
            const dentro = estado.pastas.filter((p) => p.tipo === tipo && p.pai === aberta[tipo]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
            return dentro.map((pasta) => {
                const el: HTMLElement = document.createElement(tag);
                el.className = "bolsa-pasta";
                el.dataset.pastaAlvo = String(pasta.id);
                el.tabIndex = 0;
                el.setAttribute("role", "button");
                const quantos =
                    (tipo === "tokens" ? estado.tokens.filter((t) => t.guardado && t.copiaDe === null && !t.somenteMapa && t.pasta === pasta.id).length : estado.fichas.filter((f) => f.pasta === pasta.id).length) +
                    estado.pastas.filter((p) => p.pai === pasta.id).length;
                el.title = `${pasta.nome}: duplo clique para abrir; arraste tokens ou fichas para cá; botão direito: mais opções`;
                const icone = document.createElement("span");
                icone.className = "bolsa-pasta-icone";
                icone.textContent = "📁";
                icone.setAttribute("aria-hidden", "true");
                const nome = document.createElement("span");
                nome.className = "bolsa-pasta-nome";
                nome.textContent = pasta.nome;
                const conta = document.createElement("small");
                conta.textContent = quantos === 1 ? "1 item" : `${quantos} itens`;
                el.append(icone, nome, conta);
                const renomear = (): void => pedirNome(nome, pasta.nome, (novo) => opcoes.aoRenomear(pasta, novo), () => (nome.textContent = pasta.nome));
                el.addEventListener("dblclick", () => irPara(tipo, pasta.id));
                el.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") irPara(tipo, pasta.id);
                });
                el.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    abrirMenu(pasta, e.clientX, e.clientY, renomear);
                });
                // Arrastar a PASTA até outra pasta (ou até o caminho) a põe lá dentro.
                el.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0) return;
                    arrastar(e, `📁 ${pasta.nome}`, (alvo) => opcoes.aoMoverPasta(pasta, alvo), (alvo) => alvo !== pasta.id && alvo !== pasta.pai);
                });
                return el;
            });
        },
        ligarArrastoDoItem(el, tipo, ids) {
            el.addEventListener("pointerdown", (e) => {
                if (e.button !== 0 || (e.target as HTMLElement).closest(".item-estrela")) return;
                const lista = ids();
                arrastar(e, lista.length === 1 ? "1 item" : `${lista.length} itens`, (alvo) => opcoes.aoMoverItens(tipo, lista, alvo), (alvo) => alvo !== aberta[tipo]);
            });
        },
        engolirClique: () => Date.now() - ultimoSoltar < 300,
    };
}
