// =====================================================================
// MENU DO TOKEN (HTML): o que aparece ao clicar com o botão DIREITO num token.
//
// Fluxo:
//   1) clique direito no token -> abrir(id): aparecem botões ACIMA do token (um pouco afastados dele):
//        - no canto superior ESQUERDO, uma LISTA de ações, de cima para baixo:
//            [ Add condição ]   <- primeiro item
//            [ Add dano ]       <- provisório, sem função ainda
//            [ Add cura ]       <- provisório, sem função ainda
//        - no canto superior DIREITO, a engrenagem.
//   2) clique na engrenagem     -> abre/fecha o painel da ENGRENAGEM ("Editar token", "Guardar na bolsa" e "Excluir token"; o primeiro abre a
//                                  janela de edição de nome, tamanho e cores; novas opções entram aqui);
//      clique em "Add condição"   -> abre/fecha o painel de CONDIÇÕES.
//      (Só um painel fica aberto por vez.)
//   3) no painel de condições, clicar numa condição a ADICIONA ao token;
//      clicar de novo numa condição já ativa a REMOVE.
//
// REGRA DOS PAINÉIS: todos abrem PARA CIMA (acima do botão que os abre), para nunca cobrirem
// o token. A altura é limitada ao espaço livre acima (o conteúdo rola se não couber)
// e o painel só vai para BAIXO se acima não houver espaço útil. Vale para qualquer
// painel novo: é só registrá-lo em `paineis` e ele usa o mesmo posicionamento.
// A marcação HTML e o CSS ficam no index.html; os botões das condições são
// criados aqui a partir do catálogo (condicoes.ts).
// =====================================================================

import { CONDICOES, urlDoIcone } from "../condicoes";
import { AFASTAMENTO_OPCOES_TOKEN, ALTURA_MIN_PAINEL, DISTANCIA_PAINEL } from "../config";
import { limitar } from "../coordenadas";
import { buscarToken } from "../estado";
import type { DicaCondicao } from "./dicaCondicao";

export interface OpcoesMenuToken {
    /** Balão que descreve uma condição quando o mouse passa por cima dela. */
    dica: DicaCondicao;
    /** Onde (em pixels da tela) está o bloco de um token: canto superior esquerdo e largura. */
    ancora(id: number): { x: number; y: number; largura: number } | null;
    /** Clicou em "Editar token" (no painel da engrenagem): abrir a janela de edição (nome, tamanho e cores) deste token. */
    aoEditar(id: number): void;
    /** Clicou em "Guardar na bolsa" (no painel da engrenagem): tirar o token do mapa e guardá-lo na bolsa. */
    aoGuardar(id: number): void;
    /**
     * Clicou em "Excluir token" (no painel da engrenagem). Quem trata mostra a caixa de confirmação e devolve (depois da resposta)
     * true se o token foi (ou será) excluído, e então o menu fecha; false se a pessoa desistiu.
     */
    aoExcluir(id: number): Promise<boolean>;
    /** Clicou numa condição: liga se estava desligada, desliga se estava ligada. */
    aoAlternarCondicao(id: number, condicaoId: string): void;
}

export interface MenuToken {
    /** Mostra os botões do token (com os painéis fechados). */
    abrir(id: number): void;
    /** Recalcula textos, botões e posição (após o token mudar). */
    atualizar(): void;
    /** Esconde tudo. */
    fechar(): void;
}

type Painel = "engrenagem" | "condicoes";

const LADO_ENGRENAGEM = 28; // px, igual ao CSS (largura da engrenagem)
const VAO_ENGRENAGEM = 6; // px entre a lista de ações e a engrenagem quando ela vai para o lado da lista
const MARGEM_JANELA = 6; // px mínimos entre os elementos e a borda da janela

