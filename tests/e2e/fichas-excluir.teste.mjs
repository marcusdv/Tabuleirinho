// Teste e2e: EXCLUIR FICHA e o PAINEL DE VARIÁVEIS E ROLAGENS, no modo LOCAL. Rodar: npm run test:e2e -- fichas-excluir
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// O clique direito num documento da grade abre o menu do jogo ("Abrir e editar", "Excluir ficha"); a tecla Delete também exclui. Excluir
// sempre pede a confirmação (a caixa do jogo, nunca a do navegador) e cancelar não apaga. No editor, o painel lateral mostra as variáveis
// com os valores e as rolagens (nome + fórmula já calculada), os erros no lugar do valor, e atualiza enquanto se digita; HTML digitado vira
// texto puro.
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
const nativos = [];
p.on("dialog", async (d) => { nativos.push(d.message()); await d.dismiss(); });
await abrirPagina(p);

const nomes = () => p.locator(".bolsa-doc-nome").allTextContents();
const estadoFichas = () => p.evaluate(() => window.__tabuleirinho.estado.fichas.map((f) => ({ id: f.id, nome: f.nome })));
const caixaAberta = () => p.locator("#confirmar").isVisible();
const lateral = async (seletor) => p.locator(`${seletor} li`).evaluateAll((els) => els.map((e) => ({ nome: e.querySelector(".nome")?.textContent, valor: e.querySelector(".valor")?.textContent, erro: e.classList.contains("com-erro") })));

await p.click("#bolsa-aba-fichas");
for (let i = 0; i < 3; i++) await criarFichaFechada(p);
// (ficha SEM conteúdo é excluída direto, sem caixa de confirmação: aqui elas ganham texto para o teste da caixa)
await p.evaluate(() => window.__tabuleirinho.estado.fichas.forEach((f) => { f.abas[0].texto = "conteúdo"; }));
ok("0) 3 fichas criadas", (await nomes()).join() === "Ficha 1,Ficha 2,Ficha 3");

// ---------- excluir: menu do clique direito
await p.locator(".bolsa-doc").nth(1).click({ button: "right" });
const itens = await p.locator("#menu-doc button").allTextContents();
ok("1a) o clique direito num documento abre o MENU do jogo (e não o do navegador) com 'Abrir e editar', 'Favoritar', 'Grupos…' e 'Excluir ficha'", (await p.locator("#menu-doc").isVisible()) && itens.join("|") === "Abrir e editar|Favoritar|Grupos…|Excluir ficha", itens.join("|"));
await p.click("#menu-doc-excluir");
ok("1b) 'Excluir ficha' abre a caixa de confirmar (a do jogo), com o nome e o aviso", (await caixaAberta()) && (await p.locator("#confirmar-titulo").textContent()) === "Excluir ficha" && /"Ficha 2"/.test(await p.locator("#confirmar-mensagem").textContent()) && /não pode ser desfeito/.test(await p.locator("#confirmar-mensagem").textContent()) && nativos.length === 0);
await p.click("#confirmar-cancelar");
ok("1c) cancelar NÃO exclui", (await nomes()).length === 3 && !(await caixaAberta()));
await p.locator(".bolsa-doc").nth(1).click({ button: "right" });
await p.click("#menu-doc-excluir");
await p.click("#confirmar-ok");
ok("1d) confirmar exclui a 'Ficha 2': some da grade e do estado", (await nomes()).join() === "Ficha 1,Ficha 3" && (await estadoFichas()).map((f) => f.id).join() === "1,3", JSON.stringify(await estadoFichas()));
ok("1e) o menu fechou", await p.locator("#menu-doc").isHidden());

// ---------- excluir: tecla Delete no documento focado
await p.locator(".bolsa-doc").first().focus();
await p.keyboard.press("Delete");
ok("2a) Delete num documento focado também pede a confirmação", (await caixaAberta()) && /"Ficha 1"/.test(await p.locator("#confirmar-mensagem").textContent()));
await p.keyboard.press("Escape");
ok("2b) Esc cancela (nada excluído)", !(await caixaAberta()) && (await nomes()).length === 2);

// ---------- o menu abre o editor
await p.locator(".bolsa-doc").first().click({ button: "right" });
await p.click("#menu-doc-abrir");
ok("3) 'Abrir e editar' do menu abre o editor", await p.locator("#editor-ficha").isVisible());

