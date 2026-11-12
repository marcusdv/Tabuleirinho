// =====================================================================
// BOLSA (HTML): um painel no canto inferior direito onde se GUARDAM tokens.
//   - Arrastar um token do tabuleiro até aqui e soltar o guarda (ele some do mapa).
//   - Arrastar uma fichinha daqui para o mapa coloca o token na casa onde soltar.
//   - CLICAR na bolsa a EXPANDE: ela cobre quase a tela toda (sobra só uma margem) e mostra a
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
import { COR_BORDA_INICIAL_TOKEN, COR_INICIAL_TOKEN, MAX_CARACTERES_NOME_TOKEN, MAX_TOKENS, TAMANHO_INICIAL_TOKEN } from "../config";
import { estado, type Token } from "../estado";
import { corCss, escolherArquivo, marcarEscolhida, montarPaleta, pintarDisco } from "./aparenciaToken";

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
     * imagem recortada (ou null). Devolve o token criado, ou null se não coube.
     */
    aoCriarToken(dados: DadosNovoToken): Token | null;
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
}

export interface Bolsa {
    /** Refaz a lista de fichinhas conforme os tokens guardados no estado. */
    atualizar(): void;
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
    /** true enquanto a bolsa está no tamanho MÉDIO (meio termo, com pesquisa). */
    readonly media: boolean;
    /** Abre o tamanho médio. */
    abrirMedia(): void;
    /** Volta do tamanho médio para o pequeno. */
    fecharMedia(): void;
    /** Expande a bolsa. */
    abrir(): void;
    /** Volta a bolsa ao canto, pequena. */
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
    const contagem = pegar("bolsa-contagem");
    const botaoMaximizar = pegar<HTMLButtonElement>("bolsa-maximizar"); // o quadradinho colado em cima da caixa
    const botaoGerenciar = pegar<HTMLButtonElement>("bolsa-gerenciar"); // (só na média) abre a tela cheia
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
    const campoBusca = pegar<HTMLInputElement>("bolsa-busca");
    const fantasma = pegar("token-fantasma");
    let fantasmaPintado = ""; // o que a cópia mostra agora (para repintar só quando o token muda)
    const menuFicha = pegar("menu-ficha");
    const menuEditar = pegar<HTMLButtonElement>("menu-ficha-editar");
    const menuAlterar = pegar<HTMLButtonElement>("menu-ficha-alterar");

