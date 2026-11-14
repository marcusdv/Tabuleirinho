// Teste e2e: desenho. Rodar: npm run test:e2e -- desenho
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { PNG } from "pngjs";
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar, recolherDados } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
const dialogos = []; p.on("dialog", async (d) => { dialogos.push(d.message()); await d.accept(); });
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 3) => Math.abs(a - c) <= tol;
await abrirPagina(p);
await recolherDados(p); // (o painel de Dados aberto cobriria a faixa do mapa onde o teste arrasta)

const MAGENTA = [255, 0, 255], VERDE = [0, 255, 0], AMARELO = [0xff, 0xd5, 0x4f], VERMELHO = [0xe7, 0x4c, 0x3c], ROXO = [0x9b, 0x59, 0xb6];
// Conta pixels de uma cor numa região (opcional) e devolve a caixa que os envolve.
async function cor(c, reg = { x0: 170, x1: 1225, y0: 0, y1: 800 }, arq = `${S}/d_tmp.png`, tol = 12) {
  const png = PNG.sync.read(await p.screenshot({ path: arq }));
  let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = reg.y0; y < reg.y1; y++) for (let x = reg.x0; x < reg.x1; x++) {
    const i = (y * png.width + x) * 4;
    if (Math.abs(png.data[i] - c[0]) < tol && Math.abs(png.data[i + 1] - c[1]) < tol && Math.abs(png.data[i + 2] - c[2]) < tol) { n++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return n ? { n, cx: sx / n, cy: sy / n, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { n: 0 };
}
async function arrastar(de, para, botao = "left", passos = 10) {
  await p.mouse.move(de.x, de.y); await p.waitForTimeout(60); await p.mouse.down({ button: botao });
  for (let i = 1; i <= passos; i++) { await p.mouse.move(de.x + ((para.x - de.x) * i) / passos, de.y + ((para.y - de.y) * i) / passos); await p.waitForTimeout(25); }
  await p.mouse.up({ button: botao }); await p.waitForTimeout(250);
}
const ferr = (nome) => p.click(`button[data-ferramenta="${nome}"]`);
const cls = async (nome) => (await p.locator(`button[data-ferramenta="${nome}"]`).getAttribute("class")) || "";
const fill = (hex) => p.fill("#desenho-cor", hex);
const dist = () => p.locator("#regua-resultado").evaluate((e) => (e.hidden ? null : e.textContent));
// Centro de uma casa (col,row) na tela, com o tabuleiro 18x10 em zoom 100% (origem 124,80)
const casa = (c, r) => ({ x: 124 + (c + 0.5) * 64, y: 80 + (r + 0.5) * 64 });

// ================= A) painel
ok("A1) painel de desenho visível à esquerda", await p.locator("#ferramentas-desenho").isVisible() && perto((await p.locator("#ferramentas-desenho").boundingBox()).x, 12, 2));
ok("A2) 7 ferramentas e 'Mover' ativa", (await p.locator("button[data-ferramenta]").count()) === 7 && (await cls("mover")).includes("ativo"));
ok("A3) 8 cores prontas", (await p.locator("#desenho-amostras .amostra").count()) === 8);
ok("A4) 'Apagar tudo' desativado sem pinturas", await p.locator("#desenho-apagar-tudo").isDisabled());
await p.screenshot({ path: `${S}/d0_painel.png` });

// ================= B) régua
await ferr("regua");
ok("B1) Régua ficou ativa e Mover não", (await cls("regua")).includes("ativo") && !(await cls("mover")).includes("ativo"));
await arrastar(casa(2, 2), casa(6, 5)); // dc=4, dr=3 -> 4 casas
ok("B2) (2,2)->(6,5): 4 □ = 6 m", (await dist()) === "Distância: 4 □ = 6 m", await dist());
const linha = await cor(AMARELO, { x0: 170, x1: 1225, y0: 0, y1: 560 }, `${S}/d1_regua.png`);
ok("B3) a linha amarela da régua aparece (e continua após soltar)", linha.n > 200 && linha.x0 < 300 && linha.x1 > 520, `${linha.n} px, x ${linha.x0}..${linha.x1}`);
await arrastar(casa(2, 2), casa(3, 2));
ok("B4) uma casa: '1 □ = 1,5 m' (vírgula decimal)", (await dist()) === "Distância: 1 □ = 1,5 m", await dist());
await arrastar(casa(1, 0), casa(8, 3)); // diagonal conta 1: max(7,3)=7 (a casa 0,0 fica atrás do painel de desenho)
ok("B5) (1,0)->(8,3): 7 □ = 10,5 m (diagonal = 1 casa)", (await dist()) === "Distância: 7 □ = 10,5 m", await dist());
await arrastar(casa(4, 4), casa(4, 4), "left", 2);
ok("B6) mesma casa: 0 □ = 0 m", (await dist()) === "Distância: 0 □ = 0 m", await dist());
await arrastar(casa(1, 1), casa(5, 1));
await p.click("#zoom-mais"); await p.waitForTimeout(300); // zoom com a régua visível: não quebra
ok("B7) mudar o zoom com a régua na tela mantém a medida", (await dist()) === "Distância: 4 □ = 6 m");
await p.click("#voltar-padrao"); await p.waitForTimeout(500);
await ferr("mover");
const amarelosB8 = (await cor(AMARELO, { x0: 170, x1: 1040, y0: 60, y1: 430 }, `${S}/d1b.png`)).n; // (só o mapa livre: a bolsa do canto e a barra têm detalhes dourados)
ok("B8) voltar a 'Mover' apaga a medida (painel e linha)", (await dist()) === null && amarelosB8 < 20, `dist=${await dist()} amarelos=${amarelosB8}`);

// ================= C) lápis e cor
await ferr("lapis"); await fill("#ff00ff");
await arrastar({ x: 400, y: 300 }, { x: 600, y: 300 });
const tr = await cor(MAGENTA, undefined, `${S}/d2_lapis.png`);
ok("C1) o lápis desenha um traço magenta de ~200 px", tr.n > 500 && tr.w >= 198 && tr.w <= 212, `${tr.n} px, largura ${tr.w}`);
ok("C2) 'Apagar tudo' passou a valer", !(await p.locator("#desenho-apagar-tudo").isDisabled()));
await fill("#00ff00");
await arrastar({ x: 400, y: 360 }, { x: 600, y: 360 });
const verde = await cor(VERDE);
ok("C3) trocar a cor: o novo traço sai verde, e o magenta não mudou", verde.n > 500 && (await cor(MAGENTA)).n === tr.n, `verde ${verde.n} px, magenta ${(await cor(MAGENTA)).n}`);
// clique sem arrastar = pontinho
await p.mouse.click(700, 360); await p.waitForTimeout(200);
ok("C4) um clique com o lápis faz um pontinho", (await cor(VERDE, { x0: 690, x1: 712, y0: 350, y1: 372 })).n > 8);

// ================= D) camadas: o desenho fica POR BAIXO dos tokens
await fill("#ff00ff");
await arrastar({ x: 300, y: 304 }, { x: 400, y: 304 }); // atravessa o token verde 1x1 (centro 348,304)
const meio = PNG.sync.read(await p.screenshot());
const i = (304 * meio.width + 348) * 4;
ok("D1) o token verde fica POR CIMA do traço (pixel central continua verde)", Math.abs(meio.data[i] - 46) < 12 && Math.abs(meio.data[i + 1] - 204) < 12 && Math.abs(meio.data[i + 2] - 113) < 12, `rgb ${meio.data[i]},${meio.data[i + 1]},${meio.data[i + 2]}`);

// ================= E) borracha
await ferr("borracha");
await arrastar({ x: 500, y: 280 }, { x: 500, y: 330 }); // cruza o traço magenta em y=300 (x=500)
ok("E1) a borracha apagou o traço magenta inteiro que tocou", (await cor(MAGENTA, { x0: 440, x1: 620, y0: 285, y1: 315 })).n === 0);
ok("E2) ...e não apagou o verde (longe dela)", (await cor(VERDE, { x0: 380, x1: 620, y0: 345, y1: 375 })).n > 500);
await p.screenshot({ path: `${S}/d3_borracha.png` });

// ================= F) formas: elipse e retângulo pela CAIXA, só contorno (cor magenta)
async function pixel(x, y) { const png = PNG.sync.read(await p.screenshot()); const k = (y * png.width + x) * 4; return [png.data[k], png.data[k + 1], png.data[k + 2]]; }
const igual = (a, c, tol = 4) => Math.abs(a[0] - c[0]) <= tol && Math.abs(a[1] - c[1]) <= tol && Math.abs(a[2] - c[2]) <= tol;

await ferr("elipse");
const miolo0 = await pixel(450, 135); // o miolo da futura elipse, antes de desenhar
await arrastar({ x: 400, y: 110 }, { x: 500, y: 160 }); // caixa 100 x 50 (área sem tokens: eles ficam POR CIMA dos desenhos)
const elip = await cor(MAGENTA, { x0: 380, x1: 520, y0: 95, y1: 175 }, `${S}/d4_elipse.png`);
ok("F1) elipse: caixa 100 × 50 -> ~104 × 54 (largura e altura independentes)", perto(elip.w, 104, 6) && perto(elip.h, 54, 6), `${elip.w} × ${elip.h}`);
ok("F1b) é só CONTORNO: o miolo da elipse não mudou", igual(await pixel(450, 135), miolo0), `${miolo0} -> ${await pixel(450, 135)}`);
ok("F1c) ...e o contorno está nas pontas da caixa (esquerda em x=400, topo em y=110)", (await cor(MAGENTA, { x0: 396, x1: 406, y0: 130, y1: 140 })).n > 10 && (await cor(MAGENTA, { x0: 445, x1: 455, y0: 106, y1: 116 })).n > 10);

await ferr("retangulo");
const miolo1 = await pixel(610, 140);
await arrastar({ x: 560, y: 110 }, { x: 660, y: 170 }); // caixa 100 x 60 (não é quadrado)
const ret = await cor(MAGENTA, { x0: 540, x1: 680, y0: 95, y1: 190 }, `${S}/d5_retangulo.png`);
ok("F2) retângulo: caixa 100 × 60 -> ~104 × 64 (NÃO vira quadrado)", perto(ret.w, 104, 6) && perto(ret.h, 64, 6), `${ret.w} × ${ret.h}`);
ok("F2b) só contorno: o miolo do retângulo não mudou", igual(await pixel(610, 140), miolo1));
await arrastar({ x: 900, y: 200 }, { x: 850, y: 150 }); // arrastando para cima e para a esquerda: caixa x 850..900, y 150..200
const ret2 = await cor(MAGENTA, { x0: 830, x1: 925, y0: 130, y1: 212 });
ok("F3) retângulo arrastado para cima/esquerda forma a caixa nessa direção (~54 × 54 em x 850..900)", perto(ret2.w, 54, 6) && perto(ret2.h, 54, 6) && perto(ret2.x0, 848, 3) && perto(ret2.x1, 901, 3), `${ret2.w} × ${ret2.h}, x ${ret2.x0}..${ret2.x1}`);

await ferr("triangulo");
const miolo2 = await pixel(750, 470);
await arrastar({ x: 700, y: 400 }, { x: 800, y: 500 }); // caixa 100 x 100, ponta em (750,400)
const tri = await cor(MAGENTA, { x0: 650, x1: 850, y0: 350, y1: 550 }, `${S}/d6_triangulo.png`);
ok("F4) triângulo: caixa de ~104 × 104", perto(tri.w, 104, 8) && perto(tri.h, 104, 8), `${tri.w} × ${tri.h}`);
ok("F5) triângulo: a PONTA está no meio de cima e o canto de cima NÃO tem tinta", (await cor(MAGENTA, { x0: 740, x1: 760, y0: 396, y1: 410 })).n > 5 && (await cor(MAGENTA, { x0: 698, x1: 714, y0: 398, y1: 412 })).n === 0);
ok("F5b) só contorno: o miolo do triângulo não mudou", igual(await pixel(750, 470), miolo2));
// tamanho mínimo: um clique não cria forma; uma linha reta (altura 0) também não
const antes = await cor(MAGENTA, { x0: 600, x1: 650, y0: 600, y1: 650 });
await p.mouse.click(620, 620); await p.waitForTimeout(200);
ok("F6) um clique com a forma não cria nada", (await cor(MAGENTA, { x0: 600, x1: 650, y0: 600, y1: 650 })).n === antes.n);
await ferr("retangulo");
await arrastar({ x: 600, y: 640 }, { x: 700, y: 640 }); // sem altura
ok("F6b) arrastar sem altura (uma linha) não cria retângulo", (await cor(MAGENTA, { x0: 590, x1: 720, y0: 625, y1: 655 })).n === 0);

// ================= G) borracha em formas só de contorno: só apaga tocando na LINHA
await ferr("borracha");
await arrastar({ x: 450, y: 135 }, { x: 452, y: 137 }, "left", 2); // no MEIO da elipse (vazio)
ok("G1) tocar no meio vazio da elipse NÃO a apaga", (await cor(MAGENTA, { x0: 380, x1: 520, y0: 95, y1: 175 })).n > 300);
await arrastar({ x: 750, y: 498 }, { x: 752, y: 500 }, "left", 2); // na BASE do triângulo (y=500)
ok("G2) tocar no contorno do triângulo (a base) o apaga", (await cor(MAGENTA, { x0: 650, x1: 850, y0: 350, y1: 550 })).n === 0);
await arrastar({ x: 398, y: 135 }, { x: 402, y: 135 }, "left", 2); // na borda esquerda da elipse (x=400)
ok("G3) tocar no contorno da elipse a apaga", (await cor(MAGENTA, { x0: 380, x1: 520, y0: 95, y1: 175 })).n === 0);
ok("G4) o retângulo continua (a borracha não chegou nele)", (await cor(MAGENTA, { x0: 540, x1: 680, y0: 95, y1: 190 })).n > 100);

// ================= H) tokens parados com a ferramenta; Mover os libera
await ferr("lapis");
const v0 = await cor(VERMELHO, { x0: 170, x1: 1160, y0: 0, y1: 800 }, `${S}/d7_antes.png`);
await arrastar({ x: v0.cx, y: v0.cy }, { x: 500, y: 600 });
const v1 = await cor(VERMELHO, { x0: 170, x1: 1160, y0: 0, y1: 800 });
ok("H1) com o lápis, arrastar sobre um token NÃO o move", perto(v1.cx, v0.cx, 2) && perto(v1.cy, v0.cy, 2), `(${v0.cx.toFixed(0)},${v0.cy.toFixed(0)}) -> (${v1.cx.toFixed(0)},${v1.cy.toFixed(0)})`);
await ferr("mover");
await arrastar({ x: v0.cx, y: v0.cy }, { x: v0.cx + 128, y: v0.cy + 64 });
const v2 = await cor(VERMELHO, { x0: 170, x1: 1160, y0: 0, y1: 800 });
ok("H2) em 'Mover' o token volta a andar (2 colunas, 1 linha)", perto(v2.cx - v0.cx, 128, 2) && perto(v2.cy - v0.cy, 64, 2));

// ================= I) botão direito move a visão com a ferramenta ligada
await ferr("lapis");
const camX = () => p.evaluate(() => window.__tabuleirinho.camera.mundo.x);
const x0Camera = await camX();
await arrastar({ x: 400, y: 560 }, { x: 300, y: 560 }, "right");
ok("I1) botão direito arrasta a visão (100 px p/ a esquerda) com o lápis ligado", perto((await camX()) - x0Camera, -100, 1), `dx=${((await camX()) - x0Camera).toFixed(1)}`);
await p.click("#voltar-padrao"); await p.waitForTimeout(500);

// ================= J) Esc, calibragem e bolsa
await ferr("elipse");
await p.keyboard.press("Escape");
ok("J1) Esc volta para 'Mover'", (await cls("mover")).includes("ativo") && !(await cls("elipse")).includes("ativo"));
await ferr("regua");
await p.click("#calibrar-alternar"); await p.waitForTimeout(300);
ok("J2) ligar a calibragem desliga a ferramenta (volta a 'Mover') e abre o painel dela", (await cls("mover")).includes("ativo") && await p.locator("#painel-calibragem").isVisible());
await ferr("lapis");
ok("J3) escolher uma ferramenta fecha a calibragem", !(await p.locator("#painel-calibragem").isVisible()));
await ferr("mover");
// bolsa bloqueada com ferramenta ligada
const alvo = await p.locator("#bolsa").boundingBox();
const roxo = await cor(ROXO, { x0: 170, x1: 1160, y0: 0, y1: 800 });
await arrastar({ x: roxo.cx, y: roxo.cy }, { x: alvo.x + alvo.width / 2, y: alvo.y + alvo.height / 2 }); // guarda o roxo
ok("J4) (preparo) o token roxo foi para a bolsa", (await p.locator(".ficha").count()) === 1);
await ferr("regua");
const ficha = await p.locator(".ficha").first().boundingBox();
await arrastar({ x: ficha.x + ficha.width / 2, y: ficha.y + ficha.height / 2 }, { x: 700, y: 300 });
ok("J5) com a régua ligada, arrastar da bolsa NÃO coloca o token", (await p.locator(".ficha").count()) === 1);
await ferr("mover");

// ================= K) Apagar tudo
ok("K0) há pinturas (botão ativo)", !(await p.locator("#desenho-apagar-tudo").isDisabled()));
const nDialogos = dialogos.length;
await p.click("#desenho-apagar-tudo"); await p.waitForTimeout(400);
ok("K1) 'Apagar tudo' pediu confirmação", dialogos.length === nDialogos + 1 && dialogos[dialogos.length - 1].includes("Apagar todas"), dialogos[dialogos.length - 1]);
const resto = (await cor(MAGENTA)).n + (await cor(VERDE)).n;
ok("K2) todas as pinturas sumiram", resto === 0, `${resto} px restantes`);
ok("K3) o botão voltou a ficar desativado", await p.locator("#desenho-apagar-tudo").isDisabled());

// ================= L) recolher o painel
await p.click("#desenho-alternar");
await p.waitForTimeout(450); // (a animação de recolher)
ok("L1) o painel recolhe (some a lista de ferramentas)", !(await p.locator("#lista-ferramentas").isVisible()));
await p.click("#desenho-alternar");
ok("L2) ...e expande de novo", await p.locator("#lista-ferramentas").isVisible());

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
