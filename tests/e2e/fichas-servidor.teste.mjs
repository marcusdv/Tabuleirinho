// Teste e2e: FICHAS NO SERVIDOR (arquivos no disco). Rodar: npm run test:e2e -- fichas-servidor
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor do jogo na porta 3790 com uma pasta de dados TEMPORÁRIA (apagada
// no fim; o `dados/` do projeto não é tocado) e fala com ele por WebSocket puro. Se a porta 3790 estiver ocupada, o teste falha.
//
// Um clique em "Criar ficha" (o pedido `criar_ficha`, sem dados) cria NA HORA o arquivo `dados/fichas/<id>.json` (gravação atômica,
// sem sobras `.tmp`), com nome "Ficha N", versão 1 e texto vazio. Campos extras no pedido são descartados, JSON quebrado e mensagem
// grande demais são recusados, há o limite de 200 fichas, e as fichas SOBREVIVEM a reiniciar o servidor (arquivos estragados na
// pasta são ignorados, com aviso).
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3790;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const pastaFichas = join(dados, "fichas");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const jsons = () => readdirSync(pastaFichas).filter((f) => f.endsWith(".json"));

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
async function desligar(s) { s.proc.kill("SIGINT"); await new Promise((r) => s.proc.once("exit", r)); }

function cliente(apelido = "Teste") {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
        const recebidos = [];
        let fechou = null;
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onclose = (e) => (fechou = e.code);
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, codigoDeFechamento: () => fechou }); };
    });
}
async function esperarEvento(c, tipo, desde = 0, ms = 2000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { const e = c.recebidos.slice(desde).find((x) => x.tipo === tipo); if (e) return e; await esperar(20); }
    return null;
}
const criar = (c) => c.ws.send(JSON.stringify({ tipo: "criar_ficha" }));

