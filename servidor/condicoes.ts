// =====================================================================
// AS CONDIÇÕES DA MESA no servidor: a lista que o mestre edita (criar, editar, excluir; ver src/condicoes.ts) fica em `dados/condicoes.json`.
// Sem o arquivo (mesa nova) vale a lista de FÁBRICA, e o arquivo só passa a existir na 1ª vez que o mestre muda algo. Gravado na fila de arquivos,
// por arquivo temporário + renomear (nunca fica pela metade). O que está no arquivo é conferido na leitura (alguém pode ter editado à mão).
// =====================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONDICOES, CONDICOES_DE_FABRICA, copiarCondicoes, definirCondicoes, limparCondicoes } from "../src/condicoes.ts";
import { PASTA_DE_DADOS } from "./dados.ts";
import { naFilaDeArquivos } from "./fila.ts";
import { comFormato, migrarArquivo } from "./migracoes.ts";

const ARQUIVO_DAS_CONDICOES = join(PASTA_DE_DADOS, "condicoes.json");

/** Lê `dados/condicoes.json` ao ligar o servidor e põe a lista em uso. Sem o arquivo (ou com ele estragado) fica a lista de fábrica. */
export async function carregarCondicoes(): Promise<void> {
    let bruto: unknown;
    try {
        bruto = JSON.parse(await readFile(ARQUIVO_DAS_CONDICOES, "utf8"));
    } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`condicoes.json ignorado (vale a lista de fábrica): ${falha instanceof Error ? falha.message : "erro"}`);
        definirCondicoes(CONDICOES_DE_FABRICA);
        return;
    }
    try {
        const lista = limparCondicoes((migrarArquivo("condicoes", bruto) as { condicoes?: unknown }).condicoes);
        if (lista) {
            definirCondicoes(lista);
            console.log(`${lista.length} condição(ões) carregada(s) de ${ARQUIVO_DAS_CONDICOES}`);
            return;
        }
    } catch (falha) {
        console.warn(`condicoes.json ignorado (vale a lista de fábrica): ${falha instanceof Error ? falha.message : "erro"}`);
    }
    definirCondicoes(CONDICOES_DE_FABRICA);
}

/** Grava a lista de AGORA em `dados/condicoes.json` (na fila de gravação). */
export function gravarCondicoes(): void {
    const copia = JSON.stringify(comFormato({ condicoes: copiarCondicoes(CONDICOES) }), null, 2);
    naFilaDeArquivos(async () => {
        await mkdir(PASTA_DE_DADOS, { recursive: true });
        const temporario = `${ARQUIVO_DAS_CONDICOES}.tmp`;
        await writeFile(temporario, copia);
        await rename(temporario, ARQUIVO_DAS_CONDICOES);
    });
}
