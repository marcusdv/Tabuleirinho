// Teste e2e: ARRASTAR O TOTAL DE UMA ROLAGEM DO CHAT ATÉ UM TOKEN = DAR DANO (modo LOCAL, na tela). Rodar: npm run test:e2e -- arrastar-dano   (precisa do `npm run dev`)
// O Goblin de exemplo só carrega quando o navegador NÃO se diz automatizado (`navigator.webdriver`), por isso este teste abre o Chrome com a marca de automação desligada (é o caminho real de quem joga).
//
// O total do cartão de rolagem tem o cursor de "agarrar"; arrastá-lo mostra uma SOMBRA do número que segue o mouse; soltar em cima de um token do tabuleiro tira esse valor do status marcado com
// "Subtraído por números arrastados" (o HP de fábrica já vem marcado) e põe a frase no chat. Soltar no vazio, no chat ou nos painéis não faz nada; um clique simples não faz nada; o Esc cancela.
import { chromium } from "playwright-core";
import { URL_SITE, ok, terminar } from "./ajuda.mjs";

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-gpu", "--disable-blink-features=AutomationControlled"] });
const p = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await p.addInitScript(() => {
    try {
        localStorage.setItem("tabuleirinho.lateral.aba", "bolsa");
        localStorage.setItem("tabuleirinho.dados.recolhido", "0");
    } catch {
        /* sem armazenamento */
    }
});
await p.goto(URL_SITE);
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await p.waitForTimeout(800);
await p.evaluate(() => { window.__tabuleirinho.atrasoRolagemMs = 0; });

// 1) um goblin (ficha comum, PV:: 10) no tabuleiro
const ficha = p.locator("#bolsa-itens .ficha", { hasText: "Goblin" }).first();
const c = await ficha.boundingBox();
await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
await p.mouse.down();
await p.mouse.move(c.x - 200, c.y - 80, { steps: 6 });
await p.mouse.move(500, 400, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(400);
const peca = () => p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.copiaDe !== null); return { col: t.col, row: t.row, atual: t.valores[0]?.atual, max: t.valores[0]?.max }; });
const inicio = await peca();
ok("1) o goblin está no tabuleiro com 10/10", inicio.atual === 10 && inicio.max === 10, JSON.stringify(inicio));
const pos = await p.evaluate((pc) => { const k = window.__tabuleirinho.camera.mundoParaTela((pc.col + 0.5) * 64, (pc.row + 0.5) * 64); return { x: k.x, y: k.y }; }, inicio);

// 2) rola 2d6 pelo painel de Dados
await p.click("#lateral-aba-chat");
await p.waitForTimeout(250);
await p.locator("#dados-lados button", { hasText: /^d6$/ }).click();
await p.locator("#dados-qtd-mais").click();
await p.locator("#dados-rolar").click();
await p.waitForTimeout(500);
const total = Number(await p.locator(".chat-total").last().innerText());
ok("2) o total do cartão de rolagem é arrastável (cursor de agarrar)", await p.locator(".chat-total").last().evaluate((e) => e.classList.contains("arrastavel") && getComputedStyle(e).cursor === "grab"), String(total));

// 3) arrasta o total até o token: a sombra aparece, e ao soltar o goblin perde esse valor
let t = await p.locator(".chat-total").last().boundingBox();
await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
await p.mouse.down();
await p.mouse.move(t.x - 150, t.y - 40, { steps: 6 });
ok("3a) durante o arrasto aparece a SOMBRA com o número", (await p.locator(".chat-sombra-dano").count()) === 1 && (await p.locator(".chat-sombra-dano").innerText()) === String(total));
await p.mouse.move(pos.x, pos.y, { steps: 10 });
await p.mouse.up();
await p.waitForTimeout(500);
const depois = await peca();
ok("3b) soltar em cima do token tira o valor do HP dele (limitado a 0)", depois.atual === Math.max(0, 10 - total), `${total}: ${JSON.stringify(depois)}`);
ok("3c) a sombra some ao soltar", (await p.locator(".chat-sombra-dano").count()) === 0);
const frase = await p.evaluate(() => window.__tabuleirinho.estado.mensagens.at(-1).texto);
ok("3d) a frase vai ao chat: 'Goblin Guerreiro: Dano N (HP 10→X)'", new RegExp(`^Goblin Guerreiro: Dano ${total} \\(HP 10→${Math.max(0, 10 - total)}\\)$`).test(frase), frase);

// 4) soltar em lugar nenhum não muda nada: o vazio do mapa, o chat e a bolsa/painéis
const antes = JSON.stringify(await peca());
const nada = [{ x: 900, y: 700, nome: "o vazio do mapa" }, { x: 1300, y: 300, nome: "o chat" }, { x: 60, y: 600, nome: "o canto da tela" }];
let tudoIgual = true;
for (const alvo of nada) {
    t = await p.locator(".chat-total").last().boundingBox();
    await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await p.mouse.down();
    await p.mouse.move(alvo.x, alvo.y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(250);
    if (JSON.stringify(await peca()) !== antes) tudoIgual = false;
}
ok("4) soltar no vazio do mapa, no chat ou no canto da tela NÃO muda nada", tudoIgual);

// 5) um clique simples (sem arrastar) não faz nada
t = await p.locator(".chat-total").last().boundingBox();
await p.mouse.click(t.x + t.width / 2, t.y + t.height / 2);
await p.waitForTimeout(200);
ok("5) um clique simples no total não faz nada (nem sombra, nem dano)", (await p.locator(".chat-sombra-dano").count()) === 0 && JSON.stringify(await peca()) === antes);

// 6) Esc no meio do arrasto cancela
t = await p.locator(".chat-total").last().boundingBox();
await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
await p.mouse.down();
await p.mouse.move(pos.x, pos.y, { steps: 8 });
await p.keyboard.press("Escape");
await p.mouse.up();
await p.waitForTimeout(250);
ok("6) o Esc no meio do arrasto CANCELA (nada muda e a sombra some)", JSON.stringify(await peca()) === antes && (await p.locator(".chat-sombra-dano").count()) === 0);

ok("7) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
