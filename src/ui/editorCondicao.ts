// =====================================================================
// EDITOR DE CONDIÇÃO (HTML): a janela que pede o NOME, o TEXTO DO BALÃO (o que aparece ao passar o mouse sobre o ícone, uma linha por item) e o ÍCONE de uma condição, para criar uma nova
// ou editar uma que já existe (inclusive as de fábrica). Só o mestre abre (a aba Condições da bolsa em tela cheia).
// O ícone é uma IMAGEM que o mestre escolhe: ela passa pelo editor de imagem dos tokens (recorte circular), que a reduz a um "print" de 256 px em WebP (poucos KB), mesmo que o arquivo
// seja enorme. Quem salva é o servidor (o navegador manda a condição pronta e ele confere de novo: `limparCondicao`).
// Fecha com Cancelar, Esc (só esta janela) ou o clique no fundo. Os textos entram por `value` e `textContent` (nunca como HTML).
// =====================================================================

import { MAX_CARACTERES_NOME_CONDICAO, MAX_LINHAS_DESCRICAO_CONDICAO } from "../config";
import { CONDICOES_DE_FABRICA, ehDeFabrica, limparCondicao, urlDoIcone, type Condicao } from "../condicoes";
import { escolherArquivo } from "./aparenciaToken";

export interface OpcoesEditorCondicao {
    /** Abre o editor de recorte da imagem (o mesmo dos tokens): devolve o "print" em WebP (texto "data:image/webp;base64,...") ou null se a pessoa cancelou. */
    editarImagem(arquivo: File, corFundo: number): Promise<string | null>;
}

export interface AbrirEditorCondicao {
    /** A condição que está sendo editada; sem ela, é uma condição NOVA. */
    condicao?: Condicao;
    /** Salvar: recebe a condição pronta (já conferida). */
    aoSalvar(condicao: Condicao): void;
}

export interface EditorCondicao {
    abrir(opcoes: AbrirEditorCondicao): void;
    readonly aberto: boolean;
}

const pegar = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Um código novo para uma condição criada: sem acento, único na prática (hora + sorteio). */
function novoId(): string {
    return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
}

