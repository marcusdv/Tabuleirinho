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

import { Assets, Container, FederatedPointerEvent, Graphics, PointData, Sprite, Text, Texture } from "pixi.js";
import { buscarCondicao } from "../condicoes";
import { FOLGA_TOKEN, LARGURA_BORDA_TOKEN, MAX_ICONES_CONDICAO, TAMANHO_CASA } from "../config";
import { casaMaisProxima, diametroDoIcone, posicoesNoAnel } from "../coordenadas";
import { buscarToken, colocarToken, estado, guardarToken, Token } from "../estado";
import type { Camera } from "./camera";
import type { Grade } from "./grade";

/** Avisos que esta camada envia para quem a criou. */
export interface OpcoesTokens {
    /** O usuário começou a arrastar um token (clique esquerdo). */
    aoIniciarArrasto(): void;
    /** O usuário clicou com o botão DIREITO num token. */
    aoClicarDireito(token: Token): void;
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
    /**
     * O usuário SOLTOU um token (já aplicado ao estado local: `token.guardado`, `col` e `row` valem). No modo online, quem
     * criou esta camada manda o pedido ao servidor, que é quem decide.
     */
    aoSoltarToken(token: Token): void;
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
    /** Cria o desenho de um token que acabou de entrar no estado (ex.: criado na bolsa). */
    adicionar(token: Token): void;
    /**
     * Mostra o token onde o ESTADO diz que ele está (no mapa, ou escondido se está na bolsa). Usado quando a posição
     * vem de FORA (do servidor). Se o usuário está segurando este token agora, não mexe: o que ele soltar vale.
     */
    aplicarPosicao(token: Token): void;
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
    /** Redesenha um token cujo tamanho ou condições mudaram. */
    redesenhar(token: Token): void;
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
    condicoes: Container;
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

    // Estado do arrasto. Só um token é arrastado por vez.
    let arrastando: { token: Token; view: ViewToken } | null = null;
    // Distância entre o ponto onde clicamos e o centro do token.
    // Sem isso, o token "pularia" para centralizar no cursor ao clicar.
    let deslocamentoX = 0;
    let deslocamentoY = 0;
    // Último ponto (TELA) do mouse durante o arrasto, e se ele está sobre a bolsa.
    let ultimoPonto: PointData = { x: 0, y: 0 };
    let sobreBolsa = false;

    /**
     * Posiciona a view conforme o estado. (col,row) é o canto superior
     * esquerdo; o CENTRO do bloco fica meio "size" para dentro.
     * Ex.: token 3x3 em col=20 -> centro em (20 + 1,5) casas.
     */
    function posicionar(token: Token, view: ViewToken): void {
        view.raiz.position.set((token.col + token.size / 2) * TAMANHO_CASA, (token.row + token.size / 2) * TAMANHO_CASA);
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
    function criarView(token: Token): void {
        const raiz = new Container();
        const corpo = new Graphics();
        const foto = new Sprite();
        foto.anchor.set(0.5); // o centro da foto fica no centro do token
        foto.visible = false;
        const borda = new Graphics();
        const marca = new Graphics();
        const condicoes = new Container();
        raiz.addChild(corpo, foto, borda, marca, condicoes); // do fundo para a frente
        const view: ViewToken = { raiz, corpo, foto, borda, fotoUrl: null, marca, condicoes };

        desenharCorpo(token, view);
        void desenharFoto(token, view);
        desenharMarca(token, view);
        desenharCondicoes(token, view);
        posicionar(token, view);
        views.set(token.id, view);
        mundo.addChild(raiz);
        raiz.visible = !token.guardado; // token guardado na bolsa não aparece no mapa

        // eventMode "static": o objeto passa a receber eventos do mouse/toque.
        // (O padrão é "passive", que ignora os eventos.) Os filhos (círculo e
        // ícones) contam como parte do token na hora de clicar ou passar o mouse.
        raiz.eventMode = interativo ? "static" : "none";
        raiz.cursor = "grab"; // cursor de mãozinha ao passar por cima

        // --- Mouse entrando/saindo: mostra/esconde o balão de condições ---
        // (Durante um arrasto o balão não deve aparecer.)
        raiz.on("pointerover", () => {
            if (!arrastando) opcoes.aoPassarMouse(token);
        });
        raiz.on("pointerout", () => opcoes.aoSairMouse(token));

        raiz.on("pointerdown", (evento: FederatedPointerEvent) => {
            // Botão DIREITO (2): abre as opções do token, sem arrastar.
            if (evento.button === 2) {
                opcoes.aoClicarDireito(token);
                return;
            }
            // Qualquer botão que não seja o esquerdo (0) é ignorado.
            if (evento.button !== 0) return;

            // --- INÍCIO DO ARRASTO ---
            opcoes.aoIniciarArrasto();
            arrastando = { token, view };

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
    for (const token of estado.tokens) criarView(token);
    reordenar(); // garante a ordem "maiores por baixo" desde o início

    return {
        adicionar(token) {
            criarView(token);
            reordenar();
        },

        aplicarPosicao(token) {
            const view = views.get(token.id);
            if (!view || arrastando?.token.id === token.id) return;
            view.raiz.visible = !token.guardado;
            posicionar(token, view);
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
            } else {
                view.raiz.alpha = 1;
                opcoes.aoEsconderSobreBolsa();
            }
        },

        soltar() {
            if (!arrastando) return;
            const { token, view } = arrastando;
            const veioDaBolsa = token.guardado;
            const guardar = opcoes.sobreBolsa(ultimoPonto);

            if (guardar) {
                guardarToken(token.id); // 1) estado: na bolsa
                view.raiz.visible = false; // 2) some do tabuleiro
            } else {
                // Encaixe: canto superior esquerdo mais próximo onde o token cabe inteiro.
                const col = casaMaisProxima(view.raiz.x, token.size, estado.colunas);
                const row = casaMaisProxima(view.raiz.y, token.size, estado.linhas);

                colocarToken(token.id, col, row); // 1) atualiza o ESTADO (e tira da bolsa, se estava lá)
                posicionar(token, view); // 2) a VIEW encaixa no bloco
                view.raiz.visible = true;
            }

            view.raiz.cursor = "grab";
            view.raiz.alpha = 1; // (estava escondido enquanto a cópia em HTML aparecia sobre a bolsa)
            opcoes.aoEsconderSobreBolsa();
            grade.esconderDestaque();
            arrastando = null;
            if (sobreBolsa) opcoes.aoMudarSobreBolsa(false);
            sobreBolsa = false;
            // A lista da bolsa muda se o token foi guardado, ou se veio de lá e foi colocado.
            if (guardar !== veioDaBolsa) opcoes.aoMudarBolsa();
            opcoes.aoSoltarToken(token); // (no modo online o servidor é avisado aqui)
        },

        iniciarArrastoDaBolsa(id, ponto) {
            const token = buscarToken(id);
            const view = views.get(id);
            if (!token || !view || !token.guardado || arrastando) return;

            opcoes.aoIniciarArrasto();
            arrastando = { token, view };
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

        redesenhar(token) {
            const view = views.get(token.id);
            if (!view) return;
            desenharCorpo(token, view);
            void desenharFoto(token, view);
            desenharMarca(token, view);
            desenharCondicoes(token, view);
            posicionar(token, view);
            reordenar(); // o novo tamanho pode mudar quem fica por cima
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
