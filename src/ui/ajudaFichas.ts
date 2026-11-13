// =====================================================================
// INSTRUÇÕES DAS FICHAS (HTML): a janela que explica como escrever VARIÁVEIS e ROLAGENS numa ficha, com exemplos. Abre pelos botões que
// têm o atributo `data-abrir-ajuda-fichas`: o botão "Instruções" ao lado de "+ Criar ficha" (aba Fichas) e o link "Ver todas as
// instruções" do painel lateral do editor de ficha. Fecha com o botão, com Esc ou clicando no fundo escuro. O Esc é só dela (captura +
// `stopPropagation`): o editor de ficha que pode estar por baixo ignora as teclas enquanto esta janela está aberta.
//
// É só texto fixo: a marcação e o CSS ficam no index.html (ids "ajuda-fichas-*").
// =====================================================================

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarAjudaFichas(): void {
    const janela = pegar("ajuda-fichas");
    const botaoFechar = pegar<HTMLButtonElement>("ajuda-fichas-fechar");
    let focoAnterior: HTMLElement | null = null; // quem tinha o foco antes de abrir (volta para ele ao fechar)

    function fechar(): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        focoAnterior?.focus();
        focoAnterior = null;
    }

    function aoTeclar(e: KeyboardEvent): void {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // só esta janela fecha (o editor de ficha por baixo continua aberto)
        fechar();
    }

    function abrir(): void {
        if (!janela.hidden) return;
        focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        janela.hidden = false;
        document.addEventListener("keydown", aoTeclar, true);
        botaoFechar.focus();
    }

    for (const botao of document.querySelectorAll<HTMLElement>("[data-abrir-ajuda-fichas]")) botao.addEventListener("click", abrir);
    botaoFechar.addEventListener("click", fechar);
    janela.addEventListener("click", (e) => {
        if (e.target === janela) fechar(); // clicou no fundo escuro, fora da caixa
    });
}
