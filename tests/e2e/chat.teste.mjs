// Teste e2e: chat. Rodar: npm run test:e2e -- chat
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
const cruza = (a, c) => a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
const erros = [];

async function abrir(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => erros.push(String(e)));
  await abrirPagina(p);
  return p;
}
const cartoes = (p) => p.locator(".chat-mensagem");

// ================= janela grande
let p = await abrir(1400, 800);
const chat = await p.locator("#chat").boundingBox();
ok("1a) chat fixo EMBAIXO (base a 12 px da janela) e centralizado", perto(chat.y + chat.height, 788) && perto(chat.x + chat.width / 2, 700, 2), `base ${(chat.y + chat.height).toFixed(0)}, centro x ${(chat.x + chat.width / 2).toFixed(0)}, largura ${chat.width.toFixed(0)}`);
ok("1b) sem mensagens: nenhuma mensagem e NENHUM texto de dica na faixa; o campo só tem o placeholder 'Escreva uma mensagem'", (await cartoes(p).count()) === 0 && (await p.locator("#chat-faixa").textContent()).trim() === "" && (await p.locator("#chat-vazio").count()) === 0 && (await p.getAttribute("#chat-texto", "placeholder")) === "Escreva uma mensagem");
for (const [nome, sel] of [["bolsa", "#bolsa"], ["painel de desenho", "#ferramentas-desenho"], ["barra de ferramentas", "#barra"]]) {
  ok(`1c) o chat não se sobrepõe à ${nome}`, !cruza(chat, await p.locator(sel).boundingBox()));
}
await p.screenshot({ path: `${S}/ch0_vazio.png` });

// ================= enviar
await p.click("#chat-texto"); await p.keyboard.type("Olá, mesa!"); await p.keyboard.press("Enter");
ok("2a) Enter envia: aparece 1 mensagem", (await cartoes(p).count()) === 1);
const c1 = cartoes(p).first(); // com uma só mensagem, é a primeira
ok("2b) a mensagem mostra autor 'Você', hora (HH:MM) e o texto", (await c1.locator("strong").textContent()) === "Você" && /^\d{2}:\d{2}$/.test(await c1.locator("time").textContent()) && (await c1.locator("p").textContent()) === "Olá, mesa!");
ok("2c) o campo é limpo e continua com o foco (dá para seguir digitando)", (await p.inputValue("#chat-texto")) === "" && (await p.evaluate(() => document.activeElement?.id)) === "chat-texto");
await p.keyboard.type("   "); await p.keyboard.press("Enter");
ok("2d) só espaços não envia nada", (await cartoes(p).count()) === 1);
await p.keyboard.press("Enter");
ok("2e) campo vazio não envia nada", (await cartoes(p).count()) === 1);
await p.keyboard.type("  segunda  "); await p.click("#chat-enviar");
ok("2f) o botão Enviar também envia (e tira os espaços das pontas)", (await cartoes(p).count()) === 2 && (await cartoes(p).first().locator("p").textContent()) === "segunda");

// ================= fluxo da esquerda para a direita
await p.keyboard.type("terceira"); await p.keyboard.press("Enter");
await p.waitForTimeout(500); // espera a animação de entrada acabar antes de medir
const xs = await cartoes(p).evaluateAll((cs) => cs.map((c) => ({ x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y })));
ok("3a) lado a lado: a mais NOVA na ESQUERDA e as antigas empurradas para a DIREITA (x DEcresce na ordem de envio)", xs.length === 3 && xs[0].x < xs[1].x && xs[1].x < xs[2].x, "da esquerda p/ a direita: " + xs.map((c) => c.x.toFixed(0)).join(" < "));
ok("3a2) ...e a ordem na tela é: terceira, segunda, primeira", (await cartoes(p).locator("p").allTextContents()).join("|") === "terceira|segunda|Olá, mesa!");
ok("3b) ...todas na mesma linha (mesmo y): não empilham de baixo para cima", xs.every((c) => perto(c.y, xs[0].y, 1)), xs.map((c) => c.y.toFixed(0)).join(","));
ok("3c) a mais NOVA fica encostada na ponta ESQUERDA da faixa", perto(xs[0].x, (await p.locator("#chat-faixa").boundingBox()).x, 2));
await p.screenshot({ path: `${S}/ch1_tres.png`, clip: { x: 360, y: 640, width: 700, height: 160 } });

// ================= passando do espaço: a nova continua na esquerda; as antigas vão saindo pela direita
for (let i = 1; i <= 20; i++) { await p.keyboard.type(`mensagem número ${i}`); await p.keyboard.press("Enter"); }
const info = await p.locator("#chat-faixa").evaluate((f) => ({ rolagem: f.scrollLeft, total: f.scrollWidth, visivel: f.clientWidth }));
ok("4a) com muitas mensagens a faixa passa do espaço (rola na horizontal)", info.total > info.visivel + 200, `${info.total} > ${info.visivel}`);
ok("4b) a faixa fica no INÍCIO (scrollLeft 0): a mais nova aparece inteira na ponta esquerda", info.rolagem === 0, `rolagem ${info.rolagem}`);
const fb = await p.locator("#chat-faixa").boundingBox(), nova = await cartoes(p).first().boundingBox(), velha = await cartoes(p).last().boundingBox();
ok("4c) a mais nova está na esquerda da faixa e a mais ANTIGA saiu pela DIREITA", perto(nova.x, fb.x, 2) && velha.x >= fb.x + fb.width - 1, `nova ${nova.x.toFixed(0)} | antiga começa em ${velha.x.toFixed(0)} (faixa termina em ${(fb.x + fb.width).toFixed(0)})`);
ok("4c2) a mais nova diz 'mensagem número 20'", (await cartoes(p).first().locator("p").textContent()) === "mensagem número 20");
ok("4d) a altura do chat não cresce com as mensagens", perto((await p.locator("#chat").boundingBox()).height, chat.height, 1));

