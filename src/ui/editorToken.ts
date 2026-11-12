// =====================================================================
// EDITOR DE TOKEN (HTML): janela para mudar NOME, TAMANHO e as duas CORES (preenchimento e borda) de
// um token que já existe. Abre pelo "Editar token…" do menu da ficha (na bolsa) e pelo "Editar token"
// da lista de ações do token (no mapa). A imagem tem a sua própria janela (ui/editorImagem.ts).
// A marcação e o CSS ficam no index.html (ids "editor-token-*").
// =====================================================================

import { MAX_CARACTERES_NOME_TOKEN } from "../config";
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
}

export interface EditorToken {
    /** Abre a janela com os valores atuais do token. */
    editar(token: Token): void;
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
    const botaoImagem = pegar<HTMLButtonElement>("editor-token-imagem");
    const botaoSemImagem = pegar<HTMLButtonElement>("editor-token-sem-imagem");
    const arquivo = pegar<HTMLInputElement>("editor-token-arquivo");
    const previa = pegar("editor-token-previa");
    const botaoCancelar = pegar<HTMLButtonElement>("editor-token-cancelar");
    const botaoSalvar = pegar<HTMLButtonElement>("editor-token-salvar");

    // O token em edição e os valores que o usuário está escolhendo (só vão para o token ao salvar).
    let token: Token | null = null;
    let tamanho = 1;
    let cor = 0;
    let corBorda = 0;
    let imagem: string | null = null; // a imagem escolhida (só vai para o token ao salvar)

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
        opcoes.aoSalvar(id, { nome: campoNome.value, size: tamanho, cor, corBorda, imagem });
    }

    /** Esc fecha SÓ esta janela (a captura impede que a bolsa por baixo também feche); Enter salva. */
    function aoTeclar(e: KeyboardEvent): void {
        // Com o editor de recorte da imagem aberto por cima, o Esc é DELE (cancela só o recorte).
        if (document.getElementById("editor-imagem")?.hidden === false) return;
        if (e.key === "Escape") {
            e.stopPropagation();
            fechar();
        } else if (e.key === "Enter" && document.activeElement === campoNome) {
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

    return {
        editar(alvo) {
            token = alvo;
            campoNome.value = alvo.nome;
            tamanho = alvo.size;
            cor = alvo.cor;
            corBorda = alvo.corBorda;
            imagem = alvo.imagem;
            atualizarEscolha();
            janela.hidden = false;
            document.addEventListener("keydown", aoTeclar, true);
            campoNome.focus();
            campoNome.select();
        },
    };
}
