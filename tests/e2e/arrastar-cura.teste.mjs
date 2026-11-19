// Teste e2e: a ETIQUETA DE EFEITO das rolagens ({cura} e {dano}) no CHAT e no ARRASTAR do número até uma criatura (modo LOCAL). Rodar: npm run test:e2e -- arrastar-cura (precisa do npm run dev).
// {cura}: o número aparece dentro de um CORAÇÃO verde (o cura.svg) e, arrastado até uma criatura, SOMA ao HP; {dano}: o número leva a ESPADA (o atacar.svg) e tira HP; sem etiqueta tira HP, como sempre. Vale
// também para os números de dentro de um CARTÃO, cada um com a sua etiqueta.
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

// A criatura: o Token 5 com 10 de 20 de vida.
await p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.nome === "Token 5"); t.valores = t.status.map((s) => ({ id: s.id, atual: 10, max: 20 })); });
const vida = () => p.evaluate(() => window.__tabuleirinho.estado.tokens.find((x) => x.nome === "Token 5").valores[0].atual);
const posicao = await p.evaluate(() => { const t = window.__tabuleirinho; const k = t.estado.tokens.find((x) => x.nome === "Token 5"); const q = t.camera.mundoParaTela((k.col + 0.5) * 64, (k.row + 0.5) * 64); return { x: q.x, y: q.y }; });

const dados = (lados, resultado) => [{ quantidade: 1, lados, resultados: [resultado] }];
const ficha = (id, nome, total, efeito) => ({ id, autor: "Ana", texto: nome, hora: Date.now(), rolagemFicha: { nome, ficha: "Aurora", formula: `1d8 + 3`, detalhe: `1d8 [${total - 3}] + 3`, dados: dados(8, total - 3), total, ...(efeito && { efeito }) } });
const mensagens = [
    ficha(901, "Curar Ferimentos", 7, "cura"),
    ficha(902, "Golpe sem etiqueta", 3),
    ficha(903, "Dano da maça", 4, "dano"),
    { id: 904, autor: "Ana", texto: "Cura em Massa", hora: Date.now(), cartaoFicha: { nome: "Cura em Massa", ficha: "Aurora", pedacos: [
        { tipo: "texto", texto: "Todos recuperam " }, { tipo: "rolagem", formula: "2d6 + 3", detalhe: "2d6 [3, 2] + 3", total: 8, dados: dados(6, 5), efeito: "cura" },
        { tipo: "texto", texto: " PV; um morto-vivo sofre " }, { tipo: "rolagem", formula: "2d6", detalhe: "2d6 [1, 2]", total: 3, dados: dados(6, 3), efeito: "dano" },
        { tipo: "texto", texto: " e " }, { tipo: "conta", formula: "2 + 2", total: 4 },
    ] } },
];
await p.click("#lateral-aba-chat");
await p.waitForTimeout(250);
for (const m of mensagens) await p.evaluate((m) => window.__tabuleirinho.mensagemDeTeste(m), m);
await p.waitForTimeout(400);

// ---------------------------------------------------------------- o visual
const mascara = (seletor) => p.locator(seletor).first().evaluate((e) => { const c = getComputedStyle(e, "::before"); return (c.webkitMaskImage || c.maskImage || ""); });
ok("1) o total da rolagem {cura} tem a marca de cura e o coração (cura.svg) atrás do número", (await p.locator(".chat-total.efeito-cura").count()) === 1 && /pings\/cura\.svg/.test(await mascara(".chat-total.efeito-cura")));
ok("2) o total da rolagem {dano} tem a marca de dano e a espada (atacar.svg) na frente", (await p.locator(".chat-total.efeito-dano").count()) === 1 && /pings\/atacar\.svg/.test(await mascara(".chat-total.efeito-dano")));
ok("3) a rolagem SEM etiqueta continua como sempre (sem coração nem espada)", (await p.locator(".chat-total:not(.efeito-cura):not(.efeito-dano)").count()) === 1);
ok("4) o texto do total é só o número (o desenho é pseudo-elemento: o arrasto leva o número)", (await p.locator(".chat-total.efeito-cura").innerText()) === "7");
ok("5) no CARTÃO, cada número tem a sua marca: um de cura, um de dano e a conta sem marca", (await p.locator(".chat-cartao-resultado.efeito-cura").count()) === 1 && (await p.locator(".chat-cartao-resultado.efeito-dano").count()) === 1 && (await p.locator(".chat-cartao-resultado.conta:not(.efeito-cura):not(.efeito-dano)").count()) === 1);
ok("6) a etiqueta não vaza para o texto do cartão", !/\{/.test(await p.locator(".chat-cartao-resultado").first().evaluate((e) => e.parentElement.innerText)));
await p.screenshot({ path: process.env.CAPTURA ?? "/tmp/arrastar-cura.png", clip: { x: 1060, y: 40, width: 440, height: 760 } });

// ---------------------------------------------------------------- arrastar até a criatura
async function arrastar(seletor, indice = 0) {
    await p.locator(seletor).nth(indice).scrollIntoViewIfNeeded(); // (o chat cresce a cada frase: o número pode ter saído da área visível)
    const caixa = await p.locator(seletor).nth(indice).boundingBox();
    await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await p.mouse.down();
    await p.mouse.move(caixa.x - 140, caixa.y - 30, { steps: 5 });
    await p.mouse.move(posicao.x, posicao.y, { steps: 10 });
    await p.mouse.up();
    await p.waitForTimeout(450);
}
const ultimaFrase = () => p.locator(".chat-mensagem").last().innerText();

await arrastar(".chat-total.efeito-cura");
ok("7) arrastar o 7 de {cura} até a criatura SOMA ao HP: 10 → 17", (await vida()) === 17, String(await vida()));
ok("8) a frase do chat diz 'Cura 7 (HP 10→17)'", /Token 5: Cura 7 \(HP 10→17\)/.test(await ultimaFrase()), await ultimaFrase());
await arrastar(".chat-total:not(.efeito-cura):not(.efeito-dano)");
ok("9) sem etiqueta o número TIRA vida, como sempre: 17 → 14 ('Dano 3')", (await vida()) === 14 && /Dano 3 \(HP 17→14\)/.test(await ultimaFrase()), `${await vida()} | ${await ultimaFrase()}`);
await arrastar(".chat-total.efeito-dano");
ok("10) {dano} explícito também tira vida: 14 → 10", (await vida()) === 10, String(await vida()));
await arrastar(".chat-cartao-resultado.efeito-cura");
ok("11) no cartão, o número {cura} (8) soma: 10 → 18", (await vida()) === 18, String(await vida()));
await arrastar(".chat-cartao-resultado.efeito-dano");
ok("12) e o número {dano} do mesmo cartão (3) tira: 18 → 15", (await vida()) === 15, String(await vida()));
await arrastar(".chat-total.efeito-cura");
await arrastar(".chat-total.efeito-cura");
ok("13) a cura nunca passa do máximo (20)", (await vida()) === 20, String(await vida()));

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
