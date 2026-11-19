// Teste e2e: a EMANAÇÃO (aura) de um TOKEN, ligada pela janela "Editar token": alcance em metros, transparência e cor; a aura aparece em volta do token (casas inteiras), ACOMPANHA o token
// quando ele é arrastado, fica por baixo dele e NÃO "pega" o clique (só o círculo do token é pego), e some ao desligar. Rodar: npm run test:e2e -- emanacao-token (precisa do npm run dev).
import { PNG } from "pngjs";
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

const estado = (f) => p.evaluate(`(${f.toString()})(window.__tabuleirinho.estado)`);
const casa = (c, r) => p.evaluate(([c, r]) => window.__tabuleirinho.camera.mundoParaTela((c + 0.5) * 64, (r + 0.5) * 64), [c, r]);
const token1 = () => estado((e) => { const t = e.tokens.find((x) => x.nome === "Token 1"); return { col: t.col, row: t.row, emanacao: t.emanacao }; });

/** Quanto a cor do CENTRO de uma casa difere da cor `base` (soma das diferenças RGB): a aura tinge a casa. */
async function tingimento(c, r, base) {
    const q = await casa(c, r);
    const png = PNG.sync.read(await p.screenshot({ clip: { x: Math.round(q.x) - 4, y: Math.round(q.y) + 18, width: 8, height: 8 } })); // (a parte de baixo da casa: longe do círculo de um token)
    const i = 4 * (4 * 8 + 4);
    return Math.abs(png.data[i] - base[0]) + Math.abs(png.data[i + 1] - base[1]) + Math.abs(png.data[i + 2] - base[2]);
}
async function corDaCasa(c, r) {
    const q = await casa(c, r);
    const png = PNG.sync.read(await p.screenshot({ clip: { x: Math.round(q.x) - 4, y: Math.round(q.y) + 18, width: 8, height: 8 } }));
    const i = 4 * (4 * 8 + 4);
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

// Antes: as cores de duas casas (uma que a aura vai cobrir, uma longe dela). O Token 1 está em (3, 3).
const dentro = [3, 1]; // 2 casas acima do token: dentro de uma aura de 4 casas
const longe = [14, 9];
const baseDentro = await corDaCasa(...dentro);
const baseLonge = await corDaCasa(...longe);
const baseNoNovoLugar = await corDaCasa(9, 4); // (a casa onde a aura vai parar depois do arrasto)

// ---------------------------------------------------------------- a janela
let q = await casa(3, 3);
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
await p.click("#engrenagem");
await p.click("#botao-editar-token");
ok("1) a janela Editar token tem a seção Emanação, desligada e sem as opções à mostra", !(await p.isChecked("#editor-token-emana")) && (await p.locator("#editor-token-emana-opcoes").isHidden()));
await p.check("#editor-token-emana");
ok("2) ligar a emanação mostra as opções (alcance, transparência e cor)", await p.locator("#editor-token-emana-opcoes").isVisible());
ok("3) os valores de abertura: 3 m (2 casas), 75% de transparência", (await p.inputValue("#editor-token-emana-metros")) === "3" && (await p.textContent("#editor-token-emana-transparencia-valor")) === "75%");
await p.fill("#editor-token-emana-metros", "6");
await p.keyboard.press("Enter");
ok("4) digitar 6 m vale 4 casas (e Enter só confirma o campo, não salva a janela; não há dica de casas)", (await p.inputValue("#editor-token-emana-metros")) === "6" && (await p.locator("#editor-token-emana-casas").count()) === 0 && (await p.locator("#editor-token").isVisible()));
await p.click("#editor-token-emana-mais");
ok("5) o botão + soma 1 casa (7,5 m = 5 casas)", (await p.inputValue("#editor-token-emana-metros")) === "7.5");
await p.click("#editor-token-emana-menos");
await p.evaluate(() => { const f = document.getElementById("editor-token-emana-transparencia"); f.value = "50"; f.dispatchEvent(new Event("input", { bubbles: true })); });
ok("6) a transparência mostra a porcentagem (50%)", (await p.textContent("#editor-token-emana-transparencia-valor")) === "50%");
await p.locator("#editor-token-amostras-emana .amostra").nth(0).click();
await p.click("#editor-token-salvar");
await p.waitForTimeout(400);
await p.mouse.move(700, 600);
await p.waitForTimeout(150);
const t1 = await token1();
ok("7) ao salvar, o token guarda a emanação (4 casas, opacidade 0,5, a cor escolhida)", t1.emanacao?.casas === 4 && t1.emanacao.alfa === 0.5 && Number.isInteger(t1.emanacao.cor), JSON.stringify(t1.emanacao));

// ---------------------------------------------------------------- a aura na tela
ok("8) a aura TINGE as casas em volta do token", (await tingimento(...dentro, baseDentro)) > 25);
ok("9) e não tinge as casas longe do alcance", (await tingimento(...longe, baseLonge)) < 6);

// ---------------------------------------------------------------- acompanha o arrasto
const alvo = await casa(9, 6);
q = await casa(3, 3);
await p.mouse.move(q.x, q.y);
await p.mouse.down();
await p.mouse.move((q.x + alvo.x) / 2, (q.y + alvo.y) / 2, { steps: 4 });
await p.mouse.move(alvo.x, alvo.y, { steps: 4 });
await p.mouse.up();
await p.waitForTimeout(300);
await p.mouse.move(700, 800);
await p.waitForTimeout(150);
const movido = await token1();
ok("10) o token foi arrastado para (9, 6)", movido.col === 9 && movido.row === 6, JSON.stringify(movido));
ok("11) a aura foi junto: as casas antigas voltaram ao normal e as novas (2 casas acima do token) ficaram tingidas", (await tingimento(...dentro, baseDentro)) < 6 && (await tingimento(9, 4, baseNoNovoLugar)) > 25);

// ---------------------------------------------------------------- o clique dentro da aura não pega o token
const naAura = await casa(9, 9); // dentro do alcance, longe do círculo
await p.mouse.move(naAura.x, naAura.y);
await p.mouse.down();
await p.mouse.move(naAura.x - 120, naAura.y, { steps: 4 });
await p.mouse.up();
await p.waitForTimeout(200);
const aposArrastoNaAura = await token1();
ok("12) arrastar começando DENTRO da aura (fora do círculo) não move o token", aposArrastoNaAura.col === 9 && aposArrastoNaAura.row === 6);

// ---------------------------------------------------------------- desligar
q = await casa(9, 6);
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
await p.click("#engrenagem");
await p.click("#botao-editar-token");
ok("13) reabrir a janela mostra a emanação ligada, com os valores guardados", (await p.isChecked("#editor-token-emana")) && (await p.inputValue("#editor-token-emana-metros")) === "6");
await p.uncheck("#editor-token-emana");
await p.click("#editor-token-salvar");
await p.waitForTimeout(400);
await p.mouse.move(700, 800);
await p.waitForTimeout(150);
ok("14) desligar a emanação a apaga do token e da tela", (await token1()).emanacao === null && (await tingimento(9, 4, baseNoNovoLugar)) < 6);

// ---------------------------------------------------------------- "Remover emanação" na lista de ações do botão direito
q = await casa(9, 6);
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
ok("15) um token SEM emanação não tem a ação 'Remover emanação'", (await p.locator("#menu-grupo-mapa button", { hasText: "Remover emanação" }).count()) === 0);
await p.keyboard.press("Escape");
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
await p.click("#engrenagem");
await p.click("#botao-editar-token");
await p.check("#editor-token-emana");
await p.click("#editor-token-salvar");
await p.waitForTimeout(400);
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
const remover = p.locator("#menu-grupo-mapa button", { hasText: "Remover emanação" });
ok("16) um token COM emanação ganha a ação 'Remover emanação' no painel de ações", (await remover.count()) === 1 && (await token1()).emanacao !== null);
await remover.click();
await p.waitForTimeout(400);
ok("17) clicar nela desliga a emanação do token", (await token1()).emanacao === null);

// ---------------------------------------------------------------- clique direito na AURA (fora do token): "Remover emanação"
await p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.nome === "Token 1"); t.emanacao = { casas: 3, cor: 0x42a5f5, alfa: 0.3 }; });
q = await casa(9, 8); // 2 casas do token (agora em 9, 6), dentro da aura e fora do círculo
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
const sob = p.locator("#menu-mapa #menu-mapa-sob button", { hasText: "Remover emanação" });
ok("18) o clique direito dentro da AURA mostra o menu de sempre E 'Remover emanação' (símbolo da emanação e ✕)", (await p.locator("#menu-mapa button", { hasText: "Régua" }).isVisible()) && (await sob.count()) === 1 && (await sob.locator(".icone-emanacao").count()) === 1);
await sob.click();
await p.waitForTimeout(300);
ok("19) clicar nele tira a emanação do token", (await token1()).emanacao === null);
q = await casa(9, 8);
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(300);
ok("20) sem emanação, o clique direito no mesmo lugar não mostra mais o item", (await p.locator("#menu-mapa #menu-mapa-sob button").count()) === 0);
await p.keyboard.press("Escape");

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
