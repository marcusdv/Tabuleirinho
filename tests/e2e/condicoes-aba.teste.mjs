// Teste e2e: a aba CONDIÇÕES da bolsa em tela cheia (modo local: não precisa de servidor). O mestre cria (com uma imagem ENORME, que vira um "print" pequeno), edita (inclusive uma de fábrica),
// exclui (com confirmação: o token perde a condição; o Morto NÃO se exclui) e restaura as de fábrica. Rodar: npm run test:e2e -- condicoes-aba (precisa do npm run dev).
import { PNG } from "pngjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

// uma imagem de 3000 x 3000 px (listras coloridas): o editor de recorte a reduz a um "print" de 256 px em WebP
const pasta = mkdtempSync(join(tmpdir(), "condicoes-"));
const png = new PNG({ width: 3000, height: 3000 });
for (let y = 0; y < 3000; y++) for (let x = 0; x < 3000; x++) { const i = (y * 3000 + x) * 4; png.data[i] = (x / 12) & 255; png.data[i + 1] = (y / 12) & 255; png.data[i + 2] = ((x + y) / 24) & 255; png.data[i + 3] = 255; }
const grande = join(pasta, "grande.png");
writeFileSync(grande, PNG.sync.write(png));

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

const lista = () => p.evaluate(async () => (await import("/src/condicoes.ts")).CONDICOES.map((c) => c.nome));
const cartao = (nome) => p.locator(".condicao-item", { hasText: nome }).first();

// 1) a aba só existe na bolsa em TELA CHEIA
ok("1a) na bolsa do canto não há a aba Condições", !(await p.locator("#bolsa-aba-condicoes").isVisible()));
await p.keyboard.press("q");
await p.waitForTimeout(500);
ok("1b) na bolsa em tela cheia a aba aparece", await p.locator("#bolsa-aba-condicoes").isVisible());
await p.click("#bolsa-aba-condicoes");
await p.waitForTimeout(300);
ok("1c) a aba lista as 18 condições de fábrica", (await p.locator(".condicao-item").count()) === 18 && (await p.locator("#bolsa-condicoes-restaurar").isDisabled()));

// 2) CRIAR, com a imagem enorme: o recorte a comprime
await p.click("#bolsa-condicoes-nova");
await p.waitForTimeout(200);
await p.click("#editor-condicao-salvar");
ok("2a) sem nome: o formulário recusa", /nome/i.test((await p.locator("#editor-condicao-aviso").textContent()) ?? ""));
await p.fill("#editor-condicao-nome", "Amaldiçoado");
await p.fill("#editor-condicao-descricao", "Desvantagem em resistências.\nNão cura em descanso curto.");
await p.click("#editor-condicao-salvar");
ok("2b) sem imagem: o formulário recusa (a criada precisa de ícone)", /imagem/i.test((await p.locator("#editor-condicao-aviso").textContent()) ?? ""));
const [seletor] = await Promise.all([p.waitForEvent("filechooser"), p.click("#editor-condicao-escolher")]);
await seletor.setFiles(grande);
await p.waitForSelector("#editor-imagem:not([hidden])");
await p.waitForTimeout(1200);
await p.click("#editor-imagem-usar"); // (o recorte abre POR CIMA do formulário: se ficasse atrás, este clique não chegaria)
await p.waitForTimeout(1000);
const previa = await p.evaluate(() => { const i = document.getElementById("editor-condicao-imagem"); return { visivel: !i.hidden, webp: i.src.startsWith("data:image/webp"), kb: Math.round(i.src.length / 1024) }; });
ok("2c) a imagem grande virou um 'print' WebP pequeno (menos de 60 KB)", previa.visivel && previa.webp && previa.kb < 60, JSON.stringify(previa));
await p.click("#editor-condicao-salvar");
await p.waitForTimeout(800);
const nomes = await lista();
ok("2d) a condição nova entrou na lista, antes do 'Morto'", nomes.length === 19 && nomes[nomes.length - 2] === "Amaldiçoado" && nomes[nomes.length - 1] === "Morto", nomes.slice(-3).join(", "));

