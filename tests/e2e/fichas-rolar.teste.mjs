// Teste e2e: ROLAR as rolagens da ficha pelo editor e ver o cartão no chat (modo LOCAL). Rodar: npm run test:e2e -- fichas-rolar
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs. O sorteio no servidor é do teste `rolar-ficha`.
//
// Clicar no NOME da rolagem (a pílula laranja no texto) ou no item dela na lista rola (também com Enter no teclado): o cartão aparece no chat com o
// nome da rolagem, o da ficha, a fórmula com o que saiu em cada dado e o total. Com texto não salvo pede para salvar; rolagem com erro não rola e
// mostra o motivo; nomes com HTML aparecem como texto. Os itens da lista não têm rótulo "Rolar" (a caixa inteira é o botão).
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const cartoes = () => p.locator(".chat-mensagem.chat-rolagem-ficha").evaluateAll((els) => els.map((e) => ({
    autor: e.querySelector("strong")?.textContent, titulo: e.querySelector(".chat-titulo-ficha strong")?.textContent, ficha: e.querySelector(".chat-criatura")?.textContent,
    detalhe: e.querySelector(".chat-detalhe")?.textContent, total: e.querySelector(".chat-total")?.textContent,
})));

await p.click("#bolsa-aba-fichas");
await p.click("#bolsa-ficha-criar-botao");
await p.locator(".bolsa-doc").first().click();
await p.fill("#editor-ficha-nome", "Goblin Chefe");
await p.fill("#editor-ficha-texto", "FOR:: 16\nPROF:: 3\nMOD:: (FOR - 10) / 2\n(Ataque com espada)[1d20 + MOD + PROF]\n(Dano)[2d6 + MOD]\n(Errada)[1d20 + SORTE]\n[1d8]");
await p.waitForTimeout(150);

// ----- com texto NÃO salvo
const nomeAtaque = p.locator("#editor-ficha-cores .rolagem-nome").first();
await nomeAtaque.click();
ok("1a) clicar no nome com o texto NÃO salvo não rola e pede para salvar", (await cartoes()).length === 0 && /Salve a ficha/.test(await p.locator("#editor-ficha-aviso").textContent()), await p.locator("#editor-ficha-aviso").textContent());
ok("1b) a dica do nome diz 'Clique para rolar' com a fórmula calculada", /Clique para rolar: Ataque com espada: 1d20 \+ 3 \+ 3/.test((await nomeAtaque.getAttribute("title")) ?? ""), await nomeAtaque.getAttribute("title"));

// ----- salva e rola pelo nome no texto
await p.keyboard.press("Control+s");
await p.waitForTimeout(100);
await nomeAtaque.click();
let c = await cartoes();
ok("2a) clicar no NOME da rolagem (texto salvo) coloca um cartão no chat", c.length === 1, JSON.stringify(c));
ok("2b) o cartão mostra o nome da rolagem, o da ficha, o detalhe e o total", c[0]?.titulo === "Ataque com espada" && c[0].ficha === "Goblin Chefe" && /^1d20 \[\d+\] \+ 3 \+ 3$/.test(c[0].detalhe ?? "") && Number(c[0].total) >= 7 && Number(c[0].total) <= 26, JSON.stringify(c[0]));
const dado = Number(/\[(\d+)\]/.exec(c[0].detalhe)[1]);
ok("2c) o total bate com o dado: dado + 3 + 3", Number(c[0].total) === dado + 6, `${dado} -> ${c[0].total}`);
ok("2d) o autor do cartão é o jogador local ('Você')", c[0].autor === "Você");
ok("2e) a janela da ficha continua aberta e avisa que rolou", (await p.locator("#editor-ficha").isVisible()) && /rolada/.test(await p.locator("#editor-ficha-aviso").textContent()));
ok("2f) o clique no nome NÃO tirou o foco do campo de texto", (await p.evaluate(() => document.activeElement?.id)) === "editor-ficha-texto");

// ----- pelo item da lista
await p.locator("#editor-ficha-rolagens li").nth(1).click();
c = await cartoes();
ok("3a) clicar no ITEM da lista também rola (o 'Dano')", c.length === 2 && c.some((x) => x.titulo === "Dano" && /^2d6 \[\d+, \d+\] \+ 3$/.test(x.detalhe)), JSON.stringify(c.map((x) => x.titulo)));
ok("3b) os itens da lista NÃO têm o rótulo 'Rolar': a caixa inteira é clicável (cursor de mãozinha; 'ajuda' no item com erro)", (await p.locator("#editor-ficha-rolagens li .acao").count()) === 0 && (await p.locator("#editor-ficha-rolagens li").first().evaluate((e) => getComputedStyle(e).cursor)) === "pointer" && (await p.locator("#editor-ficha-rolagens li.com-erro").first().evaluate((e) => getComputedStyle(e).cursor)) === "help");
await p.locator("#editor-ficha-rolagens li").nth(3).focus();
await p.keyboard.press("Enter");
ok("3c) pelo TECLADO (Enter num item focado) também rola: a rolagem sem nome '1d8'", (await cartoes()).some((x) => x.titulo === "1d8" && /^1d8 \[\d+\]$/.test(x.detalhe)));
// ----- com erro
await p.locator("#editor-ficha-rolagens li").nth(2).click();
ok("4a) rolagem com erro (variável inexistente) NÃO rola e mostra o motivo", (await cartoes()).length === 3 && /SORTE/.test(await p.locator("#editor-ficha-aviso").textContent()), await p.locator("#editor-ficha-aviso").textContent());
// ----- voltou a editar: bloqueia
await p.fill("#editor-ficha-texto", "(Nova)[1d4]");
await p.locator("#editor-ficha-rolagens li").first().click();
ok("5) depois de mexer no texto (não salvo) volta a pedir para salvar", (await cartoes()).length === 3 && /Salve a ficha/.test(await p.locator("#editor-ficha-aviso").textContent()));
// ----- o chat mostra os cartões e o texto da ficha é texto puro
await p.fill("#editor-ficha-texto", "(<img src=x onerror=alert>)[1d4]\n(Normal)[1d6]");
await p.keyboard.press("Control+s");
await p.waitForTimeout(100);
await p.locator("#editor-ficha-cores .rolagem-nome").first().click();
ok("6) um nome de rolagem com HTML aparece como TEXTO no cartão (nenhum <img> no chat)", (await p.locator("#chat img").count()) === 0 && (await cartoes()).some((x) => /<img/.test(x.titulo ?? "")));
ok("7) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
