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
    TAMANHO_MAX_ARQUIVO_TOKEN,
    TAMANHO_MAX_MENSAGEM_REDE,
} from "../src/config.ts";
import { rolarDados } from "../src/dados.ts";
import {
    adicionarMensagem,
    adicionarRolagem,
    adicionarRolagemDeFicha,
    tokenDaRolagem,
    montarPeca,
    pecasDoModelo,
    restaurarEstadoDaPeca,
    buscarToken,
    colocarToken,
    definirFichas,
    definirGrupos,
    aplicarAcao,
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
    definirTamanhoTabuleiro,
    definirTokens,
    editarToken,
    estado,
    excluirFicha,
    excluirTokenComPecas,
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
import { ABAS_THORIN, IMAGEM_GOBLIN, NOME_GOBLIN, NOME_THORIN, TEXTO_GOBLIN } from "../src/exemplos.ts";
import { analisarAbas, rolarDaAnalise, type AnaliseDaFicha } from "../src/formulas.ts";
import { gastar, novoBalde, type Balde } from "../src/limite.ts";
import { lerPedido, limparApelido, type EventoDoServidor, type Jogador, type PedidoDoCliente } from "../src/protocolo.ts";
import { apagarDaPasta, carregarMesa, carregarPasta, gravarMesa, gravarNaPasta, PASTA_DE_DADOS, type NomeDaPasta } from "./dados.ts";

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
    baldeRolagens: Balde; // LIMITE ANTI-SPAM: rolagens de dados e de fichas (as duas dividem o mesmo balde)
    baldeChat: Balde; // LIMITE ANTI-SPAM: mensagens do chat
}

// Para os TESTES automáticos (que rolam e escrevem muito rápido): SEM_LIMITE_SPAM=1 desliga o limite anti-spam. Em uso normal fica ligado.
const SEM_LIMITE_SPAM = process.env.SEM_LIMITE_SPAM === "1";
const podeRolar = (c: Conexao): boolean => SEM_LIMITE_SPAM || gastar(c.baldeRolagens, RAJADA_ROLAGENS, MS_RECARGA_ROLAGEM);
const podeEscrever = (c: Conexao): boolean => SEM_LIMITE_SPAM || gastar(c.baldeChat, RAJADA_CHAT, MS_RECARGA_CHAT);

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
    const resultado = montarEdicaoDaFicha(pedido.id, pedido.versao, { nome: pedido.nome, abas: pedido.abas });
    if (!resultado.ok) {
        if (resultado.erro === "versao_antiga") {
            const atual = estado.fichas.find((f) => f.id === pedido.id);
            if (atual) enviar(c.ws, { tipo: "ficha_conflito", ficha: atual });
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
    const soltos = estado.tokens.filter((t) => t.ficha === id); // (excluirFicha os deixa SEM ficha: é preciso avisar e regravar cada um)
    excluirFicha(id);
    analisesDasFichas.delete(id);
    naFilaDeArquivos(() => gravarMesaAtual()); // (os valores atuais dela saem do mesa.json)
    avisarTodos({ tipo: "ficha_excluida", id });
    for (const token of soltos) {
        avisarTodos({ tipo: "token_editado", token });
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
    const ficha = montarMarcacaoDaFicha(pedido.id, { favorito: pedido.favorito, grupos: pedido.grupos });
    if (!ficha) return erro(c.ws, "Essa ficha não existe.");
    try {
        await gravarNaPasta("fichas", ficha);
    } catch (falha) {
        console.error(`Não foi possível gravar a ficha ${ficha.id}:`, falha);
        return erro(c.ws, "Não foi possível gravar a ficha no servidor.");
    }
    receberFicha(ficha);
    avisarTodos({ tipo: "ficha_editada", ficha }); // (mesma versão: quem edita a ficha não vê conflito nenhum)
}

/** Cria o grupo: grava o arquivo ANTES de guardá-lo na mesa e avisar todos. */
async function criarGrupoNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "criar_grupo" }>): Promise<void> {
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
        avisarTodos({ tipo: "status_definidos", status: estado.statusDaMesa, pecas: estado.tokens.filter((t) => t.copiaDe !== null).map((t) => ({ id: t.id, valores: t.valores })) });
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
    return gravarMesa({ colunas: estado.colunas, linhas: estado.linhas, status: estado.statusDaMesa, acoes: estado.acoesDaMesa, valores: todosOsValoresDasFichas(), exemplos: exemplosCriados }).catch((falha) => console.error("Não foi possível gravar mesa.json:", falha));
}

