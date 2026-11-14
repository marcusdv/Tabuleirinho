// Teste e2e: SELEÇÃO na bolsa, como no Windows (modo LOCAL). Rodar: npm run test:e2e -- bolsa-selecao   (precisa do servidor: npm run dev)
//
// 1º clique seleciona, o 2º clique no único selecionado abre (nas duas bolsas); SELECIONAR VÁRIOS só vale na bolsa em TELA CHEIA (as partes 3 a 5 rodam nela; na do canto o Ctrl+clique não soma); Ctrl+clique soma, Shift+clique faz intervalo, Ctrl+A seleciona tudo; arrastar numa área
// vazia da lista desenha um retângulo que seleciona o que toca; com 2 ou mais selecionados aparece a barra de ações (e o clique direito abre o menu
// em grupo) e "Excluir" apaga todos com UMA confirmação. "+ Criar ficha" já abre a ficha nova e "+ Criar token" cria um token genérico e abre o "Editar token".
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const docs = () => p.locator("#bolsa-fichas-lista .bolsa-doc");
const marcados = () => p.locator("#bolsa-fichas-lista .bolsa-doc.selecionada").count();
const barra = () => p.locator("#bolsa-selecao-barra").isVisible();
const editorAberto = () => p.locator("#editor-ficha").isVisible();
const fecharEditor = async () => { if (await editorAberto()) await p.click("#editor-ficha-x"); };

await p.click("#bolsa-aba-fichas");
await p.click("#bolsa-ficha-criar-botao");
ok("1) '+ Criar ficha' já ABRE a ficha recém-criada", await editorAberto());
await fecharEditor();
for (let i = 0; i < 2; i++) await criarFichaFechada(p);
ok("1b) há 3 fichas e nenhuma está com o editor aberto", (await docs().count()) === 3 && !(await editorAberto()));

// (ficha SEM conteúdo é excluída direto, sem caixa de confirmação: elas ganham texto para o teste da exclusão em grupo)
await p.evaluate(() => window.__tabuleirinho.estado.fichas.forEach((f) => { f.abas[0].texto = "conteúdo"; }));

// ----- clicar seleciona; clicar de novo abre
await p.evaluate(() => document.getElementById("bolsa-ficha-criar-botao").blur());
await docs().nth(0).click();
ok("2a) o 1º clique SELECIONA (não abre)", (await marcados()) === 1 && !(await editorAberto()) && !(await barra()));
await docs().nth(0).click();
ok("2b) o 2º clique no mesmo (único selecionado) ABRE a ficha", await editorAberto());
await fecharEditor();
await docs().nth(1).click();
ok("2c) clicar em OUTRO item muda a seleção para ele (não abre)", (await marcados()) === 1 && (await docs().nth(1).getAttribute("class")).includes("selecionada") && !(await editorAberto()));

// ----- na bolsa do CANTO, Ctrl+clique NÃO soma (um item só por vez)
await docs().nth(0).click();
await docs().nth(1).click({ modifiers: ["Control"] });
ok("2d) no canto, Ctrl+clique troca a seleção em vez de somar (1 selecionado, sem barra)", (await marcados()) === 1 && !(await barra()));
await p.keyboard.press("Escape");
await p.click("#bolsa-gerenciar"); // daqui em diante, a TELA CHEIA

// ----- Ctrl, Shift, Ctrl+A
await docs().nth(1).click(); // (a seleção foi limpa pelo Esc: seleciona o 1º item para o Ctrl+clique SOMAR o segundo)
await docs().nth(2).click({ modifiers: ["Control"] });
ok("3a) Ctrl+clique SOMA um item e aparece a barra com '2 selecionados'", (await marcados()) === 2 && (await barra()) && /2 selecionados/.test(await p.locator("#bolsa-selecao-contagem").textContent()));
ok("3b) com a barra à vista (na linha das Instruções) o '+ Criar ficha' sai do caminho e a pesquisa continua onde está", (await p.locator("#bolsa-fichas-busca").isVisible()) && !(await p.locator("#bolsa-ficha-criar-botao").isVisible()));
await docs().nth(2).click({ modifiers: ["Control"] });
ok("3c) Ctrl+clique num selecionado TIRA ele (volta a 1 e a barra some)", (await marcados()) === 1 && !(await barra()));
await docs().nth(0).click();
await docs().nth(2).click({ modifiers: ["Shift"] });
ok("3d) Shift+clique seleciona o INTERVALO (3 itens)", (await marcados()) === 3);
await p.keyboard.press("Escape");
ok("3e) Esc tira a seleção", (await marcados()) === 0 && !(await barra()));
await docs().nth(0).focus();
await p.keyboard.press("Control+a");
ok("3f) Ctrl+A seleciona tudo", (await marcados()) === 3);
await p.keyboard.press("Escape");

