// Teste e2e: CARTÕES DAS FICHAS, `(Nome)"""texto"""` (modo LOCAL, na tela). Rodar: npm run test:e2e -- fichas-cartoes   (precisa do `npm run dev`)
// Usa o "Pergaminho de Bola de Fogo", o cartão de exemplo da página "Itens mágicos" do Thorin (src/exemplos.ts): `[8 + PROF + MOD_DES]` (conta: 8 + 3 + 1 = 12) e `[8d6]` (rolagem).
// Como a mesa de exemplo só carrega quando o navegador NÃO se diz automatizado (`navigator.webdriver`), este teste abre o Chrome com a marca de automação desligada (o caminho real de quem joga).
//
// O que confere: na LEITURA o cartão é uma caixa com o nome clicável e as [expressões] de dentro não viram rolagens soltas; clicar no nome manda o cartão ao CHAT, com a conta CALCULADA e o dado ROLADO
// (só o total aparece, a conta fica na dica); cada número do cartão se ARRASTA como o total de uma rolagem: até a caixa da INICIATIVA (entra com o valor do número pego) e até um TOKEN (dá dano a ele).
import { chromium } from "playwright-core";
import { URL_SITE, ok, terminar } from "./ajuda.mjs";

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-gpu", "--disable-blink-features=AutomationControlled"] });
const p = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await p.addInitScript(() => {
    try {
        localStorage.setItem("tabuleirinho.lateral.aba", "bolsa");
        localStorage.setItem("tabuleirinho.dados.recolhido", "0");
    } catch {
        /* sem armazenamento */
    }
});
await p.goto(URL_SITE);
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await p.waitForTimeout(800);
await p.evaluate(() => { window.__tabuleirinho.atrasoRolagemMs = 0; });

// 0) um goblin (PV 10) no tabuleiro, para receber o dano arrastado depois
const fichinha = p.locator("#bolsa-itens .ficha", { hasText: "Goblin" }).first();
const c = await fichinha.boundingBox();
await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
await p.mouse.down();
await p.mouse.move(c.x - 200, c.y - 80, { steps: 6 });
await p.mouse.move(500, 400, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(400);
const goblin = () => p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.copiaDe !== null); return { col: t.col, row: t.row, atual: t.valores[0]?.atual }; });
const g0 = await goblin();
const posGoblin = await p.evaluate((pc) => { const k = window.__tabuleirinho.camera.mundoParaTela((pc.col + 0.5) * 64, (pc.row + 0.5) * 64); return { x: k.x, y: k.y }; }, g0);
ok("0) o goblin está no tabuleiro com 10 de vida", g0.atual === 10, JSON.stringify(g0));

// 1) abre a ficha do Thorin, página "Itens mágicos", na leitura
await p.click("#bolsa-aba-fichas");
await p.locator(".bolsa-doc", { hasText: "Thorin" }).dblclick({ force: true });
await p.waitForTimeout(600);
await p.locator(".aba-ficha-nome", { hasText: "Itens mágicos" }).click();
await p.waitForTimeout(300);
if (!(await p.locator("#editor-ficha-previa").isVisible())) await p.locator("#editor-ficha-ver").click(); // "Confirmar": edição -> leitura
await p.waitForTimeout(200);
ok("1a) na LEITURA o cartão é uma caixa com o nome clicável", (await p.locator(".cartao-previa").count()) === 1 && (await p.locator(".cartao-previa-nome").textContent()) === "Bola de Fogo");
ok("1b) o texto de dentro aparece formatado (o título e as linhas)", (await p.locator(".cartao-previa .titulo").count()) === 1 && /alcance 45 m/.test(await p.locator(".cartao-previa-corpo").textContent()));
ok("1c) as [expressões] de dentro NÃO viram rolagens soltas (a lista da página só tem as 5 rolagens de antes)", (await p.locator("#editor-ficha-rolagens li").count()) === 5, String(await p.locator("#editor-ficha-rolagens li").count()));

