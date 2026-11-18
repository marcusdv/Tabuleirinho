// Teste e2e: calibragem. Rodar: npm run test:e2e -- calibragem
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar, recolherDados } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p, "", { gaveta: "tabuleiro" });
await recolherDados(p); // (o painel de Dados aberto cobriria a faixa do mapa onde o teste arrasta)
const txt = (s) => p.locator(s).evaluate((e) => e.value ?? e.textContent);
const vis = (s) => p.locator(s).isVisible();
// O botão "Alinhar mapa" mora na janela do tabuleiro, que o Esc fecha: o clique é feito por JavaScript, sem depender de a janela estar aberta (ou de cobrir o mapa).
const alternarCal = () => p.evaluate(() => document.getElementById("calibrar-alternar").click());

ok("1) painel começa escondido", !(await vis("#painel-calibragem")));
await alternarCal();
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
const sx = x0 + 300, sy = y0 + 80; // (a gaveta do Tabuleiro, aberta, cobre até x ≈ 330: começamos à direita dela)
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
ok("7) ao SOLTAR a calibragem já se conclui sozinha (sem clicar em Concluir): o painel fecha e o botão deixa de estar ativo", !(await vis("#painel-calibragem")) && !(await p.locator("#calibrar-alternar").getAttribute("class")).includes("ativo"));
await p.screenshot({ path: `${S}/c2_aplicado.png` });

// Clique simples (sem arrastar) não muda nada (calibragem ligada de novo)
await alternarCal();
await p.mouse.click(600, 400);
ok("8) o 1º clique não altera o tamanho nem conclui a calibragem (espera o 2º)", (await txt("#colunas-valor")) === "30" && (await txt("#linhas-valor")) === "20" && (await vis("#painel-calibragem")));
// Esc cancela só o 1º clique (a ferramenta CONTINUA ligada, para tentar de novo)
await p.keyboard.press("Escape");
ok("8-esc) Esc cancela o 1º clique e a calibragem continua ligada (painel aberto, texto inicial)", (await vis("#painel-calibragem")) && /Clique num canto/.test(await txt("#calibragem-resultado")), await txt("#calibragem-resultado"));
// Botão direito também cancela o 1º clique
await p.mouse.click(600, 400);
await p.mouse.move(700, 480, { steps: 3 });
ok("8-dir0) com o 1º clique feito a prévia aparece", /colunas/.test(await txt("#calibragem-resultado")));
await p.mouse.click(700, 480, { button: "right" });
await p.waitForTimeout(150);
ok("8-dir) o botão direito cancela o 1º clique (ferramenta continua ligada, texto inicial)", (await vis("#painel-calibragem")) && /Clique num canto/.test(await txt("#calibragem-resultado")), await txt("#calibragem-resultado"));
// Esc sem medida em andamento SAI da calibragem (e liga de novo para seguir)
await p.keyboard.press("Escape");
ok("8-esc2) Esc sem medida em andamento sai da calibragem", !(await vis("#painel-calibragem")));
await alternarCal();

// DOIS CLIQUES (pedido do dono, 18/11/2026): o 1º marca um canto, o retângulo acompanha o mouse, o 2º marca o canto oposto e aplica. N=5: o mesmo retângulo do teste 4 dá 30 x 20.
// (o retângulo é recalculado com a câmera de AGORA: o tabuleiro já está em 30 x 20)
const cam2 = await p.evaluate(() => { const c = window.__tabuleirinho.camera; return { x: c.mundo.x, y: c.mundo.y, z: c.zoom, cols: window.__tabuleirinho.estado.colunas, lin: window.__tabuleirinho.estado.linhas }; });
const w2 = (cam2.cols * 64 * cam2.z * 5) / 30, h2 = (cam2.lin * 64 * cam2.z * 5) / 20;
const sx2 = cam2.x + 3 * 64 * cam2.z, sy2 = cam2.y + 1.5 * 64 * cam2.z; // (uma região livre: longe do painel da calibragem, do canto direito e dos painéis da esquerda)
await p.mouse.click(sx2, sy2);
await p.mouse.move(sx2 + w2 / 2, sy2 + h2 / 2, { steps: 4 });
const previa2 = await txt("#calibragem-resultado");
ok("8a) entre os dois cliques a prévia acompanha o mouse (sem apertar nada)", /colunas/.test(previa2) && (await vis("#painel-calibragem")), previa2);
await p.mouse.move(sx2 + w2, sy2 + h2, { steps: 4 });
await p.mouse.click(sx2 + w2, sy2 + h2);
await p.waitForTimeout(300);
ok("8b) o 2º clique aplica 30 colunas × 20 linhas e conclui", (await txt("#colunas-valor")) === "30" && (await txt("#linhas-valor")) === "20" && !(await vis("#painel-calibragem")), `${await txt("#colunas-valor")}×${await txt("#linhas-valor")}`);
await alternarCal(); // (liga de novo para o teste seguinte)

// Limite: N=1 num retângulo grande dá poucas colunas -> usa o mínimo (e a calibragem também se conclui)
await p.fill("#calibragem-casas", "1");
await p.mouse.move(400, 200); await p.mouse.down(); await p.mouse.move(900, 600, { steps: 6 }); await p.mouse.up();
await p.waitForTimeout(300);
ok("9) abaixo do mínimo: usa 5 (o mínimo do tabuleiro) e a calibragem também se conclui", (await txt("#colunas-valor")) === "5" && !(await vis("#painel-calibragem")), await txt("#colunas-valor"));

// "Cancelar" sai da calibragem sem medir
await alternarCal();
ok("10a) reabre", await vis("#painel-calibragem"));
ok("10b) o botão agora se chama 'Cancelar'", (await p.locator("#calibragem-concluir").textContent()) === "Cancelar");
await p.click("#calibragem-concluir");
ok("10) Cancelar esconde o painel sem mudar o tamanho (5 colunas)", !(await vis("#painel-calibragem")) && (await txt("#colunas-valor")) === "5");
ok("11) botão deixa de estar ativo", !(await p.locator("#calibrar-alternar").getAttribute("class")).includes("ativo"));
// Esc também sai
await alternarCal();
ok("12a) reabre", await vis("#painel-calibragem"));
await p.keyboard.press("Escape");
ok("12b) Esc fecha", !(await vis("#painel-calibragem")));

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
