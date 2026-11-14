// Teste e2e: ROLAR as rolagens das fichas: o MOTOR (puro) e o SERVIDOR. Rodar: npm run test:e2e -- rolar-ficha
// NÃO precisa do Vite nem de navegador: o motor é testado direto no Node e o servidor é o PRÓPRIO, ligado na porta 3795 com uma pasta de dados
// TEMPORÁRIA (apagada no fim; o `dados/` do projeto não é tocado), falando por WebSocket puro. Se a porta 3795 estiver ocupada, o teste falha.
//
// Motor: rola com um sorteio controlado (mínimo, meio, máximo), fórmula calculada, detalhe com o que saiu em cada dado, vários termos de dado e
// subtração, rolagem com erro e posição inválida dão mensagem (nunca exceção). Servidor (`rolar_ficha`: id + versão + posição; o texto e o sorteio
// são do SERVIDOR): o cartão chega a todos com o nome da rolagem e o da ficha, o sorteio é de verdade, versão velha/ficha inexistente/rolagem com
// erro/pedido malformado são recusados, campos extras são ignorados (o cliente não manda fórmula nem sorteio), a análise em cache acompanha a versão
// da ficha, o histórico leva os cartões e excluir a ficha impede rolar.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, terminar } from "./ajuda.mjs";
import { rolarDaFicha } from "../../src/formulas.ts";

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ================= 1) o MOTOR, com um sorteio controlado
const sempre = (v) => () => v; // 0 -> sempre 1; 0.999 -> sempre o máximo
const ficha = "FOR:: 16\nPROF:: 3\nMOD:: (FOR - 10) / 2\n(Ataque)[1d20 + MOD + PROF]\n(Dano)[2d6 + MOD]\n(Misto)[1d20 + 1d4 - 1]\n(Errada)[1d20 + SORTE]\n[1d8]";
let r = rolarDaFicha(ficha, 0, "Goblin", sempre(0.5));
ok("M1) 1d20 com sorteio 0,5 dá 11; total = 11 + 3 + 3 = 17; a fórmula sai calculada", r.ok && r.valor.dados[0].resultados[0] === 11 && r.valor.total === 17 && r.valor.formula === "1d20 + 3 + 3", JSON.stringify(r));
ok("M2) o detalhe traz o que saiu em cada dado: '1d20 [11] + 3 + 3'", r.ok && r.valor.detalhe === "1d20 [11] + 3 + 3", r.ok ? r.valor.detalhe : "");
ok("M3) o cartão leva o nome da rolagem e o da ficha", r.ok && r.valor.nome === "Ataque" && r.valor.ficha === "Goblin");
r = rolarDaFicha(ficha, 1, "G", sempre(0));
ok("M4) 2d6 com sorteio 0 dá 1 e 1: total 2 + 3 = 5; detalhe '2d6 [1, 1] + 3'", r.ok && r.valor.total === 5 && r.valor.detalhe === "2d6 [1, 1] + 3", JSON.stringify(r));
r = rolarDaFicha(ficha, 1, "G", sempre(0.9999));
ok("M5) sorteio perto de 1 dá o MÁXIMO (2d6 = 6 e 6): total 12 + 3 = 15", r.ok && r.valor.total === 15 && r.valor.dados[0].resultados.every((v) => v === 6));
r = rolarDaFicha(ficha, 2, "G", sempre(0.9999));
ok("M6) mais de um termo de dado e subtração: 1d20 [20] + 1d4 [4] - 1 = 23 (dados na ordem em que aparecem)", r.ok && r.valor.total === 23 && r.valor.detalhe === "1d20 [20] + 1d4 [4] - 1" && r.valor.dados.length === 2, JSON.stringify(r));
r = rolarDaFicha(ficha, 3, "G", sempre(0.5));
ok("M7) rolagem com erro (variável que não existe) NÃO rola: devolve o motivo", !r.ok && /SORTE/.test(r.erro), JSON.stringify(r));
r = rolarDaFicha(ficha, 4, "G", sempre(0.5));
ok("M8) rolagem sem nome: o nome é a própria fórmula ('1d8')", r.ok && r.valor.nome === "1d8" && r.valor.total === 5);
ok("M9) posição que não existe, negativa ou fora dos inteiros: erro (sem lançar exceção)", [99, -1, 1.5, NaN, Infinity, 1e300].every((i) => !rolarDaFicha(ficha, i, "G", sempre(0.5)).ok));
let soma = 0, min = 99, max = 0;
for (let i = 0; i < 6000; i++) { const x = rolarDaFicha("(D)[1d20]", 0, "G", Math.random); soma += x.valor.total; min = Math.min(min, x.valor.total); max = Math.max(max, x.valor.total); }
ok("M10) com Math.random de verdade: 1d20 fica sempre de 1 a 20, com média perto de 10,5", min === 1 && max === 20 && Math.abs(soma / 6000 - 10.5) < 0.5, `min ${min}, max ${max}, média ${(soma / 6000).toFixed(2)}`);
r = rolarDaFicha("(Grande)[99d1000]", 0, "G", sempre(0.9999));
ok("M11) 99d1000 no máximo: total 99000, 99 dados, e o detalhe tem os 99 resultados", r.ok && r.valor.total === 99000 && r.valor.dados[0].resultados.length === 99);
r = rolarDaFicha("(Nome)[1d20]\nA:: B\nB:: A\n(Ciclo)[1d20 + A]", 1, "G", sempre(0.5));
ok("M12) variável com ciclo: a rolagem que a usa dá erro", !r.ok && /ciclo|depende/.test(r.erro), JSON.stringify(r));

