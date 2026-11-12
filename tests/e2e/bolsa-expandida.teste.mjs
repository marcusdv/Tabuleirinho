// Teste e2e: bolsa EXPANDIDA e criação de tokens. Rodar: npm run test:e2e -- bolsa-expandida
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// Clicar na bolsa a expande (quase a tela toda, margem de 16 px); lá dentro se escolhe nome, imagem,
// tamanho, cor de PREENCHIMENTO e cor da BORDA e se cria um token novo, que nasce GUARDADO na bolsa. A imagem
// fica por cima do preenchimento; o botão direito numa ficha altera/remove a imagem. O que este teste protege também: soltar uma
// fichinha em cima da bolsa NÃO pode abri-la (o navegador dispara um "click" nesse caso) e o botão
// Fechar não pode reabri-la (o mesmo clique subia até a bolsa).
import { PNG } from "pngjs";
import { abrirPagina, lancar, lerEstado, ok, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const expandida = async () => ((await p.locator("#bolsa").getAttribute("class")) ?? "").includes("expandida");
const tokens = () => lerEstado(p, (e) => e.tokens.map((t) => ({ id: t.id, nome: t.nome, imagem: t.imagem, size: t.size, cor: t.cor, corBorda: t.corBorda, guardado: t.guardado, col: t.col, row: t.row })));
const arrastar = async (de, para) => {
    await p.mouse.move(de.x, de.y);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) {
        await p.mouse.move(de.x + ((para.x - de.x) * i) / 8, de.y + ((para.y - de.y) * i) / 8);
        await p.waitForTimeout(15);
    }
    await p.mouse.up();
};
const centro = (c) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });

// 1) abrir clicando numa área vazia da bolsa
const pequena = await p.locator("#bolsa").boundingBox();
await p.mouse.click(pequena.x + pequena.width / 2, pequena.y + pequena.height - 8);
ok("1a) clicar na bolsa fechada a expande", await expandida());
const grande = await p.locator("#bolsa").boundingBox();
ok("1b) ela cobre quase a tela toda, com 16 px de margem de cada lado",
    grande.x === 16 && grande.y === 16 && Math.round(1400 - (grande.x + grande.width)) === 16 && Math.round(800 - (grande.y + grande.height)) === 16,
    JSON.stringify(grande));
ok("1c) a área 'Criar token' e o botão Fechar aparecem", (await p.locator("#bolsa-criar").isVisible()) && (await p.locator("#bolsa-fechar").isVisible()));

// 2) criar um token 3×3 vermelho
const antes = (await tokens()).length;
await p.click('button[data-tamanho="3"]');
await p.click('#bolsa-amostras .amostra[data-cor="#e74c3c"]');
await p.click("#bolsa-criar-botao");
const depois = await tokens();
const novo = depois[depois.length - 1];
ok("2a) criou 1 token novo", depois.length === antes + 1, `${antes} -> ${depois.length}`);
ok("2b) com o tamanho 3×3, a cor vermelha, e já GUARDADO na bolsa", novo.size === 3 && novo.cor === 0xe74c3c && novo.guardado === true, JSON.stringify(novo));
ok("2c) o id é novo (não repete nenhum)", new Set(depois.map((t) => t.id)).size === depois.length);
ok("2d) aparece 1 fichinha 3×3 na lista e a contagem mostra (1)", (await p.locator(".ficha").count()) === 1 && (await p.locator("#bolsa-contagem").textContent()) === "(1)");
ok("2e) a prévia mostra o tamanho escolhido", (await p.locator("#bolsa-previa small").textContent()) === "3×3");

ok("2f) sem nome digitado, o token ganha o nome padrão 'Token <id>'", novo.nome === `Token ${novo.id}`, novo.nome);
ok("2g) a ficha mostra o nome", (await p.locator(".ficha .ficha-nome").first().textContent()) === novo.nome);

// 3) cor livre (seletor), tamanho 1×1 e NOME digitado (Enter cria; o campo limpa; corta em 20; HTML vira texto)
await p.click('button[data-tamanho="1"]');
await p.locator("#bolsa-cor").fill("#12ab34");
await p.locator("#bolsa-nome").fill("<b>Goblin Arqueiro Chefe do Bando</b>");
ok("3a) o campo de nome corta em 20 caracteres", (await p.locator("#bolsa-nome").inputValue()).length === 20);
await p.keyboard.press("Enter");
const t3 = (await tokens()).at(-1);
ok("3b) o seletor de cor livre vale: token 1×1 de cor #12ab34", t3.size === 1 && t3.cor === 0x12ab34 && t3.guardado, JSON.stringify(t3));
ok("3c) Enter no campo de nome cria o token, com o nome cortado a 20", t3.nome === "<b>Goblin Arqueiro C", JSON.stringify(t3.nome));
ok("3d) o campo de nome limpa depois de criar", (await p.locator("#bolsa-nome").inputValue()) === "");
ok("3e) o nome é mostrado como TEXTO (nenhum <b> real na bolsa)", (await p.locator("#bolsa-itens b").count()) === 0);

