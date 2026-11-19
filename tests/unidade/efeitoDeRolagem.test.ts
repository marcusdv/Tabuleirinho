// Testes RÁPIDOS da ETIQUETA DE EFEITO das rolagens (19/11/2026): `[1d8 + 3]{cura}` e `[8d6]{dano}`. Rodar: npm run test:unidade
// A etiqueta decide o que o número ARRASTADO do chat faz numa criatura: `cura` SOMA ao HP, `dano` (ou sem etiqueta) TIRA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarFicha, rolarCartaoDaAnalise, rolarDaAnalise } from "../../src/formulas.ts";
import { aplicarResultado, efeitoDaRolagem, estado, frasePraChatDeDano, montarFicha, montarPeca, montarToken, receberFicha, receberToken } from "../../src/estado.ts";
import { NOME_CLERIGA, TEXTO_CLERIGA } from "../../src/exemplos.ts";

const sorteio = (valor: number) => () => valor;

test("rolagem de ficha: a etiqueta {cura} ou {dano} depois do colchete é lida (sem diferenciar maiúsculas)", () => {
    const texto = "SAB:: 16\nMOD:: (SAB - 10) / 2\n(Curar)[1d8 + MOD + 3]{cura}\n(Golpe)[1d6]{Dano}\n(Simples)[1d20]\n(Estranha)[2d4]{fogo}\n(Com espaço)[1d4]{ cura }";
    const { rolagens } = analisarFicha(texto);
    assert.deepEqual(rolagens.map((r) => [r.nome, r.efeito]), [["Curar", "cura"], ["Golpe", "dano"], ["Simples", null], ["Estranha", null], ["Com espaço", "cura"]]);
    // a posição da fórmula inclui os colchetes E a etiqueta (o editor colore tudo junto)
    const curar = rolagens[0];
    assert.equal(texto.slice(curar.posFormula.inicio, curar.posFormula.fim), "[1d8 + MOD + 3]{cura}");
    // uma etiqueta que não é cura nem dano fica FORA: é texto comum depois da rolagem
    const estranha = rolagens[3];
    assert.equal(texto.slice(estranha.posFormula.inicio, estranha.posFormula.fim), "[2d4]");
});

test("rolar: o resultado leva o efeito só quando há etiqueta (sem etiqueta o campo nem existe)", () => {
    const analise = analisarFicha("SAB:: 16\nMOD:: (SAB - 10) / 2\n(Curar)[1d8 + MOD]{cura}\n(Golpe)[1d6]");
    const cura = rolarDaAnalise(analise, 0, "Aurora", sorteio(0.99));
    assert.ok(cura.ok);
    assert.equal(cura.valor.efeito, "cura");
    assert.equal(cura.valor.total, 8 + 3); // (o maior lado do d8 + o modificador)
    const golpe = rolarDaAnalise(analise, 1, "Aurora", sorteio(0));
    assert.ok(golpe.ok);
    assert.equal("efeito" in golpe.valor, false);
});

test("cartão: cada [expressão] tem a sua etiqueta, e a etiqueta NÃO aparece no texto do chat", () => {
    const texto = 'SAB:: 16\nMOD:: (SAB - 10) / 2\n(Cura em Massa)"""\nTodos recuperam [2d6 + MOD]{cura} PV; um morto-vivo sofre [2d6]{dano} e perde [3]{dano}.\nSem etiqueta: [1d4].\n"""';
    const analise = analisarFicha(texto);
    assert.deepEqual(analise.cartoes[0].expressoes.map((e) => e.efeito), ["cura", "dano", "dano", null]);
    const usado = rolarCartaoDaAnalise(analise, 0, "Aurora", sorteio(0));
    assert.ok(usado.ok);
    const numeros = usado.valor.pedacos.filter((p) => p.tipo !== "texto");
    assert.deepEqual(numeros.map((p) => (p.tipo === "texto" ? null : (p.efeito ?? null))), ["cura", "dano", "dano", null]);
    const escrito = usado.valor.pedacos.map((p) => (p.tipo === "texto" ? p.texto : "#")).join("");
    assert.ok(!escrito.includes("{"), `a etiqueta vazou para o texto: ${escrito}`);
    assert.ok(escrito.includes("PV; um morto-vivo sofre #"), escrito);
});

