// Testes RÁPIDOS de duas regras de 19/11/2026: (1) as CONDIÇÕES no RODAPÉ do tile do token, da esquerda para a direita; (2) as BARRAS de status EM CIMA por padrão. Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { capacidadeDoRodape, diametroDoIcone, posicoesNoRodape } from "../../src/coordenadas.ts";
import { ESPACO_ICONES, MARGEM_ICONES_RODAPE, TAMANHO_CASA } from "../../src/config.ts";
import { limparStatus, statusPadrao, estado } from "../../src/estado.ts";
import { lerPedido } from "../../src/protocolo.ts";

test("rodapé: o 1º ícone fica no canto de baixo à ESQUERDA e os outros vão para a DIREITA, todos na mesma altura", () => {
    for (const tamanho of [1, 2, 3, 4]) {
        const pontos = posicoesNoRodape(5, tamanho);
        const metade = (TAMANHO_CASA * tamanho) / 2;
        const d = diametroDoIcone(tamanho);
        assert.equal(pontos.length, 5);
        assert.ok(Math.abs(pontos[0].x - (-metade + MARGEM_ICONES_RODAPE + d / 2)) < 1e-9, `1º ícone encosta na esquerda (${tamanho}x${tamanho})`);
        assert.ok(Math.abs(pontos[0].y - (metade - MARGEM_ICONES_RODAPE - d / 2)) < 1e-9, "fica rente ao rodapé do tile");
        for (let i = 1; i < pontos.length; i++) {
            assert.ok(Math.abs(pontos[i].x - pontos[i - 1].x - (d + ESPACO_ICONES)) < 1e-9, "um passo (ícone + folga) à direita do anterior");
            assert.equal(pontos[i].y, pontos[0].y, "mesma altura");
        }
    }
});

test("rodapé: a capacidade cresce com o tamanho do token e o último ícone que cabe não passa da borda direita do tile", () => {
    let anterior = 0;
    for (const tamanho of [1, 2, 3, 4]) {
        const capacidade = capacidadeDoRodape(tamanho);
        assert.ok(capacidade >= anterior && capacidade >= 1, `${tamanho}x${tamanho}: ${capacidade}`);
        anterior = capacidade;
        const pontos = posicoesNoRodape(capacidade, tamanho);
        const direita = (TAMANHO_CASA * tamanho) / 2;
        assert.ok(pontos[pontos.length - 1].x + diametroDoIcone(tamanho) / 2 <= direita - MARGEM_ICONES_RODAPE + 1e-9, `${tamanho}x${tamanho}: cabe dentro do tile`);
    }
    assert.ok(capacidadeDoRodape(1) >= 3, "num 1x1 cabem pelo menos 3");
    assert.deepEqual(posicoesNoRodape(0, 1), []);
});

test("status: sem o campo 'posicao', a barra fica EM CIMA (o padrão); 'baixo' explícito é respeitado; lixo vira 'cima'", () => {
    const base = { nome: "HP", variavel: "PV", cor: 0x00ff00 };
    const lista = limparStatus([base, { ...base, posicao: "baixo" }, { ...base, posicao: "cima" }, { ...base, posicao: "esquerda" }, { ...base, posicao: 7 }]);
    assert.ok(lista);
    assert.deepEqual(lista.map((s) => s.posicao), ["cima", "baixo", "cima", "cima", "cima"]);
});

test("status de fábrica (o HP da mesa nova): em cima", () => {
    assert.equal(statusPadrao()[0].posicao, "cima");
    assert.equal(estado.statusDaMesa[0].posicao, "cima");
});

test("status na rede: os DOIS valores de 'posicao' chegam ao servidor (antes só 'cima' ia, porque embaixo era o padrão)", () => {
    const pedido = (posicao?: string) => lerPedido({ tipo: "definir_status", status: [{ nome: "HP", variavel: "PV", cor: 255, ...(posicao !== undefined && { posicao }) }] });
    const posicoes = (p: ReturnType<typeof lerPedido>) => (p?.tipo === "definir_status" ? p.status.map((s) => s.posicao) : null);
    assert.deepEqual(posicoes(pedido("baixo")), ["baixo"]);
    assert.deepEqual(posicoes(pedido("cima")), ["cima"]);
    assert.deepEqual(posicoes(pedido()), [undefined]);
    assert.deepEqual(posicoes(pedido("lixo")), [undefined]);
});
