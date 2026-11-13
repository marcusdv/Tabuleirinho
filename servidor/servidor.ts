// =====================================================================
// SERVIDOR do Tabuleirinho (PROTÓTIPO). Rodar: `npm run servidor`.
//
// O que ele faz:
//   1) ENTREGA O SITE: serve a pasta `dist/` (o resultado de `npm run build`). No desenvolvimento, quem entrega o
//      site é o Vite (porta 5173), que repassa o endereço /ws para cá.
//   2) FALA COM OS NAVEGADORES por WEBSOCKET (/ws): uma conexão que fica aberta nos dois sentidos.
//   3) É O DONO DO ESTADO DA MESA: os navegadores só PEDEM mudanças; o servidor valida, aplica (com as MESMAS funções
//      de src/estado.ts que o navegador usa) e AVISA todo mundo (ver src/protocolo.ts).
//
// Neste protótipo só estas coisas passam pelo servidor: os TOKENS (criar, editar, excluir, soltar no mapa ou na bolsa), o chat, os
// dados e CRIAR FICHAS. Tokens e fichas são GRAVADOS: um arquivo JSON por item na pasta `dados/` (ver servidor/dados.ts); o resto
// (chat, tamanho do tabuleiro) vive na memória e some ao reiniciar. Sem login, sem permissões (qualquer um mexe em tudo), uma mesa só.
//
// SEGURANÇA (regras no BRAINSTORM.md): tudo que chega é dado NÃO confiável. Aqui: a forma do pedido é conferida
// (`lerPedido`), o sentido é conferido pelas regras compartilhadas (`posicaoValida`, `rolagemValida`, o limite do
// chat...), o sorteio é do servidor (`crypto.randomInt`), há limite de frequência e de tamanho, a origem da conexão é
// conferida, e os arquivos do site só saem da pasta `dist/` (nada de `../`). Nunca se usa `eval`.
// =====================================================================

import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
    MAX_CARACTERES_TEXTO_FICHA,
    MAX_FICHAS,
    MAX_MENSAGENS_POR_SEGUNDO,
    MAX_TOKENS,
    MS_ESPERA_GRAVACAO_TOKEN,
    PORTA_SERVIDOR,
    SEGUNDOS_PARA_ENTRAR,
    TAMANHO_MAX_ARQUIVO_FICHA,
    TAMANHO_MAX_ARQUIVO_TOKEN,
    TAMANHO_MAX_MENSAGEM_REDE,
} from "../src/config.ts";
import { rolarDados } from "../src/dados.ts";
import {
    adicionarMensagem,
    adicionarRolagem,
    adicionarRolagemDeFicha,
    buscarToken,
    colocarToken,
    definirFichas,
    definirTokens,
    editarToken,
    estado,
    excluirFicha,
    excluirToken,
    fichaValida,
    guardarToken,
    montarEdicaoDaFicha,
    montarFicha,
    montarToken,
    posicaoValida,
    receberFicha,
    receberToken,
    rolagemValida,
    tokenValido,
    type Ficha,
} from "../src/estado.ts";
import { analisarFicha, rolarDaAnalise, type AnaliseDaFicha } from "../src/formulas.ts";
import { lerPedido, limparApelido, type EventoDoServidor, type Jogador, type PedidoDoCliente } from "../src/protocolo.ts";
import { apagarDaPasta, carregarPasta, gravarNaPasta, PASTA_DE_DADOS } from "./dados.ts";

