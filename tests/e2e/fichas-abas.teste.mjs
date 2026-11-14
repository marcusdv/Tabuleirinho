// Teste e2e: as ABAS (páginas) da ficha. Rodar: npm run test:e2e -- fichas-abas   (precisa do servidor: npm run dev; modo LOCAL, sem rede)
//
// Parte A (código puro, no Node): `analisarAbas` junta as variáveis de TODAS as abas (uma aba usa a variável escrita em outra), mas cada aba só tem as
// rolagens do seu texto, com as posições DENTRO da própria aba; `fichaValida` lê o arquivo antigo (só `texto`) como uma ficha de uma aba, e o novo (`abas`).
// Parte B (navegador): a linha de abas em estilo de PASTA (clicar, "+", duplo clique ou menu do CLIQUE DIREITO para renomear, menu do clique direito para excluir; sem ✕), limite de 6, as variáveis de outra aba aparecem
// esmaecidas, cada aba lista as suas rolagens, salvar guarda todas as abas num só documento e rolar numa aba usa as variáveis da outra.
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";
import { analisarAbas } from "../../src/formulas.ts";
import { fichaValida } from "../../src/estado.ts";

// ================= A) o motor
const abas = analisarAbas(["FOR:: 16\nMOD:: (FOR - 10) / 2\n(Ataque)[1d20 + MOD]", "PROF:: 3\n(Dano)[1d8 + MOD + PROF]\n(Outro)[2d6]"]);
ok("A1) uma análise por aba", abas.length === 2 && abas[0].aba === 0 && abas[1].aba === 1);
ok("A2) as VARIÁVEIS são as da ficha toda, nas duas análises (FOR, MOD e PROF)", abas.every((a) => a.variaveis.map((v) => v.nome).join() === "FOR,MOD,PROF"), JSON.stringify(abas[1].variaveis.map((v) => v.nome)));
ok("A3) cada variável sabe a aba de onde veio", abas[0].variaveis.map((v) => v.aba).join() === "0,0,1");
ok("A4) cada aba só tem as SUAS rolagens", abas[0].rolagens.map((r) => r.nome).join() === "Ataque" && abas[1].rolagens.map((r) => r.nome).join() === "Dano,Outro");
ok("A5) a rolagem da aba 2 usa variáveis das DUAS abas: 1d8 + 3 + 3", abas[1].rolagens[0].resolvida === "1d8 + 3 + 3", String(abas[1].rolagens[0].resolvida));
const textoB = "PROF:: 3\n(Dano)[1d8 + MOD + PROF]\n(Outro)[2d6]";
ok("A6) as posições são DENTRO do texto da própria aba", abas[1].rolagens.every((r) => textoB.slice(r.posFormula.inicio, r.posFormula.fim).startsWith("[")) && textoB.slice(abas[1].variaveis[2].posNome.inicio, abas[1].variaveis[2].posNome.fim) === "PROF");
const duplicada = analisarAbas(["A:: 1", "A:: 2\n(X)[1d4 + A]"]);
ok("A7) variável repetida em outra aba: vale a primeira (a segunda dá erro)", duplicada[0].variaveis[1].erro !== null && duplicada[1].rolagens[0].resolvida === "1d4 + 1");
ok("A8) uma ficha de uma aba só se comporta como antes", analisarAbas(["(A)[1d6]"]).length === 1 && analisarAbas([""])[0].rolagens.length === 0);

