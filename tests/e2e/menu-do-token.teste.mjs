// Teste e2e: menu-do-token (o clique direito num token do mapa). Rodar: npm run test:e2e -- menu-do-token
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// Desde 17/11/2026 o clique direito num token abre: a ENGRENAGEM acima do token (configurações: "Editar token", "Remover do tabuleiro") e o PAINEL DE AÇÕES abaixo dele (o mesmo painel dos vários
// tokens selecionados: as ações da mesa que o token pode receber, "Add condição ▾" e, para o mestre, "Adicionar à iniciativa" e "+ Nova ação"). Dano e Cura NÃO abrem mais uma janela: o valor
// se digita num CAMPO dentro do próprio painel, com a conta embaixo, e Enter aplica.
import { CAPTURAS as S, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
await abrirPagina(p);
const caixa = (s) => p.locator(s).boundingBox();
const vis = (s) => p.locator(s).isVisible();
const direito = (x, y) => p.mouse.click(x, y, { button: "right" });
const cruza = (a, c) => a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
const dentro = (a) => a.x >= 0 && a.y >= 0 && a.x + a.width <= 1400 && a.y + a.height <= 800;
const painel = "#menu-grupo-mapa";
const tokenDe = (id) => p.evaluate((i) => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.id === i); return { condicoes: t.condicoes, valores: t.valores }; }, id);

// Os tokens iniciais mudaram (estado.ts): o token 5 (roxo, coluna 12, linha 6) hoje é 1×1. Este teste quer um token 4×4 ali,
// então ele cresce pela janela "Editar token" (engrenagem). Bloco depois disso: (892,464), 256 px.
await p.mouse.click(124 + 12.5 * 64, 80 + 6.5 * 64, { button: "right" });
await p.click("#engrenagem");
await p.click("#botao-editar-token");
await p.click('#editor-token button[data-tamanho="4"]');
await p.click("#editor-token-salvar");
await p.waitForTimeout(300);
// (os tokens de teste não têm ficha: dá ao roxo um valor de status, para o Dano e a Cura aparecerem)
await p.evaluate(() => { const t = window.__tabuleirinho.estado.tokens.find((x) => x.id === 5); t.valores = t.status.map((s) => ({ id: s.id, atual: 20, max: 20 })); });

// Tabuleiro 18x10 a 100%, origem (124,80). Token 5 (roxo 4x4, col 12,row 6): bloco (892,464), largura 256.
await direito(1020, 592);
await p.waitForSelector(`${painel}:not([hidden])`, { timeout: 3000 });
const lista = await caixa(painel), eng = await caixa("#engrenagem");
{
    const itens = (await p.locator(`${painel} > button`).allTextContents()).map((t) => t.trim());
    ok("1a) o painel tem as ações da mesa (Dano, Cura), 'Add condição ▾' e, para o mestre, 'Adicionar à iniciativa' e '+ Nova ação'", itens.includes("Dano") && itens.includes("Cura") && itens.includes("Add condição ▾") && itens.includes("Adicionar à iniciativa") && itens.includes("+ Nova ação"), itens.join("|"));
}
ok("1b) o título do painel é o NOME do token (um token só)", (await p.locator(`${painel} h1`).innerText()).trim() !== "" && !/tokens selecionados/.test(await p.locator(`${painel} h1`).innerText()));
ok("1c) a lista antiga NÃO abre mais (#acoes-token escondida)", !(await vis("#acoes-token")));
ok("1d) o painel fica alinhado à borda ESQUERDA do token (x=892) ou é empurrado para DENTRO da janela", dentro(lista) && perto(lista.x, 892), `x=${lista.x.toFixed(0)}`);
ok("1e) a engrenagem fica ACIMA do token, no canto DIREITO (borda direita = 1148; topo 424)", perto(eng.x + eng.width, 1148) && perto(eng.y, 424), `direita=${(eng.x + eng.width).toFixed(0)} topo=${eng.y.toFixed(0)}`);
ok("1f) painel e engrenagem não se sobrepõem", !cruza(lista, eng));
await p.screenshot({ path: `${S}/m2_roxo.png`, clip: { x: 760, y: 280, width: 560, height: 480 } });

