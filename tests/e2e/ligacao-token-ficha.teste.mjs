// Teste e2e: a LIGAÇÃO ENTRE TOKEN E FICHA (modo LOCAL). Rodar: npm run test:e2e -- ligacao-token-ficha   (precisa do servidor: npm run dev)
//
// Pedido do dono (17/11/2026): clique direito do token = "Criar ficha" (sem ficha: nasce com o nome do token e ligada) ou "Abrir ficha"; a pesquisa e o "Criar ficha" no "Editar token";
// ficha ÚNICA (tem recursos) só aceita UM token (apagada no "Editar token", no clique direito da ficha e no "Botar"); a caixa "Tokens da ficha" (Tirar, Botar, filtro);
// miniaturas dos tokens no cartão da ficha; aviso VERMELHO quando uma ficha única tem vários tokens.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

// Três tokens na BOLSA (guardados) e uma ficha ÚNICA (tem recurso) e uma comum, postas direto no estado (o hook de teste).
const base = { imagem: null, col: 0, row: 0, corBorda: 0xffffff, size: 1, guardado: true };
await p.evaluate((b) => {
    const t = window.__tabuleirinho;
    t.semear([
        { ...b, id: 11, nome: "Aragorn", cor: 0x2ecc71 },
        { ...b, id: 12, nome: "Legolas", cor: 0x3498db },
        { ...b, id: 13, nome: "Gimli", cor: 0xe74c3c },
    ]);
    const nova = (id, nome, texto) => ({ id, nome, abas: [{ nome: "Página 1", texto }], versao: 1, criadaEm: 0, alteradaEm: 0, favorito: false, grupos: [] });
    t.estado.fichas.push(nova(101, "Herói Único", "PV::0:10:10"), nova(102, "Goblins", "FOR:: 10"));
    t.semear([]); // (só refaz a bolsa)
}, base);

const fichinha = (nome) => p.locator("#bolsa-itens .ficha", { hasText: nome });
const cartao = (nome) => p.locator("#bolsa-fichas-lista .bolsa-doc", { hasText: nome });
const tokenPorId = (id) => p.evaluate((i) => window.__tabuleirinho.estado.tokens.find((t) => t.id === i)?.ficha ?? null, id);
const editorFichaAberto = () => p.locator("#editor-ficha").isVisible();

// ----- 1) clique direito do token: "Criar ficha" (sem ficha) cria, liga, dá o nome do token e abre
await fichinha("Aragorn").click({ button: "right" });
ok("1a) token SEM ficha: o menu diz 'Criar ficha'", (await p.locator("#menu-ficha-ficha").innerText()) === "Criar ficha");
await p.click("#menu-ficha-ficha");
const idCriada = await tokenPorId(11);
ok("1b) o token ficou LIGADO a uma ficha nova", idCriada !== null && idCriada !== 101 && idCriada !== 102, String(idCriada));
ok("1c) a ficha nova tem o MESMO NOME do token e abriu", (await p.evaluate((i) => window.__tabuleirinho.estado.fichas.find((f) => f.id === i)?.nome, idCriada)) === "Aragorn" && (await editorFichaAberto()));
await p.click("#editor-ficha-x");
await fichinha("Aragorn").click({ button: "right" });
ok("1d) agora o menu diz 'Abrir ficha' (e não existe mais 'Trocar ficha')", (await p.locator("#menu-ficha-ficha").innerText()) === "Abrir ficha");
await p.click("#menu-ficha-ficha");
ok("1e) 'Abrir ficha' abre a ficha do token", await editorFichaAberto());
await p.click("#editor-ficha-x");

// ----- 2) "Editar token": o menu suspenso da ficha tem a PESQUISA DENTRO e a lista é filtrada na hora; e o "Criar ficha"
await fichinha("Legolas").click({ button: "right" });
await p.click("#menu-ficha-editar");
ok("2a) o 'Editar token' tem o botão da ficha e '+ Criar ficha'", (await p.locator("#editor-token-ficha").isVisible()) && (await p.locator("#editor-token-ficha-criar").isVisible()) && !(await p.locator("#editor-token-ficha-painel").isVisible()));
await p.click("#editor-token-ficha");
ok("2b) abrir o menu mostra a pesquisa DENTRO dele, já com o cursor, e a lista", (await p.locator("#editor-token-ficha-painel #editor-token-ficha-busca").isVisible()) && (await p.evaluate(() => document.activeElement?.id)) === "editor-token-ficha-busca" && (await p.locator("#editor-token-ficha-lista li").count()) >= 3);
await p.keyboard.type("heroi"); // (sem acento e sem maiúsculas)
const textos = await p.locator("#editor-token-ficha-lista li").allInnerTexts();
ok("2c) a lista é FILTRADA ao digitar (fica 'Herói Único', some 'Goblins')", textos.length === 1 && textos[0].includes("Herói"), textos.join("|"));
await p.keyboard.press("Escape");
ok("2d) o 1º Esc fecha só o menu (a janela continua)", !(await p.locator("#editor-token-ficha-painel").isVisible()) && (await p.locator("#editor-token").isVisible()));
await p.click("#editor-token-ficha");
await p.keyboard.type("gob");
await p.keyboard.press("Enter");
ok("2e) Enter escolhe o primeiro da lista e o botão mostra 'Goblins'", (await p.locator("#editor-token-ficha").innerText()) === "Goblins" && (await p.locator("#editor-token-ficha-criar").isHidden()));
await p.click("#editor-token-cancelar");

