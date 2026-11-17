// Teste e2e: as ABAS da bolsa ("Tokens" e "Fichas"). Rodar: npm run test:e2e -- bolsa-abas
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// A carteira tem duas abas, numa linha embaixo do título, nos dois tamanhos da bolsa (a do canto e a tela cheia). "Tokens" é a bolsa
// de sempre; "Fichas" é o lugar das fichas de personagem (por enquanto só o espaço do texto). Na aba Fichas somem as fichinhas
// de token, a criação, a pesquisa e o botão "Criar/editar". As setas do teclado passeiam entre as abas.
import { abrirPagina, lancar, ok, terminar, criarFichaFechada } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const visivel = (seletor) => p.locator(seletor).isVisible();
const classe = async () => (await p.locator("#bolsa").getAttribute("class")) ?? "";
const selecionada = (id) => p.locator(id).getAttribute("aria-selected");

// 1) a bolsa do canto já tem as duas abas, com "Tokens" aberta
ok("1a) as duas abas aparecem na bolsa do canto", (await visivel("#bolsa-aba-tokens")) && (await visivel("#bolsa-aba-fichas")));
ok("1b) 'Tokens' começa selecionada e o painel das fichas está escondido", (await selecionada("#bolsa-aba-tokens")) === "true" && (await selecionada("#bolsa-aba-fichas")) === "false" && !(await visivel("#bolsa-fichas")));
const caixa = await p.locator("#bolsa").boundingBox();
const abas = await p.locator("#bolsa-abas").boundingBox();
ok("1c) as abas ficam DENTRO da caixa da bolsa", abas.x >= caixa.x && abas.x + abas.width <= caixa.x + caixa.width && abas.y >= caixa.y && abas.y + abas.height <= caixa.y + caixa.height, `${JSON.stringify(abas)} em ${JSON.stringify(caixa)}`);

// 2) trocar para Fichas
await p.click("#bolsa-aba-fichas");
ok("2a) clicar em 'Fichas' a seleciona e mostra o painel", (await selecionada("#bolsa-aba-fichas")) === "true" && (await selecionada("#bolsa-aba-tokens")) === "false" && (await visivel("#bolsa-fichas")));
ok("2b) trocar de aba NÃO expande a bolsa (clicar na bolsa do canto nunca a expande)", !(await classe()).includes("expandida"));
ok("2c) a aba Fichas mostra o aviso de vazio e o botão 'Criar ficha'", (await visivel("#bolsa-fichas-vazia")) && (await visivel("#bolsa-ficha-criar-botao")));
ok("2d) as fichinhas de token somem", !(await visivel("#bolsa-conteudo")));

// 3) voltar para Tokens
await p.click("#bolsa-aba-tokens");
ok("3) voltar para 'Tokens' mostra de novo as fichinhas e esconde o painel das fichas", (await visivel("#bolsa-conteudo")) && !(await visivel("#bolsa-fichas")));

// 4) teclado: setas, Home e End
await p.focus("#bolsa-aba-tokens");
await p.keyboard.press("ArrowRight");
ok("4a) seta para a direita vai para 'Fichas' e leva o foco", (await selecionada("#bolsa-aba-fichas")) === "true" && (await p.evaluate(() => document.activeElement?.id)) === "bolsa-aba-fichas");
await p.keyboard.press("ArrowRight");
ok("4b) a seta para a direita vai de 'Fichas' para 'Mapas' (a 3ª aba)", (await selecionada("#bolsa-aba-mapas")) === "true" && (await p.locator("#bolsa-mapas").isVisible()));
await p.keyboard.press("ArrowRight");
ok("4b2) a seta vai de 'Mapas' para 'Jogadores' (a 4ª aba, só do mestre)", (await selecionada("#bolsa-aba-jogadores")) === "true" && (await p.locator("#bolsa-jogadores").isVisible()) && (await p.locator("#bolsa-mapas").isHidden()));
await p.keyboard.press("ArrowRight");
ok("4c) a seta dá a volta: de 'Jogadores' vai para 'Tokens' (e a aba Jogadores some)", (await selecionada("#bolsa-aba-tokens")) === "true" && (await p.locator("#bolsa-jogadores").isHidden()));
await p.keyboard.press("End");
ok("4d) End vai para a última aba ('Jogadores')", (await selecionada("#bolsa-aba-jogadores")) === "true");
await p.keyboard.press("Home");
ok("4e) Home volta para a primeira ('Tokens')", (await selecionada("#bolsa-aba-tokens")) === "true");
await p.keyboard.press("Home");
ok("4d) Home vai para a primeira aba", (await selecionada("#bolsa-aba-tokens")) === "true");

