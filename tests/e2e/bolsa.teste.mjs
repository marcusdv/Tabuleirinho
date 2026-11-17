// Teste e2e: a BOLSA (aba da coluna da direita) e o modelo "token da bolsa × PEÇA no tabuleiro". Rodar: npm run test:e2e -- bolsa  (precisa do `npm run dev`).
// Arrastar a fichinha da bolsa para o mapa NÃO move o token: ele continua na bolsa (é o "modelo") e nasce uma PEÇA na casa onde soltou. Arrastar a peça de volta para a bolsa (ou "Remover
// do tabuleiro") APAGA a peça, e o aviso oferece "Desfazer". Com uma ferramenta ligada (ex.: calibragem) a bolsa não solta peças.
import { abrirGaveta, abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

// Um token da BOLSA (modelo): guardado, sem ser peça. (Os 5 tokens de teste do `semear` são "soltos" no tabuleiro: não os usamos aqui.)
await p.evaluate(() => window.__tabuleirinho.semear([{ id: 50, nome: "Modelo A", imagem: null, col: 0, row: 0, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, guardado: true }]));
await p.waitForTimeout(300);

const pecas = () => p.evaluate(() => window.__tabuleirinho.estado.tokens.filter((t) => t.copiaDe === 50).map((t) => ({ id: t.id, col: t.col, row: t.row, guardado: t.guardado })));
const modelo = () => p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.id === 50); return t ? { guardado: t.guardado } : null; });
const fichinhas = () => p.locator("#bolsa-itens .ficha", { hasText: "Modelo A" });
const centro = (c) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
async function arrastar(de, para) {
    await p.mouse.move(de.x, de.y); await p.waitForTimeout(80); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(de.x + ((para.x - de.x) * i) / 10, de.y + ((para.y - de.y) * i) / 10); await p.waitForTimeout(30); }
    await p.mouse.up(); await p.waitForTimeout(350);
}
const telaDaCasa = (col, row) => p.evaluate(([c, r]) => { const k = window.__tabuleirinho.camera.mundoParaTela((c + 0.5) * 64, (r + 0.5) * 64); return { x: k.x, y: k.y }; }, [col, row]);

// 1) a bolsa é a aba da coluna da direita
const caixaBolsa = await p.locator("#bolsa").boundingBox();
ok("1a) a bolsa está na coluna da direita (x ≥ 1068, até a borda)", caixaBolsa.x >= 1066 && perto(caixaBolsa.x + caixaBolsa.width, 1388), `${caixaBolsa.x.toFixed(0)}..${(caixaBolsa.x + caixaBolsa.width).toFixed(0)}`);
function perto(a, b, t = 3) { return Math.abs(a - b) <= t; }
ok("1b) o token novo aparece na bolsa (1 fichinha) e ainda não tem peças", (await fichinhas().count()) === 1 && (await pecas()).length === 0);

// 2) arrastar a fichinha para o mapa cria uma PEÇA; o modelo continua na bolsa
await arrastar(centro(await fichinhas().first().boundingBox()), await telaDaCasa(8, 4));
const depoisDoPrimeiro = await pecas();
ok("2a) soltar no mapa cria uma peça na casa (8, 4), encaixada", depoisDoPrimeiro.length === 1 && depoisDoPrimeiro[0].col === 8 && depoisDoPrimeiro[0].row === 4 && depoisDoPrimeiro[0].guardado === false, JSON.stringify(depoisDoPrimeiro));
ok("2b) o token da bolsa CONTINUA guardado, e a fichinha continua lá", (await modelo()).guardado === true && (await fichinhas().count()) === 1);
ok("2c) a fichinha NÃO mostra mais contador de peças no mapa", !/no mapa/.test(await fichinhas().first().innerText()) && (await p.locator(".item-no-mapa").count()) === 0, await fichinhas().first().innerText());
await arrastar(centro(await fichinhas().first().boundingBox()), await telaDaCasa(12, 6));
ok("3) arrastar de novo cria OUTRA peça (duas peças do mesmo token)", (await pecas()).length === 2);

// 4) arrastar a peça de volta para a bolsa apaga a peça e oferece "Desfazer"
const pecaB = (await pecas()).find((x) => x.col === 12);
const ondeB = await telaDaCasa(pecaB.col, pecaB.row);
await arrastar(ondeB, centro(await p.locator("#bolsa").boundingBox()));
ok("4a) soltar a peça sobre a bolsa APAGA a peça (sobra 1); o token da bolsa continua", (await pecas()).length === 1 && (await modelo()).guardado === true, JSON.stringify(await pecas()));
ok("4b) aparece um aviso com o botão 'Desfazer'", await p.locator("#aviso button", { hasText: "Desfazer" }).isVisible());
await p.locator("#aviso button", { hasText: "Desfazer" }).click();
await p.waitForTimeout(300);
const refeitas = await pecas();
ok("4c) 'Desfazer' recria a peça no mesmo lugar (12, 6)", refeitas.length === 2 && refeitas.some((x) => x.col === 12 && x.row === 6), JSON.stringify(refeitas));

// 5) com a calibragem ligada, a bolsa não solta peças
await abrirGaveta(p, "tabuleiro");
await p.click("#calibrar-alternar"); await p.waitForTimeout(300);
await p.click("#bolsa-aba-tokens"); await p.waitForTimeout(150); // (a calibragem fica ligada; volta à aba dos tokens para arrastar)
await arrastar(centro(await fichinhas().first().boundingBox()), await telaDaCasa(5, 2));
ok("5) calibrando, arrastar da bolsa para o mapa NÃO cria peça", (await pecas()).length === 2, String((await pecas()).length));
await p.keyboard.press("Escape"); await p.waitForTimeout(300);

ok("6) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