// ----- 3) ficha ÚNICA aceita um token só
await p.evaluate(() => { window.__tabuleirinho.estado.tokens.find((t) => t.id === 11).ficha = 101; window.__tabuleirinho.semear([]); });
await fichinha("Legolas").click({ button: "right" });
await p.click("#menu-ficha-editar");
await p.click("#editor-token-ficha");
const opcaoUnica = p.locator("#editor-token-ficha-lista li", { hasText: "Herói Único" });
ok("3a) no 'Editar token' a ficha única OCUPADA aparece apagada (e não se escolhe)", (await opcaoUnica.getAttribute("aria-disabled")) === "true");
await p.click("#editor-token-cancelar");
await p.click("#bolsa-aba-fichas");
await cartao("Herói Único").click({ button: "right" });
ok("3b) clique direito da ficha única ocupada: 'Adicionar a um token' APAGADO, com a dica do motivo", (await p.locator("#menu-doc-adicionar-token").isDisabled()) && /Aragorn/.test((await p.locator("#menu-doc-adicionar-token").getAttribute("title")) ?? ""));
ok("3c) 'Gerar um token' também fica apagado", await p.locator("#menu-doc-gerar-token").isDisabled());
await p.keyboard.press("Escape");
await cartao("Goblins").click({ button: "right" });
ok("3d) ficha COMUM: 'Adicionar a um token' continua à mão", await p.locator("#menu-doc-adicionar-token").isEnabled());
await p.keyboard.press("Escape");

// ----- 4) a caixa "Tokens da ficha": tirar, botar e filtro
await cartao("Herói Único").click({ button: "right" });
await p.click("#menu-doc-tokens");
ok("4a) a caixa lista o token ligado (Aragorn)", (await p.locator("#tokens-ficha-ligados li").allInnerTexts()).join().includes("Aragorn"));
ok("4b) com a ficha única ocupada, todo 'Botar' está apagado", (await p.locator("#tokens-ficha-livres li button:not([disabled])").count()) === 0);
await p.click("#tokens-ficha-ligados li button");
ok("4c) 'Tirar' desfaz só a LIGAÇÃO (o token continua existindo)", (await tokenPorId(11)) === null && (await p.evaluate(() => window.__tabuleirinho.estado.tokens.some((t) => t.id === 11))));
await p.fill("#tokens-ficha-busca", "legol");
ok("4d) o filtro mostra só o Legolas", (await p.locator("#tokens-ficha-livres li").count()) === 1);
await p.click("#tokens-ficha-livres li button");
ok("4e) 'Botar' liga o token à ficha", (await tokenPorId(12)) === 101);
await p.fill("#tokens-ficha-busca", "");
ok("4f) agora que a ficha única está ocupada de novo, os outros 'Botar' apagam", (await p.locator("#tokens-ficha-livres li button:not([disabled])").count()) === 0);
await p.click("#tokens-ficha-fechar");

// ----- 5) miniaturas nos cartões e aviso VERMELHO (ficha única com vários tokens)
ok("5a) o cartão da ficha mostra a miniatura do token ligado, MAIOR (token sozinho)", (await cartao("Herói Único").locator(".bolsa-doc-tokens .disco.mini").count()) === 1 && (await cartao("Herói Único").locator(".disco.mini").evaluate((e) => e.getBoundingClientRect().width)) >= 28);
const caixaDoc = async () => {
    const c = cartao("Herói Único");
    const [cartaoCx, tokens, nome] = await Promise.all([c.boundingBox(), c.locator(".bolsa-doc-tokens").boundingBox(), c.locator(".bolsa-doc-nome").boundingBox()]);
    return { cartaoCx, tokens, nome };
};
const d1 = await caixaDoc();
ok("5a2) cartão: tokens na metade de CIMA, nome na de BAIXO (grudado na base), sem ícone de documento", d1.tokens.y + d1.tokens.height <= d1.nome.y + 2 && d1.nome.y >= d1.cartaoCx.y + d1.cartaoCx.height * 0.4 && (await cartao("Herói Único").locator(".bolsa-doc-folha").count()) === 0, JSON.stringify(d1));
ok("5a3) o token sozinho é modesto (cabe na metade de cima)", d1.tokens.height <= d1.cartaoCx.height / 2 + 2);
ok("5b) sem excesso de tokens não há aviso", (await p.locator(".bolsa-doc.erro-unica").count()) === 0);
await p.evaluate(() => { const e = window.__tabuleirinho.estado; e.tokens.find((t) => t.id === 13).ficha = 101; window.__tabuleirinho.semear([]); });
ok("5c) com 2 tokens na ficha única o cartão ganha o aviso em VERMELHO", (await cartao("Herói Único").locator(".bolsa-doc-alerta").count()) === 1 && (await p.locator(".bolsa-doc.erro-unica").count()) === 1);
ok("5d) o cartão mostra as 2 miniaturas, na MESMA fileira (alinhadas)", (await cartao("Herói Único").locator(".bolsa-doc-tokens .disco.mini").count()) === 2 && await cartao("Herói Único").locator(".bolsa-doc-tokens .disco.mini").evaluateAll((l) => new Set(l.map((e) => Math.round(e.getBoundingClientRect().y))).size === 1));
await cartao("Herói Único").dblclick();
ok("5e) a janela da ficha mostra o aviso vermelho", await p.locator("#editor-ficha-aviso-unica").isVisible());
const cor = await p.locator("#editor-ficha-aviso-unica").evaluate((e) => getComputedStyle(e).color);
ok("5f) o aviso é vermelho", /^rgb\(255, 107, 99\)$/.test(cor), cor);
await p.click("#editor-ficha-x");

await nav.close();
process.exitCode = terminar(erros); // (o executor lê o código de saída)
