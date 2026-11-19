// Teste e2e: MOVER O TOKEN PELA RÉGUA (modo local). Medindo a partir de um token que a pessoa pode usar, a régua o SELECIONA; ao soltar, o botão "Mover" aparece junto da ponta; clicar leva o token pelo caminho
// medido, DESLIZANDO e com uma PARADINHA em cada ponto fixado com o botão direito, até o final. Também: a medida mostra os quadrados com o SÍMBOLO do quadrado (2 linhas), um caminho que sai do tabuleiro não move,
// e sem permissão (jogador sem acesso ao token) nada é selecionado nem aparece botão. Rodar: npm run test:e2e -- regua-mover (precisa do npm run dev).
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

const casa = (c, r) => p.evaluate(([c, r]) => window.__tabuleirinho.camera.mundoParaTela((c + 0.5) * 64, (r + 0.5) * 64), [c, r]);
const token = (nome) => p.evaluate((nome) => { const t = window.__tabuleirinho; const k = t.estado.tokens.find((x) => x.nome === nome); return { id: k.id, col: k.col, row: k.row, ...t.posicaoDoDesenhoDoToken(k.id) }; }, nome);
const selecionados = () => p.evaluate(() => window.__tabuleirinho.selecionadosIds());
const botao = () => p.locator("#regua-mover").isVisible();
const aviso = () => p.evaluate(() => document.getElementById("aviso")?.textContent ?? "");

/** Mede de (c0,r0), fixa um ponto em (c1,r1) com o botão direito e solta em (c2,r2). */
async function medir(c0, r0, c1, r1, c2, r2) {
    const a = await casa(c0, r0), b = await casa(c1, r1), c = await casa(c2, r2);
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 4 });
    if (c1 !== null && (c1 !== c2 || r1 !== r2)) await p.mouse.click(b.x, b.y, { button: "right" });
    await p.mouse.move(c.x, c.y, { steps: 4 });
    await p.mouse.up();
    await p.waitForTimeout(250);
}

await p.keyboard.press("r");

// ---------------------------------------------------------------- a medida: duas linhas, com o símbolo do quadrado
{
    const a = await casa(10, 8), b = await casa(14, 8);
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 4 });
    ok("1) a medida tem DUAS linhas: os metros e, embaixo, os quadrados (texto para leitura: '6 m' e '4 quadrados')", (await p.evaluate(() => window.__tabuleirinho.distanciaDaRegua())) === "6 m\n4 quadrados");
    await p.mouse.up();
}
ok("2) começar a medir numa casa SEM token não seleciona nada e não mostra o botão Mover", (await selecionados()).length === 0 && !(await botao()));

// ---------------------------------------------------------------- começar num token: seleciona, mostra o botão, move com deslize e paradinha
const inicio = await token("Token 1"); // (3, 3)
await medir(3, 3, 3, 7, 7, 7);
ok("3) medir a partir do Token 1 o SELECIONA", JSON.stringify(await selecionados()) === JSON.stringify([inicio.id]), JSON.stringify(await selecionados()));
ok("4) ao soltar, aparece o botão escrito 'Mover' junto da ponta da régua", (await botao()) && (await p.textContent("#regua-mover")) === "Mover");
const caixaBotao = await p.locator("#regua-mover").boundingBox();
const ponta = await casa(7, 7);
ok("5) o botão fica logo abaixo da ponta da régua", Math.abs(caixaBotao.x + caixaBotao.width / 2 - ponta.x) < 8 && caixaBotao.y > ponta.y && caixaBotao.y < ponta.y + 50, JSON.stringify([caixaBotao, ponta]));
ok("6) a régua sozinha não move o token: ele continua onde estava", (await token("Token 1")).col === 3 && (await token("Token 1")).row === 3);

