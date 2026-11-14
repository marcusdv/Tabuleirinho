// Teste e2e: o ATRASO curto (0,1 s) antes do resultado das rolagens e o LIMITE anti-spam avisado no botão Rolar. Rodar: npm run test:e2e -- atraso-rolagem   (precisa do Vite; modo LOCAL)
//
// Os outros testes zeram o atraso e o limite (ajuda.mjs); aqui ficam LIGADOS (`manterAtrasoDasRolagens`). O limite de verdade (do servidor) é do teste `limite-spam`.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p, "", { manterAtrasoDasRolagens: true });

const cartoes = () => p.locator(".chat-mensagem.chat-rolagem").count();
ok("1a) o padrão do app é uma pausa de 100 ms", (await p.evaluate(() => window.__tabuleirinho.atrasoRolagemMs)) === 100);
await p.click("#dados-rolar");
const logo = await cartoes();
await p.waitForTimeout(350);
ok("1b) o cartão NÃO aparece no mesmo instante, e aparece logo depois da pausa", logo === 0 && (await cartoes()) === 1, `logo=${logo}`);

// ----- LIMITE: 5 de rajada (o 1º já gastou 1; esperamos o balde encher). Os cliques saem todos no mesmo instante (sem a recarga entrar no meio).
const rajada = (n) => p.evaluate((vezes) => { for (let i = 0; i < vezes; i++) document.getElementById("dados-rolar").click(); }, n);
await p.waitForTimeout(1500);
await rajada(12);
await p.waitForTimeout(400);
ok("2a) 12 cliques em rajada: só 5 rolagens passam (o resto é barrado pelo limite)", (await cartoes()) === 1 + 5, String(await cartoes()));
ok("2b) o botão Rolar pisca em vermelho (classe 'limite') e a dica explica", (await p.locator("#dados-rolar").evaluate((e) => e.classList.contains("limite"))) && /rápido demais/.test((await p.locator("#dados-rolar").getAttribute("title")) ?? ""));
await p.waitForTimeout(1200);
ok("2c) o aviso some sozinho", !(await p.locator("#dados-rolar").evaluate((e) => e.classList.contains("limite"))));
await rajada(1);
await p.waitForTimeout(300);
ok("2d) depois de esperar a recarga (1 s), uma rolagem volta a passar", (await cartoes()) === 1 + 5 + 1, String(await cartoes()));

// ----- como nos outros testes: atraso 0 = sem pausa e sem limite
await p.evaluate(() => { window.__tabuleirinho.atrasoRolagemMs = 0; });
await rajada(8);
await p.waitForTimeout(100);
ok("3) com o gancho de teste zerado, não há pausa nem limite: as 8 aparecem na hora", (await cartoes()) === 1 + 5 + 1 + 8, String(await cartoes()));

ok("4) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
