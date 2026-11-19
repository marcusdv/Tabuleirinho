// Testes RÁPIDOS das condições editáveis (src/condicoes.ts): a validação (o servidor nunca confia no navegador), a ordem e a lista que o mestre pode trocar. Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONDICOES, CONDICOES_DE_FABRICA, buscarCondicao, copiarCondicoes, definirCondicoes, ehDeFabrica, limparCondicao, limparCondicoes, ordenarCondicoes, podeExcluirCondicao, urlDoIcone } from "../../src/condicoes.ts";
import { MAX_CARACTERES_LINHA_CONDICAO, MAX_CARACTERES_NOME_CONDICAO, MAX_CONDICOES, MAX_LINHAS_DESCRICAO_CONDICAO } from "../../src/config.ts";

const IMAGEM = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const nova = (id: string, extra: Record<string, unknown> = {}) => ({ id, nome: "Maldito", descricao: ["Perde a vez."], imagem: IMAGEM, ...extra });

test("a lista de fábrica tem as 18 condições, com 'Morto' por último e o X vermelho só nele", () => {
    assert.equal(CONDICOES_DE_FABRICA.length, 18);
    assert.equal(CONDICOES_DE_FABRICA[CONDICOES_DE_FABRICA.length - 1].id, "Morto");
    assert.deepEqual(CONDICOES_DE_FABRICA.filter((c) => c.visual).map((c) => c.id), ["Morto"]);
    assert.ok(ehDeFabrica("Cego") && !ehDeFabrica("Maldito"));
});

test("condição de fábrica: o ícone é o PNG da pasta; condição criada: o 'print' enviado", () => {
    assert.equal(urlDoIcone("Cego"), "/images/condicoes/Cego.png");
    definirCondicoes([...CONDICOES_DE_FABRICA, nova("maldito") as never]);
    assert.equal(urlDoIcone("maldito"), IMAGEM);
    assert.equal(buscarCondicao("maldito")?.nome, "Maldito");
    definirCondicoes(CONDICOES_DE_FABRICA); // (volta ao normal para os outros testes)
});

test("limparCondicao: aceita uma condição certa e devolve só os campos conhecidos", () => {
    const c = limparCondicao({ ...nova("maldito"), lixo: "x", visual: "x-vermelho" });
    assert.deepEqual(c, { id: "maldito", nome: "Maldito", descricao: ["Perde a vez."], imagem: IMAGEM }); // (o X vermelho é só do Morto)
    assert.equal(limparCondicao({ id: "Morto", nome: "Morto", descricao: [], visual: "x-vermelho" })?.visual, "x-vermelho");
});

test("limparCondicao: nome aparado e cortado, linhas aparadas, vazias saem, limites respeitados", () => {
    const c = limparCondicao(nova("a", { nome: `  ${"x".repeat(MAX_CARACTERES_NOME_CONDICAO + 20)}  `, descricao: ["  oi  ", "", "   ", "y".repeat(MAX_CARACTERES_LINHA_CONDICAO + 50), ...Array(30).fill("z")] }));
    assert.ok(c);
    assert.equal(c.nome.length, MAX_CARACTERES_NOME_CONDICAO);
    assert.equal(c.descricao[0], "oi");
    assert.equal(c.descricao[1].length, MAX_CARACTERES_LINHA_CONDICAO);
    assert.equal(c.descricao.length, MAX_LINHAS_DESCRICAO_CONDICAO);
});

test("limparCondicao: recusa id ruim, nome vazio, descrição que não é lista, imagem inválida ou grande, e condição criada SEM ícone", () => {
    for (const id of ["", "a b", "../x", "x".repeat(41), "ação", 5, null]) assert.equal(limparCondicao(nova(id as string)), null, String(id));
    assert.equal(limparCondicao(nova("a", { nome: "   " })), null);
    assert.equal(limparCondicao(nova("a", { nome: 5 })), null);
    assert.equal(limparCondicao(nova("a", { descricao: "texto" })), null);
    assert.equal(limparCondicao(nova("a", { descricao: [1, 2] })), null);
    for (const imagem of ["http://x.com/a.png", "data:image/svg+xml;base64,AAAA", "data:text/html;base64,AAAA", `data:image/webp;base64,${"A".repeat(200000)}`, "javascript:alert(1)", 7]) {
        assert.equal(limparCondicao(nova("a", { imagem })), null, String(imagem).slice(0, 30));
    }
    assert.equal(limparCondicao({ id: "a", nome: "A", descricao: [] }), null, "criada sem imagem");
    assert.ok(limparCondicao({ id: "Cego", nome: "Cego", descricao: [] }), "de fábrica pode ficar sem imagem (usa o PNG)");
    for (const lixo of [null, undefined, 5, "x", [], [1]]) assert.equal(limparCondicao(lixo), null);
});

test("limparCondicoes: descarta o errado e as repetidas e respeita o máximo; ordena (fábrica, criadas, Morto)", () => {
    const lista = limparCondicoes([nova("b"), { id: "Morto", nome: "Morto", descricao: [] }, { lixo: 1 }, nova("b", { nome: "Repetida" }), { id: "Cego", nome: "Cego", descricao: ["x"] }, nova("a")]);
    assert.ok(lista);
    assert.deepEqual(lista.map((c) => c.id), ["Cego", "b", "a", "Morto"]);
    assert.equal(lista.find((c) => c.id === "b")?.nome, "Maldito", "vale a primeira repetida");
    assert.equal(limparCondicoes("não é lista"), null);
    const muitas = limparCondicoes(Array.from({ length: MAX_CONDICOES + 10 }, (_, i) => nova(`c${i}`)));
    assert.equal(muitas?.length, MAX_CONDICOES);
});

test("ordenarCondicoes: criadas depois das de fábrica e antes do Morto", () => {
    const fabrica = copiarCondicoes(CONDICOES_DE_FABRICA);
    const lista = ordenarCondicoes([nova("z") as never, ...fabrica.reverse(), nova("y") as never]);
    assert.equal(lista[lista.length - 1].id, "Morto");
    assert.deepEqual(lista.slice(-3).map((c) => c.id), ["z", "y", "Morto"]);
    assert.equal(lista[0].id, "Agarrado");
});

test("definirCondicoes troca a lista NO LUGAR (quem importou CONDICOES vê a nova) e guarda uma cópia", () => {
    const original = copiarCondicoes(CONDICOES_DE_FABRICA);
    const referencia = CONDICOES;
    definirCondicoes([original[0]]);
    assert.equal(referencia.length, 1);
    assert.notEqual(CONDICOES[0], original[0], "é uma cópia");
    definirCondicoes(CONDICOES_DE_FABRICA);
    assert.equal(CONDICOES.length, 18);
});

test("o Morto não pode ser excluído (o jogo a usa para o X vermelho do token); todas as outras podem", () => {
    assert.equal(podeExcluirCondicao("Morto"), false);
    for (const c of CONDICOES_DE_FABRICA.filter((x) => x.id !== "Morto")) assert.equal(podeExcluirCondicao(c.id), true, c.id);
    assert.equal(podeExcluirCondicao("qualquer-outra"), true);
});
