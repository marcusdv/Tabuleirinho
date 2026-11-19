// Testes RÁPIDOS da validação dos pedidos de PING e de RÉGUA (o servidor nunca confia no que o navegador manda). Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPedido } from "../../src/protocolo.ts";
import { DADOS_DAS_FORMAS_DE_PING, FORMAS_DE_PING, FORMAS_ESPECIAIS_DE_PING, MAX_PONTOS_REGUA, MS_MIN_ENTRE_PINGS, MS_PAGINA_PARADA, MS_RECARGA_PING, RAJADA_PINGS } from "../../src/config.ts";
import { gastar, novoBalde, paginaParada, passouOIntervalo } from "../../src/limite.ts";

const COR = 0xff5a5f;

test("ping: aceita um ponto em casas (com fração), a forma e a cor, e devolve só os campos conhecidos", () => {
    assert.deepEqual(lerPedido({ tipo: "ping", col: 3.5, row: 7.25, forma: "comum", cor: COR, extra: "x" }), { tipo: "ping", col: 3.5, row: 7.25, forma: "comum", cor: COR });
});

test("ping: aceita cada uma das 13 formas e recusa outras", () => {
    assert.deepEqual([...FORMAS_DE_PING], ["comum", "sumiu", "perigo", "avancar", "ajuda", "agrupar", "alvo", "atacar", "recuar", "armadilha", "investigar", "tesouro", "cura"]);
    // Cada tipo especial tem nome, cor, arquivo e dica (a tabela que monta o menu, a roda e o mapa), e a cor cabe em 0xRRGGBB.
    for (const forma of FORMAS_ESPECIAIS_DE_PING) {
        const d = DADOS_DAS_FORMAS_DE_PING[forma];
        assert.ok(d.nome && d.arquivo && d.dica, forma);
        assert.ok(Number.isInteger(d.cor) && d.cor >= 0 && d.cor <= 0xffffff, forma);
    }
    for (const forma of FORMAS_DE_PING) assert.equal(lerPedido({ tipo: "ping", col: 1, row: 1, forma, cor: COR })?.tipo, "ping", forma);
    for (const forma of ["", "Comum", "x", null, 3, undefined]) assert.equal(lerPedido({ tipo: "ping", col: 1, row: 1, forma, cor: COR }), null, String(forma));
});

test("ping: recusa cor que não é inteiro de 0 a 0xFFFFFF", () => {
    for (const cor of [-1, 0x1000000, 1.5, "#ff0000", NaN, null, undefined]) assert.equal(lerPedido({ tipo: "ping", col: 1, row: 1, forma: "comum", cor }), null, String(cor));
    assert.notEqual(lerPedido({ tipo: "ping", col: 1, row: 1, forma: "comum", cor: 0 }), null);
    assert.notEqual(lerPedido({ tipo: "ping", col: 1, row: 1, forma: "comum", cor: 0xffffff }), null);
});

test("ping: recusa o que não é número, não é finito ou está longe demais do tabuleiro", () => {
    for (const ruim of [{ col: "3", row: 1 }, { col: 1 }, { col: NaN, row: 1 }, { col: Infinity, row: 1 }, { col: 1e9, row: 1 }, { col: 1, row: -1e9 }, { col: null, row: null }]) {
        assert.equal(lerPedido({ tipo: "ping", forma: "comum", cor: COR, ...ruim }), null, JSON.stringify(ruim));
    }
});

test("régua: aceita um caminho de casas inteiras (com a cor) e o 'sumiu' (null)", () => {
    assert.deepEqual(lerPedido({ tipo: "regua", caminho: null, cor: COR }), { tipo: "regua", caminho: null, cor: COR });
    assert.deepEqual(lerPedido({ tipo: "regua", cor: COR, caminho: [{ col: 1, row: 2, lixo: 1 }, { col: 4, row: 6 }] }), { tipo: "regua", caminho: [{ col: 1, row: 2 }, { col: 4, row: 6 }], cor: COR });
});