const base = { id: 1, nome: "Goblin", versao: 1, criadaEm: 1, alteradaEm: 1 };
const antiga = fichaValida({ ...base, texto: "FOR:: 10" });
ok("A9) arquivo ANTIGO (só `texto`) vira uma ficha com UMA aba 'Página 1'", antiga?.abas.length === 1 && antiga.abas[0].nome === "Página 1" && antiga.abas[0].texto === "FOR:: 10", JSON.stringify(antiga));
const nova = fichaValida({ ...base, abas: [{ nome: "Ataques", texto: "a" }, { nome: "Magias", texto: "b" }] });
ok("A10) arquivo novo com `abas` é lido", nova?.abas.length === 2 && nova.abas[1].nome === "Magias");
ok("A11) 0 abas, 7 abas, aba sem nome ou com texto que não é texto: recusados", [
    { ...base, abas: [] },
    { ...base, abas: Array.from({ length: 7 }, () => ({ nome: "x", texto: "" })) },
    { ...base, abas: [{ nome: "", texto: "" }] },
    { ...base, abas: [{ nome: "x", texto: 5 }] },
    { ...base, abas: "oi" },
].every((f) => fichaValida(f) === null));
ok("A12) a SOMA dos textos das abas passa do limite (25000): recusado", fichaValida({ ...base, abas: [{ nome: "a", texto: "x".repeat(15000) }, { nome: "b", texto: "x".repeat(15000) }] }) === null);

// ================= B) o navegador
const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const nomesAbas = () => p.locator("#editor-ficha-abas-lista .aba-ficha").evaluateAll((els) => els.map((e) => e.querySelector(".aba-ficha-nome, .aba-ficha-campo")?.textContent ?? ""));
const abaAtiva = () => p.locator("#editor-ficha-abas-lista .aba-ficha.ativa .aba-ficha-nome").textContent();
const rolagensDaLista = () => p.locator("#editor-ficha-rolagens li").evaluateAll((els) => els.map((e) => e.querySelector(".nome")?.textContent));
const variaveisDaLista = () => p.locator("#editor-ficha-variaveis li").evaluateAll((els) => els.map((e) => ({ nome: e.querySelector(".nome")?.textContent, outra: e.classList.contains("de-outra-aba") })));
const excluirPorMenu = async (i) => { await p.locator("#editor-ficha-abas-lista .aba-ficha").nth(i).click({ button: "right" }); await p.click("#menu-aba-excluir"); };
const fichaNaMesa = () => p.evaluate(() => { const f = window.__tabuleirinho.estado.fichas[0]; return f && { versao: f.versao, abas: f.abas.map((a) => ({ nome: a.nome, texto: a.texto })) }; });
const cartoes = () => p.locator(".chat-mensagem.chat-rolagem-ficha").evaluateAll((els) => els.map((e) => ({ titulo: e.querySelector(".chat-titulo-ficha strong")?.textContent, total: Number(e.querySelector(".chat-total")?.textContent) })));

await p.click("#bolsa-aba-fichas");
await criarFichaFechada(p);
await p.locator(".bolsa-doc").first().dblclick();

ok("B1) uma ficha nova tem UMA aba, 'Página 1', sem ✕ nenhum e com o '+' ligado", (await nomesAbas()).join() === "Página 1" && (await p.locator(".aba-ficha-x").count()) === 0 && !(await p.isDisabled("#editor-ficha-aba-nova")), (await nomesAbas()).join());

await p.fill("#editor-ficha-texto", "FOR:: 16\nMOD:: (FOR - 10) / 2\n(Ataque)[1d20 + MOD]");
await p.click("#editor-ficha-aba-nova");
ok("B2) o '+' cria 'Página 2' e abre ela (vazia); continua sem ✕ nas abas", (await nomesAbas()).join() === "Página 1,Página 2" && (await abaAtiva()) === "Página 2" && (await p.inputValue("#editor-ficha-texto")) === "" && (await p.locator(".aba-ficha-x").count()) === 0);
ok("B3) as VARIÁVEIS da Página 1 aparecem na Página 2, esmaecidas (de outra aba); ainda não há rolagens aqui", JSON.stringify(await variaveisDaLista()) === JSON.stringify([{ nome: "FOR", outra: true }, { nome: "MOD", outra: true }]) && (await rolagensDaLista()).length === 0, JSON.stringify(await variaveisDaLista()));

