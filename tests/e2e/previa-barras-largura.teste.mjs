// Teste e2e: a PRÉVIA DAS BARRAS (na bolsa em tela cheia) tem a MESMA largura da prévia do token, com 1 status ou com vários, mesmo de nome comprido: ela não pode alargar a coluna da esquerda
// nem empurrar o editor de status. Rodar: npm run test:e2e -- previa-barras-largura (precisa do npm run dev).
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
await p.keyboard.press("q"); // (a bolsa em tela cheia)
await p.waitForTimeout(600);

const medir = () => p.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x), larg: Math.round(b.width) }; };
    return { token: r("#bolsa-previa"), barras: r("#bolsa-previa-barras"), editor: r("#bolsa-status") };
});

const antes = await medir();
ok("1) com 1 status, a prévia das barras tem a largura da prévia do token", antes.barras.larg === antes.token.larg, JSON.stringify(antes));

for (const [nome, variavel] of [["Pontos de Concentração Longos", "PCL"], ["Inspiração Heroica", "IH"]]) {
    await p.click("#bolsa-status button:has-text('+ Status')");
    await p.waitForTimeout(200);
    const linhas = p.locator("#bolsa-status .status-tabela tbody tr");
    const campos = linhas.nth((await linhas.count()) - 1).locator('input[type="text"], input:not([type])');
    await campos.nth(0).fill(nome);
    await campos.nth(1).fill(variavel);
    await campos.nth(1).press("Tab");
    await p.waitForTimeout(250);
}
const depois = await medir();
ok("2) com 3 status (nomes compridos), a prévia das barras continua com a largura da prévia do token", depois.barras.larg === depois.token.larg && depois.token.larg === antes.token.larg, JSON.stringify(depois));
ok("3) e o editor de status não se mexeu (mesmo x e mesma largura)", depois.editor.x === antes.editor.x && depois.editor.larg === antes.editor.larg, `${JSON.stringify(antes.editor)} -> ${JSON.stringify(depois.editor)}`);

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
