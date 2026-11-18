// Teste e2e: o FOG no SERVIDOR (só o mestre edita; os jogadores não recebem peças nem desenhos sob o fog). Rodar: npm run test:e2e -- fog-servidor
// (não precisa do Vite: sobe um servidor temporário na porta 3798, com dados temporários; o `dados/` do projeto não é tocado.)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3798;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-fog-"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados, SEM_LIMITE_SPAM: "1", SEM_EXEMPLOS: "1" } });
let saida = "";
proc.stdout.on("data", (d) => (saida += d));
proc.stderr.on("data", (d) => (saida += d));
await new Promise((r) => { const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); r(); } }, 30); setTimeout(() => { clearInterval(t); r(); }, 10000); });

async function conectar(apelido, papel) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws?papel=${papel}`);
    const eventos = [];
    ws.on("message", (d) => eventos.push(JSON.parse(String(d))));
    await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
    ws.send(JSON.stringify({ tipo: "entrar", apelido }));
    while (!eventos.some((e) => e.tipo === "estado_inicial")) await esperar(30);
    return { ws, eventos, enviar: (p) => ws.send(JSON.stringify(p)) };
}
const pedir = async (c, p, ms = 250) => { const antes = c.eventos.length; c.enviar(p); await esperar(ms); return c.eventos.slice(antes); };
const erros = (r) => r.filter((e) => e.tipo === "erro");
const SEM_FOG_ATE = 0;

try {
    const mestre = await conectar("Mestre", "mestre");
    const caio = await conectar("Caio", "jogador");
    // um mapa novo (enviado), liberado a todos, 20×12, com os jogadores nele
    const resposta = await fetch(`http://127.0.0.1:${PORTA}/mapas?nome=fog&papel=mestre`, { method: "POST", headers: { "content-type": "image/png" }, body: readFileSync(join(RAIZ, "public/images/maps/acampamento.png")) });
    const mapa = await resposta.json();
    await esperar(300);
    await pedir(mestre, { tipo: "definir_mapa", id: mapa.id, colunas: 20, linhas: 12 }, 400);
    await pedir(mestre, { tipo: "definir_quem_ve_mapa", id: mapa.id, todos: true, usuarios: [] }, 300);
    await pedir(mestre, { tipo: "mover_jogadores" }, 400);
    // uma peça do mestre, que o Caio vê (sem fog)
    await pedir(mestre, { tipo: "criar_token", nome: "Lobo", cor: 0x2ecc71, corBorda: 0xffffff, tamanho: 1, imagem: null }, 500);
    const lobo = mestre.eventos.filter((e) => e.tipo === "token_criado").at(-1).token;
    await pedir(mestre, { tipo: "colocar_modelo", modelo: lobo.id, col: 5, row: 5 }, 500);
    const peca = mestre.eventos.filter((e) => e.tipo === "peca_criada").at(-1).token;
    ok("1a) sem fog, o jogador VÊ a peça do mestre", caio.eventos.some((e) => e.tipo === "peca_criada" && e.token.id === peca.id));

    // só o mestre mexe no fog
    let r = await pedir(caio, { tipo: "fog_ativar", mapa: mapa.id, ativo: true }, 250);
    ok("2a) um jogador NÃO liga o fog", erros(r).length === 1, JSON.stringify(r));
    r = await pedir(caio, { tipo: "fog_pintar", tracos: [{ x: 1, y: 1, raio: 2, cobrir: false }] }, 250);
    ok("2b) um jogador NÃO pinta o fog", erros(r).length === 1);
    r = await pedir(caio, { tipo: "fog_preencher", cobrir: false }, 250);
    ok("2c) um jogador NÃO cobre nem revela tudo", erros(r).length === 1);
    r = await pedir(mestre, { tipo: "fog_pintar", tracos: [{ x: 1, y: 1, raio: 2, cobrir: false }] }, 250);
    ok("2d) pintar antes de ligar o fog é recusado (com o motivo)", erros(r).length === 1 && /Ligue o fog/.test(erros(r)[0].motivo));

    // liga o fog (tudo coberto): a peça some para o jogador
    const antes = caio.eventos.length;
    await pedir(mestre, { tipo: "fog_ativar", mapa: mapa.id, ativo: true }, 500);
    const novos = caio.eventos.slice(antes);
    ok("3a) ao ligar o fog o jogador recebe a máscara (20×12)", novos.some((e) => e.tipo === "fog_definido" && e.ativo === true && e.colunas === 20 && e.linhas === 12 && typeof e.bits === "string"));
    ok("3b) ...e a peça, que está sob o fog, SOME para ele (o servidor a manda embora)", novos.some((e) => e.tipo === "token_excluido" && e.id === peca.id));
    ok("3c) o MESTRE continua vendo a peça (nenhum evento a tirou dele)", !mestre.eventos.some((e) => e.tipo === "token_excluido" && e.id === peca.id));

    // mover a peça debaixo do fog: o jogador NÃO recebe a posição
    const antes2 = caio.eventos.length;
    await pedir(mestre, { tipo: "colocar_token", id: peca.id, col: 8, row: 6 }, 400);
    ok("4a) mover a peça sob o fog NÃO manda a posição ao jogador", !caio.eventos.slice(antes2).some((e) => e.tipo === "token_colocado" && e.id === peca.id), JSON.stringify(caio.eventos.slice(antes2).map((e) => e.tipo)));

    // um desenho sob o fog também não chega ao jogador
    const antes3 = caio.eventos.length;
    const rDesenho = await pedir(mestre, { tipo: "desenhar", desenho: { tipo: "elipse", cor: 0xff0000, x: 8, y: 6, largura: 1, altura: 1 } }, 400);
    ok("4a2) o mestre desenha normalmente (o desenho foi criado)", rDesenho.some((e) => e.tipo === "desenho_criado"), JSON.stringify(rDesenho));
    ok("4b) um desenho sob o fog NÃO chega ao jogador", !caio.eventos.slice(antes3).some((e) => e.tipo === "desenho_criado"));

    // revela um círculo em volta da peça: ela aparece e o desenho também
    const antes4 = caio.eventos.length;
    await pedir(mestre, { tipo: "fog_pintar", tracos: [{ x: 8.5, y: 6.5, raio: 3, cobrir: false }] }, 500);
    const apos = caio.eventos.slice(antes4);
    ok("5a) o jogador recebe a PINCELADA (e a aplica na máscara dele)", apos.some((e) => e.tipo === "fog_pintado" && e.tracos.length === 1));
    ok("5b) ao revelar a área, a peça APARECE para ele, já na posição nova (8, 6)", apos.some((e) => e.tipo === "peca_criada" && e.token.id === peca.id && e.token.col === 8 && e.token.row === 6));
    ok("5c) ...e o desenho que estava nela também", apos.some((e) => e.tipo === "desenhos_definidos" && e.desenhos.length === 1));

    // mover para fora da área revelada: some de novo
    const antes5 = caio.eventos.length;
    await pedir(mestre, { tipo: "colocar_token", id: peca.id, col: 17, row: 10 }, 400);
    const ap5 = caio.eventos.slice(antes5);
    ok("6a) mover a peça para o fog: ela some e a posição nova nunca chega", ap5.some((e) => e.tipo === "token_excluido" && e.id === peca.id) && !ap5.some((e) => e.tipo === "token_colocado" && e.id === peca.id));

    // cobrir e revelar tudo
    const antes6 = caio.eventos.length;
    await pedir(mestre, { tipo: "fog_preencher", cobrir: false }, 500);
    ok("7a) 'revelar tudo': a peça volta a aparecer para o jogador", caio.eventos.slice(antes6).some((e) => e.tipo === "peca_criada" && e.token.id === peca.id));
    await pedir(mestre, { tipo: "fog_ativar", mapa: mapa.id, ativo: false }, 400);
    ok("7b) desligar o fog avisa o jogador (ativo: false)", caio.eventos.at(-1).tipo !== undefined && caio.eventos.some((e) => e.tipo === "fog_definido" && e.ativo === false));

    // quem tem acesso ao token continua vendo a peça sob o fog
    await pedir(mestre, { tipo: "fog_ativar", mapa: mapa.id, ativo: true }, 400);
    await pedir(mestre, { tipo: "liberar", item: "tokens", id: lobo.id, usuario: "u_caio", nivel: "leitor" }, 500);
    const ultimaPeca = caio.eventos.filter((e) => (e.tipo === "peca_criada" || e.tipo === "token_excluido") && (e.token?.id ?? e.id) === peca.id).at(-1);
    ok("8) até a peça de um token LIBERADO para o jogador fica escondida sob o fog (pedido do dono)", ultimaPeca?.tipo === "token_excluido");

    // o fog é gravado e sobrevive ao reinício
    await esperar(1500);
    ok("9a) o fog é gravado em dados/fog.json", existsSync(join(dados, "fog.json")) && JSON.parse(readFileSync(join(dados, "fog.json"), "utf8")).mapas?.[mapa.id]?.ativo === true);
    for (const c of [mestre, caio]) c.ws.close();
    ok("0) o servidor não imprimiu erros inesperados", !/Error|Erro ao tratar/.test(saida), saida.slice(-300));
} finally {
    proc.kill("SIGINT");
    await new Promise((r) => proc.once("exit", r));
    if (existsSync(dados)) rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar([]);
