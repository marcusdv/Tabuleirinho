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

import { randomInt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
    MAX_CARACTERES_TEXTO_FICHA,
    MAX_FICHAS,
    MAX_GRUPOS,
    MAX_MENSAGENS_POR_SEGUNDO,
    MS_RECARGA_CHAT,
    MS_RECARGA_ROLAGEM,
    RAJADA_CHAT,
    RAJADA_ROLAGENS,
    MAX_PECAS,
    MAX_TOKENS,
    MS_ESPERA_GRAVACAO_TOKEN,
    PORTA_SERVIDOR,
    SEGUNDOS_PARA_ENTRAR,
    TAMANHO_MAX_ARQUIVO_FICHA,
    TAMANHO_MAX_ARQUIVO_GRUPO,
    TAMANHO_MAX_ARQUIVO_PASTA,
    TAMANHO_MAX_ARQUIVO_TOKEN,
    TAMANHO_MAX_MENSAGEM_REDE,
    MAX_BYTES_MAPA,
} from "../src/config.ts";
import { rolarDados } from "../src/dados.ts";
import {
    adicionarMensagem,
    adicionarRolagem,
    adicionarCartaoDeFicha,
    adicionarRolagemDeFicha,
    tokenDaRolagem,
    rolarIniciativaDoToken,
    montarPeca,
    pecasDoModelo,
    motivoFichaOcupada,
    restaurarEstadoDaPeca,
    buscarToken,
    colocarToken,
    definirFichas,
    definirGrupos,
    definirPastas,
    montarPasta,
    receberPasta,
    excluirPasta,
    moverParaPasta,
    podeMoverPasta,
    pastaValida,
    limparNomeDePasta,
    pastaEAcima,
    aplicarAcao,
    aplicarAcaoEmVarios,
    definirCondicao,
    aplicarResultado,
    frasePraChatDeDano,
    totalDaRolagem,
    type ResultadoDeAcao,
    ajustarValorDaFicha,
    aplicarStatusDaMesaAosTokens,
    definirTodosOsValoresDasFichas,
    motivoParaNaoColocar,
    sincronizarValoresDaFicha,
    todosOsValoresDasFichas,
    valoresAtuaisDaFicha,
    valoresDaFichaComoObjeto,
    carregarAcoesDaMesa,
    carregarStatusDaMesa,
    definirAcoesDaMesa,
    frasePraChatDaAcao,
    definirStatusDaMesa,
    definirGradeDaMesa,
    type GradeDaMesa,
    definirTamanhoTabuleiro,
    definirTokens,
    editarToken,
    estado,
    excluirFicha,
    excluirTokenComPecas,
    alternarCondicao,
    definirMapaAtual,
    fichaExiste,
    excluirGrupo,
    fichaValida,
    grupoValido,
    guardarToken,
    montarEdicaoDaFicha,
    montarEdicaoDoGrupo,
    montarFicha,
    montarGrupo,
    montarMarcacaoDaFicha,
    montarToken,
    normalizarAbas,
    normalizarNomeFicha,
    posicaoValida,
    receberFicha,
    receberGrupo,
    receberToken,
    rolagemValida,
    tokenValido,
    type Ficha,
    type Token,
} from "../src/estado.ts";
import { aplicarAcaoDaIniciativa, definirIniciativa, iniciativaComoObjeto } from "../src/iniciativa.ts";
import { ABAS_THORIN, IMAGEM_GOBLIN, NOME_GOBLIN, NOME_THORIN, TEXTO_GOBLIN } from "../src/exemplos.ts";
import { analisarAbas, rolarCartaoDaAnalise, rolarConta, rolarDaAnalise, type AnaliseDaFicha } from "../src/formulas.ts";
import type { ValorDeStatus } from "../src/estado.ts";
import { gastar, novoBalde, type Balde } from "../src/limite.ts";
import { estaBanido, idDeUsuarioDoNome, LIMITE_MAXIMO_POR_JOGADOR, podeEditar, podeExcluir, podeLer, temPoderDeMestre, type NivelEfetivo, type TipoDeItem, nivelNaPasta } from "../src/permissoes.ts";
import { adicionarDesenhoNoMapa, apagarDesenhosDoMapa, carregarDesenhos, desenhosDoMapa, gravarDesenhosPendentes } from "./desenhos.ts";
import { carregarPermissoes, definirDono, esquecerItem, gravarPermissoes, motivoDoLimite, nivelDoUsuario, permissoes } from "./acesso.ts";
import { lerPedido, limparApelido, type EventoDoServidor, type Jogador, type PedidoDoCliente, type RegistroDeMapa } from "../src/protocolo.ts";
import { acharMapa, apagarMapa, definirQuemVeMapa, caminhoDoMapa, carregarMapas, criarMapasDeExemplo, guardarMapa, listaDeMapas, TIPO_MIME } from "./mapas.ts";
import { enviarBackup, instrucoesDoBackup } from "./backup.ts";
import { ajustarFogAoTamanho, ativarFog, desativarFog, pintarFog, preencherFog, esquecerFog, carregarFog, gravarFogAgora } from "./fog.ts";
import { apagarDaPasta, carregarMesa, carregarPasta, gravarMesa, gravarNaPasta, PASTA_DE_DADOS, type NomeDaPasta } from "./dados.ts";

import { filaDeArquivos, naFilaDeArquivos } from "./fila.ts";
import { type Conexao, podeRolar, podeEscrever, conexoes, novoIdDeConexao, listaDeJogadores, enviar, avisarTodos, erro, avisarCada } from "./conexoes.ts";
import { mapaAtual, mapaDaConexao, mapaDoUsuario, irParaMapa, tamanhoDoMapa, gradeDoMapa, comCenaDe, definirMapaDoMestre, configDaCena, lembrarTamanhoDaCena, lembrarGradeDaCena, esquecerCena, carregarCenas } from "./cenas.ts";
import { SEM_PERMISSAO, podeNoToken, podeNaFicha, valoresParaConexao, avisarValoresDoToken, bibliotecaParaConexao, avisarMapaDe, avisarMapaAtual, avisarJogadores, avisarMapasDefinidos, tokenParaConexao, tokenParaConexaoSemEstrela, fichaParaConexao, sincronizarVisaoDe, sincronizarVisaoDeTodos, avisarPermissoes, atualizarPapeisConectados, avisarToken, avisarFicha, valoresVisiveisPara, avisarValoresDaFicha, semPermissaoNoMapa, pastaParaConexao, avisarPasta, avisarFogDoMapa, avisarFogPintado, desenhoOcultoPara, desenhosVisiveisPara, enviarFogDe, pecaOcultaPelaFog, reconciliarTodos } from "./visao.ts";
import { carregarPreferencias, definirFavoritoDe } from "./preferencias.ts";

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

/**
 * A conexão veio do PRÓPRIO COMPUTADOR do servidor (127.0.0.1)? Atrás de um TÚNEL (cloudflared, ngrok) toda conexão chega de 127.0.0.1, mas o túnel acrescenta cabeçalhos com o
 * endereço de verdade (`Cf-Connecting-Ip`, `X-Forwarded-For`): com eles, a conexão NÃO é do próprio computador (era por isso que, no túnel, todo mundo virava mestre).
 */
function veioDoProprioComputador(requisicao: IncomingMessage): boolean {
    const c = requisicao.headers;
    if (c["cf-connecting-ip"] || c["x-forwarded-for"] || c["forwarded"] || c["x-real-ip"]) return false;
    const endereco = requisicao.socket.remoteAddress;
    return endereco === "127.0.0.1" || endereco === "::1" || endereco === "::ffff:127.0.0.1";
}

/**
 * O PAPEL FORJADO (para testes, até existirem contas): o endereço PRECISA trazer `?papel=mestre` ou `?papel=jogador` (decisão do dono, 17/11/2026: nada de ser mestre por padrão).
 * `mestre` só vale para conexões do PRÓPRIO COMPUTADOR do servidor (quem vem de fora e pede mestre é recusado), então ninguém de fora se promove. Devolve o papel, ou o MOTIVO da recusa.
 */
/**
 * SENHA DA MESA (identidade mínima, 17/11/2026; opcional): ligando o servidor com `SENHA_MESA=algo npm run servidor`, quem entra DE FORA (rede ou túnel) precisa trazer `&senha=algo`
 * no endereço. Quem está no próprio computador do servidor (o mestre) não precisa. Sem a variável, ninguém precisa (como antes). A comparação é de tempo constante.
 */
