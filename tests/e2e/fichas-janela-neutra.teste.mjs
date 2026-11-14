// Teste e2e: ARRASTAR a ficha por qualquer parte NEUTRA, e OCULTAR instruções/rolagens (vale para todas as fichas). Modo LOCAL.
// Rodar: npm run test:e2e -- fichas-janela-neutra  (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// Agarrar e arrastar o título, os rótulos, as folgas, o contador, os títulos e os itens de variável arrasta a janela; NÃO arrastam os campos, o
// texto da ficha, os parágrafos e exemplos das dicas (que se pode selecionar e copiar), os botões nem os itens clicáveis da lista de rolagens.
// Depois de arrastar, o foco continua no campo de texto. Os botões do alto ocultam/mostram as instruções e a tela de rolagens; sem as duas o painel
// lateral some; a escolha vale para TODAS as fichas e sobrevive a recarregar a página; o ✕ fecha (com alterações, pergunta antes).
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const caixa = (s) => p.locator(s).first().boundingBox();
const meio = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const posicao = async () => { const b = await caixa("#editor-ficha-painel"); return { x: b.x, y: b.y }; };
async function arrastarDe(ponto, dx = 60, dy = 40) {
    await p.mouse.move(ponto.x, ponto.y);
    await p.mouse.down();
    await p.mouse.move(ponto.x + dx / 2, ponto.y + dy / 2, { steps: 3 });
    await p.mouse.move(ponto.x + dx, ponto.y + dy, { steps: 3 });
    await p.mouse.up();
}
const moveu = async (ponto, esperado = true) => {
    const antes = await posicao();
    await arrastarDe(ponto);
    const depois = await posicao();
    const dx = depois.x - antes.x, dy = depois.y - antes.y;
    if (esperado) await arrastarDe({ x: ponto.x + 60, y: ponto.y + 40 }, -60, -40); // traz a janela de volta (senão ela sairia da tela aos poucos)
    return esperado ? Math.abs(dx - 60) <= 2 && Math.abs(dy - 40) <= 2 : Math.abs(dx) < 1 && Math.abs(dy) < 1;
};

await p.click("#bolsa-aba-fichas");
await criarFichaFechada(p);
await criarFichaFechada(p);
await p.locator(".bolsa-doc").first().dblclick();
await p.fill("#editor-ficha-texto", "FOR:: 16\n(Ataque)[1d20 + FOR]\num texto qualquer para selecionar");
await p.waitForTimeout(150);

// ================= 1) arrastar por cada parte NEUTRA
const painel = await caixa("#editor-ficha-painel");
ok("1a) pelo título 'Editar ficha'", await moveu(meio(await caixa("#editor-ficha-titulo"))));
ok("1b) pelo rótulo da versão", await moveu(meio(await caixa("#editor-ficha-versao"))));
let pn = await caixa("#editor-ficha-painel");
ok("1c) pela BORDA/folga esquerda da janela (o espaço entre a margem e o campo do nome)", await moveu({ x: pn.x + 8, y: pn.y + pn.height / 2 }));
pn = await caixa("#editor-ficha-painel");
ok("1d) pela folga de BAIXO da janela (embaixo do rodapé)", await moveu({ x: pn.x + pn.width / 2 - 100, y: pn.y + pn.height - 5 }));
ok("1e) pelo contador de caracteres do rodapé", await moveu(meio(await caixa("#editor-ficha-contagem"))));
ok("1f) pelo título 'Variáveis' do painel lateral", await moveu(meio(await caixa("#editor-ficha-assistente h4"))));
ok("1g) pelo item de uma variável da lista", await moveu(meio(await caixa("#editor-ficha-variaveis li"))));
ok("1h) o item de uma ROLAGEM da lista NÃO arrasta (ele é clicável: rola)", await moveu(meio(await caixa("#editor-ficha-rolagens li")), false));
const ass = await caixa("#editor-ficha-assistente");
ok("1i) pelo espaço vazio do painel de tela de rolagens", await moveu({ x: ass.x + 30, y: ass.y + ass.height - 8 }));
ok("1j) pelo título 'Crie suas variáveis' das instruções", await moveu(meio(await caixa("#editor-ficha-dicas h4"))));
const rod = await caixa("#editor-ficha-rodape");
ok("1k) pelo espaço vazio do rodapé (entre o aviso e os botões)", await moveu({ x: rod.x + rod.width - 220, y: rod.y + rod.height / 2 }));

