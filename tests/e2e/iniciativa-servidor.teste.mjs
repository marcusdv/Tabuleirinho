// Teste e2e: INICIATIVA NO SERVIDOR. Rodar: npm run test:e2e -- iniciativa-servidor
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor na porta 3796+1=3797... (porta 3794) com uma pasta de dados TEMPORÁRIA e fala com ele por WebSocket puro.
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor na porta 3794 com uma pasta de dados TEMPORÁRIA e fala com ele por WebSocket puro.
// O servidor é o dono da ordem de combate: aplica cada ação com as regras de `src/iniciativa.ts`, avisa TODOS (`iniciativa_definida`, a ordem inteira), guarda em `dados/mesa.json` (a ordem
// sobrevive a reiniciar o servidor) e recusa pedidos inválidos e tokens que não existem.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3794;
const pasta = mkdtempSync(join(tmpdir(), "tabuleirinho-iniciativa-"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let servidor = null;
async function ligar() {
    servidor = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: pasta, SEM_EXEMPLOS: "1", SEM_LIMITE_SPAM: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolver) => servidor.stdout.on("data", (d) => /escutando/.test(String(d)) && resolver()));
}
async function desligar() {
    servidor.kill("SIGINT");
    await esperar(700);
}
async function abrir(apelido) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
    const eventos = [];
    ws.on("message", (d) => eventos.push(JSON.parse(String(d))));
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ tipo: "entrar", apelido }));
    await esperar(300);
    return { ws, eventos, acao: (a) => ws.send(JSON.stringify({ tipo: "iniciativa", acao: a })), enviar: (o) => ws.send(JSON.stringify(o)) };
}
const ultima = (c) => c.eventos.filter((e) => e.tipo === "iniciativa_definida").at(-1)?.iniciativa;
const nomes = (i) => i?.entradas.map((e) => e.nome).join(",");
const erroDe = async (c, enviar) => {
    const k = c.eventos.length;
    enviar();
    await esperar(350);
    return c.eventos.slice(k).find((e) => e.tipo === "erro")?.motivo ?? null;
};

