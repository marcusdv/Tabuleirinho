// Teste e2e: JANELA DA FICHA flutuante e arrastável, SEM fundo escurecido, e a BOLSA com 5 por linha (modo LOCAL).
// Rodar: npm run test:e2e -- fichas-janela  (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// A bolsa do canto tem 340 px e 5 fichas (tokens e documentos) por linha, sem invadir o chat. A janela da ficha NÃO escurece o fundo nem
// bloqueia o mouse (só o painel recebe): dá para usar o chat com ela aberta, e o Esc com o foco no chat não a fecha. Arrasta-se pela barra do
// título, respeitando os limites da tela (sempre sobra um pedaço para puxar de volta), lembra o lugar ao reabrir e volta para dentro se a
// janela do navegador encolhe. Abrir uma ficha pela bolsa em tela cheia recolhe a bolsa, para o chat ficar visível.
import { abrirPagina, lancar, cruza, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const caixa = (s) => p.locator(s).boundingBox();
const topos = (s) => p.locator(s).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
const cor = (s, prop) => p.locator(s).first().evaluate((el, prop) => getComputedStyle(el)[prop], prop);
const cincoPorLinha = (t, total) => t.length === total && new Set(t.slice(0, 5)).size === 1 && t[5] > t[0];

// ================= a bolsa com 5 por linha: tokens
await p.evaluate(() => window.__tabuleirinho.semear(Array.from({ length: 6 }, (_, i) => ({ id: 11 + i, nome: `Guardado ${i + 1}`, imagem: null, col: 0, row: 0, cor: 0x3498db, corBorda: 0xffffff, size: 1, guardado: true }))));
const bPeq = await caixa("#bolsa"), chat = await caixa("#chat");
ok("1a) a bolsa pequena ficou maior (332 px) e CONTINUA na coluna da direita, sem invadir o chat", Math.round(bPeq.width) === 340 && bPeq.x >= chat.x + chat.width, JSON.stringify({ bolsa: bPeq.x, chatFim: chat.x + chat.width }));
const tTok = await topos(".ficha");
ok("1b) tokens, bolsa PEQUENA: 5 por linha (o sexto vai para a de baixo)", cincoPorLinha(tTok, 6), tTok.join());
const bMed = await caixa("#bolsa");
const tTokM = await topos(".ficha");
ok("1c) tokens, bolsa MÉDIA: também 5 por linha, sem invadir o chat", cincoPorLinha(tTokM, 6) && bMed.x >= chat.x + chat.width, `${tTokM.join()} / ${bMed.x} >= ${chat.x + chat.width}`);
// fichas (documentos)
await p.click("#bolsa-aba-fichas");
for (let i = 0; i < 6; i++) await criarFichaFechada(p);
const tDocM = await topos(".bolsa-doc");
ok("2a) documentos, bolsa MÉDIA: 5 por linha", cincoPorLinha(tDocM, 6), tDocM.join());
const tDocP = await topos(".bolsa-doc");
ok("2b) documentos, bolsa PEQUENA: 5 por linha", cincoPorLinha(tDocP, 6), tDocP.join());
const larguras = await p.locator(".bolsa-doc").evaluateAll((els) => els.slice(0, 5).map((e) => Math.round(e.getBoundingClientRect().width)));
ok("2c) cada cartão continua com um tamanho confortável (~56 px) para caber o nome", larguras.every((l) => l >= 52 && l <= 62), larguras.join());

// ================= abrir a ficha: janela flutuante, sem escurecer
await p.locator(".bolsa-doc").first().dblclick();
ok("3a) clicar no documento abre a janela da ficha", await p.locator("#editor-ficha").isVisible());
ok("3b) a camada da janela é TRANSPARENTE e não bloqueia o mouse (sem fundo escurecido); só o painel recebe o mouse", (await cor("#editor-ficha", "backgroundColor")) === "rgba(0, 0, 0, 0)" && (await cor("#editor-ficha", "pointerEvents")) === "none" && (await cor("#editor-ficha-painel", "pointerEvents")) === "auto");
const painel = await caixa("#editor-ficha-painel");
const chat2 = await caixa("#chat");
ok("3c) por padrão a janela deixa livre a faixa do chat (não o cobre)", !cruza(painel, chat2) && painel.y + painel.height <= chat2.y, JSON.stringify({ painel, chat: chat2 }));
const noChat = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("#chat"), [chat2.x + chat2.width / 2, chat2.y + chat2.height / 2]);
ok("3d) o chat está à vista e acessível (nada por cima dele)", noChat);
const caixaMapa = await caixa("#bolsa");

// ================= com a ficha aberta, o resto continua usável (ver a rolagem)
await p.fill("#editor-ficha-texto", "FOR:: 16\n(Ataque)[1d20 + FOR]");
await p.click("#chat-texto");
await p.keyboard.type("rolei o ataque");
await p.keyboard.press("Enter");
ok("4a) dá para escrever no chat com a ficha aberta, e a mensagem aparece", (await p.locator(".chat-mensagem").count()) === 1 && (await p.locator("#editor-ficha").isVisible()), String(await p.locator(".chat-mensagem").count()));
ok("4b) o texto da ficha continua intacto", (await p.inputValue("#editor-ficha-texto")).startsWith("FOR:: 16"));
await p.focus("#chat-texto");
await p.keyboard.press("Escape");
ok("4c) Esc com o foco no CHAT não fecha a ficha (a janela não é modal)", await p.locator("#editor-ficha").isVisible());
await p.mouse.click(300, 450); // clique no tabuleiro
ok("4d) clicar no tabuleiro não fecha a ficha", await p.locator("#editor-ficha").isVisible());
const dado = await p.locator("button:has-text('d20')").first().isVisible();
ok("4e) a barra de dados continua visível e à mão", dado);

