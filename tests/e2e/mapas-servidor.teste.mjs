// Teste e2e: A BIBLIOTECA DE MAPAS NO SERVIDOR (arquivos no disco, envio e download pelo HTTP, troca do mapa atual pelo WebSocket). Rodar: npm run test:e2e -- mapas-servidor
// (não precisa do Vite: sobe um servidor temporário na porta 3798, com uma pasta de dados TEMPORÁRIA, e o desliga no fim; o `dados/` do projeto não é tocado.)
//
// Confere: os mapas de EXEMPLO nascem uma vez; o download (tipo certo, nosniff, ids inválidos e "../" recusados); o ENVIO de PNG, JPEG e WebP (tipo e pixels lidos dos bytes); as RECUSAS (SVG, HTML, GIF, vazio,
// imagem "bomba" de 20000 px, arquivo acima de 10 MB, e envio de um site de OUTRA origem); a troca e a exclusão do mapa pelo MESTRE (quem se conecta do próprio computador do servidor); que QUEM NÃO É o computador do
// servidor não envia, não troca e não apaga nada; e que tudo continua depois de reiniciar o servidor.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { request } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3798;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-mapas-"));
const pastaDosMapas = join(dados, "mapas");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const png = readFileSync(join(RAIZ, "public/images/maps/acampamento.png")); // 600 × 417, ~570 KB
const enderecoDeRede = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;

function subir() {
    const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), HOST: "0.0.0.0", DADOS: dados, SEM_LIMITE_SPAM: "1", SEM_EXEMPLOS: "0" } }); // (SEM_EXEMPLOS: "0": os outros testes o desligam, mas este precisa dos mapas de exemplo)
    let saida = "";
    proc.stdout.on("data", (d) => (saida += d));
    proc.stderr.on("data", (d) => (saida += d));
    return new Promise((resolver) => {
        const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); resolver({ proc, saida: () => saida }); } }, 30);
        setTimeout(() => { clearInterval(t); resolver({ proc, saida: () => saida }); }, 10000);
    });
}
const desligar = (s) => { s.proc.kill("SIGINT"); return new Promise((r) => s.proc.once("exit", r)); };

/** Uma requisição HTTP crua (para escolher os cabeçalhos, como Origin e Content-Length). Devolve { status, cabecalhos, corpo }. */
function requisitar(metodo, caminho, corpo = null, cabecalhos = {}, host = "127.0.0.1") {
    // O envio de mapas diz o PAPEL no endereço (obrigatório desde 17/11/2026): mestre no próprio computador, jogador pela rede.
    if (caminho.startsWith("/mapas?")) caminho += `&papel=${host === "127.0.0.1" ? "mestre" : "jogador"}`;
    return new Promise((resolver, rejeitar) => {
        const req = request({ host, port: PORTA, method: metodo, path: caminho, headers: { ...(corpo ? { "content-length": String(corpo.length) } : {}), ...cabecalhos } }, (res) => {
            const partes = [];
            res.on("data", (d) => partes.push(d));
            res.on("end", () => resolver({ status: res.statusCode, cabecalhos: res.headers, corpo: Buffer.concat(partes) }));
        });
        req.on("error", rejeitar);
        if (corpo) req.write(corpo);
        req.end();
    });
}
const json = (r) => { try { return JSON.parse(r.corpo.toString("utf8")); } catch { return null; } };

/** Uma conexão WebSocket que já se apresentou. `eventos` guarda tudo o que o servidor mandou. */
async function conectar(apelido, host = "127.0.0.1") {
    const ws = new WebSocket(`ws://${host}:${PORTA}/ws?papel=${host === "127.0.0.1" ? "mestre" : "jogador"}`);
    const eventos = [];
    ws.on("message", (d) => eventos.push(JSON.parse(String(d))));
    await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
    ws.send(JSON.stringify({ tipo: "entrar", apelido }));
    const inicio = Date.now();
    while (!eventos.some((e) => e.tipo === "estado_inicial") && Date.now() - inicio < 5000) await esperar(30);
    return { ws, eventos, inicial: eventos.find((e) => e.tipo === "estado_inicial"), enviar: (p) => ws.send(JSON.stringify(p)) };
}
const aguardar = async (funcao, ms = 4000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (funcao()) return true; await esperar(40); } return false; };
const ultimo = (c, tipo) => [...c.eventos].reverse().find((e) => e.tipo === tipo);

