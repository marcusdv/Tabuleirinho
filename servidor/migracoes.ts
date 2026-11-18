// =====================================================================
// FORMATO DOS ARQUIVOS DE DADOS E AS MIGRAÇÕES, num lugar só (arquitetura, 17/11/2026).
//
// Todo arquivo que o servidor grava em `dados/` leva o campo `formato` (um número). Quando o jeito de guardar mudar, sobe-se `FORMATO_ATUAL` e acrescenta-se aqui UMA função que converte
// do formato anterior para o novo. Ao ler, cada arquivo passa pelas conversões que faltam, em ordem, e só então pela limpeza de sempre (`fichaValida`, `tokenValido`...).
// Arquivos de ANTES desta mudança não têm o campo: valem formato 0. Hoje 0 -> 1 não converte nada, porque as limpezas já aceitavam os arquivos antigos (campos que faltam valem o padrão).
// Um arquivo de formato MAIOR que o atual (gravado por uma versão mais nova do jogo) é recusado com um aviso, em vez de ser lido errado.
// =====================================================================

/** O formato que esta versão do servidor grava. */
export const FORMATO_ATUAL = 1;

export type TipoDeArquivo = "fichas" | "tokens" | "pecas" | "grupos" | "pastas" | "mesa";
type Migracao = (bruto: Record<string, unknown>) => Record<string, unknown>;

/** MIGRACOES[tipo][i] converte do formato i para o formato i + 1. */
const MIGRACOES: Record<TipoDeArquivo, Migracao[]> = {
    fichas: [(b) => b],
    tokens: [(b) => b],
    pecas: [(b) => b],
    grupos: [(b) => b],
    pastas: [(b) => b],
    mesa: [(b) => b],
};

/** Leva o conteúdo de um arquivo (já lido do JSON) ao formato atual e tira o campo `formato` (o resto do programa não o conhece). Lança erro se o formato é de uma versão mais nova. */
export function migrarArquivo(tipo: TipoDeArquivo, bruto: unknown): unknown {
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return bruto;
    let atual = { ...(bruto as Record<string, unknown>) };
    const formato = Number.isSafeInteger(atual.formato) ? (atual.formato as number) : 0;
    if (formato > FORMATO_ATUAL) throw new Error(`formato ${formato} é de uma versão mais nova do jogo (esta lê até o ${FORMATO_ATUAL})`);
    for (let f = formato; f < FORMATO_ATUAL; f++) atual = MIGRACOES[tipo][f](atual);
    delete atual.formato;
    return atual;
}

/** O objeto como vai para o disco: com o `formato` atual na frente. */
export const comFormato = <T extends object>(objeto: T): T & { formato: number } => ({ formato: FORMATO_ATUAL, ...objeto });
