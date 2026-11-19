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
    adicionarDesenho,
    removerDesenhos,
    receberDesenho,
    definirDesenhos,
    podeApagarDesenho,
    criarToken,
    criarPeca,
    carregarStatusDaMesa,
    aplicarAcao,
    aplicarAcaoEmVarios,
    definirCondicao,
    carregarAcoesDaMesa,
    definirAcoesDaMesa,
    frasePraChatDaAcao,
    definirStatusDaMesa,
    definirTamanhoTabuleiro,
    editarToken,
    excluirTokenComPecas,
    montarPeca,
    pecasDoModelo,
    motivoFichaOcupada,
    podeUsarToken,
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
    adicionarCartaoDeFicha,
    adicionarRolagemDeFicha,
    tokenDaRolagem,
    rolarIniciativaDoToken,
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
    sincronizarValoresDaFicha, temIniciativaNaFicha, montarPasta, receberPasta, limparNomeDePasta, podeMoverPasta, excluirPasta, moverParaPasta, definirPastas } from "./estado";
import { ATRASO_ROLAGEM_MS, AUTOR_PROVISORIO, COLUNAS_INICIAIS, COR_INICIAL_DESENHO, LINHAS_INICIAIS, MS_RECARGA_PING, MS_RECARGA_ROLAGEM, RAJADA_PINGS, RAJADA_ROLAGENS, SENSIBILIDADE_ZOOM_RODA, TEMPO_AVISO_MAPA_MS, TEMPO_DESFAZER_MS } from "./config";
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
import { criarPings } from "./tabuleiro/pings";
import { criarReguasDosOutros } from "./tabuleiro/reguasDosOutros";
import { criarMenuMapa } from "./ui/menuMapa";
import { criarRodaPing } from "./ui/rodaPing";
import { criarAtalhos } from "./ui/atalhos";
import { criarTokens } from "./tabuleiro/tokens";
import { criarBalaoToken } from "./ui/balaoToken";
import { criarBolsa } from "./ui/bolsa";
import { criarBolsaMapas } from "./ui/bolsaMapas";
import { definirBiblioteca, definirGradeDaMesa, definirMapa, definirMapaAtual } from "./estado";
import type { Desenho, NovoDesenho } from "./estado";
import { CHAVE_VISOES, MAX_BYTES_MAPA, MAX_HISTORICO_DESENHO, MAX_TOKENS_ACAO_EM_GRUPO, MS_ENVIO_REGUA, TAMANHO_CASA } from "./config";
import { guardarPreferencia, lerPreferencia } from "./ui/preferencias";
import { criarEditorImagem } from "./ui/editorImagem";
import { analisarAbas, rolarCartaoDaAnalise, rolarConta, rolarDaAnalise } from "./formulas";
import { criarAjudaFichas } from "./ui/ajudaFichas";
import { aplicarAcaoDaIniciativa, definirIniciativa, iniciativa as estadoIniciativa, type AcaoDaIniciativa } from "./iniciativa";
import { criarIniciativa } from "./ui/iniciativa";
import { criarInfoTipoFicha } from "./ui/infoTipoFicha";
import { criarConfirmacao } from "./ui/confirmar";
import { criarEditorFicha } from "./ui/editorFicha";
import { criarEditorToken } from "./ui/editorToken";
import { rolarDados } from "./dados";
import type { EventoDoServidor, FormaDePing, Jogador, RegistroDeMapa } from "./protocolo";
import { criarRede, type Rede } from "./rede";
import { criarChat } from "./ui/chat";
import { criarLateral } from "./ui/lateral";
import { criarAviso } from "./ui/aviso";
import { criarModalAcao } from "./ui/modalAcao";
import { criarModalAcoes } from "./ui/modalAcoes";
import { criarJogadores } from "./ui/jogadores";
import { criarRedimensionadorDaColuna } from "./ui/redimensionarColuna";
import { criarMenuGrupoMapa, type ExtraDoPainel } from "./ui/menuGrupoMapa";
import { criarBarra } from "./ui/barra";
import { criarDicaCondicao } from "./ui/dicaCondicao";
import { criarMenuToken } from "./ui/menuToken";
import { criarPainelCalibragem } from "./ui/painelCalibragem";
import { criarPilha } from "./ui/pilha";
import { criarBotaoBackup } from "./ui/backup";
import { organizarAbasEmLinhas } from "./ui/abasEmLinhas";
import { criarPainelDados } from "./ui/painelDados";
import { criarPainelDesenho, type NomeFerramenta } from "./ui/painelDesenho";
import { criarFog } from "./tabuleiro/fog";
import { criarPainelFog } from "./ui/painelFog";
import { aplicarSeletoresDeCor } from "./ui/seletorDeCor";
import { mascaraDoTexto, novaMascara } from "./fog";
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
    // ---------------------------------------------------------------
    // DESENHOS COMPARTILHADOS e CTRL+Z (pedido do dono, 17/11/2026). Online, os desenhos são DO MAPA e de todos: cada traço ou forma vai ao servidor (que dá o id e o autor e avisa todos), e a borracha também.
    // O desenho de quem desenha aparece NA HORA (com um id temporário, negativo) e troca pelo id de verdade quando o servidor responde (a `ref` volta junto). Quem desenha só apaga os desenhos DELE; o
    // mestre apaga todos. Cada pessoa tem o PRÓPRIO histórico: Ctrl+Z desfaz a última ação de desenho (criar ou apagar) e Ctrl+Y (ou Ctrl+Shift+Z) refaz. Sem servidor (modo local) vale igual.
    // ---------------------------------------------------------------
    // (`ids` guarda os ids que os desenhos TINHAM: quando um desenho volta, ele ganha um id novo, e `trocarId` atualiza o histórico para as ações mais antigas continuarem valendo)
    type AcaoDeDesfazer = { tipo: "criou"; id: number } | { tipo: "apagou"; desenhos: NovoDesenho[]; ids: number[] };
    type AcaoDeRefazer = { tipo: "recriar"; desenhos: NovoDesenho[]; ids: number[] } | { tipo: "apagarDe"; ids: number[] };
    const historicoDesfazer: AcaoDeDesfazer[] = [];
    const historicoRefazer: AcaoDeRefazer[] = [];
    let idTemporarioDeDesenho = -1;
    const desenhosPendentes = new Map<string, number>(); // ref -> id temporário (esperando o servidor)
    const refsDescartados = new Set<string>(); // desenhos apagados ANTES de o servidor responder: quando ele responder, o desenho de verdade também é apagado
    let apagandoAgora: Extract<AcaoDeDesfazer, { tipo: "apagou" }> | null = null; // a borracha em gesto: tudo o que ela apaga até soltar o mouse é UMA ação no histórico

    function semIdentidade(d: Desenho): NovoDesenho {
        const copia: Record<string, unknown> = { ...d };
        delete copia.id;
        delete copia.autor;
        return copia as unknown as NovoDesenho;
    }
    const podeApagarAqui = (d: Desenho): boolean => podeApagarDesenho(d, meuUsuario, estado.mestre);
    function limparHistoricoDeDesenho(): void {
        historicoDesfazer.length = 0;
        historicoRefazer.length = 0;
        desenhosPendentes.clear();
        refsDescartados.clear();
        apagandoAgora = null;
    }
    function aposMudarDesenhos(): void {
        desenho.redesenhar();
        painelDesenho.atualizar();
    }

    /** Guarda um desenho novo no estado (online: com id temporário) e o envia ao servidor. `atrasoMs` espaça o envio quando vários são criados de uma vez (desfazer um "apagar tudo"). */
    function guardarDesenho(novo: NovoDesenho, atrasoMs = 0): Desenho {
        if (!rede?.ativa) return adicionarDesenho(novo);
        const temporario = { ...novo, id: idTemporarioDeDesenho--, ...(meuUsuario && { autor: meuUsuario }) } as Desenho;
        receberDesenho(temporario);
        const ref = String(temporario.id);
        desenhosPendentes.set(ref, temporario.id);
        const enviar = (): void => rede?.enviar({ tipo: "desenhar", desenho: novo, ref });
        if (atrasoMs > 0) setTimeout(enviar, atrasoMs);
        else enviar();
        return temporario;
    }
    /** Tira os desenhos do estado e avisa o servidor (os que ainda esperam o servidor ficam marcados para sumir assim que ele responder). */
    function apagarDesenhosSemHistorico(lista: Desenho[]): void {
        for (const d of lista) if (d.id < 0) refsDescartados.add(String(d.id));
        removerDesenhos(lista.map((d) => d.id));
        const reais = lista.filter((d) => d.id > 0).map((d) => d.id);
        if (rede?.ativa && reais.length > 0) rede.enviar({ tipo: "apagar_desenhos", ids: reais });
    }
    function empilharDesfazer(acao: AcaoDeDesfazer): void {
        historicoDesfazer.push(acao);
        if (historicoDesfazer.length > MAX_HISTORICO_DESENHO) historicoDesfazer.shift();
        historicoRefazer.length = 0; // (uma ação nova joga fora o que dava para refazer)
    }
    function apagarComHistorico(lista: Desenho[]): void {
        if (lista.length === 0) return;
        apagarDesenhosSemHistorico(lista);
        if (!apagandoAgora) {
            apagandoAgora = { tipo: "apagou", desenhos: [], ids: [] };
            empilharDesfazer(apagandoAgora);
        }
        apagandoAgora.desenhos.push(...lista.map(semIdentidade));
        apagandoAgora.ids.push(...lista.map((d) => d.id));
    }
    /** Um desenho ganhou um id novo (o servidor deu o de verdade, ou ele voltou depois de apagado): o histórico inteiro passa a usar o id novo. */
    function trocarIdTemporario(antigo: number, novo: number): void {
        const troca = (i: number): number => (i === antigo ? novo : i);
        for (const a of historicoDesfazer) {
            if (a.tipo === "criou") a.id = troca(a.id);
            else a.ids = a.ids.map(troca);
        }
        for (const a of historicoRefazer) a.ids = a.ids.map(troca);
    }

    /** Ctrl+Z: desfaz a última ação de desenho desta pessoa (pula o que já não dá para desfazer: o desenho já foi apagado por outro, ou não é dela). */
    function desfazerDesenho(): void {
        while (historicoDesfazer.length > 0) {
            const acao = historicoDesfazer.pop() as AcaoDeDesfazer;
            if (acao.tipo === "criou") {
                const d = estado.desenhos.find((x) => x.id === acao.id);
                if (!d || !podeApagarAqui(d)) continue;
                apagarDesenhosSemHistorico([d]);
                historicoRefazer.push({ tipo: "recriar", desenhos: [semIdentidade(d)], ids: [d.id] });
            } else {
                const novos = acao.desenhos.map((n, i) => guardarDesenho(n, i * 25));
                novos.forEach((d, i) => trocarIdTemporario(acao.ids[i], d.id)); // (as ações mais antigas que citavam os desenhos de antes passam a citar os novos)
                historicoRefazer.push({ tipo: "apagarDe", ids: novos.map((d) => d.id) });
            }
            apagandoAgora = null;
            aposMudarDesenhos();
            return;
        }
    }
    /** Ctrl+Y (ou Ctrl+Shift+Z): refaz o que o Ctrl+Z desfez. */
    function refazerDesenho(): void {
        while (historicoRefazer.length > 0) {
            const acao = historicoRefazer.pop() as AcaoDeRefazer;
            if (acao.tipo === "recriar") {
                const novos = acao.desenhos.map((n, i) => guardarDesenho(n, i * 25));
                novos.forEach((d, i) => trocarIdTemporario(acao.ids[i], d.id));
                historicoDesfazer.push({ tipo: "criou", id: novos[0].id });
            } else {
                const existentes = estado.desenhos.filter((d) => acao.ids.includes(d.id) && podeApagarAqui(d));
                if (existentes.length === 0) continue;
                apagarDesenhosSemHistorico(existentes);
                historicoDesfazer.push({ tipo: "apagou", desenhos: existentes.map(semIdentidade), ids: existentes.map((d) => d.id) });
            }
            apagandoAgora = null;
            aposMudarDesenhos();
            return;
        }
    }
    /** "Apagar tudo": o mestre apaga todos os desenhos do mapa; os outros, só os deles. Dá para desfazer com Ctrl+Z. */
    function apagarTodosOsDesenhos(): void {
        apagandoAgora = null;
        apagarComHistorico(estado.desenhos.filter(podeApagarAqui));
        apagandoAgora = null;
        aposMudarDesenhos();
    }

    // As pinturas ficam por cima do mapa e da grade e por baixo dos tokens (criadas antes deles).
    const desenho = criarDesenho(camera, {
        aoMudar: () => painelDesenho.atualizar(),
        aoCriar: (cor) => painelDesenho.usarCor(cor), // a cor entra na pilha das recentes
        aoAdicionar: (novo) => {
            const criado = guardarDesenho(novo);
            empilharDesfazer({ tipo: "criou", id: criado.id });
        },
        aoRemover: (lista) => apagarComHistorico(lista),
        aoSoltarBorracha: () => {
            apagandoAgora = null;
        },
        podeApagar: podeApagarAqui,
    });

    // (declarada ANTES da barra: ela pergunta se pode mudar a grade já ao ser criada)
    let rede: Rede | null = null;
    const barra = criarBarra(camera, {
        aoMudarGrade: (ajustes) => grade.definirAjustes(ajustes),
        aoPedirGradeDaMesa: (g) => {
            if (!rede?.ativa) return false; // sem servidor: a barra aplica sozinha
            rede.enviar({ tipo: "definir_grade", espessura: g.espessura, cor: g.cor, alfa: g.alfa });
            return true;
        },
        podeMudarGrade: () => !rede?.ativa || estado.mestre,
        aoMudarTamanhoTabuleiro, aoAlternarCalibragem: alternarCalibragem, aoEscolherMapa: escolherMapa, aoVoltarAoPadrao: voltarAoPadrao });
    grade.definirAjustes(barra.ajustesDaGrade()); // os ajustes da grade que a pessoa deixou guardados (mostrar, espessura e cor)

    // O modo ONLINE (protótipo, só com ?online no endereço): enquanto `rede.ativa`, as ações abaixo vão para o SERVIDOR, que
    // valida, aplica e avisa todos; sem isso (ou sem conexão) tudo vale só localmente, como sempre foi.

    // A COLUNA da direita tem duas abas, "Chat" e "Bolsa" (ver ui/lateral.ts). O chat e a lateral dependem um do outro: cada um recebe uma função que só
    // roda depois de os dois existirem.
    const lateral = criarLateral({ aoMostrarChat: () => chat.mostrou() });
    // O chat (coluna da direita). Local: enviar guarda a mensagem no estado e refaz a lista. Online: o servidor cria e avisa.
    const chat = criarChat({
        visivel: () => lateral.chatVisivel(),
        aoChegarEscondida: (quantas) => lateral.avisarNovas(quantas),
        // Arrastar o TOTAL de uma rolagem do chat até um token = dar dano a ele (só dano, só o total).
        aoArrastarResultado: (ponto) => {
            const naIniciativa = ponto ? painelIniciativa.sobre(ponto) : null;
            painelIniciativa.destacarSoltar(naIniciativa !== null); // (por cima da caixa da iniciativa: ela se destaca)
            tokens.destacarAlvo(ponto && !naIniciativa ? tokenSobOPonto(ponto) : null);
        },
        aoSoltarResultado: (idDaMensagem, ponto, indice, dado) => {
            tokens.destacarAlvo(null);
            painelIniciativa.destacarSoltar(false);
            if (painelIniciativa.sobre(ponto)) {
                soltarNaIniciativa(idDaMensagem, indice, dado);
                return;
            }
            const alvo = tokenSobOPonto(ponto);
            if (alvo) darDanoArrastado(alvo, idDaMensagem, indice, dado);
        },
        aoEnviar: (texto) => {
            // O COMANDO "/r conta": rola uma conta com dados e números (ex.: "/r 2d6+3", "/r (1d20+5)*2"), sem variáveis. Online o servidor confere e sorteia.
            const comandoR = /^\/r(?:\s+(.*))?$/i.exec(texto);
            if (comandoR) {
                const conta = (comandoR[1] ?? "").trim();
                if (conta === "") return void aviso.mostrar("Use /r e uma conta com dados e números. Ex.: /r 2d6+3 ou /r (1d20+5)*2", { duracaoMs: TEMPO_AVISO_MAPA_MS });
                if (!podeRolarAgora()) return void aviso.mostrar("Calma! Você está rolando rápido demais.", { duracaoMs: TEMPO_AVISO_MAPA_MS });
                comAtrasoDeRolagem(() => {
                    if (rede?.ativa) {
                        rede.enviar({ tipo: "rolar_conta", texto: conta });
                        return;
                    }
                    const feito = rolarConta(conta, Math.random);
                    if (!feito.ok) return void aviso.mostrar(feito.erro, { duracaoMs: TEMPO_AVISO_MAPA_MS });
                    adicionarRolagemDeFicha(AUTOR_PROVISORIO, feito.valor);
                    chat.atualizar();
                });
                return;
            }
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
    // As abas da coluna da direita e da bolsa: se não cabem numa linha, passam para a de baixo em linhas IGUAIS (4 abas viram 2 + 2).
    organizarAbasEmLinhas(document.getElementById("lateral-abas") as HTMLElement, ".lateral-aba", 34, 4);
    organizarAbasEmLinhas(document.getElementById("bolsa-abas") as HTMLElement, ".bolsa-aba", 0, 2);
    const painelIniciativa = criarIniciativa({
        aoAcao: (acao) => aplicarAcaoIniciativa(acao),
        confirmarLimpar: () => confirmacao.perguntar({ titulo: "Limpar a iniciativa?", mensagem: "A lista, a vez e a rodada serão apagadas para todos.", confirmar: "Limpar" }),
    });

    const painelCalibragem = criarPainelCalibragem({
        aoConcluir: () => ligarCalibragem(false),
        // Esc: com um 1º clique em andamento só o cancela (a ferramenta fica ligada para tentar de novo); sem ele, sai da calibragem.
        aoEsc: () => {
            if (!calibragem.cancelarMedida()) ligarCalibragem(false);
        },
    });

    // A cor de desenho escolhida agora: a régua e o ping (os seus e, pela rede, os que os outros veem) usam ESTA cor.
    let corDoDesenho: number = COR_INICIAL_DESENHO;
    let aplicarCorNaRegua: ((cor: number) => void) | null = null; // (a régua é criada mais abaixo)
    const painelDesenho = criarPainelDesenho({
        aoEscolher: escolherFerramenta,
        aoMudarCor: (cor) => {
            corDoDesenho = cor;
            aplicarCorNaRegua?.(cor);
            desenho.definirCor(cor);
        },
        aoMudarAlfa: (alfa) => desenho.definirAlfa(alfa),
        aoApagarTudo: () => apagarTodosOsDesenhos(), // (o mestre apaga todos; os outros, só os deles; Ctrl+Z desfaz)
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
        aoMudarAbertas: (ids) => bolsa.marcarFichaAberta(ids), // (a bolsa é criada logo abaixo; isto só roda quando uma janela abre, troca de ficha ou fecha)
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
        aoUsarCartao: (id, versao, aba, indice, token) => {
            if (!podeRolarAgora()) return mensagemDeLimite; // (o limite anti-spam é o mesmo das rolagens)
            if (rede?.ativa) {
                comAtrasoDeRolagem(() => rede?.enviar({ tipo: "usar_cartao", id, versao, aba, indice, token })); // o SERVIDOR calcula, rola e o cartão chega pelo chat (evento "mensagem")
                return null;
            }
            const ficha = estado.fichas.find((f) => f.id === id);
            if (!ficha) return "Essa ficha não existe.";
            const analise = analisarAbas(ficha.abas.map((a) => a.texto), valoresAtuaisDaFicha(id))[aba];
            if (!analise) return "Essa página não existe.";
            const resultado = rolarCartaoDaAnalise(analise, indice, ficha.nome, Math.random); // modo local: calcula e rola aqui mesmo
            if (!resultado.ok) return resultado.erro;
            comAtrasoDeRolagem(() => {
                adicionarCartaoDeFicha(AUTOR_PROVISORIO, resultado.valor, tokenDaRolagem(id, token));
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
        confirmarDescarte: async (podeSalvar, paraTrocar) => {
            const resposta = await confirmacao.escolher(
                paraTrocar
                    ? {
                          titulo: "Trocar de ficha sem salvar?",
                          mensagem: "Esta ficha tem alterações que ainda não foram salvas.\nSe você abrir a outra ficha nesta janela sem salvar, elas serão perdidas. (Para ficar com as duas à vista, fixe esta ficha antes.)",
                          confirmar: "Descartar e abrir a outra",
                          ...(podeSalvar && { alternativa: "Salvar e abrir a outra" }),
                      }
                    : {
                          titulo: "Fechar sem salvar?",
                          mensagem: "Esta ficha tem alterações que ainda não foram salvas.\nSe você fechar sem salvar, elas serão perdidas.",
                          confirmar: "Fechar sem salvar",
                          ...(podeSalvar && { alternativa: "Salvar e fechar" }),
                      },
            );
            return resposta === "confirmar" ? "descartar" : resposta === "alternativa" ? "salvar" : "cancelar";
        },
    });

    // O editor de recorte da imagem do token (arrastar, zoom, confirmar).
    const editorImagem = criarEditorImagem();

    /** As LIGAÇÕES token × ficha mudaram: as janelas de ficha abertas refazem o aviso vermelho (ficha única com vários tokens). (Só as abertas agem.) */
    function ligacoesMudaram(): void {
        for (const ficha of estado.fichas) editorFicha.valoresMudaram(ficha.id);
    }

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
            ligacoesMudaram(); // 5) o aviso das janelas de ficha
        },
        editarImagem: (arquivo, corFundo) => editorImagem.editar(arquivo, corFundo),
        // "Criar ficha" dentro do "Editar token": a ficha nasce com o nome do token e já ligada a ele (um peça age pelo modelo dela).
        aoCriarFicha: (token) => bolsa.criarFichaDoToken(estado.tokens.find((t) => t.id === token.copiaDe) ?? token),
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

    // --- INICIATIVA (a ordem de combate; ver iniciativa.ts e ui/iniciativa.ts) ---
    /** Uma ação na ordem de combate. Online o SERVIDOR é o dono do estado (aplica, guarda e avisa todos: "iniciativa_definida"); no modo local, aplica aqui. */
    function aplicarAcaoIniciativa(acao: AcaoDaIniciativa): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "iniciativa", acao });
            return;
        }
        if (acao.acao === "adicionar" && acao.token !== null && !buscarToken(acao.token)) return;
        const resultado = aplicarAcaoDaIniciativa(acao);
        if (!resultado.ok) {
            aviso.mostrar(resultado.erro, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        iniciativaMudou();
    }

    /** A iniciativa mudou (por esta pessoa ou por outra): redesenha a caixa. */
    function iniciativaMudou(): void {
        painelIniciativa.atualizar();
        // A borda suave e pulsante no token de quem tem a vez: só com a iniciativa CONFIRMADA (fora do modo de edição) e se a vez é de um token.
        const comAVez = estadoIniciativa.editando ? undefined : estadoIniciativa.entradas.find((e) => e.id === estadoIniciativa.vez);
        tokens.destacarVez(comAVez?.token ?? null);
    }

    /** "Adicionar à iniciativa" no menu do token: acrescenta o token (valor 0) e leva o foco ao campo do valor, para a pessoa digitar. */
    function adicionarTokenNaIniciativa(id: number): void {
        const token = buscarToken(id);
        if (!token) return;
        if (estadoIniciativa.entradas.some((e) => e.token === id)) {
            aviso.mostrar(`"${token.nome}" já está na iniciativa.`, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        painelIniciativa.abrir();
        // O valor vem da rolagem "Iniciativa" da ficha do token (sem ficha ou sem essa rolagem, entra com 0). Online quem rola é o SERVIDOR (e o cartão chega pelo chat).
        if (rede?.ativa) {
            aplicarAcaoIniciativa({ acao: "adicionar", nome: token.nome, valor: 0, token: id, rolar: true });
            return;
        }
        const rolado = rolarIniciativaDoToken(token, Math.random);
        if (rolado) {
            adicionarRolagemDeFicha(AUTOR_PROVISORIO, rolado.resultado, token.id);
            chat.atualizar();
        }
        aplicarAcaoIniciativa({ acao: "adicionar", nome: token.nome, valor: rolado ? Math.round(rolado.total) : 0, token: id });
    }

    /**
     * O TOTAL de uma rolagem do chat foi solto na caixa da iniciativa: entra um personagem NOVO com esse valor (quem já estava na lista fica; a pessoa tira o antigo à mão, com o botão direito).
     * Se a rolagem veio de uma ficha aberta por um TOKEN, o novo personagem é esse token (com o ícone e o nome dele); senão, leva o nome da ficha, ou "Criatura" (rolagem do painel de dados).
     */
    function soltarNaIniciativa(idDaMensagem: number, indice?: number, dado?: number): void {
        const total = totalDaRolagem(idDaMensagem, indice, dado);
        if (total === null) return;
        const mensagem = estado.mensagens.find((m) => m.id === idDaMensagem);
        const token = mensagem?.token !== undefined ? buscarToken(mensagem.token) : undefined;
        painelIniciativa.abrir();
        aplicarAcaoIniciativa({ acao: "adicionar", nome: token?.nome ?? mensagem?.rolagemFicha?.ficha ?? mensagem?.cartaoFicha?.ficha ?? "Criatura", valor: Math.round(total), token: token?.id ?? null });
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
    function darDanoArrastado(token: Token, idDaMensagem: number, indice?: number, dado?: number): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "arrastar_resultado", token: token.id, mensagem: idDaMensagem, ...(indice !== undefined && { indice }), ...(dado !== undefined && { dado }) });
            return;
        }
        const total = totalDaRolagem(idDaMensagem, indice, dado);
        if (total === null) return;
        const resultado = aplicarResultado(token, total);
        if (!resultado.ok) {
            aviso.mostrar(resultado.erro, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        tokens.redesenhar(token, "dano"); // a barra muda na hora (e a peça pisca: dano, sempre)
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
        tokens.redesenhar(token, resultado.efeito === "reduzir" ? "dano" : "cura"); // a barra muda na hora (e a peça pisca: dano ou cura, sempre)
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
        for (const token of sincronizarValoresDaFicha(idFicha)) tokens.redesenhar(token, true);
        editorFicha.valoresMudaram(idFicha);
    }

    /** Arrastou um token da BOLSA para o tabuleiro: nasce uma PEÇA (cópia temporária) na casa escolhida. O token da bolsa continua lá, e dá para arrastá-lo de novo. */
    function colocarModeloNoTabuleiro(modelo: Token, col: number, row: number): void {
        // Ficha de JOGADOR (variáveis que mudam): só um token por CENA (em outra cena pode ter o seu, com os mesmos valores). Confere antes de tudo (o servidor confere de novo) e explica.
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
    }

    /**
     * "Remover do tabuleiro" numa PEÇA (pelo botão ou soltando-a na bolsa): a peça é APAGADA (ela é temporária: o token da bolsa continua lá). Os status que ela
     * tinha se perdem, mas o aviso oferece "Desfazer", que cria uma peça nova com o mesmo lugar, o PV atual e as condições de antes.
     */
    /** O aviso de quem tentou tirar do mapa uma peça que não pode. */
    function avisarSemPermissaoParaTirar(nome: string): void {
        aviso.mostrar(`Você não tem permissão para tirar "${nome}" do mapa: só quem tem acesso a ele (dono, leitor ou editor) e o mestre.`, { duracaoMs: TEMPO_AVISO_MAPA_MS });
    }

    function removerPeca(peca: Token): void {
        if (!podeUsarToken(peca)) return avisarSemPermissaoParaTirar(peca.nome); // (confere ANTES: o servidor também recusaria)
        avisarRemocao(peca.nome, removerPecaSemAviso(peca));
    }

    /** Apaga a peça (sem avisar) e devolve a função que a recria do jeito que estava (o "Desfazer"). */
    function removerPecaSemAviso(peca: Token): () => void {
        const foto = { modelo: peca.copiaDe as number, col: peca.col, row: peca.row, valores: peca.valores.filter((v) => !v.oculto).map((v) => ({ id: v.id, atual: v.atual })), condicoes: [...peca.condicoes] };
        if (rede?.ativa) rede.enviar({ tipo: "excluir_token", id: peca.id }); // o servidor apaga o arquivo e avisa todos
        else removerTokenDoJogo(peca.id);
        return () => desfazerPeca(foto);
    }

    /**
     * O cartão "N tokens selecionados" (canto de baixo, com "Remover do tabuleiro"): aparece NA HORA em que 2 ou mais tokens são selecionados e some assim que sobram
     * menos de 2 (pedido do dono, 17/11/2026). Fica à vista (sem sumir sozinho) enquanto a seleção durar; o `chave` evita apagar outro aviso que tenha tomado o lugar.
     */
    function mostrarAvisoDaSelecao(escolhidos: Token[]): void {
        if (escolhidos.length < 2) {
            aviso.esconder("selecao");
            return;
        }
        aviso.mostrar(`${escolhidos.length} tokens selecionados.`, {
            chave: "selecao",
            duracaoMs: 24 * 60 * 60 * 1000,
            acao: { rotulo: "Remover do tabuleiro", aoClicar: () => { removerVarios(escolhidos); tokens.limparSelecao(); } },
        });
    }

    /**
     * Remove VÁRIOS tokens do tabuleiro de uma vez (Delete, ou o botão direito com vários selecionados, ou soltá-los na bolsa), SEM confirmar: as peças são apagadas e os modelos
     * guardados, e um único aviso oferece "Desfazer" para todos juntos.
     */
    function removerVarios(lista: Token[]): void {
        const desfazeres: (() => void)[] = [];
        for (const token of lista) {
            if (!buscarToken(token.id) || token.guardado) continue;
            if (token.copiaDe !== null && !podeUsarToken(token)) {
                avisarSemPermissaoParaTirar(token.nome);
                continue;
            }
            if (token.copiaDe !== null) {
                desfazeres.push(removerPecaSemAviso(token));
                continue;
            }
            const { col, row, id } = token;
            if (rede?.ativa) rede.enviar({ tipo: "guardar_token", id });
            else {
                guardarToken(id);
                tokens.aplicarPosicao(token);
            }
            desfazeres.push(() => desfazerRemocao(id, col, row));
        }
        if (desfazeres.length === 0) return;
        bolsa.atualizar();
        const texto = desfazeres.length === 1 ? "1 token foi removido do tabuleiro." : `${desfazeres.length} tokens foram removidos do tabuleiro.`;
        aviso.mostrar(texto, { duracaoMs: TEMPO_DESFAZER_MS, acao: { rotulo: "Desfazer", aoClicar: () => desfazeres.forEach((d) => d()) } });
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
        fecharMenusDoToken(); // (o menu e o balão do token ficariam soltos por baixo da janela da ficha)
        balao.esconder();
        const ficha = token.ficha === null ? undefined : estado.fichas.find((f) => f.id === token.ficha);
        // SEM ACESSO ao token (uma peça cujo modelo o servidor mandou só para o mapa): a mensagem de "sem acesso" já aparece em outro lugar; aqui NÃO se diz "não tem ficha" (seria falso e repetido).
        if (!estado.mestre && token.somenteMapa === true) return;
        if (!ficha && token.ficha !== null && !estado.mestre) {
            // O token TEM ficha, mas ela não foi compartilhada com esta pessoa (o token e a ficha são liberados separados: compartilhar a pasta do token não leva a ficha).
            aviso.mostrar(`A ficha de "${token.nome}" não foi compartilhada com você. Peça ao mestre para compartilhar a ficha (ou a pasta dela).`, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
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
        fecharMenusDoToken(); // 3) menus e balão que estavam abertos sobre ele
        balao.esconder();
        bolsa.atualizar(); // 4) a ficha da bolsa
        ligacoesMudaram(); // 5) o aviso das janelas de ficha (ficha única com vários tokens)
    }

    // Os menus do token no mapa: a engrenagem (menuToken) e o PAINEL de ações (menuGrupoMapa) abrem e fecham juntos. (`fecharPainelDeAcoes` é ligado quando o painel é criado, logo abaixo.)
    let fecharPainelDeAcoes: () => void = () => undefined;
    function fecharMenusDoToken(): void {
        menu.fechar();
        fecharPainelDeAcoes();
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
        aoAdicionarIniciativa: (id) => adicionarTokenNaIniciativa(id),
        aoAlternarCondicao: alternarCondicaoDoToken,
        dica,
    });

    // O PAINEL DE AÇÕES dos tokens no mapa (pedido do dono, 17/11/2026): UM token (clique direito) ou VÁRIOS selecionados. Só oferece o que todos podem receber, e o valor se digita num CAMPO
    // dentro do próprio painel (sem janela). Ver ui/menuGrupoMapa.ts.
    const menuGrupo = criarMenuGrupoMapa({
        aoAplicar: (acaoId, texto, lista) => (lista.length === 1 ? aplicarAcaoDoJogo(lista[0].id, acaoId, texto) : aplicarAcaoEmVariosDoJogo(lista.map((t) => t.id), acaoId, texto)),
        aoCondicao: (condicaoId, ligar, lista) => condicaoEmVarios(lista.map((t) => t.id), condicaoId, ligar),
    });
    fecharPainelDeAcoes = () => menuGrupo.fechar();

    /** O que um token só ganha no fim do painel de ações (só o mestre: a iniciativa e a criação de ações são dele). */
    function extrasDoPainel(token: Token): ExtraDoPainel[] {
        if (!estado.mestre) return [];
        return [
            { texto: "Adicionar à iniciativa", dica: "Põe este token na ordem de combate (a caixa Iniciativa, na pilha da esquerda)", aoClicar: () => adicionarTokenNaIniciativa(token.id) },
            { texto: "+ Nova ação", dica: "Criar ou excluir ações (valem para todos os tokens)", aoClicar: () => modalAcoes.abrir() },
        ];
    }
    /** Dano ou cura em vários tokens: online o SERVIDOR rola os dados UMA vez e aplica a todos; no modo local, aqui. */
    function aplicarAcaoEmVariosDoJogo(ids: number[], acaoId: number, texto: string): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "aplicar_acao_varios", tokens: ids, acao: acaoId, valor: texto });
            return;
        }
        const feito = aplicarAcaoEmVarios(ids.flatMap((id) => buscarToken(id) ?? []), acaoId, texto, Math.random);
        if (!feito.ok) {
            aviso.mostrar(feito.erro, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            return;
        }
        for (const { token, resultado } of feito.itens) tokens.redesenhar(token, resultado.efeito === "reduzir" ? "dano" : "cura"); // as barras mudam na hora (e as peças piscam: dano ou cura, sempre)
        const acao = estado.acoesDaMesa.find((a) => a.id === acaoId);
        adicionarMensagem(AUTOR_PROVISORIO, `${acao?.nome ?? "Ação"} ${feito.quantia} em ${feito.itens.length} tokens`);
        chat.atualizar();
    }
    /** Liga (ou desliga) uma condição em vários tokens de uma vez. */
    function condicaoEmVarios(ids: number[], condicaoId: string, ligar: boolean): void {
        if (rede?.ativa) {
            rede.enviar({ tipo: "condicao_varios", tokens: ids, condicao: condicaoId, ligar });
            return;
        }
        for (const id of ids) {
            const token = definirCondicao(id, condicaoId, ligar);
            if (token) tokens.redesenhar(token);
        }
        painelIniciativa.atualizar(); // (a iniciativa mostra as condições de cada token)
    }

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
            fecharMenusDoToken(); // menus e balões ficariam soltos por baixo da bolsa expandida
            balao.esconder();
        },
        aoEditar: (token) => editorToken.editar(token),
        aoAbrirFichaDoToken: (token) => abrirFichaDoToken(token),
        aoRecolherPecas: (modelo) => {
            // Só as peças deste token no mapa (cena) em que estou: as de outros mapas ficam onde estão.
            const pecas = estado.tokens.filter((t) => t.copiaDe === modelo && !t.guardado && t.mapa === estado.mapaId);
            if (pecas.length === 0) return void aviso.mostrar("Nenhuma peça deste token está neste mapa.", { duracaoMs: 2500 });
            removerVarios(pecas); // (já avisa quantas saíram, com "Desfazer", e respeita as permissões)
        },
        aoCompartilhar: (item, id, nome) => jogadores.compartilhar(item, id, nome, item === "tokens" ? buscarToken(id)?.grupos : item === "fichas" ? estado.fichas.find((f) => f.id === id)?.grupos : undefined),
        // PASTAS da bolsa (ui/pastas.ts): online, o SERVIDOR confere (permissões) e avisa; no modo local, muda o estado aqui mesmo.
        aoCriarPasta: (tipo, nome, pai) => {
            if (rede?.ativa) return void rede.enviar({ tipo: "criar_pasta", tipoDaPasta: tipo, nome, pai });
            const pasta = montarPasta(tipo, nome, pai);
            if (pasta) receberPasta(pasta);
            atualizarListasDaBolsa();
        },
        aoRenomearPasta: (pasta, nome) => {
            if (rede?.ativa) return void rede.enviar({ tipo: "editar_pasta", id: pasta.id, nome });
            pasta.nome = limparNomeDePasta(nome);
            atualizarListasDaBolsa();
        },
        aoMoverPasta: (pasta, pai) => {
            if (rede?.ativa) return void rede.enviar({ tipo: "editar_pasta", id: pasta.id, pai });
            if (podeMoverPasta(pasta.id, pai)) pasta.pai = pai;
            atualizarListasDaBolsa();
        },
        aoExcluirPasta: (pasta) =>
            void confirmacao.perguntar({ titulo: "Excluir pasta?", mensagem: `A pasta "${pasta.nome}" será apagada. O que está dentro dela (pastas, tokens e fichas) NÃO é apagado: sobe para a pasta de cima.`, confirmar: "Excluir pasta" }).then((sim) => {
                if (!sim) return;
                if (rede?.ativa) return void rede.enviar({ tipo: "excluir_pasta", id: pasta.id });
                excluirPasta(pasta.id);
                atualizarListasDaBolsa();
            }),
        aoMoverParaPasta: (tipo, ids, pasta) => {
            if (rede?.ativa) return void rede.enviar({ tipo: "mover_para_pasta", item: tipo, ids, pasta });
            moverParaPasta(tipo, ids, pasta);
            atualizarListasDaBolsa();
        },
        // "Tirar"/"Botar" da caixa "Tokens da ficha": online o servidor confere a regra da ficha única; no modo local vale na hora.
        aoLigarFicha: (token, idFicha) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "editar_token", id: token.id, mudancas: { ficha: idFicha } });
                return;
            }
            const motivo = idFicha === null ? null : motivoFichaOcupada(idFicha, token.id);
            if (motivo) return void aviso.mostrar(motivo, { duracaoMs: TEMPO_AVISO_MAPA_MS });
            editarToken(token.id, { ficha: idFicha });
            for (const peca of pecasDoModelo(token.id)) tokens.redesenhar(peca);
            bolsa.atualizar();
            ligacoesMudaram();
        },
        // Os status (barras) editados na bolsa em tela cheia são UMA regra para a MESA INTEIRA e valem AO VIVO: todos os tokens e peças mudam na hora.
        aoMudarStatus: (status) => mudarStatusDaMesa(status),
        aoAvisar: (texto) => aviso.mostrar(texto, { duracaoMs: TEMPO_AVISO_MAPA_MS }),
        editarImagem: (arquivo, corFundo) => editorImagem.editar(arquivo, corFundo),
        // Ficha nova (VAZIA). Online, quem a cria é o SERVIDOR, que cria o arquivo na máquina do mestre NA HORA, e ela chega
        // pelo evento "ficha_criada"; no modo local ela só existe na memória desta aba.
        // Com `token` (da bolsa, sem ficha): a ficha nasce com o NOME dele e já fica LIGADA a ele (online, quem liga é o servidor).
        aoCriarFicha: (token) => {
            if (rede?.ativa) {
                rede.enviar({ tipo: "criar_ficha", ...(token && { token: token.id }) });
                return "enviada";
            }
            const ficha = criarFicha(token?.nome ?? "");
            if (ficha && token) {
                editarToken(token.id, { ficha: ficha.id });
                for (const peca of pecasDoModelo(token.id)) tokens.redesenhar(peca); // (as barras de status das peças dele vêm da ficha)
            }
            return ficha;
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

    // DUPLO CLIQUE na aba "Bolsa" da coluna da direita ABRE a bolsa em tela cheia (o primeiro clique já trocou para a aba; o segundo abre).
    document.getElementById("lateral-aba-bolsa")?.addEventListener("dblclick", () => bolsa.abrir());

    // A aba MAPAS da bolsa (a biblioteca de mapas do servidor; só o MESTRE envia, troca e apaga). Sem servidor (modo local) ela só explica. Quem barra de verdade é o servidor: aqui só se decide o que mostrar.
    // A aba "Jogadores" e a janela "Compartilhar" (só do mestre): os pedidos vão ao servidor, que confere o papel de novo e devolve o documento de permissões.
    let meuUsuario: string | null = null; // o id de usuário desta pessoa (o servidor o manda ao entrar)
    const jogadores = criarJogadores({
        aoDefinirMestre: (usuario, mestre) => rede?.enviar({ tipo: "definir_mestre", usuario, mestre }),
        aoDefinirLimites: (tokens, fichas) => rede?.enviar({ tipo: "definir_limites", tokens, fichas }),
        aoBanir: (usuario, nome, banir) => rede?.enviar({ tipo: "banir", usuario, banir, nome }),
        confirmar: (pergunta) => confirmacao.perguntar(pergunta),
        aoLiberar: (item, id, usuario, nivel) => rede?.enviar({ tipo: "liberar", item, id, usuario, nivel }),
    });
    /** O papel mudou (entrou, foi promovido ou rebaixado): a interface esconde ou mostra o que é só do mestre. */
    function aplicarPapel(): void {
        document.body.classList.toggle("jogador", !estado.mestre);
        fecharMenusDoToken();
        balao.esconder();
        bolsa.atualizar();
        barra.aplicarGradeDaMesa(estado.grade);
        bolsaMapas.atualizar(!!rede?.ativa);
        fog.atualizar(); // (o fog é translúcido para o mestre e opaco para os jogadores)
        if (!estado.mestre && bolsaEstaNaAbaDoMestre()) bolsa.escolherAba("tokens"); // (se estava numa aba que só o mestre tem, volta para Tokens)
    }
    function bolsaEstaNaAbaDoMestre(): boolean {
        const ligada = document.querySelector<HTMLElement>("#bolsa .bolsa-aba[aria-selected=true]");
        return ligada?.classList.contains("so-mestre") === true;
    }

    /** A faixa FIXA "sem permissão para ver este mapa" (fica até o mestre levar a pessoa a um mapa que ela pode ver). */
    const mostrarSemPermissao = (ligado: boolean): void => {
        (document.getElementById("aviso-sem-permissao") as HTMLElement).hidden = !ligado;
    };
    /** Refaz as duas listas da bolsa (tokens e fichas): as pastas mudaram. */
    const atualizarListasDaBolsa = (): void => {
        bolsa.atualizar();
        bolsa.atualizarFichas();
    };
    let listaDeJogadores: Jogador[] = []; // (a última lista que o servidor mandou: o mestre sabe o mapa de cada um)
    const bolsaMapas = criarBolsaMapas({
        aoEnviar: (arquivo) => void enviarMapaAoServidor(arquivo),
        aoUsar: (m) => usarMapaDaBiblioteca(m),
        aoMoverJogadores: () => rede?.enviar({ tipo: "mover_jogadores" }),
        aoExcluir: (m) =>
            void confirmacao
                .perguntar({ titulo: "Excluir mapa?", mensagem: `O mapa "${m.nome}" será apagado do servidor, para todos.`, confirmar: "Excluir mapa" })
                .then((sim) => {
                    if (sim && rede?.ativa) rede.enviar({ tipo: "excluir_mapa", id: m.id });
                }),
        aoMudarQuemVe: (m, todos, usuarios) => rede?.enviar({ tipo: "definir_quem_ve_mapa", id: m.id, todos, usuarios }),
        jogadoresConhecidos: () => jogadores.jogadoresConhecidos(),
        jogadoresNoMapa: (id) => listaDeJogadores.filter((j) => j.mapa === id && j.mestre !== true).map((j) => ({ nome: j.apelido, semPermissao: j.semPermissao === true })),
    });

    // A VISÃO (zoom e posição da câmera) é lembrada POR MAPA, neste navegador (localStorage): ao trocar de mapa e voltar, ou ao reabrir o site, a câmera volta onde estava.
    // Só some se o mapa nunca teve visão guardada (aí vale o "ajustar à tela" de sempre).
    type Visao = { z: number; x: number; y: number };
    const chaveDoMapa = (id: string | null): string => id ?? "sem-mapa";
    function lerVisoes(): Record<string, Visao> {
        try {
            const obj = JSON.parse(lerPreferencia(CHAVE_VISOES) ?? "{}");
            return obj && typeof obj === "object" ? obj : {};
        } catch {
            return {};
        }
    }
    function lerVisao(id: string | null): Visao | null {
        const v = lerVisoes()[chaveDoMapa(id)];
        return v && [v.z, v.x, v.y].every((n) => typeof n === "number" && Number.isFinite(n)) ? v : null; // (o que vem do localStorage não é confiável)
    }
    let guardarVisaoLigado = false; // (desligado até a visão da abertura ser restaurada: senão o "ajustar" inicial apagaria a guardada)
    let esperaVisao: number | undefined;
    camera.aoMudarVisao = () => {
        if (!guardarVisaoLigado) return;
        window.clearTimeout(esperaVisao); // (espera o arrasto/zoom acalmar para gravar uma vez só)
        esperaVisao = window.setTimeout(() => {
            const todas = lerVisoes();
            todas[chaveDoMapa(estado.mapaId)] = { z: camera.zoom, x: camera.x, y: camera.y };
            guardarPreferencia(CHAVE_VISOES, JSON.stringify(todas));
        }, 250);
    };
    let visaoRestaurada = false; // (a última troca de mapa achou uma visão guardada? Então o "ajustar" de quem pediu a troca não a desfaz)
    function restaurarVisaoDoMapa(id: string | null): boolean {
        const v = lerVisao(id);
        if (v) camera.restaurar(v.z, v.x, v.y);
        return v !== null;
    }

    // A TROCA DE MAPA (online): cada navegador BAIXA a imagem primeiro ("Carregando o mapa…") e só quando ela chegou troca, de uma vez, o mapa, o tamanho do tabuleiro e a grade. Até lá a imagem antiga continua
    // à vista e nada muda. Se chegar outra troca no meio, só a mais nova vale (`versaoDoMapa`); se a imagem falhar, nada muda e aparece um aviso.
    let versaoDoMapa = 0;
    let depoisDoMapa: (() => void) | null = null; // (só quem pediu a troca tem algo a fazer depois: ajustar a visão e dizer a previsão de colunas e linhas)
    async function trocarMapa(id: string | null, colunas?: number, linhas?: number, depois?: (() => void) | null): Promise<void> {
        try {
            await trocarMapaDeVerdade(id, colunas, linhas, depois);
        } finally {
            // Online, a interface (escondida desde que a página abriu: ver "mesa-pronta") só aparece quando o PRIMEIRO mapa do servidor já está na tela: assim o mapa nunca "troca" à vista.
            document.body.classList.add("mesa-pronta");
        }
    }
    async function trocarMapaDeVerdade(id: string | null, colunas?: number, linhas?: number, depois?: (() => void) | null): Promise<void> {
        const minha = ++versaoDoMapa;
        if (id !== null) {
            aviso.mostrar("Carregando o mapa…", { duracaoMs: 180000 }); // (fica até a imagem chegar: é escondido logo abaixo)
            bolsaMapas.mostrarAviso("Carregando o mapa…");
        }
        const chegou = await mapa.carregarDe(id === null ? null : `/mapas/${id}`, () => minha === versaoDoMapa);
        if (minha !== versaoDoMapa) return; // (outra troca chegou enquanto esta baixava: ela cuida de tudo)
        aviso.esconder();
        bolsaMapas.mostrarAviso("");
        if (!chegou) {
            mostrarAvisoDoMapa("Não foi possível carregar o mapa. O anterior continua à vista.");
            return;
        }
        if (guardarVisaoLigado) {
            // grava JÁ a visão do mapa que está saindo (a gravação com espera ainda poderia cair no mapa novo)
            window.clearTimeout(esperaVisao);
            const todas = lerVisoes();
            todas[chaveDoMapa(estado.mapaId)] = { z: camera.zoom, x: camera.x, y: camera.y };
            guardarPreferencia(CHAVE_VISOES, JSON.stringify(todas));
        }
        definirMapaAtual(id);
        fecharMenusDoToken();
        balao.esconder();
        tokens.reconstruir(); // (cada mapa guarda os seus tokens: saem os do mapa antigo e entram os deste)
        if (colunas !== undefined && linhas !== undefined) aplicarTamanho(definirTamanhoTabuleiro(colunas, linhas)); // (o mesmo cálculo do servidor: os tokens que ficaram fora são puxados para dentro)
        else mapa.ajustar();
        grade.desenhar(); // (o fundo e a cor das linhas da grade dependem de haver mapa)
        barra.atualizar();
        bolsaMapas.atualizar(rede?.ativa === true); // (o selo "Atual" só passa para o mapa novo quando ele já está na tela)
        visaoRestaurada = guardarVisaoLigado && restaurarVisaoDoMapa(id); // (a câmera volta onde estava neste mapa, se já esteve nele)
        depois?.();
        avisarSeMapaFoiReduzido();
    }

    /** O mapa grande demais para a placa de vídeo deste computador foi REDUZIDO ao carregar: avisa (só a nitidez muda; as colunas, as linhas e as casas continuam as mesmas). */
    function avisarSeMapaFoiReduzido(): void {
        const r = mapa.reducao();
        if (!r) return;
        aviso.mostrar(`Mapa reduzido de ${r.de.largura}×${r.de.altura} para ${r.para.largura}×${r.para.altura} px para caber na placa de vídeo deste computador. As casas e os tokens não mudam: só a nitidez. Mapas grandes demais pesam no desempenho: recomendamos excluí-los da aba Mapas (o mestre faz isso) e usar uma imagem menor.`, { duracaoMs: 14000 });
    }

    /** O MESTRE escolheu um mapa da biblioteca: o pedido leva o tamanho previsto pela imagem (colunas × linhas, como ao escolher um arquivo); o servidor avisa todos com o mapa e o tamanho JUNTOS, e cada navegador troca quando a imagem chegar. */
    function usarMapaDaBiblioteca(m: RegistroDeMapa): void {
        if (!rede?.ativa) return;
        if (!estado.mestre) return mostrarAvisoDoMapa("Só o mestre pode trocar o mapa.");
        const previsao = m.colunas !== undefined ? null : preverGrade(m.largura, m.altura); // (um mapa que já tem tamanho guardado volta com ele; só o mapa NOVO usa a previsão da imagem)
        depoisDoMapa = () => {
            if (!visaoRestaurada) camera.ajustar(); // (a visão acompanha o tabuleiro novo, a não ser que o mapa já tenha uma visão guardada; só para quem pediu a troca)
            if (!previsao) return;
            mostrarAvisoDoMapa(
                previsao.exata
                    ? `Mapa (${m.largura}×${m.altura} px): ${previsao.colunas} colunas × ${previsao.linhas} linhas (casas de ${previsao.pxPorCasa} px).`
                    : `Mapa: estimativa de ${previsao.colunas} colunas × ${previsao.linhas} linhas pelo tamanho da imagem. Ajuste pelos botões ou use "Alinhar mapa".`,
            );
        };
        rede.enviar({ tipo: "definir_mapa", id: m.id, ...(previsao && { colunas: previsao.colunas, linhas: previsao.linhas }) });
    }

    /** O MESTRE enviou uma imagem (pelo botão "+ Enviar mapa" ou por "Escolher mapa", online): vai ao servidor por HTTP (a imagem NUNCA vai pelo WebSocket), que confere tipo, pixels e tamanho; se der certo, vira o mapa de todos. */
    async function enviarMapaAoServidor(arquivo: File): Promise<void> {
        const dizer = (texto: string, erro = false): void => {
            bolsaMapas.mostrarAviso(texto, erro);
            if (erro) mostrarAvisoDoMapa(texto);
        };
        if (!estado.mestre) return dizer("Só o mestre pode enviar mapas.", true);
        if (arquivo.size > MAX_BYTES_MAPA) return dizer(`Imagem grande demais (${(arquivo.size / 1048576).toFixed(1)} MB): o máximo é ${MAX_BYTES_MAPA / 1048576} MB.`, true);
        dizer("Enviando…");
        try {
            const nome = arquivo.name.replace(/\.[^.]*$/, "").replace(/[_-]+/g, " ").trim();
            const resposta = await fetch(`/mapas?nome=${encodeURIComponent(nome)}${new URLSearchParams(location.search).has("papel") ? "&papel=" + encodeURIComponent(new URLSearchParams(location.search).get("papel") ?? "") : ""}`, { method: "POST", body: arquivo }); // (o servidor lê o TIPO pelos bytes, não pelo que se diz aqui)
            const corpo = (await resposta.json().catch(() => null)) as (RegistroDeMapa & { erro?: string }) | null;
            if (!resposta.ok || !corpo || typeof corpo.id !== "string") return dizer(corpo?.erro ?? `O servidor recusou a imagem (erro ${resposta.status}).`, true);
            dizer(`"${corpo.nome}" enviado.`);
            usarMapaDaBiblioteca(corpo);
            // "Este mapa terá fog?" (pré-selecionado como SIM; pedido do dono): o fog do mapa novo começa todo coberto, e o mestre vai revelando. O pedido vai DEPOIS do `definir_mapa` (o servidor
            // aplica o tamanho do mapa primeiro, e a máscara nasce do tamanho certo). Cancelar = o mapa fica sem fog (dá para ligar depois, no painel Fog).
            void confirmacao
                .perguntar({ titulo: "Este mapa terá fog?", mensagem: `Com fog, "${corpo.nome}" começa todo coberto e os jogadores só veem o que você revelar (e nem recebem as peças e os desenhos sob a névoa).\nCancelar deixa o mapa sem fog; dá para ligar depois no painel "Fog".`, confirmar: "Sim, com fog" })
                .then((sim) => {
                    if (sim && rede?.ativa) rede.enviar({ tipo: "fog_ativar", mapa: corpo.id, ativo: true, cobrirTudo: true });
                });
        } catch {
            dizer("Não foi possível enviar: sem conexão com o servidor.", true);
        }
    }

    // O BACKUP DA CAMPANHA (botão da aba Jogadores, só do mestre; ver ui/backup.ts).
    criarBotaoBackup({
        online: () => rede?.ativa === true,
        confirmar: () => confirmacao.perguntar({ titulo: "Baixar o backup da campanha?", mensagem: "Será baixado um arquivo .zip com TODOS os dados da campanha: fichas, tokens, grupos, mapas (com as imagens), desenhos e permissões. Pode ser grande.", confirmar: "Baixar backup" }),
        avisar: (texto) => mostrarAvisoDoMapa(texto),
    });

    // O FOG (névoa): a camada fica por cima do mapa, da grade e dos desenhos e por baixo dos tokens (por isso é criada aqui, antes deles). O pincel é uma ferramenta de arrasto, só do mestre.
    const fog = criarFog(camera, {
        aoPintar: (tracos) => {
            if (rede?.ativa) rede.enviar({ tipo: "fog_pintar", tracos }); // (aqui já foi pintado na hora; o servidor guarda e avisa os outros)
        },
    });
    /** Liga ou desliga o fog do mapa (depois de o mestre confirmar). Online, o servidor confirma e avisa; no modo local, é feito aqui (ligar coloca um fog novo, todo coberto; desligar o remove). */
    function aplicarLigarFog(ativo: boolean): void {
        if (rede?.ativa) return void rede.enviar({ tipo: "fog_ativar", mapa: estado.mapaId ?? "_", ativo, cobrirTudo: true });
        estado.fog = { ativo, mascara: ativo ? novaMascara(estado.colunas, estado.linhas, true) : null };
        if (!ativo && ferramentaAtual.startsWith("fog-")) escolherFerramenta("mover");
        fog.atualizar();
        painelFog.atualizar();
        sincronizarPincelComABarra();
    }
    const painelFog = criarPainelFog({
        aoAlternar: (ativo) => {
            // Ligar ou desligar o fog muda o que TODOS veem: pede confirmação (pedido do dono, 18/11/2026). Cancelando, a caixinha volta ao que era.
            const pergunta = ativo
                ? { titulo: "Ligar o fog neste mapa?", mensagem: "O mapa começa todo coberto: os jogadores só veem o que você revelar (e nem recebem as peças e os desenhos sob a névoa).", confirmar: "Ligar o fog" }
                : { titulo: "Desligar o fog neste mapa?", mensagem: "Os jogadores passam a ver o mapa, as peças e os desenhos todos.\nAo ligar de novo, o mapa volta todo coberto.", confirmar: "Desligar o fog" };
            void confirmacao.perguntar(pergunta).then((sim) => (sim ? aplicarLigarFog(ativo) : painelFog.atualizar()));
        },
        aoEscolher: (modo) => escolherFerramenta(modo === null ? "mover" : modo === "cobrir" ? "fog-cobrir" : "fog-revelar"),
        aoEscolherForma: (forma) => fog.definirForma(forma),
        aoEscolherAlinhamento: (a) => fog.definirAlinhamento(a),
        aoMudarRaio: (x, y) => fog.definirRaio(x, y),
    });
    // Ao ABRIR a barra do Fog (com o fog ligado), o pincel REVELAR já fica escolhido; ao fechá-la, volta a Mover (pedido do dono, 18/11/2026).
    const caixaDoFog = document.getElementById("fog");
    let fogEstavaAberto = false;
    const sincronizarPincelComABarra = (): void => {
        const aberto = !!caixaDoFog && !caixaDoFog.classList.contains("recolhida");
        if (aberto && estado.fog.ativo && !ferramentaAtual.startsWith("fog-")) escolherFerramenta("fog-revelar");
        if (!aberto && fogEstavaAberto && ferramentaAtual.startsWith("fog-")) escolherFerramenta("mover");
        fogEstavaAberto = aberto;
    };
    if (caixaDoFog) new MutationObserver(sincronizarPincelComABarra).observe(caixaDoFog, { attributes: true, attributeFilter: ["class"] });
    // O contorno do pincel acompanha o mouse ANTES de clicar (o mestre vê o formato e o tamanho que vai pintar).
    const pontoNoCanvas = (e: PointerEvent): { x: number; y: number } => {
        const r = app.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    app.canvas.addEventListener("pointermove", (e) => fog.pairar(pontoNoCanvas(e)));
    app.canvas.addEventListener("pointerleave", () => fog.pairar(null));
    // Enquanto o mestre configura o mapa (janela do tabuleiro: colunas, linhas, grade), a névoa some, para ele ver o mapa limpo.
    const janelaDoTabuleiro = document.getElementById("mapas-tabuleiro");
    if (janelaDoTabuleiro) new MutationObserver(() => fog.ocultar(!janelaDoTabuleiro.hidden)).observe(janelaDoTabuleiro, { attributes: true, attributeFilter: ["hidden"] });

    let emPan = false; // (a tela está sendo arrastada agora: o balão dos tokens fica quieto)
    const tokens = criarTokens(camera, grade, texturas, {
        sobreBolsa: (ponto) => {
            // Arrastando um token até a COLUNA da direita com a aba "Chat" à vista: a coluna troca sozinha para a "Bolsa" (que estava escondida), e então
            // o token já pode ser solto nela para ser guardado. (Só roda durante o arrasto de um token: é só aí que o tabuleiro chama esta função.)
            // (Com a coluna MINIMIZADA acontece o mesmo: ela reabre já na Bolsa.)
            if (lateral.aba === "chat" || lateral.minimizada) {
                const coluna = (document.getElementById("chat") as HTMLElement).getBoundingClientRect();
                if (ponto.x >= coluna.left && ponto.x <= coluna.right && ponto.y >= coluna.top && ponto.y <= coluna.bottom) {
                    lateral.escolher("bolsa");
                    lateral.minimizar(false);
                }
            }
            return bolsa.contem(ponto);
        },
        aoMudarSobreBolsa: (sobre) => bolsa.marcarAlvo(sobre),
        aoMudarBolsa: () => bolsa.atualizar(),
        aoRemoverArrastando: (token, col, row) => avisarRemocao(token.nome, () => desfazerRemocao(token.id, col, row)), // (soltar o token na bolsa também permite "Desfazer")
        aoSoltarModelo: (token, col, row) => colocarModeloNoTabuleiro(token, col, row),
        aoSemPermissao: (nome) => avisarSemPermissaoParaTirar(nome),
        aoMudarSelecao: (selecionados) => mostrarAvisoDaSelecao(selecionados),
        aoRemoverPeca: (token) => removerPeca(token),
        aoRemoverVarios: (lista) => removerVarios(lista),
        aoMostrarSobreBolsa: (token, centro, diametro, borda) => bolsa.mostrarFantasma(token, centro, diametro, borda),
        aoEsconderSobreBolsa: () => bolsa.esconderFantasma(),
        // Online: o token já mudou aqui (para o arrasto ficar fluido) e o servidor é avisado; ele confere e avisa todos.
        aoSoltarToken: (token) => {
            if (!rede?.ativa) return;
            rede.enviar(token.guardado ? { tipo: "guardar_token", id: token.id } : { tipo: "colocar_token", id: token.id, col: token.col, row: token.row });
        },
        aoIniciarArrasto: () => {
            fecharMenusDoToken();
            balao.esconder();
        },
        aoDuploClique: (token) => abrirFichaDoToken(token),
        aoClicarDireito: (token) => {
            balao.esconder(); // os botões do token ocupam o lugar do balão
            // Com VÁRIOS selecionados (e este entre eles) o botão direito age em massa, e só para REMOVER do tabuleiro.
            const escolhidos = tokens.selecionados;
            if (escolhidos.length > 1 && escolhidos.some((t) => t.id === token.id)) {
                fecharMenusDoToken();
                // O cartão de baixo continua como sempre ("Remover do tabuleiro" = a confirmação); o MENU ao lado do token oferece o que todos podem receber: dano, cura e condição em área.
                mostrarAvisoDaSelecao(escolhidos); // (o cartão já está lá desde a seleção; se a pessoa o fechou com um clique, volta)
                const ancora = tokens.ancoraNaTela(token.id);
                // Com VÁRIOS selecionados, o mestre também pode ROLAR A INICIATIVA de todos: cada um rola a SUA (a rolagem "Iniciativa" da própria ficha), separada. Só aparece se TODOS têm essa rolagem.
                const extrasDeVarios =
                    estado.mestre && escolhidos.every(temIniciativaNaFicha)
                        ? [{ texto: `Rolar iniciativa (${escolhidos.length})`, dica: "Cada token selecionado rola a iniciativa da própria ficha e entra na ordem de combate", aoClicar: () => escolhidos.forEach((t, i) => window.setTimeout(() => adicionarTokenNaIniciativa(t.id), i * 80)) }]
                        : [];
                if (ancora && escolhidos.length <= MAX_TOKENS_ACAO_EM_GRUPO) menuGrupo.abrir(ancora.x + ancora.largura + 8, ancora.y, escolhidos, extrasDeVarios);
                return;
            }
            menu.abrir(token.id); // (a engrenagem de configuração, em cima do token)
            const ancora = tokens.ancoraNaTela(token.id);
            if (ancora) menuGrupo.abrir(ancora.x, ancora.y + ancora.largura + 12, [token], extrasDoPainel(token)); // o PAINEL de ações, embaixo do token
        },
        aoPassarMouse: (token) => {
            if (!emPan) balao.mostrar(token.id); // (durante o arrasto da tela os tokens passam sob o cursor: sem balão, para o arrasto ficar leve)
        },
        // Ao sair do token o balão NÃO some na hora: dá tempo de o mouse chegar até ele.
        aoSairMouse: () => balao.agendarEsconder(),
    });

    // Criada depois dos tokens: o retângulo de medição fica desenhado por cima de tudo.
    const calibragem = criarCalibragem(app, camera, {
        casas: () => painelCalibragem.casas(),
        aoMedir: (colunas, linhas) => painelCalibragem.mostrarMedida(colunas, linhas),
        aoCancelar: () => painelCalibragem.reiniciarTexto(),
        aoAplicar: (colunas, linhas) => {
            mudarTamanho(colunas, linhas); // limita a MIN/MAX_CASAS
            ligarCalibragem(false); // ao SOLTAR já vale: a calibragem se conclui sozinha (a grade volta na hora; para refazer, ligue "Alinhar mapa" de novo)
        },
    });

    // PINGS e RÉGUAS DOS OUTROS (compartilhados pelo servidor com quem está na mesma cena). Ficam por cima de tudo (inclusive dos tokens).
    const pings = criarPings(app, camera);
    const reguasDosOutros = criarReguasDosOutros(camera);

    // A SUA régua também vai aos outros: no máximo a cada MS_ENVIO_REGUA (com o estado mais novo no fim) e só quando mudou; "sumiu" (null) vai na hora.
    let reguaPendente: { col: number; row: number }[] | null = null;
    let reguaUltimoEnvio = JSON.stringify([null, COR_INICIAL_DESENHO]);
    let reguaEnviadaEm = 0;
    let reguaTemporizador = 0;
    function enviarReguaAgora(): void {
        const json = JSON.stringify([reguaPendente, corDoDesenho]);
        if (json === reguaUltimoEnvio) return;
        reguaUltimoEnvio = json;
        reguaEnviadaEm = performance.now();
        if (rede?.ativa) rede.enviar({ tipo: "regua", caminho: reguaPendente, cor: corDoDesenho });
    }
    function compartilharRegua(vertices: { col: number; row: number }[] | null): void {
        reguaPendente = vertices ? vertices.map(({ col, row }) => ({ col, row })) : null;
        if (reguaPendente === null) {
            window.clearTimeout(reguaTemporizador);
            reguaTemporizador = 0;
            enviarReguaAgora();
            return;
        }
        if (reguaTemporizador) return; // (já há um envio marcado: ele leva o estado mais novo)
        reguaTemporizador = window.setTimeout(() => {
            reguaTemporizador = 0;
            enviarReguaAgora();
        }, Math.max(0, reguaEnviadaEm + MS_ENVIO_REGUA - performance.now()));
    }
    const regua = criarRegua(camera, { aoMudarCaminho: compartilharRegua });
    regua.definirCor(corDoDesenho);
    aplicarCorNaRegua = (cor) => regua.definirCor(cor);

    // LIMITE de pings: o mesmo "balde que enche aos poucos" do servidor (até RAJADA_PINGS de uma vez, depois 1 a cada MS_RECARGA_PING = 5 por segundo); aqui só para AVISAR a pessoa (o servidor é quem manda).
    const baldeDePings = novoBalde(RAJADA_PINGS);

    /** Faz um ping no ponto (col, row) (em casas, com fração): online o SERVIDOR repassa a quem está na cena (e o seu volta por ele); no modo local, só você vê. */
    function pingar(col: number, row: number, forma: FormaDePing): void {
        if (!gastar(baldeDePings, RAJADA_PINGS, MS_RECARGA_PING)) return void aviso.mostrar("Calma! Você está pingando rápido demais.", { duracaoMs: TEMPO_AVISO_MAPA_MS });
        if (rede?.ativa) rede.enviar({ tipo: "ping", col, row, forma, cor: corDoDesenho });
        else pings.mostrar(col, row, forma, corDoDesenho, "Você");
    }

    // O MENU do botão direito no vazio do mapa: Ping, Régua, Borracha e, só para o mestre, os pincéis do fog.
    const rodaPing = criarRodaPing();
    let origemDoPing: { col: number; row: number } | null = null; // (o ponto do mapa onde o Shift + botão foi apertado)
    const menuMapa = criarMenuMapa({
        aoPingar: (col, row, forma) => pingar(col, row, forma),
        aoEscolher: (ferramenta) => escolherFerramenta(ferramenta),
        fogAtivo: () => estado.fog.ativo,
    });

    ativarInteracao(app, camera, tokens, [calibragem, desenho, regua, fog], {
        aoClicarNoFundo: () => fecharMenusDoToken(),
        aoIniciarPan: () => {
            emPan = true;
            fecharMenusDoToken();
            balao.esconder();
        },
        aoTerminarPan: () => {
            emPan = false;
        },
        // SHIFT + clique = ping comum; SHIFT + arrastar abre a roda de pings. O ponto do ping é onde o botão foi APERTADO (mesmo que a câmera ande depois).
        aoComecarPing: (ponto) => {
            fecharMenusDoToken();
            balao.esconder();
            menuMapa.fechar();
            const caixa = app.canvas.getBoundingClientRect();
            const mundo = camera.telaParaMundo(ponto);
            origemDoPing = { col: mundo.x / TAMANHO_CASA, row: mundo.y / TAMANHO_CASA };
            rodaPing.comecar(ponto.x + caixa.left, ponto.y + caixa.top);
        },
        aoMoverPing: (ponto) => {
            const caixa = app.canvas.getBoundingClientRect();
            rodaPing.apontar(ponto.x + caixa.left, ponto.y + caixa.top);
        },
        aoTerminarPing: (ponto) => {
            const caixa = app.canvas.getBoundingClientRect();
            const forma = rodaPing.terminar(ponto.x + caixa.left, ponto.y + caixa.top);
            if (forma && origemDoPing) pingar(origemDoPing.col, origemDoPing.row, forma);
            origemDoPing = null;
        },
        aoClicarDireitoNoVazio: (ponto) => {
            fecharMenusDoToken();
            balao.esconder();
            const mundo = camera.telaParaMundo(ponto);
            const caixa = app.canvas.getBoundingClientRect();
            menuMapa.abrir(ponto.x + caixa.left, ponto.y + caixa.top, mundo.x / TAMANHO_CASA, mundo.y / TAMANHO_CASA);
        },
    });

    // --- Reações a mudanças ---

    // Zoom mudou: refaz a grade (espessura da linha), fecha o menu e o balão (ficariam
    // fora de lugar) e atualiza os números da barra.
    camera.aoMudarZoom = () => {
        grade.desenhar();
        regua.redesenhar(); // o tamanho do texto e da linha, na tela, depende do zoom
        reguasDosOutros.redesenhar();
        menuMapa.fechar();
        fecharMenusDoToken();
        balao.esconder();
        barra.atualizar();
    };

    // Janela redimensionada: só reajusta aos limites (não volta ao centro, para
    // não desfazer o pan do usuário).
    app.renderer.on("resize", () => {
        camera.limitar();
        fecharMenusDoToken();
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
        fecharMenusDoToken();
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
        if (rede?.ativa) return enviarMapaAoServidor(arquivo); // online o mapa é de TODOS: a imagem vai para a biblioteca do servidor (só o mestre envia)
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
        avisarSeMapaFoiReduzido(); // (por último: o aviso da redução não pode ser coberto pelo da previsão de colunas e linhas)
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
        fecharMenusDoToken();
        balao.esconder();
        desenho.definirFerramenta(DE_DESENHO.includes(nome) ? (nome as FerramentaDesenho) : null);
        regua.definirAtiva(nome === "regua");
        fog.definirModo(nome === "fog-cobrir" ? "cobrir" : nome === "fog-revelar" ? "revelar" : null);
        painelFog.marcar(nome === "fog-cobrir" ? "cobrir" : nome === "fog-revelar" ? "revelar" : null);
        tokens.definirInterativo(nome === "mover"); // desenhando ou medindo, o arrasto não deve pegar tokens
        app.stage.cursor = nome === "mover" ? "default" : "crosshair";
        painelDesenho.marcar(nome);
    }

    /** Liga/desliga a calibragem: o painel, o botão, o cursor e o mouse dos tokens acompanham. */
    function ligarCalibragem(ligada: boolean): void {
        if (ligada && ferramentaAtual !== "mover") escolherFerramenta("mover"); // uma ferramenta de cada vez
        fecharMenusDoToken();
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
        if (rede?.ativa) {
            rede.enviar({ tipo: "alternar_condicao", id, condicao: condicaoId }); // online o SERVIDOR muda, grava e avisa todos ("condicoes_atualizadas")
            return;
        }
        const token = alternarCondicao(id, condicaoId); // 1) estado (null = token/condição inexistente)
        if (!token) return;
        tokens.redesenhar(token); // 2) desenho: o anel de ícones é refeito
        menu.atualizar(); // o painel marca/desmarca a condição
        painelIniciativa.atualizar(); // (a iniciativa mostra as condições de cada token)
    }

    // Ao abrir, ajusta o zoom para o tabuleiro inteiro caber na janela (em telas
    // grandes continua em 100%). Sem isso, em janelas menores os tokens das pontas
    // ficavam fora da tela e pareciam ter sumido.
    camera.ajustar();
    // Reabrindo o site: a visão guardada do mapa atual volta (online, o mapa só é conhecido depois: quem restaura é a troca de mapa).
    restaurarVisaoDoMapa(estado.mapaId);
    guardarVisaoLigado = true;

    // O mapa carrega por último: o tabuleiro já aparece e a imagem entra quando chegar.
    // Online, o mapa é o do SERVIDOR (ele manda no `estado_inicial`): não se carrega o mapa de fábrica antes, senão ele aparece e logo é trocado (a página "piscava").
    if (new URLSearchParams(location.search).has("online")) definirMapa(null);
    await mapa.carregar();

    criarRedimensionadorDaColuna(); // a alça de tamanho da coluna da direita (chat e bolsa)

    // CTRL+Z e CTRL+Y (ou Ctrl+Shift+Z): desfazem e refazem as ações de DESENHO desta pessoa. Não valem dentro de um campo de texto (lá o Ctrl+Z é do texto).
    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const tecla = e.key.toLowerCase();
        if (tecla !== "z" && tecla !== "y") return;
        const alvo = e.target as HTMLElement | null;
        if (alvo?.closest("input, textarea, select, [contenteditable=true]")) return;
        e.preventDefault();
        if (tecla === "y" || e.shiftKey) refazerDesenho();
        else desfazerDesenho();
    });

    // ATALHOS de uma tecla só (a lista completa está em docs/atalhos.md): R liga e desliga a régua; Q abre e fecha a bolsa em tela cheia.
    criarAtalhos({
        aoAlternarRegua: () => escolherFerramenta(ferramentaAtual === "regua" ? "mover" : "regua"),
        aoAlternarBolsa: () => (bolsa.expandida ? bolsa.fechar() : bolsa.abrir()),
    });

    // SELEÇÃO por teclado: Delete remove os tokens selecionados (sem confirmar; o aviso oferece "Desfazer") e Esc tira a seleção. Só vale com o foco no tabuleiro (não digitando num campo,
    // nem dentro de uma janela de ficha, da bolsa...).
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Delete" && e.key !== "Escape") return;
        const foco = document.activeElement;
        if (foco && foco !== document.body && foco !== app.canvas) return;
        const escolhidos = tokens.selecionados;
        if (escolhidos.length === 0) return;
        if (e.key === "Delete") removerVarios(escolhidos);
        tokens.limparSelecao();
    });

    // --- Modo online (protótipo): só liga com ?online no endereço, ex.: /?online&nome=Ana ---
    const parametros = new URLSearchParams(location.search);
    // O PAPEL: online, vem do servidor (começa como jogador até ele dizer); sem servidor (modo local), `?papel=jogador` SIMULA o jogador (esconde o que é só do mestre); sem o parâmetro vale o mestre.
    estado.mestre = !parametros.has("online") && parametros.get("papel") !== "jogador";
    document.body.classList.toggle("jogador", !estado.mestre);
    if (parametros.has("online")) {
        const status = criarStatusRede();
        /** Um evento do servidor: aplica no ESTADO (as mesmas funções de estado.ts) e atualiza o desenho. */
        const aplicarEventoDoServidor = (evento: EventoDoServidor): void => {
            switch (evento.tipo) {
                case "condicoes_atualizadas": {
                    const alvo = buscarToken(evento.id);
                    if (alvo) {
                        alvo.condicoes = [...evento.condicoes];
                        tokens.redesenhar(alvo); // os ícones (e o X do Morto) são refeitos
                        menu.atualizar();
                        painelIniciativa.atualizar(); // (a iniciativa mostra as condições de cada token)
                    }
                    return;
                }
                case "valores_atualizados": {
                    const alvo = buscarToken(evento.id);
                    if (alvo) {
                        alvo.valores = evento.valores.map((v) => ({ ...v })); // o valor novo (uma ação foi aplicada)
                        tokens.redesenhar(alvo, evento.efeito ?? true); // (pisca: dano ou cura; com `efeito` o servidor diz qual, mesmo se esta pessoa não vê o valor)
                    }
                    return;
                }
                case "iniciativa_definida":
                    definirIniciativa(evento.iniciativa); // a ordem de combate do SERVIDOR vale
                    iniciativaMudou();
                    return;
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
                case "ping":
                    pings.mostrar(evento.col, evento.row, evento.forma, evento.cor, evento.apelido);
                    return;
                case "regua":
                    reguasDosOutros.atualizar(evento.usuario, evento.apelido, evento.caminho, evento.cor);
                    return;
                case "estado_inicial": {
                    pings.limpar();
                    reguasDosOutros.limpar();
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
                    fecharMenusDoToken();
                    balao.esconder();
                    definirMensagens(evento.mensagens);
                    definirGrupos(evento.grupos); // os grupos (de tokens e fichas) gravados no servidor
                    carregarAcoesDaMesa(evento.acoes); // as ações (Dano, Cura...) também são da mesa
                    carregarStatusDaMesa(evento.status); // os status (barras) são da mesa (depois dos grupos: eles citam grupos); os tokens já trazem a cópia e os valores do servidor
                    definirFichas(evento.fichas); // as fichas gravadas no servidor
                    definirIniciativa(evento.iniciativa); // a ordem de combate gravada no servidor
                    iniciativaMudou();
                    definirTodosOsValoresDasFichas(evento.valores); // os valores atuais das variáveis que mudam (depois das fichas: só valem para as que existem)
                    // (se há fichas abertas no editor, ele confere se elas mudaram enquanto a conexão estava fora)
                    for (const id of editorFicha.idsAbertos) {
                        const aberta = estado.fichas.find((f) => f.id === id);
                        if (aberta) editorFicha.fichaMudou(aberta);
                    }
                    editorFicha.restaurarFixadas((id) => estado.fichas.find((f) => f.id === id)); // (reabre as fichas que estavam FIXADAS da última vez; só age na primeira vez)
                    chat.atualizar();
                    bolsa.statusMudaram(); // (o editor de status da bolsa mostra os da mesa)
                    bolsa.atualizarGrupos(); // (refaz os chips e as duas listas)
                    status.mostrarEntrada(evento.voce.apelido);
                    // O MAPA também é do servidor: a biblioteca, qual é o atual e se esta conexão é a do mestre.
                    estado.mestre = evento.mestre;
                    meuUsuario = evento.voce.usuario ?? null;
                    definirDesenhos(evento.desenhos); // os desenhos do mapa atual, do servidor
                    limparHistoricoDeDesenho();
                    aposMudarDesenhos();
                    jogadores.definirPermissoes(evento.permissoes);
                    aplicarPapel();
                    barra.aplicarGradeDaMesa(definirGradeDaMesa(evento.grade)); // a espessura e a cor da grade também são da mesa (depois do `mestre`: os controles dependem dele)
                    definirPastas(evento.pastas ?? []); // (as PASTAS da bolsa que esta pessoa vê)
                    definirBiblioteca(evento.mapas);
                    void trocarMapa(evento.mapa); // (baixa a imagem e só então a põe; até lá o mapa de antes continua à vista)
                    mostrarSemPermissao(evento.semPermissao === true);
                    return;
                }
                case "mapa_definido": {
                    pings.limpar(); // (os pings e as réguas dos outros eram do mapa de antes)
                    reguasDosOutros.limpar();
                    const depois = depoisDoMapa; // (só quem pediu a troca)
                    depoisDoMapa = null;
                    mostrarSemPermissao(evento.semPermissao === true);
                    if (evento.grade) barra.aplicarGradeDaMesa(definirGradeDaMesa(evento.grade)); // (cada mapa tem a sua grade: espessura e cor)
                    void trocarMapa(evento.mapa, evento.colunas, evento.linhas, depois);
                    return;
                }
                case "mapas_definidos": {
                    definirBiblioteca(evento.mapas);
                    bolsaMapas.atualizar(true);
                    return;
                }
                case "grade_definida":
                    barra.aplicarGradeDaMesa(definirGradeDaMesa(evento.grade));
                    return;
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
                case "fog_definido": {
                    // O fog do mapa em que estou (a máscara inteira): liga a camada ou a desliga.
                    const mascara = evento.ativo ? mascaraDoTexto(evento.colunas ?? 0, evento.linhas ?? 0, evento.bits) : null;
                    estado.fog = { ativo: evento.ativo && mascara !== null, mascara };
                    if (!estado.fog.ativo && ferramentaAtual.startsWith("fog-")) escolherFerramenta("mover");
                    fog.atualizar();
                    painelFog.atualizar();
                    sincronizarPincelComABarra(); // (o fog acabou de ser ligado com a barra aberta: já escolhe o Revelar)
                    return;
                }
                case "fog_pintado":
                    fog.aplicarTracos(evento.tracos);
                    return;
                case "pasta_definida":
                    receberPasta(evento.pasta);
                    atualizarListasDaBolsa();
                    return;
                case "pasta_excluida":
                    estado.pastas = estado.pastas.filter((p) => p.id !== evento.id);
                    atualizarListasDaBolsa();
                    return;
                case "grupo_editado":
                    receberGrupo(evento.grupo);
                    bolsa.atualizarGrupos();
                    return;
                case "grupo_excluido":
                    excluirGrupo(evento.id); // tira o grupo e a marca dele de todos os tokens, fichas e status (o servidor faz o mesmo nos arquivos e manda "status_definidos" se algum status o citava)
                    bolsa.atualizarGrupos();
                    return;
                case "desenho_criado": {
                    // Um desenho novo: o MEU (a `ref` bate com um pendente) troca o id temporário pelo de verdade; o dos outros entra como está.
                    const ref = evento.ref;
                    const temporario = ref !== undefined ? desenhosPendentes.get(ref) : undefined;
                    if (ref !== undefined && temporario !== undefined) {
                        desenhosPendentes.delete(ref);
                        if (refsDescartados.delete(ref)) {
                            rede?.enviar({ tipo: "apagar_desenhos", ids: [evento.desenho.id] }); // (eu o apaguei antes de o servidor responder)
                            return;
                        }
                        const i = estado.desenhos.findIndex((d) => d.id === temporario);
                        if (i >= 0) estado.desenhos[i] = evento.desenho;
                        else receberDesenho(evento.desenho);
                        trocarIdTemporario(temporario, evento.desenho.id);
                    } else {
                        receberDesenho(evento.desenho);
                    }
                    aposMudarDesenhos();
                    return;
                }
                case "desenhos_apagados":
                    removerDesenhos(evento.ids);
                    aposMudarDesenhos();
                    return;
                case "desenhos_definidos":
                    // O mestre trocou de mapa: aparecem os desenhos do mapa novo (e o histórico de desfazer de antes não vale mais).
                    definirDesenhos(evento.desenhos);
                    limparHistoricoDeDesenho();
                    aposMudarDesenhos();
                    return;
                case "jogadores":
                    listaDeJogadores = evento.lista;
                    if (estado.mestre) bolsaMapas.atualizar(true); // ("jogadores aqui" em cada mapa)
                    status.mostrarJogadores(evento.lista);
                    jogadores.definirConectados(evento.lista, meuUsuario);
                    return;
                case "permissoes":
                    jogadores.definirPermissoes(evento.permissoes); // (só os mestres a recebem)
                    return;
                case "papel":
                    estado.mestre = evento.mestre; // foi promovido ou rebaixado
                    aplicarPapel();
                    aviso.mostrar(evento.mestre ? "Você agora é mestre." : "Você deixou de ser mestre.", { duracaoMs: TEMPO_AVISO_MAPA_MS });
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
                    ligacoesMudaram();
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
                    document.body.classList.add("mesa-pronta"); // (sem servidor não há estado a esperar: mostra a tela, com o aviso de "sem conexão")
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
            editorFicha.restaurarFixadas((id) => estado.fichas.find((f) => f.id === id)); // (modo local: as fichas de exemplo nascem sempre com os mesmos números, então as fixadas voltam também)
        });
    }

    // O app terminou de montar a interface: o painel de Desenho e o de Dados (cujo conteúdo é criado por aqui) deixam de ficar escondidos.
    aplicarSeletoresDeCor(); // todos os seletores de cor do site ganham a mesma cara (a caixa com o quadrado de cor, o matiz e o código)
    document.body.classList.add("app-pronta");
    // Local: a mesa já está pronta (não há servidor a esperar), e a interface aparece de uma vez. Online: espera o `estado_inicial` (ver `aplicarEventoDoServidor`).
    if (!new URLSearchParams(location.search).has("online")) document.body.classList.add("mesa-pronta");

    // SÓ no modo de desenvolvimento (npm run dev; some na versão final): deixa os testes automáticos
    // (tests/e2e) saberem quando a página está pronta e lerem o estado e a câmera direto, em vez de
    // esperar tempos fixos e medir pixels. Não é usado pelo site.
    if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__tabuleirinho = {
            pronto: true,
            distanciaDaRegua: () => regua.texto, // (só para os testes: o texto da medida da régua; ela não aparece mais no painel Desenho)
            atrasoRolagemMs: ATRASO_ROLAGEM_MS, // (os testes zeram: tests/e2e/ajuda.mjs `abrirPagina`)
            // Só para os testes: adiciona à mesa os tokens que o TESTE mandar (o app não tem nenhum token pronto: eles vêm dos
            // arquivos de dados/tokens/ do servidor, ou nascem pela bolsa). Os dados dos tokens de teste ficam em tests/e2e/ajuda.mjs.
            // Só para os testes: muda o tamanho do tabuleiro SEM passar pela rede (o app abre em 25 × 22; a maioria dos testes foi escrita para 18 × 10).
            definirTamanho: (colunas: number, linhas: number) => mudarTamanho(colunas, linhas),
            semear: (lista: Omit<Token, "condicoes" | "favorito" | "grupos" | "ficha" | "status" | "valores" | "copiaDe">[]) => {
                for (const dados of lista) tokens.adicionar(receberToken({ ...dados, condicoes: [], favorito: false, grupos: [], ficha: null, status: statusPadrao(), valores: [], copiaDe: null, mapa: null }));
                bolsa.atualizar();
            },
            estado,
            camera,
            tokens, // (a camada de desenho dos tokens: os testes provocam as animações de vida por ela)
            selecionados: () => tokens.selecionados.map((t) => t.id), // (os ids dos tokens selecionados no tabuleiro)
            get rede() {
                return rede;
            },
        };
    }
}

iniciar();