// ================= arrastar pela barra do título
const titulo = await caixa("#editor-ficha-titulo");
const antes = await caixa("#editor-ficha-painel");
await p.mouse.move(titulo.x + 10, titulo.y + titulo.height / 2);
await p.mouse.down();
await p.mouse.move(titulo.x + 10 + 90, titulo.y + titulo.height / 2 + 45, { steps: 5 });
await p.mouse.move(titulo.x + 10 + 180, titulo.y + titulo.height / 2 + 90, { steps: 5 });
await p.mouse.up();
const depois = await caixa("#editor-ficha-painel");
ok("5a) arrastar a barra do título move a janela (180 px à direita, 90 para baixo)", Math.abs(depois.x - antes.x - 180) <= 2 && Math.abs(depois.y - antes.y - 90) <= 2, JSON.stringify({ antes: [antes.x, antes.y], depois: [depois.x, depois.y] }));
ok("5b) o texto que estava sendo escrito não foi perdido nem selecionado pelo arrasto", (await p.inputValue("#editor-ficha-texto")).startsWith("FOR:: 16"));
// arrastar pelo botão Salvar não move
const salvar = await caixa("#editor-ficha-salvar"), p0 = await caixa("#editor-ficha-painel");
await p.mouse.move(salvar.x + 5, salvar.y + 5); await p.mouse.down(); await p.mouse.move(salvar.x + 105, salvar.y + 105, { steps: 4 }); await p.mouse.up();
const p1 = await caixa("#editor-ficha-painel");
ok("5c) só a BARRA DO TÍTULO arrasta (puxar por um botão não move a janela)", Math.abs(p1.x - p0.x) < 1 && Math.abs(p1.y - p0.y) < 1);
// limites
const t2 = await caixa("#editor-ficha-titulo");
await p.mouse.move(t2.x + 10, t2.y + 8); await p.mouse.down(); await p.mouse.move(-3000, -3000, { steps: 6 }); await p.mouse.up();
const cantoSE = await caixa("#editor-ficha-painel");
ok("6a) arrastar para além do canto superior esquerdo: a janela para na borda (y >= 0) e sobra um pedaço (>= 80 px) para puxar de volta", cantoSE.y >= 0 && cantoSE.x + cantoSE.width >= 80 - 0.5, JSON.stringify(cantoSE));
const t3 = await caixa("#editor-ficha-titulo");
await p.mouse.move(t3.x + 10, t3.y + 8); await p.mouse.down(); await p.mouse.move(9000, 9000, { steps: 6 }); await p.mouse.up();
const fundo = await caixa("#editor-ficha-painel");
ok("6b) arrastar para além do canto inferior direito: a barra do título continua à vista", fundo.x <= 1400 - 80 + 0.5 && fundo.y <= 800 - 44 + 0.5, JSON.stringify(fundo));
// reposicionar bem e lembrar
const t4 = await caixa("#editor-ficha-titulo");
await p.mouse.move(t4.x + 10, t4.y + 8); await p.mouse.down(); await p.mouse.move(400, 60, { steps: 6 }); await p.mouse.up();
const marcada = await caixa("#editor-ficha-painel");
await p.focus("#editor-ficha-texto");
await p.fill("#editor-ficha-texto", ""); // volta ao estado salvo (vazio): sem alterações
await p.keyboard.press("Escape");
ok("7a) Esc com o foco na ficha (sem alterações) fecha", await p.locator("#editor-ficha").isHidden());
await p.locator(".bolsa-doc").first().dblclick();
const reaberta = await caixa("#editor-ficha-painel");
ok("7b) ao reabrir, a janela volta ao MESMO lugar onde foi deixada", Math.abs(reaberta.x - marcada.x) < 1 && Math.abs(reaberta.y - marcada.y) < 1, JSON.stringify({ marcada: [marcada.x, marcada.y], reaberta: [reaberta.x, reaberta.y] }));
await p.setViewportSize({ width: 700, height: 500 });
await p.waitForTimeout(150);
const pequena = await caixa("#editor-ficha-painel");
ok("7c) se a janela do navegador encolhe, a ficha é puxada de volta para dentro da tela", pequena.x + pequena.width >= 80 && pequena.x <= 700 - 80 && pequena.y + 44 <= 500 + 0.5, JSON.stringify(pequena));
await p.setViewportSize({ width: 1400, height: 800 });
await p.keyboard.press("Escape");

// ================= abrir a ficha a partir da bolsa em TELA CHEIA
await p.click("#bolsa-gerenciar"); // tela cheia
ok("8a) (preparo) a bolsa está em tela cheia", ((await p.locator("#bolsa").getAttribute("class")) ?? "").includes("expandida"));
await p.locator(".bolsa-doc").first().dblclick();
const classe = (await p.locator("#bolsa").getAttribute("class")) ?? "";
ok("8b) abrir uma ficha pela tela cheia RECOLHE a bolsa (volta à média) e a janela da ficha abre por cima do tabuleiro", !classe.includes("expandida") && (await p.locator("#editor-ficha").isVisible()), classe);
const ch = await caixa("#chat"), pn = await caixa("#editor-ficha-painel");
ok("8c) com isso o chat fica visível (nada o cobre)", await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("#chat"), [ch.x + ch.width / 2, ch.y + ch.height / 2]));
ok("9) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
