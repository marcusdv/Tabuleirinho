// =====================================================================
// EDITOR DE STATUS (HTML): a lista dos STATUS da MESA (as barras que aparecem EMBAIXO de cada token no tabuleiro: HP, mana...). É UMA regra só, para todos os tokens
// (pedido do dono: "a regra que muda ali serve para TODOS OS TOKENS"). Cada status tem um NOME, a VARIÁVEL da ficha de onde vem o valor (ex.: "PV", da linha `PV:: 20`),
// uma COR, "Exibir em jogo" (a barra aparece), "Exibir números" (o atual/máx dentro dela) e os GRUPOS de tokens em que ele vale (por padrão todos os tokens; marcando grupos, só os deles; nada marcado, nenhum).
// Fica na bolsa em tela cheia, ao lado da prévia do token. O componente edita uma lista em memória e avisa cada mudança (`aoMudar`); tudo entra por textContent/value.
// =====================================================================

import { criarSeletorDeCor } from "./seletorDeCor";
import { BARRAS_NA_PREVIA_STATUS, CHAVE_STATUS_AJUDA, CORES_STATUS, MAX_CARACTERES_NOME_STATUS, MAX_CARACTERES_NOME_VARIAVEL, MAX_STATUS_TOKEN } from "../config";
import { estado, quemVePadrao, type QuemVeStatus, type StatusNovo } from "../estado";
import { corCss } from "./aparenciaToken";
import { guardarPreferencia, lerPreferencia } from "./preferencias";

export interface EditorStatus {
    /** Mostra esta lista (cópia: o que a pessoa mexer só vale quando ela ler com `ler`). */
    definir(lista: readonly StatusNovo[]): void;
    /** A lista como está agora na tela (os status que já existiam mantêm o `id`; os novos vêm sem). */
    ler(): StatusNovo[];
    /** Se há uma mudança ainda esperando para ser avisada (a pessoa acabou de digitar), avisa JÁ. */
    enviarPendente(): void;
    /** A pessoa está mexendo dentro do editor agora (o foco está nele)? Quem atualiza a lista de fora não deve sobrescrever o que ela está digitando. */
    temFoco(): boolean;
}

/** A explicação que acompanha a lista (como funciona, para quem nunca viu). */
const TEXTO_DE_AJUDA =
    "Um status é algo que a mesa acompanha e que pode mudar durante o jogo, como a vida (HP) ou a mana. Cada status lê uma variável da ficha atribuída ao token (ex.: a linha PV:: 20 faz o HP começar em 20/20), e as ações dos tokens (Dano, Cura e as que você criar) mudam o valor dele. Você pode, opcionalmente, transformar esse status numa barra no token: \"Exibir em jogo\" mostra a barra embaixo do token no tabuleiro e \"Exibir números\" põe o atual/máx dentro dela. Sem a barra, o status continua existindo. Cada peça guarda o seu próprio valor, que se perde quando ela sai do tabuleiro. Sem ficha, ou sem essa variável na ficha, o token não tem esse status. Em \"Grupos\", escolha quais grupos terão status específicos.";

/** O texto do botão de grupos de um status: "Todos os tokens", "Nenhum grupo", os nomes (até 2; "Sem grupo" entra na lista) ou "N marcados". */
/** O texto do botão "Quem vê": "Todos", "Só o mestre" ou o que está marcado. */
function resumoDeQuemVe(q: QuemVeStatus): string {
    if (q.dono && q.leitores && q.outros) return "Todos";
    const partes = [q.dono && "Dono", q.leitores && "Leitores", q.outros && "Outros"].filter((p): p is string => typeof p === "string");
    return partes.length === 0 ? "Só o mestre" : `Mestre + ${partes.join(", ")}`;
}

function resumoDosGrupos(item: StatusNovo): string {
    if (!Array.isArray(item.grupos)) return "Todos os tokens";
    const nomes = item.grupos.map((id) => estado.grupos.find((g) => g.id === id)?.nome).filter((n): n is string => n !== undefined);
    if (item.semGrupo === true) nomes.unshift("Sem grupo");
    if (nomes.length === 0) return "Nenhum grupo"; // (nada marcado: o status não vale para nenhum token)
    return nomes.length <= 2 ? nomes.join(", ") : `${nomes.length} marcados`;
}

