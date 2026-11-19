// Teste e2e: A ABA "MAPAS" DA BOLSA, ONLINE, no navegador (dois navegadores: o MESTRE, e o outro que também enxerga as mudanças). Rodar: npm run test:e2e -- mapas-online
// (precisa do Vite: npm run dev, com o proxy de /mapas do vite.config.ts; este teste sobe o PRÓPRIO servidor do jogo na porta 3737, com uma pasta de dados TEMPORÁRIA, e o desliga no fim: se a porta estiver
// ocupada, desligue o servidor que estiver nela antes. O `dados/` do projeto não é tocado.)
//
// Pelo Vite todas as conexões chegam ao servidor como "do próprio computador", então TODAS aparecem como mestre aqui. A visão do JOGADOR (sem os botões) e a recusa a quem não é o mestre são testadas no
// `mapas-servidor` (que conecta pelo endereço de rede da máquina).
// Confere: a aba lista os mapas de exemplo com o selo "Atual"; a imagem se baixa; "Usar" troca o mapa e o tamanho do tabuleiro para todos; "+ Enviar mapa" manda o arquivo ao servidor; um SVG disfarçado de .png é
// recusado com o motivo; "Excluir" pergunta antes e, se era o mapa atual, a mesa fica sem mapa; e o outro navegador acompanha tudo.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirPagina, lancar, ok, terminar, exigirPortaLivre } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = Number(process.env.PORTA_TESTE ?? 3737); // a mesma de PORTA_SERVIDOR em src/config.ts (o Vite repassa /ws e /mapas para ela)
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-mapas-ui-"));
const png = readFileSync(join(RAIZ, "public/images/maps/acampamento.png"));

await exigirPortaLivre(PORTA); // (a porta 3737 em uso = o servidor do dono: não roda)
const servidor = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados, SEM_EXEMPLOS: "0" } }); // (SEM_EXEMPLOS: "0": os outros testes o desligam, mas este precisa dos mapas de exemplo)
let saida = "";
servidor.stdout.on("data", (d) => (saida += d));
servidor.stderr.on("data", (d) => (saida += d));
for (let i = 0; i < 200 && !saida.includes("escutando") && !saida.includes("já está em uso"); i++) await new Promise((r) => setTimeout(r, 50));
const desligar = () => new Promise((r) => { servidor.once("exit", r); servidor.kill("SIGINT"); });