test("régua: recusa caminho vazio, grande demais, com fração, negativo ou de tipo errado, e cor inválida", () => {
    const casa = { col: 1, row: 1 };
    const ruins: unknown[] = [[], Array(MAX_PONTOS_REGUA + 2).fill(casa), [{ col: 1.5, row: 1 }], [{ col: -1, row: 1 }], [{ col: 1, row: 100000 }], [casa, "x"], [casa, null], "texto", 5, {}];
    for (const caminho of ruins) assert.equal(lerPedido({ tipo: "regua", caminho, cor: COR }), null, JSON.stringify(caminho)?.slice(0, 60));
    assert.equal(lerPedido({ tipo: "regua", cor: COR }), null); // (sem o campo caminho)
    assert.equal(lerPedido({ tipo: "regua", caminho: [casa] }), null); // (sem a cor)
    assert.equal(lerPedido({ tipo: "regua", caminho: null, cor: -5 }), null);
    assert.notEqual(lerPedido({ tipo: "regua", caminho: Array(MAX_PONTOS_REGUA + 1).fill(casa), cor: COR }), null); // (o limite exato cabe: pontos fixados + a ponta)
});

test("limite de pings: rajada de 3 e depois 1 a cada meio segundo (2 por segundo, sustentado)", () => {
    assert.equal(RAJADA_PINGS, 3);
    assert.equal(MS_RECARGA_PING, 500);
    const balde = novoBalde(RAJADA_PINGS, 0);
    // 3 pings no mesmo instante passam; o 4º não.
    for (let i = 0; i < 3; i++) assert.equal(gastar(balde, RAJADA_PINGS, MS_RECARGA_PING, 0), true, `ping ${i + 1}`);
    assert.equal(gastar(balde, RAJADA_PINGS, MS_RECARGA_PING, 0), false);
    // 0,5 s depois cabe mais um (só um).
    assert.equal(gastar(balde, RAJADA_PINGS, MS_RECARGA_PING, 500), true);
    assert.equal(gastar(balde, RAJADA_PINGS, MS_RECARGA_PING, 500), false);
    // Ritmo SUSTENTADO: com o balde vazio, tentando a cada 10 ms durante 2 s, passam 4 (um a cada 0,5 s).
    let aceitos = 0;
    for (let t = 510; t < 2510; t += 10) if (gastar(balde, RAJADA_PINGS, MS_RECARGA_PING, t)) aceitos++;
    assert.equal(aceitos, 4);
});

test("mini delay entre pings: um ping logo depois de outro é ignorado; passado o intervalo, vale", () => {
    assert.equal(MS_MIN_ENTRE_PINGS, 250);
    assert.ok(MS_MIN_ENTRE_PINGS < MS_RECARGA_PING, "o intervalo mínimo é menor que a recarga (a recarga continua sendo o limite do ritmo sustentado)");
    assert.equal(passouOIntervalo(0, MS_MIN_ENTRE_PINGS, 1000), true, "nunca pingou: vale");
    assert.equal(passouOIntervalo(1000, MS_MIN_ENTRE_PINGS, 1100), false, "100 ms depois: ignorado");
    assert.equal(passouOIntervalo(1000, MS_MIN_ENTRE_PINGS, 1249), false);
    assert.equal(passouOIntervalo(1000, MS_MIN_ENTRE_PINGS, 1250), true, "250 ms depois: vale");
    assert.equal(passouOIntervalo(5000, MS_MIN_ENTRE_PINGS, 1000), true, "relógio que andou para trás não trava os pings");
});

test("página parada (alt-tab, aba oculta): os pings que chegam não são mostrados", () => {
    assert.equal(paginaParada(false, 16, MS_PAGINA_PARADA), false, "desenhando normalmente (um quadro a cada 16 ms)");
    assert.equal(paginaParada(false, MS_PAGINA_PARADA, MS_PAGINA_PARADA), false, "no limite exato ainda vale");
    assert.equal(paginaParada(false, MS_PAGINA_PARADA + 1, MS_PAGINA_PARADA), true, "sem quadros além do limite: parada");
    assert.equal(paginaParada(true, 0, MS_PAGINA_PARADA), true, "aba oculta: parada, mesmo com um quadro recente");
    assert.equal(paginaParada(false, 60_000, MS_PAGINA_PARADA), true, "voltou de uma aba congelada há um minuto: o 1º evento que chega ainda encontra a tela parada");
});
