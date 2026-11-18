// =====================================================================
// ACESSO (SERVIDOR): o documento de PERMISSÕES (`dados/permissoes.json`) e as perguntas que o servidor faz a ele ("este usuário pode ver/mover/editar/excluir?").
// As regras puras (tipos, níveis, limpeza do que vem de fora) ficam em `src/permissoes.ts`, que é compartilhado; aqui só há o ESTADO do servidor e a gravação no disco.
// O arquivo é gravado do mesmo jeito dos outros: num temporário e depois renomeado (tudo ou nada). Se estiver estragado, o servidor o ignora com um aviso e o arquivo fica intacto.
// =====================================================================

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    limparPermissoes,
    limiteDoTipo,
    nivelNoItem,
    quantosDoDono,
    type NivelEfetivo,
    type Permissoes,
    type TipoDeItem,
} from "../src/permissoes.ts";
import { PASTA_DE_DADOS } from "./dados.ts";

/** O documento de permissões da mesa (na memória; o disco é a cópia). */
export let permissoes: Permissoes = limparPermissoes(null);

const CAMINHO = (): string => join(PASTA_DE_DADOS, "permissoes.json");

/** Lê `dados/permissoes.json` ao ligar o servidor (se não existe, começa vazio; se está estragado, avisa e começa vazio sem apagar nada). */
export async function carregarPermissoes(): Promise<void> {
    try {
        permissoes = limparPermissoes(JSON.parse(await readFile(CAMINHO(), "utf8")));
    } catch (falha) {
        permissoes = limparPermissoes(null);
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`permissoes.json ignorado: ${falha instanceof Error ? falha.message : "erro ao ler"}`);
    }
}

/** Grava `dados/permissoes.json` com o estado de AGORA (atômico). Nunca lança: um erro de disco só vira aviso no terminal. */
export async function gravarPermissoes(): Promise<void> {
    const destino = CAMINHO();
    const temporario = `${destino}.${randomUUID()}.tmp`;
    try {
        await mkdir(PASTA_DE_DADOS, { recursive: true });
        await writeFile(temporario, JSON.stringify(permissoes, null, 2) + "\n", { encoding: "utf8", flush: true });
        await rename(temporario, destino);
    } catch (falha) {
        await unlink(temporario).catch(() => undefined);
        console.error("Não foi possível gravar permissoes.json:", falha);
    }
}

/** O nível de `usuario` sobre um token (use o id do MODELO: as peças do tabuleiro seguem o modelo) ou uma ficha. */
export function nivelDoUsuario(tipo: TipoDeItem, id: number, usuario: string, gruposDoItem: readonly number[], pastasDoItem: readonly number[] = []): NivelEfetivo {
    return nivelNoItem(permissoes, tipo, id, usuario, gruposDoItem, pastasDoItem);
}

/** Guarda o DONO de um item recém-criado (null = item do mestre). */
export function definirDono(tipo: TipoDeItem, id: number, dono: string | null): void {
    permissoes[tipo][String(id)] = { dono, acessos: {} };
}

/** Esquece as permissões de um item excluído. */
export function esquecerItem(tipo: TipoDeItem, id: number): void {
    delete permissoes[tipo][String(id)];
}

/** O jogador ainda pode criar mais um item deste tipo? (Devolve o motivo de não poder, ou null.) */
export function motivoDoLimite(tipo: TipoDeItem, usuario: string): string | null {
    const limite = limiteDoTipo(permissoes, tipo);
    if (quantosDoDono(permissoes, tipo, usuario) < limite) return null;
    const nome = tipo === "tokens" ? "tokens" : "fichas";
    return `Limite de ${limite} ${nome} por jogador atingido.`; // (sem frases sobre pedir ao mestre: pedido do dono, 17/11/2026)
}
