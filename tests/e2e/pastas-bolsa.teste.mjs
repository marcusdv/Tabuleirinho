// Teste e2e: as PASTAS da bolsa em tela cheia (modo LOCAL). Rodar: npm run test:e2e -- pastas-bolsa   (precisa do servidor: npm run dev)
// Pedido do dono (17/11/2026): na bolsona, criar pastas (de tokens e de fichas, separadas), arrastar itens para dentro, abrir e voltar pelo caminho. Na bolsinha a lista é corrida (sem pastas).
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await p.evaluate(() => window.__tabuleirinho.semear([{ id: 81, nome: "Goblin", imagem: null, col: 0, row: 0, cor: 0xe5484d, corBorda: 0xffffff, size: 1, guardado: true }, { id: 82, nome: "Orc", imagem: null, col: 0, row: 0, cor: 0x2fc28a, corBorda: 0xffffff, size: 1, guardado: true }]));
await p.click("#bolsa-gerenciar");
await p.waitForTimeout(400);
const nomes = () => p.locator("#bolsa-itens .ficha .ficha-nome").allInnerTexts();

ok("1a) na tela cheia aparece a barra das pastas, com o caminho e o '+ Pasta'", (await p.locator("#bolsa .bolsa-pastas-barra .bolsa-pastas-nova").first().isVisible()) && /Todos os tokens/.test(await p.locator(".bolsa-pastas-caminho").first().innerText()));
await p.click(".bolsa-pastas-nova");
await p.keyboard.press("Control+A");
await p.keyboard.type("Monstros");
await p.keyboard.press("Enter");
await p.waitForTimeout(300);
const ladrilho = p.locator("#bolsa-itens .bolsa-pasta").first();
ok("1b) '+ Pasta' + nome + Enter cria a pasta (um ladrilho no começo da grade)", (await p.locator("#bolsa-itens .bolsa-pasta").count()) === 1 && /Monstros/.test(await ladrilho.innerText()));

// arrastar o Goblin até a pasta
const g = await p.locator('#bolsa-itens .ficha[data-id="81"]').boundingBox();
const alvo = await ladrilho.boundingBox();
await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await p.mouse.down();
for (let i = 1; i <= 10; i++) await p.mouse.move(g.x + g.width / 2 + ((alvo.x + alvo.width / 2 - g.x - g.width / 2) * i) / 10, g.y + g.height / 2 + ((alvo.y + alvo.height / 2 - g.y - g.height / 2) * i) / 10);
await p.mouse.up();
await p.waitForTimeout(300);
ok("2a) arrastar um token até a pasta o põe lá dentro (sai da raiz)", JSON.stringify(await nomes()) === JSON.stringify(["Orc"]) && /1 item/.test(await ladrilho.innerText()), (await nomes()).join("|"));
ok("2b) o token guardou a pasta no estado", await p.evaluate(() => window.__tabuleirinho.estado.tokens.find((t) => t.id === 81).pasta === window.__tabuleirinho.estado.pastas[0].id));

await ladrilho.dblclick();
await p.waitForTimeout(300);
ok("3a) duplo clique abre a pasta: só o que está dentro dela, e o caminho mostra a pasta", JSON.stringify(await nomes()) === JSON.stringify(["Goblin"]) && /Monstros/.test(await p.locator(".bolsa-pastas-caminho").first().innerText()));
await p.locator(".bolsa-pastas-parte").first().click();
await p.waitForTimeout(200);
ok("3b) clicar em 'Todos os tokens' volta à raiz", JSON.stringify(await nomes()) === JSON.stringify(["Orc"]));

await p.fill("#bolsa-busca", "gob");
await p.waitForTimeout(200);
ok("4) pesquisando, aparecem os itens de TODAS as pastas (o Goblin, que está numa pasta)", (await nomes()).includes("Goblin"));
await p.fill("#bolsa-busca", "");

await p.click("#bolsa-aba-fichas");
await p.waitForTimeout(200);
ok("5) as pastas de TOKENS não aparecem na aba Fichas (são separadas)", (await p.locator("#bolsa-fichas-lista .bolsa-pasta").count()) === 0);
await p.click("#bolsa-aba-tokens");

await p.click("#bolsa-fechar");
await p.waitForTimeout(300);
ok("6) na bolsinha a lista é corrida: todos os tokens e nenhuma pasta", (await nomes()).length === 2 && (await p.locator("#bolsa-itens .bolsa-pasta:visible").count()) === 0);

ok("7) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
process.exitCode = terminar(erros);
await nav.close();