    // Os TRÊS tamanhos: pequena (padrão, no canto), MÉDIA (um pouco maior, com pesquisa; dá para arrastar tokens para o
    // mapa) e EXPANDIDA (tela cheia: criar e editar tokens). `expandida` = tela cheia; `media` = o meio termo.
    let expandida = false;
    let media = false;
    let voltarParaMedia = false; // a tela cheia foi aberta a partir da média: ao fechar, volta para ela
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
        // A pesquisa (só na bolsa aberta) filtra pelo nome e pelo tamanho; vazia, mostra todos.
        const busca = expandida || media ? normalizar(campoBusca.value.trim()) : "";
        bolsa.classList.toggle("buscando", busca !== ""); // pesquisando, a prévia grande some e os resultados sobem
        const visiveis = busca === "" ? guardados : guardados.filter((t) => normalizar(`${t.nome} ${t.size}x${t.size}`).includes(busca));
        contagem.textContent = guardados.length === 0 ? "" : visiveis.length === guardados.length ? `(${guardados.length})` : `(${visiveis.length} de ${guardados.length})`;
        vazia.hidden = visiveis.length > 0;
        vazia.textContent =
            guardados.length > 0
                ? `Nenhum token encontrado para "${campoBusca.value.trim()}".`
                : expandida
                  ? "Nenhum token guardado ainda. Crie um ao lado."
                  : "Arraste tokens para cá para guardá-los.";
        botaoCriar.disabled = estado.tokens.length >= MAX_TOKENS;
        botaoCriar.title = botaoCriar.disabled ? `Limite de ${MAX_TOKENS} tokens na mesa` : "";

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
        tokenDoMenu = null;
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
            if (!menuFicha.hidden && !menuFicha.contains(e.target as Node)) fecharMenuFicha();
        },
        true,
    );
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape" && !menuFicha.hidden) {
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
    function criar(): void {
        const token = opcoes.aoCriarToken({
            nome: campoNome.value,
            cor: corEscolhida,
            corBorda: corBordaEscolhida,
            tamanho: tamanhoEscolhido,
            imagem: imagemEscolhida,
        });
        aviso.textContent = token
            ? `"${token.nome}" (${token.size}×${token.size}) criado e guardado na bolsa.`
            : `Não foi possível criar: a mesa tem o limite de ${MAX_TOKENS} tokens.`;
        if (token) {
            campoNome.value = ""; // o próximo começa sem nome (e ganha "Token N" se ficar assim)
            campoBusca.value = ""; // limpa a pesquisa: o token novo precisa aparecer na lista
            imagemEscolhida = null; // e sem imagem
            atualizarEscolha();
        }
        atualizar();
    }
    botaoCriar.addEventListener("click", criar);
    campoNome.addEventListener("keydown", (e) => {
        if (e.key === "Enter") criar(); // Enter no campo de nome cria o token
    });

    // ---------------------------------------------------------------
    // Abrir e fechar
    // ---------------------------------------------------------------

    /** Abre a TELA CHEIA (criar e editar tokens). Se estava no tamanho médio, ao fechar volta para ele. */
    function abrir(): void {
        if (expandida) return;
        voltarParaMedia = media;
        if (media) {
            media = false;
            bolsa.classList.remove("media");
            botaoMaximizar.setAttribute("aria-pressed", "false");
        }
        expandida = true;
        opcoes.aoAbrir();
        bolsa.classList.add("expandida");
        canto.classList.add("bolsa-aberta");
        botaoFechar.hidden = false;
        campoBusca.value = "";
        aviso.textContent = "";
        atualizar(); // os textos mudam com a bolsa aberta
        botaoFechar.focus();
    }

    function fechar(): void {
        if (!expandida) return;
        expandida = false;
        bolsa.classList.remove("expandida");
        canto.classList.remove("bolsa-aberta");
        botaoFechar.hidden = true;
        campoBusca.value = ""; // a bolsa pequena sempre mostra todos
        if (voltarParaMedia) {
            voltarParaMedia = false;
            abrirMedia(); // volta ao meio termo de onde veio
            return;
        }
        atualizar();
        botaoMaximizar.focus();
    }

    /** Abre o tamanho MÉDIO: um pouco maior, com pesquisa; o mapa continua acessível (dá para arrastar tokens). */
    function abrirMedia(): void {
        if (media || expandida) return;
        media = true;
        bolsa.classList.add("media");
        botaoMaximizar.setAttribute("aria-pressed", "true");
        botaoMaximizar.title = "Restaurar a bolsa (tamanho pequeno)";
        botaoMaximizar.setAttribute("aria-label", "Restaurar a bolsa");
        atualizar();
        campoBusca.focus();
    }

    /** Volta do tamanho médio para o pequeno. */
    function fecharMedia(): void {
        if (!media) return;
        media = false;
        bolsa.classList.remove("media");
        botaoMaximizar.setAttribute("aria-pressed", "false");
        botaoMaximizar.title = "Maximizar a bolsa (maior, com pesquisa)";
        botaoMaximizar.setAttribute("aria-label", "Maximizar a bolsa");
        campoBusca.value = "";
        atualizar();
        botaoMaximizar.focus();
    }

    botaoFechar.addEventListener("click", fechar);
    botaoMaximizar.addEventListener("click", () => (media ? fecharMedia() : abrirMedia())); // o quadradinho: pequena <-> média
    botaoGerenciar.addEventListener("click", abrir); // (na média) tela cheia; clicar na bolsa pequena também abre a tela cheia
    campoBusca.addEventListener("input", atualizar); // filtra a cada letra
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        // Com texto na pesquisa, o primeiro Esc só LIMPA a pesquisa; o seguinte fecha (a tela cheia) ou volta ao pequeno (a média).
        const limpouPesquisa = (): boolean => {
            if (document.activeElement !== campoBusca || campoBusca.value === "") return false;
            campoBusca.value = "";
            atualizar();
            return true;
        };
        if (expandida) {
            if (!limpouPesquisa()) fechar();
        } else if (media && bolsa.contains(document.activeElement)) {
            // (Só com o foco na bolsa: o Esc também serve para outras coisas, como sair de uma ferramenta de desenho.)
            if (!limpouPesquisa()) fecharMedia();
        }
    });
    // Clicar na margem escura (que é o "::before" da coluna do canto) também fecha.
    canto.addEventListener("click", (e) => {
        if (expandida && e.target === canto) fechar();
    });

    // Clicar em qualquer lugar da bolsa FECHADA a expande, exceto numa fichinha (que é arrastada).
    // Dois cuidados:
    //  1) Soltar uma fichinha em cima da bolsa também gera um "click" nela (o navegador o dispara no
    //     elemento comum a onde o mouse foi apertado e onde foi solto). Por isso só abrimos se o APERTO
    //     também começou numa área vazia da bolsa.
    //  2) Botões e campos NÃO contam como "área vazia": senão o clique no botão "Fechar" fechava a
    //     bolsa e, ao subir até aqui, a abria de novo (o botão parecia não funcionar).
    let apertouAreaVazia = false;
    document.addEventListener(
        "pointerdown",
        () => {
            apertouAreaVazia = false; // qualquer aperto novo zera (captura: roda antes dos outros)
        },
        true,
    );
    bolsa.addEventListener("pointerdown", (e) => {
        apertouAreaVazia = e.button === 0 && !(e.target as HTMLElement).closest(".ficha, button, input, label");
    });
    bolsa.addEventListener("click", () => {
        if (!expandida && !media && apertouAreaVazia) abrir(); // na média, clicar em área vazia NÃO abre a tela cheia
        apertouAreaVazia = false;
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

    return {
        atualizar,
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
        get media() {
            return media;
        },
        abrirMedia,
        fecharMedia,
        abrir,
        fechar,
    };
}
