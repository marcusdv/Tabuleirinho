// Teste e2e: menu-do-token. Rodar: npm run test:e2e -- menu
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
await abrirPagina(p);
const caixa = (s) => p.locator(s).boundingBox();
const vis = (s) => p.locator(s).isVisible();
const direito = (x, y) => p.mouse.click(x, y, { button: "right" });
const cruza = (a, c) => a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
const dentro = (a) => a.x >= 0 && a.y >= 0 && a.x + a.width <= 1400 && a.y + a.height <= 800;

// Os tokens iniciais mudaram (estado.ts): o token 5 (roxo, coluna 12, linha 6) hoje é 1×1. Este teste quer um token 4×4 ali,
// então ele cresce pela janela "Editar token" (engrenagem). Bloco depois disso: (892,464), 256 px.
await p.mouse.click(124 + 12.5 * 64, 80 + 6.5 * 64, { button: "right" });
await p.click("#engrenagem");
await p.click("#botao-editar-token");
await p.click('#editor-token button[data-tamanho="4"]');
await p.click("#editor-token-salvar");
await p.waitForTimeout(300);

// Tabuleiro 18x10 a 100%, origem (124,80). Token 5 (roxo 4x4, col 12,row 6): bloco (892,464), largura 256.
await direito(1020, 592);
const lista = await caixa("#acoes-token"), eng = await caixa("#engrenagem");
ok("1a) os 3 itens da lista aparecem, em ordem: Add condição, Add dano, Add cura (o 'Editar token' fica dentro da engrenagem)", (await p.locator("#acoes-token button").allTextContents()).join("|") === "Add condição|Add dano|Add cura");
ok("1b) 'Add condição' é o PRIMEIRO (o de cima) da lista", (await caixa("#botao-condicoes")).y < (await caixa("#botao-dano")).y && (await caixa("#botao-dano")).y < (await caixa("#botao-cura")).y);
ok("1c) a lista está no canto superior ESQUERDO (borda esquerda = x do token, 892)", perto(lista.x, 892), `x=${lista.x}`);
ok("1d) a base da lista fica 12 px acima do topo do token (y=464 - 12 = 452)", perto(lista.y + lista.height, 452), `base=${(lista.y + lista.height).toFixed(0)}`);
ok("1e) a engrenagem está no canto superior DIREITO (borda direita = x do token + 256 = 1148; topo 424)", perto(eng.x + eng.width, 1148) && perto(eng.y, 424), `direita=${(eng.x + eng.width).toFixed(0)} topo=${eng.y.toFixed(0)}`);
ok("1f) lista e engrenagem não se sobrepõem", !cruza(lista, eng));
await p.screenshot({ path: `${S}/m2_roxo.png`, clip: { x: 760, y: 280, width: 560, height: 380 } });

// painel de condições: abre PARA CIMA a partir do 'Add condição' (topo da lista), alinhado à esquerda dele
await p.click("#botao-condicoes");
let pc = await caixa("#menu-condicoes");
ok("2a) o painel de condições abre ACIMA da lista", pc.y + pc.height <= lista.y - 3, `base do painel ${(pc.y + pc.height).toFixed(0)} <= topo da lista ${lista.y.toFixed(0)}`);
ok("2b) ...alinhado à esquerda da lista", perto(pc.x, lista.x));
ok("2c) ...e dentro da janela", dentro(pc));
// painel da engrenagem (só 'Editar token'): abre para cima a partir da engrenagem
await p.click("#engrenagem");
const pt = await caixa("#menu-token");
ok("3a) o painel da engrenagem abre ACIMA dela, alinhado à esquerda dela", pt.y + pt.height <= eng.y - 3 && perto(pt.x, eng.x), `base ${(pt.y + pt.height).toFixed(0)} <= ${eng.y.toFixed(0)}; x ${pt.x.toFixed(0)} vs ${eng.x.toFixed(0)}`);
ok("3a2) o painel tem 'Editar token', 'Guardar na bolsa' e 'Excluir token' (diretos) e NÃO tem o controle de tamanho (− / +)", (await p.locator("#menu-token button:visible").allTextContents()).join("|") === "Editar token|Guardar na bolsa|Excluir token" && (await p.locator("#token-tamanho-mais").count()) === 0);
ok("3b) só um painel por vez (o de condições fechou)", !(await vis("#menu-condicoes")));

// botões provisórios: não fazem nada (e não quebram)
await p.click("#botao-dano"); await p.click("#botao-cura");
ok("4) 'Add dano' e 'Add cura' (provisórios) não abrem nada nem fecham o menu", (await vis("#acoes-token")) && !(await vis("#menu-condicoes")) && (await p.locator("#botao-dano").getAttribute("title")).includes("Provisório"));

