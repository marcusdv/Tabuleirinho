// =====================================================================
// O FOG (névoa de guerra) DE CADA MAPA no servidor (ver `src/fog.ts` para a máscara e o pincel). Só o MESTRE o edita (os pedidos conferem isso em servidor.ts); aqui ficam o estado, a
// gravação em `dados/fog.json` (debounce de 1 s: o mestre pinta muitas pinceladas por segundo) e a pergunta "este ponto está sob o fog?", que a visão (servidor/visao.ts) usa para
// esconder dos jogadores as peças e os desenhos sob o fog. A chave é o id do mapa, ou "_" para "sem mapa".
// =====================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cobertoEm, mascaraDoTexto, mascaraParaTexto, novaMascara, pintarTraco, preencherMascara, SUB_FOG, type MascaraDeFog, type TracoDeFog } from "../src/fog.ts";
import { PASTA_DE_DADOS } from "./dados.ts";
import { naFilaDeArquivos } from "./fila.ts";
import { comFormato } from "./migracoes.ts";

export interface FogDoMapa {
    ativo: boolean;
    mascara: MascaraDeFog;
}

const ARQUIVO_DO_FOG = join(PASTA_DE_DADOS, "fog.json");
const fogs = new Map<string, FogDoMapa>();
const chave = (id: string | null): string => id ?? "_";

export const fogDoMapa = (id: string | null): FogDoMapa | undefined => fogs.get(chave(id));
/** Algum mapa tem fog LIGADO? (barata: quem chama evita trabalho quando ninguém usa fog) */
export const algumFogAtivo = (): boolean => [...fogs.values()].some((f) => f.ativo);
/** O ponto (em casas) está sob o fog LIGADO deste mapa? Sem fog (ou desligado): nunca. */
export function sobOFog(id: string | null, col: number, row: number): boolean {
    const f = fogs.get(chave(id));
    return !!f && f.ativo && cobertoEm(f.mascara, col, row);
}

let gravacaoAgendada: ReturnType<typeof setTimeout> | null = null;
function agendarGravacao(): void {
    if (gravacaoAgendada) clearTimeout(gravacaoAgendada);
    gravacaoAgendada = setTimeout(gravarFogAgora, 1000);
}
/** Grava `dados/fog.json` já (também ao desligar o servidor e antes do backup). */
export function gravarFogAgora(): void {
    if (gravacaoAgendada) clearTimeout(gravacaoAgendada);
    gravacaoAgendada = null;
    const mapas: Record<string, { ativo: boolean; colunas: number; linhas: number; bits: string }> = {};
    for (const [id, f] of fogs) mapas[id] = { ativo: f.ativo, colunas: f.mascara.colunas, linhas: f.mascara.linhas, bits: mascaraParaTexto(f.mascara) };
    const texto = JSON.stringify(comFormato({ mapas }));
    naFilaDeArquivos(async () => {
        await mkdir(PASTA_DE_DADOS, { recursive: true });
        const temporario = `${ARQUIVO_DO_FOG}.tmp`;
        await writeFile(temporario, texto);
        await rename(temporario, ARQUIVO_DO_FOG);
    });
}

/** LIGA o fog de um mapa (com `colunas` × `linhas`, o tamanho do tabuleiro dele). Sem fog antes (ou com o tabuleiro de outro tamanho), nasce uma máscara nova: toda coberta, ou toda revelada. */
export function ativarFog(id: string | null, colunas: number, linhas: number, cobrirTudo: boolean): FogDoMapa {
    let f = fogs.get(chave(id));
    if (!f || f.mascara.colunas !== colunas || f.mascara.linhas !== linhas) {
        f = { ativo: true, mascara: novaMascara(colunas, linhas, cobrirTudo) };
        fogs.set(chave(id), f);
    } else {
        f.ativo = true; // (já havia uma máscara: a pintura do mestre é mantida)
        if (cobrirTudo) preencherMascara(f.mascara, true);
    }
    agendarGravacao();
    return f;
}
/** DESLIGA o fog (a máscara é guardada: ligar de novo volta ao que estava). */
export function desativarFog(id: string | null): void {
    const f = fogs.get(chave(id));
    if (f) {
        f.ativo = false;
        agendarGravacao();
    }
}
export function pintarFog(id: string | null, tracos: readonly TracoDeFog[]): boolean {
    const f = fogs.get(chave(id));
    if (!f || !f.ativo) return false;
    for (const t of tracos) pintarTraco(f.mascara, t);
    agendarGravacao();
    return true;
}
export function preencherFog(id: string | null, cobrir: boolean): boolean {
    const f = fogs.get(chave(id));
    if (!f || !f.ativo) return false;
    preencherMascara(f.mascara, cobrir);
    agendarGravacao();
    return true;
}
/**
 * O tabuleiro do mapa mudou de tamanho: a máscara acompanha (a pintura que cabe nos dois tamanhos é mantida; a parte NOVA nasce coberta). Devolve true se algo mudou
 * (quem chama avisa os navegadores).
 */
export function ajustarFogAoTamanho(id: string | null, colunas: number, linhas: number): boolean {
    const f = fogs.get(chave(id));
    if (!f || (f.mascara.colunas === colunas && f.mascara.linhas === linhas)) return false;
    const nova = novaMascara(colunas, linhas, true);
    const velha = f.mascara;
    const w = Math.min(velha.colunas, nova.colunas) * SUB_FOG;
    const h = Math.min(velha.linhas, nova.linhas) * SUB_FOG;
    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            if (!cobertoEm(velha, (px + 0.5) / SUB_FOG, (py + 0.5) / SUB_FOG)) pintarTraco(nova, { x: (px + 0.5) / SUB_FOG, y: (py + 0.5) / SUB_FOG, raio: 0.5 / SUB_FOG, cobrir: false });
        }
    }
    f.mascara = nova;
    agendarGravacao();
    return true;
}
/** O mapa foi apagado: o fog dele também. */
export function esquecerFog(id: string): void {
    if (fogs.delete(id)) agendarGravacao();
}

/** Lê `dados/fog.json` ao ligar o servidor (entrada estragada é ignorada). */
export async function carregarFog(): Promise<void> {
    fogs.clear();
    let bruto: unknown;
    try {
        bruto = JSON.parse(await readFile(ARQUIVO_DO_FOG, "utf8"));
    } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`fog.json ignorado: ${falha instanceof Error ? falha.message : "erro"}`);
        return;
    }
    const mapas = bruto && typeof bruto === "object" ? (bruto as { mapas?: unknown }).mapas : undefined;
    if (!mapas || typeof mapas !== "object") return;
    for (const [id, v] of Object.entries(mapas as Record<string, unknown>)) {
        if (!(id === "_" || /^[0-9a-f]{16}$/.test(id)) || !v || typeof v !== "object") continue;
        const x = v as Record<string, unknown>;
        const mascara = mascaraDoTexto(x.colunas as number, x.linhas as number, x.bits);
        if (mascara) fogs.set(id, { ativo: x.ativo === true, mascara });
    }
}
