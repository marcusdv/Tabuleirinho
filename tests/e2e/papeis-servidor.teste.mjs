// Teste e2e: OS PAPÉIS E AS PERMISSÕES NO SERVIDOR (mestre × jogador; dono, leitor e editor). Rodar: npm run test:e2e -- papeis-servidor
// (não precisa do Vite: sobe um servidor temporário na porta 3799, com uma pasta de dados TEMPORÁRIA, e o desliga no fim; o `dados/` do projeto não é tocado.)
//
// Confere (decisões do dono de 17/11/2026): o PAPEL é obrigatório no endereço (sem ele a conexão é recusada); só o mestre mexe em tamanho, status, ações, iniciativa e grupos;
// o jogador só VÊ o que é dele ou foi liberado (o servidor nem envia o resto), mas todos veem as PEÇAS do tabuleiro (o modelo delas vai sem ficha); quem cria vira DONO e há o
// limite de 5 por jogador; o LEITOR move e usa o token e lê e rola a ficha, sem editar nem excluir; o EDITOR edita, mas só o DONO e o mestre excluem; o documento
// `permissoes.json` é gravado e lido de novo ao reiniciar.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { ok, terminar } from "./ajuda.mjs";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PORTA = 3799;
const dados = mkdtempSync(join(tmpdir(), "tabuleirinho-papeis-"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function subir() {
    const proc = spawn(process.execPath, ["servidor/servidor.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), DADOS: dados, SEM_LIMITE_SPAM: "1", SEM_EXEMPLOS: "1" } });
    let saida = "";
    proc.stdout.on("data", (d) => (saida += d));
    proc.stderr.on("data", (d) => (saida += d));
    return new Promise((resolver) => {
        const t = setInterval(() => { if (saida.includes("escutando")) { clearInterval(t); resolver({ proc, saida: () => saida }); } }, 30);
        setTimeout(() => { clearInterval(t); resolver({ proc, saida: () => saida }); }, 10000);
    });
}
const desligar = (s) => { s.proc.kill("SIGINT"); return new Promise((r) => s.proc.once("exit", r)); };

/** Uma conexão que já se apresentou. `papel` vai no endereço (o servidor o exige). Se `papel` for null, o endereço não leva nenhum (para testar a recusa). */
async function conectar(apelido, papel) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws${papel ? `?papel=${papel}` : ""}`);
    const eventos = [];
    let fechou = false;
    ws.on("message", (d) => eventos.push(JSON.parse(String(d))));
    ws.on("close", () => (fechou = true));
    await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
    ws.send(JSON.stringify({ tipo: "entrar", apelido }));
    const inicio = Date.now();
    while (!eventos.some((e) => e.tipo === "estado_inicial" || e.tipo === "erro") && Date.now() - inicio < 5000) await esperar(30);
    return { ws, eventos, inicial: eventos.find((e) => e.tipo === "estado_inicial"), enviar: (p) => ws.send(JSON.stringify(p)), fechou: () => fechou };
}
/** Manda um pedido e espera uma pausa; devolve o que chegou DEPOIS (os eventos novos). */
async function pedir(cliente, pedido, ms = 250) {
    const antes = cliente.eventos.length;
    cliente.enviar(pedido);
    await esperar(ms);
    return cliente.eventos.slice(antes);
}
const soMestre = (evs) => evs.some((e) => e.tipo === "erro" && /s[óo] o mestre/i.test(e.motivo));
const erros = (evs) => evs.filter((e) => e.tipo === "erro").map((e) => e.motivo);
const novoToken = (nome) => ({ tipo: "criar_token", nome, cor: 0x336699, corBorda: 0xffffff, tamanho: 1, imagem: null });

let servidor = await subir();
try {
    // ----- 1) o papel é OBRIGATÓRIO
    const semPapel = await conectar("Visitante", null);
    ok("1a) sem papel no endereço a conexão é recusada, com o motivo", !semPapel.inicial && erros(semPapel.eventos).some((m) => /papel/i.test(m)), JSON.stringify(semPapel.eventos));
    await esperar(150);
    ok("1b) ...e a conexão é fechada", semPapel.fechou());

    const mestre = await conectar("Mestre", "mestre");
    const ana = await conectar("Ana", "jogador");
    const beto = await conectar("Beto", "jogador");
    ok("1c) com papel as conexões entram (e o mestre sabe que é mestre; o jogador, não)", !!mestre.inicial && mestre.inicial.mestre === true && ana.inicial?.mestre === false && !!beto.inicial);

    // ----- 2) o mestre cria; o jogador não vê o que não é dele
    let r = await pedir(mestre, novoToken("Dragao"));
    const dragao = r.find((e) => e.tipo === "token_criado")?.token;
    await pedir(mestre, { tipo: "criar_ficha", token: dragao.id });
    const fichaDragao = mestre.eventos.find((e) => e.tipo === "ficha_criada")?.ficha;
    ok("2a) o mestre criou o token 'Dragao' e a ficha dele", !!dragao && !!fichaDragao && fichaDragao.nome === "Dragao");
    ok("2b) a Ana e o Beto NÃO recebem o token nem a ficha do mestre (o servidor nem envia)", !ana.eventos.some((e) => e.tipo === "token_criado" || e.tipo === "ficha_criada") && !beto.eventos.some((e) => e.tipo === "token_criado" || e.tipo === "ficha_criada"));
    const ana2 = await conectar("Ana2", "jogador");
    ok("2c) quem entra depois também não recebe o que é do mestre", !ana2.inicial.tokens.some((t) => t.nome === "Dragao") && ana2.inicial.fichas.length === 0);
    ana2.ws.close();

    // ----- 3) o jogador cria o que é dele: dono, limite de 5
    for (let i = 1; i <= 5; i++) await pedir(ana, novoToken(`Heroi ${i}`), 120);
    const herois = ana.eventos.filter((e) => e.tipo === "token_criado").map((e) => e.token);
    ok("3a) a Ana criou 5 tokens e os recebeu de volta", herois.length === 5);
    ok("3a1) o MESTRE recebe o documento de permissões com a Ana como DONA dos tokens dela (a janela Compartilhar mostra 'Dono', não 'Sem acesso')", herois.every((h) => mestre.eventos.some((e) => e.tipo === "permissoes" && e.permissoes.tokens[String(h.id)]?.dono === "u_ana")));
    ok("3a2) o token que o jogador cria já chega com permissão de DONO (nivel 'dono')", herois.every((h) => h.nivel === "dono"), JSON.stringify(herois.map((h) => h.nivel)));
    r = await pedir(ana, { tipo: "editar_token", id: herois[1].id, mudancas: { nome: "Heroi Renomeado" } });
    ok("3a3) ...e ela edita o PRÓPRIO token na hora (sem o mestre liberar nada)", r.some((e) => e.tipo === "token_editado" && e.token.id === herois[1].id && e.token.nome === "Heroi Renomeado" && e.token.nivel === "dono"), JSON.stringify(r));
    r = await pedir(ana, novoToken("Heroi 6"));
    ok("3b) o 6º é recusado (limite de 5 por jogador), com o motivo", erros(r).some((m) => /limite/i.test(m)) && !r.some((e) => e.tipo === "token_criado"), JSON.stringify(r));
    ok("3c) o mestre VÊ os tokens da Ana; o Beto, não", herois.every((h) => mestre.eventos.some((e) => e.tipo === "token_criado" && e.token.id === h.id)) && !beto.eventos.some((e) => e.tipo === "token_criado"));
    r = await pedir(mestre, novoToken("Goblin"));
    ok("3d) o mestre não tem limite (e cria itens 'do mestre')", mestre.eventos.filter((e) => e.tipo === "token_criado").length >= 2);

    // ----- 4) o jogador não mexe no que não é dele
    r = await pedir(ana, { tipo: "colocar_modelo", modelo: dragao.id, col: 2, row: 2 });
    ok("4a) a Ana não coloca o token do mestre no mapa", erros(r).length === 1 && !r.some((e) => e.tipo === "peca_criada"), JSON.stringify(r));
    r = await pedir(ana, { tipo: "editar_token", id: dragao.id, mudancas: { nome: "Fofinho" } });
    ok("4b) nem edita", erros(r).length === 1);
    r = await pedir(ana, { tipo: "excluir_token", id: dragao.id });
    ok("4c) nem exclui", erros(r).length === 1);
    r = await pedir(ana, { tipo: "colocar_modelo", modelo: herois[0].id, col: 3, row: 3 });
    const pecaDaAna = r.find((e) => e.tipo === "peca_criada")?.token;
    ok("4d) a Ana coloca o PRÓPRIO token no mapa", !!pecaDaAna);
    ok("4e) as PEÇAS do tabuleiro todos veem (o Beto recebeu a peça da Ana)", beto.eventos.some((e) => e.tipo === "peca_criada" && e.token.id === pecaDaAna.id));
    const betoDepois = await conectar("Beto2", "jogador");
    const modeloDaPeca = betoDepois.inicial.tokens.find((t) => t.id === herois[0].id);
    ok("4f) quem entra depois recebe a peça e o modelo dela SEM a ficha (os grupos ficam, porque valem para os status e as ações)", betoDepois.inicial.tokens.some((t) => t.id === pecaDaAna.id) && !!modeloDaPeca && modeloDaPeca.ficha === null && modeloDaPeca.somenteMapa === true);
    betoDepois.ws.close();
    r = await pedir(beto, { tipo: "colocar_token", id: pecaDaAna.id, col: 5, row: 5 });
    ok("4g) o Beto não move a peça da Ana", erros(r).length === 1 && !r.some((e) => e.tipo === "token_colocado"));
    r = await pedir(ana, { tipo: "colocar_token", id: pecaDaAna.id, col: 5, row: 5 });
    ok("4h) a Ana move a própria peça", r.some((e) => e.tipo === "token_colocado" && e.col === 5));
    r = await pedir(beto, { tipo: "alternar_condicao", id: pecaDaAna.id, condicao: "Caido" });
    ok("4i) mas qualquer jogador aplica condição (e dano e cura) em qualquer peça do mapa", r.some((e) => e.tipo === "condicoes_atualizadas"), JSON.stringify(r));

    // ----- 5) só o mestre
    r = await pedir(ana, { tipo: "definir_tamanho", colunas: 30, linhas: 30 });
    ok("5a) o jogador não muda o tamanho do tabuleiro", soMestre(r));
    r = await pedir(ana, { tipo: "definir_status", status: [] });
    ok("5b) nem os status da mesa", soMestre(r));
    r = await pedir(ana, { tipo: "definir_acoes", acoes: [] });
    ok("5c) nem as ações", soMestre(r));
    r = await pedir(ana, { tipo: "criar_grupo", nome: "Meu grupo", cor: 0xff0000 });
    ok("5d) nem cria grupos", soMestre(r));
    r = await pedir(ana, { tipo: "iniciativa", acao: { acao: "resetar" } });
    ok("5e) nem mexe na iniciativa", soMestre(r));
    r = await pedir(ana, { tipo: "definir_grade", espessura: 2, cor: "#ffffff" });
    ok("5f) nem na grade", soMestre(r));
    r = await pedir(mestre, { tipo: "definir_tamanho", colunas: 30, linhas: 25 });
    ok("5g) o mestre faz tudo isso", r.some((e) => e.tipo === "tamanho_definido") && erros(r).length === 0);

    // ----- 6) fichas: a Ana cria a dela (dono), limite e exclusão pelo dono
    r = await pedir(ana, { tipo: "criar_ficha" });
    const fichaDaAna = r.find((e) => e.tipo === "ficha_criada")?.ficha;
    ok("6a) a Ana cria a própria ficha; o Beto não a recebe", !!fichaDaAna && !beto.eventos.some((e) => e.tipo === "ficha_criada"));
    ok("6a2) a ficha que o jogador cria já chega com permissão de DONO (nivel 'dono')", fichaDaAna.nivel === "dono", String(fichaDaAna.nivel));
    r = await pedir(ana, { tipo: "editar_ficha", id: fichaDaAna.id, versao: fichaDaAna.versao, nome: "Ana, a Bruxa" });
    ok("6b) a dona edita a ficha", r.some((e) => e.tipo === "ficha_editada" && e.ficha.nome === "Ana, a Bruxa"));
    r = await pedir(beto, { tipo: "editar_ficha", id: fichaDaAna.id, versao: 2, nome: "hack" });
    ok("6c) o Beto não edita a ficha da Ana", erros(r).length === 1);
    r = await pedir(beto, { tipo: "rolar_ficha", id: fichaDaAna.id, versao: 2, aba: 0, indice: 0 });
    ok("6d) nem rola (sem acesso)", erros(r).length === 1);

    const doc = JSON.parse(readFileSync(join(dados, "permissoes.json"), "utf8"));
    ok("6e) o documento permissoes.json foi gravado com os donos (Ana: 5 tokens e 1 ficha)", Object.values(doc.tokens).filter((t) => t.dono === "u_ana").length === 5 && Object.values(doc.fichas).filter((f) => f.dono === "u_ana").length === 1 && doc.tokens[String(dragao.id)].dono === null, JSON.stringify(doc).slice(0, 300));

    for (const c of [mestre, ana, beto]) c.ws.close();
    await esperar(200);
    await desligar(servidor);

    // ----- 7) LEITOR: o mestre libera (documento editado) e o servidor reinicia
    doc.tokens[String(dragao.id)].acessos = { u_beto: "leitor" };
    doc.fichas[String(fichaDragao.id)].acessos = { u_beto: "leitor" };
    writeFileSync(join(dados, "permissoes.json"), JSON.stringify(doc));
    servidor = await subir();
    const mestre2 = await conectar("Mestre", "mestre");
    const beto2 = await conectar("Beto", "jogador");
    ok("7a) com a liberação, o Beto VÊ o token e a ficha do mestre", beto2.inicial.tokens.some((t) => t.id === dragao.id) && beto2.inicial.fichas.some((f) => f.id === fichaDragao.id));
    r = await pedir(beto2, { tipo: "colocar_modelo", modelo: dragao.id, col: 8, row: 8 });
    const pecaDragao = r.find((e) => e.tipo === "peca_criada")?.token;
    ok("7b) o LEITOR coloca o token no mapa", !!pecaDragao);
    r = await pedir(beto2, { tipo: "colocar_token", id: pecaDragao.id, col: 9, row: 9 });
    ok("7c) ...e o move", r.some((e) => e.tipo === "token_colocado" && e.col === 9));
    r = await pedir(beto2, { tipo: "editar_token", id: dragao.id, mudancas: { nome: "Hack" } });
    ok("7d) mas o leitor NÃO edita o token", erros(r).length === 1);
    r = await pedir(beto2, { tipo: "guardar_token", id: pecaDragao.id });
    ok("7e) nem o guarda na bolsa (é configuração)", erros(r).length === 1);
    r = await pedir(beto2, { tipo: "editar_ficha", id: fichaDragao.id, versao: fichaDragao.versao, nome: "Hack" });
    ok("7f) o leitor não edita a ficha", erros(r).length === 1);
    r = await pedir(beto2, { tipo: "excluir_ficha", id: fichaDragao.id });
    ok("7g) nem exclui", erros(r).length === 1);
    r = await pedir(beto2, { tipo: "rolar_ficha", id: fichaDragao.id, versao: fichaDragao.versao, aba: 0, indice: 0 });
    ok("7h) mas lê e tenta rolar (o único erro é 'essa ficha não tem rolagem', não de permissão)", !erros(r).some((m) => /permiss/i.test(m)), JSON.stringify(r));
    ok("7i) a Ana, sem liberação, não vê o dragão na bolsa (só como modelo de uma peça do mapa, sem segredos)", await conectar("Ana", "jogador").then((c) => { const t = c.inicial.tokens.find((x) => x.id === dragao.id); c.ws.close(); return !t || t.somenteMapa === true; }));

    // ----- 8) EDITOR: edita, mas só o dono e o mestre excluem
    for (const c of [mestre2, beto2]) c.ws.close();
    await esperar(200);
    await desligar(servidor);
    doc.tokens[String(dragao.id)].acessos = { u_beto: "editor" };
    doc.fichas[String(fichaDragao.id)].acessos = { u_beto: "editor" };
    writeFileSync(join(dados, "permissoes.json"), JSON.stringify(doc));
    servidor = await subir();
    const beto3 = await conectar("Beto", "jogador");
    r = await pedir(beto3, { tipo: "editar_token", id: dragao.id, mudancas: { nome: "Dragao Verde" } });
    ok("8a) o EDITOR edita o token", r.some((e) => e.tipo === "token_editado" && e.token.nome === "Dragao Verde"));
    r = await pedir(beto3, { tipo: "editar_ficha", id: fichaDragao.id, versao: fichaDragao.versao, nome: "Dragao Verde" });
    ok("8b) ...e a ficha", r.some((e) => e.tipo === "ficha_editada" && e.ficha.nome === "Dragao Verde"));
    r = await pedir(beto3, { tipo: "excluir_token", id: dragao.id });
    ok("8c) mas o editor NÃO exclui o token", erros(r).length === 1);
    r = await pedir(beto3, { tipo: "excluir_ficha", id: fichaDragao.id });
    ok("8d) nem a ficha", erros(r).length === 1);
    r = await pedir(beto3, { tipo: "editar_token", id: dragao.id, mudancas: { grupos: [1] } });
    ok("8e) nem mexe nos grupos (seria um atalho para liberar acesso)", erros(r).length === 1);
    beto3.ws.close();

    // ----- 9) COMPARTILHAR AO VIVO: o token leva a ficha junto, a pessoa recebe na hora, e dá para revogar
    const mestre9 = await conectar("Mestre", "mestre");
    const ana9 = await conectar("Ana", "jogador");
    ok("9a) a Ana ainda não vê o dragão nem a ficha dele", !ana9.inicial.tokens.some((t) => t.id === dragao.id && !t.somenteMapa) && !ana9.inicial.fichas.some((f) => f.id === fichaDragao.id));
    r = await pedir(mestre9, { tipo: "liberar", item: "tokens", id: dragao.id, usuario: "u_ana", nivel: "leitor" }, 350);
    const noAna = ana9.eventos;
    ok("9b) liberar o TOKEN como leitor manda o token à Ana NA HORA (sem recarregar)", noAna.some((e) => e.tipo === "token_editado" && e.token.id === dragao.id && e.token.nivel === "leitor" && !e.token.somenteMapa), JSON.stringify(noAna.map((e) => e.tipo)));
    ok("9c) ...e a FICHA ligada vai JUNTO, com o mesmo nível (regra de 17/11/2026: o acesso ao token vale para a ficha dele)", noAna.some((e) => e.tipo === "ficha_editada" && e.ficha.id === fichaDragao.id && e.ficha.nivel === "leitor"));
    await pedir(mestre9, { tipo: "liberar", item: "fichas", id: fichaDragao.id, usuario: "u_ana", nivel: "leitor" }, 350);
    ok("9c2) liberar a ficha à parte a entrega como leitora, NA HORA", ana9.eventos.some((e) => e.tipo === "ficha_editada" && e.ficha.id === fichaDragao.id && e.ficha.nivel === "leitor"));
    r = await pedir(ana9, { tipo: "colocar_modelo", modelo: dragao.id, col: 12, row: 12 });
    ok("9d) a Ana arrasta o token para o mapa quando quiser", r.some((e) => e.tipo === "peca_criada"));
    r = await pedir(ana9, { tipo: "editar_ficha", id: fichaDragao.id, versao: fichaDragao.versao + 3, nome: "Hack" });
    ok("9e) mas como leitora não edita a ficha", erros(r).length === 1);
    await pedir(mestre9, { tipo: "liberar", item: "tokens", id: dragao.id, usuario: "u_ana", nivel: "editor" }, 350);
    await pedir(mestre9, { tipo: "liberar", item: "fichas", id: fichaDragao.id, usuario: "u_ana", nivel: "editor" }, 350);
    ok("9f) subir para EDITOR chega na hora (token e ficha com o nível novo)", ana9.eventos.some((e) => e.tipo === "ficha_editada" && e.ficha.id === fichaDragao.id && e.ficha.nivel === "editor") && ana9.eventos.some((e) => e.tipo === "token_editado" && e.token.id === dragao.id && e.token.nivel === "editor"));
    r = await pedir(mestre9, { tipo: "editar_ficha", id: fichaDragao.id, versao: (ana9.eventos.filter((e) => e.tipo === "ficha_editada").at(-1)?.ficha.versao ?? 1), nome: "Dragao Ancestral" }, 350);
    ok("9g) uma edição do mestre na ficha chega AO VIVO à Ana", ana9.eventos.some((e) => e.tipo === "ficha_editada" && e.ficha.nome === "Dragao Ancestral"));
    await pedir(mestre9, { tipo: "liberar", item: "fichas", id: fichaDragao.id, usuario: "u_ana", nivel: null }, 350);
    ok("9h) tirar a liberação DIRETA da ficha não a tira de quem tem o TOKEN (o acesso continua vindo dele)", !ana9.eventos.slice(-6).some((e) => e.tipo === "ficha_excluida" && e.id === fichaDragao.id) && ana9.eventos.filter((e) => e.tipo === "ficha_editada" && e.ficha.id === fichaDragao.id).at(-1)?.ficha.nivel === "editor");
    r = await pedir(ana9, { tipo: "liberar", item: "tokens", id: dragao.id, usuario: "u_ana", nivel: "editor" });
    ok("9i) um jogador não libera nada (só o mestre)", soMestre(r));
    r = await pedir(mestre9, { tipo: "definir_limites", tokens: 2, fichas: 3 }, 300);
    ok("9j) o mestre muda os limites e o documento chega aos mestres", r.some((e) => e.tipo === "permissoes" && e.permissoes.limites.tokensPorJogador === 2 && e.permissoes.limites.fichasPorJogador === 3));
    r = await pedir(mestre9, { tipo: "definir_mestre", usuario: "u_ana", mestre: true }, 400);
    ok("9k) promover a Ana: ela recebe o papel de mestre na hora", ana9.eventos.some((e) => e.tipo === "papel" && e.mestre === true) && r.some((e) => e.tipo === "jogadores" && e.lista.some((j) => j.usuario === "u_ana" && j.mestre === true)));
    for (const c of [mestre9, ana9]) c.ws.close();

    // ----- 10) DANO, CURA E CONDIÇÃO EM ÁREA (vários tokens de uma vez; qualquer jogador pode)
    const mestre10 = await conectar("Mestre", "mestre");
    const beto10 = await conectar("Beto", "jogador");
    const ids = [];
    const modelosIds = [];
    for (const [nome, pv] of [["Orc A", 20], ["Orc B", 10]]) {
        await pedir(mestre10, novoToken(nome), 150);
        const modelo = mestre10.eventos.filter((e) => e.tipo === "token_criado").map((e) => e.token).find((t) => t.nome === nome);
        await pedir(mestre10, { tipo: "criar_ficha", token: modelo.id }, 250);
        const ficha = mestre10.eventos.filter((e) => e.tipo === "ficha_criada").map((e) => e.ficha).find((f) => f.nome === nome);
        await pedir(mestre10, { tipo: "editar_ficha", id: ficha.id, versao: ficha.versao, abas: [{ nome: "Página 1", texto: `PV::0:${pv}:${pv}` }] }, 250);
        const r2 = await pedir(mestre10, { tipo: "colocar_modelo", modelo: modelo.id, col: 2 + ids.length * 2, row: 8 }, 300);
        ids.push(r2.find((e) => e.tipo === "peca_criada").token.id);
        modelosIds.push(modelo.id);
    }
    r = await pedir(beto10, { tipo: "aplicar_acao_varios", tokens: ids, acao: 1, valor: "4" }, 400);
    const valores = (id) => beto10.eventos.filter((e) => e.tipo === "valores_atualizados" && e.id === id).at(-1)?.valores;
    ok("10a) dano em ÁREA (o jogador pode): os dois tokens perdem 4, cada um dentro do seu valor", valores(ids[0])?.[0]?.atual === 16 && valores(ids[1])?.[0]?.atual === 6, JSON.stringify([valores(ids[0]), valores(ids[1])]));
    const frases = mestre10.eventos.filter((e) => e.tipo === "mensagem" && /Dano 4 em 2 tokens/.test(e.mensagem.texto));
    ok("10b) UMA frase só no chat para o grupo todo", frases.length === 1, JSON.stringify(mestre10.eventos.filter((e) => e.tipo === "mensagem").map((e) => e.mensagem.texto)));
    r = await pedir(mestre10, { tipo: "aplicar_acao_varios", tokens: ids, acao: 2, valor: "1d4+50" }, 400);
    const total = Number(mestre10.eventos.filter((e) => e.tipo === "mensagem").at(-1)?.mensagem.texto.match(/Cura (\d+) em/)?.[1]);
    ok("10c) cura com DADOS: rola UMA vez (o mesmo total para os dois, passando do máximo, cada um fica no seu)", total >= 51 && valores(ids[0])?.[0]?.atual === 20 && valores(ids[1])?.[0]?.atual === 10, String(total));
    r = await pedir(beto10, { tipo: "condicao_varios", tokens: ids, condicao: "Caido", ligar: true }, 400);
    const cond = (id) => beto10.eventos.filter((e) => e.tipo === "condicoes_atualizadas" && e.id === id).at(-1)?.condicoes ?? [];
    ok("10d) condição em ÁREA liga em todos", cond(ids[0]).includes("Caido") && cond(ids[1]).includes("Caido"));
    await pedir(beto10, { tipo: "condicao_varios", tokens: ids, condicao: "Caido", ligar: true }, 300);
    ok("10e) ligar de novo NÃO desliga (é 'ligar', não 'alternar')", cond(ids[0]).includes("Caido"));
    await pedir(beto10, { tipo: "condicao_varios", tokens: ids, condicao: "Caido", ligar: false }, 300);
    ok("10f) desligar tira de todos", !cond(ids[0]).includes("Caido") && !cond(ids[1]).includes("Caido"));
    r = await pedir(beto10, { tipo: "aplicar_acao_varios", tokens: [ids[0], 999999], acao: 1, valor: "1" });
    ok("10g) um id que não existe recusa o pedido inteiro (nada é aplicado)", erros(r).length === 1 && valores(ids[0])?.[0]?.atual === 20);
    // o modelo que o jogador SEM acesso recebe (só porque há uma peça no mapa) mantém os GRUPOS: o cliente os usa para saber quais status, e portanto quais ações (Dano, Cura), valem para a peça
    await pedir(mestre10, { tipo: "criar_grupo", nome: "Orcs", cor: 0xff0000 }, 250);
    const grupoOrcs = mestre10.eventos.find((e) => e.tipo === "grupo_criado")?.grupo;
    await pedir(mestre10, { tipo: "editar_token", id: modelosIds[0], mudancas: { grupos: [grupoOrcs.id] } }, 300);
    const beto11 = await conectar("Beto", "jogador");
    const vistoPeloBeto = beto11.inicial.tokens.find((t) => t.id === modelosIds[0]);
    ok("10h) o modelo 'só mapa' mantém os GRUPOS (sem eles, o jogador perdia Dano e Cura no painel) e continua SEM a ficha", !!vistoPeloBeto && vistoPeloBeto.somenteMapa === true && vistoPeloBeto.ficha === null && vistoPeloBeto.grupos.includes(grupoOrcs.id), JSON.stringify(vistoPeloBeto));
    beto11.ws.close();

    // ----- 11) "QUEM VÊ" DE UM STATUS: quem não vê não recebe o valor (a barra nem existe para ele), mas continua dando dano; o chat não vaza o número
    const hp = mestre10.inicial.status[0];
    await pedir(mestre10, { tipo: "definir_status", status: [{ ...hp, quemVe: { dono: true, leitores: false, outros: false } }] }, 400);
    const redefinido = beto10.eventos.filter((e) => e.tipo === "status_definidos").at(-1);
    const doBeto = redefinido?.pecas.find((x) => x.id === ids[0])?.valores?.[0];
    ok("11a) o Beto (sem acesso aos tokens) recebe o valor do HP ESCONDIDO ('oculto', 0/0)", doBeto?.oculto === true && doBeto.atual === 0 && doBeto.max === 0, JSON.stringify(doBeto));
    const doMestre = mestre10.eventos.filter((e) => e.tipo === "status_definidos").at(-1)?.pecas.find((x) => x.id === ids[0])?.valores?.[0];
    ok("11b) o MESTRE continua vendo o valor de verdade (20)", doMestre?.atual === 20 && !doMestre.oculto, JSON.stringify(doMestre));
    const antesMsg = mestre10.eventos.length;
    await pedir(beto10, { tipo: "aplicar_acao", token: ids[0], acao: 1, valor: "3" }, 400);
    ok("11c) mesmo sem ver o HP, o Beto DÁ DANO (o mestre vê 20 -> 17)", mestre10.eventos.slice(antesMsg).some((e) => e.tipo === "valores_atualizados" && e.id === ids[0] && e.valores[0].atual === 17));
    const efeitoBeto = beto10.eventos.filter((e) => e.tipo === "valores_atualizados" && e.id === ids[0]).map((e) => e.efeito);
    ok("11c2) o Beto (que não vê o HP) recebe o EFEITO 'dano', para a animação aparecer em todas as telas", efeitoBeto.includes("dano"), JSON.stringify(efeitoBeto));
    ok("11c3) o mestre também recebe o efeito", mestre10.eventos.slice(antesMsg).some((e) => e.tipo === "valores_atualizados" && e.id === ids[0] && e.efeito === "dano"));
    ok("11d) o Beto só recebe o valor escondido depois do dano", beto10.eventos.filter((e) => e.tipo === "valores_atualizados" && e.id === ids[0]).at(-1)?.valores[0].oculto === true);
    ok("11e) o chat NÃO mostra os números do HP (só 'Orc A: Dano 3')", mestre10.eventos.slice(antesMsg).some((e) => e.tipo === "mensagem" && e.mensagem.texto === "Orc A: Dano 3"), JSON.stringify(mestre10.eventos.slice(antesMsg).filter((e) => e.tipo === "mensagem").map((e) => e.mensagem.texto)));
    const entrando = await conectar("Beto", "jogador");
    const pecaVista = entrando.inicial.tokens.find((t) => t.id === ids[0]);
    ok("11f) quem entra depois também recebe o HP escondido", pecaVista?.valores[0]?.oculto === true && pecaVista.valores[0].atual === 0, JSON.stringify(pecaVista?.valores));
    entrando.ws.close();
    await pedir(mestre10, { tipo: "definir_status", status: [{ ...hp, quemVe: { dono: true, leitores: true, outros: true } }] }, 400);
    ok("11g) marcar 'Outros jogadores' de volta mostra o valor de novo ao Beto", beto10.eventos.filter((e) => e.tipo === "status_definidos").at(-1)?.pecas.find((x) => x.id === ids[0])?.valores?.[0]?.oculto !== true);
    for (const c of [mestre10, beto10]) c.ws.close();

    // ----- 12) DESENHOS COMPARTILHADOS: todos desenham, o mestre apaga todos, os outros só os próprios
    const mestre12 = await conectar("Mestre", "mestre");
    const ana12 = await conectar("Ana", "jogador");
    const beto12 = await conectar("Beto", "jogador");
    ok("12a) o estado inicial traz os desenhos do mapa (lista)", Array.isArray(mestre12.inicial.desenhos) && Array.isArray(ana12.inicial.desenhos));
    const traco = { tipo: "livre", cor: 0xff0000, pontos: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1.5 }] };
    await pedir(ana12, { tipo: "desenhar", desenho: traco, ref: "-1" }, 350);
    const dA = ana12.eventos.find((e) => e.tipo === "desenho_criado")?.desenho;
    ok("12b) a Ana desenha: o servidor dá o id e o AUTOR e a Ana recebe a 'ref' de volta", !!dA && dA.id > 0 && dA.autor === "u_ana" && ana12.eventos.some((e) => e.tipo === "desenho_criado" && e.ref === "-1"), JSON.stringify(dA));
    ok("12c) o mestre e o Beto veem o desenho na hora (compartilhado)", [mestre12, beto12].every((c) => c.eventos.some((e) => e.tipo === "desenho_criado" && e.desenho.id === dA.id)));
    r = await pedir(beto12, { tipo: "apagar_desenhos", ids: [dA.id] }, 300);
    ok("12d) o Beto NÃO apaga o desenho da Ana (só os próprios)", erros(r).length === 1 && !beto12.eventos.some((e) => e.tipo === "desenhos_apagados"));
    await pedir(beto12, { tipo: "desenhar", desenho: { tipo: "retangulo", cor: 0x00ff00, x: 5, y: 5, largura: 2, altura: 1 } }, 300);
    const dB = beto12.eventos.filter((e) => e.tipo === "desenho_criado").at(-1)?.desenho;
    await pedir(ana12, { tipo: "apagar_desenhos", ids: [dA.id] }, 300);
    ok("12e) a Ana apaga o PRÓPRIO desenho e todos recebem o aviso", [mestre12, beto12, ana12].every((c) => c.eventos.some((e) => e.tipo === "desenhos_apagados" && e.ids.includes(dA.id))));
    await pedir(mestre12, { tipo: "apagar_desenhos", ids: [dB.id] }, 300);
    ok("12f) o MESTRE apaga o desenho de qualquer um (o do Beto)", [ana12, beto12].every((c) => c.eventos.some((e) => e.tipo === "desenhos_apagados" && e.ids.includes(dB.id))));
    r = await pedir(ana12, { tipo: "desenhar", desenho: { tipo: "elipse", cor: 0, x: 1, y: 1, largura: -3, altura: 2 } }, 250);
    ok("12g) um desenho inválido (largura negativa) é recusado", erros(r).length === 1);
    r = await pedir(ana12, { tipo: "desenhar", desenho: { tipo: "livre", cor: 0, pontos: [{ x: 1e9, y: 1 }] } }, 250);
    ok("12h) um ponto fora do limite é recusado", erros(r).length === 1);
    await pedir(ana12, { tipo: "desenhar", desenho: traco }, 300);
    await pedir(mestre12, { tipo: "definir_mapa", id: null }, 400);
    await pedir(mestre12, { tipo: "mover_jogadores" }, 400); // (os jogadores só trocam de mapa quando o mestre os move)
    const redefinidos = ana12.eventos.filter((e) => e.tipo === "desenhos_definidos").at(-1);
    ok("12i) trocar o mapa manda a todos os desenhos do mapa (cada mapa tem os seus)", !!redefinidos && redefinidos.desenhos.length >= 1);
    await esperar(900); // (a gravação do arquivo tem uma pequena espera)
    ok("12j) os desenhos são gravados em dados/desenhos.json", existsSync(join(dados, "desenhos.json")) && JSON.parse(readFileSync(join(dados, "desenhos.json"), "utf8")).mapas._?.length >= 1);
    for (const c of [mestre12, ana12, beto12]) c.ws.close();

    // ----- 13) BANIR e QUEM VÊ O MAPA (mestre)
    const respostaMapa = await fetch(`http://127.0.0.1:${PORTA}/mapas?nome=teste&papel=mestre`, { method: "POST", headers: { "content-type": "image/png" }, body: readFileSync(join(RAIZ, "public/images/maps/acampamento.png")) });
    ok("13-0) o mestre envia um mapa de teste (HTTP)", respostaMapa.status === 201, String(respostaMapa.status));
    const mestre13 = await conectar("Mestre", "mestre");
    const ana13 = await conectar("Caio", "jogador"); // (a "Caio" virou mestre na seção 9 e isso fica gravado: aqui o jogador é o Caio)
    const bia13 = await conectar("Bia", "jogador");
    r = await pedir(ana13, { tipo: "banir", usuario: "u_bia", banir: true }, 250);
    ok("13a) um jogador não bane ninguém", erros(r).length === 1, JSON.stringify(r));
    r = await pedir(mestre13, { tipo: "banir", usuario: "u_mestre", banir: true }, 250);
    ok("13b) o mestre não bane a si mesmo", erros(r).length === 1);
    await pedir(mestre13, { tipo: "banir", usuario: "u_bia", banir: true, nome: "Bia" }, 500);
    ok("13c) o mestre bane a Bia: ela é desconectada na hora, com o motivo", bia13.fechou() && bia13.eventos.some((e) => e.tipo === "erro" && /banid/i.test(e.motivo)));
    ok("13d) o mestre recebe a lista de banidos (com o nome)", mestre13.eventos.filter((e) => e.tipo === "permissoes").at(-1)?.permissoes.banidos.some((b) => b.usuario === "u_bia" && b.nome === "Bia"));
    const biaDeNovo = await conectar("Bia", "jogador");
    ok("13e) a Bia banida NÃO consegue entrar de novo", !biaDeNovo.inicial && biaDeNovo.eventos.some((e) => e.tipo === "erro" && /banid/i.test(e.motivo)));
    await pedir(mestre13, { tipo: "banir", usuario: "u_bia", banir: false }, 300);
    const biaVolta = await conectar("Bia", "jogador");
    ok("13f) o mestre desbane e ela volta a entrar", !!biaVolta.inicial);
    biaVolta.ws.close();
    // quem vê o mapa
    const lista = mestre13.inicial.mapas;
    const mapaId = lista[0]?.id;
    const ultimoMapa = (c) => c.eventos.filter((e) => e.tipo === "mapa_definido").at(-1)?.mapa;
    ok("13g) o mestre recebe a biblioteca inteira, e um mapa ENVIADO nasce só para o mestre (todos: false)", lista.length >= 1 && lista.every((m) => m.quemVe && m.quemVe.todos === false), JSON.stringify(lista.map((m) => m.quemVe)));
    ok("13h) o jogador não recebe nenhum mapa escondido (a biblioteca dele vem vazia)", ana13.inicial.mapas.length === 0 && ana13.inicial.mapa === null);
    if (mapaId) {
        const antesDoUso = ana13.eventos.length;
        await pedir(mestre13, { tipo: "definir_mapa", id: mapaId, colunas: 20, linhas: 12 }, 400);
        ok("13i) o mestre usa o mapa novo e o jogador NÃO é arrastado (nenhum mapa_definido chega a ele)", !ana13.eventos.slice(antesDoUso).some((e) => e.tipo === "mapa_definido"), JSON.stringify(ana13.eventos.slice(antesDoUso).map((e) => e.tipo)));
        ok("13i2) o mestre vê o mapa novo e o tamanho que ele mandou (20×12)", ultimoMapa(mestre13) === mapaId && mestre13.eventos.filter((e) => e.tipo === "mapa_definido").at(-1).colunas === 20);
        r = await pedir(ana13, { tipo: "ir_para_mapa", id: mapaId }, 250);
        ok("13i3) o jogador NÃO muda de mapa sozinho (o pedido não existe mais: é recusado)", erros(r).length === 1 && ultimoMapa(ana13) === undefined, JSON.stringify(r));
        await pedir(mestre13, { tipo: "definir_quem_ve_mapa", id: mapaId, todos: true, usuarios: [] }, 400);
        ok("13j) liberado para todos, o jogador continua onde estava (nada chega a ele)", ultimoMapa(ana13) === undefined && ana13.eventos.filter((e) => e.tipo === "mapas_definidos").at(-1)?.mapas.length === 0);
        await pedir(mestre13, { tipo: "mover_jogadores" }, 400);
        ok("13j2) só o mestre o move ('Mover jogadores'): o Caio chega ao mapa, com o tamanho dele (20×12) e na biblioteca", ultimoMapa(ana13) === mapaId && ana13.eventos.filter((e) => e.tipo === "mapa_definido").at(-1).colunas === 20 && ana13.eventos.filter((e) => e.tipo === "mapas_definidos").at(-1)?.mapas.some((m) => m.id === mapaId));
        const listaDoMestre = mestre13.eventos.filter((e) => e.tipo === "jogadores").at(-1)?.lista ?? [];
        ok("13j3) a lista de jogadores diz quem está NA CENA de cada um (o Caio está na cena do mestre)", listaDoMestre.some((j) => j.apelido === "Caio" && j.naMinhaCena === true), JSON.stringify(listaDoMestre));
        await pedir(mestre13, { tipo: "definir_quem_ve_mapa", id: mapaId, todos: false, usuarios: [] }, 400);
        ok("13k) escondido de novo (só o mestre), o Caio, que está nele, passa a receber o tabuleiro VAZIO (mapa nulo)", ultimoMapa(ana13) === null, JSON.stringify(ana13.eventos.slice(-4)));
        ok("13k2) o mestre continua vendo o mapa", ultimoMapa(mestre13) === mapaId);
        await pedir(mestre13, { tipo: "definir_quem_ve_mapa", id: mapaId, todos: false, usuarios: ["u_caio"] }, 400);
        ok("13l) liberado só para o Caio, ele volta a ver o mapa", ultimoMapa(ana13) === mapaId);
        r = await pedir(ana13, { tipo: "definir_quem_ve_mapa", id: mapaId, todos: true, usuarios: [] }, 250);
        ok("13m) um jogador não muda quem vê o mapa", erros(r).length === 1, JSON.stringify(r));
        // 14) MOVER JOGADORES: o mestre troca para "nenhum mapa" e depois leva todos de volta para o dele
        await pedir(mestre13, { tipo: "definir_mapa", id: null }, 300);
        ok("14a) o mestre sai do mapa e o Caio continua nele (não é arrastado)", ultimoMapa(mestre13) === null && ultimoMapa(ana13) === mapaId);
        r = await pedir(ana13, { tipo: "mover_jogadores" }, 250);
        ok("14b) um jogador não move os outros", erros(r).length === 1, JSON.stringify(r));
        await pedir(mestre13, { tipo: "mover_jogadores" }, 400);
        ok("14c) 'Mover jogadores' leva o Caio para o mapa do mestre (nenhum)", ultimoMapa(ana13) === null);
        await pedir(mestre13, { tipo: "definir_mapa", id: mapaId }, 300);
        await pedir(mestre13, { tipo: "mover_jogadores" }, 400);
        ok("14d) o mestre volta ao mapa, move os jogadores e o Caio chega nele", ultimoMapa(ana13) === mapaId);
        // O tamanho que o mestre configurou é LEMBRADO: ao voltar ao mapa, a previsão da imagem (o pedido) não vale por cima
        await pedir(mestre13, { tipo: "definir_tamanho", colunas: 25, linhas: 15 }, 300);
        await pedir(mestre13, { tipo: "definir_mapa", id: null }, 300);
        await pedir(mestre13, { tipo: "definir_mapa", id: mapaId, colunas: 10, linhas: 10 }, 400);
        const voltou = mestre13.eventos.filter((e) => e.tipo === "mapa_definido").at(-1);
        ok("14e) o mapa lembra o tamanho configurado (25×15), mesmo que o pedido traga outra previsão", voltou.mapa === mapaId && voltou.colunas === 25 && voltou.linhas === 15, JSON.stringify(voltou));
        ok("14f) a biblioteca do mestre leva o tamanho guardado de cada mapa", mestre13.eventos.filter((e) => e.tipo === "mapas_definidos").at(-1).mapas.find((m) => m.id === mapaId)?.colunas === 25);
        ok("14g) o mestre sabe em que mapa cada jogador está (e o jogador não recebe esse dado)", (mestre13.eventos.filter((e) => e.tipo === "jogadores").at(-1)?.lista ?? []).some((j) => j.apelido === "Caio" && "mapa" in j) && !(ana13.eventos.filter((e) => e.tipo === "jogadores").at(-1)?.lista ?? []).some((j) => "mapa" in j));
        // Cada mapa tem a SUA grade (espessura e cor)
        await pedir(mestre13, { tipo: "definir_grade", espessura: 4, cor: null }, 300);
        await pedir(mestre13, { tipo: "definir_mapa", id: null }, 300);
        await pedir(mestre13, { tipo: "definir_grade", espessura: 2, cor: null }, 300);
        await pedir(mestre13, { tipo: "definir_mapa", id: mapaId }, 400);
        const voltou2 = mestre13.eventos.filter((e) => e.tipo === "mapa_definido").at(-1);
        ok("14h) a grade é de CADA mapa: ao voltar, a espessura é a daquele mapa (4), não a que se pôs em outro (2)", voltou2.mapa === mapaId && voltou2.grade?.espessura === 4, JSON.stringify(voltou2));
        // Levado a um mapa que não pode ver: o tabuleiro vem vazio e há um aviso
        await pedir(mestre13, { tipo: "definir_quem_ve_mapa", id: mapaId, todos: false, usuarios: [] }, 300);
        const antesAviso = ana13.eventos.length;
        await pedir(mestre13, { tipo: "mover_jogadores" }, 400);
        ok("14i) quem é movido para um mapa que não pode ver recebe o tabuleiro vazio, marcado 'semPermissao' (o navegador mostra a faixa fixa)", ana13.eventos.slice(antesAviso).some((e) => e.tipo === "mapa_definido" && e.semPermissao === true) && ultimoMapa(ana13) === null);
        ok("14j) o mestre vê, na lista, que o Caio está nesse mapa SEM permissão", (mestre13.eventos.filter((e) => e.tipo === "jogadores").at(-1)?.lista ?? []).some((j) => j.apelido === "Caio" && j.mapa === mapaId && j.semPermissao === true));
        await pedir(mestre13, { tipo: "definir_quem_ve_mapa", id: mapaId, todos: true, usuarios: [] }, 300);
    }
    // ----- 15) FAVORITOS são de CADA pessoa
    const mestre15 = await conectar("Mestre", "mestre");
    const caio15 = await conectar("Caio", "jogador");
    await pedir(mestre15, { tipo: "criar_token", nome: "Fav", cor: 0x2ecc71, corBorda: 0xffffff, tamanho: 1, imagem: null }, 500);
    const tokenFav = mestre15.eventos.filter((e) => e.tipo === "token_criado").at(-1)?.token;
    if (tokenFav) {
        await pedir(mestre15, { tipo: "liberar", item: "tokens", id: tokenFav.id, usuario: "u_caio", nivel: "leitor" }, 400);
        await pedir(mestre15, { tipo: "editar_token", id: tokenFav.id, mudancas: { favorito: true } }, 400);
        ok("15a) o mestre favorita o token: ele vê a estrela", mestre15.eventos.filter((e) => e.tipo === "token_editado" && e.token.id === tokenFav.id).at(-1)?.token.favorito === true);
        const noCaio = caio15.eventos.filter((e) => (e.tipo === "token_editado" || e.tipo === "token_criado") && e.token?.id === tokenFav.id).at(-1)?.token;
        ok("15b) o Caio NÃO vê a estrela do mestre (cada um tem a sua)", noCaio && noCaio.favorito === false, JSON.stringify(noCaio?.favorito));
        await pedir(caio15, { tipo: "editar_token", id: tokenFav.id, mudancas: { favorito: true } }, 400);
        ok("15c) um jogador (leitor) favorita o token por conta própria, sem erro", caio15.eventos.filter((e) => e.tipo === "token_editado" && e.token.id === tokenFav.id).at(-1)?.token.favorito === true && !caio15.eventos.some((e) => e.tipo === "erro" && /favorit/i.test(e.motivo ?? "")));
        await pedir(mestre15, { tipo: "editar_token", id: tokenFav.id, mudancas: { favorito: false } }, 400);
        const voltaCaio = await conectar("Caio", "jogador");
        ok("15d) a estrela do Caio continua (gravada por usuário) mesmo depois de o mestre tirar a dele", voltaCaio.inicial.tokens.find((t) => t.id === tokenFav.id)?.favorito === true);
        voltaCaio.ws.close();
        ok("15e) os favoritos ficam gravados no usuarios.json (preferências, separadas das permissões)", JSON.parse(readFileSync(join(dados, "usuarios.json"), "utf8")).usuarios?.u_caio?.favoritos?.tokens?.includes(tokenFav.id) && JSON.parse(readFileSync(join(dados, "permissoes.json"), "utf8")).favoritos === undefined);
    } else ok("15) (não foi possível criar o token de teste)", false);
    for (const c of [mestre15, caio15]) c.ws.close();
    for (const c of [mestre13, ana13, bia13]) c.ws.close();
    // ----- 17) PASTAS da bolsa: o jogador só vê a pasta do mestre quando ela é liberada; cria as próprias; não apaga as dos outros
    const mestre17 = await conectar("Mestre", "mestre");
    const caio17 = await conectar("Caio", "jogador");
    await pedir(mestre17, { tipo: "criar_pasta", tipoDaPasta: "tokens", nome: "Monstros", pai: null }, 400);
    const pastaM = mestre17.eventos.filter((e) => e.tipo === "pasta_definida").at(-1)?.pasta;
    ok("17a) o mestre cria uma pasta de tokens", pastaM?.nome === "Monstros" && pastaM.tipo === "tokens");
    ok("17b) o jogador NÃO recebe a pasta do mestre (não foi liberada)", !caio17.eventos.some((e) => e.tipo === "pasta_definida" && e.pasta.id === pastaM?.id));
    await pedir(mestre17, { tipo: "criar_token", nome: "Lobo", cor: 0x2ecc71, corBorda: 0xffffff, tamanho: 1, imagem: null }, 500);
    const lobo = mestre17.eventos.filter((e) => e.tipo === "token_criado").at(-1)?.token;
    if (pastaM && lobo) {
        await pedir(mestre17, { tipo: "mover_para_pasta", item: "tokens", ids: [lobo.id], pasta: pastaM.id }, 400);
        ok("17c) o mestre põe o token na pasta", mestre17.eventos.filter((e) => e.tipo === "token_editado" && e.token.id === lobo.id).at(-1)?.token.pasta === pastaM.id);
        await pedir(mestre17, { tipo: "liberar", item: "pastas", id: pastaM.id, usuario: "u_caio", nivel: "leitor" }, 500);
        ok("17d) liberada como LEITOR, o jogador passa a ver a pasta (com o nível dele)", caio17.eventos.some((e) => e.tipo === "pasta_definida" && e.pasta.id === pastaM.id && e.pasta.nivel === "leitor"));
        ok("17e) ...e o token que está nela (pela pasta)", caio17.eventos.some((e) => e.tipo === "token_editado" && e.token.id === lobo.id && e.token.nivel === "leitor"));
        r = await pedir(caio17, { tipo: "excluir_pasta", id: pastaM.id }, 300);
        ok("17f) o jogador NÃO apaga a pasta do mestre", erros(r).length === 1, JSON.stringify(r));
        r = await pedir(caio17, { tipo: "mover_para_pasta", item: "tokens", ids: [lobo.id], pasta: null }, 300);
        ok("17g) como LEITOR, ele não tira o token da pasta", erros(r).length === 1);
    } else ok("17c) (preparo: pasta ou token não foram criados)", false);
    await pedir(caio17, { tipo: "criar_pasta", tipoDaPasta: "fichas", nome: "Minhas fichas", pai: null }, 500);
    const pastaC = caio17.eventos.filter((e) => e.tipo === "pasta_definida").at(-1)?.pasta;
    ok("17h) o jogador cria a PRÓPRIA pasta e é o dono dela", pastaC?.nome === "Minhas fichas" && pastaC.nivel === "dono");
    ok("17i) as pastas ficam gravadas em dados/pastas/", !!pastaC && existsSync(join(dados, "pastas", `${pastaC.id}.json`)));
    for (const c of [mestre17, caio17]) c.ws.close();
    // ----- 18) O ACESSO AO TOKEN VALE PARA A FICHA LIGADA (leitor lê e rola; editor edita); uma ficha compartilhada SOZINHA dá acesso só à ficha
    const mestre18 = await conectar("Mestre", "mestre");
    const caio18 = await conectar("Caio", "jogador");
    const duda18 = await conectar("Duda", "jogador");
    await pedir(mestre18, { tipo: "criar_ficha" }, 400);
    const ficha18 = mestre18.eventos.filter((e) => e.tipo === "ficha_criada").at(-1)?.ficha;
    await pedir(mestre18, { tipo: "editar_ficha", id: ficha18.id, versao: ficha18.versao, nome: "Ficha do Urso", abas: [{ nome: "Página 1", texto: "FOR:: 16\n(Ataque)[1d20 + FOR]" }] }, 500);
    await pedir(mestre18, { tipo: "criar_token", nome: "Urso", cor: 0x8b5a3c, corBorda: 0xffffff, tamanho: 2, imagem: null }, 500);
    const urso = mestre18.eventos.filter((e) => e.tipo === "token_criado").at(-1)?.token;
    await pedir(mestre18, { tipo: "editar_token", id: urso.id, mudancas: { ficha: ficha18.id } }, 500);
    const versaoDaFicha = mestre18.eventos.filter((e) => e.tipo === "ficha_editada" && e.ficha.id === ficha18.id).at(-1)?.ficha.versao ?? 2;
    ok("18a) sem liberar nada, o jogador NÃO vê o token nem a ficha ligada", !caio18.eventos.some((e) => e.tipo === "ficha_editada" && e.ficha.id === ficha18.id));
    await pedir(mestre18, { tipo: "liberar", item: "tokens", id: urso.id, usuario: "u_caio", nivel: "leitor" }, 600);
    ok("18b) token liberado como LEITOR: ele recebe o token E a ficha ligada, como leitor", caio18.eventos.some((e) => e.tipo === "token_editado" && e.token.id === urso.id && e.token.nivel === "leitor") && caio18.eventos.some((e) => e.tipo === "ficha_editada" && e.ficha.id === ficha18.id && e.ficha.nivel === "leitor"));
    const antesRolar = caio18.eventos.length;
    await pedir(caio18, { tipo: "rolar_ficha", id: ficha18.id, versao: versaoDaFicha, aba: 0, indice: 0 }, 500);
    ok("18c) como leitor da ficha (pelo token), ele ROLA os dados", caio18.eventos.slice(antesRolar).some((e) => e.tipo === "mensagem") && !caio18.eventos.slice(antesRolar).some((e) => e.tipo === "erro"), JSON.stringify(caio18.eventos.slice(antesRolar).map((e) => e.tipo)));
    r = await pedir(caio18, { tipo: "editar_ficha", id: ficha18.id, versao: versaoDaFicha, nome: "Invadida" }, 400);
    ok("18d) ...mas como leitor NÃO edita a ficha", erros(r).length === 1, JSON.stringify(r));
    await pedir(mestre18, { tipo: "liberar", item: "tokens", id: urso.id, usuario: "u_caio", nivel: "editor" }, 600);
    ok("18e) token liberado como EDITOR: a ficha ligada passa a ser dele como editor", caio18.eventos.filter((e) => e.tipo === "ficha_editada" && e.ficha.id === ficha18.id).at(-1)?.ficha.nivel === "editor");
    await pedir(mestre18, { tipo: "editar_token", id: urso.id, mudancas: { ficha: null } }, 600);
    ok("18f) desligando a ficha do token, ele deixa de ver a ficha (o acesso vinha do token)", caio18.eventos.some((e) => e.tipo === "ficha_excluida" && e.id === ficha18.id));
    await pedir(mestre18, { tipo: "editar_token", id: urso.id, mudancas: { ficha: ficha18.id } }, 600);
    await pedir(mestre18, { tipo: "liberar", item: "fichas", id: ficha18.id, usuario: "u_duda", nivel: "leitor" }, 600);
    ok("18g) uma FICHA compartilhada sozinha: ele vê a ficha e NÃO o token", duda18.eventos.some((e) => e.tipo === "ficha_editada" && e.ficha.id === ficha18.id && e.ficha.nivel === "leitor") && !duda18.eventos.some((e) => e.tipo === "token_editado" && e.token.id === urso.id));
    // pasta de TOKENS compartilhada: leva os tokens e as fichas ligadas; pasta de FICHAS: só as fichas
    await pedir(mestre18, { tipo: "criar_pasta", tipoDaPasta: "tokens", nome: "Bichos", pai: null }, 400);
    const pastaBichos = mestre18.eventos.filter((e) => e.tipo === "pasta_definida").at(-1)?.pasta;
    await pedir(mestre18, { tipo: "mover_para_pasta", item: "tokens", ids: [urso.id], pasta: pastaBichos.id }, 400);
    await pedir(mestre18, { tipo: "liberar", item: "tokens", id: urso.id, usuario: "u_caio", nivel: null }, 500);
    await pedir(mestre18, { tipo: "liberar", item: "pastas", id: pastaBichos.id, usuario: "u_caio", nivel: "leitor" }, 700);
    ok("18h) pasta de TOKENS compartilhada como leitor: o jogador recebe o token e a FICHA ligada a ele", caio18.eventos.filter((e) => e.tipo === "token_editado" && e.token.id === urso.id).at(-1)?.token.nivel === "leitor" && caio18.eventos.filter((e) => e.tipo === "ficha_editada" && e.ficha.id === ficha18.id).at(-1)?.ficha.nivel === "leitor");
    await pedir(mestre18, { tipo: "criar_pasta", tipoDaPasta: "fichas", nome: "Livros", pai: null }, 400);
    const pastaLivros = mestre18.eventos.filter((e) => e.tipo === "pasta_definida").at(-1)?.pasta;
    await pedir(mestre18, { tipo: "criar_ficha" }, 400);
    const fichaSolta = mestre18.eventos.filter((e) => e.tipo === "ficha_criada").at(-1)?.ficha;
    await pedir(mestre18, { tipo: "mover_para_pasta", item: "fichas", ids: [fichaSolta.id], pasta: pastaLivros.id }, 400);
    await pedir(mestre18, { tipo: "liberar", item: "pastas", id: pastaLivros.id, usuario: "u_duda", nivel: "editor" }, 700);
    ok("18i) pasta de FICHAS compartilhada como editor: ele edita as fichas dela", duda18.eventos.filter((e) => e.tipo === "ficha_editada" && e.ficha.id === fichaSolta.id).at(-1)?.ficha.nivel === "editor");
    for (const c of [mestre18, caio18, duda18]) c.ws.close();
    // ----- 16) BACKUP da campanha (a pasta de dados num .zip)
    const backup = await fetch(`http://127.0.0.1:${PORTA}/backup?papel=mestre`);
    const bytesDoZip = Buffer.from(await backup.arrayBuffer());
    ok("16a) o mestre baixa o backup: resposta 200, tipo zip e nome com a data", backup.status === 200 && backup.headers.get("content-type") === "application/zip" && /tabuleirinho-backup-\d{4}-\d{2}-\d{2}\.zip/.test(backup.headers.get("content-disposition") ?? ""), String(backup.status));
    const arquivoZip = join(dados, "..", `backup-teste-${process.pid}.zip`);
    writeFileSync(arquivoZip, bytesDoZip);
    const conferencia = spawnSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print('RUIM' if z.testzip() else 'BOM'); print('|'.join(z.namelist()))", arquivoZip], { encoding: "utf8" });
    rmSync(arquivoZip, { force: true });
    ok("16b) o .zip é válido (CRC conferido por um leitor de zip de verdade)", conferencia.stdout.startsWith("BOM"), conferencia.stdout + conferencia.stderr);
    ok("16c) o backup tem a mesa, as permissões e o LEIA-ME.txt (passo a passo)", /mesa\.json/.test(conferencia.stdout) && /permissoes\.json/.test(conferencia.stdout) && /LEIA-ME\.txt/.test(conferencia.stdout), conferencia.stdout);
ok("16d) o LEIA-ME explica como aplicar o backup (desligar o servidor, extrair em dados, religar)", ["DESLIGUE o servidor", "Extraia TODO o conteúdo", "npm run servidor"].every((t) => bytesDoZip.toString("utf8").includes(t)));
    ok("8f) o servidor não imprimiu erros inesperados", !/Error|Erro ao tratar/.test(servidor.saida()), servidor.saida().slice(-300));
} finally {
    await desligar(servidor).catch(() => undefined);
    if (existsSync(dados)) rmSync(dados, { recursive: true, force: true });
}
process.exitCode = terminar([]); // (o executor lê o código de saída)
