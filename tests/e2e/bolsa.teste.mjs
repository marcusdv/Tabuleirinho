// Teste e2e: bolsa. Rodar: npm run test:e2e -- bolsa
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { PNG } from "pngjs";
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 3) => Math.abs(a - c) <= tol;
await abrirPagina(p);

const VERDE = [0x2e, 0xcc, 0x71], ROXO = [0x9b, 0x59, 0xb6], AZUL = [0x34, 0x98, 0xdb], XVERM = [0xe5, 0x39, 0x35];
// Centro/tamanho de uma cor na região do tabuleiro (x < 1160, longe da barra). A bolsa (268 px) começa em x = 1120 e CRESCE PARA CIMA
// ao receber fichas, então o disco de uma ficha pode cair nesta região: para o token VERDE (que está em x ~ 324..371) a região
// termina antes da bolsa (REGIAO_VERDE); o roxo 4×4 vai até x = 1148 e usa a região padrão (nesses passos a bolsa está vazia).
const REGIAO_VERDE = { x0: 0, x1: 1100, y0: 0, y1: 800 };
async function achar(cor, arq = `${S}/b_tmp.png`, tol = 8, regiao = { x0: 0, x1: 1160, y0: 0, y1: 800 }) {
  const png = PNG.sync.read(await p.screenshot({ path: arq }));
  let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1;
  for (let y = regiao.y0; y < regiao.y1; y++) for (let x = regiao.x0; x < regiao.x1; x++) {
    const i = (y * png.width + x) * 4;
    if (Math.abs(png.data[i] - cor[0]) < tol && Math.abs(png.data[i + 1] - cor[1]) < tol && Math.abs(png.data[i + 2] - cor[2]) < tol) { n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  }
  return n ? { n, cx: sx / n, cy: sy / n, largura: x1 - x0 + 1 } : { n: 0 };
}
const centro = (bx) => ({ x: bx.x + bx.width / 2, y: bx.y + bx.height / 2 });
async function arrastar(de, para, { soltar = true } = {}) {
  await p.mouse.move(de.x, de.y); await p.waitForTimeout(80); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(de.x + ((para.x - de.x) * i) / 10, de.y + ((para.y - de.y) * i) / 10); await p.waitForTimeout(30); }
  if (soltar) { await p.mouse.up(); await p.waitForTimeout(400); }
}
const texto = (s) => p.locator(s).textContent();
const fichas = () => p.locator(".ficha").count();

// Os tokens iniciais mudaram (estado.ts): o token 5 (roxo, coluna 12, linha 6) hoje é 1×1. Este teste quer um token 4×4 ali,
// então ele cresce pela janela "Editar token" (engrenagem). Bloco depois disso: (892,464), 256 px.
await p.mouse.click(124 + 12.5 * 64, 80 + 6.5 * 64, { button: "right" });
await p.click("#engrenagem");
await p.click("#botao-editar-token");
await p.click('#editor-token button[data-tamanho="4"]');
await p.click("#editor-token-salvar");
await p.waitForTimeout(300);

// ---- 1) a bolsa existe, no canto inferior direito
const bolsa = await p.locator("#bolsa").boundingBox();
ok("1a) bolsa visível no canto inferior direito", perto(bolsa.x + bolsa.width, 1388, 2) && perto(bolsa.y + bolsa.height, 788, 2), `${(bolsa.x + bolsa.width).toFixed(0)}, ${(bolsa.y + bolsa.height).toFixed(0)}`);
ok("1b) começa vazia, com a dica", (await fichas()) === 0 && (await p.locator("#bolsa-vazia").isVisible()));
await p.screenshot({ path: `${S}/b0_vazia.png` });
const alvo = centro(bolsa);

// ---- 2) guardar o token verde (1x1, centro em (348,304))
const v0 = await achar(VERDE, undefined, 8, REGIAO_VERDE);
ok("2a) token verde está no mapa em (348,304)", perto(v0.cx, 348, 3) && perto(v0.cy, 304, 3), `(${v0.cx?.toFixed(0)}, ${v0.cy?.toFixed(0)})`);
await arrastar({ x: v0.cx, y: v0.cy }, alvo, { soltar: false });
ok("2b) a bolsa se destaca enquanto o token está sobre ela", (await p.locator("#bolsa").getAttribute("class")).includes("alvo"));
await p.screenshot({ path: `${S}/b1_sobre_bolsa.png` });
await p.mouse.up(); await p.waitForTimeout(400);
ok("2c) o token sumiu do mapa", (await achar(VERDE, undefined, 8, REGIAO_VERDE)).n === 0);
ok("2d) a bolsa mostra 1 fichinha (1×1) e (1)", (await fichas()) === 1 && (await texto("#bolsa-itens")).includes("1×1") && (await texto("#bolsa-contagem")) === "(1)", await texto("#bolsa-contagem"));
ok("2e) o destaque da bolsa apagou", !(await p.locator("#bolsa").getAttribute("class") || "").includes("alvo"));
ok("2f) a dica 'vazia' sumiu", !(await p.locator("#bolsa-vazia").isVisible()));
await p.screenshot({ path: `${S}/b2_guardado.png` });

