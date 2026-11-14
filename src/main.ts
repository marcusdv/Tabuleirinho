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
//   ui/painelDados               barra de dados grudada à esquerda do chat (HTML)
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
    adicionarRolagem,
    alternarCondicao,
    colocarToken,
    definirMensagens,
    guardarToken,
    receberMensagem,
    buscarToken,
    apagarTodosDesenhos,
    criarToken,
    definirImagemToken,
    definirTamanhoTabuleiro,
    editarToken,
    estado,
    redimensionarTabuleiro,
    type Ficha,
    type Token,
    adicionarRolagemDeFicha,
    criarFicha,
    editarFicha,
    excluirFicha,
    definirFichas,
    definirTokens,
    excluirToken,
    receberFicha,
    receberToken,
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
import { criarEditorImagem } from "./ui/editorImagem";
import { analisarAbas, rolarDaAnalise } from "./formulas";
import { criarAjudaFichas } from "./ui/ajudaFichas";
import { criarConfirmacao } from "./ui/confirmar";
import { criarEditorFicha } from "./ui/editorFicha";
import { criarEditorToken } from "./ui/editorToken";
import { rolarDados } from "./dados";
import type { EventoDoServidor } from "./protocolo";
import { criarRede, type Rede } from "./rede";
import { criarChat } from "./ui/chat";
import { criarBarra } from "./ui/barra";
import { criarDicaCondicao } from "./ui/dicaCondicao";
import { criarMenuToken } from "./ui/menuToken";
import { criarPainelCalibragem } from "./ui/painelCalibragem";
import { tornarArrastavel } from "./ui/arrastar";
import { criarPainelDados } from "./ui/painelDados";
import { criarPainelDesenho, type NomeFerramenta } from "./ui/painelDesenho";
import { criarStatusRede } from "./ui/statusRede";

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

    // O modo ONLINE (protótipo, só com ?online no endereço): enquanto `rede.ativa`, as ações abaixo vão para o SERVIDOR, que
    // valida, aplica e avisa todos; sem isso (ou sem conexão) tudo vale só localmente, como sempre foi.
    let rede: Rede | null = null;

    // O chat (embaixo, fixo). Local: enviar guarda a mensagem no estado e refaz a faixa. Online: o servidor cria e avisa.
    const chat = criarChat({
        aoEnviar: (texto) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "enviar_mensagem", texto });
                return;
            }
            adicionarMensagem(AUTOR_PROVISORIO, texto); // 1) estado
            chat.atualizar(); // 2) interface
        },
    });

    // A barra de dados (grudada à esquerda do chat): rola e coloca o resultado no chat.
    // Local: o sorteio é aqui, no navegador. Online: o SERVIDOR sorteia (senão dava para trapacear). Ver dados.ts.
    criarPainelDados({
        aoRolar: (lados, quantidade, modificador) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "rolar_dados", lados, quantidade, modificador });
                return;
            }
            adicionarRolagem(AUTOR_PROVISORIO, rolarDados(lados, quantidade, modificador)); // 1) estado
            chat.atualizar(); // 2) interface
        },
    });

    // As cinco caixas da tela podem ser ARRASTADAS pela alça de cada uma (ver ui/arrastar.ts): a posição fica guardada no navegador.
    const porId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
    // As três caixas de ferramentas (Ferramentas, Desenho e Dados) NÃO PODEM SE BATER: cada uma é parede para as outras. O chat e a bolsa são
    // independentes de tudo isso (o chat não tem mais nada grudado nele).
    const caixasDeFerramentas = [porId("barra"), porId("ferramentas-desenho"), porId("dados")];
    const bloqueadores = (): HTMLElement[] => caixasDeFerramentas;
    for (const caixa of caixasDeFerramentas) tornarArrastavel({ elemento: caixa, alca: caixa.querySelector<HTMLElement>(".cabecalho")!, bloqueadores });
    tornarArrastavel({ elemento: porId("chat"), alca: porId("chat-alca") });
    tornarArrastavel({
        elemento: porId("bolsa"),
        camada: porId("canto-inferior-direito"), // (a bolsa fica dentro desta coluna: é ela que sobe para a frente)
        alca: porId("bolsa").querySelector<HTMLElement>(".bolsa-topo")!,
        ignorar: (alvo) => alvo.closest("button, input, #bolsa-abas") !== null,
        desligado: () => bolsa.expandida, // em tela cheia a bolsa cobre a tela: não anda
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

    // A caixa de confirmar ("Excluir token?"), no lugar da caixa do navegador.
    const confirmacao = criarConfirmacao();

    // A janela de instruções das fichas (como escrever variáveis e rolagens): abre pelos botões "Instruções".
    criarAjudaFichas();

    // O editor de FICHA (nome e texto): abre ao clicar num documento da aba Fichas da bolsa.
    const editorFicha = criarEditorFicha({
        aoMudarAberta: (id) => bolsa.marcarFichaAberta(id), // (a bolsa é criada logo abaixo; isto só roda quando a janela abre ou fecha)
        aoSalvar: (id, versao, mudancas) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "editar_ficha", id, versao, nome: mudancas.nome, abas: mudancas.abas }); // o servidor confere a VERSÃO e grava o arquivo
                return "enviada";
            }
            const resultado = editarFicha(id, versao, mudancas); // modo local: só na memória desta aba
            if (resultado.ok) bolsa.atualizarFichas();
            return resultado;
        },
        aoRolar: (id, versao, aba, indice) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "rolar_ficha", id, versao, aba, indice }); // o SERVIDOR sorteia e o cartão chega pelo chat (evento "mensagem")
                return null;
            }
            const ficha = estado.fichas.find((f) => f.id === id);
            if (!ficha) return "Essa ficha não existe.";
            const analise = analisarAbas(ficha.abas.map((a) => a.texto))[aba]; // (as variáveis valem para a ficha toda; as rolagens são da aba)
            if (!analise) return "Essa página não existe.";
            const resultado = rolarDaAnalise(analise, indice, ficha.nome, Math.random); // modo local: sorteia aqui mesmo
            if (!resultado.ok) return resultado.erro;
            adicionarRolagemDeFicha(AUTOR_PROVISORIO, resultado.valor);
            chat.atualizar();
            return null;
        },
        confirmarExcluirAba: (nome) =>
            confirmacao.perguntar({
                titulo: "Excluir página?",
                mensagem: `A página "${nome}" e tudo o que está escrito nela serão removidos desta ficha (só valem depois de salvar).`,
                confirmar: "Excluir página",
            }),
        confirmarDescarte: () =>
            confirmacao.perguntar({
                titulo: "Fechar sem salvar?",
                mensagem: "Esta ficha tem alterações que ainda não foram salvas.\nSe você fechar agora, elas serão perdidas.",
                confirmar: "Fechar sem salvar",
            }),
    });

    // O editor de recorte da imagem do token (arrastar, zoom, confirmar).
    const editorImagem = criarEditorImagem();

    // A janela de edição do token (nome, tamanho e cores): abre pelo menu do token (mapa) e pelo da ficha (bolsa).
    const editorToken = criarEditorToken({
        aoSalvar: (id, mudancas) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "editar_token", id, mudancas }); // o servidor confere, grava o arquivo e avisa todos ("token_editado")
                return;
            }
            const token = editarToken(id, mudancas); // 1) estado
            if (!token) return;
            tokens.redesenhar(token); // 2) desenho no mapa (o token pode estar escondido, guardado)
            menu.atualizar(); // 3) os botões do token acompanham o novo tamanho
            bolsa.atualizar(); // 4) a ficha da bolsa
        },
        editarImagem: (arquivo, corFundo) => editorImagem.editar(arquivo, corFundo),
    });

    /**
     * Pede a confirmação (não dá para desfazer), numa caixa do próprio jogo, e exclui o token. Online, o pedido vai ao servidor, que
     * apaga o ARQUIVO do token e avisa todos; no modo local o token some na hora. Devolve false se a pessoa desistiu.
     */
    async function excluirComConfirmacao(token: Token): Promise<boolean> {
        const arquivo = rede?.ativa ? "O arquivo dele no servidor também será apagado.\n" : "";
        const confirmou = await confirmacao.perguntar({
            titulo: "Excluir token",
            mensagem: `Excluir o token "${token.nome}"?\n${arquivo}Isso não pode ser desfeito.`,
            confirmar: "Excluir",
        });
        if (!confirmou) return false;
        if (rede?.ativa) rede.enviar({ tipo: "excluir_token", id: token.id });
        else removerTokenDoJogo(token.id); // (se outra pessoa já o excluiu enquanto a caixa estava aberta, não há o que fazer)
        return true;
    }

    /** "Guardar na bolsa" da engrenagem: o token sai do mapa. Online o servidor confirma e avisa todos ("token_guardado"). */
    function guardarNaBolsa(id: number): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "guardar_token", id });
            return;
        }
        const token = buscarToken(id);
        if (!token) return;
        guardarToken(id); // 1) estado
        tokens.aplicarPosicao(token); // 2) desenho: o token some do mapa
        bolsa.atualizar(); // 3) a ficha aparece na bolsa
    }

    /**
     * Pede a confirmação (não dá para desfazer) e exclui a ficha. Online, o pedido vai ao servidor, que apaga o ARQUIVO e avisa todos
     * (evento "ficha_excluida"); no modo local a ficha some na hora.
     */
    async function excluirFichaComConfirmacao(ficha: Ficha): Promise<void> {
        const arquivo = rede?.ativa ? "O arquivo dela no servidor também será apagado.\n" : "";
        const confirmou = await confirmacao.perguntar({
            titulo: "Excluir ficha",
            mensagem: `Excluir a ficha "${ficha.nome}"?\n${arquivo}Isso não pode ser desfeito.`,
            confirmar: "Excluir",
        });
        if (!confirmou) return;
        if (rede?.ativa) rede.enviar({ tipo: "excluir_ficha", id: ficha.id });
        else removerFichaDoJogo(ficha.id);
    }

    /** Tira a ficha do estado e da grade (e avisa o editor, se era a que estava aberta). Vale no modo local e quando o servidor avisa. */
    function removerFichaDoJogo(id: number): void {
        if (!excluirFicha(id)) return;
        bolsa.atualizarFichas();
        editorFicha.fichaExcluida(id);
    }

    /** Tira o token do estado e do desenho (e fecha o que estiver aberto sobre ele). Vale no modo local e quando o servidor avisa. */
    function removerTokenDoJogo(id: number): void {
        if (!excluirToken(id)) return; // 1) estado (já não existia: nada a fazer)
        tokens.remover(id); // 2) desenho no mapa (cancela o arrasto, se alguém o segurava)
        menu.fechar(); // 3) menus e balão que estavam abertos sobre ele
        balao.esconder();
        bolsa.atualizar(); // 4) a ficha da bolsa
    }

    const menu = criarMenuToken({
        ancora: (id) => tokens.ancoraNaTela(id), // "tokens" já existe quando isto for chamado
        aoEditar: (id) => {
            const token = buscarToken(id);
            if (token) editorToken.editar(token);
        },
        aoGuardar: (id) => guardarNaBolsa(id),
        aoExcluir: (id) => {
            const token = buscarToken(id);
            return token ? excluirComConfirmacao(token) : Promise.resolve(false);
        },
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
        aoCriarToken: ({ nome, cor, corBorda, tamanho, imagem }) => {
            if (rede?.ativa) {
                // Online quem cria é o SERVIDOR (cria o arquivo na hora); o token chega pelo evento "token_criado".
                rede.enviar({ tipo: "criar_token", nome, cor, corBorda, tamanho, imagem });
                return "enviado";
            }
            const token = criarToken(cor, tamanho, nome, imagem, corBorda); // 1) estado (o token nasce guardado na bolsa)
            if (token) tokens.adicionar(token); // 2) desenho (escondido, até ser colocado no mapa)
            return token; // a bolsa refaz a própria lista
        },
        aoAbrir: () => {
            menu.fechar(); // menus e balões ficariam soltos por baixo da bolsa expandida
            balao.esconder();
        },
        aoEditar: (token) => editorToken.editar(token),
        editarImagem: (arquivo, corFundo) => editorImagem.editar(arquivo, corFundo),
        // Ficha nova (VAZIA). Online, quem a cria é o SERVIDOR, que cria o arquivo na máquina do mestre NA HORA, e ela chega
        // pelo evento "ficha_criada"; no modo local ela só existe na memória desta aba.
        aoCriarFicha: () => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "criar_ficha" });
                return "enviada";
            }
            return criarFicha();
        },
        aoExcluir: (token) => void excluirComConfirmacao(token),
        aoAbrirFicha: (ficha) => {
            // A bolsa em TELA CHEIA cobre o chat e escurece o fundo: ao abrir uma ficha ela volta ao tamanho anterior (média ou pequena), para
            // a janela da ficha (flutuante) ficar sobre o tabuleiro e o chat continuar visível (dá para ver as rolagens).
            if (bolsa.expandida) bolsa.fechar();
            editorFicha.abrir(ficha);
        },
        aoExcluirFicha: (ficha) => void excluirFichaComConfirmacao(ficha),
        aoMudarImagem: (id, imagem) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "editar_token", id, mudancas: { imagem } });
                return;
            }
            const token = definirImagemToken(id, imagem); // 1) estado
            if (!token) return;
            tokens.redesenhar(token); // 2) desenho no mapa (o token pode estar escondido, guardado)
            bolsa.atualizar(); // 3) a ficha da bolsa
        },
    });

    const tokens = criarTokens(camera, grade, texturas, {
        sobreBolsa: (ponto) => bolsa.contem(ponto),
        aoMudarSobreBolsa: (sobre) => bolsa.marcarAlvo(sobre),
        aoMudarBolsa: () => bolsa.atualizar(),
        aoMostrarSobreBolsa: (token, centro, diametro, borda) => bolsa.mostrarFantasma(token, centro, diametro, borda),
        aoEsconderSobreBolsa: () => bolsa.esconderFantasma(),
        // Online: o token já mudou aqui (para o arrasto ficar fluido) e o servidor é avisado; ele confere e avisa todos.
        aoSoltarToken: (token) => {
            if (!rede?.ativa) return;
            rede.enviar(token.guardado ? { tipo: "guardar_token", id: token.id } : { tipo: "colocar_token", id: token.id, col: token.col, row: token.row });
        },
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
            ligarCalibragem(false); // ao SOLTAR já vale: a calibragem se conclui sozinha (a grade volta na hora; para refazer, ligue "Calibrar grade" de novo)
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

    // --- Modo online (protótipo): só liga com ?online no endereço, ex.: /?online&nome=Ana ---
    const parametros = new URLSearchParams(location.search);
    if (parametros.has("online")) {
        const status = criarStatusRede();
        /** Um evento do servidor: aplica no ESTADO (as mesmas funções de estado.ts) e atualiza o desenho. */
        const aplicarEventoDoServidor = (evento: EventoDoServidor): void => {
            switch (evento.tipo) {
                case "estado_inicial":
                    // Os tokens são do SERVIDOR (vêm dos arquivos de dados/tokens/): troca todos e refaz o desenho.
                    definirTokens(evento.tokens);
                    tokens.reconstruir();
                    menu.fechar();
                    balao.esconder();
                    definirMensagens(evento.mensagens);
                    definirFichas(evento.fichas); // as fichas gravadas no servidor
                    // (se uma ficha está aberta no editor, ele confere se ela mudou enquanto a conexão estava fora)
                    {
                        const aberta = estado.fichas.find((f) => f.id === editorFicha.idAberto);
                        if (aberta) editorFicha.fichaMudou(aberta);
                    }
                    chat.atualizar();
                    bolsa.atualizar();
                    bolsa.atualizarFichas();
                    status.mostrarEntrada(evento.voce.apelido);
                    return;
                case "jogadores":
                    status.mostrarJogadores(evento.lista);
                    return;
                case "token_colocado": {
                    const token = buscarToken(evento.id);
                    if (!token) return;
                    colocarToken(token.id, evento.col, evento.row);
                    tokens.aplicarPosicao(token);
                    bolsa.atualizar();
                    return;
                }
                case "token_guardado": {
                    const token = buscarToken(evento.id);
                    if (!token) return;
                    guardarToken(token.id);
                    tokens.aplicarPosicao(token);
                    bolsa.atualizar();
                    return;
                }
                case "token_criado": {
                    const token = receberToken(evento.token); // (já gravado no disco do servidor; nasce guardado na bolsa)
                    tokens.adicionar(token);
                    bolsa.tokenCriado(token);
                    return;
                }
                case "token_editado": {
                    const token = receberToken(evento.token);
                    tokens.adicionar(token); // (garante que tem desenho)
                    tokens.redesenhar(token);
                    menu.atualizar();
                    bolsa.atualizar();
                    return;
                }
                case "token_excluido":
                    removerTokenDoJogo(evento.id);
                    return;
                case "ficha_excluida":
                    removerFichaDoJogo(evento.id);
                    return;
                case "ficha_editada":
                    receberFicha(evento.ficha); // já está gravada no disco do servidor (com a versão nova)
                    bolsa.atualizarFichas();
                    editorFicha.fichaMudou(evento.ficha);
                    return;
                case "ficha_conflito":
                    receberFicha(evento.ficha); // a versão ATUAL: a grade também se corrige
                    bolsa.atualizarFichas();
                    editorFicha.conflito(evento.ficha);
                    return;
                case "ficha_criada":
                    receberFicha(evento.ficha); // já está gravada no disco do servidor
                    bolsa.fichaSalva();
                    return;
                case "mensagem":
                    receberMensagem(evento.mensagem); // já vem pronta do servidor (com id e hora dele)
                    chat.atualizar();
                    return;
                case "erro":
                    status.mostrarErro(evento.motivo);
                    bolsa.fichaRecusada(evento.motivo); // se esta pessoa esperava uma ficha ou um token, o formulário mostra o motivo
                    bolsa.tokenRecusado(evento.motivo);
                    editorFicha.recusada(evento.motivo);
                    return;
            }
        };
        rede = criarRede({
            apelido: parametros.get("nome") ?? "Jogador",
            aoReceber: aplicarEventoDoServidor,
            aoMudarConexao: (conectada) => {
                status.mostrarConexao(conectada);
                if (!conectada) {
                    bolsa.fichaRecusada("Sem conexão com o servidor. Tente de novo quando voltar.");
                    bolsa.tokenRecusado("Sem conexão com o servidor. Tente de novo quando voltar.");
                    editorFicha.recusada("Sem conexão com o servidor. Tente de novo quando voltar.");
                }
            },
        });
    }

    // O app terminou de montar a interface: o painel de Desenho e o de Dados (cujo conteúdo é criado por aqui) deixam de ficar escondidos.
    document.body.classList.add("app-pronta");

    // SÓ no modo de desenvolvimento (npm run dev; some na versão final): deixa os testes automáticos
    // (tests/e2e) saberem quando a página está pronta e lerem o estado e a câmera direto, em vez de
    // esperar tempos fixos e medir pixels. Não é usado pelo site.
    if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__tabuleirinho = {
            pronto: true,
            // Só para os testes: adiciona à mesa os tokens que o TESTE mandar (o app não tem nenhum token pronto: eles vêm dos
            // arquivos de dados/tokens/ do servidor, ou nascem pela bolsa). Os dados dos tokens de teste ficam em tests/e2e/ajuda.mjs.
            semear: (lista: Omit<Token, "condicoes">[]) => {
                for (const dados of lista) tokens.adicionar(receberToken({ ...dados, condicoes: [] }));
                bolsa.atualizar();
            },
            estado,
            camera,
            get rede() {
                return rede;
            },
        };
    }
}

iniciar();
