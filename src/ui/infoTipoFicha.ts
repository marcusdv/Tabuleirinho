// =====================================================================
// A "TELINHA" QUE EXPLICA O TIPO DA FICHA (HTML): ao clicar na etiqueta do alto da janela da ficha (`#editor-ficha-tipo`), abre uma janelinha com a explicação completa do
// tipo dela: "Ficha Token Único" (tem recursos: um token só) ou "Ficha Multi Tokens" (sem recursos: vários tokens). A etiqueta guarda o tipo na classe `unica`.
// Fecha com o botão, com Esc ou clicando no fundo. O Esc é só dela (captura + `stopPropagation`): o editor de ficha por baixo ignora as teclas enquanto ela está aberta.
// Todo texto entra por `textContent`. A marcação e o CSS ficam no index.html (ids "info-tipo-ficha*").
// =====================================================================

const PARAGRAFOS_TOKEN_UNICO = [
    "Esta ficha tem pelo menos um recurso: uma variável escrita NOME::mín:inicial:máx, como PV, ouro ou flechas.",
    "Por isso ela só pode ser usada por um único token por cena (mapa). Em outra cena ela pode aparecer de novo, e o token de cada cena compartilha os mesmos recursos: é o mesmo personagem (o PV que cai numa cena cai nas outras).",
    "A barra de vida desse token mostra o valor da ficha ao vivo, e as ações Dano e Cura mudam o PV dela.",
    "É a ficha ideal para jogadores, chefões e personagens especiais do mestre.",
    "Para virar uma Ficha Multi Tokens, apague todos os recursos do texto.",
];

const PARAGRAFOS_MULTI_TOKENS = [
    "Esta ficha não tem recursos: só variáveis e rolagens.",
    "Por isso ela pode ser usada por quantos tokens você quiser. Cada token no tabuleiro guarda os seus próprios valores: o HP, por exemplo, é calculado na hora em que ele entra, lendo a variável PV da ficha.",
    "É a ficha ideal para monstros e criaturas que aparecem em grupo, como vários goblins.",
    "Para virar uma Ficha Token Único, crie um recurso no texto, como PV::0:44:44 (mínimo, inicial e máximo).",
];

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarInfoTipoFicha(): void {
    const janela = pegar("info-tipo-ficha");
    const titulo = pegar("info-tipo-ficha-titulo");
    const corpo = pegar("info-tipo-ficha-corpo");
    const botaoFechar = pegar<HTMLButtonElement>("info-tipo-ficha-fechar");
    // (há UMA etiqueta por janela de ficha, e as janelas extras nascem depois: por isso o clique é escutado no documento inteiro, e a etiqueta que vale é a clicada)
    let focoAnterior: HTMLElement | null = null; // quem tinha o foco antes de abrir (volta para ele ao fechar)

    function fechar(): void {
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        focoAnterior?.focus();
        focoAnterior = null;
    }

    function aoTeclar(e: KeyboardEvent): void {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // só esta janelinha fecha (a ficha por baixo continua aberta)
        fechar();
    }

    function abrir(etiqueta: HTMLElement): void {
        if (!janela.hidden) return;
        const unica = etiqueta.classList.contains("unica");
        titulo.textContent = unica ? "Ficha Token Único" : "Ficha Multi Tokens";
        corpo.replaceChildren(
            ...(unica ? PARAGRAFOS_TOKEN_UNICO : PARAGRAFOS_MULTI_TOKENS).map((texto) => {
                const p = document.createElement("p");
                p.textContent = texto;
                return p;
            }),
        );
        focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        janela.hidden = false;
        document.addEventListener("keydown", aoTeclar, true);
        botaoFechar.focus();
    }

    document.addEventListener("click", (e) => {
        const etiqueta = e.target instanceof Element ? e.target.closest<HTMLElement>("#editor-ficha-tipo") : null;
        if (etiqueta) abrir(etiqueta);
    });
    botaoFechar.addEventListener("click", fechar);
    janela.addEventListener("click", (e) => {
        if (e.target === janela) fechar(); // clicar no fundo escuro fecha
    });
}
