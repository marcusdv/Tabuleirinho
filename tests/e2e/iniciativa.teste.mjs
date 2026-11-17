// Teste e2e: a CAIXA DA INICIATIVA (a 3ª gaveta da pilha da esquerda), modo LOCAL, na tela. Rodar: npm run test:e2e -- iniciativa   (precisa do `npm run dev`)
// Abre o Chrome com `navigator.webdriver` desligado para o Goblin e o Thorin de exemplo carregarem (é o caminho real de quem joga).
//
// MODO DE EDIÇÃO: a caixa começa nele ("+ Criatura", "Limpar" e "Confirmar" aparecem e o "Próximo turno" some); depois de "Confirmar" aparecem a rodada e o "Próximo turno". A lista não tem campos:
// botão direito → "Editar…" (janelinha de nome e valor) e "Remover". "+ Criatura" e "Adicionar à iniciativa" (menu do token) abrem a janelinha de edição do novo. Arrastar o TOTAL de uma rolagem
// do chat para a caixa SEMPRE acrescenta um personagem novo (com o ícone do token, se a rolagem veio de uma ficha aberta por um token). Arrastar os personagens reorganiza; fora do critério vira "livre".
import { chromium } from "playwright-core";
import { URL_SITE, ok, terminar } from "./ajuda.mjs";

const nav = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-gpu", "--disable-blink-features=AutomationControlled"] });
const p = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await p.addInitScript(() => {
    try {
        localStorage.setItem("tabuleirinho.lateral.aba", "bolsa");
        localStorage.setItem("tabuleirinho.dados.recolhido", "0");
    } catch {
        /* sem armazenamento */
    }
});
await p.goto(URL_SITE);
await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
await p.waitForTimeout(800);
await p.evaluate(() => { window.__tabuleirinho.atrasoRolagemMs = 0; });

const itens = () => p.evaluate(() => [...document.querySelectorAll("#iniciativa-lista li")].map((li) => ({ nome: li.querySelector(".iniciativa-nome").textContent, valor: Number(li.querySelector(".iniciativa-valor").textContent), vez: li.classList.contains("vez"), comImagem: li.querySelector(".iniciativa-disco").classList.contains("com-imagem") })));
const nomes = async () => (await itens()).map((i) => i.nome).join(",");
const visivel = (sel) => p.locator(sel).isVisible();
const modalAberto = () => p.locator("#modal-iniciativa").isVisible();
/** Preenche a janelinha de edição (nome e/ou valor) e salva com Enter. */
async function preencher({ nome, valor }) {
    if (nome !== undefined) await p.locator("#modal-iniciativa-nome").fill(nome);
    if (valor !== undefined) await p.locator("#modal-iniciativa-valor").fill(String(valor));
    await p.keyboard.press("Enter");
    await p.waitForTimeout(250);
}
const posToken = (nome) => p.evaluate((n) => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.copiaDe !== null && x.nome.startsWith(n)); const k = window.__tabuleirinho.camera.mundoParaTela((t.col + 0.5) * 64, (t.row + 0.5) * 64); return { x: k.x, y: k.y }; }, nome);
async function colocarNoMapa(nome, x, y) {
    await p.click("#lateral-aba-bolsa"); // (a bolsa precisa estar à vista para arrastar dela)
    await p.waitForTimeout(250);
    const f = p.locator("#bolsa-itens .ficha", { hasText: nome }).first();
    const c = await f.boundingBox();
    await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await p.mouse.down();
    await p.mouse.move(c.x - 200, c.y - 80, { steps: 6 });
    await p.mouse.move(x, y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(400);
}
async function arrastarTotalParaACaixa(alvo = "#iniciativa-botoes") {
    const t = await p.locator(".chat-total").last().boundingBox();
    const a = await p.locator(alvo).boundingBox();
    await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await p.mouse.down();
    await p.mouse.move(t.x - 150, t.y - 20, { steps: 6 });
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 10 });
    const destacou = await p.evaluate(() => document.getElementById("iniciativa").classList.contains("soltando"));
    await p.mouse.up();
    await p.waitForTimeout(350);
    return destacou;
}