// ---- 3) guardar também o roxo (4x4, centro (1020,592))
const r0 = await achar(ROXO);
await arrastar({ x: r0.cx, y: r0.cy }, alvo);
ok("3) segundo token guardado: 2 fichinhas, contagem (2), uma 4×4", (await fichas()) === 2 && (await texto("#bolsa-contagem")) === "(2)" && (await texto("#bolsa-itens")).includes("4×4"));

// ---- 4) colocar o verde no mapa: solta no centro da casa col 3, row 3 => centro (348,304) (longe do roxo, que voltará à posição original)
const fv = p.locator(".ficha", { hasText: "1×1" });
await arrastar(centro(await fv.boundingBox()), { x: 348, y: 304 });
const v1 = await achar(VERDE, undefined, 8, REGIAO_VERDE);
ok("4a) verde voltou ao mapa, encaixado em (348,304)", perto(v1.cx, 348, 3) && perto(v1.cy, 304, 3), `(${v1.cx?.toFixed(0)}, ${v1.cy?.toFixed(0)})`);
ok("4b) a bolsa ficou só com o roxo (1)", (await fichas()) === 1 && (await texto("#bolsa-contagem")) === "(1)");

// ---- 5) colocar o roxo (4x4) soltando num vértice: centro (1020,592) => col 12, row 6 (a posição original)
const fr = p.locator(".ficha", { hasText: "4×4" });
await arrastar(centro(await fr.boundingBox()), { x: 1020, y: 592 });
const r1 = await achar(ROXO);
ok("5a) roxo 4×4 volta encaixado onde estava (compara com a medição inicial: o chat cobre a parte de baixo dele)", perto(r1.cx, r0.cx, 3) && perto(r1.cy, r0.cy, 3), `(${r1.cx?.toFixed(0)}, ${r1.cy?.toFixed(0)})`);
ok("5b) mantém o tamanho (244 px) e a bolsa fica vazia", perto(r1.largura, 244, 6) && (await fichas()) === 0, `largura ${r1.largura}`);
await p.screenshot({ path: `${S}/b3_colocado.png` });

// ---- 6) soltar a fichinha de volta na bolsa: continua guardado
await arrastar({ x: v1.cx, y: v1.cy }, alvo); // guarda de novo o verde
const fv2 = p.locator(".ficha", { hasText: "1×1" });
await arrastar(centro(await fv2.boundingBox()), alvo); // pega e solta na bolsa
ok("6) soltar a fichinha de volta na bolsa: continua guardado (1), fora do mapa", (await fichas()) === 1 && (await achar(VERDE, undefined, 8, REGIAO_VERDE)).n === 0);
await arrastar(centro(await p.locator(".ficha").first().boundingBox()), { x: 348, y: 304 }); // devolve ao mapa

// ---- 7) condições sobrevivem a guardar e colocar (Morto = X vermelho no token azul 1x1, centro (540,432))
await p.mouse.click(540, 432, { button: "right" });
await p.click("#botao-condicoes");
await p.click('.condicao[aria-label="Morto"]');
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
const x0 = await achar(XVERM, `${S}/b4_x.png`, 8, { x0: 480, x1: 600, y0: 372, y1: 492 });
ok("7a) o token azul está com o X vermelho (Morto)", x0.n > 40, `${x0.n} px`);
await arrastar({ x: 540, y: 432 }, alvo);
await arrastar(centro(await p.locator(".ficha").first().boundingBox()), { x: 800, y: 480 }); // casa col 10,row 6? só precisa reaparecer
const x1 = await achar(XVERM, `${S}/b5_x.png`, 8, { x0: 740, x1: 860, y0: 420, y1: 540 });
ok("7b) depois de guardar e colocar, o X (condição) continua no token", x1.n > 40, `${x1.n} px`);

// ---- 8) com a calibragem ligada, a bolsa não solta tokens, e o painel fica ACIMA da bolsa
await arrastar({ x: 800, y: 480 }, alvo); // guarda o azul
ok("8a) azul guardado de novo (1 fichinha)", (await fichas()) === 1);
await p.click("#calibrar-alternar"); await p.waitForTimeout(300);
const pc = await p.locator("#painel-calibragem").boundingBox(), bo = await p.locator("#bolsa").boundingBox();
ok("8b) painel da calibragem fica ACIMA da bolsa, sem sobreposição", pc.y + pc.height <= bo.y + 1 && perto(bo.y + bo.height, 788, 2), `base do painel ${(pc.y + pc.height).toFixed(0)} <= topo da bolsa ${bo.y.toFixed(0)}`);
await p.screenshot({ path: `${S}/b6_calibrando.png` });
await arrastar(centro(await p.locator(".ficha").first().boundingBox()), { x: 700, y: 300 });
ok("8c) calibrando, arrastar da bolsa não coloca o token", (await fichas()) === 1);
await p.click("#calibragem-concluir"); await p.waitForTimeout(300);

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
