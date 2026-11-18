// Testes RÁPIDOS do núcleo do fog (máscara, pincel, texto). Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { cobertoEm, limparTraco, mascaraDoTexto, mascaraParaTexto, novaMascara, pintarTraco, preencherMascara } from "../../src/fog.ts";

test("a máscara nasce toda coberta ou toda revelada", () => {
    assert.equal(cobertoEm(novaMascara(10, 8, true), 3.5, 2.5), true);
    assert.equal(cobertoEm(novaMascara(10, 8, false), 3.5, 2.5), false);
});

test("pintar com 'revelar' abre um círculo; 'cobrir' fecha de novo", () => {
    const m = novaMascara(20, 20, true);
    pintarTraco(m, { x: 10, y: 10, raio: 3, cobrir: false });
    assert.equal(cobertoEm(m, 10, 10), false);
    assert.equal(cobertoEm(m, 12.5, 10), false); // (dentro do raio de 3 casas)
    assert.equal(cobertoEm(m, 14, 10), true); // (fora)
    assert.equal(cobertoEm(m, 1, 1), true);
    pintarTraco(m, { x: 10, y: 10, raio: 1, cobrir: true });
    assert.equal(cobertoEm(m, 10, 10), true);
    assert.equal(cobertoEm(m, 12.5, 10), false); // (o resto continua revelado)
});

test("fora do tabuleiro conta como coberto; pincelada na borda não estoura", () => {
    const m = novaMascara(5, 5, false);
    assert.equal(cobertoEm(m, -1, 2), true);
    assert.equal(cobertoEm(m, 7, 2), true);
    pintarTraco(m, { x: 0, y: 0, raio: 4, cobrir: true });
    assert.equal(cobertoEm(m, 0.5, 0.5), true);
});

test("preencher cobre ou revela tudo", () => {
    const m = novaMascara(6, 6, true);
    preencherMascara(m, false);
    assert.equal(cobertoEm(m, 3, 3), false);
    preencherMascara(m, true);
    assert.equal(cobertoEm(m, 3, 3), true);
});

test("a máscara vai e volta pelo texto sem mudar nada, e um texto errado é recusado", () => {
    const m = novaMascara(13, 7, true);
    pintarTraco(m, { x: 6.3, y: 3.1, raio: 2.2, cobrir: false });
    const texto = mascaraParaTexto(m);
    const volta = mascaraDoTexto(13, 7, texto);
    assert.ok(volta);
    assert.deepEqual([...volta.bits], [...m.bits]);
    assert.equal(mascaraDoTexto(13, 8, texto), null); // (o tamanho não bate)
    assert.equal(mascaraDoTexto(13, 7, "isto não é base64!"), null);
    assert.equal(mascaraDoTexto(13, 7, 42), null);
});

test("limparTraco confere o que vem da rede", () => {
    assert.deepEqual(limparTraco({ x: 3.123456, y: 4, raio: 99, cobrir: true }), { x: 3.12, y: 4, raio: 20, cobrir: true, forma: "circulo" });
    assert.equal(limparTraco({ x: NaN, y: 1, raio: 1, cobrir: true }), null);
    assert.equal(limparTraco({ x: 1, y: 1, raio: 1 }), null);
    assert.equal(limparTraco("lixo"), null);
});

test("os formatos do pincel: quadrado e triângulo", () => {
    const m = novaMascara(10, 10, true);
    pintarTraco(m, { x: 5, y: 5, raio: 2, cobrir: false, forma: "quadrado" });
    assert.equal(cobertoEm(m, 3.2, 3.2), false, "o canto do quadrado fica revelado");
    assert.equal(cobertoEm(m, 7.2, 7.2), true, "fora do quadrado continua coberto");
    const n = novaMascara(10, 10, true);
    pintarTraco(n, { x: 5, y: 5, raio: 2, cobrir: false, forma: "triangulo" });
    assert.equal(cobertoEm(n, 5, 3.3), false, "a ponta do triângulo (em cima) revela");
    assert.equal(cobertoEm(n, 3.2, 3.5), true, "o canto de cima, fora do triângulo, continua coberto");
    assert.equal(cobertoEm(n, 3.2, 6.8), false, "a base (embaixo) é larga");
    assert.equal(limparTraco({ x: 1, y: 1, raio: 1, cobrir: true, forma: "estrela" }), null);
    assert.equal(limparTraco({ x: 1, y: 1, raio: 1, cobrir: true })?.forma, "circulo");
});

test("o pincel pode ter largura e altura diferentes", () => {
    const m = novaMascara(10, 10, true);
    pintarTraco(m, { x: 5, y: 5, raio: 1, raioY: 3, cobrir: false, forma: "quadrado" });
    assert.equal(cobertoEm(m, 5, 7.8), false, "alto");
    assert.equal(cobertoEm(m, 6.5, 5), true, "estreito");
    const e = novaMascara(10, 10, true);
    pintarTraco(e, { x: 5, y: 5, raio: 3, raioY: 1, cobrir: false, forma: "circulo" });
    assert.equal(cobertoEm(e, 7.5, 5), false, "a elipse larga");
    assert.equal(cobertoEm(e, 5, 6.8), true, "...e baixa");
    assert.equal(limparTraco({ x: 1, y: 1, raio: 2, cobrir: true, forma: "retangulo" }), null, "o retângulo exige a altura");
    assert.equal(limparTraco({ x: 1, y: 1, raio: 50, raioY: 40, cobrir: true, forma: "retangulo" })?.raio, 50);
});
