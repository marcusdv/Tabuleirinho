// Teste e2e: calibragem-grade-escondida. Rodar: npm run test:e2e -- calibragem
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { PNG } from "pngjs";
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p);

// Região do tabuleiro sem tokens, barra nem painel: x 60-330, y 380-540 (token azul pequeno fica em ~390,370; evitamos)
const REG = { x0: 40, x1: 330, y0: 400, y1: 560 };
async function regiao(arq) {
  const png = PNG.sync.read(await p.screenshot({ path: arq }));
  const v = [];
  for (let y = REG.y0; y < REG.y1; y++) for (let x = REG.x0; x < REG.x1; x++) { const i = (y * png.width + x) * 4; v.push(png.data[i], png.data[i + 1], png.data[i + 2]); }
  return v;
}
// Quantos PIXELS mudaram (soma dos 3 canais > 40): linhas de grade de 1 px quase não mexem na média, mas somam centenas de pixels.
const diff = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 40) n++; return n; };

const normal = await regiao(`${S}/g0_normal.png`);
const normal2 = await regiao(`${S}/g0b_normal.png`);
ok("0) base: duas capturas iguais não diferem (ruído ~0)", diff(normal, normal2) < 20, `${diff(normal, normal2)} px`);
await p.click("#calibrar-alternar");
await p.waitForTimeout(600);
const calibrando = await regiao(`${S}/g1_calibrando.png`);
ok("1) calibrando, a nossa grade some (a região muda)", diff(normal, calibrando) > 500, `${diff(normal, calibrando)} px mudaram`);

// Painel no canto inferior esquerdo, longe do centro
const bx = await p.locator("#painel-calibragem").boundingBox();
const bolsaBox = await p.locator("#bolsa").boundingBox();
ok("2) painel no canto inferior direito, EMPILHADO acima da bolsa", Math.abs(bx.x + bx.width - (1400 - 12)) <= 2 && bx.y + bx.height <= bolsaBox.y + 1 && Math.abs(bolsaBox.y + bolsaBox.height - (800 - 12)) <= 2, `direita=${(bx.x + bx.width).toFixed(0)} base do painel=${(bx.y + bx.height).toFixed(0)} topo da bolsa=${bolsaBox.y.toFixed(0)}`);
ok("3) painel não chega ao centro da tela (esquerda > 1000 px)", bx.x > 1000, `esquerda ${bx.x.toFixed(0)}`);
const barra = await p.locator("#barra").boundingBox(); ok("4) painel fica ABAIXO da barra de ferramentas", bx.y >= barra.y + barra.height + 4, `topo do painel ${bx.y.toFixed(0)}, base da barra ${(barra.y + barra.height).toFixed(0)}`);

// Medir ainda funciona com a grade escondida
const zoom = Number((await p.locator("#zoom-valor").evaluate((e) => e.value ?? e.textContent)).replace("%", "")) / 100;
const colsAtual = Number(await p.locator("#colunas-valor").inputValue()), linAtual = Number(await p.locator("#linhas-valor").inputValue());
const L = colsAtual * 64 * zoom, A = linAtual * 64 * zoom, x0 = (1400 - L) / 2, y0 = (800 - A) / 2;
await p.mouse.move(x0 + 200, y0 + 100); await p.mouse.down(); await p.mouse.move(x0 + 200 + (L * 5) / 30, y0 + 100 + (A * 5) / 20, { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(500);
ok("5) medir ainda funciona (30 × 20)", (await p.locator("#colunas-valor").evaluate((e) => e.value ?? e.textContent)) === "30" && (await p.locator("#linhas-valor").evaluate((e) => e.value ?? e.textContent)) === "20");
await p.screenshot({ path: `${S}/g2_apos_medir.png` });

// Concluir devolve a grade: compara com o estado anterior à calibragem no mesmo tamanho? (tamanho mudou) -> só checa que a região muda de novo
const antesConcluir = await regiao(`${S}/g3_antes_concluir.png`);
await p.click("#calibragem-concluir");
await p.waitForTimeout(600);
const depoisConcluir = await regiao(`${S}/g4_concluido.png`);
ok("6) Concluir faz a grade voltar", diff(antesConcluir, depoisConcluir) > 500, `${diff(antesConcluir, depoisConcluir)} px mudaram`);

// Reabrir e fechar com Esc também restaura
await p.click("#calibrar-alternar"); await p.waitForTimeout(400);
const c2 = await regiao(`${S}/g5.png`);
await p.keyboard.press("Escape"); await p.waitForTimeout(500);
ok("7) Esc também restaura a grade", diff(c2, await regiao(`${S}/g6.png`)) > 500);

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
