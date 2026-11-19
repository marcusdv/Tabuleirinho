// Testes RÁPIDOS da DUPLICAÇÃO de tokens (`montarDuplicata`, em estado.ts: a regra que o servidor e o modo local compartilham). Rodar: npm run test:unidade
// A regra do dono (19/11/2026): a cópia é IGUAL (nome, imagem, cores, tamanho) e leva a ficha, os grupos e a pasta; o FAVORITO não passa; uma ficha ÚNICA fica VAZIA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { estado, montarDuplicata, receberToken, type Ficha, type Token } from "../../src/estado.ts";

const ficha = (id: number, nome: string, texto: string): Ficha => ({ id, nome, abas: [{ nome: "Página 1", texto }], versao: 1, criadaEm: 0, alteradaEm: 0, favorito: false, grupos: [] });
const modelo = (id: number, extra: Partial<Token> = {}): Token => ({
    id, nome: "Goblin", imagem: null, col: 0, row: 0, cor: 0xe74c3c, corBorda: 0x112233, size: 2, condicoes: [], guardado: true, favorito: true, grupos: [7, 9], ficha: null,
    status: [], valores: [], copiaDe: null, mapa: null, ...extra,
});

function preparar(): void {
    estado.tokens.length = 0;
    estado.fichas.length = 0;
    estado.fichas.push(ficha(301, "Ficha do Heroi", "PV::0:10:10"), ficha(302, "Ficha do Goblin", "FOR:: 10"));
}

test("a cópia é igual: nome, imagem, cores, tamanho, grupos e pasta; o favorito NÃO passa; é um token novo, na bolsa", () => {
    preparar();
    const original = modelo(50, { imagem: "data:image/webp;base64,AAAA", pasta: 4 });
    receberToken(original);
    const copia = montarDuplicata(original);
    assert.ok(copia);
    assert.notEqual(copia.id, original.id);
    assert.equal(copia.nome, "Goblin");
    assert.equal(copia.cor, 0xe74c3c);
    assert.equal(copia.corBorda, 0x112233);
    assert.equal(copia.size, 2);
    assert.equal(copia.imagem, "data:image/webp;base64,AAAA");
    assert.deepEqual(copia.grupos, [7, 9]);
    assert.notEqual(copia.grupos, original.grupos, "a lista de grupos é uma cópia, não a mesma lista");
    assert.equal(copia.pasta, 4);
    assert.equal(copia.favorito, false, "o favorito não passa");
    assert.equal(copia.guardado, true);
    assert.equal(copia.copiaDe, null);
});

test("ficha NORMAL (de monstro): a cópia fica com a MESMA ficha", () => {
    preparar();
    const original = modelo(51, { ficha: 302 });
    receberToken(original);
    assert.equal(montarDuplicata(original)?.ficha, 302);
});

test("ficha ÚNICA (de jogador) que já tem este token: a cópia fica SEM ficha (vazia)", () => {
    preparar();
    const original = modelo(52, { ficha: 301 });
    receberToken(original);
    assert.equal(montarDuplicata(original)?.ficha, null);
});

test("o servidor pode limitar o que um jogador herda (ficha, grupos e pasta)", () => {
    preparar();
    const original = modelo(53, { ficha: 302, pasta: 4 });
    receberToken(original);
    const copia = montarDuplicata(original, { ficha: null, grupos: [], pasta: null });
    assert.ok(copia);
    assert.equal(copia.ficha, null);
    assert.deepEqual(copia.grupos, []);
    assert.equal(copia.pasta, undefined, "sem pasta (raiz)");
});

test("duplicar não muda o token original", () => {
    preparar();
    const original = modelo(54, { ficha: 302 });
    receberToken(original);
    const copia = montarDuplicata(original);
    assert.ok(copia);
    copia.grupos.push(1);
    copia.nome = "Outro";
    assert.deepEqual(original.grupos, [7, 9]);
    assert.equal(original.nome, "Goblin");
    assert.equal(original.favorito, true);
});