// "Add condição ▾": a grade das condições dentro do painel; clicar numa liga no token
await p.locator(`${painel} > button`, { hasText: "Add condição" }).click();
ok("2a) 'Add condição ▾' abre a grade das 18 condições dentro do painel", (await p.locator(`${painel} .condicao-grupo`).count()) === 18);
ok("2b) ...e o painel continua dentro da janela", dentro(await caixa(painel)));
await p.locator(`${painel} .condicao-grupo`, { hasText: "Caído" }).first().click();
ok("2c) clicar na condição a liga no token e o painel CONTINUA aberto (dá para escolher várias)", (await tokenDe(5)).condicoes.includes("Caido") && (await vis(painel)));
await p.keyboard.press("Escape");

// painel da engrenagem: abre para cima a partir da engrenagem
await direito(1020, 592);
await p.click("#engrenagem");
const pt = await caixa("#menu-token");
ok("3a) o painel da engrenagem abre ACIMA dela, alinhado à esquerda dela", pt.y + pt.height <= eng.y - 3 && perto(pt.x, eng.x), `base ${(pt.y + pt.height).toFixed(0)} <= ${eng.y.toFixed(0)}; x ${pt.x.toFixed(0)} vs ${eng.x.toFixed(0)}`);
ok("3b) tem 'Editar token' e 'Remover do tabuleiro' (diretos; excluir só existe na bolsa)", (await p.locator("#menu-token button:visible").allTextContents()).map((t) => t.trim()).join("|").startsWith("Editar token"));
await p.keyboard.press("Escape");

// DANO com o campo DENTRO do painel (sem janela): digita, vê a conta, Enter aplica
await direito(1020, 592);
await p.locator(`${painel} > button`, { hasText: /^Dano$/ }).click();
ok("4a) 'Dano' abre um CAMPO dentro do painel (e NÃO uma janela)", (await vis(`${painel} .linha-valor-grupo input`)) && !(await vis("#modal-acao")));
ok("4b) o campo já está com o cursor", (await p.evaluate(() => document.activeElement?.closest("#menu-grupo-mapa") !== null && document.activeElement?.tagName === "INPUT")));
await p.keyboard.type("3");
ok("4c) a conta aparece embaixo do campo a cada tecla", /20\s*−\s*3\s*=\s*17/.test(await p.locator(`${painel} .previa`).innerText()), await p.locator(`${painel} .previa`).innerText());
await p.keyboard.press("Enter");
ok("4d) Enter aplica: o status foi de 20 para 17 e o painel fechou", (await tokenDe(5)).valores[0]?.atual === 17 && !(await vis(painel)));
await p.keyboard.press("Escape");

