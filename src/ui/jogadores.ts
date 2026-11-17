// =====================================================================
// JOGADORES (HTML): a aba "Jogadores" da bolsa e a janela "Compartilhar" (SÓ do MESTRE; para os jogadores esses controles nem aparecem, e o servidor recusa os pedidos de qualquer jeito).
//   - Aba "Jogadores": quem está na mesa (e quem já tem algo liberado), o papel de cada um (mestre ou jogador), os botões "Tornar mestre" / "Tirar mestre" e a CONFIGURAÇÃO DA MESA
//     (os limites de tokens e de fichas por jogador).
//   - Janela "Compartilhar": para UM token, UMA ficha ou UM grupo, escolhe para cada jogador "Sem acesso", "Leitor" ou "Editor" (o dono, quando há, aparece fixo).
// O mestre vê o documento de permissões inteiro (o servidor só o manda aos mestres). Os nomes entram por textContent (nunca como HTML). Quem manda no servidor é o `main.ts` (callbacks).
// =====================================================================

import type { NivelDeAcesso, Permissoes, TipoDeItem } from "../permissoes";
import type { Jogador } from "../protocolo";

export interface OpcoesJogadores {
    /** Dar ou tirar o poder de mestre de um usuário. */
    aoDefinirMestre(usuario: string, mestre: boolean): void;
    /** Mudar os limites por jogador (tokens e fichas). */
    aoDefinirLimites(tokens: number, fichas: number): void;
    /** Banir (ou desbanir) alguém da mesa. */
    aoBanir(usuario: string, nome: string, banir: boolean): void;
    /** Pergunta antes de uma ação séria (tornar mestre, banir): devolve true se a pessoa confirmou. */
    confirmar(pergunta: { titulo: string; mensagem: string; confirmar: string }): Promise<boolean>;
    /** Liberar (ou tirar a liberação de) um token, uma ficha ou um grupo para um usuário. */
    aoLiberar(item: TipoDeItem | "grupos", id: number, usuario: string, nivel: NivelDeAcesso | null): void;
}

export interface Jogadores {
    /** O servidor mandou o documento de permissões (só os mestres o recebem). */
    definirPermissoes(permissoes: Permissoes | null): void;
    /** A lista de quem está conectado mudou. */
    definirConectados(lista: Jogador[], meuUsuario: string | null): void;
    /** Abre a janela "Compartilhar" de um item. */
    compartilhar(item: TipoDeItem | "grupos", id: number, nome: string, gruposDoItem?: number[]): void;
    /** Os jogadores (que não são mestres) que o mestre conhece: para escolher quem vê um mapa. */
    jogadoresConhecidos(): { usuario: string; nome: string }[];
}

const pegar = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Um usuário que o mestre conhece: o id, o nome (se está conectado, o apelido; senão o próprio id sem o "u_") e se está online. */
interface Conhecido {
    usuario: string;
    nome: string;
    online: boolean;
    mestre: boolean;
    eu: boolean;
}