await p.fill("#editor-ficha-texto", "(Dano)[1d8 + MOD]");
await p.waitForTimeout(100);
ok("B4) a Página 2 lista só a SUA rolagem (Dano), e usa o MOD da Página 1 sem erro", (await rolagensDaLista()).join() === "Dano" && (await p.locator("#editor-ficha-rolagens li.com-erro").count()) === 0, (await rolagensDaLista()).join());
await p.locator("#editor-ficha-abas-lista .aba-ficha-nome").first().click();
ok("B5) voltando à Página 1: o texto dela está lá e a lista só tem o 'Ataque'", (await p.inputValue("#editor-ficha-texto")).startsWith("FOR:: 16") && (await rolagensDaLista()).join() === "Ataque" && (await variaveisDaLista()).every((v) => !v.outra));

// ----- renomear (duplo clique)
await p.locator("#editor-ficha-abas-lista .aba-ficha-nome").nth(1).dblclick();
ok("B6) duplo clique no nome da aba troca o botão por um campo", (await p.locator(".aba-ficha-campo").count()) === 1);
await p.keyboard.press("Escape");
ok("B7) Esc no campo cancela SÓ a renomeação (a ficha continua aberta, nome antigo)", (await p.locator("#editor-ficha").isVisible()) && (await nomesAbas()).join() === "Página 1,Página 2");
await p.locator("#editor-ficha-abas-lista .aba-ficha-nome").nth(1).dblclick();
await p.fill(".aba-ficha-campo", "Ações");
await p.keyboard.press("Enter");
ok("B8) Enter confirma o novo nome ('Ações') e a ficha continua aberta", (await nomesAbas()).join() === "Página 1,Ações" && (await p.locator("#editor-ficha").isVisible()));
ok("B9) renomear conta como alteração não salva", /alterações não salvas/.test(await p.locator("#editor-ficha-versao").textContent()) && !(await p.isDisabled("#editor-ficha-salvar")));

// ----- salvar: UM documento com as duas abas
await p.locator("#editor-ficha-texto").focus();
await p.keyboard.press("Control+s");
await p.waitForTimeout(150);
const salva = await fichaNaMesa();
ok("B10) salvar guarda as DUAS abas no mesmo documento (versão 2)", salva.versao === 2 && salva.abas.length === 2 && salva.abas[1].nome === "Ações" && salva.abas[1].texto === "(Dano)[1d8 + MOD]" && salva.abas[0].texto.startsWith("FOR:: 16"), JSON.stringify(salva));
ok("B11) continua na aba que estava aberta (Ações, a que foi renomeada) e sem alterações pendentes", (await abaAtiva()) === "Ações" && !/não salvas/.test(await p.locator("#editor-ficha-versao").textContent()));

// ----- rolar na Página 2 (usa o MOD escrito na Página 1)
await p.locator("#editor-ficha-abas-lista .aba-ficha-nome").nth(1).click();
await p.locator("#editor-ficha-rolagens li[data-rolagem]").first().click();
await p.waitForTimeout(150);
const c = await cartoes();
ok("B12) rolar o 'Dano' da Página 2 mostra o cartão no chat com 1d8 + MOD(3): total de 4 a 11", c.length === 1 && c[0].titulo === "Dano" && c[0].total >= 4 && c[0].total <= 11, JSON.stringify(c));

// ----- limite de 6 abas
for (let i = 0; i < 4; i++) await p.click("#editor-ficha-aba-nova");
ok("B13) o limite é de 6 abas: com 6, o '+' fica desligado", (await nomesAbas()).length === 6 && (await p.isDisabled("#editor-ficha-aba-nova")), String((await nomesAbas()).length));

