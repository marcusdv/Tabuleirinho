// =====================================================================
// EDITOR DE GRUPO (HTML): a janelinha que pede o NOME e a COR de um grupo (criar ou editar). Os grupos organizam tokens e fichas
// (ver `Grupo` em estado.ts). Ao editar, também há o botão "Excluir grupo" (os itens do grupo NÃO são apagados).
// Fecha com Cancelar, Esc (só esta janela; o Esc é capturado antes do resto) ou o clique no fundo. O nome entra por `value`/`textContent`.
// =====================================================================

import { COR_INICIAL_GRUPO, MAX_CARACTERES_NOME_GRUPO } from "../config";
import type { Grupo } from "../estado";
import { corCss, marcarEscolhida, montarPaleta } from "./aparenciaToken";

export interface AbrirEditorGrupo {
    /** O grupo que está sendo editado; sem ele, é um grupo NOVO. */
    grupo?: Grupo;
    /** Salvar: recebe o nome (ainda sem limpar: o estado/servidor o limpam) e a cor. */
    aoSalvar(nome: string, cor: number): void;
    /** "Excluir grupo" (só ao editar): quem trata pede a confirmação. */
    aoExcluir?(): void;
}

export interface EditorGrupo {
    abrir(opcoes: AbrirEditorGrupo): void;
    readonly aberto: boolean;
}

const pegar = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function criarEditorGrupo(): EditorGrupo {
    const janela = pegar("editor-grupo");
    const titulo = pegar("editor-grupo-titulo");
    const campoNome = pegar<HTMLInputElement>("editor-grupo-nome");
    const amostras = pegar("editor-grupo-amostras");
    const seletorCor = pegar<HTMLInputElement>("editor-grupo-cor");
    const botaoSalvar = pegar<HTMLButtonElement>("editor-grupo-salvar");
    const botaoCancelar = pegar<HTMLButtonElement>("editor-grupo-cancelar");
    const botaoExcluir = pegar<HTMLButtonElement>("editor-grupo-excluir");

    campoNome.maxLength = MAX_CARACTERES_NOME_GRUPO;
    let cor = COR_INICIAL_GRUPO;
    let atual: AbrirEditorGrupo | null = null;

    const escolher = (nova: number): void => {
        cor = nova;
        marcarEscolhida(amostras, cor);
        seletorCor.value = corCss(cor);
    };
    montarPaleta(amostras, escolher);
    seletorCor.addEventListener("input", () => escolher(parseInt(seletorCor.value.slice(1), 16)));

    function fechar(): void {
        janela.hidden = true;
        atual = null;
    }
    function salvar(): void {
        const opcoes = atual;
        if (!opcoes) return;
        fechar();
        opcoes.aoSalvar(campoNome.value, cor);
    }

    botaoSalvar.addEventListener("click", salvar);
    botaoCancelar.addEventListener("click", fechar);
    botaoExcluir.addEventListener("click", () => {
        const opcoes = atual;
        fechar();
        opcoes?.aoExcluir?.();
    });
    janela.addEventListener("pointerdown", (e) => {
        if (e.target === janela) fechar(); // o fundo escurecido
    });
    campoNome.addEventListener("keydown", (e) => {
        if (e.key === "Enter") salvar();
    });
    document.addEventListener(
        "keydown",
        (e) => {
            if (janela.hidden || e.key !== "Escape") return;
            e.stopPropagation(); // só esta janela fecha (a bolsa por baixo continua como está)
            fechar();
        },
        true,
    );

    return {
        abrir(opcoes) {
            atual = opcoes;
            titulo.textContent = opcoes.grupo ? "Editar grupo" : "Novo grupo";
            campoNome.value = opcoes.grupo?.nome ?? "";
            escolher(opcoes.grupo?.cor ?? COR_INICIAL_GRUPO);
            botaoExcluir.hidden = !opcoes.grupo;
            janela.hidden = false;
            campoNome.focus();
            campoNome.select();
        },
        get aberto() {
            return !janela.hidden;
        },
    };
}
