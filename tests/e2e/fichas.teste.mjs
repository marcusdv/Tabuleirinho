// Teste e2e: aba FICHAS da bolsa, no modo LOCAL (sem servidor). Rodar: npm run test:e2e -- fichas.teste
// (precisa do servidor: npm run dev). Veja tests/e2e/ajuda.mjs. O lado do servidor (arquivos no disco) é do teste `fichas-servidor`.
//
// Cada clique em "+ Criar ficha" cria NA HORA uma ficha vazia ("Ficha N", versão 1) e ela aparece como um documento numa GRADE,
// organizada como a de tokens (5 por linha na bolsa do canto, a largura toda na tela cheia). O nome e o texto se definem depois,
// ao abrir a ficha (ainda não existe). Há um limite de MAX_FICHAS (200) fichas.
import { abrirPagina, lancar, ok, terminar } from "./ajuda.mjs";

const navegador = await lancar();
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);

const fichas = () => p.evaluate(() => window.__tabuleirinho.estado.fichas.map((f) => ({ id: f.id, nome: f.nome, texto: f.texto, versao: f.versao })));
const classe = async () => (await p.locator("#bolsa").getAttribute("class")) ?? "";
const topos = () => p.locator(".bolsa-doc").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));

// 1) a aba começa vazia
await p.click("#bolsa-aba-fichas");
ok("1a) a aba Fichas começa sem fichas e mostra 'Nenhuma ficha ainda.'", (await fichas()).length === 0 && (await p.locator("#bolsa-fichas-vazia").isVisible()) && (await p.locator(".bolsa-doc").count()) === 0);
ok("1b) o botão 'Criar ficha' está à vista e habilitado", (await p.locator("#bolsa-ficha-criar-botao").isVisible()) && (await p.isEnabled("#bolsa-ficha-criar-botao")));

// 2) um clique cria um documento na hora
await p.click("#bolsa-ficha-criar-botao");
const uma = await fichas();
ok("2a) um clique cria 1 ficha: 'Ficha 1', versão 1, texto vazio", uma.length === 1 && uma[0].id === 1 && uma[0].nome === "Ficha 1" && uma[0].versao === 1 && uma[0].texto === "", JSON.stringify(uma));
ok("2b) aparece 1 documento na grade, com o nome e 'v1'", (await p.locator(".bolsa-doc").count()) === 1 && (await p.locator(".bolsa-doc .bolsa-doc-nome").textContent()) === "Ficha 1" && (await p.locator(".bolsa-doc small").textContent()) === "v1");
ok("2c) o aviso de 'nenhuma ficha' some", !(await p.locator("#bolsa-fichas-vazia").isVisible()));
ok("2c2) na bolsa do canto o número da VERSÃO fica oculto (continua na dica do mouse) e o nome ocupa o espaço", !(await p.locator(".bolsa-doc small").isVisible()) && /versão 1/.test((await p.locator(".bolsa-doc").getAttribute("title")) ?? ""));
ok("2d) criar a ficha NÃO expande a bolsa (a bolsa do canto não expande ao clicar)", !(await classe()).includes("expandida"));

// 3) vários cliques: ids únicos e a grade como a de tokens (5 por linha)
for (let i = 0; i < 5; i++) await p.click("#bolsa-ficha-criar-botao");
const cinco = await fichas();
ok("3a) 5 fichas, com ids 1 a 5 e nomes 'Ficha 1' a 'Ficha 5'", cinco.map((f) => f.id).join() === "1,2,3,4,5" && cinco.every((f) => f.nome === `Ficha ${f.id}`), JSON.stringify(cinco.map((f) => f.nome)));
const t = await topos();
ok("3b) na bolsa do canto a grade tem 5 por linha (a sexta vai para a linha de baixo)", t.length === 6 && new Set(t.slice(0, 5)).size === 1 && t[5] > t[0], t.join());

// 4) a aba escolhida vale nos outros tamanhos, e a grade usa a largura toda na tela cheia
ok("4a) na bolsa do canto a aba Fichas continua aberta, com a grade e o botão", (await p.locator("#bolsa-fichas").isVisible()) && (await p.locator(".bolsa-doc").count()) === 5);
await p.click("#bolsa-gerenciar");
const t2 = await topos();
ok("4b) na tela cheia as 5 fichas cabem numa linha só (a grade usa a largura toda)", (await classe()).includes("expandida") && t2.length === 5 && new Set(t2).size === 1, t2.join());
ok("4c) na tela cheia o botão 'Criar ficha' continua à vista", await p.locator("#bolsa-ficha-criar-botao").isVisible());
ok("4d) e na tela cheia o número da VERSÃO aparece ao lado do nome", (await p.locator(".bolsa-doc small").first().isVisible()) && (await p.locator(".bolsa-doc small").first().textContent()) === "v1");

// 5) o limite de 200 fichas (cliques dados dentro da página, para ser rápido)
await p.evaluate(() => {
    const botao = document.getElementById("bolsa-ficha-criar-botao");
    for (let i = 0; i < 300 && !botao.disabled; i++) botao.click();
});
const todas = await fichas();
ok("5a) para em 200 fichas (MAX_FICHAS), com ids únicos", todas.length === 200 && new Set(todas.map((f) => f.id)).size === 200, String(todas.length));
ok("5b) no limite, o botão fica desabilitado e a dica explica", (await p.isDisabled("#bolsa-ficha-criar-botao")) && /200/.test((await p.locator("#bolsa-ficha-criar-botao").getAttribute("title")) ?? ""));
ok("5c) a grade mostra as 200", (await p.locator(".bolsa-doc").count()) === 200);

// 6) voltar para Tokens e para Fichas: as fichas continuam
await p.click("#bolsa-aba-tokens");
ok("6a) na aba Tokens as fichas de personagem não aparecem", (await p.locator("#bolsa-fichas").isHidden()) && (await p.locator("#bolsa-conteudo").isVisible()));
await p.click("#bolsa-aba-fichas");
ok("6b) voltando à aba Fichas, as 200 continuam lá", (await p.locator(".bolsa-doc").count()) === 200);

ok("7) nenhum erro de JavaScript durante o teste", erros.length === 0, erros.join(" | "));

const codigo = terminar(erros);
await navegador.close();
process.exitCode = codigo;
