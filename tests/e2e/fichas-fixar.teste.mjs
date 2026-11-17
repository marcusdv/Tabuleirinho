// Teste e2e: FICHAS FIXADAS E VÁRIAS JANELAS (modo LOCAL, na tela). Rodar: npm run test:e2e -- fichas-fixar   (precisa do `npm run dev`)
// (Se o Vite só escutar em IPv6, use URL_TESTE=http://localhost:5173/ )
//
// O que confere: o botão "📌 Fixar" deixa a janela fixada; abrir outra ficha NÃO a fecha (abre numa janela nova); há no MÁXIMO 5 fixadas (a 6ª é recusada com um aviso) mais UMA janela solta; o ✕, o Fechar e o
// Esc de uma fixada só a MINIMIZAM (para fechar de verdade, solta-se com "Fixada"); a barrinha minimizada BATE NAS 4 PAREDES da tela; duplo clique na barra de cima minimiza e expande, e a barrinha fica no
// canto superior esquerdo da ficha; a divisória do painel arrasta, esconde e volta; trocar a ficha da janela SOLTA com alterações não
// salvas PERGUNTA antes (cancelar, descartar, ou salvar e abrir). NÃO confere a volta depois de recarregar (no modo local as fichas se perdem ao recarregar; isso é testado à mão, com as fichas de exemplo).
import { abrirPagina, criarFichaFechada, escolherAba, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1500, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await escolherAba(p, "bolsa");
await p.click("#bolsa-aba-fichas");
for (let i = 0; i < 6; i++) await criarFichaFechada(p); // "Criar ficha" já ABRE a ficha nova; o ajudante a fecha de novo
await p.waitForTimeout(300);
ok("0) seis fichas criadas para o teste", (await p.locator(".bolsa-doc").count()) === 6, String(await p.locator(".bolsa-doc").count()));

const janelas = () =>
    p.evaluate(() =>
        [...document.querySelectorAll("#editor-ficha")].map((r) => {
            const pn = r.querySelector("#editor-ficha-painel");
            return { visivel: !r.hidden, fixada: pn.classList.contains("fixada"), mini: pn.classList.contains("minimizada"), oculta: pn.classList.contains("lateral-oculta"), z: Number(r.style.zIndex || 0), nome: r.querySelector("#editor-ficha-nome").value };
        }),
    );
const abertas = async () => (await janelas()).filter((j) => j.visivel);
// Abre o documento pelo TECLADO (focar e Enter): com várias janelas abertas, a última pode ficar POR CIMA da bolsa e o duplo clique cairia na janela (uma pessoa arrastaria a janela para o lado).
const abrirDoc = async (i) => {
    await p.locator(".bolsa-doc").nth(i).focus();
    await p.keyboard.press("Enter");
    await p.waitForTimeout(450);
};
/** Clica num ponto DESCOBERTO de uma janela (o canto de cima: a janela seguinte nasce 28 px mais abaixo e à direita) para trazê-la para a frente e levar o foco para ela. */
const pegar = async (indice) => {
    const caixa = await p.locator("#editor-ficha-painel").nth(indice).boundingBox();
    await p.mouse.click(caixa.x + 400, caixa.y + 6);
};

// 1) fixar e abrir outra ficha: a fixada fica
await abrirDoc(0);
await p.locator("#editor-ficha-fixar").first().click();
let a = await abertas();
ok("1a) 'Fixar' deixa a janela fixada, com o botão dizendo 'Fixada'", a.length === 1 && a[0].fixada && /Fixada/.test(await p.locator("#editor-ficha-fixar").first().textContent()));
await abrirDoc(1);
a = await abertas();
ok("1b) abrir OUTRA ficha abre uma 2ª janela e mantém a fixada aberta", a.length === 2 && a.filter((j) => j.fixada).length === 1 && a[0].nome !== a[1].nome, JSON.stringify(a));
ok("1c) a janela nova fica na frente (z-index maior)", a[1].z > a[0].z, `${a[0].z} / ${a[1].z}`);
ok("1d) a bolsa marca as DUAS fichas como abertas", (await p.locator(".bolsa-doc.aberta").count()) === 2);

// 2) Esc e ✕ numa fixada só minimizam; na solta, fecham
await pegar(0);
await p.keyboard.press("Escape");
if (!(await janelas())[0].mini) await p.keyboard.press("Escape"); // (editando: o 1º Esc só vai para a leitura)
ok("2a) o Esc numa FIXADA a MINIMIZA (não fecha)", (await janelas())[0].visivel && (await janelas())[0].mini);
await p.locator("#editor-ficha-x").first().click();
ok("2b) o ✕ de uma fixada minimizada continua sem fechar", (await janelas())[0].visivel && (await janelas())[0].mini);
await p.locator("#editor-ficha-painel").nth(1).boundingBox().then((c) => p.mouse.click(c.x + c.width / 2, c.y + c.height - 4));
await p.keyboard.press("Escape");
if ((await janelas())[1].visivel) await p.keyboard.press("Escape");
ok("2c) o Esc na janela SOLTA fecha só ela; a fixada continua", !(await janelas())[1].visivel && (await janelas())[0].visivel);

// 3) a barrinha minimizada bate nas 4 paredes
async function arrastarBarrinha(x, y) {
    const nome = await p.locator("#editor-ficha-mini-nome").first().boundingBox();
    await p.mouse.move(nome.x + 10, nome.y + nome.height / 2);
    await p.mouse.down();
    await p.mouse.move(x, y, { steps: 10 });
    await p.mouse.up();
    return p.locator("#editor-ficha-painel").first().boundingBox();
}
let b = await arrastarBarrinha(-500, -500);
ok("3a) além do canto superior esquerdo: a barrinha para na parede, inteira à vista", b.x >= 0 && b.y >= 0, JSON.stringify(b));
b = await arrastarBarrinha(5000, 5000);
ok("3b) além do canto inferior direito", b.x + b.width <= 1500.5 && b.y + b.height <= 900.5, JSON.stringify(b));
b = await arrastarBarrinha(5000, -500);
ok("3c) além do canto superior direito", b.x + b.width <= 1500.5 && b.y >= 0, JSON.stringify(b));
b = await arrastarBarrinha(-500, 5000);
ok("3d) além do canto inferior esquerdo", b.x >= 0 && b.y + b.height <= 900.5, JSON.stringify(b));

// 4) duplo clique na barra de cima: minimiza e expande; a barrinha fica no canto superior esquerdo
await p.locator("#editor-ficha-mini-nome").first().dblclick();
await p.waitForTimeout(250);
let g = await p.locator("#editor-ficha-painel").first().boundingBox();
ok("4a) duplo clique na barrinha EXPANDE a ficha", !(await janelas())[0].mini && g.width > 500, JSON.stringify(g));
const antes = g;
const topo = await p.locator("#editor-ficha-nao-salvo").first().boundingBox();
await p.mouse.dblclick(topo.x + topo.width / 2, topo.y + topo.height / 2);
await p.waitForTimeout(250);
const m = await p.locator("#editor-ficha-painel").first().boundingBox();
ok("4b) duplo clique na barra de cima MINIMIZA, e a barrinha fica no canto SUPERIOR ESQUERDO da ficha", (await janelas())[0].mini && Math.abs(m.x - antes.x) <= 1 && Math.abs(m.y - antes.y) <= 1, `${JSON.stringify(antes)} -> ${JSON.stringify(m)}`);
await p.locator("#editor-ficha-mini-nome").first().dblclick();
await p.waitForTimeout(250);
ok("4c) e expande de volta no mesmo canto", !(await janelas())[0].mini);

// 5) soltar com "Fixada" e fechar de verdade
await p.locator("#editor-ficha-fixar").first().click();
await p.locator("#editor-ficha-x").first().click();
await p.waitForTimeout(250);
ok("5) depois de solta, o ✕ FECHA de verdade", (await abertas()).length === 0);

// 6) o LIMITE de 5 fixadas: abre e fixa 5 fichas; a 6ª fica solta, com aviso
for (let i = 0; i < 5; i++) {
    await abrirDoc(i);
    await p.locator("#editor-ficha-fixar").nth(i).click();
}
a = await abertas();
ok("6a) cinco fichas fixadas, cada uma na sua janela", a.length === 5 && a.every((j) => j.fixada), JSON.stringify(a.map((j) => j.nome)));
ok("6b) todas as janelas ficam abaixo das instruções (z-index de 50 a 55)", a.every((j) => j.z >= 50 && j.z <= 55), JSON.stringify(a.map((j) => j.z)));
await abrirDoc(5);
a = await abertas();
ok("6c) a 6ª ficha abre numa janela SOLTA (6 janelas ao todo)", a.length === 6 && a.filter((j) => j.fixada).length === 5);
const iSolta = (await janelas()).findIndex((j) => j.visivel && !j.fixada);
await p.locator("#editor-ficha-fixar").nth(iSolta).click();
ok("6d) tentar fixar a 6ª é RECUSADO com um aviso, e ela continua solta", /Já há 5 fichas fixadas/.test(await p.locator("#editor-ficha-aviso").nth(iSolta).textContent()) && !(await janelas())[iSolta].fixada);

// 7) trocar a ficha da janela SOLTA com alterações não salvas: pergunta antes
await p.locator("#editor-ficha-ver").nth(iSolta).click().catch(() => {}); // (se estava na leitura, vira edição)
if (await p.locator("#editor-ficha-previa").nth(iSolta).isVisible()) await p.locator("#editor-ficha-ver").nth(iSolta).click();
await p.locator("#editor-ficha-texto").nth(iSolta).fill("texto que ainda NÃO foi salvo");
await abrirDoc(0); // (a ficha 1 já está numa fixada: só traz a fixada para a frente, sem perguntar)
ok("7a) abrir uma ficha que JÁ está numa janela só traz essa janela (não pergunta nada)", !(await p.locator("#confirmar").isVisible()));
// libera uma janela fixada para a 6ª poder trocar de ficha: solta e fecha a 5ª
// (a 6ª janela, a solta, está por cima da 5ª e interceptaria o clique do mouse: o clique é disparado direto nos botões da 5ª, como se ela tivesse sido trazida para a frente)
await p.locator("#editor-ficha-fixar").nth(4).dispatchEvent("click");
await p.locator("#editor-ficha-x").nth(4).dispatchEvent("click");
await p.waitForTimeout(250);
// agora a ficha 5 não está mais aberta: abri-la na janela solta (que tem alterações) PERGUNTA
await abrirDoc(4);
ok("7b) trocar a ficha da janela solta COM alterações não salvas pergunta 'Trocar de ficha sem salvar?'", (await p.locator("#confirmar").isVisible()) && (await p.locator("#confirmar-titulo").textContent()) === "Trocar de ficha sem salvar?", await p.locator("#confirmar-titulo").textContent());
await p.click("#confirmar-cancelar");
ok("7c) 'Cancelar' deixa tudo como estava (o texto continua lá, a outra ficha não abriu)", (await p.locator("#editor-ficha-texto").nth(iSolta).inputValue()) === "texto que ainda NÃO foi salvo" && !(await p.locator("#confirmar").isVisible()));
await abrirDoc(4);
await p.click("#confirmar-alternativa");
await p.waitForTimeout(500);
ok("7d) 'Salvar e abrir a outra ficha' salva a atual e abre a outra", (await abertas()).some((j) => j.nome === "Ficha 5") && (await p.evaluate(() => window.__tabuleirinho.estado.fichas.some((f) => f.abas[0].texto === "texto que ainda NÃO foi salvo"))));

// 8) a divisória do painel de variáveis e rolagens (na janela que está NA FRENTE: as outras ficam parcialmente cobertas)
const todas = await janelas();
const iFrente = todas.reduce((melhor, j, n) => (j.visivel && j.z > (todas[melhor]?.z ?? -1) ? n : melhor), 0);
const corpo = await p.locator("#editor-ficha-corpo").nth(iFrente).boundingBox();
const d = await p.locator("#editor-ficha-divisoria").nth(iFrente).boundingBox();
await p.mouse.move(d.x + 5, d.y + d.height / 2);
await p.mouse.down();
await p.mouse.move(corpo.x + corpo.width - 4, d.y + d.height / 2, { steps: 10 });
await p.mouse.up();
ok("8a) arrastar a divisória até a borda direita ESCONDE o painel (e ele vira uma aba visível)", (await janelas())[iFrente].oculta && (await p.locator(".divisoria-rotulo").nth(iFrente).isVisible()));
const aba = await p.locator("#editor-ficha-divisoria").nth(iFrente).boundingBox();
await p.mouse.click(aba.x + aba.width / 2, aba.y + aba.height / 2);
ok("8b) clicar na aba traz o painel de volta", !(await janelas())[iFrente].oculta && (await p.locator("#editor-ficha-lateral").nth(iFrente).isVisible()));

ok("9) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
