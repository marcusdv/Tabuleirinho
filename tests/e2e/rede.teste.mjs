// Teste e2e: REDE (protótipo do servidor). Rodar: npm run test:e2e -- rede
// (precisa do Vite: npm run dev; este teste sobe o PRÓPRIO servidor do jogo na porta 3737 e o desliga no fim: se a
// porta estiver ocupada, desligue o servidor que estiver nela antes.)
//
// Duas pessoas (Ana e Beto) na mesma mesa veem as mesmas coisas: token solto no mapa e na bolsa, chat e dados. Quem
// SORTEIA os dados é o servidor. E uma bateria de pedidos MALICIOSOS (regras de segurança do BRAINSTORM.md) precisa ser
// recusada sem derrubar o servidor nem mexer no estado.
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3737; // a mesma de PORTA_SERVIDOR em src/config.ts (o Vite repassa /ws para ela)

// ---------------- sobe o servidor do jogo (limpo: o estado fica na memória dele)
const servidor = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA) } });
let saidaDoServidor = "";
servidor.stdout.on("data", (d) => (saidaDoServidor += d));
servidor.stderr.on("data", (d) => (saidaDoServidor += d));
const subiu = await new Promise((resolver) => {
    const prazo = setTimeout(() => resolver(false), 8000);
    const olhar = setInterval(() => {
        if (saidaDoServidor.includes("escutando")) { clearTimeout(prazo); clearInterval(olhar); resolver(true); }
        if (saidaDoServidor.includes("já está em uso")) { clearTimeout(prazo); clearInterval(olhar); resolver(false); }
    }, 50);
});
ok("0) o servidor do jogo subiu na porta " + PORTA + " (senão: desligue quem usa a porta)", subiu, saidaDoServidor.split("\n")[0]);
if (!subiu) { servidor.kill(); process.exit(1); }

