// Teste e2e: as CAIXAS ARRASTÁVEIS (chat, dados, Ferramentas, Desenho e bolsa). Rodar: npm run test:e2e -- caixas-arrastaveis
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs e src/ui/arrastar.ts.
//
// Cada caixa anda quando se puxa pela alça (o cabeçalho, o título da bolsa, a borda de cima do chat); clicar na alça continua clicando (o ▴
// recolhe, clicar no nome também); as bordas da janela são PAREDES (a caixa bate e não passa, nada fica escondido); o chat e os dados são
// caixas INDEPENDENTES (arrastar um não leva o outro); Ferramentas, Desenho e Dados NÃO PODEM SE BATER (param ao encostar, deslizam pela borda e,
// se uma cresce e passa a bater, ela se afasta); a posição vale depois de recarregar (inclusive ANTES do app carregar, sem pular); a bolsa em tela
// cheia não anda; "Reorganizar telas" leva tudo de volta ao lugar de fábrica.
import { abrirPagina, cruza, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const caixa = (s) => p.locator(s).boundingBox();
const arrastar = async (alca, dx, dy, ponto = null) => {
    const c = await caixa(alca);
    const x = ponto ? c.x + ponto.x : c.x + c.width / 2;
    const y = ponto ? c.y + ponto.y : c.y + c.height / 2;
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await p.mouse.move(x + dx, y + dy, { steps: 4 });
    await p.mouse.up();
};
const move = (antes, depois, dx, dy) => Math.abs(depois.x - antes.x - dx) <= 2 && Math.abs(depois.y - antes.y - dy) <= 2;
const recarregar = async () => {
    await p.reload();
    await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
};

// ================= cada caixa anda pela sua alça
const antes = {};
for (const id of ["#barra", "#ferramentas-desenho", "#chat", "#dados", "#bolsa"]) antes[id] = await caixa(id);

await arrastar("#barra .cabecalho h1", -400, 0);
ok("1a) a barra de Ferramentas anda pelo cabeçalho (400 px para a esquerda; fica longe da bolsa, que o teste arrasta depois)", move(antes["#barra"], await caixa("#barra"), -400, 0));
await arrastar("#ferramentas-desenho .cabecalho h1", 0, 60);
ok("1b) o painel de Desenho anda pelo cabeçalho", move(antes["#ferramentas-desenho"], await caixa("#ferramentas-desenho"), 0, 60));
await arrastar("#bolsa .bolsa-titulo", -250, -150);
ok("1c) a bolsa anda pelo título", move(antes["#bolsa"], await caixa("#bolsa"), -250, -150));

const dadosAntesChat = await caixa("#dados");
await arrastar("#chat-alca", 100, -120, { x: 150, y: 4 });
ok("1d) o chat anda pela borda de cima (alça)", move(antes["#chat"], await caixa("#chat"), 100, -120));
ok("1e) e NÃO leva o painel de dados: o chat e os dados são caixas independentes (nada está grudado)", move(dadosAntesChat, await caixa("#dados"), 0, 0));

const dadosAntes2 = await caixa("#dados");
const chatAntes2 = await caixa("#chat");
await arrastar("#dados .cabecalho h1", 60, 200);
ok("1f) o painel de dados anda sozinho, puxando pelo cabeçalho (o chat fica onde está)", move(dadosAntes2, await caixa("#dados"), 60, 200) && move(chatAntes2, await caixa("#chat"), 0, 0));
ok("1g) puxar o cabeçalho NÃO recolheu os dados (o clique que sobraria foi engolido)", !(await p.locator("#dados").evaluate((e) => e.classList.contains("recolhida"))));

// ================= clicar continua clicando
await p.click("#dados-alternar"); await p.waitForTimeout(450);
ok("2a) um clique simples no ▴ do painel de dados continua recolhendo", await p.locator("#dados").evaluate((e) => e.classList.contains("recolhida")));
await p.click("#dados-alternar"); await p.waitForTimeout(450);
await p.click("#barra-alternar"); await p.waitForTimeout(450);
ok("2b) o botão ▴ do cabeçalho da barra continua funcionando (não arrasta)", await p.locator("#barra").evaluate((e) => e.classList.contains("recolhida")));
await p.click("#barra-alternar"); await p.waitForTimeout(450);
const pos = await caixa("#barra");
const titulo = await caixa("#barra .cabecalho h1");
await p.mouse.move(titulo.x + titulo.width / 2, titulo.y + titulo.height / 2);
await p.mouse.down(); await p.mouse.up();
await p.waitForTimeout(450);
ok("2c) um clique SIMPLES no NOME da barra, sem mover, não a desloca e NÃO a recolhe (só o duplo clique recolhe)", move(pos, await caixa("#barra"), 0, 0) && !(await p.locator("#barra").evaluate((e) => e.classList.contains("recolhida"))));
await p.dblclick("#barra .cabecalho h1"); await p.waitForTimeout(450);
ok("2d) o DUPLO clique no nome recolhe a barra", await p.locator("#barra").evaluate((e) => e.classList.contains("recolhida")));
await p.dblclick("#barra .cabecalho h1"); await p.waitForTimeout(450); // (de volta ao estado de antes)

// ================= as bordas da janela são PAREDES
const dentro = (c) => c.x >= -0.5 && c.y >= -0.5 && c.x + c.width <= 1400.5 && c.y + c.height <= 800.5;
await arrastar("#ferramentas-desenho .cabecalho h1", -4000, -4000);
const alta = await caixa("#ferramentas-desenho");
ok("3a) puxar para muito além do canto superior esquerdo: a caixa bate na parede (x = 0, y = 0) e fica INTEIRA na tela", Math.abs(alta.x) <= 1 && Math.abs(alta.y) <= 1, JSON.stringify(alta));
await arrastar("#barra .cabecalho h1", 6000, 6000);
const baixa = await caixa("#barra");
ok("3b) puxar para além do canto inferior direito: bate na parede e fica inteira na tela (nenhuma parte escondida)", dentro(baixa) && Math.abs(baixa.x + baixa.width - 1400) <= 1 && Math.abs(baixa.y + baixa.height - 800) <= 1, JSON.stringify(baixa));
await arrastar("#chat-alca", 4000, 4000, { x: 150, y: 4 });
ok("3c) o chat vai até a parede da direita e de baixo e fica inteiro na tela", dentro(await caixa("#chat")));
await arrastar("#chat-alca", -4000, -4000, { x: 150, y: 4 });
const chatCanto = await caixa("#chat");
ok("3d) levado até a parede da esquerda e de cima, encosta no canto (x = 0, y = 0) e fica inteiro na tela", Math.abs(chatCanto.x) <= 1 && Math.abs(chatCanto.y) <= 1 && dentro(chatCanto), JSON.stringify(chatCanto));
await p.click("#reorganizar-telas");

// ================= Ferramentas, Desenho e Dados NÃO PODEM SE BATER
const desenho0 = await caixa("#ferramentas-desenho");
let dadosC = await caixa("#dados");
await arrastar("#dados .cabecalho h1", -500, 0);
dadosC = await caixa("#dados");
const desenhoC = await caixa("#ferramentas-desenho");
ok("4a) arrastando os dados para cima do painel de Desenho, eles PARAM ao encostar nele (x = borda direita do Desenho) e não o atravessam", !cruza(dadosC, desenhoC) && Math.abs(dadosC.x - (desenhoC.x + desenhoC.width)) <= 1.5, JSON.stringify({ dadosC, desenhoC }));
await arrastar("#dados .cabecalho h1", 0, 150, { x: 20, y: 12 });
dadosC = await caixa("#dados");
ok("4b) e DESLIZAM ao longo da borda: continuam descendo, encostados no Desenho (sem travar e sem bater)", !cruza(dadosC, await caixa("#ferramentas-desenho")) && Math.abs(dadosC.x - (desenhoC.x + desenhoC.width)) <= 1.5 && dadosC.y > desenho0.y + 100, JSON.stringify(dadosC));
await p.click("#reorganizar-telas");
await arrastar("#ferramentas-desenho .cabecalho h1", 600, 0);
const desenhoD = await caixa("#ferramentas-desenho"), dadosD = await caixa("#dados");
ok("4c) o painel de Desenho arrastado para a direita também para ao encostar nos dados", !cruza(desenhoD, dadosD) && Math.abs(desenhoD.x + desenhoD.width - dadosD.x) <= 1.5, JSON.stringify({ desenhoD, dadosD }));
await arrastar("#barra .cabecalho h1", -900, 0);
const barraE = await caixa("#barra"), dadosE = await caixa("#dados");
ok("4d) a barra de Ferramentas arrastada para a esquerda para ao encostar nos dados", !cruza(barraE, dadosE) && Math.abs(barraE.x - (dadosE.x + dadosE.width)) <= 1.5, JSON.stringify({ barraE, dadosE }));
await p.click("#reorganizar-telas");

// um painel que CRESCE e passa a bater em outro se afasta
await p.click("#barra-alternar"); await p.waitForTimeout(450); // recolhe a barra
const barraR = await caixa("#barra");
const dadosR = await caixa("#dados");
await arrastar("#dados .cabecalho h1", barraR.x - 40 - dadosR.x, barraR.y + barraR.height + 8 - dadosR.y); // os dados logo ABAIXO da barra recolhida
const dadosAbaixo = await caixa("#dados");
ok("4e) (preparo) os dados ficam logo abaixo da barra recolhida, sem bater", !cruza(dadosAbaixo, await caixa("#barra")) && dadosAbaixo.y >= barraR.y + barraR.height, JSON.stringify({ barraR, dadosAbaixo }));
await p.click("#barra-alternar"); await p.waitForTimeout(700); // expande a barra: ela cresce para baixo, por cima dos dados
const barraG = await caixa("#barra"), dadosG = await caixa("#dados");
ok("4f) expandindo a barra (que cresceria por cima dos dados) ela se AFASTA: os dois continuam sem se bater e dentro da tela", !cruza(barraG, dadosG) && dentro(barraG) && dentro(dadosG), JSON.stringify({ barraG, dadosG }));
await p.click("#reorganizar-telas");
await arrastar("#bolsa .bolsa-titulo", -250, -150);
// (as outras quatro também saem do lugar de fábrica, para os passos de "recarregar" mais abaixo terem o que lembrar)
await arrastar("#barra .cabecalho h1", -400, 0);
await arrastar("#ferramentas-desenho .cabecalho h1", 0, 60);
await arrastar("#dados .cabecalho h1", 60, 200);
await arrastar("#chat-alca", 100, -120, { x: 150, y: 4 });

// ================= a bolsa em tela cheia não anda; a pesquisa e os botões da bolsa não arrastam
await p.click("#bolsa-gerenciar");
const cheia = await caixa("#bolsa");
ok("4a) em TELA CHEIA a bolsa ignora o deslocamento (continua cobrindo a tela com 16 px de margem)", Math.abs(cheia.x - 16) <= 1 && Math.abs(cheia.y - 16) <= 1, JSON.stringify(cheia));
await p.click("#bolsa-fechar");
const dBolsa = await caixa("#bolsa");
ok("4b) ao voltar, a bolsa do canto volta ao lugar onde a pessoa a deixou", move(antes["#bolsa"], dBolsa, -250, -150));
await arrastar("#bolsa-busca", 120, 0);
ok("4c) puxar pelo campo de pesquisa NÃO move a bolsa (o campo é dele)", move(dBolsa, await caixa("#bolsa"), 0, 0));

// ================= vale depois de recarregar
const guardado = {};
for (const id of ["#barra", "#ferramentas-desenho", "#chat", "#dados", "#bolsa"]) guardado[id] = await caixa(id);
await recarregar();
const todasIguais = [];
for (const id of Object.keys(guardado)) todasIguais.push(move(guardado[id], await caixa(id), 0, 0));
ok("5a) depois de RECARREGAR as cinco caixas voltam onde foram deixadas", todasIguais.every(Boolean), JSON.stringify(todasIguais));
await p.route("**/src/main.ts*", (rota) => rota.abort());
await p.reload();
await p.waitForTimeout(300);
const semApp = await p.evaluate(() => ["barra", "ferramentas-desenho", "chat", "dados", "bolsa"].map((id) => document.getElementById(id).style.translate !== ""));
ok("5b) com o app BLOQUEADO (só o script do index.html), as posições já estão aplicadas: sem pular de lugar ao carregar", semApp.every(Boolean), JSON.stringify(semApp));
await p.unroute("**/src/main.ts*");
await recarregar();

// ================= se a janela do navegador encolhe, as caixas voltam para dentro
await arrastar("#ferramentas-desenho .cabecalho h1", 6000, 6000);
await arrastar("#bolsa .bolsa-titulo", 6000, 6000);
await p.setViewportSize({ width: 800, height: 500 });
await p.waitForTimeout(200);
const dentroPequena = (c) => c.x >= -0.5 && c.y >= -0.5 && c.x + c.width <= 800.5 && c.y + c.height <= 500.5;
ok("5c) com a janela do navegador menor (800×500) todas as caixas continuam inteiras dentro dela", dentroPequena(await caixa("#ferramentas-desenho")) && dentroPequena(await caixa("#bolsa")) && dentroPequena(await caixa("#barra")), "");
await p.setViewportSize({ width: 1400, height: 800 });
await p.waitForTimeout(200);

// ================= Reorganizar telas
await p.click("#reorganizar-telas");
const certo = [];
for (const id of Object.keys(antes)) certo.push(move(antes[id], await caixa(id), 0, 0));
ok("6a) 'Reorganizar telas' leva as cinco caixas de volta ao lugar de fábrica", certo.every(Boolean), JSON.stringify(certo));
await recarregar();
ok("6b) e isso também fica guardado (recarregar não traz as posições antigas de volta)", move(antes["#chat"], await caixa("#chat"), 0, 0) && move(antes["#barra"], await caixa("#barra"), 0, 0));

// ================= valor guardado estranho é ignorado
await p.evaluate(() => { localStorage.setItem("tabuleirinho.pos.chat", "abc,<x>"); localStorage.setItem("tabuleirinho.pos.barra", "1,2,3"); });
await recarregar();
ok("7) valores inválidos guardados são ignorados (as caixas ficam no lugar de fábrica)", move(antes["#chat"], await caixa("#chat"), 0, 0) && move(antes["#barra"], await caixa("#barra"), 0, 0));

process.exitCode = terminar(erros);
await nav.close();
