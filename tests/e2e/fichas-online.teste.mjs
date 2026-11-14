// Teste e2e: EDITOR DE FICHA ONLINE no navegador (dois navegadores, Ana e Beto). Rodar: npm run test:e2e -- fichas-online
// (precisa do Vite: npm run dev; este teste sobe o PRÓPRIO servidor do jogo na porta 3737, a de PORTA_SERVIDOR, com uma pasta de dados
// TEMPORÁRIA, e o desliga no fim: se a porta estiver ocupada, desligue o servidor que estiver nela antes. O `dados/` do projeto não é tocado.)
//
// A Ana cria e salva uma ficha (o arquivo sobe de versão e o Beto vê na grade). Se o Beto tem a ficha aberta SEM alterações, o editor dele
// se atualiza sozinho quando a Ana salva. Se ele TEM alterações não salvas e a Ana salva, aparece o aviso de CONFLITO: o salvamento dele
// fica bloqueado, o que ele escreveu não é apagado, e "Carregar a versão atual" o deixa salvar de novo. Renomear aparece na grade do outro,
// e recarregar a página e reiniciar o servidor mantêm tudo.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3737; // a mesma de PORTA_SERVIDOR em src/config.ts (o Vite repassa /ws para ela)
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const arquivo = (id) => JSON.parse(readFileSync(join(dados, "fichas", `${id}.json`), "utf8"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

let s = await subir();
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
const aguardar = async (funcao, ms = 4000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await funcao()) return true; await esperar(40); } return false; };
const ficha = (p) => p.evaluate(() => { const f = window.__tabuleirinho.estado.fichas[0]; return f && { nome: f.nome, texto: f.abas[0].texto, versao: f.versao }; });
const versaoNaTela = (p) => p.locator("#editor-ficha-versao").textContent();
const aberto = (p) => p.locator("#editor-ficha").isVisible();

