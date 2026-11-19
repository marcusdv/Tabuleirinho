// Testes RÁPIDOS das ÁREAS DE EFEITO: a geometria (casas cobertas por cada forma), a validação do que vem da rede e a borracha. Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { caixaDoCubo, casasDaArea, conjuntoDeCasas, chaveDaCasa, direcaoAte, lacosDoContorno, encaixarOrigem, limparDadosDaArea, metrosParaCasas, precisaDeDirecao, type DadosDaArea } from "../../src/areas.ts";
import { AREAS_RAPIDAS, DADOS_DAS_FORMAS_DE_AREA, FORMAS_DE_AREA, MAX_TAMANHO_AREA } from "../../src/config.ts";
import { desenhoAtingido, textoDaArea } from "../../src/desenhos.ts";
import { limparDesenho } from "../../src/estado.ts";
import { lerPedido } from "../../src/protocolo.ts";

const area = (parcial: Partial<DadosDaArea>): DadosDaArea => ({ forma: "circulo", x: 30, y: 30, angulo: 0, casas: 1, bloco: 1, ...parcial });
const chaves = (a: DadosDaArea): string[] => casasDaArea(a).map((c) => `${c.col},${c.row}`);

/** Quantas casas há em cada linha (de cima para baixo) de uma área: o "desenho" dela em números. */
const larguras = (a: DadosDaArea): number[] => {
    const por = new Map<number, number>();
    for (const c of casasDaArea(a)) por.set(c.row, (por.get(c.row) ?? 0) + 1);
    return [...por.entries()].sort((x, y) => x[0] - y[0]).map(([, n]) => n);
};

test("esfera (burst): um OCTÓGONO como nos gabaritos dos livros (5 pés = 2×2, 10 pés = 4×4 sem os cantos...)", () => {
    assert.equal(casasDaArea(area({ x: 30, y: 30, casas: 1 })).length, 4); // 5 pés, com o centro num cruzamento: 2×2
    assert.deepEqual(larguras(area({ x: 30, y: 30, casas: 2 })), [2, 4, 4, 2]); // 10 pés: o "+" gordo (12 casas)
    assert.deepEqual(larguras(area({ x: 30, y: 30, casas: 3 })), [2, 4, 6, 6, 4, 2]); // 15 pés (24 casas)
    assert.deepEqual(larguras(area({ x: 30, y: 30, casas: 4 })), [2, 6, 6, 8, 8, 6, 6, 2]); // 20 pés (44 casas): a bola de fogo
    assert.equal(casasDaArea(area({ x: 30.5, y: 30.5, casas: 1 })).length, 5); // com o centro no meio de uma casa: ela e as 4 vizinhas
    assert.deepEqual(larguras(area({ x: 30.5, y: 30.5, casas: 2 })), [1, 3, 5, 3, 1]); // (um losango)
    // simétrica: o mesmo número de casas em cada quadrante
    const casas = casasDaArea(area({ x: 30, y: 30, casas: 4 }));
    for (const quadrante of [(c: { col: number; row: number }) => c.col < 30 && c.row < 30, (c: { col: number; row: number }) => c.col >= 30 && c.row < 30, (c: { col: number; row: number }) => c.col < 30 && c.row >= 30]) {
        assert.equal(casas.filter(quadrante).length, 11);
    }
});