// 4) com a bolsa expandida, a ficha não é arrastada
const ficha = await p.locator(".ficha").first().boundingBox();
await arrastar(centro(ficha), { x: 700, y: 500 });
ok("4) arrastar uma ficha com a bolsa expandida não tira o token da bolsa", (await tokens()).filter((t) => t.guardado).length === 2);

// 5) Esc fecha; e o token novo vai para o mapa arrastando a fichinha
await p.keyboard.press("Escape");
ok("5a) Esc fecha a bolsa", !(await expandida()));
const f3 = await p.locator(".ficha", { hasText: "3×3" }).boundingBox();
await arrastar(centro(f3), { x: 600, y: 300 });
const colocado = (await tokens()).find((t) => t.size === 3);
ok("5b) arrastar a ficha para o mapa coloca o token novo (já não está guardado)", colocado.guardado === false, JSON.stringify(colocado));
ok("5c) soltar no mapa não abriu a bolsa", !(await expandida()));

// 6) guardar de volta soltando em cima da bolsa NÃO abre a bolsa
const alvo = await p.locator("#bolsa").boundingBox();
await arrastar({ x: 124 + (colocado.col + 1.5) * 64, y: 80 + (colocado.row + 1.5) * 64 }, centro(alvo));
ok("6a) o token voltou para a bolsa", (await tokens()).find((t) => t.size === 3).guardado === true);
ok("6b) e soltar em cima da bolsa NÃO a expandiu", !(await expandida()));
const fx = await p.locator(".ficha").first().boundingBox();
const alvo2 = await p.locator("#bolsa").boundingBox();
await arrastar(centro(fx), { x: alvo2.x + alvo2.width / 2, y: alvo2.y + alvo2.height - 8 });
ok("6c) soltar uma fichinha na própria bolsa também não a expande", !(await expandida()));

// 7) fechar pela margem escura e pelo botão
await p.mouse.click(alvo2.x + alvo2.width / 2, alvo2.y + alvo2.height - 8);
ok("7a) (preparo) clicar de novo em área vazia reabre", await expandida());
await p.mouse.click(6, 400);
ok("7b) clicar na margem escura fecha", !(await expandida()));
await p.mouse.click(pequena.x + pequena.width / 2, pequena.y + pequena.height - 8);
await p.click("#bolsa-fechar");
ok("7c) o botão Fechar fecha", !(await expandida()));

// 8) janela pequena: continua abrindo, cobre a janela e dá para criar
await p.setViewportSize({ width: 700, height: 600 });
const b8 = await p.locator("#bolsa").boundingBox();
await p.mouse.click(b8.x + b8.width / 2, b8.y + b8.height - 6);
const g8 = await p.locator("#bolsa").boundingBox();
ok("8a) em 700×600 abre e cobre a janela (margem de 16 px)", (await expandida()) && g8.x === 16 && g8.y === 16 && Math.round(700 - (g8.x + g8.width)) === 16, JSON.stringify(g8));
const n8 = (await tokens()).length;
await p.click("#bolsa-criar-botao");
ok("8b) o botão Criar token funciona na janela pequena", (await tokens()).length === n8 + 1);

// 9) IMAGEM do token: editor de recorte, borda colorida, menu do botão direito
await p.setViewportSize({ width: 1400, height: 800 });
const foto = (() => {
    const png = new PNG({ width: 600, height: 400 });
    for (let i = 0; i < png.data.length; i += 4) png.data.set([200, 60, 60, 255], i);
    return { name: "foto.png", mimeType: "image/png", buffer: PNG.sync.write(png) };
})();
const outraFoto = { ...foto, buffer: (() => { const png = new PNG({ width: 500, height: 500 }); for (let i = 0; i < png.data.length; i += 4) png.data.set([30, 90, 200, 255], i); return PNG.sync.write(png); })() };
const escolherArquivo = async (seletor, arquivo) => {
    const [seletorDeArquivo] = await Promise.all([p.waitForEvent("filechooser"), p.click(seletor)]);
    await seletorDeArquivo.setFiles(arquivo);
};
const editorPronto = () => p.waitForFunction(() => !document.getElementById("editor-imagem-usar").disabled);
const editorAberto = () => p.locator("#editor-imagem").isVisible();