export function criarJogadores(opcoes: OpcoesJogadores): Jogadores {
    const lista = pegar("bolsa-jogadores-lista");
    const botaoBanidos = pegar<HTMLButtonElement>("bolsa-banidos-botao");
    const listaBanidos = pegar("bolsa-banidos-lista");
    const campoTokens = pegar<HTMLInputElement>("bolsa-limite-tokens");
    const campoFichas = pegar<HTMLInputElement>("bolsa-limite-fichas");
    const botaoLimites = pegar<HTMLButtonElement>("bolsa-limites-salvar");
    const janela = pegar("compartilhar");
    const titulo = pegar("compartilhar-titulo");
    const listaLiberacao = pegar("compartilhar-lista");
    const vazioLiberacao = pegar("compartilhar-vazio");
    const botaoFechar = pegar<HTMLButtonElement>("compartilhar-fechar");

    let temporizadorSalvo = 0;
    let permissoes: Permissoes | null = null;
    let conectados: Jogador[] = [];
    let meuUsuario: string | null = null;
    let aberto: { item: TipoDeItem | "grupos"; id: number; nome: string; grupos: number[] } | null = null;

    /** Todos os usuários que o mestre conhece: os conectados e os que aparecem no documento (donos, liberados, mestres). */
    function conhecidos(): Conhecido[] {
        const porId = new Map<string, Conhecido>();
        const nomeDoId = (u: string): string => u.replace(/^u_/, "").replace(/_/g, " ");
        const garantir = (usuario: string): Conhecido => {
            let c = porId.get(usuario);
            if (!c) {
                c = { usuario, nome: nomeDoId(usuario), online: false, mestre: false, eu: usuario === meuUsuario };
                porId.set(usuario, c);
            }
            return c;
        };
        for (const j of conectados) {
            if (!j.usuario) continue;
            const c = garantir(j.usuario);
            c.nome = j.apelido;
            c.online = true;
            c.mestre = j.mestre === true;
        }
        if (permissoes) {
            if (permissoes.dono) garantir(permissoes.dono).mestre = true;
            for (const m of permissoes.mestres) garantir(m).mestre = true;
            for (const tipo of ["tokens", "fichas"] as const) {
                for (const item of Object.values(permissoes[tipo])) {
                    if (item.dono) garantir(item.dono);
                    for (const u of Object.keys(item.acessos)) garantir(u);
                }
            }
            for (const acessos of Object.values(permissoes.grupos)) for (const u of Object.keys(acessos)) garantir(u);
        }
        return [...porId.values()].sort((a, b) => Number(b.mestre) - Number(a.mestre) || a.nome.localeCompare(b.nome, "pt-BR"));
    }

    function desenharLista(): void {
        const todos = conhecidos();
        lista.replaceChildren(
            ...todos.map((c) => {
                const item = document.createElement("li");
                const ponto = document.createElement("span");
                ponto.className = `ponto ${c.online ? "online" : ""}`;
                ponto.title = c.online ? "Conectado" : "Desconectado";
                const nome = document.createElement("span");
                nome.className = "jogador-nome";
                nome.textContent = c.eu ? `${c.nome} (você)` : c.nome;
                nome.title = c.usuario;
                const papel = document.createElement("span");
                papel.className = `papel ${c.mestre ? "mestre" : ""}`;
                papel.textContent = permissoes?.dono === c.usuario ? "Dono" : c.mestre ? "Mestre" : "Jogador";
                item.append(ponto, nome, papel);
                if (permissoes?.dono !== c.usuario && !c.eu) {
                    const botao = document.createElement("button");
                    botao.type = "button";
                    botao.textContent = c.mestre ? "Tirar mestre" : "Tornar mestre";
                    botao.addEventListener("click", () => {
                        // Dar ou tirar o poder de mestre sempre pergunta antes (pedido do dono, 17/11/2026).
                        void opcoes
                            .confirmar(
                                c.mestre
                                    ? { titulo: "Tirar o poder de mestre?", mensagem: `${c.nome} deixa de ser mestre e volta a ser jogador.`, confirmar: "Tirar mestre" }
                                    : { titulo: "Tornar mestre?", mensagem: `${c.nome} passa a ter o poder de mestre: vê e controla tudo na mesa.`, confirmar: "Tornar mestre" },
                            )
                            .then((sim) => sim && opcoes.aoDefinirMestre(c.usuario, !c.mestre));
                    });
                    item.append(botao);
                    if (!c.mestre) {
                        const banir = document.createElement("button");
                        banir.type = "button";
                        banir.className = "banir";
                        banir.textContent = "Banir";
                        banir.title = "Tirar esta pessoa da mesa e impedir que ela volte (dá para desfazer na lista de banidos)";
                        banir.addEventListener("click", () => {
                            void opcoes
                                .confirmar({ titulo: "Banir da mesa?", mensagem: `${c.nome} será desconectado e não poderá entrar de novo até você desfazer o banimento.`, confirmar: "Banir" })
                                .then((sim) => sim && opcoes.aoBanir(c.usuario, c.nome, true));
                        });
                        item.append(banir);
                    }
                }
                return item;
            }),
        );
        // Os BANIDOS: um botão com a contagem mostra/esconde a lista, onde dá para cancelar o banimento.
        const banidos = permissoes?.banidos ?? [];
        botaoBanidos.textContent = `Banidos (${banidos.length})`;
        listaBanidos.replaceChildren(
            ...(banidos.length === 0
                ? [Object.assign(document.createElement("li"), { textContent: "Ninguém foi banido." })]
                : banidos.map((b) => {
                      const item = document.createElement("li");
                      const nome = document.createElement("span");
                      nome.className = "jogador-nome";
                      nome.textContent = b.nome;
                      nome.title = b.usuario;
                      const desfazer = document.createElement("button");
                      desfazer.type = "button";
                      desfazer.textContent = "Desbanir";
                      desfazer.addEventListener("click", () => opcoes.aoBanir(b.usuario, b.nome, false));
                      item.append(nome, desfazer);
                      return item;
                  })),
        );
        if (permissoes) {
            if (document.activeElement !== campoTokens) campoTokens.value = String(permissoes.limites.tokensPorJogador);
            if (document.activeElement !== campoFichas) campoFichas.value = String(permissoes.limites.fichasPorJogador);
        }
    }

    botaoBanidos.addEventListener("click", () => {
        const mostrar = listaBanidos.hidden;
        listaBanidos.hidden = !mostrar;
        botaoBanidos.setAttribute("aria-expanded", String(mostrar));
    });
    botaoLimites.addEventListener("click", () => {
        const tokens = Math.max(0, Math.min(100, Math.round(Number(campoTokens.value) || 0)));
        const fichas = Math.max(0, Math.min(100, Math.round(Number(campoFichas.value) || 0)));
        opcoes.aoDefinirLimites(tokens, fichas);
        // A CONFIRMAÇÃO de que salvou (pedido do dono, 17/11/2026): um "✓ Salvo" ao lado do botão, por 2 segundos (o mesmo elemento serve à bolsa do canto e à tela cheia).
        campoTokens.value = String(tokens);
        campoFichas.value = String(fichas);
        const salvo = pegar("bolsa-limites-salvo");
        salvo.hidden = false;
        window.clearTimeout(temporizadorSalvo);
        temporizadorSalvo = window.setTimeout(() => (salvo.hidden = true), 2000);
    });

    // ---------------------------------------------------------------
    // A janela "Compartilhar"
    // ---------------------------------------------------------------

    /** O nível que um usuário tem hoje sobre o item aberto, só pela liberação direta (o dono aparece à parte). */
    function nivelAtual(usuario: string): NivelDeAcesso | "dono" | null {
        if (!permissoes || !aberto) return null;
        if (aberto.item === "grupos") return permissoes.grupos[String(aberto.id)]?.[usuario] ?? null;
        const registro = permissoes[aberto.item][String(aberto.id)];
        if (registro?.dono === usuario) return "dono";
        return registro?.acessos[usuario] ?? null;
    }

    /** O maior nível que o usuário tem sobre o item aberto POR UM GRUPO a que o item pertence (ou null). Aparece junto do seletor, para a janela nunca dizer "sem acesso" a quem tem. */
    function nivelPeloGrupo(usuario: string): NivelDeAcesso | null {
        if (!permissoes || !aberto) return null;
        let melhor: NivelDeAcesso | null = null;
        for (const g of aberto.grupos) {
            const n = permissoes.grupos[String(g)]?.[usuario] ?? null;
            if (n === "editor" || (n === "leitor" && melhor === null)) melhor = n;
        }
        return melhor;
    }

    function desenharJanela(): void {
        if (!aberto) return;
        titulo.textContent = `Compartilhar: ${aberto.nome}`;
        // Quem tem poder de mestre já vê tudo: só os jogadores entram na lista.
        const jogadores = conhecidos().filter((c) => !c.mestre);
        vazioLiberacao.hidden = jogadores.length > 0;
        listaLiberacao.replaceChildren(
            ...jogadores.map((c) => {
                const item = document.createElement("li");
                const nome = document.createElement("span");
                nome.className = "jogador-nome";
                nome.textContent = c.nome;
                nome.title = c.usuario;
                item.append(nome);
                const atual = nivelAtual(c.usuario);
                if (atual === "dono") {
                    const fixo = document.createElement("span");
                    fixo.className = "papel";
                    fixo.textContent = "Dono";
                    item.append(fixo);
                } else {
                    const seletor = document.createElement("select");
                    seletor.setAttribute("aria-label", `Acesso de ${c.nome}`);
                    for (const [valor, rotulo] of [["", "Sem acesso"], ["leitor", "Leitor"], ["editor", "Editor"]] as const) {
                        const opcao = document.createElement("option");
                        opcao.value = valor;
                        opcao.textContent = rotulo;
                        seletor.append(opcao);
                    }
                    seletor.value = atual ?? "";
                    seletor.addEventListener("change", () => {
                        if (aberto) opcoes.aoLiberar(aberto.item, aberto.id, c.usuario, seletor.value === "" ? null : (seletor.value as NivelDeAcesso));
                    });
                    item.append(seletor);
                    const peloGrupo = nivelPeloGrupo(c.usuario);
                    if (peloGrupo) {
                        const nota = document.createElement("span");
                        nota.className = "papel";
                        nota.textContent = `${peloGrupo === "editor" ? "Editor" : "Leitor"} pelo grupo`;
                        nota.title = "Esta pessoa já tem este acesso por um grupo a que o item pertence";
                        item.append(nota);
                    }
                }
                return item;
            }),
        );
    }

    function fechar(): void {
        janela.hidden = true;
        aberto = null;
    }
    botaoFechar.addEventListener("click", fechar);
    janela.addEventListener("pointerdown", (e) => {
        if (e.target === janela) fechar();
    });
    document.addEventListener(
        "keydown",
        (e) => {
            if (janela.hidden || e.key !== "Escape") return;
            e.stopPropagation();
            fechar();
        },
        true,
    );

    return {
        definirPermissoes(novas) {
            permissoes = novas;
            desenharLista();
            desenharJanela();
        },
        definirConectados(nova, eu) {
            conectados = nova;
            meuUsuario = eu;
            desenharLista();
            desenharJanela();
        },
        jogadoresConhecidos() {
            return conhecidos().filter((c) => !c.mestre).map((c) => ({ usuario: c.usuario, nome: c.nome }));
        },
        compartilhar(item, id, nome, gruposDoItem = []) {
            aberto = { item, id, nome, grupos: gruposDoItem };
            desenharJanela();
            janela.hidden = false;
            botaoFechar.focus();
        },
    };
}