test("cone: um leque de 90° cortado pela distância (na ortogonal vira um LOSANGO, na diagonal um triângulo abaulado); a ponta não entra", () => {
    // ortogonal, com a ponta no meio da borda de uma casa, apontando para cima (30 pés = 6 casas): estreito, alarga, estreita de novo
    const orto = area({ forma: "cone", x: 30.5, y: 30, casas: 6, angulo: -Math.PI / 2 });
    assert.deepEqual(larguras(orto), [3, 7, 7, 5, 3, 1]);
    assert.equal(casasDaArea(orto).length, 26);
    // a mesma forma apontando para os outros lados (só gira)
    for (const [angulo, x, y] of [[0, 30, 30.5], [Math.PI / 2, 30.5, 30], [Math.PI, 30, 30.5]]) { // (a ponta fica no meio da borda de onde o cone sai)
        const gira = area({ forma: "cone", x, y, casas: 6, angulo });
        assert.equal(casasDaArea(gira).length, 26, `ângulo ${angulo}`);
    }
    // diagonal, com a ponta num canto (15 pés = 3 casas): a escadinha 3-2-1
    const diagonal = area({ forma: "cone", x: 30, y: 30, casas: 3, angulo: Math.PI / 4 });
    assert.deepEqual(larguras(diagonal), [3, 2, 1]);
    assert.equal(casasDaArea(area({ forma: "cone", x: 30, y: 30, casas: 6, angulo: Math.PI / 4 })).length, 24); // 30 pés na diagonal: um triângulo de catetos 6
    // a ponta nunca entra, e nada fica atrás dela
    assert.ok(!chaves(orto).includes("30,30"));
    assert.ok(casasDaArea(orto).every((c) => c.row <= 29));
    // o cone de 60 pés ortogonal: 100 casas, a ponta estreita e a parte larga com 15 casas
    const grande = area({ forma: "cone", x: 30.5, y: 30, casas: 12, angulo: -Math.PI / 2 });
    assert.equal(casasDaArea(grande).length, 100);
    assert.equal(Math.max(...larguras(grande)), 15);
});

test("linha: 1 casa de largura; na diagonal alcança menos casas (a diagonal conta 1,5); a casa de quem lança fica de fora", () => {
    const linha = area({ forma: "linha", x: 30.5, y: 30.5, casas: 6, angulo: 0 }); // sai do centro da casa (30, 30) para a direita
    assert.deepEqual(chaves(linha), ["31,30", "32,30", "33,30", "34,30", "35,30", "36,30"]);
    assert.equal(casasDaArea({ ...linha, angulo: Math.PI / 2 }).length, 6); // para baixo
    const diagonal = casasDaArea({ ...linha, angulo: Math.PI / 4 }); // 30 pés na diagonal: 4 casas
    assert.equal(diagonal.length, 4);
    assert.ok(diagonal.every((c) => c.col - 30 === c.row - 30)); // uma escadinha de casas que se tocam só pelo canto
    assert.equal(casasDaArea({ ...linha, casas: 12, angulo: Math.PI / 4 }).length, 8); // 60 pés na diagonal: 8 casas
    assert.ok(casasDaArea({ ...linha, angulo: 0.3 }).length >= 5); // num ângulo qualquer: uma linha de casas
});

test("cubo: lado N alinhado à grade, sempre FORA da casa da origem; nas direções retas fica centrado na face, nas diagonais a origem é um canto", () => {
    const cubo = area({ forma: "cubo", x: 30.5, y: 30.5, casas: 3, angulo: 0 }); // a origem no centro da casa (30, 30)
    assert.equal(casasDaArea(cubo).length, 9);
    assert.deepEqual(caixaDoCubo(cubo), { x0: 31, y0: 29, x1: 34, y1: 32 }); // →: começa na borda da casa, centrado na altura dela
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: Math.PI }), { x0: 27, y0: 29, x1: 30, y1: 32 }); // ←: termina na borda da casa (do outro lado)
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: Math.PI / 2 }), { x0: 29, y0: 31, x1: 32, y1: 34 }); // ↓
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: -Math.PI / 2 }), { x0: 29, y0: 27, x1: 32, y1: 30 }); // ↑
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: Math.PI / 4 }), { x0: 31, y0: 31, x1: 34, y1: 34 }); // ↘: um canto na origem
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: -Math.PI / 4 }), { x0: 31, y0: 27, x1: 34, y1: 30 }); // ↗
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: (3 * Math.PI) / 4 }), { x0: 27, y0: 31, x1: 30, y1: 34 }); // ↙
    assert.deepEqual(caixaDoCubo({ ...cubo, angulo: (-3 * Math.PI) / 4 }), { x0: 27, y0: 27, x1: 30, y1: 30 }); // ↖
    // com a origem num cruzamento da grade (número inteiro), o cubo encosta nela dos dois lados
    assert.deepEqual(caixaDoCubo({ ...cubo, x: 30, y: 30, casas: 2, angulo: 0 }), { x0: 30, y0: 29, x1: 32, y1: 31 });
    assert.deepEqual(caixaDoCubo({ ...cubo, x: 30, y: 30, casas: 2, angulo: Math.PI }), { x0: 28, y0: 29, x1: 30, y1: 31 });
    // a casa da origem nunca entra, em nenhuma das 8 direções
    for (let k = 0; k < 8; k++) assert.ok(!chaves({ ...cubo, angulo: (k * Math.PI) / 4 }).includes("30,30"), `direção ${k}`);
    for (const casas of [1, 2, 3, 5]) assert.equal(casasDaArea({ ...cubo, casas }).length, casas * casas);
});

