// Teste e2e: a FERRAMENTA DE ÁREA (cone, linha, esfera, cubo, emanação) no modo local: o painel (forma, tamanho em metros, prontos, lembrado ao recarregar), os dois jeitos de posicionar (clicar duas vezes
// e arrastar/soltar), a MEDIDA ("6 m\n4 quadrados") que só existe enquanto se posiciona, o cancelamento com o botão direito, o atalho A, o menu do botão direito (Área e Limpar áreas), "Limpar áreas" sem apagar o
// lápis, o Ctrl+Z, a borracha e a emanação saindo do corpo de um token. Rodar: npm run test:e2e -- area (precisa do npm run dev).
import { abrirGaveta, abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
await abrirGaveta(p, "area");

const estado = (f) => p.evaluate(`(${f.toString()})(window.__tabuleirinho.estado)`);
const areas = () => estado((e) => e.desenhos.filter((d) => d.tipo === "area").map((d) => ({ forma: d.forma, x: d.x, y: d.y, casas: d.casas, bloco: d.bloco, angulo: d.angulo })));
const casa = (c, r) => p.evaluate(([c, r]) => window.__tabuleirinho.camera.mundoParaTela((c + 0.5) * 64, (r + 0.5) * 64), [c, r]);
const medida = () => p.evaluate(() => window.__tabuleirinho.textoDaArea());
const forma = (f) => p.click(`#area-formas [data-forma="${f}"]`);
const metros = async (v) => { await p.fill("#area-metros", String(v)); await p.keyboard.press("Enter"); };
const ferramentaLigada = () => p.evaluate(() => document.querySelector('#area-formas .botao-largo.ativo')?.dataset.forma ?? null);

// ---------------------------------------------------------------- o painel
const ordem = await p.evaluate(() => [...document.querySelectorAll("#pilha > .caixa-pilha")].sort((a, b) => Number(a.style.order) - Number(b.style.order)).map((c) => c.id));
ok("1) a pilha da esquerda tem Desenho, Área, Fog e Iniciativa, nessa ordem (a Área é uma barra PRÓPRIA)", ordem.join(",") === "ferramentas-desenho,area,fog,iniciativa" && (await p.locator("#ferramentas-desenho #area-formas").count()) === 0, ordem.join(","));
ok("2) o painel tem as 5 formas", (await p.locator("#area-formas .botao-largo").count()) === 5);
ok("3) o tamanho de abertura do cone é 4,5 m, e Limpar áreas começa desabilitado", (await p.inputValue("#area-metros")) === "4.5" && (await p.isDisabled("#area-limpar")));
ok("3a) não há mais a dica de casas embaixo do alcance", (await p.locator("#area-casas").count()) === 0);
const caixaDe = (sel) => p.locator(sel).first().boundingBox();
ok("3c) a PRÉVIA fica no topo da caixa (acima das formas)", (await caixaDe("#area-previa")).y < (await caixaDe("#area-formas")).y);
ok("3d) o valor do campo Alcance fica CENTRALIZADO", (await p.evaluate(() => getComputedStyle(document.getElementById("area-metros")).textAlign)) === "center");
ok("3b) a transparência de abertura é 66% (preenchimento com 34% de opacidade)", (await p.textContent("#area-transparencia-valor")) === "66%");

await forma("circulo");
ok("4) escolher a Esfera liga a ferramenta (o botão fica dourado) e o campo vira 'Raio'", (await ferramentaLigada()) === "circulo" && (await p.textContent("#area-medida-titulo")) === "Raio");
await metros(6);
ok("5) digitar 6 m dá o raio de 4 casas (o chip 6 fica dourado)", (await p.locator('#area-prontos [data-metros="6"]').getAttribute("class")).includes("ativo"));
const topos = await p.locator("#area-prontos button").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
ok("5b) os alcances rápidos ficam numa LINHA SÓ (5 chips da esfera, todos na mesma altura)", topos.length === 5 && new Set(topos).size === 1, JSON.stringify(topos));
await metros(1000);
ok("6) digitar um tamanho enorme limita a 40 casas (60 m) e desabilita o +", (await p.inputValue("#area-metros")) === "60" && (await p.isDisabled("#area-mais")));
await p.click("#area-menos");
ok("7) o botão − tira 1 casa (1,5 m)", (await p.inputValue("#area-metros")) === "58.5");
await metros(0);
ok("8) digitar zero limita a 1 casa (1,5 m) e desabilita o −", (await p.inputValue("#area-metros")) === "1.5" && (await p.isDisabled("#area-menos")));
await p.click('#area-prontos [data-metros="6"]');

// ---------------------------------------------------------------- esfera: um clique; a medida só existe enquanto se posiciona
let q = await casa(10, 5);
await p.mouse.move(q.x, q.y);
await p.waitForTimeout(150);
ok("9) com o mouse sobre o mapa aparece o 'fantasma' com a medida no estilo da régua: 6 m\n4 quadrados", (await medida()) === "6 m\n4 quadrados", String(await medida()));
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(150);
const a1 = await areas();
ok("10) um clique FIXA a esfera (raio 4) como um desenho, com a origem encaixada de meia em meia casa", a1.length === 1 && a1[0].forma === "circulo" && a1[0].casas === 4 && (a1[0].x * 2) % 1 === 0, JSON.stringify(a1));
ok("11) depois de fixada, a medida SOME da tela", (await medida()) === null);
ok("12) com uma área no mapa, Limpar áreas fica habilitado", !(await p.isDisabled("#area-limpar")));

// ---------------------------------------------------------------- cone: dois cliques
await forma("cone");
await p.click('#area-prontos [data-metros="9"]');
let o = await casa(2, 2), f = await casa(7, 2);
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.up(); // (só clicou: a origem fica marcada)
await p.mouse.move(f.x, f.y, { steps: 5 });
await p.waitForTimeout(150);
ok("13) depois do 1º clique a área acompanha o mouse e mostra a medida (9 m\n6 quadrados)", (await medida()) === "9 m\n6 quadrados" && (await areas()).length === 1);
await p.mouse.click(f.x, f.y);
await p.waitForTimeout(150);
const a2 = await areas();
ok("14) o 2º clique fixa o cone na direção do mouse (para a direita: ângulo ≈ 0)", a2.length === 2 && a2[1].forma === "cone" && a2[1].casas === 6 && Math.abs(a2[1].angulo) < 0.3, JSON.stringify(a2[1]));
ok("15) e a medida some de novo", (await medida()) === null);

// ---------------------------------------------------------------- botão direito cancela o que está sendo posicionado
o = await casa(2, 8);
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.up();
await p.mouse.move(o.x + 120, o.y - 40, { steps: 4 });
await p.waitForTimeout(100);
await p.mouse.click(o.x + 120, o.y - 40, { button: "right" });
await p.waitForTimeout(250);
ok("16) o botão direito no meio do posicionamento CANCELA: nada é criado, a medida some e o menu NÃO abre", (await areas()).length === 2 && (await medida()) === null && (await p.locator("#menu-mapa").isHidden()));

// ---------------------------------------------------------------- cubo: arrastar e soltar
await forma("cubo");
await p.click('#area-prontos [data-metros="4.5"]');
o = await casa(3, 6); f = await casa(7, 6);
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.move(f.x, f.y, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(150);
const a3 = await areas();
ok("17) arrastar e soltar fixa o cubo (3 casas de lado)", a3.length === 3 && a3[2].forma === "cubo" && a3[2].casas === 3, JSON.stringify(a3[2]));

// ---------------------------------------------------------------- emanação: clicar num TOKEN faz o token emanar (a aura o acompanha); numa casa vazia, uma área fixa
await forma("emanacao");
await metros(3);
const t4 = await estado((e) => e.tokens.find((t) => t.nome === "Token 4"));
q = await casa(t4.col, t4.row);
await p.mouse.move(q.x, q.y);
await p.waitForTimeout(120);
const fantasma = await p.evaluate(() => window.__tabuleirinho.previaDaArea());
ok("18) com a Emanação sobre um token, o fantasma sai do corpo inteiro dele (canto e tamanho do Token 4, alcance 2 casas)", fantasma?.forma === "emanacao" && fantasma.x === t4.col && fantasma.y === t4.row && fantasma.bloco === t4.size && fantasma.casas === 2, JSON.stringify(fantasma));
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(200);
const emana = await estado((e) => e.tokens.find((t) => t.nome === "Token 4").emanacao);
ok("19) clicar no token o faz EMANAR (alcance, cor e transparência do painel); nenhum desenho de área é criado", emana?.casas === 2 && emana.alfa === 0.34 && (await areas()).length === 3, JSON.stringify(emana));
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(200);
ok("20) clicar de novo com os mesmos valores o faz PARAR de emanar", (await estado((e) => e.tokens.find((t) => t.nome === "Token 4").emanacao)) === null);
// a transparência do painel vale para a emanação do token e para as áreas novas
await p.evaluate(() => { const f = document.getElementById("area-transparencia"); f.value = "40"; f.dispatchEvent(new Event("input", { bubbles: true })); });
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(200);
ok("21) a transparência do painel (40%) vira a opacidade 0,6 na emanação do token", (await estado((e) => e.tokens.find((t) => t.nome === "Token 4").emanacao))?.alfa === 0.6);
await p.mouse.click(q.x, q.y); // (limpa o token: o teste seguinte quer a mesa como estava)
await p.waitForTimeout(150);
const vazia = await casa(13, 8); // (a casa 15 já fica sob a coluna da direita)
await p.mouse.click(vazia.x, vazia.y);
await p.waitForTimeout(150);
const a4 = (await areas())[3];
ok("22) numa casa VAZIA a emanação vira uma área fixa (corpo 1×1), com a opacidade do painel guardada", a4?.forma === "emanacao" && a4.bloco === 1 && (await estado((e) => e.desenhos.at(-1).alfa)) === 0.6, JSON.stringify(a4));
await p.evaluate(() => { const f = document.getElementById("area-transparencia"); f.value = "66"; f.dispatchEvent(new Event("input", { bubbles: true })); });
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- atalho A e Esc
await p.mouse.move(700, 600);
await p.keyboard.press("a");
await p.waitForTimeout(100);
ok("23) a tecla A liga a ferramenta de área (com a última forma)", (await ferramentaLigada()) === "emanacao");
await p.keyboard.press("a");
await p.waitForTimeout(100);
ok("24) A de novo volta a Mover", (await ferramentaLigada()) === null);
await p.keyboard.press("a");
await p.keyboard.press("Escape");
await p.waitForTimeout(100);
ok("25) Esc também sai da ferramenta", (await ferramentaLigada()) === null);

// ---------------------------------------------------------------- o menu do botão direito
await p.mouse.click(900, 700, { button: "right" });
await p.waitForTimeout(250);
await p.hover('#menu-mapa [data-acao="area"]');
await p.waitForTimeout(250);
const itens = await p.locator("#menu-mapa .menu-mapa-extras:visible button").allTextContents();
ok("26) o submenu Área tem as 5 formas (cada uma com o tamanho guardado) e as 5 áreas rápidas", itens.length === 10 && itens[0].startsWith("Cone") && itens[0].includes(" m") && itens.some((t) => t.startsWith("Bola de Fogo") && t.includes("6 m")), itens.join(" | "));
await p.click('#menu-mapa [data-acao^="area:linha:"]');
await p.waitForTimeout(150);
ok("27) uma área rápida (Relâmpago) liga a ferramenta com a forma E o tamanho (linha de 30 m = 20 casas)", (await ferramentaLigada()) === "linha" && (await p.inputValue("#area-metros")) === "30");
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- Limpar áreas não apaga o lápis, e o Ctrl+Z traz as áreas de volta
await p.click("#atalhos-rapidos [data-atalho=lapis]");
o = await casa(14, 9);
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.move(o.x + 80, o.y, { steps: 5 });
await p.mouse.up();
await p.keyboard.press("Escape");
const antes = await estado((e) => ({ total: e.desenhos.length, areas: e.desenhos.filter((d) => d.tipo === "area").length }));
await p.click("#area-limpar");
await p.waitForTimeout(150);
const depois = await estado((e) => ({ total: e.desenhos.length, areas: e.desenhos.filter((d) => d.tipo === "area").length }));
ok("28) 'Limpar áreas' apaga SÓ as áreas (o traço do lápis fica)", antes.areas === 4 && depois.areas === 0 && depois.total === antes.total - 4, JSON.stringify({ antes, depois }));
ok("29) e o botão volta a ficar desabilitado", await p.isDisabled("#area-limpar"));
await p.keyboard.press("Control+z");
await p.waitForTimeout(200);
ok("30) Ctrl+Z traz as 4 áreas de volta de uma vez", (await areas()).length === 4);

// ---------------------------------------------------------------- a borracha apaga tocando DENTRO da área (ela é preenchida)
const b = (await areas()).find((a) => a.forma === "circulo");
q = await casa(Math.floor(b.x), Math.floor(b.y) + 3); // (uma casa só da esfera: a emanação do Token 4 chega à casa do centro dela)
await p.click("#atalhos-rapidos [data-atalho=borracha]");
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(150);
ok("32) a borracha tocando dentro da área a apaga (sem precisar acertar a linha do contorno)", (await areas()).length === 3 && !(await areas()).some((a) => a.forma === "circulo"));
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- a forma que flutua com o mouse sempre nasce apontando para a DIREITA (igual à prévia do painel)
const angulo = () => p.evaluate(() => window.__tabuleirinho.previaDaArea()?.angulo ?? null);
await forma("cone");
await p.click('#area-prontos [data-metros="9"]');
o = await casa(12, 8); f = await casa(9, 8); // (um cone apontando para a ESQUERDA)
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.move(f.x, f.y, { steps: 5 });
await p.mouse.up();
await p.waitForTimeout(150);
ok("33) o cone fixado para a esquerda tem ângulo ≈ π", Math.abs(Math.abs((await areas()).at(-1).angulo) - Math.PI) < 0.35);
await p.mouse.move(o.x + 5, o.y + 90, { steps: 3 });
await p.waitForTimeout(120);
ok("34) depois de fixar, o fantasma que acompanha o mouse volta a apontar para a direita (ângulo 0)", (await angulo()) === 0, String(await angulo()));
// gira no meio do posicionamento, cancela com o botão direito: o próximo também nasce para a direita
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.up();
await p.mouse.move(o.x - 100, o.y + 60, { steps: 4 });
await p.waitForTimeout(100);
ok("35) enquanto se posiciona, a direção segue o mouse (não é mais 0)", Math.abs(await angulo()) > 0.5, String(await angulo()));
await p.mouse.click(o.x - 100, o.y + 60, { button: "right" });
await p.mouse.move(o.x + 20, o.y + 100, { steps: 3 });
await p.waitForTimeout(120);
ok("36) depois de cancelar, o fantasma também volta para a direita", (await angulo()) === 0);
// trocar de forma também
await p.mouse.move(o.x, o.y);
await p.mouse.down();
await p.mouse.up();
await p.mouse.move(o.x - 80, o.y - 80, { steps: 3 });
await p.keyboard.press("Escape");
await forma("linha");
await p.mouse.move(o.x + 30, o.y + 110, { steps: 3 });
await p.waitForTimeout(120);
ok("37) ao escolher outra forma, ela aparece apontando para a direita", (await angulo()) === 0);
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- a Área tem a PRÓPRIA paleta de cores, separada da do Desenho
const corDaArea = () => p.evaluate(() => document.querySelector("#area-amostras .amostra.escolhida")?.dataset.cor ?? null);
const corDoDesenho = () => p.evaluate(() => document.querySelector("#desenho-amostras .amostra.escolhida")?.dataset.cor ?? null);
const desenhoAntes = await corDoDesenho(); // (as cores se leem do HTML mesmo com a gaveta fechada; só os cliques precisam da gaveta aberta: abrir uma fecha a outra)
const areaAntes = await corDaArea();
ok("39) a Área tem a sua paleta (cor de abertura azul, diferente da do Desenho)", areaAntes === "#42a5f5" && desenhoAntes !== areaAntes, `${areaAntes} / ${desenhoAntes}`);
await p.locator("#area-amostras .amostra").nth(1).click();
ok("40) escolher uma cor na Área NÃO muda a cor do Desenho", (await corDaArea()) !== areaAntes && (await corDoDesenho()) === desenhoAntes);
await abrirGaveta(p, "desenho");
await p.locator("#desenho-amostras .amostra").nth(2).click();
await abrirGaveta(p, "area");
const escolhidaDaArea = await corDaArea();
ok("41) e escolher uma cor no Desenho NÃO muda a da Área", (await corDaArea()) === escolhidaDaArea && (await corDoDesenho()) !== desenhoAntes);
await forma("cone");
o = await casa(2, 8); f = await casa(5, 8);
await p.mouse.move(o.x, o.y); await p.mouse.down(); await p.mouse.move(f.x, f.y, { steps: 4 }); await p.mouse.up();
await p.waitForTimeout(150);
ok("42) a área fixada usa a cor da paleta da ÁREA", (await estado((e) => "#" + e.desenhos.at(-1).cor.toString(16).padStart(6, "0"))) === escolhidaDaArea);
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- transparência até 99%
await p.evaluate(() => { const f = document.getElementById("area-transparencia"); f.value = "99"; f.dispatchEvent(new Event("input", { bubbles: true })); });
ok("43) a transparência vai até 99% (opacidade 0,01)", (await p.textContent("#area-transparencia-valor")) === "99%" && (await p.getAttribute("#area-transparencia", "max")) === "99");
o = await casa(2, 6); f = await casa(5, 6);
await p.click('#area-formas [data-forma="linha"]');
await p.mouse.move(o.x, o.y); await p.mouse.down(); await p.mouse.move(f.x, f.y, { steps: 4 }); await p.mouse.up();
await p.waitForTimeout(150);
ok("44) uma área feita com 99% de transparência guarda a opacidade 0,01", (await estado((e) => e.desenhos.at(-1).alfa)) === 0.01);
await p.keyboard.press("Escape");
await p.evaluate(() => { const f = document.getElementById("area-transparencia"); f.value = "66"; f.dispatchEvent(new Event("input", { bubbles: true })); });

// ---------------------------------------------------------------- clique direito SOBRE uma área: "Remover área" (com o símbolo da forma e um ✕)
await forma("circulo");
await metros(3);
o = await casa(14, 2);
await p.mouse.click(o.x, o.y);
await p.waitForTimeout(150);
await p.keyboard.press("Escape");
const antesDeRemover = (await areas()).length;
await p.mouse.click(o.x, o.y, { button: "right" });
await p.waitForTimeout(300);
const itemRemover = p.locator("#menu-mapa #menu-mapa-sob button", { hasText: "Remover área" });
ok("46a) o clique direito SOBRE uma área mostra o menu de sempre E 'Remover área' (com o símbolo da forma e um ✕ vermelho)", (await p.locator("#menu-mapa button", { hasText: "Régua" }).isVisible()) && (await itemRemover.count()) === 1 && (await itemRemover.locator(".icone-circulo").count()) === 1 && (await itemRemover.locator(".extra-x").textContent()) === "✕");
await itemRemover.click();
await p.waitForTimeout(200);
ok("46b) clicar em 'Remover área' apaga só aquela área", (await areas()).length === antesDeRemover - 1);
await p.keyboard.press("Control+z");
await p.waitForTimeout(200);
ok("46c) e o Ctrl+Z traz a área de volta", (await areas()).length === antesDeRemover);
const longe2 = await casa(1, 9);
await p.mouse.click(longe2.x, longe2.y, { button: "right" });
await p.waitForTimeout(300);
ok("46d) o clique direito num lugar SEM área não mostra 'Remover área'", (await p.locator("#menu-mapa #menu-mapa-sob button").count()) === 0);
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- lembrado ao recarregar
await forma("cubo");
await metros(7.5);
await p.evaluate(() => { const i = document.getElementById("area-cor"); i.value = "#12ab34"; i.dispatchEvent(new Event("input", { bubbles: true })); }); // (uma cor LIVRE, que não está na paleta)
await p.keyboard.press("Escape");
await p.reload();
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await abrirGaveta(p, "area");
ok("45) ao recarregar, o painel lembra a forma e o tamanho (cubo de 7,5 m)", (await p.textContent("#area-medida-titulo")) === "Lado" && (await p.inputValue("#area-metros")) === "7.5");
ok("47) ao recarregar, a Área lembra a COR escolhida (uma cor livre) e a deixa MARCADA na paleta", (await corDaArea()) === "#12ab34" && (await p.inputValue("#area-cor")) === "#12ab34", String(await corDaArea()));
await forma("cubo");
o = await casa(2, 4); f = await casa(5, 4);
await p.mouse.move(o.x, o.y); await p.mouse.down(); await p.mouse.move(f.x, f.y, { steps: 4 }); await p.mouse.up();
await p.waitForTimeout(150);
ok("48) e a área desenhada depois de recarregar já usa essa cor", (await estado((e) => "#" + e.desenhos.at(-1).cor.toString(16).padStart(6, "0"))) === "#12ab34");

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
