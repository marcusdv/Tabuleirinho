// Teste e2e: EDITAR um token (nome, tamanho e cores) pelo clique direito. Rodar: npm run test:e2e -- editar-token
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// Dois caminhos levam à mesma janela "Editar token": a ENGRENAGEM do token no MAPA (painel "Editar token") e o
// menu da FICHA na bolsa ("Editar token…"). Tudo passa por editarToken() em estado.ts.
import { abrirPagina, lancar, lerEstado, ok, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const token = (id) => lerEstado(p, `(e) => { const t = e.tokens.find((t) => t.id === ${id}); return { nome: t.nome, size: t.size, cor: t.cor, corBorda: t.corBorda, col: t.col, row: t.row, guardado: t.guardado }; }`);
const janelaAberta = () => p.locator("#editor-token").isVisible();
// O token 1 está na coluna 3, linha 3: o centro dele na tela fica em (124 + 3,5*64, 80 + 3,5*64) = (348, 304).
const centroToken1 = { x: 348, y: 304 };

// 1) pelo token NO MAPA
await p.mouse.click(centroToken1.x, centroToken1.y, { button: "right" });
ok("1a) a lista de ações da esquerda NÃO tem 'Editar token' (ele fica na engrenagem)", !(await p.locator("#acoes-token").innerText()).includes("Editar token"));
await p.click("#engrenagem");
ok("1a2) o painel da engrenagem tem 'Editar token'", await p.locator("#botao-editar-token").isVisible());
await p.click("#botao-editar-token");
ok("1b) abre a janela com os valores atuais do token (nome 'Token 1') e fecha os botões do mapa", (await janelaAberta()) && (await p.inputValue("#editor-token-nome")) === "Token 1" && !(await p.locator("#acoes-token").isVisible()));
await p.fill("#editor-token-nome", "Capitão Bruto");
await p.click('#editor-token button[data-tamanho="2"]');
await p.click('#editor-token-amostras .amostra[data-cor="#f1c40f"]');
await p.click('#editor-token-amostras-borda .amostra[data-cor="#000000"]');
ok("1c) a prévia acompanha as escolhas (2×2)", (await p.locator("#editor-token-previa small").textContent()) === "2×2");
await p.click("#editor-token-salvar");
const t1 = await token(1);
ok("1d) Salvar aplica nome, tamanho, preenchimento e borda no token", t1.nome === "Capitão Bruto" && t1.size === 2 && t1.cor === 0xf1c40f && t1.corBorda === 0x000000 && !(await janelaAberta()), JSON.stringify(t1));

// 2) Esc cancela sem mudar; nome vazio volta ao padrão
await p.mouse.click(centroToken1.x + 32, centroToken1.y + 32, { button: "right" }); // o token agora é 2×2: o centro andou meia casa
await p.click("#engrenagem"); await p.click("#botao-editar-token");
await p.fill("#editor-token-nome", "NÃO DEVE SALVAR");
await p.keyboard.press("Escape");
ok("2a) Esc cancela: nada mudou e a janela fechou", (await token(1)).nome === "Capitão Bruto" && !(await janelaAberta()));
await p.mouse.click(centroToken1.x + 32, centroToken1.y + 32, { button: "right" });
await p.click("#engrenagem"); await p.click("#botao-editar-token");
await p.fill("#editor-token-nome", "   ");
await p.keyboard.press("Enter");
ok("2b) Enter salva, e um nome vazio volta a 'Token 1'", (await token(1)).nome === "Token 1");
await p.fill("#editor-token-nome", "x").catch(() => {}); // (a janela está fechada: nada a fazer)

// 3) pela FICHA na bolsa (guarda o token 2 arrastando até a bolsa)
const bolsa = await p.locator("#bolsa").boundingBox();
await p.mouse.move(124 + 6 * 64 + 32, 80 + 5 * 64 + 32);
await p.mouse.down();
await p.mouse.move(bolsa.x + 60, bolsa.y + 40, { steps: 8 });
await p.mouse.up();
ok("3a) (preparo) o token 2 foi para a bolsa", (await token(2)).guardado === true);
await p.mouse.click(bolsa.x + bolsa.width / 2, bolsa.y + bolsa.height - 8);
const ficha = p.locator(".ficha").first();
await ficha.click({ button: "right" });
ok("3b) o menu da ficha tem 'Editar token…'", await p.locator("#menu-ficha-editar").isVisible());
await p.click("#menu-ficha-editar");
ok("3c) abre a janela de edição", await janelaAberta());
await p.keyboard.press("Escape");
ok("3d) Esc fecha SÓ a janela (a bolsa continua expandida)", !(await janelaAberta()) && ((await p.locator("#bolsa").getAttribute("class")) ?? "").includes("expandida"));
await ficha.click({ button: "right" });
await p.click("#menu-ficha-editar");
await p.fill("#editor-token-nome", "Arqueira");
await p.click('#editor-token button[data-tamanho="4"]');
await p.locator("#editor-token-cor-borda").fill("#12ab34");
await p.click("#editor-token-salvar");
const t2 = await token(2);
ok("3e) editar pela ficha também aplica tudo (nome, 4×4, borda #12ab34)", t2.nome === "Arqueira" && t2.size === 4 && t2.corBorda === 0x12ab34 && t2.guardado, JSON.stringify(t2));
ok("3f) a ficha mostra o novo nome e tamanho", (await p.locator(".ficha").first().innerText()).replace(/\s+/g, " ") === "Arqueira 4×4");
ok("3g) o nome editado também é cortado a 20 caracteres", await (async () => {
    await ficha.click({ button: "right" });
    await p.click("#menu-ficha-editar");
    await p.fill("#editor-token-nome", "Um nome muito mais comprido que o limite");
    const v = (await p.inputValue("#editor-token-nome")).length;
    await p.keyboard.press("Escape");
    return v === 20;
})());

ok("4) nenhum erro de JavaScript durante o teste", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
