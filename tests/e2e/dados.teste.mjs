// Teste e2e: barra de dados ao lado do chat. Rodar: npm run test:e2e -- dados
// (precisa do servidor: npm run dev). A lógica dos sorteios está em dados-logica.teste.mjs (sem navegador).
import { CAPTURAS, abrirPagina, cruza, lancar, lerEstado, ok, perto, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const caixa = (s) => p.locator(s).boundingBox();
const cartoes = p.locator(".chat-mensagem");
const dado = (n) => p.locator(".dado", { hasText: new RegExp(`^d${n}$`) });
// O texto "Rolar" é o RÓTULO em cima do quadrado; dentro do quadrado fica só a fórmula. Juntos: "Rolar 3d6+2".
const rolarTexto = async () => `${await p.locator("#dados-rolar-rotulo").textContent()} ${await p.locator("#dados-rolar").textContent()}`;
const valor = (s) => p.inputValue(s);
const sorteio = (v) => p.evaluate((v) => { Math.random = () => v; }, v); // controla o sorteio do navegador

// ================= 1) posição: GRUDADA no lado esquerdo do chat
const chat = await caixa("#chat"), dados = await caixa("#dados");
ok("1a) a barra de dados está GRUDADA na borda esquerda do chat (sem vão)", perto(dados.x + dados.width, chat.x, 1.5), `dados termina em ${(dados.x + dados.width).toFixed(1)}, chat começa em ${chat.x.toFixed(1)}`);
ok("1b) ...com a MESMA ALTURA do chat (e no mesmo topo)", perto(dados.height, chat.height, 1.5) && perto(dados.y, chat.y, 1.5), `dados ${dados.height.toFixed(1)} px em y ${dados.y.toFixed(1)} | chat ${chat.height.toFixed(1)} px em y ${chat.y.toFixed(1)}`);
const abaAberta = await caixa("#dados-alternar");
ok("1b2) a aba da seta (expandir/ocultar) ocupa a altura toda, também aberta", perto(abaAberta.height, chat.height, 3), `${abaAberta.height.toFixed(1)} px`);
ok("1b3) a barra aberta é larga (mais de 260 px)", dados.width > 260, `${dados.width.toFixed(0)} px`);
for (const [nome, sel] of [["painel de desenho", "#ferramentas-desenho"], ["bolsa", "#bolsa"], ["barra de ferramentas", "#barra"]]) {
    ok(`1c) a barra de dados não se sobrepõe à ${nome}`, !cruza(dados, await caixa(sel)));
}

// ================= 2) os dados disponíveis e o estado inicial
ok("2a) os dados, em ordem: d4 d6 d8 d10 d12 d20 d100 d1000", (await p.locator(".dado").allTextContents()).join(" ") === "d4 d6 d8 d10 d12 d20 d100 d1000");
ok("2b) ao abrir: d20 escolhido, quantidade 1, modificador 0, botão 'Rolar 1d20'", (await p.locator(".dado.escolhido").allTextContents()).join() === "d20" && (await valor("#dados-qtd")) === "1" && (await valor("#dados-mod")) === "0" && (await rolarTexto()) === "Rolar 1d20");

// ================= 2c) o layout: quantidade e modificador EMBAIXO dos dados; Rolar GRANDE à direita, na altura toda
const quadrados = await p.locator(".dado").evaluateAll((bs) => bs.map((x) => { const r = x.getBoundingClientRect(); return { yb: r.bottom, xr: r.right, w: r.width, h: r.height }; }));
const baixoDados = Math.max(...quadrados.map((q) => q.yb)), direitaDados = Math.max(...quadrados.map((q) => q.xr));
const qtdBox = await caixa("#dados-qtd"), modBox = await caixa("#dados-mod"), rolarBox = await caixa("#dados-rolar");
ok("2c) quantidade e modificador ficam EMBAIXO dos dados (e lado a lado)", qtdBox.y >= baixoDados - 1 && modBox.y >= baixoDados - 1 && perto(qtdBox.y, modBox.y, 1) && modBox.x > qtdBox.x);
ok("2d) o quadrado do Rolar fica à DIREITA dos dados, ocupando quase toda a altura da barra (mais de 100 px)", rolarBox.x >= direitaDados - 1 && rolarBox.height > 100 && rolarBox.width >= 80, `${rolarBox.width.toFixed(0)}x${rolarBox.height.toFixed(0)} px`);
const rotuloBox = await caixa("#dados-rolar-rotulo");
const estiloRotulo = await p.locator("#dados-rolar-rotulo").evaluate((e) => ({ fonte: parseFloat(getComputedStyle(e).fontSize), caixa: getComputedStyle(e).textTransform }));
ok("2d2) o texto ROLAR fica EM CIMA do quadrado (em maiúsculas, com 13 px) e dentro do quadrado só a fórmula", rotuloBox.y + rotuloBox.height <= rolarBox.y + 1 && estiloRotulo.caixa === "uppercase" && estiloRotulo.fonte >= 13 && /^\d+d\d+([+-]\d+)?$/.test((await p.locator("#dados-rolar").textContent()).trim()), `rótulo ${estiloRotulo.fonte}px, dentro: "${(await p.locator("#dados-rolar").textContent()).trim()}"`);
ok("2d3) a fórmula cabe inteira no quadrado (mesmo a mais comprida)", await (async () => { await p.fill("#dados-qtd", "99"); await p.press("#dados-qtd", "Enter"); await p.fill("#dados-mod", "-99"); await p.press("#dados-mod", "Enter"); await dado(1000).click(); const f = await p.locator("#dados-rolar .rolar-formula").boundingBox(), q = await caixa("#dados-rolar"); const cabe = f.width <= q.width - 8 + 0.5; await p.fill("#dados-qtd", "1"); await p.press("#dados-qtd", "Enter"); await p.fill("#dados-mod", "0"); await p.press("#dados-mod", "Enter"); await dado(20).click(); return cabe; })());
ok("2d4) clicar no TEXTO 'Rolar' (o rótulo) também rola", await (async () => { const antes = await cartoes.count(); await p.click("#dados-rolar-rotulo"); await p.waitForTimeout(100); return (await cartoes.count()) === antes + 1; })());
ok("2e) os quadrados dos dados são maiores (pelo menos 38 px de altura e 40 de largura)", quadrados.every((q) => q.h >= 37.5 && q.w >= 39.5), `${quadrados[0].w.toFixed(0)}x${quadrados[0].h.toFixed(0)}`);
ok("2f) a aba da seta fica ENTRE os dados e o chat (à direita da barra, colada no chat)", (await caixa("#dados-alternar")).x >= direitaDados && perto(((await caixa("#dados-alternar")).x + (await caixa("#dados-alternar")).width), chat.x, 2));

// ================= 3) escolher dado, quantidade e modificador
await dado(6).click();
ok("3a) escolher o d6 o destaca (e só ele) e muda a fórmula", (await p.locator(".dado.escolhido").allTextContents()).join() === "d6" && (await rolarTexto()) === "Rolar 1d6");
await p.click("#dados-qtd-mais"); await p.click("#dados-qtd-mais");
await p.click("#dados-mod-mais"); await p.click("#dados-mod-mais");
ok("3b) quantidade 3 e modificador +2: 'Rolar 3d6+2'", (await rolarTexto()) === "Rolar 3d6+2" && (await valor("#dados-qtd")) === "3" && (await valor("#dados-mod")) === "2");
for (let i = 0; i < 3; i++) await p.click("#dados-mod-menos");
ok("3c) modificador negativo: 'Rolar 3d6-1'", (await rolarTexto()) === "Rolar 3d6-1" && (await valor("#dados-mod")) === "-1");
await p.click("#dados-mod-mais"); await p.click("#dados-mod-mais"); // volta a +1
// limites pelos botões
for (let i = 0; i < 110; i++) if (!(await p.locator("#dados-qtd-mais").isDisabled())) await p.click("#dados-qtd-mais");
ok("3d) a quantidade para em 99 (botão + desativado)", (await valor("#dados-qtd")) === "99" && (await p.locator("#dados-qtd-mais").isDisabled()));
await p.fill("#dados-qtd", "1"); await p.press("#dados-qtd", "Enter");
ok("3e) com 1 dado, o botão − da quantidade fica desativado", await p.locator("#dados-qtd-menos").isDisabled());

// ================= 4) digitar nos campos: limites, arredondamento, valores inválidos
async function digitar(sel, texto) { await p.fill(sel, texto); await p.press(sel, "Enter"); }
await digitar("#dados-qtd", "999");
ok("4a) quantidade 999 digitada vira 99 (o máximo)", (await valor("#dados-qtd")) === "99");
await digitar("#dados-qtd", "0");
ok("4b) quantidade 0 vira 1 (o mínimo)", (await valor("#dados-qtd")) === "1");
await digitar("#dados-qtd", "2.6");
ok("4c) quantidade 2,6 é arredondada para 3", (await valor("#dados-qtd")) === "3");
await digitar("#dados-qtd", "");
ok("4d) campo vazio volta ao valor anterior (3)", (await valor("#dados-qtd")) === "3");
await digitar("#dados-mod", "500");
ok("4e) modificador 500 vira +99 (o máximo)", (await valor("#dados-mod")) === "99" && (await p.locator("#dados-mod-mais").isDisabled()));
await digitar("#dados-mod", "-500");
ok("4f) modificador -500 vira -99 (o mínimo)", (await valor("#dados-mod")) === "-99" && (await p.locator("#dados-mod-menos").isDisabled()));
await digitar("#dados-mod", "2");
ok("4g) a fórmula acompanha: 'Rolar 3d6+2'", (await rolarTexto()) === "Rolar 3d6+2");
// Digitar o valor SEM apertar Enter e já clicar em Rolar: o valor digitado precisa valer nesta rolagem.
await p.fill("#dados-qtd", "5"); await p.click("#dados-rolar"); await p.waitForTimeout(100);
ok("4h) digitar 5 dados sem Enter e clicar em Rolar rola 5d6+2 (o valor digitado vale)", (await cartoes.first().locator(".chat-formula strong").textContent()) === "5d6+2" && (await rolarTexto()) === "Rolar 5d6+2", await cartoes.first().locator(".chat-formula strong").textContent());
await digitar("#dados-qtd", "3"); // volta a 3d6+2 para os próximos passos
const antes = await cartoes.count();

// ================= 5) rolar: o resultado vai para o chat (sorteio controlado)
await sorteio(0.5); // cada d6 dá floor(0,5*6)+1 = 4
await p.click("#dados-rolar"); await p.waitForTimeout(450);
const c = cartoes.first();
ok("5a) rolar 3d6+2 coloca UM cartão de rolagem na ponta esquerda do chat", (await cartoes.count()) === antes + 1 && (await c.getAttribute("class")).includes("chat-rolagem"));
ok("5b) o cartão mostra o autor, a fórmula '3d6+2' e o total '= 14'", (await c.locator("strong").first().textContent()) === "Você" && (await c.locator(".chat-formula strong").textContent()) === "3d6+2" && (await c.locator(".chat-total").textContent()).trim() === "14");
const fontes = await c.evaluate((el) => ({ total: parseFloat(getComputedStyle(el.querySelector(".chat-total")).fontSize), formula: parseFloat(getComputedStyle(el.querySelector(".chat-formula")).fontSize) }));
ok("5b2) o número do resultado é GRANDE (>= 28 px) e bem maior que a fórmula", fontes.total >= 28 && fontes.total >= fontes.formula * 2, `total ${fontes.total}px, fórmula ${fontes.formula}px`);
ok("5c) ...e os dados individuais com o modificador: '[4, 4, 4] +2'", (await c.locator(".chat-detalhe").textContent()) === "[4, 4, 4] +2");
const guardada = await lerEstado(p, (e) => { const m = e.mensagens[e.mensagens.length - 1]; return { texto: m.texto, total: m.rolagem?.total, lados: m.rolagem?.lados, resultados: m.rolagem?.resultados }; });
ok("5d) no estado a mensagem guarda a rolagem completa (texto '3d6+2 = 14')", guardada.texto === "3d6+2 = 14" && guardada.total === 14 && guardada.lados === 6 && guardada.resultados.join() === "4,4,4", JSON.stringify(guardada));
ok("5e) rolar não mexe no que estava escolhido (continua d6, 3, +2)", (await rolarTexto()) === "Rolar 3d6+2");

// extremos pela interface
await dado(1000).click(); await digitar("#dados-qtd", "1"); await digitar("#dados-mod", "0");
await sorteio(0.9999); await p.click("#dados-rolar"); await p.waitForTimeout(100);
ok("5f) d1000 com sorteio máximo dá 1000", (await cartoes.first().locator(".chat-total").textContent()).trim() === "1000" && (await cartoes.first().locator(".chat-detalhe").textContent()) === "[1000]");
await dado(100).click(); await sorteio(0); await p.click("#dados-rolar"); await p.waitForTimeout(100);
ok("5g) d100 com sorteio mínimo dá 1 (fórmula '1d100', sem modificador)", (await cartoes.first().locator(".chat-formula strong").textContent()) === "1d100" && (await cartoes.first().locator(".chat-total").textContent()).trim() === "1");

// ================= 6) muitos dados: o cartão não estoura
await dado(1000).click(); await digitar("#dados-qtd", "20"); await digitar("#dados-mod", "-7");
await sorteio(0.5); // 501 em cada d1000
await p.click("#dados-rolar"); await p.waitForTimeout(450);
const cheio = cartoes.first();
const largura = (await cheio.boundingBox()).width;
ok("6a) 20d1000-7: total correto (20 × 501 - 7 = 10013)", (await cheio.locator(".chat-total").textContent()).trim() === "10013");
ok("6b) o detalhe mostra só 12 dados e termina com '…' (cabe numa linha)", (await cheio.locator(".chat-detalhe").textContent()).includes("…") && (await cheio.locator(".chat-detalhe").textContent()).split(",").length === 13, await cheio.locator(".chat-detalhe").textContent());
ok("6c) a dica do mouse traz a lista COMPLETA (20 valores)", ((await cheio.locator(".chat-detalhe").getAttribute("title")) ?? "").split(",").length === 20);
ok("6d) o cartão não passa da largura máxima (300 px) e o chat não cresce", largura <= 304 && perto((await caixa("#chat")).height, chat.height, 1), `${largura.toFixed(0)} px`);

// ================= 7) mensagem digitada e rolagem convivem, na ordem de envio
await p.click("#chat-texto"); await p.keyboard.type("depois"); await p.keyboard.press("Enter");
await sorteio(0.5); await p.click("#dados-rolar"); await p.waitForTimeout(450);
const topo = await cartoes.evaluateAll((cs) => cs.slice(0, 3).map((c) => ({ rolagem: c.classList.contains("chat-rolagem"), texto: c.querySelector("p").textContent })));
ok("7) a ordem é: rolagem (nova), 'depois' (digitada), rolagem anterior", topo[0].rolagem && !topo[1].rolagem && topo[1].texto === "depois" && topo[2].rolagem, JSON.stringify(topo.map((t) => t.rolagem ? "rolagem" : t.texto)));
ok("7b) rolar não afeta o campo do chat nem o contador de caracteres", (await valor("#chat-texto")) === "" && (await p.textContent("#chat-contador")) === "0/72");

// ================= 8) retrátil
const antesChat = await caixa("#chat");
await p.click("#dados-alternar"); await p.waitForTimeout(150);
const recolhida = await caixa("#dados");
ok("8a) recolher esconde as opções e deixa só a abinha 'Dados' (bem mais estreita)", !(await p.locator("#dados-conteudo").isVisible()) && recolhida.width < 100 && (await p.locator("#dados-alternar .seta").textContent()) === "‹", `${recolhida.width.toFixed(0)} px`);
const abaFechada = await caixa("#dados-alternar");
ok("8a2) FECHADA, a aba e a barra continuam com a altura toda do chat", perto(abaFechada.height, antesChat.height, 3) && perto(recolhida.height, antesChat.height, 1.5), `aba ${abaFechada.height.toFixed(1)} px, barra ${recolhida.height.toFixed(1)} px, chat ${antesChat.height.toFixed(1)} px`);
ok("8b) a abinha continua GRUDADA na esquerda do chat, e o chat não se mexeu", perto(recolhida.x + recolhida.width, antesChat.x, 1.5) && perto((await caixa("#chat")).x, antesChat.x, 0.5) && perto((await caixa("#chat")).width, antesChat.width, 0.5));
ok("8c) 'aria-expanded' acompanha (false) e o título muda", (await p.getAttribute("#dados-alternar", "aria-expanded")) === "false" && (await p.getAttribute("#dados-alternar", "title")) === "Abrir os dados");
await p.click("#dados-alternar"); await p.waitForTimeout(150);
ok("8d) expandir de novo mostra tudo e MANTÉM o que estava escolhido (d1000, 20, -7)", (await p.locator("#dados-conteudo").isVisible()) && (await rolarTexto()) === "Rolar 20d1000-7" && (await p.getAttribute("#dados-alternar", "aria-expanded")) === "true");
await p.click("#dados-alternar"); // recolhe
await p.click("#chat-texto"); await p.keyboard.type("oi"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
const enviouComRecolhida = (await cartoes.first().locator("p").textContent()) === "oi";
await p.click("#dados-alternar"); // expande de novo
ok("8e) o chat continua funcionando com a barra recolhida (enviar mensagem)", enviouComRecolhida);

// ================= 9) janela pequena: começa recolhida (para não cobrir os outros painéis)
await p.screenshot({ path: `${CAPTURAS}/dados_final.png`, clip: { x: 160, y: 560, width: 920, height: 240 } });
const pequena = await navegador.newPage({ viewport: { width: 1024, height: 640 } });
pequena.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(pequena);
const dp = await pequena.locator("#dados").boundingBox(), desenhoP = await pequena.locator("#ferramentas-desenho").boundingBox(), chatP = await pequena.locator("#chat").boundingBox();
ok("9a) em 1024×640 a barra de dados começa RECOLHIDA", (await pequena.locator("#dados").getAttribute("class")).includes("recolhido") && !(await pequena.locator("#dados-conteudo").isVisible()));
ok("9b) ...EM CIMA do chat (colada na borda de cima, com a largura dele) e sem cobrir o painel de desenho", perto(dp.y + dp.height, chatP.y, 1.5) && perto(dp.width, chatP.width, 2) && !cruza(dp, desenhoP), `barra y ${dp.y.toFixed(0)}..${(dp.y + dp.height).toFixed(0)} (${dp.width.toFixed(0)} px), chat y ${chatP.y.toFixed(0)} (${chatP.width.toFixed(0)} px)`);
ok("9b2) recolhida em cima do chat, a aba ocupa a largura toda", perto((await pequena.locator("#dados-alternar").boundingBox()).width, chatP.width, 3));
await pequena.close();

// ================= 10) janela estreita mas ALTA (1024×768): começa ABERTA, empilhada em cima do chat (menos de 1090 px)
const empilhada = await navegador.newPage({ viewport: { width: 1024, height: 768 } });
empilhada.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(empilhada);
const cE = await empilhada.locator("#chat").boundingBox(), dE = await empilhada.locator("#dados").boundingBox(), tE = await empilhada.locator("#dados-alternar").boundingBox();
const quadE = await empilhada.locator(".dado").evaluateAll((bs) => bs.map((x) => { const r = x.getBoundingClientRect(); return { y: r.y, yb: r.bottom }; }));
const qE = await empilhada.locator("#dados-qtd").boundingBox(), mE = await empilhada.locator("#dados-mod").boundingBox(), rE = await empilhada.locator("#dados-rolar").boundingBox();
ok("10a) em 1024×768 (menos de 1090 px) a barra começa ABERTA e fica EM CIMA do chat, com a largura dele", !((await empilhada.locator("#dados").getAttribute("class")) ?? "").includes("recolhido") && perto(dE.y + dE.height, cE.y, 1.5) && perto(dE.width, cE.width, 2), `barra y ${dE.y.toFixed(0)}..${(dE.y + dE.height).toFixed(0)}, chat y ${cE.y.toFixed(0)}`);
ok("10b) os 8 dados ficam numa linha só", quadE.length === 8 && quadE.every((q) => perto(q.y, quadE[0].y, 1)));
ok("10c) embaixo deles: quantidade, modificador e o botão Rolar (o Rolar à direita, preenchendo a célula)", qE.y > quadE[0].yb && mE.y > quadE[0].yb && rE.x > mE.x && rE.height > 25 && rE.width > 120, `Rolar ${rE.width.toFixed(0)}x${rE.height.toFixed(0)}`);
ok("10d) a aba é uma faixa horizontal ENTRE os dados e o chat (abaixo do Rolar, acima do chat), com a largura toda", tE.y >= rE.y + rE.height && perto(tE.y + tE.height, cE.y, 2) && perto(tE.width, cE.width, 3), `aba y ${tE.y.toFixed(0)}..${(tE.y + tE.height).toFixed(0)}`);
await empilhada.click("#dados-alternar"); await empilhada.waitForTimeout(150);
const dF = await empilhada.locator("#dados").boundingBox();
ok("10e) recolhida, sobra só a aba (24 px de altura) colada em cima do chat", dF.height < 30 && perto(dF.y + dF.height, cE.y, 1.5), `${dF.height.toFixed(0)} px`);
await empilhada.close();

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
