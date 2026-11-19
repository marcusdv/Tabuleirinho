// Teste e2e: as CONDIÇÕES no cartão do personagem na INICIATIVA não empurram o número da iniciativa nem estouram o cartão (elas quebram de linha), e o MORTO risca o disco do token
// (modo local). Rodar: npm run test:e2e -- iniciativa-condicoes-largura (precisa do npm run dev).
import { abrirGaveta, abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
await abrirGaveta(p, "iniciativa");

const todas = ["Cego", "Caido", "Atordoado", "Contido", "Agarrado", "Surdo", "Invisivel", "Exausto", "Petrificado", "Paralisado"];
const medir = () => p.evaluate(() => {
    const item = [...document.querySelectorAll(".iniciativa-item")].at(-1);
    const caixa = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), larg: Math.round(b.width), alt: Math.round(b.height) }; };
    return { valor: caixa(item.querySelector(".iniciativa-valor")), condicoes: caixa(item.querySelector(".iniciativa-condicoes")), cartao: caixa(item), estoura: item.scrollWidth > item.clientWidth + 1, morto: item.querySelector(".iniciativa-disco").classList.contains("morto") };
});
const poCondicoes = async (ids) => {
    await p.evaluate((lista) => { const t = window.__tabuleirinho; t.estado.tokens[0].condicoes = lista; t.tokens.redesenhar(t.estado.tokens[0]); }, ids);
    await p.evaluate(() => document.querySelector("#iniciativa-ordem")?.dispatchEvent(new Event("change", { bubbles: true }))); // (a lista da iniciativa se redesenha)
    await p.waitForTimeout(350);
};

// o 1º token entra na iniciativa pelo menu do clique direito
const q = await p.evaluate(() => { const t = window.__tabuleirinho; const k = t.estado.tokens[0]; return t.camera.mundoParaTela((k.col + k.size / 2) * 64, (k.row + k.size / 2) * 64); });
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(400);
await p.locator("button", { hasText: "Adicionar à iniciativa" }).first().click();
await p.waitForTimeout(500);
await p.keyboard.press("Enter");
await p.waitForTimeout(300);

const sem = await medir();
await poCondicoes(todas.slice(0, 4));
const com4 = await medir();
await poCondicoes(todas);
const com10 = await medir();
ok("1) com 4 condições o número da iniciativa continua no mesmo lugar e com a mesma largura", com4.valor.x === sem.valor.x && com4.valor.larg === sem.valor.larg, JSON.stringify({ sem: sem.valor, com4: com4.valor }));
ok("2) com 10 condições também (elas quebram de linha em vez de empurrar o número)", com10.valor.x === sem.valor.x && com10.valor.larg === sem.valor.larg && com10.condicoes.alt > com4.condicoes.alt, JSON.stringify({ sem: sem.valor, com10: com10.valor, altCond4: com4.condicoes.alt, altCond10: com10.condicoes.alt }));
ok("3) o cartão não estoura para os lados e a linha das condições cabe nele", !com10.estoura && com10.condicoes.larg <= com10.cartao.larg, JSON.stringify(com10));

// o MORTO risca o disco do token na iniciativa (e as outras condições não)
ok("4) sem o Morto o disco NÃO é riscado", com10.morto === false);
await poCondicoes(["Morto", "Cego"]);
ok("5) com a condição Morto o disco do token na iniciativa é riscado (X vermelho)", (await medir()).morto === true);

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