test("emanação: sai do CORPO da criatura em todas as direções, e o corpo também é pintado (Média de 5 pés = 3×3)", () => {
    assert.deepEqual(larguras(area({ forma: "emanacao", x: 30, y: 30, casas: 1, bloco: 1 })), [3, 3, 3]); // Média, 5 pés
    assert.deepEqual(larguras(area({ forma: "emanacao", x: 30, y: 30, casas: 2, bloco: 1 })), [3, 5, 5, 5, 3]); // Média, 10 pés: 5×5 sem os cantos (21 casas)
    assert.deepEqual(larguras(area({ forma: "emanacao", x: 30, y: 30, casas: 1, bloco: 2 })), [4, 4, 4, 4]); // Grande (2×2), 5 pés
    assert.deepEqual(larguras(area({ forma: "emanacao", x: 30, y: 30, casas: 2, bloco: 2 })), [4, 6, 6, 6, 6, 4]); // Grande, 10 pés: 6×6 sem os cantos (32 casas)
    assert.ok(chaves(area({ forma: "emanacao", x: 30, y: 30, casas: 2, bloco: 1 })).includes("30,30"));
});

test("as casas nunca têm coordenada negativa (o mapa começa em 0)", () => {
    assert.ok(casasDaArea(area({ x: 0, y: 0, casas: 4 })).every((c) => c.col >= 0 && c.row >= 0));
    assert.ok(casasDaArea(area({ forma: "cone", x: 0, y: 0, casas: 6, angulo: Math.PI })).every((c) => c.col >= 0 && c.row >= 0));
});

test("encaixe da origem: cada forma se prende ao que faz sentido na grade", () => {
    assert.deepEqual(encaixarOrigem("cone", { x: 3.4, y: 7.6 }), { x: 3.5, y: 7.5 }); // de meia em meia casa: num canto o cone sai da quina (diagonal), no meio da borda sai de frente
    assert.deepEqual(encaixarOrigem("linha", { x: 3.9, y: 7.1 }), { x: 3.5, y: 7.5 }); // no centro da casa
    assert.deepEqual(encaixarOrigem("circulo", { x: 3.2, y: 7.8 }), { x: 3, y: 8 }); // de meia em meia casa
    assert.deepEqual(encaixarOrigem("circulo", { x: 3.45, y: 7.3 }), { x: 3.5, y: 7.5 });
    assert.deepEqual(encaixarOrigem("emanacao", { x: 3.9, y: 7.1 }), { x: 3, y: 7 }); // a casa sob o mouse
    assert.equal(direcaoAte({ x: 0, y: 0 }, { x: 5, y: 0 }), 0);
    assert.equal(direcaoAte({ x: 0, y: 0 }, { x: 0.05, y: 0.05 }, 1.25), 1.25); // em cima da origem: mantém a direção
    assert.deepEqual(FORMAS_DE_AREA.filter(precisaDeDirecao), ["cone", "linha", "cubo"]);
});

