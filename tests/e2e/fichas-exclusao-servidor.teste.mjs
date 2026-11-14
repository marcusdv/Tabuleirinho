// Teste e2e: EXCLUIR FICHA NO SERVIDOR. Rodar: npm run test:e2e -- fichas-exclusao-servidor
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor do jogo na porta 3793 com uma pasta de dados TEMPORÁRIA (apagada no fim; o
// `dados/` do projeto não é tocado) e fala com ele por WebSocket puro. Se a porta 3793 estiver ocupada, o teste falha.
//
// `excluir_ficha` apaga o ARQUIVO e avisa todos (`ficha_excluida`); o id NÃO é reaproveitado; excluir o que não existe, ids malformados e
// salvar uma ficha excluída dão erro (e não recriam o arquivo). Salvar e excluir logo em seguida: a fila garante que a ficha não
// "ressuscita". Depois de reiniciar o servidor só sobram as que não foram excluídas.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3793;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-dados-"));
const pasta = join(dados, "fichas");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const jsons = () => readdirSync(pasta).filter((f) => f.endsWith(".json")).sort((a, b) => parseInt(a) - parseInt(b)).join();

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
function cliente(apelido) {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
        const recebidos = [];
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, enviar: (o) => ws.send(JSON.stringify(o)) }); };
    });
}
async function esperarEvento(c, tipo, desde = 0, ms = 2000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { const e = c.recebidos.slice(desde).find((x) => x.tipo === tipo); if (e) return e; await esperar(20); }
    return null;
}
const entrar = async (apelido) => { const c = await cliente(apelido); const ini = await esperarEvento(c, "estado_inicial"); return { c, ini }; };

try {
    let s = await subir();
    const { c: A } = await entrar("Ana"), { c: B } = await entrar("Beto");
    for (let i = 0; i < 3; i++) A.enviar({ tipo: "criar_ficha" });
    await esperar(600);
    ok("0) 3 fichas criadas (arquivos 1, 2, 3)", jsons() === "1.json,2.json,3.json", jsons());

    // ---- excluir a 2
    let na = A.recebidos.length, nb = B.recebidos.length;
    B.enviar({ tipo: "excluir_ficha", id: 2 });
    const ea = await esperarEvento(A, "ficha_excluida", na), eb = await esperarEvento(B, "ficha_excluida", nb);
    ok("1a) ficha_excluida chega nas DUAS conexões, com o id", ea?.id === 2 && eb?.id === 2, JSON.stringify({ ea, eb }));
    ok("1b) o ARQUIVO 2.json some e os outros ficam intactos", jsons() === "1.json,3.json", jsons());
    const { ini: novo } = await entrar("Caio");
    ok("1c) quem entra depois recebe só as fichas 1 e 3", novo.fichas.map((f) => f.id).join() === "1,3", JSON.stringify(novo.fichas.map((f) => f.id)));
    na = A.recebidos.length;
    A.enviar({ tipo: "criar_ficha" });
    const nova = await esperarEvento(A, "ficha_criada", na);
    ok("1d) a próxima ficha tem id 4: o id da excluída NÃO é reaproveitado", nova?.ficha?.id === 4, String(nova?.ficha?.id));

    // ---- recusas
    async function recusa(nome, msg) {
        const antes = jsons(), k = A.recebidos.length;
        A.enviar(msg);
        const e = await esperarEvento(A, "erro", k, 800);
        await esperar(150);
        ok(nome, !!e && jsons() === antes && !A.recebidos.slice(k).some((x) => x.tipo === "ficha_excluida"), JSON.stringify(e));
    }
    await recusa("2a) excluir de novo uma ficha que já não existe dá erro", { tipo: "excluir_ficha", id: 2 });
    await recusa("2b) excluir uma ficha que nunca existiu dá erro", { tipo: "excluir_ficha", id: 999 });
    await recusa("2c) id em texto é recusado", { tipo: "excluir_ficha", id: "1" });
    await recusa("2d) id fora dos inteiros seguros é recusado", { tipo: "excluir_ficha", id: 1e300 });
    await recusa("2e) sem id é recusado", { tipo: "excluir_ficha" });
    await recusa("2f) salvar uma ficha excluída dá 'não existe' e NÃO recria o arquivo", { tipo: "editar_ficha", id: 2, versao: 1, abas: [{ nome: "Página 1", texto: "x" }] });
    ok("2g) o arquivo 2.json continua inexistente", !existsSync(join(pasta, "2.json")));

    // ---- corrida: salvar e excluir logo em seguida (a fila não deixa a ficha ressuscitar)
    na = A.recebidos.length;
    A.enviar({ tipo: "editar_ficha", id: 1, versao: 1, abas: [{ nome: "Página 1", texto: "x".repeat(20000) }] });
    A.enviar({ tipo: "excluir_ficha", id: 1 });
    await esperar(800);
    const { ini: depois } = await entrar("Dani");
    ok("3a) salvar + excluir logo em seguida: a ficha 1 NÃO volta (nem na mesa nem no disco)", !depois.fichas.some((f) => f.id === 1) && !existsSync(join(pasta, "1.json")), `${JSON.stringify(depois.fichas.map((f) => f.id))} / ${jsons()}`);
    ok("3b) a ordem foi respeitada: houve ficha_editada e DEPOIS ficha_excluida", (() => { const tipos = A.recebidos.slice(na).map((x) => x.tipo); return tipos.indexOf("ficha_editada") >= 0 && tipos.indexOf("ficha_excluida") > tipos.indexOf("ficha_editada"); })(), A.recebidos.slice(na).map((x) => x.tipo).join());

    // ---- reiniciar: só sobram as que não foram excluídas
    await esperar(300);
    await desligar(s);
    s = await subir();
    const { ini: reinicio } = await entrar("Eva");
    ok("4a) depois de reiniciar o servidor sobram só as fichas 3 e 4", reinicio.fichas.map((f) => f.id).join() === "3,4", JSON.stringify(reinicio.fichas.map((f) => f.id)));
    {
        const { c: E } = await entrar("Fabi");
        E.enviar({ tipo: "criar_ficha" });
        const e = await esperarEvento(E, "ficha_criada");
        ok("4b) e o próximo id é 5 (o maior que existe + 1)", e?.ficha?.id === 5, String(e?.ficha?.id));
    }
    await desligar(s);
} finally {
    rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar();
