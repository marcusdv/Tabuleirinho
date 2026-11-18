// =====================================================================
// A BIBLIOTECA DE MAPAS: as imagens que o MESTRE envia ao servidor, guardadas em `dados/mapas/<id>.<extensão>`, mais um índice (`dados/mapas/indice.json`) com o nome e o tamanho de cada uma.
// O mapa ATUAL da mesa é só um id desta biblioteca (guardado em `dados/mesa.json`); todos os navegadores baixam a imagem de `/mapas/<id>`.
//
// SEGURANÇA (uma imagem vem de uma pessoa, e uma imagem é um arquivo que o NAVEGADOR de todos vai abrir):
//   - O TIPO é conferido pelos PRIMEIROS BYTES (PNG, JPEG ou WebP), nunca pelo nome nem pelo tipo que o cliente diz. SVG, HTML, GIF e qualquer outra coisa são recusados.
//   - O TAMANHO em bytes tem limite (`MAX_BYTES_MAPA`), e o tamanho em PIXELS é lido do CABEÇALHO da imagem (`MAX_LADO_MAPA`): uma imagem pequena no arquivo pode ter bilhões de pixels e estourar a memória de todos.
//   - O nome do arquivo no disco é só o ID que ESTE módulo gera (16 caracteres hexadecimais): o nome que a pessoa dá é só um rótulo (texto), e nunca vira caminho.
//   - A biblioteca tem limite de quantidade e de espaço total (`MAX_MAPAS`, `MAX_BYTES_TOTAL_MAPAS`).
// Nada aqui usa `eval`, e nenhuma função lança erro para quem a chama: os problemas voltam como mensagem.
// =====================================================================

import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { MAX_BYTES_MAPA, MAX_BYTES_TOTAL_MAPAS, MAX_CARACTERES_NOME_MAPA, MAX_LADO_MAPA, MAX_MAPAS } from "../src/config.ts";
import { ID_DE_MAPA, type RegistroDeMapa } from "../src/protocolo.ts";
import { limparGradeDaMesa, type GradeDaMesa } from "../src/estado.ts";
import { PASTA_DE_DADOS } from "./dados.ts";

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
type TipoDeImagem = RegistroDeMapa["tipo"];

const PASTA_DOS_MAPAS = join(PASTA_DE_DADOS, "mapas");
const ARQUIVO_DO_INDICE = join(PASTA_DOS_MAPAS, "indice.json");
const EXTENSAO: Record<TipoDeImagem, string> = { png: "png", jpeg: "jpg", webp: "webp" };
export const TIPO_MIME: Record<TipoDeImagem, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

// ---------------------------------------------------------------------
// 1) Ler o tipo e as dimensões pelos BYTES
// ---------------------------------------------------------------------

/** O tipo e o tamanho em pixels de uma imagem, lidos do CABEÇALHO (sem decodificar a imagem). null se não é PNG, JPEG nem WebP, ou se o cabeçalho está truncado ou estranho. */
export function lerCabecalhoDaImagem(b: Buffer): { tipo: TipoDeImagem; largura: number; altura: number } | null {
    // PNG: assinatura de 8 bytes; o primeiro bloco é o IHDR, com a largura e a altura (4 bytes cada, big-endian) logo depois do nome do bloco.
    if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.toString("latin1", 12, 16) === "IHDR") {
        return { tipo: "png", largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
    }
    // JPEG: começa por FF D8 FF; as dimensões ficam num bloco "SOFn" (marcadores C0 a CF, menos C4, C8 e CC), depois de uma sequência de blocos com o tamanho de cada um.
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
        let i = 2;
        for (let voltas = 0; i + 9 < b.length && voltas < 4096; voltas++) {
            if (b[i] !== 0xff) return null;
            const marcador = b[i + 1];
            if (marcador === 0xff) { i += 1; continue; } // (bytes de enchimento)
            if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; } // (marcadores sem tamanho)
            const tamanho = b.readUInt16BE(i + 2);
            if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
                return { tipo: "jpeg", altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
            }
            if (tamanho < 2) return null;
            i += 2 + tamanho;
        }
        return null;
    }
    // WebP: "RIFF" + tamanho + "WEBP", e depois um bloco "VP8 " (com perda), "VP8L" (sem perda) ou "VP8X" (estendido), cada um guardando as dimensões de um jeito.
    if (b.length >= 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
        const bloco = b.toString("latin1", 12, 16);
        if (bloco === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { tipo: "webp", largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff };
        if (bloco === "VP8L" && b[20] === 0x2f) {
            const bits = b.readUInt32LE(21);
            return { tipo: "webp", largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1 };
        }
        if (bloco === "VP8X") return { tipo: "webp", largura: b.readUIntLE(24, 3) + 1, altura: b.readUIntLE(27, 3) + 1 };
    }
    return null;
}