export function criarEditorCondicao(opcoes: OpcoesEditorCondicao): EditorCondicao {
    const janela = pegar("editor-condicao");
    const titulo = pegar("editor-condicao-titulo");
    const campoNome = pegar<HTMLInputElement>("editor-condicao-nome");
    const campoDescricao = pegar<HTMLTextAreaElement>("editor-condicao-descricao");
    const imagemPrevia = pegar<HTMLImageElement>("editor-condicao-imagem");
    const semImagem = pegar("editor-condicao-sem-imagem");
    const botaoEscolher = pegar<HTMLButtonElement>("editor-condicao-escolher");
    const entradaArquivo = pegar<HTMLInputElement>("editor-condicao-arquivo");
    const aviso = pegar("editor-condicao-aviso");
    const botaoOriginal = pegar<HTMLButtonElement>("editor-condicao-original");
    const botaoSalvar = pegar<HTMLButtonElement>("editor-condicao-salvar");
    const botaoCancelar = pegar<HTMLButtonElement>("editor-condicao-cancelar");

    campoNome.maxLength = MAX_CARACTERES_NOME_CONDICAO;
    let atual: AbrirEditorCondicao | null = null;
    let idAtual = "";
    let imagemEscolhida: string | null = null; // o "print" novo (null = a condição continua com a imagem que já tinha: o PNG de fábrica, ou o "print" guardado)
    let imagemDaCondicao: string | null = null; // o "print" que a condição já tinha (nas criadas)

    function mostrarAviso(texto: string): void {
        aviso.textContent = texto;
        aviso.hidden = texto === "";
    }

    /** O ícone mostrado: o "print" novo, ou o que a condição já tem, ou nada (condição nova sem imagem). */
    function pintarIcone(): void {
        const url = imagemEscolhida ?? imagemDaCondicao ?? (idAtual !== "" && ehDeFabrica(idAtual) ? urlDoIcone(idAtual) : null);
        imagemPrevia.hidden = url === null;
        semImagem.hidden = url !== null;
        if (url !== null) imagemPrevia.src = url;
    }

    function fechar(): void {
        janela.hidden = true;
        atual = null;
    }

    function salvar(): void {
        const opcoesAtuais = atual;
        if (!opcoesAtuais) return;
        const nome = campoNome.value.trim();
        if (nome === "") return mostrarAviso("Escreva o nome da condição.");
        const imagem = imagemEscolhida ?? imagemDaCondicao; // (de fábrica sem imagem nova: fica sem o campo, e o ícone continua sendo o PNG)
        if (imagem === null && !ehDeFabrica(idAtual)) return mostrarAviso("Escolha uma imagem para o ícone.");
        const condicao = limparCondicao({
            id: idAtual,
            nome,
            descricao: campoDescricao.value.split("\n"),
            ...(imagem !== null && { imagem }),
            ...(opcoesAtuais.condicao?.visual !== undefined && { visual: opcoesAtuais.condicao.visual }),
        });
        if (!condicao) return mostrarAviso("Não foi possível salvar: confira o nome, o texto e a imagem.");
        fechar();
        opcoesAtuais.aoSalvar(condicao);
    }

    botaoEscolher.addEventListener("click", async () => {
        const arquivo = await escolherArquivo(entradaArquivo);
        if (!arquivo) return;
        mostrarAviso("");
        // O editor de recorte reduz fotos enormes e entrega só o "print" pequeno (WebP). O fundo branco é o do disco da condição no token.
        const print = await opcoes.editarImagem(arquivo, 0xffffff);
        if (print === null) return;
        imagemEscolhida = print;
        pintarIcone();
    });
    botaoOriginal.addEventListener("click", () => {
        const fabrica = CONDICOES_DE_FABRICA.find((c) => c.id === idAtual);
        if (!fabrica) return;
        campoNome.value = fabrica.nome;
        campoDescricao.value = fabrica.descricao.join("\n");
        imagemEscolhida = null;
        imagemDaCondicao = null; // (volta ao PNG de fábrica)
        pintarIcone();
        mostrarAviso("");
    });
    botaoSalvar.addEventListener("click", salvar);
    botaoCancelar.addEventListener("click", fechar);
    janela.addEventListener("pointerdown", (e) => {
        if (e.target === janela) fechar(); // o fundo escurecido
    });
    campoNome.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) salvar();
    });
    document.addEventListener(
        "keydown",
        (e) => {
            if (janela.hidden || e.key !== "Escape") return;
            if (document.getElementById("editor-imagem")?.hidden === false) return; // (o recorte da imagem está aberto por cima: o Esc é dele)
            e.stopPropagation(); // só esta janela fecha (a bolsa por baixo continua como está)
            fechar();
        },
        true,
    );

    return {
        abrir(opcoesAbrir) {
            atual = opcoesAbrir;
            const condicao = opcoesAbrir.condicao;
            idAtual = condicao?.id ?? novoId();
            imagemEscolhida = null;
            imagemDaCondicao = condicao?.imagem ?? null;
            titulo.textContent = condicao ? "Editar condição" : "Nova condição";
            campoNome.value = condicao?.nome ?? "";
            campoDescricao.value = condicao?.descricao.join("\n") ?? "";
            campoDescricao.dataset.max = String(MAX_LINHAS_DESCRICAO_CONDICAO);
            botaoOriginal.hidden = !condicao || !ehDeFabrica(condicao.id);
            mostrarAviso("");
            pintarIcone();
            janela.hidden = false;
            campoNome.focus();
            campoNome.select();
        },
        get aberto() {
            return !janela.hidden;
        },
    };
}
