// Teste da LÓGICA dos dados (src/dados.ts), direto no Node: sem navegador, roda em um instante.
// Rodar: npm run test:e2e -- dados-logica
import { detalheDaRolagem, formulaDosDados, rolarDados } from "../../src/dados.ts";
import { ok, terminar } from "./ajuda.mjs";

const LADOS = [4, 6, 8, 10, 12, 20, 100, 1000];

// ---- 1) valores sempre dentro de 1..lados, e o total é soma + modificador
let fora = 0, totalErrado = 0, contagemErrada = 0;
for (const lados of LADOS) {
    for (let i = 0; i < 3000; i++) {
        const quantidade = 1 + (i % 20), modificador = (i % 21) - 10;
        const r = rolarDados(lados, quantidade, modificador);
        if (r.resultados.length !== quantidade) contagemErrada++;
        if (r.resultados.some((v) => !Number.isInteger(v) || v < 1 || v > lados)) fora++;
        if (r.total !== r.resultados.reduce((a, v) => a + v, 0) + modificador) totalErrado++;
    }
}
ok("1a) em 24.000 rolagens (todos os dados), todo resultado é inteiro entre 1 e o número de lados", fora === 0, `${fora} fora`);
ok("1b) a quantidade de resultados é sempre a pedida", contagemErrada === 0);
ok("1c) o total é sempre a soma dos dados + o modificador", totalErrado === 0);

// ---- 2) extremos: o menor e o maior valor de cada dado podem sair
for (const lados of LADOS) {
    const minimo = rolarDados(lados, 1, 0, () => 0).resultados[0];
    const maximo = rolarDados(lados, 1, 0, () => 0.9999999).resultados[0];
    const exatoUm = rolarDados(lados, 1, 0, () => 1).resultados[0]; // um sorteador que devolva 1 não pode passar de `lados`
    ok(`2) d${lados}: sorteio 0 dá 1, sorteio ~1 dá ${lados}, e sorteio igual a 1 não passa de ${lados}`, minimo === 1 && maximo === lados && exatoUm === lados, `${minimo}, ${maximo}, ${exatoUm}`);
}

// ---- 3) distribuição: no d6 e no d20 todas as faces saem, e de forma parecida (sem viés grosseiro)
for (const lados of [6, 20]) {
    const vezes = new Array(lados + 1).fill(0);
    const N = 60000;
    for (let i = 0; i < N; i++) vezes[rolarDados(lados, 1, 0).resultados[0]]++;
    const esperado = N / lados;
    const faces = vezes.slice(1);
    const pior = Math.max(...faces.map((v) => Math.abs(v - esperado) / esperado));
    ok(`3) d${lados}: em ${N} rolagens todas as faces saem e nenhuma foge mais de 8% do esperado`, faces.every((v) => v > 0) && pior < 0.08, `pior desvio ${(pior * 100).toFixed(1)}%`);
}
// a média de 1 d1000 deve ficar perto de 500,5
let soma = 0;
for (let i = 0; i < 40000; i++) soma += rolarDados(1000, 1, 0).resultados[0];
ok("3b) d1000: a média de 40.000 rolagens fica perto de 500,5 (±15)", Math.abs(soma / 40000 - 500.5) < 15, `média ${(soma / 40000).toFixed(1)}`);

// ---- 4) determinismo com sorteador fixo (conta conhecida)
const r = rolarDados(6, 3, 2, () => 0.5); // floor(0,5*6)+1 = 4 em cada dado
ok("4) com sorteador fixo 0,5: 3d6+2 dá [4,4,4] e total 14", JSON.stringify(r.resultados) === "[4,4,4]" && r.total === 14 && r.lados === 6 && r.quantidade === 3 && r.modificador === 2);
ok("4b) modificador negativo pode dar total negativo (1d4-10 com sorteio 0 = -9)", rolarDados(4, 1, -10, () => 0).total === -9);

// ---- 5) texto da fórmula e do detalhe
ok("5a) fórmula: 2d6+3, 1d20 (sem modificador), 3d8-1", formulaDosDados(2, 6, 3) === "2d6+3" && formulaDosDados(1, 20, 0) === "1d20" && formulaDosDados(3, 8, -1) === "3d8-1");
ok("5b) detalhe: '[4, 5] +3', '[7]' sem modificador, '[2, 3] -1'", detalheDaRolagem({ lados: 6, quantidade: 2, modificador: 3, resultados: [4, 5], total: 12 }) === "[4, 5] +3" && detalheDaRolagem({ lados: 20, quantidade: 1, modificador: 0, resultados: [7], total: 7 }) === "[7]" && detalheDaRolagem({ lados: 6, quantidade: 2, modificador: -1, resultados: [2, 3], total: 4 }) === "[2, 3] -1");
const muitos = { lados: 6, quantidade: 15, modificador: 0, resultados: Array.from({ length: 15 }, (_, i) => i + 1), total: 120 };
ok("5c) passando de 12 dados, o detalhe mostra os 12 primeiros e '…'", detalheDaRolagem(muitos, 12) === "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, …]", detalheDaRolagem(muitos, 12));
ok("5d) sem limite (Infinity) mostra todos, sem '…'", !detalheDaRolagem(muitos, Infinity).includes("…") && detalheDaRolagem(muitos, Infinity).includes("15"));

process.exitCode = terminar();