export function criarMenuToken(opcoes: OpcoesMenuToken): MenuToken {
    const acoes = document.getElementById("acoes-token") as HTMLDivElement; // a lista de ações (canto superior esquerdo)
    const engrenagem = document.getElementById("engrenagem") as HTMLButtonElement;
    const botaoCondicoes = document.getElementById("botao-condicoes") as HTMLButtonElement;
    const botaoEditar = document.getElementById("botao-editar-token") as HTMLButtonElement;
    const botaoGuardar = document.getElementById("botao-guardar-token") as HTMLButtonElement;
    const botaoExcluir = document.getElementById("botao-excluir-token") as HTMLButtonElement;

    const menuEngrenagem = document.getElementById("menu-token") as HTMLDivElement;
    const titulo = document.getElementById("menu-token-titulo") as HTMLElement;

    const menuCondicoes = document.getElementById("menu-condicoes") as HTMLDivElement;
    const gradeCondicoes = document.getElementById("grade-condicoes") as HTMLDivElement;

    // Todos os painéis do menu. Um painel NOVO só precisa ser registrado aqui para abrir
    // para cima, rolar se faltar espaço e fechar junto com os outros.
    const paineis: Record<Painel, HTMLElement> = { engrenagem: menuEngrenagem, condicoes: menuCondicoes };

    // Id do token cujas opções estão abertas (null = nada aberto) e qual painel está aberto.
    let tokenAberto: number | null = null;
    let painelAberto: Painel | null = null;

    // --- Botões das condições: criados uma vez, a partir do catálogo ---
    // Guardados por id para marcar quais estão ativas no token aberto.
    const botoesCondicao = new Map<string, HTMLButtonElement>();
    for (const condicao of CONDICOES) {
        const botao = document.createElement("button");
        botao.className = "condicao";
        // Sem "title": o balão nativo do navegador competiria com a nossa descrição.
        botao.setAttribute("aria-label", condicao.nome);

        const imagem = document.createElement("img");
        imagem.src = urlDoIcone(condicao.id);
        imagem.alt = ""; // decorativa: o nome já está escrito logo abaixo
        imagem.draggable = false;

        const rotulo = document.createElement("span");
        rotulo.textContent = condicao.nome;

        botao.append(imagem, rotulo);
        botao.addEventListener("click", () => {
            if (tokenAberto !== null) opcoes.aoAlternarCondicao(tokenAberto, condicao.id);
        });
        // Passar o mouse mostra a descrição ao lado do painel; sair a esconde.
        botao.addEventListener("mouseenter", () => opcoes.dica.mostrar(condicao.id, menuCondicoes, botao));
        botao.addEventListener("mouseleave", () => opcoes.dica.esconder(menuCondicoes));
        gradeCondicoes.appendChild(botao);
        botoesCondicao.set(condicao.id, botao);
    }
    // Ao rolar a grade, a descrição aberta ficaria alinhada a um botão que mudou de lugar: some.
    gradeCondicoes.addEventListener("scroll", () => opcoes.dica.esconder(menuCondicoes));

    /** Atualiza o título e as condições marcadas. */
    function atualizarConteudo(): void {
        if (tokenAberto === null) return;
        const token = buscarToken(tokenAberto);
        if (!token) return fechar();

        // Painel da engrenagem: o título é o nome do token.
        titulo.textContent = token.nome;

        // Painel de condições: destaca as que o token já sofre.
        for (const [id, botao] of botoesCondicao) {
            const ativa = token.condicoes.includes(id);
            botao.classList.toggle("ativa", ativa);
            botao.setAttribute("aria-pressed", String(ativa)); // acessibilidade
        }
    }

    /**
     * Coloca um painel ACIMA dos botões, alinhado à esquerda deles, dentro da janela.
     * A altura é limitada ao espaço livre acima (o conteúdo rola se não couber).
     * Só vai para BAIXO dos botões se acima não houver espaço útil e embaixo houver mais.
     */
    function posicionarPainel(painel: HTMLElement, esquerda: number, topoBotoes: number, alturaBotoes: number): void {
        // Mede a altura NATURAL (sem limite) para decidir onde ele fica e quão alto.
        painel.style.maxHeight = "none";
        const natural = painel.offsetHeight;
        const largura = painel.offsetWidth;

        // Espaço livre acima e abaixo dos botões, já descontando o vão e a margem da janela.
        const espacoAcima = topoBotoes - DISTANCIA_PAINEL - MARGEM_JANELA;
        const espacoAbaixo = window.innerHeight - (topoBotoes + alturaBotoes) - DISTANCIA_PAINEL - MARGEM_JANELA;

        // Regra geral: PARA CIMA. Vai para baixo só se acima não couber nem a altura mínima útil
        // (ou o painel inteiro, se for menor que isso) e embaixo houver mais espaço.
        const abaixo = espacoAcima < Math.min(natural, ALTURA_MIN_PAINEL) && espacoAbaixo > espacoAcima;
        const disponivel = abaixo ? espacoAbaixo : espacoAcima;
        const altura = Math.min(natural, Math.max(disponivel, ALTURA_MIN_PAINEL));

        painel.style.maxHeight = `${altura}px`; // menor que a natural: o conteúdo rola dentro do painel
        const alturaFinal = painel.offsetHeight;

        const x = limitar(esquerda, MARGEM_JANELA, window.innerWidth - largura - MARGEM_JANELA);
        const y = abaixo ? topoBotoes + alturaBotoes + DISTANCIA_PAINEL : topoBotoes - DISTANCIA_PAINEL - alturaFinal;
        painel.style.left = `${x}px`;
        painel.style.top = `${Math.max(MARGEM_JANELA, y)}px`;
    }

    /** Coloca os botões (e o painel aberto) junto do token, dentro da janela. */
    function reposicionar(): void {
        if (tokenAberto === null) return;
        const ancora = opcoes.ancora(tokenAberto);
        if (!ancora) return fechar();

        // Todos os botões ficam ACIMA do token, afastados dele por AFASTAMENTO_OPCOES_TOKEN
        // (a base de cada um está nessa distância do topo do bloco) e sempre dentro da janela.
        //
        // 1) A LISTA de ações no canto superior ESQUERDO: alinhada à borda esquerda do token,
        //    crescendo para cima (o último item fica mais perto do token).
        const larguraLista = acoes.offsetWidth;
        const alturaLista = acoes.offsetHeight;
        const esquerdaLista = limitar(ancora.x, MARGEM_JANELA, window.innerWidth - larguraLista - MARGEM_JANELA);
        const topoLista = limitar(ancora.y - AFASTAMENTO_OPCOES_TOKEN - alturaLista, MARGEM_JANELA, window.innerHeight - alturaLista - MARGEM_JANELA);
        acoes.style.left = `${esquerdaLista}px`;
        acoes.style.top = `${topoLista}px`;

        // 2) A ENGRENAGEM no canto superior DIREITO: alinhada à borda direita do token. Num token
        //    estreito (ex.: 1x1) a lista chega até lá; então a engrenagem vai para a direita da lista.
        const direitaDoToken = ancora.x + ancora.largura - LADO_ENGRENAGEM;
        const depoisDaLista = esquerdaLista + larguraLista + VAO_ENGRENAGEM;
        const esquerdaEngrenagem = limitar(Math.max(direitaDoToken, depoisDaLista), MARGEM_JANELA, window.innerWidth - LADO_ENGRENAGEM - MARGEM_JANELA);
        const topoEngrenagem = limitar(ancora.y - AFASTAMENTO_OPCOES_TOKEN - LADO_ENGRENAGEM, MARGEM_JANELA, window.innerHeight - LADO_ENGRENAGEM - MARGEM_JANELA);
        engrenagem.style.left = `${esquerdaEngrenagem}px`;
        engrenagem.style.top = `${topoEngrenagem}px`;

        // Cada painel abre para cima a partir do botão que o abriu: o de condições, do primeiro
        // item da lista ("Add condição", no topo dela); o da engrenagem, dela.
        if (painelAberto === "condicoes") posicionarPainel(menuCondicoes, esquerdaLista, topoLista, botaoCondicoes.offsetHeight);
        else if (painelAberto === "engrenagem") posicionarPainel(menuEngrenagem, esquerdaEngrenagem, topoEngrenagem, LADO_ENGRENAGEM);
    }

    /** Abre o painel pedido (fechando o outro). Pedir o painel já aberto o fecha. */
    function alternarPainel(painel: Painel): void {
        opcoes.dica.esconder(menuCondicoes); // o painel onde o mouse estava pode estar sumindo
        painelAberto = painelAberto === painel ? null : painel;
        for (const [nome, elemento] of Object.entries(paineis)) elemento.hidden = nome !== painelAberto;
        atualizarConteudo();
        reposicionar();
    }

    function fechar(): void {
        opcoes.dica.esconder(menuCondicoes);
        tokenAberto = null;
        painelAberto = null;
        acoes.hidden = true;
        engrenagem.hidden = true;
        for (const elemento of Object.values(paineis)) elemento.hidden = true;
    }

    engrenagem.addEventListener("click", () => alternarPainel("engrenagem"));
    botaoCondicoes.addEventListener("click", () => alternarPainel("condicoes"));
    // "Editar token" (dentro do painel da engrenagem): fecha os botões do mapa e abre a janela de edição (por cima de tudo).
    botaoEditar.addEventListener("click", () => {
        const id = tokenAberto;
        fechar();
        if (id !== null) opcoes.aoEditar(id);
    });
    // "Guardar na bolsa" (direto no painel da engrenagem): fecha os botões e guarda o token.
    botaoGuardar.addEventListener("click", () => {
        const id = tokenAberto;
        fechar();
        if (id !== null) opcoes.aoGuardar(id);
    });
    // "Excluir token" (direto no painel da engrenagem): mostra a caixa de confirmação e espera a resposta.
    botaoExcluir.addEventListener("click", () => {
        const id = tokenAberto;
        if (id === null) return;
        void opcoes.aoExcluir(id).then((excluiu) => {
            if (excluiu) fechar();
        });
    });

    // Esc fecha tudo.
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") fechar();
    });

    return {
        abrir(id) {
            tokenAberto = id;
            painelAberto = null; // começa só com os botões; os painéis abrem ao clicar
            for (const elemento of Object.values(paineis)) elemento.hidden = true;
            acoes.hidden = false; // precisam estar visíveis para medir o tamanho em reposicionar()
            engrenagem.hidden = false;
            atualizarConteudo();
            reposicionar();
        },
        atualizar() {
            atualizarConteudo();
            reposicionar();
        },
        fechar,
    };
}
