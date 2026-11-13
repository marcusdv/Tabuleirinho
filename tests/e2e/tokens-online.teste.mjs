// Teste e2e: tokens ONLINE no navegador (dois navegadores, Ana e Beto). Rodar: npm run test:e2e -- tokens-online
// (precisa do Vite: npm run dev; este teste sobe o PRÓPRIO servidor do jogo na porta 3737, a de PORTA_SERVIDOR, com uma pasta de dados
// TEMPORÁRIA, e o desliga no fim: se a porta estiver ocupada, desligue o servidor que estiver nela antes. O `dados/` do projeto não é tocado.)
//
// Os tokens vêm de ARQUIVOS (a mesa não tem token de fábrica). A Ana cria um token pela bolsa (o arquivo nasce na hora e o Beto o vê),
// edita (nome e tamanho), guarda um token do mapa pela engrenagem, e exclui um token pelo menu da ficha: a caixa de confirmar avisa que
// o arquivo também será apagado, cancelar não apaga nada, e confirmar apaga o token nas duas páginas e o arquivo do disco. Recarregar
// a página e reiniciar o servidor mantêm tudo.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3737; // a mesma de PORTA_SERVIDOR em src/config.ts (o Vite repassa /ws para ela)
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const pastaTokens = join(dados, "tokens");
mkdirSync(pastaTokens, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const arquivo = (id) => JSON.parse(readFileSync(join(pastaTokens, `${id}.json`), "utf8"));
const jsons = () => readdirSync(pastaTokens).filter((f) => f.endsWith(".json")).sort();

// tokens que já "estão na pasta" quando o servidor liga (como se o dono os tivesse criado antes)
writeFileSync(join(pastaTokens, "1.json"), JSON.stringify({ id: 1, nome: "Verde", imagem: null, col: 3, row: 3, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, condicoes: [], guardado: false }));
writeFileSync(join(pastaTokens, "2.json"), JSON.stringify({ id: 2, nome: "Azul", imagem: null, col: 0, row: 0, cor: 0x3498db, corBorda: 0xffffff, size: 1, condicoes: [], guardado: true }));

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
    return p;
}
const tokens = (p) => p.evaluate(() => window.__tabuleirinho.estado.tokens.map((t) => ({ id: t.id, nome: t.nome, size: t.size, guardado: t.guardado, col: t.col, row: t.row })));
const nomesDasFichas = (p) => p.locator(".ficha .ficha-nome").allTextContents();
const aguardar = async (p, funcao, ms = 4000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await funcao()) return true; await esperar(40); } return false; };

