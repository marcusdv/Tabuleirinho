import { chromium } from "playwright-core";
const nav = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-gpu", "--disable-blink-features=AutomationControlled"] });
const p = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem("tabuleirinho.lateral.aba", "bolsa"); } catch {} });
await p.goto("http://127.0.0.1:5173/");
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await p.waitForTimeout(600);
const aberta = () => p.evaluate(() => document.getElementById("bolsa").classList.contains("expandida"));
const fichaVisivel = () => p.locator("#editor-ficha-painel").isVisible();
await p.locator("#bolsa-gerenciar").click();
await p.locator("#bolsa-abas [role=tab]", { hasText: "Fichas" }).click();
console.log("1) bolsona aberta:", await aberta());
// 2) duplo clique numa ficha da lista (aba Fichas)
await p.locator(".bolsa-doc").first().dblclick();
await p.waitForTimeout(700);
console.log("2) depois do duplo clique numa ficha: bolsona aberta:", await aberta(), "| ficha visível:", await fichaVisivel());
// a ficha está por cima? (o ponto central da janela pertence a ela)
const cima = await p.evaluate(() => { const r = document.getElementById("editor-ficha-painel").getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 80); return !!el?.closest("#editor-ficha-painel"); });
console.log("   ficha por cima da bolsona:", cima);
// 3) Esc dentro da ficha fecha só a ficha
await p.locator("#editor-ficha-texto").click().catch(() => {});
await p.keyboard.press("Escape");
await p.waitForTimeout(500);
console.log("3) Esc na ficha: ficha visível:", await fichaVisivel(), "| bolsona ainda aberta:", await aberta());
// 4) duplo clique num TOKEN da bolsona (aba Tokens) com ficha: abre a ficha sem fechar
await p.locator("#bolsa-abas [role=tab]", { hasText: "Tokens" }).click();
await p.locator("#bolsa-itens .ficha", { hasText: "Goblin" }).first().dblclick();
await p.waitForTimeout(700);
console.log("4) duplo clique num token na bolsona: ficha visível:", await fichaVisivel(), "| bolsona aberta:", await aberta());
await p.screenshot({ path: "/tmp/claude-1000/-home-marcusviniciusdeoliveirabittenc-Documentos-tabuleirinho/1eec25e2-87e6-4ffd-8b1b-fb3c2106d9e9/scratchpad/bolsona-com-ficha.png" });
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
console.log("5) Esc de novo (foco na ficha): ficha:", await fichaVisivel(), "| bolsona:", await aberta());
console.log("erros de página:", erros.length ? erros.join("\n") : "nenhum");
await nav.close();