const navegador = await lancar();
const erros = [];
async function abrir(consulta) {
    const p = await (await navegador.newContext({ viewport: { width: 1400, height: 800 } })).newPage();
    p.on("pageerror", (e) => erros.push(consulta + ": " + String(e)));
    await abrirPagina(p, consulta);
    return p;
}
const aguardarConexao = (p) => p.waitForFunction(() => window.__tabuleirinho.rede?.ativa === true, null, { timeout: 15000 });
const tokenDe = (p, id) => p.evaluate((id) => { const t = window.__tabuleirinho.estado.tokens.find((t) => t.id === id); return { col: t.col, row: t.row, guardado: t.guardado }; }, id);
const cartoes = (p) => p.locator(".chat-mensagem").evaluateAll((els) => els.map((e) => ({ autor: e.querySelector("strong")?.textContent, formula: e.querySelector(".chat-formula strong")?.textContent ?? null, total: e.querySelector(".chat-total")?.textContent?.trim() ?? null, texto: e.querySelector(":scope > p")?.textContent ?? null })));
async function arrastar(p, de, para) { await p.mouse.move(de.x, de.y); await p.mouse.down(); await p.mouse.move(para.x, para.y, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(250); }

try {
    // ================= 1) duas pessoas entram
    const A = await abrir("?online&nome=Ana"), B = await abrir("?online&nome=Beto");
    await aguardarConexao(A); await aguardarConexao(B);
    await A.waitForFunction(() => document.getElementById("rede-status").textContent.includes("Beto"), null, { timeout: 8000 });
    const statusA = await A.locator("#rede-status").textContent();
    ok("1) as duas páginas conectam e o status mostra os dois na mesa", statusA.includes("Online: Ana") && statusA.includes("Ana, Beto"), statusA);

    // ================= 2) token solto no mapa (o token 1 está em col 3, row 3; centro na tela (348,304))
    await arrastar(A, { x: 348, y: 304 }, { x: 124 + 5.5 * 64, y: 80 + 2.5 * 64 });
    await B.waitForTimeout(300);
    const a1 = await tokenDe(A, 1), b1 = await tokenDe(B, 1);
    ok("2) Ana solta o token 1 em (5,2): nas duas páginas ele está lá", a1.col === 5 && a1.row === 2 && b1.col === 5 && b1.row === 2, JSON.stringify({ a1, b1 }));

    // ================= 3) token guardado na bolsa e colocado de volta (token 4: 2x2, col 10, row 2; centro (828,272))
    const bolsa = await B.locator("#bolsa").boundingBox();
    await arrastar(B, { x: 828, y: 272 }, { x: bolsa.x + bolsa.width / 2, y: bolsa.y + bolsa.height / 2 });
    await A.waitForTimeout(300);
    ok("3a) Beto guarda o token 4 na bolsa: guardado nas duas páginas", (await tokenDe(A, 4)).guardado && (await tokenDe(B, 4)).guardado);
    ok("3b) a bolsa de Ana mostra 1 ficha", (await A.locator("#bolsa-contagem").textContent()) === "(1)");
    const ficha = await A.locator(".ficha").first().boundingBox();
    await arrastar(A, { x: ficha.x + ficha.width / 2, y: ficha.y + ficha.height / 2 }, { x: 124 + 9 * 64, y: 80 + 6 * 64 });
    await B.waitForTimeout(300);
    const a4 = await tokenDe(A, 4), b4 = await tokenDe(B, 4);
    ok("3c) Ana coloca o token 4 no mapa: igual nas duas páginas e fora da bolsa de Beto", !a4.guardado && !b4.guardado && a4.col === b4.col && a4.row === b4.row && (await B.locator("#bolsa-contagem").textContent()) === "", JSON.stringify({ a4, b4 }));

    // ================= 4) chat
    await A.fill("#chat-texto", "oi do Ana"); await A.keyboard.press("Enter"); await B.waitForTimeout(300);
    const ca = (await cartoes(A))[0], cb = (await cartoes(B))[0];
    ok("4a) a mensagem de Ana aparece nas duas páginas, com o nome dela como autor", ca.texto === "oi do Ana" && cb.texto === "oi do Ana" && ca.autor === "Ana" && cb.autor === "Ana", JSON.stringify({ ca, cb }));
    await B.fill("#chat-texto", "e aqui o Beto"); await B.keyboard.press("Enter"); await A.waitForTimeout(300);
    ok("4b) e a de Beto também", (await cartoes(A))[0].texto === "e aqui o Beto" && (await cartoes(A))[0].autor === "Beto");

    // ================= 5) dados: o SERVIDOR sorteia
    await B.evaluate(() => { Math.random = () => 0; }); // se o navegador sorteasse, todo d20 sairia 1
    await B.locator(".dado", { hasText: /^d20$/ }).click();
    await B.fill("#dados-qtd", "1"); await B.press("#dados-qtd", "Enter");
    for (let i = 0; i < 25; i++) { await B.click("#dados-rolar"); await B.waitForTimeout(40); }
    await A.waitForTimeout(600);
    const totais = new Set((await cartoes(A)).filter((c) => c.formula === "1d20").map((c) => c.total));
    ok("5a) 25 rolagens de d20 com o Math.random do navegador travado em 0: valores variados (o servidor sorteou)", totais.size >= 5, "valores distintos: " + totais.size);
    ok("5b) o cartão de rolagem é igual nas duas páginas", JSON.stringify((await cartoes(A))[0]) === JSON.stringify((await cartoes(B))[0]) && (await cartoes(A))[0].autor === "Beto");
    await B.locator(".dado", { hasText: /^d6$/ }).click(); await B.fill("#dados-qtd", "2"); await B.press("#dados-qtd", "Enter"); await B.fill("#dados-mod", "1"); await B.press("#dados-mod", "Enter");
    await B.click("#dados-rolar"); await A.waitForTimeout(500);
    const r2 = (await cartoes(A))[0];
    ok("5c) 2d6+1 chega a Ana com a fórmula certa e um total de 3 a 13", r2.formula === "2d6+1" && Number(r2.total) >= 3 && Number(r2.total) <= 13, JSON.stringify(r2));

    // ================= 6) quem entra depois recebe o estado e o histórico
    const C = await abrir("?online&nome=Caio");
    await aguardarConexao(C); await C.waitForTimeout(400);
    const c1 = await tokenDe(C, 1), c4 = await tokenDe(C, 4);
    ok("6) Caio entra depois e já vê os tokens onde estão e o histórico do chat", c1.col === 5 && c1.row === 2 && c4.col === a4.col && c4.row === a4.row && (await cartoes(C)).some((m) => m.texto === "oi do Ana"));
    await C.context().close();

    // ================= 7) PEDIDOS MALICIOSOS (WebSocket "cru", pelo mesmo caminho do navegador)
    const M = await abrir("");
    const r = await M.evaluate(async () => {
        const caixa = []; const ws = new WebSocket("ws://127.0.0.1:5173/ws");
        await new Promise((res) => ws.addEventListener("open", res));
        let fechou = null; ws.addEventListener("close", (e) => (fechou = e.code));
        ws.addEventListener("message", (e) => caixa.push(JSON.parse(e.data)));
        const esperar = (ms) => new Promise((res) => setTimeout(res, ms));
        const ultimoErro = () => caixa.filter((m) => m.tipo === "erro").at(-1)?.motivo;
        // espera a RESPOSTA chegar (o navegador de teste é lento: uma espera fixa dava falso alarme)
        const enviar = async (x) => { const antes = caixa.length; ws.send(typeof x === "string" ? x : JSON.stringify(x)); const t0 = performance.now(); while (caixa.length === antes && performance.now() - t0 < 1500) await esperar(20); await esperar(100); };
        const s = {};
        await enviar({ tipo: "colocar_token", id: 1, col: 1, row: 1 });                          s.antesDeEntrar = ultimoErro();
        await enviar({ tipo: "entrar", apelido: "  <b>Hacker</b>\u0007\u0000 com apelido compridissimo demais  " });
        s.apelido = caixa.find((m) => m.tipo === "estado_inicial")?.voce.apelido;
        await enviar("isto não é json {{{");                                  s.jsonQuebrado = ultimoErro();
        await enviar({ tipo: "apagar_tudo" });                                s.tipoDesconhecido = ultimoErro();
        await enviar({ tipo: "colocar_token", id: 1, col: 999, row: -5 });    s.posicaoAbsurda = ultimoErro();
        await enviar({ tipo: "colocar_token", id: 1, col: 1.5, row: 2 });     s.posicaoDecimal = ultimoErro();
        await enviar({ tipo: "colocar_token", id: 999999, col: 1, row: 1 });  s.tokenInexistente = ultimoErro();
        await enviar({ tipo: "colocar_token", id: "1", col: 1, row: 1 });     s.idTexto = ultimoErro();
        await enviar({ tipo: "rolar_dados", lados: 20, quantidade: 9999999, modificador: 0 }); s.dadosGigantes = ultimoErro();
        await enviar({ tipo: "rolar_dados", lados: 7, quantidade: 1, modificador: 0 });        s.ladosInexistente = ultimoErro();
        await enviar({ tipo: "rolar_dados", lados: 20, quantidade: 1, modificador: 1e9 });     s.modificadorGigante = ultimoErro();
        await enviar({ tipo: "enviar_mensagem", texto: "x".repeat(100) });                      s.mensagemLonga = ultimoErro();
        await enviar({ tipo: "enviar_mensagem", texto: "   " });                                s.mensagemVazia = ultimoErro();
        await enviar({ tipo: "enviar_mensagem", texto: "<img src=x onerror=alert(1)>" });       s.html = caixa.filter((m) => m.tipo === "mensagem").at(-1)?.mensagem.texto;
        await enviar({ tipo: "entrar", apelido: "outra vez" });                                 s.entrarDeNovo = ultimoErro();
        await enviar("x".repeat(5000));                                                         // maior que o limite do servidor
        await esperar(300); s.codigoAoEnviarGrande = fechou;
        return s;
    });
    ok("7a) pedido antes de se apresentar é recusado", /Apresente-se/.test(r.antesDeEntrar), r.antesDeEntrar);
    ok("7b) apelido malicioso é limpo (sem caracteres de controle, no máximo 20)", !!r.apelido && r.apelido.length <= 20 && !/[\u0000-\u001f]/.test(r.apelido), JSON.stringify(r.apelido));
    ok("7c) JSON quebrado, tipo desconhecido, id em texto e número decimal são recusados", [r.jsonQuebrado, r.tipoDesconhecido, r.idTexto, r.posicaoDecimal].every((x) => /inválido/i.test(x ?? "")));
    ok("7d) posição absurda e token inexistente são recusados", /Posição inválida/.test(r.posicaoAbsurda) && /não existe/.test(r.tokenInexistente), JSON.stringify([r.posicaoAbsurda, r.tokenInexistente]));
    ok("7e) dados gigantes, dado inexistente e modificador gigante são recusados", [r.dadosGigantes, r.ladosInexistente, r.modificadorGigante].every((x) => /Rolagem inválida|inválido/i.test(x ?? "")));
    ok("7f) mensagem longa e mensagem vazia são recusadas", /longa|vazia/.test(r.mensagemLonga) && /longa|vazia/.test(r.mensagemVazia));
    ok("7g) HTML no chat passa como TEXTO puro", r.html === "<img src=x onerror=alert(1)>");
    ok("7h) 'entrar' duas vezes é recusado", /já entrou/.test(r.entrarDeNovo));
    ok("7i) mensagem maior que o limite fecha a conexão (código 1009)", r.codigoAoEnviarGrande === 1009, String(r.codigoAoEnviarGrande));
    ok("7j) NADA disso mexeu no estado: o token 1 continua em (5,2)", JSON.stringify(await tokenDe(A, 1)) === JSON.stringify({ col: 5, row: 2, guardado: false }));
    ok("7k) nenhuma rolagem de 9999999 dados virou cartão no chat", !(await cartoes(A)).some((c) => c.formula?.startsWith("9999999")));
    await M.context().close();

    // ================= 8) limite de frequência
    const R = await abrir("");
    const spam = await R.evaluate(async () => {
        const ws = new WebSocket("ws://127.0.0.1:5173/ws"); let fechou = null, aceitas = 0;
        await new Promise((res) => ws.addEventListener("open", res));
        ws.addEventListener("close", (e) => (fechou = e.code)); ws.addEventListener("message", (e) => { if (JSON.parse(e.data).tipo === "mensagem") aceitas++; });
        ws.send(JSON.stringify({ tipo: "entrar", apelido: "Spam" })); await new Promise((res) => setTimeout(res, 300));
        for (let i = 0; i < 300; i++) ws.send(JSON.stringify({ tipo: "enviar_mensagem", texto: "spam " + i }));
        await new Promise((res) => setTimeout(res, 800));
        return { fechou, aceitas };
    });
    ok("8) 300 mensagens em rajada: o excesso é ignorado (no máximo 40 aceitas) e quem insiste é desconectado (1008)", spam.aceitas <= 41 && spam.fechou === 1008, JSON.stringify(spam));
    await R.context().close();

    // ================= 9) origem e caminho da conexão (de FORA do navegador, com cabeçalhos escolhidos)
    const tentar = (url, opcoes) => new Promise((resolver) => { const ws = new WebSocket(url, opcoes); ws.on("open", () => { ws.close(); resolver("abriu"); }); ws.on("unexpected-response", (_q, res) => resolver("recusado " + res.statusCode)); ws.on("error", () => resolver("recusado")); });
    ok("9a) conexão com Origin de OUTRO site é recusada", /recusado/.test(await tentar(`ws://127.0.0.1:${PORTA}/ws`, { origin: "http://site-malicioso.example" })));
    ok("9b) um programa que não é navegador (sem Origin) é aceito", (await tentar(`ws://127.0.0.1:${PORTA}/ws`)) === "abriu");
    ok("9c) só o caminho /ws aceita conexão", /recusado/.test(await tentar(`ws://127.0.0.1:${PORTA}/outro`)));

    // ================= 10) arquivos: nada fora da pasta do site, e só leitura
    const pedir = (caminho, metodo = "GET") => new Promise((resolver) => { const q = http.request({ host: "127.0.0.1", port: PORTA, path: caminho, method: metodo }, (res) => { let d = ""; res.on("data", (x) => (d += x)); res.on("end", () => resolver({ status: res.statusCode, corpo: d.slice(0, 80) })); }); q.end(); });
    for (const caminho of ["/..%2f..%2f..%2fetc/passwd", "//etc/passwd", "/../../etc/passwd", "/index.html%00.png"]) {
        const resposta = await pedir(caminho);
        ok(`10a) o caminho ${caminho} não vaza arquivo (400/403/404, sem 'root:')`, [400, 403, 404].includes(resposta.status) && !/root:/.test(resposta.corpo), "status " + resposta.status);
    }
    ok("10b) POST no site é recusado (405)", (await pedir("/", "POST")).status === 405);

    // ================= 11) depois de tudo, o servidor segue de pé
    await A.fill("#chat-texto", "ainda funciona"); await A.keyboard.press("Enter"); await B.waitForTimeout(400);
    ok("11) depois dos ataques o servidor segue funcionando (Ana escreve, Beto recebe)", (await cartoes(B))[0]?.texto === "ainda funciona");
    ok("11b) o servidor não registrou nenhum erro inesperado", !/Erro ao tratar|Error:/.test(saidaDoServidor), saidaDoServidor.split("\n").filter((l) => /Erro/.test(l)).join(" | "));
} finally {
    await navegador.close();
    servidor.kill();
}
process.exitCode = terminar(erros);
