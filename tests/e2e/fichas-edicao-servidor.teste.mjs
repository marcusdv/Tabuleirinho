// Teste e2e: EDIÇÃO DE FICHAS NO SERVIDOR. Rodar: npm run test:e2e -- fichas-edicao-servidor
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor do jogo na porta 3792 com uma pasta de dados TEMPORÁRIA (apagada no
// fim; o `dados/` do projeto não é tocado) e fala com ele por WebSocket puro. Se a porta 3792 estiver ocupada, o teste falha.
//
// Salvar (`editar_ficha`) grava por cima do arquivo e sobe a VERSÃO; nome e texto passam pela limpeza (espaços, caracteres de controle,
// \r\n). Salvar sobre uma versão VELHA é recusado só para quem pediu (`ficha_conflito`, com a ficha atual) e o arquivo não muda; dois
// salvamentos ao mesmo tempo: só um vence. Salvar o mesmo conteúdo não sobe a versão. Texto acima de 25000 caracteres, tipos errados,
// campos que não se editam e mensagens acima de 256 KB são recusados ou ignorados. Tudo sobrevive a reiniciar o servidor.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3792;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const pastaFichas = join(dados, "fichas");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const arquivo = (id) => JSON.parse(readFileSync(join(pastaFichas, `${id}.json`), "utf8"));

function subir() {
    const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados } });
    let saida = "";
    proc.stdout.on("data", (d) => (saida += d));
    proc.stderr.on("data", (d) => (saida += d));
    return new Promise((resolver) => {
        const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); resolver({ proc, saida: () => saida }); } }, 30);
        setTimeout(() => { clearInterval(t); resolver({ proc, saida: () => saida }); }, 8000);
    });
}
const desligar = (s) => { s.proc.kill("SIGINT"); return new Promise((r) => s.proc.once("exit", r)); };
function cliente(apelido) {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
        const recebidos = [];
        let fechou = null;
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onclose = (e) => (fechou = e.code);
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, codigo: () => fechou, enviar: (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o)) }); };
    });
}
async function esperarEvento(c, tipo, desde = 0, ms = 2000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { const e = c.recebidos.slice(desde).find((x) => x.tipo === tipo); if (e) return e; await esperar(20); }
    return null;
}

