// Teste e2e: TEXTO COLORIDO, NOME DA ROLAGEM, INSTRUÇÕES e DICAS do editor de ficha, no modo LOCAL. Rodar: npm run test:e2e -- fichas-cores
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// O botão "Instruções" fica ao lado de "+ Criar ficha" e abre uma janela com a explicação e vários exemplos (Esc e o fundo fecham). No
// editor, o campo tem por cima uma camada de CORES (o texto do campo é transparente): nome e valor das variáveis, o NOME da rolagem (entre
// parênteses, com fundo próprio e a dica com a fórmula calculada; o clique destaca a rolagem na lista) e a FÓRMULA (entre colchetes), com
// sublinhado vermelho nos erros. As duas camadas precisam ficar ALINHADAS (mesmo texto, mesma altura, mesma rolagem) e o mouse passa para o
// campo, menos nos nomes das rolagens. No painel lateral, a tela de rolagens fica em cima e as dicas de uso (formais, com mais de um exemplo)
// ficam embaixo e NÃO somem. "Ver todas as instruções" abre a janela por cima do editor, e o Esc fecha só ela.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const textos = (seletor) => p.locator(seletor).allTextContents();
const cor = (seletor, prop = "color") => p.locator(seletor).first().evaluate((el, prop) => getComputedStyle(el)[prop], prop);

// ================= o botão "Instruções" ao lado de "Criar ficha"
await p.click("#bolsa-aba-fichas");
ok("0a) na bolsa do canto o botão 'Instruções' NÃO aparece (e '+ Criar ficha' fica na linha da pesquisa)", (await p.locator("#bolsa-ficha-instrucoes").isHidden()) && (await p.locator("#bolsa-ficha-criar-botao").isVisible()));
await p.click("#bolsa-gerenciar");
ok("0c) na tela EXPANDIDA das fichas ele aparece", await p.locator("#bolsa-ficha-instrucoes").isVisible());
const bCriar = await p.locator("#bolsa-ficha-criar-botao").boundingBox();
const bInstr = await p.locator("#bolsa-ficha-instrucoes").boundingBox();
const bolsa = await p.locator("#bolsa").boundingBox();
ok("1a) na tela expandida o botão 'Instruções' fica dentro da bolsa, e o '+ Criar ficha' (agora no cabeçalho, ao lado da pesquisa) também", bInstr.x >= bolsa.x && bInstr.x + bInstr.width <= bolsa.x + bolsa.width && bCriar.x >= bolsa.x && bCriar.x + bCriar.width <= bolsa.x + bolsa.width, JSON.stringify({ bCriar, bInstr }));
await p.click("#bolsa-ficha-instrucoes");
ok("1b) clicar abre a janela 'Instruções: variáveis e rolagens'", (await p.locator("#ajuda-fichas").isVisible()) && (await p.locator("#ajuda-fichas-titulo").textContent()) === "Instruções: variáveis e rolagens");
const corpo = await p.locator("#ajuda-fichas-corpo").textContent();
ok("1c) explica variáveis ('FOR:: 16') e rolagens ('Escreva o nome da rolagem entre parênteses e a fórmula entre colchetes')", /FOR:: 16/.test(corpo) && /Escreva o nome da rolagem entre parênteses e a fórmula entre colchetes/.test(corpo));
ok("1d) tem MAIS DE UM exemplo de rolagem (5) e mais de um de variável (3)", (await p.locator("#ajuda-fichas .rolagem-nome").count()) >= 5 && (await p.locator("#ajuda-fichas pre .variavel-nome").count()) >= 3, `${await p.locator("#ajuda-fichas .rolagem-nome").count()}`);
await p.keyboard.press("Escape");
ok("1e) Esc fecha as instruções", await p.locator("#ajuda-fichas").isHidden());
await p.click("#bolsa-ficha-instrucoes");
await p.mouse.click(5, 5);
ok("1f) clicar no fundo escuro também fecha", await p.locator("#ajuda-fichas").isHidden());