test("metros e casas: 1 casa = 1,5 m, arredondando, de 1 casa até o máximo", () => {
    assert.equal(metrosParaCasas(1.5), 1);
    assert.equal(metrosParaCasas(4.5), 3);
    assert.equal(metrosParaCasas(18), 12);
    assert.equal(metrosParaCasas(0), 1);
    assert.equal(metrosParaCasas(10000), MAX_TAMANHO_AREA);
    assert.equal(metrosParaCasas(NaN), 1);
    assert.equal(textoDaArea(area({ casas: 4 })), "6 m\n4 quadrados"); // o mesmo texto da régua
    assert.equal(textoDaArea(area({ casas: 3 })), "4,5 m\n3 quadrados");
});

test("as tabelas: cada forma tem nome, dica, medida e tamanhos prontos; as áreas rápidas apontam para formas que existem", () => {
    for (const forma of FORMAS_DE_AREA) {
        const d = DADOS_DAS_FORMAS_DE_AREA[forma];
        assert.ok(d.nome && d.medida && d.dica && d.prontos.length > 0, forma);
        assert.ok(d.padrao >= 1 && d.padrao <= MAX_TAMANHO_AREA, forma);
        for (const metros of d.prontos) assert.ok(metrosParaCasas(metros) * 1.5 === metros, `${forma} ${metros} m é um múltiplo de 1,5 m`);
    }
    for (const r of AREAS_RAPIDAS) assert.ok(FORMAS_DE_AREA.includes(r.forma) && r.nome && metrosParaCasas(r.metros) * 1.5 === r.metros, r.nome);
});

test("validação: só aceita áreas bem formadas (nunca confiar no que vem da rede)", () => {
    const boa = { forma: "cone", x: 10.5, y: 4, angulo: 1.2345678, casas: 6, bloco: 1 };
    assert.deepEqual(limparDadosDaArea({ ...boa, extra: "x" }), { forma: "cone", x: 10.5, y: 4, angulo: 1.235, casas: 6, bloco: 1 }); // só os campos conhecidos, ângulo com 3 casas
    for (const ruim of [
        null, 5, "x", [], {},
        { ...boa, forma: "piramide" }, { ...boa, forma: undefined },
        { ...boa, x: NaN }, { ...boa, y: Infinity }, { ...boa, x: 9999 }, { ...boa, angulo: 1e9 },
        { ...boa, casas: 0 }, { ...boa, casas: 2.5 }, { ...boa, casas: MAX_TAMANHO_AREA + 1 }, { ...boa, casas: "3" },
        { ...boa, bloco: 0 }, { ...boa, bloco: 5 },
    ]) assert.equal(limparDadosDaArea(ruim), null, JSON.stringify(ruim));
});

test("um desenho do tipo área passa pela validação dos desenhos (cor, opacidade e os campos da área)", () => {
    const novo = limparDesenho({ tipo: "area", cor: 0xff0000, forma: "circulo", x: 5, y: 6, angulo: 0, casas: 4, bloco: 1, alfa: 0.5, intruso: 1 });
    assert.deepEqual(novo, { tipo: "area", cor: 0xff0000, forma: "circulo", x: 5, y: 6, angulo: 0, casas: 4, bloco: 1, alfa: 0.5 });
    assert.equal(limparDesenho({ tipo: "area", cor: 0xff0000, forma: "circulo", x: 5, y: 6, angulo: 0, casas: 999, bloco: 1 }), null);
    assert.equal(limparDesenho({ tipo: "area", cor: "vermelho", forma: "circulo", x: 5, y: 6, angulo: 0, casas: 4, bloco: 1 }), null);
});

