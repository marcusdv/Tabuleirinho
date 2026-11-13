// Teste e2e: o CHAT no canto inferior ESQUERDO, INDEPENDENTE do painel de dados. Rodar: npm run test:e2e -- chat-canto
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// O chat fica a 12 px do canto e NÃO tem mais nada grudado nele: o painel de Dados é uma caixa flutuante à parte (como Ferramentas e Desenho),
// então abrir, recolher ou mover os dados não mexe no chat (nem na posição nem na largura), e o chat não desliza mais. Em várias janelas o chat e
// o painel de dados não invadem a bolsa nem os outros painéis.
import { abrirPagina, lancar, cruza, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const erros = [];
async function pagina(w, h) {
    const p = await nav.newPage({ viewport: { width: w, height: h } });
    p.on("pageerror", (e) => erros.push(String(e)));
    await abrirPagina(p);
    return p;
}
const caixa = (p, s) => p.locator(s).boundingBox();
const perto = (a, b, t = 1.5) => Math.abs(a - b) <= t;

// ================= 1400×800: o caso principal
const p = await pagina(1400, 800);
let chat = await caixa(p, "#chat");
const dados = await caixa(p, "#dados");
ok("1a) o chat está colado no canto inferior esquerdo (12 px das bordas) com 680 px de largura", perto(chat.x, 12) && perto(chat.y + chat.height, 788) && perto(chat.width, 680, 1), JSON.stringify(chat));
ok("1b) o painel de dados NÃO está dentro do chat e não encosta nele (cada um é uma caixa independente)", (await p.locator("#chat #dados").count()) === 0 && !cruza(chat, dados));
const estiloChat = await p.locator("#chat").evaluate((e) => ({ esquerda: getComputedStyle(e).left, transicao: getComputedStyle(e).transitionDuration }));
ok("1c) o chat não tem mais recuo nem transição de deslize (left = 12 px, sem animação)", estiloChat.esquerda === "12px" && estiloChat.transicao === "0s", JSON.stringify(estiloChat));

// ================= recolher/abrir os dados NÃO mexe no chat
await p.click("#dados-alternar"); await p.waitForTimeout(450);
const aposRecolher = await caixa(p, "#chat");
ok("2a) recolher os dados não mexe no chat (mesma posição e mesma largura)", perto(aposRecolher.x, chat.x, 0.5) && perto(aposRecolher.width, chat.width, 0.5) && perto(aposRecolher.y, chat.y, 0.5));
await p.click("#dados-alternar"); await p.waitForTimeout(450);
const aposAbrir = await caixa(p, "#chat");
ok("2b) abrir de novo também não", perto(aposAbrir.x, chat.x, 0.5) && perto(aposAbrir.width, chat.width, 0.5));
// mover os dados também não leva o chat
const cabDados = await caixa(p, "#dados .cabecalho h1");
await p.mouse.move(cabDados.x + 5, cabDados.y + 5); await p.mouse.down(); await p.mouse.move(cabDados.x + 205, cabDados.y + 125, { steps: 6 }); await p.mouse.up();
const aposMover = await caixa(p, "#chat");
ok("2c) mover o painel de dados não leva o chat", perto(aposMover.x, chat.x, 0.5) && perto(aposMover.y, chat.y, 0.5));

// ================= o chat continua funcionando
await p.click("#chat-texto");
await p.keyboard.type("olá do canto");
await p.keyboard.press("Enter");
ok("3) escrever no chat continua funcionando no canto", (await p.locator(".chat-mensagem").count()) === 1);
await p.close();

// ================= outros tamanhos: nada se sobrepõe
for (const [w, h] of [[1280, 720], [1366, 768], [1184, 800], [1920, 1080], [1280, 600], [1024, 640], [1024, 768]]) {
    const q = await pagina(w, h);
    const c = await caixa(q, "#chat"), d = await caixa(q, "#dados"), b = await caixa(q, "#bolsa"), de = await caixa(q, "#ferramentas-desenho"), ba = await caixa(q, "#barra");
    ok(`4) ${w}×${h}: o chat fica no canto (x = 12) e não invade a bolsa`, perto(c.x, 12) && c.x + c.width <= b.x + 0.5, `chat até ${c.x + c.width}, bolsa em ${b.x}`);
    ok(`4) ${w}×${h}: o chat não cobre o painel de Desenho`, !cruza(c, de));
    ok(`4) ${w}×${h}: o painel de dados não cobre o Desenho, as Ferramentas, a bolsa nem o chat`, !cruza(d, de) && !cruza(d, ba) && !cruza(d, b) && !cruza(d, c), JSON.stringify({ d, de, ba }));
    await q.close();
}
ok("5) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
process.exitCode = terminar(erros);
await nav.close();