/** A pasta de um token: os tokens da BOLSA (modelos) em `dados/tokens/`, as PEÇAS do tabuleiro em `dados/pecas/`. */
const pastaDoToken = (token: Token): NomeDaPasta => (token.copiaDe === null ? "tokens" : "pecas");

/** "Arrastar um token da bolsa para o tabuleiro": cria a PEÇA (cópia temporária), grava o arquivo dela e avisa todos. O token da bolsa não muda. */
async function criarPecaNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "colocar_modelo" }>): Promise<void> {
    const modelo = buscarToken(pedido.modelo);
    const motivo = modelo ? motivoParaNaoColocar(modelo) : null; // ficha de jogador (variáveis que mudam): só um token por tela
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
    avisarTodos({ tipo: "peca_criada", token: peca });
}

async function criarTokenNoServidor(c: Conexao, pedido: Extract<PedidoDoCliente, { tipo: "criar_token" }>): Promise<void> {
    if (pedido.ficha != null && !fichaExiste(pedido.ficha)) return erro(c.ws, "Essa ficha não existe.");
    const token = montarToken(pedido.cor, pedido.tamanho, pedido.nome, pedido.imagem, pedido.corBorda, pedido.ficha ?? null);
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
            if (token) await gravarNaPasta(pastaDoToken(token), token);
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
        enviar(c.ws, { tipo: "estado_inicial", voce: c.jogador, colunas: estado.colunas, linhas: estado.linhas, status: estado.statusDaMesa, acoes: estado.acoesDaMesa, tokens: estado.tokens, mensagens: estado.mensagens, fichas: estado.fichas, grupos: estado.grupos, valores: todosOsValoresDasFichas() });
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
                enviar(c.ws, token.guardado ? { tipo: "token_guardado", id: token.id } : { tipo: "token_colocado", id: token.id, col: token.col, row: token.row, valores: token.valores });
                return erro(c.ws, "Posição inválida.");
            }
            colocarToken(token.id, pedido.col, pedido.row);
            // `valores`: os status temporários (se o token acabou de sair da bolsa, foram calculados agora, lendo a ficha NESTE servidor: todos veem os mesmos números)
            avisarTodos({ tipo: "token_colocado", id: token.id, col: pedido.col, row: pedido.row, valores: token.valores });
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
        case "colocar_modelo":
            naFilaDeArquivos(() => criarPecaNoServidor(c, pedido));
            return;
        case "definir_tamanho": {
            // O tamanho do tabuleiro é do SERVIDOR (ele valida as posições com ele): limita ao permitido, puxa para dentro os tokens que ficaram fora, grava e avisa todos.
            const movidos = definirTamanhoTabuleiro(pedido.colunas, pedido.linhas);
            avisarTodos({ tipo: "tamanho_definido", colunas: estado.colunas, linhas: estado.linhas }); // (cada navegador refaz a mesma conta e puxa os tokens para dentro)
            for (const token of movidos) agendarGravacaoDoToken(token.id);
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "ajustar_valor_ficha": {
            // "+" e "−" (ou o número digitado) de uma variável que muda: o cliente só diz QUAL ficha, QUAL variável e QUANTO somar; o servidor confere, limita ao intervalo, grava e avisa todos.
            const resultado = ajustarValorDaFicha(pedido.ficha, pedido.nome, pedido.delta);
            if (!resultado.ok) return erro(c.ws, resultado.erro);
            avisarTodos({ tipo: "valores_ficha", id: pedido.ficha, valores: valoresDaFichaComoObjeto(pedido.ficha) });
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
            avisarTodos({ tipo: "valores_atualizados", id: alvo.id, valores: alvo.valores });
            if (resultado.fichaAlterada !== undefined) {
                // Ficha de jogador: a ação mudou o valor da FICHA (as barras de todos os tokens dela já foram refeitas): avisa, grava os arquivos das peças e o mesa.json.
                avisarTodos({ tipo: "valores_ficha", id: resultado.fichaAlterada, valores: valoresDaFichaComoObjeto(resultado.fichaAlterada) });
                for (const t of estado.tokens) if (t.ficha === resultado.fichaAlterada && !t.guardado) agendarGravacaoDoToken(t.id);
                naFilaDeArquivos(() => gravarMesaAtual());
            }
            const mensagem = adicionarMensagem(autor, frasePraChatDaAcao(alvo, pedido.acao, resultado));
            if (mensagem) avisarTodos({ tipo: "mensagem", mensagem });
            agendarGravacaoDoToken(alvo.id);
            return;
        }
        case "definir_acoes": {
            // As AÇÕES são da MESA INTEIRA (como os status): o servidor limpa a lista, guarda em mesa.json e avisa todos.
            if (!definirAcoesDaMesa(pedido.acoes)) return erro(c.ws, "Lista de ações inválida.");
            avisarTodos({ tipo: "acoes_definidas", acoes: estado.acoesDaMesa });
            naFilaDeArquivos(() => gravarMesaAtual());
            return;
        }
        case "definir_status": {
            // A regra dos STATUS é da MESA INTEIRA: vale para todos os tokens e peças (sem escolher nenhum). O servidor limpa a lista, copia para todos, refaz os valores das peças
            // se a estrutura mudou, grava (mesa.json e o arquivo de cada token) e avisa todos.
            definirStatusDaMesa(pedido.status);
            avisarTodos({ tipo: "status_definidos", status: estado.statusDaMesa, pecas: estado.tokens.filter((t) => t.copiaDe !== null).map((t) => ({ id: t.id, valores: t.valores })) });
            for (const token of estado.tokens) agendarGravacaoDoToken(token.id);
            naFilaDeArquivos(() => gravarMesaAtual());
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
            // Editar um token da BOLSA atualiza as PEÇAS dele no tabuleiro (visual, ficha, status): cada uma é avisada e regravada.
            if (token.copiaDe === null) {
                for (const peca of pecasDoModelo(token.id)) {
                    avisarTodos({ tipo: "token_editado", token: peca });
                    agendarGravacaoDoToken(peca.id);
                }
            }
            return;
        }
        case "excluir_token": {
            const alvo = buscarToken(pedido.id);
            if (!alvo) return erro(c.ws, "Esse token não existe.");
            // Excluir um token da BOLSA também exclui as PEÇAS dele; excluir uma peça ("Remover do tabuleiro") só apaga ela. Cada arquivo some da pasta certa.
            const apagados = [alvo, ...(alvo.copiaDe === null ? pecasDoModelo(alvo.id) : [])].map((t) => ({ id: t.id, pasta: pastaDoToken(t) }));
            excluirTokenComPecas(pedido.id);
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
        case "rolar_ficha": {
            // Rola a rolagem de uma ficha SALVA: o cliente só diz QUAL (ficha, versão, aba e posição); o texto e o sorteio são do servidor.
            const ficha = estado.fichas.find((f) => f.id === pedido.id);
            if (!ficha) return erro(c.ws, "Essa ficha não existe.");
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
    const conexao: Conexao = {
        id: proximoIdDeConexao++,
        ws,
        jogador: null,
        inicioDaJanela: Date.now(),
        mensagensNaJanela: 0,
        baldeRolagens: novoBalde(RAJADA_ROLAGENS),
        baldeChat: novoBalde(RAJADA_CHAT),
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
            avisarTodos({ tipo: "jogadores", lista: listaDeJogadores() });
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
    const fichasLidas = await carregarPasta("fichas", fichaValida, TAMANHO_MAX_ARQUIVO_FICHA);
    const tokensLidos = await carregarPasta("tokens", tokenValido, TAMANHO_MAX_ARQUIVO_TOKEN);
    const pecasLidas = await carregarPasta("pecas", tokenValido, TAMANHO_MAX_ARQUIVO_TOKEN);
    const gruposLidos = await carregarPasta("grupos", grupoValido, TAMANHO_MAX_ARQUIVO_GRUPO);
    // (O 2º argumento reserva os ids de arquivos IGNORADOS por estarem estragados: um item novo nunca os sobrescreve.)
    definirFichas(fichasLidas.itens, fichasLidas.maiorId + 1);
    if (mesa?.valores !== undefined) definirTodosOsValoresDasFichas(mesa.valores); // (os valores atuais das variáveis que mudam; só de fichas que existem)
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
    if (mesa?.status !== undefined) carregarStatusDaMesa(mesa.status);
    if (mesa?.acoes !== undefined) carregarAcoesDaMesa(mesa.acoes);
    aplicarStatusDaMesaAosTokens();
    await migrarTokensDoTabuleiro(); // (usa os grupos e os status: por isso por último)
    for (const ficha of estado.fichas) sincronizarValoresDaFicha(ficha.id); // (as barras ligadas a variáveis que mudam espelham o valor atual da ficha)
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
