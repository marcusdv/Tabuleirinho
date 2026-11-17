// Teste e2e: A PLANILHA DE STATUS e o "QUEM VÊ" (modo LOCAL). Rodar: npm run test:e2e -- status-planilha   (precisa do servidor: npm run dev)
//
// Pedido do dono (17/11/2026): a caixa dos status é uma planilha (colunas, linha de títulos, uma linha por status) e cada status tem o menu "Quem vê" com caixas de marcar (o mestre sempre vê; o
// dono do token, os leitores e editores e os outros jogadores). Confere a tabela, os títulos, o menu, e que marcar guarda no estado da mesa.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

await p.click("#bolsa-gerenciar"); // a tela cheia (o editor de status mora nela)
await p.waitForSelector(".status-tabela", { timeout: 5000 });
const titulos = (await p.locator(".status-tabela thead th").allInnerTexts()).map((t) => t.trim().toLowerCase()); // (o CSS escreve os títulos em maiúsculas)
ok("1a) a lista de status é uma PLANILHA com linha de títulos (Cor, Nome, Variável, Grupos, Quem vê, Barra, Núm., Rótulo, Arrasto)", ["cor", "nome", "variável", "grupos", "quem vê", "barra", "núm.", "rótulo", "arrasto"].every((t) => titulos.includes(t)), titulos.join("|"));
ok("1b) há uma linha para o HP de fábrica", (await p.locator(".status-tabela tbody tr").count()) === 1);
const alturaDaLinha = await p.locator(".status-tabela tbody tr").first().evaluate((e) => e.getBoundingClientRect().height);
ok("1c) a linha é compacta (até 40 px de altura)", alturaDaLinha <= 40, String(alturaDaLinha));
ok("1d) os quatro checkboxes (Barra, Núm., Rótulo e Arrasto) ficam sob os títulos (sem repetir o texto em cada linha)", (await p.locator(".status-tabela tbody td.status-celula-caixa input").count()) === 4 && !(await p.locator(".status-tabela tbody").innerText()).includes("Exibir"));

// o menu "Quem vê"
await p.locator(".status-tabela .status-quem").first().click();
const menu = p.locator(".status-menu-grupos");
const linhas = (await menu.locator("label").allInnerTexts()).map((t) => t.trim());
ok("2a) 'Quem vê' abre com caixas: Mestre, Dono do token, Leitores e editores do token, Outros jogadores", linhas.join("|") === "Mestre|Dono do token|Leitores e editores do token|Outros jogadores", linhas.join("|"));
ok("2b) a caixa do Mestre está marcada e TRAVADA (o mestre sempre vê)", (await menu.locator("label").first().locator("input").isChecked()) && (await menu.locator("label").first().locator("input").isDisabled()));
ok("2c) o padrão é todo mundo marcado (o botão diz 'Todos')", (await p.locator(".status-tabela .status-quem").first().innerText()).includes("Todos"));
await menu.locator("label", { hasText: "Outros jogadores" }).locator("input").uncheck();
const q1 = await p.evaluate(() => window.__tabuleirinho.estado.statusDaMesa[0].quemVe);
ok("2d) desmarcar 'Outros jogadores' vale NA HORA no estado da mesa", q1 && q1.outros === false && q1.dono === true && q1.leitores === true, JSON.stringify(q1));
ok("2e) o botão passa a dizer o que está marcado ('Mestre + Dono, Leitores')", (await p.locator(".status-tabela .status-quem").first().innerText()).includes("Mestre + Dono, Leitores"));
await menu.locator("label", { hasText: "Dono do token" }).locator("input").uncheck();
await menu.locator("label", { hasText: "Leitores" }).locator("input").uncheck();
ok("2f) tudo desmarcado = 'Só o mestre'", (await p.locator(".status-tabela .status-quem").first().innerText()).includes("Só o mestre"));
await p.keyboard.press("Escape");
ok("2g) Esc fecha só o menu (a tela cheia continua aberta)", !(await menu.count()) && (await p.locator(".status-tabela").isVisible()));

// as colunas de nome e variável são estreitas e o "Rótulo" liga o nome no tabuleiro
const larguras = await p.evaluate(() => ["c-nome", "c-variavel", "c-grupos"].map((c) => document.querySelector(`.status-tabela th.${c}`).getBoundingClientRect().width));
ok("2h) as colunas Nome e Variável são mais estreitas que a de Grupos", larguras[0] < larguras[2] * 0.7 && larguras[1] < larguras[2] * 0.7, larguras.join(" / "));
const caixaRotulo = p.locator(".status-tabela tbody tr").first().locator("td.status-celula-caixa input").nth(2);
ok("2i) o 'Rótulo' (mostrar nome no tabuleiro) vem ligado no HP de fábrica", await caixaRotulo.isChecked());
await caixaRotulo.uncheck();
ok("2j) desligar o Rótulo vale NA HORA no estado da mesa", (await p.evaluate(() => window.__tabuleirinho.estado.statusDaMesa[0].mostrarNome)) === false);

// um status novo nasce com todos marcados e na planilha
await p.click(".status-novo");
ok("3a) '+ Status' acrescenta uma linha na planilha", (await p.locator(".status-tabela tbody tr").count()) === 2);
const q2 = await p.evaluate(() => window.__tabuleirinho.estado.statusDaMesa.at(-1).quemVe);
ok("3b) o status novo nasce com 'Quem vê' = todos", q2 && q2.dono && q2.leitores && q2.outros, JSON.stringify(q2));

await nav.close();
process.exitCode = terminar(erros); // (o executor lê o código de saída)
