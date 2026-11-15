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
    criarPeca,
    carregarStatusDaMesa,
    aplicarAcao,
    carregarAcoesDaMesa,
    definirAcoesDaMesa,
    frasePraChatDaAcao,
    definirStatusDaMesa,
    definirTamanhoTabuleiro,
    editarToken,
    excluirTokenComPecas,
    montarPeca,
    pecasDoModelo,
    restaurarEstadoDaPeca,
    montarGrupo,
    receberGrupo,
    definirGrupos,
    excluirGrupo,
    montarEdicaoDoGrupo,
    marcarFicha,
    estado,
    type Ficha,
    type Grupo,
    type AcaoNova,
    type StatusNovo,
    type Token,
    adicionarRolagemDeFicha,
    tokenDaRolagem,
    criarFicha,
    editarFicha,
    excluirFicha,
    definirFichas,
    definirTokens,
    receberFicha,
    receberToken,
    statusPadrao,
    valoresAtuaisDaFicha,
    ajustarValorDaFicha,
    aplicarResultado,
    frasePraChatDeDano,
    totalDaRolagem,
    statusDaAcao,
    rotuloDoStatus,
    definirTodosOsValoresDasFichas,
    definirValoresDaFicha,
    motivoParaNaoColocar,
    sincronizarValoresDaFicha,
} from "./estado";
import { ATRASO_ROLAGEM_MS, AUTOR_PROVISORIO, COLUNAS_INICIAIS, LINHAS_INICIAIS, MS_RECARGA_ROLAGEM, RAJADA_ROLAGENS, SENSIBILIDADE_ZOOM_RODA, TEMPO_AVISO_MAPA_MS, TEMPO_DESFAZER_MS } from "./config";
import { preverGrade } from "./coordenadas";
import { gastar, novoBalde } from "./limite";
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
import { criarInfoTipoFicha } from "./ui/infoTipoFicha";
import { criarConfirmacao } from "./ui/confirmar";
import { criarEditorFicha } from "./ui/editorFicha";
import { criarEditorToken } from "./ui/editorToken";
import { rolarDados } from "./dados";
import type { EventoDoServidor } from "./protocolo";
import { criarRede, type Rede } from "./rede";
import { criarChat } from "./ui/chat";
import { criarLateral } from "./ui/lateral";
import { criarAviso } from "./ui/aviso";
import { criarModalAcao } from "./ui/modalAcao";
import { criarModalAcoes } from "./ui/modalAcoes";
import { criarBarra } from "./ui/barra";
import { criarDicaCondicao } from "./ui/dicaCondicao";
import { criarMenuToken } from "./ui/menuToken";
import { criarPainelCalibragem } from "./ui/painelCalibragem";
import { criarPilha } from "./ui/pilha";
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
    // Ctrl + RODA do mouse = zoom, em torno do cursor. (preventDefault: sem isso o navegador daria zoom na PÁGINA inteira; por isso o ouvinte não é "passivo".)
    // Só vale sobre o tabuleiro: os painéis HTML (chat, bolsa, barras) ficam por cima do canvas e recebem a roda deles.
    app.canvas.addEventListener(
        "wheel",
        (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            const retangulo = app.canvas.getBoundingClientRect();
            const ponto = { x: e.clientX - retangulo.left, y: e.clientY - retangulo.top };
            camera.aplicarZoom(camera.zoom * Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * SENSIBILIDADE_ZOOM_RODA), ponto);
        },
        { passive: false },
    );
    // "Ajustar o mapa à tela" encaixa o mapa entre a pilha de barras (esquerda) e a coluna do chat/bolsa (direita), não atrás deles.
    camera.areaCoberta = () => {
        const pilha = document.getElementById("pilha")?.getBoundingClientRect();
        const coluna = document.getElementById("chat")?.getBoundingClientRect();
        return {
            esquerda: pilha ? pilha.right + 8 : 0,
            direita: coluna ? Math.max(0, window.innerWidth - coluna.left) + 8 : 0,
        };
    };
    const mapa = criarMapa(camera); // antes da grade: a imagem fica por baixo de tudo
    const grade = criarGrade(camera);
    // As pinturas ficam por cima do mapa e da grade e por baixo dos tokens (criadas antes deles).
    const desenho = criarDesenho(camera, {
        aoMudar: () => painelDesenho.atualizar(),
        aoCriar: (cor) => painelDesenho.usarCor(cor), // a cor entra na pilha das recentes
    });

    const barra = criarBarra(camera, { aoMudarGrade: (ajustes) => grade.definirAjustes(ajustes), aoMudarTamanhoTabuleiro, aoAlternarCalibragem: alternarCalibragem, aoEscolherMapa: escolherMapa, aoVoltarAoPadrao: voltarAoPadrao });
    grade.definirAjustes(barra.ajustesDaGrade()); // os ajustes da grade que a pessoa deixou guardados (mostrar, espessura e cor)

    // O modo ONLINE (protótipo, só com ?online no endereço): enquanto `rede.ativa`, as ações abaixo vão para o SERVIDOR, que
    // valida, aplica e avisa todos; sem isso (ou sem conexão) tudo vale só localmente, como sempre foi.
    let rede: Rede | null = null;

    // A COLUNA da direita tem duas abas, "Chat" e "Bolsa" (ver ui/lateral.ts). O chat e a lateral dependem um do outro: cada um recebe uma função que só
    // roda depois de os dois existirem.
    const lateral = criarLateral({ aoMostrarChat: () => chat.mostrou() });
    // O chat (coluna da direita). Local: enviar guarda a mensagem no estado e refaz a lista. Online: o servidor cria e avisa.
    const chat = criarChat({
        visivel: () => lateral.chatVisivel(),
        aoChegarEscondida: (quantas) => lateral.avisarNovas(quantas),
        // Arrastar o TOTAL de uma rolagem do chat até um token = dar dano a ele (só dano, só o total).
        aoArrastarResultado: (ponto) => tokens.destacarAlvo(ponto ? tokenSobOPonto(ponto) : null),
        aoSoltarResultado: (idDaMensagem, ponto) => {
            tokens.destacarAlvo(null);
            const alvo = tokenSobOPonto(ponto);
            if (alvo) darDanoArrastado(alvo, idDaMensagem);
        },
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
    // PAUSA curta antes do resultado aparecer (pedido do dono). Não bloqueia novos cliques: cada rolagem espera a sua vez. No `npm run dev` os testes
    // podem zerar a pausa pelo gancho (`window.__tabuleirinho.atrasoRolagemMs = 0`).
    function comAtrasoDeRolagem(acao: () => void): void {
        const ganchoDeTeste = (window as unknown as { __tabuleirinho?: { atrasoRolagemMs?: number } }).__tabuleirinho;
        const ms = ganchoDeTeste?.atrasoRolagemMs ?? ATRASO_ROLAGEM_MS;
        if (ms > 0) window.setTimeout(acao, ms);
        else acao();
    }

    // LIMITE ANTI-SPAM de rolagens: o SERVIDOR faz valer (limite.ts); aqui o navegador usa a mesma conta só para AVISAR sem esperar a resposta.
    // (No modo local não há servidor, então é este que vale. Os testes o desligam junto com o atraso: `atrasoRolagemMs = 0`.)
    const baldeDeRolagens = novoBalde(RAJADA_ROLAGENS);
    const mensagemDeLimite = "Calma! Você está rolando rápido demais.";
    function podeRolarAgora(): boolean {
        const ganchoDeTeste = (window as unknown as { __tabuleirinho?: { atrasoRolagemMs?: number } }).__tabuleirinho;
        if (ganchoDeTeste?.atrasoRolagemMs === 0) return true; // (os testes rolam sem limite)
        return gastar(baldeDeRolagens, RAJADA_ROLAGENS, MS_RECARGA_ROLAGEM);
    }

    /** O botão Rolar pisca em vermelho por um instante e a dica explica (funciona no modo local, onde não há a pílula de status do modo online). */
    let temporizadorDoAviso: number | undefined;
    function avisarLimiteNoBotao(): void {
        const botao = document.getElementById("dados-rolar");
        if (!botao) return;
        botao.classList.add("limite");
        botao.title = mensagemDeLimite;
        window.clearTimeout(temporizadorDoAviso);
        temporizadorDoAviso = window.setTimeout(() => {
            botao.classList.remove("limite");
            botao.removeAttribute("title");
        }, 900);
    }

    criarPainelDados({
        aoRolar: (lados, quantidade, modificador) => {
            if (!podeRolarAgora()) return avisarLimiteNoBotao();
            comAtrasoDeRolagem(() => {
                if (rede?.ativa) {
                    rede.enviar({ tipo: "rolar_dados", lados, quantidade, modificador });
                    return;
                }
                adicionarRolagem(AUTOR_PROVISORIO, rolarDados(lados, quantidade, modificador)); // 1) estado
                chat.atualizar(); // 2) interface
            });
        },
    });

    // A PILHA de barras da esquerda ("Desenho" e "Ferramentas"): clicar abre a gaveta ao lado; arrastar troca a ordem (ver ui/pilha.ts). As caixas do chat,
    // da bolsa e dos dados moram na coluna da direita e não se mexem.
    criarPilha();

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

    // O AVISO curto do canto (com botão de ação opcional, ex.: "Desfazer"): a previsão do mapa, remover token do tabuleiro...
    const aviso = criarAviso();

    // A caixa de confirmar ("Excluir token?"), no lugar da caixa do navegador.
    const confirmacao = criarConfirmacao();

    // As AÇÕES dos tokens (Dano, Cura e as que o dono criar): o modal do cálculo e o que cria/exclui ações.
    const modalAcao = criarModalAcao();
    const modalAcoes = criarModalAcoes({ aoMudar: (lista) => mudarAcoesDaMesa(lista) });

    // A janela de instruções das fichas (como escrever variáveis e rolagens): abre pelos botões "Instruções".
    criarAjudaFichas();
    criarInfoTipoFicha(); // (a telinha que explica o tipo da ficha: abre ao clicar na etiqueta do alto da janela da ficha)

    // O editor de FICHA (nome e texto): abre ao clicar num documento da aba Fichas da bolsa.
    const editorFicha = criarEditorFicha({
        aoMudarAberta: (id) => bolsa.marcarFichaAberta(id), // (a bolsa é criada logo abaixo; isto só roda quando a janela abre ou fecha)
        aoSalvar: (id, versao, mudancas) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "editar_ficha", id, versao, nome: mudancas.nome, abas: mudancas.abas }); // o servidor confere a VERSÃO e grava o arquivo
                return "enviada";
            }
            const resultado = editarFicha(id, versao, mudancas); // modo local: só na memória desta aba
            if (resultado.ok) {
                bolsa.atualizarFichas();
                aplicarValoresDaFicha(id); // (o texto pode ter mudado o mínimo/máximo de uma variável que muda: as barras dos tokens dela acompanham)
            }
            return resultado;
        },
        aoAjustarValor: (id, nome, delta) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "ajustar_valor_ficha", ficha: id, nome, delta }); // o SERVIDOR soma, limita ao intervalo, grava e avisa todos ("valores_ficha")
                return;
            }
            if (ajustarValorDaFicha(id, nome, delta).ok) aplicarValoresDaFicha(id); // modo local: tudo aqui
        },
        aoRolar: (id, versao, aba, indice, token) => {
            if (!podeRolarAgora()) return mensagemDeLimite; // (o editor da ficha mostra o texto no aviso dele)
            if (rede?.ativa) {
                comAtrasoDeRolagem(() => rede?.enviar({ tipo: "rolar_ficha", id, versao, aba, indice, token })); // o SERVIDOR sorteia e o cartão chega pelo chat (evento "mensagem")
                return null;
            }
            const ficha = estado.fichas.find((f) => f.id === id);
            if (!ficha) return "Essa ficha não existe.";
            const analise = analisarAbas(ficha.abas.map((a) => a.texto), valoresAtuaisDaFicha(id))[aba]; // (as variáveis valem para a ficha toda; as rolagens são da aba; as variáveis que mudam valem o valor ATUAL)
            if (!analise) return "Essa página não existe.";
            const resultado = rolarDaAnalise(analise, indice, ficha.nome, Math.random); // modo local: sorteia aqui mesmo
            if (!resultado.ok) return resultado.erro;
            comAtrasoDeRolagem(() => {
                adicionarRolagemDeFicha(AUTOR_PROVISORIO, resultado.valor, tokenDaRolagem(id, token));
                chat.atualizar();
            });
            return null;
        },
        confirmarExcluirAba: (nome) =>
            confirmacao.perguntar({
                titulo: "Excluir página?",
                mensagem: `A página "${nome}" e tudo o que está escrito nela serão removidos desta ficha (só valem depois de salvar).`,
                confirmar: "Excluir página",
            }),
        confirmarDescarte: async (podeSalvar) => {
            const resposta = await confirmacao.escolher({
                titulo: "Fechar sem salvar?",
                mensagem: "Esta ficha tem alterações que ainda não foram salvas.\nSe você fechar sem salvar, elas serão perdidas.",
                confirmar: "Fechar sem salvar",
                ...(podeSalvar && { alternativa: "Salvar e fechar" }),
            });
            return resposta === "confirmar" ? "descartar" : resposta === "alternativa" ? "salvar" : "cancelar";
        },
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
            const token = editarToken(id, mudancas); // 1) estado (editar um token da bolsa também atualiza as PEÇAS dele no tabuleiro)
            if (!token) return;
            tokens.redesenhar(token); // 2) desenho no mapa (o token pode estar escondido, guardado)
            for (const peca of pecasDoModelo(token.id)) tokens.redesenhar(peca);
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

    /**
     * "Remover do tabuleiro" da engrenagem: o token sai do tabuleiro (o modelo CONTINUA na bolsa). Online o servidor confirma e avisa todos
     * ("token_guardado"). Um aviso com "Desfazer" fica na tela por alguns segundos (`avisarRemocao`).
     */
    function removerDoTabuleiro(id: number): void {
        const token = buscarToken(id);
        if (!token || token.guardado) return;
        if (token.copiaDe !== null) return removerPeca(token); // (uma PEÇA é temporária: remover do tabuleiro a APAGA)
        const { col, row } = token; // (onde ele estava, para o "Desfazer")
        if (rede?.ativa) {
            rede.enviar({ tipo: "guardar_token", id });
        } else {
            guardarToken(id); // 1) estado
            tokens.aplicarPosicao(token); // 2) desenho: o token some do mapa
            bolsa.atualizar(); // 3) a ficha aparece na bolsa
        }
        avisarRemocao(token.nome, () => desfazerRemocao(token.id, col, row));
    }

    /** O aviso "removido do tabuleiro" com o botão "Desfazer" (vale também quando o token é arrastado até a bolsa). */
    function avisarRemocao(nome: string, desfazer: () => void): void {
        aviso.mostrar(`"${nome}" foi removido do tabuleiro.`, {
            duracaoMs: TEMPO_DESFAZER_MS,
            acao: { rotulo: "Desfazer", aoClicar: desfazer },
        });
    }

    /** Muda as AÇÕES da mesa inteira (criar, excluir). Online o servidor guarda em `dados/mesa.json` e avisa todos ("acoes_definidas"); local, na hora. */
    function mudarAcoesDaMesa(lista: AcaoNova[]): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "definir_acoes", acoes: lista });
            return;
        }
        definirAcoesDaMesa(lista);
        modalAcoes.atualizar();
        menu.atualizar();
    }

    /** Clicou numa ação (Dano, Cura...) no menu do token: abre o modal do cálculo (o valor atual, o campo do valor e a conta). */
    function abrirAcaoDoToken(tokenId: number, acaoId: number): void {
        const token = buscarToken(tokenId);
        const acao = estado.acoesDaMesa.find((a) => a.id === acaoId);
        if (!token || !acao) return;
        const status = statusDaAcao(token, acao);
        const valor = status ? token.valores.find((v) => v.id === status.id) : undefined;
        if (!status || !valor) {
            aviso.mostrar(`"${token.nome}" não tem ${status ? `valor de ${rotuloDoStatus(status)}` : "o status desta ação"}: ele precisa de uma ficha com a variável do status.`, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        modalAcao.abrir({
            titulo: `${acao.nome} em ${token.nome}`,
            nomeStatus: rotuloDoStatus(status),
            atual: valor.atual,
            max: valor.max,
            efeito: acao.efeito,
            aoAplicar: (texto) => aplicarAcaoDoJogo(token.id, acao.id, texto),
        });
    }

    /** Qual token está sob este ponto da tela? Só vale com o ponteiro sobre o TABULEIRO (o chat, a bolsa e as barras ficam por cima do canvas e não contam). */
    function tokenSobOPonto(ponto: { x: number; y: number }): Token | null {
        if (document.elementFromPoint(ponto.x, ponto.y) !== app.canvas) return null;
        return tokens.tokenEm(ponto);
    }

    /**
     * O TOTAL de uma rolagem do chat foi solto num token: ele perde essa quantidade do status marcado com "Subtraído por números arrastados". Online o pedido vai ao servidor (que lê o total
     * da mensagem e avisa todos); no modo local, tudo aqui.
     */
    function darDanoArrastado(token: Token, idDaMensagem: number): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "arrastar_resultado", token: token.id, mensagem: idDaMensagem });
            return;
        }
        const total = totalDaRolagem(idDaMensagem);
        if (total === null) return;
        const resultado = aplicarResultado(token, total);
        if (!resultado.ok) {
            aviso.mostrar(resultado.erro, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        tokens.redesenhar(token); // a barra muda na hora
        if (resultado.fichaAlterada !== undefined) aplicarValoresDaFicha(resultado.fichaAlterada); // (ficha Token Único: as barras e o painel da ficha acompanham)
        adicionarMensagem(AUTOR_PROVISORIO, frasePraChatDeDano(token, resultado));
        chat.atualizar();
    }

    /** Aplica a ação com o valor escrito. Online o SERVIDOR sorteia os dados, muda o valor, grava e avisa todos (a frase também vai para o chat); no modo local, tudo aqui. */
    function aplicarAcaoDoJogo(tokenId: number, acaoId: number, texto: string): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "aplicar_acao", token: tokenId, acao: acaoId, valor: texto });
            return;
        }
        const token = buscarToken(tokenId);
        if (!token) return;
        const resultado = aplicarAcao(token, acaoId, texto, Math.random);
        if (!resultado.ok) {
            aviso.mostrar(resultado.erro, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        tokens.redesenhar(token); // a barra muda na hora
        adicionarMensagem(AUTOR_PROVISORIO, frasePraChatDaAcao(token, acaoId, resultado));
        chat.atualizar();
    }

    /**
     * Muda os STATUS (barras) da MESA INTEIRA (a regra vale para todos os tokens e peças). Modo local: muda o estado e redesenha todos na hora. ONLINE o servidor é o dono
     * da regra: o pedido vai para lá, que guarda em `dados/mesa.json`, refaz os valores das peças se preciso e avisa todos ("status_definidos").
     */
    function mudarStatusDaMesa(lista: StatusNovo[]): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "definir_status", status: lista });
            return;
        }
        for (const token of definirStatusDaMesa(lista)) tokens.redesenhar(token); // 1) estado (a lista vai para todos) e 2) desenho
    }

    /**
     * Os valores atuais das variáveis que mudam de uma ficha mudaram (ou o texto dela mudou o intervalo): refaz as barras dos tokens dela no tabuleiro (elas espelham o valor da
     * ficha, ao vivo) e o painel da ficha, se ela está aberta. O estado já foi atualizado por quem chama.
     */
    function aplicarValoresDaFicha(idFicha: number): void {
        for (const token of sincronizarValoresDaFicha(idFicha)) tokens.redesenhar(token);
        editorFicha.valoresMudaram(idFicha);
    }

    /** Arrastou um token da BOLSA para o tabuleiro: nasce uma PEÇA (cópia temporária) na casa escolhida. O token da bolsa continua lá, e dá para arrastá-lo de novo. */
    function colocarModeloNoTabuleiro(modelo: Token, col: number, row: number): void {
        // Ficha de JOGADOR (variáveis que mudam): só um token por tela. Confere antes de tudo (o servidor confere de novo) e explica.
        const motivo = motivoParaNaoColocar(modelo);
        if (motivo) {
            aviso.mostrar(motivo, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        if (rede?.ativa) {
            rede.enviar({ tipo: "colocar_modelo", modelo: modelo.id, col, row }); // o SERVIDOR cria a peça (lê a ficha, calcula os status) e avisa todos ("peca_criada")
            return;
        }
        const peca = criarPeca(modelo.id, col, row); // 1) estado (os status nascem agora, lendo a ficha)
        if (!peca) {
            aviso.mostrar(`Não foi possível colocar "${modelo.nome}": a posição não vale ou a mesa já tem o máximo de peças.`, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        tokens.adicionar(peca); // 2) desenho no mapa
        bolsa.atualizar(); // 3) o "no mapa: N" da fichinha
    }

    /**
     * "Remover do tabuleiro" numa PEÇA (pelo botão ou soltando-a na bolsa): a peça é APAGADA (ela é temporária: o token da bolsa continua lá). Os status que ela
     * tinha se perdem, mas o aviso oferece "Desfazer", que cria uma peça nova com o mesmo lugar, o PV atual e as condições de antes.
     */
    function removerPeca(peca: Token): void {
        const foto = { modelo: peca.copiaDe as number, col: peca.col, row: peca.row, valores: peca.valores.map((v) => ({ id: v.id, atual: v.atual })), condicoes: [...peca.condicoes] };
        if (rede?.ativa) rede.enviar({ tipo: "excluir_token", id: peca.id }); // o servidor apaga o arquivo e avisa todos
        else removerTokenDoJogo(peca.id);
        avisarRemocao(peca.nome, () => desfazerPeca(foto));
    }

    function desfazerPeca(foto: { modelo: number; col: number; row: number; valores: { id: number; atual: number }[]; condicoes: string[] }): void {
        const modelo = buscarToken(foto.modelo);
        if (!modelo || modelo.copiaDe !== null) return; // (o token da bolsa foi excluído nesse meio tempo)
        if (rede?.ativa) {
            rede.enviar({ tipo: "colocar_modelo", modelo: foto.modelo, col: foto.col, row: foto.row, valores: foto.valores, condicoes: foto.condicoes });
            return;
        }
        const peca = montarPeca(foto.modelo, foto.col, foto.row);
        if (!peca) return;
        restaurarEstadoDaPeca(peca, foto.valores, foto.condicoes); // o PV atual e as condições de antes
        tokens.adicionar(receberToken(peca));
        bolsa.atualizar();
    }

    /** "Desfazer": põe o token de volta onde estava. Só vale se ele ainda existe e continua na bolsa (alguém pode tê-lo excluído ou recolocado). */
    function desfazerRemocao(id: number, col: number, row: number): void {
        const token = buscarToken(id);
        if (!token || !token.guardado) return;
        if (rede?.ativa) {
            rede.enviar({ tipo: "colocar_token", id, col, row }); // o servidor confere e avisa todos
            return;
        }
        colocarToken(id, col, row); // 1) estado (tira da bolsa)
        tokens.aplicarPosicao(token); // 2) desenho: o token volta ao mapa
        bolsa.atualizar(); // 3) a ficha some da bolsa
    }

    /**
     * Pede a confirmação (não dá para desfazer) e exclui a ficha. Online, o pedido vai ao servidor, que apaga o ARQUIVO e avisa todos
     * (evento "ficha_excluida"); no modo local a ficha some na hora.
     */
    /** Uma ficha SEM CONTEÚDO (nenhuma página tem texto) não tem o que perder: é excluída sem a caixa de confirmação (pedido do dono). */
    const fichaVazia = (ficha: Ficha): boolean => ficha.abas.every((aba) => aba.texto.trim() === "");

    async function excluirFichaComConfirmacao(ficha: Ficha): Promise<void> {
        if (fichaVazia(ficha)) {
            if (rede?.ativa) rede.enviar({ tipo: "excluir_ficha", id: ficha.id });
            else removerFichaDoJogo(ficha.id);
            return;
        }
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

    /**
     * Exclusão EM GRUPO (vários itens selecionados na bolsa): UMA confirmação com o número de itens. Online, cada exclusão é um pedido ao servidor
     * (que limita as mensagens por segundo): os pedidos saem em fila, um a cada 50 ms (20 por segundo), para nenhum ser ignorado.
     */
    async function excluirVariosComConfirmacao(tipo: "tokens" | "fichas", nomes: string[], excluirUm: (i: number) => void, semConfirmar = false): Promise<void> {
        const arquivos = rede?.ativa ? "Os arquivos deles no servidor também serão apagados.\n" : "";
        const confirmou =
            semConfirmar ||
            (await confirmacao.perguntar({
                titulo: `Excluir ${nomes.length} ${tipo}`,
                mensagem: `Excluir ${nomes.length} ${tipo}?\n${nomes.slice(0, 5).map((n) => `• ${n}`).join("\n")}${nomes.length > 5 ? `\n… e mais ${nomes.length - 5}` : ""}\n${arquivos}Isso não pode ser desfeito.`,
                confirmar: "Excluir",
            }));
        if (!confirmou) return;
        nomes.forEach((_, i) => {
            if (rede?.ativa) setTimeout(() => excluirUm(i), i * 50);
            else excluirUm(i);
        });
    }

    /** Excluir um GRUPO: os tokens e as fichas dele NÃO são apagados, só perdem a marca. */
    async function excluirGrupoComConfirmacao(grupo: Grupo): Promise<void> {
        const confirmou = await confirmacao.perguntar({
            titulo: "Excluir grupo",
            mensagem: `Excluir o grupo "${grupo.nome}"?\nOs tokens e as fichas dele continuam existindo: só perdem esta marca.`,
            confirmar: "Excluir",
        });
        if (!confirmou) return;
        if (rede?.ativa) {
            rede.enviar({ tipo: "excluir_grupo", id: grupo.id });
        } else {
            const mudados = excluirGrupo(grupo.id);
            if (mudados?.status) for (const token of estado.tokens) tokens.redesenhar(token); // (um status valia para esse grupo: as barras mudam)
            bolsa.atualizarGrupos();
            bolsa.statusMudaram();
        }
    }

    /** Tira a ficha do estado e da grade (e avisa o editor, se era a que estava aberta). Vale no modo local e quando o servidor avisa. */
    function removerFichaDoJogo(id: number): void {
        if (!excluirFicha(id)) return; // (os tokens que usavam esta ficha ficam sem ficha)
        bolsa.atualizar(); // a fichinha de um token mostra a ficha dele
        bolsa.atualizarFichas();
        editorFicha.fichaExcluida(id);
    }

    /**
     * DUPLO CLIQUE num token (no tabuleiro ou na bolsa): abre a FICHA atribuída a ele. Sem ficha, um aviso explica e oferece o "Editar token", onde se atribui uma.
     */
    function abrirFichaDoToken(token: Token): void {
        menu.fechar(); // (o menu e o balão do token ficariam soltos por baixo da janela da ficha)
        balao.esconder();
        const ficha = token.ficha === null ? undefined : estado.fichas.find((f) => f.id === token.ficha);
        if (!ficha) {
            aviso.mostrar(`"${token.nome}" não tem ficha. Atribua uma em "Editar token".`, {
                acao: { rotulo: "Editar token", aoClicar: () => editorToken.editar(token) },
                duracaoMs: TEMPO_AVISO_MAPA_MS,
            });
            return;
        }
        editorFicha.abrir(ficha, token); // (a bolsa em tela cheia, se estiver aberta, NÃO fecha: a janela da ficha fica por cima dela) // (a janela lembra POR QUAL token foi aberta: as rolagens saem com o ícone dele)
    }

    /** Tira o token do estado e do desenho (e fecha o que estiver aberto sobre ele). Vale no modo local e quando o servidor avisa. */
    function removerTokenDoJogo(id: number): void {
        const removidos = excluirTokenComPecas(id); // 1) estado (excluir um token da bolsa leva as peças dele junto; vazio = já não existia: nada a fazer)
        if (removidos.length === 0) return;
        for (const removido of removidos) tokens.remover(removido); // 2) desenho no mapa (cancela o arrasto, se alguém o segurava)
        menu.fechar(); // 3) menus e balão que estavam abertos sobre ele
        balao.esconder();
        bolsa.atualizar(); // 4) a ficha da bolsa
    }

    const menu = criarMenuToken({
        ancora: (id) => tokens.ancoraNaTela(id), // "tokens" já existe quando isto for chamado
        aoEditar: (id) => {
            const token = buscarToken(id);
            // Uma PEÇA é cópia de um token da bolsa: "Editar token" edita o TOKEN DA BOLSA (e todas as peças dele mudam juntas).
            const alvo = token && token.copiaDe !== null ? buscarToken(token.copiaDe) : token;
            if (alvo) editorToken.editar(alvo);
        },
        aoGuardar: (id) => removerDoTabuleiro(id),
        aoAcao: (id, acaoId) => abrirAcaoDoToken(id, acaoId),
        aoNovaAcao: () => modalAcoes.abrir(),
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
        aoCriarToken: ({ nome, cor, corBorda, tamanho, imagem, ficha }) => {
            if (rede?.ativa) {
                // Online quem cria é o SERVIDOR (cria o arquivo na hora); o token chega pelo evento "token_criado".
                rede.enviar({ tipo: "criar_token", nome, cor, corBorda, tamanho, imagem, ...(ficha !== undefined && { ficha }) });
                return "enviado";
            }
            const token = criarToken(cor, tamanho, nome, imagem, corBorda, ficha ?? null); // 1) estado (o token nasce guardado na bolsa, com os status da mesa)
            if (token) tokens.adicionar(token); // 2) desenho (escondido, até ser colocado no mapa)
            return token; // a bolsa refaz a própria lista
        },
        aoAbrir: () => {
            menu.fechar(); // menus e balões ficariam soltos por baixo da bolsa expandida
            balao.esconder();
        },
        aoEditar: (token) => editorToken.editar(token),
        aoAbrirFichaDoToken: (token) => abrirFichaDoToken(token),
        // Os status (barras) editados na bolsa em tela cheia são UMA regra para a MESA INTEIRA e valem AO VIVO: todos os tokens e peças mudam na hora.
        aoMudarStatus: (status) => mudarStatusDaMesa(status),
        aoAdicionarFicha: (token) => editorToken.editar(token, { focarFicha: true }),
        aoAvisar: (texto) => aviso.mostrar(texto, { duracaoMs: TEMPO_AVISO_MAPA_MS }),
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
        // Estrela e grupos: online cada alteração é um pedido (em fila de 50 ms, por causa do limite de mensagens por segundo); no modo local vale na hora.
        aoAlterarItens: (tipo, alteracoes) => {
            alteracoes.forEach((alteracao, i) => {
                const { id, ...mudancas } = alteracao;
                if (rede?.ativa) {
                    setTimeout(() => rede?.enviar(tipo === "tokens" ? { tipo: "editar_token", id, mudancas } : { tipo: "marcar_ficha", id, ...mudancas }), i * 50);
                } else if (tipo === "tokens") {
                    editarToken(id, mudancas);
                } else {
                    marcarFicha(id, mudancas);
                }
            });
        },
        aoCriarGrupo: (nome, cor) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "criar_grupo", nome, cor });
                return "enviado";
            }
            const grupo = montarGrupo(nome, cor);
            if (grupo) receberGrupo(grupo);
            return grupo;
        },
        aoEditarGrupo: (id, mudancas) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "editar_grupo", id, ...mudancas });
                return;
            }
            const grupo = montarEdicaoDoGrupo(id, mudancas);
            if (grupo) receberGrupo(grupo);
        },
        aoExcluirGrupo: (grupo) => void excluirGrupoComConfirmacao(grupo),
        aoExcluirTokens: (lista) =>
            void excluirVariosComConfirmacao("tokens", lista.map((t) => t.nome), (i) => {
                if (rede?.ativa) rede.enviar({ tipo: "excluir_token", id: lista[i].id });
                else removerTokenDoJogo(lista[i].id);
            }),
        aoExcluirFichas: (lista) =>
            void excluirVariosComConfirmacao("fichas", lista.map((f) => f.nome), (i) => {
                if (rede?.ativa) rede.enviar({ tipo: "excluir_ficha", id: lista[i].id });
                else removerFichaDoJogo(lista[i].id);
            }, lista.every(fichaVazia)), // (todas vazias: nada a perder, sem confirmação)
        aoAbrirFicha: (ficha) => {
            // A bolsa em TELA CHEIA NÃO fecha ao abrir uma ficha (pedido do dono, 14/11/2026): a janela da ficha (flutuante, z-index 50) fica por cima dela.
            // O Esc dentro da ficha fecha só a ficha (`stopPropagation` em `ui/editorFicha.ts`); com o foco fora dela, o Esc é da bolsa.
            editorFicha.abrir(ficha);
        },
        aoExcluirFicha: (ficha) => void excluirFichaComConfirmacao(ficha),
    });

    const tokens = criarTokens(camera, grade, texturas, {
        sobreBolsa: (ponto) => {
            // Arrastando um token até a COLUNA da direita com a aba "Chat" à vista: a coluna troca sozinha para a "Bolsa" (que estava escondida), e então
            // o token já pode ser solto nela para ser guardado. (Só roda durante o arrasto de um token: é só aí que o tabuleiro chama esta função.)
            if (lateral.aba === "chat") {
                const coluna = (document.getElementById("chat") as HTMLElement).getBoundingClientRect();
                if (ponto.x >= coluna.left && ponto.x <= coluna.right && ponto.y >= coluna.top && ponto.y <= coluna.bottom) lateral.escolher("bolsa");
            }
            return bolsa.contem(ponto);
        },
        aoMudarSobreBolsa: (sobre) => bolsa.marcarAlvo(sobre),
        aoMudarBolsa: () => bolsa.atualizar(),
        aoRemoverArrastando: (token, col, row) => avisarRemocao(token.nome, () => desfazerRemocao(token.id, col, row)), // (soltar o token na bolsa também permite "Desfazer")
        aoSoltarModelo: (token, col, row) => colocarModeloNoTabuleiro(token, col, row),
        aoRemoverPeca: (token) => removerPeca(token),
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
        aoDuploClique: (token) => abrirFichaDoToken(token),
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
            mudarTamanho(colunas, linhas); // limita a MIN/MAX_CASAS
            ligarCalibragem(false); // ao SOLTAR já vale: a calibragem se conclui sozinha (a grade volta na hora; para refazer, ligue "Alinhar mapa" de novo)
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
        mudarTamanho(estado.colunas + deltaColunas, estado.linhas + deltaLinhas); // (os limites MIN/MAX_CASAS são aplicados na conta)
    }

    /**
     * Muda o tamanho do tabuleiro (botões de colunas/linhas, "Voltar ao padrão", "Alinhar mapa", "Escolher mapa"). Modo local: muda o estado e o desenho na hora.
     * ONLINE o tamanho é do SERVIDOR (é com ele que as posições dos tokens são conferidas): o pedido vai para lá e a mudança chega pelo evento "tamanho_definido",
     * para todos ao mesmo tempo. `depois` roda quando o tamanho já foi aplicado (ex.: ajustar a visão ao tabuleiro novo).
     */
    let depoisDoTamanho: (() => void) | null = null;
    function mudarTamanho(colunas: number, linhas: number, depois?: () => void): void {
        if (rede?.ativa) {
            depoisDoTamanho = depois ?? null;
            rede.enviar({ tipo: "definir_tamanho", colunas, linhas });
            return;
        }
        aplicarTamanho(definirTamanhoTabuleiro(colunas, linhas)); // 1) estado e desenho
        depois?.();
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
        mudarTamanho(COLUNAS_INICIAIS, LINHAS_INICIAIS, () => {
            camera.aplicarZoom(1); // 2) zoom em 100%
            camera.centralizar();
        }); // 1) estado e desenho do tamanho
    }

    /**
     * Botão "Escolher mapa": troca a imagem de fundo e PREVÊ as colunas e as linhas pelo tamanho dela (`preverGrade`, em coordenadas.ts): o tabuleiro já
     * se ajusta, e um aviso diz o que foi previsto (exato, ou só uma estimativa para a pessoa refinar pelos botões ou por "Alinhar mapa").
     */
    async function escolherMapa(arquivo: File): Promise<void> {
        const problema = await mapa.carregarArquivo(arquivo); // 1) estado + imagem
        if (problema) {
            alert(problema); // o mapa anterior continua
            return;
        }
        const tamanho = mapa.tamanhoDaImagem();
        const previsao = tamanho ? preverGrade(tamanho.largura, tamanho.altura) : null;
        if (tamanho && previsao) {
            mudarTamanho(previsao.colunas, previsao.linhas, () => camera.ajustar()); // 2) estado e desenho do tamanho (tokens fora do tabuleiro são puxados para dentro); a visão acompanha o tabuleiro novo
            mostrarAvisoDoMapa(
                previsao.exata
                    ? `Mapa de ${tamanho.largura}×${tamanho.altura} px: ${previsao.colunas} colunas × ${previsao.linhas} linhas (casas de ${previsao.pxPorCasa} px).`
                    : `Estimativa pelo tamanho da imagem (${tamanho.largura}×${tamanho.altura} px): ${previsao.colunas} colunas × ${previsao.linhas} linhas. Ajuste pelos botões ou use "Alinhar mapa".`,
            );
        }
        grade.desenhar(); // 3) a grade se adapta (fundo e cor das linhas dependem de haver mapa)
        barra.atualizar();
    }

    // O aviso da previsão (o cartão do canto, ver ui/aviso.ts).
    const mostrarAvisoDoMapa = (texto: string): void => aviso.mostrar(texto, { duracaoMs: TEMPO_AVISO_MAPA_MS });

    /** Botão "Alinhar mapa" da barra: liga se estava desligada, e vice-versa. */
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
                case "valores_atualizados": {
                    const alvo = buscarToken(evento.id);
                    if (alvo) {
                        alvo.valores = evento.valores.map((v) => ({ ...v })); // o valor novo (uma ação foi aplicada)
                        tokens.redesenhar(alvo);
                    }
                    return;
                }
                case "valores_ficha":
                    definirValoresDaFicha(evento.id, evento.valores); // os números do SERVIDOR (já limitados ao intervalo) valem
                    aplicarValoresDaFicha(evento.id);
                    return;
                case "acoes_definidas":
                    carregarAcoesDaMesa(evento.acoes);
                    modalAcoes.atualizar();
                    menu.atualizar();
                    return;
                case "status_definidos": {
                    definirStatusDaMesa(evento.status); // a regra nova copiada para todos os tokens (os valores das peças vêm do servidor, logo abaixo)
                    for (const p of evento.pecas) {
                        const peca = buscarToken(p.id);
                        if (peca) peca.valores = p.valores.map((v) => ({ ...v })); // os números do SERVIDOR valem
                    }
                    for (const token of estado.tokens) tokens.redesenhar(token);
                    bolsa.statusMudaram(); // o editor da bolsa mostra a lista nova (se ninguém está digitando nele)
                    return;
                }
                case "estado_inicial": {
                    // O tamanho do tabuleiro também é do SERVIDOR (dados/mesa.json): aplica antes dos tokens (a posição deles é conferida com ele).
                    const tamanhoMudou = evento.colunas !== estado.colunas || evento.linhas !== estado.linhas;
                    definirTamanhoTabuleiro(evento.colunas, evento.linhas);
                    // Os tokens são do SERVIDOR (vêm dos arquivos de dados/tokens/ e dados/pecas/): troca todos e refaz o desenho.
                    definirTokens(evento.tokens);
                    tokens.reconstruir();
                    if (tamanhoMudou) {
                        aplicarTamanho([]); // (a grade, a imagem do mapa e a câmera acompanham o tamanho do servidor)
                        camera.ajustar();
                    }
                    menu.fechar();
                    balao.esconder();
                    definirMensagens(evento.mensagens);
                    definirGrupos(evento.grupos); // os grupos (de tokens e fichas) gravados no servidor
                    carregarAcoesDaMesa(evento.acoes); // as ações (Dano, Cura...) também são da mesa
                    carregarStatusDaMesa(evento.status); // os status (barras) são da mesa (depois dos grupos: eles citam grupos); os tokens já trazem a cópia e os valores do servidor
                    definirFichas(evento.fichas); // as fichas gravadas no servidor
                    definirTodosOsValoresDasFichas(evento.valores); // os valores atuais das variáveis que mudam (depois das fichas: só valem para as que existem)
                    // (se uma ficha está aberta no editor, ele confere se ela mudou enquanto a conexão estava fora)
                    {
                        const aberta = estado.fichas.find((f) => f.id === editorFicha.idAberto);
                        if (aberta) editorFicha.fichaMudou(aberta);
                    }
                    chat.atualizar();
                    bolsa.statusMudaram(); // (o editor de status da bolsa mostra os da mesa)
                    bolsa.atualizarGrupos(); // (refaz os chips e as duas listas)
                    status.mostrarEntrada(evento.voce.apelido);
                    return;
                }
                case "tamanho_definido": {
                    aplicarTamanho(definirTamanhoTabuleiro(evento.colunas, evento.linhas)); // (o mesmo cálculo do servidor: os tokens que ficaram fora são puxados para dentro)
                    const depois = depoisDoTamanho; // (só quem pediu a mudança tem algo a fazer depois: ajustar a visão, por exemplo)
                    depoisDoTamanho = null;
                    depois?.();
                    return;
                }
                case "grupo_criado":
                    receberGrupo(evento.grupo);
                    bolsa.grupoCriado(evento.grupo);
                    return;
                case "grupo_editado":
                    receberGrupo(evento.grupo);
                    bolsa.atualizarGrupos();
                    return;
                case "grupo_excluido":
                    excluirGrupo(evento.id); // tira o grupo e a marca dele de todos os tokens, fichas e status (o servidor faz o mesmo nos arquivos e manda "status_definidos" se algum status o citava)
                    bolsa.atualizarGrupos();
                    return;
                case "jogadores":
                    status.mostrarJogadores(evento.lista);
                    return;
                case "token_colocado": {
                    const token = buscarToken(evento.id);
                    if (!token) return;
                    colocarToken(token.id, evento.col, evento.row);
                    if (evento.valores) token.valores = evento.valores.map((v) => ({ ...v })); // os números do SERVIDOR valem (não os que este navegador calcularia)
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
                case "peca_criada": {
                    const peca = receberToken(evento.token); // (uma PEÇA nova no tabuleiro, já gravada no servidor)
                    tokens.adicionar(peca);
                    bolsa.atualizar(); // (o "no mapa: N" da fichinha)
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
                    for (const token of sincronizarValoresDaFicha(evento.ficha.id)) tokens.redesenhar(token); // (o texto novo pode ter mudado o intervalo de uma variável que muda)
                    editorFicha.fichaMudou(evento.ficha);
                    return;
                case "ficha_conflito":
                    receberFicha(evento.ficha); // a versão ATUAL: a grade também se corrige
                    bolsa.atualizarFichas();
                    editorFicha.conflito(evento.ficha);
                    return;
                case "ficha_criada":
                    receberFicha(evento.ficha); // já está gravada no disco do servidor
                    bolsa.fichaSalva(estado.fichas.find((f) => f.id === evento.ficha.id)); // (quem a pediu já a vê abrir)
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

    // FICHAS DE EXEMPLO (pedido do dono): o Goblin Guerreiro (monstro) e o Thorin (jogador, com 2 páginas), cada um com o seu token na bolsa, SEMPRE entram no jogo para quem está
    // começando se familiarizar com o texto das fichas (`src/exemplos.ts`). No modo LOCAL isto vale toda vez que a página abre (o modo local não guarda nada); online é o SERVIDOR que
    // as cria, uma vez (`servidor/servidor.ts`). Ficam de fora dos testes automáticos (o navegador deles se diz automatizado: eles contam fichas e tokens e esperam a mesa vazia).
    if (!rede && !navigator.webdriver) {
        void import("./exemplos").then(({ ABAS_THORIN, IMAGEM_GOBLIN, NOME_GOBLIN, NOME_THORIN, TEXTO_GOBLIN }) => {
            const ficha = criarFicha();
            if (!ficha) return;
            ficha.nome = NOME_GOBLIN;
            ficha.abas[0].texto = TEXTO_GOBLIN;
            const token = criarToken(0x2f5d2a, 1, NOME_GOBLIN, IMAGEM_GOBLIN, 0xffffff, ficha.id); // (nasce na bolsa, com a ficha atribuída e o HP lendo PV)
            if (token) tokens.adicionar(token);
            // A ficha de JOGADOR (tem recursos) e o token dela: a barra de vida mostra o PV da ficha, ao vivo. Duas páginas: a ficha e os itens mágicos.
            const fichaJogador = criarFicha();
            if (fichaJogador) {
                fichaJogador.nome = NOME_THORIN;
                fichaJogador.abas = ABAS_THORIN.map((a) => ({ ...a }));
                const tokenJogador = criarToken(0x2a4a7a, 1, NOME_THORIN, null, 0xffd54f, fichaJogador.id);
                if (tokenJogador) tokens.adicionar(tokenJogador);
            }
            bolsa.atualizarFichas();
            bolsa.atualizar();
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
            atrasoRolagemMs: ATRASO_ROLAGEM_MS, // (os testes zeram: tests/e2e/ajuda.mjs `abrirPagina`)
            // Só para os testes: adiciona à mesa os tokens que o TESTE mandar (o app não tem nenhum token pronto: eles vêm dos
            // arquivos de dados/tokens/ do servidor, ou nascem pela bolsa). Os dados dos tokens de teste ficam em tests/e2e/ajuda.mjs.
            semear: (lista: Omit<Token, "condicoes" | "favorito" | "grupos" | "ficha" | "status" | "valores" | "copiaDe">[]) => {
                for (const dados of lista) tokens.adicionar(receberToken({ ...dados, condicoes: [], favorito: false, grupos: [], ficha: null, status: statusPadrao(), valores: [], copiaDe: null }));
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
