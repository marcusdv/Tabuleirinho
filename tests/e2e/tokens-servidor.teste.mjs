// Teste e2e: TOKENS NO SERVIDOR (arquivos no disco). Rodar: npm run test:e2e -- tokens-servidor
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor do jogo na porta 3791 com uma pasta de dados TEMPORÁRIA (apagada no
// fim; o `dados/` do projeto não é tocado) e fala com ele por WebSocket puro. Se a porta 3791 estiver ocupada, o teste falha.
//
// Cada token é um arquivo `dados/tokens/<id>.json`. Criar (`criar_token`) grava o arquivo NA HORA e o token nasce guardado na bolsa;
// editar, mover e guardar atualizam o arquivo (a posição um instante depois, e vários movimentos seguidos viram uma gravação só);
// excluir apaga o arquivo; ids apagados não voltam. Pedidos malformados e campos que não se editam são recusados ou ignorados, o limite
// é de 100 tokens, e tudo sobrevive a reiniciar o servidor (arquivos estragados na pasta são ignorados, com aviso, e os ids deles são
// RESERVADOS: um token novo nunca os sobrescreve). Ao desligar (Ctrl+C), a posição pendente é gravada antes de sair.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3791;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const pastaTokens = join(dados, "tokens");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const jsons = () => readdirSync(pastaTokens).filter((f) => f.endsWith(".json")).sort((a, b) => parseInt(a) - parseInt(b));
const arquivo = (id) => JSON.parse(readFileSync(join(pastaTokens, `${id}.json`), "utf8"));

function subir() {
    const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados } });
    let saida = "";
    proc.stdout.on("data", (d) => (saida += d));
    proc.stderr.on("data", (d) => (saida += d));
    return new Promise((resolver) => {
        const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); resolver({ proc, saida: () => saida }); } }, 30);
        setTimeout(() => { clearInterval(t); resolver({ proc, saida: () => saida }); }, 8000);
    });
}
const desligar = (s) => { s.proc.kill("SIGINT"); return new Promise((r) => s.proc.once("exit", r)); };
function cliente(apelido = "Teste") {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
        const recebidos = [];
        let fechou = null;
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onclose = (e) => (fechou = e.code);
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, codigo: () => fechou, enviar: (o) => ws.send(typeof o === "string" ? o : JSON.stringify(o)) }); };
    });
}
async function esperarEvento(c, tipo, desde = 0, ms = 2000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { const e = c.recebidos.slice(desde).find((x) => x.tipo === tipo); if (e) return e; await esperar(20); }
    return null;
}
const criarToken = (c, extra = {}) => c.enviar({ tipo: "criar_token", nome: "Goblin", cor: 0xe74c3c, corBorda: 0xffffff, tamanho: 1, imagem: null, ...extra });

