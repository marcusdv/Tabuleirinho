// Teste e2e: câmera (pan e limites). Rodar: npm run test:e2e -- camera
// Lê a posição da câmera direto (window.__tabuleirinho), sem medir pixels: rápido e não quebra
// quando entram painéis novos na tela. Veja tests/e2e/ajuda.mjs.
import { abrirPagina, lancar, lerCamera, lerEstado, ok, perto, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const PARTE_VISIVEL = 240; // PARTE_VISIVEL_CAMERA, em config.ts
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

// ---- 2) limites: pode sair da janela, mas PARTE_VISIVEL px do tabuleiro continuam visíveis
await mover(-99999, 0); c = await camera();
ok("2) para a ESQUERDA: sobram 240 px do tabuleiro (a borda direita dele em x=240)", perto(c.x + t.largura, PARTE_VISIVEL, 1), `borda direita em ${(c.x + t.largura).toFixed(1)}`);
await mover(99999, 0); c = await camera();
ok("3) para a DIREITA: sobram 240 px (a borda esquerda em x=1160)", perto(c.x, 1400 - PARTE_VISIVEL, 1), `borda esquerda em ${c.x.toFixed(1)}`);
await mover(0, -99999); c = await camera();
ok("4) para CIMA: sobram 240 px (a borda de baixo em y=240)", perto(c.y + t.altura, PARTE_VISIVEL, 1), `borda de baixo em ${(c.y + t.altura).toFixed(1)}`);
await mover(0, 99999); c = await camera();
ok("5) para BAIXO: sobram 240 px (a borda de cima em y=560)", perto(c.y, 800 - PARTE_VISIVEL, 1), `borda de cima em ${c.y.toFixed(1)}`);

// ---- 3) "Ajustar à tela" centraliza de novo
await p.click("#zoom-ajustar");
c = await camera();
ok("6) 'Ajustar à tela' centraliza de novo", perto(c.x, (1400 - t.largura) / 2, 1) && perto(c.y, (800 - t.altura) / 2, 1), `(${c.x}, ${c.y})`);

// ---- 4) zoom mínimo: o tabuleiro fica pequeno, mas nunca some
for (let i = 0; i < 8; i++) await p.click("#zoom-menos");
c = await camera(); t = await tabuleiro();
await mover(-99999, 0); c = await camera();
ok("7) zoom mínimo: arrastando tudo para a esquerda, o tabuleiro (pequeno) ainda aparece inteiro na ponta", c.x >= -0.5 && c.x + t.largura > 0, `zoom ${Math.round(c.zoom * 100)}%, x=${c.x.toFixed(1)}, largura ${t.largura.toFixed(0)}`);

// ---- 5) o arrasto de verdade com o mouse (o caminho do evento até a câmera)
await p.click("#voltar-padrao"); // "Voltar ao padrão": zoom 100% e centralizado
const antes = await camera();
await p.mouse.move(700, 560); await p.mouse.down();
for (let i = 1; i <= 8; i++) { await p.mouse.move(700 - 12 * i, 560); await p.waitForTimeout(20); }
await p.mouse.up(); await p.waitForTimeout(150);
const depois = await camera();
ok("8) arrastar o mapa com o mouse (96 px p/ a esquerda) move a câmera exatamente isso", perto(depois.x - antes.x, -96, 1) && perto(depois.y, antes.y, 1), `dx=${(depois.x - antes.x).toFixed(1)}`);

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
