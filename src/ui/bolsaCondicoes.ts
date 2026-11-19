// =====================================================================
// A ABA "CONDIÇÕES" da bolsa em tela cheia (HTML em index.html, `#bolsa-condicoes`; só do MESTRE): a lista das condições da mesa, com o ícone e o texto do balão de cada uma.
// "+ Nova condição" e "Editar" abrem o formulário (ui/editorCondicao.ts); "Excluir" pede a confirmação (quem trata é o main.ts: a condição sai de todos os tokens que a tinham);
// "Restaurar as de fábrica" recria as de fábrica que foram excluídas. Quem guarda e avisa os outros é o servidor (o main.ts manda os pedidos); a lista (`CONDICOES`, em condicoes.ts)
// é a mesma que os menus e os tokens usam, e esta aba só a DESENHA.
// =====================================================================

import { MAX_CONDICOES } from "../config";
import { CONDICOES, CONDICOES_DE_FABRICA, ehDeFabrica, podeExcluirCondicao, urlDoIcone, type Condicao } from "../condicoes";
import { criarEditorCondicao } from "./editorCondicao";

export interface OpcoesBolsaCondicoes {
    /** O editor de recorte da imagem (o dos tokens). */
    editarImagem(arquivo: File, corFundo: number): Promise<string | null>;
    /** Salvar uma condição criada ou editada. */
    aoSalvar(condicao: Condicao): void;
    /** "Excluir": quem trata pede a confirmação e depois exclui. */
    aoExcluir(condicao: Condicao): void;
    /** "Restaurar as de fábrica". */
    aoRestaurar(): void;
}

export interface BolsaCondicoes {
    /** Redesenha a lista (a lista de condições mudou, ou a pesquisa). */
    atualizar(): void;
    /** Uma frase curta embaixo da barra (vazia = some). */
    mostrarAviso(texto: string, erro?: boolean): void;
}

const pegar = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
/** Minúsculas e sem acento (a pesquisa ignora os dois). */
const normalizar = (texto: string): string => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function criarBolsaCondicoes(opcoes: OpcoesBolsaCondicoes): BolsaCondicoes {
    const botaoNova = pegar<HTMLButtonElement>("bolsa-condicoes-nova");
    const campoBusca = pegar<HTMLInputElement>("bolsa-condicoes-busca");
    const botaoRestaurar = pegar<HTMLButtonElement>("bolsa-condicoes-restaurar");
    const aviso = pegar("bolsa-condicoes-aviso");
    const lista = pegar<HTMLUListElement>("bolsa-condicoes-lista");
    const editor = criarEditorCondicao({ editarImagem: opcoes.editarImagem });

    function mostrarAviso(texto: string, erro = false): void {
        aviso.textContent = texto;
        if (erro) aviso.dataset.erro = "";
        else delete aviso.dataset.erro;
    }

    function editar(condicao?: Condicao): void {
        editor.abrir({ condicao, aoSalvar: (c) => opcoes.aoSalvar(c) });
    }

    function atualizar(): void {
        const busca = normalizar(campoBusca.value.trim());
        const visiveis = busca === "" ? CONDICOES : CONDICOES.filter((c) => normalizar(c.nome).includes(busca) || normalizar(c.descricao.join(" ")).includes(busca));
        botaoNova.disabled = CONDICOES.length >= MAX_CONDICOES;
        botaoNova.title = botaoNova.disabled ? `A mesa já tem ${MAX_CONDICOES} condições (o máximo). Exclua alguma para criar outra.` : "Cria uma condição nova (nome, texto do balão e ícone)";
        const faltam = CONDICOES_DE_FABRICA.filter((f) => !CONDICOES.some((c) => c.id === f.id)).length;
        botaoRestaurar.disabled = faltam === 0;
        botaoRestaurar.textContent = faltam === 0 ? "Restaurar as de fábrica" : `Restaurar as de fábrica (${faltam})`;

        lista.replaceChildren();
        if (visiveis.length === 0) {
            const vazio = document.createElement("li");
            vazio.className = "condicao-vazia";
            vazio.textContent = busca === "" ? "Nenhuma condição. Crie uma ou restaure as de fábrica." : "Nenhuma condição com esse nome.";
            lista.append(vazio);
            return;
        }
        for (const condicao of visiveis) {
            const item = document.createElement("li");
            item.className = "condicao-item";
            item.dataset.id = condicao.id;

            const disco = document.createElement("span");
            disco.className = "condicao-disco";
            const imagem = document.createElement("img");
            imagem.src = urlDoIcone(condicao.id);
            imagem.alt = "";
            imagem.draggable = false;
            disco.append(imagem);

            const texto = document.createElement("div");
            texto.className = "condicao-texto";
            const nome = document.createElement("strong");
            nome.textContent = condicao.nome; // (o nome é do usuário: só como texto)
            if (ehDeFabrica(condicao.id)) {
                const etiqueta = document.createElement("small");
                etiqueta.textContent = "de fábrica";
                nome.append(" ", etiqueta);
            }
            const resumo = document.createElement("span");
            resumo.className = "condicao-resumo";
            resumo.textContent = condicao.descricao.length > 0 ? condicao.descricao.join(" · ") : "Sem texto no balão.";
            texto.append(nome, resumo);

            const botoes = document.createElement("div");
            botoes.className = "condicao-botoes";
            const botaoEditar = document.createElement("button");
            botaoEditar.type = "button";
            botaoEditar.textContent = "Editar";
            botaoEditar.addEventListener("click", (e) => {
                e.stopPropagation();
                editar(condicao);
            });
            const botaoExcluir = document.createElement("button");
            botaoExcluir.type = "button";
            botaoExcluir.className = "excluir";
            botaoExcluir.textContent = "Excluir";
            if (!podeExcluirCondicao(condicao.id)) {
                botaoExcluir.disabled = true; // (o Morto: o jogo a usa para o X vermelho do token)
                botaoExcluir.title = "A condição Morto não pode ser excluída: o jogo a usa para o X vermelho do token. Dá para editar o nome, o texto e o ícone.";
            }
            botaoExcluir.addEventListener("click", (e) => {
                e.stopPropagation();
                opcoes.aoExcluir(condicao);
            });
            botoes.append(botaoEditar, botaoExcluir);

            item.append(disco, texto, botoes);
            item.addEventListener("click", () => editar(condicao)); // (clicar no cartão também edita)
            lista.append(item);
        }
    }

    botaoNova.addEventListener("click", () => editar());
    botaoRestaurar.addEventListener("click", () => opcoes.aoRestaurar());
    campoBusca.addEventListener("input", atualizar);
    atualizar();

    return { atualizar, mostrarAviso };
}