// ================= o editor: texto colorido
await p.click("#bolsa-ficha-criar-botao");
await p.click(".bolsa-doc");
ok("2a) com o texto vazio: avisos 'Nenhuma variável/rolagem definida.' em cima e as DICAS fixas embaixo", (await p.locator("#editor-ficha-sem-variaveis").isVisible()) && (await p.locator("#editor-ficha-sem-rolagens").isVisible()) && (await p.locator("#editor-ficha-dicas").isVisible()));
const texto = "FOR:: 16\nPROF:: 3\nMOD:: (FOR - 10) / 2\nOpa:: XPTO + 1\n\n(Ataque com espada)[1d20 + MOD + PROF]\n(Dano)[1d8 + MOD]\n(Errada)[1d20 + SORTE]\n[2d6]\nCom <img src=x onerror=alert> no meio";
await p.fill("#editor-ficha-texto", texto);
const camada = await p.locator("#editor-ficha-cores").evaluate((el) => el.textContent);
ok("3a) a camada de cores mostra EXATAMENTE o mesmo texto do campo (+ a quebra final)", camada === texto + "\n", JSON.stringify(camada.slice(0, 60)));
ok("3b) o texto do campo ficou transparente (só a camada colorida aparece) e o cursor continua visível", (await cor("#editor-ficha-texto")) === "rgba(0, 0, 0, 0)" && (await cor("#editor-ficha-texto", "caretColor")) !== "rgba(0, 0, 0, 0)", `${await cor("#editor-ficha-texto")} / ${await cor("#editor-ficha-texto", "caretColor")}`);
ok("3c) nomes de variável: FOR, PROF, MOD, Opa", (await textos("#editor-ficha-cores .variavel-nome")).join() === "FOR,PROF,MOD,Opa", (await textos("#editor-ficha-cores .variavel-nome")).join());
ok("3d) valores das variáveis: 16, 3, (FOR - 10) / 2, XPTO + 1", (await textos("#editor-ficha-cores .variavel-valor")).join("|") === "16|3|(FOR - 10) / 2|XPTO + 1", (await textos("#editor-ficha-cores .variavel-valor")).join("|"));
ok("3e) o NOME da rolagem é a palavra entre PARÊNTESES (com eles): (Ataque com espada), (Dano), (Errada)", (await textos("#editor-ficha-cores .rolagem-nome")).join("|") === "(Ataque com espada)|(Dano)|(Errada)", (await textos("#editor-ficha-cores .rolagem-nome")).join("|"));
ok("3f) a FÓRMULA é o que está entre COLCHETES (com eles), inclusive a sem nome", (await textos("#editor-ficha-cores .rolagem-formula")).join("|") === "[1d20 + MOD + PROF]|[1d8 + MOD]|[1d20 + SORTE]|[2d6]", (await textos("#editor-ficha-cores .rolagem-formula")).join("|"));
const cVar = await cor("#editor-ficha-cores .variavel-nome"), cNome = await cor("#editor-ficha-cores .rolagem-nome"), cForm = await cor("#editor-ficha-cores .rolagem-formula");
ok("3g) as TRÊS categorias têm cores DIFERENTES (variável, nome da rolagem, fórmula)", new Set([cVar, cNome, cForm]).size === 3, `${cVar} | ${cNome} | ${cForm}`);
ok("3h) o nome da rolagem tem FUNDO próprio (é a palavra com função) e a fórmula também, mas de outra cor", (await cor("#editor-ficha-cores .rolagem-nome", "backgroundColor")) !== (await cor("#editor-ficha-cores .rolagem-formula", "backgroundColor")) && (await cor("#editor-ficha-cores .rolagem-nome", "backgroundColor")) !== "rgba(0, 0, 0, 0)");
ok("3i) o erro vira SUBLINHADO ondulado vermelho: a variável 'Opa' e a rolagem '(Errada)[...SORTE]'", (await p.locator("#editor-ficha-cores .variavel-nome.com-erro").allTextContents()).join() === "Opa" && (await p.locator("#editor-ficha-cores .rolagem-nome.com-erro").allTextContents()).join() === "(Errada)" && /underline/.test(await cor("#editor-ficha-cores .com-erro", "textDecorationLine")), "");
ok("3j) as rolagens e variáveis CERTAS não têm sublinhado", (await p.locator("#editor-ficha-cores .rolagem-nome:not(.com-erro)").count()) === 2 && (await p.locator("#editor-ficha-cores .variavel-nome:not(.com-erro)").count()) === 3);
ok("3k) HTML digitado fica como TEXTO (nenhum <img> na camada nem no painel)", (await p.locator("#editor-ficha-cores img, #editor-ficha-lateral img").count()) === 0 && camada.includes("<img src=x onerror=alert>"));

// ================= a função do nome: dica ao passar o mouse e clique
ok("4a) o NOME da rolagem tem a dica 'Clique para rolar' com a fórmula JÁ CALCULADA", (await p.locator("#editor-ficha-cores .rolagem-nome").first().getAttribute("title")) === "Clique para rolar: Ataque com espada: 1d20 + 3 + 3", await p.locator("#editor-ficha-cores .rolagem-nome").first().getAttribute("title"));
ok("4b) a dica do nome com erro mostra o motivo", /SORTE/.test((await p.locator("#editor-ficha-cores .rolagem-nome").nth(2).getAttribute("title")) ?? ""));
const caixaNome = await p.locator("#editor-ficha-cores .rolagem-nome").first().boundingBox();
const caixaVar = await p.locator("#editor-ficha-cores .variavel-nome").first().boundingBox();
const quemNoNome = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className ?? "", [caixaNome.x + 6, caixaNome.y + caixaNome.height / 2]);
const quemNaVar = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id ?? "", [caixaVar.x + 3, caixaVar.y + caixaVar.height / 2]);
ok("4c) o mouse atinge o NOME da rolagem, mas no resto do texto passa direto para o campo (dá para clicar e editar)", /rolagem-nome/.test(quemNoNome) && quemNaVar === "editor-ficha-texto", `${quemNoNome} | ${quemNaVar}`);
await p.focus("#editor-ficha-texto");
await p.mouse.click(caixaNome.x + 6, caixaNome.y + caixaNome.height / 2);
ok("4d) clicar no NOME destaca a rolagem 'Ataque com espada' na lista lateral (e rola: o cartão vai para o chat)", await p.locator("#editor-ficha-rolagens li").first().evaluate((li) => li.classList.contains("destaque")));
ok("4e) e o clique no nome NÃO tira o foco do campo de texto", (await p.evaluate(() => document.activeElement?.id)) === "editor-ficha-texto");
await p.waitForTimeout(1600);
ok("4f) o destaque some sozinho", !(await p.locator("#editor-ficha-rolagens li").first().evaluate((li) => li.classList.contains("destaque"))));

