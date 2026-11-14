// =====================================================================
// EDITOR DE FICHA (HTML): a janela onde se ABRE uma ficha (um clique no documento da grade da aba Fichas) para mudar o NOME e o TEXTO (de cada ABA/página; ver o item das abas abaixo).
//
//   - É uma janela FLUTUANTE e ARRASTÁVEL (por qualquer parte neutra: o título, o fundo, os rótulos...), e NÃO escurece o fundo nem bloqueia o resto da tela: dá para ver e usar o
//     chat, os dados e o tabuleiro com a ficha aberta (ver as rolagens). Por isso as teclas Esc e Ctrl+S só valem com o foco DENTRO da janela
//     (com o foco no chat, o Esc é do chat). As preferências de OCULTAR as instruções e a tela de rolagens valem para TODAS as fichas (há uma só janela e a
//     escolha fica guardada no navegador). A posição fica guardada enquanto a página estiver aberta: ao reabrir, volta ao mesmo lugar.
//   - "Salvar" (ou Ctrl+S) grava por cima do arquivo e sobe a VERSÃO. O botão só vale quando algo mudou.
//   - Fechar (botão ou Esc) com alterações não salvas pergunta antes, na caixa de confirmar do jogo.
//   - CONFLITO: se outra pessoa salvou a ficha depois de você abri-la, o servidor recusa o seu salvamento (para não apagar o trabalho
//     dela). Aparece um aviso com a versão nova e um botão para carregá-la; o que você escreveu fica na tela até você decidir, e dá para
//     copiá-lo antes. Se você não tinha mudado nada, a tela se atualiza sozinha.
//   - EXCLUÍDA: se outra pessoa excluiu a ficha com ela aberta, a janela fecha sozinha (sem alterações) ou avisa e guarda o que você
//     escreveu para você copiar (com alterações).
//   - TEXTO COLORIDO: o campo tem por cima uma camada que mostra o mesmo texto com cores (variáveis, NOME da rolagem entre parênteses e
//     fórmula entre colchetes) e sublinhado vermelho onde há erro. O NOME da rolagem é a "palavra" com função: ao passar o mouse mostra a
//     fórmula já calculada, e ao clicar destaca a rolagem na lista lateral.
//   - TAMANHO: os botões A− e A+ do alto mudam a letra do texto (10 a 28 px, padrão 15) e a alça do canto inferior direito muda o tamanho da janela
//     (mínimo 520 × 360); as duas escolhas ficam no navegador (localStorage) e valem para todas as fichas.
//   - ROLAR: clicar no NOME de uma rolagem (no texto) ou no item dela na lista rola: o servidor sorteia e o resultado aparece no chat, com o
//     nome da rolagem. Rola a ficha SALVA (com mudanças não salvas, a janela pede para salvar antes, senão rolaria algo diferente do que se vê).
//   - BOTÕES NO ALTO: "Ocultar instruções" e "Ocultar rolagens" escondem (ou mostram de novo) as duas partes do painel lateral, e o ✕ fecha a
//     ficha (igual ao Esc: com alterações não salvas pergunta antes). Sem nenhuma das duas partes, o painel some e o texto ocupa a largura
//     toda. A escolha fica guardada no navegador (localStorage) para as próximas vezes.
//   - ABAS (PÁGINAS): uma ficha tem de 1 a 6 abas, todas no MESMO arquivo. Uma linha de abas fica embaixo do nome: clicar abre a página, o "+" cria
//     uma nova, o DUPLO clique renomeia e o CLIQUE DIREITO abre o menu "Renomear página / Excluir página". Cada aba tem o seu texto e as suas ROLAGENS, mas as VARIÁVEIS valem para a ficha inteira (as
//     das outras abas aparecem esmaecidas na lista). O limite de caracteres é a SOMA de todas as abas. As abas são parte do rascunho: só valem ao Salvar.
//   - PAINEL LATERAL: em cima, a tela de rolagens (lê o texto enquanto você escreve, com formulas.ts): as VARIÁVEIS ("FOR:: 16" -> FOR = 16) e
//     as ROLAGENS ("(Ataque)[1d20 + FOR]" -> nome e fórmula já com os valores), com os erros. Embaixo, as dicas de uso, sempre à vista.
//
// Este módulo só cuida da janela: salvar de verdade é com quem o criou (`aoSalvar`: no modo local grava na memória; online manda o
// pedido ao servidor e a resposta volta por `fichaMudou`, `conflito` e `recusada`). A marcação e o CSS ficam no index.html
// (ids "editor-ficha-*").
// =====================================================================

import { MAX_ABAS_FICHA, MAX_CARACTERES_NOME_ABA_FICHA, MAX_CARACTERES_NOME_FICHA, MAX_CARACTERES_TEXTO_FICHA } from "../config";
import { limitar } from "../coordenadas";
import {
    abasIguais,
    nomePadraoDaAba,
    normalizarAbas,
    normalizarNomeAba,
    normalizarNomeFicha,
    tamanhoDoTextoDasAbas,
    type AbaFicha,
    type Ficha,
    type MudancasFicha,
    type ResultadoEdicaoFicha,
} from "../estado";
import { analisarAbas, trechosDoTexto, type AnaliseDaFicha } from "../formulas";
import { formatarTexto } from "../formatacao";

export interface OpcoesEditorFicha {
    /**
     * Salvar. `versao` é a que a janela tem agora (a do servidor, quando a pessoa abriu ou salvou pela última vez). Modo local: devolve
     * o resultado na hora. Online: o pedido vai ao servidor e devolve "enviada"; a resposta chega depois (`fichaMudou`, `conflito`,
     * `recusada`).
     */
    aoSalvar(id: number, versao: number, mudancas: Required<MudancasFicha>): ResultadoEdicaoFicha | "enviada";
    /** A pessoa quer excluir uma aba que tem texto: pergunta se pode. Devolve true se sim. */
    confirmarExcluirAba(nome: string): Promise<boolean>;
    /** Há alterações não salvas e a pessoa quer fechar: pergunta se pode descartá-las. Devolve true se sim. */
    confirmarDescarte(): Promise<boolean>;
    /**
     * A pessoa clicou numa ROLAGEM (o nome no texto, ou o item da lista): rolar a rolagem de posição `indice` da ABA `aba` da ficha `id`, na versão
     * `versao` (a SALVA: o servidor é quem sabe o texto e sorteia). Devolve uma mensagem de erro para mostrar na janela, ou null se deu certo (o
     * resultado aparece no chat; online, um erro do servidor volta depois por `recusada`).
     */
    aoRolar(id: number, versao: number, aba: number, indice: number): string | null;
    /** A ficha aberta mudou: `id` da que abriu (ou trocou), ou null quando a janela fechou. A bolsa usa isto para destacar o nome dela. */
    aoMudarAberta(id: number | null): void;
}

