// =====================================================================
// EDITOR DE FICHA (HTML): a janela onde se ABRE uma ficha (um clique no documento da grade da aba Fichas) para mudar o NOME e o TEXTO.
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
//   - BOTÕES NO ALTO: "Ocultar instruções" e "Ocultar rolagens" escondem (ou mostram de novo) as duas partes do painel lateral, e o ✕ fecha a
//     ficha (igual ao Esc: com alterações não salvas pergunta antes). Sem nenhuma das duas partes, o painel some e o texto ocupa a largura
//     toda. A escolha fica guardada no navegador (localStorage) para as próximas vezes.
//   - PAINEL LATERAL: em cima, a tela de rolagens (lê o texto enquanto você escreve, com formulas.ts): as VARIÁVEIS ("FOR:: 16" -> FOR = 16) e
//     as ROLAGENS ("(Ataque)[1d20 + FOR]" -> nome e fórmula já com os valores), com os erros. Embaixo, as dicas de uso, sempre à vista.
//
// Este módulo só cuida da janela: salvar de verdade é com quem o criou (`aoSalvar`: no modo local grava na memória; online manda o
// pedido ao servidor e a resposta volta por `fichaMudou`, `conflito` e `recusada`). A marcação e o CSS ficam no index.html
// (ids "editor-ficha-*").
// =====================================================================

import { MAX_CARACTERES_NOME_FICHA, MAX_CARACTERES_TEXTO_FICHA } from "../config";
import { limitar } from "../coordenadas";
import { normalizarNomeFicha, normalizarTextoFicha, type Ficha, type MudancasFicha, type ResultadoEdicaoFicha } from "../estado";
import { analisarFicha, trechosDoTexto, type AnaliseDaFicha } from "../formulas";

export interface OpcoesEditorFicha {
    /**
     * Salvar. `versao` é a que a janela tem agora (a do servidor, quando a pessoa abriu ou salvou pela última vez). Modo local: devolve
     * o resultado na hora. Online: o pedido vai ao servidor e devolve "enviada"; a resposta chega depois (`fichaMudou`, `conflito`,
     * `recusada`).
     */
    aoSalvar(id: number, versao: number, mudancas: Required<MudancasFicha>): ResultadoEdicaoFicha | "enviada";
    /** Há alterações não salvas e a pessoa quer fechar: pergunta se pode descartá-las. Devolve true se sim. */
    confirmarDescarte(): Promise<boolean>;
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
    const camadaCores = pegar("editor-ficha-cores");

    campoNome.maxLength = MAX_CARACTERES_NOME_FICHA; // o navegador corta ao digitar/colar (a regra também vale no servidor)
    campoTexto.maxLength = MAX_CARACTERES_TEXTO_FICHA;

