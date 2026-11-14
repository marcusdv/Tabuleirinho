// Teste e2e: ORDENAR, FAVORITOS e GRUPOS (tokens e fichas). Rodar: npm run test:e2e -- bolsa-organizar   (precisa do servidor: npm run dev; modo LOCAL)
//
// Parte A (código puro, no Node): grupos (criar, editar, excluir tirando a marca dos itens), favorito e grupos da ficha SEM subir a versão, arquivos
// ANTIGOS sem esses campos, `limparGrupos` (nada de grupo fantasma) e a forma dos pedidos novos da rede.
// Parte B (navegador): o "+ Grupo", o menu de grupos, a estrela, as ordens (mais/menos recentes, favoritos, por grupo, nome) e o filtro por grupo e por ★.
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";
import { estado, montarGrupo, receberGrupo, excluirGrupo, montarEdicaoDoGrupo, limparGrupos, montarFicha, receberFicha, montarMarcacaoDaFicha, tokenValido, fichaValida, criarToken, editarToken, definirGrupos } from "../../src/estado.ts";
import { lerPedido } from "../../src/protocolo.ts";

// ================= A) regras puras
definirGrupos([]);
const g1 = montarGrupo("  Goblins  ", 0xff0000);
receberGrupo(g1);
const g2 = montarGrupo("Aliados", 0x00ff00);
receberGrupo(g2);
ok("A1) o grupo nasce com id, nome limpo e cor", g1.id === 1 && g1.nome === "Goblins" && g1.cor === 0xff0000 && estado.grupos.length === 2);
ok("A2) nome vazio vira 'Grupo N'", montarGrupo("   ", 1).nome === "Grupo 3");
ok("A3) editar muda nome e cor (id igual)", JSON.stringify(montarEdicaoDoGrupo(1, { nome: "Orcs", cor: 5 })) === JSON.stringify({ id: 1, nome: "Orcs", cor: 5 }) && montarEdicaoDoGrupo(99, {}) === null);
ok("A4) limparGrupos descarta ids que não existem e repetidos", JSON.stringify(limparGrupos([2, 2, 99, 1])) === "[2,1]");

const t = criarToken(0xff0000, 1, "Goblin");
ok("A5) token novo: favorito=false, grupos=[]", t.favorito === false && t.grupos.length === 0);
editarToken(t.id, { favorito: true, grupos: [1, 2, 99] });
ok("A6) editarToken guarda favorito e só os grupos que existem", t.favorito === true && JSON.stringify(t.grupos) === "[1,2]");

const f = montarFicha();
receberFicha(f);
const marcada = montarMarcacaoDaFicha(f.id, { favorito: true, grupos: [2, 77] });
ok("A7) marcar a ficha NÃO sobe a versão nem muda a data de alteração", marcada.versao === f.versao && marcada.alteradaEm === f.alteradaEm && marcada.favorito === true && JSON.stringify(marcada.grupos) === "[2]");

const antigo = tokenValido({ id: 1, nome: "Velho", imagem: null, col: 0, row: 0, cor: 1, corBorda: 2, size: 1, condicoes: [], guardado: true });
ok("A8) arquivo de token ANTIGO (sem favorito/grupos) continua válido: não favorito, sem grupos", antigo !== null && antigo.favorito === false && antigo.grupos.length === 0);
const fAntiga = fichaValida({ id: 1, nome: "Velha", texto: "x", versao: 1, criadaEm: 1, alteradaEm: 1 });
ok("A9) arquivo de ficha antigo também", fAntiga !== null && fAntiga.favorito === false && fAntiga.grupos.length === 0);
ok("A10) campos estragados viram o padrão (grupos com lixo: só inteiros positivos)", JSON.stringify(tokenValido({ id: 1, nome: "x", imagem: null, col: 0, row: 0, cor: 1, corBorda: 2, size: 1, condicoes: [], guardado: true, favorito: "sim", grupos: [1, "a", -3, 2, 2] })?.grupos) === "[1,2]");

const r = excluirGrupo(1);
ok("A11) excluir o grupo tira a marca de tokens e fichas (os itens continuam) e diz quais mudaram", r !== null && r.tokens.includes(t.id) && !estado.tokens.find((x) => x.id === t.id).grupos.includes(1) && estado.grupos.length === 1 /* sobrou só o 2 */ && excluirGrupo(1) === null);

