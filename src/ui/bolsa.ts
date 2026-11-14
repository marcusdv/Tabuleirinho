// =====================================================================
// BOLSA (HTML): a aba "Bolsa" da coluna da direita (ao lado do chat), onde se GUARDAM tokens e fichas. (Já foi uma caixa flutuante no canto.)
//   - Arrastar um token do tabuleiro até aqui e soltar o guarda (ele some do mapa).
//   - Arrastar uma fichinha daqui para o mapa coloca o token na casa onde soltar.
//   - O botão "⤢ Criar/editar" EXPANDE a bolsa: ela cobre quase a tela toda (sobra só uma margem) e mostra a
//     área "Criar token", onde se escolhe nome, imagem (opcional), tamanho, cor de PREENCHIMENTO e cor
//     da BORDA e se cria um token novo. Fechar: botão "Fechar", Esc ou clique na margem.
//   - A imagem fica por cima do preenchimento (as partes transparentes herdam a cor de preenchimento).
//     O CLIQUE DIREITO numa ficha abre um menu: "Editar token…" (nome, tamanho, cores, imagem) e
//     "Alterar imagem…". (Remover a imagem fica dentro da janela "Editar token".)
//
// SELEÇÃO (como no Windows): o 1º clique num token ou numa ficha o SELECIONA; um clique de novo no que é o único selecionado (ou o Enter, ou
// o duplo clique) o ABRE ("Editar token" / a janela da ficha). Ctrl+clique soma ou tira um item, Shift+clique seleciona um intervalo, Ctrl+A
// seleciona tudo, e arrastar o mouse numa área VAZIA da lista desenha um retângulo que seleciona o que ele toca. Com vários selecionados, a
// linha da pesquisa dá lugar a uma barra de ações ("N selecionados · Excluir"), e o clique direito abre o menu das ações em grupo.
//
// Aberta, a barra de pesquisa do topo filtra as fichas pelo nome (ou pelo tamanho, ex.: "3x3").
//
// O arrasto de um token do mapa é do PixiJS (tokens.ts). Este módulo cuida do
// painel e do arrasto que COMEÇA aqui: como o clique começa num elemento HTML,
// acompanhamos o mouse pelo documento e repassamos ao tokens.ts por callbacks.
// O recorte da imagem é do editorImagem.ts. A marcação e o CSS ficam no index.html.
// =====================================================================

import type { PointData } from "pixi.js";
import {
    COR_BORDA_INICIAL_TOKEN,
    COR_INICIAL_TOKEN,
    MAX_CARACTERES_NOME_TOKEN,
    MAX_FICHAS,
    MAX_TOKENS,
    TAMANHO_INICIAL_TOKEN,
    CHAVE_ABA_BOLSA,
    CHAVE_ORDEM_FICHAS,
    CHAVE_ORDEM_TOKENS,
    MAX_GRUPOS,
} from "../config";
import { estado, type Ficha, type Grupo, type Token } from "../estado";
import { criarEditorGrupo } from "./editorGrupo";
import { corCss, escolherArquivo, marcarEscolhida, montarPaleta, pintarDisco } from "./aparenciaToken";
import { guardarPreferencia, lerPreferencia } from "./preferencias";

/** O que a área "Criar token" pede ao criar. */
export interface DadosNovoToken {
    nome: string;
    cor: number; // preenchimento
    corBorda: number;
    tamanho: number;
    imagem: string | null;
}

export interface OpcoesBolsa {
    /**
     * O usuário apertou o mouse numa fichinha: começar a arrastar aquele token.
     * Devolve false se não for possível agora (a bolsa então não acompanha o mouse).
     */
    aoComecarArrasto(id: number, ponto: PointData): boolean;
    /** O mouse andou durante o arrasto (ponto na TELA). */
    aoArrastar(ponto: PointData): void;
    /** O usuário soltou o botão do mouse. */
    aoSoltar(): void;
    /**
     * O usuário pediu um token novo: nome, cor de preenchimento e de borda (0xRRGGBB), tamanho 1 a 4 e a
     * imagem recortada (ou null). Modo local: devolve o token criado, ou null se não coube. Online: o pedido vai ao servidor
     * e devolve "enviado"; o token só existe quando o servidor grava o arquivo e avisa (`bolsa.tokenCriado`), ou recusa
     * (`bolsa.tokenRecusado`).
     */
    aoCriarToken(dados: DadosNovoToken): Token | "enviado" | null;
    /** O usuário pediu "Excluir token…" no menu de uma ficha (quem trata pede a confirmação). */
    aoExcluir(token: Token): void;
    /** Mudar a estrela e/ou os grupos de vários itens (tokens ou fichas) de uma vez; cada alteração diz o id e o que muda. Online vira pedidos ao servidor. */
    aoAlterarItens(tipo: "tokens" | "fichas", alteracoes: { id: number; favorito?: boolean; grupos?: number[] }[]): void;
    /** Criar um grupo (nome e cor). Devolve o grupo (modo local), "enviado" (online: ele chega por `bolsa.grupoCriado`) ou null (limite). */
    aoCriarGrupo(nome: string, cor: number): Grupo | "enviado" | null;
    /** Mudar o nome e/ou a cor de um grupo. */
    aoEditarGrupo(id: number, mudancas: { nome?: string; cor?: number }): void;
    /** Excluir um grupo (quem trata pede a confirmação; os itens continuam, só perdem a marca). */
    aoExcluirGrupo(grupo: Grupo): void;
    /** O usuário pediu para excluir VÁRIOS tokens de uma vez (quem trata pede UMA confirmação). */
    aoExcluirTokens(tokens: Token[]): void;
    /** O usuário pediu para excluir VÁRIAS fichas de uma vez (quem trata pede UMA confirmação). */
    aoExcluirFichas(fichas: Ficha[]): void;
    /** O usuário clicou num documento da aba Fichas: abrir essa ficha para editar. */
    aoAbrirFicha(ficha: Ficha): void;
    /** O usuário pediu "Excluir ficha" (menu do clique direito, ou a tecla Delete, num documento): quem trata pede a confirmação. */
    aoExcluirFicha(ficha: Ficha): void;
    /** A bolsa foi expandida (quem a criou fecha menus e balões que ficariam soltos por baixo). */
    aoAbrir(): void;
    /**
     * Abre o editor de recorte com este arquivo (`corFundo` = o preenchimento do token, que aparece atrás
     * das partes transparentes). Devolve a miniatura recortada, ou null se o usuário cancelou.
     */
    editarImagem(arquivo: File, corFundo: number): Promise<string | null>;
    /** O usuário pediu "Editar token…" no menu de uma ficha: abrir a janela de edição desse token. */
    aoEditar(token: Token): void;
    /** O usuário trocou a imagem de um token que está na bolsa (pelo "Alterar imagem…" do menu da ficha). */
    aoMudarImagem(id: number, imagem: string): void;
    /**
     * O usuário clicou em "Criar ficha" (a ficha nasce VAZIA, com o arquivo criado na hora). Modo local: devolve a ficha criada (ou null se não coube). Online: o pedido vai ao
     * servidor e devolve "enviada"; a ficha só existe quando o servidor a grava e avisa (`bolsa.fichaSalva`), ou recusa
     * (`bolsa.fichaRecusada`).
     */
    aoCriarFicha(): Ficha | "enviada" | null;
}

/** As seções da carteira: os tokens guardados (o que a bolsa já era) e as fichas de personagem (em construção). */
export type AbaBolsa = "tokens" | "fichas";