try {
    let s = await subir();
    const A = await cliente("Ana"), B = await cliente("Beto");
    await esperarEvento(A, "estado_inicial"); await esperarEvento(B, "estado_inicial");
    A.enviar({ tipo: "criar_ficha" });
    const criada = await esperarEvento(A, "ficha_criada");
    ok("0) ficha criada (id 1, versão 1)", criada?.ficha?.id === 1 && criada.ficha.versao === 1);
    await esperarEvento(B, "ficha_criada");

    // ---- salvar
    let na = A.recebidos.length, nb = B.recebidos.length;
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 1, nome: "  Goblin   Chefe ", texto: "FOR:: 16\r\nlinha\u0001\u0007fim\ttab" });
    const e1 = await esperarEvento(A, "ficha_editada", na);
    ok("1a) ficha_editada: versão 2, nome limpo, texto com \\n e sem caracteres de controle (a tabulação fica)", e1?.ficha?.versao === 2 && e1.ficha.nome === "Goblin Chefe" && e1.ficha.texto === "FOR:: 16\nlinhafim\ttab", JSON.stringify(e1?.ficha));
    const e1b = await esperarEvento(B, "ficha_editada", nb);
    ok("1b) o Beto também recebe a ficha nova (versão 2)", e1b?.ficha?.versao === 2 && e1b.ficha.texto === e1.ficha.texto);
    ok("1c) o ARQUIVO 1.json já está com a versão 2 e o conteúdo novo; sem .tmp", JSON.stringify(arquivo(1)) === JSON.stringify(e1.ficha) && !readdirSync(pastaFichas).some((f) => f.endsWith(".tmp")));
    ok("1d) a data de alteração mudou e a de criação não", arquivo(1).alteradaEm >= arquivo(1).criadaEm && arquivo(1).criadaEm === criada.ficha.criadaEm);

    // ---- conflito: o Beto ainda acha que a ficha está na versão 1
    na = A.recebidos.length; nb = B.recebidos.length;
    B.enviar({ tipo: "editar_ficha", id: 1, versao: 1, texto: "texto do Beto, feito sobre a versão VELHA" });
    const conf = await esperarEvento(B, "ficha_conflito", nb);
    await esperar(200);
    ok("2a) salvar sobre a versão velha dá ficha_conflito, só para o Beto, com a ficha ATUAL (versão 2)", conf?.ficha?.versao === 2 && conf.ficha.nome === "Goblin Chefe" && !A.recebidos.slice(na).some((x) => x.tipo === "ficha_conflito" || x.tipo === "ficha_editada"), JSON.stringify(conf));
    ok("2b) o arquivo NÃO mudou (o trabalho da Ana está salvo)", arquivo(1).versao === 2 && arquivo(1).texto === "FOR:: 16\nlinhafim\ttab");
    // o Beto carrega a versão atual e salva
    nb = B.recebidos.length;
    B.enviar({ tipo: "editar_ficha", id: 1, versao: 2, texto: "texto do Beto" });
    const e3 = await esperarEvento(B, "ficha_editada", nb);
    ok("2c) com a versão certa (2) o salvamento passa e a versão vai a 3; o nome foi mantido (só o texto foi enviado)", e3?.ficha?.versao === 3 && e3.ficha.texto === "texto do Beto" && e3.ficha.nome === "Goblin Chefe", JSON.stringify(e3?.ficha));

    // ---- salvar sem mudar nada: a versão NÃO sobe
    na = A.recebidos.length;
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 3, nome: "Goblin Chefe", texto: "texto do Beto" });
    const e4 = await esperarEvento(A, "ficha_editada", na);
    ok("3) salvar o MESMO conteúdo não sobe a versão (continua 3)", e4?.ficha?.versao === 3 && arquivo(1).versao === 3, JSON.stringify(e4?.ficha?.versao));

    // ---- nome vazio e só o nome
    na = A.recebidos.length;
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 3, nome: "   " });
    const e5 = await esperarEvento(A, "ficha_editada", na);
    ok("4a) nome vazio vira 'Ficha 1' e o texto fica como estava", e5?.ficha?.nome === "Ficha 1" && e5.ficha.texto === "texto do Beto" && e5.ficha.versao === 4, JSON.stringify(e5?.ficha));
    na = A.recebidos.length;
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 4, nome: "<b>Nome</b> \u0000 comprido ".padEnd(80, "x") });
    const e6 = await esperarEvento(A, "ficha_editada", na);
    ok("4b) nome comprido é cortado a 40 caracteres, sem controle (e '<b>' fica como texto puro)", e6?.ficha?.nome.length <= 40 && !/[\u0000-\u001f]/.test(e6.ficha.nome) && e6.ficha.nome.startsWith("<b>Nome</b>"), JSON.stringify(e6?.ficha?.nome));

    // ---- dois ao mesmo tempo, na mesma versão: só UM vence
    const v = e6.ficha.versao;
    na = A.recebidos.length; nb = B.recebidos.length;
    A.enviar({ tipo: "editar_ficha", id: 1, versao: v, texto: "corrida da Ana" });
    B.enviar({ tipo: "editar_ficha", id: 1, versao: v, texto: "corrida do Beto" });
    await esperar(600);
    const vencedoras = A.recebidos.slice(na).filter((x) => x.tipo === "ficha_editada");
    const conflitos = [...A.recebidos.slice(na), ...B.recebidos.slice(nb)].filter((x) => x.tipo === "ficha_conflito");
    ok("5) dois salvamentos ao mesmo tempo: UM vence (versão +1) e o outro recebe conflito (a fila não deixa se misturarem)", vencedoras.length === 1 && vencedoras[0].ficha.versao === v + 1 && conflitos.length === 1 && arquivo(1).versao === v + 1, `${vencedoras.length} vencedoras, ${conflitos.length} conflitos`);

    // ---- limites e pedidos maliciosos
    async function ruim(nome, msg, tipoEsperado = "erro") {
        const antes = JSON.stringify(arquivo(1));
        const k = A.recebidos.length;
        A.enviar(msg);
        const e = await esperarEvento(A, tipoEsperado, k, 800);
        await esperar(150);
        ok(nome, !!e && JSON.stringify(arquivo(1)) === antes && !A.recebidos.slice(k).some((x) => x.tipo === "ficha_editada"), JSON.stringify(e));
    }
    const vAtual = () => arquivo(1).versao;
    await ruim("6a) texto de 25001 caracteres é recusado inteiro", { tipo: "editar_ficha", id: 1, versao: vAtual(), texto: "a".repeat(25001) });
    await ruim("6b) versao em texto é recusada", { tipo: "editar_ficha", id: 1, versao: "1", texto: "x" });
    await ruim("6c) id em texto é recusado", { tipo: "editar_ficha", id: "1", versao: 1, texto: "x" });
    await ruim("6d) nome que não é texto é recusado", { tipo: "editar_ficha", id: 1, versao: vAtual(), nome: 5 });
    await ruim("6e) texto que não é texto é recusado", { tipo: "editar_ficha", id: 1, versao: vAtual(), texto: { a: 1 } });
    await ruim("6f) sem 'versao' é recusado", { tipo: "editar_ficha", id: 1, texto: "x" });
    await ruim("6g) ficha que não existe dá erro", { tipo: "editar_ficha", id: 999, versao: 1, texto: "x" });
    {
        const k = A.recebidos.length, vv = vAtual();
        A.enviar({ tipo: "editar_ficha", id: 1, versao: vv, texto: "só isto", criadaEm: 5, versao_nova: 99, alteradaEm: 1, id_extra: 7 });
        const e = await esperarEvento(A, "ficha_editada", k);
        ok("6h) campos que não são editáveis (criadaEm, alteradaEm, versão nova) são IGNORADOS", e?.ficha?.versao === vv + 1 && e.ficha.criadaEm === criada.ficha.criadaEm && e.ficha.texto === "só isto", JSON.stringify(e?.ficha));
    }
    {
        const k = A.recebidos.length, vv = vAtual();
        A.enviar({ tipo: "editar_ficha", id: 1, versao: vv, texto: "é".repeat(25000) });
        const e = await esperarEvento(A, "ficha_editada", k);
        ok("6i) exatamente 25000 caracteres (acentuados) passam, e o arquivo cabe no limite de leitura (128 KB)", e?.ficha?.texto.length === 25000 && statSync(join(pastaFichas, "1.json")).size < 131072, String(statSync(join(pastaFichas, "1.json")).size));
    }
    {
        const grande = await cliente("Grande");
        grande.enviar({ tipo: "editar_ficha", id: 1, versao: 1, texto: "a".repeat(300000) });
        await esperar(400);
        ok("6j) mensagem acima de 256 KB derruba a conexão (1009)", grande.codigo() === 1009, String(grande.codigo()));
    }

    // ---- reiniciar: versão, texto e nome sobrevivem; quem entra depois recebe a ficha editada
    await desligar(s);
    s = await subir();
    const C = await cliente("Caio");
    const ini = await esperarEvento(C, "estado_inicial");
    const f = ini?.fichas?.[0];
    ok("7a) depois de reiniciar o servidor, a ficha volta com a última versão e o texto", f?.id === 1 && f.versao === arquivo(1).versao && f.texto === "é".repeat(25000), JSON.stringify({ v: f?.versao, t: f?.texto?.length }));
    {
        const k = C.recebidos.length;
        C.enviar({ tipo: "editar_ficha", id: 1, versao: f.versao, texto: "depois do reinício" });
        const e = await esperarEvento(C, "ficha_editada", k);
        ok("7b) e dá para continuar editando a partir dela", e?.ficha?.versao === f.versao + 1 && arquivo(1).texto === "depois do reinício");
    }
    await desligar(s);
} finally {
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar();
