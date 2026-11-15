// Teste e2e: DANO POR RESULTADO ARRASTADO, no SERVIDOR. Rodar: npm run test:e2e -- arrastar-dano-servidor
// NÃO precisa do Vite nem de navegador: sobe o PRÓPRIO servidor na porta 3797 com uma pasta de dados TEMPORÁRIA e fala com ele por WebSocket puro.
//
// O TOTAL de uma rolagem do chat solto num token tira essa quantidade do status marcado com "Subtraído por números arrastados" (`recebeArrasto`; o HP de fábrica já vem marcado).
// O navegador manda só { token, mensagem }: o SERVIDOR lê o total da mensagem (um total forjado no pedido é descartado), recusa mensagens que não são rolagens, tokens que não estão
// no tabuleiro e tokens sem status marcado, deixa o valor entre 0 e o máximo e avisa todos (valor da peça e frase no chat).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3797;
const pasta = mkdtempSync(join(tmpdir(), "tabuleirinho-arrastar-"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: pasta, SEM_EXEMPLOS: "1", SEM_LIMITE_SPAM: "1" }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((resolver) => servidor.stdout.on("data", (d) => /escutando/.test(String(d)) && resolver()));
async function abrir(apelido) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
    const eventos = [];
    ws.on("message", (d) => eventos.push(JSON.parse(String(d))));
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ tipo: "entrar", apelido }));
    await esperar(300);
    return { ws, eventos, enviar: (o) => ws.send(JSON.stringify(o)) };
}
try {
    const ana = await abrir("Ana");
    const beto = await abrir("Beto");
    ana.enviar({ tipo: "criar_ficha" });
    await esperar(300);
    const ficha = ana.eventos.find((e) => e.tipo === "ficha_criada").ficha;
    ana.enviar({ tipo: "editar_ficha", id: ficha.id, versao: ficha.versao, nome: "Orc", abas: [{ nome: "P", texto: "PV:: 30" }] });
    await esperar(300);
    ana.enviar({ tipo: "criar_token", nome: "Orc", cor: 1, corBorda: 2, tamanho: 1, imagem: null, ficha: ficha.id });
    await esperar(300);
    const modelo = ana.eventos.find((e) => e.tipo === "token_criado").token;
    const inicial = ana.eventos.find((e) => e.tipo === "estado_inicial");
    ok("1) o HP de fábrica já vem marcado com 'Subtraído por números arrastados'", inicial.status[0].recebeArrasto === true);
    ana.enviar({ tipo: "colocar_modelo", modelo: modelo.id, col: 4, row: 4 });
    await esperar(400);
    const peca = ana.eventos.filter((e) => e.tipo === "peca_criada").at(-1).token;
    ok("2) a peça do orc nasce com 30/30", JSON.stringify(peca.valores) === JSON.stringify([{ id: 1, atual: 30, max: 30 }]));

    ana.enviar({ tipo: "rolar_dados", lados: 6, quantidade: 2, modificador: 1 });
    await esperar(300);
    const msg = ana.eventos.filter((e) => e.tipo === "mensagem").at(-1).mensagem;
    const total = msg.rolagem.total;

    let k = beto.eventos.length;
    ana.enviar({ tipo: "arrastar_resultado", token: peca.id, mensagem: msg.id });
    await esperar(500);
    const val = beto.eventos.slice(k).filter((e) => e.tipo === "valores_atualizados").at(-1);
    const frase = beto.eventos.slice(k).filter((e) => e.tipo === "mensagem").at(-1)?.mensagem.texto;
    ok("3) soltar o total do chat no token tira esse valor dele (e o outro jogador vê o mesmo)", val?.id === peca.id && val.valores[0].atual === Math.max(0, 30 - total), JSON.stringify({ total, valores: val?.valores }));
    ok("4) a frase vai ao chat: 'Orc: Dano N (HP 30→X)'", new RegExp(`^Orc: Dano ${total} \\(HP 30→${30 - total}\\)$`).test(frase ?? ""), String(frase));

    const erroDe = async (pedido) => {
        const kk = ana.eventos.length;
        ana.enviar(pedido);
        await esperar(350);
        return ana.eventos.slice(kk).find((e) => e.tipo === "erro")?.motivo ?? null;
    };
    ana.enviar({ tipo: "enviar_mensagem", texto: "oi" });
    await esperar(300);
    const msgTexto = ana.eventos.filter((e) => e.tipo === "mensagem").at(-1).mensagem;
    ok("5) uma mensagem que NÃO é rolagem é recusada", /não é uma rolagem/.test((await erroDe({ tipo: "arrastar_resultado", token: peca.id, mensagem: msgTexto.id })) ?? ""));
    ok("6) uma mensagem que não existe é recusada", /não é uma rolagem/.test((await erroDe({ tipo: "arrastar_resultado", token: peca.id, mensagem: 99999 })) ?? ""));
    ok("7) um token que está na BOLSA (o modelo) é recusado", /não está no tabuleiro/.test((await erroDe({ tipo: "arrastar_resultado", token: modelo.id, mensagem: msg.id })) ?? ""));
    ok("8) um token que não existe é recusado", /não está no tabuleiro/.test((await erroDe({ tipo: "arrastar_resultado", token: 99999, mensagem: msg.id })) ?? ""));

    ana.enviar({ tipo: "definir_status", status: [{ id: 1, nome: "HP", variavel: "PV", cor: 1, mostrar: true, numeros: true, grupos: null }] });
    await esperar(400);
    ok("9) sem nenhum status marcado com 'números arrastados', o pedido é recusado com o motivo", /Subtraído por números arrastados/.test((await erroDe({ tipo: "arrastar_resultado", token: peca.id, mensagem: msg.id })) ?? ""));

    ana.enviar({ tipo: "definir_status", status: [{ id: 1, nome: "HP", variavel: "PV", cor: 1, mostrar: true, numeros: true, grupos: null, recebeArrasto: true }] });
    await esperar(400);
    const antes = beto.eventos.filter((e) => e.tipo === "valores_atualizados").at(-1)?.valores?.[0]?.atual ?? 30 - total;
    k = beto.eventos.length;
    ana.enviar({ tipo: "arrastar_resultado", token: peca.id, mensagem: msg.id, total: 9999, valor: 9999 }); // (campos extras: o número forjado é descartado)
    await esperar(450);
    const v2 = beto.eventos.slice(k).filter((e) => e.tipo === "valores_atualizados").at(-1);
    ok("10) um 'total' forjado no pedido é DESCARTADO: vale o total da mensagem", v2?.valores?.[0]?.atual === Math.max(0, antes - total), JSON.stringify({ antes, total, depois: v2?.valores?.[0]?.atual }));

    ana.enviar({ tipo: "rolar_dados", lados: 1000, quantidade: 99, modificador: 99 });
    await esperar(300);
    const grande = ana.eventos.filter((e) => e.tipo === "mensagem").at(-1).mensagem;
    k = beto.eventos.length;
    ana.enviar({ tipo: "arrastar_resultado", token: peca.id, mensagem: grande.id });
    await esperar(450);
    const v3 = beto.eventos.slice(k).filter((e) => e.tipo === "valores_atualizados").at(-1);
    ok("11) um dano maior que a vida deixa o valor em 0 (nunca negativo)", v3?.valores?.[0]?.atual === 0, JSON.stringify(v3?.valores));
    ana.ws.close();
    beto.ws.close();
} finally {
    servidor.kill("SIGINT");
    await esperar(500);
    rmSync(pasta, { recursive: true, force: true });
}
process.exitCode = terminar();