const nav = await lancar();
const erros = [];
async function abrir(nome) {
    const p = await (await nav.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    p.on("pageerror", (e) => erros.push(nome + ": " + String(e)));
    await abrirPagina(p, `?online&nome=${nome}&papel=mestre`, { visaoAjustada: true, tamanhoDoApp: true });
    await p.waitForFunction(() => window.__tabuleirinho.rede?.ativa === true, null, { timeout: 15000 });
    await p.waitForTimeout(1500);
    return p;
}
const estadoDe = (p) => p.evaluate(() => { const e = window.__tabuleirinho.estado; return { mestre: e.mestre, mapas: e.mapas.map((m) => m.nome), mapaId: e.mapaId, url: e.mapa?.url ?? null, colunas: e.colunas, linhas: e.linhas }; });
const aguardar = async (p, funcao, argumento, ms = 8000) => p.waitForFunction(funcao, argumento, { timeout: ms }).then(() => true, () => false);

try {
    ok("0) o servidor subiu e criou os mapas de exemplo", /Mapas de exemplo criados \(3\)/.test(saida), saida.split("\n").slice(0, 4).join(" | "));
    const A = await abrir("Mestre");
    const B = await abrir("Beto");
    let e = await estadoDe(A);
    ok("1) online: a biblioteca tem os 3 exemplos e o mapa atual é a Caverna (endereço /mapas/<id>)", e.mapas.length === 3 && e.mapas.includes("Caverna") && /^\/mapas\/[0-9a-f]{16}$/.test(e.url ?? ""), JSON.stringify(e));

    // --- cada mapa guarda os seus tokens: uma peça colocada na Caverna NÃO viaja para o Lago
    const pecasA = (p) => p.evaluate(() => window.__tabuleirinho.estado.tokens.filter((t) => t.copiaDe !== null).map((t) => ({ id: t.id, mapa: t.mapa, col: t.col })));
    const visiveis = (p) => p.evaluate(() => window.__tabuleirinho.estado.tokens.filter((t) => t.copiaDe !== null && t.mapa === window.__tabuleirinho.estado.mapaId).length);
    await A.evaluate(() => window.__tabuleirinho.rede.enviar({ tipo: "criar_token", cor: 0x2ecc71, tamanho: 1, nome: "Viajante", imagem: null, corBorda: 0xffffff, ficha: null }));
    await aguardar(A, () => window.__tabuleirinho.estado.tokens.some((t) => t.nome === "Viajante"));
    const idModelo = await A.evaluate(() => window.__tabuleirinho.estado.tokens.find((t) => t.nome === "Viajante").id);
    await A.evaluate((m) => window.__tabuleirinho.rede.enviar({ tipo: "colocar_modelo", modelo: m, col: 22, row: 18 }), idModelo);
    await aguardar(A, () => window.__tabuleirinho.estado.tokens.some((t) => t.copiaDe !== null));
    const caverna = e.mapaId;
    const p0 = await pecasA(A);
    ok("1b) a peça nasce com o id do mapa em que foi colocada (Caverna)", p0.length === 1 && p0[0].mapa === caverna, JSON.stringify(p0));
    await A.click("#bolsa-aba-mapas");
    await A.waitForTimeout(300);
    ok("2a) a aba Mapas lista os 3 mapas e marca só a Caverna como 'Atual'", (await A.locator(".bolsa-mapa").count()) === 3 && (await A.locator(".bolsa-mapa.atual .bolsa-mapa-nome").textContent()) === "Caverna" && (await A.locator(".bolsa-mapa-selo").count()) === 1);
    ok("2b) a aba esconde o que é de tokens e de fichas; o botão '+ Enviar mapa' aparece para o mestre", (await A.locator("#bolsa-conteudo").isHidden()) && (await A.locator("#bolsa-fichas").isHidden()) && (await A.locator("#bolsa-mapas-enviar").isVisible()));
    const baixou = await A.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, tipo: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength }; }, e.url);
    ok("3) o navegador baixa a imagem do mapa atual pelo Vite (200, image/png)", baixou.status === 200 && baixou.tipo === "image/png" && baixou.bytes > 1000000, JSON.stringify(baixou));

    // --- usar outro mapa. A imagem demora 1,5 s para chegar no OUTRO navegador: até ela chegar, NADA muda lá (o mapa, o tamanho do tabuleiro e o selo "Atual") e aparece "Carregando o mapa…"
    await B.route("**/mapas/*", async (rota) => { await new Promise((r) => setTimeout(r, 1500)); await rota.continue(); });
    const antesB = await estadoDe(B);
    await A.locator(".bolsa-mapa", { hasText: "Lago" }).locator(".bolsa-mapa-usar").click();
    await B.waitForTimeout(600);
    const duranteB = await estadoDe(B);
    ok("4-) ENQUANTO a imagem baixa: o outro navegador mostra 'Carregando o mapa…' e NADA mudou ainda (mapa, tamanho do tabuleiro e selo 'Atual')", duranteB.mapaId === antesB.mapaId && duranteB.colunas === antesB.colunas && duranteB.linhas === antesB.linhas && /Carregando o mapa/.test(await B.locator("#aviso-texto").textContent()) && !(await B.locator("#aviso").isHidden()), JSON.stringify({ antes: [antesB.colunas, antesB.linhas], durante: [duranteB.colunas, duranteB.linhas] }));
    ok("4a) 'Usar' troca o mapa atual (o servidor confirma)", await aguardar(A, (id) => window.__tabuleirinho.estado.mapaId !== id, e.mapaId));
    ok("4b) o OUTRO navegador também passa a ter o mesmo mapa atual (quando a imagem chegou)", await aguardar(B, (id) => window.__tabuleirinho.estado.mapaId === id, (await estadoDe(A)).mapaId));
    await B.unroute("**/mapas/*");
    ok("4b2) quando a imagem chegou, o aviso 'Carregando' some", await aguardar(B, () => document.getElementById("aviso").hidden));
    await A.waitForTimeout(800);
    const depois = await estadoDe(A);
    const doB = await estadoDe(B);
    ok("4c) o tabuleiro ganha o tamanho previsto pela imagem e fica IGUAL nos dois (20 × 14)", depois.colunas === 20 && depois.linhas === 14 && doB.colunas === 20 && doB.linhas === 14, JSON.stringify({ A: [depois.colunas, depois.linhas], B: [doB.colunas, doB.linhas] }));
    ok("4d) o selo 'Atual' foi para o Lago arruinado", (await A.locator(".bolsa-mapa.atual .bolsa-mapa-nome").textContent()) === "Lago arruinado");

    ok("4e) trocando para o Lago a peça da Caverna SOME da cena (nos dois navegadores), mas não é apagada", (await visiveis(A)) === 0 && (await visiveis(B)) === 0 && (await pecasA(A)).length === 1 && (await pecasA(B)).length === 1);
    await A.locator(".bolsa-mapa", { hasText: "Caverna" }).locator(".bolsa-mapa-usar").click();
    await aguardar(A, (id) => window.__tabuleirinho.estado.mapaId === id, caverna);
    await aguardar(B, (id) => window.__tabuleirinho.estado.mapaId === id, caverna);
    await A.waitForTimeout(500);
    ok("4f) voltando à Caverna a peça VOLTA, no mesmo lugar", (await visiveis(A)) === 1 && (await visiveis(B)) === 1 && (await pecasA(A))[0].col === 22);
    // (a peça estava LONGE do canto; o Lago é menor: ela NÃO pode ter sido empurrada para dentro enquanto o outro mapa estava à vista)
    ok("4f2) a posição da peça no mapa antigo continua a mesma (22, 18), mesmo depois de passar por um mapa menor", (await A.evaluate(() => { const p = window.__tabuleirinho.estado.tokens.find((t) => t.copiaDe !== null); return p.col + "," + p.row; })) === "22,18");
    await A.locator(".bolsa-mapa", { hasText: "Lago" }).locator(".bolsa-mapa-usar").click();
    await aguardar(A, (id) => window.__tabuleirinho.estado.mapaId !== id, caverna);
    await A.waitForTimeout(800);
    // (o resto do teste espera o Lago como mapa atual, como antes)

    // --- condição Morto: o servidor grava e, ao recarregar a página, ela continua
    await A.evaluate(() => { const p = window.__tabuleirinho.estado.tokens.find((t) => t.copiaDe !== null); window.__tabuleirinho.rede.enviar({ tipo: "alternar_condicao", id: p.id, condicao: "Morto" }); });
    ok("4g) a condição Morto chega aos DOIS navegadores", (await aguardar(A, () => window.__tabuleirinho.estado.tokens.some((t) => t.condicoes.includes("Morto")))) && (await aguardar(B, () => window.__tabuleirinho.estado.tokens.some((t) => t.condicoes.includes("Morto")))));
    const C = await abrir("Recarregado");
    ok("4h) uma página nova (recarregar) vê a peça no mesmo lugar e AINDA Morta", await C.evaluate(() => { const p = window.__tabuleirinho.estado.tokens.find((t) => t.copiaDe !== null); return !!p && p.col === 22 && p.row === 18 && p.condicoes.includes("Morto"); }));

    // --- enviar um arquivo
    await A.setInputFiles("#bolsa-mapas-arquivo", { name: "meu_novo-mapa.png", mimeType: "image/png", buffer: png });
    ok("5a) '+ Enviar mapa': o arquivo vai ao servidor e entra na biblioteca (4 mapas)", await aguardar(A, () => window.__tabuleirinho.estado.mapas.length === 4));
    ok("5b) o outro navegador recebe a biblioteca nova, e o mapa enviado vira o atual (nome limpo: 'meu novo mapa')", (await aguardar(B, () => window.__tabuleirinho.estado.mapas.length === 4)) && (await aguardar(B, () => window.__tabuleirinho.estado.mapas.some((m) => m.nome === "meu novo mapa"))));
    await A.waitForTimeout(500);
    ok("5c) o mapa enviado é o atual na aba", (await A.locator(".bolsa-mapa.atual .bolsa-mapa-nome").textContent()) === "meu novo mapa");

    // --- recusa
    await A.setInputFiles("#bolsa-mapas-arquivo", { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)></svg>") });
    await A.waitForTimeout(800);
    ok("6) um SVG disfarçado de .png é RECUSADO, o aviso diz o motivo e nada entra na biblioteca", /PNG, JPEG ou WebP/.test(await A.locator("#bolsa-mapas-aviso").textContent()) && (await estadoDe(A)).mapas.length === 4, await A.locator("#bolsa-mapas-aviso").textContent());

    // --- excluir
    await A.locator(".bolsa-mapa", { hasText: "meu novo mapa" }).locator(".bolsa-mapa-excluir").click();
    ok("7a) 'Excluir' pergunta antes ('Excluir mapa?')", (await A.locator("#confirmar-titulo").textContent()) === "Excluir mapa?");
    await A.click("#confirmar-cancelar");
    ok("7b) 'Cancelar' não apaga nada", (await estadoDe(A)).mapas.length === 4);
    await A.locator(".bolsa-mapa", { hasText: "meu novo mapa" }).locator(".bolsa-mapa-excluir").click();
    await A.click("#confirmar-ok");
    ok("7c) confirmado: sai da biblioteca nos DOIS navegadores", (await aguardar(A, () => window.__tabuleirinho.estado.mapas.length === 3)) && (await aguardar(B, () => window.__tabuleirinho.estado.mapas.length === 3)));
    await A.waitForTimeout(500);
    const fim = await estadoDe(B);
    ok("7d) como era o mapa atual, a mesa fica SEM mapa para todos", fim.mapaId === null && fim.url === null, JSON.stringify(fim));

    // --- voltar às outras abas
    await A.click("#bolsa-aba-tokens");
    await A.waitForTimeout(300);
    ok("8) voltando para Tokens, a aba Mapas some e os tokens voltam", (await A.locator("#bolsa-mapas").isHidden()) && (await A.locator("#bolsa-conteudo").isVisible()));
    ok("9) nenhum erro de JavaScript nas páginas", erros.length === 0, erros.join(" | "));
} finally {
    await nav.close().catch(() => undefined);
    await desligar().catch(() => undefined);
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar(erros);
