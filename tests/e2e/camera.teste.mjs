// Teste e2e: câmera (pan e limites). Rodar: npm run test:e2e -- camera
// Lê a posição da câmera direto (window.__tabuleirinho), sem medir pixels: rápido e não quebra
// quando entram painéis novos na tela. Veja tests/e2e/ajuda.mjs.
import { abrirPagina, lancar, lerCamera, lerEstado, ok, perto, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const MARGEM = 360; // MARGEM_LIVRE_CAMERA, em config.ts: o espaço vazio máximo além do mapa
const camera = () => lerCamera(p, (c) => ({ x: c.mundo.x, y: c.mundo.y, zoom: c.zoom }));
const tabuleiro = async () => {
    const e = await lerEstado(p, (e) => ({ colunas: e.colunas, linhas: e.linhas }));
    const { zoom } = await camera();
    return { largura: e.colunas * 64 * zoom, altura: e.linhas * 64 * zoom };
};
const mover = (dx, dy) => p.evaluate(([dx, dy]) => window.__tabuleirinho.camera.moverPor(dx, dy), [dx, dy]);

// ---- 1) ao abrir: centralizado, zoom 100% (o tabuleiro 18x10 cabe)
let c = await camera(), t = await tabuleiro();
ok("1) abre em zoom 100%", c.zoom === 1, `zoom ${c.zoom}`);
ok("1b) ...e centralizado (sobra igual dos dois lados)", perto(c.x, (1400 - t.largura) / 2, 1) && perto(c.y, (800 - t.altura) / 2, 1), `(${c.x}, ${c.y})`);

// ---- 2) limites: o espaço vazio além do mapa nunca passa de MARGEM (360 px)
await mover(-99999, 0); c = await camera();
ok("2) para a ESQUERDA: sobram 360 px vazios à direita (a borda direita do mapa em x=1040)", perto(c.x + t.largura, 1400 - MARGEM, 1), `borda direita em ${(c.x + t.largura).toFixed(1)}`);
await mover(99999, 0); c = await camera();
ok("3) para a DIREITA: sobram 360 px vazios à esquerda (a borda esquerda do mapa em x=360)", perto(c.x, MARGEM, 1), `borda esquerda em ${c.x.toFixed(1)}`);
await mover(0, -99999); c = await camera();
ok("4) para CIMA: sobram 360 px vazios embaixo (a borda de baixo do mapa em y=440)", perto(c.y + t.altura, 800 - MARGEM, 1), `borda de baixo em ${(c.y + t.altura).toFixed(1)}`);
await mover(0, 99999); c = await camera();
ok("5) para BAIXO: sobram 360 px vazios em cima (a borda de cima do mapa em y=360)", perto(c.y, MARGEM, 1), `borda de cima em ${c.y.toFixed(1)}`);

// ---- 3) "Ajustar à tela" centraliza de novo
await p.click("#zoom-ajustar");
c = await camera();
t = await tabuleiro(); // (o zoom mudou: o ajuste encaixa o mapa na ÁREA LIVRE, entre a pilha de barras da esquerda e a coluna da direita)
const area = await p.evaluate(() => { const e = window.__tabuleirinho.camera.areaCoberta(); return { esquerda: e.esquerda, direita: e.direita }; });
const centroLivre = (area.esquerda + (1400 - area.direita)) / 2;
ok("6) 'Ajustar à tela' centraliza de novo, na área livre (entre as barras e a coluna da direita)", perto(c.x + t.largura / 2, centroLivre, 2) && perto(c.y + t.altura / 2, 400, 2), `centro (${(c.x + t.largura / 2).toFixed(1)}, ${(c.y + t.altura / 2).toFixed(1)}) esperado (${centroLivre.toFixed(1)}, 400)`);

// ---- 4) zoom mínimo: o tabuleiro fica pequeno, mas nunca some
await p.evaluate(() => window.__tabuleirinho.camera.aplicarZoom(0.2)); // zoom mínimo (ZOOM_MIN; o botão − fica desabilitado ao chegar lá)
c = await camera(); t = await tabuleiro();
await mover(-99999, 0); c = await camera();
ok("7) zoom mínimo: arrastando tudo para a esquerda, o tabuleiro (pequeno) ainda aparece inteiro na ponta", c.x >= -0.5 && c.x + t.largura > 0, `zoom ${Math.round(c.zoom * 100)}%, x=${c.x.toFixed(1)}, largura ${t.largura.toFixed(0)}`);

// ---- 5) o arrasto de verdade com o mouse (o caminho do evento até a câmera)
await p.evaluate(() => { const t = window.__tabuleirinho; t.camera.aplicarZoom(1); t.camera.centralizar(); }); // zoom 100% e centralizado (o botão "Voltar ao padrão" fica na gaveta, fechada aqui)
const antes = await camera();
await p.mouse.move(700, 560); await p.mouse.down({ button: "middle" }); // (o pan é com o botão do MEIO, ou espaço + esquerdo)
for (let i = 1; i <= 8; i++) { await p.mouse.move(700 - 12 * i, 560); await p.waitForTimeout(20); }
await p.mouse.up({ button: "middle" }); await p.waitForTimeout(150);
const depois = await camera();
ok("8) arrastar o mapa com o botão do meio (96 px p/ a esquerda) move a câmera exatamente isso", perto(depois.x - antes.x, -96, 1) && perto(depois.y, antes.y, 1), `dx=${(depois.x - antes.x).toFixed(1)}`);

// ---- 6) espaço + botão esquerdo também arrasta; o esquerdo SOZINHO no vazio não move a câmera
const antes2 = await camera();
await p.keyboard.down("Space");
await p.mouse.move(700, 560); await p.mouse.down();
for (let i = 1; i <= 8; i++) { await p.mouse.move(700 + 10 * i, 560); await p.waitForTimeout(20); }
await p.mouse.up(); await p.keyboard.up("Space"); await p.waitForTimeout(150);
const depois2 = await camera();
ok("9) espaço + botão esquerdo (80 px p/ a direita) move a câmera", perto(depois2.x - antes2.x, 80, 1), `dx=${(depois2.x - antes2.x).toFixed(1)}`);
await p.mouse.move(700, 560); await p.mouse.down();
for (let i = 1; i <= 8; i++) { await p.mouse.move(700 - 12 * i, 560); await p.waitForTimeout(20); }
await p.mouse.up(); await p.waitForTimeout(150);
const depois3 = await camera();
ok("10) o botão esquerdo sozinho no vazio NÃO move a câmera", perto(depois3.x, depois2.x, 0.5), `dx=${(depois3.x - depois2.x).toFixed(1)}`);

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
