// Teste e2e: tokens no modo LOCAL (sem servidor): o painel da engrenagem, "Guardar na bolsa" e "Excluir token" com a CAIXA DE CONFIRMAR
// do próprio jogo. Rodar: npm run test:e2e -- tokens-excluir  (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// A engrenagem tem 3 botões diretos (Editar token, Guardar na bolsa, Excluir token); a janela "Editar token" NÃO tem botão de excluir.
// Excluir abre uma caixa própria (e nunca a do navegador): o foco começa em "Cancelar", Tab fica preso nos dois botões, Esc, o clique no
// fundo e o botão Cancelar cancelam, e só "Excluir" apaga. Um token novo não reaproveita o id de um apagado. Também vale para a ficha
// de um token que está na bolsa (menu do clique direito).
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
const dialogosNativos = [];
p.on("dialog", async (d) => { dialogosNativos.push(d.message()); await d.dismiss(); });
await abrirPagina(p);

const tokens = () => p.evaluate(() => window.__tabuleirinho.estado.tokens.map((t) => ({ id: t.id, nome: t.nome, guardado: t.guardado })));
const direito = async (x, y) => { await p.mouse.click(x, y, { button: "right" }); await p.waitForTimeout(60); };
const abrirEngrenagem = async (x, y) => { await direito(x, y); await p.click("#engrenagem"); };
const caixaAberta = () => p.locator("#confirmar").isVisible();

ok("0) os 5 tokens de teste foram semeados", (await tokens()).length === 5);

// --- a caixa própria
await abrirEngrenagem(540, 432); // token 2
await p.click("#botao-excluir-token");
ok("1a) 'Excluir token' abre a CAIXA PRÓPRIA (e não a do navegador)", (await caixaAberta()) && dialogosNativos.length === 0, `nativos: ${dialogosNativos.length}`);
ok("1b) título 'Excluir token' e botão de confirmar 'Excluir'", (await p.locator("#confirmar-titulo").textContent()) === "Excluir token" && (await p.locator("#confirmar-ok").textContent()) === "Excluir");
const msg = await p.locator("#confirmar-mensagem").textContent();
ok("1c) a mensagem tem o nome do token e avisa que não se desfaz", /"Token 2"/.test(msg) && /não pode ser desfeito/.test(msg), msg);
ok("1d) o foco começa em 'Cancelar' (confirmar exige uma ação de propósito)", (await p.evaluate(() => document.activeElement?.id)) === "confirmar-cancelar");
// Tab fica preso nos dois botões
await p.keyboard.press("Tab");
ok("1e) Tab leva ao botão 'Excluir' e não sai da caixa", (await p.evaluate(() => document.activeElement?.id)) === "confirmar-ok");
await p.keyboard.press("Tab");
ok("1f) Tab de novo volta a 'Cancelar'", (await p.evaluate(() => document.activeElement?.id)) === "confirmar-cancelar");

// --- cancelar por Esc
await p.keyboard.press("Escape");
ok("2a) Esc cancela: a caixa fecha e o token continua", !(await caixaAberta()) && (await tokens()).length === 5);
// --- cancelar clicando no fundo escuro
await abrirEngrenagem(540, 432);
await p.click("#botao-excluir-token");
await p.mouse.click(8, 8); // canto da tela: fundo escuro, fora da caixa
ok("2b) clicar no fundo escuro cancela", !(await caixaAberta()) && (await tokens()).length === 5);
// --- cancelar pelo botão
await abrirEngrenagem(540, 432);
await p.click("#botao-excluir-token");
await p.click("#confirmar-cancelar");
ok("2c) o botão 'Cancelar' cancela", !(await caixaAberta()) && (await tokens()).length === 5);
// --- Esc na caixa NÃO fecha outras coisas por baixo (aqui, a janela Editar token ficaria aberta)
await abrirEngrenagem(540, 432);
await p.click("#botao-excluir-token");
await p.keyboard.press("Escape");
ok("2d) depois de cancelar, nenhum erro e o token continua", (await tokens()).length === 5 && erros.length === 0);

// --- confirmar
await abrirEngrenagem(540, 432);
await p.click("#botao-excluir-token");
await p.click("#confirmar-ok");
const aposExcluir = await tokens();
ok("3a) confirmar exclui o token 2 do estado", aposExcluir.length === 4 && !aposExcluir.some((t) => t.id === 2), JSON.stringify(aposExcluir.map((t) => t.id)));
ok("3b) a caixa fechou e o menu fechou", !(await caixaAberta()) && (await p.locator("#engrenagem").isHidden()));
await direito(540, 432);
ok("3c) o desenho do token sumiu (o clique direito onde ele estava não abre menu)", await p.locator("#engrenagem").isHidden());

// --- guardar + excluir um token que está NA BOLSA (menu da ficha)
await abrirEngrenagem(348, 304);
await p.click("#botao-guardar-token");
ok("4a) 'Guardar na bolsa' guarda o token 1", (await tokens()).find((t) => t.id === 1).guardado === true && (await p.locator(".ficha").count()) === 1);
const ficha = await p.locator(".ficha").first().boundingBox();
await p.mouse.click(ficha.x + ficha.width / 2, ficha.y + ficha.height / 2, { button: "right" });
await p.click("#menu-ficha-excluir");
ok("4b) pelo menu da ficha, a caixa própria também abre (com 'Token 1')", (await caixaAberta()) && /"Token 1"/.test(await p.locator("#confirmar-mensagem").textContent()));
await p.click("#confirmar-ok");
const final = await tokens();
ok("4c) confirmar apaga o token 1 e a ficha some da bolsa", final.length === 3 && !final.some((t) => t.id === 1) && (await p.locator(".ficha").count()) === 0, JSON.stringify(final.map((t) => t.id)));
ok("5) em nenhum momento apareceu a caixa NATIVA do navegador", dialogosNativos.length === 0, String(dialogosNativos.length));
ok("6) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