try {
    let s = await subir();
    ok("0) servidor subiu e criou a pasta de tokens (0 tokens)", existsSync(pastaTokens) && s.saida().includes("0 token(s)"), s.saida());
    let c = await cliente();
    const ini = await esperarEvento(c, "estado_inicial");
    ok("1) a mesa começa SEM tokens", Array.isArray(ini?.tokens) && ini.tokens.length === 0, JSON.stringify(ini?.tokens));

    // ---- criar
    let n = c.recebidos.length;
    criarToken(c, { nome: "  Goblin   Chefe ", tamanho: 2 });
    const e1 = await esperarEvento(c, "token_criado", n);
    ok("2a) token_criado: id 1, nome aparado (espaços internos ficam), 2×2, nasce GUARDADO, sem condições", e1?.token?.id === 1 && e1.token.nome === "Goblin   Chefe" && e1.token.size === 2 && e1.token.guardado === true && e1.token.condicoes.length === 0, JSON.stringify(e1));
    ok("2b) o arquivo 1.json JÁ existe e bate com o token", existsSync(join(pastaTokens, "1.json")) && JSON.stringify(arquivo(1)) === JSON.stringify(e1.token));
    ok("2c) nenhum .tmp sobrou", !readdirSync(pastaTokens).some((f) => f.endsWith(".tmp")));

    // ---- limites do que é aceito
    n = c.recebidos.length;
    criarToken(c, { nome: "", tamanho: 9, cor: 0xfffffff, corBorda: -5, imagem: "http://exemplo.com/x.png" });
    const e2 = await esperarEvento(c, "token_criado", n);
    ok("3a) tamanho 9 vira 4, cores fora da faixa são limitadas, imagem que não é data:image vira null, nome vazio vira 'Token 2'", e2?.token?.size === 4 && e2.token.cor === 0xffffff && e2.token.corBorda === 0 && e2.token.imagem === null && e2.token.nome === "Token 2", JSON.stringify(e2));
    n = c.recebidos.length;
    criarToken(c, { nome: "Com foto", imagem: "data:image/webp;base64,AAAA" });
    const e3 = await esperarEvento(c, "token_criado", n);
    ok("3b) uma imagem válida (data:image/...) é guardada", e3?.token?.imagem === "data:image/webp;base64,AAAA" && arquivo(3).imagem === "data:image/webp;base64,AAAA", JSON.stringify(e3?.token?.imagem));
    n = c.recebidos.length;
    criarToken(c, { imagem: "data:image/webp;base64," + "A".repeat(150_000) });
    const e4 = await esperarEvento(c, "erro", n);
    await esperar(150);
    ok("3c) imagem acima do limite (150 mil caracteres): o pedido INTEIRO é recusado e nenhum token/arquivo é criado", !!e4 && jsons().join() === "1.json,2.json,3.json", JSON.stringify(e4) + " / " + jsons());
    n = c.recebidos.length;
    criarToken(c, { nome: "Linha\nnova\u0000" });
    const e4b = await esperarEvento(c, "token_criado", n);
    ok("3d) caracteres de controle no nome viram espaço (quebra de linha não entra)", !!e4b && !/[\u0000-\u001f]/.test(e4b.token.nome) && e4b.token.nome === "Linha nova", JSON.stringify(e4b?.token?.nome));

    // ---- editar
    n = c.recebidos.length;
    c.enviar({ tipo: "editar_token", id: 1, mudancas: { nome: "Chefe", size: 3, cor: 255, imagem: "data:image/png;base64,BBBB" } });
    const ed = await esperarEvento(c, "token_editado", n);
    ok("4a) token_editado traz o token inteiro como ficou", ed?.token?.id === 1 && ed.token.nome === "Chefe" && ed.token.size === 3 && ed.token.cor === 255 && ed.token.imagem === "data:image/png;base64,BBBB", JSON.stringify(ed));
    await esperar(700);
    ok("4b) o arquivo foi atualizado (depois de um instante)", arquivo(1).nome === "Chefe" && arquivo(1).size === 3, JSON.stringify(arquivo(1)));
    n = c.recebidos.length;
    c.enviar({ tipo: "editar_token", id: 1, mudancas: { imagem: null } });
    await esperarEvento(c, "token_editado", n);
    await esperar(700);
    ok("4c) imagem: null tira a imagem e o arquivo acompanha", arquivo(1).imagem === null);

    // ---- mover (colocar no mapa) e guardar: a posição vai para o arquivo
    n = c.recebidos.length;
    c.enviar({ tipo: "colocar_token", id: 1, col: 4, row: 2 });
    await esperarEvento(c, "token_colocado", n);
    await esperar(700);
    ok("5a) colocar no mapa grava a posição no arquivo (col 4, row 2, guardado false)", arquivo(1).col === 4 && arquivo(1).row === 2 && arquivo(1).guardado === false, JSON.stringify(arquivo(1)));
    for (let i = 0; i < 6; i++) c.enviar({ tipo: "colocar_token", id: 1, col: i, row: i });
    await esperar(800);
    ok("5b) vários movimentos seguidos: o arquivo fica com o ÚLTIMO (5,5)", arquivo(1).col === 5 && arquivo(1).row === 5, JSON.stringify(arquivo(1)));
    n = c.recebidos.length;
    c.enviar({ tipo: "colocar_token", id: 1, col: 99, row: 99 });
    const rejeitado = await esperarEvento(c, "erro", n);
    ok("5c) posição fora do tabuleiro é recusada", !!rejeitado && /inválida/i.test(rejeitado.motivo), JSON.stringify(rejeitado));

    // ---- excluir
    n = c.recebidos.length;
    c.enviar({ tipo: "excluir_token", id: 2 });
    const ex = await esperarEvento(c, "token_excluido", n);
    await esperar(300);
    ok("6a) token_excluido chega e o ARQUIVO 2.json some", ex?.id === 2 && !existsSync(join(pastaTokens, "2.json")) && jsons().join() === "1.json,3.json,4.json", `${JSON.stringify(ex)} / ${jsons()}`);
    n = c.recebidos.length;
    c.enviar({ tipo: "excluir_token", id: 2 });
    const de_novo = await esperarEvento(c, "erro", n);
    ok("6b) excluir de novo (token que não existe mais) dá erro", !!de_novo, JSON.stringify(de_novo));
    n = c.recebidos.length;
    c.enviar({ tipo: "colocar_token", id: 2, col: 1, row: 1 });
    ok("6c) mexer num token excluído dá erro e NÃO recria o arquivo", !!(await esperarEvento(c, "erro", n)) && !existsSync(join(pastaTokens, "2.json")));
    n = c.recebidos.length;
    criarToken(c, { nome: "Depois" });
    const e5 = await esperarEvento(c, "token_criado", n);
    ok("6d) o próximo token tem id 5 (o 2 apagado NÃO é reaproveitado)", e5?.token?.id === 5, JSON.stringify(e5?.token?.id));
    // excluir logo depois de mover (a gravação pendente não pode ressuscitar o arquivo)
    c.enviar({ tipo: "colocar_token", id: 5, col: 2, row: 2 });
    c.enviar({ tipo: "excluir_token", id: 5 });
    await esperar(900);
    ok("6e) mover e excluir logo em seguida: o arquivo NÃO volta", !existsSync(join(pastaTokens, "5.json")), jsons().join());

    // ---- pedidos maliciosos
    async function ruim(nome, msg) {
        const antes = jsons().join();
        const k = c.recebidos.length;
        c.enviar(msg);
        const e = await esperarEvento(c, "erro", k, 700);
        await esperar(150);
        ok(nome, !!e && jsons().join() === antes && !c.recebidos.slice(k).some((x) => ["token_criado", "token_editado", "token_excluido"].includes(x.tipo)), JSON.stringify(e));
    }
    await ruim("7a) criar_token sem campos é recusado", { tipo: "criar_token" });
    await ruim("7b) criar_token com tamanho em texto é recusado", { tipo: "criar_token", nome: "x", cor: 1, corBorda: 1, tamanho: "2", imagem: null });
    await ruim("7c) criar_token com imagem que não é texto é recusado", { tipo: "criar_token", nome: "x", cor: 1, corBorda: 1, tamanho: 1, imagem: 5 });
    await ruim("7d) editar_token sem 'mudancas' é recusado", { tipo: "editar_token", id: 1 });
    await ruim("7e) editar_token com mudancas que é lista é recusado", { tipo: "editar_token", id: 1, mudancas: [] });
    await ruim("7f) editar_token com size em texto é recusado", { tipo: "editar_token", id: 1, mudancas: { size: "3" } });
    await ruim("7g) excluir_token com id em texto é recusado", { tipo: "excluir_token", id: "1" });
    await ruim("7h) excluir_token com id gigante (fora dos inteiros seguros) é recusado", { tipo: "excluir_token", id: 1e300 });
    await ruim("7i) editar um token que não existe dá erro", { tipo: "editar_token", id: 777, mudancas: { nome: "x" } });
    {
        const k = c.recebidos.length;
        c.enviar({ tipo: "editar_token", id: 1, mudancas: { nome: "Só isto", id: 99, guardado: true, col: -50, condicoes: ["morto"] } });
        const e = await esperarEvento(c, "token_editado", k);
        ok("7j) campos que não são editáveis (id, guardado, col, condicoes) são IGNORADOS", e?.token?.id === 1 && e.token.nome === "Só isto" && e.token.guardado === false && e.token.col !== -50 && e.token.condicoes.length === 0, JSON.stringify(e?.token));
    }

    // ---- reiniciar: tokens sobrevivem; arquivos estragados são ignorados; posições e imagens voltam
    await esperar(600);
    await desligar(s);
    const antes = { 1: arquivo(1), 3: arquivo(3), 4: arquivo(4) };
    writeFileSync(join(pastaTokens, "901.json"), "{ não é json");
    writeFileSync(join(pastaTokens, "902.json"), JSON.stringify({ ...antes[1], id: 902, size: 7 })); // tamanho inválido
    writeFileSync(join(pastaTokens, "903.json"), JSON.stringify({ ...antes[1], id: 5 })); // id diferente do nome
    writeFileSync(join(pastaTokens, "904.json"), JSON.stringify({ ...antes[1], id: 904, condicoes: ["inventada"] })); // condição que não existe no catálogo
    writeFileSync(join(pastaTokens, "905.json"), JSON.stringify({ ...antes[1], id: 905, nome: "Fora", guardado: false, col: 500, row: 500 })); // no mapa, mas fora do tabuleiro: vai para a bolsa
    writeFileSync(join(pastaTokens, "906.json"), JSON.stringify({ ...antes[1], id: 906, nome: "Com condição", guardado: true, condicoes: ["Cego"] })); // à mão, com uma condição que existe no catálogo
    writeFileSync(join(pastaTokens, "7.json.lixo.tmp"), "pela metade");
    s = await subir();
    const avisos = (s.saida().match(/Item ignorado \(tokens\//g) ?? []).length;
    ok("8a) ao religar: carrega os válidos e ignora com aviso os 4 estragados (json quebrado, size 7, id errado, condição inventada)", avisos === 4, s.saida().split("\n").filter((l) => l.includes("ignorado") || l.includes("carregado")).join(" | "));
    ok("8b) o .tmp de sobra foi apagado", !existsSync(join(pastaTokens, "7.json.lixo.tmp")));
    c = await cliente("Depois");
    const ini2 = await esperarEvento(c, "estado_inicial");
    const porId = Object.fromEntries((ini2?.tokens ?? []).map((t) => [t.id, t]));
    ok("8c) os tokens voltam com nome, tamanho, cores e posição (1: Só isto 3×3 em (5,5))", porId[1]?.nome === "Só isto" && porId[1].size === 3 && porId[1].col === 5 && porId[1].row === 5 && porId[1].guardado === false, JSON.stringify(porId[1]));
    ok("8d) a imagem do token 3 voltou do arquivo", porId[3]?.imagem === "data:image/webp;base64,AAAA");
    ok("8e) o token 'no mapa mas fora do tabuleiro' (905) volta GUARDADO na bolsa", porId[905]?.guardado === true, JSON.stringify(porId[905]));
    ok("8f) o token escrito à mão com a condição 'Cego' (que existe) foi aceito e voltou com ela", porId[906]?.condicoes?.join() === "Cego", JSON.stringify(porId[906]));
    {
        const k = c.recebidos.length;
        criarToken(c, { nome: "Pós-reinício" });
        const e = await esperarEvento(c, "token_criado", k);
        ok("8g) o próximo id é 907: o maior id da pasta (906, de um arquivo até ignorado) + 1", e?.token?.id === 907, String(e?.token?.id));
        ok("8h) os arquivos IGNORADOS continuam intactos no disco (o dono pode consertá-los à mão)", readFileSync(join(pastaTokens, "901.json"), "utf8") === "{ não é json" && existsSync(join(pastaTokens, "902.json")) && existsSync(join(pastaTokens, "904.json")));
    }

    // ---- desligar com uma posição ainda pendente: grava antes de sair
    {
        const k = c.recebidos.length;
        c.enviar({ tipo: "colocar_token", id: 3, col: 7, row: 7 });
        await esperarEvento(c, "token_colocado", k);
        await desligar(s); // SIGINT logo em seguida (dentro dos 300 ms de espera)
        ok("9) SIGINT com uma posição pendente: o arquivo já tem (7,7)", arquivo(3).col === 7 && arquivo(3).row === 7 && arquivo(3).guardado === false, JSON.stringify(arquivo(3)));
    }

    // ---- limite de 100 tokens (conta o que o SERVIDOR tem na memória; arquivos ignorados também estão no disco, mas não contam)
    s = await subir();
    c = await cliente("Limite");
    const ini3 = await esperarEvento(c, "estado_inicial");
    let total = ini3.tokens.length;
    const arquivosAntes = jsons().length;
    while (total < 100) {
        const k2 = c.recebidos.length;
        const lote = Math.min(30, 100 - total);
        for (let i = 0; i < lote; i++) criarToken(c, { nome: `T${i}` });
        await esperar(1200);
        total += c.recebidos.slice(k2).filter((x) => x.tipo === "token_criado").length;
    }
    ok("10a) a mesa chegou a 100 tokens", total === 100, String(total));
    const k = c.recebidos.length;
    criarToken(c);
    const lim = await esperarEvento(c, "erro", k, 1500);
    ok("10b) o token 101 é recusado, com o motivo, e nenhum arquivo novo", !!lim && /100/.test(lim.motivo) && jsons().length === arquivosAntes + (100 - ini3.tokens.length), JSON.stringify(lim));
    await desligar(s);
} finally {
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar();
