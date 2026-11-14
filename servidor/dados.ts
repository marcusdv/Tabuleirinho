// =====================================================================
// DADOS NO DISCO: cada ficha e cada token é UM arquivo JSON (`dados/fichas/<id>.json`, `dados/tokens/<id>.json`), na máquina de
// quem controla o servidor.
//
// A PASTA `dados/` É DO DONO DO SERVIDOR (ele customiza o que há dentro e faz backup). As PASTAS (`dados/fichas/`,
// `dados/tokens/`) existem no projeto e no pacote que se distribui, para o servidor ter onde guardar os itens; mas o
// CONTEÚDO delas NÃO vai para o git, nem para o GitHub, nem para o download do usuário final (ver .gitignore). Dá para
// trocar a pasta de lugar com a variável DADOS (ex.: DADOS=/minha/pasta npm run servidor). O servidor só entrega ao
// navegador a pasta do SITE (dist/), nunca esta.
//
// GRAVAÇÃO ATÔMICA ("tudo ou nada"): gravar direto no arquivo é perigoso, porque se o computador cair no meio ele fica
// pela metade e corrompido. Por isso escrevemos primeiro num arquivo TEMPORÁRIO e, só quando terminou, o RENOMEAMOS para o
// nome definitivo. Renomear é instantâneo: o arquivo real sempre tem a versão antiga inteira ou a nova inteira.
//
// SEGURANÇA: o nome do arquivo é só o `id` (um número que o próprio servidor gera), nunca texto de um jogador, então não
// há como sair da pasta com "../". O nome da PASTA ("fichas", "tokens") é uma constante do código. Ao ligar, o que está no
// disco também é conferido (alguém pode ter editado à mão).
// =====================================================================

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A pasta de dados do servidor (fora do git). Padrão: `dados/` na raiz do projeto, ao lado de `servidor/`. */
export const PASTA_DE_DADOS = resolve(process.env.DADOS ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dados"));

/** As subpastas que existem (uma por tipo de item). */
export type NomeDaPasta = "fichas" | "tokens" | "grupos";

/** O único nome de arquivo aceito: um número inteiro positivo e ".json" (ex.: "7.json"). */
const NOME_DE_ARQUIVO = /^([1-9]\d{0,14})\.json$/;

const pastaDe = (nome: NomeDaPasta): string => join(PASTA_DE_DADOS, nome);

/**
 * Lê todos os itens de uma pasta (criando a pasta se não existir). `validar` confere o conteúdo de cada arquivo e devolve o item
 * limpo, ou null. Arquivo estragado, grande demais (`tamanhoMax`, em bytes) ou com id diferente do nome é ignorado, com um aviso.
 * Devolve também o MAIOR id que aparece nos nomes dos arquivos, ignorados inclusive: um arquivo ignorado continua no disco (o dono
 * pode querer consertá-lo à mão), então o id dele NÃO pode ser dado a um item novo, que o sobrescreveria.
 */
export async function carregarPasta<T extends { id: number }>(
    nome: NomeDaPasta,
    validar: (bruto: unknown) => T | null,
    tamanhoMax: number,
): Promise<{ itens: T[]; maiorId: number }> {
    const pasta = pastaDe(nome);
    await mkdir(pasta, { recursive: true });
    const itens: T[] = [];
    let maiorId = 0;
    for (const arquivo of await readdir(pasta)) {
        const caminho = join(pasta, arquivo);
        // Sobra de uma gravação interrompida (o arquivo temporário): pode apagar, o definitivo continua intacto.
        if (arquivo.endsWith(".tmp")) {
            await unlink(caminho).catch(() => undefined);
            continue;
        }
        const achou = NOME_DE_ARQUIVO.exec(arquivo);
        if (!achou) continue; // qualquer outro arquivo na pasta (como o .gitkeep) não é nosso: deixa quieto
        maiorId = Math.max(maiorId, Number(achou[1]));
        try {
            if ((await stat(caminho)).size > tamanhoMax) throw new Error("arquivo grande demais");
            const item = validar(JSON.parse(await readFile(caminho, "utf8")) as unknown);
            if (!item || item.id !== Number(achou[1])) throw new Error("conteúdo inválido ou id diferente do nome do arquivo");
            itens.push(item);
        } catch (falha) {
            console.warn(`Item ignorado (${nome}/${arquivo}): ${falha instanceof Error ? falha.message : "erro ao ler"}`);
        }
    }
    return { itens, maiorId };
}

/** Grava (ou sobrescreve) o arquivo do item, de forma atômica. Lança erro se não conseguir. */
export async function gravarNaPasta(nome: NomeDaPasta, item: { id: number }): Promise<void> {
    if (!Number.isSafeInteger(item.id) || item.id < 1) throw new Error("id inválido");
    const pasta = pastaDe(nome);
    await mkdir(pasta, { recursive: true });
    const destino = join(pasta, `${item.id}.json`);
    const temporario = `${destino}.${randomUUID()}.tmp`;
    try {
        // `flush: true` manda o conteúdo de fato para o disco antes de seguir (e só então renomeamos).
        await writeFile(temporario, JSON.stringify(item, null, 2) + "\n", { encoding: "utf8", flush: true });
        await rename(temporario, destino);
    } catch (falha) {
        await unlink(temporario).catch(() => undefined); // não deixa lixo para trás
        throw falha;
    }
}

/** Apaga o arquivo do item. Se ele já não existe (alguém apagou à mão), tudo bem. Lança erro nos outros problemas. */
export async function apagarDaPasta(nome: NomeDaPasta, id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("id inválido");
    await unlink(join(pastaDe(nome), `${id}.json`)).catch((falha: NodeJS.ErrnoException) => {
        if (falha.code !== "ENOENT") throw falha;
    });
}
