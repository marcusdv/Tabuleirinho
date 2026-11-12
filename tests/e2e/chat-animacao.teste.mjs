// Teste e2e: chat-animacao. Rodar: npm run test:e2e -- chat
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const erros = [];
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
async function abrir(opcoes = {}) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 800 }, ...opcoes });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await abrirPagina(p);
  return p;
}
// Envia uma mensagem pela própria interface (preenche e dispara o submit, como o Enter faria).
const ENVIAR = `(texto) => { const c = document.getElementById("chat-texto"); c.value = texto; document.getElementById("chat-form").requestSubmit(); }`;
const enviar = (p, t) => p.evaluate(`(${ENVIAR})(${JSON.stringify(t)})`);

let p = await abrir();
// preparo: 3 mensagens, esperando as animações acabarem
for (const t of ["um", "dois", "três"]) { await enviar(p, t); await p.waitForTimeout(500); }

// ================= A) o PRIMEIRO QUADRO: nada pula
const r = await p.evaluate(() => {
  const cartoes = () => Array.from(document.querySelectorAll(".chat-mensagem"));
  const antes = cartoes().map((c) => c.getBoundingClientRect().x);           // posições visuais antes
  const velhos = cartoes();                                                    // os mesmos elementos
  const c = document.getElementById("chat-texto"); c.value = "quarta"; document.getElementById("chat-form").requestSubmit();
  const novo = cartoes()[0];
  const depois = velhos.map((e) => e.getBoundingClientRect().x);               // logo após enviar, no mesmo instante
  return {
    antes, depois,
    animacoesNovo: novo.getAnimations().length, animacoesVelhos: velhos.map((e) => e.getAnimations().length),
    opacidadeNovo: parseFloat(getComputedStyle(novo).opacity), larguraNovo: novo.offsetWidth,
    texto: novo.querySelector("p").textContent,
  };
});
ok("A1) a mensagem nova entra na frente (esquerda) e tem animação", r.texto === "quarta" && r.animacoesNovo >= 1);
ok("A2) no primeiro quadro o cartão novo está invisível (opacidade ~0: vai aparecendo)", r.opacidadeNovo < 0.2, `opacidade ${r.opacidadeNovo.toFixed(2)}`);
ok("A3) os cartões antigos têm animação de deslize", r.animacoesVelhos.every((n) => n >= 1), r.animacoesVelhos.join(","));
ok("A4) NO PRIMEIRO QUADRO os cartões antigos estão onde estavam (sem pulo, ±1 px)", r.depois.every((x, i) => perto(x, r.antes[i], 1.5)), r.antes.map((x, i) => `${x.toFixed(0)}→${r.depois[i].toFixed(0)}`).join("  "));
await p.waitForTimeout(150);
const meio = await p.evaluate(() => Array.from(document.querySelectorAll(".chat-mensagem")).slice(1).map((e) => e.getBoundingClientRect().x));
ok("A5) no meio da animação eles já andaram um pouco para a direita (movimento gradual)", meio[0] > r.antes[0] + 3 && meio[0] < r.antes[0] + r.larguraNovo + 8 - 3, `x ${r.antes[0].toFixed(0)} → ${meio[0].toFixed(0)} (final ${(r.antes[0] + r.larguraNovo + 8).toFixed(0)})`);
await p.waitForTimeout(500);
const fim = await p.evaluate(() => ({
  xs: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => e.getBoundingClientRect().x),
  animacoes: document.getAnimations().length,
  transforms: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => getComputedStyle(e).transform),
  opNovo: getComputedStyle(document.querySelector(".chat-mensagem")).opacity,
}));
ok("A6) no fim: antigos deslocados exatamente (largura do novo + 8 px de vão)", perto(fim.xs[1] - r.antes[0], r.larguraNovo + 8, 1.5), `deslocamento ${(fim.xs[1] - r.antes[0]).toFixed(1)} esperado ${r.larguraNovo + 8}`);
ok("A7) no fim: sem animações penduradas, sem transform residual, cartão novo 100% opaco", fim.animacoes === 0 && fim.transforms.every((t) => t === "none") && fim.opNovo === "1", `animações ${fim.animacoes}, opacidade ${fim.opNovo}`);
ok("A8) no fim a ordem é: quarta, três, dois, um (da esquerda para a direita)", (await p.locator(".chat-mensagem p").allTextContents()).join("|") === "quarta|três|dois|um");