try {
    await ligar();
    let ana = await abrir("Ana");
    let beto = await abrir("Beto");
    const inicial = ana.eventos.find((e) => e.tipo === "estado_inicial");
    ok("1) o estado inicial traz a iniciativa VAZIA e em modo de EDIÇÃO", inicial.iniciativa && inicial.iniciativa.entradas.length === 0 && inicial.iniciativa.vez === null && inicial.iniciativa.rodada === 0 && inicial.iniciativa.editando === true);

    ana.acao({ acao: "adicionar", nome: "", valor: 7, token: null });
    await esperar(250);
    ok("1b) um nome vazio vira 'Criatura'", ultima(ana)?.entradas[0]?.nome === "Criatura");
    ana.acao({ acao: "resetar" });
    await esperar(250);
    ana.acao({ acao: "adicionar", nome: "Ana", valor: 12, token: null });
    await esperar(250);
    ana.acao({ acao: "adicionar", nome: "Beto", valor: 18, token: null });
    await esperar(350);
    ok("2) todos recebem a ordem inteira, já ordenada do maior para o menor (Beto, Ana)", nomes(ultima(ana)) === "Beto,Ana" && nomes(ultima(beto)) === "Beto,Ana", `${nomes(ultima(ana))} / ${nomes(ultima(beto))}`);

    ana.enviar({ tipo: "criar_token", nome: "Orc", cor: 1, corBorda: 2, tamanho: 1, imagem: null });
    await esperar(300);
    const token = ana.eventos.find((e) => e.tipo === "token_criado").token;
    ok("3a) adicionar um token que NÃO existe é recusado", /não existe/.test((await erroDe(ana, () => ana.acao({ acao: "adicionar", nome: "Fantasma", valor: 1, token: 99999 }))) ?? ""));
    ana.acao({ acao: "adicionar", nome: "Orc", valor: 15, token: token.id });
    await esperar(300);
    ok("3b) adicionar um token que existe entra na ordem (Beto 18, Orc 15, Ana 12)", nomes(ultima(beto)) === "Beto,Orc,Ana" && ultima(beto).entradas[1].token === token.id, nomes(ultima(beto)));

    // 3c) "Adicionar à iniciativa" pelo token (`rolar: true`): o SERVIDOR rola a "Iniciativa" da ficha dele; o `valor` do pedido é ignorado; sem ficha/rolagem entra com 0
    const removerAdicionados = async (...ids) => { for (const id of ids) { ana.acao({ acao: "remover", id }); await esperar(200); } };
    const msgs = () => ana.eventos.filter((e) => e.tipo === "mensagem").length;
    let m0 = msgs();
    ana.enviar({ tipo: "criar_token", nome: "SemFicha", cor: 1, corBorda: 2, tamanho: 1, imagem: null });
    await esperar(300);
    const tSem = ana.eventos.filter((e) => e.tipo === "token_criado").at(-1).token;
    ana.acao({ acao: "adicionar", nome: "SemFicha", valor: 77, token: tSem.id, rolar: true });
    await esperar(300);
    const eSem = ultima(ana).entradas.find((e) => e.token === tSem.id);
    ok("3c) 'rolar' num token SEM ficha entra com 0 (o valor do pedido é ignorado) e não gera mensagem no chat", eSem?.valor === 0 && msgs() === m0, JSON.stringify(eSem));
    ana.enviar({ tipo: "criar_ficha" });
    await esperar(350);
    const fi = ana.eventos.filter((e) => e.tipo === "ficha_criada").at(-1).ficha;
    ana.enviar({ tipo: "editar_ficha", id: fi.id, versao: fi.versao, nome: "Com Iniciativa", abas: [{ nome: "Página 1", texto: "(Ataque)[1d20]\n(INICIATIVA)[1d4 + 100]" }] });
    await esperar(400);
    ana.enviar({ tipo: "criar_token", nome: "ComFicha", cor: 1, corBorda: 2, tamanho: 1, imagem: null, ficha: fi.id });
    await esperar(300);
    const tCom = ana.eventos.filter((e) => e.tipo === "token_criado").at(-1).token;
    m0 = msgs();
    ana.acao({ acao: "adicionar", nome: "ComFicha", valor: 5, token: tCom.id, rolar: true });
    await esperar(400);
    const eCom = ultima(ana).entradas.find((e) => e.token === tCom.id);
    const cartao = ana.eventos.filter((e) => e.tipo === "mensagem").at(-1)?.mensagem;
    ok("3d) 'rolar' num token com a rolagem '(INICIATIVA)' (sem diferenciar maiúsculas) entra com o total rolado pelo servidor (101 a 104)", eCom && eCom.valor >= 101 && eCom.valor <= 104, JSON.stringify(eCom));
    ok("3e) e a rolagem vai para o chat de todos, com o token e o mesmo total", msgs() === m0 + 1 && cartao?.rolagemFicha?.total === eCom.valor && cartao?.token === tCom.id, JSON.stringify(cartao?.rolagemFicha?.total));
    await removerAdicionados(eSem.id, eCom.id);

    ok("4a) um pedido inválido (valor com vírgula) é recusado", (await erroDe(ana, () => ana.acao({ acao: "valor", id: 1, valor: 1.5 }))) !== null);
    ok("4b) uma ação que não existe é recusada", (await erroDe(ana, () => ana.acao({ acao: "voar" }))) !== null);
    ok("4c) mudar o valor de quem não está na iniciativa é recusado com o motivo", /não está na iniciativa/.test((await erroDe(ana, () => ana.acao({ acao: "valor", id: 9999, valor: 5 }))) ?? ""));

    ok("4d) com a caixa em edição o 'proxima' é recusado (é preciso confirmar)", /Confirme/.test((await erroDe(ana, () => ana.acao({ acao: "proxima" }))) ?? ""));
    ana.acao({ acao: "confirmar" });
    await esperar(250);
    ana.acao({ acao: "proxima" });
    await esperar(300);
    let i = ultima(beto);
    ok("5a) 'proxima' começa o combate: a vez vai para o 1º (Beto) e a rodada é 1, para todos", i.vez === i.entradas[0].id && i.rodada === 1 && ultima(ana).vez === i.vez);
    ana.acao({ acao: "editar" });
    await esperar(250);
    ok("5b) 'editar' põe em edição e o 'proxima' é RECUSADO com o motivo", /Confirme/.test((await erroDe(ana, () => ana.acao({ acao: "proxima" }))) ?? "") && ultima(beto).editando === true);
    ana.acao({ acao: "confirmar" });
    await esperar(250);
    beto.acao({ acao: "proxima" });
    await esperar(250);
    ok("5c) confirmado, outro jogador passa a vez (agora no Orc)", ultima(ana).vez === ultima(ana).entradas[1].id);

    const orc = ultima(ana).entradas.find((e) => e.nome === "Orc").id;
    ana.acao({ acao: "mover", id: orc, para: 2 });
    await esperar(300);
    ok("6) arrastar o Orc para o fim (fora do critério) deixa a ordenação 'livre' para todos", nomes(ultima(beto)) === "Beto,Ana,Orc" && ultima(beto).ordenacao === "livre", `${nomes(ultima(beto))} ${ultima(beto).ordenacao}`);

    // reiniciar o servidor: a ordem sobrevive
    const antes = JSON.stringify(ultima(ana));
    ana.ws.close();
    beto.ws.close();
    await desligar();
    await ligar();
    ana = await abrir("Ana2");
    const depois = ana.eventos.find((e) => e.tipo === "estado_inicial").iniciativa;
    ok("7) a ordem de combate (lista, vez, rodada, ordenação) SOBREVIVE a reiniciar o servidor", JSON.stringify(depois) === antes, `${nomes(depois)} rodada ${depois.rodada} ${depois.ordenacao}`);

    ana.acao({ acao: "remover", id: orc });
    await esperar(300);
    ok("8a) 'remover' tira o personagem para todos", nomes(ultima(ana)) === "Beto,Ana");
    ana.acao({ acao: "resetar" });
    await esperar(300);
    const zerada = ultima(ana);
    ok("8b) 'resetar' (Limpar) apaga a lista, a vez e a rodada, e a caixa volta ao modo de edição", zerada.entradas.length === 0 && zerada.vez === null && zerada.rodada === 0 && zerada.editando === true);
    ana.ws.close();
} finally {
    await desligar().catch(() => {});
    rmSync(pasta, { recursive: true, force: true });
}
process.exitCode = terminar();
