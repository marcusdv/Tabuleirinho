// =====================================================================
// DESENHOS NO SERVIDOR (17/11/2026; pedido do dono): os desenhos (lápis e formas) de cada MAPA, compartilhados por todos. O servidor guarda `dados/desenhos.json` (um arquivo, gravado de forma atômica e
// com uma pequena espera, porque um traço novo pode chegar a toda hora), dá o id e o AUTOR de cada desenho e confere tudo que chega (`limparDesenho`, em estado.ts). Cada mapa tem os seus desenhos:
// ao trocar de mapa, aparecem os do mapa novo. Quem pode apagar: o mestre apaga todos; os outros, só os que eles mesmos fizeram.
// =====================================================================

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_DESENHOS_POR_MAPA } from "../src/config.ts";
import { limparDesenho, podeApagarDesenho, type Desenho, type NovoDesenho } from "../src/estado.ts";
import { PASTA_DE_DADOS } from "./dados.ts";

/** A chave de um mapa no arquivo: o id dele, ou "_" quando não há mapa. */
const chaveDoMapa = (mapa: string | null): string => mapa ?? "_";

const porMapa = new Map<string, Desenho[]>();
let proximoId = 1;
let gravacaoAgendada: ReturnType<typeof setTimeout> | null = null;
const CAMINHO = (): string => join(PASTA_DE_DADOS, "desenhos.json");

/** Lê `dados/desenhos.json` ao ligar o servidor (sem o arquivo, ou estragado, começa vazio; o arquivo estragado fica intacto). */
export async function carregarDesenhos(): Promise<void> {
    porMapa.clear();
    try {
        const bruto = JSON.parse(await readFile(CAMINHO(), "utf8")) as { proximoId?: unknown; mapas?: unknown };
        if (typeof bruto.mapas !== "object" || bruto.mapas === null) return;
        for (const [mapa, lista] of Object.entries(bruto.mapas as Record<string, unknown>)) {
            if (!Array.isArray(lista)) continue;
            const limpos: Desenho[] = [];
            for (const item of lista.slice(0, MAX_DESENHOS_POR_MAPA)) {
                const registro = item as Record<string, unknown>;
                const novo = limparDesenho(registro);
                if (!novo || typeof registro.id !== "number" || !Number.isSafeInteger(registro.id) || registro.id < 1) continue;
                limpos.push({ ...novo, id: registro.id, ...(typeof registro.autor === "string" && { autor: registro.autor.slice(0, 60) }) } as Desenho);
            }
            porMapa.set(mapa, limpos);
        }
        const maior = [...porMapa.values()].flat().reduce((m, d) => Math.max(m, d.id), 0);
        proximoId = Math.max(maior + 1, typeof bruto.proximoId === "number" && Number.isSafeInteger(bruto.proximoId) ? bruto.proximoId : 1);
    } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`desenhos.json ignorado: ${falha instanceof Error ? falha.message : "erro ao ler"}`);
    }
}

/** Grava `dados/desenhos.json` com o estado de AGORA (atômico). Nunca lança. */
export async function gravarDesenhos(): Promise<void> {
    gravacaoAgendada = null;
    const destino = CAMINHO();
    const temporario = `${destino}.${randomUUID()}.tmp`;
    try {
        await mkdir(PASTA_DE_DADOS, { recursive: true });
        await writeFile(temporario, JSON.stringify({ proximoId, mapas: Object.fromEntries(porMapa) }) + "\n", { encoding: "utf8", flush: true });
        await rename(temporario, destino);
    } catch (falha) {
        await unlink(temporario).catch(() => undefined);
        console.error("Não foi possível gravar desenhos.json:", falha);
    }
}
/** Pede para gravar daqui a pouco (vários traços seguidos viram uma gravação só). */
function agendarGravacao(): void {
    gravacaoAgendada ??= setTimeout(() => void gravarDesenhos(), 600);
}
/** Ao desligar o servidor: grava o que ainda estava esperando. */
export async function gravarDesenhosPendentes(): Promise<void> {
    if (gravacaoAgendada !== null) {
        clearTimeout(gravacaoAgendada);
        await gravarDesenhos();
    }
}

/** Os desenhos de um mapa (a lista de verdade: não mexa nela). */
export function desenhosDoMapa(mapa: string | null): Desenho[] {
    return porMapa.get(chaveDoMapa(mapa)) ?? [];
}

/** Guarda um desenho NOVO (já conferido) neste mapa, com id e autor. Devolve null se o mapa já está cheio. */
export function adicionarDesenhoNoMapa(mapa: string | null, novo: NovoDesenho, autor: string): Desenho | null {
    const lista = porMapa.get(chaveDoMapa(mapa)) ?? [];
    if (lista.length >= MAX_DESENHOS_POR_MAPA) return null;
    const desenho = { ...novo, id: proximoId++, autor } as Desenho;
    lista.push(desenho);
    porMapa.set(chaveDoMapa(mapa), lista);
    agendarGravacao();
    return desenho;
}

/** Apaga destes ids os que `usuario` pode apagar (o mestre, todos). Devolve os ids que de fato foram apagados. */
export function apagarDesenhosDoMapa(mapa: string | null, ids: number[], usuario: string, ehMestre: boolean): number[] {
    const lista = porMapa.get(chaveDoMapa(mapa)) ?? [];
    const apagados = lista.filter((d) => ids.includes(d.id) && podeApagarDesenho(d, usuario, ehMestre)).map((d) => d.id);
    if (apagados.length === 0) return [];
    porMapa.set(chaveDoMapa(mapa), lista.filter((d) => !apagados.includes(d.id)));
    agendarGravacao();
    return apagados;
}