/**
 * `aoMudar` (opcional) é chamado com a lista inteira sempre que a pessoa muda algo: na hora para os checkboxes, os grupos, "+ Status" e ✕; um instante depois de parar de
 * digitar (ou de mexer na cor) para os campos de texto, para não mandar uma mudança a cada letra.
 */
export function criarEditorStatus(raiz: HTMLElement, aoMudar?: (lista: StatusNovo[]) => void, previaFora?: { rotulo: HTMLElement; caixa: HTMLElement }): EditorStatus {
    let itens: StatusNovo[] = [];
    let pendente: ReturnType<typeof setTimeout> | null = null;
    function avisarAgora(): void {
        atualizarPrevia();
        if (pendente !== null) clearTimeout(pendente);
        pendente = null;
        aoMudar?.(itens.map((s) => ({ ...s })));
    }
    function avisarDepois(): void {
        atualizarPrevia(); // (a prévia acompanha cada tecla e cada clique; o aviso à mesa é que espera um instante)
        if (!aoMudar) return;
        if (pendente !== null) clearTimeout(pendente);
        pendente = setTimeout(avisarAgora, 350);
    }

    // ---------------------------------------------------------------
    // Cabeçalho: o título, o "?" das instruções e o botão "+ Status" (em cima, ao lado do título)
    // ---------------------------------------------------------------
    const titulo = document.createElement("p");
    titulo.className = "bolsa-rotulo";
    titulo.textContent = "Status";
    const ajuda = document.createElement("p");
    ajuda.className = "status-ajuda";
    ajuda.textContent = TEXTO_DE_AJUDA;
    const botaoAjuda = document.createElement("button");
    botaoAjuda.type = "button";
    botaoAjuda.className = "status-ajuda-botao";
    botaoAjuda.textContent = "?";
    /** Mostra ou oculta as instruções (o "?" ao lado do título). Por padrão ficam OCULTAS (pedido do dono); a escolha de quem as abre é guardada no navegador. */
    function mostrarAjuda(mostrar: boolean): void {
        ajuda.hidden = !mostrar;
        botaoAjuda.title = mostrar ? "Ocultar as instruções" : "Mostrar as instruções";
        botaoAjuda.setAttribute("aria-expanded", String(mostrar));
    }
    const ajudaGuardada = (): boolean => lerPreferencia(CHAVE_STATUS_AJUDA) === "1"; // (sem escolha guardada: oculta)
    mostrarAjuda(ajudaGuardada());
    botaoAjuda.addEventListener("click", () => {
        mostrarAjuda(ajuda.hidden === true); // (oculta: passa a mostrar; à mostra: passa a ocultar)
        guardarPreferencia(CHAVE_STATUS_AJUDA, ajuda.hidden === true ? "0" : "1");
    });
    const botaoNovo = document.createElement("button");
    botaoNovo.type = "button";
    botaoNovo.className = "botao-tamanho status-novo";
    botaoNovo.textContent = "+ Status";
    const cabecalho = document.createElement("div");
    cabecalho.className = "status-cabecalho";
    cabecalho.append(titulo, botaoAjuda, botaoNovo);
    const lista = document.createElement("div");
    lista.className = "status-lista";
    raiz.classList.add("editor-status");

    // ---------------------------------------------------------------
    // A PRÉVIA das barras, desenhada como no tabuleiro (o nome FORA da caixa, a barra, o "atual/máx" DENTRO). Como a bolsa em tela cheia cobre o tabuleiro, é aqui
    // que se vê, a cada clique, o que cada checkbox faz: "Exibir em jogo" liga/desliga a barra; "Exibir números" liga/desliga só os números.
    // ---------------------------------------------------------------
    const tituloPrevia = previaFora?.rotulo ?? document.createElement("p");
    const previa = previaFora?.caixa ?? document.createElement("div");
    if (!previaFora) {
        tituloPrevia.className = "bolsa-rotulo status-previa-titulo";
        previa.className = "status-previa";
    }
    function atualizarPrevia(): void {
        const visiveis = itens.filter((i) => i.mostrar !== false);
        // Só as PRIMEIRAS barras (BARRAS_NA_PREVIA_STATUS): a prévia tem altura fixa e não empurra a lista de tokens que fica embaixo dela.
        tituloPrevia.textContent = visiveis.length > BARRAS_NA_PREVIA_STATUS ? `Prévia das barras (${BARRAS_NA_PREVIA_STATUS} de ${visiveis.length})` : "Prévia das barras";
        if (visiveis.length === 0) {
            const vazio = document.createElement("p");
            vazio.className = "status-vazio";
            vazio.textContent = "Sem barras"; // (curto de propósito: a prévia tem altura fixa e uma frase comprida quebrava o layout)
            previa.replaceChildren(vazio);
            return;
        }
        // A prévia mostra as barras como no tabuleiro: as de "Posição: Em cima" ACIMA de um tokenzinho e as outras EMBAIXO dele (a mais perto do token é a 1ª de cada lado).
        const mostradas = visiveis.slice(0, BARRAS_NA_PREVIA_STATUS);
        const emCima = mostradas.filter((i) => i.posicao === "cima").reverse();
        const embaixo = mostradas.filter((i) => i.posicao !== "cima");
        const marcaDoToken = document.createElement("div");
        marcaDoToken.className = "status-previa-token";
        marcaDoToken.title = "O token";
        const linhaDe = (i: (typeof itens)[number]): HTMLElement => {
            {
                const linha = document.createElement("div");
                linha.className = "status-previa-linha";
                const nome = document.createElement("span");
                nome.className = "status-previa-nome";
                nome.textContent = i.mostrarNome === false ? "" : i.nome; // (texto do usuário: textContent; só com "Mostrar nome no tabuleiro" ligado)
                nome.style.color = corCss(i.cor);
                const barra = document.createElement("div");
                barra.className = "status-previa-barra";
                const enchimento = document.createElement("div");
                enchimento.className = "status-previa-enchimento";
                enchimento.style.background = corCss(i.cor);
                enchimento.style.width = "70%"; // (um exemplo: 7 de 10)
                barra.append(enchimento);
                if (i.numeros !== false) {
                    const numeros = document.createElement("span");
                    numeros.className = "status-previa-numeros";
                    numeros.textContent = "7/10";
                    barra.append(numeros);
                }
                linha.append(nome, barra);
                return linha;
            }
        };
        previa.replaceChildren(...emCima.map(linhaDe), marcaDoToken, ...embaixo.map(linhaDe));
    }
    raiz.replaceChildren(cabecalho, ajuda, lista, ...(previaFora ? [] : [tituloPrevia, previa])); // (com `previaFora`, a prévia fica em outro lugar da tela)

    // ---------------------------------------------------------------
    // OS MENUS SUSPENSOS com caixas de marcar (GRUPOS e QUEM VÊ): um menu só para o editor, aberto junto do botão (posição fixa, por cima da bolsa em tela cheia).
    // ---------------------------------------------------------------
    let menuAberto: { menu: HTMLElement; fechar: () => void } | null = null;
    function fecharMenuDeGrupos(): void {
        menuAberto?.fechar();
        menuAberto = null;
    }

    /** Uma linha do menu: caixa de marcar, (um pontinho de cor) e o texto. Marcar vale NA HORA (avisa a mesa) e refaz o menu. */
    function linhaDeCaixa(texto: string, cor: number | null, ligado: boolean, aoAlterar: (ligado: boolean) => void, redesenhar: () => void, travada = false): HTMLElement {
        const rotulo = document.createElement("label");
        const campo = document.createElement("input");
        campo.type = "checkbox";
        campo.checked = ligado;
        campo.disabled = travada;
        campo.addEventListener("change", () => {
            aoAlterar(campo.checked);
            redesenhar(); // (as caixas acompanham umas às outras)
            avisarAgora(); // (vale na hora)
        });
        rotulo.append(campo);
        if (cor !== null) {
            const ponto = document.createElement("i");
            ponto.style.setProperty("--cor-grupo", corCss(cor));
            rotulo.append(ponto);
        }
        const nome = document.createElement("span");
        nome.textContent = texto; // (o nome do grupo vem do usuário: textContent)
        rotulo.append(nome);
        return rotulo;
    }

    /** Abre um menu flutuante de caixas junto de um botão. `preencher` monta as linhas (e é chamado de novo a cada marcação). Fecha com Esc, com um clique fora ou ao abrir outro. */
    function abrirMenuFlutuante(botao: HTMLButtonElement, preencher: (menu: HTMLElement, redesenhar: () => void) => void): void {
        fecharMenuDeGrupos();
        const menu = document.createElement("div");
        menu.className = "status-menu-grupos";
        menu.setAttribute("role", "menu");
        const redesenhar = (): void => preencher(menu, redesenhar);
        redesenhar();
        document.body.append(menu);
        // Posição: logo embaixo do botão (ou em cima, se não couber), sem sair da janela.
        const r = botao.getBoundingClientRect();
        const caixa = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - caixa.width - 4))}px`;
        menu.style.top = `${r.bottom + caixa.height + 8 > window.innerHeight ? Math.max(4, r.top - caixa.height - 4) : r.bottom + 4}px`;

        const aoApertarFora = (e: PointerEvent): void => {
            if (!menu.contains(e.target as Node) && !botao.contains(e.target as Node)) fecharMenuDeGrupos();
        };
        const aoTeclar = (e: KeyboardEvent): void => {
            if (e.key !== "Escape") return;
            e.stopPropagation(); // o Esc fecha SÓ o menu (a bolsa em tela cheia por baixo continua aberta)
            e.preventDefault();
            fecharMenuDeGrupos();
        };
        document.addEventListener("pointerdown", aoApertarFora, true);
        document.addEventListener("keydown", aoTeclar, true);
        botao.setAttribute("aria-expanded", "true");
        menuAberto = {
            menu,
            fechar: () => {
                document.removeEventListener("pointerdown", aoApertarFora, true);
                document.removeEventListener("keydown", aoTeclar, true);
                botao.setAttribute("aria-expanded", "false");
                menu.remove();
            },
        };
    }

    /** O menu de GRUPOS de um status: "Todos os tokens" (com ou sem grupo) ou os grupos que a pessoa marcar; tudo desmarcado = nenhum. */
    function abrirMenuDeGrupos(item: StatusNovo, botao: HTMLButtonElement): void {
        abrirMenuFlutuante(botao, (menu, redesenhar) => {
            botao.firstElementChild!.textContent = resumoDosGrupos(item);
            const linhas: HTMLElement[] = [
                linhaDeCaixa("Todos os tokens", null, !Array.isArray(item.grupos), (ligado) => {
                    item.grupos = ligado ? null : []; // desmarcar "Todos" deixa NENHUM grupo marcado (e então o status não vale para nenhum token); a pessoa marca os que quer
                    item.semGrupo = false;
                }, redesenhar),
                // "Tokens sem grupo": vale para os tokens que não estão em nenhum grupo (sozinha, ou somada aos grupos marcados). Marcá-la com "Todos" ligado passa a valer só para eles.
                linhaDeCaixa("Tokens sem grupo", null, Array.isArray(item.grupos) && item.semGrupo === true, (ligado) => {
                    if (!Array.isArray(item.grupos)) item.grupos = [];
                    item.semGrupo = ligado;
                }, redesenhar),
            ];
            if (estado.grupos.length === 0) {
                const aviso = document.createElement("p");
                aviso.className = "status-menu-vazio";
                aviso.textContent = "Ainda não há grupos. Crie grupos na bolsa (+ Grupo) para escolher aqui.";
                linhas.push(aviso);
            }
            for (const grupo of estado.grupos) {
                linhas.push(
                    linhaDeCaixa(grupo.nome, grupo.cor, Array.isArray(item.grupos) && item.grupos.includes(grupo.id), (ligado) => {
                        const atuais = Array.isArray(item.grupos) ? item.grupos : [];
                        item.grupos = ligado ? [...atuais, grupo.id] : atuais.filter((g) => g !== grupo.id); // (marcar um grupo com "Todos" ligado passa a valer só para ele; desmarcar o último deixa nenhum token)
                    }, redesenhar),
                );
            }
            menu.replaceChildren(...linhas);
        });
    }

    /** O menu de QUEM VÊ um status (pedido do dono, 17/11/2026): o Mestre sempre vê (caixa travada); marcam-se o dono do token, os leitores e editores dele e os outros jogadores. */
    function abrirMenuQuemVe(item: StatusNovo, botao: HTMLButtonElement): void {
        abrirMenuFlutuante(botao, (menu, redesenhar) => {
            const q = (item.quemVe ??= quemVePadrao());
            botao.firstElementChild!.textContent = resumoDeQuemVe(q);
            menu.replaceChildren(
                linhaDeCaixa("Mestre", null, true, () => undefined, redesenhar, true),
                linhaDeCaixa("Dono do token", null, q.dono, (v) => (q.dono = v), redesenhar),
                linhaDeCaixa("Leitores e editores do token", null, q.leitores, (v) => (q.leitores = v), redesenhar),
                linhaDeCaixa("Outros jogadores", null, q.outros, (v) => (q.outros = v), redesenhar),
            );
        });
    }

    /** A primeira cor da lista de cores que ainda não está em uso (se todas estão, recomeça da primeira). */
    function proximaCor(): number {
        return CORES_STATUS.find((c) => !itens.some((i) => i.cor === c)) ?? CORES_STATUS[0];
    }

    /** Um botão que abre um menu suspenso (o texto é o resumo do que está marcado). */
    function botaoSuspenso(classe: string, dica: string, resumo: string, aoClicar: (botao: HTMLButtonElement) => void): HTMLButtonElement {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = classe;
        botao.title = dica;
        botao.setAttribute("aria-haspopup", "menu");
        botao.setAttribute("aria-expanded", "false");
        const texto = document.createElement("span");
        texto.textContent = resumo;
        const seta = document.createElement("b");
        seta.textContent = "▾";
        seta.setAttribute("aria-hidden", "true");
        botao.append(texto, seta);
        botao.addEventListener("click", () => (menuAberto ? fecharMenuDeGrupos() : aoClicar(botao)));
        return botao;
    }

    /** A célula de uma coluna de caixa de marcar (a explicação fica no cabeçalho da coluna e na dica). */
    /** A célula "Posição": onde a barra fica no tabuleiro (embaixo ou em cima do token). Vale na hora, como os checkboxes. */
    function celulaDePosicao(item: { posicao?: "baixo" | "cima" }): HTMLTableCellElement {
        const td = document.createElement("td");
        td.className = "c-posicao";
        const campo = document.createElement("select");
        campo.title = "Onde a barra fica no tabuleiro";
        campo.setAttribute("aria-label", "Posição da barra no tabuleiro");
        for (const [valor, texto] of [["baixo", "Embaixo"], ["cima", "Em cima"]] as const) {
            const opcao = document.createElement("option");
            opcao.value = valor;
            opcao.textContent = texto;
            campo.append(opcao);
        }
        campo.value = item.posicao === "cima" ? "cima" : "baixo";
        campo.addEventListener("change", () => {
            item.posicao = campo.value === "cima" ? "cima" : "baixo";
            avisarAgora();
        });
        td.append(campo);
        return td;
    }

    function celulaDeCaixa(dica: string, ligado: boolean, aoMudarCampo: (v: boolean) => void): HTMLTableCellElement {
        const td = document.createElement("td");
        td.className = "status-celula-caixa";
        const campo = document.createElement("input");
        campo.type = "checkbox";
        campo.checked = ligado;
        campo.title = dica;
        campo.setAttribute("aria-label", dica);
        campo.addEventListener("change", () => {
            aoMudarCampo(campo.checked);
            avisarAgora(); // (um checkbox vale na hora)
        });
        td.append(campo);
        return td;
    }

    /** AS COLUNAS da planilha: o título (e a explicação na dica do mouse). */
    const COLUNAS: { titulo: string; dica: string; classe: string }[] = [
        { titulo: "Cor", dica: "Cor da barra", classe: "c-cor" },
        { titulo: "Nome", dica: "Nome do status (ex.: HP, Mana)", classe: "c-nome" },
        { titulo: "Variável", dica: "Variável da ficha de onde vem o valor (ex.: PV, da linha PV:: 20)", classe: "c-variavel" },
        { titulo: "Grupos", dica: "Em quais grupos de tokens este status vale", classe: "c-grupos" },
        { titulo: "Quem vê", dica: "Quem pode ver este status (o mestre sempre vê)", classe: "c-quem" },
        { titulo: "Barra", dica: "Exibir em jogo: mostra a barra deste status embaixo do token no tabuleiro", classe: "c-caixa" },
        { titulo: "Posição", dica: "Onde a barra fica no tabuleiro: embaixo ou em cima do token", classe: "c-posicao" },
        { titulo: "Núm.", dica: "Exibir números: mostra o valor (atual/máximo, ex.: 100/100) dentro da barra", classe: "c-caixa" },
        { titulo: "Rótulo", dica: "Mostrar nome no tabuleiro: escreve o nome do status à esquerda da barra", classe: "c-caixa" },
        { titulo: "Arrasto", dica: "Subtraído por números arrastados: ao soltar o total de uma rolagem do chat num token, ele perde essa quantidade deste status (em geral o HP)", classe: "c-caixa" },
        { titulo: "", dica: "", classe: "c-excluir" },
    ];

    function desenhar(): void {
        fecharMenuDeGrupos();
        atualizarPrevia();
        botaoNovo.disabled = itens.length >= MAX_STATUS_TOKEN;
        botaoNovo.title = itens.length >= MAX_STATUS_TOKEN ? `No máximo ${MAX_STATUS_TOKEN} status` : "Criar um status novo (uma barra a mais embaixo dos tokens)";
        if (itens.length === 0) {
            const vazio = document.createElement("p");
            vazio.className = "status-vazio";
            vazio.textContent = "Nenhum status: os tokens não mostram barras.";
            lista.replaceChildren(vazio);
            return;
        }
        // A PLANILHA: uma linha de títulos e uma linha por status, com colunas alinhadas (ocupa bem menos espaço que os campos soltos).
        const tabela = document.createElement("table");
        tabela.className = "status-tabela";
        const cabecaTabela = document.createElement("thead");
        const linhaTitulos = document.createElement("tr");
        for (const coluna of COLUNAS) {
            const th = document.createElement("th");
            th.className = coluna.classe;
            th.textContent = coluna.titulo;
            if (coluna.dica) th.title = coluna.dica;
            linhaTitulos.append(th);
        }
        cabecaTabela.append(linhaTitulos);
        const corpo = document.createElement("tbody");
        for (const item of itens) {
            const linha = document.createElement("tr");
            linha.className = "status-linha";
            const celula = (classe: string, ...filhos: HTMLElement[]): HTMLTableCellElement => {
                const td = document.createElement("td");
                td.className = classe;
                td.append(...filhos);
                return td;
            };

            const cor = document.createElement("input");
            cor.type = "color";
            cor.className = "status-cor";
            cor.value = corCss(item.cor);
            cor.title = "Cor da barra";
            cor.setAttribute("aria-label", "Cor da barra");
            cor.addEventListener("input", () => {
                item.cor = parseInt(cor.value.slice(1), 16);
                avisarDepois(); // (o seletor de cor manda um evento a cada movimento do mouse)
            });

            const nome = document.createElement("input");
            nome.type = "text";
            nome.className = "status-nome";
            nome.maxLength = MAX_CARACTERES_NOME_STATUS;
            nome.value = item.nome;
            nome.placeholder = "Nome";
            nome.title = "Nome do status (ex.: HP, Mana)";
            nome.setAttribute("aria-label", "Nome do status");
            nome.autocomplete = "off";
            nome.addEventListener("input", () => {
                item.nome = nome.value;
                avisarDepois();
            });

            const variavel = document.createElement("input");
            variavel.type = "text";
            variavel.className = "status-variavel";
            variavel.maxLength = MAX_CARACTERES_NOME_VARIAVEL;
            variavel.value = item.variavel;
            variavel.placeholder = "Variável";
            variavel.title = "Variável da ficha de onde vem o valor (ex.: PV, da linha PV:: 20). Só letras, números e _.";
            variavel.setAttribute("aria-label", "Variável da ficha");
            variavel.autocomplete = "off";
            variavel.addEventListener("input", () => {
                // Só o que um nome de variável aceita (letras, números e "_"); o resto é tirado na hora, para a pessoa ver o que vale.
                const limpo = variavel.value.replace(/[^\p{L}\p{N}_]/gu, "");
                if (limpo !== variavel.value) variavel.value = limpo;
                item.variavel = limpo;
                avisarDepois();
            });

            const botaoGrupos = botaoSuspenso("status-grupos", "Em quais grupos de tokens este status vale (todos os tokens, só os dos grupos marcados, ou nenhum)", resumoDosGrupos(item), (b) => abrirMenuDeGrupos(item, b));
            const botaoQuem = botaoSuspenso("status-grupos status-quem", "Quem pode ver este status (o mestre sempre vê): o dono do token, os leitores e editores dele e os outros jogadores", resumoDeQuemVe(item.quemVe ?? quemVePadrao()), (b) => abrirMenuQuemVe(item, b));

            const excluir = document.createElement("button");
            excluir.type = "button";
            excluir.className = "status-excluir";
            excluir.textContent = "✕";
            excluir.title = "Excluir este status";
            excluir.setAttribute("aria-label", "Excluir este status");
            excluir.addEventListener("click", () => {
                itens = itens.filter((i) => i !== item);
                desenhar();
                avisarAgora();
            });

            const celulaCor = celula("c-cor", cor);
            criarSeletorDeCor({ entrada: cor }); // (a cara do seletor de cor do site; a cor continua no <input> escondido)
            linha.append(
                celulaCor,
                celula("c-nome", nome),
                celula("c-variavel", variavel),
                celula("c-grupos", botaoGrupos),
                celula("c-quem", botaoQuem),
                celulaDeCaixa("Exibir em jogo: mostra a barra deste status embaixo do token no tabuleiro", item.mostrar !== false, (v) => (item.mostrar = v)),
                celulaDePosicao(item),
                celulaDeCaixa("Exibir números: mostra o valor (atual/máximo, ex.: 100/100) dentro da barra", item.numeros !== false, (v) => (item.numeros = v)),
                celulaDeCaixa("Mostrar nome no tabuleiro: escreve o nome do status à esquerda da barra", item.mostrarNome !== false, (v) => (item.mostrarNome = v)),
                celulaDeCaixa("Subtraído por números arrastados: ao soltar o total de uma rolagem do chat num token, ele perde essa quantidade deste status (em geral o HP)", item.recebeArrasto === true, (v) => (item.recebeArrasto = v)),
                celula("c-excluir", excluir),
            );
            corpo.append(linha);
        }
        tabela.append(cabecaTabela, corpo);
        lista.replaceChildren(tabela);
    }

    botaoNovo.addEventListener("click", () => {
        if (itens.length >= MAX_STATUS_TOKEN) return;
        // Um status NOVO nasce "apagado" (pedido do dono): sem nome, sem barra ("Exibir em jogo" desligado), sem números e em NENHUM grupo (não vale para token nenhum até a pessoa escolher). Assim criar um
        // status não muda nada no jogo por conta própria.
        itens.push({ nome: "", variavel: "", cor: proximaCor(), mostrar: false, numeros: false, grupos: [], semGrupo: false, recebeArrasto: false, quemVe: quemVePadrao(), mostrarNome: false });
        desenhar();
        avisarAgora();
        lista.querySelector<HTMLInputElement>(".status-linha:last-child .status-nome")?.select(); // (já pronto para renomear)
    });

    desenhar();
    return {
        enviarPendente() {
            if (pendente !== null) avisarAgora();
        },
        temFoco() {
            return raiz.contains(document.activeElement) || menuAberto !== null;
        },
        definir(nova) {
            if (pendente !== null) {
                clearTimeout(pendente); // (quem chama já mandou o que estava pendente; o que sobrou é descartado)
                pendente = null;
            }
            mostrarAjuda(ajudaGuardada()); // (a escolha pode ter mudado enquanto este editor estava fechado)
            itens = nova.map((s) => ({ ...s }));
            desenhar();
        },
        ler() {
            return itens.map((s) => ({ ...s }));
        },
    };
}
