// Teste e2e: o que a pessoa escolheu na INTERFACE é lembrado ao recarregar a página (localStorage): a última aba da bolsa e se a barra de
// Ferramentas, o painel de Desenho e a barra de dados estão recolhidos. Rodar: npm run test:e2e -- preferencias (precisa do servidor: npm run dev).
//
// Cada página do teste começa com o armazenamento VAZIO (o Playwright cria um contexto novo por página): lá o padrão é a aba Tokens e as duas
// caixas expandidas. Depois muda tudo, recarrega e confere que voltou como foi deixado; mudar de volta também é lembrado. Sem armazenamento
// (janela privada) a interface funciona do mesmo jeito, só sem lembrar: a leitura e a escrita ficam dentro de try/catch (ui/preferencias.ts).
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const aba = () => p.locator("#bolsa").evaluate((el) => (el.classList.contains("aba-fichas") ? "fichas" : "tokens"));
const recolhida = (id) => p.locator(id).evaluate((el) => el.classList.contains("recolhida"));
const dadosRecolhido = () => p.locator("#dados").evaluate((el) => el.classList.contains("recolhida"));
const recarregar = async () => {
    await p.reload();
    await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
};

// ================= o padrão (nada guardado ainda)
ok("1a) sem preferência guardada, a bolsa abre na aba Tokens", (await aba()) === "tokens");
ok("1b) e a barra de Ferramentas e o painel de Desenho abrem expandidos, e a barra de dados aberta (a janela do teste é alta, 800 px)", !(await recolhida("#barra")) && !(await recolhida("#ferramentas-desenho")) && !(await dadosRecolhido()));

// ================= muda tudo e recarrega
await p.click("#bolsa-aba-fichas");
await p.click("#barra-alternar"); await p.waitForTimeout(450);
await p.click("#desenho-alternar"); await p.waitForTimeout(450);
await p.click("#dados-alternar"); await p.waitForTimeout(450);
await p.dblclick(".bolsa-titulo"); await p.waitForTimeout(450); // DUPLO clique no NOME da bolsa a minimiza
ok("2a0) DUPLO clique no NOME da bolsa a minimiza", await p.locator("#bolsa").evaluate((e) => e.classList.contains("recolhida")));
ok("2a) (preparo) a aba Fichas está aberta e as três caixas recolhidas", (await aba()) === "fichas" && (await recolhida("#barra")) && (await recolhida("#ferramentas-desenho")) && (await dadosRecolhido()));
await recarregar();
ok("2b) depois de RECARREGAR a bolsa volta na aba Fichas", (await aba()) === "fichas");
ok("2c) e a barra de Ferramentas e o painel de Desenho continuam recolhidos (com o botão ▾ de expandir)", (await recolhida("#barra")) && (await recolhida("#ferramentas-desenho")) && (await p.locator("#barra-alternar").textContent()) === "▾" && (await p.locator("#desenho-alternar").textContent()) === "▾");
ok("2c1) a bolsa também volta MINIMIZADA (só o título e os ícones, com o ▾)", (await p.locator("#bolsa").evaluate((e) => e.classList.contains("recolhida"))) && (await p.locator("#bolsa-alternar").textContent()) === "▾");
ok("2c2) o painel de dados também volta recolhido (só o cabeçalho 'Dados', com o botão ▾)", (await dadosRecolhido()) && (await p.locator("#dados-alternar").textContent()) === "▾");
// (a bolsa volta MINIMIZADA, e minimizada ela esconde a pesquisa: abre um instante para conferir e a minimiza de novo)
await p.click("#bolsa-alternar"); await p.waitForTimeout(450);
const pesquisaDasFichas = (await p.locator("#bolsa-fichas-busca").isVisible()) && !(await p.locator("#bolsa-busca").isVisible());
await p.click("#bolsa-alternar"); await p.waitForTimeout(450);
ok("2d) a pesquisa da aba restaurada é a das fichas", pesquisaDasFichas);

