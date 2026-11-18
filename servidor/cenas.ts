// =====================================================================
// AS CENAS: em que mapa cada um está (o mestre no `mapaAtual`; cada jogador no seu), quem pode ver cada mapa e o tamanho e a grade do tabuleiro de cada mapa.
// `comCenaDe` roda um pedido com a cena de quem pediu (o `estado` compartilhado guarda uma cena só: a do mestre).
// Separado do servidor.ts em 17/11/2026 (arquitetura).
// =====================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type GradeDaMesa, estado, limparGradeDaMesa } from "../src/estado.ts";
import type { RegistroDeMapa } from "../src/protocolo.ts";
import { acharMapa, esquecerConfigDosMapas, listaDeMapas } from "./mapas.ts";
import { PASTA_DE_DADOS } from "./dados.ts";
import { naFilaDeArquivos } from "./fila.ts";
import { type Conexao } from "./conexoes.ts";

// A BIBLIOTECA DE MAPAS (servidor/mapas.ts): `mapaAtual` é o id do mapa que todos veem (null = nenhum). Os mapas de EXEMPLO (os que vêm com o site) também entram UMA vez (marca `mapasDeExemplo` em mesa.json) e podem ser apagados.
export let mapaAtual: string | null = null;
/** Troca o mapa do MESTRE (o `mapaAtual`). Quem importa `mapaAtual` lê o valor novo na hora (é uma "ligação viva" do módulo). */
export function definirMapaDoMestre(id: string | null): void {
    mapaAtual = id;
}

/** O mapa `id` é visível para `c`? O mestre vê todos; os outros, o que o mestre liberou (todos os jogadores, ou os listados). Sem mapa (null) todos "veem". */
export function mapaVisivelPara(c: Conexao, id: string | null): boolean {
    if (id === null || c.mestre) return true;
    const q = acharMapa(id)?.quemVe;
    return !q || q.todos || q.usuarios.includes(c.usuario);
}

/**
 * O mapa em que `c` está AGORA (cada jogador tem o seu; pedido do dono, 17/11/2026): o mestre está sempre no `mapaAtual`; o jogador, no que ele escolheu ou para onde o mestre o levou ("Mover jogadores").
 * null = nenhum (ou um mapa que ele não pode ver: ele vê o tabuleiro vazio).
 */
export function mapaDaConexao(c: Conexao): string | null {
    if (c.mestre) return mapaAtual;
    return c.mapaVisto !== null && acharMapa(c.mapaVisto) && mapaVisivelPara(c, c.mapaVisto) ? c.mapaVisto : null;
}

/** O mapa onde cada USUÁRIO estava (para quem cai e volta continuar no mesmo mapa). */
export const mapaDoUsuario = new Map<string, string | null>();

export function irParaMapa(c: Conexao, id: string | null): void {
    c.mapaVisto = id;
    mapaDoUsuario.set(c.usuario, id);
}

// ---------------------------------------------------------------------
// A CONFIGURAÇÃO DE CADA CENA (o tamanho do tabuleiro e a grade), guardada num lugar só: `dados/cenas.json` (antes ficava espalhada pelo índice dos mapas).
// A chave é o id do mapa, ou "_" para "sem mapa". O que não está guardado vale o da mesa (o `estado`, que é a cena do mestre).
// ---------------------------------------------------------------------

export interface ConfigDaCena {
    colunas?: number;
    linhas?: number;
    grade?: GradeDaMesa;
}
const ARQUIVO_DAS_CENAS = join(PASTA_DE_DADOS, "cenas.json");
let cenas: Record<string, ConfigDaCena> = {};
const chaveDaCena = (id: string | null): string => id ?? "_";

/** O que está guardado para a cena deste mapa (pode faltar o tamanho, a grade ou os dois). */
export const configDaCena = (id: string | null): ConfigDaCena => cenas[chaveDaCena(id)] ?? {};

/** Grava `dados/cenas.json` (na fila de gravação; arquivo temporário + renomear, para nunca ficar pela metade). */
function gravarCenas(): void {
    const copia = JSON.stringify({ formato: 1, cenas }, null, 2);
    naFilaDeArquivos(async () => {
        await mkdir(PASTA_DE_DADOS, { recursive: true });
        const temporario = `${ARQUIVO_DAS_CENAS}.tmp`;
        await writeFile(temporario, copia);
        await rename(temporario, ARQUIVO_DAS_CENAS);
    });
}
/** Guarda o tamanho do tabuleiro desta cena (vale NA HORA; o arquivo é gravado logo depois). */
export function lembrarTamanhoDaCena(id: string | null, colunas: number, linhas: number): void {
    const c = (cenas[chaveDaCena(id)] ??= {});
    if (c.colunas === colunas && c.linhas === linhas) return;
    c.colunas = colunas;
    c.linhas = linhas;
    gravarCenas();
}
/** Guarda a grade (espessura e cor) desta cena. */
export function lembrarGradeDaCena(id: string | null, grade: GradeDaMesa): void {
    const c = (cenas[chaveDaCena(id)] ??= {});
    if (c.grade && c.grade.espessura === grade.espessura && c.grade.cor === grade.cor) return;
    c.grade = { ...grade };
    gravarCenas();
}
/** Esquece a cena de um mapa apagado. */
export function esquecerCena(id: string): void {
    if (!(id in cenas)) return;
    delete cenas[id];
    gravarCenas();
}
/** Os dados da cena junto ao registro do mapa (para a biblioteca que vai aos navegadores: o mestre sabe o tamanho guardado e não manda a previsão por cima). */
export const registroComCena = (m: RegistroDeMapa): RegistroDeMapa => ({ ...m, ...configDaCena(m.id) });