// ----- excluir uma aba
await excluirPorMenu(5); // a Página 6 (vazia): exclui direto, sem perguntar
ok("B14) excluir uma aba VAZIA não pergunta e libera o '+'", (await nomesAbas()).length === 5 && !(await p.locator("#confirmar").isVisible()) && !(await p.isDisabled("#editor-ficha-aba-nova")));
await excluirPorMenu(1); // 'Ações' tem texto salvo
ok("B15) excluir uma aba COM texto pergunta antes", (await p.locator("#confirmar").isVisible()) && (await p.locator("#confirmar-titulo").textContent()) === "Excluir página?");
await p.click("#confirmar-cancelar");
ok("B16) Cancelar mantém a aba", (await nomesAbas()).includes("Ações"));
await excluirPorMenu(1);
await p.click("#confirmar-ok");
ok("B17) confirmar remove a aba", !(await nomesAbas()).includes("Ações") && (await nomesAbas()).length === 4);
await excluirPorMenu(1); // a 'Página 2' (vazia): abre um buraco na contagem
ok("B18) o '+' usa o primeiro nome livre: com 'Página 1, 3, 4' a nova é 'Página 2' (sem repetir nome)", await (async () => { await p.click("#editor-ficha-aba-nova"); return (await abaAtiva()) === "Página 2" && new Set(await nomesAbas()).size === (await nomesAbas()).length; })());

// ----- nome com HTML é texto puro
await p.locator("#editor-ficha-abas-lista .aba-ficha-nome").last().dblclick();
await p.fill(".aba-ficha-campo", "<img src=x>");
await p.keyboard.press("Enter");
ok("B19) um nome de aba com HTML aparece como TEXTO (nenhum <img> na janela)", (await p.locator("#editor-ficha img").count()) === 0 && (await nomesAbas()).at(-1) === "<img src=x>");

// ----- fechar sem salvar e reabrir: volta ao que estava salvo (2 abas)
await p.click("#editor-ficha-fechar");
await p.click("#confirmar-ok");
await p.locator(".bolsa-doc").first().dblclick();
ok("B20) fechar sem salvar descarta as mudanças das abas: reabre com as 2 abas salvas", (await nomesAbas()).join() === "Página 1,Ações" && (await abaAtiva()) === "Página 1", (await nomesAbas()).join());

// ----- menu do CLIQUE DIREITO na aba
await p.locator("#editor-ficha-abas-lista .aba-ficha").nth(1).click({ button: "right" });
ok("C1) clique direito numa aba abre o menu com 'Renomear página' e 'Excluir página'", (await p.locator("#menu-aba").isVisible()) && (await p.locator("#menu-aba button").allTextContents()).join() === "Renomear página,Excluir página");
await p.keyboard.press("Escape");
ok("C2) Esc fecha SÓ o menu (a ficha continua aberta)", !(await p.locator("#menu-aba").isVisible()) && (await p.locator("#editor-ficha").isVisible()));
await p.locator("#editor-ficha-abas-lista .aba-ficha").nth(1).click({ button: "right" });
await p.click("#menu-aba-renomear");
await p.fill(".aba-ficha-campo", "Magias");
await p.keyboard.press("Enter");
ok("C3) 'Renomear página' pelo menu renomeia a aba", (await nomesAbas()).join() === "Página 1,Magias" && !(await p.locator("#menu-aba").isVisible()), (await nomesAbas()).join());
await p.locator("#editor-ficha-abas-lista .aba-ficha").first().click({ button: "right" });
await p.mouse.click(5, 5);
ok("C4) clicar fora fecha o menu", !(await p.locator("#menu-aba").isVisible()));
await excluirPorMenu(1);
await p.click("#confirmar-ok").catch(() => {}); // (se a aba tinha texto, confirma)
await p.locator("#editor-ficha-abas-lista .aba-ficha").first().click({ button: "right" });
ok("C5) com UMA só aba, 'Excluir página' fica desligado (a última não se exclui)", (await p.locator("#editor-ficha-abas-lista .aba-ficha").count()) === 1 && (await p.isDisabled("#menu-aba-excluir")));
await p.keyboard.press("Escape");