try {
    // ---- 1) servidor limpo
    let s = await subir();
    ok("0) servidor subiu, criou a pasta de fichas e carregou 0", existsSync(pastaFichas) && s.saida().includes("0 ficha(s), 0 token(s) e 0 grupo(s)"), s.saida());
    let c = await cliente();
    const inicial = await esperarEvento(c, "estado_inicial");
    ok("1) estado_inicial traz a lista de fichas (vazia)", Array.isArray(inicial?.fichas) && inicial.fichas.length === 0, JSON.stringify(inicial?.fichas));

    // ---- 2) um clique = uma ficha vazia e o ARQUIVO na hora
    let n = c.recebidos.length;
    criar(c);
    const criada = await esperarEvento(c, "ficha_criada", n);
    ok("2a) ficha_criada: id 1, 'Ficha 1', versão 1, texto vazio", criada?.ficha?.id === 1 && criada.ficha.nome === "Ficha 1" && criada.ficha.versao === 1 && criada.ficha.abas[0].texto === "", JSON.stringify(criada));
    ok("2b) o arquivo 1.json JÁ existe no disco e bate com a ficha", existsSync(join(pastaFichas, "1.json")) && JSON.stringify(JSON.parse(readFileSync(join(pastaFichas, "1.json"), "utf8"))) === JSON.stringify(criada.ficha));
    ok("2c) nenhum .tmp sobrou", !readdirSync(pastaFichas).some((f) => f.endsWith(".tmp")), readdirSync(pastaFichas).join(","));
    n = c.recebidos.length;
    criar(c);
    const segunda = await esperarEvento(c, "ficha_criada", n);
    ok("2d) a segunda é 'Ficha 2'", segunda?.ficha?.id === 2 && segunda.ficha.nome === "Ficha 2", JSON.stringify(segunda));

    // ---- 3) pedidos maliciosos: nada é aceito além do clique
    {
        n = c.recebidos.length;
        // campos extras (nome com "../", id e versão forjados) são DESCARTADOS: a ficha é sempre a que o servidor monta
        c.ws.send(JSON.stringify({ tipo: "criar_ficha", nome: "../../etc/passwd", id: 999, versao: 50, texto: "forjado" }));
        const e = await esperarEvento(c, "ficha_criada", n);
        ok("3a) campos extras ignorados: id 3, 'Ficha 3', versão 1, sem texto; arquivo dentro da pasta", e?.ficha?.id === 3 && e.ficha.nome === "Ficha 3" && e.ficha.versao === 1 && e.ficha.abas[0].texto === "" && existsSync(join(pastaFichas, "3.json")) && !existsSync(join(pastaFichas, "999.json")), JSON.stringify(e));
        const k = c.recebidos.length;
        c.ws.send("{criar_ficha");
        const erro = await esperarEvento(c, "erro", k, 800);
        ok("3b) JSON quebrado é recusado e nada é gravado", !!erro && jsons().length === 3, JSON.stringify(erro));
        const grande = await cliente("Grande");
        grande.ws.send(JSON.stringify({ tipo: "criar_ficha", nome: "a".repeat(300000) }));
        await esperar(400);
        ok("3c) mensagem acima de 256 KB derruba a conexão (código 1009) e nada é gravado", grande.codigoDeFechamento() === 1009 && jsons().length === 3, String(grande.codigoDeFechamento()));
    }

    // ---- 4) várias de uma vez (a fila): ids únicos, todas gravadas
    {
        const k = c.recebidos.length;
        for (let i = 0; i < 10; i++) criar(c);
        await esperar(900);
        const novas = c.recebidos.slice(k).filter((x) => x.tipo === "ficha_criada").map((x) => x.ficha.id);
        ok("4) 10 cliques seguidos: 10 fichas, ids 4..13 sem repetir, 13 arquivos", novas.join() === "4,5,6,7,8,9,10,11,12,13" && jsons().length === 13, `${novas} / ${jsons().length}`);
    }

    // ---- 5) quem entra depois já recebe as fichas
    {
        const tardio = await cliente("Tardio");
        const ini = await esperarEvento(tardio, "estado_inicial");
        ok("5) quem entra depois recebe as 13 fichas no estado_inicial", ini?.fichas?.length === 13, String(ini?.fichas?.length));
    }

    // ---- 6) o limite de 200 fichas (lotes de 30 por segundo, por causa do limite de mensagens por segundo)
    {
        while (jsons().length < 200) {
            const faltam = 200 - jsons().length;
            for (let i = 0; i < Math.min(30, faltam); i++) criar(c);
            await esperar(1100);
        }
        ok("6a) chegou a 200 fichas e 200 arquivos", jsons().length === 200 && c.codigoDeFechamento() === null, String(jsons().length));
        const k = c.recebidos.length;
        criar(c);
        const erro = await esperarEvento(c, "erro", k, 1500);
        ok("6b) a ficha 201 é recusada, com o motivo, e nenhum arquivo novo", !!erro && /200/.test(erro.motivo) && jsons().length === 200, JSON.stringify(erro));
    }

    // ---- 7) reiniciar o servidor com arquivos estragados na pasta: as fichas sobrevivem
    await desligar(s);
    writeFileSync(join(pastaFichas, "901.json"), JSON.stringify({ id: 901, nome: "", texto: "x", versao: 1, criadaEm: 1, alteradaEm: 1 })); // nome vazio
    writeFileSync(join(pastaFichas, "902.json"), "{ isto não é json");
    writeFileSync(join(pastaFichas, "903.json"), JSON.stringify({ id: 5, nome: "Id errado", texto: "x", versao: 1, criadaEm: 1, alteradaEm: 1 })); // id diferente do nome
    writeFileSync(join(pastaFichas, "abc.json"), "{}"); // nome fora do padrão (ignorado em silêncio)
    writeFileSync(join(pastaFichas, "1.json.lixo.tmp"), "pela metade"); // sobra de gravação interrompida
    rmSync(join(pastaFichas, "200.json")); // alguém apagou uma ficha à mão
    s = await subir();
    ok("7a) ao religar: 199 carregadas e 3 arquivos estragados avisados", s.saida().includes("199 ficha(s), 0 token(s) e 0 grupo(s)") && (s.saida().match(/Item ignorado \(fichas\//g) ?? []).length === 3, s.saida().split("\n").slice(0, 6).join(" | "));
    ok("7b) o .tmp de sobra foi apagado", !existsSync(join(pastaFichas, "1.json.lixo.tmp")));
    c = await cliente("Depois");
    const ini2 = await esperarEvento(c, "estado_inicial");
    ok("7c) as fichas sobreviveram ao reinício (199, na ordem)", ini2?.fichas?.length === 199 && ini2.fichas[0].id === 1 && ini2.fichas.at(-1).id === 199, String(ini2?.fichas?.length));
    {
        const k = c.recebidos.length;
        criar(c);
        const e = await esperarEvento(c, "ficha_criada", k);
        // (o servidor RESERVA também os ids dos arquivos ignorados — 901 e 903 — para nunca sobrescrever um arquivo que o dono esteja consertando: o próximo é 904)
        ok("7d) a próxima ficha tem id 904 (acima de TODOS os ids de arquivo, até dos ignorados) e o arquivo é criado", e?.ficha?.id === 904 && existsSync(join(pastaFichas, "904.json")), JSON.stringify(e?.ficha?.id));
    }
    await desligar(s);
} finally {
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar();
