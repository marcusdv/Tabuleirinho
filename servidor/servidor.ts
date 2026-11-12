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
// Neste protótipo só estas coisas passam pelo servidor: soltar um token (no mapa ou na bolsa), o chat e os dados.
// Sem login, sem permissões (qualquer um mexe em qualquer token), uma mesa só, tudo na memória (nada é gravado).
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
import { MAX_MENSAGENS_POR_SEGUNDO, PORTA_SERVIDOR, SEGUNDOS_PARA_ENTRAR, TAMANHO_MAX_MENSAGEM_REDE } from "../src/config.ts";
import { rolarDados } from "../src/dados.ts";
import { adicionarMensagem, adicionarRolagem, buscarToken, colocarToken, estado, guardarToken, posicaoValida, rolagemValida } from "../src/estado.ts";
import { lerPedido, limparApelido, type EventoDoServidor, type Jogador, type PedidoDoCliente } from "../src/protocolo.ts";

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

function tratar(c: Conexao, pedido: PedidoDoCliente): void {
    // Antes de tudo a pessoa precisa se apresentar.
    if (pedido.tipo === "entrar") {
        if (c.jogador) return erro(c.ws, "Você já entrou.");
        c.jogador = { id: c.id, apelido: limparApelido(pedido.apelido, c.id) };
        // Quem entra recebe o estado COMPLETO uma vez; depois só os eventos.
        enviar(c.ws, { tipo: "estado_inicial", voce: c.jogador, colunas: estado.colunas, linhas: estado.linhas, tokens: estado.tokens, mensagens: estado.mensagens });
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
            return;
        }
        case "guardar_token": {
            const token = buscarToken(pedido.id);
            if (!token) return erro(c.ws, "Esse token não existe.");
            guardarToken(token.id);
            avisarTodos({ tipo: "token_guardado", id: token.id });
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

process.on("SIGINT", () => {
    console.log("\nDesligando o servidor...");
    for (const c of conexoes) c.ws.close(1001, "Servidor desligando.");
    servidorHttp.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
});