// ----- FORMATAÇÃO: botões, atalhos e visualização
const texto = () => p.inputValue("#editor-ficha-texto");
await p.fill("#editor-ficha-texto", "Olá mundo");
await p.locator("#editor-ficha-texto").evaluate((e) => { e.focus(); e.setSelectionRange(4, 9); }); // "mundo"
await p.click('[data-formatar="negrito"]');
ok("D1) o botão N cerca a seleção com ** (negrito)", (await texto()) === "Olá **mundo**", await texto());
await p.click('[data-formatar="negrito"]');
ok("D2) clicar de novo tira o negrito", (await texto()) === "Olá mundo", await texto());
await p.keyboard.press("Control+i");
ok("D3) Ctrl+I põe itálico (sem seleção: o par e o cursor no meio)", (await texto()) === "Olá *mundo*" || (await texto()).includes("**") === false && (await texto()).includes("*"), await texto());
await p.fill("#editor-ficha-texto", "Primeira\nSegunda");
await p.locator("#editor-ficha-texto").evaluate((e) => { e.focus(); e.setSelectionRange(2, 2); });
await p.click('[data-formatar="2"]');
ok("D4) o botão T2 põe '## ' no começo da linha do cursor", (await texto()) === "## Primeira\nSegunda", await texto());
await p.click('[data-formatar="3"]');
ok("D5) trocar para T3 troca o prefixo (sem empilhar #)", (await texto()) === "### Primeira\nSegunda", await texto());
await p.click('[data-formatar="0"]');
ok("D6) 'Aa' tira o título", (await texto()) === "Primeira\nSegunda", await texto());
await p.fill("#editor-ficha-texto", "# Grande\n### Pequeno\num **forte** e *torto* e ***os dois***\n<img src=x onerror=alert(1)> e <b>x</b>");
await p.click("#editor-ficha-ver");
const previa = await p.locator("#editor-ficha-previa").evaluate((el) => ({
    visivel: !el.hidden, t1: el.querySelector(".t1")?.textContent, t5: el.querySelector(".t3")?.textContent,
    fonteT1: parseFloat(getComputedStyle(el.querySelector(".t1")).fontSize), fonteT5: parseFloat(getComputedStyle(el.querySelector(".t3")).fontSize),
    negrito: [...el.querySelectorAll(".negrito:not(.italico)")].map((e) => e.textContent), italico: [...el.querySelectorAll(".italico:not(.negrito)")].map((e) => e.textContent),
    ambos: [...el.querySelectorAll(".negrito.italico")].map((e) => e.textContent), imgs: el.querySelectorAll("img, b").length, texto: el.textContent,
}));
ok("D7) 'Visualizar' mostra títulos (T1 maior que T3), negrito, itálico e os dois", previa.visivel && previa.t1 === "Grande" && previa.t5 === "Pequeno" && previa.fonteT1 > previa.fonteT5 && previa.negrito.join() === "forte" && previa.italico.join() === "torto" && previa.ambos.join() === "os dois", JSON.stringify(previa));
ok("D8) SEGURANÇA: HTML no texto aparece como letras (nenhum <img> nem <b> criado)", previa.imgs === 0 && previa.texto.includes("<img src=x onerror=alert(1)>") && previa.texto.includes("<b>x</b>"), JSON.stringify(previa));
ok("D9) com a visualização ligada os botões de formatar ficam desligados", await p.isDisabled('[data-formatar="negrito"]'));
await p.click("#editor-ficha-ver");
ok("D10) 'Editar' volta ao campo de texto, com o texto intacto (as marcas continuam lá)", !(await p.locator("#editor-ficha-previa").isVisible()) && (await texto()).startsWith("# Grande"));

