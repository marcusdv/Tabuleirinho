// =====================================================================
// ATALHOS DE TECLADO de uma tecla só (a lista completa, com os de mouse, está em `docs/atalhos.md`; ao criar um atalho novo, acrescentar lá):
//   R  liga e desliga a régua (volta a Mover)
//   Q  abre e fecha a bolsa em tela cheia
// Não valem enquanto se digita num campo de texto, nem com Ctrl, Alt ou Cmd apertados (esses são do navegador e de outros atalhos).
// =====================================================================

export interface OpcoesAtalhos {
    /** R: liga a régua, ou volta a Mover se ela já estava ligada. */
    aoAlternarRegua(): void;
    /** Q: abre a bolsa em tela cheia, ou a fecha se já estava aberta. */
    aoAlternarBolsa(): void;
}

export function criarAtalhos(opcoes: OpcoesAtalhos): void {
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.defaultPrevented) return;
        const alvo = e.target as HTMLElement | null;
        if (alvo?.closest("input, textarea, select, [contenteditable=true], [contenteditable='']")) return; // (digitando: a letra é do texto)
        const tecla = e.key.toLowerCase();
        if (tecla === "r") {
            e.preventDefault();
            opcoes.aoAlternarRegua();
        } else if (tecla === "q") {
            e.preventDefault();
            opcoes.aoAlternarBolsa();
        }
    });
}
