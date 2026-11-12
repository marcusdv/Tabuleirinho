// Teste e2e: chat (o essencial). Rodar: npm run test:e2e -- chat
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// O que NÃO está aqui de propósito, porque outros testes já cobrem:
//   - animações e "sem pulo"                        -> chat-animacao.teste.mjs
//   - tamanho da caixa e limite de caracteres -> chat-barra-e-limite.teste.mjs (a barra e a rolagem do chat o dono confere à mão)
//   - limite de 100 mensagens guardadas             -> chat-animacao.teste.mjs
// Mensagens em quantidade são enviadas por código (rápido); o caminho do teclado é testado em poucas.
import { abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
const cruza = (a, c) => a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;

const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const cartoes = p.locator(".chat-mensagem");
const textos = () => cartoes.locator("p").allTextContents();
// Envia uma mensagem por código (preenche o campo e dispara o submit, como o Enter faria).
const enviar = (t) => p.evaluate((t) => { const c = document.getElementById("chat-texto"); c.value = t; document.getElementById("chat-form").requestSubmit(); }, t);
const caixa = (s) => p.locator(s).boundingBox();

// ================= 1) posição e aparência
const chat = await caixa("#chat");
ok("1a) chat fixo EMBAIXO (base a 12 px da janela) e centralizado", perto(chat.y + chat.height, 788) && perto(chat.x + chat.width / 2, 700, 2), `base ${(chat.y + chat.height).toFixed(0)}, centro x ${(chat.x + chat.width / 2).toFixed(0)}, largura ${chat.width.toFixed(0)}`);
ok("1b) sem mensagens: nenhum cartão, NENHUM texto de dica na faixa, e o campo só tem o placeholder 'Escreva uma mensagem'", (await cartoes.count()) === 0 && (await p.locator("#chat-faixa").textContent()).trim() === "" && (await p.locator("#chat-vazio").count()) === 0 && (await p.getAttribute("#chat-texto", "placeholder")) === "Escreva uma mensagem");
for (const [nome, sel] of [["bolsa", "#bolsa"], ["painel de desenho", "#ferramentas-desenho"], ["barra de ferramentas", "#barra"]]) {
    ok(`1c) o chat não se sobrepõe à ${nome}`, !cruza(chat, await caixa(sel)));
}

// ================= 2) enviar (pelo teclado: poucas mensagens)
await p.click("#chat-texto"); await p.keyboard.type("Olá, mesa!"); await p.keyboard.press("Enter");
ok("2a) Enter envia: aparece 1 mensagem", (await cartoes.count()) === 1);
const c1 = cartoes.first();
ok("2b) a mensagem mostra autor 'Você', hora (HH:MM) e o texto", (await c1.locator("strong").textContent()) === "Você" && /^\d{2}:\d{2}$/.test(await c1.locator("time").textContent()) && (await c1.locator("p").textContent()) === "Olá, mesa!");
ok("2c) o campo é limpo e continua com o foco (dá para seguir digitando)", (await p.inputValue("#chat-texto")) === "" && (await p.evaluate(() => document.activeElement?.id)) === "chat-texto");
await p.keyboard.type("   "); await p.keyboard.press("Enter");
ok("2d) só espaços não envia nada", (await cartoes.count()) === 1);
await p.keyboard.press("Enter");
ok("2e) campo vazio não envia nada", (await cartoes.count()) === 1);
await p.keyboard.type("  segunda  "); await p.click("#chat-enviar");
ok("2f) o botão Enviar também envia (e tira os espaços das pontas)", (await cartoes.count()) === 2 && (await cartoes.first().locator("p").textContent()) === "segunda");

// ================= 3) fluxo da esquerda para a direita
await enviar("terceira");
await p.waitForTimeout(450); // espera a animação de entrada acabar antes de medir posições
const xs = await cartoes.evaluateAll((cs) => cs.map((c) => ({ x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y })));
ok("3a) lado a lado: a mais NOVA na ESQUERDA e as antigas empurradas para a DIREITA", xs.length === 3 && xs[0].x < xs[1].x && xs[1].x < xs[2].x, "x: " + xs.map((c) => c.x.toFixed(0)).join(" < "));
ok("3a2) ...e a ordem na tela é: terceira, segunda, primeira", (await textos()).join("|") === "terceira|segunda|Olá, mesa!");
ok("3b) ...todas na mesma linha (mesmo y): não empilham de baixo para cima", xs.every((c) => perto(c.y, xs[0].y, 1)), xs.map((c) => c.y.toFixed(0)).join(","));
ok("3c) a mais NOVA fica encostada na ponta ESQUERDA da faixa", perto(xs[0].x, (await caixa("#chat-faixa")).x, 2));

// ================= 4) passando do espaço (10 mensagens por código)
for (let i = 1; i <= 10; i++) await enviar(`mensagem número ${i}`);
await p.waitForTimeout(450);
const info = await p.locator("#chat-faixa").evaluate((f) => ({ rolagem: f.scrollLeft, total: f.scrollWidth, visivel: f.clientWidth }));
ok("4a) com várias mensagens a faixa passa do espaço (rola na horizontal)", info.total > info.visivel + 100, `${info.total} > ${info.visivel}`);
ok("4b) a faixa fica no INÍCIO (scrollLeft 0): a mais nova aparece inteira na ponta esquerda", info.rolagem === 0, `rolagem ${info.rolagem}`);
const fb = await caixa("#chat-faixa"), nova = await cartoes.first().boundingBox(), velha = await cartoes.last().boundingBox();
ok("4c) a mais nova está na esquerda da faixa e a mais ANTIGA saiu pela DIREITA", perto(nova.x, fb.x, 2) && velha.x >= fb.x + fb.width - 1, `nova ${nova.x.toFixed(0)} | antiga começa em ${velha.x.toFixed(0)} (faixa termina em ${(fb.x + fb.width).toFixed(0)})`);
ok("4c2) a mais nova diz 'mensagem número 10'", (await cartoes.first().locator("p").textContent()) === "mensagem número 10");
ok("4d) a altura do chat não cresce com as mensagens", perto((await caixa("#chat")).height, chat.height, 1));

// ================= 5) segurança e texto longo
await enviar("<b>oi</b><img src=x onerror=alert(1)>");
const html = cartoes.first();
ok("5a) HTML digitado aparece como TEXTO (não vira código)", (await html.locator("p").textContent()) === "<b>oi</b><img src=x onerror=alert(1)>" && (await html.locator("b, img").count()) === 0);
await enviar("M".repeat(72));
await p.waitForTimeout(450);
const longa = await cartoes.first().boundingBox();
ok("5b) 72 letras largas seguidas ('M') não esticam o cartão além do máximo (300 px) nem o chat", longa.width <= 304 && perto((await caixa("#chat")).height, chat.height, 1), `${longa.width.toFixed(0)} px`);

// ================= 6) Esc e convivência com o tabuleiro
await p.click("#chat-texto"); await p.keyboard.press("Escape");
ok("6a) Esc tira o foco do campo", (await p.evaluate(() => document.activeElement?.id)) !== "chat-texto");
await p.mouse.click(348, 304, { button: "right" });
ok("6b) o tabuleiro continua funcionando (o clique direito num token abre o menu)", await p.locator("#engrenagem").isVisible());
await p.keyboard.press("Escape");

// ================= 7) janelas menores (na MESMA página: só redimensiona, sem abrir o site de novo)
for (const [w, h] of [[1280, 800], [1024, 640]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(200);
    const ch = await caixa("#chat");
    const outros = { bolsa: await caixa("#bolsa"), barra: await caixa("#barra"), desenho: await caixa("#ferramentas-desenho") };
    const conflitos = Object.entries(outros).filter(([, c]) => cruza(ch, c)).map(([n]) => n);
    ok(`7a) ${w}×${h}: o chat não se sobrepõe à bolsa, à barra nem ao painel de desenho`, conflitos.length === 0, `chat x ${ch.x.toFixed(0)}..${(ch.x + ch.width).toFixed(0)}, y ${ch.y.toFixed(0)}..${(ch.y + ch.height).toFixed(0)}${conflitos.length ? " | conflito: " + conflitos : ""}`);
    if (!(await p.locator("#painel-calibragem").isVisible())) await p.click("#calibrar-alternar"); // liga a calibragem (uma vez)
    await p.waitForTimeout(200);
    const cal = await caixa("#painel-calibragem");
    ok(`7b) ${w}×${h}: com a calibragem ligada, o painel dela não cobre o chat, a bolsa, a barra nem o painel de desenho`, !cruza(cal, ch) && !cruza(cal, outros.desenho) && !cruza(cal, await caixa("#bolsa")) && !cruza(cal, await caixa("#barra")), `calibragem y ${cal.y.toFixed(0)}..${(cal.y + cal.height).toFixed(0)}, x ${cal.x.toFixed(0)}..${(cal.x + cal.width).toFixed(0)}`);
}

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