test("a ficha de exemplo da Clériga Aurora é válida: todas as rolagens e o cartão rolam, e as etiquetas estão lá", () => {
    assert.equal(NOME_CLERIGA, "Clériga Aurora");
    const analise = analisarFicha(TEXTO_CLERIGA);
    assert.ok(analise.rolagens.every((r) => r.erro === null), JSON.stringify(analise.rolagens.filter((r) => r.erro)));
    assert.deepEqual(analise.rolagens.map((r) => r.efeito), ["cura", "cura", "cura", null, "dano", "dano"]);
    assert.ok(analise.cartoes.length === 1 && analise.cartoes[0].erro === null);
    assert.deepEqual(analise.cartoes[0].expressoes.map((e) => e.efeito), ["cura", "dano"]);
    for (let i = 0; i < analise.rolagens.length; i++) assert.ok(rolarDaAnalise(analise, i, NOME_CLERIGA, Math.random).ok, `rolagem ${i}`);
    assert.ok(rolarCartaoDaAnalise(analise, 0, NOME_CLERIGA, Math.random).ok);
});

/** Uma peça com 10 de vida (ficha `PV:: 10`) no tabuleiro. */
function criarOrc() {
    estado.tokens.length = 0;
    estado.fichas.length = 0;
    estado.colunas = 20;
    estado.linhas = 20;
    const ficha = montarFicha();
    assert.ok(ficha);
    ficha.nome = "Orc";
    ficha.abas[0].texto = "PV:: 10";
    receberFicha(ficha);
    const modelo = montarToken(0xff0000, 1, "Orc", null, 0xffffff, ficha.id);
    assert.ok(modelo);
    receberToken(modelo);
    const peca = montarPeca(modelo.id, 2, 2);
    assert.ok(peca);
    receberToken(peca);
    return peca;
}

test("arrastar um número: sem etiqueta ou {dano} TIRA vida; {cura} SOMA (sem passar do máximo)", () => {
    const orc = criarOrc();
    const dano = aplicarResultado(orc, 6);
    assert.ok(dano.ok);
    assert.equal(orc.valores[0].atual, 4);
    assert.equal(dano.efeito, "reduzir");
    assert.equal(frasePraChatDeDano(orc, dano), "Orc: Dano 6 (HP 10→4)");
    const danoMarcado = aplicarResultado(orc, 1, "dano");
    assert.ok(danoMarcado.ok);
    assert.equal(orc.valores[0].atual, 3);
    const cura = aplicarResultado(orc, 5, "cura");
    assert.ok(cura.ok);
    assert.equal(cura.efeito, "aumentar");
    assert.equal(orc.valores[0].atual, 8);
    assert.equal(frasePraChatDeDano(orc, cura), "Orc: Cura 5 (HP 3→8)");
    const demais = aplicarResultado(orc, 99, "cura");
    assert.ok(demais.ok);
    assert.equal(orc.valores[0].atual, 10, "a cura não passa do máximo");
});

test("cura: sem ação de cura na mesa, ou com a criatura sem o status, dá um erro com o motivo (e nada muda)", () => {
    const orc = criarOrc();
    const guardadas = [...estado.acoesDaMesa];
    estado.acoesDaMesa = estado.acoesDaMesa.filter((a) => a.efeito !== "aumentar");
    const semAcao = aplicarResultado(orc, 4, "cura");
    assert.equal(semAcao.ok, false);
    assert.match(semAcao.ok ? "" : semAcao.erro, /ação de cura/);
    estado.acoesDaMesa = guardadas;
    const antes = JSON.stringify(orc.valores);
    orc.status = []; // (uma criatura sem barra de vida)
    const semStatus = aplicarResultado(orc, 4, "cura");
    assert.equal(semStatus.ok, false);
    assert.match(semStatus.ok ? "" : semStatus.erro, /Orc.*não recebe/);
    assert.equal(JSON.stringify(orc.valores), antes);
});

test("efeitoDaRolagem: lê a etiqueta da mensagem do chat (da rolagem inteira, ou do número de um cartão)", () => {
    estado.mensagens.length = 0;
    const analise = analisarFicha('SAB:: 16\n(Curar)[1d8]{cura}\n(Cartão)"""\n[1d6]{dano} e [2d4]{cura} e [1d4]\n"""');
    const r = rolarDaAnalise(analise, 0, "A", sorteio(0));
    const c = rolarCartaoDaAnalise(analise, 0, "A", sorteio(0));
    assert.ok(r.ok && c.ok);
    estado.mensagens.push({ id: 1, autor: "A", texto: "x", rolagemFicha: r.valor, hora: 0 }, { id: 2, autor: "A", texto: "y", cartaoFicha: c.valor, hora: 0 }, { id: 3, autor: "A", texto: "z", hora: 0 });
    assert.equal(efeitoDaRolagem(1), "cura");
    assert.deepEqual([0, 1, 2].map((i) => efeitoDaRolagem(2, i)), ["dano", "cura", null]);
    assert.equal(efeitoDaRolagem(2), null, "um cartão sem `indice` não tem 'o' efeito");
    assert.equal(efeitoDaRolagem(3), null);
    assert.equal(efeitoDaRolagem(99), null);
    estado.mensagens.length = 0;
});

