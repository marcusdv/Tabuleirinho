// =====================================================================
// MENU DO TOKEN (HTML): o que aparece ao clicar com o botão DIREITO num token.
//
// Fluxo:
//   1) clique direito no token -> abrir(id): aparecem botões ACIMA do token (um pouco afastados dele):
//        - no canto superior ESQUERDO, uma LISTA de ações, de cima para baixo:
//            [ Add condição ]   <- primeiro item
//            [ Dano ] [ Cura ] ... <- as AÇÕES da mesa (uma por ação; cada uma abre o modal do cálculo)
//            [ + Nova ação ]    <- abre o modal para criar e excluir ações
//        - no canto superior DIREITO, a engrenagem.
//   2) clique na engrenagem     -> abre/fecha o painel da ENGRENAGEM ("Editar token" e "Remover do tabuleiro"; o primeiro abre a
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

import { CONDICOES, buscarCondicao, urlDoIcone } from "../condicoes";
import { AFASTAMENTO_OPCOES_TOKEN, ALTURA_MIN_PAINEL, DISTANCIA_PAINEL } from "../config";
import { limitar } from "../coordenadas";
import { buscarToken, estado, podeConfigurarToken, rotuloDoStatus } from "../estado";
import type { DicaCondicao } from "./dicaCondicao";

export interface OpcoesMenuToken {
    /** Balão que descreve uma condição quando o mouse passa por cima dela. */
    dica: DicaCondicao;
    /** Onde (em pixels da tela) está o bloco de um token: canto superior esquerdo e largura. */
    ancora(id: number): { x: number; y: number; largura: number } | null;
    /** Clicou em "Editar token" (no painel da engrenagem): abrir a janela de edição (nome, tamanho e cores) deste token. */
    aoEditar(id: number): void;
    /** Clicou em "Remover do tabuleiro" (no painel da engrenagem): tirar o token do tabuleiro (ele continua na bolsa). */
    aoGuardar(id: number): void;
    /** Clicou numa condição: liga se estava desligada, desliga se estava ligada. */
    aoAlternarCondicao(id: number, condicaoId: string): void;
    /** Clicou numa AÇÃO da mesa (Dano, Cura...) no token `id`: abrir o modal do cálculo. */
    aoAcao(id: number, acaoId: number): void;
    /** Clicou em "+ Nova ação": abrir o modal de criar e excluir ações. */
    aoNovaAcao(): void;
    /** "Adicionar à iniciativa": põe este token na ordem de combate. */
    aoAdicionarIniciativa(id: number): void;
}

export interface MenuToken {
    /** Mostra os botões do token (com os painéis fechados). */
    abrir(id: number): void;
    /** Recalcula textos, botões e posição (após o token mudar). */
    atualizar(): void;
    /** Esconde tudo. */
    fechar(): void;
    /** A lista de condições da mesa mudou (o mestre criou, editou ou excluiu): refaz os botões do painel de condições. */
    reconstruirCondicoes(): void;
}

type Painel = "engrenagem" | "condicoes";

const LADO_ENGRENAGEM = 28; // px, igual ao CSS (largura da engrenagem)
const MARGEM_JANELA = 6; // px mínimos entre os elementos e a borda da janela

