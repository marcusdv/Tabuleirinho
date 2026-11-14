// Teste e2e: cores-do-desenho. Rodar: npm run test:e2e -- cores
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs.
import { CAPTURAS as S, PASTA_MAPAS, abrirPagina, lancar, recolherDados } from "./ajuda.mjs";
const b = await lancar();
const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
const erros = []; p.on("pageerror", (e) => erros.push(String(e)));
let falhas = 0;
const ok = (n, c, d = "") => { if (!c) falhas++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
await abrirPagina(p);
await recolherDados(p); // (o painel de Dados aberto cobriria a faixa do mapa onde o teste arrasta)

const cores = () => p.locator("#desenho-amostras .amostra").evaluateAll((a) => a.map((x) => x.dataset.cor));
const escolhida = () => p.locator("#desenho-amostras .amostra.escolhida").evaluateAll((a) => a.map((x) => x.dataset.cor));
async function arrastar(de, para) {
  await p.mouse.move(de.x, de.y); await p.waitForTimeout(60); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(de.x + ((para.x - de.x) * i) / 6, de.y + ((para.y - de.y) * i) / 6); await p.waitForTimeout(25); }
  await p.mouse.up(); await p.waitForTimeout(250);
}
let y = 120;
const riscar = async () => { await arrastar({ x: 400, y }, { x: 500, y }); y += 20; }; // um traço novo a cada vez
const iguais = (a, c) => JSON.stringify(a) === JSON.stringify(c);

await p.click('button[data-ferramenta="lapis"]');
const inicial = ["#ff5252", "#ff9800", "#ffd54f", "#4caf50", "#29b6f6", "#7e57c2", "#ffffff", "#000000"];
ok("1) começa: 6 recentes (vermelho, laranja, amarelo, verde, azul, roxo) + branco e preto", iguais(await cores(), inicial), (await cores()).join(" "));
ok("2) a cor inicial (vermelho) está destacada", iguais(await escolhida(), ["#ff5252"]));

// escolher uma amostra SEM desenhar: não reordena; só muda o destaque
await p.locator('#desenho-amostras .amostra[data-cor="#4caf50"]').click();
ok("3) escolher o verde sem desenhar NÃO reordena a pilha", iguais(await cores(), inicial));
ok("3b) ...mas o destaque vai para o verde", iguais(await escolhida(), ["#4caf50"]));

// desenhar com o verde: ele vai para a frente
await riscar();
ok("4) desenhar com o verde o leva para a frente da pilha", iguais(await cores(), ["#4caf50", "#ff5252", "#ff9800", "#ffd54f", "#29b6f6", "#7e57c2", "#ffffff", "#000000"]), (await cores()).join(" "));
ok("4b) o destaque acompanha o verde (agora na 1ª amostra)", iguais(await escolhida(), ["#4caf50"]));

// cor nova do seletor livre: só entra na pilha ao desenhar; empurra a mais antiga (roxo) para fora
await p.fill("#desenho-cor", "#ff00ff");
ok("5) escolher uma cor nova no seletor, sem desenhar, não altera as amostras", iguais(await cores(), ["#4caf50", "#ff5252", "#ff9800", "#ffd54f", "#29b6f6", "#7e57c2", "#ffffff", "#000000"]));
await riscar();
ok("6) desenhar com a cor nova: ela entra na frente e a mais ANTIGA (roxo) sai", iguais(await cores(), ["#ff00ff", "#4caf50", "#ff5252", "#ff9800", "#ffd54f", "#29b6f6", "#ffffff", "#000000"]), (await cores()).join(" "));
ok("6b) a pilha continua com 6 recentes e as duas últimas são branco e preto", (await cores()).length === 8 && (await cores()).slice(6).join() === "#ffffff,#000000");

// reutilizar uma cor que já está na pilha: ela sobe sem duplicar
await p.locator('#desenho-amostras .amostra[data-cor="#ff9800"]').click();
await riscar();
ok("7) usar de novo o laranja (que já estava na pilha) o leva para a frente, sem duplicar", iguais(await cores(), ["#ff9800", "#ff00ff", "#4caf50", "#ff5252", "#ffd54f", "#29b6f6", "#ffffff", "#000000"]), (await cores()).join(" "));

// branco e preto: desenhar com eles não mexe na pilha
await p.locator('#desenho-amostras .amostra[data-cor="#ffffff"]').click();
await riscar();
await p.locator('#desenho-amostras .amostra[data-cor="#000000"]').click();
await riscar();
ok("8) desenhar com branco e preto NÃO altera a pilha (eles já são fixos)", iguais(await cores(), ["#ff9800", "#ff00ff", "#4caf50", "#ff5252", "#ffd54f", "#29b6f6", "#ffffff", "#000000"]), (await cores()).join(" "));
ok("8b) o destaque está no preto (última amostra)", iguais(await escolhida(), ["#000000"]));

// Várias cores novas seguidas: só as 6 mais recentes ficam
for (const c of ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"]) { await p.fill("#desenho-cor", c); await riscar(); }
const fim = await cores();
ok("9) depois de 7 cores novas seguidas, restam as 6 mais recentes (a mais nova na frente)", iguais(fim.slice(0, 6), ["#777777", "#666666", "#555555", "#444444", "#333333", "#222222"]) && fim.slice(6).join() === "#ffffff,#000000", fim.join(" "));

// a cor usada para desenhar é a escolhida: confere via traço
await p.screenshot({ path: `${S}/c1_cores.png`, clip: { x: 0, y: 0, width: 200, height: 520 } });

console.log("---");
console.log("erros de JS:", erros.length ? erros : "nenhum");
console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
await b.close();
process.exitCode = falhas ? 1 : 0;
