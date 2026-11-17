// Teste e2e: A FICHA EM TELA DE CELULAR (390 × 844), em TELA CHEIA. Rodar: npm run test:e2e -- fichas-celular   (precisa do `npm run dev`)
// Abaixo de 700 px de largura a ficha ocupa a tela toda: o texto em cima e o painel de variáveis, recursos e rolagens embaixo; sem arrastar, minimizar nem fixar; o ✕ FECHA de verdade. O chat e a bolsa
// ocupam a LARGURA TODA e ficam mais baixos (40% da altura).
// (Usa o Chrome com a marca de automação desligada: assim as fichas de EXEMPLO nascem, e há uma ficha para abrir.)
import { chromium } from "playwright-core";
import { URL_SITE, ok, terminar } from "./ajuda.mjs";

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-gpu", "--disable-blink-features=AutomationControlled"] });
const p = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await p.goto(URL_SITE);
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await p.waitForTimeout(1200);

// 1) o chat e a bolsa: largura toda, e mais baixos
const coluna = await p.locator("#chat").boundingBox();
ok("1a) o chat/bolsa ocupa a LARGURA TODA da tela (de 0 a 390)", Math.abs(coluna.x) < 1 && Math.abs(coluna.width - 390) < 1, JSON.stringify(coluna));
ok("1b) e é mais baixo: 40% da altura (338 px de 844), encostado no pé da tela", Math.abs(coluna.height - 338) < 2 && Math.abs(coluna.y + coluna.height - 844) < 1, JSON.stringify(coluna));

// 2) a ficha em tela cheia
await p.locator("#bolsa-aba-fichas").tap();
await p.waitForTimeout(300);
await p.locator(".bolsa-doc", { hasText: "Thorin" }).dblclick({ force: true });
await p.waitForTimeout(700);
const painel = await p.locator("#editor-ficha-painel").boundingBox();
ok("2a) a ficha ocupa a TELA TODA (0, 0, 390 × 844)", painel.x === 0 && painel.y === 0 && painel.width === 390 && painel.height === 844, JSON.stringify(painel));
const disposicao = await p.evaluate(() => {
    const texto = document.querySelector("#editor-ficha-area").getBoundingClientRect();
    const painelLateral = document.querySelector("#editor-ficha-lateral").getBoundingClientRect();
    return { textoEmCima: texto.bottom <= painelLateral.top + 2, semRolagemHorizontal: document.documentElement.scrollWidth <= innerWidth };
});
ok("2b) o texto fica EM CIMA e o painel EMBAIXO, sem rolagem horizontal da página", disposicao.textoEmCima && disposicao.semRolagemHorizontal, JSON.stringify(disposicao));
ok("2c) não há botão de fixar nem de minimizar", !(await p.locator("#editor-ficha-fixar").isVisible()) && !(await p.locator("#editor-ficha-minimizar").isVisible()));
const botoes = await p.evaluate(() => ["#editor-ficha-x", "#editor-ficha-fechar", "#editor-ficha-salvar", "#editor-ficha-ver"].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { dentro: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, altura: r.height }; }));
ok("2d) os botões cabem na tela e são grandes para o toque (36 px ou mais)", botoes.every((x) => x.dentro && x.altura >= 34), JSON.stringify(botoes));
await p.locator("#editor-ficha-x").tap();
await p.waitForTimeout(300);
ok("3) o ✕ FECHA a ficha de verdade (não há barrinha no celular)", !(await p.locator("#editor-ficha-painel").isVisible()));

ok("4) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