// ================= B) mensagens em sequência rápida (uma chega no meio da animação da outra)
await enviar(p, "rápida 1"); await p.waitForTimeout(120);
// Lê as posições VISUAIS no meio da animação, envia a segunda e lê de novo, tudo no MESMO instante (sem tempo passando entre as leituras).
const b1 = await p.evaluate(() => {
  const velhos = Array.from(document.querySelectorAll(".chat-mensagem")).slice(1);       // cartões que já existiam antes da 2ª
  const antes = velhos.map((e) => e.getBoundingClientRect().x);
  const c = document.getElementById("chat-texto"); c.value = "rápida 2"; document.getElementById("chat-form").requestSubmit();
  const depois = velhos.map((e) => e.getBoundingClientRect().x);
  return { antes, depois, andando: velhos.slice(0, 3).map((e) => e.getAnimations().length) };
});
ok("B1) chegar outra mensagem no MEIO da animação não faz os cartões pularem (±2 px)", b1.depois.every((x, i) => perto(x, b1.antes[i], 2)), b1.antes.slice(0, 3).map((x, i) => `${x.toFixed(0)}→${b1.depois[i].toFixed(0)}`).join("  "));
ok("B1b) ...e eles seguem animando (continuam de onde estavam)", b1.andando.every((n) => n >= 1), b1.andando.join(","));
await p.waitForTimeout(700);
const fimB = await p.evaluate(() => ({ xs: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => e.getBoundingClientRect().x), animacoes: document.getAnimations().length, transforms: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => getComputedStyle(e).transform) }));
ok("B2) no fim tudo assenta: ordem crescente em x, sem animações nem transform residual", fimB.xs.every((x, i) => i === 0 || x > fimB.xs[i - 1]) && fimB.animacoes === 0 && fimB.transforms.every((t) => t === "none"), `${fimB.animacoes} animações`);
ok("B3) o cartão mais novo está encostado na ponta esquerda da faixa", perto(fimB.xs[0], (await p.locator("#chat-faixa").boundingBox()).x, 1.5));

// ================= D) a primeira mensagem (faixa vazia) também anima
await p.close();
p = await abrir();
const d = await p.evaluate(() => { const c = document.getElementById("chat-texto"); c.value = "primeira de todas"; document.getElementById("chat-form").requestSubmit(); const n = document.querySelector(".chat-mensagem"); return { anim: n.getAnimations().length, op: parseFloat(getComputedStyle(n).opacity), dica: document.getElementById("chat-vazio") === null }; });
ok("D) a primeira mensagem de todas também entra com animação", d.anim >= 1 && d.op < 0.2 && d.dica, `animações ${d.anim}, opacidade ${d.op.toFixed(2)}`);
await p.waitForTimeout(500);

// ================= E) 110 mensagens de uma vez: sem travar, sem erro, limite respeitado
const t = await p.evaluate(() => { const t0 = performance.now(); const c = document.getElementById("chat-texto"), f = document.getElementById("chat-form"); for (let i = 0; i < 110; i++) { c.value = `massa ${i}`; f.requestSubmit(); } return { ms: performance.now() - t0, cartoes: document.querySelectorAll(".chat-mensagem").length, animacoes: document.getAnimations().length }; });
ok("E1) 110 mensagens de uma vez: limite de 100 cartões e rápido (< 2 s)", t.cartoes === 100 && t.ms < 2000, `${t.ms.toFixed(0)} ms, ${t.cartoes} cartões, ${t.animacoes} animações ativas`);
await p.waitForTimeout(700);
ok("E2) depois que passa, não sobra animação nenhuma", (await p.evaluate(() => document.getAnimations().length)) === 0);
ok("E3) a mais nova é 'massa 109' e a mais antiga guardada é 'massa 10'", (await p.locator(".chat-mensagem p").first().textContent()) === "massa 109" && (await p.locator(".chat-mensagem p").last().textContent()) === "massa 10");
await p.screenshot({ path: `${S}/ca1.png`, clip: { x: 360, y: 640, width: 700, height: 160 } });
await p.context().close();

// ================= F) usuário com "reduzir movimento": sem animação
p = await abrir({ reducedMotion: "reduce" });
const f = await p.evaluate(() => { const c = document.getElementById("chat-texto"), fo = document.getElementById("chat-form"); c.value = "a"; fo.requestSubmit(); c.value = "b"; fo.requestSubmit(); return { anim: document.getAnimations().length, op: getComputedStyle(document.querySelector(".chat-mensagem")).opacity, ordem: Array.from(document.querySelectorAll(".chat-mensagem p")).map((e) => e.textContent).join("|") }; });
ok("F) com 'reduzir movimento' ligado: nenhuma animação, mas as mensagens aparecem na ordem certa", f.anim === 0 && f.op === "1" && f.ordem === "b|a", `animações ${f.anim}, ordem ${f.ordem}`);
await p.context().close();

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
