// =====================================================================
// EDITOR DE TOKEN (HTML): janela para mudar NOME, TAMANHO, as duas CORES (preenchimento e borda) e a EMANAÇÃO (a aura: alcance, transparência e cor) de
// um token que já existe. Abre pelo "Editar token…" do menu da ficha (na bolsa) e pelo "Editar token"
// da lista de ações do token (no mapa). A imagem tem a sua própria janela (ui/editorImagem.ts).
// A marcação e o CSS ficam no index.html (ids "editor-token-*").
// =====================================================================

import { casasParaMetros, metrosParaCasas, type EmanacaoDoToken } from "../areas";
import { ALFA_MAX_EMANACAO, ALFA_MIN_EMANACAO, EMANACAO_INICIAL_TOKEN, MAX_CARACTERES_NOME_TOKEN, MAX_EMANACAO_TOKEN } from "../config";
import { estado, motivoFichaOcupada } from "../estado";
import type { MudancasToken, Token } from "../estado";
import { corCss, escolherArquivo, marcarEscolhida, montarPaleta, pintarDisco } from "./aparenciaToken";

export interface OpcoesEditorToken {
    /** O usuário confirmou: aplicar estas mudanças ao token `id`. */
    aoSalvar(id: number, mudancas: MudancasToken): void;
    /**
     * Abre o editor de recorte com este arquivo (`corFundo` = o preenchimento escolhido, que aparece atrás das
     * partes transparentes). Devolve a miniatura recortada, ou null se o usuário cancelou.
     */
    editarImagem(arquivo: File, corFundo: number): Promise<string | null>;
    /** "Criar ficha": o editor já salvou o token; quem trata cria a ficha com o nome dele e a liga a ele. */
    aoCriarFicha(token: Token): void;
}

