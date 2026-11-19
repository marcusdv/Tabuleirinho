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
// As fichas de EXEMPLO (Goblin e Thorin) que o servidor cria na primeira vez ficam desligadas nos testes: eles contam fichas e tokens e esperam a mesa vazia.
process.env.SEM_EXEMPLOS ??= "1";

export async function abrirPagina(p, consulta = "", { ordemPadrao = false, manterAtrasoDasRolagens = false, gaveta = null, aba = null, dados = false, visaoAjustada = false, tamanhoDoApp = false } = {}) {
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
    // O app abre com o tabuleiro 25 × 22; a maioria dos testes foi escrita para 18 × 10 (e calcula as casas assim), então por padrão deixamos 18 × 10 (só no modo local; online o tamanho é do servidor).
    // `tamanhoDoApp: true` deixa o tamanho de abertura do app.
    if (!tamanhoDoApp && !consulta.includes("online")) await p.evaluate(() => window.__tabuleirinho.definirTamanho(18, 10));
    // O app abre com o mapa AJUSTADO à área livre (entre as barras e a coluna da direita), em zoom < 100%. Os testes calculam as casas supondo zoom 100% com o tabuleiro centralizado na
    // janela, então por padrão voltamos a essa visão; `visaoAjustada: true` deixa a visão de abertura do app (o teste `voltar-ao-padrao` e afins).
    if (!visaoAjustada) await p.evaluate(() => { window.__tabuleirinho.camera.aplicarZoom(1); window.__tabuleirinho.camera.centralizar(); });
    // Opções para o que o teste precisa à vista (o app abre com tudo recolhido e na aba Bolsa): `gaveta` = "desenho" | "tabuleiro", `aba` = "chat" | "bolsa", `dados` = abrir a barra de Dados.
    if (gaveta) await abrirGaveta(p, gaveta);
    if (aba) await escolherAba(p, aba);
    if (dados) await abrirDados(p);
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

/**
 * Abre uma barra da pilha da esquerda: "desenho" (o painel de Desenho, `#ferramentas-desenho`), "area" (o painel de Área, `#area`) ou "iniciativa" (`#iniciativa`); elas abrem PARA BAIXO e podem ficar abertas juntas.
 * "tabuleiro" (colunas, linhas, grade, mapa...) já NÃO é uma barra: vive na aba MAPAS da bolsa (só o mestre); então este atalho escolhe a bolsa e a aba Mapas (depois, para voltar
 * aos tokens, clique em `#bolsa-aba-tokens`). Tudo começa recolhido. Espera a animação terminar.
 */
export async function abrirGaveta(p, qual) {
    if (qual === "tabuleiro") {
        if (!(await p.evaluate(() => document.getElementById("chat").classList.contains("aba-bolsa")))) await p.click("#lateral-aba-bolsa");
        if (!(await p.locator("#bolsa-aba-mapas").isVisible())) return; // (o jogador comum não tem a aba Mapas nem a janela do tabuleiro)
        await p.click("#bolsa-aba-mapas");
        // As configurações do tabuleiro abrem numa JANELA fora da coluna (no modo local, pelo botão "Configurar o tabuleiro"; online, pelo ⚙ de cada mapa).
        if (await p.evaluate(() => document.getElementById("mapas-tabuleiro").hidden)) await p.click("#bolsa-mapas-configurar");
        await p.waitForTimeout(150);
        return;
    }
    const caixa = qual === "desenho" ? "#ferramentas-desenho" : qual === "area" ? "#area" : "#iniciativa";
    if (await p.evaluate((c) => !document.querySelector(c).classList.contains("recolhida"), caixa)) return;
    await p.click(caixa + " .cabecalho");
    await p.waitForTimeout(450);
}

/** Escolhe a aba da coluna da direita: "chat" ou "bolsa". O app abre na BOLSA; os testes de chat precisam escolher "chat". */
export async function escolherAba(p, qual) {
    await p.click("#lateral-aba-" + qual);
    await p.waitForTimeout(150);
}

/** Abre a barra de DADOS do pé da coluna da direita (por padrão ela começa recolhida). Espera a animação. */
export async function abrirDados(p) {
    if (await p.evaluate(() => !document.getElementById("dados").classList.contains("recolhida"))) return;
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

/**
 * Esc na FICHA aberta. O Esc é em DUAS etapas: editando (o campo de texto à vista), o 1º Esc só volta para a visualização e o 2º fecha (ou abre a pergunta de
 * descartar, se há alterações); já na visualização, um Esc basta. Este ajudante aperta o que for preciso para chegar ao "fechar".
 */
export async function escNaFicha(p) {
    const editando = await p.locator("#editor-ficha-previa").isHidden();
    await p.keyboard.press("Escape");
    if (editando) await p.keyboard.press("Escape");
}

/** A versão em que o editor da ficha está ("Versão 3"): a tela não mostra mais o número, então vem do atributo `data-versao` do painel. */
export const versaoDaFicha = (p) => p.getAttribute("#editor-ficha-painel", "data-versao").then((v) => "Versão " + v);

/**
 * Escolhe uma cor num seletor de cor do site como uma pessoa faria: abre a caixa do seletor (o botão que fica logo antes do campo nativo escondido), digita o código "#rrggbb" e fecha.
 * `campo` é o seletor CSS do <input type="color"> (ex.: "#desenho-cor").
 */
export async function definirCor(p, campo, hex) {
    const botao = p.locator(campo).locator("xpath=preceding-sibling::button[contains(@class,'seletor-cor-botao')][1]");
    await botao.click();
    const codigo = p.locator(".seletor-cor-codigo");
    await codigo.fill(hex);
    await codigo.press("Tab"); // (sair do campo dispara a mudança)
    await botao.click(); // fecha a caixa
}

/**
 * TRAVA DE SEGURANÇA dos testes que sobem o PRÓPRIO servidor numa porta fixa (rede, fichas-online, fichas-online-excluir, mapas-online: porta 3737): se a porta JÁ está em uso (quase sempre é o
 * servidor do DONO, com a campanha dele), o teste NÃO RODA: ele falaria com o servidor errado e poderia criar e apagar coisas nos dados reais. Sai com código 0 e avisa o motivo.
 * Chamar ANTES de subir o servidor: `await exigirPortaLivre(PORTA);`
 */
export async function exigirPortaLivre(porta) {
    const { createConnection } = await import("node:net");
    const ocupada = await new Promise((resolver) => {
        const c = createConnection({ port: porta, host: "127.0.0.1" });
        c.once("connect", () => { c.destroy(); resolver(true); });
        c.once("error", () => resolver(false));
    });
    if (ocupada) {
        console.log(`PULADO: a porta ${porta} já está em uso (provavelmente o servidor do dono). Este teste sobe o próprio servidor nela e NÃO deve falar com um servidor de verdade; desligue o servidor e rode de novo.`);
        process.exit(0);
    }
}