await escolherArquivo("#bolsa-imagem-escolher", foto);
await editorPronto();
ok("9a) escolher uma imagem abre o editor de recorte, pronto para usar", await editorAberto() && (await p.locator("#editor-imagem-aviso").textContent()) === "");
await p.keyboard.press("Escape");
ok("9b) Esc fecha SÓ o editor (a bolsa continua expandida)", !(await editorAberto()) && (await expandida()));
ok("9c) cancelar não escolhe imagem (o botão continua 'Escolher imagem…' e não há 'Remover')", (await p.locator("#bolsa-imagem-escolher").textContent()) === "Escolher imagem…" && !(await p.locator("#bolsa-imagem-remover").isVisible()));

await escolherArquivo("#bolsa-imagem-escolher", foto);
await editorPronto();
const tela = await p.locator("#editor-imagem-tela").boundingBox();
await p.mouse.move(tela.x + 160, tela.y + 160);
await p.mouse.wheel(0, -300);
ok("9d) a roda do mouse dá zoom no recorte", Number(await p.locator("#editor-imagem-zoom").inputValue()) > 1);
await p.mouse.wheel(0, 6000);
ok("9d2) dá para AFASTAR bem (zoom out até 0,2): a imagem pode ficar menor que o círculo", Number(await p.locator("#editor-imagem-zoom").inputValue()) === 0.2, await p.locator("#editor-imagem-zoom").inputValue());
await p.click("#editor-imagem-usar");
ok("9e) 'Usar imagem' fecha o editor e o botão vira 'Trocar imagem…'", !(await editorAberto()) && (await p.locator("#bolsa-imagem-escolher").textContent()) === "Trocar imagem…");
ok("9f) a prévia mostra a imagem", await p.locator("#bolsa-previa .disco").evaluate((e) => e.classList.contains("com-imagem")));

await p.locator("#bolsa-nome").fill("Com foto");
await p.click('#bolsa-amostras .amostra[data-cor="#f1c40f"]'); // preenchimento amarelo
await p.click('#bolsa-amostras-borda .amostra[data-cor="#e74c3c"]'); // borda vermelha
await p.click("#bolsa-criar-botao");
const comFoto = (await tokens()).find((t) => t.nome === "Com foto");
ok("9g) o token nasce com a imagem (miniatura WebP pequena), o preenchimento amarelo e a borda vermelha", comFoto?.imagem?.startsWith("data:image/webp") && comFoto.imagem.length < 60000 && comFoto.cor === 0xf1c40f && comFoto.corBorda === 0xe74c3c, `${comFoto?.imagem?.length} caracteres`);
ok("9h) depois de criar, o formulário volta a 'sem imagem' (e as cores escolhidas continuam)", (await p.locator("#bolsa-imagem-escolher").textContent()) === "Escolher imagem…" && (await tokens()).length > 0);

const fichaFoto = p.locator(".ficha", { hasText: "Com foto" });
ok("9i) a ficha mostra a imagem", await fichaFoto.locator(".disco").evaluate((e) => e.classList.contains("com-imagem")));
await fichaFoto.click({ button: "right" });
ok("9j) clique direito na ficha abre o menu só com 'Editar token…' e 'Alterar imagem…' (o 'Remover imagem' fica dentro de Editar token)", (await p.locator("#menu-ficha").isVisible()) && (await p.locator("#menu-ficha button:visible").allTextContents()).join("|") === "Editar token…|Alterar imagem…");
await escolherArquivo("#menu-ficha-alterar", outraFoto);
await editorPronto();
await p.click("#editor-imagem-usar");
const trocada = (await tokens()).find((t) => t.nome === "Com foto");
ok("9k) 'Alterar imagem' troca a miniatura do token", trocada.imagem?.startsWith("data:image/webp") && trocada.imagem !== comFoto.imagem);
await fichaFoto.click({ button: "right" });
await p.keyboard.press("Escape");
ok("9l) Esc fecha só o menu (a bolsa continua aberta)", !(await p.locator("#menu-ficha").isVisible()) && (await expandida()));
await fichaFoto.click({ button: "right" });
await p.click("#menu-ficha-editar");
ok("9m) em 'Editar token' há 'Alterar imagem…' e 'Remover imagem' (o token tem imagem)", (await p.locator("#editor-token-imagem").textContent()) === "Alterar imagem…" && (await p.locator("#editor-token-sem-imagem").isVisible()));
await p.click("#editor-token-sem-imagem");
await p.click("#editor-token-cancelar");
ok("9n) 'Remover imagem' + Cancelar NÃO tira a imagem", (await tokens()).find((t) => t.nome === "Com foto").imagem !== null);
await fichaFoto.click({ button: "right" });
await p.click("#menu-ficha-editar");
await p.click("#editor-token-sem-imagem");
await p.click("#editor-token-salvar");
ok("9n2) 'Remover imagem' + Salvar tira a imagem (o token volta a ser preenchido pela cor)", (await tokens()).find((t) => t.nome === "Com foto").imagem === null);
await fichaFoto.click({ button: "right" });
await p.click("#menu-ficha-editar");
ok("9n3) num token SEM imagem a janela mostra 'Escolher imagem…' e esconde 'Remover imagem'", (await p.locator("#editor-token-imagem").textContent()) === "Escolher imagem…" && !(await p.locator("#editor-token-sem-imagem").isVisible()));
await p.keyboard.press("Escape");

