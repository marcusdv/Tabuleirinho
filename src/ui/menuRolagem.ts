// =====================================================================
// O MENU DE ROLAGEM (HTML): o que abre com o CLIQUE DIREITO num dado ou numa rolagem (botões de rolagem da ficha e dados do painel de Dados). Oferece as duas formas de rolar:
//   - LIVRE: como sempre, todos veem o resultado no chat;
//   - MODO MESTRE: só o(s) mestre(s) e quem rolou veem (para o próprio mestre, só ele vê). Quem decide e filtra é o SERVIDOR (`avisarMensagem`, em servidor/visao.ts);
//     aqui só se escolhe e se manda `secreta: true` no pedido.
// Um menu só para o site todo (criado na primeira vez): fecha ao escolher, ao clicar fora, com Esc, ao rolar a tela ou ao mudar o tamanho da janela. Só texto puro (`textContent`).
// =====================================================================

/** O texto do "modo mestre" depende de quem está olhando: o mestre rola só para si; o jogador, para o mestre (e ele mesmo vê). */
const souMestre = (): boolean => !document.body.classList.contains("jogador");

let menu: HTMLDivElement | null = null;
let aoFechar: (() => void) | null = null;

/** Fecha o menu (se está aberto) e tira os "ouvintes" que ele pôs na página. */
export function fecharMenuDeRolagem(): void {
    if (menu) menu.hidden = true;
    aoFechar?.();
    aoFechar = null;
}

/**
 * Abre o menu junto ao ponto (x, y) da tela (o do clique direito); `aoEscolher(secreta)` roda UMA vez com a escolha (`true` = modo mestre).
 * Fica sempre dentro da janela do navegador.
 */
export function abrirMenuDeRolagem(x: number, y: number, aoEscolher: (secreta: boolean) => void): void {
    fecharMenuDeRolagem();
    if (!menu) {
        menu = document.createElement("div");
        menu.id = "menu-rolagem";
        menu.setAttribute("role", "menu");
        menu.hidden = true;
        document.body.append(menu);
    }
    const caixa = menu;
    const item = (titulo: string, detalhe: string, secreta: boolean): HTMLButtonElement => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.setAttribute("role", "menuitem");
        botao.dataset.modo = secreta ? "mestre" : "livre";
        const t = document.createElement("span");
        t.className = "menu-rolagem-titulo";
        t.textContent = titulo;
        const d = document.createElement("span");
        d.className = "menu-rolagem-detalhe";
        d.textContent = detalhe;
        botao.append(t, d);
        botao.addEventListener("click", () => {
            fecharMenuDeRolagem();
            aoEscolher(secreta);
        });
        return botao;
    };
    caixa.replaceChildren(
        item("Rolar livre", "todos veem o resultado", false),
        item("Rolar em modo mestre", souMestre() ? "só você vê o resultado" : "só o mestre e você veem o resultado", true),
    );
    // Põe o menu: mede com ele visível e depois o encosta no ponto do clique, sem passar das bordas da janela.
    caixa.style.left = "0px";
    caixa.style.top = "0px";
    caixa.hidden = false;
    const margem = 6;
    caixa.style.left = `${Math.max(margem, Math.min(x, window.innerWidth - caixa.offsetWidth - margem))}px`;
    caixa.style.top = `${Math.max(margem, Math.min(y, window.innerHeight - caixa.offsetHeight - margem))}px`;
    caixa.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });

    // Fechar: clique fora (na fase de captura, antes de a página reagir), Esc, rolar, redimensionar ou perder o foco da janela do navegador.
    const foraDoMenu = (e: Event): void => {
        if (!caixa.contains(e.target as Node)) fecharMenuDeRolagem();
    };
    const teclou = (e: KeyboardEvent): void => {
        if (e.key === "Escape") {
            e.stopPropagation(); // (o Esc fecha só o menu, não a janela da ficha que está por baixo)
            fecharMenuDeRolagem();
        }
    };
    document.addEventListener("pointerdown", foraDoMenu, true);
    document.addEventListener("keydown", teclou, true);
    window.addEventListener("resize", fecharMenuDeRolagem);
    window.addEventListener("blur", fecharMenuDeRolagem);
    document.addEventListener("scroll", fecharMenuDeRolagem, true);
    aoFechar = () => {
        document.removeEventListener("pointerdown", foraDoMenu, true);
        document.removeEventListener("keydown", teclou, true);
        window.removeEventListener("resize", fecharMenuDeRolagem);
        window.removeEventListener("blur", fecharMenuDeRolagem);
        document.removeEventListener("scroll", fecharMenuDeRolagem, true);
    };
}
