// Teste e2e: PINGS e a PÁGINA PARADA (alt-tab, aba oculta). Quem está fora (a tela parada) NÃO vê os pings que acontecem enquanto isso: ao voltar não aparece um bombardeio. Também confere o mini delay entre
// pings. Dois navegadores no modo online, com um servidor e um Vite próprios (portas 3798 e 5198; não precisa do `npm run dev` nem do servidor do dono). Rodar: npm run test:e2e -- ping-ausente
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lancar, ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-ping-"));
const ambienteSemLimite = { ...process.env, PORT: "3798", DADOS: dados };
delete ambienteSemLimite.SEM_LIMITE_SPAM; // (o limite de pings tem de valer: o servidor do teste usa as regras de verdade)
const servidor = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: ambienteSemLimite });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5198", "--strictPort", "--host", "127.0.0.1"], { cwd: RAIZ, env: { ...process.env, PORTA_SERVIDOR: "3798" } });
let saida = "";
for (const proc of [servidor, vite]) { proc.stdout.on("data", (x) => (saida += x)); proc.stderr.on("data", (x) => (saida += x)); }
await new Promise((res, rej) => { const t = setInterval(() => { if (saida.includes("escutando") && /5198/.test(saida)) { clearInterval(t); res(); } }, 50); setTimeout(() => rej(new Error("o servidor ou o Vite não subiu: " + saida.slice(-300))), 25000); });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const nav = await lancar();
const erros = [];
async function entrar(nome) {
    const p = await nav.newPage({ viewport: { width: 1280, height: 800 } });
    p.on("pageerror", (e) => erros.push(`${nome}: ${e}`));
    await p.goto(`http://127.0.0.1:5198/?online&nome=${nome}&papel=mestre`);
    await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
    await p.waitForTimeout(800);
    return p;
}
let codigo = 0;
try {
    const A = await entrar("Ana");
    const B = await entrar("Beto");
    const pingar = async (x, y) => { await A.keyboard.down("Shift"); await A.mouse.click(x, y); await A.keyboard.up("Shift"); };
    const naTela = () => B.evaluate(() => window.__tabuleirinho.pingsNaTela());

    // ---- a tela de B funcionando: o ping de A aparece
    await pingar(400, 400);
    await esperar(700);
    ok("1) com a tela de Beto funcionando, o ping da Ana aparece para ele", (await naTela()) >= 1, `na tela: ${await naTela()}`);
    await esperar(4500); // (o ping some sozinho)
    ok("2) e some sozinho depois de uns segundos", (await naTela()) === 0, `na tela: ${await naTela()}`);

    // ---- Beto no ALT-TAB: a página fica oculta (document.hidden); Ana pinga 3 vezes
    await B.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); });
    for (const [x, y] of [[300, 300], [500, 300], [700, 300]]) { await pingar(x, y); await esperar(400); }
    await esperar(300);
    ok("3) enquanto Beto está FORA (página oculta), os pings da Ana NÃO chegam à tela dele", (await naTela()) === 0, `na tela: ${await naTela()}`);

    // ---- Beto volta: nada de bombardeio, e os pings novos aparecem normalmente
    await B.evaluate(() => { delete document.hidden; });
    await esperar(500);
    ok("4) ao VOLTAR, não aparece nenhum dos pings que aconteceram enquanto ele estava fora", (await naTela()) === 0, `na tela: ${await naTela()}`);
    await esperar(300);
    await pingar(600, 500);
    await esperar(600);
    ok("5) e um ping NOVO, depois de voltar, aparece normalmente", (await naTela()) === 1, `na tela: ${await naTela()}`);

    // ---- o seu próprio ping sempre aparece (mesmo que a tela esteja "parada" só para os dos outros)
    await esperar(4500);
    const antes = await A.evaluate(() => window.__tabuleirinho.pingsNaTela());
    await pingar(800, 500);
    await esperar(600);
    ok("6) o ping da própria Ana aparece na tela dela", (await A.evaluate(() => window.__tabuleirinho.pingsNaTela())) >= 1 && antes === 0);

    // ---- o mini delay: dois pings logo em seguida valem como UM
    await esperar(4500);
    await pingar(400, 600);
    await pingar(420, 620); // (segundos depois do primeiro por poucos milissegundos)
    await esperar(600);
    ok("7) dois pings em sequência rápida (mini delay de 250 ms): só o primeiro aparece", (await naTela()) === 1, `na tela: ${await naTela()}`);
} catch (falha) {
    console.log("FALHA inesperada:", falha);
    codigo = 1;
} finally {
    await nav.close();
    servidor.kill();
    vite.kill();
}
const saidaFinal = terminar(erros);
process.exit(codigo || saidaFinal);