// ---------------------------------------------------------------------
// OS EXEMPLOS DAS INSTRUÇÕES DA FICHA (a janela "Instruções", em index.html): cada exemplo "certo" tem de funcionar de verdade, e cada "errado" tem de errar do jeito que a ajuda diz.
// ---------------------------------------------------------------------
test("instruções: os exemplos 'certos' funcionam (variáveis, rolagens, cura/dano e cartões)", () => {
    const base = "FOR:: 16\nMOD_FOR:: (FOR - 10) / 2\nDES:: 14\nMOD_DES:: (DES - 10) / 2\nINT:: 14\nMOD_INT:: (INT - 10) / 2\nSAB:: 16\nPROF:: 2\nNIVEL:: 3\nMOD_SAB:: (SAB - 10) / 2\nCD_MAGIA:: 8 + PROF + MOD_SAB";
    const analise = analisarFicha([
        base,
        "(Ataque com espada)[1d20 + MOD_FOR + PROF]",
        "(Ataque furtivo)[1d8 + MOD_DES + 3d6]",
        "(Dano crítico da espada)[2d8 + MOD_FOR]",
        "(Poção de cura)[2d4 + 2]{cura}",
        "(Raio de Fogo)[1d20 + MOD_INT + PROF]",
        '(Luz Radiante)"""\nUm aliado recupera [1d8 + MOD_SAB]{cura} de vida;\num inimigo sofre [1d8 + MOD_SAB]{dano} de dano radiante.\n"""',
        '(Raio de Fogo)"""\n## Raio de Fogo (truque)\nAtaque de magia: +[PROF + MOD_SAB] para acertar. CD [CD_MAGIA].\nDano: [1d10]{dano} de fogo.\n"""',
        '(Amuleto de Aurora)"""\n**Amuleto de Aurora** (raro)\nUma vez por descanso, ilumina 9 m de raio por 1 hora.\n"""',
        "ESPACOS_NIVEL_1::0:4:4\nPOCOES_DE_CURA::0:3:10\nCARGAS_DO_CAJADO::0:7:7\nPV::0:(10 + NIVEL):(10 + NIVEL)",
    ].join("\n"));
    assert.ok(analise.variaveis.every((v) => v.erro === null), JSON.stringify(analise.variaveis.filter((v) => v.erro)));
    assert.equal(analise.variaveis.find((v) => v.nome === "CD_MAGIA")?.valor, 13, "CD_MAGIA = 8 + 2 + 3");
    assert.deepEqual(analise.rolagens.map((r) => r.nome), ["Ataque com espada", "Ataque furtivo", "Dano crítico da espada", "Poção de cura", "Raio de Fogo"]);
    assert.ok(analise.rolagens.every((r) => r.erro === null));
    assert.equal(analise.rolagens.find((r) => r.nome === "Poção de cura")?.efeito, "cura");
    assert.equal(analise.cartoes.length, 3);
    assert.ok(analise.cartoes.every((c) => c.erro === null), JSON.stringify(analise.cartoes.map((c) => c.erro)));
    assert.deepEqual(analise.cartoes[0].expressoes.map((e) => e.efeito), ["cura", "dano"]); // (Luz Radiante: cura e dano no mesmo cartão)
    assert.equal(analise.cartoes[2].expressoes.length, 0); // (o Amuleto: um cartão sem números)
    const raio = rolarCartaoDaAnalise(analise, 1, "A", sorteio(0));
    assert.ok(raio.ok);
    const textoDoRaio = raio.valor.pedacos.map((p) => (p.tipo === "texto" ? p.texto : p.tipo === "rolagem" || p.tipo === "conta" ? String(p.total) : "")).join("");
    assert.match(textoDoRaio, /Ataque de magia: \+5 para acertar\. CD 13\./, textoDoRaio); // (+[PROF + MOD_SAB] = 2 + 3; [CD_MAGIA] = 13)
});

