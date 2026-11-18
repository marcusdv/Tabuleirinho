// Testes RÁPIDOS (sem navegador) das fórmulas das fichas e do "/r" do chat. Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarFicha, calcularConta, rolarConta } from "../../src/formulas.ts";

/** Um "sorteador" previsível: devolve os valores dados, em ordem (0 = sai 1; 0,999 = sai o maior lado). */
const sorteios = (...valores: number[]): (() => number) => {
    let i = 0;
    return () => valores[i++ % valores.length];
};

test("calcularConta faz contas simples e a divisão arredonda para baixo", () => {
    assert.deepEqual(calcularConta("44 - 7"), { ok: true, valor: 37 });
    assert.deepEqual(calcularConta("15 / 2"), { ok: true, valor: 7 });
    assert.equal(calcularConta("2 + FOR").ok, false); // (variáveis não valem aqui)
});

test("/r: rola contas com números, operadores e parênteses", () => {
    const r = rolarConta("2+3*4", Math.random);
    assert.ok(r.ok && r.valor.total === 14);
    const p = rolarConta("(1+2)*3", Math.random);
    assert.ok(p.ok && p.valor.total === 9);
});

test("/r: rola os dados com o sorteador e mostra o que saiu", () => {
    const r = rolarConta("1d20+5", sorteios(0.5)); // 0,5 * 20 = 10 -> sai 11
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.valor.total, 16);
    assert.equal(r.valor.detalhe, "1d20 [11] + 5");
    assert.equal(r.valor.ficha, ""); // (o "/r" não tem ficha)
});

test("/r: recusa variáveis, dados que não existem e lixo", () => {
    assert.equal(rolarConta("FOR+2", Math.random).ok, false);
    assert.equal(rolarConta("1d7", Math.random).ok, false);
    assert.equal(rolarConta("2; alert(1)", Math.random).ok, false);
});

test("a ficha calcula variáveis que dependem de outras e resolve as rolagens", () => {
    const a = analisarFicha("FOR:: 16\nMOD_FOR:: (FOR - 10) / 2\n(Ataque)[1d20 + MOD_FOR]");
    const mod = a.variaveis.find((v) => v.nome === "MOD_FOR");
    assert.equal(mod?.valor, 3);
    assert.equal(a.rolagens[0]?.nome, "Ataque");
    assert.equal(a.rolagens[0]?.resolvida, "1d20 + 3");
});

test("variável que depende de si mesma dá erro (não trava)", () => {
    const a = analisarFicha("A:: B + 1\nB:: A + 1");
    assert.ok(a.variaveis.every((v) => v.erro !== null));
});
