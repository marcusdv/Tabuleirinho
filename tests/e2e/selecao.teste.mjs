// Teste e2e: SELEÇÃO de tokens no tabuleiro. Rodar: npm run test:e2e -- selecao (precisa do npm run dev).
// Clique seleciona; clicar fora ou Esc desseleciona; Ctrl + arrastar no vazio seleciona vários; arrastar um selecionado move o grupo (tudo ou nada: se algum sair do tabuleiro, todos voltam);
// Delete remove os selecionados sem confirmar (com "Desfazer"); o botão direito com vários selecionados só oferece "Remover do tabuleiro".
import { abrirPagina, lancar, lerEstado, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 1000 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

/** O centro de uma casa (ou do bloco size×size) na TELA. */
const tela = (col, row, size = 1) => p.evaluate(([c, r, s]) => { const cam = window.__tabuleirinho.camera; return cam.mundoParaTela((c + s / 2) * 64, (r + s / 2) * 64); }, [col, row, size]);
const selecionados = () => p.evaluate(() => window.__tabuleirinho.selecionados().sort());
const pos = (id) => lerEstado(p, `(e) => { const t = e.tokens.find((t) => t.id === ${id}); return { col: t.col, row: t.row, guardado: t.guardado }; }`);
const clicar = async (col, row, { ctrl = false, ...opcoes } = {}) => { const q = await tela(col, row); if (ctrl) await p.keyboard.down("Control"); await p.mouse.click(q.x, q.y, opcoes); if (ctrl) await p.keyboard.up("Control"); };
async function arrastar(de, para, { ctrl = false } = {}) {
    const a = await tela(...de);
    const b = await tela(...para);
    if (ctrl) await p.keyboard.down("Control");
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await p.mouse.move(b.x, b.y, { steps: 6 });
    await p.mouse.up();
    if (ctrl) await p.keyboard.up("Control");
}

// 1) um clique seleciona; clicar fora ou Esc desseleciona
await clicar(3, 3);
ok("1a) clicar no token 1 o seleciona", JSON.stringify(await selecionados()) === "[1]");
await clicar(8, 8);
ok("1b) clicar no vazio desseleciona", (await selecionados()).length === 0);
await clicar(6, 5);
ok("1c) clicar no token 2 seleciona só ele", JSON.stringify(await selecionados()) === "[2]");
await p.keyboard.press("Escape");
ok("1d) Esc desseleciona", (await selecionados()).length === 0);

// 2) Ctrl + arrastar no vazio desenha o retângulo e seleciona os que ficaram dentro (tokens 1 e 2)
await arrastar([2, 2], [7, 6], { ctrl: true });
ok("2a) o retângulo com Ctrl seleciona os tokens 1 e 2 (e só eles)", JSON.stringify(await selecionados()) === "[1,2]", JSON.stringify(await selecionados()));
// Ctrl + clique liga/desliga um token na seleção
await clicar(12, 6, { ctrl: true });
ok("2b) Ctrl + clique ACRESCENTA o token 5", JSON.stringify(await selecionados()) === "[1,2,5]");
await clicar(12, 6, { ctrl: true });
ok("2c) Ctrl + clique de novo o TIRA da seleção", JSON.stringify(await selecionados()) === "[1,2]");

// 3) arrastar um selecionado move o grupo junto
await arrastar([3, 3], [5, 3]);
ok("3a) arrastar o token 1 duas casas à direita leva o 2 junto", (await pos(1)).col === 5 && (await pos(2)).col === 8 && (await pos(2)).row === 5, JSON.stringify([await pos(1), await pos(2)]));

// 4) tudo ou nada: se um sai do tabuleiro, TODOS voltam
await arrastar([8, 5], [8, 11]); // (para BAIXO: para a direita o soltar cairia em cima da bolsa, que remove)
const depois = [await pos(1), await pos(2)];
ok("4a) mover o grupo para fora do tabuleiro é INVÁLIDO: os dois ficam onde estavam", depois[0].col === 5 && depois[1].col === 8 && depois[0].row === 3 && depois[1].row === 5, JSON.stringify(depois));
ok("4b) a seleção continua", JSON.stringify(await selecionados()) === "[1,2]");

// 5) o botão direito com vários selecionados só oferece remover
await clicar(5, 3, { button: "right" });
ok("5a) o botão direito com vários NÃO abre a engrenagem do token", await p.locator("#engrenagem").isHidden());
ok("5b) o aviso oferece 'Remover do tabuleiro'", (await p.locator("#aviso-acao").textContent()).includes("Remover do tabuleiro") && (await p.locator("#aviso-texto").textContent()).includes("2 tokens"));
await p.click("#aviso-acao");
ok("5c) remove os dois, sem pedir confirmação", (await pos(1)).guardado && (await pos(2)).guardado && (await p.locator("#confirmar").isHidden()));
ok("5d) o aviso oferece 'Desfazer' e ele devolve os dois ao tabuleiro", (await p.locator("#aviso-acao").textContent()) === "Desfazer");
await p.click("#aviso-acao");
ok("5e) desfeito: os dois voltam onde estavam", !(await pos(1)).guardado && !(await pos(2)).guardado && (await pos(1)).col === 5 && (await pos(2)).col === 8);

// 6) Delete remove os selecionados
await arrastar([2, 2], [10, 7], { ctrl: true });
ok("6a) de novo selecionados (1 e 2; o 5 está em 12,6, fora)", JSON.stringify(await selecionados()) === "[1,2]", JSON.stringify(await selecionados()));
await p.keyboard.press("Delete");
ok("6b) Delete remove os selecionados do tabuleiro, sem confirmar", (await pos(1)).guardado && (await pos(2)).guardado && (await p.locator("#confirmar").isHidden()) && (await selecionados()).length === 0);
ok("6c) o token 5, que não estava selecionado, continua no tabuleiro", !(await pos(5)).guardado);
ok("7) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));

await nav.close();
process.exitCode = terminar(erros);
