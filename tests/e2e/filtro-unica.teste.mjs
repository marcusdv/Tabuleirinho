// Teste e2e: o FILTRO DE FICHAS ÚNICAS e a ALÇA DE TAMANHO DA COLUNA (modo LOCAL). Rodar: npm run test:e2e -- filtro-unica   (precisa do servidor: npm run dev)
//
// Pedidos do dono (17/11/2026): (1) na aba Fichas, o chip "Fichas únicas" mostra só as fichas únicas (as que têm recursos); na aba Tokens, o chip "De ficha única" mostra só os tokens que pertencem a uma
// ficha única; (2) a coluna da direita (chat e bolsa) tem uma alça no canto de cima à esquerda para diminuí-la em largura e altura, com um mínimo que protege o layout.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const base = { imagem: null, col: 0, row: 0, corBorda: 0xffffff, size: 1, guardado: true };
await p.evaluate((b) => {
    const t = window.__tabuleirinho;
    t.semear([{ ...b, id: 21, nome: "Heroi", cor: 0x2ecc71 }, { ...b, id: 22, nome: "Goblin", cor: 0xe74c3c }]);
    const nova = (id, nome, texto) => ({ id, nome, abas: [{ nome: "Página 1", texto }], versao: 1, criadaEm: 0, alteradaEm: 0, favorito: false, grupos: [] });
    t.estado.fichas.push(nova(301, "Ficha do Heroi", "PV::0:10:10"), nova(302, "Ficha do Goblin", "FOR:: 10"));
    t.estado.tokens.find((x) => x.id === 21).ficha = 301;
    t.estado.tokens.find((x) => x.id === 22).ficha = 302;
    t.semear([]);
}, base);

await p.click("#bolsa-gerenciar"); // (a tela cheia: é onde os chips de filtro aparecem; na bolsa pequena os filtros ficam no menu "Grupos")
const nomesDosTokens = () => p.locator("#bolsa-itens .ficha .ficha-nome").allInnerTexts();
const nomesDasFichas = () => p.locator("#bolsa-fichas-lista .bolsa-doc .bolsa-doc-nome").allInnerTexts();

// ----- tokens
ok("1a) sem filtro, a aba Tokens mostra os dois tokens", (await nomesDosTokens()).length === 2);
const chipTokens = p.locator("#bolsa-grupos-chips .chip-unica");
ok("1b) o chip 'De ficha única' existe na aba Tokens", (await chipTokens.count()) === 1 && /De ficha única/.test(await chipTokens.innerText()));
await chipTokens.click();
const so = await nomesDosTokens();
ok("1c) com o filtro, só o token da ficha única (Heroi)", so.length === 1 && so[0] === "Heroi", so.join("|"));
await p.locator("#bolsa-grupos-chips .chip-unica").click();
ok("1d) desligando o filtro, voltam os dois", (await nomesDosTokens()).length === 2);

// ----- fichas
await p.click("#bolsa-aba-fichas");
ok("2a) sem filtro, a aba Fichas mostra as duas fichas", (await nomesDasFichas()).length === 2);
const chipFichas = p.locator("#bolsa-grupos-chips .chip-unica");
ok("2b) o chip 'Fichas únicas' existe na aba Fichas", /Fichas únicas/.test(await chipFichas.innerText()));
await chipFichas.click();
const unicas = await nomesDasFichas();
ok("2c) com o filtro, só a ficha única (Ficha do Heroi)", unicas.length === 1 && unicas[0] === "Ficha do Heroi", unicas.join("|"));
await p.locator("#bolsa-grupos-chips .chip-unica").click();
await p.click("#bolsa-aba-tokens");
ok("2d) cada aba tem o seu filtro (o da aba Tokens continua desligado)", (await nomesDosTokens()).length === 2);

await p.click("#bolsa-fechar");

// ----- o filtro também está no menu "Grupos" da bolsa pequena
await p.click("#bolsa-filtro-grupos");
ok("2e) o menu 'Grupos' da bolsa pequena tem o filtro 'De ficha única'", (await p.locator("#menu-grupos button", { hasText: "De ficha única" }).count()) === 1);
await p.locator("#menu-grupos button", { hasText: "De ficha única" }).click();
const pelaBolsaPequena = await nomesDosTokens();
ok("2f) ligado por ali, só o token da ficha única aparece", pelaBolsaPequena.length === 1 && pelaBolsaPequena[0] === "Heroi", pelaBolsaPequena.join("|"));
await p.keyboard.press("Escape");

// ----- a alça de tamanho da coluna
const larg = () => p.locator("#chat").evaluate((e) => e.getBoundingClientRect().width);
const alt = () => p.locator("#chat").evaluate((e) => e.getBoundingClientRect().height);
const l0 = await larg(), a0 = await alt();
const alca = await p.locator("#chat-redimensionar").boundingBox();
ok("3a) a alça fica no canto de cima à esquerda da coluna", !!alca && alca.width > 0);
await p.mouse.move(alca.x + 6, alca.y + 6);
await p.mouse.down();
await p.mouse.move(alca.x + 66, alca.y + 126, { steps: 8 });
await p.mouse.up();
ok("3b) arrastar para a direita e para baixo DIMINUI a largura e a altura", (await larg()) < l0 - 40 && (await alt()) < a0 - 90, `${l0}->${await larg()}  ${a0}->${await alt()}`);
await p.mouse.move((await p.locator("#chat-redimensionar").boundingBox()).x + 6, (await p.locator("#chat-redimensionar").boundingBox()).y + 6);
await p.mouse.down();
await p.mouse.move(1390, 890, { steps: 8 });
await p.mouse.up();
ok("3c) há uma largura MÍNIMA (260 px) e uma altura mínima (280 px): o layout não quebra", (await larg()) >= 259 && (await alt()) >= 279, `${await larg()} x ${await alt()}`);
await p.locator("#chat-redimensionar").dblclick();
ok("3d) duplo clique na alça volta ao tamanho de fábrica", Math.abs((await larg()) - l0) < 2 && Math.abs((await alt()) - a0) < 2);

await nav.close();
process.exitCode = terminar(erros);