// 5) bolsa do canto: o cabeçalho, as abas e a pesquisa não se atropelam
ok("5a) na bolsa do canto as abas ficam visíveis", await visivel("#bolsa-abas"));
const abasM = await p.locator("#bolsa-abas").boundingBox();
const buscaM = await p.locator("#bolsa-busca").boundingBox();
ok("5b) a pesquisa fica ABAIXO das abas (cada uma na sua linha)", buscaM.y >= abasM.y + abasM.height - 1, `abas ${abasM.y.toFixed(0)}+${abasM.height.toFixed(0)}, busca ${buscaM.y.toFixed(0)}`);
const criarTokenM = await p.locator("#bolsa-criar-token-botao").boundingBox();
const gerM = await p.locator("#bolsa-gerenciar").boundingBox();
ok("5b2) na aba Tokens a linha é: a pesquisa à ESQUERDA e o botão '+ Criar token' à DIREITA dela (mesma linha)", Math.abs(criarTokenM.y - buscaM.y) < 8 && criarTokenM.x >= buscaM.x + buscaM.width - 1, JSON.stringify({ buscaM, criarTokenM }));
ok("5b2b) o botão 'Abrir bolsa' fica no PÉ da bolsinha (abaixo das listas, na largura toda), fora da linha das abas, e a bolsa não minimiza mais", !!gerM && gerM.y > buscaM.y + 100 && gerM.width > 250 && (await p.locator("#bolsa-alternar").count()) === 0 && /Abrir bolsa$/.test((await p.locator("#bolsa-gerenciar").textContent()).trim()), JSON.stringify(gerM));
await p.click("#bolsa-aba-fichas");
const buscaF = await p.locator("#bolsa-fichas-busca").boundingBox();
const criarF = await p.locator("#bolsa-ficha-criar-botao").boundingBox();
ok("5c) na aba Fichas a pesquisa continua (agora para as fichas) e o botão '+ Criar ficha', pequeno, fica à DIREITA dela (mesma linha)", (await visivel("#bolsa-fichas-busca")) && !(await visivel("#bolsa-busca")) && (await p.locator("#bolsa-fichas-busca").getAttribute("placeholder")) === "Pesquisar ficha…" && Math.abs(criarF.y - buscaF.y) < 8 && criarF.x >= buscaF.x + buscaF.width - 1 && criarF.height <= 24, JSON.stringify({ buscaF, criarF }));
ok("5c1b) a barra de pesquisa tem o MESMO tamanho e o mesmo lugar nas duas abas (os botões ao lado têm a mesma largura)", Math.abs(buscaF.width - buscaM.width) < 1 && Math.abs(buscaF.x - buscaM.x) < 1 && Math.abs(buscaF.y - buscaM.y) < 1, JSON.stringify({ buscaM, buscaF }));
const gerF = await p.locator("#bolsa-gerenciar").boundingBox();
ok("5c1c) o botão 'Abrir bolsa' fica no MESMO lugar nas duas abas (Tokens e Fichas)", Math.abs(gerF.x - gerM.x) < 1 && Math.abs(gerF.y - gerM.y) < 1 && Math.abs(gerF.width - gerM.width) < 1, JSON.stringify({ gerM, gerF }));
await criarFichaFechada(p); await criarFichaFechada(p);
await p.fill("#bolsa-fichas-busca", "ficha 2");
ok("5c3) a pesquisa filtra as fichas pelo nome (ignora maiúsculas e acentos) e o vazio diz 'Nenhuma ficha encontrada'", (await p.locator(".bolsa-doc").count()) === 1 && (await p.locator(".bolsa-doc-nome").first().textContent()) === "Ficha 2");
await p.fill("#bolsa-fichas-busca", "zzz");
ok("5c4) sem resultado: nenhuma ficha e a mensagem 'Nenhuma ficha encontrada para \"zzz\".'", (await p.locator(".bolsa-doc").count()) === 0 && (await p.locator("#bolsa-fichas-vazia").textContent()) === 'Nenhuma ficha encontrada para "zzz".');
await p.fill("#bolsa-fichas-busca", "");
const gerFichas = await p.locator("#bolsa-gerenciar").boundingBox();
const criarF2 = await p.locator("#bolsa-ficha-criar-botao").boundingBox();
ok("5c6) o botão da linha da pesquisa tem o mesmo tamanho e o mesmo lugar nas duas abas ('+ Criar token' e '+ Criar ficha')", Math.abs(criarF2.x - criarTokenM.x) < 1 && Math.abs(criarF2.y - criarTokenM.y) < 1 && Math.abs(criarF2.width - criarTokenM.width) < 1 && Math.abs(criarF2.height - criarTokenM.height) < 1, JSON.stringify({ criarTokenM, criarF2 }));
ok("5d) a aba escolhida vale na bolsa do canto", (await visivel("#bolsa-fichas")) && !(await visivel("#bolsa-conteudo")));
await p.click("#bolsa-aba-fichas");
await p.fill("#bolsa-fichas-busca", "ficha 1");
await p.click("#bolsa-aba-tokens");
ok("5e) voltando a 'Tokens': a pesquisa dos tokens aparece (VAZIA: a das fichas é independente, o texto 'ficha 1' não veio junto) e o '+ Criar ficha' e a pesquisa das fichas somem", (await visivel("#bolsa-busca")) && !(await visivel("#bolsa-fichas-busca")) && (await p.inputValue("#bolsa-busca")) === "" && (await p.locator("#bolsa-busca").getAttribute("placeholder")) === "Pesquisar token…" && (await visivel("#bolsa-gerenciar")) && !(await visivel("#bolsa-ficha-criar-botao")));
await p.fill("#bolsa-busca", "token");
await p.click("#bolsa-aba-fichas");
ok("5f) e a pesquisa das fichas guardou o SEU texto ('ficha 1', filtrando as fichas), sem receber o 'token' da outra", (await p.inputValue("#bolsa-fichas-busca")) === "ficha 1" && (await p.locator(".bolsa-doc").count()) === 1);
await p.fill("#bolsa-fichas-busca", "");
await p.click("#bolsa-aba-tokens");
await p.fill("#bolsa-busca", "");