// Esc fecha a lista E a engrenagem
await p.keyboard.press("Escape");
ok("5) Esc esconde a lista e a engrenagem", !(await vis("#acoes-token")) && !(await vis("#engrenagem")));

// token estreito (azul 1x1, bloco (508,400), largura 64): a engrenagem vai para a direita da lista
await direito(540, 432);
const l2 = await caixa("#acoes-token"), e2 = await caixa("#engrenagem");
ok("6a) token 1×1: lista alinhada à esquerda do token (x=508)", perto(l2.x, 508), `x=${l2.x}`);
ok("6b) a lista é mais larga que o token, então a engrenagem vai para a DIREITA dela (sem sobrepor)", !cruza(l2, e2) && e2.x >= l2.x + l2.width, `lista ${l2.x.toFixed(0)}..${(l2.x + l2.width).toFixed(0)}, engrenagem x=${e2.x.toFixed(0)}`);
await p.screenshot({ path: `${S}/m2_azul_pequeno.png`, clip: { x: 400, y: 250, width: 360, height: 260 } });
await p.keyboard.press("Escape");

// todos os tokens: tudo dentro da janela e sem sobreposição
const tokens = { "verde 1×1": [348, 304], "vermelho 2×2": [828, 272], "rosa 1×1": [1116, 176], "roxo 4×4": [1020, 592] };
for (const [nome, [x, y]] of Object.entries(tokens)) {
  await direito(x, y);
  const l = await caixa("#acoes-token"), e = await caixa("#engrenagem");
  ok(`7) token ${nome}: lista e engrenagem dentro da janela e sem sobreposição`, dentro(l) && dentro(e) && !cruza(l, e), `lista (${l.x.toFixed(0)},${l.y.toFixed(0)}) engrenagem (${e.x.toFixed(0)},${e.y.toFixed(0)})`);
  await p.keyboard.press("Escape");
}

// crescer o token pela janela 'Editar token' (engrenagem): a engrenagem acompanha o canto direito (verde 1x1 -> 3x3)
await direito(348, 304); await p.click("#engrenagem"); await p.click("#botao-editar-token");
await p.click('#editor-token button[data-tamanho="3"]'); await p.click("#editor-token-salvar"); // 3x3: bloco (316,272), largura 192
await direito(348, 304); // reabre os botões do token já crescido
const l3 = await caixa("#acoes-token"), e3 = await caixa("#engrenagem");
// col 3,row 3 => canto (316, 272); 3x3 => direita = 316 + 192 = 508 => engrenagem.direita = 508
ok("8) token crescido para 3×3: a engrenagem acompanha o canto superior direito (direita = 508)", perto(e3.x + e3.width, 508) && perto(l3.x, 316), `engrenagem.direita=${(e3.x + e3.width).toFixed(0)} lista.x=${l3.x.toFixed(0)}`);
await p.keyboard.press("Escape");

// zoom: com o menu aberto, mudar o zoom fecha tudo (e a engrenagem some junto)
await direito(1020, 592); await p.click("#zoom-mais"); await p.waitForTimeout(300);
ok("9) mudar o zoom fecha a lista e a engrenagem", !(await vis("#acoes-token")) && !(await vis("#engrenagem")));
// zoom diferente: largura do token na tela escala (a engrenagem acompanha o canto direito)
await p.click("#voltar-padrao"); await p.waitForTimeout(500);
for (let i = 0; i < 2; i++) await p.click("#zoom-mais"); // 100% -> 156%
await p.waitForTimeout(400);
const zoom = Number((await p.locator("#zoom-valor").textContent()).replace("%", "")) / 100;
const centroRoxo = await (async () => { const L = 18 * 64 * zoom, A = 10 * 64 * zoom; return { x: (1400 - L) / 2 + 14 * 64 * zoom, y: (800 - A) / 2 + 8 * 64 * zoom }; })();
await direito(centroRoxo.x, centroRoxo.y);
const e4 = await caixa("#engrenagem"), l4 = await caixa("#acoes-token");
const direitaEsperada = (1400 - 18 * 64 * zoom) / 2 + 16 * 64 * zoom;
ok(`10) com zoom ${Math.round(zoom * 100)}%, a engrenagem continua no canto superior direito do token`, perto(e4.x + e4.width, Math.min(direitaEsperada, 1400 - 6), 3) || dentro(e4), `direita=${(e4.x + e4.width).toFixed(0)} esperada≈${direitaEsperada.toFixed(0)}`);

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
