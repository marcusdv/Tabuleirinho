// Teste e2e: calibragem. Rodar: npm run test:e2e -- calibragem
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p);
const txt = (s) => p.locator(s).evaluate((e) => e.value ?? e.textContent);
const vis = (s) => p.locator(s).isVisible();

ok("1) painel começa escondido", !(await vis("#painel-calibragem")));
await p.click("#calibrar-alternar");
ok("2) painel aparece ao ligar", await vis("#painel-calibragem"));
ok("3) botão marcado como ativo", (await p.locator("#calibrar-alternar").getAttribute("class")).includes("ativo"));
ok("3b) painel menciona o outro jeito (contar e aplicar nos botões)", (await txt("#painel-calibragem")).includes("contar o total de quadrados"));

// Tabuleiro 24x12 a zoom 88%, centralizado: origem (24,62) na tela; casa = 56.3 px.
const caixa = await p.evaluate(() => document.querySelector("canvas").getBoundingClientRect().toJSON());
const zoom = Number((await txt("#zoom-valor")).replace("%", "")) / 100;
const colsAtual = Number(await txt("#colunas-valor")), linAtual = Number(await txt("#linhas-valor"));
const L = colsAtual * 64 * zoom, A = linAtual * 64 * zoom;
const x0 = (1400 - L) / 2, y0 = (900 - A) / 2;
// N=5: retângulo com largura = L*5/30 e altura = A*5/20  => esperado 30 x 20
const w = (L * 5) / 30, h = (A * 5) / 20;
const sx = x0 + 100, sy = y0 + 80;
await p.mouse.move(sx, sy);
await p.mouse.down();
await p.mouse.move(sx + w / 2, sy + h / 2, { steps: 5 });
await p.mouse.move(sx + w, sy + h, { steps: 5 });
await p.waitForTimeout(200);
const durante = await txt("#calibragem-resultado");
ok("4) prévia durante o arrasto = 30 colunas × 20 linhas", durante.includes("30 colunas × 20 linhas"), durante);
await p.screenshot({ path: `${S}/c1_arrastando.png` });
await p.mouse.up();
await p.waitForTimeout(400);
ok("5) colunas aplicadas = 30", (await txt("#colunas-valor")) === "30", await txt("#colunas-valor"));
ok("6) linhas aplicadas = 20", (await txt("#linhas-valor")) === "20", await txt("#linhas-valor"));
ok("7) mensagem 'Aplicado'", (await txt("#calibragem-resultado")).startsWith("Aplicado: 30 colunas × 20 linhas"));
await p.screenshot({ path: `${S}/c2_aplicado.png` });

// Clique simples (sem arrastar) não muda nada
await p.mouse.click(600, 400);
ok("8) clique simples não altera o tamanho", (await txt("#colunas-valor")) === "30" && (await txt("#linhas-valor")) === "20");

// Tokens não podem ser pegos durante a calibragem: arrastar sobre um token mede em vez de mover
const tokenAntes = await p.screenshot({ clip: { x: 0, y: 0, width: 1400, height: 900 } });
// Limite: N=1 num retângulo grande dá poucas colunas -> aviso de limite
await p.fill("#calibragem-casas", "1");
await p.mouse.move(300, 200); await p.mouse.down(); await p.mouse.move(900, 600, { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(300);
const lim = await txt("#calibragem-resultado");
ok("9) abaixo do mínimo: usa 5 e avisa o limite", (await txt("#colunas-valor")) === "5" && lim.includes("o tabuleiro vai de 5 a 100"), lim);

// Concluir fecha e devolve o comportamento normal
await p.click("#calibragem-concluir");
ok("10) Concluir esconde o painel", !(await vis("#painel-calibragem")));
ok("11) botão deixa de estar ativo", !(await p.locator("#calibrar-alternar").getAttribute("class")).includes("ativo"));
// Esc também sai
await p.click("#calibrar-alternar");
ok("12a) reabre", await vis("#painel-calibragem"));
await p.keyboard.press("Escape");
ok("12b) Esc fecha", !(await vis("#painel-calibragem")));

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