// ================= 2) o que NÃO arrasta
const campoT = await caixa("#editor-ficha-texto");
const antesTexto = await posicao();
await p.mouse.move(campoT.x + 14, campoT.y + 14);
await p.mouse.down(); await p.mouse.move(campoT.x + 160, campoT.y + 14, { steps: 5 }); await p.mouse.up();
const depoisTexto = await posicao();
const selecionado = await p.evaluate(() => { const t = document.getElementById("editor-ficha-texto"); return t.selectionEnd - t.selectionStart; });
ok("2a) arrastar DENTRO do texto da ficha seleciona o texto e NÃO move a janela", Math.abs(depoisTexto.x - antesTexto.x) < 1 && Math.abs(depoisTexto.y - antesTexto.y) < 1 && selecionado > 3, `selecionou ${selecionado}`);
ok("2b) nem pelo campo do nome", await moveu(meio(await caixa("#editor-ficha-nome")), false));
ok("2c) nem por um parágrafo de dica (o texto das dicas se pode selecionar)", await moveu(meio(await caixa("#editor-ficha-dicas p")), false));
const par = await caixa("#editor-ficha-dicas p");
await p.mouse.move(par.x + 4, par.y + 6); await p.mouse.down(); await p.mouse.move(par.x + par.width - 10, par.y + 6, { steps: 6 }); await p.mouse.up();
const sel = await p.evaluate(() => window.getSelection()?.toString() ?? "");
ok("2d) e arrastar sobre o parágrafo da dica SELECIONA o texto (dá para copiar)", sel.length > 0, JSON.stringify(sel));
ok("2e) nem pelos exemplos (<pre>) das dicas", await moveu(meio(await caixa("#editor-ficha-dicas pre")), false));
ok("2f) nem por um botão (Salvar)", await moveu(meio(await caixa("#editor-ficha-salvar")), false));
ok("2g) nem pelo botão de ocultar as instruções", await moveu(meio(await caixa("#editor-ficha-alternar-dicas")), false));

// ================= 3) o foco continua no campo de texto depois de arrastar por uma parte neutra
await p.click("#editor-ficha-texto");
await moveu(meio(await caixa("#editor-ficha-versao")));
ok("3a) depois de arrastar por uma parte neutra o FOCO continua no campo de texto", (await p.evaluate(() => document.activeElement?.id)) === "editor-ficha-texto");
ok("3b) cursor: mãozinha nas partes neutras e cursor de texto nas dicas", (await p.locator("#editor-ficha-versao").evaluate((e) => getComputedStyle(e).cursor)) === "grab" && (await p.locator("#editor-ficha-dicas p").first().evaluate((e) => getComputedStyle(e).cursor)) === "text");
const ponto = meio(await caixa("#editor-ficha-versao"));
await p.mouse.move(ponto.x, ponto.y); await p.mouse.down(); await p.mouse.move(ponto.x + 20, ponto.y + 10, { steps: 2 });
ok("3c) durante o arrasto a janela mostra a mãozinha fechada ('grabbing')", /arrastando/.test((await p.locator("#editor-ficha-painel").getAttribute("class")) ?? "") && (await p.locator("#editor-ficha-versao").evaluate((e) => getComputedStyle(e).cursor)) === "grabbing");
await p.mouse.up();

