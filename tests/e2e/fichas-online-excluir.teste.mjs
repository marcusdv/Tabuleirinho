// Teste e2e: EXCLUIR FICHA ONLINE com o editor aberto em outro navegador. Rodar: npm run test:e2e -- fichas-online-excluir
// (precisa do Vite: npm run dev; este teste sobe o PRÓPRIO servidor do jogo na porta 3737, a de PORTA_SERVIDOR, com uma pasta de dados
// TEMPORÁRIA, e o desliga no fim: se a porta estiver ocupada, desligue o servidor que estiver nela antes. O `dados/` do projeto não é tocado.)
//
// O Beto exclui uma ficha: o arquivo some e ela sai da grade dos dois. Se a Ana a tinha aberta SEM alterações, o editor dela fecha sozinho;
// se tinha ALTERAÇÕES, aparece o aviso "foi excluída", o texto dela é mantido para copiar, "Salvar" fica bloqueado e fechar ainda pergunta.
// Os ids das fichas excluídas não voltam.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3737; // a mesma de PORTA_SERVIDOR em src/config.ts (o Vite repassa /ws para ela)
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const jsons = () => readdirSync(join(dados, "fichas")).filter((f) => f.endsWith(".json")).join();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados } });
let saida = "";
proc.stdout.on("data", (d) => (saida += d));
proc.stderr.on("data", (d) => (saida += d));
await new Promise((r) => { const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); r(); } }, 30); });

const nav = await lancar();
const erros = [];
async function abrir(nome) {
    const p = await (await nav.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
    p.on("pageerror", (e) => erros.push(nome + ": " + String(e)));
    await abrirPagina(p, `?online&nome=${nome}`);
    await p.waitForFunction(() => window.__tabuleirinho.rede?.ativa === true, null, { timeout: 15000 });
    await p.click("#bolsa-aba-fichas");
    return p;
}
const aguardar = async (f, ms = 4000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await f()) return true; await esperar(40); } return false; };
const aberto = (p) => p.locator("#editor-ficha").isVisible();
const docs = (p) => p.locator(".bolsa-doc").count();

try {
    const A = await abrir("Ana"), B = await abrir("Beto");
    await A.click("#bolsa-ficha-criar-botao");
    await A.click("#bolsa-ficha-criar-botao");
    ok("0) 2 fichas (arquivos 1 e 2) nas duas páginas", (await aguardar(async () => (await docs(B)) === 2)) && jsons() === "1.json,2.json", jsons());

    // ---- A abre a ficha 1 SEM mexer; B a exclui: o editor da Ana fecha sozinho
    await A.locator(".bolsa-doc").first().click();
    ok("1a) a Ana abre a ficha 1", await aberto(A));
    await B.locator(".bolsa-doc").first().click({ button: "right" });
    await B.click("#menu-doc-excluir");
    ok("1b) a caixa online avisa do ARQUIVO no servidor", /arquivo dela no servidor/.test(await B.locator("#confirmar-mensagem").textContent()));
    await B.click("#confirmar-ok");
    ok("1c) a ficha some da grade das DUAS páginas e o arquivo 1.json é apagado", (await aguardar(async () => (await docs(A)) === 1 && (await docs(B)) === 1)) && !existsSync(join(dados, "fichas", "1.json")) && jsons() === "2.json", jsons());
    ok("1d) como a Ana não tinha alterações, o editor dela FECHOU sozinho", await aguardar(async () => !(await aberto(A))));

    // ---- A abre a ficha 2 e ESCREVE; B a exclui: aviso, sem perder o texto
    await A.locator(".bolsa-doc").first().click();
    await A.fill("#editor-ficha-texto", "FOR:: 16\n(Ataque)[1d20 + FOR]\nTexto importante que a Ana ainda não salvou");
    await B.locator(".bolsa-doc").first().click({ button: "right" });
    await B.click("#menu-doc-excluir");
    await B.click("#confirmar-ok");
    ok("2a) a Ana (com alterações) vê o AVISO 'foi excluída' e o editor NÃO fecha", (await aguardar(async () => await A.locator("#editor-ficha-conflito").isVisible())) && /foi excluída/.test(await A.locator("#editor-ficha-conflito-texto").textContent()) && (await aberto(A)));
    ok("2b) o texto da Ana continua lá, para ela copiar", (await A.inputValue("#editor-ficha-texto")).includes("Texto importante"));
    ok("2c) 'Salvar' fica BLOQUEADO e não há botão 'Carregar a versão atual'", (await A.isDisabled("#editor-ficha-salvar")) && (await A.locator("#editor-ficha-recarregar").isHidden()));
    ok("2d) o arquivo 2.json foi apagado e a grade ficou vazia", jsons() === "" && (await docs(A)) === 0 && (await docs(B)) === 0, jsons());
    await A.click("#editor-ficha-fechar");
    ok("2e) fechar com o texto não salvo ainda pergunta (para ela não perder sem querer)", await A.locator("#confirmar").isVisible());
    await A.click("#confirmar-ok");
    ok("2f) depois de confirmar, a janela fecha", !(await aberto(A)));
    // ---- a Ana cria outra e o id não volta
    await A.click("#bolsa-ficha-criar-botao");
    ok("3) a próxima ficha é a 3 (os ids 1 e 2 NÃO voltam)", (await aguardar(async () => jsons() === "3.json")), jsons());
    ok("4) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
} finally {
    await nav.close().catch(() => undefined);
    proc.kill("SIGINT");
    await new Promise((r) => proc.once("exit", r));
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar(erros);
