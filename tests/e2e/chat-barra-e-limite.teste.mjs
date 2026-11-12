// Teste e2e: chat-barra-e-limite. Rodar: npm run test:e2e -- chat
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
const faixaInfo = () => p.locator("#chat-faixa").evaluate((f) => ({ rolagem: f.scrollLeft, total: f.scrollWidth, visivel: f.clientWidth, max: f.scrollWidth - f.clientWidth }));

// ================= tamanho da caixa
const chat = await caixa("#chat");
ok("T1) chat mais largo: 680 px (era 600)", perto(chat.width, 680, 1), `${chat.width.toFixed(0)} px`);
ok("T2) altura ~148 px (faixa de 72 px)", chat.height >= 142 && chat.height <= 154, `${chat.height.toFixed(0)} px`);

// ================= barra de rolagem: posição e aparência
const trilha = await caixa("#chat-rolagem"), faixa = await caixa("#chat-faixa");
ok("S1) a barra de rolagem fica EM CIMA das mensagens (dentro do chat)", trilha.y + trilha.height <= faixa.y && trilha.y >= chat.y && trilha.y < chat.y + 20, `trilha y ${trilha.y.toFixed(0)}, faixa y ${faixa.y.toFixed(0)}`);
ok("S1b) sem palavras ('novas', 'antigas') nem setas na barra", (await p.locator("#chat-barra").textContent()).trim() === "" && (await p.locator("#chat-barra span").count()) === 0);
ok("S1c) a trilha ocupa a largura toda do chat (menos o respiro)", trilha.width >= chat.width - 24, `${trilha.width.toFixed(0)} de ${chat.width.toFixed(0)}`);
ok("S1d) a barra NATIVA da faixa está escondida (sem faixa de rolagem ocupando altura)", await p.locator("#chat-faixa").evaluate((f) => getComputedStyle(f).scrollbarWidth === "none" && f.offsetHeight === f.clientHeight));

// poucas mensagens: nada para rolar -> barra apagada
for (const t of ["a", "b"]) await enviar(t);
await p.waitForTimeout(500);
ok("S2) com poucas mensagens a barra fica apagada e o cursor some", (await p.locator("#chat-rolagem").getAttribute("class")).includes("inativa") && !(await p.locator("#chat-polegar").isVisible()));
await p.screenshot({ path: `${S}/cs0_apagada.png`, clip: { x: 360, y: 580, width: 700, height: 220 } });

// muitas mensagens
for (let i = 1; i <= 14; i++) { await enviar(`mensagem ${i}`); await p.waitForTimeout(40); }
await p.waitForTimeout(600);
let info = await faixaInfo(), t = await caixa("#chat-rolagem"), th = await caixa("#chat-polegar");
ok("S3) com muitas mensagens a barra fica ativa e o cursor aparece", !(await p.locator("#chat-rolagem").getAttribute("class")).includes("inativa") && (await p.locator("#chat-polegar").isVisible()));
ok("S3b) a largura do cursor é a fração VISÍVEL da faixa (visível ÷ total, ±4%)", perto(th.width / t.width, info.visivel / info.total, 0.04), `cursor ${(th.width / t.width * 100).toFixed(1)}% vs visível ${(info.visivel / info.total * 100).toFixed(1)}%`);
ok("S3c) no início (mensagens mais novas) o cursor está colado na ESQUERDA da trilha", perto(th.x, t.x, 2) && info.rolagem === 0, `cursor x ${th.x.toFixed(0)} trilha x ${t.x.toFixed(0)}`);
await p.screenshot({ path: `${S}/cs1_ativa.png`, clip: { x: 360, y: 580, width: 700, height: 220 } });

// roda do mouse -> cursor acompanha
await p.mouse.move(chat.x + chat.width / 2, faixa.y + faixa.height / 2);
await p.mouse.wheel(0, 100000); await p.waitForTimeout(300);
info = await faixaInfo(); t = await caixa("#chat-rolagem"); th = await caixa("#chat-polegar");
ok("S4) rolando até o fim (mais antigas) o cursor vai para a ponta DIREITA", perto(info.rolagem, info.max, 2) && perto(th.x + th.width, t.x + t.width, 2.5), `cursor termina em ${(th.x + th.width).toFixed(0)}, trilha em ${(t.x + t.width).toFixed(0)}`);
await p.screenshot({ path: `${S}/cs2_fim.png`, clip: { x: 360, y: 580, width: 700, height: 220 } });

