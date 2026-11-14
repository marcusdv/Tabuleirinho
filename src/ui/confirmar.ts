// =====================================================================
// CAIXA DE CONFIRMAR (HTML): uma janela do próprio jogo, no lugar da caixa do navegador (`window.confirm`), para perguntar antes de
// algo que NÃO se desfaz (ex.: excluir um token). Mostra um título, uma mensagem e dois botões: "Cancelar" (que já vem selecionado,
// porque o perigo é confirmar sem querer) e o botão de confirmar, em vermelho.
//
//   const sim = await confirmacao.perguntar({ titulo: "Excluir token", mensagem: "…", confirmar: "Excluir" });
//
// Fecha com o botão, com Esc (= cancelar) ou clicando no fundo escuro (= cancelar). O Esc é só dela: a captura impede que a janela ou
// o menu que está por baixo também feche. A marcação e o CSS ficam no index.html (ids "confirmar-*").
// =====================================================================

export interface PerguntaConfirmacao {
    titulo: string;
    /** O texto da pergunta. `\n` quebra a linha. Entra por textContent (nunca como HTML): pode ter o nome de um token. */
    mensagem: string;
    /** O texto do botão que confirma (ex.: "Excluir"). */
    confirmar: string;
    /** Opcional: um TERCEIRO botão, em dourado, entre "Cancelar" e o de confirmar (ex.: "Salvar e fechar"). Só `escolher` o diferencia. */
    alternativa?: string;
}

export type RespostaConfirmacao = "confirmar" | "alternativa" | "cancelar";

export interface Confirmacao {
    /** Mostra a caixa e espera: devolve true se a pessoa confirmou, false se cancelou (botão, Esc ou clique no fundo). */
    perguntar(pergunta: PerguntaConfirmacao): Promise<boolean>;
    /** Como `perguntar`, mas diz QUAL botão foi (o terceiro, `alternativa`, só aparece se a pergunta tiver esse texto). */
    escolher(pergunta: PerguntaConfirmacao): Promise<RespostaConfirmacao>;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarConfirmacao(): Confirmacao {
    const janela = pegar("confirmar");
    const titulo = pegar("confirmar-titulo");
    const mensagem = pegar("confirmar-mensagem");
    const botaoCancelar = pegar<HTMLButtonElement>("confirmar-cancelar");
    const botaoConfirmar = pegar<HTMLButtonElement>("confirmar-ok");
    const botaoAlternativa = pegar<HTMLButtonElement>("confirmar-alternativa");

    let resolver: ((resposta: RespostaConfirmacao) => void) | null = null;
    let focoAnterior: HTMLElement | null = null; // quem tinha o foco antes de abrir (volta para ele ao fechar)

    /** Fecha a janela e responde a quem perguntou. */
    function terminar(resposta: RespostaConfirmacao): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        const responder = resolver;
        resolver = null;
        focoAnterior?.focus();
        focoAnterior = null;
        responder?.(resposta);
    }

    function aoTeclar(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation(); // só esta caixa fecha (a janela ou o menu que está por baixo continuam como estão)
            terminar("cancelar");
        } else if (e.key === "Tab") {
            // O foco fica preso nos botões (a caixa é "modal": o resto da página não pode ser alcançado por baixo).
            e.preventDefault();
            const botoes = [botaoCancelar, ...(botaoAlternativa.hidden ? [] : [botaoAlternativa]), botaoConfirmar];
            const atual = botoes.indexOf(document.activeElement as HTMLButtonElement);
            botoes[(atual + (e.shiftKey ? -1 : 1) + botoes.length) % botoes.length].focus();
        }
    }

    botaoCancelar.addEventListener("click", () => terminar("cancelar"));
    botaoAlternativa.addEventListener("click", () => terminar("alternativa"));
    botaoConfirmar.addEventListener("click", () => terminar("confirmar"));
    janela.addEventListener("click", (e) => {
        if (e.target === janela) terminar("cancelar"); // clicou no fundo escuro, fora da caixa
    });

    function escolher(pergunta: PerguntaConfirmacao): Promise<RespostaConfirmacao> {
            if (resolver) terminar("cancelar"); // já havia uma aberta: cancela a antiga
            titulo.textContent = pergunta.titulo;
            mensagem.textContent = pergunta.mensagem;
            botaoConfirmar.textContent = pergunta.confirmar;
            botaoAlternativa.hidden = !pergunta.alternativa;
            janela.classList.toggle("com-alternativa", Boolean(pergunta.alternativa)); // (com 3 botões, eles se espalham: Cancelar à esquerda, o principal à direita)
            botaoAlternativa.textContent = pergunta.alternativa ?? "";
            const resposta = new Promise<RespostaConfirmacao>((resolve) => (resolver = resolve));
            focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            janela.hidden = false;
            document.addEventListener("keydown", aoTeclar, true);
            botaoCancelar.focus(); // começa em "Cancelar": confirmar exige uma ação de propósito
            return resposta;
    }

    return {
        escolher,
        perguntar: async (pergunta) => (await escolher(pergunta)) === "confirmar",
    };
}
