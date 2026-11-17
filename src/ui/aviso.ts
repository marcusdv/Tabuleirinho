// =====================================================================
// AVISO (HTML): um cartão curto no canto de baixo, à esquerda da coluna da direita, que some sozinho. Pode ter um BOTÃO de ação (ex.: "Desfazer").
// Só existe um aviso por vez: um novo substitui o anterior. Usado hoje pela previsão de colunas e linhas do mapa e pelo "Desfazer" de remover um token
// do tabuleiro; no futuro serve também para "O mestre está chamando para a cena X. Clique aqui para ir".
// Os textos entram por textContent (nunca como HTML). A marcação e o CSS ficam no index.html (#aviso).
// =====================================================================

export interface AcaoDoAviso {
    /** O texto do botão (ex.: "Desfazer"). */
    rotulo: string;
    /** O que acontece ao clicar (o aviso se fecha em seguida). */
    aoClicar(): void;
}

export interface OpcoesDoAviso {
    acao?: AcaoDoAviso;
    /** Quanto tempo fica na tela (milissegundos). */
    duracaoMs: number;
    /** Uma etiqueta do aviso, para `esconder(chave)` apagar SÓ este (e não outro aviso que tenha tomado o lugar). Ex.: "selecao". */
    chave?: string;
}

export interface Aviso {
    mostrar(texto: string, opcoes: OpcoesDoAviso): void;
    /** Esconde o aviso. Com `chave`, só se o aviso à vista for o desta chave. */
    esconder(chave?: string): void;
}

export function criarAviso(): Aviso {
    const caixa = document.getElementById("aviso") as HTMLElement;
    const texto = document.getElementById("aviso-texto") as HTMLElement;
    const botao = document.getElementById("aviso-acao") as HTMLButtonElement;
    let temporizador: number | undefined;
    let acaoAtual: (() => void) | null = null;
    let chaveAtual: string | undefined;

    function esconder(chave?: string): void {
        if (chave !== undefined && chave !== chaveAtual) return;
        window.clearTimeout(temporizador);
        chaveAtual = undefined;
        acaoAtual = null;
        caixa.hidden = true;
    }

    // Clicar no cartão (fora do botão) fecha; clicar no botão faz a ação e fecha.
    caixa.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button") === null) esconder();
    });
    botao.addEventListener("click", () => {
        const acao = acaoAtual;
        esconder();
        acao?.();
    });

    return {
        mostrar(mensagem, opcoes) {
            window.clearTimeout(temporizador);
            chaveAtual = opcoes.chave;
            texto.textContent = mensagem;
            acaoAtual = opcoes.acao ? opcoes.acao.aoClicar : null;
            botao.hidden = !opcoes.acao;
            botao.textContent = opcoes.acao?.rotulo ?? "";
            caixa.hidden = false;
            temporizador = window.setTimeout(() => esconder(), opcoes.duracaoMs);
        },
        esconder,
    };
}