const SENHA_DA_MESA = process.env.SENHA_MESA ?? "";
function senhaConfere(requisicao: IncomingMessage): boolean {
    if (SENHA_DA_MESA === "" || veioDoProprioComputador(requisicao)) return true;
    let enviada = "";
    try {
        enviada = new URL(requisicao.url ?? "/", "http://local").searchParams.get("senha") ?? "";
    } catch {
        return false;
    }
    const a = Buffer.from(enviada, "utf8");
    const b = Buffer.from(SENHA_DA_MESA, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
}
function papelDaRequisicao(requisicao: IncomingMessage): { papel: "mestre" | "jogador" } | { recusa: string } {
    if (!senhaConfere(requisicao)) return { recusa: "Esta mesa tem SENHA: entre pelo endereço que o mestre passou (com …&senha=…)." };
    let papel: string | null = null;
    try {
        papel = new URL(requisicao.url ?? "/", "http://local").searchParams.get("papel");
    } catch {
        /* sem papel: recusado abaixo */
    }
    if (papel === "jogador") return { papel };
    if (papel === "mestre") return veioDoProprioComputador(requisicao) ? { papel } : { recusa: "Só dá para entrar como mestre pelo computador do servidor. Entre como jogador (…&papel=jogador)." };
    return { recusa: "Faltou o papel no endereço: use …&papel=mestre (no computador do servidor) ou …&papel=jogador." };
}

/** Atende o envio de mapas por HTTP: só o mestre (o `?papel=mestre` do pedido, vindo do computador do servidor). */
function ehMestre(requisicao: IncomingMessage): boolean {
    const resultado = papelDaRequisicao(requisicao);
    return "papel" in resultado && resultado.papel === "mestre";
}

function responderJson(resposta: ServerResponse, status: number, corpo: unknown): void {
    resposta.writeHead(status, { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" });
    resposta.end(JSON.stringify(corpo));
}

/**
 * Os MAPAS pelo HTTP (a imagem NUNCA vai pelo WebSocket, que recusa mensagens grandes):
 *   - POST /mapas?nome=...  o MESTRE envia uma imagem (o corpo é a imagem pura). Confere o mestre, a origem do pedido, o tamanho enquanto lê (corta assim que passa do limite) e depois o tipo e os pixels (servidor/mapas.ts).
 *   - GET /mapas/<id>       entrega a imagem de um mapa da biblioteca: o id vem do registro (16 caracteres hexadecimais), o tipo do conteúdo é o da imagem conferida, e o navegador não pode "adivinhar" outro (nosniff).
 * Devolve true se o pedido era de mapas (e já foi respondido).
 */
async function tratarMapas(requisicao: IncomingMessage, resposta: ServerResponse): Promise<boolean> {
    let url: URL;
    try {
        url = new URL(requisicao.url ?? "/", "http://local");
    } catch {
        return false;
    }
    const caminho = url.pathname;
    if (caminho === "/mapas" && requisicao.method === "POST") {
        if (!ehMestre(requisicao)) return responderJson(resposta, 403, { erro: "Só o mestre pode enviar mapas." }), true;
        if (!origemPermitida(requisicao)) return responderJson(resposta, 403, { erro: "Origem não permitida." }), true;
        const declarado = Number(requisicao.headers["content-length"]);
        if (Number.isFinite(declarado) && declarado > MAX_BYTES_MAPA) {
            requisicao.resume();
            return responderJson(resposta, 413, { erro: `Imagem grande demais (${(declarado / 1048576).toFixed(1)} MB): o máximo é ${MAX_BYTES_MAPA / 1048576} MB.` }), true;
        }
        const pedacos: Buffer[] = [];
        let total = 0;
        let estourou = false;
        await new Promise<void>((pronto) => {
            requisicao.on("data", (parte: Buffer) => {
                if (estourou) return;
                total += parte.length;
                if (total > MAX_BYTES_MAPA) {
                    estourou = true; // (para de guardar na memória; o resto do corpo é descartado)
                    pedacos.length = 0;
                    return;
                }
                pedacos.push(parte);
            });
            requisicao.on("end", () => pronto());
            requisicao.on("error", () => pronto());
            requisicao.on("close", () => pronto());
        });
        if (estourou) return responderJson(resposta, 413, { erro: `Imagem grande demais: o máximo é ${MAX_BYTES_MAPA / 1048576} MB.` }), true;
        const resultado = await guardarMapa(Buffer.concat(pedacos), url.searchParams.get("nome"));
        if (!resultado.ok) return responderJson(resposta, 400, { erro: resultado.erro }), true;
        console.log(`Mapa enviado: "${resultado.valor.nome}" (${resultado.valor.largura}×${resultado.valor.altura}, ${(resultado.valor.bytes / 1048576).toFixed(1)} MB)`);
        avisarMapasDefinidos();
        return responderJson(resposta, 201, resultado.valor), true;
    }
    const achou = /^\/mapas\/([0-9a-f]{16})$/.exec(caminho);
    if (achou && (requisicao.method === "GET" || requisicao.method === "HEAD")) {
        const arquivo = caminhoDoMapa(achou[1]);
        if (!arquivo) return responder(resposta, 404, "Mapa não encontrado."), true;
        try {
            const conteudo = await readFile(arquivo.caminho);
            resposta.writeHead(200, {
                "content-type": TIPO_MIME[arquivo.tipo],
                "content-length": conteudo.length,
                "x-content-type-options": "nosniff",
                "cache-control": "public, max-age=31536000, immutable", // (o id nunca muda de imagem: o navegador pode guardar)
            });
            resposta.end(requisicao.method === "HEAD" ? undefined : conteudo);
        } catch {
            responder(resposta, 404, "Mapa não encontrado.");
        }
        return true;
    }
    return false;
}

/**
 * GET /backup: o BACKUP DA CAMPANHA (a pasta `dados/` inteira num .zip). SÓ o mestre baixa (o servidor confere pelo endereço, como no envio de mapas). Antes de empacotar, grava o que
 * ainda estava esperando para ser gravado, para o backup não sair com a edição de um segundo atrás faltando. Devolve true se o pedido era deste caminho.
 */
async function tratarBackup(requisicao: IncomingMessage, resposta: ServerResponse): Promise<boolean> {
    let caminho: string;
    try {
        caminho = new URL(requisicao.url ?? "/", "http://local").pathname;
    } catch {
        return false;
    }
    if (caminho !== "/backup" || requisicao.method !== "GET") return false;
    if (!ehMestre(requisicao)) return responderJson(resposta, 403, { erro: "Só o mestre baixa o backup da campanha." }), true;
    try {
        if (gravacaoAgendada !== null) {
            clearTimeout(gravacaoAgendada);
            gravarTokensSujos();
        }
        await gravarDesenhosPendentes();
        gravarFogAgora(); // (o fog também, antes de empacotar)
        await new Promise<void>((pronto) => naFilaDeArquivos(async () => pronto())); // (espera a fila de gravação esvaziar)
        const hoje = new Date();
        const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
        const resumo = `Conteúdo: ${estado.fichas.length} ficha(s), ${estado.tokens.filter((t) => t.copiaDe === null).length} token(s), ${estado.grupos.length} grupo(s) e ${listaDeMapas().length} mapa(s).`;
        await enviarBackup(resposta, PASTA_DE_DADOS, `tabuleirinho-backup-${dia}.zip`, [{ nome: "LEIA-ME.txt", texto: instrucoesDoBackup(dia, resumo) }]);
        console.log("Backup da campanha baixado pelo mestre.");
    } catch (falha) {
        console.error("Erro ao montar o backup:", falha);
        if (!resposta.headersSent) responderJson(resposta, 500, { erro: "Não foi possível montar o backup." });
        else resposta.destroy();
    }
    return true;
}

async function servirSite(requisicao: IncomingMessage, resposta: ServerResponse): Promise<void> {
    if (await tratarBackup(requisicao, resposta)) return;
    if (await tratarMapas(requisicao, resposta)) return;
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








// ---------------------------------------------------------------------
// PERMISSÕES E VISÃO (17/11/2026; ver `src/permissoes.ts`): o servidor decide quem vê e quem faz o quê. O mestre pode tudo; o jogador só o que é dele ou foi liberado.
// ---------------------------------------------------------------------






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


/**
 * Cria a ficha VAZIA e o seu ARQUIVO NA HORA (não espera ninguém escrever nada: o texto vem depois, pelo editor), e só então a
 * guarda na mesa e avisa todos: o que todos veem já está no disco.
 */
async function criarFichaNoServidor(c: Conexao, idDoToken?: number): Promise<void> {
    // "Criar ficha" a partir de um token: só vale para um token da BOLSA que ainda não tem ficha; a ficha nasce com o nome dele.
    const modelo = idDoToken === undefined ? undefined : buscarToken(idDoToken);
    if (idDoToken !== undefined && (!modelo || modelo.copiaDe !== null)) return erro(c.ws, "Esse token não existe.");
    if (modelo && modelo.ficha !== null && fichaExiste(modelo.ficha)) return erro(c.ws, "Esse token já tem uma ficha.");
    if (modelo && !podeNoToken(c, modelo, "editar")) return erro(c.ws, SEM_PERMISSAO); // (ligar uma ficha é configurar o token)
    const limite = c.mestre ? null : motivoDoLimite("fichas", c.usuario);
    if (limite) return erro(c.ws, limite);
    const ficha = montarFicha(modelo?.nome ?? "");
    if (!ficha) return erro(c.ws, `Não foi possível criar a ficha: o limite é de ${MAX_FICHAS} fichas na mesa.`);
    try {
        await gravarNaPasta("fichas", ficha);
    } catch (falha) {
        console.error(`Não foi possível gravar a ficha ${ficha.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar a ficha no servidor."); // sem detalhes internos para quem pediu
    }
    receberFicha(ficha);
    definirDono("fichas", ficha.id, c.mestre ? null : c.usuario); // (quem cria é o dono; o mestre cria fichas "do mestre")
    naFilaDeArquivos(() => gravarPermissoes());
    avisarPermissoes(); // (os mestres veem o dono novo na janela "Compartilhar", sem recarregar)
    avisarFicha("ficha_criada", ficha);
    if (modelo) {
        ligarTokenAFicha(modelo.id, ficha.id); // (a ficha nova não tem recursos, então nunca está "ocupada")
        sincronizarVisaoDeTodos([modelo.id], [ficha.id]); // (quem tem acesso ao token passa a ter o mesmo acesso à ficha nova)
    }
}

/** Liga o token da bolsa à ficha e avisa todos (o token e as peças dele), regravando os arquivos. Quem chama já conferiu a regra da ficha única. */
function ligarTokenAFicha(idDoToken: number, idDaFicha: number | null): void {
    const token = editarToken(idDoToken, { ficha: idDaFicha });
    if (!token) return;
    avisarToken("token_editado", token);
    agendarGravacaoDoToken(token.id);
    if (token.copiaDe === null) {
        for (const peca of pecasDoModelo(token.id)) {
            avisarToken("token_editado", peca);
            agendarGravacaoDoToken(peca.id);
        }
    }
}

/**
 * Edita nome e/ou texto de uma ficha. A checagem de VERSÃO decide: se a ficha já está numa versão mais nova do que a que a pessoa
 * tinha na tela, o servidor NÃO grava e devolve só a ela a versão atual (`ficha_conflito`). Senão grava o arquivo (a versão sobe) e só
 * então guarda na mesa e avisa todos. Roda na fila de arquivos: dois salvamentos seguidos nunca se misturam.
 */
async function editarFichaNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "editar_ficha" }>): Promise<void> {
    const existente = estado.fichas.find((f) => f.id === pedido.id);
    if (existente && !podeNaFicha(c, existente, "editar")) return erro(c.ws, "Você só pode editar as fichas que são suas ou que o mestre liberou como EDITOR para você.");
    const resultado = montarEdicaoDaFicha(pedido.id, pedido.versao, { nome: pedido.nome, abas: pedido.abas });
    if (!resultado.ok) {
        if (resultado.erro === "versao_antiga") {
            const atual = estado.fichas.find((f) => f.id === pedido.id);
            const vista = atual ? fichaParaConexao(c, atual) : null;
            if (vista) enviar(c.ws, { tipo: "ficha_conflito", ficha: vista });
            return;
        }
        return erro(
            c.ws,
            resultado.erro === "nao_existe"
                ? "Essa ficha não existe."
                : resultado.erro === "abas_invalidas"
                  ? "A ficha precisa ter de 1 a 6 páginas."
                  : `O texto da ficha (somando todas as páginas) passa de ${MAX_CARACTERES_TEXTO_FICHA} caracteres.`,
        );
    }
    if (resultado.mudou) {
        try {
            await gravarNaPasta("fichas", resultado.ficha);
        } catch (falha) {
            console.error(`Não foi possível gravar a ficha ${resultado.ficha.id}:`, falha);
            return erro(c.ws, "Não foi possível gravar a ficha no servidor."); // a ficha na mesa continua como estava
        }
        receberFicha(resultado.ficha);
        // O texto pode ter mudado o mínimo/máximo de uma variável que muda: as barras dos tokens dela no tabuleiro são refeitas (cada navegador faz a mesma conta ao receber "ficha_editada").
        for (const token of sincronizarValoresDaFicha(resultado.ficha.id)) agendarGravacaoDoToken(token.id);
    }
    avisarFicha("ficha_editada", resultado.ficha);
}

/**
 * Exclui a ficha: apaga o ARQUIVO primeiro e só então a tira da mesa e avisa todos (assim nunca sobra uma ficha sem arquivo, nem um
 * arquivo de uma ficha que sumiu). Roda na MESMA fila dos salvamentos: um salvamento que ainda estava gravando termina antes, e um
 * pedido de salvar que chega depois cai em "essa ficha não existe". O id não é reaproveitado.
 */
async function excluirFichaNoServidor(c: Conexao, id: number): Promise<void> {
    const alvoDaExclusao = estado.fichas.find((f) => f.id === id);
    if (!alvoDaExclusao) return erro(c.ws, "Essa ficha não existe.");
    if (!podeNaFicha(c, alvoDaExclusao, "excluir")) return erro(c.ws, "Só o dono da ficha e o mestre podem excluí-la.");
    try {
        await apagarDaPasta("fichas", id);
    } catch (falha) {
        console.error(`Não foi possível apagar a ficha ${id}:`, falha);
        return erro(c.ws, "Não foi possível apagar o arquivo da ficha no servidor."); // a ficha continua na mesa
    }
    const soltos = estado.tokens.filter((t) => t.ficha === id); // (excluirFicha os deixa SEM ficha: é preciso avisar e regravar cada um)
    excluirFicha(id);
    esquecerItem("fichas", id); // (some do documento de permissões)
    naFilaDeArquivos(() => gravarPermissoes());
    avisarPermissoes();
    analisesDasFichas.delete(id);
    naFilaDeArquivos(() => gravarMesaAtual()); // (os valores atuais dela saem do mesa.json)
    avisarTodos({ tipo: "ficha_excluida", id });
    for (const token of soltos) {
        avisarToken("token_editado", token);
        agendarGravacaoDoToken(token.id);
    }
}

// A análise do texto de uma ficha (variáveis e rolagens) custa um pouco, e a mesma ficha é rolada muitas vezes: guardamos a análise por
// ficha e só a refazemos quando a VERSÃO muda (o servidor é quem manda na versão, então nunca fica velha).
// (uma análise POR ABA: as variáveis valem para a ficha inteira, mas cada aba só tem as rolagens do seu texto.)
// A chave do cache é a VERSÃO e também os valores atuais das variáveis que mudam (eles mudam sem subir a versão): qualquer um dos dois que mude refaz a análise.
const analisesDasFichas = new Map<number, { chave: string; analises: AnaliseDaFicha[] }>();
function analiseDaFicha(ficha: Ficha, aba: number): AnaliseDaFicha | undefined {
    const chave = `${ficha.versao}|${JSON.stringify(valoresDaFichaComoObjeto(ficha.id))}`;
    const guardada = analisesDasFichas.get(ficha.id);
    if (guardada?.chave === chave) return guardada.analises[aba];
    const analises = analisarAbas(ficha.abas.map((a) => a.texto), valoresAtuaisDaFicha(ficha.id));
    analisesDasFichas.set(ficha.id, { chave, analises });
    return analises[aba];
}

/** Marca a ficha (estrela e/ou grupos): grava o arquivo ANTES, SEM subir a versão (não é o conteúdo), e avisa todos. */
async function marcarFichaNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "marcar_ficha" }>): Promise<void> {
    // A ESTRELA é de cada pessoa (qualquer um que possa ler a ficha favorita as dele); os GRUPOS são só do mestre.
    if (pedido.favorito !== undefined) {
        const alvo = estado.fichas.find((f) => f.id === pedido.id);
        const vista = alvo ? fichaParaConexao(c, alvo) : null;
        if (!alvo || !vista) return erro(c.ws, "Essa ficha não existe.");
        definirFavoritoDe(c.usuario, "fichas", alvo.id, pedido.favorito);
        for (const x of conexoes) if (x.usuario === c.usuario && x.jogador && x.ws.readyState === WebSocket.OPEN) { const v = fichaParaConexao(x, alvo); if (v) enviar(x.ws, { tipo: "ficha_editada", ficha: v }); }
        if (pedido.grupos === undefined) return;
    }
    if (!c.mestre) return erro(c.ws, "Só o mestre mexe nos grupos.");
    const ficha = montarMarcacaoDaFicha(pedido.id, { grupos: pedido.grupos });
    if (!ficha) return erro(c.ws, "Essa ficha não existe.");
    try {
        await gravarNaPasta("fichas", ficha);
    } catch (falha) {
        console.error(`Não foi possível gravar a ficha ${ficha.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar a ficha no servidor.");
    }
    receberFicha(ficha);
    avisarFicha("ficha_editada", ficha); // (mesma versão: quem edita a ficha não vê conflito nenhum)
    if (pedido.grupos !== undefined) sincronizarVisaoDeTodos([], [ficha.id]); // (os grupos mudaram: quem tem acesso pelo grupo ganha ou perde esta ficha)
}

/** Cria o grupo: grava o arquivo ANTES de guardá-lo na mesa e avisar todos. */
async function criarGrupoNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "criar_grupo" }>): Promise<void> {
    if (!c.mestre) return erro(c.ws, "Só o mestre cria grupos.");
    const grupo = montarGrupo(pedido.nome, pedido.cor);
    if (!grupo) return erro(c.ws, `Não foi possível criar o grupo: o limite é de ${MAX_GRUPOS} grupos na mesa.`);
    try {
        await gravarNaPasta("grupos", grupo);
    } catch (falha) {
        console.error(`Não foi possível gravar o grupo ${grupo.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar o grupo no servidor.");
    }
    receberGrupo(grupo);
    avisarTodos({ tipo: "grupo_criado", grupo });
}

async function editarGrupoNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "editar_grupo" }>): Promise<void> {
    if (!c.mestre) return erro(c.ws, "Só o mestre edita grupos.");
    const grupo = montarEdicaoDoGrupo(pedido.id, { nome: pedido.nome, cor: pedido.cor });
    if (!grupo) return erro(c.ws, "Esse grupo não existe.");
    try {
        await gravarNaPasta("grupos", grupo);
    } catch (falha) {
        console.error(`Não foi possível gravar o grupo ${grupo.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar o grupo no servidor.");
    }
    receberGrupo(grupo);
    avisarTodos({ tipo: "grupo_editado", grupo });
}

/** Exclui o grupo: apaga o arquivo dele, tira a marca de todos os tokens e fichas (regrava os que mudaram) e avisa todos. Os itens ficam. */
async function excluirGrupoNoServidor(c: Conexao, id: number): Promise<void> {
    if (!c.mestre) return erro(c.ws, "Só o mestre exclui grupos.");
    if (!estado.grupos.some((g) => g.id === id)) return erro(c.ws, "Esse grupo não existe.");
    try {
        await apagarDaPasta("grupos", id);
    } catch (falha) {
        console.error(`Não foi possível apagar o grupo ${id}:`, falha);
        return erro(c.ws, "Não foi possível apagar o arquivo do grupo no servidor.");
    }
    const mudados = excluirGrupo(id);
    avisarTodos({ tipo: "grupo_excluido", id });
    if (mudados?.status) {
        // Algum status valia para esse grupo: a regra mudou (para todos), então os tokens e a mesa são regravados.
        avisarCada((c) => ({ tipo: "status_definidos", status: estado.statusDaMesa, pecas: estado.tokens.filter((t) => t.copiaDe !== null).map((t) => ({ id: t.id, valores: valoresParaConexao(c, t) })) }));
        for (const token of estado.tokens) agendarGravacaoDoToken(token.id);
        naFilaDeArquivos(() => gravarMesaAtual());
    }
    for (const tokenId of mudados?.tokens ?? []) agendarGravacaoDoToken(tokenId);
    for (const fichaId of mudados?.fichas ?? []) {
        const ficha = estado.fichas.find((f) => f.id === fichaId);
        if (ficha) await gravarNaPasta("fichas", ficha).catch((falha: unknown) => console.error(`Não foi possível regravar a ficha ${fichaId}:`, falha));
    }
}

/** Igual às fichas: monta o token (valida), GRAVA o arquivo e só então o guarda na mesa e avisa todos. Nasce guardado na bolsa. */
// As FICHAS DE EXEMPLO (Goblin Guerreiro, de monstro, e Thorin, de jogador, com 2 páginas) entram na mesa UMA vez, para quem está começando se familiarizar com o texto das fichas
// (`src/exemplos.ts`). A marca `exemplos` em `dados/mesa.json` impede que voltem se o dono as apagar; SEM_EXEMPLOS=1 desliga (os testes automáticos usam isto).
const SEM_EXEMPLOS = process.env.SEM_EXEMPLOS === "1";
let exemplosCriados = false;
let mapasDeExemploCriados = false;
async function semearExemplos(): Promise<void> {
    const exemplos = [
        { nome: NOME_GOBLIN, abas: [{ nome: "Página 1", texto: TEXTO_GOBLIN }], cor: 0x2f5d2a, corBorda: 0xffffff, imagem: IMAGEM_GOBLIN as string | null },
        { nome: NOME_THORIN, abas: ABAS_THORIN, cor: 0x2a4a7a, corBorda: 0xffd54f, imagem: null as string | null },
    ];
    for (const e of exemplos) {
        const ficha = montarFicha();
        const abas = normalizarAbas(e.abas);
        if (!ficha || !abas) continue;
        ficha.nome = normalizarNomeFicha(ficha.id, e.nome);
        ficha.abas = abas;
        await gravarNaPasta("fichas", ficha); // (o arquivo nasce ANTES de a ficha entrar na mesa, como nas outras criações)
        receberFicha(ficha);
        const token = montarToken(e.cor, 1, e.nome, e.imagem, e.corBorda, ficha.id); // (nasce na bolsa, com a ficha atribuída)
        if (!token) continue;
        await gravarNaPasta("tokens", token);
        receberToken(token);
    }
}

/** Grava `dados/mesa.json` com o estado de AGORA (tamanho do tabuleiro e status da mesa). */
function gravarMesaAtual(): Promise<void> {
    return gravarMesa({ colunas: estado.colunas, linhas: estado.linhas, status: estado.statusDaMesa, acoes: estado.acoesDaMesa, valores: todosOsValoresDasFichas(), exemplos: exemplosCriados, mapa: mapaAtual, mapasDeExemplo: mapasDeExemploCriados, iniciativa: iniciativaComoObjeto(), grade: estado.grade }).catch((falha) => console.error("Não foi possível gravar mesa.json:", falha));
}

/** A pasta de um token: os tokens da BOLSA (modelos) em `dados/tokens/`, as PEÇAS do tabuleiro em `dados/pecas/`. */
const pastaDoToken = (token: Token): NomeDaPasta => (token.copiaDe === null ? "tokens" : "pecas");

/** "Arrastar um token da bolsa para o tabuleiro": cria a PEÇA (cópia temporária), grava o arquivo dela e avisa todos. O token da bolsa não muda. */
async function criarPecaNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "colocar_modelo" }>): Promise<void> {
    const modelo = buscarToken(pedido.modelo);
    if (modelo && !podeNoToken(c, modelo, "usar")) return erro(c.ws, "Esse token não é seu: só dá para colocar no mapa os tokens que o mestre liberou para você.");
    const motivo = modelo ? motivoParaNaoColocar(modelo) : null; // ficha de jogador (variáveis que mudam): só um token por cena
    if (motivo) return erro(c.ws, motivo);
    const peca = montarPeca(pedido.modelo, pedido.col, pedido.row);
    if (!peca) return erro(c.ws, `Não foi possível colocar o token: ele não existe, a posição não vale ou a mesa já tem ${MAX_PECAS} peças.`);
    restaurarEstadoDaPeca(peca, pedido.valores, pedido.condicoes); // (só no "Desfazer": devolve o PV e as condições que a peça tinha; as regras do estado.ts limpam tudo)
    try {
        await gravarNaPasta("pecas", peca);
    } catch (falha) {
        console.error(`Não foi possível gravar a peça ${peca.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar a peça no servidor.");
    }
    receberToken(peca);
    avisarToken("peca_criada", peca);
}

async function criarTokenNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "criar_token" }>): Promise<void> {
    if (pedido.ficha != null && !fichaExiste(pedido.ficha)) return erro(c.ws, "Essa ficha não existe.");
    if (pedido.ficha != null) {
        const ligada = estado.fichas.find((f) => f.id === pedido.ficha);
        if (ligada && !podeNaFicha(c, ligada, "editar")) return erro(c.ws, SEM_PERMISSAO); // (só se liga uma ficha que se pode editar)
    }
    const limite = c.mestre ? null : motivoDoLimite("tokens", c.usuario);
    if (limite) return erro(c.ws, limite);
    const ocupada = pedido.ficha == null ? null : motivoFichaOcupada(pedido.ficha, null);
    if (ocupada) return erro(c.ws, ocupada);
    const token = montarToken(pedido.cor, pedido.tamanho, pedido.nome, pedido.imagem, pedido.corBorda, pedido.ficha ?? null);
    if (!token) return erro(c.ws, `Não foi possível criar o token: o limite é de ${MAX_TOKENS} tokens na mesa.`);
    try {
        await gravarNaPasta("tokens", token);
    } catch (falha) {
        console.error(`Não foi possível gravar o token ${token.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar o token no servidor.");
    }
    receberToken(token);
    definirDono("tokens", token.id, c.mestre ? null : c.usuario); // (quem cria é o dono; o mestre cria itens "do mestre")
    naFilaDeArquivos(() => gravarPermissoes());
    avisarPermissoes(); // (os mestres veem o dono novo na janela "Compartilhar", sem recarregar)
    avisarToken("token_criado", token);
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
            if (token) await gravarNaPasta(pastaDoToken(token), token);
        });
    }
}

function agendarGravacaoDoToken(id: number): void {
    tokensSujos.add(id);
    gravacaoAgendada ??= setTimeout(gravarTokensSujos, MS_ESPERA_GRAVACAO_TOKEN);
}

/**
 * Depois de mudar o valor de um status de um token (uma ação do menu ou um dano arrastado): avisa todos (valores da peça; e, se mudou NA FICHA de um jogador, os valores da ficha), grava os arquivos
 * (das peças e o mesa.json) e põe a frase no chat em nome de quem agiu.
 */
function publicarResultadoDeAcao(autor: string, alvo: Token, resultado: Extract<ResultadoDeAcao, { ok: true }>, frase: string | null): void {
    avisarValoresDoToken(alvo, resultado.quantia > 0 ? (resultado.efeito === "reduzir" ? "dano" : "cura") : undefined); // (dano e cura animam em TODAS as telas, mesmo com a vida em 0 ou escondida)
    if (resultado.fichaAlterada !== undefined) {
        // Ficha de jogador: mudou o valor da FICHA (as barras de todos os tokens dela já foram refeitas): avisa, grava os arquivos das peças e o mesa.json.
        avisarValoresDaFicha(resultado.fichaAlterada);
        for (const t of estado.tokens) if (t.ficha === resultado.fichaAlterada && !t.guardado) agendarGravacaoDoToken(t.id);
        naFilaDeArquivos(() => gravarMesaAtual());
    }
    if (frase !== null) {
        const mensagem = adicionarMensagem(autor, frase);
        if (mensagem) avisarTodos({ tipo: "mensagem", mensagem });
    }
    agendarGravacaoDoToken(alvo.id);
}

/** Quem pode EDITAR uma pasta (renomear, mover, pôr itens nela, criar pastas dentro): o mestre, o dono e quem tem nível de editor nela (ou numa pasta de cima). */
function podeEditarPasta(c: Conexao, id: number): boolean {
    if (c.mestre) return true;
    const nivel = nivelNaPasta(permissoes, id, c.usuario, pastaEAcima(id));
    return nivel === "dono" || nivel === "editor";
}
/** Depois de uma mudança que afeta QUEM VÊ as pastas (liberar, mover, apagar): cada um recebe de novo as pastas que vê, e os tokens e fichas que estão em pastas são reconferidos. */
function refazerVisaoDasPastas(): void {
    for (const pasta of estado.pastas) avisarPasta(pasta);
    sincronizarVisaoDeTodos(estado.tokens.filter((t) => t.copiaDe === null && t.pasta != null).map((t) => t.id), estado.fichas.filter((f) => f.pasta != null).map((f) => f.id));
}

/** Trata um pedido com a CENA de quem o mandou (o mapa e o tamanho do tabuleiro dele; ver `comCenaDe`). */
function tratar(c: Conexao, pedido: PedidoDoCliente): void {
    comCenaDe(c, () => tratarNaCena(c, pedido));
    reconciliarTodos(); // (o fog: a peça que acabou de sair dele aparece para os jogadores e a que entrou some; sem fog em uso, não faz nada)
}
function tratarNaCena(c: Conexao, pedido: PedidoDoCliente): void {
    // Antes de tudo a pessoa precisa se apresentar.
    if (pedido.tipo === "entrar") {
        if (c.jogador) return erro(c.ws, "Você já entrou.");
        // SEM PAPEL NO ENDEREÇO a conexão é recusada (decisão do dono, 17/11/2026): o motivo explica como entrar, e a conexão fecha.
        if (c.recusa !== null || c.papel === null) {
            erro(c.ws, c.recusa ?? "Faltou o papel no endereço.");
            c.ws.close(1008, "Papel obrigatório.");
            return;
        }
        const apelidoDeEntrada = limparApelido(pedido.apelido, c.id);
        const usuarioDeEntrada = idDeUsuarioDoNome(apelidoDeEntrada); // (hoje o id vem do nome; com contas virá da conta)
        // BANIDO (pelo mestre, na aba Jogadores): não entra. (Um mestre nunca é barrado.)
        if (c.papel !== "mestre" && !temPoderDeMestre(permissoes, usuarioDeEntrada) && estaBanido(permissoes, usuarioDeEntrada)) {
            erro(c.ws, "Você foi banido desta mesa.");
            c.ws.close(1008, "Banido.");
            return;
        }
        c.jogador = { id: c.id, apelido: apelidoDeEntrada };
        c.usuario = usuarioDeEntrada;
        c.mestre = c.papel === "mestre" || temPoderDeMestre(permissoes, c.usuario);
        c.jogador.usuario = c.usuario;
        c.jogador.mestre = c.mestre;
        // O mapa em que esta pessoa começa: o em que estava da última vez (se ainda existe) ou o do mestre.
        const lembrado = mapaDoUsuario.get(c.usuario);
        c.mapaVisto = lembrado !== undefined && (lembrado === null || acharMapa(lembrado)) ? lembrado : mapaAtual;
        // Quem entra recebe o estado COMPLETO uma vez; depois só os eventos.
        c.pecasEscondidas = new Set(estado.tokens.filter((t) => t.copiaDe !== null && !t.guardado && tokenParaConexao(c, t) === null).map((t) => t.id)); // (o fog esconde peças: o servidor lembra quais já escondeu)
        enviar(c.ws, { tipo: "estado_inicial", voce: c.jogador, colunas: tamanhoDoMapa(mapaDaConexao(c)).colunas, linhas: tamanhoDoMapa(mapaDaConexao(c)).linhas, status: estado.statusDaMesa, acoes: estado.acoesDaMesa, tokens: estado.tokens.flatMap((t) => tokenParaConexao(c, t) ?? []), mensagens: estado.mensagens, fichas: estado.fichas.flatMap((f) => fichaParaConexao(c, f) ?? []), grupos: estado.grupos, valores: valoresVisiveisPara(c), iniciativa: iniciativaComoObjeto(), mestre: c.mestre, mapa: mapaDaConexao(c), mapas: bibliotecaParaConexao(c), grade: gradeDoMapa(mapaDaConexao(c)), permissoes: c.mestre ? permissoes : null, desenhos: desenhosVisiveisPara(c, mapaDaConexao(c)), ...(semPermissaoNoMapa(c) && { semPermissao: true }), pastas: estado.pastas.flatMap((p) => pastaParaConexao(c, p) ?? []) });
        enviarFogDe(c);
        avisarJogadores();
        console.log(`+ ${c.jogador.apelido} entrou como ${c.mestre ? "MESTRE" : "jogador"} (${listaDeJogadores().length} na mesa)`);
        return;
    }
    if (!c.jogador) return erro(c.ws, "Apresente-se primeiro (entrar).");
    const autor = c.jogador.apelido;

    switch (pedido.tipo) {
        case "colocar_token": {
            const token = buscarToken(pedido.id);
            if (!token) return erro(c.ws, "Esse token não existe.");
            if (!podeNoToken(c, token, "usar")) return erro(c.ws, "Esse token não é seu: só dá para mover os tokens que o mestre liberou para você.");
            if (!posicaoValida(token, pedido.col, pedido.row)) {
                // Pedido inválido: quem pediu recebe a verdade (o token como está de fato) para se corrigir.
                enviar(c.ws, token.guardado ? { tipo: "token_guardado", id: token.id } : { tipo: "token_colocado", id: token.id, col: token.col, row: token.row, valores: valoresParaConexao(c, token) });
                return erro(c.ws, "Posição inválida.");
            }
            colocarToken(token.id, pedido.col, pedido.row);
            // `valores`: os status temporários (se o token acabou de sair da bolsa, foram calculados agora, lendo a ficha NESTE servidor: todos veem os mesmos números)
            avisarCada((c2) => (pecaOcultaPelaFog(c2, token) ? null : { tipo: "token_colocado", id: token.id, col: pedido.col, row: pedido.row, valores: valoresParaConexao(c2, token) })); // (sob o fog, os jogadores não recebem a posição)
            agendarGravacaoDoToken(token.id);
            return;
        }
        case "alternar_condicao": {
            // Liga/desliga uma condição (Morto, Caído...): o servidor confere que o token e a condição existem, muda, GRAVA o arquivo do token e avisa todos.
            const alvo = buscarToken(pedido.id);
            if (!alvo) return erro(c.ws, "Esse token não existe.");
            if (!alternarCondicao(alvo.id, pedido.condicao)) return erro(c.ws, "Essa condição não existe.");
            avisarCada((c2) => (pecaOcultaPelaFog(c2, alvo) ? null : { tipo: "condicoes_atualizadas", id: alvo.id, condicoes: alvo.condicoes }));
            agendarGravacaoDoToken(alvo.id);
            return;
        }
        case "guardar_token": {
            const token = buscarToken(pedido.id);
            if (!token) return erro(c.ws, "Esse token não existe.");
            if (!podeNoToken(c, token, "editar")) return erro(c.ws, SEM_PERMISSAO); // (guardar na bolsa é uma configuração do token: leitor não faz)
            guardarToken(token.id);
            avisarTodos({ tipo: "token_guardado", id: token.id });
            agendarGravacaoDoToken(token.id);
            return;
        }
        case "colocar_modelo":
            naFilaDeArquivos(() => criarPecaNoServidor(c, pedido));
            return;
        case "definir_grade": {
            // A espessura e a cor da grade são da MESA: só o mestre as muda. O servidor limpa (limites e cor "#rrggbb"), grava em mesa.json e avisa todos.
            if (!c.mestre) return erro(c.ws, "Só o mestre pode mudar a grade.");
            definirGradeDaMesa({ espessura: pedido.espessura, cor: pedido.cor, alfa: pedido.alfa });
            const idDaGrade = mapaAtual;
            if (idDaGrade !== null) {
                lembrarGradeDaCena(idDaGrade, estado.grade); // (cada mapa guarda a SUA grade)
                avisarMapasDefinidos();
            }
            avisarCada((c2) => (mapaDaConexao(c2) === mapaAtual ? { tipo: "grade_definida", grade: estado.grade } : null)); // (só quem está no mapa do mestre)
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "definir_tamanho": {
            if (!c.mestre) return erro(c.ws, "Só o mestre pode mudar o tamanho do tabuleiro.");
            // O tamanho do tabuleiro é do SERVIDOR (ele valida as posições com ele): limita ao permitido, puxa para dentro os tokens que ficaram fora, grava e avisa todos.
            const movidos = definirTamanhoTabuleiro(pedido.colunas, pedido.linhas);
            const idDoMapa = mapaAtual;
            lembrarTamanhoDaCena(idDoMapa, estado.colunas, estado.linhas); // (cada cena guarda o seu tamanho)
            if (ajustarFogAoTamanho(idDoMapa, estado.colunas, estado.linhas)) avisarFogDoMapa(idDoMapa); // (o fog acompanha o tamanho novo)
            avisarMapasDefinidos(); // (a biblioteca leva o tamanho de cada mapa: o navegador do mestre não manda a previsão da imagem por cima do que ele configurou)
            avisarCada((c2) => (mapaDaConexao(c2) === mapaAtual ? { tipo: "tamanho_definido", colunas: estado.colunas, linhas: estado.linhas } : null)); // (só quem está no mapa do mestre; cada navegador refaz a mesma conta e puxa os tokens para dentro)
            for (const token of movidos) agendarGravacaoDoToken(token.id);
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "ajustar_valor_ficha": {
            // "+" e "−" (ou o número digitado) de uma variável que muda: o cliente só diz QUAL ficha, QUAL variável e QUANTO somar; o servidor confere, limita ao intervalo, grava e avisa todos.
            const fichaAjustada = estado.fichas.find((f) => f.id === pedido.ficha);
            if (fichaAjustada && !podeNaFicha(c, fichaAjustada, "editar")) return erro(c.ws, SEM_PERMISSAO);
            const resultado = ajustarValorDaFicha(pedido.ficha, pedido.nome, pedido.delta);
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            avisarValoresDaFicha(pedido.ficha);
            for (const token of sincronizarValoresDaFicha(pedido.ficha)) agendarGravacaoDoToken(token.id); // (as barras dos tokens dela espelham o valor)
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "aplicar_acao": {
            // "Dano", "Cura"...: o cliente só diz QUAL token, QUAL ação e o VALOR escrito (número ou dados); o servidor confere, sorteia os dados, muda o valor da peça, grava e avisa todos.
            const alvo = buscarToken(pedido.token);
            if (!alvo) return erro(c.ws, "Esse token não existe.");
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está agindo rápido demais.");
            const resultado = aplicarAcao(alvo, pedido.acao, pedido.valor, sortear);
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            publicarResultadoDeAcao(autor, alvo, resultado, frasePraChatDaAcao(alvo, pedido.acao, resultado));
            return;
        }
        case "aplicar_acao_varios": {
            // Dano ou cura em ÁREA: a mesma ação em vários tokens selecionados. Os dados são rolados UMA vez (o mesmo total para todos) e cada token perde ou ganha dentro do status e do máximo DELE.
            // Qualquer jogador pode (como no dano de um token só); o limite anti-spam gasta UMA rolagem. Uma frase só no chat.
            const alvos = pedido.tokens.flatMap((id) => buscarToken(id) ?? []);
            if (alvos.length !== pedido.tokens.length || alvos.some((t) => t.guardado)) return erro(c.ws, "Algum token não está no tabuleiro.");
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está agindo rápido demais.");
            const feito = aplicarAcaoEmVarios(alvos, pedido.acao, pedido.valor, sortear);
            if (!feito.ok) return erro(c.ws, feito.erro);
            for (const { token, resultado } of feito.itens) publicarResultadoDeAcao(autor, token, resultado, null);
            const acao = estado.acoesDaMesa.find((a) => a.id === pedido.acao);
            const mensagem = adicionarMensagem(autor, `${acao?.nome ?? "Ação"} ${feito.quantia} em ${feito.itens.length} tokens`);
            if (mensagem) avisarTodos({ tipo: "mensagem", mensagem });
            return;
        }
        case "condicao_varios": {
            // Liga (ou desliga) uma condição em vários tokens de uma vez: o servidor confere que todos existem e a condição também, muda, grava e avisa todos.
            const alvos = pedido.tokens.flatMap((id) => buscarToken(id) ?? []);
            if (alvos.length !== pedido.tokens.length || alvos.some((t) => t.guardado)) return erro(c.ws, "Algum token não está no tabuleiro.");
            for (const alvo of alvos) {
                if (!definirCondicao(alvo.id, pedido.condicao, pedido.ligar)) return erro(c.ws, "Essa condição não existe.");
                avisarCada((c2) => (pecaOcultaPelaFog(c2, alvo) ? null : { tipo: "condicoes_atualizadas", id: alvo.id, condicoes: alvo.condicoes }));
                agendarGravacaoDoToken(alvo.id);
            }
            return;
        }
        case "iniciativa": {
            if (!c.mestre) return erro(c.ws, "Só o mestre mexe na iniciativa."); // (nesta etapa; o jogador rolar a do próprio token fica para depois)
            // Uma ação na ORDEM DE COMBATE (a lista, quem tem a vez, a rodada): o servidor confere, aplica com as regras de iniciativa.ts, guarda em mesa.json e avisa todos.
            let { acao } = pedido;
            if (acao.acao === "adicionar" && acao.token !== null) {
                const token = buscarToken(acao.token);
                if (!token) return erro(c.ws, "Esse token não existe.");
                if (acao.rolar) {
                    // "Adicionar à iniciativa" pelo token: o SERVIDOR rola a "Iniciativa" da ficha dele (o valor do pedido é ignorado); sem essa rolagem, entra com 0.
                    const rolado = rolarIniciativaDoToken(token, sortear);
                    if (rolado && !podeRolar(c)) return erro(c.ws, "Calma! Você está rolando rápido demais.");
                    if (rolado) avisarTodos({ tipo: "mensagem", mensagem: adicionarRolagemDeFicha(autor, rolado.resultado, token.id) });
                    acao = { acao: "adicionar", nome: acao.nome, token: acao.token, valor: rolado ? Math.round(rolado.total) : 0 };
                }
            }
            const resultado = aplicarAcaoDaIniciativa(acao);
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            avisarTodos({ tipo: "iniciativa_definida", iniciativa: iniciativaComoObjeto() });
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "arrastar_resultado": {
            // O TOTAL de uma rolagem do chat foi solto num token (só DANO): o cliente só diz QUAL token e QUAL mensagem; o servidor lê o total da mensagem, acha o status marcado com
            // "Valor subtraído por números arrastados", tira o valor e avisa todos (as mesmas regras da ação "Dano").
            const alvo = buscarToken(pedido.token);
            if (!alvo || alvo.guardado) return erro(c.ws, "Esse token não está no tabuleiro.");
            const total = totalDaRolagem(pedido.mensagem, pedido.indice, pedido.dado);
            if (total === null) return erro(c.ws, "Essa mensagem não é uma rolagem.");
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está agindo rápido demais.");
            const resultado = aplicarResultado(alvo, total);
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            publicarResultadoDeAcao(autor, alvo, resultado, frasePraChatDeDano(alvo, resultado));
            return;
        }
        case "definir_acoes": {
            if (!c.mestre) return erro(c.ws, "Só o mestre pode mudar as ações da mesa.");
            // As AÇÕES são da MESA INTEIRA (como os status): o servidor limpa a lista, guarda em mesa.json e avisa todos.
            if (!definirAcoesDaMesa(pedido.acoes)) return erro(c.ws, "Lista de ações inválida.");
            avisarTodos({ tipo: "acoes_definidas", acoes: estado.acoesDaMesa });
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "definir_status": {
            if (!c.mestre) return erro(c.ws, "Só o mestre pode mudar os status da mesa.");
            // A regra dos STATUS é da MESA INTEIRA: vale para todos os tokens e peças (sem escolher nenhum). O servidor limpa a lista, copia para todos, refaz os valores das peças
            // se a estrutura mudou, grava (mesa.json e o arquivo de cada token) e avisa todos.
            definirStatusDaMesa(pedido.status);
            avisarCada((c) => ({ tipo: "status_definidos", status: estado.statusDaMesa, pecas: estado.tokens.filter((t) => t.copiaDe !== null).map((t) => ({ id: t.id, valores: valoresParaConexao(c, t) })) }));
            for (const token of estado.tokens) agendarGravacaoDoToken(token.id);
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "criar_token":
            naFilaDeArquivos(() => criarTokenNoServidor(c, pedido));
            return;
        case "editar_token": {
            // A ESTRELA é de cada pessoa: qualquer um que veja o token favorita o dele; o resto do pedido segue as regras de sempre.
            let mudancas = pedido.mudancas;
            if (mudancas.favorito !== undefined) {
                const { favorito, ...resto } = mudancas;
                const alvoDaEstrela = buscarToken(pedido.id);
                if (!alvoDaEstrela || alvoDaEstrela.copiaDe !== null || !tokenParaConexaoSemEstrela(c, alvoDaEstrela)) return erro(c.ws, "Esse token não existe.");
                definirFavoritoDe(c.usuario, "tokens", alvoDaEstrela.id, favorito === true);
                for (const x of conexoes) if (x.usuario === c.usuario && x.jogador && x.ws.readyState === WebSocket.OPEN) { const v = tokenParaConexao(x, alvoDaEstrela); if (v) enviar(x.ws, { tipo: "token_editado", token: v }); }
                if (Object.keys(resto).length === 0) return;
                mudancas = resto;
            }
            // Ficha ÚNICA que já tem outro token: recusa com o motivo (o modelo de uma peça não conta: ela só espelha).
            const alvoDaEdicao = buscarToken(pedido.id);
            if (alvoDaEdicao && !podeNoToken(c, alvoDaEdicao, "editar")) return erro(c.ws, "Você só pode mudar as configurações dos tokens que o mestre liberou como EDITOR para você.");
            // Quem não é mestre não mexe nos GRUPOS nem na estrela (a liberação por grupo seria um atalho para dar acesso a si mesmo), e só liga uma ficha que pode editar.
            if (!c.mestre && (mudancas.grupos !== undefined || false)) return erro(c.ws, "Só o mestre mexe nos grupos e nos favoritos.");
            if (!c.mestre && typeof mudancas.ficha === "number") {
                const fichaLigada = estado.fichas.find((f) => f.id === mudancas.ficha);
                if (!fichaLigada || !podeNaFicha(c, fichaLigada, "editar")) return erro(c.ws, SEM_PERMISSAO);
            }
            if (alvoDaEdicao && alvoDaEdicao.copiaDe === null && typeof mudancas.ficha === "number") {
                const ocupada = motivoFichaOcupada(mudancas.ficha, alvoDaEdicao.id);
                if (ocupada) return erro(c.ws, ocupada);
            }
            // editarToken aplica as MESMAS regras da criação (nome aparado, tamanho de 1 a 4, cores válidas, imagem válida).
            const fichaAntes = alvoDaEdicao?.ficha ?? null;
            const token = editarToken(pedido.id, mudancas);
            if (!token) return erro(c.ws, "Esse token não existe.");
            // Trocou a FICHA ligada: quem tinha acesso ao token passa a ver a nova e deixa de ver a antiga (o acesso ao token vale para a ficha ligada).
            if (mudancas.ficha !== undefined && token.copiaDe === null && token.ficha !== fichaAntes) sincronizarVisaoDeTodos([token.id], fichaAntes === null ? [] : [fichaAntes]);
            avisarToken("token_editado", token);
            agendarGravacaoDoToken(token.id);
            if (mudancas.grupos !== undefined && token.copiaDe === null) sincronizarVisaoDeTodos([token.id], []); // (os grupos mudaram: quem tem acesso pelo grupo ganha ou perde este token)
            // Editar um token da BOLSA atualiza as PEÇAS dele no tabuleiro (visual, ficha, status): cada uma é avisada e regravada.
            if (token.copiaDe === null) {
                for (const peca of pecasDoModelo(token.id)) {
                    avisarToken("token_editado", peca);
                    agendarGravacaoDoToken(peca.id);
                }
            }
            return;
        }
        case "excluir_token": {
            const alvo = buscarToken(pedido.id);
            if (!alvo) return erro(c.ws, "Esse token não existe.");
            // Excluir o token da BOLSA é só do dono e do mestre; tirar uma PEÇA do tabuleiro (arrastá-la para a bolsa) vale para quem pode USAR o token: leitor, editor, dono e o mestre.
            if (!podeNoToken(c, alvo, alvo.copiaDe === null ? "excluir" : "usar")) return erro(c.ws, alvo.copiaDe === null ? "Só o dono do token e o mestre podem excluí-lo." : SEM_PERMISSAO);
            // Excluir um token da BOLSA também exclui as PEÇAS dele; excluir uma peça ("Remover do tabuleiro") só apaga ela. Cada arquivo some da pasta certa.
            const apagados = [alvo, ...(alvo.copiaDe === null ? pecasDoModelo(alvo.id) : [])].map((t) => ({ id: t.id, pasta: pastaDoToken(t) }));
            excluirTokenComPecas(pedido.id);
            if (alvo.copiaDe === null) {
                esquecerItem("tokens", alvo.id); // (some do documento de permissões)
                naFilaDeArquivos(() => gravarPermissoes());
                avisarPermissoes();
            }
            for (const { id, pasta } of apagados) {
                tokensSujos.delete(id); // não há mais o que gravar
                avisarTodos({ tipo: "token_excluido", id });
                naFilaDeArquivos(() => apagarDaPasta(pasta, id)); // e o arquivo dele some
            }
            return;
        }
        case "enviar_mensagem": {
            if (!podeEscrever(c)) return erro(c.ws, "Calma! Você está escrevendo rápido demais.");
            // adicionarMensagem aplica o limite de 72 caracteres e recusa texto vazio (devolve null).
            const mensagem = adicionarMensagem(autor, pedido.texto);
            if (!mensagem) return erro(c.ws, "Mensagem vazia ou longa demais.");
            avisarTodos({ tipo: "mensagem", mensagem });
            return;
        }
        case "rolar_dados": {
            if (!rolagemValida(pedido.lados, pedido.quantidade, pedido.modificador)) return erro(c.ws, "Rolagem inválida.");
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está rolando rápido demais.");
            const rolagem = rolarDados(pedido.lados, pedido.quantidade, pedido.modificador, sortear); // o SERVIDOR sorteia
            avisarTodos({ tipo: "mensagem", mensagem: adicionarRolagem(autor, rolagem) });
            return;
        }
        case "rolar_conta": {
            // O "/r" do chat: uma conta com dados digitada na hora (sem variáveis). Entra no MESMO limite das rolagens; o servidor confere a conta e sorteia.
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está rolando rápido demais.");
            const feito = rolarConta(pedido.texto, sortear);
            if (!feito.ok) return erro(c.ws, feito.erro);
            avisarTodos({ tipo: "mensagem", mensagem: adicionarRolagemDeFicha(autor, feito.valor) });
            return;
        }
        case "rolar_ficha": {
            // Rola a rolagem de uma ficha SALVA: o cliente só diz QUAL (ficha, versão, aba e posição); o texto e o sorteio são do servidor.
            const ficha = estado.fichas.find((f) => f.id === pedido.id);
            if (!ficha) return erro(c.ws, "Essa ficha não existe.");
            if (!podeNaFicha(c, ficha, "ler")) return erro(c.ws, SEM_PERMISSAO);
            if (ficha.versao !== pedido.versao) return erro(c.ws, "Esta ficha foi alterada. Feche e abra de novo para rolar.");
            const analise = analiseDaFicha(ficha, pedido.aba);
            if (!analise) return erro(c.ws, "Essa página não existe.");
            const resultado = rolarDaAnalise(analise, pedido.indice, ficha.nome, sortear); // o SERVIDOR sorteia
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está rolando rápido demais."); // (só gasta ficha do balde numa rolagem que de fato vai acontecer)
            // O token que "rolou": só vale se existe e tem ESTA ficha (se não, a mensagem sai sem token e o chat usa o ícone padrão).
            avisarTodos({ tipo: "mensagem", mensagem: adicionarRolagemDeFicha(autor, resultado.valor, tokenDaRolagem(ficha.id, pedido.token)) });
            return;
        }
        case "usar_cartao": {
            // Usa o CARTÃO de uma ficha SALVA: como na rolagem, o cliente só diz QUAL (ficha, versão, aba e posição); o texto, as contas e o sorteio são do servidor.
            const ficha = estado.fichas.find((f) => f.id === pedido.id);
            if (!ficha) return erro(c.ws, "Essa ficha não existe.");
            if (!podeNaFicha(c, ficha, "ler")) return erro(c.ws, SEM_PERMISSAO);
            if (ficha.versao !== pedido.versao) return erro(c.ws, "Esta ficha foi alterada. Feche e abra de novo para usar o cartão.");
            const analise = analiseDaFicha(ficha, pedido.aba);
            if (!analise) return erro(c.ws, "Essa página não existe.");
            const resultado = rolarCartaoDaAnalise(analise, pedido.indice, ficha.nome, sortear); // o SERVIDOR calcula e sorteia
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            if (!podeRolar(c)) return erro(c.ws, "Calma! Você está rolando rápido demais."); // (o limite anti-spam é o mesmo das rolagens)
            avisarTodos({ tipo: "mensagem", mensagem: adicionarCartaoDeFicha(autor, resultado.valor, tokenDaRolagem(ficha.id, pedido.token)) });
            return;
        }
        case "desenhar": {
            // Um desenho novo (lápis ou forma) no mapa atual: o pedido já foi conferido pela forma (`limparDesenho`); o servidor dá o id e o autor e avisa todos (todos podem desenhar).
            const meuMapa = mapaDaConexao(c);
            if (!c.mestre && meuMapa === null) return erro(c.ws, "Você não está em nenhum mapa.");
            const criado = adicionarDesenhoNoMapa(meuMapa, pedido.desenho, c.usuario);
            if (!criado) return erro(c.ws, "Este mapa já tem desenhos demais. Peça ao mestre para apagar alguns.");
            avisarCada((c2) => (mapaDaConexao(c2) === meuMapa && !desenhoOcultoPara(c2, criado, meuMapa) ? { tipo: "desenho_criado", desenho: criado, ...(pedido.ref !== undefined && { ref: pedido.ref }) } : null)); // (só quem vê o mapa vê o desenho)
            return;
        }
        case "apagar_desenhos": {
            // A borracha, o Ctrl+Z e o "Apagar tudo": o mestre apaga todos; os outros, só os desenhos que eles mesmos fizeram (o resto do pedido é ignorado).
            const meuMapa = mapaDaConexao(c);
            const apagados = apagarDesenhosDoMapa(meuMapa, pedido.ids, c.usuario, c.mestre);
            if (apagados.length === 0) {
                if (!c.mestre) erro(c.ws, "Você só pode apagar os desenhos que você mesmo fez.");
                return;
            }
            avisarCada((c2) => (mapaDaConexao(c2) === meuMapa ? { tipo: "desenhos_apagados", ids: apagados } : null));
            return;
        }
        case "liberar": {
            // O MESTRE libera (ou tira a liberação de) um token, uma ficha ou um GRUPO inteiro para um usuário, como leitor ou editor. Guarda em permissoes.json e refaz a visão dessa pessoa.
            if (!c.mestre) return erro(c.ws, "Só o mestre libera itens para os jogadores.");
            const { item, id, usuario, nivel } = pedido;
            if (item === "pastas") {
                // Liberar uma PASTA: vale para ela, para as pastas dentro dela e para os tokens/fichas que estão nelas.
                if (!estado.pastas.some((p) => p.id === id)) return erro(c.ws, "Essa pasta não existe.");
                const registro = (permissoes.pastas[String(id)] ??= { dono: null, acessos: {} });
                if (nivel === null) delete registro.acessos[usuario];
                else registro.acessos[usuario] = nivel;
                naFilaDeArquivos(() => gravarPermissoes());
                avisarPermissoes();
                refazerVisaoDasPastas();
                return;
            }
            if (item === "grupos") {
                if (!estado.grupos.some((g) => g.id === id)) return erro(c.ws, "Esse grupo não existe.");
                const doGrupo = (permissoes.grupos[String(id)] ??= {});
                if (nivel === null) delete doGrupo[usuario];
                else doGrupo[usuario] = nivel;
                if (Object.keys(doGrupo).length === 0) delete permissoes.grupos[String(id)];
            } else {
                const existe = item === "tokens" ? buscarToken(id)?.copiaDe === null : estado.fichas.some((f) => f.id === id);
                if (!existe) return erro(c.ws, item === "tokens" ? "Esse token não existe." : "Essa ficha não existe.");
                // O token e a ficha são liberados SEPARADAMENTE (pedido do dono, 17/11/2026): compartilhar um não leva o outro, mesmo ligados.
                const registro = (permissoes[item][String(id)] ??= { dono: null, acessos: {} });
                if (nivel === null) delete registro.acessos[usuario];
                else registro.acessos[usuario] = nivel;
            }
            naFilaDeArquivos(() => gravarPermissoes());
            avisarPermissoes();
            // quem é afetado: o próprio item, ou todos os tokens e fichas do grupo
            const tokensAfetados = item === "tokens" ? [id] : item === "fichas" ? [] : estado.tokens.filter((t) => t.copiaDe === null && t.grupos.includes(id)).map((t) => t.id);
            const fichasAfetadas = item === "fichas" ? [id] : item === "tokens" ? [] : estado.fichas.filter((f) => f.grupos.includes(id)).map((f) => f.id);
            sincronizarVisaoDe(usuario, tokensAfetados, fichasAfetadas);
            return;
        }
        case "definir_limites": {
            if (!c.mestre) return erro(c.ws, "Só o mestre muda os limites da mesa.");
            permissoes.limites = { tokensPorJogador: Math.min(pedido.tokens, LIMITE_MAXIMO_POR_JOGADOR), fichasPorJogador: Math.min(pedido.fichas, LIMITE_MAXIMO_POR_JOGADOR) };
            naFilaDeArquivos(() => gravarPermissoes());
            avisarPermissoes();
            return;
        }
        case "definir_quem_ve_mapa": {
            // O mestre escolhe quem vê um mapa (todos os jogadores, jogadores específicos ou só ele). Quem passa a não ver o mapa ATUAL recebe o tabuleiro vazio, e vice-versa.
            if (!c.mestre) return erro(c.ws, "Só o mestre escolhe quem vê um mapa.");
            const { id, todos, usuarios } = pedido;
            naFilaDeArquivos(async () => {
                if (!(await definirQuemVeMapa(id, todos, usuarios))) return erro(c.ws, "Esse mapa não existe.");
                avisarMapasDefinidos();
                avisarMapaAtual(false, id); // (quem está nesse mapa recebe o que pode ver dele)
            });
            return;
        }
        case "banir": {
            // O mestre bane (ou desbane) um jogador: o banido é desconectado na hora e não consegue entrar de novo. Não se bane um mestre nem a si mesmo.
            if (!c.mestre) return erro(c.ws, "Só o mestre bane jogadores.");
            if (pedido.banir) {
                if (pedido.usuario === c.usuario) return erro(c.ws, "Você não pode banir a si mesmo.");
                if (pedido.usuario === permissoes.dono || permissoes.mestres.includes(pedido.usuario) || [...conexoes].some((x) => x.usuario === pedido.usuario && x.mestre)) return erro(c.ws, "Não dá para banir um mestre: tire o poder de mestre antes.");
                if (!estaBanido(permissoes, pedido.usuario)) {
                    const conhecido = [...conexoes].find((x) => x.usuario === pedido.usuario)?.jogador?.apelido;
                    permissoes.banidos.push({ usuario: pedido.usuario, nome: (conhecido ?? pedido.nome ?? pedido.usuario).slice(0, 40) });
                }
                for (const x of [...conexoes]) {
                    if (x.usuario !== pedido.usuario) continue;
                    erro(x.ws, "Você foi banido desta mesa.");
                    x.ws.close(1008, "Banido.");
                }
            } else {
                permissoes.banidos = permissoes.banidos.filter((b) => b.usuario !== pedido.usuario);
            }
            naFilaDeArquivos(() => gravarPermissoes());
            avisarPermissoes();
            return;
        }
        case "definir_mestre": {
            // O mestre dá (ou tira) o poder de mestre a outro usuário. O DONO do servidor nunca perde o poder; ninguém tira o próprio poder por engano (use outro mestre).
            if (!c.mestre) return erro(c.ws, "Só o mestre dá o poder de mestre.");
            if (pedido.usuario === permissoes.dono) return erro(c.ws, "O dono do servidor sempre é mestre.");
            if (!pedido.mestre && pedido.usuario === c.usuario) return erro(c.ws, "Peça a outro mestre para tirar o seu poder.");
            const lista = permissoes.mestres.filter((m) => m !== pedido.usuario);
            permissoes.mestres = pedido.mestre ? [...lista, pedido.usuario] : lista;
            naFilaDeArquivos(() => gravarPermissoes());
            atualizarPapeisConectados();
            avisarPermissoes();
            return;
        }
        case "definir_mapa": {
            // O MESTRE troca o mapa atual (um id da biblioteca, ou null): o servidor confere que ele existe, guarda em mesa.json e avisa todos. O tamanho do tabuleiro acompanha pelo pedido `definir_tamanho` do mestre.
            if (!c.mestre) return erro(c.ws, "Só o mestre pode trocar o mapa.");
            if (pedido.id !== null && !acharMapa(pedido.id)) return erro(c.ws, "Esse mapa não existe.");
            const mapaAnterior = mapaAtual;
            if (mapaAnterior !== null && mapaAnterior !== pedido.id) {
                const tamanhoAnterior = { colunas: estado.colunas, linhas: estado.linhas };
                lembrarTamanhoDaCena(mapaAnterior, tamanhoAnterior.colunas, tamanhoAnterior.linhas); // (a cena que o mestre deixa guarda o tamanho e a grade dela)
                lembrarGradeDaCena(mapaAnterior, estado.grade);
            }
            definirMapaDoMestre(pedido.id);
            definirMapaAtual(mapaAtual);
            // A PRIMEIRA vez que a mesa ganha um mapa, as peças que já estavam no tabuleiro (colocadas sem mapa) passam a ser deste: senão sumiriam de vista.
            if (mapaAnterior === null && mapaAtual !== null) {
                for (const p of estado.tokens.filter((t) => t.copiaDe !== null && t.mapa === null)) {
                    p.mapa = mapaAtual;
                    avisarToken("token_editado", p);
                    agendarGravacaoDoToken(p.id);
                }
            } // (as peças novas nascem com o mapa que está à vista)
            // O tamanho do tabuleiro que acompanha o mapa (a previsão do mestre) é aplicado AQUI, com as mesmas regras do `definir_tamanho` (limites, tokens puxados para dentro), e vai no MESMO evento: cada
            // navegador baixa a imagem e só então troca o mapa e o tamanho, de uma vez.
            const guardado = configDaCena(mapaAtual);
            if (guardado.grade) definirGradeDaMesa(guardado.grade); // (a grade deste mapa; um mapa novo, sem grade guardada, começa com a de agora)
            else if (mapaAtual !== null) {
                // Um mapa usado pela PRIMEIRA vez começa com a grade de 1 px PRETA, para ajudar a alinhar (pedido do dono, 17/11/2026); depois vale o que o mestre configurar.
                definirGradeDaMesa({ espessura: 1, cor: "#000000" });
                lembrarGradeDaCena(mapaAtual, estado.grade);
                avisarCada((c2) => (mapaDaConexao(c2) === mapaAtual ? { tipo: "grade_definida", grade: estado.grade } : null));
            }
            // O tamanho que o mestre CONFIGUROU para o mapa vale sempre (os mapas lembram as colunas e linhas); a previsão pela imagem (o pedido) só vale para um mapa SEM tamanho guardado (recém-enviado).
            const tamanhoNovo = guardado.colunas !== undefined && guardado.linhas !== undefined ? { colunas: guardado.colunas, linhas: guardado.linhas } : pedido.colunas !== undefined && pedido.linhas !== undefined ? { colunas: pedido.colunas, linhas: pedido.linhas } : null;
            const comTamanho = tamanhoNovo !== null;
            const movidos = tamanhoNovo ? definirTamanhoTabuleiro(tamanhoNovo.colunas, tamanhoNovo.linhas) : [];
            const idNovo = mapaAtual;
            if (comTamanho) lembrarTamanhoDaCena(idNovo, estado.colunas, estado.linhas);
            if (comTamanho && ajustarFogAoTamanho(idNovo, estado.colunas, estado.linhas)) avisarFogDoMapa(idNovo);
            // SÓ o mestre vai para o mapa novo: os jogadores ficam onde estavam, até o mestre "mover jogadores" (pedido do dono, 17/11/2026).
            for (const x of conexoes) if (x.mestre) avisarMapaDe(x, true);
            avisarMapasDefinidos();
            avisarJogadores();
            for (const token of movidos) agendarGravacaoDoToken(token.id);
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "criar_pasta": {
            // Uma PASTA nova na bolsa. O mestre cria em qualquer lugar; um JOGADOR cria na raiz ou dentro de uma pasta onde pode editar, e vira o DONO dela.
            if (!c.mestre && pedido.pai !== null && !podeEditarPasta(c, pedido.pai)) return erro(c.ws, "Você não pode criar pastas dentro desta pasta.");
            const pasta = montarPasta(pedido.tipoDaPasta, pedido.nome, pedido.pai);
            if (!pasta) return erro(c.ws, "Não foi possível criar a pasta (a pasta de cima não existe, ou o limite de pastas da mesa foi atingido).");
            naFilaDeArquivos(async () => {
                await gravarNaPasta("pastas", pasta);
                receberPasta(pasta);
                if (!c.mestre) {
                    permissoes.pastas[String(pasta.id)] = { dono: c.usuario, acessos: {} };
                    await gravarPermissoes();
                    avisarPermissoes();
                }
                avisarPasta(pasta);
            });
            return;
        }
        case "editar_pasta": {
            // Renomear e/ou pôr dentro de outra pasta: o mestre, o dono da pasta ou quem é editor dela. Mover leva junto tudo o que está dentro (e a permissão herdada muda: a visão é refeita).
            const pasta = estado.pastas.find((p) => p.id === pedido.id);
            if (!pasta || (!c.mestre && !pastaParaConexao(c, pasta))) return erro(c.ws, "Essa pasta não existe.");
            if (!podeEditarPasta(c, pasta.id)) return erro(c.ws, "Você não pode mudar esta pasta.");
            if (pedido.nome !== undefined) pasta.nome = limparNomeDePasta(pedido.nome);
            const mudouDeLugar = pedido.pai !== undefined && pedido.pai !== pasta.pai;
            if (mudouDeLugar) {
                const destino = pedido.pai ?? null;
                if (!podeMoverPasta(pasta.id, destino)) return erro(c.ws, "Não dá para pôr a pasta aí (dentro dela mesma, ou numa pasta de outro tipo).");
                if (!c.mestre && destino !== null && !podeEditarPasta(c, destino)) return erro(c.ws, "Você não pode pôr pastas dentro desta pasta.");
                pasta.pai = destino;
            }
            naFilaDeArquivos(() => gravarNaPasta("pastas", pasta));
            if (mudouDeLugar) refazerVisaoDasPastas();
            else avisarPasta(pasta);
            return;
        }
        case "excluir_pasta": {
            // Apagar uma pasta (o mestre ou o dono): o que estava dentro SOBE para a pasta de cima; nenhum token ou ficha é apagado.
            const pasta = estado.pastas.find((p) => p.id === pedido.id);
            if (!pasta || (!c.mestre && !pastaParaConexao(c, pasta))) return erro(c.ws, "Essa pasta não existe.");
            if (!c.mestre && permissoes.pastas[String(pasta.id)]?.dono !== c.usuario) return erro(c.ws, "Só o dono da pasta e o mestre podem apagá-la.");
            const mudou = excluirPasta(pasta.id);
            if (!mudou) return;
            delete permissoes.pastas[String(pasta.id)];
            naFilaDeArquivos(async () => {
                await apagarDaPasta("pastas", pasta.id);
                for (const p of mudou.pastas) await gravarNaPasta("pastas", p);
                for (const f of mudou.fichas) await gravarNaPasta("fichas", f);
                await gravarPermissoes();
            });
            for (const t of mudou.tokens) agendarGravacaoDoToken(t.id);
            avisarCada(() => ({ tipo: "pasta_excluida", id: pasta.id }));
            avisarPermissoes();
            refazerVisaoDasPastas();
            return;
        }
        case "mover_para_pasta": {
            // ARRASTAR tokens ou fichas para uma pasta (ou para a raiz). Quem não é mestre só move o que pode EDITAR, e só para uma pasta onde pode editar.
            if (pedido.pasta !== null) {
                const destino = estado.pastas.find((p) => p.id === pedido.pasta);
                if (!destino || destino.tipo !== pedido.item || (!c.mestre && !pastaParaConexao(c, destino))) return erro(c.ws, "Essa pasta não existe.");
                if (!podeEditarPasta(c, destino.id)) return erro(c.ws, "Você não pode pôr itens nesta pasta.");
            }
            const permitidos = pedido.ids.filter((id) => {
                if (pedido.item === "tokens") {
                    const t = buscarToken(id);
                    return !!t && t.copiaDe === null && podeNoToken(c, t, "editar");
                }
                const f = estado.fichas.find((x) => x.id === id);
                return !!f && podeNaFicha(c, f, "editar");
            });
            if (permitidos.length === 0) return erro(c.ws, SEM_PERMISSAO);
            const mudaram = moverParaPasta(pedido.item, permitidos, pedido.pasta);
            for (const item of mudaram) {
                if (pedido.item === "tokens") {
                    agendarGravacaoDoToken(item.id);
                    avisarToken("token_editado", item as Token);
                } else {
                    naFilaDeArquivos(() => gravarNaPasta("fichas", item as Ficha));
                    avisarFicha("ficha_editada", item as Ficha);
                }
            }
            // (a pasta pode dar ou tirar acesso: quem passa a ver ou deixa de ver os itens recebe a atualização)
            sincronizarVisaoDeTodos(pedido.item === "tokens" ? mudaram.map((i) => i.id) : [], pedido.item === "fichas" ? mudaram.map((i) => i.id) : []);
            return;
        }
        case "fog_ativar": {
            // O MESTRE liga ou desliga o fog de um mapa. Ao ligar, o mapa começa todo COBERTO (a menos que `cobrirTudo` seja falso) e o mestre vai revelando.
            if (!c.mestre) return erro(c.ws, "Só o mestre mexe no fog.");
            const idDoFog = pedido.mapa === "_" ? null : pedido.mapa;
            if (idDoFog !== null && !acharMapa(idDoFog)) return erro(c.ws, "Esse mapa não existe.");
            if (pedido.ativo) {
                const tamanho = tamanhoDoMapa(idDoFog);
                ativarFog(idDoFog, tamanho.colunas, tamanho.linhas, pedido.cobrirTudo ?? true);
            } else desativarFog(idDoFog);
            avisarFogDoMapa(idDoFog);
            return;
        }
        case "fog_pintar": {
            // O MESTRE pinta o fog do mapa em que está (cobre ou revela). O servidor guarda e avisa quem está nesse mapa; os jogadores nunca editam o fog.
            if (!c.mestre) return erro(c.ws, "Só o mestre mexe no fog.");
            if (!pintarFog(mapaAtual, pedido.tracos)) return erro(c.ws, "Ligue o fog neste mapa antes de pintar.");
            avisarFogPintado(mapaAtual, pedido.tracos);
            return;
        }
        case "fog_preencher": {
            if (!c.mestre) return erro(c.ws, "Só o mestre mexe no fog.");
            if (!preencherFog(mapaAtual, pedido.cobrir)) return erro(c.ws, "Ligue o fog neste mapa antes de cobrir ou revelar tudo.");
            avisarFogDoMapa(mapaAtual);
            return;
        }
        case "mover_jogadores": {
            // O mestre leva TODOS os jogadores para o mapa em que ele está (quem não pode ver esse mapa fica com o tabuleiro vazio).
            if (!c.mestre) return erro(c.ws, "Só o mestre move os jogadores.");
            mapaDoUsuario.clear();
            for (const x of conexoes) {
                if (x.mestre || !x.jogador) continue;
                irParaMapa(x, mapaAtual);
                avisarMapaDe(x, true);
            }
            avisarMapasDefinidos(); // (a biblioteca de cada jogador é só o mapa em que ele está)
            avisarJogadores();
            return;
        }
        case "excluir_mapa": {
            // O MESTRE apaga um mapa da biblioteca (o arquivo também). Se era o mapa atual, a mesa fica sem mapa.
            if (!c.mestre) return erro(c.ws, "Só o mestre pode apagar mapas.");
            const id = pedido.id;
            if (!acharMapa(id)) return erro(c.ws, "Esse mapa não existe.");
            naFilaDeArquivos(async () => {
                await apagarMapa(id);
                esquecerCena(id); // (a configuração da cena vai junto)
                esquecerFog(id); // (e o fog dele)
                // As peças que estavam NESSE mapa vão embora com ele (cada mapa guarda as suas); os modelos da bolsa ficam.
                for (const p of estado.tokens.filter((t) => t.copiaDe !== null && t.mapa === id)) {
                    excluirTokenComPecas(p.id);
                    tokensSujos.delete(p.id);
                    avisarTodos({ tipo: "token_excluido", id: p.id });
                    naFilaDeArquivos(() => apagarDaPasta("pecas", p.id));
                }
                const afetados = [...conexoes].filter((x) => !x.mestre && x.mapaVisto === id);
                for (const [u, m] of mapaDoUsuario) if (m === id) mapaDoUsuario.delete(u);
                if (mapaAtual === id) {
                    definirMapaDoMestre(null);
                    definirMapaAtual(null);
                    await gravarMesaAtual();
                }
                for (const x of afetados) irParaMapa(x, mapaAtual); // (quem estava no mapa apagado vai para o do mestre)
                for (const x of conexoes) if (x.mestre || afetados.includes(x)) avisarMapaDe(x, true);
                avisarMapasDefinidos();
                avisarJogadores();
            });
            return;
        }
        case "marcar_ficha":
            naFilaDeArquivos(() => marcarFichaNoServidor(c, pedido));
            return;
        case "criar_grupo":
            naFilaDeArquivos(() => criarGrupoNoServidor(c, pedido));
            return;
        case "editar_grupo":
            naFilaDeArquivos(() => editarGrupoNoServidor(c, pedido));
            return;
        case "excluir_grupo": {
            const id = pedido.id;
            naFilaDeArquivos(() => excluirGrupoNoServidor(c, id));
            return;
        }
        case "criar_ficha":
            naFilaDeArquivos(() => criarFichaNoServidor(c, pedido.token));
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

wss.on("connection", (ws, requisicao: IncomingMessage) => {
    const conexao: Conexao = {
        id: novoIdDeConexao(),
        ws,
        jogador: null,
        inicioDaJanela: Date.now(),
        mensagensNaJanela: 0,
        baldeRolagens: novoBalde(RAJADA_ROLAGENS),
        baldeChat: novoBalde(RAJADA_CHAT),
        ...(() => {
            const r = papelDaRequisicao(requisicao);
            return "papel" in r ? { papel: r.papel, recusa: null } : { papel: null, recusa: r.recusa };
        })(),
        usuario: "",
        desenhosVistos: "",
        pecasEscondidas: new Set<number>(),
        mapaVisto: null,
        mestre: false, // (definido ao entrar: papel mestre OU poder de mestre guardado no permissoes.json)
    };
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
            avisarJogadores();
        }
    });
    ws.on("error", () => ws.terminate());
});

/**
 * MIGRAÇÃO (arquivos de antes das PEÇAS): um token da bolsa que estava no tabuleiro (`guardado: false`) vira um token na bolsa + UMA PEÇA na mesma posição (com as
 * condições e os valores que ele tinha), para o tabuleiro continuar igual. Só acontece uma vez: depois o token já está na bolsa e a peça tem arquivo próprio.
 */
async function migrarTokensDoTabuleiro(): Promise<void> {
    for (const modelo of estado.tokens.filter((t) => t.copiaDe === null && !t.guardado)) {
        const peca = montarPeca(modelo.id, modelo.col, modelo.row);
        modelo.guardado = true; // (a partir daqui o token fica na bolsa)
        if (peca) {
            peca.condicoes = [...modelo.condicoes];
            if (modelo.valores.length > 0) peca.valores = modelo.valores.map((v) => ({ ...v }));
            receberToken(peca);
            await gravarNaPasta("pecas", peca);
            console.log(`Migrado: "${modelo.nome}" estava no tabuleiro: agora é um token na bolsa + uma peça em (${modelo.col}, ${modelo.row}).`);
        }
        modelo.condicoes = [];
        modelo.valores = [];
        await gravarNaPasta("tokens", modelo);
    }
}

// Antes de aceitar conexões, lê as fichas e os tokens que estão gravados na pasta de dados (se ela não existir, é criada).
try {
    // O tamanho do tabuleiro vem ANTES de tudo: as posições dos tokens e das peças são conferidas com ele ao carregar.
    const mesa = await carregarMesa();
    if (mesa) definirTamanhoTabuleiro(mesa.colunas, mesa.linhas);
    await carregarPermissoes(); // (quem é dono de quê e o que foi liberado: `dados/permissoes.json`)
    await carregarPreferencias(); // (os favoritos de cada usuário: `dados/usuarios.json`; migra do permissoes.json na 1ª vez)
    await carregarDesenhos(); // (os desenhos de cada mapa: `dados/desenhos.json`)
    const fichasLidas = await carregarPasta("fichas", fichaValida, TAMANHO_MAX_ARQUIVO_FICHA);
    const tokensLidos = await carregarPasta("tokens", tokenValido, TAMANHO_MAX_ARQUIVO_TOKEN);
    const pecasLidas = await carregarPasta("pecas", tokenValido, TAMANHO_MAX_ARQUIVO_TOKEN);
    const gruposLidos = await carregarPasta("grupos", grupoValido, TAMANHO_MAX_ARQUIVO_GRUPO);
    const pastasLidas = await carregarPasta("pastas", pastaValida, TAMANHO_MAX_ARQUIVO_PASTA); // as PASTAS da bolsa (dados/pastas/)
    definirPastas(pastasLidas.itens, pastasLidas.maiorId + 1);
    // (O 2º argumento reserva os ids de arquivos IGNORADOS por estarem estragados: um item novo nunca os sobrescreve.)
    definirFichas(fichasLidas.itens, fichasLidas.maiorId + 1);
    if (mesa?.valores !== undefined) definirTodosOsValoresDasFichas(mesa.valores);
    if (mesa?.iniciativa !== undefined) definirIniciativa(mesa.iniciativa); // (a ordem de combate sobrevive a reiniciar o servidor) // (os valores atuais das variáveis que mudam; só de fichas que existem)
    // Os tokens da bolsa (modelos) e as peças do tabuleiro dividem a MESMA sequência de ids (e os ids de arquivos ignorados continuam reservados).
    definirTokens([...tokensLidos.itens, ...pecasLidas.itens], Math.max(tokensLidos.maiorId, pecasLidas.maiorId) + 1);
    // Uma peça cujo modelo já não existe é um resto (o arquivo continua na pasta, intacto, para o dono ver): sai da memória.
    estado.tokens = estado.tokens.filter((t) => t.copiaDe === null || estado.tokens.some((m) => m.id === t.copiaDe && m.copiaDe === null));
    definirGrupos(gruposLidos.itens, gruposLidos.maiorId + 1);
    // (um arquivo pode citar um grupo que já foi apagado: a marca é descartada para não sobrar grupo fantasma)
    for (const item of [...estado.tokens, ...estado.fichas]) item.grupos = item.grupos.filter((g) => estado.grupos.some((gr) => gr.id === g));
    // (idem para a ficha de um token: se ela foi apagada, o token fica sem ficha)
    for (const token of estado.tokens) if (token.ficha !== null && !fichaExiste(token.ficha)) token.ficha = null;
    // A regra dos STATUS só depois dos GRUPOS (ela cita grupos, e os que não existem mais são descartados): se viesse antes, todos os grupos seriam descartados e o status
    // não valeria para ninguém depois de reiniciar. Cada arquivo de token traz uma cópia da lista, que pode estar velha: vale a da mesa.
    if (mesa?.grade !== undefined) definirGradeDaMesa(mesa.grade);
    if (mesa?.status !== undefined) carregarStatusDaMesa(mesa.status);
    if (mesa?.acoes !== undefined) carregarAcoesDaMesa(mesa.acoes);
    aplicarStatusDaMesaAosTokens();
    await migrarTokensDoTabuleiro(); // (usa os grupos e os status: por isso por último)
    for (const ficha of estado.fichas) sincronizarValoresDaFicha(ficha.id); // (as barras ligadas a variáveis que mudam espelham o valor atual da ficha)
    // A BIBLIOTECA DE MAPAS: lê o índice, escolhe o mapa atual (o da mesa, se ainda existe) e, UMA vez, cria os mapas de exemplo que vêm com o site.
    await carregarMapas();
    if (mesa?.mapa !== undefined) definirMapaDoMestre(mesa.mapa !== null && acharMapa(mesa.mapa) ? mesa.mapa : null);
    if (mesa?.mapasDeExemplo === true) mapasDeExemploCriados = true;
    else if (!SEM_EXEMPLOS) {
        const pastas = [join(PASTA_DO_SITE, "images", "maps"), resolve(dirname(fileURLToPath(import.meta.url)), "..", "public", "images", "maps")];
        let inicial: string | null = null;
        for (const pasta of pastas) {
            inicial = await criarMapasDeExemplo(pasta);
            if (inicial !== null) break;
        }
        if (inicial !== null && mesa?.mapa === undefined) definirMapaDoMestre(inicial); // (uma mesa NOVA já abre com o mapa de exemplo)
        mapasDeExemploCriados = true;
        await gravarMesaAtual();
        console.log(`Mapas de exemplo criados (${listaDeMapas().length}).`);
    }
    definirMapaAtual(mapaAtual);
    await carregarCenas(); // (o tamanho e a grade de cada cena: dados/cenas.json; migra do índice dos mapas na 1ª vez)
    await carregarFog(); // (o fog de cada mapa: dados/fog.json)
    const cenaDoMestre = configDaCena(mapaAtual);
    if (cenaDoMestre.grade) definirGradeDaMesa(cenaDoMestre.grade);
    else lembrarGradeDaCena(mapaAtual, estado.grade);
    if (cenaDoMestre.colunas === undefined) lembrarTamanhoDaCena(mapaAtual, estado.colunas, estado.linhas); // (o mapa atual ainda sem tamanho próprio guarda o da mesa)
    // Peças de arquivos ANTIGOS (sem o mapa gravado) passam a pertencer ao mapa que está à vista agora.
    for (const p of estado.tokens.filter((t) => t.copiaDe !== null && t.mapa === null && mapaAtual !== null)) {
        p.mapa = mapaAtual;
        agendarGravacaoDoToken(p.id);
    }
    if (mesa?.exemplos === true) exemplosCriados = true;
    else if (!SEM_EXEMPLOS) {
        await semearExemplos();
        exemplosCriados = true;
        await gravarMesaAtual(); // (guarda a marca: se o dono apagar os exemplos, eles não voltam)
        console.log("Fichas de exemplo criadas: Goblin Guerreiro e Thorin Escudo-de-Carvalho (com seus tokens na bolsa).");
    }
    console.log(`${estado.fichas.length} ficha(s), ${estado.tokens.length} token(s) e ${estado.grupos.length} grupo(s) carregado(s) de ${PASTA_DE_DADOS}`);
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
    console.log("\nPARA ENTRAR (o PAPEL é OBRIGATÓRIO no endereço; sem ele a conexão é recusada):");
    console.log(`  Mestre (só no computador do servidor): http://127.0.0.1:${porta}/?online&nome=SeuNome&papel=mestre`);
    console.log(`  Jogador (de qualquer lugar):           http://127.0.0.1:${porta}/?online&nome=Ana&papel=jogador   (pelo túnel, troque o começo pelo endereço do túnel)`);
    console.log("  No desenvolvimento, use o Vite (http://127.0.0.1:5173/?online&nome=SeuNome&papel=mestre) em duas abas, uma de cada papel.");
    console.log("  Atrás de um túnel (cloudflared) ninguém vira mestre: o servidor reconhece o túnel e só aceita jogadores de fora.");
    console.log(SENHA_DA_MESA !== "" ? "  SENHA DA MESA ligada: quem vem de fora precisa acrescentar &senha=<a senha> ao endereço.\n" : "  Dica: SENHA_MESA=algo npm run servidor pede uma senha a quem entra de fora (&senha=algo no endereço).\n");
});

process.on("SIGINT", async () => {
    console.log("\nDesligando o servidor...");
    for (const c of conexoes) c.ws.close(1001, "Servidor desligando.");
    // Grava as posições que ainda estavam esperando (um token que acabou de andar não pode ser perdido).
    if (gravacaoAgendada) clearTimeout(gravacaoAgendada);
    gravarTokensSujos();
    await gravarDesenhosPendentes(); // (os últimos traços também)
    gravarFogAgora(); // (e o fog)
    await filaDeArquivos;
    servidorHttp.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
});