test("pedido 'area_previa': aceita uma área, aceita 'sumiu' (null) e recusa o resto", () => {
    const cor = 0x42a5f5;
    const pedido = lerPedido({ tipo: "area_previa", area: { forma: "linha", x: 3.5, y: 4.5, angulo: 0.5, casas: 6, bloco: 1 }, cor });
    assert.equal(pedido?.tipo, "area_previa");
    assert.deepEqual(lerPedido({ tipo: "area_previa", area: null, cor }), { tipo: "area_previa", area: null, cor });
    for (const ruim of [
        { tipo: "area_previa", area: { forma: "x", x: 1, y: 1, angulo: 0, casas: 1, bloco: 1 }, cor },
        { tipo: "area_previa", area: { forma: "cone", x: 1, y: 1, angulo: 0, casas: 1000, bloco: 1 }, cor },
        { tipo: "area_previa", area: 5, cor },
        { tipo: "area_previa", cor },
        { tipo: "area_previa", area: null, cor: -1 },
    ]) assert.equal(lerPedido(ruim), null, JSON.stringify(ruim));
    // e o pedido de DESENHAR aceita uma área
    assert.equal(lerPedido({ tipo: "desenhar", desenho: { tipo: "area", cor, forma: "cubo", x: 3, y: 3, angulo: 0, casas: 3, bloco: 1 } })?.tipo, "desenhar");
});

test("borracha: apaga a área ao tocar DENTRO das casas pintadas (ela é preenchida), e não fora", () => {
    const desenho = { id: 1, tipo: "area" as const, cor: 0xff0000, ...area({ x: 30.5, y: 30.5, casas: 2 }) };
    assert.equal(desenhoAtingido(desenho, { x: 30.5, y: 30.5 }, 0.1), true); // no centro
    assert.equal(desenhoAtingido(desenho, { x: 32.4, y: 30.5 }, 0.1), true); // dentro de uma das casas da ponta (a casa 32)
    assert.equal(desenhoAtingido(desenho, { x: 34, y: 30.5 }, 0.1), false); // longe
    assert.equal(desenhoAtingido(desenho, { x: 28.4, y: 28.4 }, 0.05), false); // a casa (28, 28) é uma diagonal dupla do centro: fora do octógono de raio 2
});

test("contorno: a borda da área vira laços contínuos (só os cantos), sem lados soltos", () => {
    const laco = (casas: { col: number; row: number }[]) => { const c = conjuntoDeCasas(casas); return lacosDoContorno(casas, (col, row) => c.has(chaveDaCasa(col, row))); };
    // uma casa: um quadrado de 4 cantos
    assert.deepEqual(laco([{ col: 3, row: 4 }]).map((l) => l.length), [4]);
    // um retângulo 3×2: ainda 4 cantos (os lados retos viram um segmento só)
    const retangulo = [0, 1, 2].flatMap((col) => [0, 1].map((row) => ({ col, row })));
    assert.deepEqual(laco(retangulo).map((l) => l.length), [4]);
    // um "L" (3 casas): 6 cantos
    assert.deepEqual(laco([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]).map((l) => l.length), [6]);
    // um anel de 3×3 com o meio vazio: dois laços (o de fora e o buraco)
    const anel = [0, 1, 2].flatMap((col) => [0, 1, 2].map((row) => ({ col, row }))).filter((c) => !(c.col === 1 && c.row === 1));
    assert.deepEqual(laco(anel).map((l) => l.length).sort(), [4, 4]);
    // toda aresta de borda está em algum laço: o perímetro de uma esfera de raio 4 fecha (soma dos comprimentos = perímetro)
    const esfera = casasDaArea({ forma: "circulo", x: 30, y: 30, angulo: 0, casas: 4, bloco: 1 });
    const lacos = laco(esfera);
    assert.equal(lacos.length, 1);
    const perimetro = lacos[0].reduce((soma, v, i) => { const n = lacos[0][(i + 1) % lacos[0].length]; return soma + Math.abs(n[0] - v[0]) + Math.abs(n[1] - v[1]); }, 0);
    assert.equal(perimetro, 4 * 8 + 0); // o octógono de raio 4 tem o mesmo perímetro de um quadrado 8×8 (os degraus não aumentam o contorno em linha reta)
});
