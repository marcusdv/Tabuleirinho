// Teste e2e: CTRL+Z e CTRL+Y nos DESENHOS (modo LOCAL). Rodar: npm run test:e2e -- desenho-desfazer   (precisa do servidor: npm run dev)
//
// Pedido do dono (17/11/2026): o desenho ganha histórico próprio. Ctrl+Z desfaz a última ação de desenho (um traço, uma forma, ou uma apagada inteira da borracha) e Ctrl+Y (ou Ctrl+Shift+Z) refaz;
// uma ação nova joga fora o que dava para refazer; dentro de um campo de texto o Ctrl+Z é do texto e não mexe no desenho.
import { abrirPagina, escolherAba, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
p.on("dialog", (d) => d.accept()); // (o "Apagar tudo" já NÃO pergunta; fica por garantia)
await abrirPagina(p, "", { gaveta: "desenho" });
await recolherDados(p);

const total = () => p.evaluate(() => window.__tabuleirinho.estado.desenhos.length);
// (tabuleiro 18×10 a 100%, origem 124,80; as colunas 0 a 3 ficam atrás da gaveta do Desenho e as da direita atrás da bolsa: usa só as do meio, 5 a 13)
const casa = (c, r) => ({ x: 124 + (c + 0.5) * 64, y: 80 + (r + 0.5) * 64 });
async function arrastar(de, para, passos = 8) {
    await p.mouse.move(de.x, de.y); await p.waitForTimeout(50); await p.mouse.down();
    for (let i = 1; i <= passos; i++) { await p.mouse.move(de.x + ((para.x - de.x) * i) / passos, de.y + ((para.y - de.y) * i) / passos); await p.waitForTimeout(20); }
    await p.mouse.up(); await p.waitForTimeout(200);
}
const ferr = (nome) => p.click(`button[data-ferramenta="${nome}"]`);

await ferr("lapis");
await arrastar(casa(6, 2), casa(9, 3));
await ferr("retangulo");
await arrastar(casa(10, 2), casa(13, 5));
ok("1a) dois desenhos (um traço e um retângulo)", (await total()) === 2);

await p.keyboard.press("Control+z");
ok("1b) Ctrl+Z desfaz o ÚLTIMO (o retângulo): sobra o traço", (await total()) === 1 && (await p.evaluate(() => window.__tabuleirinho.estado.desenhos[0].tipo)) === "livre");
await p.keyboard.press("Control+z");
ok("1c) outro Ctrl+Z desfaz o traço: nenhum desenho", (await total()) === 0);
await p.keyboard.press("Control+z");
ok("1d) Ctrl+Z sem nada para desfazer não faz nada (e não dá erro)", (await total()) === 0);
await p.keyboard.press("Control+y");
ok("1e) Ctrl+Y refaz o traço", (await total()) === 1 && (await p.evaluate(() => window.__tabuleirinho.estado.desenhos[0].tipo)) === "livre");
await p.keyboard.press("Control+Shift+z");
ok("1f) Ctrl+Shift+Z também refaz (o retângulo)", (await total()) === 2);

// a borracha: tudo o que ela apaga num gesto é UMA ação
await ferr("borracha");
await arrastar(casa(5, 3), casa(13, 3), 40); // passa por cima dos dois desenhos
ok("2a) a borracha apagou os dois num gesto só", (await total()) === 0);
await p.keyboard.press("Control+z");
ok("2b) UM Ctrl+Z devolve os DOIS desenhos apagados pelo mesmo gesto da borracha", (await total()) === 2);
await p.keyboard.press("Control+y");
ok("2c) Ctrl+Y apaga de novo", (await total()) === 0);
await p.keyboard.press("Control+z");

// os desenhos que voltaram do "apagar" continuam desfazíveis (o histórico acompanha os ids novos)
await p.keyboard.press("Control+z");
ok("3a) depois de desfazer o 'apagar', o Ctrl+Z seguinte desfaz a CRIAÇÃO de um dos desenhos que voltaram", (await total()) === 1, String(await total()));
await ferr("lapis");
await arrastar(casa(6, 7), casa(9, 8));
await p.keyboard.press("Control+y");
ok("3b) desenhar algo novo apaga o 'refazer' (o Ctrl+Y não traz de volta o que foi desfeito antes)", (await total()) === 2, String(await total()));

// dentro de um campo de texto, o Ctrl+Z é do texto
await escolherAba(p, "chat"); // (o campo de texto do chat só aparece na aba Chat)
await p.click("#chat-texto");
const antes = await total();
await p.keyboard.type("oi");
await p.keyboard.press("Control+z");
ok("4) dentro de um campo de texto o Ctrl+Z NÃO mexe no desenho", (await total()) === antes);

// "Apagar tudo" também se desfaz
await p.click("#desenho-apagar-tudo");
ok("5a) 'Apagar tudo' apaga todos", (await total()) === 0);
await ferr("mover"); // (com o lápis, o clique desenharia um pontinho)
await p.mouse.click(700, 400); // (tira o foco de qualquer campo)
await p.keyboard.press("Control+z");
ok("5b) e UM Ctrl+Z devolve todos", (await total()) === antes);

await nav.close();
process.exitCode = terminar(erros); // (o executor lê o código de saída)
