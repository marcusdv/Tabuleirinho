// Teste: LIMITE ANTI-SPAM de dados e chat (balde que enche aos poucos). Rodar: npm run test:e2e -- limite-spam   (não precisa do Vite; sobe um servidor próprio na porta 3796)
//
// Parte A: a conta pura (`src/limite.ts`). Parte B: o SERVIDOR de verdade, SEM o desligador dos testes (SEM_LIMITE_SPAM): uma rajada de rolagens e de mensagens
// só passa até a capacidade do balde; o resto é recusado com o aviso; depois de um tempo, volta a passar.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";
import { gastar, novoBalde } from "../../src/limite.ts";
import { MS_RECARGA_CHAT, MS_RECARGA_ROLAGEM, RAJADA_CHAT, RAJADA_ROLAGENS } from "../../src/config.ts";

// ================= A) a conta pura
const b = novoBalde(3, 0);
ok("A1) um balde novo está CHEIO: 3 ações passam de uma vez", gastar(b, 3, 1000, 0) && gastar(b, 3, 1000, 0) && gastar(b, 3, 1000, 0));
ok("A2) a 4ª logo em seguida é RECUSADA (e nada é gasto)", !gastar(b, 3, 1000, 0) && b.fichas === 0);
ok("A3) meio segundo depois ainda não voltou (precisa de 1 s para 1 ficha)", !gastar(b, 3, 1000, 500));
ok("A4) com 1 s desde a última conta, volta 1 ação (e só 1)", gastar(b, 3, 1000, 1500) === true && !gastar(b, 3, 1000, 1500));
const c = novoBalde(3, 0);
gastar(c, 3, 1000, 0);
ok("A5) o balde nunca passa da capacidade, mesmo depois de muito tempo parado", (gastar(c, 3, 1000, 1_000_000), c.fichas <= 3) && c.fichas === 2);
const d = novoBalde(2, 5000);
ok("A6) relógio que anda para trás não dá ações de graça", gastar(d, 2, 1000, 5000) && gastar(d, 2, 1000, 5000) && !gastar(d, 2, 1000, 1000));

// ================= B) o servidor, com o limite LIGADO
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3796;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const ambiente = { ...process.env, PORT: String(PORTA), DADOS: dados };
delete ambiente.SEM_LIMITE_SPAM; // (o ajuda.mjs o liga para os outros testes; aqui o limite tem de valer)
const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: ambiente });
let saida = "";
proc.stdout.on("data", (x) => (saida += x));
proc.stderr.on("data", (x) => (saida += x));
await new Promise((res) => { const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); res(); } }, 30); });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
function cliente(apelido) {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
        const recebidos = [];
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, enviar: (o) => ws.send(JSON.stringify(o)) }); };
    });
}
const conta = (cli, de, tipo, filtro = () => true) => cli.recebidos.slice(de).filter((e) => e.tipo === tipo && filtro(e)).length;
try {
    const A = await cliente("Ana");
    await esperar(300);
    // ----- dados: 10 rolagens em rajada
    let k = A.recebidos.length;
    for (let i = 0; i < 10; i++) A.enviar({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0 });
    await esperar(400);
    const rolou = conta(A, k, "mensagem", (e) => !!e.mensagem?.rolagem);
    const recusadas = conta(A, k, "erro", (e) => /rolando rápido demais/.test(e.motivo));
    ok(`B1) 10 rolagens em rajada: só ${RAJADA_ROLAGENS} passam (a capacidade do balde)`, rolou === RAJADA_ROLAGENS, `passaram ${rolou}`);
    ok("B2) as outras são recusadas com o aviso 'Calma! Você está rolando rápido demais.'", recusadas === 10 - RAJADA_ROLAGENS, `recusadas ${recusadas}`);
    await esperar(MS_RECARGA_ROLAGEM + 150);
    k = A.recebidos.length;
    A.enviar({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0 });
    await esperar(250);
    ok("B3) depois de esperar a recarga (1 s), uma rolagem volta a passar", conta(A, k, "mensagem", (e) => !!e.mensagem?.rolagem) === 1);

    // ----- chat: 10 mensagens em rajada
    k = A.recebidos.length;
    for (let i = 0; i < 10; i++) A.enviar({ tipo: "enviar_mensagem", texto: `oi ${i}` });
    await esperar(400);
    const escritas = conta(A, k, "mensagem", (e) => !e.mensagem?.rolagem);
    ok(`B4) 10 mensagens de chat em rajada: só ${RAJADA_CHAT} passam`, escritas === RAJADA_CHAT, `passaram ${escritas}`);
    ok("B5) as outras são recusadas com 'Calma! Você está escrevendo rápido demais.'", conta(A, k, "erro", (e) => /escrevendo rápido demais/.test(e.motivo)) === 10 - RAJADA_CHAT);
    ok("B6) o limite do chat é separado do dos dados: depois de gastar o chat, ainda dá para rolar (o balde de dados já recarregou)", await (async () => {
        await esperar(MS_RECARGA_ROLAGEM + 100);
        const j = A.recebidos.length;
        A.enviar({ tipo: "rolar_dados", lados: 6, quantidade: 2, modificador: 0 });
        await esperar(250);
        return conta(A, j, "mensagem", (e) => !!e.mensagem?.rolagem) === 1;
    })());

    // ----- cada PESSOA tem o seu balde
    const B = await cliente("Beto");
    await esperar(300);
    k = B.recebidos.length;
    for (let i = 0; i < 3; i++) B.enviar({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0 });
    await esperar(300);
    ok("B7) o balde é de CADA pessoa: o Beto tem as suas 3 rolagens mesmo com a Ana tendo gastado as dela", conta(B, k, "mensagem", (e) => !!e.mensagem?.rolagem) === 3);
    ok("B8) o servidor não registrou erro inesperado", !/Error|erro/i.test(saida.replace(/Item ignorado/g, "")), saida.slice(-200));
} finally {
    proc.kill();
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar();
