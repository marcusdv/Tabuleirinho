// Teste e2e: o que a pessoa escolheu na INTERFACE é lembrado ao recarregar a página (localStorage): a aba da coluna da direita (Chat/Bolsa), a aba da bolsa (Tokens/Fichas), quais
// GAVETAS da pilha da esquerda estão abertas (Desenho, Tabuleiro, Iniciativa) e se a barra de Dados está aberta. Rodar: npm run test:e2e -- preferencias (precisa do `npm run dev`).
//
// Cada página do teste começa com o armazenamento VAZIO. O padrão de fábrica: coluna da direita na BOLSA, aba Tokens, todas as gavetas e a barra de dados RECOLHIDAS. Depois a pessoa muda
// tudo, recarrega e confere que voltou como foi deixado; mudar de volta também é lembrado. Sem armazenamento a interface funciona igual, só sem lembrar (ui/preferencias.ts, com try/catch).
import { abrirGaveta, abrirDados, abrirPagina, escolherAba, lancar, ok, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p, "", { visaoAjustada: true });

const abaLateral = () => p.locator("#chat").evaluate((el) => (el.classList.contains("aba-bolsa") ? "bolsa" : "chat"));
const abaBolsa = () => p.locator("#bolsa").evaluate((el) => (el.classList.contains("aba-fichas") ? "fichas" : "tokens"));
const recolhida = (id) => p.locator(id).evaluate((el) => el.classList.contains("recolhida"));
const estado = async () => ({ lateral: await abaLateral(), bolsa: await abaBolsa(), desenho: !(await recolhida("#ferramentas-desenho")), iniciativa: !(await recolhida("#iniciativa")), dados: !(await recolhida("#dados")) });
const recarregar = async () => {
    await p.reload();
    await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
    await p.waitForTimeout(500);
};

// 1) o padrão de fábrica
const padrao = await estado();
ok("1) padrão: coluna da direita na BOLSA (aba Tokens), gavetas e barra de dados RECOLHIDAS", padrao.lateral === "bolsa" && padrao.bolsa === "tokens" && !padrao.desenho && !padrao.iniciativa && !padrao.dados, JSON.stringify(padrao));

// 2) muda tudo e recarrega
await p.click("#bolsa-aba-fichas");
await abrirGaveta(p, "desenho");
await abrirDados(p);
await recarregar();
const depois1 = await estado();
ok("2a) a aba da bolsa (Fichas) é lembrada", depois1.bolsa === "fichas", JSON.stringify(depois1));
ok("2b) a gaveta do Desenho aberta é lembrada (e as outras continuam recolhidas)", depois1.desenho && !depois1.iniciativa, JSON.stringify(depois1));
ok("2c) a barra de dados aberta é lembrada", depois1.dados);

// 3) a aba da coluna da direita (Chat) e a troca de gaveta (só uma aberta por vez)
await escolherAba(p, "chat");
await abrirGaveta(p, "iniciativa");
await recarregar();
const depois2 = await estado();
ok("3a) a aba 'Chat' da coluna da direita é lembrada", depois2.lateral === "chat", JSON.stringify(depois2));
ok("3b) abrir a Iniciativa FECHOU o Desenho (só uma aberta por vez), e isso também é lembrado", depois2.iniciativa && !depois2.desenho, JSON.stringify(depois2));

// 4) voltar ao que era também é lembrado
await escolherAba(p, "bolsa");
await p.click("#bolsa-aba-tokens");
await p.click("#iniciativa .cabecalho"); await p.waitForTimeout(450); // fecha a Iniciativa (`abrirGaveta` só abre)
await p.click("#dados-alternar"); await p.waitForTimeout(450); // fecha os dados
await recarregar();
const depois3 = await estado();
ok("4) mudar de volta (Bolsa, Tokens, gavetas e dados recolhidos) também é lembrado", depois3.lateral === "bolsa" && depois3.bolsa === "tokens" && !depois3.desenho && !depois3.iniciativa && !depois3.dados, JSON.stringify(depois3));

// 5) valores inválidos guardados são ignorados (volta ao padrão, sem erro)
await p.evaluate(() => { try { localStorage.setItem("tabuleirinho.lateral.aba", "lixo"); localStorage.setItem("tabuleirinho.dados.recolhido", "talvez"); } catch { /* sem armazenamento */ } });
await recarregar();
const depois4 = await estado();
ok("5) valores inválidos no armazenamento são ignorados (volta ao padrão)", depois4.lateral === "bolsa" && !depois4.dados, JSON.stringify(depois4));

ok("6) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
const codigo = terminar(erros);
await nav.close();
process.exitCode = codigo;