// 3) EDITAR uma de fábrica e usar "Restaurar original"
await cartao("Cego").getByText("Editar").click();
await p.waitForTimeout(250);
ok("3a) numa condição de fábrica aparece 'Restaurar original'", await p.locator("#editor-condicao-original").isVisible());
await p.fill("#editor-condicao-nome", "Cegueira total");
await p.fill("#editor-condicao-descricao", "Linha A\n\nLinha B");
await p.click("#editor-condicao-salvar");
await p.waitForTimeout(500);
const editada = await p.evaluate(async () => { const c = (await import("/src/condicoes.ts")).buscarCondicao("Cego"); return { nome: c.nome, descricao: c.descricao }; });
ok("3b) a edição vale: novo nome e o texto do balão sem a linha vazia", editada.nome === "Cegueira total" && editada.descricao.join("|") === "Linha A|Linha B", JSON.stringify(editada));

// 4) EXCLUIR uma que um token tem: pede confirmação e o token perde a condição
await p.evaluate(() => { const t = window.__tabuleirinho; t.estado.tokens[0].condicoes = ["Cego", "Morto"]; t.tokens.redesenhar(t.estado.tokens[0]); });
await cartao("Cegueira total").getByText("Excluir").click();
await p.waitForTimeout(300);
ok("4a) a confirmação diz quantos tokens a têm", /1 token/.test((await p.locator("#confirmar-mensagem").textContent()) ?? ""));
await p.click("#confirmar-ok");
await p.waitForTimeout(500);
ok("4b) o token perdeu a condição excluída (e ficou com a outra)", (await p.evaluate(() => window.__tabuleirinho.estado.tokens[0].condicoes.join())) === "Morto");
ok("4c) a lista tem uma a menos e 'Restaurar as de fábrica (1)' fica ativo", (await lista()).length === 18 && /\(1\)/.test((await p.locator("#bolsa-condicoes-restaurar").textContent()) ?? "") && !(await p.locator("#bolsa-condicoes-restaurar").isDisabled()));

// 5) o MORTO não pode ser excluído (o jogo a usa para o X vermelho): o botão fica desabilitado; já "Restaurar as de fábrica" traz de volta o Cego
ok("5a) o Morto não tem 'Excluir' (botão desabilitado, com o motivo na dica)", (await cartao("Morto").getByText("Excluir").isDisabled()) && /não pode ser excluída/.test((await cartao("Morto").getByText("Excluir").getAttribute("title")) ?? ""));
ok("5b) o atalho do Morto no menu do token continua à vista", await p.evaluate(() => document.querySelector(".condicao-rapida")?.hidden === false));
await p.click("#bolsa-condicoes-restaurar");
await p.waitForTimeout(500);
const depois = await lista();
ok("5c) restaurar traz de volta o Cego, e o Morto continua por último", depois.length === 19 && depois.includes("Cego") && depois[depois.length - 1] === "Morto", depois.slice(-3).join(", "));
ok("5d) o Cego voltou ao nome original (a edição ficou só na que foi excluída)", (await p.evaluate(async () => (await import("/src/condicoes.ts")).buscarCondicao("Cego").nome)) === "Cego");

// 6) pesquisa e fechar a bolsa em tela cheia
await p.fill("#bolsa-condicoes-busca", "amaldi");
await p.waitForTimeout(200);
ok("6a) a pesquisa filtra pelo nome (sem acento e sem maiúsculas)", (await p.locator(".condicao-item").count()) === 1);
await p.fill("#bolsa-condicoes-busca", "");
await p.keyboard.press("q");
await p.waitForTimeout(500);
ok("6b) fechar a bolsa em tela cheia estando na aba Condições volta à aba de Tokens", (await p.evaluate(() => document.querySelector('#bolsa-abas [aria-selected="true"]')?.dataset.aba)) === "tokens");

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
