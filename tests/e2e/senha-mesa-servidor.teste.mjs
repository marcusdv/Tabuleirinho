// Teste e2e: a SENHA DA MESA (opcional; arquitetura, 17/11/2026). Rodar: npm run test:e2e -- senha-mesa
// (não precisa do Vite: sobe um servidor temporário na porta 3797 com SENHA_MESA=abacaxi e uma pasta de dados temporária; o `dados/` do projeto não é tocado.)
// Quem vem "de fora" é simulado com o cabeçalho X-Forwarded-For (o mesmo que um túnel manda).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3797;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-senha-"));
const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados, SEM_EXEMPLOS: "1", SENHA_MESA: "abacaxi" } });
let saida = "";
proc.stdout.on("data", (d) => (saida += d));
proc.stderr.on("data", (d) => (saida += d));
await new Promise((r) => { const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); r(); } }, 30); setTimeout(() => { clearInterval(t); r(); }, 10000); });

/** Entra e devolve o primeiro evento importante (estado_inicial ou erro). */
function entrar(consulta, deFora) {
    return new Promise((res) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws?${consulta}`, deFora ? { headers: { "x-forwarded-for": "203.0.113.9" } } : {});
        ws.on("open", () => ws.send(JSON.stringify({ tipo: "entrar", apelido: "Ana" })));
        ws.on("message", (d) => { const e = JSON.parse(String(d)); if (e.tipo === "estado_inicial" || e.tipo === "erro") { ws.close(); res(e); } });
        ws.on("error", () => res({ tipo: "erro", motivo: "falha de conexão" }));
        setTimeout(() => res({ tipo: "nada" }), 4000);
    });
}
try {
    ok("0) o servidor avisa no terminal que a senha está ligada", /SENHA DA MESA ligada/.test(saida), saida.slice(-300));
    const semSenha = await entrar("papel=jogador", true);
    ok("1) de fora SEM senha: recusado, com o motivo", semSenha.tipo === "erro" && /SENHA/.test(semSenha.motivo), JSON.stringify(semSenha));
    const errada = await entrar("papel=jogador&senha=banana", true);
    ok("2) de fora com a senha ERRADA: recusado", errada.tipo === "erro" && /SENHA/.test(errada.motivo));
    const certa = await entrar("papel=jogador&senha=abacaxi", true);
    ok("3) de fora com a senha CERTA: entra", certa.tipo === "estado_inicial");
    const mestre = await entrar("papel=mestre", false);
    ok("4) o mestre, no computador do servidor, entra SEM senha", mestre.tipo === "estado_inicial" && mestre.mestre === true);
} finally {
    proc.kill("SIGINT");
    await new Promise((r) => proc.once("exit", r));
    if (existsSync(dados)) rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar([]);
