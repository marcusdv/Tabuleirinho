// Teste e2e: tokens no modo LOCAL (sem servidor): "Remover do tabuleiro" (engrenagem) e "Excluir token" (só na BOLSA, menu do clique direito da fichinha) com a CAIXA DE CONFIRMAR
// do próprio jogo. Rodar: npm run test:e2e -- tokens-excluir  (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// A engrenagem tem 2 botões diretos (Editar token, Remover do tabuleiro); NÃO há "Excluir token" no tabuleiro. Excluir abre uma caixa própria (e nunca a do navegador): o foco começa
// em "Cancelar", Esc, o clique no fundo e o botão Cancelar cancelam, e só "Excluir" apaga.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
const dialogosNativos = [];
p.on("dialog", async (d) => { dialogosNativos.push(d.message()); await d.dismiss(); });
await abrirPagina(p);

const tokens = () => p.evaluate(() => window.__tabuleirinho.estado.tokens.map((t) => ({ id: t.id, nome: t.nome, guardado: t.guardado })));
const direito = async (x, y) => { await p.mouse.click(x, y, { button: "right" }); await p.waitForTimeout(80); };
const caixaAberta = () => p.locator("#confirmar").isVisible();

ok("0) os 5 tokens de teste foram semeados", (await tokens()).length === 5);

// --- a engrenagem não tem "Excluir token"
await direito(540, 432); // token 2 (azul)
await p.click("#engrenagem");
ok("1a) a engrenagem NÃO tem 'Excluir token' (só 'Editar token' e 'Remover do tabuleiro')", (await p.locator("#botao-excluir-token").count()) === 0 && (await p.locator("#botao-guardar-token").isVisible()));
await p.click("#botao-guardar-token");
await p.waitForTimeout(200);
ok("1b) 'Remover do tabuleiro' guarda o token 2 na bolsa (continua existindo)", (await tokens()).find((t) => t.id === 2)?.guardado === true && (await p.locator(".ficha").count()) === 1);

// --- excluir pela bolsa: a caixa própria
const ficha = await p.locator(".ficha").first().boundingBox();
const menuDaFicha = async () => { await p.mouse.click(ficha.x + ficha.width / 2, ficha.y + ficha.height / 2, { button: "right" }); await p.click("#menu-ficha-excluir"); };
await menuDaFicha();
ok("2a) 'Excluir token' (menu da fichinha) abre a CAIXA PRÓPRIA (e não a do navegador)", (await caixaAberta()) && dialogosNativos.length === 0, `nativos: ${dialogosNativos.length}`);
ok("2b) título 'Excluir token' e botão de confirmar 'Excluir'", (await p.locator("#confirmar-titulo").textContent()) === "Excluir token" && (await p.locator("#confirmar-ok").textContent()) === "Excluir");
ok("2c) a mensagem cita o token ('Token 2')", /"Token 2"/.test(await p.locator("#confirmar-mensagem").textContent()));
ok("2d) o foco começa em 'Cancelar'", await p.evaluate(() => document.activeElement?.id === "confirmar-cancelar"));
await p.keyboard.press("Escape");
ok("3a) Esc cancela: o token continua", !(await caixaAberta()) && (await tokens()).some((t) => t.id === 2));
await menuDaFicha();
await p.click("#confirmar-cancelar");
ok("3b) o botão Cancelar cancela: o token continua", !(await caixaAberta()) && (await tokens()).some((t) => t.id === 2));
await menuDaFicha();
await p.click("#confirmar-ok");
const final = await tokens();
ok("4) confirmar apaga o token 2 (some do estado e da bolsa)", final.length === 4 && !final.some((t) => t.id === 2) && (await p.locator(".ficha").count()) === 0, JSON.stringify(final.map((t) => t.id)));
ok("5) em nenhum momento apareceu a caixa NATIVA do navegador", dialogosNativos.length === 0, String(dialogosNativos.length));
ok("6) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
