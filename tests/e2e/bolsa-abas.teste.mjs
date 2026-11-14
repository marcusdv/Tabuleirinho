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
const criarTokenM = await p.locator("#bolsa-criar-token-botao").boundingBox();
const topoM = await p.locator(".bolsa-titulo").boundingBox();
const gerM = await p.locator("#bolsa-gerenciar").boundingBox();
const altM = await p.locator("#bolsa-alternar").boundingBox();
ok("5b2) na aba Tokens a linha é: a pesquisa à ESQUERDA e o botão '+ Criar token' à DIREITA dela (mesma linha)", Math.abs(criarTokenM.y - buscaM.y) < 8 && criarTokenM.x >= buscaM.x + buscaM.width - 1, JSON.stringify({ buscaM, criarTokenM }));
ok("5b2b) o cabeçalho tem o título e, na ponta direita, os ícones ⤢ (tela cheia) e ▴ (minimizar): o MESMO nas duas abas", Math.abs(gerM.y - topoM.y) < 12 && gerM.x > topoM.x && altM.x > gerM.x && (await p.locator("#bolsa-alternar").textContent()) === "▴", JSON.stringify({ topoM, gerM, altM }));
const alturaLista = async (sel) => Math.round((await p.locator(sel).boundingBox()).height);
const alturaBolsa = async () => Math.round((await p.locator("#bolsa").boundingBox()).height);
const alturaTokens = await alturaBolsa();
ok("5b3) a lista de tokens da bolsa do canto tem, por padrão, a altura de 3 linhas (3 × 72 + 2 × 6 = 228 px), mesmo vazia", (await alturaLista("#bolsa-itens")) === 228, String(await alturaLista("#bolsa-itens")));
await p.click("#bolsa-aba-fichas");
const buscaF = await p.locator("#bolsa-fichas-busca").boundingBox();
const criarF = await p.locator("#bolsa-ficha-criar-botao").boundingBox();
ok("5c) na aba Fichas a pesquisa continua (agora para as fichas) e o botão '+ Criar ficha', pequeno, fica à DIREITA dela (mesma linha)", (await visivel("#bolsa-fichas-busca")) && !(await visivel("#bolsa-busca")) && (await p.locator("#bolsa-fichas-busca").getAttribute("placeholder")) === "Pesquisar ficha…" && Math.abs(criarF.y - buscaF.y) < 8 && criarF.x >= buscaF.x + buscaF.width - 1 && criarF.height <= 24, JSON.stringify({ buscaF, criarF }));
ok("5c1b) a barra de pesquisa tem o MESMO tamanho e o mesmo lugar nas duas abas (os botões ao lado têm a mesma largura)", Math.abs(buscaF.width - buscaM.width) < 1 && Math.abs(buscaF.x - buscaM.x) < 1 && Math.abs(buscaF.y - buscaM.y) < 1, JSON.stringify({ buscaM, buscaF }));
ok("5c2) na aba Fichas a lista também tem a altura de 3 linhas (228 px)", (await alturaLista("#bolsa-fichas-lista")) === 228, String(await alturaLista("#bolsa-fichas-lista")));
ok("5c2b) a bolsa do canto tem a MESMA ALTURA nas duas abas (Tokens e Fichas), mesmo com a mensagem de vazio da aba Fichas", (await alturaBolsa()) === alturaTokens, `${alturaTokens} -> ${await alturaBolsa()}`);
await p.click("#bolsa-ficha-criar-botao"); await p.click("#bolsa-ficha-criar-botao");
await p.fill("#bolsa-fichas-busca", "ficha 2");
ok("5c3) a pesquisa filtra as fichas pelo nome (ignora maiúsculas e acentos) e o vazio diz 'Nenhuma ficha encontrada'", (await p.locator(".bolsa-doc").count()) === 1 && (await p.locator(".bolsa-doc-nome").first().textContent()) === "Ficha 2");
await p.fill("#bolsa-fichas-busca", "zzz");
ok("5c4) sem resultado: nenhuma ficha e a mensagem 'Nenhuma ficha encontrada para \"zzz\".'", (await p.locator(".bolsa-doc").count()) === 0 && (await p.locator("#bolsa-fichas-vazia").textContent()) === 'Nenhuma ficha encontrada para "zzz".');
await p.fill("#bolsa-fichas-busca", "");
ok("5c4b) criar fichas (e a pesquisa sem resultado) não muda a altura da bolsa", (await alturaBolsa()) === alturaTokens, String(await alturaBolsa()));
const gerF = await p.locator("#bolsa-gerenciar").boundingBox();
const altF = await p.locator("#bolsa-alternar").boundingBox();
ok("5c5) o cabeçalho da aba Fichas é IDÊNTICO ao da aba Tokens (mesmos ícones ⤢ e ▴, nos mesmos lugares)", await visivel("#bolsa-gerenciar") && Math.abs(gerF.x - gerM.x) < 1 && Math.abs(gerF.y - gerM.y) < 1 && Math.abs(altF.x - altM.x) < 1 && Math.abs(altF.y - altM.y) < 1, JSON.stringify({ gerM, gerF, altM, altF }));
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

// 5g) minimizar a bolsa (o ▴ do alto, igual ao dos outros painéis, e DUPLO clique no NOME)
const cheiaAlt = await alturaBolsa();
await p.click("#bolsa-alternar"); await p.waitForTimeout(450);
const minAlt = await alturaBolsa();
ok("5g) o ▴ minimiza a bolsa: sobra só o título e os ícones (bem mais baixa) e o botão vira ▾", minAlt < 70 && minAlt < cheiaAlt && (await p.locator("#bolsa-alternar").textContent()) === "▾" && !(await visivel("#bolsa-abas")) && !(await visivel("#bolsa-busca")) && (await visivel("#bolsa-gerenciar")), `${cheiaAlt} -> ${minAlt}`);
await p.click("#bolsa-alternar"); await p.waitForTimeout(450);
ok("5g2) clicar de novo expande, na mesma aba e com a mesma altura de antes", (await alturaBolsa()) === cheiaAlt && (await visivel("#bolsa-abas")));
await p.dblclick(".bolsa-titulo"); await p.waitForTimeout(450);
ok("5g3) DUPLO clique no NOME da bolsa também minimiza", (await alturaBolsa()) === minAlt);
await p.click("#bolsa-gerenciar");
ok("5g4) com a bolsa minimizada o ⤢ ainda abre a tela cheia, que NÃO fica minimizada", ((await p.locator("#bolsa").getAttribute("class")) ?? "").includes("expandida") && (await visivel("#bolsa-criar")));
await p.click("#bolsa-fechar");
await p.dblclick(".bolsa-titulo"); await p.waitForTimeout(450);
ok("5g5) (limpeza) expande de novo", (await alturaBolsa()) === cheiaAlt);

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
ok("6d) na tela cheia o botão 'Criar ficha' está à vista, no cabeçalho da bolsa, dentro da largura dela", botaoCriarFicha.x >= painel.x && botaoCriarFicha.x + botaoCriarFicha.width <= painel.x + painel.width + 1 && botaoCriarFicha.y < painel.y, `${JSON.stringify(botaoCriarFicha)} em ${JSON.stringify(painel)}`);
await p.keyboard.press("Escape");
ok("6e) Esc fecha a tela cheia e volta à bolsa do canto (a aba Fichas continua escolhida)", !(await classe()).includes("expandida") && (await visivel("#bolsa-fichas")));

ok("7) nenhum erro de JavaScript durante o teste", erros.length === 0, erros.join(" | "));

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