// 1) a gaveta começa recolhida; ao abrir, a caixa está EM EDIÇÃO
ok("1a) a gaveta Iniciativa existe na pilha e começa RECOLHIDA", await p.evaluate(() => document.getElementById("iniciativa").classList.contains("recolhida")));
await p.click("#iniciativa .cabecalho");
await p.waitForTimeout(450);
ok("1b) aberta, a lista vazia mostra a dica", !(await p.evaluate(() => document.getElementById("iniciativa").classList.contains("recolhida"))) && (await visivel("#iniciativa-vazia")));
ok("1c) a caixa COMEÇA em edição: aparecem o '+', 'Limpar' e 'Confirmar' (sem mensagem de edição) e o 'Próximo turno' NÃO aparece", (await visivel("#iniciativa-criatura")) && (await visivel("#iniciativa-limpar")) && (await p.locator("#iniciativa-editar").innerText()) === "Confirmar" && !(await visivel("#iniciativa-proxima")) && (await p.locator("#iniciativa-aviso").count()) === 0);

// 2) + Criatura abre a janelinha de edição do novo (foco no nome)
await p.click("#iniciativa-criatura");
await p.waitForTimeout(250);
ok("2a) '+ Criatura' acrescenta 'Criatura' e abre a janelinha de edição com o foco no NOME", (await nomes()) === "Criatura" && (await modalAberto()) && (await p.evaluate(() => document.activeElement?.id === "modal-iniciativa-nome")));
await p.keyboard.type("Ana");
await p.keyboard.press("Tab");
await p.keyboard.type("15");
await p.keyboard.press("Enter");
await p.waitForTimeout(250);
ok("2b) nome e valor digitados na janelinha: a lista mostra Ana 15 e a janelinha fecha", (await modalAberto()) === false && JSON.stringify((await itens()).map((i) => [i.nome, i.valor])) === JSON.stringify([["Ana", 15]]));
await p.click("#iniciativa-criatura");
await p.waitForTimeout(250);
await preencher({ nome: "Beto", valor: 20 });
ok("2c) com 15 (Ana) e 20 (Beto) a lista ordena sozinha do MAIOR para o menor: Beto, Ana", (await nomes()) === "Beto,Ana", await nomes());
ok("2d) a lista NÃO tem campos de texto (nome e valor são só texto)", (await p.locator("#iniciativa-lista input").count()) === 0);

const cor = (sel) => p.locator(sel).evaluate((e) => getComputedStyle(e).backgroundColor + "|" + getComputedStyle(e).color);
const [confR, confG, confB] = (await cor("#iniciativa-editar")).match(/\d+/g).map(Number);
const [limpR, limpG] = (await cor("#iniciativa-limpar")).split("|")[1].match(/\d+/g).map(Number);
ok("2e) o 'Confirmar' é VERDE (o verde domina o fundo) e o 'Limpar' é VERMELHO (o texto é avermelhado)", confG > confR && confG > confB && limpR > limpG + 60, `${await cor("#iniciativa-editar")} / ${await cor("#iniciativa-limpar")}`);
// 3) Confirmar: aparecem a rodada e o Próximo turno; somem '+ Criatura' e 'Limpar'
await p.click("#iniciativa-editar");
await p.waitForTimeout(250);
ok("3a) 'Confirmar' faz aparecer a rodada e o 'Próximo turno' e SUMIR o '+' e o 'Limpar'", (await visivel("#iniciativa-proxima")) && (await visivel("#iniciativa-rodada")) && !(await visivel("#iniciativa-criatura")) && !(await visivel("#iniciativa-limpar")) && (await p.locator("#iniciativa-editar").innerText()) === "Editar");

// 4) botão direito: Editar… e Remover
const ana = await p.locator("#iniciativa-lista li").nth(1).boundingBox();
await p.mouse.click(ana.x + 14, ana.y + ana.height / 2, { button: "right" });
await p.waitForTimeout(250);
ok("4a) botão direito num personagem abre o menu com 'Editar…' e 'Remover'", (await visivel("#menu-iniciativa-editar")) && (await visivel("#menu-iniciativa-remover")));
await p.click("#menu-iniciativa-editar");
await p.waitForTimeout(250);
ok("4b) 'Editar…' abre a janelinha já com o nome e o valor dele", (await modalAberto()) && (await p.locator("#modal-iniciativa-nome").inputValue()) === "Ana" && (await p.locator("#modal-iniciativa-valor").inputValue()) === "15");
await preencher({ nome: "Ana Maria", valor: 12 });
ok("4c) salvar muda o nome e o valor na lista (continua ordenado: Beto 20, Ana Maria 12)", JSON.stringify((await itens()).map((i) => [i.nome, i.valor])) === JSON.stringify([["Beto", 20], ["Ana Maria", 12]]), JSON.stringify(await itens()));
await p.mouse.click(ana.x + 14, ana.y + ana.height / 2, { button: "right" });
await p.waitForTimeout(200);
await p.click("#menu-iniciativa-editar");
await p.waitForTimeout(200);
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
ok("4d) Esc cancela a janelinha sem mudar nada", !(await modalAberto()) && (await nomes()) === "Beto,Ana Maria");

