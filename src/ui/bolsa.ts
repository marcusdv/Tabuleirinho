// =====================================================================
// BOLSA (HTML): um painel no canto inferior direito onde se GUARDAM tokens.
//   - Arrastar um token do tabuleiro até aqui e soltar o guarda (ele some do mapa).
//   - Arrastar uma fichinha daqui para o mapa coloca o token na casa onde soltar.
//   - O botão "⤢ Criar/editar" EXPANDE a bolsa: ela cobre quase a tela toda (sobra só uma margem) e mostra a
//     área "Criar token", onde se escolhe nome, imagem (opcional), tamanho, cor de PREENCHIMENTO e cor
//     da BORDA e se cria um token novo. Fechar: botão "Fechar", Esc ou clique na margem.
//   - A imagem fica por cima do preenchimento (as partes transparentes herdam a cor de preenchimento).
//     O CLIQUE DIREITO numa ficha abre um menu: "Editar token…" (nome, tamanho, cores, imagem) e
//     "Alterar imagem…". (Remover a imagem fica dentro da janela "Editar token".)
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
    CHAVE_ALTURA_BOLSA,
    CHAVE_BOLSA_RECOLHIDA,
} from "../config";
import { estado, type Ficha, type Token } from "../estado";
import { corCss, escolherArquivo, marcarEscolhida, montarPaleta, pintarDisco } from "./aparenciaToken";
import { alternarRecolhida } from "./animarPainel";
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
    /** Refaz a lista da aba Fichas conforme `estado.fichas`. */
    atualizarFichas(): void;
    /** Qual ficha está aberta na janela de edição (null = nenhuma): o nome dela ganha outra cor na lista. */
    marcarFichaAberta(id: number | null): void;
    /** O servidor criou uma ficha: libera o botão "Criar ficha" (a lista é refeita a partir de `estado.fichas`). */
    fichaSalva(): void;
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
    const canto = pegar("canto-inferior-direito"); // a coluna fixa que guarda a bolsa (e o painel da calibragem)
    const itens = pegar("bolsa-itens");
    const vazia = pegar("bolsa-vazia");
    const botaoGerenciar = pegar<HTMLButtonElement>("bolsa-gerenciar"); // o ⤢ do alto: abre a tela cheia
    const botaoAlternar = pegar<HTMLButtonElement>("bolsa-alternar"); // o ▴/▾ do alto: minimiza/expande a bolsa
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
    const botoesAba = Array.from(listaAbas.querySelectorAll<HTMLButtonElement>(".bolsa-aba")); // na ordem da tela: Tokens, Fichas

    // Os DOIS tamanhos: a bolsa do CANTO (o padrão: com pesquisa; o mapa continua acessível, então dá para arrastar tokens para ele) e
    // a EXPANDIDA (tela cheia, para criar e editar tokens). `expandida` = tela cheia.
    let expandida = false;
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
        const visiveis = busca === "" ? guardados : guardados.filter((t) => normalizar(`${t.nome} ${t.size}x${t.size}`).includes(busca));
        vazia.hidden = visiveis.length > 0;
        vazia.textContent =
            guardados.length > 0
                ? `Nenhum token encontrado para "${campoBusca.value.trim()}".`
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
                ficha.title = expandida
                    ? `${token.nome} (${token.size}×${token.size}): clique com o botão direito para editar`
                    : `${token.nome} (${token.size}×${token.size}): arraste para o mapa (botão direito: editar)`;
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
                ficha.append(disco, nome, tamanho);

                ficha.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0 || expandida) return; // só o botão esquerdo, e não na tela cheia (a média arrasta para o mapa)
                    e.preventDefault(); // sem selecionar texto nem arrastar a "imagem" do botão
                    if (opcoes.aoComecarArrasto(token.id, { x: e.clientX, y: e.clientY })) acompanhar();
                });
                // Botão direito: menu para alterar/remover a imagem (em vez do menu do navegador).
                ficha.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    abrirMenuFicha(token, e.clientX, e.clientY);
                });
                return ficha;
            }),
        );
    }

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
        menuDoc.hidden = true; // (os dois menus fecham juntos)
        tokenDoMenu = null;
        fichaDoMenu = null;
    }

    function abrirMenuFicha(token: Token, x: number, y: number): void {
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
            const aberto = !menuFicha.hidden || !menuDoc.hidden;
            if (aberto && !menuFicha.contains(e.target as Node) && !menuDoc.contains(e.target as Node)) fecharMenuFicha();
        },
        true,
    );
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape" && (!menuFicha.hidden || !menuDoc.hidden)) {
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
        aposCriarToken(token);
    }

    function tokenRecusado(motivo: string): void {
        if (!aguardandoToken) return;
        aguardandoToken = false;
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
        opcoes.aoAbrir();
        bolsa.classList.add("expandida");
        canto.classList.add("bolsa-aberta");
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
        bolsa.classList.remove("expandida");
        canto.classList.remove("bolsa-aberta");
        botaoFechar.hidden = true;
        campoBusca.value = ""; // as pesquisas são limpas ao voltar ao canto
        campoBuscaFichas.value = "";
        atualizar();
        atualizarFichas();
        medirVaga();
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
        const visiveis = busca === "" ? fichas : fichas.filter((f) => normalizar(f.nome).includes(busca));
        fichasVazia.hidden = visiveis.length > 0;
        fichasVazia.textContent = fichas.length > 0 ? `Nenhuma ficha encontrada para "${campoBuscaFichas.value.trim()}".` : "Nenhuma ficha ainda.";
        listaFichas.replaceChildren(
            ...visiveis.map((ficha) => {
                const doc = document.createElement("li");
                doc.className = "bolsa-doc" + (ficha.id === idFichaAberta ? " aberta" : "");
                doc.dataset.id = String(ficha.id);
                doc.title = `${ficha.nome} (versão ${ficha.versao}): clique para abrir e editar (botão direito: mais opções)`;
                doc.tabIndex = 0; // dá para chegar pelo teclado
                doc.setAttribute("role", "button");
                doc.addEventListener("click", () => opcoes.aoAbrirFicha(ficha));
                doc.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        opcoes.aoAbrirFicha(ficha);
                    } else if (e.key === "Delete") {
                        e.preventDefault();
                        opcoes.aoExcluirFicha(ficha); // (pede a confirmação)
                    }
                });
                doc.addEventListener("contextmenu", (e) => {
                    e.preventDefault(); // o menu do jogo no lugar do menu do navegador
                    abrirMenuDoc(ficha, e.clientX, e.clientY);
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
                doc.append(folha, nome, versao);
                return doc;
            }),
        );
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
            aguardandoFicha = true; // online: o botão espera o servidor criar o arquivo (evita cliques repetidos)
        }
        atualizarFichas();
    }

    /** O servidor criou uma ficha (a lista já está no estado). Se era a que esta pessoa pediu, libera o botão. */
    function fichaSalva(): void {
        aguardandoFicha = false;
        atualizarFichas();
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
    botaoCriarToken.addEventListener("click", abrir); // "+ Criar token": a criação de tokens fica na tela cheia

    // --- Minimizar (só na bolsa do canto): sobra o título e os dois ícones. O botão ▴/▾ e o clique no NOME alternam; a escolha é lembrada. ---
    function mostrarRecolhida(recolhida: boolean): void {
        bolsa.classList.toggle("recolhida", recolhida);
        botaoAlternar.textContent = recolhida ? "▾" : "▴"; // ▾ = expandir, ▴ = recolher (como nos outros painéis)
        botaoAlternar.title = recolhida ? "Expandir a bolsa" : "Recolher a bolsa";
        botaoAlternar.setAttribute("aria-expanded", String(!recolhida));
    }
    function alternarBolsa(): void {
        // (com animação: a altura cresce/encolhe com o TOPO parado, de cima para baixo; a "vaga" invisível da bolsa tem a altura dela aberta)
        const recolhida = alternarRecolhida(bolsa, "recolhida", mostrarRecolhida);
        guardarPreferencia(CHAVE_BOLSA_RECOLHIDA, recolhida ? "1" : "0");
    }
    botaoAlternar.addEventListener("click", alternarBolsa);
    // DUPLO clique na área de cima da bolsa (a linha do nome "Bolsa" e o espaço vazio do cabeçalho, não só nas letras). Não vale nas abas, na
    // pesquisa nem nos botões: eles têm o seu próprio clique.
    const cabecalhoBolsa = bolsa.querySelector<HTMLElement>(".bolsa-topo")!;
    const nomeBolsa = bolsa.querySelector<HTMLElement>(".bolsa-titulo")!;
    nomeBolsa.title = "Duplo clique para recolher ou expandir (arraste para mover)";
    cabecalhoBolsa.addEventListener("dblclick", (e) => {
        const alvo = e.target as HTMLElement;
        const naAreaDoNome = alvo === cabecalhoBolsa || alvo.closest(".bolsa-titulo") !== null;
        if (naAreaDoNome && !expandida) alternarBolsa(); // (em tela cheia o cabeçalho não recolhe)
    });

    // A "vaga" da bolsa: uma caixa invisível, ancorada no canto inferior direito, com a altura da bolsa ABERTA. A bolsa fica no TOPO dela:
    // aberta, enche a vaga e chega ao canto; minimizada, sobra só o cabeçalho, e ao expandir ela cresce para BAIXO (como as outras caixas).
    // Mede a altura aberta (a bolsa do canto tem altura fixa nas duas abas) sem pintar nada no meio.
    const vaga = pegar("bolsa-vaga");
    function medirVaga(): void {
        if (expandida) return; // (a tela cheia tem outro tamanho)
        const estava = bolsa.classList.contains("recolhida");
        bolsa.classList.remove("recolhida");
        const altura = bolsa.getBoundingClientRect().height;
        vaga.style.setProperty("--altura-bolsa", `${altura}px`);
        guardarPreferencia(CHAVE_ALTURA_BOLSA, String(altura)); // (o index.html a usa na próxima vez, antes da primeira pintura: a bolsa não se mexe ao carregar)
        if (estava) bolsa.classList.add("recolhida");
    }
    mostrarRecolhida(lerPreferencia(CHAVE_BOLSA_RECOLHIDA) === "1"); // (como a pessoa deixou da última vez)
    medirVaga();
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
            if (!limpouPesquisa()) fechar();
        } else if (bolsa.contains(document.activeElement)) {
            // (Só com o foco na bolsa: o Esc também serve para outras coisas, como sair de uma ferramenta de desenho.)
            limpouPesquisa();
        }
    });
    // Clicar na margem escura (que é o "::before" da coluna do canto) também fecha a tela cheia.
    canto.addEventListener("click", (e) => {
        if (expandida && e.target === canto) fechar();
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
