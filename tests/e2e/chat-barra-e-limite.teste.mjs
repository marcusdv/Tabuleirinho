// Teste e2e: chat-barra-e-limite (tamanho da caixa e limite de caracteres). Rodar: npm run test:e2e -- chat
// A barra e a rolagem do chat NÃO são testadas aqui: o dono confere à mão (a barra é vertical, no canto direito,
// e a roda do mouse rola de forma suave).
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const erros = [];
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
const enviar = (t) => p.evaluate((t) => { const c = document.getElementById("chat-texto"); c.value = t; document.getElementById("chat-form").requestSubmit(); }, t);
const cartoes = () => p.locator(".chat-mensagem").count();
const caixa = (s) => p.locator(s).boundingBox();

// ================= tamanho da caixa
const chat = await caixa("#chat");
ok("T1) chat mais largo: 680 px (era 600)", perto(chat.width, 680, 1), `${chat.width.toFixed(0)} px`);
ok("T2) altura ~148 px (faixa de 90 px)", chat.height >= 142 && chat.height <= 154, `${chat.height.toFixed(0)} px`);

// ================= limite de 40 caracteres
const campo = "#chat-texto";
await p.click(campo);
ok("L0) começa 0/46, e o placeholder do campo é só 'Escreva uma mensagem'", (await p.textContent("#chat-contador")) === "0/72" && (await p.getAttribute(campo, "placeholder")) === "Escreva uma mensagem");
await p.keyboard.type("Olá!");
ok("L1) o contador acompanha a digitação (4/46)", (await p.textContent("#chat-contador")) === "4/72");
await p.fill(campo, ""); await p.keyboard.type("0123456789".repeat(8)); // 80 caracteres
const v = await p.inputValue(campo);
ok("L2) digitar 80 caracteres: o campo corta em 72 e o contador mostra 72/72 em destaque", v.length === 72 && (await p.textContent("#chat-contador")) === "72/72" && (await p.getAttribute("#chat-contador", "class")).includes("no-limite"), `${v.length} caracteres`);
await p.fill(campo, ""); await p.keyboard.insertText("abcdefghij".repeat(9)); // colar 90 caracteres
ok("L3) COLAR um texto de 90 caracteres também é cortado em 72", (await p.inputValue(campo)).length === 72, `${(await p.inputValue(campo)).length} caracteres`);
const antes = await cartoes();
await p.keyboard.press("Enter"); await p.waitForTimeout(300);
ok("L4) uma mensagem de exatamente 72 caracteres É enviada", (await cartoes()) === Math.min(100, antes + 1) && (await p.locator(".chat-mensagem p").first().textContent()) === "abcdefghij".repeat(7) + "ab");
ok("L4b) depois de enviar o contador volta a 0/46 sem destaque", (await p.textContent("#chat-contador")) === "0/72" && !(await p.getAttribute("#chat-contador", "class")).includes("no-limite"));
// contornando o campo (valor definido por código): 41 caracteres NÃO enviam
const n0 = await cartoes();
await p.evaluate(() => { const c = document.getElementById("chat-texto"); c.value = "x".repeat(73); document.getElementById("chat-form").requestSubmit(); });
await p.waitForTimeout(300);
ok("L5) 73 caracteres definidos por código NÃO são enviados e o texto fica no campo", (await cartoes()) === n0 && (await p.inputValue(campo)).length === 73);
// espaços nas pontas não contam para o envio (são cortados antes)
await p.fill(campo, ""); await p.keyboard.type("   oi   "); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
ok("L6) espaços nas pontas são tirados (a mensagem é 'oi')", (await p.locator(".chat-mensagem p").first().textContent()) === "oi");
// a caixa não cresce com mensagens de 40 letras largas
await p.keyboard.type("W".repeat(72)); await p.keyboard.press("Enter"); await p.waitForTimeout(400);
ok("L7) mensagem de 72 'W' (as mais largas) não faz o chat crescer", perto((await caixa("#chat")).height, chat.height, 1.5), `${(await caixa("#chat")).height.toFixed(0)} px`);
await p.screenshot({ path: `${S}/cs3_final.png`, clip: { x: 360, y: 580, width: 700, height: 220 } });

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