// ----- retângulo de seleção (arrastar numa área VAZIA da lista)
const lista = await p.locator("#bolsa-fichas-lista").boundingBox();
const primeiro = await docs().nth(0).boundingBox();
await p.mouse.move(lista.x + lista.width - 24, lista.y + lista.height - 6); // canto de baixo: vazio (a lista tem 3 linhas e só há 1 de itens)
await p.mouse.down();
await p.mouse.move(lista.x + 4, primeiro.y + 10, { steps: 6 });
ok("4a) durante o arrasto o retângulo aparece", await p.locator("#bolsa-retangulo").isVisible());
await p.mouse.up();
ok("4b) ao soltar, os itens tocados ficam selecionados e o retângulo some", (await marcados()) === 3 && !(await p.locator("#bolsa-retangulo").isVisible()));
await p.mouse.click(lista.x + lista.width - 24, lista.y + lista.height - 6);
ok("4c) um clique simples numa área vazia limpa a seleção", (await marcados()) === 0);

// ----- clique direito e exclusão em grupo
await docs().nth(0).click();
await docs().nth(1).click({ modifiers: ["Control"] });
await docs().nth(1).click({ button: "right" });
ok("5a) clique direito com 2 selecionados abre o menu em GRUPO ('Excluir 2 fichas')", (await p.locator("#menu-selecao").isVisible()) && (await p.locator("#menu-selecao-excluir").textContent()) === "Excluir 2 fichas" && !(await p.locator("#menu-doc").isVisible()));
await p.keyboard.press("Escape");
await docs().nth(2).click({ button: "right" });
ok("5b) clique direito num item FORA da seleção seleciona só ele e abre o menu normal", (await marcados()) === 1 && (await p.locator("#menu-doc").isVisible()));
await p.keyboard.press("Escape");
await docs().nth(0).click();
await docs().nth(1).click({ modifiers: ["Control"] });
await p.click("#bolsa-selecao-excluir");
ok("5c) 'Excluir' da barra pede UMA confirmação com o número", (await p.locator("#confirmar").isVisible()) && /2 fichas/.test(await p.locator("#confirmar-titulo").textContent()));
await p.click("#confirmar-ok");
await p.waitForTimeout(150);
ok("5d) confirmar apaga as duas (sobra 1) e a barra some", (await docs().count()) === 1 && !(await barra()));

// ----- tokens: '+ Criar token' (da bolsa do canto) cria um genérico e abre o 'Editar token'
await p.click("#bolsa-fechar");
await p.click("#bolsa-aba-tokens");
const antes = await p.evaluate(() => window.__tabuleirinho.estado.tokens.length);
await p.click("#bolsa-criar-token-botao");
await p.waitForTimeout(150);
const depois = await p.evaluate(() => window.__tabuleirinho.estado.tokens.length);
ok("6a) '+ Criar token' cria UM token genérico e o 'Editar token' abre nele", depois === antes + 1 && (await p.locator("#editor-token").isVisible()), `${antes} -> ${depois}`);
ok("6b) a tela cheia NÃO abriu (o formulário completo continua no ⤢)", !(await p.evaluate(() => document.getElementById("bolsa").classList.contains("expandida"))));
await p.keyboard.press("Escape");
ok("6c) o token novo aparece na bolsa, selecionado", (await p.locator("#bolsa-itens .ficha.selecionada").count()) === 1);

ok("7) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
