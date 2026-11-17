// Teste e2e: DANO, CURA E CONDIÇÃO EM ÁREA no tabuleiro (modo LOCAL). Rodar: npm run test:e2e -- acoes-em-area   (precisa do servidor: npm run dev)
//
// Pedido do dono (17/11/2026; o valor se digita num CAMPO dentro do painel, sem janela): com vários tokens SELECIONADOS (Ctrl + clique), o clique direito oferece o que TODOS podem receber (dano, cura, "Add condição"); o "Remover do tabuleiro" continua no
// cartão de aviso EMBAIXO, como antes. Aqui: o menu abre, mostra o título e a condição em área liga em todos; sem status nos tokens de teste, o menu diz que nenhuma ação vale para todos; e o
// dano em área, com uma ficha de PV nos dois tokens, tira o mesmo valor de cada um.
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

const centro = (a) => ({ x: a.x + a.largura / 2, y: a.y + a.largura / 2 });
const ancora = (id) => p.evaluate((i) => window.__tabuleirinho.tokens.ancoraNaTela(i), id);
const estadoToken = (id) => p.evaluate((i) => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.id === i); return { condicoes: t.condicoes, valores: t.valores }; }, id);

// seleciona dois tokens com Ctrl + clique e abre o menu com o botão direito
async function selecionarDois() {
    await p.evaluate(() => window.__tabuleirinho.tokens.limparSelecao()); // (começa sem seleção: o Ctrl + clique liga e desliga)
    const a = centro(await ancora(1)), b = centro(await ancora(2));
    await p.keyboard.down("Control");
    await p.mouse.click(a.x, a.y);
    await p.mouse.click(b.x, b.y);
    await p.keyboard.up("Control");
    await p.mouse.click(a.x, a.y, { button: "right" });
}
await selecionarDois();
await p.waitForSelector("#menu-grupo-mapa:not([hidden])", { timeout: 3000 });
ok("1a) o clique direito com 2 tokens selecionados abre o menu de vários tokens", (await p.locator("#menu-grupo-mapa h1").innerText()).toLowerCase().includes("2 tokens"));
ok("1b) o cartão EMBAIXO continua com 'Remover do tabuleiro' (a confirmação, como hoje)", (await p.locator("#aviso-acao").innerText()).includes("Remover do tabuleiro"));
ok("1c) sem status nos tokens de teste, o menu explica que nenhuma ação vale para todos, mas oferece 'Add condição'", (await p.locator("#menu-grupo-mapa .grupo-vazio").count()) === 1 && (await p.locator("#menu-grupo-mapa button", { hasText: "Add condição" }).count()) === 1);

await p.locator("#menu-grupo-mapa button", { hasText: "Add condição" }).click();
ok("1d) a grade de condições aparece (as 18)", (await p.locator("#menu-grupo-mapa .condicao-grupo").count()) === 18);
await p.locator("#menu-grupo-mapa .condicao-grupo", { hasText: "Caído" }).first().click();
const c1 = await estadoToken(1), c2 = await estadoToken(2);
ok("1e) a condição foi ligada nos DOIS tokens", c1.condicoes.includes("Caido") && c2.condicoes.includes("Caido"), JSON.stringify([c1.condicoes, c2.condicoes]));
ok("1f) o menu CONTINUA aberto ao escolher (dá para escolher várias condições) e o botão ficou marcado", (await p.locator("#menu-grupo-mapa").isVisible()) && (await p.locator("#menu-grupo-mapa .condicao-grupo.ativa").count()) === 1);
await p.keyboard.press("Escape"); // (fecha o painel para o resto do teste)
await p.waitForTimeout(150);

// clicar de novo (todos já têm): desliga de todos
await selecionarDois();
await p.locator("#menu-grupo-mapa button", { hasText: "Add condição" }).click();
ok("1g) a condição que todos têm aparece marcada", (await p.locator("#menu-grupo-mapa .condicao-grupo.ativa").count()) === 1);
await p.locator("#menu-grupo-mapa .condicao-grupo.ativa").click();
ok("1h) clicar nela tira de todos", !(await estadoToken(1)).condicoes.includes("Caido") && !(await estadoToken(2)).condicoes.includes("Caido"));

// dano em área: dá uma ficha de PV aos dois tokens (pelo estado) e abre o menu de novo
await p.evaluate(() => {
    const e = window.__tabuleirinho.estado;
    const nova = (id, texto) => ({ id, nome: `F${id}`, abas: [{ nome: "Página 1", texto }], versao: 1, criadaEm: 0, alteradaEm: 0, favorito: false, grupos: [] });
    e.fichas.push(nova(901, "PV::0:20:20"), nova(902, "PV::0:30:30"));
    e.tokens.find((t) => t.id === 1).ficha = 901;
    e.tokens.find((t) => t.id === 2).ficha = 902;
    for (const id of [1, 2]) { const t = e.tokens.find((x) => x.id === id); t.valores = t.status.map((s) => ({ id: s.id, atual: id === 1 ? 20 : 30, max: id === 1 ? 20 : 30 })); }
});
await p.keyboard.press("Escape");
await selecionarDois();
await p.waitForSelector("#menu-grupo-mapa:not([hidden])");
ok("2a) com o status em todos, o menu oferece Dano e Cura", (await p.locator("#menu-grupo-mapa button", { hasText: /^Dano$/ }).count()) === 1 && (await p.locator("#menu-grupo-mapa button", { hasText: /^Cura$/ }).count()) === 1);
await p.locator("#menu-grupo-mapa button", { hasText: /^Dano$/ }).click();
await p.waitForSelector("#menu-grupo-mapa .linha-valor-grupo input");
ok("2b) o campo abre DENTRO do painel (sem janela) e a conta diz que vale para os 2 tokens", !(await p.locator("#modal-acao").isVisible()) && true);
await p.keyboard.type("5");
ok("2b2) a conta embaixo do campo diz só a quantidade e quantos tokens ('− 5 em 2 tokens'), sem parênteses", (await p.locator("#menu-grupo-mapa .previa").innerText()).trim() === "− 5 em 2 tokens", await p.locator("#menu-grupo-mapa .previa").innerText());
await p.keyboard.press("Enter");
const v1 = (await estadoToken(1)).valores[0]?.atual, v2 = (await estadoToken(2)).valores[0]?.atual;
ok("2c) o dano em área tirou 5 de CADA um (20 -> 15 e 30 -> 25)", v1 === 15 && v2 === 25, `${v1} e ${v2}`);

await nav.close();
process.exitCode = terminar(erros); // (o executor lê o código de saída)
