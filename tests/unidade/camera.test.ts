// Testes RÁPIDOS dos limites da câmera (`limitarEixo`): quanto vazio pode sobrar além do mapa. Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { limitarEixo } from "../../src/coordenadas.ts";
import { MARGEM_LIVRE_CAMERA as MARGEM } from "../../src/config.ts";

const TELA = 1400;

test("mapa MAIOR que a tela: o vazio além dele nunca passa da margem, nos dois lados", () => {
    const mapa = 1152;
    assert.equal(limitarEixo(-99999, TELA, mapa), TELA - MARGEM - mapa); // arrastado para a esquerda: a borda de trás fica a MARGEM do fim da tela
    assert.equal(limitarEixo(99999, TELA, mapa), MARGEM); // para a direita: sobra MARGEM de vazio à esquerda
    assert.equal(limitarEixo(-50, TELA, mapa), -50); // no meio do caminho não mexe
});

test("mapa que CABE na tela: pode ficar em qualquer posição em que apareça inteiro (o 'Ajustar à tela' não é puxado pela margem)", () => {
    const mapa = 836; // o caso real: tela de 1400 com painéis, o mapa centrado na área livre fica em x = 200
    assert.equal(limitarEixo(200, TELA, mapa), 200);
    assert.equal(limitarEixo(-99999, TELA, mapa), 0); // para a esquerda: encosta na borda
    assert.equal(limitarEixo(99999, TELA, mapa), TELA - mapa); // para a direita: a borda de trás encosta no fim da tela
});

test("mapa pequeno (zoom longe): anda só dentro da tela, nunca some nem fica preso", () => {
    const mapa = 230;
    assert.equal(limitarEixo(-99999, TELA, mapa), 0);
    assert.equal(limitarEixo(99999, TELA, mapa), TELA - mapa);
    for (const pos of [0, 300, 900]) assert.equal(limitarEixo(pos, TELA, mapa), pos);
});

test("mapa um pouco menor que a tela: o intervalo permitido nunca é invertido", () => {
    for (const mapa of [100, 700, 1000, 1300, 1399, 1400, 1401, 2000, 5000]) {
        const baixo = limitarEixo(-1e9, TELA, mapa);
        const alto = limitarEixo(1e9, TELA, mapa);
        assert.ok(baixo <= alto, `mapa ${mapa}: ${baixo} > ${alto}`);
    }
});