/**
 * Lê `dados/cenas.json` ao ligar o servidor (DEPOIS de `carregarMapas`). Sem o arquivo (servidor antigo), MIGRA: copia o tamanho e a grade que estavam no índice dos mapas e os tira de lá.
 * Entrada estragada é ignorada (vale o da mesa).
 */
export async function carregarCenas(): Promise<void> {
    let bruto: unknown;
    try {
        bruto = JSON.parse(await readFile(ARQUIVO_DAS_CENAS, "utf8"));
    } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`cenas.json ignorado: ${falha instanceof Error ? falha.message : "erro"}`);
        bruto = undefined;
    }
    cenas = {};
    const lidas = bruto && typeof bruto === "object" ? (bruto as { cenas?: unknown }).cenas : undefined;
    if (lidas && typeof lidas === "object") {
        for (const [chave, v] of Object.entries(lidas as Record<string, unknown>)) {
            if (!(chave === "_" || /^[0-9a-f]{16}$/.test(chave)) || !v || typeof v !== "object") continue;
            const x = v as Record<string, unknown>;
            const c: ConfigDaCena = {};
            if (Number.isSafeInteger(x.colunas) && Number.isSafeInteger(x.linhas) && (x.colunas as number) > 0 && (x.linhas as number) > 0) {
                c.colunas = x.colunas as number;
                c.linhas = x.linhas as number;
            }
            if (x.grade !== undefined) c.grade = limparGradeDaMesa(x.grade);
            cenas[chave] = c;
        }
    } else {
        // MIGRAÇÃO: o tamanho e a grade que o índice dos mapas guardava.
        for (const m of listaDeMapas()) {
            const c: ConfigDaCena = {};
            if (m.colunas !== undefined && m.linhas !== undefined) {
                c.colunas = m.colunas;
                c.linhas = m.linhas;
            }
            if (m.grade) c.grade = { ...m.grade };
            if (Object.keys(c).length > 0) cenas[m.id] = c;
        }
        gravarCenas();
        if (Object.keys(cenas).length > 0) console.log(`Cenas migradas do índice dos mapas para cenas.json (${Object.keys(cenas).length}).`);
    }
    await esquecerConfigDosMapas();
}

/** O tamanho do tabuleiro de um mapa: o guardado na cena dele, ou o da mesa. */
export function tamanhoDoMapa(id: string | null): { colunas: number; linhas: number } {
    const c = configDaCena(id);
    return c.colunas !== undefined && c.linhas !== undefined ? { colunas: c.colunas, linhas: c.linhas } : { colunas: estado.colunas, linhas: estado.linhas };
}

/** A grade (espessura e cor) de um mapa: a guardada na cena dele, ou a da mesa. Cada mapa tem a sua (pedido do dono, 17/11/2026). */
export function gradeDoMapa(id: string | null): GradeDaMesa {
    return configDaCena(id).grade ?? estado.grade;
}

/**
 * Roda `fazer` COM A CENA de quem pediu: o `estado` do servidor guarda um mapa e um tamanho de tabuleiro só (os do mestre); para o jogador que está em OUTRO mapa, troca por um instante o mapa, as
 * colunas e as linhas pelos dele (as peças que ele coloca nascem no mapa dele, e as posições são conferidas com o tabuleiro dele). É tudo síncrono, então ninguém vê a troca.
 */
export function comCenaDe(c: Conexao, fazer: () => void): void {
    if (c.mestre || !c.jogador) return fazer();
    const mapa = mapaDaConexao(c);
    const tamanho = tamanhoDoMapa(mapa);
    const salvo = { mapaId: estado.mapaId, colunas: estado.colunas, linhas: estado.linhas };
    estado.mapaId = mapa;
    estado.colunas = tamanho.colunas;
    estado.linhas = tamanho.linhas;
    try {
        fazer();
    } finally {
        estado.mapaId = salvo.mapaId;
        estado.colunas = salvo.colunas;
        estado.linhas = salvo.linhas;
    }
}