// ================= roda do mouse rola na horizontal
await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await p.mouse.wheel(0, 300); await p.waitForTimeout(200);
const meio = await p.locator("#chat-faixa").evaluate((f) => f.scrollLeft);
ok("5a) a roda do mouse para baixo rola a faixa para a DIREITA (mensagens mais antigas)", meio > 100, `scrollLeft 0 -> ${meio.toFixed(0)}`);
await p.mouse.wheel(0, -300); await p.waitForTimeout(200);
ok("5b) e para cima volta para a esquerda (as mais novas)", (await p.locator("#chat-faixa").evaluate((f) => f.scrollLeft)) < meio - 100);
await p.mouse.wheel(0, 100000); await p.waitForTimeout(250);
ok("5b2) dá para chegar até a mais antiga (fim da faixa)", perto(await p.locator("#chat-faixa").evaluate((f) => f.scrollLeft), info.total - info.visivel, 2));
// uma mensagem nova leva de volta ao início
await p.click("#chat-texto"); await p.keyboard.type("nova"); await p.keyboard.press("Enter");
ok("5c) ao enviar, a faixa volta ao INÍCIO para mostrar a mensagem nova na esquerda", (await p.locator("#chat-faixa").evaluate((f) => f.scrollLeft)) === 0);

// ================= segurança e texto longo
await p.keyboard.type("<b>oi</b><img src=x onerror=alert(1)>"); await p.keyboard.press("Enter");
const ult = cartoes(p).first();
ok("6a) HTML digitado aparece como TEXTO (não vira código)", (await ult.locator("p").textContent()) === "<b>oi</b><img src=x onerror=alert(1)>" && (await ult.locator("b, img").count()) === 0);
await p.keyboard.type("M".repeat(72)); await p.keyboard.press("Enter");
const longa = await cartoes(p).first().boundingBox();
ok("6b) 72 letras largas seguidas ('M') não esticam o cartão além do máximo (300 px, valor do dono) nem o chat", longa.width <= 304 && perto((await p.locator("#chat").boundingBox()).height, chat.height, 1), `${longa.width.toFixed(0)} px`);
ok("6c) o campo limita a 72 caracteres", (await p.evaluate(() => document.getElementById("chat-texto").maxLength)) === 72);

// ================= limite de mensagens guardadas (100)
await p.evaluate(() => {
  const campo = document.getElementById("chat-texto"), form = document.getElementById("chat-form");
  for (let i = 0; i < 110; i++) { campo.value = `em massa ${i}`; form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
});
await p.waitForTimeout(300);
ok("7) são guardadas no máximo 100 mensagens (as mais antigas saem)", (await cartoes(p).count()) === 100 && (await cartoes(p).first().locator("p").textContent()) === "em massa 109" && (await cartoes(p).last().locator("p").textContent()) === "em massa 10", `${await cartoes(p).count()} cartões`);

// ================= Esc sai do campo
await p.click("#chat-texto"); await p.keyboard.press("Escape");
ok("8) Esc tira o foco do campo", (await p.evaluate(() => document.activeElement?.id)) !== "chat-texto");

// ================= convivência com o tabuleiro: o clique direito num token ainda funciona
await p.mouse.click(348, 304, { button: "right" });
ok("9) o tabuleiro continua funcionando (menu do token abre)", await p.locator("#engrenagem").isVisible());
await p.close();

// ================= janelas menores
for (const [w, h] of [[1280, 800], [1024, 640]]) {
  p = await abrir(w, h);
  const ch = await p.locator("#chat").boundingBox();
  const outros = { bolsa: await p.locator("#bolsa").boundingBox(), barra: await p.locator("#barra").boundingBox(), desenho: await p.locator("#ferramentas-desenho").boundingBox() };
  const conflitos = Object.entries(outros).filter(([, caixa]) => cruza(ch, caixa)).map(([n]) => n);
  ok(`10) ${w}×${h}: o chat não se sobrepõe à bolsa, à barra nem ao painel de desenho`, conflitos.length === 0, `chat x ${ch.x.toFixed(0)}..${(ch.x + ch.width).toFixed(0)}, y ${ch.y.toFixed(0)}..${(ch.y + ch.height).toFixed(0)}${conflitos.length ? " | conflito: " + conflitos : ""}`);
  await p.click("#calibrar-alternar"); await p.waitForTimeout(300);
  const cal = await p.locator("#painel-calibragem").boundingBox();
  ok(`11) ${w}×${h}: com a calibragem ligada, o painel dela não cobre o chat`, !cruza(cal, ch) && !cruza(cal, outros.desenho) && !cruza(cal, await p.locator("#bolsa").boundingBox()) && !cruza(cal, await p.locator("#barra").boundingBox()), `calibragem y ${cal.y.toFixed(0)}..${(cal.y + cal.height).toFixed(0)}, x ${cal.x.toFixed(0)}..${(cal.x + cal.width).toFixed(0)}`);
  if (h === 640) await p.screenshot({ path: `${S}/ch2_pequena.png` });
  await p.close();
}

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
