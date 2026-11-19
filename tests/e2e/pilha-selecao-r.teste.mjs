// Teste e2e: lote de pedidos de 17/11/2026 (modo LOCAL). Rodar: npm run test:e2e -- pilha-selecao-r   (precisa do servidor: npm run dev)
//   1) o TABULEIRO (colunas, linhas, mapa, grade) saiu da pilha da esquerda e vive na aba MAPAS da bolsa (só o mestre);
//   2) o cartão "N tokens selecionados" aparece ao selecionar 2 ou mais e some quando sobram menos de 2;
//   3) Desenho e Iniciativa abrem PARA BAIXO e empurram o que está embaixo;
//   5) as abas do chat/bolsa passam para uma 2ª linha quando a coluna estreita;
//   6) "/r conta" rola uma conta no chat (sem variáveis);
//   7) o filtro de ficha única no menu "Grupos" fica embaixo, junto de "Mostrar todos", com o selo.
import { abrirPagina, escolherAba, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

// ----- 1) o Tabuleiro na aba Mapas
ok("1a) a pilha da esquerda não tem a barra 'Tabuleiro' (tem Desenho, Iniciativa e Fog)", (await p.locator("#barra").count()) === 0 && (await p.locator("#pilha .caixa-pilha").count()) === 3);
await p.click("#bolsa-aba-mapas");
ok("1b) o painel Mapas tem o botão 'Configurar o tabuleiro' (modo local) e a janela começa fechada", (await p.locator("#bolsa-mapas-configurar").isVisible()) && (await p.locator("#mapas-tabuleiro").isHidden()));
await p.click("#bolsa-mapas-configurar");
const janela = await p.locator("#mapas-tabuleiro").boundingBox(), colunaDoChat = await p.locator("#chat").boundingBox();
ok("1c) a janela do tabuleiro abre FORA da caixa do chat (à esquerda dela) com colunas, linhas e grade", !(await p.evaluate(() => document.getElementById("chat").contains(document.getElementById("mapas-tabuleiro")))) && janela.x + janela.width <= colunaDoChat.x && (await p.locator("#colunas-valor").isVisible()) && (await p.locator("#linhas-valor").isVisible()) && (await p.locator("#grade-mostrar").isVisible()));
await p.keyboard.press("Escape");
ok("1c2) Esc fecha a janela", await p.locator("#mapas-tabuleiro").isHidden());
await p.click("#bolsa-mapas-configurar");
await p.evaluate(() => document.body.classList.add("jogador"));
ok("1d) o jogador comum NÃO vê a janela do tabuleiro nem o botão", !(await p.locator("#mapas-tabuleiro").isVisible()) && !(await p.locator("#bolsa-mapas-configurar").isVisible()));
await p.evaluate(() => document.body.classList.remove("jogador"));
await p.click("#mapas-tabuleiro-fechar");
await p.click("#bolsa-aba-tokens");

// ----- 2) o cartão da seleção
const centro = (a) => ({ x: a.x + a.largura / 2, y: a.y + a.largura / 2 });
const ancora = (id) => p.evaluate((i) => window.__tabuleirinho.tokens.ancoraNaTela(i), id);
const avisoVisivel = () => p.locator("#aviso").isVisible();
await p.evaluate(() => window.__tabuleirinho.tokens.limparSelecao());
const a = centro(await ancora(1)), b = centro(await ancora(2));
await p.keyboard.down("Control");
await p.mouse.click(a.x, a.y);
ok("2a) com 1 token selecionado o cartão NÃO aparece", !(await avisoVisivel()));
await p.mouse.click(b.x, b.y);
await p.keyboard.up("Control");
ok("2b) ao selecionar o 2º token o cartão aparece NA HORA, sem clique direito", (await avisoVisivel()) && /2 tokens selecionados/.test(await p.locator("#aviso-texto").innerText()));
await p.keyboard.down("Control");
await p.mouse.click(b.x, b.y);
await p.keyboard.up("Control");
ok("2c) ao tirar a seleção de um deles (sobra 1) o cartão some", !(await avisoVisivel()));
await p.keyboard.down("Control");
await p.mouse.click(b.x, b.y);
await p.keyboard.up("Control");
await p.keyboard.press("Escape");
await p.evaluate(() => window.__tabuleirinho.tokens.limparSelecao());
ok("2d) sem seleção o cartão some", !(await avisoVisivel()));

// ----- 3) as gavetas abrem para baixo e empurram as de baixo
const caixa = (s) => p.locator(s).boundingBox();
const antes = await caixa("#iniciativa");
await p.click("#ferramentas-desenho .cabecalho");
await p.waitForTimeout(450);
const depois = await caixa("#iniciativa");
const desenho = await caixa("#ferramentas-desenho");
ok("3a) abrir o Desenho o faz crescer para baixo (a caixa fica mais alta)", desenho.height > 100, `${desenho.height.toFixed(0)} px`);
ok("3b) a Iniciativa (embaixo) foi EMPURRADA para baixo", depois.y > antes.y + 50, `${antes.y.toFixed(0)} -> ${depois.y.toFixed(0)}`);
ok("3c) o conteúdo fica dentro da própria caixa (não ao lado)", (await caixa("#ferramentas-desenho .conteudo")).x < desenho.x + desenho.width);
await p.click("#iniciativa .cabecalho");
await p.waitForTimeout(500);
ok("3d) abrir a Iniciativa FECHA o Desenho (só uma aberta por vez)", !(await p.evaluate(() => document.getElementById("iniciativa").classList.contains("recolhida"))) && (await p.evaluate(() => document.getElementById("ferramentas-desenho").classList.contains("recolhida"))));
await p.click("#iniciativa .cabecalho");
await p.waitForTimeout(450);

// ----- 5) as abas passam para a 2ª linha em partes IGUAIS (4 abas: 2 + 2)
const topos = await p.locator("#bolsa-abas .bolsa-aba:visible").evaluateAll((bs) => bs.map((x) => Math.round(x.getBoundingClientRect().top)));
const larguras = await p.locator("#bolsa-abas .bolsa-aba:visible").evaluateAll((bs) => bs.map((x) => Math.round(x.getBoundingClientRect().width)));
const linhasDeAbas = [...new Set(topos)];
ok("5a) as 4 abas da bolsa ocupam 2 linhas com 2 em cada (e não 3 + 1)", topos.length === 4 && linhasDeAbas.length === 2 && linhasDeAbas.every((t) => topos.filter((x) => x === t).length === 2), `tops ${topos.join(",")}`);
ok("5b) todas as abas têm a mesma largura", Math.max(...larguras) - Math.min(...larguras) <= 1, larguras.join(","));

// ----- 6) /r
await escolherAba(p, "chat");
const enviar = (t) => p.evaluate((t) => { const c = document.getElementById("chat-texto"); c.value = t; document.getElementById("chat-form").requestSubmit(); }, t);
await enviar("/r 2+3*4");
await p.waitForTimeout(600);
const cartao = p.locator(".chat-mensagem.chat-rolagem-ficha, .chat-rolagem-ficha").last();
ok("6a) '/r 2+3*4' vira um cartão de rolagem com total 14", /14/.test(await cartao.innerText()), await cartao.innerText());
await enviar("/r 1d20+5");
await p.waitForTimeout(600);
const t2 = await p.locator(".chat-rolagem-ficha").last().innerText();
ok("6b) '/r 1d20+5' rola o dado: o cartão mostra '1d20 [n] + 5' e o total é n + 5", (() => { const m = /1d20 \[(\d+)\] \+ 5/.exec(t2); return !!m && t2.includes(String(Number(m[1]) + 5)); })(), t2.replace(/\n/g, " | "));
const antesN = await p.locator(".chat-rolagem-ficha").count();
await enviar("/r FOR+2");
await p.waitForTimeout(400);
ok("6c) com variável NÃO rola (e avisa)", (await p.locator(".chat-rolagem-ficha").count()) === antesN && (await avisoVisivel()));
ok("6d) o texto '/r ...' não vira mensagem comum", (await p.locator(".chat-mensagem", { hasText: "/r 2+3*4" }).count()) === 0);
await escolherAba(p, "bolsa");

// ----- 7) o filtro de ficha única no menu "Grupos"
await p.evaluate(() => {
    const t = window.__tabuleirinho;
    t.estado.fichas.push({ id: 401, nome: "F", abas: [{ nome: "P", texto: "PV::0:10:10" }], versao: 1, criadaEm: 0, alteradaEm: 0, favorito: false, grupos: [] });
    t.estado.tokens.find((x) => x.id === 1).guardado = true;
    t.estado.tokens.find((x) => x.id === 1).ficha = 401;
    t.semear([]);
});
await p.waitForTimeout(300);
ok("7a) o token de ficha única mostra o ícone da ficha em DOURADO na bolsa (e não há mais o selo separado)", (await p.locator("#bolsa-itens .ficha .item-ficha-vinculo.unica").count()) >= 1 && (await p.locator("#bolsa-itens .ficha .item-unica").count()) === 0);
await p.click("#bolsa-filtro-grupos");
const itens = await p.locator("#menu-grupos > *").evaluateAll((es) => es.map((e) => (e.tagName === "HR" ? "—" : e.textContent.trim())));
ok("7b) no menu a ordem termina em: Fichas únicas, Mostrar todos, Novo grupo (embaixo dos grupos)", /De ficha única/.test(itens.at(-4) ?? "") && /Mostrar todos/.test(itens.at(-3) ?? ""), itens.join(" | "));
ok("7c) a entrada usa o selo (sem a bolinha azul de grupo)", (await p.locator("#menu-grupos .icone-unica").count()) === 1 && (await p.locator("#menu-grupos .icone-unica").locator("xpath=..").locator(".ponto-grupo").count()) === 0);

ok("8) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
process.exitCode = terminar(erros);
await nav.close();
