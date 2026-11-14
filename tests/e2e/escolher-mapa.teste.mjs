// Teste e2e: escolher-mapa. Rodar: npm run test:e2e -- escolher
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { PNG } from "pngjs";
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar, recolherDados } from "./ajuda.mjs";
const P = PASTA_MAPAS.replace(/\/$/, "");
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
const avisos = []; p.on("dialog", async (d) => { avisos.push(d.message()); await d.accept(); });
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p);
await recolherDados(p); // (o painel de Dados aberto cobriria a faixa do mapa onde o teste arrasta)

// Cor média de uma região do tabuleiro (fora da barra e dos tokens)
async function cor() {
  const png = PNG.sync.read(await p.screenshot());
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = 100; y < 600; y += 4) for (let x = 200; x < 1000; x += 4) { const i = (y * png.width + x) * 4; r += png.data[i]; g += png.data[i + 1]; bl += png.data[i + 2]; n++; }
  return [r / n, g / n, bl / n].map(Math.round);
}
const dif = (a, c) => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]);

ok("1) botão 'Escolher mapa' existe na barra", await p.locator("#mapa-escolher").isVisible());
const antes = await cor();

// 2) escolher uma imagem pelo input (o botão abre o seletor; aqui entregamos o arquivo direto)
const [seletor] = await Promise.all([p.waitForEvent("filechooser"), p.click("#mapa-escolher")]);
ok("2) clicar no botão abre o seletor de arquivos", !!seletor);
await seletor.setFiles(`${P}/ossos_de_dragao.png`);
await p.waitForTimeout(3500);
const depois = await cor();
ok("3) o mapa mudou na tela", dif(antes, depois) > 40, `antes ${antes} depois ${depois}`);
await p.screenshot({ path: `${S}/e1_mapa_novo.png` });
ok("4) sem aviso de erro", avisos.length === 0, avisos.join(" | "));

// 5) mapa esticado acompanha colunas/linhas (grade continua funcionando)
await p.click("#colunas-menos"); await p.waitForTimeout(300);
ok("5) colunas continuam funcionando (17)", (await p.locator("#colunas-valor").evaluate((e) => e.value ?? e.textContent)) === "17");

// 6) escolher outro, e o MESMO de novo (input é limpo)
const [s2] = await Promise.all([p.waitForEvent("filechooser"), p.click("#mapa-escolher")]);
await s2.setFiles(`${P}/cachoeira.png`);
await p.waitForTimeout(4500);
const c3 = await cor();
ok("6) trocar de novo muda o mapa", dif(depois, c3) > 40, `${depois} -> ${c3}`);
const [s3] = await Promise.all([p.waitForEvent("filechooser"), p.click("#mapa-escolher")]);
await s3.setFiles(`${P}/cachoeira.png`);
await p.waitForTimeout(3500);
ok("7) escolher o mesmo arquivo de novo não dá erro", avisos.length === 0, avisos.join(" | "));

// 8) arquivo que não é imagem
await p.evaluate(() => { const i = document.getElementById("mapa-arquivo"); const dt = new DataTransfer(); dt.items.add(new File(["oi"], "texto.txt", { type: "text/plain" })); i.files = dt.files; i.dispatchEvent(new Event("change")); });
await p.waitForTimeout(800);
ok("8) arquivo que não é imagem: avisa e mantém o mapa", avisos.length === 1 && avisos[0].includes("não é uma imagem") && dif(c3, await cor()) < 15, avisos.join(" | "));

// 9) calibragem funciona depois de trocar o mapa
await p.click("#calibrar-alternar");
const zoom = Number((await p.locator("#zoom-valor").evaluate((e) => e.value ?? e.textContent)).replace("%", "")) / 100;
const cols = Number(await p.locator("#colunas-valor").evaluate((e) => e.value ?? e.textContent)), lin = Number(await p.locator("#linhas-valor").evaluate((e) => e.value ?? e.textContent));
const L = cols * 64 * zoom, A = lin * 64 * zoom, x0 = (1400 - L) / 2, y0 = (800 - A) / 2;
const w = (L * 5) / 20, h = (A * 5) / 10;
await p.mouse.move(x0 + 60, y0 + 40); await p.mouse.down(); await p.mouse.move(x0 + 60 + w, y0 + 40 + h, { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(400);
ok("9) Calibrar após trocar de mapa dá 20 × 10", (await p.locator("#colunas-valor").evaluate((e) => e.value ?? e.textContent)) === "20" && (await p.locator("#linhas-valor").evaluate((e) => e.value ?? e.textContent)) === "10");

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
