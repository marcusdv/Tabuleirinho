// =====================================================================
// TABULEIRINHO — ponto de entrada.
// Este arquivo só CRIA os módulos e os LIGA uns aos outros. A lógica de
// cada parte mora no seu próprio arquivo:
//
//   config.ts                    constantes
//   condicoes.ts                 catálogo das condições (nomes e ícones)
//   estado.ts                    dados e regras (tokens, tamanho do tabuleiro)
//   coordenadas.ts               funções puras de coordenadas
//   tabuleiro/camera             pan, zoom e limites
//   tabuleiro/grade              grade e destaque de destino
//   tabuleiro/tokens             desenho e arrasto dos tokens (e ícones de condição)
//   tabuleiro/iconesCondicoes    carrega e reduz as imagens das condições
//   tabuleiro/interacao          eventos do mouse no palco (pan)
//   tabuleiro/calibragem         retângulo de medição para casar a grade com o mapa
//   ui/painelCalibragem          painel da calibragem (HTML)
//   ui/chat                      chat embaixo, com as mensagens da esquerda para a direita (HTML)
//   ui/barra                     barra de ferramentas (HTML)
//   ui/menuToken                 engrenagem, tamanho e condições do token (HTML)
//   ui/balaoToken                balão com as condições ao passar o mouse (HTML)
//   ui/dicaCondicao              balão com a descrição de uma condição (HTML)
//
// Ideia central: separamos DADOS (estado.ts) de DESENHO (tabuleiro/*).
// Isso facilita o multiplayer depois: o servidor guardará o estado e os
// navegadores só desenharão.
// =====================================================================

import { Application } from "pixi.js";
import {
    adicionarMensagem,
    alternarCondicao,
    apagarTodosDesenhos,
    definirTamanhoTabuleiro,
    estado,
    mudarTamanhoToken,
    redimensionarTabuleiro,
    type Token,
} from "./estado";
import { AUTOR_PROVISORIO, COLUNAS_INICIAIS, LINHAS_INICIAIS } from "./config";
import { criarCalibragem } from "./tabuleiro/calibragem";
import { criarCamera } from "./tabuleiro/camera";
import { criarDesenho, type FerramentaDesenho } from "./tabuleiro/desenho";
import { criarGrade } from "./tabuleiro/grade";
import { carregarTexturasCondicoes } from "./tabuleiro/iconesCondicoes";
import { ativarInteracao } from "./tabuleiro/interacao";
import { criarMapa } from "./tabuleiro/mapa";
import { criarRegua } from "./tabuleiro/regua";
import { criarTokens } from "./tabuleiro/tokens";
import { criarBalaoToken } from "./ui/balaoToken";
import { criarBolsa } from "./ui/bolsa";
import { criarChat } from "./ui/chat";
import { criarBarra } from "./ui/barra";
import { criarDicaCondicao } from "./ui/dicaCondicao";
import { criarMenuToken } from "./ui/menuToken";
import { criarPainelCalibragem } from "./ui/painelCalibragem";
import { criarPainelDesenho, type NomeFerramenta } from "./ui/painelDesenho";