/** Confere uma imagem de mapa (tipo, bytes e pixels). Devolve o tipo e as dimensões, ou a mensagem do que está errado. */
export function conferirImagem(bytes: Buffer): Resultado<{ tipo: TipoDeImagem; largura: number; altura: number }> {
    if (bytes.length === 0) return { ok: false, erro: "A imagem está vazia." };
    if (bytes.length > MAX_BYTES_MAPA) return { ok: false, erro: `Imagem grande demais (${(bytes.length / 1048576).toFixed(1)} MB): o máximo é ${MAX_BYTES_MAPA / 1048576} MB.` };
    const cabecalho = lerCabecalhoDaImagem(bytes);
    if (!cabecalho) return { ok: false, erro: "Só imagens PNG, JPEG ou WebP são aceitas." };
    const { largura, altura } = cabecalho;
    if (largura < 1 || altura < 1) return { ok: false, erro: "A imagem tem um tamanho inválido." };
    if (largura > MAX_LADO_MAPA || altura > MAX_LADO_MAPA) return { ok: false, erro: `Imagem grande demais (${largura}×${altura} px): cada lado pode ter no máximo ${MAX_LADO_MAPA} px.` };
    return { ok: true, valor: cabecalho };
}

// ---------------------------------------------------------------------
// 2) A biblioteca (índice em memória + arquivos no disco)
// ---------------------------------------------------------------------

let mapas: RegistroDeMapa[] = [];

export const listaDeMapas = (): RegistroDeMapa[] => mapas;
export const acharMapa = (id: string): RegistroDeMapa | undefined => (ID_DE_MAPA.test(id) ? mapas.find((m) => m.id === id) : undefined);
const arquivoDoMapa = (m: RegistroDeMapa): string => join(PASTA_DOS_MAPAS, `${m.id}.${EXTENSAO[m.tipo]}`);

/** O arquivo de um mapa (para servir), ou undefined se o id não é de um mapa da biblioteca. O caminho vem SEMPRE do registro (do id que o servidor gerou), nunca do texto do pedido. */
export function caminhoDoMapa(id: string): { caminho: string; tipo: TipoDeImagem; bytes: number } | undefined {
    const m = acharMapa(id);
    return m ? { caminho: arquivoDoMapa(m), tipo: m.tipo, bytes: m.bytes } : undefined;
}

/** Limpa o nome dado a um mapa: sem caracteres de controle, espaços juntados, no máximo `MAX_CARACTERES_NOME_MAPA`. Vazio vira "Mapa N". */
export function limparNomeDeMapa(texto: unknown): string {
    const limpo = typeof texto === "string" ? texto.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_NOME_MAPA).trim() : "";
    return limpo !== "" ? limpo : `Mapa ${mapas.length + 1}`;
}

async function gravarIndice(): Promise<void> {
    const temporario = `${ARQUIVO_DO_INDICE}.${process.pid}.tmp`;
    await writeFile(temporario, JSON.stringify(mapas, null, 2), "utf8");
    await rename(temporario, ARQUIVO_DO_INDICE); // (renomear é "tudo ou nada": o índice nunca fica pela metade)
}