test("instruções: os exemplos NOVOS (rolagem sem nome, Essenciais, Cura em Massa, Raio de Fogo, recursos com conta) funcionam", () => {
    const analise = analisarFicha([
        "SAB:: 16\nDES:: 14\nPROF:: 2\nNIVEL:: 5\nMOD_SAB:: (SAB - 10) / 2\nMOD_DES:: (DES - 10) / 2\nMOD_FOR:: 3\nCD_MAGIA:: 8 + PROF + MOD_SAB\nPV:: 22",
        "(Salvaguarda de Sabedoria)[1d20 + MOD_SAB + PROF]",
        "[1d20 + MOD_FOR]",
        "(Iniciativa)[1d20 + MOD_DES]",
        "(Curar Ferimentos)[1d8 + MOD_SAB + 3]{cura}\n(Chama Sagrada)[1d8]{dano}\n(Chama Sagrada)[1d8]",
        '(Cura em Massa)"""\nTodos recuperam [2d6 + MOD_SAB]{cura} pontos de vida.\n"""',
        '(Raio de Fogo)"""\n## Raio de Fogo (truque)\nCD [CD_MAGIA]\nAtaque de magia: Rolagem de ataque[1d20 + PROF + MOD_SAB]\nDano: [1d10]{dano} de fogo.\n"""',
    ].join("\n"));
    assert.ok(analise.variaveis.every((v) => v.erro === null));
    const nomes = analise.rolagens.map((r) => r.nome);
    assert.ok(nomes.includes("Iniciativa") && nomes.includes("Curar Ferimentos"), JSON.stringify(nomes));
    assert.equal(analise.rolagens.length, 6, "a sem nome também é uma rolagem: " + JSON.stringify(nomes));
    assert.equal(analise.rolagens.find((r) => r.nome === "Curar Ferimentos")?.efeito, "cura");
    const chamas = analise.rolagens.filter((r) => r.nome === "Chama Sagrada");
    assert.equal(chamas.length, 2);
    assert.equal(chamas[0].efeito, "dano"); // ({dano} explícito)
    assert.equal(chamas[1].efeito, null); // (sem etiqueta: o jogo trata como dano, ver `efeitoDaRolagem`)
    assert.ok(analise.cartoes.every((c) => c.erro === null), JSON.stringify(analise.cartoes.map((c) => c.erro)));
    assert.deepEqual(analise.cartoes[0].expressoes.map((e) => e.efeito), ["cura"]);
    const recursos = analisarFicha("NIVEL:: 5\nMOD_CON:: 2\nPV::0:(10 + NIVEL * 6):(10 + NIVEL * 6)\nESPACOS_NIVEL_1::0:(NIVEL + 1):(NIVEL + 1)\nKARMA::-50:0:50").variaveis;
    assert.ok(recursos.every((v) => v.erro === null), JSON.stringify(recursos.filter((v) => v.erro)));
});

test("instruções: os exemplos 'errados' erram do jeito que a ajuda diz", () => {
    // variável formatada deixa de ser variável
    assert.equal(analisarFicha("**FOR:: 16**").variaveis.length, 0);
    assert.equal(analisarFicha("FOR:: 16").variaveis.length, 1);
    // só {cura} e {dano} valem: {curar} vira texto comum (a rolagem continua, sem efeito)
    const curar = analisarFicha("(Cura)[2d4 + 2]{curar}").rolagens[0];
    assert.equal(curar.efeito, null);
    assert.equal(analisarFicha("(Cura)[2d4 + 2]{cura}").rolagens[0].efeito, "cura");
    // sem dado não é rolagem
    assert.equal(analisarFicha("(Bônus)[3 + 2]").rolagens.length, 0);
    assert.equal(analisarFicha("(Bônus)[1d4 + 2]").rolagens.length, 1);
    // a conta de um recurso fora dos parênteses dá erro; entre parênteses, vale
    const errado = analisarFicha("NIVEL:: 3\nPV::0:10 + NIVEL:10 + NIVEL").variaveis.find((v) => v.nome === "PV");
    assert.ok(!errado || errado.erro !== null, "sem parênteses: erro (ou nem vira variável)");
    const certo = analisarFicha("NIVEL:: 3\nPV::0:(10 + NIVEL):(10 + NIVEL)").variaveis.find((v) => v.nome === "PV");
    assert.ok(certo && certo.erro === null);
});
