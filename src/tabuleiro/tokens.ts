// =====================================================================
// TOKENS (visual): desenha cada token do estado e cuida de arrastá-lo.
//   - O ESTADO (posição, tamanho, condições) mora em estado.ts.
//   - Aqui ficam só as VIEWS (objetos do PixiJS) que mostram esse estado.
//
// Cada token é um Container com estas partes (do fundo para a frente):
//   raiz      Container "pai": é ele que se move e recebe os eventos do mouse
//    ├─ corpo      Graphics: o círculo de PREENCHIMENTO do token (cor `cor`)
//    ├─ foto       Sprite: a imagem recortada do token (só se o token tem imagem; as partes transparentes mostram o preenchimento)
//    ├─ borda      Graphics: o contorno (cor `corBorda`), por cima do preenchimento e da foto
//    ├─ marca      Graphics: o X vermelho da condição "Morto" (vazio nos outros casos)
//    └─ condicoes  Container: os ícones das condições, em anel na borda do token
// (O PixiJS 8 só aceita filhos em Containers, não em um Graphics solto.)
// =====================================================================

import { Assets, Container, FederatedPointerEvent, Graphics, PointData, Sprite, Text, Texture, Ticker } from "pixi.js";
import { buscarCondicao } from "../condicoes";
import { ALPHA_RETANGULO_SELECAO, ALTURA_BARRA_STATUS, BARRAS_DA_CURA, COR_CURA, COR_DANO, COR_SELECAO, MS_ANIMACAO_CURA, MS_ANIMACAO_DANO, FOLGA_TOKEN, ALPHA_TILE_SELECAO, LARGURA_BORDA_TOKEN, ANEIS_DA_BORDA_DANO, PROFUNDIDADE_BORDA_DANO, MAX_ICONES_CONDICAO, MS_DUPLO_CLIQUE, PX_DUPLO_CLIQUE, TAMANHO_CASA, TAMANHO_NUMERO_BARRA, VAO_BARRA_STATUS, VAO_BARRA_TOKEN } from "../config";
import { casaMaisProxima, diametroDoIcone, posicoesNoAnel } from "../coordenadas";
import { buscarToken, colocarToken, estado, guardarToken, naCenaAtual, podeUsarToken, statusAplicaveis, Token } from "../estado";
import type { Camera } from "./camera";
import type { Grade } from "./grade";

/** Avisos que esta camada envia para quem a criou. */
export interface OpcoesTokens {
    /** O usuário começou a arrastar um token (clique esquerdo). */
    aoIniciarArrasto(): void;
    /** O usuário clicou com o botão DIREITO num token. */
    aoClicarDireito(token: Token): void;
    /** O usuário deu um DUPLO clique (esquerdo) num token: abrir a ficha dele. O token não é arrastado por esse segundo aperto. */
    aoDuploClique(token: Token): void;
    /** O mouse entrou em cima de um token. */
    aoPassarMouse(token: Token): void;
    /** O mouse saiu de cima de um token. */
    aoSairMouse(token: Token): void;
    /** O ponto da TELA está em cima da bolsa? (para guardar o token ao soltar ali) */
    sobreBolsa(ponto: PointData): boolean;
    /** O token arrastado entrou/saiu de cima da bolsa (a bolsa se destaca). */
    aoMudarSobreBolsa(sobre: boolean): void;
    /** Um token foi guardado ou tirado da bolsa (a lista da bolsa precisa ser refeita). */
    aoMudarBolsa(): void;
    /** A SELEÇÃO mudou (alguém selecionou, tirou a seleção, soltou o retângulo ou um selecionado saiu do mapa): `selecionados` são os que estão selecionados agora. */
    aoMudarSelecao(selecionados: Token[]): void;
    /**
     * O usuário SOLTOU um token (já aplicado ao estado local: `token.guardado`, `col` e `row` valem). No modo online, quem
     * criou esta camada manda o pedido ao servidor, que é quem decide.
     */
    aoSoltarToken(token: Token): void;
    /** Um token que ESTAVA NO MAPA foi solto na bolsa (removido do tabuleiro): `col` e `row` são onde ele estava (para o "Desfazer"). */
    aoRemoverArrastando(token: Token, col: number, row: number): void;
    /** VÁRIOS tokens selecionados foram soltos na bolsa (removidos do tabuleiro de uma vez, com um só "Desfazer"). */
    aoRemoverVarios(tokens: Token[]): void;
    /** Um token da BOLSA foi solto no tabuleiro em (col, row): criar uma PEÇA (cópia temporária) ali. O token da bolsa NÃO muda e continua na bolsa. */
    aoSoltarModelo(token: Token, col: number, row: number): void;
    /** Uma PEÇA do tabuleiro foi solta em cima da bolsa: apagá-la (ela é temporária; quem trata oferece o "Desfazer"). `col`/`row`: onde ela estava. */
    aoRemoverPeca(token: Token, col: number, row: number): void;
    /** Alguém soltou na bolsa uma peça que NÃO pode tirar do mapa (quem tem acesso ao token, como leitor ou mais, e o mestre tiram): ela volta ao lugar e esta pessoa é avisada. */
    aoSemPermissao(nome: string): void;
    /**
     * O token arrastado está SOBRE a bolsa. O canvas fica atrás dos painéis HTML, então o token do canvas
     * se esconde e quem criou esta camada mostra uma cópia em HTML POR CIMA da bolsa: centro e diâmetro
     * em pixels da TELA, e a espessura da borda (já com o zoom). Chamada a cada movimento do mouse.
     */
    aoMostrarSobreBolsa(token: Token, centro: PointData, diametro: number, borda: number): void;
    /** O token arrastado saiu de cima da bolsa (ou foi solto): some a cópia em HTML. */
    aoEsconderSobreBolsa(): void;
}

