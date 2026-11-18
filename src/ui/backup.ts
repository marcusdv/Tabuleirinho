// =====================================================================
// O BOTÃO DE BACKUP DA CAMPANHA (aba Jogadores da bolsa; só o mestre): baixa do servidor um .zip com a pasta de dados (fichas, tokens, mapas, grupos, permissões...). O servidor confere
// que quem pede é o mestre (`GET /backup`, ver servidor/backup.ts). Sem servidor (modo local) não há o que baixar: tudo vive só nesta aba.
// =====================================================================

export interface OpcoesBackup {
    /** Há conexão com o servidor? */
    online(): boolean;
    /** Pergunta se a pessoa quer mesmo baixar (devolve true se sim). */
    confirmar(): Promise<boolean>;
    /** Mostra uma frase curta ao usuário (o cartão do canto). */
    avisar(texto: string): void;
}

export function criarBotaoBackup(opcoes: OpcoesBackup): void {
    const botao = document.getElementById("bolsa-backup") as HTMLButtonElement;
    botao.addEventListener("click", async () => {
        if (!opcoes.online()) return opcoes.avisar("O backup só existe no modo online: os dados da campanha ficam no servidor.");
        if (!(await opcoes.confirmar())) return;
        botao.disabled = true;
        const textoAntes = botao.textContent;
        botao.textContent = "Preparando…";
        try {
            const papel = new URLSearchParams(location.search).get("papel");
            const resposta = await fetch(`/backup${papel ? "?papel=" + encodeURIComponent(papel) : ""}`);
            if (!resposta.ok) {
                const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
                return opcoes.avisar(corpo?.erro ?? `O servidor recusou o backup (erro ${resposta.status}).`);
            }
            const arquivo = await resposta.blob();
            const nome = /filename="([^"]+)"/.exec(resposta.headers.get("content-disposition") ?? "")?.[1] ?? "tabuleirinho-backup.zip";
            const endereco = URL.createObjectURL(arquivo);
            const link = document.createElement("a");
            link.href = endereco;
            link.download = nome;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(endereco), 10000);
            opcoes.avisar(`Backup baixado: ${nome} (${(arquivo.size / 1048576).toFixed(1).replace(".", ",")} MB). Para restaurar, siga o LEIA-ME.txt que vem dentro do zip.`);
        } catch {
            opcoes.avisar("Não foi possível baixar o backup: sem conexão com o servidor.");
        } finally {
            botao.disabled = false;
            botao.textContent = textoAntes;
        }
    });
}