// A pasta do site: `dist/` (o resultado de `npm run build`). Dá para trocar com a variável SITE (ex.: SITE=/outra/pasta npm run servidor).
const PASTA_DO_SITE = resolve(process.env.SITE ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist"));

// ---------------------------------------------------------------------
// 1) O SITE (arquivos estáticos de dist/)
// ---------------------------------------------------------------------

const TIPOS_DE_ARQUIVO: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function responder(resposta: ServerResponse, status: number, texto: string): void {
    resposta.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    resposta.end(texto);
}

async function servirSite(requisicao: IncomingMessage, resposta: ServerResponse): Promise<void> {
    if (requisicao.method !== "GET" && requisicao.method !== "HEAD") return responder(resposta, 405, "Método não permitido.");
    let caminho: string;
    try {
        caminho = decodeURIComponent(new URL(requisicao.url ?? "/", "http://local").pathname);
    } catch {
        return responder(resposta, 400, "Endereço inválido.");
    }
    const alvo = resolve(PASTA_DO_SITE, caminho === "/" ? "index.html" : caminho.slice(1));
    // SEGURANÇA: o arquivo precisa estar DENTRO de dist/ ("../../" e caminhos absolutos são recusados).
    if (alvo !== PASTA_DO_SITE && !alvo.startsWith(PASTA_DO_SITE + sep)) return responder(resposta, 403, "Proibido.");
    try {
        const conteudo = await readFile(alvo);
        resposta.writeHead(200, {
            "content-type": TIPOS_DE_ARQUIVO[extname(alvo).toLowerCase()] ?? "application/octet-stream",
            "x-content-type-options": "nosniff",
        });
        resposta.end(requisicao.method === "HEAD" ? undefined : conteudo);
    } catch {
        responder(resposta, 404, "Não encontrado. (Rode `npm run build` para gerar o site, ou abra o endereço do Vite, porta 5173.)");
    }
}

// ---------------------------------------------------------------------
// 2) AS CONEXÕES
// ---------------------------------------------------------------------

/** Uma conexão aberta. `jogador` é null até a pessoa se apresentar (pedido "entrar"). */
interface Conexao {
    id: number;
    ws: WebSocket;
    jogador: Jogador | null;
    inicioDaJanela: number; // para o limite de mensagens por segundo
    mensagensNaJanela: number;
}

const conexoes = new Set<Conexao>();
let proximoIdDeConexao = 1;

const listaDeJogadores = (): Jogador[] => [...conexoes].flatMap((c) => (c.jogador ? [c.jogador] : []));

function enviar(ws: WebSocket, evento: EventoDoServidor): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(evento));
}

/** Manda o evento a TODOS que já se apresentaram (inclusive quem fez o pedido: assim todos veem a mesma coisa). */
function avisarTodos(evento: EventoDoServidor): void {
    const texto = JSON.stringify(evento);
    for (const c of conexoes) if (c.jogador && c.ws.readyState === WebSocket.OPEN) c.ws.send(texto);
}

const erro = (ws: WebSocket, motivo: string): void => enviar(ws, { tipo: "erro", motivo });

/** Sorteio do SERVIDOR: `crypto.randomInt` é imprevisível e sem viés (o Math.random do navegador permitiria trapacear). */
// (randomInt só aceita faixas MENORES que 2**48, por isso 2**47: dá 47 bits de precisão, de sobra para um d1000.)
const sortear = (): number => randomInt(0, 2 ** 47) / 2 ** 47;

/** Limite de frequência por conexão: o excesso é ignorado, e quem insiste muito é desconectado. */
function dentroDoLimite(c: Conexao): boolean {
    const agora = Date.now();
    if (agora - c.inicioDaJanela >= 1000) {
        c.inicioDaJanela = agora;
        c.mensagensNaJanela = 0;
    }
    c.mensagensNaJanela++;
    if (c.mensagensNaJanela > MAX_MENSAGENS_POR_SEGUNDO * 3) c.ws.close(1008, "Mensagens demais.");
    return c.mensagensNaJanela <= MAX_MENSAGENS_POR_SEGUNDO;
}

// ---------------------------------------------------------------------
// 3) OS PEDIDOS: validar, aplicar no estado e avisar todos
// ---------------------------------------------------------------------

// Gravar e apagar arquivos envolve ESPERAR o disco. Para dois pedidos seguidos não se atropelarem (e os limites valerem), todas as
// operações de arquivo entram numa FILA e são feitas uma de cada vez, na ordem em que chegaram.
let filaDeArquivos: Promise<void> = Promise.resolve();
function naFilaDeArquivos(tarefa: () => Promise<void>): void {
    filaDeArquivos = filaDeArquivos.then(tarefa).catch((falha: unknown) => console.error("Erro ao gravar/apagar um arquivo:", falha));
}

