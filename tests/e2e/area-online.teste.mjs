// Teste: ÁREAS DE EFEITO no modo online, direto no SERVIDOR (clientes WebSocket, sem navegador; sobe um servidor próprio na porta 3797, não precisa do Vite).
// Confere: a PRÉVIA ao vivo chega aos outros (e não volta a quem mandou), o "sumiu" (null), o limite de frequência, a recusa do que é inválido, a área FIXADA (um desenho) compartilhada e gravada em
// `dados/desenhos.json`, e quem pode apagar (o mestre apaga todas; o jogador, só as próprias). Rodar: npm run test:e2e -- area-online
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { RAJADA_PINGS } from "../../src/config.ts";
import { ok } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3797;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-area-"));
const ambiente = { ...process.env, PORT: String(PORTA), DADOS: dados };
delete ambiente.SEM_LIMITE_SPAM;
const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: ambiente });
let saida = "";
proc.stdout.on("data", (x) => (saida += x));
proc.stderr.on("data", (x) => (saida += x));
await new Promise((res) => { const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); res(); } }, 30); });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
function cliente(papel, apelido) {
    return new Promise((resolver) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws?papel=${papel}`);
        const recebidos = [];
        ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
        ws.onopen = () => { ws.send(JSON.stringify({ tipo: "entrar", apelido })); resolver({ ws, recebidos, enviar: (o) => ws.send(JSON.stringify(o)) }); };
    });
}
const deTipo = (cli, de, tipo, filtro = () => true) => cli.recebidos.slice(de).filter((e) => e.tipo === tipo && filtro(e));
const COR = 0x42a5f5;
const esfera = { forma: "circulo", x: 10.5, y: 8.5, angulo: 0, casas: 4, bloco: 1 };
let codigo = 0;
try {
    const mestre = await cliente("mestre", "Ana");
    const jogador = await cliente("jogador", "Beto");
    await esperar(400);

    // ----- a prévia ao vivo
    let m = mestre.recebidos.length, j = jogador.recebidos.length;
    mestre.enviar({ tipo: "area_previa", area: esfera, cor: COR });
    await esperar(250);
    const previa = deTipo(jogador, j, "area_previa");
    ok("1) o outro jogador recebe a prévia (com o nome, a área e a cor de quem a posiciona)", previa.length === 1 && previa[0].apelido === "Ana" && previa[0].area?.forma === "circulo" && previa[0].area?.casas === 4 && previa[0].cor === COR, JSON.stringify(previa));
    ok("2) quem posiciona NÃO recebe a própria prévia de volta", deTipo(mestre, m, "area_previa").length === 0);

    j = jogador.recebidos.length;
    mestre.enviar({ tipo: "area_previa", area: null, cor: COR });
    await esperar(250);
    ok("3) 'sumiu' (null) chega ao outro: a prévia some da tela dele", deTipo(jogador, j, "area_previa").length === 1 && deTipo(jogador, j, "area_previa")[0].area === null);

    // ----- limite de frequência: uma rajada de 30 prévias seguidas não chega inteira
    await esperar(80);
    j = jogador.recebidos.length;
    for (let i = 0; i < 30; i++) mestre.enviar({ tipo: "area_previa", area: { ...esfera, x: 10.5 + i * 0.5 }, cor: COR });
    await esperar(400);
    const chegaram = deTipo(jogador, j, "area_previa").length;
    ok("4) uma rajada de 30 prévias é limitada (chegam bem menos que 30, mas pelo menos 1)", chegaram >= 1 && chegaram < 30, `chegaram ${chegaram}`);

    // ----- o que é inválido não passa
    await esperar(100);
    j = jogador.recebidos.length;
    m = mestre.recebidos.length;
    mestre.enviar({ tipo: "area_previa", area: { ...esfera, casas: 999 }, cor: COR });
    await esperar(80);
    mestre.enviar({ tipo: "area_previa", area: { ...esfera, forma: "piramide" }, cor: COR });
    await esperar(80);
    mestre.enviar({ tipo: "area_previa", area: { ...esfera, x: "dez" }, cor: COR });
    await esperar(250);
    ok("5) prévias inválidas (tamanho demais, forma desconhecida, número que não é número) são recusadas: nada chega ao outro", deTipo(jogador, j, "area_previa").length === 0);

    // ----- a área FIXADA é um desenho compartilhado
    m = mestre.recebidos.length; j = jogador.recebidos.length;
    mestre.enviar({ tipo: "desenhar", desenho: { tipo: "area", cor: COR, ...esfera }, ref: "a1" });
    await esperar(300);
    const criadaM = deTipo(mestre, m, "desenho_criado")[0], criadaJ = deTipo(jogador, j, "desenho_criado")[0];
    ok("6) a área fixada chega aos dois como um desenho do tipo 'area', com id e autor", criadaM?.desenho.tipo === "area" && criadaJ?.desenho.tipo === "area" && criadaM.desenho.id === criadaJ.desenho.id && !!criadaJ.desenho.autor, JSON.stringify(criadaJ));
    ok("7) ... com os mesmos parâmetros (forma, origem, tamanho)", criadaJ?.desenho.forma === "circulo" && criadaJ.desenho.x === 10.5 && criadaJ.desenho.casas === 4);
    j = jogador.recebidos.length;
    mestre.enviar({ tipo: "desenhar", desenho: { tipo: "area", cor: COR, ...esfera, casas: 500 } });
    await esperar(250);
    ok("8) uma área inválida mandada como desenho não é criada", deTipo(jogador, j, "desenho_criado").length === 0);

    // ----- gravada em disco (a gravação espera uns 600 ms)
    await esperar(1000);
    const arquivo = join(dados, "desenhos.json");
    const gravado = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : null;
    const todos = gravado ? Object.values(gravado.mapas).flat() : [];
    ok("9) a área fica gravada em dados/desenhos.json", todos.some((d) => d.tipo === "area" && d.forma === "circulo" && d.casas === 4), JSON.stringify(todos));

    // ----- quem pode apagar
    const idDoMestre = criadaJ.desenho.id;
    j = jogador.recebidos.length; m = mestre.recebidos.length;
    jogador.enviar({ tipo: "apagar_desenhos", ids: [idDoMestre] });
    await esperar(300);
    ok("10) o JOGADOR não apaga a área do mestre (ela continua; ele recebe um aviso)", deTipo(mestre, m, "desenhos_apagados").length === 0 && deTipo(jogador, j, "erro").length >= 1);
    m = mestre.recebidos.length;
    mestre.enviar({ tipo: "apagar_desenhos", ids: [idDoMestre] });
    await esperar(300);
    ok("11) o MESTRE apaga (e os dois recebem o aviso de apagada)", deTipo(mestre, m, "desenhos_apagados").length === 1 && deTipo(jogador, jogador.recebidos.length - 5, "desenhos_apagados").length >= 1);

    // ----- a EMANAÇÃO de um TOKEN (a aura): o servidor confere, avisa os outros, copia para as peças e grava no arquivo do token
    const mestre2 = await cliente("mestre", "Caio");
    await esperar(300);
    let m2 = mestre2.recebidos.length;
    m = mestre.recebidos.length;
    mestre.enviar({ tipo: "criar_token", nome: "Paladino", cor: 0x2a4a7a, corBorda: 0xffffff, tamanho: 1, imagem: null });
    await esperar(400);
    const idDoToken = deTipo(mestre, m, "token_criado")[0]?.token.id;
    ok("13) o token foi criado (sem emanação por padrão)", typeof idDoToken === "number" && !deTipo(mestre, m, "token_criado")[0].token.emanacao);
    m2 = mestre2.recebidos.length;
    mestre.enviar({ tipo: "editar_token", id: idDoToken, mudancas: { emanacao: { casas: 3, cor: 0xffd54f, alfa: 0.3 } } });
    await esperar(400);
    const editadoPor2 = deTipo(mestre2, m2, "token_editado").at(-1);
    ok("14) editar a emanação avisa os outros com o token inteiro (alcance, cor e transparência)", editadoPor2?.token.emanacao?.casas === 3 && editadoPor2.token.emanacao.cor === 0xffd54f && editadoPor2.token.emanacao.alfa === 0.3, JSON.stringify(editadoPor2?.token.emanacao));
    m2 = mestre2.recebidos.length;
    mestre.enviar({ tipo: "editar_token", id: idDoToken, mudancas: { emanacao: { casas: 9999, cor: 0xffd54f, alfa: 0.3 } } });
    mestre.enviar({ tipo: "editar_token", id: idDoToken, mudancas: { emanacao: { casas: 2, cor: "azul", alfa: 0.3 } } });
    await esperar(400);
    ok("15) uma emanação inválida (alcance demais, cor que não é número) é recusada: nada muda para os outros", deTipo(mestre2, m2, "token_editado").length === 0);
    await esperar(900);
    const arquivoDoToken = join(dados, "tokens", `${idDoToken}.json`);
    const doToken = existsSync(arquivoDoToken) ? JSON.parse(readFileSync(arquivoDoToken, "utf8")) : null;
    ok("16) a emanação fica gravada no arquivo do token (dados/tokens/<id>.json)", doToken?.emanacao?.casas === 3 && doToken.emanacao.alfa === 0.3, JSON.stringify(doToken?.emanacao));
    m = mestre.recebidos.length;
    mestre.enviar({ tipo: "editar_token", id: idDoToken, mudancas: { emanacao: null } });
    await esperar(400);
    ok("17) null desliga a emanação", deTipo(mestre, m, "token_editado").at(-1)?.token.emanacao === null);
    // ----- QUALQUER jogador põe emanação em QUALQUER token do tabuleiro (sem autoridade), mas só isso
    m = mestre.recebidos.length;
    j = jogador.recebidos.length;
    mestre.enviar({ tipo: "colocar_modelo", modelo: idDoToken, col: 2, row: 2 });
    await esperar(500);
    const peca = jogador.recebidos.slice(j).map((e) => e.token).find((t) => t && t.copiaDe === idDoToken);
    ok("19) o jogador vê a peça que o mestre colocou no tabuleiro", !!peca, "peça não chegou");
    j = jogador.recebidos.length;
    m = mestre.recebidos.length;
    jogador.enviar({ tipo: "editar_token", id: peca.id, mudancas: { emanacao: { casas: 4, cor: 0x43a047, alfa: 0.4 } } });
    await esperar(500);
    const noMestre = deTipo(mestre, m, "token_editado").map((e) => e.token);
    ok("20) um JOGADOR (sem nenhuma permissão) põe emanação na peça: o mestre recebe a peça e o modelo com a aura", noMestre.some((t) => t.id === peca.id && t.emanacao?.casas === 4) && noMestre.some((t) => t.id === idDoToken && t.emanacao?.casas === 4), JSON.stringify(noMestre.map((t) => [t.id, t.emanacao?.casas])));
    j = jogador.recebidos.length;
    jogador.enviar({ tipo: "editar_token", id: peca.id, mudancas: { nome: "Trocado" } });
    await esperar(400);
    ok("21) mas o jogador NÃO consegue mudar outra coisa do token (nome): recebe um aviso", deTipo(jogador, j, "erro").length >= 1);
    j = jogador.recebidos.length;
    jogador.enviar({ tipo: "editar_token", id: peca.id, mudancas: { nome: "Trocado", emanacao: null } });
    await esperar(400);
    ok("22) e não dá para esconder uma mudança de nome junto com a emanação", deTipo(jogador, j, "erro").length >= 1 && !deTipo(mestre, mestre.recebidos.length - 6, "token_editado").some((e) => e.token.nome === "Trocado"));
    m = mestre.recebidos.length;
    jogador.enviar({ tipo: "editar_token", id: peca.id, mudancas: { emanacao: null } });
    await esperar(400);
    ok("23) o jogador também TIRA a emanação", deTipo(mestre, m, "token_editado").some((e) => e.token.id === peca.id && e.token.emanacao === null));
    m = mestre.recebidos.length;
    mestre.enviar({ tipo: "criar_token", nome: "SoNaBolsa", cor: 0x333333, corBorda: 0xffffff, tamanho: 1, imagem: null });
    await esperar(400);
    const idDaBolsa = deTipo(mestre, m, "token_criado").at(-1)?.token.id;
    j = jogador.recebidos.length;
    jogador.enviar({ tipo: "editar_token", id: idDaBolsa, mudancas: { emanacao: { casas: 2, cor: 1, alfa: 0.3 } } });
    await esperar(400);
    ok("24) um token que está SÓ NA BOLSA (sem peça no tabuleiro) não aceita a emanação de quem não tem acesso", deTipo(jogador, j, "erro").length >= 1);
    mestre2.ws.close();

    // ----- o LIMITE DE PINGS: o mini delay entre um e outro, a rajada e o aviso a quem insiste
    await esperar(2500); // (o balde da Ana enche de novo)
    j = jogador.recebidos.length;
    m = mestre.recebidos.length;
    for (let i = 0; i < 40; i++) mestre.enviar({ tipo: "ping", col: 5, row: 5, forma: "comum", cor: 0xff0000 });
    await esperar(500);
    ok("25) uma rajada INSTANTÂNEA de 40 pings: só 1 chega (o mini delay entre pings; os outros 39 são ignorados em silêncio)", deTipo(jogador, j, "ping").length === 1 && deTipo(mestre, m, "erro", (e) => /pingando rápido demais/.test(e.motivo)).length === 0, `chegaram ${deTipo(jogador, j, "ping").length}`);
    await esperar(1300); // (a rajada de 40 mensagens estourou a janela de 1 s do limite GERAL de mensagens por conexão: espera ela passar)
    j = jogador.recebidos.length;
    mestre.enviar({ tipo: "ping", col: 6, row: 6, forma: "comum", cor: 0xff0000 });
    await esperar(60);
    mestre.enviar({ tipo: "ping", col: 6, row: 6, forma: "comum", cor: 0xff0000 }); // (60 ms depois: dentro do intervalo mínimo)
    await esperar(300);
    mestre.enviar({ tipo: "ping", col: 6, row: 6, forma: "comum", cor: 0xff0000 }); // (300 ms depois do 1º: passou o intervalo)
    await esperar(300);
    ok(`26) dois pings com 60 ms de distância: o 2º é ignorado; com 300 ms de distância, os dois valem`, deTipo(jogador, j, "ping").length === 2, `chegaram ${deTipo(jogador, j, "ping").length}; erros da Ana: ${JSON.stringify(deTipo(mestre, m, "erro").map((e) => e.motivo))}`);
    // Insistir por 3 s (um ping a cada 25 ms): o ritmo sustentado é limitado (rajada de 3 + 1 a cada 0,5 s) e a pessoa é AVISADA, sem uma enxurrada de avisos.
    await esperar(2500);
    j = jogador.recebidos.length;
    m = mestre.recebidos.length;
    for (let i = 0; i < 120; i++) { mestre.enviar({ tipo: "ping", col: 7, row: 7, forma: "comum", cor: 0xff0000 }); await esperar(25); }
    await esperar(300);
    const pingsQueChegaram = deTipo(jogador, j, "ping").length;
    const calma = deTipo(mestre, m, "erro", (e) => /pingando rápido demais/.test(e.motivo));
    ok(`27) insistindo por 3 s, passam poucos (rajada de ${RAJADA_PINGS} + 1 a cada 0,5 s: entre 6 e 10, e bem menos que os 12 que o intervalo mínimo sozinho deixaria)`, pingsQueChegaram >= 6 && pingsQueChegaram <= 10, `chegaram ${pingsQueChegaram}`);
    ok("28) e quem insiste recebe o aviso 'Calma! Você está pingando rápido demais.' (poucas vezes, não uma enxurrada)", calma.length >= 1 && calma.length <= 3, `avisos: ${calma.length}`);

    // ----- sair da mesa faz a prévia sumir da tela dos outros
    await esperar(100);
    j = jogador.recebidos.length;
    mestre.enviar({ tipo: "area_previa", area: esfera, cor: COR });
    await esperar(250);
    j = jogador.recebidos.length;
    mestre.ws.close();
    await esperar(400);
    const aoSair = deTipo(jogador, j, "area_previa");
    ok("29) quando quem posicionava sai da mesa, a prévia dele some para os outros", aoSair.length === 1 && aoSair[0].area === null, JSON.stringify(aoSair));
    jogador.ws.close();
} catch (falha) {
    console.log("FALHA inesperada:", falha);
    codigo = 1;
} finally {
    proc.kill();
}
process.exit(codigo || (process.exitCode ?? 0));