// 6) tela cheia
await p.click("#bolsa-gerenciar");
ok("6a) a tela cheia abre na aba 'Tokens', com a área de criação", (await classe()).includes("expandida") && (await visivel("#bolsa-criar")) && (await visivel("#bolsa-abas")));
await p.click("#bolsa-aba-fichas");
ok("6b) na tela cheia, a aba Fichas esconde a criação e mostra o painel", !(await visivel("#bolsa-criar")) && (await visivel("#bolsa-fichas")));
const cheia = await p.locator("#bolsa").boundingBox();
const painel = await p.locator("#bolsa-fichas").boundingBox();
const botaoCriarFicha = await p.locator("#bolsa-ficha-criar-botao").boundingBox();
ok("6c) o painel das fichas fica dentro da caixa, sem sair pelos lados nem por baixo", painel.x >= cheia.x && painel.x + painel.width <= cheia.x + cheia.width + 1 && painel.y + painel.height <= cheia.y + cheia.height + 1, `${JSON.stringify(painel)} em ${JSON.stringify(cheia)}`);
// (o "+ Criar ficha" fica na linha da pesquisa, NO CABEÇALHO da bolsa — o mesmo lugar do "+ Criar token" —, e não mais dentro do painel das fichas)
ok("6d) na tela cheia o botão 'Criar ficha' está à vista, na linha do botão 'Instruções', dentro da largura da bolsa", botaoCriarFicha.x >= painel.x && botaoCriarFicha.x + botaoCriarFicha.width <= painel.x + painel.width + 1 && Math.abs(botaoCriarFicha.y - (await p.locator("#bolsa-ficha-instrucoes").boundingBox()).y) < 8, `${JSON.stringify(botaoCriarFicha)} em ${JSON.stringify(painel)}`);
await p.keyboard.press("Escape");
ok("6e) Esc fecha a tela cheia e volta à bolsa do canto (a aba Fichas continua escolhida)", !(await classe()).includes("expandida") && (await visivel("#bolsa-fichas")));

ok("7) nenhum erro de JavaScript durante o teste", erros.length === 0, erros.join(" | "));

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
