// =====================================================================
// AJUDA DOS TESTES E2E (ponta a ponta): o que todos os testes usam.
// Os testes abrem o site num Chrome sem janela e clicam, arrastam e digitam como uma pessoa.
//
// Para rodar: com o servidor de desenvolvimento ligado (`npm run dev`), em outro terminal:
//     npm run test:e2e                 roda todos
//     npm run test:e2e -- chat bolsa   roda só os testes com esses nomes
// Variáveis opcionais: CHROME_PATH (caminho do Chrome), URL_TESTE (endereço do site).
// =====================================================================

import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const URL_SITE = process.env.URL_TESTE ?? "http://127.0.0.1:5173/";

/** Onde os testes salvam capturas de tela (para você olhar quando algo falha). Fora do projeto. */
export const CAPTURAS = join(tmpdir(), "tabuleirinho-capturas");
mkdirSync(CAPTURAS, { recursive: true });

/** Pasta dos mapas de verdade (para os testes que escolhem um arquivo de imagem). */
export const PASTA_MAPAS = fileURLToPath(new URL("../../public/images/maps/", import.meta.url));

/** Abre o Chrome sem janela. O WebGL é por software (sem placa de vídeo), por isso as flags. */
export function lancar() {
    return chromium.launch({
        executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
        headless: true,
        args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-gpu"],
    });
}

// Um mapa de teste: PNG liso de 64x64 (cinza-azulado). Carrega na hora, no lugar do mapa de verdade
// (vários MB), e uma cor lisa facilita achar tokens e desenhos pela cor, sem confusão com a imagem.
const MAPA_DE_TESTE = (() => {
    const png = new PNG({ width: 64, height: 64 });
    for (let i = 0; i < png.data.length; i += 4) png.data.set([0x30, 0x3a, 0x46, 0xff], i);
    return PNG.sync.write(png);
})();

/**
 * Abre o site na página `p` e espera ele avisar que está pronto (sem esperas fixas).
 * O mapa de verdade é trocado pelo mapa de teste; mapas escolhidos por arquivo (blob:) não são trocados.
 */
// O limite anti-spam do SERVIDOR (SEM_LIMITE_SPAM=1) fica desligado nos testes: eles rolam e escrevem muito rápido. Os servidores que os testes sobem herdam isto;
// o teste `limite-spam` o liga de volta. (Defina SEM_LIMITE_SPAM=0 antes de rodar para ver o limite valendo em qualquer teste.)
process.env.SEM_LIMITE_SPAM ??= "1";

export async function abrirPagina(p, consulta = "", { ordemPadrao = false, manterAtrasoDasRolagens = false } = {}) {
    // O app abre as listas da bolsa com os MAIS RECENTES primeiro. Quase todos os testes foram escritos para a ordem de criação (a mais antiga
    // primeiro), então por padrão fixamos essa ordem pela preferência guardada; `ordemPadrao: true` deixa a ordem de fábrica do app.
    if (!ordemPadrao) {
        await p.addInitScript(() => {
            try {
                localStorage.setItem("tabuleirinho.bolsa.ordem.tokens", "antigos");
                localStorage.setItem("tabuleirinho.bolsa.ordem.fichas", "antigos");
            } catch {
                /* sem armazenamento: a ordem de fábrica vale */
            }
        });
    }
    await p.route("**/images/maps/*.png", (rota) => rota.fulfill({ status: 200, contentType: "image/png", body: MAPA_DE_TESTE }));
    await p.goto(URL_SITE + consulta); // `consulta` = o que vem depois do endereço, ex.: "?online&nome=Ana" (modo online)
    await p.waitForFunction(() => window.__tabuleirinho?.pronto === true, null, { timeout: 30000 });
    // A pausa antes do resultado das rolagens (ATRASO_ROLAGEM_MS) é zerada nos testes, para não precisarem esperar; o teste `atraso-rolagem` a liga de volta.
    if (!manterAtrasoDasRolagens) await p.evaluate(() => { window.__tabuleirinho.atrasoRolagemMs = 0; });
    // A mesa COMEÇA VAZIA (os tokens vêm dos arquivos de dados/tokens/ do servidor, ou nascem pela bolsa). Os testes LOCAIS precisam
    // de tokens para mover, então "semeiam" estes 5 pelo gancho do `npm run dev`. No modo online os tokens vêm do servidor, e quem
    // testa prepara os arquivos.
    if (!consulta.includes("online")) await p.evaluate((lista) => window.__tabuleirinho.semear(lista), TOKENS_DE_TESTE);
}