export interface CamadaTokens {
    /** Cria o desenho de um token que acabou de entrar no estado (ex.: criado na bolsa). Se ele já tem desenho, não faz nada. */
    adicionar(token: Token): void;
    /**
     * Tira o desenho de um token que foi EXCLUÍDO (ele já saiu do estado). Se alguém o estava segurando, o arrasto é cancelado, e a
     * textura da imagem é liberada se nenhum outro token a usa.
     */
    remover(id: number): void;
    /** Refaz o desenho de TODOS os tokens do estado (quando o servidor manda a lista inteira ao entrar na mesa). */
    reconstruir(): void;
    /**
     * Qual token está sob este ponto da TELA (null = nenhum)? Só os que estão no tabuleiro; vale o CÍRCULO do token; com vários no mesmo ponto, o que fica por CIMA (os menores
     * ficam sobre os maiores; entre iguais, o mais novo). Usado ao soltar o resultado de um dado do chat num token.
     */
    tokenEm(ponto: PointData): Token | null;
    /** Destaca (cresce um pouco) o token que está sob o resultado de dado arrastado; null tira o destaque. */
    destacarAlvo(token: Token | null): void;
    /** Põe a borda suave e pulsante no token que TEM A VEZ na iniciativa (id do token; null tira). */
    destacarVez(id: number | null): void;
    /**
     * Mostra o token onde o ESTADO diz que ele está (no mapa, ou escondido se está na bolsa). Usado quando a posição
     * vem de FORA (do servidor). Se o usuário está segurando este token agora, não mexe: o que ele soltar vale.
     */
    aplicarPosicao(token: Token): void;
    /** Os tokens SELECIONADOS agora (só os que estão à vista no mapa atual). */
    readonly selecionados: Token[];
    /** Tira a seleção de todos. */
    limparSelecao(): void;
    /** true enquanto o retângulo de seleção (Ctrl + arrastar) está sendo desenhado. */
    readonly selecionando: boolean;
    /** Começa o retângulo de seleção num ponto da TELA; `arrastarRetangulo` o estica; `soltarRetangulo` seleciona os tokens cujo centro ficou dentro. */
    iniciarRetangulo(ponto: PointData): void;
    arrastarRetangulo(ponto: PointData): void;
    soltarRetangulo(): void;
    /** true enquanto um token está sendo arrastado. */
    readonly arrastando: boolean;
    /** Move o token arrastado para acompanhar o mouse (ponto na TELA). */
    arrastarPara(ponto: PointData): void;
    /** Solta o token arrastado: encaixa na grade, ou guarda na bolsa se estiver sobre ela. */
    soltar(): void;
    /** Começa a arrastar um token que está na BOLSA (ponto na TELA); ele aparece sob o mouse. */
    iniciarArrastoDaBolsa(id: number, ponto: PointData): void;
    /** Liga/desliga o mouse nos tokens (desligado, eles não podem ser pegos nem abrir menus). */
    definirInterativo(ativo: boolean): void;
    /** Reposiciona as views de tokens cujo estado mudou de lugar. */
    reposicionar(tokens: Token[]): void;
    /** Redesenha um token cujo tamanho ou condições mudaram. `animar`: se a VIDA (soma dos valores dos status) mudou, pisca em vermelho (dano) ou em verde com barrinhas subindo (cura). */
    redesenhar(token: Token, animar?: boolean | "dano" | "cura"): void;
    /** Onde o bloco do token está na TELA: canto superior esquerdo e largura (âncora dos botões do menu). */
    ancoraNaTela(id: number): AncoraToken | null;
    /** Onde ancorar o balão de condições: acima ou abaixo do token e dos seus ícones. */
    ancoraBalao(id: number): AncoraBalao | null;
}

/** Posição de um token na TELA (px): canto superior esquerdo do bloco e a largura do bloco. */
export interface AncoraToken {
    x: number;
    y: number;
    largura: number;
}

/** Pontos da TELA (px) usados para posicionar o balão de condições de um token. */
export interface AncoraBalao {
    x: number; // centro horizontal do token
    topo: number; // topo do token, incluindo os ícones que se projetam para fora
    base: number; // base do token, incluindo os ícones que se projetam para fora
}

/** As partes visuais de um token. */
interface ViewToken {
    raiz: Container;
    corpo: Graphics;
    foto: Sprite;
    borda: Graphics;
    fotoUrl: string | null; // a imagem que a `foto` mostra agora (para saber se mudou)
    marca: Graphics;
    anelVez: Graphics | null; // a borda suave e pulsante de quem tem a vez na iniciativa (só existe enquanto ele a tem)
    condicoes: Container;
    vida: number; // a soma dos valores atuais dos status na última vez que as barras foram desenhadas (para saber se foi dano ou cura)
    barras: Container; // as BARRAS de status (HP etc.) embaixo do token: um Graphics (as caixas) e os textos (o nome fora, o "atual/máx" dentro)
}

/** A soma dos valores ATUAIS dos status de um token (o que sobe com a cura e desce com o dano). */
function somaDaVida(token: Token): number {
    return token.valores.reduce((soma, v) => soma + v.atual, 0);
}

/** Raio do círculo do token. Cresce junto com o tamanho (size). */
function raioDoToken(size: number): number {
    return (size * TAMANHO_CASA) / 2 - FOLGA_TOKEN;
}

