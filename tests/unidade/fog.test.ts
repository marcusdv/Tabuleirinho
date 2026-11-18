// Testes RÁPIDOS do núcleo do fog (máscara, pincel, texto). Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCALA_DO_PINCEL } from "../../src/config.ts";
import { casasDaForma, cobertoEm, contornoDasCasas, RAIO_MAX_FOG, limparTraco, mascaraDoTexto, mascaraParaTexto, novaMascara, pintarTraco, preencherMascara } from "../../src/fog.ts";

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

const total = (f: { largura: number }[]): number => f.reduce((soma, x) => soma + x.largura, 0);

test("por casa: o círculo é feito de casas inteiras (4 × 4 perde os 4 cantos, como no D&D)", () => {
    assert.equal(total(casasDaForma("circulo", 5, 5, 2)), 12);
    const m = novaMascara(10, 10, true);
    pintarTraco(m, { x: 5, y: 5, raio: 2, cobrir: false, forma: "circulo", casas: true });
    assert.equal(cobertoEm(m, 3.5, 3.5), true, "o canto continua coberto");
    // a casa (4, 3) é revelada INTEIRA: os quatro cantinhos dela
    for (const [x, y] of [[4.01, 3.01], [4.99, 3.01], [4.01, 3.99], [4.99, 3.99]]) assert.equal(cobertoEm(m, x, y), false);
    assert.equal(cobertoEm(m, 3.01, 4.5), false, "a casa do meio da borda entra inteira");
    assert.equal(cobertoEm(m, 2.99, 4.5), true, "a casa vizinha, de fora da caixa, não é tocada");
});

test("por casa: o contorno tem só as linhas de FORA (sem as que separam as casas)", () => {
    const comprimento = (s: { x1: number; y1: number; x2: number; y2: number }): number => Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
    // círculo 2 × 2 (4 casas): só o quadrado de fora, 4 segmentos de 2 casas (e nenhuma linha de dentro)
    const pequeno = contornoDasCasas(casasDaForma("circulo", 5, 5, 1));
    assert.equal(pequeno.length, 4);
    assert.deepEqual(pequeno.map(comprimento), [2, 2, 2, 2]);
    // círculo 4 × 4 (12 casas, sem os cantos): o contorno mede o mesmo que o do quadrado 4 × 4, 16 lados de casa
    const medio = contornoDasCasas(casasDaForma("circulo", 5, 5, 2));
    assert.equal(medio.reduce((soma, s) => soma + comprimento(s), 0), 16);
    // uma casa só: 4 lados
    assert.equal(contornoDasCasas([{ col: 0, row: 0, largura: 1 }]).length, 4);
});

test("a escala do pincel: crescente, com os tamanhos prontos, termina no raio máximo e salta mais no fim", () => {
    const e = ESCALA_DO_PINCEL;
    assert.ok(e.every((v, i) => i === 0 || v > e[i - 1]), "em ordem crescente");
    assert.equal(e[e.length - 1], RAIO_MAX_FOG, "o último valor é o raio máximo do pincel");
    for (const pronto of [0.5, 1, 2, 3, 5, 8, 12, 20]) assert.ok(e.includes(pronto), `o tamanho pronto ${pronto} está na escala`);
    assert.ok(e[e.length - 1] - e[e.length - 2] > e[1] - e[0], "o passo do fim é maior que o do começo");
    for (const v of e) assert.ok(limparTraco({ x: 1, y: 1, raio: v, cobrir: true })?.raio === v, `o servidor aceita o raio ${v}`);
});

test("por casa: o triângulo 5 × 3 é uma pirâmide de 1, 3 e 5 casas (ponta em cima)", () => {
    assert.deepEqual(casasDaForma("triangulo", 5.5, 5.5, 2.5, 1.5).map((f) => f.largura), [1, 3, 5]);
});

test("por casa: sobre o servidor, a marca 'casas' vale só para círculo e triângulo", () => {
    assert.equal(limparTraco({ x: 5, y: 5, raio: 2, cobrir: true, forma: "circulo", casas: true })?.casas, true);
    assert.equal(limparTraco({ x: 5, y: 5, raio: 2, cobrir: true, forma: "circulo" })?.casas, undefined);
    assert.equal(limparTraco({ x: 5, y: 5, raio: 2, raioY: 2, cobrir: true, forma: "retangulo", casas: true })?.casas, undefined);
});