export function criarMenuToken(opcoes: OpcoesMenuToken): MenuToken {
    const acoes = document.getElementById("acoes-token") as HTMLDivElement; // a lista de ações (canto superior esquerdo)
    const engrenagem = document.getElementById("engrenagem") as HTMLButtonElement;
    const botaoCondicoes = document.getElementById("botao-condicoes") as HTMLButtonElement;
    const botaoEditar = document.getElementById("botao-editar-token") as HTMLButtonElement;
    const botaoGuardar = document.getElementById("botao-guardar-token") as HTMLButtonElement;

    const menuEngrenagem = document.getElementById("menu-token") as HTMLDivElement;
    const titulo = document.getElementById("menu-token-titulo") as HTMLElement;

    const menuCondicoes = document.getElementById("menu-condicoes") as HTMLDivElement;
    const gradeCondicoes = document.getElementById("grade-condicoes") as HTMLDivElement;

    // Todos os painéis do menu. Um painel NOVO só precisa ser registrado aqui para abrir
    // para cima, rolar se faltar espaço e fechar junto com os outros.
    const paineis: Record<Painel, HTMLElement> = { engrenagem: menuEngrenagem, condicoes: menuCondicoes };

    // OS ESCUDOS: caixas INVISÍVEIS e sólida atrás dos botões e dos painéis. Cobre o retângulo todo (inclusive os vãos entre os botões, entre a lista e a engrenagem,
    // e entre os botões e o painel aberto), então o mouse nunca "vaza" para o mapa e não toca em tokens que estejam atrás do menu. Termina no topo do token do menu.
    const criarEscudo = (id: string): HTMLDivElement => {
        const e = document.createElement("div");
        e.id = id;
        e.className = "escudo-menu-token";
        e.hidden = true;
        document.body.appendChild(e);
        return e;
    };
    const escudoDeCima = criarEscudo("escudo-menu-token-cima");
    const escudoDeBaixo = criarEscudo("escudo-menu-token-baixo");
    const escudoDoPainel = criarEscudo("escudo-menu-token-painel");

    // Id do token cujas opções estão abertas (null = nada aberto) e qual painel está aberto.
    let tokenAberto: number | null = null;
    let painelAberto: Painel | null = null;

    /**
     * Os botões das AÇÕES da mesa (Dano, Cura e as que o dono criou) e o "+ Nova ação": refeitos a cada abertura e atualização (a lista da mesa pode ter mudado). Ficam depois de
     * "Add condição". Clicar numa ação fecha o menu e abre o modal do cálculo.
     */
    function desenharAcoes(): void {
        for (const antigo of acoes.querySelectorAll(".acao-dinamica")) antigo.remove();
        for (const acao of estado.acoesDaMesa) {
            const botao = document.createElement("button");
            botao.className = "acao-token acao-dinamica";
            botao.textContent = acao.nome; // (o nome vem do usuário: textContent)
            botao.title = `${acao.nome}: ${acao.efeito === "reduzir" ? "tira do" : "soma ao"} ${(() => { const st = estado.statusDaMesa.find((s) => s.id === acao.status); return st ? rotuloDoStatus(st) : "status"; })()}`;
            botao.addEventListener("click", () => {
                const id = tokenAberto;
                fechar();
                if (id !== null) opcoes.aoAcao(id, acao.id);
            });
            acoes.append(botao);
        }
        // Iniciativa, criar e excluir ações: só do MESTRE (o servidor também recusa).
        if (!estado.mestre) return;
        const iniciativa = document.createElement("button");
        iniciativa.className = "acao-token acao-dinamica";
        iniciativa.textContent = "Adicionar à iniciativa";
        iniciativa.title = "Põe este token na ordem de combate (a caixa Iniciativa, na pilha da esquerda)";
        iniciativa.addEventListener("click", () => {
            const id = tokenAberto;
            fechar();
            if (id !== null) opcoes.aoAdicionarIniciativa(id);
        });
        acoes.append(iniciativa);
        const nova = document.createElement("button");
        nova.className = "acao-token acao-dinamica acao-nova";
        nova.textContent = "+ Nova ação";
        nova.title = "Criar ou excluir ações (valem para todos os tokens)";
        nova.addEventListener("click", () => {
            fechar();
            opcoes.aoNovaAcao();
        });
        acoes.append(nova);
    }

    // --- Botões das condições: montados a partir da lista da mesa (a do mestre; ver condicoes.ts) e REFEITOS quando ela muda (`reconstruirCondicoes`) ---
    // Guardados por id para marcar quais estão ativas no token aberto.
    const botoesCondicao = new Map<string, HTMLButtonElement>();
    function montarBotoesDeCondicao(): void {
        gradeCondicoes.replaceChildren();
        botoesCondicao.clear();
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
    }
    montarBotoesDeCondicao();
    // ACESSO RÁPIDO ao "Morto": um botão compacto na linha do título "Condições" (o da grade continua lá). Marca e desmarca a mesma condição.
    const topoCondicoes = document.getElementById("menu-condicoes-topo") as HTMLDivElement;
    const botaoMortoRapido = document.createElement("button");
    botaoMortoRapido.className = "condicao-rapida";
    botaoMortoRapido.setAttribute("aria-label", "Morto");
    const imagemMorto = document.createElement("img");
    imagemMorto.src = urlDoIcone("Morto");
    imagemMorto.alt = "";
    imagemMorto.draggable = false;
    const rotuloMorto = document.createElement("span");
    rotuloMorto.textContent = "Morto";
    botaoMortoRapido.append(imagemMorto, rotuloMorto);
    botaoMortoRapido.addEventListener("click", () => {
        if (tokenAberto !== null) opcoes.aoAlternarCondicao(tokenAberto, "Morto");
    });
    botaoMortoRapido.addEventListener("mouseenter", () => opcoes.dica.mostrar("Morto", menuCondicoes, botaoMortoRapido));
    botaoMortoRapido.addEventListener("mouseleave", () => opcoes.dica.esconder(menuCondicoes));
    topoCondicoes.appendChild(botaoMortoRapido);
    /** O atalho do "Morto" acompanha a lista: o ícone e o nome (o mestre pode ter editado), e some se a condição foi excluída. */
    function atualizarBotaoMorto(): void {
        const morto = buscarCondicao("Morto");
        botaoMortoRapido.hidden = !morto;
        imagemMorto.src = urlDoIcone("Morto");
        rotuloMorto.textContent = morto?.nome ?? "Morto";
        botaoMortoRapido.setAttribute("aria-label", morto?.nome ?? "Morto");
    }
    atualizarBotaoMorto();

    // Ao rolar a grade, a descrição aberta ficaria alinhada a um botão que mudou de lugar: some.
    gradeCondicoes.addEventListener("scroll", () => opcoes.dica.esconder(menuCondicoes));

    /** Atualiza o título e as condições marcadas. */
    function atualizarConteudo(): void {
        if (tokenAberto === null) return;
        const token = buscarToken(tokenAberto);
        if (!token) return fechar();

        // Painel da engrenagem: o título é o nome do token.
        titulo.textContent = token.nome;
        desenharAcoes(); // (a lista de ações da mesa pode ter mudado)

        // Painel de condições: destaca as que o token já sofre.
        for (const [id, botao] of botoesCondicao) {
            const ativa = token.condicoes.includes(id);
            botao.classList.toggle("ativa", ativa);
            botao.setAttribute("aria-pressed", String(ativa)); // acessibilidade
        }
        const morto = token.condicoes.includes("Morto");
        botaoMortoRapido.classList.toggle("ativa", morto);
        botaoMortoRapido.setAttribute("aria-pressed", String(morto));
    }

    /**
     * Coloca um painel ACIMA dos botões, alinhado à esquerda deles, dentro da janela.
     * A altura é limitada ao espaço livre acima (o conteúdo rola se não couber).
     * Só vai para BAIXO dos botões se acima não houver espaço útil e embaixo houver mais.
     */
    function posicionarPainel(painel: HTMLElement, esquerda: number, topoBotoes: number, alturaBotoes: number, preferirAbaixo = false): void {
        // Mede a altura NATURAL (sem limite) para decidir onde ele fica e quão alto.
        painel.style.maxHeight = "none";
        const natural = painel.offsetHeight;
        const largura = painel.offsetWidth;

        // Espaço livre acima e abaixo dos botões, já descontando o vão e a margem da janela.
        const espacoAcima = topoBotoes - DISTANCIA_PAINEL - MARGEM_JANELA;
        const espacoAbaixo = window.innerHeight - (topoBotoes + alturaBotoes) - DISTANCIA_PAINEL - MARGEM_JANELA;

        // Regra geral: PARA CIMA. Vai para baixo só se acima não couber nem a altura mínima útil
        // (ou o painel inteiro, se for menor que isso) e embaixo houver mais espaço.
        // Com `preferirAbaixo` (o painel de ESCOLHER condição) é o contrário: vai para baixo, e só sobe se embaixo não couber nem a altura mínima útil e em cima houver mais espaço.
        const abaixo = preferirAbaixo
            ? !(espacoAbaixo < Math.min(natural, ALTURA_MIN_PAINEL) && espacoAcima > espacoAbaixo)
            : espacoAcima < Math.min(natural, ALTURA_MIN_PAINEL) && espacoAbaixo > espacoAcima;
        const disponivel = abaixo ? espacoAbaixo : espacoAcima;
        const altura = Math.min(natural, Math.max(disponivel, ALTURA_MIN_PAINEL));

        painel.style.maxHeight = `${altura}px`; // menor que a natural: o conteúdo rola dentro do painel
        const alturaFinal = painel.offsetHeight;

        const x = limitar(esquerda, MARGEM_JANELA, window.innerWidth - largura - MARGEM_JANELA);
        const y = abaixo ? topoBotoes + alturaBotoes + DISTANCIA_PAINEL : topoBotoes - DISTANCIA_PAINEL - alturaFinal;
        painel.style.left = `${x}px`;
        painel.style.top = `${Math.max(MARGEM_JANELA, y)}px`;
    }

    /** Coloca um painel NA FRENTE do token: centralizado sobre ele, sempre dentro da janela (a altura é limitada à janela, com rolagem se preciso). */
    function posicionarNaFrente(painel: HTMLElement, ancora: { x: number; y: number; largura: number }): void {
        painel.style.maxHeight = `${window.innerHeight - 2 * MARGEM_JANELA}px`;
        const largura = painel.offsetWidth;
        const altura = painel.offsetHeight;
        const centroX = ancora.x + ancora.largura / 2;
        const centroY = ancora.y + ancora.largura / 2; // (o bloco do token é quadrado)
        painel.style.left = `${limitar(centroX - largura / 2, MARGEM_JANELA, window.innerWidth - largura - MARGEM_JANELA)}px`;
        painel.style.top = `${limitar(centroY - altura / 2, MARGEM_JANELA, window.innerHeight - altura - MARGEM_JANELA)}px`;
    }

    /** Coloca os botões (e o painel aberto) junto do token, dentro da janela. */
    function reposicionar(): void {
        if (tokenAberto === null) return;
        const ancora = opcoes.ancora(tokenAberto);
        if (!ancora) return fechar();

        // A CONFIGURAÇÃO (a engrenagem) fica ACIMA do token, e as AÇÕES (a lista) ficam ABAIXO dele, ambas afastadas dele por AFASTAMENTO_OPCOES_TOKEN e sempre dentro da janela.
        const baseDoToken = ancora.y + ancora.largura; // (o bloco do token é quadrado: a altura é igual à largura)
        //
        // 1) A LISTA de ações, ABAIXO do token e alinhada à borda esquerda dele, de cima para baixo ("Add condição" é o primeiro item).
        const larguraLista = acoes.offsetWidth;
        const alturaLista = acoes.offsetHeight;
        const esquerdaLista = limitar(ancora.x, MARGEM_JANELA, window.innerWidth - larguraLista - MARGEM_JANELA);
        const topoLista = limitar(baseDoToken + AFASTAMENTO_OPCOES_TOKEN, MARGEM_JANELA, window.innerHeight - alturaLista - MARGEM_JANELA);
        acoes.style.left = `${esquerdaLista}px`;
        acoes.style.top = `${topoLista}px`;

        // 2) A ENGRENAGEM ACIMA do token, no canto superior DIREITO: alinhada à borda direita dele.
        const esquerdaEngrenagem = limitar(ancora.x + ancora.largura - LADO_ENGRENAGEM, MARGEM_JANELA, window.innerWidth - LADO_ENGRENAGEM - MARGEM_JANELA);
        const topoEngrenagem = limitar(ancora.y - AFASTAMENTO_OPCOES_TOKEN - LADO_ENGRENAGEM, MARGEM_JANELA, window.innerHeight - LADO_ENGRENAGEM - MARGEM_JANELA);
        engrenagem.style.left = `${esquerdaEngrenagem}px`;
        engrenagem.style.top = `${topoEngrenagem}px`;

        // O painel da engrenagem abre para CIMA dela; o de condições abre NA FRENTE do token (centralizado sobre ele; pedido do dono).
        if (painelAberto === "condicoes") posicionarNaFrente(menuCondicoes, ancora);
        else if (painelAberto === "engrenagem") posicionarPainel(menuEngrenagem, esquerdaEngrenagem, topoEngrenagem, LADO_ENGRENAGEM);

        // Os ESCUDOS: um em cima (engrenagem e o painel dela, descendo até o topo do token) e um embaixo (lista e o painel de condições, subindo até a base do token). Nenhum cobre o token.
        const rects = (...e: HTMLElement[]): DOMRect[] => e.map((x) => x.getBoundingClientRect());
        cobrir(escudoDeCima, rects(engrenagem, ...(painelAberto === "engrenagem" ? [menuEngrenagem] : [])), "baixo", ancora.y);
        if (acoes.hidden) escudoDeBaixo.hidden = true; // (sem a lista, não há o que proteger embaixo: o painel de ações é uma caixa sólida)
        else cobrir(escudoDeBaixo, rects(acoes), "cima", baseDoToken);
        // O painel de condições (na frente do token) tem o seu escudo: só a área dele.
        if (painelAberto === "condicoes") cobrir(escudoDoPainel, rects(menuCondicoes), "baixo", 0);
        else escudoDoPainel.hidden = true;
    }

    /** Estica um escudo sobre o retângulo que envolve as partes, e até `limite` (o topo ou a base do token, para o escudo encostar nele sem cobri-lo). */
    function cobrir(escudo: HTMLElement, partes: DOMRect[], estender: "baixo" | "cima", limite: number): void {
        const esq = Math.min(...partes.map((r) => r.left));
        const dir = Math.max(...partes.map((r) => r.right));
        const cima = Math.min(...partes.map((r) => r.top), ...(estender === "cima" ? [limite] : []));
        const baixo = Math.max(...partes.map((r) => r.bottom), ...(estender === "baixo" ? [limite] : []));
        escudo.style.left = `${esq}px`;
        escudo.style.top = `${cima}px`;
        escudo.style.width = `${dir - esq}px`;
        escudo.style.height = `${baixo - cima}px`;
        escudo.hidden = false;
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
        escudoDeCima.hidden = true;
        escudoDeBaixo.hidden = true;
        escudoDoPainel.hidden = true;
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
    // "Remover do tabuleiro" (direto no painel da engrenagem): fecha os botões e tira o token do tabuleiro. (Excluir o token de vez só existe na bolsa.)
    botaoGuardar.addEventListener("click", () => {
        const id = tokenAberto;
        fechar();
        if (id !== null) opcoes.aoGuardar(id);
    });
    // Esc fecha tudo.
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") fechar();
    });

    return {
        reconstruirCondicoes() {
            montarBotoesDeCondicao();
            atualizarBotaoMorto();
            opcoes.dica.esconder(menuCondicoes);
            atualizarConteudo(); // (marca de novo as condições do token aberto)
        },
        abrir(id) {
            tokenAberto = id;
            painelAberto = null; // começa só com os botões; os painéis abrem ao clicar
            for (const elemento of Object.values(paineis)) elemento.hidden = true;
            acoes.hidden = true; // a LISTA de ações antiga não abre mais: quem trata abre o PAINEL de ações (ui/menuGrupoMapa.ts), embaixo do token (pedido do dono, 17/11/2026); a engrenagem continua
            const alvo = buscarToken(id);
            engrenagem.hidden = !alvo || !podeConfigurarToken(alvo); // a engrenagem (configurações) só para quem edita o token: o leitor só usa as ações
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