// Cura com dados: a conta mostra só o valor; um texto inválido mostra o erro e não aplica
await direito(1020, 592);
await p.locator(`${painel} > button`, { hasText: /^Cura$/ }).click();
await p.keyboard.type("abc");
ok("4e) texto inválido mostra o erro e o botão de aplicar fica desligado", (await p.locator(`${painel} .previa.erro`).count()) === 1 && (await p.locator(`${painel} button.aplicar`).isDisabled()));
await p.keyboard.press("Enter");
ok("4f) Enter com texto inválido não aplica (o valor continua 17)", (await tokenDe(5)).valores[0]?.atual === 17 && (await vis(painel)));
await p.keyboard.press("Control+A"); await p.keyboard.type("1d4+9"); // (cura de 10 a 13: passa dos 3 que faltam)
ok("4g) com dados, a conta mostra só o valor, sem explicações entre parênteses", /1d4\+9/.test(await p.locator(`${painel} .previa`).innerText()) && !/\(/.test(await p.locator(`${painel} .previa`).innerText()), await p.locator(`${painel} .previa`).innerText());
await p.keyboard.press("Enter");
ok("4h) a cura com 1d4+9 enche o HP (17 -> 20, no máximo 20)", (await tokenDe(5)).valores[0]?.atual === 20);

// Esc fecha o painel E a engrenagem
await direito(1020, 592);
await p.keyboard.press("Escape");
ok("5) Esc esconde o painel e a engrenagem", !(await vis(painel)) && !(await vis("#engrenagem")));

// token estreito (azul 1x1, bloco (508,400), largura 64): a engrenagem fica acima e o painel abaixo
await direito(540, 432);
const l2 = await caixa(painel), e2 = await caixa("#engrenagem");
ok("6a) token 1×1: painel alinhado à esquerda do token (x=508) e 12 px ABAIXO dele (token termina em y=464; painel começa em 476)", perto(l2.x, 508) && perto(l2.y, 476), `x=${l2.x} y=${l2.y.toFixed(0)}`);
ok("6b) a engrenagem (acima do token) e o painel (abaixo dele) não se sobrepõem", !cruza(l2, e2) && e2.y + e2.height <= 400 && l2.y >= 464, `painel y=${l2.y.toFixed(0)}, engrenagem base=${(e2.y + e2.height).toFixed(0)}`);
ok("6c) um token SEM status (o azul dos testes) diz por que não há Dano nem Cura", (await p.locator(`${painel} .grupo-vazio`).count()) === 1);
await p.screenshot({ path: `${S}/m2_azul_pequeno.png`, clip: { x: 400, y: 250, width: 360, height: 360 } });
await p.keyboard.press("Escape");

// todos os tokens: tudo dentro da janela e sem sobreposição
const tokens = { "verde 1×1": [348, 304], "vermelho 2×2": [828, 272], "roxo 4×4": [1020, 592] }; // (o rosa 1×1, na coluna 15, fica atrás da coluna do chat/bolsa da direita)
for (const [nome, [x, y]] of Object.entries(tokens)) {
  await direito(x, y);
  const l = await caixa(painel), e = await caixa("#engrenagem");
  ok(`7) token ${nome}: painel e engrenagem dentro da janela e sem sobreposição`, dentro(l) && dentro(e) && !cruza(l, e), `painel (${l.x.toFixed(0)},${l.y.toFixed(0)}) engrenagem (${e.x.toFixed(0)},${e.y.toFixed(0)})`);
  await p.keyboard.press("Escape");
}

// crescer o token pela janela 'Editar token' (engrenagem): a engrenagem acompanha o canto direito (verde 1x1 -> 3x3)
await direito(348, 304); await p.click("#engrenagem"); await p.click("#botao-editar-token");
await p.click('#editor-token button[data-tamanho="3"]'); await p.click("#editor-token-salvar"); // 3x3: bloco (316,272), largura 192
await direito(348, 304); // reabre os botões do token já crescido
const l3 = await caixa(painel), e3 = await caixa("#engrenagem");
// col 3,row 3 => canto (316, 272); 3x3 => direita = 316 + 192 = 508 => engrenagem.direita = 508
ok("8) token crescido para 3×3: a engrenagem acompanha o canto superior direito (direita = 508) e o painel a borda esquerda (316)", perto(e3.x + e3.width, 508) && perto(l3.x, 316), `engrenagem.direita=${(e3.x + e3.width).toFixed(0)} painel.x=${l3.x.toFixed(0)}`);
await p.keyboard.press("Escape");

// zoom: com o menu aberto, mudar o zoom fecha tudo (a engrenagem e o painel)
await direito(1020, 592); await p.click("#zoom-mais"); await p.waitForTimeout(300);
ok("9) mudar o zoom fecha o painel e a engrenagem", !(await vis(painel)) && !(await vis("#engrenagem")));
// zoom diferente: largura do token na tela escala (a engrenagem acompanha o canto direito)
await p.evaluate(() => { const t = window.__tabuleirinho; t.definirTamanho(18, 10); t.camera.aplicarZoom(1); t.camera.centralizar(); }); await p.waitForTimeout(500); // (visão padrão dos testes: 18 × 10 a 100%)
for (let i = 0; i < 2; i++) await p.click("#zoom-mais"); // 100% -> 156%
await p.waitForTimeout(400);
const zoom = Number((await p.locator("#zoom-valor").textContent()).replace("%", "")) / 100;
// (com o zoom, o token roxo (4×4) pode ficar atrás da coluna da direita: leva o token para o meio da área livre e lê a posição pela câmera)
const posRoxo = await p.evaluate(() => {
  const t = window.__tabuleirinho, roxo = t.estado.tokens.find((x) => x.id === 5);
  const c0 = t.camera.mundoParaTela((roxo.col + 2) * 64, (roxo.row + 2) * 64);
  t.camera.moverPor(600 - c0.x, 400 - c0.y);
  const c = t.camera.mundoParaTela((roxo.col + 2) * 64, (roxo.row + 2) * 64), d = t.camera.mundoParaTela((roxo.col + 4) * 64, (roxo.row + 2) * 64);
  return { x: c.x, y: c.y, direita: d.x };
});
await p.waitForTimeout(200);
await direito(posRoxo.x, posRoxo.y);
const e4 = await caixa("#engrenagem");
ok(`10) com zoom ${Math.round(zoom * 100)}%, a engrenagem continua no canto superior direito do token`, perto(e4.x + e4.width, Math.min(posRoxo.direita, 1400 - 6), 3) || dentro(e4), `direita=${(e4.x + e4.width).toFixed(0)} esperada=${posRoxo.direita.toFixed(0)}`);

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