// 5) um token pelo menu do clique direito: o Thorin no tabuleiro
await colocarNoMapa("Thorin", 500, 400);
const pos = await posToken("Thorin");
await p.mouse.click(pos.x, pos.y, { button: "right" });
await p.waitForTimeout(300);
await p.locator("#menu-grupo-mapa button", { hasText: "Adicionar à iniciativa" }).click();
await p.waitForTimeout(300);
const entradaThorin = (await itens()).find((i) => /^Thorin/.test(i.nome));
const totalNoChat = await p.evaluate(() => { const m = window.__tabuleirinho.estado.mensagens.filter((x) => x.rolagemFicha && x.rolagemFicha.nome.toLowerCase() === "iniciativa").at(-1); return m ? m.rolagemFicha.total : null; });
ok("5a) 'Adicionar à iniciativa' acrescenta o token, volta ao modo de EDIÇÃO (Confirmar) e NÃO abre a janelinha (o valor vem da ficha)", !!entradaThorin && (await p.locator("#iniciativa-editar").innerText()) === "Confirmar" && !(await modalAberto()), await nomes());
ok("5b) o valor do Thorin é o da rolagem 'Iniciativa' da ficha dele (que foi para o chat) ou 0, se a ficha não tem essa rolagem", entradaThorin.valor === (totalNoChat ?? 0), `valor=${entradaThorin.valor} chat=${totalNoChat}`);
// deixa o Thorin com 18 (pelo menu do botão direito) para os testes seguintes
{
    const linhaThorin = p.locator("#iniciativa-lista li", { hasText: "Thorin" }).first();
    const caixaT = await linhaThorin.boundingBox();
    await p.mouse.click(caixaT.x + 14, caixaT.y + caixaT.height / 2, { button: "right" });
    await p.waitForTimeout(200);
    await p.click("#menu-iniciativa-editar");
    await p.waitForTimeout(200);
    await preencher({ valor: 18 });
}
await p.mouse.click(pos.x, pos.y, { button: "right" });
await p.waitForTimeout(250);
await p.locator("#menu-grupo-mapa button", { hasText: "Adicionar à iniciativa" }).click();
await p.waitForTimeout(300);
ok("5c) adicionar o MESMO token de novo é recusado com um aviso (não duplica)", (await itens()).length === 3 && /já está na iniciativa/.test(await p.locator("#aviso").innerText()));
await p.click("#iniciativa-editar"); // confirma de novo
await p.waitForTimeout(250);

// 6) arrastar o TOTAL do chat para a caixa: SEMPRE entra um personagem novo (quem já estava fica)
await p.click("#lateral-aba-chat");
await p.waitForTimeout(250);
await p.locator("#dados-lados button", { hasText: /^d20$/ }).click();
await p.locator("#dados-rolar").click();
await p.waitForTimeout(500);
const total = Number(await p.locator(".chat-total").last().innerText());
const antes = await itens();
const destacou = await arrastarTotalParaACaixa("#iniciativa-lista li:nth-child(2)"); // (em cima de um personagem que já existe)
const depois = await itens();
ok("6a) durante o arrasto por cima da caixa, ela se DESTACA", destacou);
ok("6b) soltar o total EM CIMA de um personagem NÃO muda o valor dele: entra uma 'Criatura' NOVA com o total", depois.length === antes.length + 1 && depois.find((i) => /^Thorin/.test(i.nome)).valor === 18 && depois.some((i) => i.nome === "Criatura" && i.valor === total), JSON.stringify(depois));
ok("6c) a caixa voltou ao modo de edição (alguém chegou) e o 'Próximo turno' sumiu", (await p.locator("#iniciativa-editar").innerText()) === "Confirmar" && !(await visivel("#iniciativa-proxima")));
ok("6d) soltar assim NÃO abre a janelinha de edição", !(await modalAberto()));