ok("A12) pedidos novos: marcar_ficha, criar_grupo, editar_grupo, excluir_grupo",
    JSON.stringify(lerPedido({ tipo: "marcar_ficha", id: 1, favorito: true, grupos: [1], lixo: 1 })) === '{"tipo":"marcar_ficha","id":1,"favorito":true,"grupos":[1]}' &&
    JSON.stringify(lerPedido({ tipo: "criar_grupo", nome: "A", cor: 3 })) === '{"tipo":"criar_grupo","nome":"A","cor":3}' &&
    JSON.stringify(lerPedido({ tipo: "editar_grupo", id: 2, nome: "B" })) === '{"tipo":"editar_grupo","id":2,"nome":"B"}' &&
    JSON.stringify(lerPedido({ tipo: "excluir_grupo", id: 2 })) === '{"tipo":"excluir_grupo","id":2}');
ok("A13) pedidos malformados são recusados", lerPedido({ tipo: "marcar_ficha", id: 1, favorito: "sim" }) === null && lerPedido({ tipo: "marcar_ficha", id: 1, grupos: ["a"] }) === null && lerPedido({ tipo: "criar_grupo", nome: 1, cor: 1 }) === null && lerPedido({ tipo: "editar_token", id: 1, mudancas: { grupos: "x" } }) === null);

// ================= B) a interface
const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p, "", { ordemPadrao: true }); // (ordem de FÁBRICA do app: Mais recentes)

const nomes = () => p.locator("#bolsa-itens .ficha .ficha-nome").allTextContents();
for (let i = 0; i < 4; i++) { await p.click("#bolsa-criar-token-botao"); await p.waitForTimeout(80); await p.keyboard.press("Escape"); }
const naOrdemDeFabrica = await nomes();
ok("B0) a ordem de FÁBRICA é 'Mais recentes' (o último criado primeiro)", (await p.inputValue("#bolsa-ordem")) === "recentes" && naOrdemDeFabrica.length === 4 && naOrdemDeFabrica[0] > naOrdemDeFabrica[3], naOrdemDeFabrica.join());
await p.selectOption("#bolsa-ordem", "antigos");
const base = await nomes(); // (daqui em diante `base` = ordem de criação)
ok("B1) 4 tokens genéricos criados, na ordem de criação", base.length === 4 && base.join() === [...naOrdemDeFabrica].reverse().join(), base.join());

await p.click("#bolsa-gerenciar"); // (os CHIPS e o "+ Grupo" só existem na tela cheia; no canto os grupos são uma lista suspensa)
await p.click("#bolsa-grupo-novo");
await p.fill("#editor-grupo-nome", "Goblins");
await p.click("#editor-grupo-salvar");
ok("B2) '+ Grupo' abre a janela de nome e cor e cria o grupo (aparece como chip)", (await p.locator("#bolsa-grupos-chips .bolsa-chip").count()) === 1 && /Goblins/.test(await p.locator("#bolsa-grupos-chips").textContent()));

await p.locator("#bolsa-itens .ficha").nth(0).click();
await p.locator("#bolsa-itens .ficha").nth(1).click({ modifiers: ["Control"] });
await p.click("#bolsa-selecao-grupos");
ok("B3) 'Grupos ▾' abre o menu com o grupo e 'Novo grupo…'", (await p.locator("#menu-grupos").isVisible()) && (await p.locator("#menu-grupos button").count()) === 2);
await p.locator("#menu-grupos button").first().click();
ok("B4) clicar no grupo adiciona os 2 selecionados (pontinho colorido nos itens)", (await p.locator("#bolsa-itens .ficha .item-grupos").count()) === 2);

await p.click("#bolsa-fechar");
await p.locator("#bolsa-itens .ficha").nth(2).hover();
await p.locator("#bolsa-itens .ficha").nth(2).locator(".item-estrela").click();
ok("B5) a estrela favorita o item (fica ligada) sem selecionar nem abrir nada", (await p.locator("#bolsa-itens .item-estrela.ligada").count()) === 1 && !(await p.locator("#editor-token").isVisible()));