/**
 * Recolhe o painel de Dados (que por padrão fica aberto no alto da tela, em x 176 a 528 e y 12 a 206): testes que arrastam ou clicam no MAPA
 * nessa faixa cairiam em cima dele. Recolhido, sobra só o cabeçalho (y 12 a ~47). Espera a animação de recolher terminar.
 */
export async function recolherDados(p) {
    if (await p.evaluate(() => document.getElementById("dados")?.classList.contains("recolhida"))) return;
    await p.click("#dados-alternar");
    await p.waitForTimeout(450);
}

/** Os 5 tokens que os testes locais usam (os mesmos que o app tinha ao abrir, antes de os tokens virarem arquivos). Só existem AQUI. */
export const TOKENS_DE_TESTE = [
    { id: 1, nome: "Token 1", imagem: null, col: 3, row: 3, cor: 0x2ecc71, corBorda: 0xffffff, size: 1, guardado: false },
    { id: 2, nome: "Token 2", imagem: null, col: 6, row: 5, cor: 0x3498db, corBorda: 0xffffff, size: 1, guardado: false },
    { id: 3, nome: "Token 3", imagem: null, col: 15, row: 1, cor: 0xf098fb, corBorda: 0xffffff, size: 1, guardado: false },
    { id: 4, nome: "Token 4", imagem: null, col: 10, row: 2, cor: 0xe74c3c, corBorda: 0xffffff, size: 2, guardado: false },
    { id: 5, nome: "Token 5", imagem: null, col: 12, row: 6, cor: 0x9b59b6, corBorda: 0xffffff, size: 1, guardado: false },
];

/** Lê o estado do app direto (sem medir pixels). Ex.: await lerEstado(p, (e) => e.tokens[0].col). */
export function lerEstado(p, funcao) {
    return p.evaluate(`(${funcao.toString()})(window.__tabuleirinho.estado)`);
}

/** Lê a câmera do app direto. Ex.: await lerCamera(p, (c) => c.zoom). */
export function lerCamera(p, funcao) {
    return p.evaluate(`(${funcao.toString()})(window.__tabuleirinho.camera)`);
}

// ---------------------------------------------------------------- resultados
let falhas = 0;
/** Registra uma verificação: imprime PASS/FAIL e conta as falhas. */
export function ok(nome, condicao, detalhe = "") {
    if (!condicao) falhas++;
    console.log(`${condicao ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
}

/** Imprime o resumo e devolve o código de saída (0 = tudo certo). */
export function terminar(erros = []) {
    console.log("---");
    console.log("erros de JS:", erros.length ? erros : "nenhum");
    console.log(falhas ? `${falhas} FALHA(S)` : "TUDO OK");
    return falhas ? 1 : 0;
}

export const perto = (a, b, tolerancia = 2) => Math.abs(a - b) <= tolerancia;
export const cruza = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const centro = (caixa) => ({ x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 });

/**
 * Clica em "+ Criar ficha" e FECHA a janela da ficha que agora abre sozinha (o editor flutuante cobriria a bolsa nos cliques seguintes).
 * Espera a janela aparecer um instante (online ela abre quando o servidor responde). Uma ficha vazia e sem alterações fecha sem perguntar.
 */
export async function criarFichaFechada(p) {
    await p.click("#bolsa-ficha-criar-botao");
    await p.waitForSelector("#editor-ficha:not([hidden])", { timeout: 1500 }).catch(() => {});
    if (await p.locator("#editor-ficha").isVisible()) await p.click("#editor-ficha-x");
}