// 2) clicar no nome manda o cartão ao chat
await p.locator(".cartao-previa-nome").click();
await p.waitForTimeout(500);
ok("2a) clicar no nome avisa que foi ao chat", /enviado ao chat/.test(await p.locator("#editor-ficha-aviso").textContent()), await p.locator("#editor-ficha-aviso").textContent());
await p.locator("#editor-ficha-x").click();
await p.waitForTimeout(300);
await p.click("#lateral-aba-chat");
await p.waitForTimeout(400);
const msg = p.locator(".chat-cartao-ficha").last();
ok("2b) o cartão chegou ao chat, com o nome e a criatura", (await msg.locator(".chat-titulo-ficha").textContent()) === "Bola de Fogo" && (await msg.locator(".chat-criatura").textContent()) === "Thorin Escudo-de-Carvalho");
const pilulas = msg.locator(".chat-cartao-resultado");
const resultados = await pilulas.evaluateAll((els) => els.map((e) => ({ classe: e.className, texto: e.textContent, dica: e.title })));
ok("2c) dois resultados: a conta CALCULADA (12) e o dado ROLADO (8d6, de 8 a 48)", resultados.length === 2 && /conta/.test(resultados[0].classe) && resultados[0].texto === "12" && /rolagem/.test(resultados[1].classe) && Number(resultados[1].texto) >= 8 && Number(resultados[1].texto) <= 48 && /^8d6 \[/.test(resultados[1].dica), JSON.stringify(resultados));
ok("2d) só o TOTAL aparece no cartão (o cálculo e os dados não), e a dica mostra a fórmula", resultados.every((r) => /^\d+$/.test(r.texto)) && (await pilulas.first().locator("small").count()) === 0 && (await pilulas.locator(".chat-dado").count()) === 0 && /8d6/.test(resultados[1].dica));
ok("2e) o texto do cartão mostra os resultados no lugar dos colchetes", !/\[8d6\]|\[8 \+/.test(await msg.locator(".chat-cartao-corpo").innerText()));
ok("2f) o texto do cartão tem 12,5 px", (await msg.locator(".chat-cartao-corpo").evaluate((e) => getComputedStyle(e).fontSize)) === "12.5px");
const dano = Number(resultados[1].texto);

// 3) arrastar cada número: até a iniciativa (entra com o valor do número pego) e até um token (dá dano)
ok("3a) os números do cartão são arrastáveis (cursor de agarrar)", await pilulas.nth(1).evaluate((e) => e.classList.contains("arrastavel") && getComputedStyle(e).cursor === "grab"));
async function arrastar(pilula, x, y) {
    const b = await pilula.boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x - 40, b.y - 20, { steps: 4 });
    const sombra = (await p.locator(".chat-sombra-dano").count()) === 1 ? await p.locator(".chat-sombra-dano").innerText() : null;
    await p.mouse.move(x, y, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(400);
    return sombra;
}
if (!(await p.locator("#iniciativa-lista").isVisible())) await p.click("#iniciativa-alternar");
await p.waitForTimeout(400);
const caixa = await p.locator("#iniciativa").boundingBox();
const sombra = await arrastar(pilulas.nth(1), caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
ok("3b) durante o arrasto aparece a SOMBRA com o número do dano", sombra === String(dano), `${sombra} / ${dano}`);
const lista = await p.evaluate(() => [...document.querySelectorAll("#iniciativa-lista li")].map((li) => li.textContent));
ok("3c) soltar o DANO na iniciativa cria o personagem 'Thorin…' com o valor do DANO (e não o da conta)", lista.length === 1 && /Thorin/.test(lista[0]) && lista[0].includes(String(dano)), JSON.stringify({ lista, dano }));
await p.click("#iniciativa-alternar"); // fecha a caixa: ela podia estar cobrindo o tabuleiro
await p.waitForTimeout(400);
await p.click("#lateral-aba-chat");
await arrastar(pilulas.nth(1), posGoblin.x, posGoblin.y);
const g1 = await goblin();
ok("3d) soltar o DANO em cima do token tira vida dele (limitado a 0)", g1.atual === Math.max(0, 10 - dano), JSON.stringify({ g1, dano }));

ok("4) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
