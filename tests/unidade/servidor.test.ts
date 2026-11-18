// Testes RÁPIDOS de partes do servidor que não precisam de rede: as migrações de formato dos arquivos e o LEIA-ME do backup. Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATO_ATUAL, comFormato, migrarArquivo } from "../../servidor/migracoes.ts";
import { instrucoesDoBackup } from "../../servidor/backup.ts";

test("o arquivo vai para o disco com o formato atual e volta sem ele", () => {
    const gravado = comFormato({ id: 3, nome: "Goblin" });
    assert.equal(gravado.formato, FORMATO_ATUAL);
    assert.deepEqual(migrarArquivo("fichas", gravado), { id: 3, nome: "Goblin" });
});

test("arquivo ANTIGO (sem formato) é aceito como formato 0", () => {
    assert.deepEqual(migrarArquivo("tokens", { id: 1 }), { id: 1 });
});

test("arquivo de uma versão MAIS NOVA do jogo é recusado (em vez de lido errado)", () => {
    assert.throws(() => migrarArquivo("mesa", { formato: FORMATO_ATUAL + 1, colunas: 10 }), /versão mais nova/);
});

test("o LEIA-ME do backup tem o passo a passo de como aplicar", () => {
    const texto = instrucoesDoBackup("2026-11-17", "Conteúdo: 1 ficha(s).");
    for (const trecho of ["DESLIGUE o servidor", "Extraia TODO o conteúdo", "npm run servidor", "DADOS=/caminho/da/pasta"]) assert.ok(texto.includes(trecho), trecho);
});