/** Lê o índice do disco (criando a pasta se não existir). Entrada estragada, ou sem o arquivo da imagem, é ignorada com um aviso. */
export async function carregarMapas(): Promise<void> {
    await mkdir(PASTA_DOS_MAPAS, { recursive: true });
    mapas = [];
    let bruto: unknown = [];
    try {
        bruto = JSON.parse(await readFile(ARQUIVO_DO_INDICE, "utf8"));
    } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`mapas/indice.json ignorado: ${falha instanceof Error ? falha.message : "erro"}`);
    }
    if (!Array.isArray(bruto)) return;
    const arquivos = new Set(await readdir(PASTA_DOS_MAPAS));
    for (const x of bruto.slice(0, MAX_MAPAS)) {
        const m = x as Partial<RegistroDeMapa> | null;
        const valido =
            m && typeof m === "object" && typeof m.id === "string" && ID_DE_MAPA.test(m.id) && typeof m.nome === "string" && (m.tipo === "png" || m.tipo === "jpeg" || m.tipo === "webp") &&
            Number.isSafeInteger(m.largura) && Number.isSafeInteger(m.altura) && Number.isSafeInteger(m.bytes) && !mapas.some((o) => o.id === m.id);
        if (!valido) { console.warn("Um mapa do índice foi ignorado (entrada inválida)."); continue; }
        const q = m.quemVe as { todos?: unknown; usuarios?: unknown } | undefined;
        const quemVe = { todos: q?.todos !== false, usuarios: Array.isArray(q?.usuarios) ? (q.usuarios as unknown[]).filter((u): u is string => typeof u === "string" && /^[a-z0-9_-]{1,60}$/.test(u)).slice(0, 100) : [] }; // (sem o campo, todos veem)
        const registro = { id: m.id, nome: limparNomeDeMapa(m.nome), tipo: m.tipo, largura: m.largura as number, altura: m.altura as number, bytes: m.bytes as number, quemVe } as RegistroDeMapa;
        if (m.grade !== undefined) registro.grade = limparGradeDaMesa(m.grade);
        if (Number.isSafeInteger(m.colunas) && Number.isSafeInteger(m.linhas) && (m.colunas as number) > 0 && (m.linhas as number) > 0) { registro.colunas = m.colunas as number; registro.linhas = m.linhas as number; }
        if (!arquivos.has(`${registro.id}.${EXTENSAO[registro.tipo]}`)) { console.warn(`O mapa "${registro.nome}" foi ignorado: falta o arquivo da imagem.`); continue; }
        mapas.push(registro);
    }
}

/** Guarda um mapa novo: confere a imagem, o espaço e a quantidade, grava o arquivo (e o índice) e devolve o registro. */
export async function guardarMapa(bytes: Buffer, nome: unknown, visivelATodos = false): Promise<Resultado<RegistroDeMapa>> {
    const imagem = conferirImagem(bytes);
    if (!imagem.ok) return imagem;
    if (mapas.length >= MAX_MAPAS) return { ok: false, erro: `A biblioteca já tem ${MAX_MAPAS} mapas: apague algum antes.` };
    if (mapas.reduce((soma, m) => soma + m.bytes, 0) + bytes.length > MAX_BYTES_TOTAL_MAPAS) return { ok: false, erro: "A biblioteca de mapas está cheia (limite de espaço): apague algum antes." };
    let id = randomBytes(8).toString("hex");
    while (mapas.some((m) => m.id === id)) id = randomBytes(8).toString("hex");
    const registro: RegistroDeMapa = { id, nome: limparNomeDeMapa(nome), tipo: imagem.valor.tipo, largura: imagem.valor.largura, altura: imagem.valor.altura, bytes: bytes.length, quemVe: { todos: visivelATodos, usuarios: [] } }; // (um mapa ENVIADO nasce só para o MESTRE: ele libera depois; os de exemplo vêm liberados)
    try {
        await mkdir(PASTA_DOS_MAPAS, { recursive: true });
        await writeFile(arquivoDoMapa(registro), bytes);
        mapas = [...mapas, registro];
        await gravarIndice();
    } catch (falha) {
        mapas = mapas.filter((m) => m.id !== id);
        await unlink(arquivoDoMapa(registro)).catch(() => undefined);
        return { ok: false, erro: `Não foi possível guardar o mapa: ${falha instanceof Error ? falha.message : "erro"}` };
    }
    return { ok: true, valor: registro };
}