export interface EditorFicha {
    /** Abre a janela com esta ficha. */
    abrir(ficha: Ficha): void;
    /** O id da ficha que está aberta (null = nenhuma). */
    readonly idAberto: number | null;
    /** Uma ficha mudou (salva por esta pessoa, por outra, ou a mesa foi recarregada): se é a que está aberta, a janela acompanha. */
    fichaMudou(ficha: Ficha): void;
    /** O servidor recusou o salvamento por conflito: esta é a versão ATUAL da ficha. */
    conflito(ficha: Ficha): void;
    /** A ficha foi EXCLUÍDA (por esta pessoa ou por outra): se é a que está aberta, a janela fecha ou avisa. */
    fichaExcluida(id: number): void;
    /** O servidor recusou por outro motivo (ou a conexão caiu): mostra o motivo e libera o botão Salvar. */
    recusada(motivo: string): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarEditorFicha(opcoes: OpcoesEditorFicha): EditorFicha {
    const janela = pegar("editor-ficha");
    const painel = pegar("editor-ficha-painel");
    const campoNome = pegar<HTMLInputElement>("editor-ficha-nome");
    const campoTexto = pegar<HTMLTextAreaElement>("editor-ficha-texto");
    const rotuloVersao = pegar("editor-ficha-versao");
    const contagem = pegar("editor-ficha-contagem");
    const aviso = pegar("editor-ficha-aviso");
    const caixaConflito = pegar("editor-ficha-conflito");
    const textoConflito = pegar("editor-ficha-conflito-texto");
    const botaoRecarregar = pegar<HTMLButtonElement>("editor-ficha-recarregar");
    const botaoFechar = pegar<HTMLButtonElement>("editor-ficha-fechar");
    const botaoSalvar = pegar<HTMLButtonElement>("editor-ficha-salvar");
    const listaVariaveis = pegar("editor-ficha-variaveis");
    const listaRolagens = pegar("editor-ficha-rolagens");
    const semVariaveis = pegar("editor-ficha-sem-variaveis");
    const semRolagens = pegar("editor-ficha-sem-rolagens");
    const lateral = pegar("editor-ficha-lateral");
    const assistente = pegar("editor-ficha-assistente");
    const dicas = pegar("editor-ficha-dicas");
    const botaoAlternarDicas = pegar<HTMLButtonElement>("editor-ficha-alternar-dicas");
    const botaoAlternarRolagens = pegar<HTMLButtonElement>("editor-ficha-alternar-rolagens");
    const botaoX = pegar<HTMLButtonElement>("editor-ficha-x");
    const botaoFonteMenos = pegar<HTMLButtonElement>("editor-ficha-fonte-menos");
    const botaoFonteMais = pegar<HTMLButtonElement>("editor-ficha-fonte-mais");
    const alcaRedimensionar = pegar("editor-ficha-redimensionar");
    const camadaCores = pegar("editor-ficha-cores");
    const listaAbas = pegar("editor-ficha-abas-lista");
    const botaoNovaAba = pegar<HTMLButtonElement>("editor-ficha-aba-nova");
    const menuAba = pegar("menu-aba");
    const menuAbaRenomear = pegar<HTMLButtonElement>("menu-aba-renomear");
    const menuAbaExcluir = pegar<HTMLButtonElement>("menu-aba-excluir");
    const barraFormatar = pegar("editor-ficha-formatar");
    const botaoVer = pegar<HTMLButtonElement>("editor-ficha-ver");
    const previa = pegar("editor-ficha-previa");

    campoNome.maxLength = MAX_CARACTERES_NOME_FICHA; // o navegador corta ao digitar/colar (a regra também vale no servidor)
    campoTexto.maxLength = MAX_CARACTERES_TEXTO_FICHA;

    let base: Ficha | null = null; // a ficha como o servidor a tem (a última que esta janela conhece): nome, abas e VERSÃO
    let rascunho: AbaFicha[] = []; // as abas como estão na janela agora (com o que a pessoa escreveu e renomeou, ainda não salvo)
    let abaAtual = 0; // qual aba está aberta no campo de texto
    let salvando = false; // online: o pedido foi ao servidor e a resposta ainda não chegou
    let enviado: Required<MudancasFicha> | null = null; // o que foi mandado no salvamento em andamento
    let maisNova: Ficha | null = null; // uma versão mais nova que a minha (alguém salvou): enquanto existir, salvar fica bloqueado
    let excluida = false; // alguém excluiu a ficha com ela aberta: não dá mais para salvar
    let ultimaAnalise: AnaliseDaFicha | null = null; // o que o texto define agora (variáveis e rolagens): as rolagens clicáveis vêm daqui
    let aguardandoRolagem = false; // um pedido de rolagem acabou de ir ao servidor: um erro que ele devolva é desta rolagem
    let lugar: { x: number; y: number } | null = null; // onde a janela está (canto superior esquerdo, em pixels da tela); null = ainda não foi aberta

    // --- Mostrar/ocultar as instruções (dicas) e a tela de rolagens: a escolha fica guardada no navegador ---

    const CHAVE_OCULTAR_DICAS = "tabuleirinho.ficha.ocultarInstrucoes";
    const CHAVE_OCULTAR_ROLAGENS = "tabuleirinho.ficha.ocultarRolagens";
    function lerPreferencia(chave: string): boolean {
        try {
            return localStorage.getItem(chave) === "1";
        } catch {
            return false; // (sem armazenamento, ex.: janela privada: vale só enquanto a página estiver aberta)
        }
    }
    function guardarPreferencia(chave: string, valor: boolean): void {
        try {
            localStorage.setItem(chave, valor ? "1" : "0");
        } catch {
            /* sem armazenamento: tudo bem */
        }
    }
    let ocultarDicas = lerPreferencia(CHAVE_OCULTAR_DICAS);
    let ocultarRolagens = lerPreferencia(CHAVE_OCULTAR_ROLAGENS);

    /** Aplica o que está escolhido: esconde as partes, ajusta o painel (que some se não sobra nenhuma) e o texto dos botões. */
    function aplicarPartesVisiveis(): void {
        dicas.hidden = ocultarDicas;
        assistente.hidden = ocultarRolagens;
        lateral.classList.toggle("sem-dicas", ocultarDicas);
        lateral.classList.toggle("sem-tela-rolagens", ocultarRolagens);
        lateral.hidden = ocultarDicas && ocultarRolagens; // sem nenhuma parte, o texto ocupa a largura toda
        botaoAlternarDicas.textContent = ocultarDicas ? "Mostrar instruções" : "Ocultar instruções";
        botaoAlternarDicas.setAttribute("aria-expanded", String(!ocultarDicas));
        botaoAlternarRolagens.textContent = ocultarRolagens ? "Mostrar rolagens" : "Ocultar rolagens";
        botaoAlternarRolagens.setAttribute("aria-expanded", String(!ocultarRolagens));
    }
    botaoAlternarDicas.addEventListener("click", () => {
        ocultarDicas = !ocultarDicas;
        guardarPreferencia(CHAVE_OCULTAR_DICAS, ocultarDicas);
        aplicarPartesVisiveis();
    });
    botaoAlternarRolagens.addEventListener("click", () => {
        ocultarRolagens = !ocultarRolagens;
        guardarPreferencia(CHAVE_OCULTAR_ROLAGENS, ocultarRolagens);
        aplicarPartesVisiveis();
    });
    aplicarPartesVisiveis();

    // --- Tamanho da LETRA (botões A− e A+) e da JANELA (alça do canto): as duas escolhas ficam guardadas no navegador, valem para todas as fichas ---

    const CHAVE_FONTE = "tabuleirinho.ficha.fonte";
    const CHAVE_TAMANHO = "tabuleirinho.ficha.tamanho"; // "largura,altura" em pixels
    const FONTE_PADRAO = 15; // px (era 13: as fichas passaram a abrir com letra e janela um pouco maiores)
    const FONTE_MIN = 10;
    const FONTE_MAX = 28;
    const LARGURA_MIN_JANELA = 520; // (o mesmo do min-width do CSS)
    const ALTURA_MIN_JANELA = 360;

    function lerTexto(chave: string): string | null {
        try {
            return localStorage.getItem(chave);
        } catch {
            return null; // sem armazenamento: vale só enquanto a página estiver aberta
        }
    }
    function guardarTexto(chave: string, valor: string): void {
        try {
            localStorage.setItem(chave, valor);
        } catch {
            /* sem armazenamento: tudo bem */
        }
    }

    const fonteGuardada = Number(lerTexto(CHAVE_FONTE));
    let fonte = Number.isInteger(fonteGuardada) && fonteGuardada >= FONTE_MIN && fonteGuardada <= FONTE_MAX ? fonteGuardada : FONTE_PADRAO;

    /** Aplica a letra: a variável CSS vale para o campo E para a camada de cores (têm de ter SEMPRE a mesma fonte, senão desalinham). */
    function aplicarFonte(): void {
        painel.style.setProperty("--fonte-ficha", `${fonte}px`);
        botaoFonteMenos.disabled = fonte <= FONTE_MIN;
        botaoFonteMais.disabled = fonte >= FONTE_MAX;
        camadaCores.scrollTop = campoTexto.scrollTop; // (a letra mudou o tamanho do texto: as duas camadas continuam alinhadas)
    }
    function mudarFonte(passo: number): void {
        fonte = limitar(fonte + passo, FONTE_MIN, FONTE_MAX);
        guardarTexto(CHAVE_FONTE, String(fonte));
        aplicarFonte();
    }
    botaoFonteMenos.addEventListener("click", () => mudarFonte(-1));
    botaoFonteMais.addEventListener("click", () => mudarFonte(1));
    aplicarFonte();

    /** Dá à janela este tamanho, sem deixar ficar menor que o mínimo nem passar da borda da tela (a partir de onde ela está). */
    function dimensionar(largura: number, altura: number): void {
        const maxLargura = Math.max(LARGURA_MIN_JANELA, window.innerWidth - Math.max(painel.offsetLeft, 0) - 8);
        const maxAltura = Math.max(ALTURA_MIN_JANELA, window.innerHeight - Math.max(painel.offsetTop, 0) - 8);
        painel.style.width = `${limitar(largura, LARGURA_MIN_JANELA, maxLargura)}px`;
        painel.style.height = `${limitar(altura, ALTURA_MIN_JANELA, maxAltura)}px`;
    }
    function aplicarTamanhoGuardado(): void {
        const partes = (lerTexto(CHAVE_TAMANHO) ?? "").split(",").map(Number);
        if (partes.length === 2 && partes.every((n) => Number.isFinite(n) && n > 0)) dimensionar(partes[0], partes[1]);
    }

    let redimensionando: { x: number; y: number; largura: number; altura: number } | null = null;
    alcaRedimensionar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); // (o painel inteiro arrasta a janela: aqui é a alça, que só muda o tamanho)
        e.preventDefault();
        redimensionando = { x: e.clientX, y: e.clientY, largura: painel.offsetWidth, altura: painel.offsetHeight };
        alcaRedimensionar.setPointerCapture(e.pointerId);
    });
    alcaRedimensionar.addEventListener("mousedown", (e) => e.preventDefault()); // não tira o foco do campo de texto
    alcaRedimensionar.addEventListener("pointermove", (e) => {
        if (!redimensionando) return;
        dimensionar(redimensionando.largura + e.clientX - redimensionando.x, redimensionando.altura + e.clientY - redimensionando.y);
    });
    const terminouRedimensionar = (): void => {
        if (!redimensionando) return;
        redimensionando = null;
        guardarTexto(CHAVE_TAMANHO, `${painel.offsetWidth},${painel.offsetHeight}`);
    };
    alcaRedimensionar.addEventListener("pointerup", terminouRedimensionar);
    alcaRedimensionar.addEventListener("pointercancel", terminouRedimensionar);

    // --- A janela é ARRASTÁVEL por qualquer parte NEUTRA dela (não só pela barra do título) ---

    /** Põe a janela em (x, y), sem deixar a barra do título sair da tela (sempre sobra um pedaço para agarrar e arrastar de volta). */
    function posicionar(x: number, y: number): void {
        const pedacoVisivel = 80; // px da janela que sempre ficam à vista nas laterais
        const nova = {
            x: limitar(x, pedacoVisivel - painel.offsetWidth, window.innerWidth - pedacoVisivel),
            y: limitar(y, 0, window.innerHeight - 44), // 44 px: a altura da barra do título (e um respiro)
        };
        lugar = nova;
        painel.style.left = `${nova.x}px`;
        painel.style.top = `${nova.y}px`;
    }

    /** Ao abrir: volta ao último lugar; na primeira vez, centraliza na horizontal e encosta no topo (a faixa de baixo, do chat, fica livre). */
    function colocarNaTela(): void {
        if (lugar) posicionar(lugar.x, lugar.y);
        else posicionar((window.innerWidth - painel.offsetWidth) / 2, 16);
    }

    /**
     * É uma parte NEUTRA da janela (o fundo, as bordas e folgas, o título, os rótulos, o contador, os itens das listas...)? Agarrar e arrastar
     * por ela move a janela. NÃO são neutros: os controles (botões, campos e o texto da ficha), o texto que a pessoa pode querer SELECIONAR
     * e copiar (os parágrafos e os exemplos das dicas) e a barra de rolagem das áreas que rolam (que rola, e não arrasta).
     */
    function ehParteNeutra(e: MouseEvent): boolean {
        const alvo = e.target;
        if (!(alvo instanceof HTMLElement)) return false;
        if (alvo.closest("button, input, textarea, select, a, p, pre, code, li[data-rolagem], #editor-ficha-cores, #editor-ficha-redimensionar")) return false;
        // Numa área que rola, o clique na própria barra de rolagem (à direita ou embaixo do conteúdo) é para rolar.
        const naBarraVertical = alvo.scrollHeight > alvo.clientHeight && e.offsetX >= alvo.clientWidth;
        const naBarraHorizontal = alvo.scrollWidth > alvo.clientWidth && e.offsetY >= alvo.clientHeight;
        return !naBarraVertical && !naBarraHorizontal;
    }

    let arrasto: { dx: number; dy: number } | null = null; // quanto o mouse estava longe do canto da janela ao agarrar
    painel.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || !ehParteNeutra(e)) return;
        arrasto = { dx: e.clientX - painel.offsetLeft, dy: e.clientY - painel.offsetTop };
        painel.setPointerCapture(e.pointerId); // o arrasto continua mesmo se o mouse sair da janela
        painel.classList.add("arrastando");
        e.preventDefault(); // sem selecionar texto durante o arrasto
    });
    // Sem isto, apertar numa parte neutra tiraria o foco do campo de texto (e o Esc e o Ctrl+S, que só valem com o foco na janela, parariam).
    painel.addEventListener("mousedown", (e) => {
        if (ehParteNeutra(e)) e.preventDefault();
    });
    painel.addEventListener("pointermove", (e) => {
        if (arrasto) posicionar(e.clientX - arrasto.dx, e.clientY - arrasto.dy);
    });
    const soltou = (): void => {
        arrasto = null;
        painel.classList.remove("arrastando");
    };
    painel.addEventListener("pointerup", soltou);
    painel.addEventListener("pointercancel", soltou);
    window.addEventListener("resize", () => {
        if (janela.hidden || !lugar) return;
        dimensionar(painel.offsetWidth, painel.offsetHeight); // a janela da página mudou de tamanho: a ficha não pode passar da borda
        posicionar(lugar.x, lugar.y); // e é puxada de volta para dentro
    });

    /** Há alterações não salvas? (Compara com a limpeza que o servidor faz: espaços repetidos no nome não contam como mudança.) */
    function sujo(): boolean {
        if (!base) return false;
        const abas = normalizarAbas(rascunho);
        return normalizarNomeFicha(base.id, campoNome.value) !== base.nome || abas === null || !abasIguais(abas, base.abas);
    }

    /** O limite de caracteres é a SOMA das abas: o campo desta aba só aceita o que sobra depois dos textos das outras. */
    function ajustarLimiteDoCampo(): void {
        const dasOutras = tamanhoDoTextoDasAbas(rascunho) - (rascunho[abaAtual]?.texto.length ?? 0);
        campoTexto.maxLength = Math.max(0, MAX_CARACTERES_TEXTO_FICHA - dasOutras);
    }

    function atualizarTela(): void {
        if (!base) return;
        rotuloVersao.textContent = `Versão ${base.versao}${sujo() ? " · alterações não salvas" : ""}`;
        contagem.textContent = `${tamanhoDoTextoDasAbas(rascunho)}/${MAX_CARACTERES_TEXTO_FICHA}`;
        botaoNovaAba.disabled = rascunho.length >= MAX_ABAS_FICHA;
        botaoNovaAba.title = rascunho.length >= MAX_ABAS_FICHA ? `Limite de ${MAX_ABAS_FICHA} páginas` : "Nova página";
        botaoSalvar.disabled = !sujo() || salvando || maisNova !== null || excluida;
        botaoSalvar.textContent = salvando ? "Salvando…" : "Salvar";
        caixaConflito.hidden = maisNova === null && !excluida;
        botaoRecarregar.hidden = excluida; // (uma ficha excluída não tem "versão atual" para carregar)
    }

    function mostrarAviso(texto: string, ehErro = false): void {
        aviso.textContent = texto;
        if (ehErro) aviso.dataset.erro = "";
        else delete aviso.dataset.erro;
    }

    // --- O painel lateral: variáveis e rolagens que o texto define (tudo entra por textContent, nunca como HTML) ---

    function itemDaLista(classe: string, nome: string, valor: string, dica: string, erro: boolean, indiceDaRolagem?: number): HTMLLIElement {
        const item = document.createElement("li");
        item.className = classe + (erro ? " com-erro" : "");
        item.title = dica;
        const rotulo = document.createElement("span");
        rotulo.className = "nome";
        rotulo.textContent = nome;
        const resultado = document.createElement("span");
        resultado.className = "valor";
        resultado.textContent = valor;
        item.append(rotulo, resultado);
        if (indiceDaRolagem !== undefined) {
            // Uma rolagem da lista é CLICÁVEL (e alcançável pelo teclado): rola.
            item.dataset.rolagem = String(indiceDaRolagem);
            item.tabIndex = 0;
            item.setAttribute("role", "button"); // (sem texto "Rolar": clicar na caixa já é intuitivo; o cursor e o destaque mostram que é clicável)
        }
        return item;
    }

    /**
     * Pinta o texto na CAMADA DE CORES que fica por cima do campo (o texto do campo é transparente): variáveis, nomes e fórmulas. Só entra
     * texto puro (`textContent` e `append` de texto): nada do que a pessoa escreve vira HTML.
     */
    function pintarTexto(texto: string, analise: AnaliseDaFicha): void {
        const pedacos = document.createDocumentFragment();
        let posicao = 0;
        // O valor de uma variável que é uma CONTA (e não só um número) ganha, ao lado, o RESULTADO, como a dica de um editor de código. Fica no
        // atributo `data-resultado` e o CSS o desenha (::after): não é texto da ficha, não se seleciona e não ocupa espaço (não muda a quebra).
        const resultadoPorPosicao = new Map<number, number>();
        for (const v of analise.variaveis) {
            if (v.aba !== analise.aba) continue; // (as posições das variáveis são dentro da aba delas)
            if (v.erro === null && v.valor !== null && !/^\s*-?\d+\s*$/.test(v.conta)) resultadoPorPosicao.set(v.posConta.inicio, v.valor);
        }
        for (const trecho of trechosDoTexto(analise)) {
            if (trecho.inicio < posicao) continue; // (trechos que se sobrepõem: vale o primeiro)
            pedacos.append(texto.slice(posicao, trecho.inicio));
            const span = document.createElement("span");
            span.className = `trecho ${trecho.tipo}${trecho.erro ? " com-erro" : ""}`;
            span.textContent = texto.slice(trecho.inicio, trecho.fim);
            const resultado = trecho.tipo === "variavel-valor" ? resultadoPorPosicao.get(trecho.inicio) : undefined;
            if (resultado !== undefined) span.dataset.resultado = String(resultado);
            if (trecho.tipo === "rolagem-nome") {
                span.title = trecho.erro ? trecho.dica : `Clique para rolar: ${trecho.dica}`; // ao passar o mouse: a fórmula já calculada (ou o erro)
                if (trecho.rolagem !== null) span.dataset.rolagem = String(trecho.rolagem);
            }
            pedacos.append(span);
            posicao = trecho.fim;
        }
        pedacos.append(texto.slice(posicao) + "\n"); // o "\n" final mantém a altura igual à do campo quando o texto termina numa linha vazia
        camadaCores.replaceChildren(pedacos);
        camadaCores.scrollTop = campoTexto.scrollTop;
    }

    /**
     * Refaz TUDO o que depende do texto: as listas do painel (variáveis e rolagens) e as cores. Roda a cada tecla, na hora: o texto do campo
     * é transparente, então a camada de cores precisa estar sempre em dia, senão o que se digita ficaria invisível por um instante.
     */
    function atualizarAssistente(): void {
        const texto = campoTexto.value;
        if (!previa.hidden) desenharPrevia(); // (a visualização formatada acompanha a aba aberta)
        const analise = analisarAbas(rascunho.map((aba) => aba.texto))[abaAtual]; // (variáveis da ficha toda; rolagens só desta aba)
        ultimaAnalise = analise;
        semVariaveis.hidden = analise.variaveis.length > 0;
        semRolagens.hidden = analise.rolagens.length > 0;
        listaVariaveis.replaceChildren(
            ...analise.variaveis.map((v) => {
                const deOutra = v.aba !== abaAtual;
                const item = itemDaLista("variavel", v.nome, v.erro ?? String(v.valor), `${v.nome}:: ${v.conta}${deOutra ? ` (definida na página "${rascunho[v.aba]?.nome ?? ""}")` : ""}`, v.erro !== null);
                if (deOutra) item.classList.add("de-outra-aba"); // (vale aqui também, mas está escrita em outra página)
                return item;
            }),
        );
        listaRolagens.replaceChildren(
            ...analise.rolagens.map((r, i) => itemDaLista("rolagem", r.nome, r.erro ?? r.resolvida ?? "", r.erro ?? `Clique para rolar: [${r.formula}]`, r.erro !== null, i)),
        );
        try {
            pintarTexto(texto, analise);
            campoTexto.classList.add("colorido");
        } catch {
            // Se algo der errado nas cores, o texto do campo volta a aparecer normalmente (nunca fica invisível).
            campoTexto.classList.remove("colorido");
            camadaCores.replaceChildren();
        }
    }

    /** Rola a rolagem `indice` (a pessoa clicou no nome dela no texto, ou no item da lista). O resultado aparece no chat. */
    function rolar(indice: number): void {
        if (!base) return;
        destacarRolagem(indice);
        const rolagem = ultimaAnalise?.rolagens[indice];
        if (!rolagem) return;
        if (excluida || maisNova !== null) return mostrarAviso("Esta ficha foi alterada por outra pessoa. Carregue a versão atual para rolar.", true);
        if (sujo()) return mostrarAviso("Salve a ficha (Ctrl+S) para rolar com as mudanças que você fez.", true);
        if (rolagem.erro !== null) return mostrarAviso(`Não dá para rolar "${rolagem.nome}": ${rolagem.erro}`, true);
        const erro = opcoes.aoRolar(base.id, base.versao, abaAtual, indice);
        if (erro) return mostrarAviso(erro, true);
        mostrarAviso(`"${rolagem.nome}" rolada: veja o resultado no chat.`);
        aguardandoRolagem = true; // (online, um erro do servidor nos próximos instantes é desta rolagem)
        setTimeout(() => (aguardandoRolagem = false), 3000);
    }

    /** Destaca, por um instante, uma rolagem na lista lateral (quando a pessoa clica no nome dela no texto). */
    function destacarRolagem(indice: number): void {
        const item = listaRolagens.children[indice];
        if (!(item instanceof HTMLElement)) return;
        item.scrollIntoView({ block: "nearest" });
        item.classList.add("destaque");
        setTimeout(() => item.classList.remove("destaque"), 1400);
    }

    /** Põe esta ficha na janela (descartando o que estava escrito): vira a "base" para comparar e para a checagem de versão. */
    function carregar(ficha: Ficha, manterAba = false): void {
        base = ficha;
        rascunho = ficha.abas.map((aba) => ({ ...aba }));
        abaAtual = manterAba ? Math.min(abaAtual, rascunho.length - 1) : 0;
        maisNova = null;
        salvando = false;
        enviado = null;
        excluida = false;
        campoNome.value = ficha.nome;
        campoTexto.value = rascunho[abaAtual].texto;
        ajustarLimiteDoCampo();
        renderizarAbas();
        atualizarTela();
        atualizarAssistente();
    }

    // --- As ABAS (páginas): escolher, criar, renomear (duplo clique) e excluir. Tudo mexe só no rascunho: vale ao Salvar. ---

    /** Refaz a linha de abas a partir do rascunho (nomes entram por textContent). */
    function renderizarAbas(): void {
        listaAbas.replaceChildren(
            ...rascunho.map((aba, i) => {
                const item = document.createElement("div");
                item.className = "aba-ficha" + (i === abaAtual ? " ativa" : "");
                item.setAttribute("role", "tab");
                item.setAttribute("aria-selected", String(i === abaAtual));
                const rotulo = document.createElement("button");
                rotulo.type = "button";
                rotulo.className = "aba-ficha-nome";
                rotulo.textContent = aba.nome;
                rotulo.title = `${aba.nome} (clique direito: renomear ou excluir)`;
                rotulo.addEventListener("click", () => selecionarAba(i));
                rotulo.addEventListener("dblclick", () => renomearAba(i, item));
                item.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    abrirMenuAba(i, e.clientX, e.clientY);
                });
                item.append(rotulo);
                return item;
            }),
        );
    }

    /** Põe no campo de texto a aba `i` (o rascunho da aba que estava aberta já está guardado, a cada tecla). */
    function selecionarAba(i: number): void {
        if (i === abaAtual || i < 0 || i >= rascunho.length) return;
        abaAtual = i;
        campoTexto.value = rascunho[i].texto;
        campoTexto.scrollTop = 0;
        ajustarLimiteDoCampo();
        renderizarAbas();
        atualizarTela();
        atualizarAssistente();
        campoTexto.focus();
    }

    function novaAba(): void {
        if (!base || rascunho.length >= MAX_ABAS_FICHA) return;
        // O primeiro "Página N" que ainda não está em uso (apagando a 2 de 1, 2, 3, a próxima volta a ser "Página 2", e não outra "Página 3").
        const usados = new Set(rascunho.map((aba) => aba.nome));
        let numero = 0;
        while (usados.has(nomePadraoDaAba(numero))) numero += 1;
        rascunho.push({ nome: nomePadraoDaAba(numero), texto: "" });
        mostrarAviso("");
        selecionarAba(rascunho.length - 1);
    }

    /** Duplo clique no nome: o botão vira um campo. Enter ou sair do campo confirma; Esc cancela (e só isso: não fecha a ficha). */
    function renomearAba(i: number, item: HTMLElement): void {
        const rotulo = item.querySelector(".aba-ficha-nome");
        if (!rotulo) return;
        const campo = document.createElement("input");
        campo.type = "text";
        campo.className = "aba-ficha-campo";
        campo.dataset.renomeandoAba = ""; // (o Esc e o Ctrl+S da janela deixam este campo em paz)
        campo.maxLength = MAX_CARACTERES_NOME_ABA_FICHA;
        campo.value = rascunho[i].nome;
        campo.setAttribute("aria-label", "Nome da página");
        rotulo.replaceWith(campo);
        campo.focus();
        campo.select();
        let terminou = false;
        const concluir = (aplicar: boolean): void => {
            if (terminou) return;
            terminou = true;
            if (aplicar) rascunho[i].nome = normalizarNomeAba(i, campo.value);
            renderizarAbas();
            atualizarTela();
            if (aplicar) atualizarAssistente(); // (o nome aparece na dica das variáveis)
            campoTexto.focus();
        };
        campo.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                concluir(true);
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                concluir(false);
            }
        });
        campo.addEventListener("blur", () => concluir(true));
    }

    /** Menu do clique direito numa aba: "Renomear página" e "Excluir página" (a última página não se exclui). */
    let abaDoMenu = -1;
    function fecharMenuAba(): void {
        menuAba.hidden = true;
        abaDoMenu = -1;
    }
    function abrirMenuAba(i: number, x: number, y: number): void {
        abaDoMenu = i;
        menuAbaExcluir.disabled = rascunho.length <= 1;
        menuAbaExcluir.title = rascunho.length <= 1 ? "A ficha precisa ter pelo menos uma página" : "";
        menuAba.hidden = false;
        const caixa = menuAba.getBoundingClientRect();
        menuAba.style.left = `${Math.max(4, Math.min(x, window.innerWidth - caixa.width - 4))}px`;
        menuAba.style.top = `${Math.max(4, Math.min(y, window.innerHeight - caixa.height - 4))}px`;
        menuAbaRenomear.focus();
    }
    menuAbaRenomear.addEventListener("click", () => {
        const i = abaDoMenu;
        fecharMenuAba();
        const item = listaAbas.children[i];
        if (item instanceof HTMLElement) renomearAba(i, item);
    });
    menuAbaExcluir.addEventListener("click", () => {
        const i = abaDoMenu;
        fecharMenuAba();
        void excluirAba(i);
    });
    // Fecha com clique fora, Esc (só o menu: o Esc não fecha a ficha), roda do mouse ou ao mexer na janela.
    document.addEventListener("mousedown", (e) => {
        if (!menuAba.hidden && !menuAba.contains(e.target as Node)) fecharMenuAba();
    }, true);
    document.addEventListener("keydown", (e) => {
        if (menuAba.hidden || e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        fecharMenuAba();
    }, true);
    window.addEventListener("resize", fecharMenuAba);

    // --- FORMATAÇÃO: botões que inserem as marcas no texto (ver formatacao.ts) e a visualização formatada. ---

    /** Troca o trecho [de, ate) do campo por `novo`, mantendo o desfazer (Ctrl+Z) quando o navegador deixa; respeita o limite de caracteres. */
    function substituirNoCampo(de: number, ate: number, novo: string, selecionarDe: number, selecionarAte: number): void {
        if (novo.length - (ate - de) > campoTexto.maxLength - campoTexto.value.length) {
            mostrarAviso("Sem espaço: o limite de caracteres da ficha foi atingido.", true);
            return;
        }
        campoTexto.focus();
        campoTexto.setSelectionRange(de, ate);
        if (!document.execCommand("insertText", false, novo)) {
            campoTexto.setRangeText(novo, de, ate, "end");
            campoTexto.dispatchEvent(new Event("input", { bubbles: true })); // (atualiza o rascunho, as cores e as rolagens)
        }
        campoTexto.setSelectionRange(selecionarDe, selecionarAte);
    }

    /** Negrito (`**`) e itálico (`*`): cerca a seleção com a marca; se ela já está cercada, tira. Sem seleção, põe o par e deixa o cursor no meio. */
    function alternarMarca(marca: string): void {
        const texto = campoTexto.value;
        const de = campoTexto.selectionStart;
        const ate = campoTexto.selectionEnd;
        const m = marca.length;
        if (de >= m && texto.startsWith(marca, de - m) && texto.startsWith(marca, ate) && texto[de - m - 1] !== "*" && texto[ate + m] !== "*") {
            substituirNoCampo(de - m, ate + m, texto.slice(de, ate), de - m, ate - m); // já estava cercada: tira
        } else {
            substituirNoCampo(de, ate, marca + texto.slice(de, ate) + marca, de + m, ate + m);
        }
    }

    /** Título: põe "#"×nível no começo de cada linha tocada pela seleção (troca o que já tinha); nível 0 tira o título. */
    function definirTitulo(nivel: number): void {
        const texto = campoTexto.value;
        const de = campoTexto.selectionStart;
        const ate = campoTexto.selectionEnd;
        const inicio = texto.lastIndexOf("\n", de - 1) + 1;
        let fim = texto.indexOf("\n", ate);
        if (fim < 0) fim = texto.length;
        const prefixo = nivel > 0 ? "#".repeat(nivel) + " " : "";
        const novo = texto
            .slice(inicio, fim)
            .split("\n")
            .map((linha) => prefixo + linha.replace(/^#{1,5} /, ""))
            .join("\n");
        substituirNoCampo(inicio, fim, novo, inicio, inicio + novo.length);
    }

    barraFormatar.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest("button[data-formatar]")) e.preventDefault(); // o campo de texto NÃO perde o foco (nem a seleção)
    });
    barraFormatar.addEventListener("click", (e) => {
        const botao = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-formatar]");
        if (!botao || botao.disabled || !base) return;
        const que = botao.dataset.formatar ?? "";
        if (que === "negrito") alternarMarca("**");
        else if (que === "italico") alternarMarca("*");
        else definirTitulo(Number(que));
    });
    campoTexto.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        const tecla = e.key.toLowerCase();
        if (tecla !== "b" && tecla !== "i") return;
        e.preventDefault();
        alternarMarca(tecla === "b" ? "**" : "*");
    });

    /** Desenha a aba aberta já formatada. Tudo por createElement + textContent: o texto da ficha NUNCA vira HTML. */
    function desenharPrevia(): void {
        previa.replaceChildren(
            ...formatarTexto(campoTexto.value).map((linha) => {
                const bloco = document.createElement("div");
                if (linha.nivel > 0) bloco.className = `titulo t${linha.nivel}`;
                if (linha.pedacos.length === 0) bloco.append(document.createElement("br")); // (linha vazia mantém a altura)
                for (const pedaco of linha.pedacos) {
                    const trecho = document.createElement("span");
                    if (pedaco.negrito) trecho.classList.add("negrito");
                    if (pedaco.italico) trecho.classList.add("italico");
                    trecho.textContent = pedaco.texto;
                    bloco.append(trecho);
                }
                return bloco;
            }),
        );
    }
    function mostrarPrevia(ligada: boolean): void {
        previa.hidden = !ligada;
        botaoVer.setAttribute("aria-pressed", String(ligada));
        botaoVer.textContent = ligada ? "Editar" : "Visualizar";
        for (const b of barraFormatar.querySelectorAll<HTMLButtonElement>("button[data-formatar]")) b.disabled = ligada;
        if (ligada) desenharPrevia();
        else campoTexto.focus();
    }
    botaoVer.addEventListener("click", () => mostrarPrevia(previa.hidden === true));

    /** ✕ da aba: tira a página do rascunho (pergunta antes se ela tem texto). A última página não pode ser excluída. */
    async function excluirAba(i: number): Promise<void> {
        if (rascunho.length <= 1 || !rascunho[i]) return;
        if (rascunho[i].texto.trim() !== "" && !(await opcoes.confirmarExcluirAba(rascunho[i].nome))) return;
        if (rascunho.length <= 1 || !rascunho[i]) return; // (a ficha pode ter mudado enquanto a caixa estava aberta)
        rascunho.splice(i, 1);
        if (i < abaAtual) abaAtual -= 1;
        abaAtual = Math.min(abaAtual, rascunho.length - 1);
        campoTexto.value = rascunho[abaAtual].texto;
        ajustarLimiteDoCampo();
        renderizarAbas();
        mostrarAviso("");
        atualizarTela();
        atualizarAssistente();
    }

    function mostrarConflito(ficha: Ficha): void {
        maisNova = ficha;
        textoConflito.textContent = `Outra pessoa salvou esta ficha (agora na versão ${ficha.versao}). Para não apagar o trabalho dela, o seu salvamento foi bloqueado. Copie o que você escreveu, se quiser guardar, e carregue a versão atual.`;
        mostrarAviso("");
        atualizarTela();
    }

    /** O salvamento deu certo: a ficha que o servidor guardou é a nova base. */
    function salvou(ficha: Ficha): void {
        carregar(ficha, true); // (o servidor pode ter limpado o texto: a janela mostra exatamente o que ficou guardado; continua na mesma aba)
        mostrarAviso(`Salva na versão ${ficha.versao}.`);
    }

    function salvar(): void {
        if (!base || botaoSalvar.disabled) return;
        const dados = { nome: campoNome.value, abas: rascunho.map((aba) => ({ ...aba })) };
        mostrarAviso("");
        const resultado = opcoes.aoSalvar(base.id, base.versao, dados);
        if (resultado === "enviada") {
            salvando = true;
            enviado = dados;
            atualizarTela();
        } else if (resultado.ok) {
            salvou(resultado.ficha);
        } else {
            mostrarAviso(
                resultado.erro === "nao_existe" ? "Essa ficha não existe mais." : resultado.erro === "texto_longo" ? `O texto passa de ${MAX_CARACTERES_TEXTO_FICHA} caracteres (somando todas as páginas).` : resultado.erro === "abas_invalidas" ? `A ficha precisa ter de 1 a ${MAX_ABAS_FICHA} páginas.` : "Esta ficha mudou. Feche e abra de novo.",
                true,
            );
        }
    }

    /** Fecha a janela sem perguntar nada. */
    function fecharSemPerguntar(): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        base = null;
        opcoes.aoMudarAberta(null);
        maisNova = null;
        salvando = false;
        enviado = null;
        excluida = false;
        rascunho = [];
    }

    async function fechar(): Promise<void> {
        if (sujo() && !(await opcoes.confirmarDescarte())) return;
        fecharSemPerguntar();
    }

    function aoTeclar(e: KeyboardEvent): void {
        // Com a caixa de confirmar (ou a das instruções) aberta por cima, o Esc e as teclas são DELAS.
        if (document.getElementById("confirmar")?.hidden === false || document.getElementById("ajuda-fichas")?.hidden === false) return;
        // A janela não é modal: com o foco FORA dela (no chat, por exemplo) estas teclas são de quem tem o foco.
        if (!janela.contains(document.activeElement)) return;
        if (e.target instanceof HTMLElement && e.target.dataset.renomeandoAba !== undefined) return; // renomeando uma aba: Enter e Esc são do campo dela
        if (e.key === "Escape") {
            e.stopPropagation(); // só esta janela fecha (a bolsa por baixo continua aberta)
            void fechar();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault(); // (sem isto o navegador abriria "Salvar página")
            salvar();
        }
    }

    for (const campo of [campoNome, campoTexto]) {
        campo.addEventListener("input", () => {
            if (campo === campoTexto && rascunho[abaAtual]) {
                rascunho[abaAtual].texto = campoTexto.value; // (o rascunho da aba aberta acompanha cada tecla)
                ajustarLimiteDoCampo();
            }
            mostrarAviso(""); // ("Salva na versão N." já não vale: a pessoa voltou a escrever)
            atualizarTela();
            atualizarAssistente();
        });
    }
    botaoNovaAba.addEventListener("click", novaAba);
    // A camada de cores acompanha a rolagem do campo (os dois têm o mesmo tamanho e a mesma quebra de linha).
    campoTexto.addEventListener("scroll", () => {
        camadaCores.scrollTop = campoTexto.scrollTop;
    });
    // O nome de uma rolagem aceita o mouse: o clique ROLA (e destaca a rolagem na lista). O "mousedown" não pode tirar o foco do campo de texto.
    camadaCores.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest("[data-rolagem]")) e.preventDefault();
    });
    camadaCores.addEventListener("click", (e) => {
        const nome = (e.target as HTMLElement).closest<HTMLElement>("[data-rolagem]");
        if (nome) rolar(Number(nome.dataset.rolagem));
    });
    // Os itens da lista de rolagens também rolam (clique, ou Enter/Espaço com o foco neles).
    listaRolagens.addEventListener("click", (e) => {
        const item = (e.target as HTMLElement).closest<HTMLElement>("li[data-rolagem]");
        if (item) rolar(Number(item.dataset.rolagem));
    });
    listaRolagens.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const item = (e.target as HTMLElement).closest<HTMLElement>("li[data-rolagem]");
        if (!item) return;
        e.preventDefault();
        rolar(Number(item.dataset.rolagem));
    });
    botaoSalvar.addEventListener("click", salvar);
    botaoFechar.addEventListener("click", () => void fechar());
    botaoX.addEventListener("click", () => void fechar()); // o ✕ do alto faz o mesmo que o Esc e o botão Fechar
    botaoRecarregar.addEventListener("click", () => {
        if (!maisNova) return;
        carregar(maisNova, true);
        mostrarAviso(`Versão ${base?.versao} carregada.`);
    });

    return {
        abrir(ficha) {
            carregar(ficha);
            mostrarAviso("");
            janela.hidden = false;
            aplicarTamanhoGuardado(); // (o tamanho que a pessoa escolheu da última vez; sem escolha vale o padrão do CSS)
            colocarNaTela(); // (depois de mostrar: só então dá para medir o tamanho da janela)
            opcoes.aoMudarAberta(ficha.id);
            document.addEventListener("keydown", aoTeclar, true);
            campoTexto.focus();
        },
        get idAberto() {
            return base ? base.id : null;
        },
        fichaMudou(ficha) {
            if (!base || ficha.id !== base.id) return;
            // O que chegou é o resultado do MEU salvamento? (mesma versão seguinte e o mesmo conteúdo que eu mandei, já limpo.)
            const abasEnviadas = enviado ? normalizarAbas(enviado.abas) : null;
            const ehMinha =
                salvando &&
                enviado !== null &&
                abasEnviadas !== null &&
                ficha.versao >= base.versao &&
                ficha.nome === normalizarNomeFicha(ficha.id, enviado.nome) &&
                abasIguais(ficha.abas, abasEnviadas);
            if (ehMinha) return salvou(ficha);
            if (ficha.versao <= base.versao) return; // notícia velha (ou a mesma versão que já tenho)
            if (!sujo() && !salvando) {
                // Eu não tinha mudado nada: a janela só se atualiza.
                carregar(ficha, true);
                mostrarAviso(`Atualizada: outra pessoa salvou a versão ${ficha.versao}.`);
            } else {
                mostrarConflito(ficha); // eu tinha mudanças: não as apago; o salvamento fica bloqueado até eu decidir
            }
        },
        conflito(ficha) {
            if (!base || ficha.id !== base.id) return;
            salvando = false;
            enviado = null;
            mostrarConflito(ficha);
        },
        fichaExcluida(id) {
            if (!base || id !== base.id) return;
            if (!sujo()) return fecharSemPerguntar(); // nada a perder: a janela só fecha
            excluida = true;
            salvando = false;
            enviado = null;
            maisNova = null;
            textoConflito.textContent = "Esta ficha foi excluída. O que você escreveu continua aqui: copie, se quiser guardar. Ao fechar a janela, o texto se perde.";
            mostrarAviso("");
            atualizarTela();
        },
        recusada(motivo) {
            if (!salvando && !aguardandoRolagem) return;
            aguardandoRolagem = false;
            salvando = false;
            enviado = null;
            mostrarAviso(motivo, true);
            atualizarTela();
        },
    };
}