/**
 * Cria a ficha VAZIA e o seu ARQUIVO NA HORA (não espera ninguém escrever nada: o texto vem depois, pelo editor), e só então a
 * guarda na mesa e avisa todos: o que todos veem já está no disco.
 */
async function criarFichaNoServidor(c: Conexao): Promise<void> {
    const ficha = montarFicha();
    if (!ficha) return erro(c.ws, `Não foi possível criar a ficha: o limite é de ${MAX_FICHAS} fichas na mesa.`);
    try {
        await gravarNaPasta("fichas", ficha);
    } catch (falha) {
        console.error(`Não foi possível gravar a ficha ${ficha.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar a ficha no servidor."); // sem detalhes internos para quem pediu
    }
    receberFicha(ficha);
    avisarTodos({ tipo: "ficha_criada", ficha });
}

/**
 * Edita nome e/ou texto de uma ficha. A checagem de VERSÃO decide: se a ficha já está numa versão mais nova do que a que a pessoa
 * tinha na tela, o servidor NÃO grava e devolve só a ela a versão atual (`ficha_conflito`). Senão grava o arquivo (a versão sobe) e só
 * então guarda na mesa e avisa todos. Roda na fila de arquivos: dois salvamentos seguidos nunca se misturam.
 */
async function editarFichaNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "editar_ficha" }>): Promise<void> {
    const resultado = montarEdicaoDaFicha(pedido.id, pedido.versao, { nome: pedido.nome, texto: pedido.texto });
    if (!resultado.ok) {
        if (resultado.erro === "versao_antiga") {
            const atual = estado.fichas.find((f) => f.id === pedido.id);
            if (atual) enviar(c.ws, { tipo: "ficha_conflito", ficha: atual });
            return;
        }
        return erro(c.ws, resultado.erro === "nao_existe" ? "Essa ficha não existe." : `O texto da ficha passa de ${MAX_CARACTERES_TEXTO_FICHA} caracteres.`);
    }
    if (resultado.mudou) {
        try {
            await gravarNaPasta("fichas", resultado.ficha);
        } catch (falha) {
            console.error(`Não foi possível gravar a ficha ${resultado.ficha.id}:`, falha);
            return erro(c.ws, "Não foi possível gravar a ficha no servidor."); // a ficha na mesa continua como estava
        }
        receberFicha(resultado.ficha);
    }
    avisarTodos({ tipo: "ficha_editada", ficha: resultado.ficha });
}

/**
 * Exclui a ficha: apaga o ARQUIVO primeiro e só então a tira da mesa e avisa todos (assim nunca sobra uma ficha sem arquivo, nem um
 * arquivo de uma ficha que sumiu). Roda na MESMA fila dos salvamentos: um salvamento que ainda estava gravando termina antes, e um
 * pedido de salvar que chega depois cai em "essa ficha não existe". O id não é reaproveitado.
 */
async function excluirFichaNoServidor(c: Conexao, id: number): Promise<void> {
    if (!estado.fichas.some((f) => f.id === id)) return erro(c.ws, "Essa ficha não existe.");
    try {
        await apagarDaPasta("fichas", id);
    } catch (falha) {
        console.error(`Não foi possível apagar a ficha ${id}:`, falha);
        return erro(c.ws, "Não foi possível apagar o arquivo da ficha no servidor."); // a ficha continua na mesa
    }
    excluirFicha(id);
    analisesDasFichas.delete(id);
    avisarTodos({ tipo: "ficha_excluida", id });
}

// A análise do texto de uma ficha (variáveis e rolagens) custa um pouco, e a mesma ficha é rolada muitas vezes: guardamos a análise por
// ficha e só a refazemos quando a VERSÃO muda (o servidor é quem manda na versão, então nunca fica velha).
const analisesDasFichas = new Map<number, { versao: number; analise: AnaliseDaFicha }>();
function analiseDaFicha(ficha: Ficha): AnaliseDaFicha {
    const guardada = analisesDasFichas.get(ficha.id);
    if (guardada?.versao === ficha.versao) return guardada.analise;
    const analise = analisarFicha(ficha.texto);
    analisesDasFichas.set(ficha.id, { versao: ficha.versao, analise });
    return analise;
}

/** Igual às fichas: monta o token (valida), GRAVA o arquivo e só então o guarda na mesa e avisa todos. Nasce guardado na bolsa. */
async function criarTokenNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "criar_token" }>): Promise<void> {
    const token = montarToken(pedido.cor, pedido.tamanho, pedido.nome, pedido.imagem, pedido.corBorda);
    if (!token) return erro(c.ws, `Não foi possível criar o token: o limite é de ${MAX_TOKENS} tokens na mesa.`);
    try {
        await gravarNaPasta("tokens", token);
    } catch (falha) {
        console.error(`Não foi possível gravar o token ${token.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar o token no servidor.");
    }
    receberToken(token);
    avisarTodos({ tipo: "token_criado", token });
}

// A POSIÇÃO de um token muda a toda hora (cada vez que alguém o solta). Em vez de gravar a cada movimento, marcamos o token como
// "sujo" e gravamos o estado ATUAL dele um instante depois (MS_ESPERA_GRAVACAO_TOKEN): vários movimentos seguidos viram uma gravação só.
const tokensSujos = new Set<number>();
let gravacaoAgendada: ReturnType<typeof setTimeout> | null = null;

function gravarTokensSujos(): void {
    gravacaoAgendada = null;
    const ids = [...tokensSujos];
    tokensSujos.clear();
    for (const id of ids) {
        naFilaDeArquivos(async () => {
            const token = buscarToken(id); // o estado de AGORA (se foi excluído nesse meio tempo, não há o que gravar)
            if (token) await gravarNaPasta("tokens", token);
        });
    }
}

function agendarGravacaoDoToken(id: number): void {
    tokensSujos.add(id);
    gravacaoAgendada ??= setTimeout(gravarTokensSujos, MS_ESPERA_GRAVACAO_TOKEN);
}

function tratar(c: Conexao, pedido: PedidoDoCliente): void {
    // Antes de tudo a pessoa precisa se apresentar.
    if (pedido.tipo === "entrar") {
        if (c.jogador) return erro(c.ws, "Você já entrou.");
        c.jogador = { id: c.id, apelido: limparApelido(pedido.apelido, c.id) };
        // Quem entra recebe o estado COMPLETO uma vez; depois só os eventos.
        enviar(c.ws, { tipo: "estado_inicial", voce: c.jogador, colunas: estado.colunas, linhas: estado.linhas, tokens: estado.tokens, mensagens: estado.mensagens, fichas: estado.fichas });
        avisarTodos({ tipo: "jogadores", lista: listaDeJogadores() });
        console.log(`+ ${c.jogador.apelido} entrou (${listaDeJogadores().length} na mesa)`);
        return;
    }
    if (!c.jogador) return erro(c.ws, "Apresente-se primeiro (entrar).");
    const autor = c.jogador.apelido;

    switch (pedido.tipo) {
        case "colocar_token": {
            const token = buscarToken(pedido.id);
            if (!token) return erro(c.ws, "Esse token não existe.");
            if (!posicaoValida(token, pedido.col, pedido.row)) {
                // Pedido inválido: quem pediu recebe a verdade (o token como está de fato) para se corrigir.
                enviar(c.ws, token.guardado ? { tipo: "token_guardado", id: token.id } : { tipo: "token_colocado", id: token.id, col: token.col, row: token.row });
                return erro(c.ws, "Posição inválida.");
            }
            colocarToken(token.id, pedido.col, pedido.row);
            avisarTodos({ tipo: "token_colocado", id: token.id, col: pedido.col, row: pedido.row });
            agendarGravacaoDoToken(token.id);
            return;
        }
        case "guardar_token": {
            const token = buscarToken(pedido.id);
            if (!token) return erro(c.ws, "Esse token não existe.");
            guardarToken(token.id);
            avisarTodos({ tipo: "token_guardado", id: token.id });
            agendarGravacaoDoToken(token.id);
            return;
        }
        case "criar_token":
            naFilaDeArquivos(() => criarTokenNoServidor(c, pedido));
            return;
        case "editar_token": {
            // editarToken aplica as MESMAS regras da criação (nome aparado, tamanho de 1 a 4, cores válidas, imagem válida).
            const token = editarToken(pedido.id, pedido.mudancas);
            if (!token) return erro(c.ws, "Esse token não existe.");
            avisarTodos({ tipo: "token_editado", token });
            agendarGravacaoDoToken(token.id);
            return;
        }
        case "excluir_token": {
            if (!excluirToken(pedido.id)) return erro(c.ws, "Esse token não existe.");
            tokensSujos.delete(pedido.id); // não há mais o que gravar
            avisarTodos({ tipo: "token_excluido", id: pedido.id });
            naFilaDeArquivos(() => apagarDaPasta("tokens", pedido.id)); // e o arquivo dele some
            return;
        }
        case "enviar_mensagem": {
            // adicionarMensagem aplica o limite de 72 caracteres e recusa texto vazio (devolve null).
            const mensagem = adicionarMensagem(autor, pedido.texto);
            if (!mensagem) return erro(c.ws, "Mensagem vazia ou longa demais.");
            avisarTodos({ tipo: "mensagem", mensagem });
            return;
        }
        case "rolar_dados": {
            if (!rolagemValida(pedido.lados, pedido.quantidade, pedido.modificador)) return erro(c.ws, "Rolagem inválida.");
            const rolagem = rolarDados(pedido.lados, pedido.quantidade, pedido.modificador, sortear); // o SERVIDOR sorteia
            avisarTodos({ tipo: "mensagem", mensagem: adicionarRolagem(autor, rolagem) });
            return;
        }
        case "rolar_ficha": {
            // Rola a rolagem de uma ficha SALVA: o cliente só diz QUAL (ficha, versão e posição); o texto e o sorteio são do servidor.
            const ficha = estado.fichas.find((f) => f.id === pedido.id);
            if (!ficha) return erro(c.ws, "Essa ficha não existe.");
            if (ficha.versao !== pedido.versao) return erro(c.ws, "Esta ficha foi alterada. Feche e abra de novo para rolar.");
            const resultado = rolarDaAnalise(analiseDaFicha(ficha), pedido.indice, ficha.nome, sortear); // o SERVIDOR sorteia
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            avisarTodos({ tipo: "mensagem", mensagem: adicionarRolagemDeFicha(autor, resultado.valor) });
            return;
        }
        case "criar_ficha":
            naFilaDeArquivos(() => criarFichaNoServidor(c));
            return;
        case "editar_ficha":
            naFilaDeArquivos(() => editarFichaNoServidor(c, pedido));
            return;
        case "excluir_ficha": {
            const { id } = pedido;
            naFilaDeArquivos(() => excluirFichaNoServidor(c, id));
            return;
        }
    }
}

// ---------------------------------------------------------------------
// 4) LIGANDO TUDO
// ---------------------------------------------------------------------

const servidorHttp = createServer((requisicao, resposta) => void servirSite(requisicao, resposta));
const wss = new WebSocketServer({ noServer: true, maxPayload: TAMANHO_MAX_MENSAGEM_REDE });

/**
 * SEGURANÇA: um navegador sempre diz de que site veio a conexão (cabeçalho Origin). Só aceitamos o MESMO site que
 * entregou a página (senão qualquer página aberta no navegador do mestre poderia se conectar a este servidor).
 * Programas que não são navegadores não mandam Origin e passam.
 */
function origemPermitida(requisicao: IncomingMessage): boolean {
    const origem = requisicao.headers.origin;
    if (origem === undefined) return true;
    try {
        return new URL(origem).host === requisicao.headers.host;
    } catch {
        return false;
    }
}

servidorHttp.on("upgrade", (requisicao, socket, cabeca) => {
    let caminho = "";
    try {
        caminho = new URL(requisicao.url ?? "/", "http://local").pathname;
    } catch {
        /* caminho vazio: recusado abaixo */
    }
    if (caminho !== "/ws" || !origemPermitida(requisicao)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }
    wss.handleUpgrade(requisicao, socket, cabeca, (ws) => wss.emit("connection", ws, requisicao));
});

wss.on("connection", (ws) => {
    const conexao: Conexao = { id: proximoIdDeConexao++, ws, jogador: null, inicioDaJanela: Date.now(), mensagensNaJanela: 0 };
    conexoes.add(conexao);

    // Quem conecta e não se apresenta a tempo é desconectado (não ocupa a mesa à toa).
    const prazo = setTimeout(() => {
        if (!conexao.jogador) ws.close(1008, "Apresente-se.");
    }, SEGUNDOS_PARA_ENTRAR * 1000);

    ws.on("message", (dados: RawData, binario: boolean) => {
        if (!dentroDoLimite(conexao)) return;
        if (binario) return erro(ws, "Só mensagens de texto.");
        try {
            const pedido = lerPedido(JSON.parse(dados.toString()) as unknown);
            if (!pedido) return erro(ws, "Pedido inválido.");
            tratar(conexao, pedido);
        } catch (falha) {
            // JSON quebrado ou um erro nosso: nunca derruba o servidor, e não revela detalhes internos a quem pediu.
            if (!(falha instanceof SyntaxError)) console.error("Erro ao tratar um pedido:", falha);
            erro(ws, "Pedido inválido.");
        }
    });

    ws.on("close", () => {
        clearTimeout(prazo);
        conexoes.delete(conexao);
        if (conexao.jogador) {
            console.log(`- ${conexao.jogador.apelido} saiu (${listaDeJogadores().length} na mesa)`);
            avisarTodos({ tipo: "jogadores", lista: listaDeJogadores() });
        }
    });
    ws.on("error", () => ws.terminate());
});

// Antes de aceitar conexões, lê as fichas e os tokens que estão gravados na pasta de dados (se ela não existir, é criada).
try {
    const fichasLidas = await carregarPasta("fichas", fichaValida, TAMANHO_MAX_ARQUIVO_FICHA);
    const tokensLidos = await carregarPasta("tokens", tokenValido, TAMANHO_MAX_ARQUIVO_TOKEN);
    // (O 2º argumento reserva os ids de arquivos IGNORADOS por estarem estragados: um item novo nunca os sobrescreve.)
    definirFichas(fichasLidas.itens, fichasLidas.maiorId + 1);
    definirTokens(tokensLidos.itens, tokensLidos.maiorId + 1);
    console.log(`${estado.fichas.length} ficha(s) e ${estado.tokens.length} token(s) carregado(s) de ${PASTA_DE_DADOS}`);
} catch (falha) {
    console.error(`Não foi possível ler/criar a pasta de dados (${PASTA_DE_DADOS}):`, falha instanceof Error ? falha.message : falha);
    process.exit(1);
}

// Por padrão só escuta neste computador (127.0.0.1). Para a rede local: HOST=0.0.0.0 npm run servidor
const host = process.env.HOST ?? "127.0.0.1";
const porta = Number(process.env.PORT) || PORTA_SERVIDOR;
servidorHttp.on("error", (falha: NodeJS.ErrnoException) => {
    if (falha.code === "EADDRINUSE") console.error(`A porta ${porta} já está em uso por outro programa. Use outra: PORT=4000 npm run servidor (e no Vite, a mesma em PORTA_SERVIDOR).`);
    else console.error("Erro no servidor:", falha.message);
    process.exit(1);
});
servidorHttp.listen(porta, host, () => {
    console.log(`Servidor do Tabuleirinho escutando em http://${host}:${porta} (WebSocket em /ws)`);
    console.log("No desenvolvimento, abra o Vite (http://127.0.0.1:5173/?online&nome=SeuNome) em duas abas.");
});

process.on("SIGINT", async () => {
    console.log("\nDesligando o servidor...");
    for (const c of conexoes) c.ws.close(1001, "Servidor desligando.");
    // Grava as posições que ainda estavam esperando (um token que acabou de andar não pode ser perdido).
    if (gravacaoAgendada) clearTimeout(gravacaoAgendada);
    gravarTokensSujos();
    await filaDeArquivos;
    servidorHttp.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
});