await p.selectOption("#bolsa-ordem", "recentes");
const recentes = await nomes();
ok("B6) 'Mais recentes' inverte a ordem de criação", recentes.join() === [...base].reverse().join(), recentes.join());
await p.selectOption("#bolsa-ordem", "antigos");
ok("B7) 'Menos recentes' volta à ordem de criação", (await nomes()).join() === base.join());
await p.selectOption("#bolsa-ordem", "favoritos");
ok("B8) 'Favoritos primeiro' põe o favorito na frente", (await nomes())[0] === base[2], (await nomes()).join());
await p.selectOption("#bolsa-ordem", "grupo");
ok("B9) 'Por grupo' junta os do grupo na frente e os sem grupo no fim", (await nomes()).slice(0, 2).join() === base.slice(0, 2).join() && (await nomes()).length === 4);

await p.click("#bolsa-filtro-grupos");
ok("B10a) no CANTO os grupos são uma lista suspensa (sem chips visíveis), com o grupo e 'Novo grupo…'", (await p.locator("#menu-grupos").isVisible()) && !(await p.locator("#bolsa-grupos-chips").isVisible()) && /Goblins/.test(await p.locator("#menu-grupos").textContent()));
await p.locator("#menu-grupos button", { hasText: "Goblins" }).click();
ok("B10) marcar o grupo na lista FILTRA (só os 2 do grupo) e o botão mostra 'Grupos (1)'", (await nomes()).length === 2 && /Grupos \(1\)/.test(await p.locator("#bolsa-filtro-grupos").textContent()));
await p.locator("#menu-grupos button", { hasText: "Mostrar todos" }).click();
ok("B10b) 'Mostrar todos' limpa o filtro", (await nomes()).length === 4);
await p.click("#bolsa-filtro-favoritos");
ok("B11) o ★ filtra só os favoritos", (await nomes()).length === 1 && (await nomes())[0] === base[2]);
await p.click("#bolsa-filtro-favoritos");

// fichas: os mesmos grupos servem
await p.click("#bolsa-aba-fichas");
await criarFichaFechada(p);
// (a ficha recém-criada já está selecionada: um clique a ABRIRIA e a janela cobriria o menu; o clique direito basta)
await p.locator("#bolsa-fichas-lista .bolsa-doc").first().click({ button: "right" });
await p.click("#menu-doc-grupos");
ok("B12) as FICHAS usam os mesmos grupos (o menu lista o 'Goblins')", (await p.locator("#menu-grupos").isVisible()) && /Goblins/.test(await p.locator("#menu-grupos").textContent()));
await p.locator("#menu-grupos button").first().click();
ok("B13) a ficha entra no grupo (pontinho) e o filtro das fichas é independente do dos tokens", (await p.locator("#bolsa-fichas-lista .item-grupos").count()) === 1 && (await p.locator("#bolsa-grupos-chips .bolsa-chip[aria-pressed=true]").count()) === 0);

// editar e excluir o grupo (pelos chips, na tela cheia)
await p.click("#bolsa-gerenciar");
await p.locator("#bolsa-grupos-chips .bolsa-chip").first().click({ button: "right" });
ok("B14) clique direito no chip abre a janela de edição (com 'Excluir grupo')", (await p.locator("#editor-grupo").isVisible()) && !(await p.locator("#editor-grupo-excluir").isHidden()));
await p.fill("#editor-grupo-nome", "Orcs");
await p.click("#editor-grupo-salvar");
ok("B15) o novo nome aparece no chip", /Orcs/.test(await p.locator("#bolsa-grupos-chips").textContent()));
await p.locator("#bolsa-grupos-chips .bolsa-chip").first().click({ button: "right" });
await p.click("#editor-grupo-excluir");
ok("B16) excluir o grupo pede confirmação, e os itens CONTINUAM (só perdem a marca)", await p.locator("#confirmar").isVisible());
await p.click("#confirmar-ok");
ok("B17) o chip some e a ficha não tem mais o pontinho", (await p.locator("#bolsa-grupos-chips .bolsa-chip").count()) === 0 && (await p.locator("#bolsa-fichas-lista .item-grupos").count()) === 0 && (await p.locator("#bolsa-fichas-lista .bolsa-doc").count()) === 1);

ok("B18) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