// ================= o estado vale ANTES do app carregar (sem o "pisca" de 1 segundo)
// Bloqueia o main.ts (o app) e recarrega: só o script do index.html roda, e ele já tem de ter deixado tudo como estava guardado.
await p.route("**/src/main.ts*", (rota) => rota.abort());
await p.reload();
await p.waitForTimeout(300);
const semApp = await p.evaluate(() => ({
    barra: document.getElementById("barra").classList.contains("recolhida"),
    desenho: document.getElementById("ferramentas-desenho").classList.contains("recolhida"),
    dados: document.getElementById("dados").classList.contains("recolhida"),
    fichas: document.getElementById("bolsa").classList.contains("aba-fichas"),
    bolsa: document.getElementById("bolsa").classList.contains("recolhida"),
}));
ok("2e) com o app BLOQUEADO (só o script do index.html), a página já abre com a barra, o painel de Desenho e os dados recolhidos e a aba Fichas: não há 'pisca' de caixas abertas", semApp.barra && semApp.desenho && semApp.dados && semApp.fichas && semApp.bolsa, JSON.stringify(semApp));
await p.unroute("**/src/main.ts*");
await recarregar();

// ================= voltar também é lembrado
await p.click("#bolsa-alternar"); await p.waitForTimeout(450); // (a bolsa voltou minimizada: abre para chegar às abas)
await p.click("#bolsa-aba-tokens");
await p.click("#barra-alternar"); await p.waitForTimeout(450);
await p.click("#dados-alternar"); await p.waitForTimeout(450);
await recarregar();
ok("3a) voltar para Tokens, expandir a barra e reabrir os dados também é lembrado (o painel de Desenho continua recolhido)", (await aba()) === "tokens" && !(await recolhida("#barra")) && (await recolhida("#ferramentas-desenho")) && !(await dadosRecolhido()) && !(await p.locator("#bolsa").evaluate((e) => e.classList.contains("recolhida"))));

// ================= DUPLO clique no NOME recolhe/expande (Ferramentas, Desenho e Bolsa)
await p.dblclick("#barra .cabecalho h1"); await p.waitForTimeout(450);
ok("3b) DUPLO clique no NOME 'Ferramentas' recolhe a barra", await recolhida("#barra"));
await p.dblclick("#barra .cabecalho h1"); await p.waitForTimeout(450);
ok("3c) e clicar de novo a expande", !(await recolhida("#barra")));
await p.dblclick("#ferramentas-desenho .cabecalho h1"); await p.waitForTimeout(450);
ok("3d) DUPLO clique no NOME 'Desenho' expande o painel que estava recolhido", !(await recolhida("#ferramentas-desenho")));
await p.dblclick("#ferramentas-desenho .cabecalho h1"); await p.waitForTimeout(450);
ok("3e) e clicar de novo o recolhe", await recolhida("#ferramentas-desenho"));
await p.dblclick("#ferramentas-desenho .cabecalho h1"); await p.waitForTimeout(450);

// ================= valor estranho guardado não quebra nada
await p.evaluate(() => { localStorage.setItem("tabuleirinho.bolsa.aba", "<script>"); localStorage.setItem("tabuleirinho.barra.recolhida", "talvez"); localStorage.setItem("tabuleirinho.dados.recolhido", "sei lá"); });
await recarregar();
ok("4) um valor inválido guardado é ignorado (volta ao padrão: Tokens, barra expandida e dados abertos)", (await aba()) === "tokens" && !(await recolhida("#barra")) && !(await dadosRecolhido()));

// ================= em janela BAIXA os dados começam recolhidos, a menos que a pessoa tenha escolhido
await p.evaluate(() => localStorage.clear());
await p.setViewportSize({ width: 1400, height: 650 });
await recarregar();
ok("5a) sem escolha guardada, em janela baixa (650 px) os dados começam recolhidos (como sempre foi)", await dadosRecolhido());
await p.click("#dados-alternar"); await p.waitForTimeout(450);
await recarregar();
ok("5b) mas se a pessoa os ABRIU, a escolha dela vale também em janela baixa", !(await dadosRecolhido()));

process.exitCode = terminar(erros);
await nav.close();