// ================= alinhamento e rolagem das duas camadas
const longo = Array.from({ length: 90 }, (_, i) => `Linha ${i}: (Ataque ${i})[1d20 + ${i}] um texto bem comprido para obrigar a quebra de linha dentro da caixa do editor ${"x".repeat(i % 40)}`).join("\n");
await p.fill("#editor-ficha-texto", longo);
const alturas = await p.evaluate(() => ({ campo: document.getElementById("editor-ficha-texto").scrollHeight, camada: document.getElementById("editor-ficha-cores").scrollHeight }));
ok("5a) com texto comprido e linhas que QUEBRAM, as duas camadas têm a MESMA altura (quebram nos mesmos lugares)", Math.abs(alturas.campo - alturas.camada) <= 1, JSON.stringify(alturas));
await p.evaluate(() => { const c = document.getElementById("editor-ficha-texto"); c.scrollTop = 777; });
await p.waitForTimeout(80);
const scrolls = await p.evaluate(() => ({ campo: document.getElementById("editor-ficha-texto").scrollTop, camada: document.getElementById("editor-ficha-cores").scrollTop }));
ok("5b) ao rolar o campo, a camada de cores ACOMPANHA (mesmo scrollTop)", scrolls.campo > 0 && scrolls.campo === scrolls.camada, JSON.stringify(scrolls));

// ================= o painel lateral: tela de rolagens em cima, dicas fixas embaixo
await p.fill("#editor-ficha-texto", "FOR:: 16\n(Ataque)[1d20 + FOR]\n(Dano)[1d8 + FOR]\n(Iniciativa)[1d20]");
const assist = await p.locator("#editor-ficha-assistente").boundingBox();
const dicas = await p.locator("#editor-ficha-dicas").boundingBox();
ok("6a) a tela de rolagens fica EM CIMA e as dicas EMBAIXO", dicas.y > assist.y + 20 && dicas.y + dicas.height <= (await p.locator("#editor-ficha-lateral").boundingBox()).y + (await p.locator("#editor-ficha-lateral").boundingBox()).height + 1, JSON.stringify({ assist, dicas }));
ok("6b) as dicas NÃO somem quando já há variáveis e rolagens (continuam visíveis)", (await p.locator("#editor-ficha-dicas").isVisible()) && (await p.locator("#editor-ficha-sem-variaveis").isHidden()));
const dicasTexto = await p.locator("#editor-ficha-dicas").textContent();
ok("6c) o texto das dicas é formal: 'Crie suas variáveis' / 'Crie suas rolagens' / 'Escreva o nome da rolagem entre parênteses e a fórmula entre colchetes.'", /Crie suas variáveis/.test(dicasTexto) && /Crie suas rolagens/.test(dicasTexto) && /Escreva o nome da rolagem entre parênteses e a fórmula entre colchetes\./.test(dicasTexto) && /Escreva o nome da variável, dois-pontos duplos e o valor/.test(dicasTexto), dicasTexto.slice(0, 200));
ok("6d) há mais de um exemplo em cada dica (3 variáveis e 3 rolagens, coloridos)", (await p.locator("#editor-ficha-dicas .variavel-nome").count()) === 3 && (await p.locator("#editor-ficha-dicas .rolagem-nome").count()) === 3);
ok("6e) a lista ao vivo mostra as variáveis e as rolagens (nome + fórmula calculada)", (await textos("#editor-ficha-variaveis li")).length === 1 && (await p.locator("#editor-ficha-rolagens li").count()) === 3);

// ================= o link para as instruções completas, por cima do editor
await p.click("#editor-ficha-instrucoes");
ok("7a) 'Ver todas as instruções' abre a janela POR CIMA do editor", (await p.locator("#ajuda-fichas").isVisible()) && (await p.locator("#editor-ficha").isVisible()));
await p.keyboard.press("Escape");
ok("7b) Esc fecha SÓ as instruções (o editor continua aberto com o texto)", (await p.locator("#ajuda-fichas").isHidden()) && (await p.locator("#editor-ficha").isVisible()) && (await p.inputValue("#editor-ficha-texto")).startsWith("FOR:: 16"));
ok("8) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