// ---------- painel de variáveis e rolagens
ok("4a) com o texto vazio o painel mostra 'Nenhuma variável/rolagem definida.' e as DICAS de uso ficam embaixo", (await p.locator("#editor-ficha-sem-variaveis").isVisible()) && (await p.locator("#editor-ficha-sem-rolagens").isVisible()) && (await p.locator("#editor-ficha-dicas").isVisible()));
await p.fill("#editor-ficha-texto", "FOR:: 16\nPROF:: 3\nMOD:: (FOR - 10) / 2\nOpa:: XPTO + 1\n\n(Ataque com espada)[1d20 + MOD + PROF]\n(Dano)[1d8 + MOD]\n(Errada)[1d20 + SORTE]\n[2d6]\n[ ] tarefa que não é rolagem");
await p.waitForTimeout(300);
const vs = await lateral("#editor-ficha-variaveis"), rs = await lateral("#editor-ficha-rolagens");
ok("4b) as variáveis aparecem com os valores calculados (FOR 16, PROF 3, MOD 3)", vs.find((v) => v.nome === "FOR")?.valor === "16" && vs.find((v) => v.nome === "PROF")?.valor === "3" && vs.find((v) => v.nome === "MOD")?.valor === "3", JSON.stringify(vs));
ok("4c) uma variável com problema mostra o ERRO no lugar do valor", vs.find((v) => v.nome === "Opa")?.erro === true && /não definida: XPTO/.test(vs.find((v) => v.nome === "Opa")?.valor ?? ""), JSON.stringify(vs.find((v) => v.nome === "Opa")));
ok("4d) as rolagens mostram o NOME e a fórmula com os valores ('1d20 + 3 + 3')", rs[0]?.nome === "Ataque com espada" && rs[0].valor === "1d20 + 3 + 3" && rs[1]?.nome === "Dano" && rs[1].valor === "1d8 + 3", JSON.stringify(rs));
ok("4e) uma rolagem com variável inexistente mostra o erro", rs[2]?.nome === "Errada" && rs[2].erro === true && /SORTE/.test(rs[2].valor), JSON.stringify(rs[2]));
ok("4f) sem nome, a própria fórmula é o nome ('2d6'), e '[ ]' (sem dado) não vira rolagem", rs[3]?.nome === "2d6" && rs.length === 4, JSON.stringify(rs.map((r) => r.nome)));
ok("4g) com itens, os avisos de 'nenhuma' somem, mas as DICAS de uso continuam à vista", (await p.locator("#editor-ficha-sem-variaveis").isHidden()) && (await p.locator("#editor-ficha-sem-rolagens").isHidden()) && (await p.locator("#editor-ficha-dicas").isVisible()));
// atualiza enquanto digita
await p.fill("#editor-ficha-texto", "FOR:: 20\n(Atq)[1d20 + (FOR - 10) / 2]");
await p.waitForTimeout(300);
ok("4h) muda ao digitar (FOR 20 -> '1d20 + (20 - 10) / 2')", (await lateral("#editor-ficha-rolagens"))[0]?.valor === "1d20 + (20 - 10) / 2", JSON.stringify(await lateral("#editor-ficha-rolagens")));
// o HTML digitado vira TEXTO (nada é interpretado)
await p.fill("#editor-ficha-texto", "(<img src=x onerror=alert>)[1d20]\n<b>X</b>:: 1");
await p.waitForTimeout(300);
ok("4i) HTML no nome da rolagem aparece como TEXTO puro (sem <img> criada)", (await p.locator("#editor-ficha-lateral img").count()) === 0 && /<img/.test((await lateral("#editor-ficha-rolagens"))[0]?.nome ?? ""), JSON.stringify(await lateral("#editor-ficha-rolagens")));
await p.fill("#editor-ficha-texto", "FOR:: 16\nPROF:: 3\nMOD:: (FOR - 10) / 2\n\n(Ataque com espada)[1d20 + MOD + PROF]\n(Dano)[1d8 + MOD]\n(Errada)[1d20 + SORTE]");
await p.waitForTimeout(300);
const lat = await p.locator("#editor-ficha-lateral").boundingBox();
const pn = await p.locator("#editor-ficha-painel").boundingBox();
ok("4j) o painel lateral fica DENTRO da janela, à direita do texto", lat.x > pn.x + pn.width / 2 && lat.x + lat.width <= pn.x + pn.width, JSON.stringify({ lat, pn }));
await p.click("#editor-ficha-salvar");
await p.click("#editor-ficha-fechar");
ok("5) nenhum erro de JavaScript e nenhuma caixa nativa", erros.length === 0 && nativos.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