export interface Bolsa {
    /** A aba aberta agora. */
    readonly aba: AbaBolsa;
    /** Troca de aba. */
    escolherAba(aba: AbaBolsa): void;
    /** Refaz a lista de fichinhas conforme os tokens guardados no estado. */
    atualizar(): void;
    /** O servidor criou um token: refaz a lista e, se foi o que esta pessoa pediu, limpa o formulário e libera o botão. */
    tokenCriado(token: Token): void;
    /** O servidor recusou (ou a conexão caiu): se esta pessoa esperava um token, mostra o motivo e libera o botão. */
    tokenRecusado(motivo: string): void;
    /** Os grupos mudaram (criado, editado, excluído, por esta pessoa ou outra): refaz os "chips" e as duas listas. */
    atualizarGrupos(): void;
    /** O servidor criou um grupo (online). Se foi esta pessoa que o pediu, termina o que ela estava fazendo (ex.: adicionar os selecionados a ele). */
    grupoCriado(grupo: Grupo): void;
    /** Refaz a lista da aba Fichas conforme `estado.fichas`. */
    atualizarFichas(): void;
    /** Qual ficha está aberta na janela de edição (null = nenhuma): o nome dela ganha outra cor na lista. */
    marcarFichaAberta(id: number | null): void;
    /** O servidor criou uma ficha: libera o botão "Criar ficha" e, se foi esta pessoa que a pediu, ABRE a ficha nova (a lista é refeita a partir de `estado.fichas`). */
    fichaSalva(ficha?: Ficha): void;
    /** O servidor recusou (ou a conexão caiu): se esta pessoa esperava uma ficha, mostra o motivo e libera o formulário. */
    fichaRecusada(motivo: string): void;
    /** O ponto da TELA está em cima da bolsa? */
    contem(ponto: PointData): boolean;
    /** Liga/desliga o destaque "pode soltar aqui". */
    marcarAlvo(sobre: boolean): void;
    /**
     * Mostra, POR CIMA da bolsa, uma cópia em HTML do token que está sendo arrastado (o token de verdade é do
     * canvas, que fica atrás dos painéis). Centro e diâmetro em pixels da tela; `borda` = espessura da borda.
     */
    mostrarFantasma(token: Token, centro: PointData, diametro: number, borda: number): void;
    /** Esconde a cópia do token arrastado. */
    esconderFantasma(): void;
    /** true enquanto a bolsa está EXPANDIDA (tela cheia: criar e editar). */
    readonly expandida: boolean;
    /** Expande a bolsa (tela cheia). */
    abrir(): void;
    /** Volta a bolsa ao canto (o tamanho de sempre). */
    fechar(): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarBolsa(opcoes: OpcoesBolsa): Bolsa {
    const bolsa = pegar("bolsa");
    const coluna = pegar("chat"); // a COLUNA da direita (chat e bolsa): a tela cheia escurece o fundo por uma classe dela
    const itens = pegar("bolsa-itens");
    const vazia = pegar("bolsa-vazia");
    const botaoGerenciar = pegar<HTMLButtonElement>("bolsa-gerenciar"); // o ⤢ do alto: abre a tela cheia
    const botaoCriarToken = pegar<HTMLButtonElement>("bolsa-criar-token-botao"); // o "+ Criar token" da linha da pesquisa (abre a tela cheia)
    const botaoFechar = pegar<HTMLButtonElement>("bolsa-fechar");
    const botoesTamanho = Array.from(bolsa.querySelectorAll<HTMLButtonElement>("button[data-tamanho]"));
    const amostras = pegar("bolsa-amostras");
    const amostrasBorda = pegar("bolsa-amostras-borda");
    const seletorCor = pegar<HTMLInputElement>("bolsa-cor");
    const seletorCorBorda = pegar<HTMLInputElement>("bolsa-cor-borda");
    const previa = pegar("bolsa-previa");
    const campoNome = pegar<HTMLInputElement>("bolsa-nome");
    const botaoImagem = pegar<HTMLButtonElement>("bolsa-imagem-escolher");
    const botaoSemImagem = pegar<HTMLButtonElement>("bolsa-imagem-remover");
    const arquivo = pegar<HTMLInputElement>("bolsa-arquivo");
    const botaoCriar = pegar<HTMLButtonElement>("bolsa-criar-botao");
    const aviso = pegar("bolsa-aviso");
    const campoBusca = pegar<HTMLInputElement>("bolsa-busca"); // a pesquisa dos TOKENS
    const campoBuscaFichas = pegar<HTMLInputElement>("bolsa-fichas-busca"); // a pesquisa das FICHAS (independente da outra)
    const fantasma = pegar("token-fantasma");
    let fantasmaPintado = ""; // o que a cópia mostra agora (para repintar só quando o token muda)
    const menuFicha = pegar("menu-ficha");
    const menuEditar = pegar<HTMLButtonElement>("menu-ficha-editar");
    const menuAlterar = pegar<HTMLButtonElement>("menu-ficha-alterar");
    const menuExcluir = pegar<HTMLButtonElement>("menu-ficha-excluir");
    const menuDoc = pegar("menu-doc");
    const menuDocAbrir = pegar<HTMLButtonElement>("menu-doc-abrir");
    const menuDocExcluir = pegar<HTMLButtonElement>("menu-doc-excluir");
    const fichasVazia = pegar("bolsa-fichas-vazia");
    const listaFichas = pegar("bolsa-fichas-lista");
    const botaoCriarFicha = pegar<HTMLButtonElement>("bolsa-ficha-criar-botao");
    const avisoFicha = pegar("bolsa-ficha-aviso");
    const listaAbas = pegar("bolsa-abas");
    const selectOrdem = pegar<HTMLSelectElement>("bolsa-ordem");
    const botaoFiltroFavoritos = pegar<HTMLButtonElement>("bolsa-filtro-favoritos");
    const caixaChips = pegar("bolsa-grupos-chips");
    const botaoGrupoNovo = pegar<HTMLButtonElement>("bolsa-grupo-novo");
    const botaoFiltroGrupos = pegar<HTMLButtonElement>("bolsa-filtro-grupos"); // a lista suspensa de grupos da bolsa do CANTO
    const menuGrupos = pegar("menu-grupos");
    const botaoSelecaoFavoritar = pegar<HTMLButtonElement>("bolsa-selecao-favoritar");
    const botaoSelecaoGrupos = pegar<HTMLButtonElement>("bolsa-selecao-grupos");
    const menuFichaFavorito = pegar<HTMLButtonElement>("menu-ficha-favorito");
    const menuFichaGrupos = pegar<HTMLButtonElement>("menu-ficha-grupos");
    const menuDocFavorito = pegar<HTMLButtonElement>("menu-doc-favorito");
    const menuDocGrupos = pegar<HTMLButtonElement>("menu-doc-grupos");
    const menuSelecaoFavorito = pegar<HTMLButtonElement>("menu-selecao-favorito");
    const menuSelecaoGrupos = pegar<HTMLButtonElement>("menu-selecao-grupos");
    const editorGrupo = criarEditorGrupo();
    const barraSelecao = pegar("bolsa-selecao-barra");
    const contagemSelecao = pegar("bolsa-selecao-contagem");
    const botaoSelecaoExcluir = pegar<HTMLButtonElement>("bolsa-selecao-excluir");
    const botaoSelecaoLimpar = pegar<HTMLButtonElement>("bolsa-selecao-limpar");
    const menuSelecao = pegar("menu-selecao");
    const menuSelecaoExcluir = pegar<HTMLButtonElement>("menu-selecao-excluir");
    const retanguloSelecao = pegar("bolsa-retangulo");
    const botoesAba = Array.from(listaAbas.querySelectorAll<HTMLButtonElement>(".bolsa-aba")); // na ordem da tela: Tokens, Fichas

    // Os DOIS tamanhos: a bolsa do CANTO (o padrão: com pesquisa; o mapa continua acessível, então dá para arrastar tokens para ele) e
    // a EXPANDIDA (tela cheia, para criar e editar tokens). `expandida` = tela cheia.
    let expandida = false;
    // A SELEÇÃO de cada aba (os ids marcados) e a "âncora" (o último item clicado, de onde o Shift+clique conta o intervalo).
    const selecao = { tokens: { ids: new Set<number>(), ancora: null as number | null }, fichas: { ids: new Set<number>(), ancora: null as number | null } };
    let visiveisTokens: Token[] = []; // o que a lista de tokens mostra agora (depois da pesquisa), na ordem da tela
    let visiveisFichas: Ficha[] = []; // idem para as fichas
    let abrirEditorAoCriar = false; // online: o token genérico foi pedido pelo "+ Criar token": quando chegar, abre o "Editar token"
    let fichaDoMenu: Ficha | null = null; // o documento (ficha) em que o clique direito abriu o menu
    let aguardandoToken = false; // online: o pedido de criar token já foi ao servidor e a resposta ainda não chegou
    let aba: AbaBolsa = "tokens"; // a aba aberta; vale para os dois tamanhos (abrir ou fechar a tela cheia não troca de aba)
    // O que será criado: tamanho, cores e imagem marcados na área "Criar token".
    let tamanhoEscolhido = TAMANHO_INICIAL_TOKEN;
    let corEscolhida = COR_INICIAL_TOKEN; // preenchimento
    let corBordaEscolhida = COR_BORDA_INICIAL_TOKEN;
    let imagemEscolhida: string | null = null;
    // O token cuja ficha recebeu o clique direito (o menu "Alterar imagem" age sobre ele).
    let tokenDoMenu: Token | null = null;

    // ---------------------------------------------------------------
    // Fichinhas (os tokens guardados) e o arrasto que começa nelas
    // ---------------------------------------------------------------

    /** Acompanha o mouse pelo documento até soltar (o clique começou fora do canvas). */
    function acompanhar(): void {
        const mover = (e: PointerEvent): void => opcoes.aoArrastar({ x: e.clientX, y: e.clientY });
        const terminar = (): void => {
            document.removeEventListener("pointermove", mover);
            document.removeEventListener("pointerup", terminar);
            document.removeEventListener("pointercancel", terminar);
            opcoes.aoSoltar();
        };
        document.addEventListener("pointermove", mover);
        document.addEventListener("pointerup", terminar);
        document.addEventListener("pointercancel", terminar);
    }

    /** Minúsculas, sem acento e com "×" virando "x": "Goblin Ágil 3×3" casa com "agil" e com "3x3". */
    const normalizar = (texto: string): string =>
        texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/×/g, "x");

