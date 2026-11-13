// Teste e2e: as ABAS da bolsa ("Tokens" e "Fichas"). Rodar: npm run test:e2e -- bolsa-abas
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// A carteira tem duas abas, numa linha embaixo do título, nos dois tamanhos da bolsa (a do canto e a tela cheia). "Tokens" é a bolsa
// de sempre; "Fichas" é o lugar das fichas de personagem (por enquanto só o espaço do texto). Na aba Fichas somem as fichinhas
// de token, a criação, a pesquisa e o botão "Criar/editar". As setas do teclado passeiam entre as abas.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

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
ok("4b) a seta dá a volta: de 'Fichas' vai para 'Tokens'", (await selecionada("#bolsa-aba-tokens")) === "true");
await p.keyboard.press("End");
ok("4c) End vai para a última aba", (await selecionada("#bolsa-aba-fichas")) === "true");
await p.keyboard.press("Home");
ok("4d) Home vai para a primeira aba", (await selecionada("#bolsa-aba-tokens")) === "true");

// 5) bolsa do canto: o cabeçalho, as abas e a pesquisa não se atropelam
ok("5a) na bolsa do canto as abas ficam visíveis", await visivel("#bolsa-abas"));
const abasM = await p.locator("#bolsa-abas").boundingBox();
const buscaM = await p.locator("#bolsa-busca").boundingBox();
ok("5b) a pesquisa fica ABAIXO das abas (cada uma na sua linha)", buscaM.y >= abasM.y + abasM.height - 1, `abas ${abasM.y.toFixed(0)}+${abasM.height.toFixed(0)}, busca ${buscaM.y.toFixed(0)}`);
await p.click("#bolsa-aba-fichas");
ok("5c) na aba Fichas a pesquisa some, mas o botão 'Criar/editar' continua (é o caminho para a tela cheia)", !(await visivel("#bolsa-busca")) && (await visivel("#bolsa-gerenciar")));
ok("5d) a aba escolhida vale na bolsa do canto", (await visivel("#bolsa-fichas")) && !(await visivel("#bolsa-conteudo")));
await p.click("#bolsa-aba-tokens");
ok("5e) voltando a 'Tokens', a pesquisa e o 'Criar/editar' voltam", (await visivel("#bolsa-busca")) && (await visivel("#bolsa-gerenciar")));

// 6) tela cheia
await p.click("#bolsa-gerenciar");
ok("6a) a tela cheia abre na aba 'Tokens', com a área de criação", (await classe()).includes("expandida") && (await visivel("#bolsa-criar")) && (await visivel("#bolsa-abas")));
await p.click("#bolsa-aba-fichas");
ok("6b) na tela cheia, a aba Fichas esconde a criação e mostra o painel", !(await visivel("#bolsa-criar")) && (await visivel("#bolsa-fichas")));
const cheia = await p.locator("#bolsa").boundingBox();
const painel = await p.locator("#bolsa-fichas").boundingBox();
const botaoCriarFicha = await p.locator("#bolsa-ficha-criar-botao").boundingBox();
ok("6c) o painel das fichas fica dentro da caixa, sem sair pelos lados nem por baixo", painel.x >= cheia.x && painel.x + painel.width <= cheia.x + cheia.width + 1 && painel.y + painel.height <= cheia.y + cheia.height + 1, `${JSON.stringify(painel)} em ${JSON.stringify(cheia)}`);
ok("6d) na tela cheia o botão 'Criar ficha' está à vista, dentro do painel", botaoCriarFicha.x >= painel.x && botaoCriarFicha.y >= painel.y && botaoCriarFicha.x + botaoCriarFicha.width <= painel.x + painel.width + 1, `${JSON.stringify(botaoCriarFicha)} em ${JSON.stringify(painel)}`);
await p.keyboard.press("Escape");
ok("6e) Esc fecha a tela cheia e volta à bolsa do canto (a aba Fichas continua escolhida)", !(await classe()).includes("expandida") && (await visivel("#bolsa-fichas")));

ok("7) nenhum erro de JavaScript durante o teste", erros.length === 0, erros.join(" | "));

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
