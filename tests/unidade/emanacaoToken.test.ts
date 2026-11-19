// Testes RÁPIDOS da EMANAÇÃO (aura) de um TOKEN: a validação (alcance, cor, transparência), o pedido da rede, a edição, a cópia para as peças e para a duplicata, e a leitura do arquivo.
// Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { areaDaEmanacao, casasDaArea, limparEmanacao } from "../../src/areas.ts";
import { ALFA_MAX_EMANACAO, ALFA_MIN_EMANACAO, EMANACAO_INICIAL_TOKEN, MAX_EMANACAO_TOKEN } from "../../src/config.ts";
import { editarToken, estado, montarDuplicata, montarPeca, receberToken, tokenValido, type Token } from "../../src/estado.ts";
import { lerPedido } from "../../src/protocolo.ts";

const modelo = (id: number, extra: Partial<Token> = {}): Token => ({
    id, nome: "Paladino", imagem: null, col: 0, row: 0, cor: 0x2a4a7a, corBorda: 0xffffff, size: 1, condicoes: [], guardado: true, favorito: false, grupos: [], ficha: null,
    status: [], valores: [], copiaDe: null, mapa: null, ...extra,
});
const AURA = { casas: 2, cor: 0xffd54f, alfa: 0.3 };

test("validação: só aceita alcance inteiro de 1 a 20, cor 0xRRGGBB e transparência numérica (fora da faixa é puxada para dentro)", () => {
    assert.deepEqual(limparEmanacao({ ...AURA, intruso: 1 }), AURA); // só os campos conhecidos
    assert.equal(limparEmanacao({ ...AURA, alfa: 0.333 })?.alfa, 0.33); // 2 casas decimais
    assert.equal(limparEmanacao({ ...AURA, alfa: 5 })?.alfa, ALFA_MAX_EMANACAO);
    assert.equal(limparEmanacao({ ...AURA, alfa: 0 })?.alfa, ALFA_MIN_EMANACAO);
    assert.equal(limparEmanacao({ ...AURA, casas: MAX_EMANACAO_TOKEN })?.casas, MAX_EMANACAO_TOKEN);
    for (const ruim of [null, undefined, 5, "x", [], {}, { ...AURA, casas: 0 }, { ...AURA, casas: 2.5 }, { ...AURA, casas: MAX_EMANACAO_TOKEN + 1 }, { ...AURA, casas: "2" }, { ...AURA, cor: -1 }, { ...AURA, cor: 0x1000000 }, { ...AURA, cor: 1.5 }, { ...AURA, alfa: "0.3" }, { ...AURA, alfa: NaN }]) {
        assert.equal(limparEmanacao(ruim), null, JSON.stringify(ruim));
    }
    assert.ok(EMANACAO_INICIAL_TOKEN.casas >= 1 && limparEmanacao(EMANACAO_INICIAL_TOKEN), "o valor de abertura é válido");
});

test("pedido 'editar_token': aceita a emanação (ou null para desligar) e recusa uma inválida inteira", () => {
    assert.deepEqual(lerPedido({ tipo: "editar_token", id: 3, mudancas: { emanacao: { ...AURA, intruso: 1 } } }), { tipo: "editar_token", id: 3, mudancas: { emanacao: AURA } });
    assert.deepEqual(lerPedido({ tipo: "editar_token", id: 3, mudancas: { emanacao: null } }), { tipo: "editar_token", id: 3, mudancas: { emanacao: null } });
    for (const ruim of [{ ...AURA, casas: 999 }, { ...AURA, cor: "azul" }, "aura", 5, []]) assert.equal(lerPedido({ tipo: "editar_token", id: 3, mudancas: { emanacao: ruim } }), null, JSON.stringify(ruim));
});

test("editarToken: liga, muda e desliga a emanação; um valor inválido (que passasse pela rede) é ignorado", () => {
    estado.tokens.length = 0;
    receberToken(modelo(60));
    assert.equal(editarToken(60, { emanacao: AURA })?.emanacao?.casas, 2);
    assert.equal(editarToken(60, { emanacao: { ...AURA, casas: 5, alfa: 0.5 } })?.emanacao?.alfa, 0.5);
    assert.equal(editarToken(60, { emanacao: { ...AURA, casas: 999 } })?.emanacao?.casas, 5, "inválida: fica como estava");
    assert.equal(editarToken(60, { nome: "Outro" })?.emanacao?.casas, 5, "sem mexer na emanação, ela continua");
    assert.equal(editarToken(60, { emanacao: null })?.emanacao, null);
});

test("as PEÇAS copiam a emanação do modelo (ao nascer e quando o modelo é editado) e a DUPLICATA também leva", () => {
    estado.tokens.length = 0;
    estado.colunas = 20;
    estado.linhas = 20;
    receberToken(modelo(70, { emanacao: AURA }));
    const peca = montarPeca(70, 3, 3);
    assert.ok(peca);
    assert.deepEqual(peca.emanacao, AURA);
    assert.notEqual(peca.emanacao, estado.tokens.find((t) => t.id === 70)?.emanacao, "é uma cópia, não o mesmo objeto");
    receberToken(peca);
    editarToken(70, { emanacao: { ...AURA, casas: 4 } });
    assert.equal(estado.tokens.find((t) => t.id === peca.id)?.emanacao?.casas, 4, "editar o modelo atualiza a peça");
    editarToken(70, { emanacao: null });
    assert.equal(estado.tokens.find((t) => t.id === peca.id)?.emanacao, null, "desligar no modelo desliga na peça");
    const copia = montarDuplicata(modelo(71, { emanacao: AURA }));
    assert.deepEqual(copia?.emanacao, AURA);
});

test("arquivo: um token SEM o campo (arquivo antigo) não emana; com ele, volta igual; estragado vira 'não emana' (o token não se perde)", () => {
    const base = { ...modelo(80), pasta: null };
    assert.equal(tokenValido(base)?.emanacao, null);
    assert.deepEqual(tokenValido({ ...base, emanacao: AURA })?.emanacao, AURA);
    assert.equal(tokenValido({ ...base, emanacao: { ...AURA, casas: -3 } })?.emanacao, null);
    assert.equal(tokenValido({ ...base, emanacao: "lixo" })?.nome, "Paladino");
});

test("as casas da aura: a emanação do corpo (Médio de 3 m = 5×5 sem os cantos; um token 2×2 usa o corpo todo)", () => {
    assert.equal(casasDaArea(areaDaEmanacao({ col: 10, row: 10, size: 1 }, { casas: 2, cor: 0, alfa: 0.3 })).length, 21);
    assert.equal(casasDaArea(areaDaEmanacao({ col: 10, row: 10, size: 2 }, { casas: 2, cor: 0, alfa: 0.3 })).length, 32);
});