async function iniciar(): Promise<void> {
    const app = new Application();

    // init() prepara o renderizador (WebGL/WebGPU) e cria o <canvas>.
    // resizeTo: o canvas acompanha o tamanho do container da página, que
    // ocupa a janela inteira (a barra de ferramentas flutua por cima dele).
    const container = document.getElementById("app") as HTMLDivElement;
    await app.init({
        resizeTo: container,
        background: 0x1a1a1f,
        antialias: true, // suaviza as bordas dos círculos
        resolution: window.devicePixelRatio || 1, // nitidez em telas de alta densidade
        autoDensity: true,
    });
    container.appendChild(app.canvas);

    // Os ícones das condições precisam estar carregados antes de criar os tokens.
    const texturas = await carregarTexturasCondicoes();

    // --- Criação dos módulos (a ORDEM importa: grade antes dos tokens, para
    // os tokens ficarem desenhados por cima da grade) ---
    const camera = criarCamera(app);
    const mapa = criarMapa(camera); // antes da grade: a imagem fica por baixo de tudo
    const grade = criarGrade(camera);
    // As pinturas ficam por cima do mapa e da grade e por baixo dos tokens (criadas antes deles).
    const desenho = criarDesenho(camera, {
        aoMudar: () => painelDesenho.atualizar(),
        aoCriar: (cor) => painelDesenho.usarCor(cor), // a cor entra na pilha das recentes
    });

    const barra = criarBarra(camera, { aoMudarTamanhoTabuleiro, aoAlternarCalibragem: alternarCalibragem, aoEscolherMapa: escolherMapa, aoVoltarAoPadrao: voltarAoPadrao });

    // O chat (embaixo, fixo). Por enquanto só a interface: enviar guarda a mensagem no estado e refaz a faixa.
    const chat = criarChat({
        aoEnviar: (texto) => {
            adicionarMensagem(AUTOR_PROVISORIO, texto); // 1) estado
            chat.atualizar(); // 2) interface
        },
    });

    const painelCalibragem = criarPainelCalibragem({ aoConcluir: () => ligarCalibragem(false) });

    const painelDesenho = criarPainelDesenho({
        aoEscolher: escolherFerramenta,
        aoMudarCor: (cor) => desenho.definirCor(cor),
        aoApagarTudo: () => {
            apagarTodosDesenhos(); // 1) estado
            desenho.redesenhar(); // 2) desenho
            painelDesenho.atualizar();
        },
    });

    // Balão com a descrição de uma condição: compartilhado pelo menu "Add condição"
    // e pelo balão do token.
    const dica = criarDicaCondicao();

    const menu = criarMenuToken({
        ancora: (id) => tokens.ancoraNaTela(id), // "tokens" já existe quando isto for chamado
        aoMudarTamanho: mudarTamanhoDoToken,
        aoAlternarCondicao: alternarCondicaoDoToken,
        dica,
    });

    const balao = criarBalaoToken({
        ancora: (id) => tokens.ancoraBalao(id),
        dica,
    });

    // A bolsa de tokens (canto inferior direito). Os arrastos que começam nela passam pelos tokens.
    const bolsa = criarBolsa({
        aoComecarArrasto: (id, ponto) => {
            if (calibragem.ativa || ferramentaAtual !== "mover") return false; // com uma ferramenta ligada, os tokens ficam parados
            tokens.iniciarArrastoDaBolsa(id, ponto);
            return tokens.arrastando;
        },
        aoArrastar: (ponto) => tokens.arrastarPara(ponto),
        aoSoltar: () => tokens.soltar(),
    });

    const tokens = criarTokens(camera, grade, texturas, {
        sobreBolsa: (ponto) => bolsa.contem(ponto),
        aoMudarSobreBolsa: (sobre) => bolsa.marcarAlvo(sobre),
        aoMudarBolsa: () => bolsa.atualizar(),
        aoIniciarArrasto: () => {
            menu.fechar();
            balao.esconder();
        },
        aoClicarDireito: (token) => {
            balao.esconder(); // os botões do token ocupam o lugar do balão
            menu.abrir(token.id);
        },
        aoPassarMouse: (token) => balao.mostrar(token.id),
        // Ao sair do token o balão NÃO some na hora: dá tempo de o mouse chegar até ele.
        aoSairMouse: () => balao.agendarEsconder(),
    });

    // Criada depois dos tokens: o retângulo de medição fica desenhado por cima de tudo.
    const calibragem = criarCalibragem(app, camera, {
        casas: () => painelCalibragem.casas(),
        aoMedir: (colunas, linhas) => painelCalibragem.mostrarMedida(colunas, linhas),
        aoAplicar: (colunas, linhas) => {
            aplicarTamanho(definirTamanhoTabuleiro(colunas, linhas)); // limita a MIN/MAX_CASAS
            painelCalibragem.mostrarAplicado(colunas, linhas, estado.colunas, estado.linhas);
        },
    });

    // A régua fica por cima de tudo (inclusive dos tokens).
    const regua = criarRegua(camera, { aoMedir: (texto) => painelDesenho.mostrarDistancia(texto) });

    ativarInteracao(app, camera, tokens, [calibragem, desenho, regua], {
        aoClicarNoFundo: () => menu.fechar(),
        aoIniciarPan: () => {
            menu.fechar();
            balao.esconder();
        },
    });

    // --- Reações a mudanças ---

    // Zoom mudou: refaz a grade (espessura da linha), fecha o menu e o balão (ficariam
    // fora de lugar) e atualiza os números da barra.
    camera.aoMudarZoom = () => {
        grade.desenhar();
        regua.redesenhar(); // o tamanho do texto e da linha, na tela, depende do zoom
        menu.fechar();
        balao.esconder();
        barra.atualizar();
    };

    // Janela redimensionada: só reajusta aos limites (não volta ao centro, para
    // não desfazer o pan do usuário).
    app.renderer.on("resize", () => {
        camera.limitar();
        menu.fechar();
        balao.esconder();
    });

    /** Botões de colunas/linhas da barra: muda o ESTADO e atualiza o desenho. */
    function aoMudarTamanhoTabuleiro(deltaColunas: number, deltaLinhas: number): void {
        aplicarTamanho(redimensionarTabuleiro(deltaColunas, deltaLinhas)); // 1) estado, 2) desenho
    }

    /** Atualiza o DESENHO depois de o ESTADO mudar o tamanho do tabuleiro (botões ou calibragem). */
    function aplicarTamanho(movidos: Token[]): void {
        mapa.ajustar(); // a imagem acompanha o novo tamanho do tabuleiro
        grade.desenhar();
        tokens.reposicionar(movidos);
        camera.limitar(); // o tabuleiro mudou de tamanho: reajusta a câmera
        menu.fechar();
        balao.esconder();
        barra.atualizar();
    }

    /** Botão "Voltar ao padrão": tamanho inicial do tabuleiro, zoom em 100% e visão centralizada. */
    function voltarAoPadrao(): void {
        aplicarTamanho(definirTamanhoTabuleiro(COLUNAS_INICIAIS, LINHAS_INICIAIS)); // 1) estado e desenho do tamanho
        camera.aplicarZoom(1); // 2) zoom em 100%
        camera.centralizar();
    }

    /** Botão "Escolher mapa": troca a imagem de fundo (o tamanho do tabuleiro continua o mesmo). */
    async function escolherMapa(arquivo: File): Promise<void> {
        const problema = await mapa.carregarArquivo(arquivo); // 1) estado + imagem
        if (problema) {
            alert(problema); // o mapa anterior continua
            return;
        }
        grade.desenhar(); // 2) a grade se adapta (fundo e cor das linhas dependem de haver mapa)
        barra.atualizar();
    }

    /** Botão "Calibrar grade" da barra: liga se estava desligada, e vice-versa. */
    function alternarCalibragem(): void {
        ligarCalibragem(!calibragem.ativa);
    }

    // A ferramenta escolhida no painel de desenho.
    let ferramentaAtual: NomeFerramenta = "mover";
    const DE_DESENHO: NomeFerramenta[] = ["lapis", "borracha", "elipse", "retangulo", "triangulo"];

    /** Escolhe a ferramenta: só uma fica ligada. "Mover" é o normal (tokens e visão). */
    function escolherFerramenta(nome: NomeFerramenta): void {
        if (calibragem.ativa) ligarCalibragem(false); // a calibragem também é uma ferramenta
        ferramentaAtual = nome;
        menu.fechar();
        balao.esconder();
        desenho.definirFerramenta(DE_DESENHO.includes(nome) ? (nome as FerramentaDesenho) : null);
        regua.definirAtiva(nome === "regua");
        tokens.definirInterativo(nome === "mover"); // desenhando ou medindo, o arrasto não deve pegar tokens
        app.stage.cursor = nome === "mover" ? "default" : "crosshair";
        painelDesenho.marcar(nome);
    }

    /** Liga/desliga a calibragem: o painel, o botão, o cursor e o mouse dos tokens acompanham. */
    function ligarCalibragem(ligada: boolean): void {
        if (ligada && ferramentaAtual !== "mover") escolherFerramenta("mover"); // uma ferramenta de cada vez
        menu.fechar();
        balao.esconder();
        calibragem.definirAtiva(ligada);
        grade.definirVisivel(!ligada); // calibrando, só a grade do MAPA aparece: fica fácil de comparar
        tokens.definirInterativo(!ligada); // medindo, o arrasto não deve pegar tokens
        barra.marcarCalibragem(ligada);
        if (ligada) painelCalibragem.abrir();
        else painelCalibragem.fechar();
    }

    /** Botões de tamanho do token no menu: muda o ESTADO e atualiza o desenho. */
    function mudarTamanhoDoToken(id: number, delta: number): void {
        const token = mudarTamanhoToken(id, delta); // 1) estado (null = nada mudou)
        if (!token) return;
        tokens.redesenhar(token); // 2) desenho
        menu.atualizar(); // os botões acompanham o novo tamanho
    }

    /** Clique numa condição do menu: liga/desliga no ESTADO e redesenha os ícones do token. */
    function alternarCondicaoDoToken(id: number, condicaoId: string): void {
        const token = alternarCondicao(id, condicaoId); // 1) estado (null = token/condição inexistente)
        if (!token) return;
        tokens.redesenhar(token); // 2) desenho: o anel de ícones é refeito
        menu.atualizar(); // o painel marca/desmarca a condição
    }

    // Ao abrir, ajusta o zoom para o tabuleiro inteiro caber na janela (em telas
    // grandes continua em 100%). Sem isso, em janelas menores os tokens das pontas
    // ficavam fora da tela e pareciam ter sumido.
    camera.ajustar();

    // O mapa carrega por último: o tabuleiro já aparece e a imagem entra quando chegar.
    await mapa.carregar();

    // SÓ no modo de desenvolvimento (npm run dev; some na versão final): deixa os testes automáticos
    // (tests/e2e) saberem quando a página está pronta e lerem o estado e a câmera direto, em vez de
    // esperar tempos fixos e medir pixels. Não é usado pelo site.
    if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__tabuleirinho = { pronto: true, estado, camera };
    }
}

iniciar();