// ----- LEITURA AUTOMÁTICA: ao SAIR do campo, o texto com marcas aparece formatado; clicar nele volta a editar
await p.fill("#editor-ficha-texto", "# Grande\num **forte**");
await p.focus("#editor-ficha-nome"); // (tira o foco do campo de texto)
await p.waitForTimeout(100);
ok("E1) ao sair do campo, o texto com marcas passa a aparecer FORMATADO (leitura automática)", (await p.locator("#editor-ficha-previa").isVisible()) && (await p.locator("#editor-ficha-previa .t1").count()) === 1);
await p.locator("#editor-ficha-previa").click();
ok("E2a) UM clique no texto da leitura NÃO volta a editar", await p.locator("#editor-ficha-previa").isVisible());
await p.locator("#editor-ficha-previa").dblclick();
ok("E2) o DUPLO clique na leitura volta ao campo de texto, com o foco nele", !(await p.locator("#editor-ficha-previa").isVisible()) && (await p.evaluate(() => document.activeElement?.id)) === "editor-ficha-texto");
await p.fill("#editor-ficha-texto", "texto simples, sem marcas");
await p.focus("#editor-ficha-nome");
await p.waitForTimeout(100);
ok("E3) sem nenhuma marca de formatação, o campo NÃO vira leitura (não há o que formatar)", !(await p.locator("#editor-ficha-previa").isVisible()));
await p.fill("#editor-ficha-texto", "**forte**");
await p.focus("#editor-ficha-texto");
await p.click("#editor-ficha-ver");
ok("E4) o botão 'Visualizar' continua funcionando (liga a leitura e vira 'Editar')", (await p.locator("#editor-ficha-previa").isVisible()) && (await p.locator("#editor-ficha-ver").textContent()) === "Editar");
await p.click("#editor-ficha-ver");
ok("E5) 'Editar' volta ao campo", !(await p.locator("#editor-ficha-previa").isVisible()));
await p.fill("#editor-ficha-texto", "FOR:: 2*3*4\n**forte**");
await p.focus("#editor-ficha-nome");
await p.waitForTimeout(100);
ok("E6) VARIÁVEIS NÃO são formatadas: 'FOR:: 2*3*4' aparece como texto puro (sem itálico)", (await p.locator("#editor-ficha-previa .italico").count()) === 0 && /FOR:: 2\*3\*4/.test(await p.locator("#editor-ficha-previa").textContent()));
await p.locator("#editor-ficha-previa").dblclick();
await p.locator("#editor-ficha-texto").evaluate((e) => { e.focus(); e.setSelectionRange(2, 2); });
await p.click('[data-formatar="negrito"]');
ok("E7) os botões N/I/T não mexem numa linha de variável (texto igual e aviso)", (await p.inputValue("#editor-ficha-texto")) === "FOR:: 2*3*4\n**forte**" && /Variáveis não têm formatação/.test(await p.locator("#editor-ficha-aviso").textContent()));

// ----- SALVAR: o BOTÃO leva à leitura; o Ctrl+S não
await p.fill("#editor-ficha-texto", "# Titulo\n(Rolar)[1d6]");
await p.keyboard.press("Control+s");
await p.waitForTimeout(150);
ok("F1) Ctrl+S salva e CONTINUA no modo de edição", !(await p.locator("#editor-ficha-previa").isVisible()));
await p.fill("#editor-ficha-texto", "# Titulo\n(Rolar)[1d6]\nmais");
await p.click("#editor-ficha-salvar");
await p.waitForTimeout(150);
ok("F2) o botão SALVAR salva e passa para o modo de LEITURA (formatada, com a rolagem clicável)", (await p.locator("#editor-ficha-previa").isVisible()) && (await p.locator("#editor-ficha-previa .t1").count()) === 1 && (await p.locator("#editor-ficha-previa .rolagem-previa").count()) === 1);
ok("F3) o foco fica no botão 'Editar' (dentro da janela: Esc e Ctrl+S continuam valendo)", (await p.evaluate(() => document.activeElement?.id)) === "editor-ficha-ver");

ok("B21) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
