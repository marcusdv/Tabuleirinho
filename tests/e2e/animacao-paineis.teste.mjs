// Teste e2e: RECOLHER/EXPANDIR com ANIMAÇÃO nas quatro caixas (Ferramentas, Desenho, Dados e a bolsa). Rodar: npm run test:e2e -- animacao-paineis
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs e src/ui/animarPainel.ts.
//
// A altura da caixa cresce (ou encolhe) suavemente, com o TOPO parado (o conteúdo é revelado de cima para baixo), em vez de mudar de uma vez.
// Medido DENTRO da página, a cada quadro (a medição pela ponte do Playwright atrasa e engana). Também confere: o conteúdo continua à vista enquanto
// encolhe e só some no fim, o estado final é o certo, clicar de novo no meio inverte sem pulo, e a bolsa expandida chega ao canto inferior direito.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

// Clica no botão e anota a altura e o topo da caixa a cada quadro durante 700 ms.
const amostrar = (caixa, botao, extra = null) =>
    p.evaluate(
        ({ caixa, botao, extra }) =>
            new Promise((resolver) => {
                const el = document.querySelector(caixa);
                const pontos = [];
                const inicio = performance.now();
                const r0 = el.getBoundingClientRect();
                pontos.push({ h: r0.height, top: r0.top, conteudo: extra ? getComputedStyle(document.querySelector(extra)).display !== "none" : null });
                document.querySelector(botao).click();
                const quadro = () => {
                    const r = el.getBoundingClientRect();
                    pontos.push({ h: Math.round(r.height * 10) / 10, top: Math.round(r.top * 10) / 10, conteudo: extra ? getComputedStyle(document.querySelector(extra)).display !== "none" : null });
                    if (performance.now() - inicio < 700) requestAnimationFrame(quadro);
                    else resolver(pontos);
                };
                requestAnimationFrame(quadro);
            }),
        { caixa, botao, extra },
    );
const intermediarios = (pts) => {
    const min = Math.min(pts[0].h, pts[pts.length - 1].h), max = Math.max(pts[0].h, pts[pts.length - 1].h);
    return pts.filter((q) => q.h > min + 4 && q.h < max - 4).length;
};

const caixas = [
    { nome: "barra de Ferramentas", caixa: "#barra", botao: "#barra-alternar", classe: "recolhida", conteudo: "#barra .conteudo" },
    { nome: "painel de Desenho", caixa: "#ferramentas-desenho", botao: "#desenho-alternar", classe: "recolhida", conteudo: "#ferramentas-desenho .conteudo" },
    { nome: "painel de Dados", caixa: "#dados", botao: "#dados-alternar", classe: "recolhida", conteudo: "#dados-conteudo" },
    { nome: "bolsa", caixa: "#bolsa", botao: "#bolsa-alternar", classe: "recolhida", conteudo: "#bolsa-conteudo" },
];
const tem = (caixa, classe) => p.locator(caixa).evaluate((e, c) => e.classList.contains(c), classe);

for (const c of caixas) {
    const aberta = (await tem(c.caixa, c.classe)) === false;
    // ---- recolher
    const descida = await amostrar(c.caixa, c.botao, c.conteudo);
    const ini = descida[0], fim = descida[descida.length - 1];
    ok(`${c.nome}: ao RECOLHER a altura diminui em vários quadros (não é um pulo) e só diminui`, aberta && fim.h < ini.h - 20 && intermediarios(descida) >= 3 && descida.every((q, i) => i === 0 || q.h <= descida[i - 1].h + 0.6), descida.filter((_, i) => i % 5 === 0).map((q) => q.h).join(","));
    ok(`${c.nome}: o TOPO fica parado durante todo o movimento (a caixa cresce/encolhe de cima para baixo)`, descida.every((q) => Math.abs(q.top - ini.top) <= 1), descida.filter((_, i) => i % 5 === 0).map((q) => q.top).join(","));
    const meio = descida.find((q) => q.h > ini.h * 0.4 && q.h < ini.h - 10);
    ok(`${c.nome}: enquanto encolhe o conteúdo continua à vista (some só no fim)`, meio ? meio.conteudo === true : false, JSON.stringify(meio));
    ok(`${c.nome}: no fim está recolhida (classe aplicada e conteúdo escondido)`, (await tem(c.caixa, c.classe)) && fim.conteudo === false);
    // ---- expandir
    const subida = await amostrar(c.caixa, c.botao, c.conteudo);
    const fim2 = subida[subida.length - 1];
    ok(`${c.nome}: ao EXPANDIR a altura cresce em vários quadros e só cresce, voltando à altura de antes`, intermediarios(subida) >= 3 && subida.every((q, i) => i === 0 || q.h >= subida[i - 1].h - 0.6) && Math.abs(fim2.h - ini.h) <= 1.5, `${ini.h} -> ${fim2.h}`);
    ok(`${c.nome}: o topo também fica parado ao expandir`, subida.every((q) => Math.abs(q.top - ini.top) <= 1));
    ok(`${c.nome}: no fim está expandida de novo`, !(await tem(c.caixa, c.classe)) && fim2.conteudo === true);
}

