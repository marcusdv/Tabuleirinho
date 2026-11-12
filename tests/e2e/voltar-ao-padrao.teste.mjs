// Teste e2e: voltar-ao-padrao. Rodar: npm run test:e2e -- voltar
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p);
const t = (s) => p.locator(s).evaluate((e) => e.value ?? e.textContent);
ok("1) abre com 18 colunas × 10 linhas", (await t("#colunas-valor")) === "18" && (await t("#linhas-valor")) === "10", `${await t("#colunas-valor")}×${await t("#linhas-valor")}`);
ok("2) abre em zoom 100%", (await t("#zoom-valor")) === "100%", await t("#zoom-valor"));
await p.screenshot({ path: `${S}/d1_inicial.png` });
ok("3) botão 'Voltar ao padrão' visível", await p.locator("#voltar-padrao").isVisible());

// bagunça: zoom, colunas, linhas
await p.click("#zoom-mais"); await p.click("#zoom-mais");
for (let i = 0; i < 4; i++) await p.click("#colunas-mais");
for (let i = 0; i < 3; i++) await p.click("#linhas-menos");
ok("4) bagunçado: zoom ≠ 100%, 22×7", (await t("#zoom-valor")) !== "100%" && (await t("#colunas-valor")) === "22" && (await t("#linhas-valor")) === "7", `${await t("#zoom-valor")} ${await t("#colunas-valor")}×${await t("#linhas-valor")}`);
await p.click("#voltar-padrao");
await p.waitForTimeout(600);
ok("5) voltou a zoom 100%", (await t("#zoom-valor")) === "100%", await t("#zoom-valor"));
ok("6) voltou a 18 × 10", (await t("#colunas-valor")) === "18" && (await t("#linhas-valor")) === "10");
await p.screenshot({ path: `${S}/d2_voltou.png` });

// funciona também com o zoom no mínimo e com a calibragem ligada
await p.click("#calibrar-alternar");
for (let i = 0; i < 3; i++) await p.click("#zoom-menos");
await p.click("#voltar-padrao"); await p.waitForTimeout(500);
ok("7) com calibragem ligada e zoom baixo, também volta (100%, 18×10)", (await t("#zoom-valor")) === "100%" && (await t("#colunas-valor")) === "18" && (await t("#linhas-valor")) === "10");
await p.click("#calibragem-concluir");

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