    let base: Ficha | null = null; // a ficha como o servidor a tem (a última que esta janela conhece): nome, texto e VERSÃO
    let salvando = false; // online: o pedido foi ao servidor e a resposta ainda não chegou
    let enviado: Required<MudancasFicha> | null = null; // o que foi mandado no salvamento em andamento
    let maisNova: Ficha | null = null; // uma versão mais nova que a minha (alguém salvou): enquanto existir, salvar fica bloqueado
    let excluida = false; // alguém excluiu a ficha com ela aberta: não dá mais para salvar
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
        if (alvo.closest("button, input, textarea, select, a, p, pre, code, #editor-ficha-cores")) return false;
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
        if (!janela.hidden && lugar) posicionar(lugar.x, lugar.y); // a janela da página mudou de tamanho: puxa a ficha de volta para dentro
    });

    /** Há alterações não salvas? (Compara com a limpeza que o servidor faz: espaços repetidos no nome não contam como mudança.) */
    function sujo(): boolean {
        if (!base) return false;
        return normalizarNomeFicha(base.id, campoNome.value) !== base.nome || normalizarTextoFicha(campoTexto.value) !== base.texto;
    }

    function atualizarTela(): void {
        if (!base) return;
        rotuloVersao.textContent = `Versão ${base.versao}${sujo() ? " · alterações não salvas" : ""}`;
        contagem.textContent = `${campoTexto.value.length}/${MAX_CARACTERES_TEXTO_FICHA}`;
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

    function itemDaLista(classe: string, nome: string, valor: string, dica: string, erro: boolean): HTMLLIElement {
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
        return item;
    }

    /**
     * Pinta o texto na CAMADA DE CORES que fica por cima do campo (o texto do campo é transparente): variáveis, nomes e fórmulas. Só entra
     * texto puro (`textContent` e `append` de texto): nada do que a pessoa escreve vira HTML.
     */
    function pintarTexto(texto: string, analise: AnaliseDaFicha): void {
        const pedacos = document.createDocumentFragment();
        let posicao = 0;
        for (const trecho of trechosDoTexto(analise)) {
            if (trecho.inicio < posicao) continue; // (trechos que se sobrepõem: vale o primeiro)
            pedacos.append(texto.slice(posicao, trecho.inicio));
            const span = document.createElement("span");
            span.className = `trecho ${trecho.tipo}${trecho.erro ? " com-erro" : ""}`;
            span.textContent = texto.slice(trecho.inicio, trecho.fim);
            if (trecho.tipo === "rolagem-nome") {
                span.title = trecho.dica; // ao passar o mouse: a fórmula já calculada (ou o erro)
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
        const analise = analisarFicha(texto);
        semVariaveis.hidden = analise.variaveis.length > 0;
        semRolagens.hidden = analise.rolagens.length > 0;
        listaVariaveis.replaceChildren(
            ...analise.variaveis.map((v) => itemDaLista("variavel", v.nome, v.erro ?? String(v.valor), `${v.nome}:: ${v.conta}`, v.erro !== null)),
        );
        listaRolagens.replaceChildren(
            ...analise.rolagens.map((r) => itemDaLista("rolagem", r.nome, r.erro ?? r.resolvida ?? "", `[${r.formula}]`, r.erro !== null)),
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

    /** Destaca, por um instante, uma rolagem na lista lateral (quando a pessoa clica no nome dela no texto). */
    function destacarRolagem(indice: number): void {
        const item = listaRolagens.children[indice];
        if (!(item instanceof HTMLElement)) return;
        item.scrollIntoView({ block: "nearest" });
        item.classList.add("destaque");
        setTimeout(() => item.classList.remove("destaque"), 1400);
    }

    /** Põe esta ficha na janela (descartando o que estava escrito): vira a "base" para comparar e para a checagem de versão. */
    function carregar(ficha: Ficha): void {
        base = ficha;
        maisNova = null;
        salvando = false;
        enviado = null;
        excluida = false;
        campoNome.value = ficha.nome;
        campoTexto.value = ficha.texto;
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
        carregar(ficha); // (o servidor pode ter limpado o texto: a janela mostra exatamente o que ficou guardado)
        mostrarAviso(`Salva na versão ${ficha.versao}.`);
    }

    function salvar(): void {
        if (!base || botaoSalvar.disabled) return;
        const dados = { nome: campoNome.value, texto: campoTexto.value };
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
                resultado.erro === "nao_existe" ? "Essa ficha não existe mais." : resultado.erro === "texto_longo" ? `O texto passa de ${MAX_CARACTERES_TEXTO_FICHA} caracteres.` : "Esta ficha mudou. Feche e abra de novo.",
                true,
            );
        }
    }

    /** Fecha a janela sem perguntar nada. */
    function fecharSemPerguntar(): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        base = null;
        maisNova = null;
        salvando = false;
        enviado = null;
        excluida = false;
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
            mostrarAviso(""); // ("Salva na versão N." já não vale: a pessoa voltou a escrever)
            atualizarTela();
            atualizarAssistente();
        });
    }
    // A camada de cores acompanha a rolagem do campo (os dois têm o mesmo tamanho e a mesma quebra de linha).
    campoTexto.addEventListener("scroll", () => {
        camadaCores.scrollTop = campoTexto.scrollTop;
    });
    // O nome de uma rolagem aceita o mouse: o clique destaca a rolagem na lista. O "mousedown" não pode tirar o foco do campo de texto.
    camadaCores.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest("[data-rolagem]")) e.preventDefault();
    });
    camadaCores.addEventListener("click", (e) => {
        const nome = (e.target as HTMLElement).closest<HTMLElement>("[data-rolagem]");
        if (nome) destacarRolagem(Number(nome.dataset.rolagem));
    });
    botaoSalvar.addEventListener("click", salvar);
    botaoFechar.addEventListener("click", () => void fechar());
    botaoX.addEventListener("click", () => void fechar()); // o ✕ do alto faz o mesmo que o Esc e o botão Fechar
    botaoRecarregar.addEventListener("click", () => {
        if (!maisNova) return;
        carregar(maisNova);
        mostrarAviso(`Versão ${base?.versao} carregada.`);
    });

    return {
        abrir(ficha) {
            carregar(ficha);
            mostrarAviso("");
            janela.hidden = false;
            colocarNaTela(); // (depois de mostrar: só então dá para medir o tamanho da janela)
            document.addEventListener("keydown", aoTeclar, true);
            campoTexto.focus();
        },
        get idAberto() {
            return base ? base.id : null;
        },
        fichaMudou(ficha) {
            if (!base || ficha.id !== base.id) return;
            // O que chegou é o resultado do MEU salvamento? (mesma versão seguinte e o mesmo conteúdo que eu mandei, já limpo.)
            const ehMinha =
                salvando &&
                enviado !== null &&
                ficha.versao >= base.versao &&
                ficha.nome === normalizarNomeFicha(ficha.id, enviado.nome) &&
                ficha.texto === normalizarTextoFicha(enviado.texto);
            if (ehMinha) return salvou(ficha);
            if (ficha.versao <= base.versao) return; // notícia velha (ou a mesma versão que já tenho)
            if (!sujo() && !salvando) {
                // Eu não tinha mudado nada: a janela só se atualiza.
                carregar(ficha);
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
            if (!salvando) return;
            salvando = false;
            enviado = null;
            mostrarAviso(motivo, true);
            atualizarTela();
        },
    };
}
