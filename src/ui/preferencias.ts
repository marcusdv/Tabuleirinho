// =====================================================================
// PREFERÊNCIAS DA INTERFACE guardadas no NAVEGADOR (localStorage): a aba da bolsa, se a barra de Ferramentas e o painel de Desenho estão
// recolhidos... São escolhas de cada pessoa neste navegador: não vão ao servidor nem aos outros jogadores. O armazenamento pode não existir
// (janela privada, dados do site bloqueados): então toda leitura e escrita é protegida e a interface funciona do mesmo jeito, só sem lembrar.
// As chaves ficam em config.ts.
// =====================================================================

/** Lê uma preferência (null se nunca foi guardada ou se o navegador não deixa ler). */
export function lerPreferencia(chave: string): string | null {
    try {
        return localStorage.getItem(chave);
    } catch {
        return null;
    }
}

/** Guarda uma preferência (sem erro se o navegador não deixar). */
export function guardarPreferencia(chave: string, valor: string): void {
    try {
        localStorage.setItem(chave, valor);
    } catch {
        /* sem armazenamento: tudo bem, só não vai lembrar */
    }
}
