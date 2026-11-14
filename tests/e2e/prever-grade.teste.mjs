// Teste: PREVER colunas e linhas de um mapa pelo TAMANHO da imagem (src/coordenadas.ts: preverGrade). Rodar: npm run test:e2e -- prever-grade
// NÃO precisa de Vite, de servidor nem de navegador: é código puro, testado direto no Node.
//
// Regra: se a largura e a altura são múltiplos (±2 px) de um tamanho de casa comum (70, 50, 100, 140, 200, 128, 64 px, nessa ordem de preferência) e as contagens
// cabem em 5..100, a previsão é EXATA; senão é uma ESTIMATIVA com casas de ~70 px e as linhas derivadas pela proporção da imagem (casas quadradas).
import { ok, terminar } from "./ajuda.mjs";
import { preverGrade } from "../../src/coordenadas.ts";

const p = (w, h) => preverGrade(w, h);

// ----- exatos
ok("1a) 1960×1400 = 28 × 20 casas de 70 px (Roll20), exata", JSON.stringify(p(1960, 1400)) === JSON.stringify({ colunas: 28, linhas: 20, pxPorCasa: 70, exata: true }));
ok("1b) 1000×700 cabe em 50 px (20 × 14) e em 100 px (10 × 7): vale o 50, que vem antes na preferência", p(1000, 700).colunas === 20 && p(1000, 700).linhas === 14 && p(1000, 700).pxPorCasa === 50 && p(1000, 700).exata);
ok("1c) 3000×2000 = 30 × 20 casas de 100 px (o 70 e o 50 não dão múltiplos exatos)", JSON.stringify(p(3000, 2000)) === JSON.stringify({ colunas: 30, linhas: 20, pxPorCasa: 100, exata: true }));
ok("1d) a tolerância é de 2 px: 1961×1401 ainda é 28 × 20; 1964×1400 (4 px a mais) NÃO é exata", p(1961, 1401).exata && p(1961, 1401).colunas === 28 && !p(1964, 1400).exata);

// ----- estimativas
const cachoeira = p(1946, 1362);
ok("2a) 1946×1362 (nenhum múltiplo exato): estimativa de 28 × 20 casas (casas quase quadradas), não exata", !cachoeira.exata && cachoeira.colunas === 28 && cachoeira.linhas === 20, JSON.stringify(cachoeira));
const quadrado = p(1080, 1080);
ok("2b) uma imagem QUADRADA dá o mesmo número de colunas e linhas", !quadrado.exata && quadrado.colunas === quadrado.linhas && quadrado.colunas === 15, JSON.stringify(quadrado));

// ----- limites
const pequeno = p(100, 80);
ok("3a) imagem minúscula: nunca abaixo de 5 colunas e 5 linhas", pequeno.colunas === 5 && pequeno.linhas === 5);
const enorme = p(40000, 20000);
ok("3b) imagem enorme: nunca acima de 100 colunas e 100 linhas", enorme.colunas <= 100 && enorme.linhas <= 100, JSON.stringify(enorme));
const faixa = p(7000, 350);
ok("3c) faixa muito larga: as linhas ficam em pelo menos 5", faixa.linhas >= 5 && faixa.colunas <= 100, JSON.stringify(faixa));

// ----- entradas inválidas (nunca lançam exceção)
ok("4) largura/altura zero, negativa, NaN ou infinita devolvem null", [[0, 500], [500, 0], [-5, 10], [NaN, 5], [Infinity, 5], [5, Infinity]].every(([w, h]) => p(w, h) === null));

// ----- propriedade: qualquer tamanho "real" dá valores dentro dos limites
let fora = 0;
for (let i = 0; i < 2000; i++) {
    const r = p(1 + Math.random() * 20000, 1 + Math.random() * 20000);
    if (!r || r.colunas < 5 || r.colunas > 100 || r.linhas < 5 || r.linhas > 100 || !Number.isInteger(r.colunas) || !Number.isInteger(r.linhas)) fora++;
}
ok("5) 2000 tamanhos aleatórios: sempre inteiros dentro de 5..100", fora === 0, `${fora} fora dos limites`);

process.exitCode = terminar([]);