// ================= 2) o SERVIDOR
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3795;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados } });
let saida = ""; proc.stdout.on("data", (d) => (saida += d)); proc.stderr.on("data", (d) => (saida += d));
await new Promise((res) => { const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); res(); } }, 30); });
function cliente(apelido) {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
        const recebidos = []; let fechou = null;
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onclose = (e) => (fechou = e.code);
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, codigo: () => fechou, enviar: (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o)) }); };
    });
}
async function evento(c, tipo, desde = 0, ms = 2000) { const fim = Date.now() + ms; while (Date.now() < fim) { const e = c.recebidos.slice(desde).find((x) => x.tipo === tipo); if (e) return e; await esperar(20); } return null; }
try {
    const A = await cliente("Ana"), B = await cliente("Beto");
    await evento(A, "estado_inicial"); await evento(B, "estado_inicial");
    A.enviar({ tipo: "criar_ficha" });
    await evento(A, "ficha_criada");
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 1, nome: "Goblin Chefe", abas: [{ nome: "Página 1", texto: ficha }] });
    const salva = await evento(A, "ficha_editada");
    ok("S0) (preparo) ficha salva na versão 2", salva?.ficha?.versao === 2);
    let na = A.recebidos.length, nb = B.recebidos.length;
    A.enviar({ tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 0 });
    const ma = await evento(A, "mensagem", na), mb = await evento(B, "mensagem", nb);
    const rf = ma?.mensagem?.rolagemFicha;
    ok("S1) o cartão chega nas DUAS conexões (Ana e Beto), com autor, nome da rolagem e nome da ficha", mb?.mensagem?.rolagemFicha?.nome === "Ataque" && rf?.nome === "Ataque" && rf.ficha === "Goblin Chefe" && ma.mensagem.autor === "Ana", JSON.stringify(ma?.mensagem));
    ok("S2) o SERVIDOR sorteou: o dado está entre 1 e 20, e o total = dado + 3 + 3", rf.dados[0].resultados[0] >= 1 && rf.dados[0].resultados[0] <= 20 && rf.total === rf.dados[0].resultados[0] + 6 && rf.formula === "1d20 + 3 + 3" && /^1d20 \[\d+\] \+ 3 \+ 3$/.test(rf.detalhe), JSON.stringify(rf));
    ok("S3) o texto simples da mensagem tem nome, fórmula e total (para quem só lê texto)", ma.mensagem.texto === `Ataque: 1d20 + 3 + 3 = ${rf.total}`, ma.mensagem.texto);
    // variedade de resultados (sorteio real)
    const vistos = new Set();
    for (let i = 0; i < 40; i++) { const k = A.recebidos.length; A.enviar({ tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 0 }); const m = await evento(A, "mensagem", k); vistos.add(m.mensagem.rolagemFicha.dados[0].resultados[0]); await esperar(30); }
    ok("S4) 40 rolagens seguidas dão resultados VARIADOS (o sorteio é de verdade)", vistos.size >= 8, `${vistos.size} valores diferentes`);
    // erros
    async function recusa(nome, msg) { const k = A.recebidos.length; A.enviar(msg); const e = await evento(A, "erro", k, 800); await esperar(100); ok(nome, !!e && !A.recebidos.slice(k).some((x) => x.tipo === "mensagem"), JSON.stringify(e)); return e; }
    const eVersao = await recusa("S5) versão velha: recusa com o motivo e NÃO rola", { tipo: "rolar_ficha", id: 1, versao: 1, aba: 0, indice: 0 });
    ok("S5b) o motivo pede para fechar e abrir de novo", /alterada/.test(eVersao?.motivo ?? ""));
    await recusa("S6) rolagem com erro (variável inexistente) não rola", { tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 3 });
    await recusa("S7) posição que não existe", { tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 77 });
    await recusa("S8) ficha que não existe", { tipo: "rolar_ficha", id: 999, versao: 1, aba: 0, indice: 0 });
    await recusa("S9) tipos errados (indice em texto)", { tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: "0" });
    await recusa("S10) sem o campo indice", { tipo: "rolar_ficha", id: 1, versao: 2 });
    await recusa("S11) indice negativo", { tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: -1 });
    // o cliente NÃO consegue mandar a fórmula: campos extras são descartados
    na = A.recebidos.length;
    A.enviar({ tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 1, formula: "1000d1000", total: 999999, texto: "(X)[99d1000]", sorteio: 0.9999 });
    const mx = await evento(A, "mensagem", na);
    ok("S12) campos extras (fórmula, total, sorteio, texto) são IGNORADOS: rolou o '2d6 + 3' da ficha (total 6 a 15)", mx?.mensagem?.rolagemFicha?.nome === "Dano" && mx.mensagem.rolagemFicha.total >= 6 && mx.mensagem.rolagemFicha.total <= 15, JSON.stringify(mx?.mensagem?.rolagemFicha));
    // a análise é refeita quando a ficha muda (cache por versão)
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 2, abas: [{ nome: "Página 1", texto: "(Nova)[1d4]" }] });
    await evento(A, "ficha_editada", A.recebidos.length - 1 >= 0 ? 0 : 0);
    await esperar(300);
    na = A.recebidos.length;
    A.enviar({ tipo: "rolar_ficha", id: 1, versao: 3, aba: 0, indice: 0 });
    const mn = await evento(A, "mensagem", na);
    ok("S13) depois de editar a ficha (versão 3) a rolagem usa o texto NOVO (o cache não ficou velho)", mn?.mensagem?.rolagemFicha?.nome === "Nova" && mn.mensagem.rolagemFicha.total >= 1 && mn.mensagem.rolagemFicha.total <= 4, JSON.stringify(mn?.mensagem?.rolagemFicha));
    // quem entra depois vê o histórico (o cartão de rolagem de ficha vem no estado inicial)
    const C = await cliente("Caio"); const ini = await evento(C, "estado_inicial");
    ok("S14) quem entra depois recebe o histórico com os cartões de rolagem de ficha", ini.mensagens.some((m) => m.rolagemFicha?.nome === "Ataque"), String(ini.mensagens.length));
    // excluir a ficha: não rola mais
    A.enviar({ tipo: "excluir_ficha", id: 1 }); await evento(A, "ficha_excluida");
    await recusa("S15) depois de excluir a ficha, rolar dá erro", { tipo: "rolar_ficha", id: 1, versao: 3, aba: 0, indice: 0 });
} finally {
    proc.kill("SIGINT"); await new Promise((res) => proc.once("exit", res)); rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar();