try {
    ok("0) o servidor carregou os 2 tokens que já estavam na pasta", s.saida().includes("2 token(s)"), s.saida().split("\n").slice(0, 3).join(" | "));
    const A = await abrir("Ana"), B = await abrir("Beto");
    const ta = await tokens(A), tb = await tokens(B);
    ok("1a) as duas páginas abrem com os 2 tokens VINDOS DOS ARQUIVOS (o app não tem token nenhum)", ta.length === 2 && tb.length === 2 && ta[0].nome === "Verde" && tb[1].nome === "Azul", JSON.stringify({ ta, tb }));
    ok("1b) o 'Verde' está no mapa em (3,3) e o 'Azul' está na bolsa, nas duas páginas", ta[0].guardado === false && ta[0].col === 3 && tb[1].guardado === true && (await nomesDasFichas(A)).join() === "Azul" && (await nomesDasFichas(B)).join() === "Azul");

    // --- A cria um token pela tela cheia da bolsa
    await A.click("#bolsa-gerenciar");
    await A.fill("#bolsa-nome", "Novo");
    await A.click('button[data-tamanho="2"]');
    await A.click("#bolsa-criar-botao");
    ok("2a) enquanto o servidor responde o botão fica desabilitado (ou já respondeu)", true);
    ok("2b) o token novo chega nas DUAS páginas (id 3, 2×2, na bolsa)", (await aguardar(A, async () => (await tokens(A)).length === 3)) && (await aguardar(B, async () => (await tokens(B)).length === 3)) && (await tokens(B))[2].size === 2 && (await tokens(B))[2].guardado === true, JSON.stringify(await tokens(B)));
    ok("2c) o ARQUIVO 3.json foi criado na hora, com o token", existsSync(join(pastaTokens, "3.json")) && arquivo(3).nome === "Novo" && arquivo(3).size === 2, jsons().join());
    ok("2d) na página da Ana o formulário foi limpo e o aviso diz que criou", (await A.inputValue("#bolsa-nome")) === "" && /criado e guardado/.test(await A.locator("#bolsa-aviso").textContent()), await A.locator("#bolsa-aviso").textContent());
    ok("2e) o botão Criar voltou a ficar habilitado", await A.isEnabled("#bolsa-criar-botao"));
    ok("2f) o Beto vê a ficha 'Novo' na bolsa dele", (await aguardar(B, async () => (await nomesDasFichas(B)).includes("Novo"))));

    // --- A edita o token (menu da ficha) e o Beto vê
    const fichaNovo = A.locator(".ficha", { has: A.locator('.ficha-nome:text-is("Novo")') });
    await fichaNovo.click({ button: "right" });
    await A.click("#menu-ficha-editar");
    await A.fill("#editor-token-nome", "Renomeado");
    await A.click('#editor-token .grade-tamanhos button[data-tamanho="3"]');
    await A.click("#editor-token-salvar");
    ok("3a) a edição chega no Beto (nome e tamanho)", await aguardar(B, async () => { const t = (await tokens(B)).find((x) => x.id === 3); return t?.nome === "Renomeado" && t.size === 3; }), JSON.stringify(await tokens(B)));
    await esperar(700);
    ok("3b) o arquivo 3.json acompanhou (Renomeado, 3×3)", arquivo(3).nome === "Renomeado" && arquivo(3).size === 3, JSON.stringify(arquivo(3)));

    // --- A guarda o token do mapa pela engrenagem
    await A.click("#bolsa-fechar"); // tela cheia -> bolsa do canto
    await A.mouse.click(348, 304, { button: "right" });
    await A.click("#engrenagem");
    const rotulos = await A.locator("#menu-token .botao-largo").allTextContents();
    ok("4a) online, a engrenagem também tem os 3 botões", rotulos.join("|") === "Editar token|Guardar na bolsa|Excluir token", rotulos.join("|"));
    await A.click("#botao-guardar-token");
    ok("4b) o 'Verde' é guardado nas DUAS páginas", (await aguardar(A, async () => (await tokens(A)).find((t) => t.id === 1).guardado)) && (await aguardar(B, async () => (await tokens(B)).find((t) => t.id === 1).guardado)));
    await esperar(700);
    ok("4c) o arquivo 1.json foi atualizado (guardado: true)", arquivo(1).guardado === true, JSON.stringify(arquivo(1)));

    // --- excluir pelo menu da ficha: a caixa avisa do arquivo
    await A.locator(".ficha", { has: A.locator('.ficha-nome:text-is("Azul")') }).click({ button: "right" });
    await A.click("#menu-ficha-excluir");
    const msg = await A.locator("#confirmar-mensagem").textContent();
    ok("5a) a caixa de confirmar online avisa que o ARQUIVO também será apagado", /"Azul"/.test(msg) && /arquivo dele no servidor/.test(msg), msg);
    await A.click("#confirmar-ok");
    ok("5b) o token 'Azul' some das DUAS páginas", (await aguardar(A, async () => !(await tokens(A)).some((t) => t.id === 2))) && (await aguardar(B, async () => !(await tokens(B)).some((t) => t.id === 2))), JSON.stringify(await tokens(B)));
    await esperar(300);
    ok("5c) o ARQUIVO 2.json foi apagado do disco", !existsSync(join(pastaTokens, "2.json")) && jsons().join() === "1.json,3.json", jsons().join());

    // --- cancelar a exclusão não apaga nada
    await A.locator(".ficha", { has: A.locator('.ficha-nome:text-is("Renomeado")') }).click({ button: "right" });
    await A.click("#menu-ficha-excluir");
    await A.click("#confirmar-cancelar");
    await esperar(300);
    ok("5d) cancelar NÃO apaga: o token 3 continua e o arquivo também", (await tokens(B)).some((t) => t.id === 3) && existsSync(join(pastaTokens, "3.json")));

    // --- recarregar e reiniciar o servidor: tudo continua
    await B.reload();
    await B.waitForFunction(() => window.__tabuleirinho?.pronto === true && window.__tabuleirinho.rede?.ativa === true, null, { timeout: 15000 });
    ok("6a) o Beto recarrega a página e a mesa continua igual (tokens 1 e 3)", (await tokens(B)).map((t) => t.id).join() === "1,3", JSON.stringify(await tokens(B)));
    await A.close(); await B.close();
    await desligar(s);
    s = await subir();
    ok("6b) o servidor reinicia e carrega os 2 tokens que sobraram nos arquivos", s.saida().includes("2 token(s)"), s.saida().split("\n").slice(0, 3).join(" | "));
    ok("7) nenhum erro de JavaScript nas páginas", erros.length === 0, erros.join(" | "));
} finally {
    await nav.close().catch(() => undefined);
    await desligar(s).catch(() => undefined);
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar(erros);