try {
    const A = await abrir("Ana"), B = await abrir("Beto");

    // ---- criar e abrir
    await criarFichaFechada(A);
    ok("1a) a ficha criada pela Ana aparece na grade do Beto", await aguardar(async () => (await B.locator(".bolsa-doc").count()) === 1));
    await A.locator(".bolsa-doc").dblclick();
    await A.fill("#editor-ficha-texto", "FOR:: 16");
    await A.keyboard.press("Control+s");
    ok("1b) a Ana salva: o editor mostra 'Salva na versão 2.' e Salvar volta a ficar desabilitado", await aguardar(async () => /Salva na versão 2/.test(await A.locator("#editor-ficha-aviso").textContent())) && (await A.isDisabled("#editor-ficha-salvar")), await A.locator("#editor-ficha-aviso").textContent());
    ok("1c) o ARQUIVO 1.json tem a versão 2 e o texto", arquivo(1).versao === 2 && arquivo(1).abas[0].texto === "FOR:: 16", JSON.stringify(arquivo(1)));
    ok("1d) o Beto vê 'v2' na grade", await aguardar(async () => (await B.locator(".bolsa-doc small").textContent()) === "v2"));

    // ---- o Beto abre (versão 2, sem mexer) e a Ana salva de novo: o editor dele se atualiza SOZINHO
    await B.locator(".bolsa-doc").dblclick();
    ok("2a) o Beto abre a ficha na versão 2, com o texto da Ana", (await versaoNaTela(B)) === "Versão 2" && (await B.inputValue("#editor-ficha-texto")) === "FOR:: 16");
    await A.fill("#editor-ficha-texto", "FOR:: 16\nDEX:: 14 (Ana, v3)");
    await A.click("#editor-ficha-salvar");
    await aguardar(async () => (await versaoNaTela(A)) === "Versão 3");
    ok("2b) como o Beto NÃO tinha mudado nada, o editor dele se atualiza sozinho para a versão 3, com um aviso", await aguardar(async () => (await versaoNaTela(B)) === "Versão 3") && /DEX:: 14/.test(await B.inputValue("#editor-ficha-texto")) && /Atualizada/.test(await B.locator("#editor-ficha-aviso").textContent()), `${await versaoNaTela(B)} / ${await B.locator("#editor-ficha-aviso").textContent()}`);
    ok("2c) e não apareceu o aviso de conflito", await B.locator("#editor-ficha-conflito").isHidden());

    // ---- CONFLITO: o Beto escreve (sem salvar) e a Ana salva por cima
    await B.fill("#editor-ficha-texto", "FOR:: 16\nDEX:: 14 (Ana, v3)\nlinha do BETO, ainda não salva");
    await A.fill("#editor-ficha-texto", "FOR:: 16\nDEX:: 18 (Ana, v4)");
    await A.click("#editor-ficha-salvar");
    await aguardar(async () => (await versaoNaTela(A)) === "Versão 4");
    ok("3a) o Beto tinha alterações: aparece o AVISO DE CONFLITO (versão 4) e o salvamento fica bloqueado", (await aguardar(async () => await B.locator("#editor-ficha-conflito").isVisible())) && /versão 4/.test(await B.locator("#editor-ficha-conflito-texto").textContent()) && (await B.isDisabled("#editor-ficha-salvar")), await B.locator("#editor-ficha-conflito-texto").textContent());
    ok("3b) o que o Beto escreveu NÃO foi apagado", (await B.inputValue("#editor-ficha-texto")).includes("linha do BETO"));
    ok("3c) o arquivo continua com o trabalho da Ana (versão 4)", arquivo(1).versao === 4 && arquivo(1).abas[0].texto.includes("Ana, v4"));
    await B.click("#editor-ficha-recarregar");
    ok("3d) 'Carregar a versão atual' traz o texto da Ana (v4), some o aviso e limpa as alterações", (await B.inputValue("#editor-ficha-texto")).includes("Ana, v4") && (await versaoNaTela(B)) === "Versão 4" && (await B.locator("#editor-ficha-conflito").isHidden()));
    await B.fill("#editor-ficha-texto", (await B.inputValue("#editor-ficha-texto")) + "\n+ linha do Beto (v5)");
    await B.click("#editor-ficha-salvar");
    ok("3e) agora o Beto salva sobre a versão certa: versão 5 no arquivo", await aguardar(async () => arquivo(1).versao === 5) && arquivo(1).abas[0].texto.includes("linha do Beto (v5)"), JSON.stringify(arquivo(1)));
    ok("3f) a Ana (que não tinha mexido) é atualizada sozinha para a versão 5", await aguardar(async () => (await versaoNaTela(A)) === "Versão 5") && (await A.inputValue("#editor-ficha-texto")).includes("Beto (v5)"));

    // ---- fechar com alterações pergunta; recarregar a página e reiniciar o servidor mantêm tudo
    await A.fill("#editor-ficha-nome", "Goblin Online");
    await A.click("#editor-ficha-salvar");
    ok("4a) renomear online: o Beto vê o nome novo na grade", await aguardar(async () => (await B.locator(".bolsa-doc-nome").textContent()) === "Goblin Online"));
    await A.click("#editor-ficha-fechar"); await B.click("#editor-ficha-fechar");
    ok("4b) sem alterações, os dois fecham direto", !(await aberto(A)) && !(await aberto(B)));
    await B.reload();
    await B.waitForFunction(() => window.__tabuleirinho?.pronto === true && window.__tabuleirinho.rede?.ativa === true, null, { timeout: 15000 });
    ok("5a) o Beto recarrega a página e a ficha continua (nome e versão 6)", (await ficha(B)).nome === "Goblin Online" && (await ficha(B)).versao === 6, JSON.stringify(await ficha(B)));
    await A.close(); await B.close();
    await desligar(s);
    s = await subir();
    ok("5b) reiniciar o servidor: a ficha continua com a última versão e o texto", /1 ficha\(s\)/.test(s.saida()) && arquivo(1).versao === 6);
    ok("6) nenhum erro de JavaScript nas páginas", erros.length === 0, erros.join(" | "));
} finally {
    await nav.close().catch(() => undefined);
    await desligar(s).catch(() => undefined);
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar(erros);