export function criarTokens(
    camera: Camera,
    grade: Grade,
    texturas: Map<string, Texture>,
    opcoes: OpcoesTokens,
): CamadaTokens {
    const mundo = camera.mundo;

    // Guarda a view de cada token pelo id, para podermos reposicioná-la
    // quando o estado do token mudar (tabuleiro encolheu, tamanho alterado...).
    const views = new Map<number, ViewToken>();
    let vezDestacada: number | null = null; // o token que tem a vez na iniciativa (ver `destacarVez`)
    let alvoDestacado: number | null = null; // o token que está crescido por baixo de um resultado de dado arrastado (ver `destacarAlvo`)

    // Estado do arrasto. Só um token é arrastado por vez.
    let arrastando: { token: Token; view: ViewToken } | null = null;
    // SELEÇÃO: os ids selecionados, o anel de cada um e, durante um arrasto em GRUPO, os outros tokens que acompanham o principal (com a distância até ele, em px do mundo).
    const selecionadosIds = new Set<number>();
    const aneisSelecao = new Map<number, Graphics>();
    const animacoesAtivas = new Map<number, "dano" | "cura">(); // a animação de vida que está rodando em cada token (ver `animarVida`)
    let grupo: { token: Token; view: ViewToken; dx: number; dy: number }[] = [];
    let retangulo: { x0: number; y0: number; x1: number; y1: number; desenho: Graphics } | null = null;
    let ultimoAperto = { id: -1, t: 0, x: 0, y: 0 }; // o último aperto esquerdo num token (para reconhecer o duplo clique)
    // Distância entre o ponto onde clicamos e o centro do token.
    // Sem isso, o token "pularia" para centralizar no cursor ao clicar.
    let deslocamentoX = 0;
    let deslocamentoY = 0;
    // Último ponto (TELA) do mouse durante o arrasto, e se ele está sobre a bolsa.
    let ultimoPonto: PointData = { x: 0, y: 0 };
    let sobreBolsa = false;

    /**
     * A animação BÁSICA de vida: DANO = uma piscada vermelha rápida SÓ NAS BORDAS INTERNAS do token (o meio fica limpo); CURA = uma piscada verde mais suave com barrinhas verdes subindo. Tudo vive num contêiner preso à
     * raiz do token (anda com ele) e some sozinho no fim.
     */
    function animarVida(token: Token, view: ViewToken, tipo: "dano" | "cura"): void {
        // UMA piscada por golpe: o mesmo dano costuma chegar em dois avisos seguidos (o valor do token e o da ficha); enquanto a animação deste tipo roda, um novo disparo é ignorado.
        if (animacoesAtivas.get(token.id) === tipo) return;
        animacoesAtivas.set(token.id, tipo);
        const raio = raioDoToken(token.size);
        const fx = new Container();
        fx.eventMode = "none"; // (não atrapalha cliques)
        const brilho = new Graphics();
        if (tipo === "dano") {
            // DANO: vermelho só nas BORDAS INTERNAS do token (uma vinheta): vários anéis finos, encostados na borda por dentro, cada um mais fraco que o de fora, e o meio fica limpo.
            const profundidade = raio * PROFUNDIDADE_BORDA_DANO;
            const passoAnel = profundidade / ANEIS_DA_BORDA_DANO;
            for (let i = 0; i < ANEIS_DA_BORDA_DANO; i++) {
                brilho.circle(0, 0, raio - passoAnel * (i + 0.5)).stroke({ width: passoAnel + 0.5, color: COR_DANO, alpha: Math.pow(1 - i / ANEIS_DA_BORDA_DANO, 1.5) }); // (+0.5: sem frestas entre os anéis)
            }
        } else brilho.circle(0, 0, raio).fill(COR_CURA);
        fx.addChild(brilho);
        const barrinhas: { g: Graphics; x: number; atraso: number; velocidade: number }[] = [];
        if (tipo === "cura") {
            for (let i = 0; i < BARRAS_DA_CURA; i++) {
                const g = new Graphics().roundRect(-1.5, -9, 3, 18, 1.5).fill(COR_CURA);
                const x = (-0.75 + (1.5 * (i + 0.5)) / BARRAS_DA_CURA) * raio * 0.9; // (espalhadas pela largura do círculo)
                g.position.set(x, raio * 0.6);
                g.alpha = 0;
                fx.addChild(g);
                barrinhas.push({ g, x, atraso: (i % 3) * 120 + Math.random() * 80, velocidade: 0.7 + Math.random() * 0.5 });
            }
        }
        view.raiz.addChild(fx);
        const duracao = tipo === "dano" ? MS_ANIMACAO_DANO : MS_ANIMACAO_CURA;
        let passado = 0;
        const passo = (ticker: Ticker): void => {
            passado += ticker.deltaMS;
            if (view.raiz.destroyed || fx.destroyed) {
                Ticker.shared.remove(passo);
                animacoesAtivas.delete(token.id);
                return;
            }
            const t = Math.min(1, passado / duracao);
            if (tipo === "dano") {
                brilho.alpha = 0.95 * Math.sin(Math.PI * t); // sobe e desce numa piscada só
            } else {
                brilho.alpha = 0.35 * Math.sin(Math.PI * Math.min(1, passado / (duracao * 0.6)));
                for (const b of barrinhas) {
                    const u = Math.max(0, Math.min(1, (passado - b.atraso) / (duracao - 200)));
                    b.g.y = raio * 0.6 - u * raio * 1.5 * b.velocidade;
                    b.g.alpha = u <= 0 ? 0 : 0.95 * (1 - u);
                }
            }
            if (t >= 1) {
                Ticker.shared.remove(passo);
                animacoesAtivas.delete(token.id);
                fx.destroy({ children: true });
            }
        };
        Ticker.shared.add(passo);
    }

    /** O ponteiro ao passar por cima de um token: a mãozinha SÓ para quem pode movê-lo; sem permissão fica o ponteiro normal (a mãozinha enganava o jogador; pedido do dono, 17/11/2026). */
    const cursorDe = (token: Token): string => (podeUsarToken(token) ? "grab" : "default");

    /** Refaz as marcas de seleção: o TILE (o quadrado da grade que o token ocupa) fica amarelo fraco, por baixo do token (e some o dos que saíram da seleção). Sem borda: o token já tem a dele. */
    function desenharSelecao(): void {
        for (const [id, anel] of aneisSelecao) {
            if (selecionadosIds.has(id) && views.has(id)) continue;
            anel.destroy();
            aneisSelecao.delete(id);
        }
        for (const id of selecionadosIds) {
            const token = buscarToken(id);
            const view = views.get(id);
            if (!token || !view || aneisSelecao.has(id)) continue;
            const anel = new Graphics();
            const metade = (token.size * TAMANHO_CASA) / 2; // (a origem da raiz é o CENTRO do bloco)
            anel.rect(-metade, -metade, metade * 2, metade * 2).fill({ color: COR_SELECAO, alpha: ALPHA_TILE_SELECAO });
            view.raiz.addChildAt(anel, 0); // atrás do corpo, da foto, da borda e dos ícones: o token continua à vista por cima do tile
            aneisSelecao.set(id, anel);
        }
        opcoes.aoMudarSelecao(selecionadosVivos()); // (quem quiser mostrar "N tokens selecionados" é avisado a cada mudança)
    }
    function selecionarSo(id: number): void {
        selecionadosIds.clear();
        selecionadosIds.add(id);
        desenharSelecao();
    }
    /** Os tokens selecionados que ainda estão à vista (o mapa pode ter mudado ou o token saído do tabuleiro). */
    function selecionadosVivos(): Token[] {
        return [...selecionadosIds].map((id) => buscarToken(id)).filter((t): t is Token => !!t && naCenaAtual(t));
    }

    /**
     * Posiciona a view conforme o estado. (col,row) é o canto superior
     * esquerdo; o CENTRO do bloco fica meio "size" para dentro.
     * Ex.: token 3x3 em col=20 -> centro em (20 + 1,5) casas.
     */
    function posicionar(token: Token, view: ViewToken): void {
        view.raiz.position.set((token.col + token.size / 2) * TAMANHO_CASA, (token.row + token.size / 2) * TAMANHO_CASA);
    }

    /**
     * As BARRAS de status (a vida "HP" e as outras que a pessoa criou), EMBAIXO do bloco do token, uma por status que tem valor, empilhadas na ordem da lista.
     * Cada uma tem a largura do círculo; o preenchimento é a parte `atual / máximo`, na cor do status. Só existem com o token no tabuleiro e com ficha
     * (os valores nascem ao sair da bolsa, lendo a ficha: ver `valoresIniciais`). Ficam presas à raiz do token, então andam junto com ele.
     */
    function desenharBarras(token: Token, view: ViewToken): void {
        view.vida = somaDaVida(token);
        for (const filho of view.barras.removeChildren()) filho.destroy({ children: true }); // (refaz tudo: o Graphics e os textos)
        if (token.guardado) return;
        const caixas = new Graphics();
        view.barras.addChild(caixas);
        const raio = raioDoToken(token.size);
        const topo = raio + LARGURA_BORDA_TOKEN / 2 + VAO_BARRA_TOKEN; // logo abaixo do CÍRCULO do token, depois da borda (a raiz está no CENTRO dele)
        let i = 0;
        for (const status of statusAplicaveis(token)) {
            const valor = token.valores.find((v) => v.id === status.id);
            if (!valor || valor.oculto || !status.mostrar) continue; // ("Exibir em jogo" desligado, ou um status que esta pessoa NÃO pode ver (`oculto`): o valor existe, mas a barra não é desenhada)
            const y = topo + i * (ALTURA_BARRA_STATUS + VAO_BARRA_STATUS);
            const largura = raio * 2;
            const parte = Math.max(0, Math.min(1, valor.atual / valor.max));
            caixas.roundRect(-raio, y, largura, ALTURA_BARRA_STATUS, 3).fill({ color: 0x15151b, alpha: 0.92 }).stroke({ width: 1, color: 0x000000, alpha: 0.8 });
            if (parte > 0) caixas.roundRect(-raio + 1, y + 1, Math.max(2, (largura - 2) * parte), ALTURA_BARRA_STATUS - 2, 2).fill(status.cor);
            // O número DENTRO da barra ("atual/máx", ex.: 100/100), centralizado (só com "Exibir números" ligado). Texto feito com o dobro do tamanho e reduzido (nítido ao aproximar o zoom).
            const numero = new Text({
                text: `${valor.atual}/${valor.max}`,
                style: { fontFamily: "system-ui, sans-serif", fontSize: TAMANHO_NUMERO_BARRA, fontWeight: "700", fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
            });
            numero.anchor.set(0.5);
            numero.scale.set(0.5);
            const excesso = numero.width / (largura - 4);
            if (excesso > 1) numero.scale.set(0.5 / excesso); // (um número comprido encolhe até caber)
            numero.position.set(0, y + ALTURA_BARRA_STATUS / 2);
            if (status.numeros) view.barras.addChild(numero);
            else numero.destroy();
            // O NOME do status ("HP") FORA da caixa, à esquerda dela, alinhado à direita, na cor do status. Só com "Mostrar nome no tabuleiro" ligado; um status SEM nome fica sem rótulo (só a barra).
            if (status.nome === "" || status.mostrarNome === false) {
                i++;
                continue;
            }
            const nome = new Text({
                text: status.nome,
                style: { fontFamily: "system-ui, sans-serif", fontSize: TAMANHO_NUMERO_BARRA, fontWeight: "700", fill: status.cor, stroke: { color: 0x000000, width: 3 } },
            });
            nome.anchor.set(1, 0.5);
            nome.scale.set(0.5);
            nome.position.set(-raio - 4, y + ALTURA_BARRA_STATUS / 2);
            view.barras.addChild(nome);
            i++;
        }
    }

    /** Desenha o círculo do token. O raio acompanha o tamanho (size). */
    function desenharCorpo(token: Token, view: ViewToken): void {
        view.corpo.clear(); // apaga o desenho anterior (necessário ao redesenhar)
        view.borda.clear();
        const raio = raioDoToken(token.size);
        // O preenchimento fica por baixo (e aparece através das partes transparentes da imagem)...
        view.corpo.circle(0, 0, raio).fill(token.cor); // centro em (0,0): a posição da raiz é o centro
        // ...e a borda por cima de tudo, com a mesma espessura com ou sem imagem.
        view.borda.circle(0, 0, raio).stroke({ width: LARGURA_BORDA_TOKEN, color: token.corBorda });
    }

    /**
     * Mostra (ou tira) a imagem do token. A imagem é uma miniatura já recortada em círculo (com cantos
     * transparentes), então basta esticar a textura até o diâmetro do token. O carregamento é assíncrono:
     * se o token mudar de imagem enquanto carrega, a resposta velha é ignorada.
     */
    async function desenharFoto(token: Token, view: ViewToken): Promise<void> {
        const url = token.imagem;
        if (url === view.fotoUrl) {
            // A imagem é a mesma: só o tamanho do token pode ter mudado.
            const lado = raioDoToken(token.size) * 2;
            view.foto.width = lado;
            view.foto.height = lado;
            return;
        }
        const antiga = view.fotoUrl;
        view.fotoUrl = url;
        if (!url) {
            view.foto.visible = false;
        } else {
            let textura: Texture;
            try {
                textura = await Assets.load<Texture>(url);
            } catch (erro) {
                console.warn(`Não foi possível carregar a imagem do token ${token.id}.`, erro);
                view.fotoUrl = null; // sem imagem: o token mostra só o fundo escuro e a borda
                return;
            }
            textura.source.autoGenerateMipmaps = true; // reduzir bem em tamanho pequeno, como nos ícones
            if (token.imagem !== url) return; // trocou de imagem enquanto carregava
            view.foto.texture = textura;
            const lado = raioDoToken(token.size) * 2;
            view.foto.width = lado;
            view.foto.height = lado;
            view.foto.visible = true;
        }
        // A textura antiga só sai da memória se nenhum outro token usa a mesma imagem.
        if (antiga && !estado.tokens.some((t) => t.imagem === antiga)) void Assets.unload(antiga);
    }

    /**
     * A marca "X vermelho" da condição Morto: dois traços cruzando o token de ponta
     * a ponta. Se o token não tem nenhuma condição com visual "x-vermelho", fica vazia.
     */
    function desenharMarca(token: Token, view: ViewToken): void {
        view.marca.clear(); // apaga o desenho anterior
        if (!token.condicoes.some((id) => buscarCondicao(id)?.visual === "x-vermelho")) return;

        const raio = raioDoToken(token.size);
        // Metade do lado do quadrado onde o X está inscrito. A ponta de cada traço fica a
        // metade * raiz(2) ≈ 0,93 do raio do centro, então o X (com a espessura) cabe no círculo.
        const metade = raio * 0.66;
        const espessura = Math.max(4, raio * 0.2); // o traço engrossa junto com o token

        // Os dois traços do X, a partir do centro do token (0,0). Como cada stroke()
        // "consome" o caminho, ele é descrito de novo para o segundo desenho.
        const risca = (): Graphics =>
            view.marca.moveTo(-metade, -metade).lineTo(metade, metade).moveTo(metade, -metade).lineTo(-metade, metade);

        // 1) Contorno ESCURO, mais grosso, por baixo: sem ele um X vermelho sumiria
        //    num token vermelho. 2) O X vermelho por cima.
        risca().stroke({ width: espessura + 4, color: 0x1a1a1f, cap: "round" });
        risca().stroke({ width: espessura, color: 0xe53935, cap: "round" });
    }

    /** Um ícone de condição: disco claro (para contraste) + o desenho da condição por cima. */
    function criarIcone(condicaoId: string, ponto: PointData, diametro: number): Container {
        const icone = new Container();
        icone.position.set(ponto.x, ponto.y);

        // Os PNGs são pretos/brancos com fundo transparente: o disco claro com
        // borda escura garante que o ícone se leia sobre qualquer fundo.
        icone.addChild(new Graphics().circle(0, 0, diametro / 2).fill(0xf2f2f6).stroke({ width: 1.5, color: 0x1a1a1f }));

        const textura = texturas.get(condicaoId);
        if (textura) {
            const desenho = new Sprite(textura);
            desenho.anchor.set(0.5); // gira/posiciona pelo centro
            desenho.width = diametro * 0.78; // um pouco menor que o disco, para sobrar margem
            desenho.height = diametro * 0.78;
            icone.addChild(desenho);
        }
        return icone;
    }

    /** O distintivo "+N": aparece no lugar dos ícones que não cabem (N = quantos ficaram de fora). */
    function criarDistintivoExtras(extras: number, ponto: PointData, diametro: number): Container {
        const distintivo = new Container();
        distintivo.position.set(ponto.x, ponto.y);

        // Disco ESCURO com borda branca, para não ser confundido com uma condição.
        distintivo.addChild(new Graphics().circle(0, 0, diametro / 2).fill(0x1a1a1f).stroke({ width: 1.5, color: 0xffffff }));

        // O texto é criado com o DOBRO do tamanho e depois reduzido à metade,
        // para continuar nítido quando o usuário aproxima o zoom.
        const texto = new Text({
            text: `+${extras}`,
            style: { fontFamily: "system-ui, sans-serif", fontSize: Math.round(diametro * 0.55 * 2), fontWeight: "700", fill: 0xffffff },
        });
        texto.anchor.set(0.5);
        texto.scale.set(0.5);
        // Com dois dígitos ("+13") o texto fica mais largo que o disco: encolhe até caber (~82% do disco).
        const excesso = texto.width / (diametro * 0.82);
        if (excesso > 1) texto.scale.set(0.5 / excesso);
        distintivo.addChild(texto);
        return distintivo;
    }

    /**
     * Desenha as condições do token: ícones em anel na borda, o primeiro no
     * TOPO e os outros em SENTIDO HORÁRIO. Mostra no máximo MAX_ICONES_CONDICAO;
     * se houver mais, o lugar seguinte vira "+N".
     */
    function desenharCondicoes(token: Token, view: ViewToken): void {
        // Limpa os ícones anteriores (destroy libera a memória de cada um).
        for (const filho of view.condicoes.removeChildren()) filho.destroy({ children: true });

        // Condições com visual próprio no token (ex.: Morto = X vermelho) não ocupam
        // lugar no anel nem entram na conta do "+N".
        const doAnel = token.condicoes.filter((id) => !buscarCondicao(id)?.visual);
        const total = doAnel.length;
        if (total === 0) return;

        const visiveis = doAnel.slice(0, MAX_ICONES_CONDICAO);
        const extras = total - visiveis.length; // quantas ficaram de fora
        const lugares = visiveis.length + (extras > 0 ? 1 : 0); // +1 lugar para o "+N"

        const diametro = diametroDoIcone(token.size);
        const pontos = posicoesNoAnel(lugares, raioDoToken(token.size), diametro);

        visiveis.forEach((condicaoId, i) => view.condicoes.addChild(criarIcone(condicaoId, pontos[i], diametro)));
        if (extras > 0) view.condicoes.addChild(criarDistintivoExtras(extras, pontos[visiveis.length], diametro));
    }

    /**
     * Os tokens MAIORES ficam por baixo na ordem de desenho. Assim um monstro
     * grande não esconde um personagem em cima dele. (O sort é estável: tokens
     * do mesmo tamanho mantêm a ordem original.)
     */
    function reordenar(): void {
        for (const token of [...estado.tokens].sort((a, b) => b.size - a.size)) {
            const view = views.get(token.id);
            if (view) mundo.addChild(view.raiz); // re-adicionar move para o topo
        }
    }

    // --- Criação das views ---
    // Se o mouse está desligado nos tokens (uma ferramenta de desenho ligada), os novos também nascem assim.
    let interativo = true;

    /** Cria o desenho (view) de UM token e liga os eventos dele. Usada ao abrir e ao criar tokens novos. */
    // ---------------------------------------------------------------
    // A BORDA DA VEZ: um anel suave, dourado, por trás do token, que pulsa de leve (só o brilho muda; o tamanho não). Só existe no token que tem a vez.
    // ---------------------------------------------------------------
    const PERIODO_PULSO_VEZ_MS = 2200;
    const semAnimacao = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    function pulsarVez(): void {
        const anel = vezDestacada === null ? null : views.get(vezDestacada)?.anelVez;
        if (!anel) return;
        const fase = (performance.now() % PERIODO_PULSO_VEZ_MS) / PERIODO_PULSO_VEZ_MS;
        anel.alpha = semAnimacao ? 0.8 : 0.55 + 0.35 * (0.5 - 0.5 * Math.cos(fase * Math.PI * 2)); // vai e volta entre 0,55 e 0,9
    }
    function aplicarAnelDaVez(): void {
        Ticker.shared.remove(pulsarVez);
        for (const [id, view] of views) {
            if (view.anelVez && id !== vezDestacada) {
                view.anelVez.destroy();
                view.anelVez = null;
            }
        }
        if (vezDestacada === null) return;
        const token = buscarToken(vezDestacada);
        const view = views.get(vezDestacada);
        if (!token || !view) return;
        const raio = raioDoToken(token.size);
        const anel = view.anelVez ?? new Graphics();
        anel.clear();
        anel.circle(0, 0, raio + 5).stroke({ width: 9, color: 0xffd54f, alpha: 0.25 }); // o brilho largo e fraco
        anel.circle(0, 0, raio + 3).stroke({ width: 3, color: 0xffd54f, alpha: 0.9 }); // o fio mais nítido
        if (!view.anelVez) {
            view.raiz.addChildAt(anel, 0); // por trás do corpo: só a parte de fora aparece
            view.anelVez = anel;
        }
        pulsarVez();
        if (!semAnimacao) Ticker.shared.add(pulsarVez);
    }

    function criarView(token: Token): void {
        const raiz = new Container();
        const corpo = new Graphics();
        const foto = new Sprite();
        foto.anchor.set(0.5); // o centro da foto fica no centro do token
        foto.visible = false;
        const borda = new Graphics();
        const marca = new Graphics();
        const condicoes = new Container();
        const barras = new Container();
        raiz.addChild(corpo, foto, borda, marca, condicoes, barras); // do fundo para a frente
        const view: ViewToken = { raiz, corpo, foto, borda, fotoUrl: null, marca, anelVez: null, condicoes, barras, vida: somaDaVida(token) };

        desenharCorpo(token, view);
        void desenharFoto(token, view);
        desenharMarca(token, view);
        desenharCondicoes(token, view);
        desenharBarras(token, view);
        posicionar(token, view);
        views.set(token.id, view);
        mundo.addChild(raiz);
        raiz.visible = naCenaAtual(token); // token guardado na bolsa, ou peça de OUTRO mapa, não aparece

        // eventMode "static": o objeto passa a receber eventos do mouse/toque.
        // (O padrão é "passive", que ignora os eventos.) Os filhos (círculo e
        // ícones) contam como parte do token na hora de clicar ou passar o mouse.
        raiz.eventMode = interativo ? "static" : "none";
        raiz.cursor = cursorDe(token); // cursor de mãozinha ao passar por cima (só se a pessoa PODE mover o token)

        // --- Mouse entrando/saindo: mostra/esconde o balão de condições ---
        // (Durante um arrasto o balão não deve aparecer.)
        // ATENÇÃO: o PixiJS escuta o mouse no DOCUMENTO inteiro, então mesmo com o mouse em cima de algo HTML (o balão de condições, os menus, painéis, o chat) ele continua
        // achando qual token está POR BAIXO e dispara o hover dele, o que trocava/escondia o balão. Por isso só vale o evento cujo alvo real é o canvas.
        const sobreOMapa = (evento: FederatedPointerEvent): boolean => {
            const alvo = (evento.nativeEvent as Event | undefined)?.target;
            return !(alvo instanceof HTMLElement) || alvo.tagName === "CANVAS";
        };
        raiz.on("pointerover", (evento: FederatedPointerEvent) => {
            if (!arrastando && sobreOMapa(evento)) opcoes.aoPassarMouse(token);
        });
        raiz.on("pointerout", (evento: FederatedPointerEvent) => {
            if (sobreOMapa(evento)) opcoes.aoSairMouse(token);
        });

        raiz.on("pointerdown", (evento: FederatedPointerEvent) => {
            // Botão DIREITO (2): abre as opções do token, sem arrastar.
            if (evento.button === 2) {
                opcoes.aoClicarDireito(token);
                return;
            }
            // Qualquer botão que não seja o esquerdo (0) é ignorado.
            if (evento.button !== 0) return;

            // SELEÇÃO: Ctrl + clique liga/desliga este token na seleção (sem arrastar e sem contar como duplo clique); o clique comum seleciona SÓ este (a menos que ele já esteja numa
            // seleção: aí arrasta o grupo).
            if (evento.ctrlKey || evento.metaKey) {
                if (selecionadosIds.has(token.id)) selecionadosIds.delete(token.id);
                else selecionadosIds.add(token.id);
                desenharSelecao();
                return;
            }

            // Um token que esta pessoa não pode usar (não é dele nem foi liberado) não se arrasta nem abre ficha: só dá para olhar. (O servidor recusa de qualquer jeito.)
            if (!podeUsarToken(token)) return;

            // DUPLO CLIQUE: o segundo aperto no MESMO token, logo depois e sem o mouse ter andado, abre a ficha (e não começa um arrasto).
            const agora = performance.now();
            const ehDuplo =
                ultimoAperto.id === token.id && agora - ultimoAperto.t <= MS_DUPLO_CLIQUE && Math.hypot(evento.global.x - ultimoAperto.x, evento.global.y - ultimoAperto.y) <= PX_DUPLO_CLIQUE;
            ultimoAperto = ehDuplo ? { id: -1, t: 0, x: 0, y: 0 } : { id: token.id, t: agora, x: evento.global.x, y: evento.global.y };
            if (ehDuplo) {
                opcoes.aoDuploClique(token);
                return;
            }

            if (!selecionadosIds.has(token.id)) selecionarSo(token.id);

            // --- INÍCIO DO ARRASTO ---
            opcoes.aoIniciarArrasto();
            arrastando = { token, view };
            grupo = [];
            if (selecionadosIds.size > 1) {
                for (const id of selecionadosIds) {
                    const outro = buscarToken(id);
                    const v = views.get(id);
                    if (id !== token.id && outro && v && naCenaAtual(outro)) grupo.push({ token: outro, view: v, dx: v.raiz.x - raiz.x, dy: v.raiz.y - raiz.y });
                }
            }
            for (const m of grupo) mundo.addChild(m.view.raiz); // (todos passam por cima dos outros enquanto andam)
            // O ponteiro de AGORA. `ultimoPonto` só era atualizado quando o mouse SE MOVIA durante o arrasto; um clique sem mover (ou um duplo clique) usava a posição VELHA do arrasto
            // anterior. Depois de clicar num token da bolsa, essa posição estava em cima da bolsa: ao clicar num token do tabuleiro, `soltar` achava que ele tinha sido solto na bolsa e o REMOVIA.
            ultimoPonto = { x: evento.global.x, y: evento.global.y };

            const ponto = camera.telaParaMundo(evento.global);
            deslocamentoX = raiz.x - ponto.x;
            deslocamentoY = raiz.y - ponto.y;

            // Re-adicionar ao container move o token para o topo da ordem de desenho,
            // assim ele passa por cima dos outros tokens enquanto arrasta.
            mundo.addChild(raiz);
            raiz.cursor = "grabbing";

            // O destaque assume o tamanho do token e já começa na casa atual dele.
            grade.mostrarDestaque(token.size, token.col, token.row);
        });
    }
    /** Apaga o desenho de UM token (o token já deve ter saído do estado, ou ser recriado em seguida). */
    function destruirView(id: number): void {
        const view = views.get(id);
        if (!view) return;
        if (arrastando?.token.id === id) {
            // Alguém segurava este token: cancela o arrasto sem tocar em mais nada (o token já não existe).
            arrastando = null;
            sobreBolsa = false;
            opcoes.aoEsconderSobreBolsa();
            opcoes.aoMudarSobreBolsa(false);
            grade.esconderDestaque();
        }
        views.delete(id);
        const estavaSelecionado = selecionadosIds.delete(id);
        aneisSelecao.delete(id); // (o anel é filho da raiz: é destruído junto com ela)
        grupo = grupo.filter((m) => m.token.id !== id);
        mundo.removeChild(view.raiz);
        view.raiz.destroy({ children: true }); // (a textura da imagem é compartilhada: sai da memória logo abaixo, se ninguém mais a usa)
        const url = view.fotoUrl;
        if (url && !estado.tokens.some((t) => t.imagem === url)) void Assets.unload(url);
        if (estavaSelecionado) opcoes.aoMudarSelecao(selecionadosVivos());
    }

    for (const token of estado.tokens) criarView(token);
    reordenar(); // garante a ordem "maiores por baixo" desde o início

    return {
        adicionar(token) {
            if (views.has(token.id)) return;
            criarView(token);
            reordenar();
        },

        remover(id) {
            destruirView(id);
        },

        reconstruir() {
            for (const id of [...views.keys()]) destruirView(id);
            selecionadosIds.clear();
            for (const token of estado.tokens) criarView(token);
            reordenar();
            aplicarAnelDaVez();
            opcoes.aoMudarSelecao([]);
        },

        tokenEm(ponto) {
            const mundo = camera.telaParaMundo(ponto);
            let achado: Token | null = null;
            for (const [id, view] of views) {
                const token = buscarToken(id);
                if (!token || !naCenaAtual(token) || !view.raiz.visible) continue;
                if (Math.hypot(mundo.x - view.raiz.x, mundo.y - view.raiz.y) > raioDoToken(token.size)) continue; // (fora do círculo do token)
                if (!achado || token.size < achado.size || (token.size === achado.size && token.id > achado.id)) achado = token;
            }
            return achado;
        },

        destacarVez(id) {
            vezDestacada = id;
            aplicarAnelDaVez();
        },

        destacarAlvo(token) {
            const novoId = token?.id ?? null;
            if (novoId === alvoDestacado) return;
            if (alvoDestacado !== null) views.get(alvoDestacado)?.raiz.scale.set(1);
            alvoDestacado = novoId;
            if (novoId !== null) views.get(novoId)?.raiz.scale.set(1.12);
        },

        aplicarPosicao(token) {
            const view = views.get(token.id);
            if (!view || arrastando?.token.id === token.id) return;
            view.raiz.visible = naCenaAtual(token);
            if (!naCenaAtual(token) && selecionadosIds.delete(token.id)) desenharSelecao();
            desenharBarras(token, view); // (os status nascem ao sair da bolsa e somem ao voltar)
            posicionar(token, view);
        },

        get selecionados() {
            return selecionadosVivos();
        },

        limparSelecao() {
            if (selecionadosIds.size === 0) return;
            selecionadosIds.clear();
            desenharSelecao();
        },

        get selecionando() {
            return retangulo !== null;
        },

        iniciarRetangulo(ponto) {
            const p = camera.telaParaMundo(ponto);
            const desenho = new Graphics();
            mundo.addChild(desenho);
            retangulo = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, desenho };
        },

        arrastarRetangulo(ponto) {
            if (!retangulo) return;
            const p = camera.telaParaMundo(ponto);
            retangulo.x1 = p.x;
            retangulo.y1 = p.y;
            const { x0, y0, desenho } = retangulo;
            desenho.clear().rect(Math.min(x0, p.x), Math.min(y0, p.y), Math.abs(p.x - x0), Math.abs(p.y - y0)).fill({ color: COR_SELECAO, alpha: ALPHA_RETANGULO_SELECAO }).stroke({ width: 2 / camera.zoom, color: COR_SELECAO });
        },

        soltarRetangulo() {
            if (!retangulo) return;
            const { x0, y0, x1, y1, desenho } = retangulo;
            retangulo = null;
            desenho.destroy();
            selecionadosIds.clear();
            // Seleciona os tokens à vista cujo CENTRO ficou dentro do retângulo.
            const minX = Math.min(x0, x1);
            const maxX = Math.max(x0, x1);
            const minY = Math.min(y0, y1);
            const maxY = Math.max(y0, y1);
            for (const token of estado.tokens) {
                if (!naCenaAtual(token)) continue;
                const cx = (token.col + token.size / 2) * TAMANHO_CASA;
                const cy = (token.row + token.size / 2) * TAMANHO_CASA;
                if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) selecionadosIds.add(token.id);
            }
            desenharSelecao();
        },

        get arrastando() {
            return arrastando !== null;
        },

        arrastarPara(ponto) {
            if (!arrastando) return;
            const { token, view } = arrastando;
            ultimoPonto = ponto;

            const p = camera.telaParaMundo(ponto);

            // O token acompanha o mouse livremente (sem encaixe) para ficar fluido.
            view.raiz.position.set(p.x + deslocamentoX, p.y + deslocamentoY);
            for (const m of grupo) m.view.raiz.position.set(view.raiz.x + m.dx, view.raiz.y + m.dy); // (o grupo acompanha, com as mesmas distâncias)

            // Descobre onde o token encaixaria agora (canto superior esquerdo)
            // e mostra o destaque nesse bloco.
            const col = casaMaisProxima(view.raiz.x, token.size, estado.colunas);
            const row = casaMaisProxima(view.raiz.y, token.size, estado.linhas);

            // Sobre a bolsa: o destaque da grade some (soltar ali guarda o token) e a bolsa se destaca.
            const sobre = opcoes.sobreBolsa(ponto);
            if (sobre !== sobreBolsa) {
                sobreBolsa = sobre;
                opcoes.aoMudarSobreBolsa(sobre);
                if (sobre) grade.esconderDestaque();
                else grade.mostrarDestaque(token.size, col, row);
            }
            if (!sobre) grade.moverDestaque(col, row);

            // Sobre a bolsa o token do canvas ficaria ESCONDIDO atrás do painel: ele some (alpha 0) e uma cópia
            // em HTML, por cima da bolsa, ocupa o lugar dele. Fora da bolsa, volta o token do canvas.
            if (sobre) {
                const centro = camera.mundoParaTela(view.raiz.x, view.raiz.y);
                opcoes.aoMostrarSobreBolsa(token, centro, raioDoToken(token.size) * 2 * camera.zoom, LARGURA_BORDA_TOKEN * camera.zoom);
                view.raiz.alpha = 0;
                for (const m of grupo) m.view.raiz.alpha = 0;
            } else {
                view.raiz.alpha = 1;
                for (const m of grupo) m.view.raiz.alpha = 1;
                opcoes.aoEsconderSobreBolsa();
            }
        },

        soltar() {
            if (!arrastando) return;
            const { token, view } = arrastando;
            const veioDaBolsa = token.guardado;
            const ehPeca = token.copiaDe !== null; // (uma PEÇA é a cópia temporária que vive no tabuleiro)
            let guardar = opcoes.sobreBolsa(ultimoPonto);
            let depoisDaLimpeza: (() => void) | null = null; // o aviso a dar quando o arrasto já terminou (o estado muda fora daqui)

            // ARRASTO EM GRUPO (vários selecionados): só vale TUDO OU NADA. Se algum sair do tabuleiro, todos voltam para onde estavam; soltos na bolsa, todos são removidos juntos.
            if (grupo.length > 0 && !veioDaBolsa) {
                const membros = [{ token, view, dx: 0, dy: 0 }, ...grupo];
                grupo = [];
                const mover = membros.map((m) => ({
                    ...m,
                    col: Math.round((m.view.raiz.x - (m.token.size * TAMANHO_CASA) / 2) / TAMANHO_CASA), // (SEM limitar: é justamente para saber se algum caiu fora)
                    row: Math.round((m.view.raiz.y - (m.token.size * TAMANHO_CASA) / 2) / TAMANHO_CASA),
                }));
                const principal = mover[0];
                const dCol = principal.col - token.col;
                const dRow = principal.row - token.row;
                const cabe = mover.every((m) => {
                    const c = m.token.col + dCol;
                    const l = m.token.row + dRow;
                    return c >= 0 && l >= 0 && c + m.token.size <= estado.colunas && l + m.token.size <= estado.linhas;
                });
                view.raiz.cursor = cursorDe(token);
                for (const m of mover) m.view.raiz.alpha = 1;
                opcoes.aoEsconderSobreBolsa();
                grade.esconderDestaque();
                arrastando = null;
                if (sobreBolsa) opcoes.aoMudarSobreBolsa(false);
                sobreBolsa = false;
                const semPermissao = guardar ? mover.find((m) => m.token.copiaDe !== null && !podeUsarToken(m.token)) : undefined;
                if (semPermissao) {
                    // Alguma peça do grupo não pode ser tirada do mapa por esta pessoa: NADA é removido (tudo ou nada) e todas voltam ao lugar, com aviso. (Verifica ANTES de esconder qualquer uma.)
                    for (const m of mover) posicionar(m.token, m.view);
                    opcoes.aoSemPermissao(semPermissao.token.nome);
                } else if (guardar) {
                    for (const m of mover) m.view.raiz.visible = false;
                    selecionadosIds.clear();
                    desenharSelecao();
                    opcoes.aoRemoverVarios(mover.map((m) => m.token));
                } else if (cabe) {
                    for (const m of mover) {
                        colocarToken(m.token.id, m.token.col + dCol, m.token.row + dRow);
                        posicionar(m.token, m.view);
                        opcoes.aoSoltarToken(m.token);
                    }
                } else {
                    for (const m of mover) posicionar(m.token, m.view); // movimento INVÁLIDO: todos voltam para onde estavam
                }
                return;
            }
            grupo = [];

            if (guardar && ehPeca && !podeUsarToken(token)) {
                // Sem acesso a este token (nem leitor): não pode tirar esta peça do mapa: NÃO some (nada é escondido antes de saber): volta ao lugar e a pessoa é avisada. O servidor também recusaria.
                posicionar(token, view);
                view.raiz.visible = true;
                guardar = false;
                depoisDaLimpeza = () => opcoes.aoSemPermissao(token.nome);
            } else if (guardar && ehPeca) {
                // Uma PEÇA solta na bolsa: ela é temporária, então é APAGADA (quem trata cuida do estado, da rede e do "Desfazer").
                const { col: colAntes, row: rowAntes } = token;
                view.raiz.visible = false;
                depoisDaLimpeza = () => opcoes.aoRemoverPeca(token, colAntes, rowAntes);
            } else if (guardar) {
                const { col: colAntes, row: rowAntes } = token; // (onde ele estava, para o "Desfazer")
                guardarToken(token.id); // 1) estado: na bolsa
                view.raiz.visible = false; // 2) some do tabuleiro
                desenharBarras(token, view); // (os status temporários se perdem: as barras somem)
                if (!veioDaBolsa) opcoes.aoRemoverArrastando(token, colAntes, rowAntes);
            } else if (veioDaBolsa && !ehPeca) {
                // Um token da BOLSA solto no tabuleiro: NÃO se move para lá. Ele continua na bolsa e nasce uma PEÇA (cópia) na casa escolhida.
                const col = casaMaisProxima(view.raiz.x, token.size, estado.colunas);
                const row = casaMaisProxima(view.raiz.y, token.size, estado.linhas);
                view.raiz.visible = false; // (o token da bolsa nunca aparece no tabuleiro; a peça nova terá o desenho dela)
                depoisDaLimpeza = () => opcoes.aoSoltarModelo(token, col, row);
            } else {
                // Encaixe: canto superior esquerdo mais próximo onde o token cabe inteiro.
                const col = casaMaisProxima(view.raiz.x, token.size, estado.colunas);
                const row = casaMaisProxima(view.raiz.y, token.size, estado.linhas);

                colocarToken(token.id, col, row); // 1) atualiza o ESTADO (e tira da bolsa, se estava lá)
                posicionar(token, view); // 2) a VIEW encaixa no bloco
                desenharBarras(token, view); // (se acabou de sair da bolsa, os status nasceram agora: as barras aparecem)
                view.raiz.visible = true;
            }

            view.raiz.cursor = cursorDe(token);
            view.raiz.alpha = 1; // (estava escondido enquanto a cópia em HTML aparecia sobre a bolsa)
            opcoes.aoEsconderSobreBolsa();
            grade.esconderDestaque();
            arrastando = null;
            if (sobreBolsa) opcoes.aoMudarSobreBolsa(false);
            sobreBolsa = false;
            // A lista da bolsa muda se o token foi guardado, ou se veio de lá e foi colocado.
            if (guardar !== veioDaBolsa) opcoes.aoMudarBolsa();
            if (depoisDaLimpeza) depoisDaLimpeza();
            else opcoes.aoSoltarToken(token); // (no modo online o servidor é avisado aqui)
        },

        iniciarArrastoDaBolsa(id, ponto) {
            const token = buscarToken(id);
            const view = views.get(id);
            if (!token || !view || !token.guardado || arrastando) return;

            opcoes.aoIniciarArrasto();
            arrastando = { token, view };
            grupo = [];
            // O centro do token fica sob o mouse (não há "ponto de pegada" como num token do tabuleiro).
            deslocamentoX = 0;
            deslocamentoY = 0;
            sobreBolsa = true; // começa em cima da bolsa
            opcoes.aoMudarSobreBolsa(true);

            view.raiz.visible = true; // aparece sob o mouse (o estado só muda ao soltar)
            mundo.addChild(view.raiz); // por cima dos outros
            view.raiz.cursor = "grabbing";
            this.arrastarPara(ponto);
        },

        definirInterativo(ativo) {
            // "none": o token (e seus filhos) ignora o mouse e os eventos passam para o palco.
            interativo = ativo;
            for (const view of views.values()) view.raiz.eventMode = ativo ? "static" : "none";
        },

        reposicionar(tokens) {
            for (const token of tokens) {
                const view = views.get(token.id);
                if (view) posicionar(token, view);
            }
        },

        redesenhar(token, animar = false) {
            const view = views.get(token.id);
            if (!view) return;
            const vidaAntes = view.vida;
            if (view.raiz.cursor !== "grabbing") view.raiz.cursor = cursorDe(token); // (a permissão pode ter mudado)
            desenharCorpo(token, view);
            void desenharFoto(token, view);
            desenharMarca(token, view);
            desenharCondicoes(token, view);
            desenharBarras(token, view);
            posicionar(token, view);
            reordenar(); // o novo tamanho pode mudar quem fica por cima
            if (vezDestacada === token.id) aplicarAnelDaVez(); // (o tamanho do anel acompanha o do token)
            if (animar && naCenaAtual(token)) {
                // `"dano"` ou `"cura"` (o servidor diz o que aconteceu): anima SEMPRE, mesmo que a vida visível não tenha mudado (vida em 0, ou status escondido: a animação não pode denunciar o valor).
                // `true`: anima só se a vida visível mudou (os outros caminhos, que só têm os números).
                const tipo = animar === "dano" || animar === "cura" ? animar : view.vida !== vidaAntes ? (view.vida < vidaAntes ? "dano" : "cura") : null;
                if (tipo) animarVida(token, view, tipo);
            }
        },

        ancoraNaTela(id) {
            const token = buscarToken(id);
            if (!token) return null;
            // Canto superior ESQUERDO do bloco do token (é exatamente col,row), convertido
            // para a tela, e a largura do bloco NA TELA (considera o zoom).
            const canto = camera.mundoParaTela(token.col * TAMANHO_CASA, token.row * TAMANHO_CASA);
            return { x: canto.x, y: canto.y, largura: token.size * TAMANHO_CASA * camera.zoom };
        },

        ancoraBalao(id) {
            const token = buscarToken(id);
            if (!token) return null;
            // O círculo fica FOLGA_TOKEN para dentro do bloco, e um ícone na borda do anel
            // se projeta meio ícone para fora do círculo: o balão deve ficar além disso.
            const meioIcone = diametroDoIcone(token.size) / 2;
            const x = (token.col + token.size / 2) * TAMANHO_CASA;
            const topo = camera.mundoParaTela(x, token.row * TAMANHO_CASA + FOLGA_TOKEN - meioIcone);
            const base = camera.mundoParaTela(x, (token.row + token.size) * TAMANHO_CASA - FOLGA_TOKEN + meioIcone);
            return { x: topo.x, topo: topo.y, base: base.y };
        },
    };
}
