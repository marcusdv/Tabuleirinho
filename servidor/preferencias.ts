// =====================================================================
// AS PREFERÊNCIAS DE CADA USUÁRIO (hoje: os favoritos de tokens e fichas), num arquivo próprio: `dados/usuarios.json` (arquitetura, 17/11/2026).
// Antes ficavam dentro do `permissoes.json`, misturadas com acessos e banimentos; preferência não é permissão. Na primeira vez, os favoritos que estavam lá são MIGRADOS para cá
// (e o `permissoes.json` deixa de tê-los na próxima gravação).
// =====================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { idDeUsuarioValido, type TipoDeItem } from "../src/permissoes.ts";
import { PASTA_DE_DADOS } from "./dados.ts";
import { naFilaDeArquivos } from "./fila.ts";

interface PreferenciasDoUsuario {
    favoritos: { tokens: number[]; fichas: number[] };
}
const ARQUIVO_DOS_USUARIOS = join(PASTA_DE_DADOS, "usuarios.json");
let usuarios: Record<string, PreferenciasDoUsuario> = {};

const idsValidos = (v: unknown): number[] => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isSafeInteger(n) && n >= 1))].slice(0, 5000) : []);
/** Confere favoritos que vieram de FORA (arquivo editado à mão): usuário -> {tokens, fichas}. */
function limparFavoritos(bruto: unknown): Record<string, PreferenciasDoUsuario> {
    const limpo: Record<string, PreferenciasDoUsuario> = {};
    if (!bruto || typeof bruto !== "object") return limpo;
    for (const [usuario, f] of Object.entries(bruto as Record<string, unknown>)) {
        if (!idDeUsuarioValido(usuario) || !f || typeof f !== "object") continue;
        const x = f as Record<string, unknown>;
        limpo[usuario] = { favoritos: { tokens: idsValidos(x.tokens), fichas: idsValidos(x.fichas) } };
    }
    return limpo;
}

function gravarUsuarios(): void {
    const copia = JSON.stringify({ formato: 1, usuarios }, null, 2);
    naFilaDeArquivos(async () => {
        await mkdir(PASTA_DE_DADOS, { recursive: true });
        const temporario = `${ARQUIVO_DOS_USUARIOS}.tmp`;
        await writeFile(temporario, copia);
        await rename(temporario, ARQUIVO_DOS_USUARIOS);
    });
}

/** Lê `dados/usuarios.json` ao ligar o servidor. Sem ele, MIGRA os favoritos que estavam no `permissoes.json` (lido direto do disco). */
export async function carregarPreferencias(): Promise<void> {
    usuarios = {};
    try {
        const bruto = JSON.parse(await readFile(ARQUIVO_DOS_USUARIOS, "utf8")) as { usuarios?: Record<string, { favoritos?: unknown }> };
        const favoritos: Record<string, unknown> = {};
        for (const [u, p] of Object.entries(bruto.usuarios ?? {})) favoritos[u] = p?.favoritos;
        usuarios = limparFavoritos(favoritos);
        return;
    } catch (falha) {
        if ((falha as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`usuarios.json ignorado: ${falha instanceof Error ? falha.message : "erro"}`);
            return;
        }
    }
    try {
        const antigo = JSON.parse(await readFile(join(PASTA_DE_DADOS, "permissoes.json"), "utf8")) as { favoritos?: unknown };
        usuarios = limparFavoritos(antigo.favoritos);
        if (Object.keys(usuarios).length > 0) console.log(`Favoritos migrados do permissoes.json para usuarios.json (${Object.keys(usuarios).length} usuário(s)).`);
    } catch {
        // (sem permissoes.json: nada a migrar)
    }
    gravarUsuarios();
}

/** A estrela é de CADA usuário. */
export const ehFavoritoDe = (usuario: string, tipo: TipoDeItem, id: number): boolean => usuarios[usuario]?.favoritos[tipo].includes(id) === true;

export function definirFavoritoDe(usuario: string, tipo: TipoDeItem, id: number, valor: boolean): void {
    const meus = (usuarios[usuario] ??= { favoritos: { tokens: [], fichas: [] } }).favoritos;
    meus[tipo] = valor ? [...new Set([...meus[tipo], id])] : meus[tipo].filter((x) => x !== id);
    gravarUsuarios();
}