/** Muda quem vê um mapa e grava o índice. false se o id não existe. */
export async function definirQuemVeMapa(id: string, todos: boolean, usuarios: string[]): Promise<boolean> {
    const m = acharMapa(id);
    if (!m) return false;
    m.quemVe = { todos, usuarios };
    await gravarIndice().catch((falha) => console.warn(`Não foi possível gravar o índice dos mapas: ${falha instanceof Error ? falha.message : "erro"}`));
    return true;
}

/** Lembra NA HORA a grade (espessura e cor) deste mapa; e `definirGradeDoMapa` grava o índice. */
export function lembrarGradeDoMapa(id: string, grade: GradeDaMesa): void {
    const m = acharMapa(id);
    if (m) m.grade = { ...grade };
}
export async function definirGradeDoMapa(id: string, grade: GradeDaMesa): Promise<boolean> {
    const m = acharMapa(id);
    if (!m) return false;
    m.grade = { ...grade };
    await gravarIndice().catch((falha) => console.warn(`Não foi possível gravar o índice dos mapas: ${falha instanceof Error ? falha.message : "erro"}`));
    return true;
}

/** Lembra NA HORA (na memória) o tamanho do tabuleiro deste mapa; quem chama grava o índice depois (`definirTamanhoDoMapa`). */
export function lembrarTamanhoDoMapa(id: string, colunas: number, linhas: number): void {
    const m = acharMapa(id);
    if (m) {
        m.colunas = colunas;
        m.linhas = linhas;
    }
}

/** Guarda o tamanho do tabuleiro DESTE mapa (cada mapa tem o seu) e grava o índice. false se o id não existe. */
export async function definirTamanhoDoMapa(id: string, colunas: number, linhas: number): Promise<boolean> {
    const m = acharMapa(id);
    if (!m) return false;
    m.colunas = colunas;
    m.linhas = linhas;
    await gravarIndice().catch((falha) => console.warn(`Não foi possível gravar o índice dos mapas: ${falha instanceof Error ? falha.message : "erro"}`));
    return true;
}

/** Apaga um mapa (o arquivo e a entrada do índice). false se o id não existe. */
export async function apagarMapa(id: string): Promise<boolean> {
    const m = acharMapa(id);
    if (!m) return false;
    mapas = mapas.filter((x) => x.id !== id);
    await unlink(arquivoDoMapa(m)).catch(() => undefined);
    await gravarIndice().catch((falha) => console.warn(`Não foi possível gravar o índice dos mapas: ${falha instanceof Error ? falha.message : "erro"}`));
    return true;
}

/**
 * Cria os mapas de EXEMPLO (uma vez só: o servidor guarda a marca em mesa.json, e o dono pode apagá-los). Lê as imagens de `pasta` (a que vem com o site) e as guarda na biblioteca.
 * Devolve o id do que se chama "caverna" (que vira o mapa atual de uma mesa nova), ou do primeiro, ou null se não achou nada.
 */
export async function criarMapasDeExemplo(pasta: string): Promise<string | null> {
    let nomes: string[];
    try {
        nomes = (await readdir(pasta)).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort();
    } catch {
        return null; // (sem a pasta: nada a criar)
    }
    let inicial: string | null = null;
    for (const arquivo of nomes) {
        const bonito = basename(arquivo, extname(arquivo)).replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
        const resultado = await guardarMapa(await readFile(join(pasta, arquivo)), bonito, true);
        if (!resultado.ok) { console.warn(`Mapa de exemplo "${arquivo}" ignorado: ${resultado.erro}`); continue; }
        if (inicial === null || /caverna/i.test(arquivo)) inicial = resultado.valor.id;
    }
    return inicial;
}
