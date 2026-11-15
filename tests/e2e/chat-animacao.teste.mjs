// Teste e2e: chat-animacao. Rodar: npm run test:e2e -- chat-animacao
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// O chat é uma coluna vertical: a mensagem NOVA entra EMBAIXO, com fade e um pequeno deslize vindo da esquerda; as mensagens antigas não têm animação (só sobem para dar lugar à nova, como numa lista que cola no fim).
import { abrirPagina, lancar } from "./ajuda.mjs";
const b = await lancar();
const erros = [];
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const perto = (a, c, tol = 2) => Math.abs(a - c) <= tol;
async function abrir(opcoes = {}) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 800 }, ...opcoes });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  await abrirPagina(p, "", { aba: "chat" });
  return p;
}
// Envia uma mensagem pela própria interface (preenche e dispara o submit, como o Enter faria).
const ENVIAR = `(texto) => { const c = document.getElementById("chat-texto"); c.value = texto; document.getElementById("chat-form").requestSubmit(); }`;
const enviar = (p, t) => p.evaluate(`(${ENVIAR})(${JSON.stringify(t)})`);

let p = await abrir();
for (const t of ["um", "dois", "três"]) { await enviar(p, t); await p.waitForTimeout(500); }

// ================= A) a mensagem nova: entra embaixo, animada; as antigas ficam paradas
const r = await p.evaluate(() => {
  const cartoes = () => Array.from(document.querySelectorAll(".chat-mensagem"));
  const velhos = cartoes();
  const antes = velhos.map((c) => c.getBoundingClientRect().y);
  const c = document.getElementById("chat-texto"); c.value = "quarta"; document.getElementById("chat-form").requestSubmit();
  const todos = cartoes(), novo = todos.at(-1);
  return {
    antes, depois: velhos.map((e) => e.getBoundingClientRect().y),
    animacoesNovo: novo.getAnimations().length, animacoesVelhos: velhos.map((e) => e.getAnimations().length),
    opacidadeNovo: parseFloat(getComputedStyle(novo).opacity), texto: novo.querySelector("p").textContent, total: todos.length,
  };
});
ok("A1) a mensagem nova entra EMBAIXO (é o último cartão) e tem animação", r.texto === "quarta" && r.total === 4 && r.animacoesNovo >= 1);
ok("A2) no primeiro quadro o cartão novo está invisível (opacidade ~0: vai aparecendo)", r.opacidadeNovo < 0.2, `opacidade ${r.opacidadeNovo.toFixed(2)}`);
ok("A3) os cartões antigos NÃO têm animação (não deslizam)", r.animacoesVelhos.every((n) => n === 0), r.animacoesVelhos.join(","));
ok("A4) as antigas só SOBEM (abrem espaço para a nova embaixo): nenhuma desce", r.depois.every((y, i) => y <= r.antes[i] + 1), r.antes.map((y, i) => `${y.toFixed(0)}→${r.depois[i].toFixed(0)}`).join(" "));
await p.waitForTimeout(700);
const fim = await p.evaluate(() => ({
  animacoes: document.getAnimations().length,
  transforms: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => getComputedStyle(e).transform),
  opNovo: getComputedStyle(Array.from(document.querySelectorAll(".chat-mensagem")).at(-1)).opacity,
}));
ok("A5) no fim: sem animações penduradas, sem transform residual, cartão novo 100% opaco", fim.animacoes === 0 && fim.transforms.every((t) => t === "none") && fim.opNovo === "1", `animações ${fim.animacoes}, opacidade ${fim.opNovo}`);
ok("A6) no fim a ordem é: um, dois, três, quarta (de cima para baixo)", (await p.locator(".chat-mensagem p").allTextContents()).join("|") === "um|dois|três|quarta");

// ================= B) mensagens em sequência rápida: tudo assenta no fim
await enviar(p, "rápida 1"); await p.waitForTimeout(120); await enviar(p, "rápida 2"); await p.waitForTimeout(700);
const fimB = await p.evaluate(() => ({ animacoes: document.getAnimations().length, transforms: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => getComputedStyle(e).transform), ys: Array.from(document.querySelectorAll(".chat-mensagem")).map((e) => e.getBoundingClientRect().y) }));
ok("B1) no fim tudo assenta: ordem crescente em y, sem animações nem transform residual", fimB.ys.every((y, i) => i === 0 || y > fimB.ys[i - 1]) && fimB.animacoes === 0 && fimB.transforms.every((t) => t === "none"), `animações ${fimB.animacoes}`);

// ================= D) a primeira mensagem (lista vazia) também anima
await p.close();
p = await abrir();
const d = await p.evaluate(() => { const c = document.getElementById("chat-texto"); c.value = "primeira de todas"; document.getElementById("chat-form").requestSubmit(); const n = document.querySelector(".chat-mensagem"); return { anim: n.getAnimations().length, op: parseFloat(getComputedStyle(n).opacity) }; });
ok("D) a primeira mensagem de todas também entra com animação", d.anim >= 1 && d.op < 0.2, `animações ${d.anim}, opacidade ${d.op.toFixed(2)}`);
await p.waitForTimeout(500);

// ================= E) com "reduzir movimento" no sistema, nada anima
await p.close();
p = await abrir({ reducedMotion: "reduce" });
const e = await p.evaluate(() => { const c = document.getElementById("chat-texto"); c.value = "sem animação"; document.getElementById("chat-form").requestSubmit(); const n = document.querySelector(".chat-mensagem"); return { anim: n.getAnimations().length, op: parseFloat(getComputedStyle(n).opacity) }; });
ok("E) com 'reduzir movimento' a mensagem aparece direto, sem animação", e.anim === 0 && e.op === 1, `animações ${e.anim}, opacidade ${e.op}`);

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas || erros.length ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas || erros.length ? 1 : 0;
