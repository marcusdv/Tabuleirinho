// Teste e2e: EDITOR DE FICHA no modo LOCAL (sem servidor). Rodar: npm run test:e2e -- fichas-editor
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs. O lado do servidor é do teste `fichas-edicao-servidor`.
//
// Clicar (ou Enter) num documento da grade da aba Fichas abre o editor (nome e texto). Salvar (botão ou Ctrl+S) sobe a versão; o botão só
// vale quando algo mudou (um espaço a mais no nome não conta). Fechar com alterações não salvas pergunta na caixa de confirmar (Esc na
// caixa cancela só ela); sem alterações fecha direto. O contador e os limites (nome 40, texto 25000) aparecem na tela.
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const ficha = () => p.evaluate(() => { const f = window.__tabuleirinho.estado.fichas[0]; return f && { nome: f.nome, texto: f.abas[0].texto, versao: f.versao }; });
const aberto = () => p.locator("#editor-ficha").isVisible();
const confirmarAberta = () => p.locator("#confirmar").isVisible();
const versao = () => p.locator("#editor-ficha-versao").textContent();

await p.click("#bolsa-aba-fichas");
await criarFichaFechada(p);
const antesBolsa = await p.locator("#bolsa").getAttribute("class");
await p.locator(".bolsa-doc").dblclick();
ok("1a) clicar no documento abre o editor", await aberto());
ok("1b) clicar no documento NÃO expande a bolsa por baixo", ((await p.locator("#bolsa").getAttribute("class")) ?? "") === (antesBolsa ?? ""), await p.locator("#bolsa").getAttribute("class"));
ok("1c) mostra o nome 'Ficha 1', texto vazio e 'Versão 1'", (await p.inputValue("#editor-ficha-nome")) === "Ficha 1" && (await p.inputValue("#editor-ficha-texto")) === "" && (await versao()) === "Versão 1", await versao());
ok("1d) o botão Salvar começa DESABILITADO (nada mudou) e o foco está no texto", (await p.isDisabled("#editor-ficha-salvar")) && (await p.evaluate(() => document.activeElement?.id)) === "editor-ficha-texto");
ok("1e) limites do navegador: nome 40 e texto 25000", (await p.getAttribute("#editor-ficha-nome", "maxlength")) === "40" && (await p.getAttribute("#editor-ficha-texto", "maxlength")) === "25000");

// editar e salvar com Ctrl+S
await p.fill("#editor-ficha-texto", "FOR:: 16\nDEX:: 14\n\nAtaque (Espada)[1d20 + FOR]");
ok("2a) ao digitar: Salvar habilita, a versão avisa 'alterações não salvas' e o contador conta", !(await p.isDisabled("#editor-ficha-salvar")) && /alterações não salvas/.test(await versao()) && (await p.locator("#editor-ficha-contagem").textContent()) === "46/25000", `${await versao()} / ${await p.locator("#editor-ficha-contagem").textContent()}`);
await p.keyboard.press("Control+s");
let f = await ficha();
ok("2b) Ctrl+S salva: versão 2, texto guardado, aviso e Salvar desabilitado de novo", f.versao === 2 && f.texto.startsWith("FOR:: 16") && (await versao()) === "Versão 2" && /Salva na versão 2/.test(await p.locator("#editor-ficha-aviso").textContent()) && (await p.isDisabled("#editor-ficha-salvar")), JSON.stringify({ f, v: await versao() }));
ok("2c) o editor continua aberto depois de salvar", await aberto());

// renomear e salvar pelo botão
await p.fill("#editor-ficha-nome", "Goblin   Arqueiro");
await p.click("#editor-ficha-salvar");
f = await ficha();
ok("3a) renomear + botão Salvar: versão 3 e nome limpo (espaços juntados)", f.versao === 3 && f.nome === "Goblin Arqueiro" && (await p.inputValue("#editor-ficha-nome")) === "Goblin Arqueiro", JSON.stringify(f));
await p.fill("#editor-ficha-nome", "Goblin Arqueiro "); // só um espaço a mais: o servidor aparaaria, então NÃO é mudança
ok("3b) um espaço sobrando no nome NÃO conta como alteração (Salvar continua desabilitado)", await p.isDisabled("#editor-ficha-salvar"));
await p.fill("#editor-ficha-nome", "Goblin Arqueiro");

// fechar com alterações: pergunta
await p.fill("#editor-ficha-texto", "texto novo que NÃO vou salvar");
await p.keyboard.press("Escape");
ok("4a) Esc com alterações não fecha: abre a caixa 'Fechar sem salvar?'", (await confirmarAberta()) && (await aberto()) && (await p.locator("#confirmar-titulo").textContent()) === "Fechar sem salvar?", await p.locator("#confirmar-titulo").textContent());
await p.keyboard.press("Escape");
ok("4b) Esc na caixa só cancela ELA: o editor continua aberto com o texto", !(await confirmarAberta()) && (await aberto()) && (await p.inputValue("#editor-ficha-texto")) === "texto novo que NÃO vou salvar");
await p.click("#editor-ficha-fechar");
await p.click("#confirmar-cancelar");
ok("4c) Fechar + Cancelar: continua aberto", (await aberto()) && !(await confirmarAberta()));
await p.click("#editor-ficha-fechar");
await p.click("#confirmar-ok");
f = await ficha();
ok("4d) Fechar + 'Fechar sem salvar': a janela fecha e a ficha continua na versão 3 (o texto novo foi descartado)", !(await aberto()) && f.versao === 3 && f.texto.startsWith("FOR:: 16"), JSON.stringify(f));

// reabrir: sem alterações fecha direto
await p.focus(".bolsa-doc");
await p.keyboard.press("Enter");
ok("5a) Enter no documento (teclado) abre o editor, com o conteúdo salvo", (await aberto()) && (await p.inputValue("#editor-ficha-texto")).startsWith("FOR:: 16") && (await versao()) === "Versão 3");
await p.keyboard.press("Escape");
ok("5b) sem alterações, Esc fecha direto (sem perguntar)", !(await aberto()) && !(await confirmarAberta()));
ok("5c) a grade mostra o nome novo e 'v3'", (await p.locator(".bolsa-doc-nome").textContent()) === "Goblin Arqueiro" && (await p.locator(".bolsa-doc small").textContent()) === "v3");

// texto no limite / contador
await p.locator(".bolsa-doc").dblclick();
await p.fill("#editor-ficha-texto", "a".repeat(25000));
ok("6) 25000 caracteres: o contador marca o limite e dá para salvar", (await p.locator("#editor-ficha-contagem").textContent()) === "25000/25000" && !(await p.isDisabled("#editor-ficha-salvar")));
await p.click("#editor-ficha-salvar");
ok("7) salvou os 25000 caracteres (versão 4)", (await ficha()).versao === 4 && (await ficha()).texto.length === 25000);
ok("8) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