export interface EditorToken {
    /** Abre a janela com os valores atuais do token. `focarFicha`: já com o cursor na pesquisa de fichas. */
    editar(token: Token, opcoes?: { focarFicha?: boolean }): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarEditorToken(opcoes: OpcoesEditorToken): EditorToken {
    const janela = pegar("editor-token");
    const campoNome = pegar<HTMLInputElement>("editor-token-nome");
    const botoesTamanho = Array.from(janela.querySelectorAll<HTMLButtonElement>("button[data-tamanho]"));
    const amostras = pegar("editor-token-amostras");
    const amostrasBorda = pegar("editor-token-amostras-borda");
    const seletorCor = pegar<HTMLInputElement>("editor-token-cor");
    const seletorCorBorda = pegar<HTMLInputElement>("editor-token-cor-borda");
    const botaoFicha = pegar<HTMLButtonElement>("editor-token-ficha"); // o botão do menu suspenso: mostra a ficha escolhida
    const painelFicha = pegar("editor-token-ficha-painel");
    const listaFichas = pegar("editor-token-ficha-lista");
    const campoBuscaFicha = pegar<HTMLInputElement>("editor-token-ficha-busca");
    const botaoCriarFicha = pegar<HTMLButtonElement>("editor-token-ficha-criar");
    const botaoImagem = pegar<HTMLButtonElement>("editor-token-imagem");
    const botaoSemImagem = pegar<HTMLButtonElement>("editor-token-sem-imagem");
    const arquivo = pegar<HTMLInputElement>("editor-token-arquivo");
    const previa = pegar("editor-token-previa");
    // A emanação (aura).
    const caixaEmana = pegar<HTMLInputElement>("editor-token-emana");
    const opcoesEmana = pegar("editor-token-emana-opcoes");
    const campoMetros = pegar<HTMLInputElement>("editor-token-emana-metros");
    const botaoMenosEmana = pegar<HTMLButtonElement>("editor-token-emana-menos");
    const botaoMaisEmana = pegar<HTMLButtonElement>("editor-token-emana-mais");
    const faixaTransparencia = pegar<HTMLInputElement>("editor-token-emana-transparencia");
    const valorTransparencia = pegar<HTMLOutputElement>("editor-token-emana-transparencia-valor");
    const amostrasEmana = pegar("editor-token-amostras-emana");
    const seletorCorEmana = pegar<HTMLInputElement>("editor-token-cor-emana");
    const botaoCancelar = pegar<HTMLButtonElement>("editor-token-cancelar");
    const botaoSalvar = pegar<HTMLButtonElement>("editor-token-salvar");

    // O token em edição e os valores que o usuário está escolhendo (só vão para o token ao salvar).
    let token: Token | null = null;
    let tamanho = 1;
    let cor = 0;
    let corBorda = 0;
    let imagem: string | null = null; // a imagem escolhida (só vai para o token ao salvar)
    let fichaEscolhida: number | null = null; // a ficha escolhida no menu suspenso (só vai para o token ao salvar)
    // A emanação escolhida (só vai para o token ao salvar): ligada ou não, o alcance em casas, a cor e a opacidade.
    let emana = false;
    let emanaCasas: number = EMANACAO_INICIAL_TOKEN.casas;
    let emanaCor: number = EMANACAO_INICIAL_TOKEN.cor;
    let emanaAlfa: number = EMANACAO_INICIAL_TOKEN.alfa;

    /** Mostra na janela (botões, paletas e prévia) o que está escolhido agora. */
    function atualizarEscolha(): void {
        for (const botao of botoesTamanho) {
            const ligado = Number(botao.dataset.tamanho) === tamanho;
            botao.classList.toggle("ativo", ligado);
            botao.setAttribute("aria-pressed", String(ligado));
        }
        marcarEscolhida(amostras, cor);
        marcarEscolhida(amostrasBorda, corBorda);
        seletorCor.value = corCss(cor);
        seletorCorBorda.value = corCss(corBorda);
        const disco = previa.querySelector<HTMLElement>(".disco")!;
        pintarDisco(disco, cor, corBorda, imagem);
        botaoImagem.textContent = imagem ? "Alterar imagem…" : "Escolher imagem…";
        botaoSemImagem.hidden = imagem === null;
        disco.style.setProperty("--t", String(tamanho));
        previa.querySelector("small")!.textContent = `${tamanho}×${tamanho}`;
        // A emanação: as opções só aparecem com ela ligada.
        caixaEmana.checked = emana;
        opcoesEmana.hidden = !emana;
        campoMetros.value = String(casasParaMetros(emanaCasas));
        botaoMenosEmana.disabled = emanaCasas <= 1;
        botaoMaisEmana.disabled = emanaCasas >= MAX_EMANACAO_TOKEN;
        const transparencia = Math.round((1 - emanaAlfa) * 100); // (como no seletor de cor do app: 0% é opaco)
        faixaTransparencia.value = String(transparencia);
        valorTransparencia.textContent = `${transparencia}%`;
        marcarEscolhida(amostrasEmana, emanaCor);
        seletorCorEmana.value = corCss(emanaCor);
    }

    function fechar(): void {
        janela.hidden = true;
        token = null;
        document.removeEventListener("keydown", aoTeclar, true);
    }

    function salvar(): void {
        if (!token) return;
        const id = token.id;
        fechar();
        const emanacao: EmanacaoDoToken | null = emana ? { casas: emanaCasas, cor: emanaCor, alfa: emanaAlfa } : null;
        opcoes.aoSalvar(id, { nome: campoNome.value, size: tamanho, cor, corBorda, imagem, ficha: fichaEscolhida, emanacao });
    }

    /** Esc fecha SÓ esta janela (a captura impede que a bolsa por baixo também feche); Enter salva. */
    function aoTeclar(e: KeyboardEvent): void {
        // Com o editor de recorte da imagem aberto por cima, o Esc é DELE (cancela só o recorte).
        if (document.getElementById("editor-imagem")?.hidden === false) return;
        if (e.key === "Escape") {
            e.stopPropagation();
            if (painelAberto()) return fecharPainel(); // o 1º Esc fecha só o menu da ficha
            fechar();
        } else if (e.key === "Enter" && !e.isComposing && document.activeElement === campoNome) {
            e.preventDefault();
            salvar();
        }
    }

    campoNome.maxLength = MAX_CARACTERES_NOME_TOKEN; // o navegador corta ao digitar/colar (a regra também vale no estado)
    for (const botao of botoesTamanho) {
        botao.addEventListener("click", () => {
            tamanho = Number(botao.dataset.tamanho);
            atualizarEscolha();
        });
    }
    montarPaleta(amostras, (nova) => {
        cor = nova;
        atualizarEscolha();
    });
    montarPaleta(amostrasBorda, (nova) => {
        corBorda = nova;
        atualizarEscolha();
    });
    seletorCor.addEventListener("input", () => {
        cor = parseInt(seletorCor.value.slice(1), 16);
        atualizarEscolha();
    });
    seletorCorBorda.addEventListener("input", () => {
        corBorda = parseInt(seletorCorBorda.value.slice(1), 16);
        atualizarEscolha();
    });
    // --- A emanação ---
    caixaEmana.addEventListener("change", () => {
        emana = caixaEmana.checked;
        atualizarEscolha();
    });
    const mudarAlcance = (casas: number): void => {
        emanaCasas = Math.min(MAX_EMANACAO_TOKEN, Math.max(1, Math.round(casas)));
        atualizarEscolha();
    };
    botaoMenosEmana.addEventListener("click", () => mudarAlcance(emanaCasas - 1));
    botaoMaisEmana.addEventListener("click", () => mudarAlcance(emanaCasas + 1));
    campoMetros.addEventListener("change", () => mudarAlcance(metrosParaCasas(Number(campoMetros.value.replace(",", ".")))));
    campoMetros.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation(); // (Enter no campo só confirma o alcance: não salva a janela)
            campoMetros.blur();
        }
    });
    faixaTransparencia.addEventListener("input", () => {
        emanaAlfa = Math.min(ALFA_MAX_EMANACAO, Math.max(ALFA_MIN_EMANACAO, Math.round((1 - Number(faixaTransparencia.value) / 100) * 100) / 100));
        atualizarEscolha();
    });
    montarPaleta(amostrasEmana, (nova) => {
        emanaCor = nova;
        atualizarEscolha();
    });
    seletorCorEmana.addEventListener("input", () => {
        emanaCor = parseInt(seletorCorEmana.value.slice(1), 16);
        atualizarEscolha();
    });
    botaoImagem.addEventListener("click", async () => {
        const escolhido = await escolherArquivo(arquivo);
        const nova = escolhido ? await opcoes.editarImagem(escolhido, cor) : null;
        if (nova) {
            imagem = nova;
            atualizarEscolha();
        }
    });
    botaoSemImagem.addEventListener("click", () => {
        imagem = null;
        atualizarEscolha();
    });
    botaoCancelar.addEventListener("click", fechar);
    botaoSalvar.addEventListener("click", salvar);

    /** Sem maiúsculas nem acentos (a pesquisa de fichas ignora os dois). */
    function simplificar(texto: string): string {
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function painelAberto(): boolean {
        return !painelFicha.hidden;
    }
    function abrirPainel(): void {
        painelFicha.hidden = false;
        botaoFicha.setAttribute("aria-expanded", "true");
        campoBuscaFicha.value = "";
        montarLista();
        campoBuscaFicha.focus(); // a pesquisa já fica pronta para digitar
    }
    function fecharPainel(): void {
        painelFicha.hidden = true;
        botaoFicha.setAttribute("aria-expanded", "false");
    }

    /** O nome da ficha na lista (duas fichas com o mesmo nome: o número desempata). */
    function nomeDaFicha(id: number): string {
        const ficha = estado.fichas.find((f) => f.id === id);
        if (!ficha) return "Nenhuma";
        return estado.fichas.some((o) => o.id !== id && o.nome === ficha.nome) ? `${ficha.nome} (nº ${id})` : ficha.nome;
    }

    /** O botão do menu mostra a ficha escolhida; "+ Criar ficha" só aparece enquanto não há ficha. */
    function atualizarBotaoFicha(): void {
        botaoFicha.textContent = fichaEscolhida === null ? "Nenhuma" : nomeDaFicha(fichaEscolhida);
        botaoCriarFicha.hidden = fichaEscolhida !== null;
    }

    function escolherFicha(id: number | null): void {
        fichaEscolhida = id;
        atualizarBotaoFicha();
        fecharPainel();
        botaoFicha.focus();
    }

    /**
     * Refaz a LISTA do menu suspenso conforme a pesquisa: "Nenhuma" e as fichas (em ordem alfabética) cujo nome combina. A ficha escolhida vem marcada. Uma ficha ÚNICA que já tem OUTRO token fica
     * apagada, com o motivo na dica. Os nomes entram por textContent (nunca como HTML).
     */
    function montarLista(): void {
        const busca = simplificar(campoBuscaFicha.value.trim());
        const doToken = token?.copiaDe ?? token?.id ?? null;
        const todas = estado.fichas.toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id - b.id);
        const itens: HTMLLIElement[] = [];
        const novoItem = (rotulo: string, id: number | null, apagado: string | null): HTMLLIElement => {
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.textContent = rotulo;
            li.setAttribute("aria-selected", String(id === fichaEscolhida));
            if (apagado) {
                li.setAttribute("aria-disabled", "true");
                li.title = apagado;
            } else {
                li.addEventListener("click", () => escolherFicha(id));
            }
            return li;
        };
        if (busca === "") itens.push(novoItem("Nenhuma", null, null));
        for (const f of todas) {
            if (busca !== "" && !simplificar(f.nome).includes(busca)) continue;
            const ocupada = f.id === fichaEscolhida ? null : motivoFichaOcupada(f.id, doToken);
            itens.push(novoItem(ocupada ? `${nomeDaFicha(f.id)} (já ligada)` : nomeDaFicha(f.id), f.id, ocupada));
        }
        if (itens.length === 0) {
            const vazio = document.createElement("li");
            vazio.className = "sem-resultado";
            vazio.textContent = "Nenhuma ficha encontrada";
            itens.push(vazio);
        }
        listaFichas.replaceChildren(...itens);
    }

    botaoFicha.addEventListener("click", () => (painelAberto() ? fecharPainel() : abrirPainel()));
    campoBuscaFicha.addEventListener("input", montarLista); // a lista é filtrada a cada letra
    campoBuscaFicha.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            listaFichas.querySelector<HTMLElement>("li[role=option]:not([aria-disabled])")?.click(); // Enter escolhe o primeiro que sobrou
        }
    });
    botaoCriarFicha.addEventListener("click", () => {
        if (!token) return;
        const alvo = token;
        salvar(); // 1) salva o que já foi mexido (o nome, por exemplo: a ficha nasce com o nome NOVO)
        opcoes.aoCriarFicha(alvo); // 2) cria a ficha, liga e abre
    });

    return {
        editar(alvo, abrirCom) {
            token = alvo;
            fichaEscolhida = alvo.ficha !== null && estado.fichas.some((f) => f.id === alvo.ficha) ? alvo.ficha : null;
            fecharPainel();
            atualizarBotaoFicha();
            campoNome.value = alvo.nome;
            tamanho = alvo.size;
            cor = alvo.cor;
            corBorda = alvo.corBorda;
            imagem = alvo.imagem;
            emana = !!alvo.emanacao;
            emanaCasas = alvo.emanacao?.casas ?? EMANACAO_INICIAL_TOKEN.casas;
            emanaCor = alvo.emanacao?.cor ?? EMANACAO_INICIAL_TOKEN.cor;
            emanaAlfa = alvo.emanacao?.alfa ?? EMANACAO_INICIAL_TOKEN.alfa;
            atualizarEscolha();
            janela.hidden = false;
            document.addEventListener("keydown", aoTeclar, true);
            if (abrirCom?.focarFicha) {
                abrirPainel();
            } else {
                campoNome.focus();
                campoNome.select();
            }
        },
    };
}