// arrastar o cursor até o meio
await p.mouse.wheel(0, -100000); await p.waitForTimeout(300);
t = await caixa("#chat-rolagem"); th = await caixa("#chat-polegar");
const livre = t.width - th.width;
await p.mouse.move(th.x + th.width / 2, th.y + th.height / 2); await p.mouse.down();
for (let i = 1; i <= 6; i++) { await p.mouse.move(th.x + th.width / 2 + (livre / 2) * (i / 6), th.y + th.height / 2); await p.waitForTimeout(25); }
ok("S5a) enquanto arrasta, o cursor fica em destaque (classe 'arrastando')", (await p.locator("#chat-polegar").getAttribute("class")).includes("arrastando"));
await p.mouse.up(); await p.waitForTimeout(200);
info = await faixaInfo();
ok("S5b) arrastar o cursor por metade da trilha rola a faixa por ~metade (±4%)", perto(info.rolagem / info.max, 0.5, 0.04), `${(info.rolagem / info.max * 100).toFixed(1)}%`);
ok("S5c) o cursor não está mais em 'arrastando'", !(await p.locator("#chat-polegar").getAttribute("class")).includes("arrastando"));
// arrastar bem além da trilha: não passa do fim
await p.mouse.move((await caixa("#chat-polegar")).x + 10, (await caixa("#chat-polegar")).y + 4); await p.mouse.down();
await p.mouse.move(1390, 790, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(200);
info = await faixaInfo();
ok("S5d) arrastar o cursor muito além da trilha para no fim (não passa)", perto(info.rolagem, info.max, 2), `${info.rolagem.toFixed(0)} de ${info.max.toFixed(0)}`);

// clicar na trilha (o mouse precisa estar sobre a faixa para a roda rolar)
await p.mouse.move(chat.x + chat.width / 2, faixa.y + faixa.height / 2);
await p.mouse.wheel(0, -100000); await p.waitForTimeout(300);
t = await caixa("#chat-rolagem"); th = await caixa("#chat-polegar");
const alvoX = t.x + t.width * 0.75;
await p.mouse.click(alvoX, t.y + t.height / 2); await p.waitForTimeout(900);
info = await faixaInfo(); th = await caixa("#chat-polegar");
const esperado = (Math.min(Math.max(alvoX - t.x - th.width / 2, 0), t.width - th.width) / (t.width - th.width));
ok("S6) clicar na trilha a 75% leva a faixa até lá, com o cursor centrado no clique (±5%)", perto(info.rolagem / info.max, esperado, 0.05), `${(info.rolagem / info.max * 100).toFixed(1)}% (esperado ${(esperado * 100).toFixed(1)}%)`);

// mensagem nova: volta ao início
await enviar("nova mensagem"); await p.waitForTimeout(500);
th = await caixa("#chat-polegar"); t = await caixa("#chat-rolagem");
ok("S7) uma mensagem nova leva a faixa e o cursor de volta ao INÍCIO (esquerda)", (await faixaInfo()).rolagem === 0 && perto(th.x, t.x, 2));

// teclado na faixa também rola e o cursor acompanha
await p.focus("#chat-faixa"); for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300);
ok("S8) a seta do teclado (faixa focada) rola e o cursor acompanha", (await faixaInfo()).rolagem > 0 && (await caixa("#chat-polegar")).x > t.x + 1);

// janela redimensionada: o cursor se ajusta
await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(500);
info = await faixaInfo(); t = await caixa("#chat-rolagem"); th = await caixa("#chat-polegar");
ok("S9) com a janela menor (chat mais estreito) o cursor se ajusta à nova fração visível (±4%)", perto(th.width / t.width, info.visivel / info.total, 0.04), `cursor ${(th.width / t.width * 100).toFixed(1)}% vs visível ${(info.visivel / info.total * 100).toFixed(1)}% (faixa ${info.visivel}px)`);
await p.setViewportSize({ width: 1400, height: 800 }); await p.waitForTimeout(400);

// 100 mensagens: cursor tem largura mínima
await p.evaluate(() => { const c = document.getElementById("chat-texto"), f = document.getElementById("chat-form"); for (let i = 0; i < 100; i++) { c.value = `m ${i}`; f.requestSubmit(); } });
await p.waitForTimeout(800);
th = await caixa("#chat-polegar");
ok("S10) com 100 mensagens o cursor não fica menor que 24 px (dá para pegar)", th.width >= 23.5, `${th.width.toFixed(1)} px`);

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
