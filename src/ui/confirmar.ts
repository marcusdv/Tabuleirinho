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
}

export interface Confirmacao {
    /** Mostra a caixa e espera: devolve true se a pessoa confirmou, false se cancelou (botão, Esc ou clique no fundo). */
    perguntar(pergunta: PerguntaConfirmacao): Promise<boolean>;
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

    let resolver: ((confirmou: boolean) => void) | null = null;
    let focoAnterior: HTMLElement | null = null; // quem tinha o foco antes de abrir (volta para ele ao fechar)

    /** Fecha a janela e responde a quem perguntou. */
    function terminar(confirmou: boolean): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        const responder = resolver;
        resolver = null;
        focoAnterior?.focus();
        focoAnterior = null;
        responder?.(confirmou);
    }

    function aoTeclar(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation(); // só esta caixa fecha (a janela ou o menu que está por baixo continuam como estão)
            terminar(false);
        } else if (e.key === "Tab") {
            // O foco fica preso nos dois botões (a caixa é "modal": o resto da página não pode ser alcançado por baixo).
            e.preventDefault();
            (document.activeElement === botaoCancelar ? botaoConfirmar : botaoCancelar).focus();
        }
    }

    botaoCancelar.addEventListener("click", () => terminar(false));
    botaoConfirmar.addEventListener("click", () => terminar(true));
    janela.addEventListener("click", (e) => {
        if (e.target === janela) terminar(false); // clicou no fundo escuro, fora da caixa
    });

    return {
        perguntar(pergunta) {
            if (resolver) terminar(false); // já havia uma aberta: cancela a antiga
            titulo.textContent = pergunta.titulo;
            mensagem.textContent = pergunta.mensagem;
            botaoConfirmar.textContent = pergunta.confirmar;
            const resposta = new Promise<boolean>((resolve) => (resolver = resolve));
            focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            janela.hidden = false;
            document.addEventListener("keydown", aoTeclar, true);
            botaoCancelar.focus(); // começa em "Cancelar": confirmar exige uma ação de propósito
            return resposta;
        },
    };
}