// ================= a bolsa expandida chega ao canto inferior direito (a "vaga" invisível tem a altura dela)
const b = await p.locator("#bolsa").boundingBox();
ok("a bolsa aberta termina a 12 px da borda de baixo e da direita (o canto de sempre)", Math.abs(b.y + b.height - 788) <= 2 && Math.abs(b.x + b.width - 1388) <= 2, JSON.stringify(b));
await p.click("#bolsa-alternar"); await p.waitForTimeout(450);
const m = await p.locator("#bolsa").boundingBox();
ok("minimizada, a bolsa fica com o TOPO no mesmo lugar (sobra só o cabeçalho; ela não desce para o canto)", Math.abs(m.y - b.y) <= 1 && m.height < 70, JSON.stringify({ b, m }));
const clicavel = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("#bolsa, #canto-inferior-direito") === null, [b.x + 100, b.y + b.height - 20]);
ok("o espaço vazio que a bolsa minimizada deixa (a vaga e a coluna em volta) NÃO pega o mouse: o clique passa para o tabuleiro", clicavel);
await p.click("#bolsa-alternar"); await p.waitForTimeout(450);

// ================= clicar de novo no meio da animação inverte, sem pulo
const meioDoCaminho = await p.evaluate(() => new Promise((resolver) => {
    const el = document.getElementById("barra");
    const h0 = el.getBoundingClientRect().height;
    document.getElementById("barra-alternar").click(); // começa a recolher
    setTimeout(() => {
        const hMeio = el.getBoundingClientRect().height;
        document.getElementById("barra-alternar").click(); // inverte no meio
        const hLogoDepois = el.getBoundingClientRect().height;
        setTimeout(() => resolver({ h0, hMeio, hLogoDepois, hFim: el.getBoundingClientRect().height, recolhida: el.classList.contains("recolhida") }), 500);
    }, 110);
}));
ok("clicar de novo no meio do movimento INVERTE a partir da altura em que está (sem pulo) e termina expandida", meioDoCaminho.hMeio < meioDoCaminho.h0 - 5 && Math.abs(meioDoCaminho.hLogoDepois - meioDoCaminho.hMeio) <= 8 && Math.abs(meioDoCaminho.hFim - meioDoCaminho.h0) <= 1.5 && meioDoCaminho.recolhida === false, JSON.stringify(meioDoCaminho));

// ================= ao carregar a página não há animação (o estado guardado já está aplicado)
await p.click("#desenho-alternar"); await p.waitForTimeout(450);
await p.reload();
const semAnimacao = await p.evaluate(() => new Promise((resolver) => {
    const el = document.getElementById("ferramentas-desenho");
    const alturas = [];
    const inicio = performance.now();
    const quadro = () => {
        alturas.push(Math.round(el.getBoundingClientRect().height));
        if (performance.now() - inicio < 400) requestAnimationFrame(quadro);
        else resolver({ alturas: [...new Set(alturas)], recolhida: el.classList.contains("recolhida") });
    };
    quadro();
}));
ok("recarregando com o painel recolhido ele já abre recolhido e a altura NÃO muda (sem animação ao carregar)", semAnimacao.recolhida && semAnimacao.alturas.length === 1, JSON.stringify(semAnimacao));

process.exitCode = terminar(erros);
await nav.close();