await p.locator("#bolsa-nome").fill("");
await p.evaluate(() => {});
await escolherArquivo("#bolsa-imagem-escolher", { name: "texto.txt", mimeType: "text/plain", buffer: Buffer.from("não sou uma imagem") });
ok("9o) um arquivo que não é imagem mostra aviso e não deixa usar", (await p.locator("#editor-imagem-aviso").textContent()).includes("não é uma imagem") && (await p.locator("#editor-imagem-usar").isDisabled()));
await p.click("#editor-imagem-cancelar");

// 10) as duas cores são independentes, e a borda padrão é branca
await p.locator("#bolsa-nome").fill("Duas cores");
await p.locator("#bolsa-cor").fill("#112233");
await p.locator("#bolsa-cor-borda").fill("#aabbcc");
const previaDisco = await p.locator("#bolsa-previa .disco").evaluate((e) => ({ fundo: getComputedStyle(e).backgroundColor, borda: getComputedStyle(e).borderTopColor }));
ok("10a) a prévia usa o preenchimento e a borda escolhidos, cada um na sua cor", previaDisco.fundo === "rgb(17, 34, 51)" && previaDisco.borda === "rgb(170, 187, 204)", JSON.stringify(previaDisco));
const prevAntes = (await p.locator("#bolsa-previa .disco").boundingBox()).width;
await p.click('button[data-tamanho="4"]');
const prevDepois = (await p.locator("#bolsa-previa .disco").boundingBox()).width;
ok("10b) a prévia é GRANDE (pelo menos 150 px no 4×4) e cresce com o tamanho", prevDepois >= 150 && prevDepois > prevAntes, `${prevAntes} -> ${prevDepois}`);
await p.click("#bolsa-criar-botao");
const duas = (await tokens()).find((t) => t.nome === "Duas cores");
ok("10c) o token guarda as duas cores (sem imagem)", duas.cor === 0x112233 && duas.corBorda === 0xaabbcc && duas.imagem === null, JSON.stringify(duas));
ok("10d) os 5 tokens iniciais têm borda branca (como sempre foi)", (await tokens()).filter((t) => t.id <= 5).every((t) => t.corBorda === 0xffffff));

