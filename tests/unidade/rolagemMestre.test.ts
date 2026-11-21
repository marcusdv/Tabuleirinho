// Testes RÁPIDOS das ROLAGENS EM MODO MESTRE (clique direito no dado: só o mestre e quem rolou veem). Sem rede nem navegador. Rodar: npm run test:unidade
//   - o protocolo: `secreta` só pode ser booleano, e só `true` passa adiante;
//   - a regra de quem vê (`mensagemVisivelPara`) e o ENVIO de verdade (`avisarMensagem`, com conexões falsas): o mestre e o autor recebem, outro jogador NÃO;
//   - o histórico do chat que uma pessoa recebe ao entrar (`mensagensVisiveisPara`) não traz as secretas dos outros;
//   - as funções que criam mensagens marcam `secreta` só quando pedido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adicionarRolagem, adicionarRolagemDeFicha, definirMensagens, estado, type Mensagem } from "../../src/estado.ts";
import { rolarDados } from "../../src/dados.ts";
import { lerPedido } from "../../src/protocolo.ts";
import { conexoes, type Conexao } from "../../servidor/conexoes.ts";
import { avisarMensagem, mensagemVisivelPara, mensagensVisiveisPara } from "../../servidor/visao.ts";

test("protocolo: `secreta` aceita só booleano, e só `true` passa adiante", () => {
    assert.deepEqual(lerPedido({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0, secreta: true }), { tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0, secreta: true });
    assert.deepEqual(lerPedido({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0, secreta: false }), { tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0 }); // (false = como sempre)
    assert.deepEqual(lerPedido({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0 }), { tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0 });
    for (const estranho of ["sim", 1, 0, null, {}, []]) assert.equal(lerPedido({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 0, secreta: estranho }), null, `rolar_dados com secreta=${JSON.stringify(estranho)}`);
    assert.deepEqual(lerPedido({ tipo: "rolar_conta", texto: "2d6 + 3", secreta: true }), { tipo: "rolar_conta", texto: "2d6 + 3", secreta: true });
    assert.equal(lerPedido({ tipo: "rolar_conta", texto: "2d6", secreta: "sim" }), null);
    assert.deepEqual(lerPedido({ tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 3, token: null, secreta: true }), { tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 3, token: null, secreta: true });
    assert.equal(lerPedido({ tipo: "rolar_ficha", id: 1, versao: 2, aba: 0, indice: 3, secreta: "talvez" }), null);
    assert.deepEqual(lerPedido({ tipo: "usar_cartao", id: 1, versao: 2, aba: 0, indice: 0, secreta: true }), { tipo: "usar_cartao", id: 1, versao: 2, aba: 0, indice: 0, secreta: true });
    assert.equal(lerPedido({ tipo: "usar_cartao", id: 1, versao: 2, aba: 0, indice: 0, secreta: 1 }), null);
});

test("as funções que criam mensagens marcam `secreta` só quando pedido", () => {
    const sorteio = (): number => 0.5;
    const comum = adicionarRolagem("Ana", rolarDados(20, 1, 0, sorteio));
    const secreta = adicionarRolagem("Ana", rolarDados(20, 1, 0, sorteio), true);
    assert.equal("secreta" in comum, false);
    assert.equal(secreta.secreta, true);
    const deFicha = adicionarRolagemDeFicha("Ana", { nome: "Ataque", ficha: "F", formula: "1d20", detalhe: "", dados: [], total: 10 }, undefined, true);
    assert.equal(deFicha.secreta, true);
});

/** Uma conexão FALSA: guarda o que o servidor "enviou" a ela. Só tem o que `avisarMensagem` e `mensagemVisivelPara` usam. */
function conexaoFalsa(usuario: string, mestre: boolean): { c: Conexao; recebidas: Mensagem[] } {
    const recebidas: Mensagem[] = [];
    const ws = { readyState: 1, send: (texto: string) => { const e = JSON.parse(texto) as { tipo: string; mensagem?: Mensagem }; if (e.tipo === "mensagem" && e.mensagem) recebidas.push(e.mensagem); } };
    const c = { ws, jogador: { id: 1, apelido: usuario, mestre }, usuario, mestre } as unknown as Conexao;
    return { c, recebidas };
}

test("rolagem em modo mestre: chega ao mestre e a quem rolou, NÃO a outro jogador; a comum chega a todos", () => {
    const mestre = conexaoFalsa("mestre", true);
    const ana = conexaoFalsa("ana", false);
    const beto = conexaoFalsa("beto", false);
    conexoes.clear();
    for (const f of [mestre, ana, beto]) conexoes.add(f.c);
    try {
        estado.mensagens = [];
        const secretaDaAna = adicionarRolagem("Ana", rolarDados(20, 1, 0, () => 0.5), true);
        avisarMensagem(ana.c, secretaDaAna);
        assert.equal(mestre.recebidas.length, 1, "o mestre vê");
        assert.equal(ana.recebidas.length, 1, "quem rolou vê");
        assert.equal(beto.recebidas.length, 0, "outro jogador NÃO vê");
        const comum = adicionarRolagem("Beto", rolarDados(20, 1, 0, () => 0.5));
        avisarMensagem(beto.c, comum);
        assert.deepEqual([mestre.recebidas.length, ana.recebidas.length, beto.recebidas.length], [2, 2, 1], "a comum chega a todos");
        // o mestre rolando em modo mestre: só ele vê
        const secretaDoMestre = adicionarRolagem("Mestre", rolarDados(20, 1, 0, () => 0.5), true);
        avisarMensagem(mestre.c, secretaDoMestre);
        assert.deepEqual([mestre.recebidas.length, ana.recebidas.length, beto.recebidas.length], [3, 2, 1], "a do mestre fica só com o mestre");
        // o que chega ao navegador leva só `secreta: true`: o id de usuário de quem rolou NUNCA vai na mensagem
        assert.equal(mestre.recebidas[0].secreta, true);
        assert.ok(!JSON.stringify(mestre.recebidas[0]).includes('"usuario"'), "a mensagem não carrega o id de usuário de quem rolou");
        // o HISTÓRICO que cada um recebe ao entrar: as secretas dos outros ficam de fora
        assert.deepEqual(mensagensVisiveisPara(mestre.c).map((m) => m.id), [secretaDaAna.id, comum.id, secretaDoMestre.id]);
        assert.deepEqual(mensagensVisiveisPara(ana.c).map((m) => m.id), [secretaDaAna.id, comum.id]);
        assert.deepEqual(mensagensVisiveisPara(beto.c).map((m) => m.id), [comum.id]);
        assert.equal(mensagemVisivelPara(beto.c, secretaDaAna), false);
        assert.equal(mensagemVisivelPara(ana.c, secretaDoMestre), false);
        assert.equal(mensagemVisivelPara(mestre.c, secretaDaAna), true);
    } finally {
        conexoes.clear();
        definirMensagens([]);
    }
});