    function atualizar(): void {
        const guardados = estado.tokens.filter((t) => t.guardado);
        // A pesquisa filtra pelo nome e pelo tamanho; vazia, mostra todos.
        const busca = normalizar(campoBusca.value.trim());
        bolsa.classList.toggle("buscando", busca !== ""); // pesquisando, a prévia grande some e os resultados sobem
        const visiveis = organizar(busca === "" ? guardados : guardados.filter((t) => normalizar(`${t.nome} ${t.size}x${t.size}`).includes(busca)), "tokens");
        visiveisTokens = visiveis;
        vazia.hidden = visiveis.length > 0;
        vazia.textContent =
            guardados.length > 0
                ? busca !== ""
                    ? `Nenhum token encontrado para "${campoBusca.value.trim()}".`
                    : "Nenhum token neste filtro."
                : expandida
                  ? "Nenhum token guardado ainda. Crie um ao lado."
                  : "Arraste tokens para cá para guardá-los.";
        const cheia = estado.tokens.length >= MAX_TOKENS;
        botaoCriar.disabled = aguardandoToken || cheia;
        botaoCriar.title = cheia ? `Limite de ${MAX_TOKENS} tokens na mesa` : "";

        itens.replaceChildren(
            ...visiveis.map((token) => {
                const ficha = document.createElement("button");
                ficha.className = "ficha";
                ficha.dataset.id = String(token.id);
                ficha.title = expandida
                    ? `${token.nome} (${token.size}×${token.size}): clique para selecionar, clique de novo para editar (botão direito: mais opções)`
                    : `${token.nome} (${token.size}×${token.size}): arraste para o mapa; clique para selecionar, clique de novo para editar (botão direito: mais opções)`;
                ficha.setAttribute("aria-label", `${token.nome}, ${token.size} por ${token.size}`);

                const disco = document.createElement("span");
                disco.className = "disco";
                pintarDisco(disco, token.cor, token.corBorda, token.imagem);
                disco.style.setProperty("--t", String(token.size)); // a bolsa expandida desenha o disco proporcional
                // O nome vem do usuário: entra por textContent (nunca como HTML). Nomes longos ganham "…" (CSS).
                const nome = document.createElement("span");
                nome.className = "ficha-nome";
                nome.textContent = token.nome;
                const tamanho = document.createElement("small");
                tamanho.textContent = `${token.size}×${token.size}`;
                ficha.append(disco, nome, tamanho, ...marcasDoItem("tokens", token));
                ficha.title += dicaDosGrupos(token);

                ficha.addEventListener("pointerdown", (e) => {
                    pontoDoAperto = { x: e.clientX, y: e.clientY };
                    if (e.button !== 0 || expandida) return; // só o botão esquerdo, e não na tela cheia (a média arrasta para o mapa)
                    e.preventDefault(); // sem selecionar texto nem arrastar a "imagem" do botão
                    if (opcoes.aoComecarArrasto(token.id, { x: e.clientX, y: e.clientY })) acompanhar();
                });
                ficha.addEventListener("click", (e) => aoClicarItem(token.id, e, () => opcoes.aoEditar(token)));
                // Botão direito: menu de ações (em vez do menu do navegador). Num item fora da seleção, ele vira a seleção (como no Windows).
                ficha.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    if (!selecao.tokens.ids.has(token.id)) selecionarSo(selecao.tokens, token.id);
                    if (selecao.tokens.ids.size > 1) abrirMenuSelecao(e.clientX, e.clientY);
                    else abrirMenuFicha(token, e.clientX, e.clientY);
                });
                return ficha;
            }),
        );
        aplicarSelecao();
        reabrirMenuDeGrupos();
    }

    // ---------------------------------------------------------------
    // SELEÇÃO (como no Windows): clicar seleciona, clicar de novo abre, Ctrl/Shift somam, o retângulo seleciona em área
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // ORDENAR, FILTRAR e GRUPOS, e a ESTRELA de favorito (tokens e fichas)
    // ---------------------------------------------------------------

    type Ordem = "antigos" | "recentes" | "favoritos" | "grupo" | "nome";
    /** As ordens da lista: o id só SOBE (nunca é reaproveitado), então a ordem do id é a ordem de CRIAÇÃO (a data). */
    const ORDENS: [Ordem, string][] = [
        ["recentes", "Mais recentes"], // o PADRÃO (pedido do dono)
        ["antigos", "Menos recentes"],
        ["favoritos", "Favoritos primeiro"],
        ["grupo", "Por grupo"],
        ["nome", "Nome (A–Z)"],
    ];
    const lerOrdem = (chave: string): Ordem => {
        const guardada = lerPreferencia(chave);
        return ORDENS.some(([o]) => o === guardada) ? (guardada as Ordem) : "recentes";
    };
    const ordem: Record<AbaBolsa, Ordem> = { tokens: lerOrdem(CHAVE_ORDEM_TOKENS), fichas: lerOrdem(CHAVE_ORDEM_FICHAS) };
    // O filtro de cada aba: nenhum grupo marcado e favoritos desligado = mostra tudo; com grupos marcados, mostra o item que está em QUALQUER um deles.
    const filtro: Record<AbaBolsa, { grupos: Set<number>; favoritos: boolean }> = {
        tokens: { grupos: new Set(), favoritos: false },
        fichas: { grupos: new Set(), favoritos: false },
    };
    selectOrdem.replaceChildren(...ORDENS.map(([valor, texto]) => new Option(texto, valor)));

    interface ItemMarcavel {
        id: number;
        nome: string;
        favorito: boolean;
        grupos: number[];
    }

    /** Aplica o filtro (favoritos e grupos) e a ORDEM da aba; devolve uma lista nova (a original não é mexida). */
    function organizar<T extends ItemMarcavel>(lista: T[], qual: AbaBolsa): T[] {
        const f = filtro[qual];
        const existentes = new Set(estado.grupos.map((g) => g.id));
        for (const id of [...f.grupos]) if (!existentes.has(id)) f.grupos.delete(id); // (um grupo excluído some do filtro)
        const posicaoDoGrupo = (item: T): number => {
            const p = estado.grupos.findIndex((g) => item.grupos.includes(g.id));
            return p < 0 ? Infinity : p; // sem grupo vai para o fim
        };
        const resultado = lista.filter((i) => (!f.favoritos || i.favorito) && (f.grupos.size === 0 || i.grupos.some((g) => f.grupos.has(g))));
        const porId = (a: T, b: T): number => a.id - b.id;
        switch (ordem[qual]) {
            case "recentes":
                return resultado.sort((a, b) => b.id - a.id);
            case "favoritos":
                return resultado.sort((a, b) => Number(b.favorito) - Number(a.favorito) || porId(a, b));
            case "grupo":
                return resultado.sort((a, b) => posicaoDoGrupo(a) - posicaoDoGrupo(b) || porId(a, b)); // (sem subtração: Infinity - Infinity dá NaN)
            case "nome":
                return resultado.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) || porId(a, b));
            default:
                return resultado.sort(porId);
        }
    }
    const filtrando = (qual: AbaBolsa): boolean => filtro[qual].favoritos || filtro[qual].grupos.size > 0;

    const grupoPorId = (id: number): Grupo | undefined => estado.grupos.find((g) => g.id === id);
    const refazerLista = (): void => (aba === "tokens" ? atualizar() : atualizarFichas());

    /** Desenha os "chips" dos grupos (clicar liga/desliga o filtro; botão direito ou duplo clique edita) e põe o seletor e o ★ no estado da aba aberta. */
    function renderizarChips(): void {
        selectOrdem.value = ordem[aba];
        botaoFiltroFavoritos.setAttribute("aria-pressed", String(filtro[aba].favoritos));
        botaoGrupoNovo.disabled = estado.grupos.length >= MAX_GRUPOS;
        const ligados = filtro[aba].grupos.size;
        botaoFiltroGrupos.textContent = ligados > 0 ? `Grupos (${ligados}) ▾` : "Grupos ▾";
        botaoFiltroGrupos.setAttribute("aria-pressed", String(ligados > 0));
        caixaChips.replaceChildren(
            ...estado.grupos.map((grupo) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "bolsa-chip";
                chip.style.setProperty("--cor-grupo", corCss(grupo.cor));
                chip.setAttribute("aria-pressed", String(filtro[aba].grupos.has(grupo.id)));
                chip.title = `Grupo "${grupo.nome}": clique para filtrar (botão direito ou duplo clique: editar)`;
                const ponto = document.createElement("span");
                ponto.className = "ponto-grupo";
                const nome = document.createElement("span");
                nome.textContent = grupo.nome; // (texto de jogador: textContent, nunca HTML)
                chip.append(ponto, nome);
                chip.addEventListener("click", () => {
                    const ligados = filtro[aba].grupos;
                    if (ligados.has(grupo.id)) ligados.delete(grupo.id);
                    else ligados.add(grupo.id);
                    renderizarChips();
                    refazerLista();
                });
                chip.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    editarGrupo(grupo);
                });
                chip.addEventListener("dblclick", () => editarGrupo(grupo));
                return chip;
            }),
        );
    }

    selectOrdem.addEventListener("change", () => {
        ordem[aba] = selectOrdem.value as Ordem;
        guardarPreferencia(aba === "tokens" ? CHAVE_ORDEM_TOKENS : CHAVE_ORDEM_FICHAS, ordem[aba]);
        refazerLista();
    });
    botaoFiltroFavoritos.addEventListener("click", () => {
        filtro[aba].favoritos = !filtro[aba].favoritos;
        renderizarChips();
        refazerLista();
    });

    // --- criar, editar e excluir grupos ---
    let aguardandoGrupo = false; // online: o pedido de criar grupo já foi ao servidor
    let pendenteGrupo: { tipo: AbaBolsa; ids: number[] } | null = null; // "Novo grupo…" do menu de grupos: depois de criado, os itens selecionados entram nele

    /** Liga (ou desliga) um grupo em vários itens de uma vez (cada item recebe a lista de grupos nova). */
    function aplicarGrupoAosItens(tipo: AbaBolsa, ids: number[], grupoId: number, ligar: boolean): void {
        const itensDoTipo: ItemMarcavel[] = tipo === "tokens" ? estado.tokens : estado.fichas;
        const alteracoes = ids.flatMap((id) => {
            const item = itensDoTipo.find((i) => i.id === id);
            if (!item) return [];
            const grupos = ligar ? [...new Set([...item.grupos, grupoId])] : item.grupos.filter((g) => g !== grupoId);
            return [{ id, grupos }];
        });
        if (alteracoes.length > 0) opcoes.aoAlterarItens(tipo, alteracoes);
        atualizarGrupos();
    }

    function concluirGrupoCriado(grupo: Grupo): void {
        const pendente = pendenteGrupo;
        pendenteGrupo = null;
        if (pendente) aplicarGrupoAosItens(pendente.tipo, pendente.ids, grupo.id, true);
        else atualizarGrupos();
    }

    function criarGrupoNovo(pendente: { tipo: AbaBolsa; ids: number[] } | null): void {
        editorGrupo.abrir({
            aoSalvar: (nome, cor) => {
                const resultado = opcoes.aoCriarGrupo(nome, cor);
                if (resultado === "enviado") {
                    aguardandoGrupo = true;
                    pendenteGrupo = pendente;
                } else if (resultado !== null) {
                    pendenteGrupo = pendente;
                    concluirGrupoCriado(resultado);
                }
            },
        });
    }
    botaoGrupoNovo.addEventListener("click", () => criarGrupoNovo(null));

    function editarGrupo(grupo: Grupo): void {
        editorGrupo.abrir({
            grupo,
            aoSalvar: (nome, cor) => {
                opcoes.aoEditarGrupo(grupo.id, { nome, cor });
                atualizarGrupos();
            },
            aoExcluir: () => opcoes.aoExcluirGrupo(grupo),
        });
    }

    function atualizarGrupos(): void {
        renderizarChips();
        atualizar();
        atualizarFichas();
    }

    /** Se o menu "Grupos…" está aberto, refaz as linhas (✓ e –) com o estado de agora (vale também quando a confirmação do servidor chega depois). */
    function reabrirMenuDeGrupos(): void {
        if (menuAtribuirAberto && !menuGrupos.hidden) abrirMenuGrupos(menuAtribuirAberto.x, menuAtribuirAberto.y);
    }

    function grupoCriado(grupo: Grupo): void {
        if (aguardandoGrupo) {
            aguardandoGrupo = false;
            concluirGrupoCriado(grupo);
        } else {
            atualizarGrupos(); // (o grupo é de outra pessoa: só a lista muda)
        }
    }

    // --- favoritar e o menu de GRUPOS (agem sobre a SELEÇÃO da aba aberta) ---
    const itensSelecionados = (): ItemMarcavel[] => {
        const ids = selDaAba().ids;
        return (aba === "tokens" ? estado.tokens : estado.fichas).filter((i) => ids.has(i.id));
    };

    /** Estrela nos selecionados: se TODOS já são favoritos, tira; senão, marca todos. */
    function favoritarSelecao(): void {
        const itens = itensSelecionados();
        if (itens.length === 0) return;
        const marcar = !itens.every((i) => i.favorito);
        opcoes.aoAlterarItens(aba, itens.map((i) => ({ id: i.id, favorito: marcar })));
        refazerLista();
    }

    function alternarFavorito(tipo: AbaBolsa, id: number): void {
        const item = (tipo === "tokens" ? estado.tokens : estado.fichas).find((i) => i.id === id);
        if (!item) return;
        opcoes.aoAlterarItens(tipo, [{ id, favorito: !item.favorito }]);
        if (tipo === "tokens") atualizar();
        else atualizarFichas();
    }

    /** O texto dos botões de favorito dos menus (depende da seleção). */
    function atualizarRotulosDeFavorito(): void {
        const itens = itensSelecionados();
        const texto = itens.length > 0 && itens.every((i) => i.favorito) ? "Tirar dos favoritos" : "Favoritar";
        menuFichaFavorito.textContent = menuDocFavorito.textContent = menuSelecaoFavorito.textContent = texto;
        botaoSelecaoFavoritar.title = texto;
    }

    /** Uma linha do menu de grupos: a marca (✓, – ou +), o pontinho da cor do grupo (opcional) e o nome (por textContent). */
    function linhaDeMenuGrupos(marca: string, cor: number | null, texto: string, aoClicar: () => void): HTMLButtonElement {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.setAttribute("role", "menuitem");
        const m = document.createElement("span");
        m.className = "marca";
        m.textContent = marca;
        botao.append(m);
        if (cor !== null) {
            const ponto = document.createElement("span");
            ponto.className = "ponto-grupo";
            ponto.style.setProperty("--cor-grupo", corCss(cor));
            botao.append(ponto);
        }
        const t = document.createElement("span");
        t.textContent = texto;
        botao.append(t);
        botao.addEventListener("click", aoClicar);
        return botao;
    }

    /**
     * A LISTA SUSPENSA de grupos da bolsa do canto: marcar um grupo liga o FILTRO por ele (✓), e o menu continua aberto para marcar outros;
     * botão direito num grupo o edita; "Novo grupo…" cria. (Na tela cheia os grupos são chips.)
     */
    function abrirMenuFiltroGrupos(x: number, y: number): void {
        fecharMenuFicha();
        const ligados = filtro[aba].grupos;
        const linhas = estado.grupos.map((grupo) => {
            const botao = linhaDeMenuGrupos(ligados.has(grupo.id) ? "✓" : "", grupo.cor, grupo.nome, () => {
                if (ligados.has(grupo.id)) ligados.delete(grupo.id);
                else ligados.add(grupo.id);
                renderizarChips();
                refazerLista();
                abrirMenuFiltroGrupos(x, y); // (refaz o menu no mesmo lugar, com os ✓ novos)
            });
            botao.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                fecharMenuFicha();
                editarGrupo(grupo);
            });
            return botao;
        });
        const novo = linhaDeMenuGrupos("+", null, "Novo grupo…", () => {
            fecharMenuFicha();
            criarGrupoNovo(null);
        });
        const limpar = linhaDeMenuGrupos("", null, "Mostrar todos", () => {
            ligados.clear();
            renderizarChips();
            refazerLista();
            fecharMenuFicha();
        });
        menuGrupos.replaceChildren(...(linhas.length > 0 ? [limpar, document.createElement("hr"), ...linhas, document.createElement("hr")] : []), novo);
        menuGrupos.hidden = false;
        const caixa = menuGrupos.getBoundingClientRect();
        menuGrupos.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menuGrupos.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
    }
    botaoFiltroGrupos.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!menuGrupos.hidden) return fecharMenuFicha(); // (clicar de novo fecha)
        const r = botaoFiltroGrupos.getBoundingClientRect();
        abrirMenuFiltroGrupos(r.left, r.bottom + 2);
    });

    /** O menu de grupos perto de (x, y): ✓ = todos os selecionados estão no grupo, – = alguns; clicar liga/desliga em todos. */
    function abrirMenuGrupos(x: number, y: number): void {
        const tipo = aba;
        const ids = [...selDaAba().ids];
        if (ids.length === 0) return;
        const itens = itensSelecionados();
        fecharMenuFicha();
        menuAtribuirAberto = { x, y };
        const linha = linhaDeMenuGrupos;
        const linhas = estado.grupos.map((grupo) => {
            const dentro = itens.filter((i) => i.grupos.includes(grupo.id)).length;
            const todos = dentro === itens.length;
            return linha(todos ? "✓" : dentro > 0 ? "–" : "", grupo.cor, grupo.nome, () => {
                // O menu NÃO fecha: um item pode estar em vários grupos, então a pessoa marca quantos quiser e fecha quando terminar
                // (clique fora, Esc ou o botão "Grupos ▾" de novo). Ele se refaz com os ✓ novos assim que as listas se atualizam.
                aplicarGrupoAosItens(tipo, ids, grupo.id, !todos);
            });
        });
        const novo = linha("+", null, "Novo grupo…", () => {
            fecharMenuFicha();
            criarGrupoNovo({ tipo, ids });
        });
        menuGrupos.replaceChildren(...linhas, ...(linhas.length > 0 ? [document.createElement("hr")] : []), novo);
        menuGrupos.hidden = false;
        const caixa = menuGrupos.getBoundingClientRect();
        menuGrupos.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menuGrupos.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
    }

    let menuAtribuirAberto: { x: number; y: number } | null = null; // o menu "Grupos…" aberto (e onde): fica aberto até a pessoa fechar e se refaz quando os itens mudam
    let pontoDoMenu = { x: 0, y: 0 }; // onde o último menu do clique direito abriu (o menu de grupos abre no mesmo lugar)
    botaoSelecaoFavoritar.addEventListener("click", favoritarSelecao);
    botaoSelecaoGrupos.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!menuGrupos.hidden) return fecharMenuFicha(); // (clicar de novo fecha)
        const r = botaoSelecaoGrupos.getBoundingClientRect();
        abrirMenuGrupos(r.left, r.bottom + 2);
    });
    for (const botao of [menuFichaFavorito, menuDocFavorito, menuSelecaoFavorito]) {
        botao.addEventListener("click", () => {
            fecharMenuFicha();
            favoritarSelecao();
        });
    }
    for (const botao of [menuFichaGrupos, menuDocGrupos, menuSelecaoGrupos]) {
        botao.addEventListener("click", () => abrirMenuGrupos(pontoDoMenu.x, pontoDoMenu.y));
    }

    /** A estrela e os pontos de grupo que cada item (token ou ficha) leva dentro. A estrela é um <span> (o item do token já é um <button>). */
    function marcasDoItem(tipo: AbaBolsa, item: ItemMarcavel): HTMLElement[] {
        const estrela = document.createElement("span");
        estrela.className = "item-estrela" + (item.favorito ? " ligada" : "");
        estrela.textContent = item.favorito ? "★" : "☆";
        estrela.title = item.favorito ? "Tirar dos favoritos" : "Favoritar";
        estrela.setAttribute("role", "button");
        estrela.setAttribute("aria-label", item.favorito ? "Tirar dos favoritos" : "Favoritar");
        // O aperto na estrela não pode começar um arrasto de token nem o clique de seleção do item.
        estrela.addEventListener("pointerdown", (e) => e.stopPropagation());
        estrela.addEventListener("click", (e) => {
            e.stopPropagation();
            alternarFavorito(tipo, item.id);
        });
        const marcas = [estrela];
        const doItem = item.grupos.map(grupoPorId).filter((g): g is Grupo => g !== undefined);
        if (doItem.length > 0) {
            const caixa = document.createElement("span");
            caixa.className = "item-grupos";
            caixa.setAttribute("aria-hidden", "true");
            for (const g of doItem.slice(0, 4)) {
                const ponto = document.createElement("i");
                ponto.style.setProperty("--cor-grupo", corCss(g.cor));
                caixa.append(ponto);
            }
            marcas.push(caixa);
        }
        return marcas;
    }

    /** Acrescenta os nomes dos grupos à dica do mouse do item. */
    const dicaDosGrupos = (item: ItemMarcavel): string => {
        const nomes = item.grupos.map(grupoPorId).filter((g): g is Grupo => g !== undefined).map((g) => g.nome);
        return (item.favorito ? " ★" : "") + (nomes.length > 0 ? ` [${nomes.join(", ")}]` : "");
    };

    let pontoDoAperto = { x: 0, y: 0 }; // onde o último aperto do mouse começou (para ignorar o clique que sobra de um ARRASTO)

    const selDaAba = (): { ids: Set<number>; ancora: number | null } => (aba === "tokens" ? selecao.tokens : selecao.fichas);
    const idsVisiveis = (): number[] => (aba === "tokens" ? visiveisTokens.map((t) => t.id) : visiveisFichas.map((f) => f.id));

    function selecionarSo(s: { ids: Set<number>; ancora: number | null }, id: number): void {
        s.ids = new Set([id]);
        s.ancora = id;
        aplicarSelecao();
    }

    /** Liga a classe "selecionada" nos itens da tela, tira da seleção o que sumiu (excluído ou escondido pela pesquisa) e mostra a barra de ações. */
    function aplicarSelecao(): void {
        for (const [s, visiveis, lista, seletor] of [
            [selecao.tokens, visiveisTokens.map((t) => t.id), itens, ".ficha"],
            [selecao.fichas, visiveisFichas.map((f) => f.id), listaFichas, ".bolsa-doc"],
        ] as const) {
            for (const id of [...s.ids]) if (!visiveis.includes(id)) s.ids.delete(id);
            if (s.ancora !== null && !visiveis.includes(s.ancora)) s.ancora = null;
            for (const el of lista.querySelectorAll<HTMLElement>(seletor)) el.classList.toggle("selecionada", s.ids.has(Number(el.dataset.id)));
        }
        const n = selDaAba().ids.size;
        const barra = n > 1 && expandida; // a barra de ações é para VÁRIOS itens, e vários só na tela cheia (com um só, o clique direito e o clique de novo bastam)
        // ONDE a barra fica: na aba Fichas em tela cheia, na linha do botão "Instruções"; nos outros casos, na linha da pesquisa (no lugar dela).
        const naLinhaDasInstrucoes = expandida && aba === "fichas";
        const destino = naLinhaDasInstrucoes ? pegar("bolsa-fichas-botoes") : (botaoFechar.parentElement as HTMLElement);
        if (barraSelecao.parentElement !== destino) naLinhaDasInstrucoes ? destino.append(barraSelecao) : destino.insertBefore(barraSelecao, botaoFechar);
        const abaixoDasAbas = expandida && aba === "tokens"; // (Tokens em tela cheia não tem a linha das instruções: a barra ganha uma linha própria, abaixo das abas)
        barraSelecao.classList.toggle("na-linha-das-instrucoes", naLinhaDasInstrucoes);
        barraSelecao.classList.toggle("abaixo-das-abas", abaixoDasAbas);
        barraSelecao.hidden = !barra;
        bolsa.classList.toggle("com-selecao", barra && !naLinhaDasInstrucoes && !abaixoDasAbas); // (nos dois casos a pesquisa continua onde está)
        contagemSelecao.textContent = `${n} selecionados`;
        atualizarRotulosDeFavorito();
        menuSelecaoExcluir.textContent = `Excluir ${n} ${aba === "tokens" ? "tokens" : "fichas"}`;
    }

    /** Na tela cheia, o "+ Criar ficha" fica na linha do botão "Instruções"; na bolsa do canto, volta para a linha da pesquisa (a linha das instruções só existe na tela cheia). */
    function posicionarBotaoCriarFicha(): void {
        const linha = pegar("bolsa-fichas-botoes");
        if (expandida) {
            if (botaoCriarFicha.parentElement !== linha) linha.append(botaoCriarFicha);
        } else {
            const topo = botaoFechar.parentElement as HTMLElement;
            if (botaoCriarFicha.parentElement !== topo) topo.insertBefore(botaoCriarFicha, botaoFechar);
        }
    }

    function limparSelecao(): void {
        const s = selDaAba();
        s.ids = new Set();
        s.ancora = null;
        aplicarSelecao();
    }

    /**
     * Clique num item. Sem teclas: se ele já é o ÚNICO selecionado, ABRE (o "segundo clique" do Windows); senão vira o único selecionado.
     * Ctrl: soma ou tira o item. Shift: seleciona do último clicado até este (na ordem da tela; com Ctrl, soma ao que já estava).
     */
    function aoClicarItem(id: number, e: MouseEvent, abrirItem: () => void): void {
        // O clique que sobra depois de ARRASTAR (um token saindo da bolsa, por exemplo) não é um clique de verdade.
        if (e.detail > 0 && Math.hypot(e.clientX - pontoDoAperto.x, e.clientY - pontoDoAperto.y) > 4) return;
        const s = selDaAba();
        // Selecionar VÁRIOS itens (Ctrl, Shift) só vale na bolsa em TELA CHEIA (pedido do dono); na do canto cada clique seleciona um item só.
        const soma = expandida && (e.ctrlKey || e.metaKey);
        if (expandida && e.shiftKey && s.ancora !== null) {
            const ordem = idsVisiveis();
            const a = ordem.indexOf(s.ancora);
            const b = ordem.indexOf(id);
            if (a >= 0 && b >= 0) {
                const faixa = ordem.slice(Math.min(a, b), Math.max(a, b) + 1);
                s.ids = soma ? new Set([...s.ids, ...faixa]) : new Set(faixa);
            }
        } else if (soma) {
            if (s.ids.has(id)) s.ids.delete(id);
            else s.ids.add(id);
            s.ancora = id;
        } else if (s.ids.size === 1 && s.ids.has(id)) {
            abrirItem(); // o segundo clique abre
            return;
        } else {
            s.ids = new Set([id]);
            s.ancora = id;
        }
        aplicarSelecao();
    }

    /** O menu do clique direito com VÁRIOS itens selecionados (as ações em grupo). */
    function abrirMenuSelecao(x: number, y: number): void {
        fecharMenuFicha();
        pontoDoMenu = { x, y };
        atualizarRotulosDeFavorito();
        menuSelecao.hidden = false;
        const caixa = menuSelecao.getBoundingClientRect();
        menuSelecao.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menuSelecao.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
    }

    /** Exclui o que está selecionado na aba aberta (quem trata pede UMA confirmação, com o número de itens). */
    function excluirSelecionados(): void {
        const s = selDaAba();
        if (aba === "tokens") {
            const lista = visiveisTokens.filter((t) => s.ids.has(t.id));
            if (lista.length === 1) opcoes.aoExcluir(lista[0]);
            else if (lista.length > 1) opcoes.aoExcluirTokens(lista);
        } else {
            const lista = visiveisFichas.filter((f) => s.ids.has(f.id));
            if (lista.length === 1) opcoes.aoExcluirFicha(lista[0]);
            else if (lista.length > 1) opcoes.aoExcluirFichas(lista);
        }
    }
    botaoSelecaoExcluir.addEventListener("click", excluirSelecionados);
    botaoSelecaoLimpar.addEventListener("click", limparSelecao);
    menuSelecaoExcluir.addEventListener("click", () => {
        fecharMenuFicha();
        excluirSelecionados();
    });

    /**
     * O RETÂNGULO de seleção: apertar o botão esquerdo numa área VAZIA da lista e arrastar desenha um retângulo; os itens que ele toca ficam
     * selecionados (com Ctrl, somam ao que já estava). Um clique simples no vazio (sem arrastar) limpa a seleção.
     */
    function ligarRetangulo(lista: HTMLElement, seletor: string): void {
        lista.addEventListener("pointerdown", (e) => {
            if (!expandida || e.button !== 0 || (e.target as HTMLElement).closest(seletor)) return; // só na tela cheia, e só no vazio (os itens têm o clique deles)
            const caixa = lista.getBoundingClientRect();
            if (e.clientX - caixa.left >= lista.clientWidth) return; // a barra de rolagem é da barra de rolagem
            e.preventDefault(); // sem selecionar texto da página enquanto arrasta
            const s = selDaAba();
            const base = e.ctrlKey || e.metaKey ? new Set(s.ids) : new Set<number>();
            const inicio = { x: e.clientX, y: e.clientY };
            let arrastou = false;
            const mover = (m: PointerEvent): void => {
                if (!arrastou && Math.hypot(m.clientX - inicio.x, m.clientY - inicio.y) < 4) return;
                arrastou = true;
                const esquerda = Math.min(inicio.x, m.clientX);
                const topo = Math.min(inicio.y, m.clientY);
                const direita = Math.max(inicio.x, m.clientX);
                const baixo = Math.max(inicio.y, m.clientY);
                retanguloSelecao.hidden = false;
                retanguloSelecao.style.left = `${esquerda}px`;
                retanguloSelecao.style.top = `${topo}px`;
                retanguloSelecao.style.width = `${direita - esquerda}px`;
                retanguloSelecao.style.height = `${baixo - topo}px`;
                const marcados = new Set(base);
                for (const el of lista.querySelectorAll<HTMLElement>(seletor)) {
                    const r = el.getBoundingClientRect();
                    if (r.right >= esquerda && r.left <= direita && r.bottom >= topo && r.top <= baixo) marcados.add(Number(el.dataset.id));
                }
                s.ids = marcados;
                aplicarSelecao();
            };
            const terminar = (): void => {
                document.removeEventListener("pointermove", mover);
                document.removeEventListener("pointerup", terminar);
                document.removeEventListener("pointercancel", terminar);
                retanguloSelecao.hidden = true;
                if (!arrastou && !(e.ctrlKey || e.metaKey)) limparSelecao(); // clique no vazio: tira a seleção
            };
            document.addEventListener("pointermove", mover);
            document.addEventListener("pointerup", terminar);
            document.addEventListener("pointercancel", terminar);
        });
    }
    ligarRetangulo(itens, ".ficha");
    ligarRetangulo(listaFichas, ".bolsa-doc");

    // Ctrl+A seleciona tudo o que a aba mostra; Delete exclui a seleção (só com o foco na bolsa e fora dos campos de texto).
    bolsa.addEventListener("keydown", (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (expandida && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            const s = selDaAba();
            s.ids = new Set(idsVisiveis());
            aplicarSelecao();
        } else if (e.key === "Delete" && selDaAba().ids.size > 0) {
            e.preventDefault();
            excluirSelecionados();
        }
    });

    // ---------------------------------------------------------------
    // Escolher arquivo e recortar (usado ao criar e ao alterar uma ficha)
    // ---------------------------------------------------------------

    /** Seletor de arquivo + editor de recorte. Devolve a miniatura pronta, ou null se cancelou. */
    async function escolherEcortar(corFundo: number): Promise<string | null> {
        const escolhido = await escolherArquivo(arquivo);
        return escolhido ? opcoes.editarImagem(escolhido, corFundo) : null;
    }

    // ---------------------------------------------------------------
    // Menu do clique direito numa ficha
    // ---------------------------------------------------------------

    function fecharMenuFicha(): void {
        menuFicha.hidden = true;
        menuDoc.hidden = true; // (os menus fecham juntos)
        menuSelecao.hidden = true;
        menuGrupos.hidden = true;
        menuAtribuirAberto = null;
        tokenDoMenu = null;
        fichaDoMenu = null;
    }

    function abrirMenuFicha(token: Token, x: number, y: number): void {
        pontoDoMenu = { x, y };
        atualizarRotulosDeFavorito();
        tokenDoMenu = token;
        menuFicha.hidden = false;
        // Dentro da janela: se não couber à direita/embaixo, abre para o lado oposto do clique.
        const caixa = menuFicha.getBoundingClientRect();
        menuFicha.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menuFicha.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
    }

    menuEditar.addEventListener("click", () => {
        const token = tokenDoMenu;
        fecharMenuFicha();
        if (token) opcoes.aoEditar(token);
    });
    menuExcluir.addEventListener("click", () => {
        const token = tokenDoMenu;
        fecharMenuFicha();
        if (token) opcoes.aoExcluir(token);
    });
    /** O menu do clique direito num DOCUMENTO da aba Fichas: abre perto do mouse, sem sair da janela. */
    function abrirMenuDoc(ficha: Ficha, x: number, y: number): void {
        fecharMenuFicha();
        pontoDoMenu = { x, y };
        atualizarRotulosDeFavorito();
        fichaDoMenu = ficha;
        menuDoc.hidden = false;
        const caixa = menuDoc.getBoundingClientRect();
        menuDoc.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menuDoc.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
    }
    menuDocAbrir.addEventListener("click", () => {
        const ficha = fichaDoMenu;
        fecharMenuFicha();
        if (ficha) opcoes.aoAbrirFicha(ficha);
    });
    menuDocExcluir.addEventListener("click", () => {
        const ficha = fichaDoMenu;
        fecharMenuFicha();
        if (ficha) opcoes.aoExcluirFicha(ficha);
    });
    menuAlterar.addEventListener("click", async () => {
        const token = tokenDoMenu;
        fecharMenuFicha();
        if (!token) return;
        const imagem = await escolherEcortar(token.cor);
        if (imagem) opcoes.aoMudarImagem(token.id, imagem);
    });
    // O menu fecha com um aperto fora dele (captura: roda antes de qualquer outro tratamento), com Esc e ao rolar.
    document.addEventListener(
        "pointerdown",
        (e) => {
            const aberto = !menuFicha.hidden || !menuDoc.hidden || !menuSelecao.hidden || !menuGrupos.hidden;
            const dentro = [menuFicha, menuDoc, menuSelecao, menuGrupos].some((m) => m.contains(e.target as Node));
            if (aberto && !dentro && e.target !== botaoSelecaoGrupos && !botaoFiltroGrupos.contains(e.target as Node)) fecharMenuFicha();
        },
        true,
    );
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape" && (!menuFicha.hidden || !menuDoc.hidden || !menuSelecao.hidden || !menuGrupos.hidden)) {
                e.stopPropagation(); // fecha só o menu (a bolsa por baixo continua aberta)
                fecharMenuFicha();
            }
        },
        true,
    );
    window.addEventListener("resize", fecharMenuFicha);

    // ---------------------------------------------------------------
    // Criar token: nome, imagem, tamanho, as duas paletas (preenchimento e borda) e a prévia
    // ---------------------------------------------------------------

    /** Mostra na prévia (e nos botões) o que está escolhido agora. */
    function atualizarEscolha(): void {
        for (const botao of botoesTamanho) {
            const ligado = Number(botao.dataset.tamanho) === tamanhoEscolhido;
            botao.classList.toggle("ativo", ligado);
            botao.setAttribute("aria-pressed", String(ligado));
        }
        const disco = previa.querySelector<HTMLElement>(".disco")!;
        pintarDisco(disco, corEscolhida, corBordaEscolhida, imagemEscolhida);
        disco.style.setProperty("--t", String(tamanhoEscolhido));
        previa.querySelector("small")!.textContent = `${tamanhoEscolhido}×${tamanhoEscolhido}`;
        seletorCor.value = corCss(corEscolhida);
        seletorCorBorda.value = corCss(corBordaEscolhida);
        marcarEscolhida(amostras, corEscolhida);
        marcarEscolhida(amostrasBorda, corBordaEscolhida);
        botaoImagem.textContent = imagemEscolhida ? "Trocar imagem…" : "Escolher imagem…";
        botaoSemImagem.hidden = imagemEscolhida === null;
    }

    for (const botao of botoesTamanho) {
        botao.addEventListener("click", () => {
            tamanhoEscolhido = Number(botao.dataset.tamanho);
            atualizarEscolha();
        });
    }
    seletorCor.addEventListener("input", () => {
        corEscolhida = parseInt(seletorCor.value.slice(1), 16);
        atualizarEscolha();
    });
    seletorCorBorda.addEventListener("input", () => {
        corBordaEscolhida = parseInt(seletorCorBorda.value.slice(1), 16);
        atualizarEscolha();
    });
    botaoImagem.addEventListener("click", async () => {
        const imagem = await escolherEcortar(corEscolhida);
        if (imagem) {
            imagemEscolhida = imagem;
            atualizarEscolha();
        }
    });
    botaoSemImagem.addEventListener("click", () => {
        imagemEscolhida = null;
        atualizarEscolha();
    });
    campoNome.maxLength = MAX_CARACTERES_NOME_TOKEN; // o navegador já corta ao digitar/colar (a regra também vale no estado)
    /** Depois que o token existe (criado aqui, ou confirmado pelo servidor): mensagem, formulário limpo e lista refeita. */
    function aposCriarToken(token: Token): void {
        aviso.textContent = `"${token.nome}" (${token.size}×${token.size}) criado e guardado na bolsa.`;
        campoNome.value = ""; // o próximo começa sem nome (e ganha "Token N" se ficar assim)
        campoBusca.value = ""; // limpa a pesquisa: o token novo precisa aparecer na lista
        imagemEscolhida = null; // e sem imagem
        atualizarEscolha();
        atualizar();
    }

    function criar(): void {
        if (aguardandoToken || botaoCriar.disabled) return;
        const resultado = opcoes.aoCriarToken({
            nome: campoNome.value,
            cor: corEscolhida,
            corBorda: corBordaEscolhida,
            tamanho: tamanhoEscolhido,
            imagem: imagemEscolhida,
        });
        if (resultado === "enviado") {
            // Online: o formulário fica como está até o servidor responder (se ele recusar, o que a pessoa montou não se perde).
            aguardandoToken = true;
            aviso.textContent = "Criando o token no servidor…";
            atualizar();
        } else if (resultado === null) {
            aviso.textContent = `Não foi possível criar: a mesa tem o limite de ${MAX_TOKENS} tokens.`;
            atualizar();
        } else {
            aposCriarToken(resultado);
        }
    }

    function tokenCriado(token: Token): void {
        if (!aguardandoToken) return atualizar(); // o token é de outra pessoa: só a lista muda
        aguardandoToken = false;
        if (abrirEditorAoCriar) {
            abrirEditorAoCriar = false; // veio do "+ Criar token": o formulário da tela cheia não é tocado; abre o "Editar token"
            atualizar();
            selecionarSo(selecao.tokens, token.id);
            opcoes.aoEditar(token);
            return;
        }
        aposCriarToken(token);
    }

    function tokenRecusado(motivo: string): void {
        if (!aguardandoToken) return;
        aguardandoToken = false;
        abrirEditorAoCriar = false;
        aviso.textContent = motivo;
        atualizar();
    }
    botaoCriar.addEventListener("click", criar);
    campoNome.addEventListener("keydown", (e) => {
        if (e.key === "Enter") criar(); // Enter no campo de nome cria o token
    });

    // ---------------------------------------------------------------
    // Abrir e fechar
    // ---------------------------------------------------------------

    /** Abre a TELA CHEIA (criar e editar tokens). */
    function abrir(): void {
        if (expandida) return;
        expandida = true;
        posicionarBotaoCriarFicha();
        aplicarSelecao(); // (a barra de ações muda de lugar na tela cheia)
        opcoes.aoAbrir();
        bolsa.classList.add("expandida");
        coluna.classList.add("bolsa-aberta");
        botaoFechar.hidden = false;
        campoBusca.value = "";
        campoBuscaFichas.value = "";
        aviso.textContent = "";
        atualizar(); // os textos mudam com a bolsa aberta
        atualizarFichas();
        botaoFechar.focus();
    }

    /** Volta a bolsa ao canto (o tamanho de sempre). */
    function fechar(): void {
        if (!expandida) return;
        expandida = false;
        // Na bolsa do canto só há UM item selecionado por vez: de uma seleção múltipla da tela cheia fica o último clicado.
        for (const s of [selecao.tokens, selecao.fichas]) {
            if (s.ids.size > 1) s.ids = new Set(s.ancora !== null && s.ids.has(s.ancora) ? [s.ancora] : [[...s.ids][0]]);
        }
        posicionarBotaoCriarFicha();
        aplicarSelecao();
        bolsa.classList.remove("expandida");
        coluna.classList.remove("bolsa-aberta");
        botaoFechar.hidden = true;
        campoBusca.value = ""; // as pesquisas são limpas ao voltar ao canto
        campoBuscaFichas.value = "";
        atualizar();
        atualizarFichas();
        botaoGerenciar.focus();
    }

    // ---------------------------------------------------------------
    // Abas: "Tokens" e "Fichas"
    // ---------------------------------------------------------------

    /**
     * Troca a aba. O CSS faz o resto a partir da classe `aba-fichas` na bolsa (esconde o que é só dos tokens e mostra o painel das
     * fichas). `focar` leva o foco do teclado ao botão da aba (usado pelas setas, como nas abas de qualquer programa).
     */
    function escolherAba(nova: AbaBolsa, focar = false): void {
        aba = nova;
        guardarPreferencia(CHAVE_ABA_BOLSA, nova); // a última aba clicada volta ao recarregar a página
        fecharMenuFicha(); // o menu do clique direito é das fichinhas de token: não pode ficar solto sobre a outra aba
        bolsa.classList.toggle("aba-fichas", nova === "fichas");
        for (const botao of botoesAba) {
            const ligada = botao.dataset.aba === nova;
            botao.setAttribute("aria-selected", String(ligada));
            botao.tabIndex = ligada ? 0 : -1; // só a aba aberta entra na ordem do Tab; as setas passeiam entre elas
            if (ligada && focar) botao.focus();
        }
        aplicarSelecao(); // a barra de ações e o destaque são da aba aberta
        renderizarChips(); // a ordem e os filtros também são de cada aba
    }

    escolherAba(lerPreferencia(CHAVE_ABA_BOLSA) === "fichas" ? "fichas" : "tokens"); // a aba da última vez (sem preferência: Tokens)

    for (const botao of botoesAba) {
        botao.addEventListener("click", () => escolherAba(botao.dataset.aba as AbaBolsa));
    }
    listaAbas.addEventListener("keydown", (e) => {
        const atual = botoesAba.findIndex((b) => b.dataset.aba === aba);
        // ← e → andam entre as abas (dando a volta); Home e End vão à primeira e à última.
        const destino =
            e.key === "ArrowRight" ? (atual + 1) % botoesAba.length
            : e.key === "ArrowLeft" ? (atual - 1 + botoesAba.length) % botoesAba.length
            : e.key === "Home" ? 0
            : e.key === "End" ? botoesAba.length - 1
            : -1;
        if (destino < 0) return;
        e.preventDefault();
        escolherAba(botoesAba[destino].dataset.aba as AbaBolsa, true);
    });

    // ---------------------------------------------------------------
    // Aba Fichas: o botão "Criar ficha" e a GRADE de documentos (organizada como a de tokens). Cada ficha é um arquivo
    // guardado no servidor, criado no instante do clique; abrir e editar o texto virá depois.
    // ---------------------------------------------------------------

    let abrirFichaAoCriar = false; // online: a ficha pedida deve abrir quando o servidor a devolver (só quando foi pedida na bolsa do canto)
    let aguardandoFicha = false; // online: o pedido já foi ao servidor e a resposta ainda não chegou

    function mostrarAvisoFicha(texto: string, ehErro = false): void {
        avisoFicha.textContent = texto;
        if (ehErro) avisoFicha.dataset.erro = "";
        else delete avisoFicha.dataset.erro;
    }

    let idFichaAberta: number | null = null; // a ficha aberta na janela de edição (o nome dela fica em outra cor)

    function atualizarFichas(): void {
        const fichas = estado.fichas;
        // A pesquisa da aba Fichas (um campo só dela) filtra as fichas pelo nome (ignora maiúsculas e acentos).
        const busca = normalizar(campoBuscaFichas.value.trim());
        const visiveis = organizar(busca === "" ? fichas : fichas.filter((f) => normalizar(f.nome).includes(busca)), "fichas");
        visiveisFichas = visiveis;
        fichasVazia.hidden = visiveis.length > 0;
        fichasVazia.textContent =
            fichas.length > 0 ? (busca !== "" ? `Nenhuma ficha encontrada para "${campoBuscaFichas.value.trim()}".` : "Nenhuma ficha neste filtro.") : "Nenhuma ficha ainda.";
        listaFichas.replaceChildren(
            ...visiveis.map((ficha) => {
                const doc = document.createElement("li");
                doc.className = "bolsa-doc" + (ficha.id === idFichaAberta ? " aberta" : "");
                doc.dataset.id = String(ficha.id);
                doc.title = `${ficha.nome} (versão ${ficha.versao}): clique para selecionar, clique de novo (ou Enter) para abrir e editar (botão direito: mais opções)`;
                doc.tabIndex = 0; // dá para chegar pelo teclado
                doc.setAttribute("role", "button");
                doc.addEventListener("pointerdown", (e) => {
                    pontoDoAperto = { x: e.clientX, y: e.clientY };
                });
                doc.addEventListener("click", (e) => aoClicarItem(ficha.id, e, () => opcoes.aoAbrirFicha(ficha)));
                doc.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        opcoes.aoAbrirFicha(ficha);
                    } else if (e.key === "Delete") {
                        // (o Delete da seleção inteira é tratado no "keydown" da bolsa; aqui só garante que a ficha focada entra nela)
                        if (!selecao.fichas.ids.has(ficha.id)) selecionarSo(selecao.fichas, ficha.id);
                    }
                });
                doc.addEventListener("contextmenu", (e) => {
                    e.preventDefault(); // o menu do jogo no lugar do menu do navegador
                    if (!selecao.fichas.ids.has(ficha.id)) selecionarSo(selecao.fichas, ficha.id);
                    if (selecao.fichas.ids.size > 1) abrirMenuSelecao(e.clientX, e.clientY);
                    else abrirMenuDoc(ficha, e.clientX, e.clientY);
                });
                const folha = document.createElement("span");
                folha.className = "bolsa-doc-folha";
                folha.setAttribute("aria-hidden", "true");
                // O nome vem do usuário: entra por textContent (nunca como HTML). Nomes longos ganham "…" (CSS).
                const nome = document.createElement("span");
                nome.className = "bolsa-doc-nome";
                nome.textContent = ficha.nome;
                const versao = document.createElement("small");
                versao.textContent = `v${ficha.versao}`;
                doc.append(folha, nome, versao, ...marcasDoItem("fichas", ficha));
                doc.title += dicaDosGrupos(ficha);
                return doc;
            }),
        );
        aplicarSelecao();
        reabrirMenuDeGrupos();
        const cheia = fichas.length >= MAX_FICHAS;
        botaoCriarFicha.disabled = aguardandoFicha || cheia;
        botaoCriarFicha.title = cheia ? `Limite de ${MAX_FICHAS} fichas na mesa` : "";
    }

    function criarFicha(): void {
        if (aguardandoFicha || botaoCriarFicha.disabled) return;
        const resultado = opcoes.aoCriarFicha();
        mostrarAvisoFicha("");
        if (resultado === null) {
            mostrarAvisoFicha(`Não foi possível criar: a mesa já tem o máximo de ${MAX_FICHAS} fichas.`, true);
        } else if (resultado === "enviada") {
            aguardandoFicha = true; // online: o botão espera o servidor criar o arquivo (evita cliques repetidos); a ficha abre quando chegar
            abrirFichaAoCriar = !expandida; // (na tela cheia a ficha só é criada, não abre)
        } else {
            atualizarFichas();
            if (!expandida) {
                selecionarSo(selecao.fichas, resultado.id);
                opcoes.aoAbrirFicha(resultado); // modo local: a ficha já existe, abre na hora (só na bolsa do canto)
            }
            return;
        }
        atualizarFichas();
    }

    /** O servidor criou uma ficha (a lista já está no estado). Se era a que esta pessoa pediu, libera o botão. */
    function fichaSalva(ficha?: Ficha): void {
        const euPedi = aguardandoFicha; // (se não esperava nenhuma, a ficha nova é de outra pessoa: só a lista muda)
        aguardandoFicha = false;
        atualizarFichas();
        if (euPedi && ficha && abrirFichaAoCriar) {
            selecionarSo(selecao.fichas, ficha.id);
            opcoes.aoAbrirFicha(ficha); // "Criar ficha" já ABRE a ficha recém-criada
        }
    }

    function fichaRecusada(motivo: string): void {
        if (!aguardandoFicha) return;
        aguardandoFicha = false;
        mostrarAvisoFicha(motivo, true);
        atualizarFichas();
    }

    botaoCriarFicha.addEventListener("click", () => {
        campoBuscaFichas.value = ""; // limpa a pesquisa das fichas: a ficha nova precisa aparecer na lista
        criarFicha();
    });

    botaoFechar.addEventListener("click", fechar);
    botaoGerenciar.addEventListener("click", abrir); // ⤢: a tela cheia (a bolsa do canto não expande mais ao clicar nela)
    /**
     * "+ Criar token" (a bolsa do canto): cria um token GENÉRICO ("Token N", 1×1, cores padrão) já guardado na bolsa e ABRE o "Editar token" nele,
     * para a pessoa dar nome, imagem e cores. (O formulário completo continua na tela cheia, pelo ⤢.)
     */
    function criarTokenGenerico(): void {
        if (aguardandoToken || estado.tokens.length >= MAX_TOKENS) return;
        campoBusca.value = ""; // (o token novo precisa aparecer na lista)
        const resultado = opcoes.aoCriarToken({ nome: "", cor: COR_INICIAL_TOKEN, corBorda: COR_BORDA_INICIAL_TOKEN, tamanho: TAMANHO_INICIAL_TOKEN, imagem: null });
        if (resultado === "enviado") {
            aguardandoToken = true; // online: espera o servidor criar o arquivo; o "Editar token" abre quando o token chegar (tokenCriado)
            abrirEditorAoCriar = true;
        } else if (resultado !== null) {
            atualizar();
            selecionarSo(selecao.tokens, resultado.id);
            opcoes.aoEditar(resultado);
        }
    }
    botaoCriarToken.addEventListener("click", criarTokenGenerico);

    campoBusca.addEventListener("input", atualizar); // filtra os tokens a cada letra
    campoBuscaFichas.addEventListener("input", atualizarFichas); // e esta, só as fichas (cada aba tem a sua pesquisa)
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        // Com texto na pesquisa, o primeiro Esc só LIMPA a pesquisa; o seguinte fecha a tela cheia.
        const limpouPesquisa = (): boolean => {
            const campo = document.activeElement === campoBusca ? campoBusca : document.activeElement === campoBuscaFichas ? campoBuscaFichas : null;
            if (!campo || campo.value === "") return false;
            campo.value = "";
            if (campo === campoBusca) atualizar();
            else atualizarFichas();
            return true;
        };
        if (expandida) {
            if (!limpouPesquisa()) {
                if (selDaAba().ids.size > 0) limparSelecao(); // 1º Esc: tira a seleção; o seguinte fecha a tela cheia
                else fechar();
            }
        } else if (bolsa.contains(document.activeElement)) {
            // (Só com o foco na bolsa: o Esc também serve para outras coisas, como sair de uma ferramenta de desenho.)
            if (!limpouPesquisa() && selDaAba().ids.size > 0) limparSelecao();
        }
    });
    // Clicar na margem escura (que é o "::before" da coluna da direita) também fecha a tela cheia.
    coluna.addEventListener("click", (e) => {
        if (expandida && e.target === coluna) fechar();
    });

    montarPaleta(amostras, (cor) => {
        corEscolhida = cor;
        atualizarEscolha();
    });
    montarPaleta(amostrasBorda, (cor) => {
        corBordaEscolhida = cor;
        atualizarEscolha();
    });
    atualizarEscolha();
    atualizar();
    atualizarFichas();

    return {
        get aba() {
            return aba;
        },
        escolherAba: (nova) => escolherAba(nova),
        atualizar,
        tokenCriado,
        tokenRecusado,
        atualizarFichas,
        atualizarGrupos,
        grupoCriado,
        marcarFichaAberta(id) {
            idFichaAberta = id;
            // (sem refazer a lista: só liga/desliga a classe, para não perder o foco do teclado)
            for (const doc of listaFichas.querySelectorAll<HTMLElement>(".bolsa-doc")) doc.classList.toggle("aberta", doc.dataset.id === String(id));
        },
        fichaSalva,
        fichaRecusada,
        contem(ponto) {
            const r = bolsa.getBoundingClientRect();
            return ponto.x >= r.left && ponto.x <= r.right && ponto.y >= r.top && ponto.y <= r.bottom;
        },
        marcarAlvo(sobre) {
            bolsa.classList.toggle("alvo", sobre);
        },
        mostrarFantasma(token, centro, diametro, borda) {
            // Repintar mexe no CSS (e a imagem é um texto grande): só quando o token ou as cores mudam.
            const chave = `${token.id}|${token.cor}|${token.corBorda}|${token.imagem?.length ?? 0}`;
            if (chave !== fantasmaPintado) {
                pintarDisco(fantasma, token.cor, token.corBorda, token.imagem);
                fantasmaPintado = chave;
            }
            fantasma.style.width = `${diametro}px`;
            fantasma.style.height = `${diametro}px`;
            fantasma.style.borderWidth = `${Math.max(1.5, borda)}px`;
            fantasma.style.left = `${centro.x}px`;
            fantasma.style.top = `${centro.y}px`;
            fantasma.hidden = false;
        },
        esconderFantasma() {
            if (!fantasma.hidden) fantasma.hidden = true;
        },
        get expandida() {
            return expandida;
        },
        abrir,
        fechar,
    };
}