const waypoint = (await casa(3, 7)); // (centro do ponto fixado, em pixels da tela)
const cx = (c) => (c + 0.5) * 64, cy = (r) => (r + 0.5) * 64; // (em pixels do mundo)
await p.click("#regua-mover");
const amostras = [];
const t0 = Date.now();
for (let i = 0; i < 60; i++) { const k = await token("Token 1"); amostras.push({ t: Date.now() - t0, x: k.x, y: k.y }); await p.waitForTimeout(60); }
const fim = await token("Token 1");
ok("7) o token chega ao ponto final (7, 7)", fim.col === 7 && fim.row === 7 && Math.abs(fim.x - cx(7)) < 1 && Math.abs(fim.y - cy(7)) < 1, JSON.stringify(fim));
const noMeioDoPrimeiroTrecho = amostras.filter((s) => Math.abs(s.x - cx(3)) < 1 && s.y > cy(3) + 8 && s.y < cy(7) - 8);
ok("8) ele DESLIZA (passa por posições intermediárias do 1º trecho, e não pula)", noMeioDoPrimeiroTrecho.length >= 2, `${noMeioDoPrimeiroTrecho.length} amostras no meio`);
const naParada = amostras.filter((s) => Math.abs(s.x - cx(3)) < 1 && Math.abs(s.y - cy(7)) < 1);
const duracaoDaParada = naParada.length ? naParada.at(-1).t - naParada[0].t : 0;
ok("9) ele PARA um instante no ponto fixado (3, 7) antes de seguir (≥ 300 ms parado ali)", duracaoDaParada >= 300, `parado ${duracaoDaParada} ms (${naParada.length} amostras)`);
const noMeioDoSegundoTrecho = amostras.filter((s) => Math.abs(s.y - cy(7)) < 1 && s.x > cx(3) + 8 && s.x < cx(7) - 8);
ok("10) e então DESLIZA até o final (2º trecho)", noMeioDoSegundoTrecho.length >= 2, `${noMeioDoSegundoTrecho.length} amostras`);
ok("11) terminado: o botão some e a régua é limpa da tela (a ferramenta continua ligada)", !(await botao()) && (await p.evaluate(() => window.__tabuleirinho.distanciaDaRegua())) === null);

// ---------------------------------------------------------------- um caminho que sai do tabuleiro não move
const grande = await token("Token 4"); // 2×2 em (10, 2)
await medir(10, 2, 10, 2, 10, 9); // (a régua chega à linha 9, mas o token 2×2 passaria da última linha)
ok("12) o botão aparece, mas se o caminho faria o token passar da borda, clicar NÃO o move e avisa", await botao());
await p.click("#regua-mover");
await p.waitForTimeout(400);
const depoisGrande = await token("Token 4");
ok("13) o Token 4 (2×2) ficou onde estava, e a pessoa é avisada", depoisGrande.col === grande.col && depoisGrande.row === grande.row && /não cabe/.test(await aviso()), await aviso());
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- sem permissão: nada é selecionado e não há botão
await p.goto((process.env.URL_TESTE ?? "http://127.0.0.1:5173/") + "?papel=jogador");
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await p.evaluate((lista) => window.__tabuleirinho.semear(lista), [
    { id: 1, nome: "Token 1", imagem: null, col: 3, row: 3, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, guardado: false },
    { id: 2, nome: "Token 2", imagem: null, col: 6, row: 5, cor: 0x3498db, corBorda: 0xffffff, size: 1, guardado: false, nivel: "leitor" },
]);
await p.evaluate(() => { window.__tabuleirinho.definirTamanho(18, 10); window.__tabuleirinho.camera.aplicarZoom(1); window.__tabuleirinho.camera.centralizar(); });
await p.keyboard.press("r");
await medir(3, 3, 3, 3, 3, 6);
ok("14) um JOGADOR sem acesso ao token: medir a partir dele não o seleciona e não mostra o botão", (await selecionados()).length === 0 && !(await botao()));
await medir(6, 5, 6, 5, 6, 8);
const t2 = await token("Token 2");
ok("15) com acesso de LEITOR ao token, a régua o seleciona e o botão Mover aparece", JSON.stringify(await selecionados()) === JSON.stringify([t2.id]) && (await botao()));
await p.click("#regua-mover");
await p.waitForTimeout(900);
ok("16) e o jogador (leitor) move o token pelo caminho", (await token("Token 2")).row === 8, JSON.stringify(await token("Token 2")));

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
