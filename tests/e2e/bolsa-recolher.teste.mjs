// Teste e2e: "Recolher do tabuleiro" no menu do CLIQUE DIREITO da fichinha de um token: tira do tabuleiro as peças daquele token que estão NESTE mapa (as de outros mapas ficam), com "Desfazer". Rodar: npm run test:e2e -- bolsa-recolher
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
await p.evaluate(() => window.__tabuleirinho.semear([{ id: 50, nome: "Modelo A", imagem: null, col: 0, row: 0, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, guardado: true, condicoes: [], copiaDe: null }]));
await p.waitForTimeout(300);

const pecas = () => p.evaluate(() => window.__tabuleirinho.estado.tokens.filter((t) => t.copiaDe === 50 && !t.guardado).length);
const fichinha = () => p.locator("#bolsa-itens .ficha", { hasText: "Modelo A" }).first();
const centro = (c) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
const telaDaCasa = (col, row) => p.evaluate(([c, r]) => { const k = window.__tabuleirinho.camera.mundoParaTela((c + 0.5) * 64, (r + 0.5) * 64); return { x: k.x, y: k.y }; }, [col, row]);
async function arrastar(de, para) {
    await p.mouse.move(de.x, de.y); await p.waitForTimeout(80); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(de.x + ((para.x - de.x) * i) / 10, de.y + ((para.y - de.y) * i) / 10); await p.waitForTimeout(30); }
    await p.mouse.up(); await p.waitForTimeout(350);
}

const menu = () => p.locator("#menu-ficha-recolher");
async function abrirMenu() {
    const c = await fichinha().boundingBox();
    await p.mouse.click(c.x + c.width / 2, c.y + c.height / 2, { button: "right" });
    await p.waitForTimeout(200);
}

ok("1a) a fichinha NÃO tem mais botão na miniatura", (await fichinha().locator(".ficha-recolher").count()) === 0);
// sem peça no mapa: o item do menu existe, fica apagado e explica por quê
await abrirMenu();
ok("1b) o clique direito mostra 'Recolher do tabuleiro'", await menu().isVisible());
ok("1c) sem peça neste mapa, o item fica apagado", await menu().isDisabled());
await p.keyboard.press("Escape");

// três peças do mesmo token: duas neste mapa e uma de OUTRO mapa
await arrastar(centro(await fichinha().boundingBox()), await telaDaCasa(8, 3));
await arrastar(centro(await fichinha().boundingBox()), await telaDaCasa(10, 5));
await arrastar(centro(await fichinha().boundingBox()), await telaDaCasa(12, 7));
ok("2a) três peças do mesmo token no tabuleiro", (await pecas()) === 3, String(await pecas()));
await p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.filter((x) => x.copiaDe === 50 && !x.guardado).at(-1); t.mapa = "0123456789abcdef"; }); // (a 3ª "mora" em outro mapa)
await abrirMenu();
ok("2b) o item mostra quantas peças saem DESTE mapa (2)", /\(2\)/.test(await menu().innerText()), await menu().innerText());
await menu().click();
await p.waitForTimeout(400);
ok("2c) recolher tira só as peças DESTE mapa: a de outro mapa continua", (await pecas()) === 1, String(await pecas()));
ok("2d) o aviso diz quantas saíram (2)", /2 tokens foram removidos/.test(await p.locator("#aviso").innerText()), await p.locator("#aviso").innerText());
ok("2e) o modelo continua na bolsa", (await p.locator("#bolsa-itens .ficha", { hasText: "Modelo A" }).count()) === 1);
await p.locator("#aviso button", { hasText: "Desfazer" }).click();
await p.waitForTimeout(500);
ok("3) 'Desfazer' recria as duas", (await pecas()) === 3, String(await pecas()));

ok("4) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
process.exitCode = terminar(erros);
await nav.close();
