// Teste e2e: as FICHINHAS de token da bolsa: o disco fica colado nas marcas do alto e o texto de baixo (nome de até 2 linhas e o tamanho "1×1") fica ALINHADO em todas, com o nome de 1 ou de 2
// linhas (19/11/2026). Rodar: npm run test:e2e -- bolsa-fichinha (precisa do npm run dev).
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
await p.evaluate(() => window.__tabuleirinho.semear([
    { id: 101, nome: "Goblin", imagem: null, col: 0, row: 0, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, guardado: true },
    { id: 102, nome: "Dragão Vermelho Ancião", imagem: null, col: 0, row: 0, cor: 0xe74c3c, corBorda: 0xffd54f, size: 2, guardado: true },
    { id: 103, nome: "Mago", imagem: null, col: 0, row: 0, cor: 0x3498db, corBorda: 0xffffff, size: 1, guardado: true },
    { id: 104, nome: "Capitão da Guarda Real", imagem: null, col: 0, row: 0, cor: 0x9b59b6, corBorda: 0xffffff, size: 1, guardado: true },
]));
await p.waitForTimeout(400);

const medidas = () => p.locator(".ficha").evaluateAll((fs) => fs.map((f) => {
    const c = f.getBoundingClientRect();
    const d = f.querySelector(".disco").getBoundingClientRect();
    const t = f.querySelector("small");
    const n = f.querySelector(".ficha-nome").getBoundingClientRect();
    return { disco: Math.round((d.top - c.top) * 10) / 10, nome: Math.round(n.height * 10) / 10, tamanho: t && getComputedStyle(t).display !== "none" ? Math.round((t.getBoundingClientRect().top - c.top) * 10) / 10 : null, altura: Math.round(c.height) };
}));

/** O nome de 1 linha fica no MEIO das 2 linhas reservadas: a diferença entre o centro do texto e o centro da caixa do nome. */
const descentro = () => p.locator(".ficha").evaluateAll((fs) => fs.map((f) => {
    const caixa = f.querySelector(".ficha-nome").getBoundingClientRect();
    const texto = f.querySelector(".ficha-nome-texto").getBoundingClientRect();
    return Math.round(Math.abs((texto.top + texto.height / 2) - (caixa.top + caixa.height / 2)) * 10) / 10;
}));
// bolsa PEQUENA (a do canto)
let m = await medidas();
ok("0) o nome fica CENTRALIZADO na vertical nas 2 linhas reservadas (de 1 ou de 2 linhas)", (await descentro()).every((d) => d <= 1), JSON.stringify(await descentro()));
ok("1) bolsa pequena: o disco fica a 14 px do topo da fichinha (era 17), igual em todas", m.length === 4 && m.every((x) => x.disco === 14), JSON.stringify(m.map((x) => x.disco)));
ok("2) o nome reserva SEMPRE o espaço de 2 linhas (mesma altura com 1 ou 2 linhas)", new Set(m.map((x) => x.nome)).size === 1 && m[0].nome > 24, JSON.stringify(m.map((x) => x.nome)));

// bolsa em TELA CHEIA
await p.keyboard.press("q");
await p.waitForTimeout(600);
m = await medidas();
ok("3) tela cheia: o disco fica a 24 px do topo (era 28), igual em todas", m.length === 4 && m.every((x) => x.disco === 24), JSON.stringify(m.map((x) => x.disco)));
ok("4) o tamanho (1×1, 2×2) fica ALINHADO nas 4 fichinhas, com o nome de 1 ou de 2 linhas", m.every((x) => x.tamanho !== null) && new Set(m.map((x) => x.tamanho)).size === 1, JSON.stringify(m.map((x) => x.tamanho)));
ok("5) as 4 fichinhas têm a mesma altura", new Set(m.map((x) => x.altura)).size === 1, JSON.stringify(m.map((x) => x.altura)));

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
