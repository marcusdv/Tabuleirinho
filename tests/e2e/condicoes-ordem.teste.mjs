// Teste e2e: a ORDEM da grade de condições do painel de ações do token ("Add condição"): o MORTO sempre em primeiro (acesso rápido) e as condições LIGADAS logo depois (as escolhidas sobem; as que
// saem voltam ao lugar). Também confere que a pilha da esquerda tem ordem FIXA (sem arrastar) e que o "Remover emanação" tem o símbolo da emanação com um ✕.
// Rodar: npm run test:e2e -- condicoes-ordem (precisa do npm run dev).
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);

const estado = (f) => p.evaluate(`(${f.toString()})(window.__tabuleirinho.estado)`);
const casa = (c, r) => p.evaluate(([c, r]) => window.__tabuleirinho.camera.mundoParaTela((c + 0.5) * 64, (r + 0.5) * 64), [c, r]);
const nomes = () => p.locator(".grade-condicoes-grupo button").evaluateAll((bs) => bs.map((b) => b.textContent.trim()));
const ativas = () => p.locator(".grade-condicoes-grupo button.ativa").evaluateAll((bs) => bs.map((b) => b.textContent.trim()));
const clicar = async (nome) => { await p.locator(".grade-condicoes-grupo button", { hasText: new RegExp(`^${nome}$`) }).click(); await p.waitForTimeout(150); };

// ---------------------------------------------------------------- a pilha da esquerda tem ordem fixa
ok("1) não existe mais o botão 'Reorganizar telas'", (await p.locator("#reorganizar-telas").count()) === 0);
ok("2) os cabeçalhos das barras não são mais 'alças de arrastar' (só abrem e fecham)", (await p.locator("#pilha .alca-arrastar").count()) === 0 && (await p.getAttribute("#area .cabecalho", "title")) === "Clique para abrir ou fechar");
const antes = await p.evaluate(() => [...document.querySelectorAll("#pilha > .caixa-pilha")].sort((a, b) => Number(a.style.order) - Number(b.style.order)).map((c) => c.id).join(","));
const cab = await p.locator("#area .cabecalho").boundingBox();
await p.mouse.move(cab.x + 40, cab.y + 15);
await p.mouse.down();
await p.mouse.move(cab.x + 40, cab.y + 140, { steps: 6 }); // (tentar arrastar a barra Área para baixo)
await p.mouse.up();
await p.waitForTimeout(300);
const depois = await p.evaluate(() => [...document.querySelectorAll("#pilha > .caixa-pilha")].sort((a, b) => Number(a.style.order) - Number(b.style.order)).map((c) => c.id).join(","));
ok("3) arrastar uma barra NÃO troca a ordem (desenho, area, fog, iniciativa)", antes === "ferramentas-desenho,area,fog,iniciativa" && depois === antes, depois);

// ---------------------------------------------------------------- a grade de condições
let q = await casa(3, 3);
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
await p.locator("#menu-grupo-mapa button", { hasText: "Add condição" }).click();
await p.waitForTimeout(300);
let n = await nomes();
ok("4) o MORTO é o primeiro da grade (as outras seguem na ordem de sempre)", n[0] === "Morto" && n.length === 18 && n[1] === "Agarrado", n.slice(0, 3).join(","));
await clicar("Surdo");
n = await nomes();
ok("5) uma condição ligada SOBE: logo depois do Morto", n[0] === "Morto" && n[1] === "Surdo" && JSON.stringify(await ativas()) === '["Surdo"]', n.slice(0, 3).join(","));
await clicar("Caído");
n = await nomes();
ok("6) as ligadas ficam na ordem de sempre entre si (Caído antes de Surdo), todas antes das outras", n.slice(0, 3).join(",") === "Morto,Caído,Surdo" && n[3] === "Agarrado", n.slice(0, 4).join(","));
await clicar("Surdo");
n = await nomes();
ok("7) ao desligar, a condição DESCE de volta ao lugar dela", n.slice(0, 2).join(",") === "Morto,Caído" && n.indexOf("Surdo") > n.indexOf("Sangrando"), n.join(","));
await clicar("Morto");
n = await nomes();
ok("8) ligar o Morto não tira ele do primeiro lugar (e o Caído continua logo depois)", n[0] === "Morto" && n[1] === "Caído" && (await ativas()).includes("Morto"));
await p.keyboard.press("Escape");

// ---------------------------------------------------------------- "Remover emanação" com o símbolo da emanação e um ✕
await estado((e) => { e.tokens.find((t) => t.nome === "Token 1").emanacao = { casas: 2, cor: 0x42a5f5, alfa: 0.3 }; });
await p.mouse.click(q.x, q.y, { button: "right" });
await p.waitForTimeout(350);
const remover = p.locator("#menu-grupo-mapa button", { hasText: "Remover emanação" });
ok("9) 'Remover emanação' tem o SÍMBOLO da emanação e um ✕ vermelho", (await remover.count()) === 1 && (await remover.locator(".icone-emanacao").count()) === 1 && (await remover.locator(".extra-x").textContent()) === "✕");

const codigo = terminar(erros);
await nav.close();
process.exit(codigo);
