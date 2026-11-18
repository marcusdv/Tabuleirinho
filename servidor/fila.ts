// =====================================================================
// A FILA DE GRAVAÇÃO do servidor: toda escrita ou exclusão de arquivo passa por aqui, uma de cada vez e na ordem (dois pedidos seguidos nunca gravam o mesmo arquivo ao mesmo tempo).
// Separado do servidor.ts em 17/11/2026 (arquitetura).
// =====================================================================

import { resolve } from "node:path";

// Gravar e apagar arquivos envolve ESPERAR o disco. Para dois pedidos seguidos não se atropelarem (e os limites valerem), todas as
// operações de arquivo entram numa FILA e são feitas uma de cada vez, na ordem em que chegaram.
export let filaDeArquivos: Promise<void> = Promise.resolve();

export function naFilaDeArquivos(tarefa: () => Promise<void>): void {
    filaDeArquivos = filaDeArquivos.then(tarefa).catch((falha: unknown) => console.error("Erro ao gravar/apagar um arquivo:", falha));
}
