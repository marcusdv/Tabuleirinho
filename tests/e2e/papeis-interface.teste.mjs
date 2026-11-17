// Teste e2e: A INTERFACE DOS PAPÉIS (modo LOCAL, sem servidor). Rodar: npm run test:e2e -- papeis-interface   (precisa do servidor: npm run dev)
//
// Decisão do dono (17/11/2026): o que o jogador não pode fazer é OCULTADO da interface. No modo local, `?papel=jogador` SIMULA o jogador (sem o parâmetro vale o mestre).
// Confere: as abas Mapas e Jogadores, as seções Colunas, Linhas e Mapa da barra, os botões da iniciativa, "+ Grupo" e a engrenagem do token só aparecem para o mestre; as ações
// "Adicionar à iniciativa" e "+ Nova ação" também; o jogador continua com "Add condição" (dano, cura e condição qualquer um aplica).
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const erros = [];

async function abrirComo(consulta) {
    const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
    p.on("pageerror", (e) => erros.push(String(e)));
    await abrirPagina(p, consulta, { gaveta: "tabuleiro" }); // (a gaveta Tabuleiro aberta: é onde ficam Colunas, Linhas e Mapa)
    await recolherDados(p);
    return p;
}
const visivel = (p, seletor) => p.locator(seletor).first().isVisible();

// ----- o mestre (padrão no modo local)
const m = await abrirComo("");
ok("1a) o mestre vê as abas Mapas e Jogadores", (await visivel(m, "#bolsa-aba-mapas")) && (await visivel(m, "#bolsa-aba-jogadores")));
ok("1b) ...as seções Colunas, Linhas e Mapa da barra", (await visivel(m, "#colunas-menos")) && (await visivel(m, "#linhas-menos")) && (await visivel(m, "#mapa-escolher")));
ok("1c) ...e a classe 'jogador' NÃO está ligada", !(await m.evaluate(() => document.body.classList.contains("jogador"))));
await m.click("#bolsa-aba-jogadores");
ok("1d) a aba Jogadores abre com a configuração dos limites (5 e 5 por padrão não vêm do servidor aqui, mas os campos existem)", (await visivel(m, "#bolsa-limite-tokens")) && (await visivel(m, "#bolsa-limites-salvar")));
await m.click("#bolsa-aba-tokens");

// ----- o jogador (simulado)
const j = await abrirComo("?papel=jogador");
ok("2a) o jogador NÃO vê as abas Mapas e Jogadores", !(await visivel(j, "#bolsa-aba-mapas")) && !(await visivel(j, "#bolsa-aba-jogadores")));
ok("2b) nem as seções Colunas, Linhas e Mapa", !(await visivel(j, "#colunas-menos")) && !(await visivel(j, "#linhas-menos")) && !(await visivel(j, "#mapa-escolher")));
ok("2c) nem os botões da iniciativa", !(await visivel(j, "#iniciativa-editar")) && !(await visivel(j, "#iniciativa-proxima")));
ok("2d) nem o '+ Grupo'", !(await visivel(j, "#bolsa-grupo-novo")));
ok("2e) a classe 'jogador' está ligada e o estado diz que não é mestre", (await j.evaluate(() => document.body.classList.contains("jogador"))) && (await j.evaluate(() => window.__tabuleirinho.estado.mestre)) === false);

// o menu de um token: clique direito (os tokens de teste não têm nível, então não há engrenagem)
const caixa = await j.evaluate(() => { const t = window.__tabuleirinho.tokens.ancoraNaTela(1); return t; });
await j.mouse.click(caixa.x + caixa.largura / 2, caixa.y + caixa.largura / 2, { button: "right" });
await j.waitForSelector("#menu-grupo-mapa:not([hidden])", { timeout: 3000 });
const botoes = await j.locator("#menu-grupo-mapa > button").allInnerTexts();
ok("2f) o jogador vê 'Add condição' no painel (Dano e Cura aparecem quando o token tem status; os tokens de teste não têm)", botoes.some((t) => /Add condição/.test(t)), botoes.join("|"));
ok("2g) mas não vê 'Adicionar à iniciativa' nem '+ Nova ação'", !botoes.some((t) => /iniciativa/i.test(t)) && !botoes.some((t) => /Nova ação/.test(t)), botoes.join("|"));
ok("2h) e a engrenagem (configurações) não aparece num token que não é dele", !(await visivel(j, "#engrenagem")));

await nav.close();
process.exitCode = terminar(erros); // (o executor lê o código de saída)
