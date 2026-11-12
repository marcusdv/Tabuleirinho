// Teste e2e: régua com CURVAS. Rodar: npm run test:e2e -- regua-curvas
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
//
// O gesto: com o botão ESQUERDO apertado (arrastando a régua), clicar com o DIREITO fixa um ponto,
// e a medida continua dali; o total é a soma dos trechos. Detalhe técnico que este teste protege:
// apertar um segundo botão com o primeiro já apertado NÃO gera "pointerdown", só "pointermove".
import { abrirPagina, lancar, ok, perto, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const dist = () => p.locator("#regua-resultado").evaluate((e) => (e.hidden ? null : e.textContent));
const camX = () => p.evaluate(() => window.__tabuleirinho.camera.mundo.x);
// Centro de uma casa (coluna, linha) na tela: tabuleiro 18x10 a 100%, com a origem em (124, 80).
const casa = (c, r) => ({ x: 124 + (c + 0.5) * 64, y: 80 + (r + 0.5) * 64 });
const ir = async (de, para, passos = 6) => {
    for (let i = 1; i <= passos; i++) {
        await p.mouse.move(de.x + ((para.x - de.x) * i) / passos, de.y + ((para.y - de.y) * i) / passos);
        await p.waitForTimeout(20);
    }
};
const direito = async () => { await p.mouse.down({ button: "right" }); await p.mouse.up({ button: "right" }); };

await p.click('button[data-ferramenta="regua"]');
const A = casa(3, 2), B = casa(7, 2), C = casa(7, 6), D = casa(11, 6);

// 1) sem ponto fixo: em linha reta, a diagonal conta 1 casa (maior diferença entre colunas e linhas)
await p.mouse.move(A.x, A.y); await p.mouse.down(); await ir(A, C);
ok("1) A -> C direto, sem ponto fixo: 4 □ = 6 m", (await dist()) === "Distância: 4 □ = 6 m", await dist());
await p.mouse.up();

// 2) com ponto fixo: A -> B (4), direito, B -> C (4) = 8
const visaoAntes = await camX();
await p.mouse.move(A.x, A.y); await p.mouse.down(); await ir(A, B);
ok("2a) em B, antes do clique direito: 4 □ = 6 m", (await dist()) === "Distância: 4 □ = 6 m", await dist());
await direito();
await ir(B, C);
ok("2b) fixou B e foi até C: a medida SOMA os trechos (4 + 4 = 8 □ = 12 m), e não os 4 em linha reta", (await dist()) === "Distância: 8 □ = 12 m", await dist());
await direito();
await ir(C, D);
ok("2c) fixou C e foi até D: 12 □ = 18 m (três trechos)", (await dist()) === "Distância: 12 □ = 18 m", await dist());
await direito(); await direito();
ok("2d) clicar com o direito de novo no MESMO lugar não duplica o ponto nem muda a soma", (await dist()) === "Distância: 12 □ = 18 m", await dist());
await p.mouse.up();
ok("2e) soltar o esquerdo mantém o resultado na tela", (await dist()) === "Distância: 12 □ = 18 m");
ok("2f) o clique direito NÃO moveu a visão", (await camX()) === visaoAntes);

// 3) medida nova apaga a anterior (e as curvas)
await p.mouse.move(A.x, A.y); await p.mouse.down(); await ir(A, B); await p.mouse.up();
ok("3) uma medida nova começa do zero: A -> B = 4 □ = 6 m", (await dist()) === "Distância: 4 □ = 6 m", await dist());

// 4) direito SOZINHO (sem o esquerdo) continua movendo a visão
const antes = await camX();
await p.mouse.move(700, 560); await p.mouse.down({ button: "right" }); await ir({ x: 700, y: 560 }, { x: 600, y: 560 }); await p.mouse.up({ button: "right" });
ok("4) botão direito sozinho arrasta a visão (100 px para a esquerda)", perto((await camX()) - antes, -100, 1), `dx=${((await camX()) - antes).toFixed(1)}`);

// 5) direito sem medida em andamento: nada acontece
await p.mouse.click(500, 500, { button: "right" });
ok("5) clique direito sem medida em andamento não faz nada nem dá erro", erros.length === 0);

// 6) outras ferramentas: o direito no meio de um traço do lápis não quebra nada
await p.click('button[data-ferramenta="lapis"]');
await p.mouse.move(400, 300); await p.mouse.down(); await ir({ x: 400, y: 300 }, { x: 460, y: 300 }); await direito(); await ir({ x: 460, y: 300 }, { x: 520, y: 300 }); await p.mouse.up();
ok("6) com o lápis, o direito no meio do traço não dá erro", erros.length === 0, erros.join(" | "));

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
