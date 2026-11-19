// Teste e2e: UM CLIQUE na caixa de um personagem da INICIATIVA faz aparecer um PING em cima do token dele no tabuleiro; arrastar para reordenar NÃO pinga; com o token fora da tela o ping
// mostra a SETA na borda (modo local). Rodar: npm run test:e2e -- iniciativa-ping (precisa do npm run dev).
import { PNG } from "pngjs";
import { abrirGaveta, abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
await abrirGaveta(p, "iniciativa");

const tela = (i) => p.evaluate((i) => { const t = window.__tabuleirinho; const k = t.estado.tokens[i]; return t.camera.mundoParaTela((k.col + k.size / 2) * 64, (k.row + k.size / 2) * 64); }, i);
for (const i of [0, 1]) {
    const q = await tela(i);
    await p.mouse.click(q.x, q.y, { button: "right" });
    await p.waitForTimeout(400);
    await p.locator("button", { hasText: "Adicionar à iniciativa" }).first().click();
    await p.waitForTimeout(500);
    await p.keyboard.press("Enter");
    await p.waitForTimeout(300);
}
ok("0) os 2 tokens entraram na iniciativa", (await p.locator(".iniciativa-item").count()) === 2);

/** Quantos pixels mudam em volta do token depois de `acao` (um ping desenha anéis e um símbolo ali). */
async function pixelsQueMudam(q, acao) {
    const clip = { x: Math.round(q.x - 110), y: Math.round(q.y - 130), width: 220, height: 220 };
    const antes = PNG.sync.read(await p.screenshot({ clip }));
    await acao();
    await p.waitForTimeout(350);
    const depois = PNG.sync.read(await p.screenshot({ clip }));
    let n = 0;
    for (let i = 0; i < antes.data.length; i += 4) if (Math.abs(antes.data[i] - depois.data[i]) + Math.abs(antes.data[i + 1] - depois.data[i + 1]) + Math.abs(antes.data[i + 2] - depois.data[i + 2]) > 60) n++;
    return n;
}
const nome = await p.evaluate(() => window.__tabuleirinho.estado.tokens[0].nome);
const item = () => p.locator(".iniciativa-item", { hasText: nome }).first();
const posicao = await tela(0);

ok("1) um clique na caixa do personagem faz aparecer um ping em cima do token", (await pixelsQueMudam(posicao, () => item().click({ position: { x: 40, y: 12 } }))) > 800);
await p.waitForTimeout(3500); // (o ping some sozinho)

const caixa = await item().boundingBox();
ok("2) arrastar a caixa para reordenar NÃO faz ping", (await pixelsQueMudam(posicao, async () => { await p.mouse.move(caixa.x + 40, caixa.y + 10); await p.mouse.down(); await p.mouse.move(caixa.x + 40, caixa.y + 40, { steps: 6 }); await p.mouse.up(); })) < 100);
await p.waitForTimeout(3500);

await p.evaluate(() => window.__tabuleirinho.camera.moverPor(-99999, 0)); // (o token sai da tela)
await item().click({ position: { x: 40, y: 12 } });
await p.waitForTimeout(400);
ok("3) com o token fora da tela, o ping mostra a SETA na borda", (await p.evaluate(() => window.__tabuleirinho.setasDePing())) >= 1);

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