// ================= 4) ocultar instruções e ajuda: vale para TODAS as fichas
ok("4a) começam as duas partes à vista e os botões dizem 'Ocultar'", (await p.locator("#editor-ficha-dicas").isVisible()) && (await p.locator("#editor-ficha-assistente").isVisible()) && (await p.textContent("#editor-ficha-alternar-dicas")) === "Ocultar instruções" && (await p.textContent("#editor-ficha-alternar-rolagens")) === "Ocultar rolagens");
const larguraCom = (await caixa("#editor-ficha-texto")).width;
await p.click("#editor-ficha-alternar-dicas");
ok("4b) 'Ocultar instruções' esconde as dicas e o botão vira 'Mostrar instruções' (a tela de rolagens continua)", (await p.locator("#editor-ficha-dicas").isHidden()) && (await p.locator("#editor-ficha-assistente").isVisible()) && (await p.textContent("#editor-ficha-alternar-dicas")) === "Mostrar instruções");
await p.click("#editor-ficha-alternar-rolagens");
ok("4c) 'Ocultar rolagens' esconde a tela de rolagens; sem as duas partes o painel lateral SOME e o texto ocupa a largura toda", (await p.locator("#editor-ficha-lateral").isHidden()) && (await caixa("#editor-ficha-texto")).width > larguraCom + 200, `${larguraCom} -> ${(await caixa("#editor-ficha-texto")).width}`);
await p.keyboard.press("Control+s"); // (salva antes: sem alterações, o ✕ fecha direto)
await p.click("#editor-ficha-x");
ok("4d) o ✕ do alto fecha a ficha (sem alterações, fecha direto)", await p.locator("#editor-ficha").isHidden());
await p.locator(".bolsa-doc").nth(1).dblclick();
ok("4e) ao abrir OUTRA ficha (a 2), as duas partes CONTINUAM ocultas e os botões dizem 'Mostrar'", (await p.locator("#editor-ficha-lateral").isHidden()) && (await p.textContent("#editor-ficha-alternar-dicas")) === "Mostrar instruções" && (await p.textContent("#editor-ficha-alternar-rolagens")) === "Mostrar rolagens");
await p.click("#editor-ficha-x");
await p.reload();
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true);
await p.click("#bolsa-aba-fichas");
await criarFichaFechada(p);
await p.locator(".bolsa-doc").first().dblclick();
ok("4f) depois de RECARREGAR a página (uma ficha nova), a escolha continua: tudo oculto", (await p.locator("#editor-ficha-lateral").isHidden()) && (await p.textContent("#editor-ficha-alternar-rolagens")) === "Mostrar rolagens");
await p.click("#editor-ficha-alternar-dicas");
ok("4g) 'Mostrar instruções' traz de volta só as instruções, ocupando o painel lateral todo", (await p.locator("#editor-ficha-lateral").isVisible()) && (await p.locator("#editor-ficha-dicas").isVisible()) && (await p.locator("#editor-ficha-assistente").isHidden()) && (await caixa("#editor-ficha-dicas")).height > 150);
await p.click("#editor-ficha-alternar-rolagens");
ok("4h) 'Mostrar rolagens' traz de volta a tela de rolagens: as duas partes à vista", (await p.locator("#editor-ficha-dicas").isVisible()) && (await p.locator("#editor-ficha-assistente").isVisible()));
// o ✕ com alterações pergunta
await p.fill("#editor-ficha-texto", "algo ainda não salvo");
await p.click("#editor-ficha-x");
ok("4i) o ✕ com alterações não salvas pergunta antes (caixa do jogo)", (await p.locator("#confirmar").isVisible()) && (await p.locator("#editor-ficha").isVisible()));
await p.click("#confirmar-cancelar");
ok("4j) cancelar mantém a ficha aberta com o texto", (await p.locator("#editor-ficha").isVisible()) && (await p.inputValue("#editor-ficha-texto")) === "algo ainda não salvo");
ok("5) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