// ---- imagens montadas à mão (só o CABEÇALHO importa: o servidor lê o tipo e os pixels dos bytes)
const jpeg = (largura, altura) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 255, largura >> 8, largura & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
const webp = (largura, altura) => { const b = Buffer.alloc(30); b.write("RIFF", 0, "latin1"); b.writeUInt32LE(22, 4); b.write("WEBP", 8, "latin1"); b.write("VP8X", 12, "latin1"); b.writeUInt32LE(10, 16); b.writeUIntLE(largura - 1, 24, 3); b.writeUIntLE(altura - 1, 27, 3); return b; };
const pngComTamanho = (l, a) => { const b = Buffer.from(png.subarray(0, 64)); b.writeUInt32BE(l, 16); b.writeUInt32BE(a, 20); return b; };

let s = await subir();
const erros = [];
try {
    // ================= 1) mapas de exemplo
    ok("0) o servidor subiu", s.saida().includes("escutando"), s.saida().split("\n").slice(0, 3).join(" | "));
    ok("1a) os mapas de EXEMPLO foram criados (uma vez)", /Mapas de exemplo criados \(3\)/.test(s.saida()), s.saida().split("\n").slice(0, 6).join(" | "));
    const mestre = await conectar("Mestre");
    ok("1b) o computador do servidor é o MESTRE e recebe a biblioteca (3 mapas) e o mapa atual", mestre.inicial.mestre === true && mestre.inicial.mapas.length === 3 && typeof mestre.inicial.mapa === "string", JSON.stringify({ mestre: mestre.inicial.mestre, n: mestre.inicial.mapas.length, mapa: mestre.inicial.mapa }));
    const caverna = mestre.inicial.mapas.find((m) => /caverna/i.test(m.nome));
    ok("1c) o mapa atual de uma mesa nova é a 'Caverna' (tipo e pixels lidos dos bytes)", caverna && mestre.inicial.mapa === caverna.id && caverna.tipo === "png" && caverna.largura === 2500 && caverna.altura === 2200, JSON.stringify(caverna));
    ok("1d) os arquivos estão em dados/mapas/ com o id gerado como nome", readdirSync(pastaDosMapas).filter((f) => /^[0-9a-f]{16}\.png$/.test(f)).length === 3 && existsSync(join(pastaDosMapas, "indice.json")));

    // ================= 2) download
    const baixado = await requisitar("GET", `/mapas/${caverna.id}`);
    ok("2a) GET /mapas/<id> entrega a imagem com o tipo certo, nosniff e cache", baixado.status === 200 && baixado.cabecalhos["content-type"] === "image/png" && baixado.cabecalhos["x-content-type-options"] === "nosniff" && /immutable/.test(baixado.cabecalhos["cache-control"] ?? "") && baixado.corpo.length === caverna.bytes, `${baixado.status} ${baixado.cabecalhos["content-type"]}`);
    ok("2b) id inexistente, id mal formado e '../' dão 404", (await requisitar("GET", "/mapas/0000000000000000")).status === 404 && (await requisitar("GET", "/mapas/abc")).status !== 200 && (await requisitar("GET", "/mapas/../../etc/passwd")).status !== 200 && (await requisitar("GET", "/mapas/%2e%2e%2f%2e%2e%2fetc%2fpasswd")).status !== 200);
    ok("2c) outros métodos no mesmo endereço são recusados (DELETE, PUT)", (await requisitar("DELETE", `/mapas/${caverna.id}`)).status === 405 && (await requisitar("PUT", `/mapas/${caverna.id}`, Buffer.from("x"))).status === 405);

    // ================= 3) envio válido
    const outro = await conectar("Beto"); // (também na máquina do servidor, então também é mestre: o teste do NÃO-mestre vem mais abaixo)
    const enviado = await requisitar("POST", "/mapas?nome=" + encodeURIComponent("  Meu   mapa\u0007novo  "), png, { "content-type": "image/png" });
    const registro = json(enviado);
    ok("3a) POST /mapas com um PNG: 201 e o registro (nome limpo, pixels certos)", enviado.status === 201 && registro?.tipo === "png" && registro.largura === 600 && registro.altura === 417 && registro.nome === "Meu mapa novo", `${enviado.status} ${JSON.stringify(registro)}`);
    ok("3b) todos os conectados recebem a biblioteca nova (4 mapas)", (await aguardar(() => ultimo(mestre, "mapas_definidos")?.mapas.length === 4)) && (await aguardar(() => ultimo(outro, "mapas_definidos")?.mapas.length === 4)));
    ok("3c) o arquivo novo foi gravado e se baixa", existsSync(join(pastaDosMapas, `${registro.id}.png`)) && (await requisitar("GET", `/mapas/${registro.id}`)).corpo.equals(png));
    const j = json(await requisitar("POST", "/mapas?nome=jpeg", jpeg(300, 200)));
    const w = json(await requisitar("POST", "/mapas?nome=webp", webp(640, 480)));
    ok("3d) JPEG e WebP: o tipo e os pixels vêm dos bytes (300×200 e 640×480)", j?.tipo === "jpeg" && j.largura === 300 && j.altura === 200 && w?.tipo === "webp" && w.largura === 640 && w.altura === 480, JSON.stringify({ j, w }));

    // ================= 4) recusas
    const recusa = async (nome, corpo, statusEsperado, cabecalhos = {}) => {
        const r = await requisitar("POST", "/mapas?nome=x", corpo, cabecalhos);
        return { nome, status: r.status, erro: json(r)?.erro ?? "" , ok: r.status === statusEsperado };
    };
    const casos = [
        await recusa("SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), 400),
        await recusa("HTML", Buffer.from("<html><script>alert(1)</script></html>"), 400),
        await recusa("GIF", Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1"), 400),
        await recusa("vazio", Buffer.alloc(0), 400),
        await recusa("PNG bomba (20000×20000, arquivo de 64 bytes)", pngComTamanho(20000, 20000), 400),
        await recusa("JPEG bomba (9000×9000)", jpeg(9000, 9000), 400),
        await recusa("arquivo acima de 10 MB", Buffer.alloc(11 * 1048576, 1), 413),
    ];
    ok("4a) SVG, HTML, GIF, vazio, 'bombas' de pixels e arquivo acima de 10 MB são RECUSADOS (400/413)", casos.every((c) => c.ok), JSON.stringify(casos.map((c) => `${c.nome}: ${c.status} ${c.erro.slice(0, 45)}`)));
    ok("4b) a mensagem diz o motivo (tipo, pixels e megabytes)", /PNG, JPEG ou WebP/.test(casos[0].erro) && /8192/.test(casos[4].erro) && /10 MB/.test(casos[6].erro));
    const deOutroSite = await requisitar("POST", "/mapas?nome=x", png, { origin: "http://site-malicioso.example" });
    ok("4c) um site de OUTRA ORIGEM não consegue enviar mapa (403)", deOutroSite.status === 403, String(deOutroSite.status));
    ok("4d) nada disso entrou na biblioteca (continuam 6 mapas)", ultimo(mestre, "mapas_definidos").mapas.length === 6, String(ultimo(mestre, "mapas_definidos").mapas.length));

    // ================= 5) o mestre troca o mapa atual
    mestre.enviar({ tipo: "definir_mapa", id: registro.id });
    ok("5a) o mestre troca o mapa: todos recebem 'mapa_definido' com o id", (await aguardar(() => ultimo(mestre, "mapa_definido")?.mapa === registro.id)) && (await aguardar(() => ultimo(outro, "mapa_definido")?.mapa === registro.id)));
    await esperar(400);
    ok("5b) o mapa atual foi guardado em mesa.json", JSON.parse(readFileSync(join(dados, "mesa.json"), "utf8")).mapa === registro.id);
    const antes = outro.eventos.length;
    mestre.enviar({ tipo: "definir_mapa", id: "0123456789abcdef" });
    mestre.enviar({ tipo: "definir_mapa", id: "../../x" });
    await esperar(300);
    ok("5c) trocar para um mapa que não existe (ou um id malformado) é recusado e não muda nada", ultimo(mestre, "erro")?.motivo !== undefined && ultimo(mestre, "mapa_definido").mapa === registro.id && outro.eventos.length === antes, String(ultimo(mestre, "erro")?.motivo));

    // O mapa e o TAMANHO do tabuleiro vão JUNTOS, no mesmo evento (cada navegador baixa a imagem e só então troca os dois de uma vez)
    mestre.enviar({ tipo: "definir_mapa", id: caverna.id, colunas: 30, linhas: 20 });
    ok("5d) 'definir_mapa': o evento leva o mapa E o tamanho juntos, para todos (a caverna já tinha o tamanho guardado 25×22, que VENCE a previsão 30×20 do pedido)", (await aguardar(() => { const e = ultimo(mestre, "mapa_definido"); return e?.mapa === caverna.id && e.colunas === 25 && e.linhas === 22; })) && (await aguardar(() => { const e = ultimo(outro, "mapa_definido"); return e?.mapa === caverna.id && e.colunas === 25 && e.linhas === 22; })));
    await esperar(400);
    const mesaComTamanho = JSON.parse(readFileSync(join(dados, "mesa.json"), "utf8"));
    ok("5e) o tamanho do tabuleiro e o mapa ficaram guardados em mesa.json", mesaComTamanho.colunas === 25 && mesaComTamanho.linhas === 22 && mesaComTamanho.mapa === caverna.id, JSON.stringify({ c: mesaComTamanho.colunas, l: mesaComTamanho.linhas }));
    mestre.enviar({ tipo: "definir_mapa", id: registro.id, colunas: 30 }); // (só a coluna: o pedido é malformado)
    await esperar(300);
    ok("5f) mapa com SÓ uma das duas medidas (colunas sem linhas) é recusado como pedido inválido", ultimo(mestre, "mapa_definido").mapa === caverna.id && /inválido/i.test(ultimo(mestre, "erro")?.motivo ?? ""), String(ultimo(mestre, "erro")?.motivo));
    mestre.enviar({ tipo: "definir_mapa", id: registro.id }); // (volta ao mapa enviado, sem mexer no tamanho)
    await aguardar(() => ultimo(mestre, "mapa_definido")?.mapa === registro.id);

    // ================= 6) QUEM NÃO É o computador do servidor (pelo endereço de rede): não envia, não troca, não apaga
    if (enderecoDeRede === null) {
        ok("6) (pulado: esta máquina não tem endereço de rede para simular um não-mestre)", true);
    } else {
        const jogador = await conectar("Ana", enderecoDeRede);
        ok("6a) pelo endereço de REDE a conexão NÃO é mestre", jogador.inicial.mestre === false && jogador.inicial.mapas.every((m) => m.id !== registro.id) && jogador.inicial.mapa === null, JSON.stringify({ mestre: jogador.inicial.mestre, mapas: jogador.inicial.mapas.length })); // (um mapa ENVIADO nasce só para o mestre: o jogador não o recebe e começa sem mapa)
        const post = await requisitar("POST", "/mapas?nome=x", png, {}, enderecoDeRede);
        ok("6b) o POST de mapa vindo da rede é recusado (403)", post.status === 403 && ultimo(mestre, "mapas_definidos").mapas.length === 6, String(post.status));
        jogador.enviar({ tipo: "definir_mapa", id: caverna.id });
        jogador.enviar({ tipo: "excluir_mapa", id: caverna.id });
        await esperar(400);
        const motivos = jogador.eventos.filter((e) => e.tipo === "erro").map((e) => e.motivo);
        ok("6c) trocar e apagar mapa por quem não é o mestre é recusado, e nada muda", motivos.length === 2 && motivos.every((m) => /mestre/.test(m)) && ultimo(mestre, "mapa_definido").mapa === registro.id && existsSync(join(pastaDosMapas, `${caverna.id}.png`)), JSON.stringify(motivos));
        ok("6d) mesmo sem ser mestre, o jogador BAIXA o mapa atual (a imagem é para todos)", (await requisitar("GET", `/mapas/${registro.id}`, null, {}, enderecoDeRede)).status === 200);
        jogador.ws.close();
    }

    // ================= 7) o mestre apaga
    mestre.enviar({ tipo: "excluir_mapa", id: registro.id }); // o atual!
    ok("7a) apagar o mapa ATUAL: todos recebem 'mapa_definido' null e a biblioteca sem ele", (await aguardar(() => ultimo(outro, "mapa_definido")?.mapa === null)) && (await aguardar(() => ultimo(outro, "mapas_definidos")?.mapas.length === 5 && !ultimo(outro, "mapas_definidos").mapas.some((m) => m.id === registro.id))));
    await esperar(300);
    ok("7b) o arquivo saiu do disco e não se baixa mais (404)", !existsSync(join(pastaDosMapas, `${registro.id}.png`)) && (await requisitar("GET", `/mapas/${registro.id}`)).status === 404);
    mestre.enviar({ tipo: "excluir_mapa", id: registro.id });
    await esperar(200);
    ok("7c) apagar de novo o mesmo mapa dá erro (não existe)", /não existe/.test(ultimo(mestre, "erro")?.motivo ?? ""));
    mestre.enviar({ tipo: "definir_mapa", id: caverna.id });
    await aguardar(() => ultimo(mestre, "mapa_definido")?.mapa === caverna.id);
    await esperar(300);

    // ================= 8) reiniciar o servidor: tudo continua, e os exemplos NÃO voltam
    mestre.ws.close(); outro.ws.close();
    await desligar(s);
    s = await subir();
    const depois = await conectar("Mestre");
    ok("8a) depois de reiniciar a biblioteca continua (5 mapas) e o mapa atual também", depois.inicial.mapas.length === 5 && depois.inicial.mapa === caverna.id, JSON.stringify({ n: depois.inicial.mapas.length, mapa: depois.inicial.mapa }));
    ok("8b) os mapas de exemplo NÃO foram criados de novo", !/Mapas de exemplo criados/.test(s.saida()));
    ok("8c) a imagem de um mapa de antes ainda se baixa", (await requisitar("GET", `/mapas/${caverna.id}`)).status === 200);
    depois.ws.close();
    ok("9) o servidor não registrou nenhum erro inesperado", !/Erro ao tratar|Error:|TypeError/.test(s.saida()), s.saida().split("\n").filter((l) => /Erro|Error/.test(l)).join(" | "));
} finally {
    await desligar(s).catch(() => undefined);
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar(erros);
