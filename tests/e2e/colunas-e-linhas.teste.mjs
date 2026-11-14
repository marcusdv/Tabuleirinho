// Teste e2e: colunas-e-linhas. Rodar: npm run test:e2e -- colunas
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar, recolherDados } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p);
await recolherDados(p); // (o painel de Dados aberto cobriria a faixa do mapa onde o teste arrasta)
const v = (s) => p.inputValue(s);
const par = async () => `${await v("#colunas-valor")}×${await v("#linhas-valor")}`;
async function digitar(sel, texto, tecla = "Enter") { await p.click(sel, { clickCount: 3 }); await p.keyboard.type(texto); if (tecla) await p.keyboard.press(tecla); await p.waitForTimeout(350); }

ok("1) campos mostram 18 e 10", (await par()) === "18×10", await par());
await digitar("#colunas-valor", "30");
ok("2) digitar 30 + Enter nas colunas -> 30", (await par()) === "30×10", await par());
await digitar("#linhas-valor", "20");
ok("3) digitar 20 + Enter nas linhas -> 20", (await par()) === "30×20", await par());
await p.screenshot({ path: `${S}/n1_digitado.png` });

await digitar("#colunas-valor", "3");
ok("4) abaixo do mínimo (3) -> limitado a 5", (await v("#colunas-valor")) === "5", await v("#colunas-valor"));
await digitar("#linhas-valor", "500");
ok("5) acima do máximo (500) -> limitado a 100", (await v("#linhas-valor")) === "100", await v("#linhas-valor"));

await digitar("#colunas-valor", "", "Enter");
ok("6) campo vazio + Enter -> volta ao valor atual (5)", (await v("#colunas-valor")) === "5", await v("#colunas-valor"));

// confirmar saindo do campo (Tab), sem Enter
await digitar("#colunas-valor", "12", "Tab");
ok("7) digitar 12 e sair do campo (Tab) também aplica", (await v("#colunas-valor")) === "12", await v("#colunas-valor"));

// decimal arredonda
await digitar("#linhas-valor", "9.6");
ok("8) 9.6 arredonda para 10", (await v("#linhas-valor")) === "10", await v("#linhas-valor"));

// botões continuam funcionando e atualizam o campo
await p.click("#colunas-mais");
ok("9) botão + atualiza o campo (13)", (await v("#colunas-valor")) === "13", await v("#colunas-valor"));
await p.click("#linhas-menos");
ok("10) botão − atualiza o campo (9)", (await v("#linhas-valor")) === "9", await v("#linhas-valor"));

// o tabuleiro de fato mudou de tamanho: 13 colunas × 9 linhas cabem como 832 x 576 a 100%? só confere via Voltar ao padrão
await p.click("#voltar-padrao"); await p.waitForTimeout(500);
ok("11) Voltar ao padrão atualiza os campos (18×10)", (await par()) === "18×10", await par());

// enquanto digita, mudar o zoom não apaga o texto digitado
await p.click("#colunas-valor", { clickCount: 3 }); await p.keyboard.type("2");
await p.evaluate(() => document.getElementById("zoom-mais").click()); // atualiza a barra com o campo em foco
ok("12) mudar o zoom com o campo em foco não sobrescreve o que está sendo digitado", (await v("#colunas-valor")) === "2", await v("#colunas-valor"));
await p.keyboard.press("Escape"); await p.click("#linhas-valor"); // sai do campo (mantém "2" => aplica -> 5)
await p.waitForTimeout(300);
ok("13) valor digitado (2) ao sair é limitado a 5", (await v("#colunas-valor")) === "5", await v("#colunas-valor"));

// calibragem continua aplicando e atualizando o campo
await p.click("#voltar-padrao"); await p.waitForTimeout(500);
await p.click("#calibrar-alternar");
const zoom = Number((await p.locator("#zoom-valor").textContent()).replace("%", "")) / 100;
const L = 18 * 64 * zoom, A = 10 * 64 * zoom, x0 = (1400 - L) / 2, y0 = (800 - A) / 2;
await p.mouse.move(x0 + 100, y0 + 60); await p.mouse.down(); await p.mouse.move(x0 + 100 + (L * 5) / 30, y0 + 60 + (A * 5) / 20, { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(400);
ok("14) a calibragem atualiza os campos (30×20)", (await par()) === "30×20", await par());

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
