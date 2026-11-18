// Testes rápidos (node:test) do NÍVEL DE TRANSPARÊNCIA dos seletores de cor: o desenho e a grade guardam uma opacidade (`alfa`) que é conferida ao vir de fora.
import { test } from "node:test";
import assert from "node:assert/strict";
import { limparDesenho, limparGradeDaMesa } from "../../src/estado.ts";

test("desenho: sem alfa é opaco (o campo nem existe, como nos arquivos antigos)", () => {
    const d = limparDesenho({ tipo: "livre", cor: 0xff0000, pontos: [{ x: 1, y: 1 }] });
    assert.ok(d);
    assert.equal("alfa" in d, false);
});

test("desenho: o alfa é guardado, arredondado e limitado a 0.1..1", () => {
    assert.equal((limparDesenho({ tipo: "retangulo", cor: 1, x: 1, y: 1, largura: 2, altura: 2, alfa: 0.4567 }) as { alfa?: number }).alfa, 0.46);
    assert.equal((limparDesenho({ tipo: "retangulo", cor: 1, x: 1, y: 1, largura: 2, altura: 2, alfa: 0 }) as { alfa?: number }).alfa, 0.1); // (nunca some de vez)
    assert.equal("alfa" in (limparDesenho({ tipo: "retangulo", cor: 1, x: 1, y: 1, largura: 2, altura: 2, alfa: 5 }) as object), false); // (acima de 1 vira opaco: sem campo)
    assert.equal("alfa" in (limparDesenho({ tipo: "elipse", cor: 1, x: 1, y: 1, largura: 2, altura: 2, alfa: "meio" }) as object), false); // (lixo vira opaco)
});

test("grade: o alfa vem limpo e o padrão vale se faltar", () => {
    assert.equal(limparGradeDaMesa({ espessura: 1, cor: "#112233", alfa: 0.5 }).alfa, 0.5);
    assert.equal(limparGradeDaMesa({ espessura: 1, cor: "#112233" }).alfa, 0.85); // (arquivo antigo)
    assert.equal(limparGradeDaMesa({ espessura: 1, cor: null, alfa: 0 }).alfa, 0.1);
    assert.equal(limparGradeDaMesa({ espessura: 1, cor: null, alfa: "x" }).alfa, 0.85);
});