// 7) rolagem de uma FICHA aberta por um token: o personagem novo entra com o ícone e o nome do token
await colocarNoMapa("Goblin", 760, 400);
const g = await posToken("Goblin");
await p.mouse.dblclick(g.x, g.y);
await p.waitForSelector("#editor-ficha-rolagens li");
await p.waitForTimeout(500);
await p.locator("#editor-ficha-rolagens li", { hasText: "Iniciativa" }).first().click();
await p.waitForTimeout(500);
await p.click("#editor-ficha-x");
await p.waitForTimeout(300);
await p.click("#lateral-aba-chat");
await p.waitForTimeout(250);
const quantos = (await itens()).length;
await arrastarTotalParaACaixa();
const comGoblin = await itens();
ok("7) arrastar a rolagem 'Iniciativa' da ficha do Goblin cria um personagem com o NOME e o ÍCONE do token Goblin", comGoblin.length === quantos + 1 && comGoblin.some((i) => i.nome === "Goblin Guerreiro" && i.comImagem), JSON.stringify(comGoblin.at(-1)));

// 8) reorganizar arrastando: sair do critério muda sozinho para ordenação LIVRE
const ordemAntes = await nomes();
const itensCaixa = await p.locator("#iniciativa-lista li").all();
const ultimo = await itensCaixa.at(-1).boundingBox();
const primeiro = await itensCaixa[0].boundingBox();
await p.mouse.move(ultimo.x + 14, ultimo.y + ultimo.height / 2);
await p.mouse.down();
await p.mouse.move(ultimo.x + 14, primeiro.y - 4, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(350);
ok("8a) arrastar o ÚLTIMO para o topo mudou a ordem", (await nomes()) !== ordemAntes && (await itens())[0].nome === ordemAntes.split(",").at(-1), `${ordemAntes} → ${await nomes()}`);
ok("8b) a ordenação passou sozinha para 'Livre' (a nova ordem não segue o critério)", (await p.locator("#iniciativa-ordem").inputValue()) === "livre");

// 9) remover pelo botão direito
const quantosAntes = (await itens()).length;
const alvo = await p.locator("#iniciativa-lista li").nth(1).boundingBox();
await p.mouse.click(alvo.x + 14, alvo.y + alvo.height / 2, { button: "right" });
await p.waitForTimeout(250);
await p.click("#menu-iniciativa-remover");
await p.waitForTimeout(250);
ok("9) 'Remover' tira o personagem da fila", (await itens()).length === quantosAntes - 1);

// 10) Confirmar, próximo turno e rodadas
await p.click("#iniciativa-editar");
await p.waitForTimeout(250);
await p.click("#iniciativa-proxima");
await p.waitForTimeout(200);
ok("10a) o primeiro 'Próximo turno' começa o combate: a vez vai para o 1º e a rodada é 1", (await itens())[0].vez && /Rodada 1/.test(await p.locator("#iniciativa-rodada").innerText()));
const n = (await itens()).length;
for (let i = 0; i < n; i++) await p.click("#iniciativa-proxima");
await p.waitForTimeout(250);
ok("10b) depois de passar por todos, a vez volta ao 1º e a rodada sobe para 2", (await itens())[0].vez && /Rodada 2/.test(await p.locator("#iniciativa-rodada").innerText()), await p.locator("#iniciativa-rodada").innerText());

// 11) Editar liga a edição à mão; Limpar (só em edição) com confirmação
await p.click("#iniciativa-editar");
await p.waitForTimeout(200);
ok("11a) 'Editar' volta ao modo de edição: aparecem '+ Criatura' e 'Limpar' e o 'Próximo turno' some", (await visivel("#iniciativa-criatura")) && (await visivel("#iniciativa-limpar")) && !(await visivel("#iniciativa-proxima")));
await p.click("#iniciativa-limpar");
await p.waitForTimeout(250);
ok("11b) 'Limpar' pergunta antes (caixa de confirmar do jogo, com o botão 'Limpar')", (await visivel("#confirmar")) && (await visivel("#confirmar button:has-text('Limpar')")));
await p.locator("#confirmar button", { hasText: "Limpar" }).click();
await p.waitForTimeout(300);
ok("11c) confirmado, a lista, a vez e a rodada são apagadas e a caixa continua em edição", (await itens()).length === 0 && (await p.locator("#iniciativa-editar").innerText()) === "Confirmar" && (await visivel("#iniciativa-vazia")));

ok("12) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
