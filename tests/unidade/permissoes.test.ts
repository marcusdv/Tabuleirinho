// Testes RÁPIDOS das regras de permissão (código compartilhado). Rodar: npm run test:unidade
import { test } from "node:test";
import assert from "node:assert/strict";
import { idDeUsuarioDoNome, limparPermissoes, nivelNoItem, permissoesVazias, podeEditar, podeExcluir, podeLer } from "../../src/permissoes.ts";

test("o id de usuário vem do nome: minúsculas, sem acento, só letras e números", () => {
    assert.equal(idDeUsuarioDoNome("Ána Maria"), "u_ana_maria");
    assert.equal(idDeUsuarioDoNome("   "), "u_anonimo");
});

test("dono, liberação direta e liberação pelo grupo (vale a MAIOR)", () => {
    const p = permissoesVazias();
    p.tokens["7"] = { dono: "u_ana", acessos: { u_beto: "leitor" } };
    p.grupos["3"] = { u_beto: "editor" };
    assert.equal(nivelNoItem(p, "tokens", 7, "u_ana", []), "dono");
    assert.equal(nivelNoItem(p, "tokens", 7, "u_beto", []), "leitor");
    assert.equal(nivelNoItem(p, "tokens", 7, "u_beto", [3]), "editor"); // (o grupo dá mais que a liberação direta)
    assert.equal(nivelNoItem(p, "tokens", 7, "u_caio", []), null);
});

test("o que cada nível pode fazer: só o dono exclui; o editor edita; o leitor só lê", () => {
    assert.ok(podeExcluir("dono") && !podeExcluir("editor"));
    assert.ok(podeEditar("editor") && !podeEditar("leitor"));
    assert.ok(podeLer("leitor") && !podeLer(null));
});

test("limparPermissoes descarta o que é inválido (arquivo editado à mão) e nunca lança erro", () => {
    const p = limparPermissoes({ dono: "NOME INVÁLIDO", mestres: ["u_ok", 5, "u_ok"], banidos: [{ usuario: "u_mau", nome: "Mau" }, { usuario: "!!" }], tokens: { abc: {}, "2": { dono: "u_x", acessos: { u_y: "dono" } } } });
    assert.equal(p.dono, null);
    assert.deepEqual(p.mestres, ["u_ok"]);
    assert.deepEqual(p.banidos, [{ usuario: "u_mau", nome: "Mau" }]);
    assert.deepEqual(Object.keys(p.tokens), ["2"]);
    assert.deepEqual(p.tokens["2"].acessos, {}); // ("dono" não é um nível de liberação)
    assert.deepEqual(limparPermissoes("lixo"), permissoesVazias());
});