// 11) os TRÊS tamanhos: pequena, MÉDIA (quadradinho colado em cima; com pesquisa; arrasta tokens) e tela cheia
await p.click("#bolsa-fechar");
const bPeq = await p.locator("#bolsa").boundingBox(), tab = await p.locator("#bolsa-maximizar").boundingBox();
ok("11a) o quadradinho de maximizar fica COLADO em cima da caixa da bolsa pequena", Math.abs(tab.y + tab.height - bPeq.y) <= 1.5 && tab.x >= bPeq.x && tab.x + tab.width <= bPeq.x + bPeq.width, `base da aba ${(tab.y + tab.height).toFixed(0)} / topo da caixa ${bPeq.y.toFixed(0)}`);
ok("11a2) na pequena a pesquisa e o 'Criar/editar' ficam escondidos", !(await p.locator("#bolsa-busca").isVisible()) && !(await p.locator("#bolsa-gerenciar").isVisible()));
const classe = async () => (await p.locator("#bolsa").getAttribute("class")) ?? "";
await p.click("#bolsa-maximizar");
ok("11b) o quadradinho abre a bolsa MÉDIA (maior, com pesquisa, sem tela cheia)", (await classe()).includes("media") && !(await expandida()) && (await p.locator("#bolsa-busca").isVisible()) && (await p.locator("#bolsa").boundingBox()).width > bPeq.width + 40);
const mediaBox = await p.locator("#bolsa").boundingBox();
const barraBox = await p.locator("#barra").boundingBox();
ok("11b2) a média não passa por cima da barra de Ferramentas (fica abaixo dela)", mediaBox.y >= barraBox.y + barraBox.height - 1, `topo da bolsa ${mediaBox.y.toFixed(0)}, base da barra ${(barraBox.y + barraBox.height).toFixed(0)}`);
const fichas = () => p.locator(".ficha .ficha-nome").allTextContents();
for (const [nome, tam] of [["Goblin Ágil", 1], ["Goblin Chefe", 3], ["Dragão Jovem", 4]]) {
    await p.click("#bolsa-gerenciar");
    await p.fill("#bolsa-nome", nome);
    await p.click(`button[data-tamanho="${tam}"]`);
    await p.click("#bolsa-criar-botao");
    await p.click("#bolsa-fechar"); // volta para a média
}
ok("11c) 'Criar/editar' abre a tela cheia e o Fechar de lá VOLTA para a média", (await classe()).includes("media") && !(await expandida()));
const total = (await fichas()).length;
await p.fill("#bolsa-busca", "gob");
const comGob = (await tokens()).filter((t) => t.guardado && t.nome.toLowerCase().includes("gob")).length; // (o teste 3 já criou um "<b>Goblin Arqueiro C")
ok("11d) pesquisar 'gob' mostra só os tokens com 'gob' no nome, e a contagem diz 'N de total'", (await fichas()).length === comGob && comGob >= 2 && (await fichas()).every((n) => n.toLowerCase().includes("gob")) && (await p.locator("#bolsa-contagem").textContent()) === `(${comGob} de ${total})`);
await p.fill("#bolsa-busca", "DRAGAO");
ok("11e) a pesquisa ignora maiúsculas e acentos ('DRAGAO' acha 'Dragão Jovem')", (await fichas()).join() === "Dragão Jovem");
await p.fill("#bolsa-busca", "3x3");
ok("11f) também acha pelo tamanho ('3x3')", (await fichas()).includes("Goblin Chefe"));
await p.fill("#bolsa-busca", "xyzxyz");
ok("11g) sem resultado: nenhuma ficha e a mensagem 'Nenhum token encontrado'", (await fichas()).length === 0 && (await p.locator("#bolsa-vazia").textContent()).includes("Nenhum token encontrado"));
await p.fill("#bolsa-busca", "");
// arrastar da média para o mapa: o mapa continua acessível
const fMedia = await p.locator(".ficha", { hasText: "Goblin Ágil" }).boundingBox();
await p.mouse.move(fMedia.x + fMedia.width / 2, fMedia.y + fMedia.height / 2);
await p.mouse.down();
await p.mouse.move(600, 330, { steps: 10 });
await p.mouse.up();
const agil = (await tokens()).find((t) => t.nome === "Goblin Ágil");
ok("11h) na bolsa MÉDIA dá para arrastar um token para o tabuleiro (e a bolsa continua média)", agil.guardado === false && (await classe()).includes("media"), JSON.stringify(agil));
const cx = 124 + (agil.col + 0.5) * 64, cy = 80 + (agil.row + 0.5) * 64;
const alvoM = await p.locator("#bolsa").boundingBox();
await p.mouse.move(cx, cy);
await p.mouse.down();
await p.mouse.move(alvoM.x + alvoM.width / 2, alvoM.y + alvoM.height / 2, { steps: 10 });
await p.mouse.up();
ok("11i) e arrastar um token do mapa para a bolsa MÉDIA o guarda", (await tokens()).find((t) => t.nome === "Goblin Ágil").guardado === true);
const bM2 = await p.locator("#bolsa").boundingBox();
await p.mouse.click(bM2.x + bM2.width - 8, bM2.y + bM2.height - 6);
ok("11j) clicar em área vazia da bolsa MÉDIA NÃO abre a tela cheia", !(await expandida()));
await p.fill("#bolsa-busca", "troll");
await p.keyboard.press("Escape");
ok("11k) Esc com texto na pesquisa só LIMPA (continua média)", (await p.inputValue("#bolsa-busca")) === "" && (await classe()).includes("media"));
await p.keyboard.press("Escape");
ok("11l) Esc de novo volta ao tamanho pequeno", !(await classe()).includes("media"));
await p.click("#bolsa-maximizar");
await p.click("#bolsa-maximizar");
ok("11m) o quadradinho de novo (agora 'restaurar') volta ao pequeno, e a pesquisa é limpa", !(await classe()).includes("media") && (await p.inputValue("#bolsa-busca")) === "" && (await p.locator(".ficha").count()) === (await tokens()).filter((t) => t.guardado).length);

ok("12) nenhum erro de JavaScript durante o teste", erros.length === 0, erros.join(" | "));

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
