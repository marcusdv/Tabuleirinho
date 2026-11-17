// =====================================================================
// BACKUP DA CAMPANHA (pedido do dono, 17/11/2026): entrega a pasta `dados/` inteira (fichas, tokens, peças, grupos, mapas com as imagens, desenhos, permissões e a mesa) como UM arquivo .zip.
// O formato ZIP é escrito aqui mesmo, SEM biblioteca nova: cada arquivo é guardado sem compressão ("stored": as imagens já são comprimidas), com o CRC-32 do Node (`zlib.crc32`). Os arquivos
// são lidos e enviados UM POR VEZ (a memória usada é a do maior arquivo, não a da campanha toda). Os nomes ficam em UTF-8 e sempre RELATIVOS à pasta (nunca saem dela).
// Restaurar é manual: descompactar o zip dentro da pasta `dados/` com o servidor desligado.
// =====================================================================

import { readdir, readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join, relative, sep } from "node:path";
import { crc32 } from "node:zlib";

/** Todos os arquivos de uma pasta (recursivo), com o caminho relativo usando "/" (como o ZIP exige). Pastas vazias não entram. */
async function listarArquivos(raiz: string, pasta = raiz): Promise<string[]> {
    const achados: string[] = [];
    for (const entrada of await readdir(pasta, { withFileTypes: true })) {
        const completo = join(pasta, entrada.name);
        if (entrada.isDirectory()) achados.push(...(await listarArquivos(raiz, completo)));
        else if (entrada.isFile()) achados.push(relative(raiz, completo).split(sep).join("/"));
    }
    return achados.sort();
}

/** Data e hora no formato do MS-DOS (o que o ZIP guarda). */
function dataDoZip(quando: Date): { hora: number; data: number } {
    return { hora: (quando.getHours() << 11) | (quando.getMinutes() << 5) | Math.floor(quando.getSeconds() / 2), data: ((Math.max(quando.getFullYear(), 1980) - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate() };
}

/** Escreve o .zip da pasta `raiz` na resposta HTTP (com o nome de arquivo sugerido para o download). */
export async function enviarBackup(resposta: ServerResponse, raiz: string, nomeDoArquivo: string, extras: { nome: string; texto: string }[] = []): Promise<void> {
    const arquivos = await listarArquivos(raiz);
    resposta.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${nomeDoArquivo}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
    });
    const escrever = (parte: Buffer): Promise<void> => new Promise((pronto) => (resposta.write(parte) ? pronto() : resposta.once("drain", () => pronto())));
    const central: Buffer[] = [];
    let deslocamento = 0;
    /** Escreve UM arquivo no zip (cabeçalho local + nome + conteúdo) e guarda a entrada do diretório central. */
    const adicionar = async (nome: string, conteudo: Buffer, quando: Date): Promise<void> => {
        const nomeBytes = Buffer.from(nome, "utf8");
        const { hora, data } = dataDoZip(quando);
        const soma = crc32(conteudo);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); // assinatura do cabeçalho local
        local.writeUInt16LE(20, 4); // versão necessária
        local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
        local.writeUInt16LE(0, 8); // método 0 = guardado, sem compressão
        local.writeUInt16LE(hora, 10);
        local.writeUInt16LE(data, 12);
        local.writeUInt32LE(soma, 14);
        local.writeUInt32LE(conteudo.length, 18);
        local.writeUInt32LE(conteudo.length, 22);
        local.writeUInt16LE(nomeBytes.length, 26);
        local.writeUInt16LE(0, 28);
        await escrever(local);
        await escrever(nomeBytes);
        await escrever(conteudo);
        const entrada = Buffer.alloc(46);
        entrada.writeUInt32LE(0x02014b50, 0); // assinatura da entrada do diretório central
        entrada.writeUInt16LE(20, 4);
        entrada.writeUInt16LE(20, 6);
        entrada.writeUInt16LE(0x0800, 8);
        entrada.writeUInt16LE(0, 10);
        entrada.writeUInt16LE(hora, 12);
        entrada.writeUInt16LE(data, 14);
        entrada.writeUInt32LE(soma, 16);
        entrada.writeUInt32LE(conteudo.length, 20);
        entrada.writeUInt32LE(conteudo.length, 24);
        entrada.writeUInt16LE(nomeBytes.length, 28);
        entrada.writeUInt32LE(deslocamento, 42);
        central.push(entrada, nomeBytes);
        deslocamento += 30 + nomeBytes.length + conteudo.length;
    };
    // O arquivo de INSTRUÇÕES vai primeiro (quem abre o zip o vê logo).
    for (const extra of extras) await adicionar(extra.nome, Buffer.from(extra.texto, "utf8"), new Date());
    for (const nome of arquivos) {
        try {
            await adicionar(nome, await readFile(join(raiz, nome)), (await stat(join(raiz, nome))).mtime);
        } catch {
            continue; // (o arquivo sumiu no meio do caminho: fica de fora)
        }
    }
    const diretorio = Buffer.concat(central);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0); // assinatura do fim do diretório central
    fim.writeUInt16LE(central.length / 2, 8);
    fim.writeUInt16LE(central.length / 2, 10);
    fim.writeUInt32LE(diretorio.length, 12);
    fim.writeUInt32LE(deslocamento, 16);
    await escrever(diretorio);
    await escrever(fim);
    resposta.end();
}

/** O texto do LEIA-ME que vai dentro do zip: o passo a passo de como aplicar o backup ao jogo (em tópicos). `contagens` e `dia` só enfeitam o cabeçalho. */
export function instrucoesDoBackup(dia: string, resumo: string): string {
    const linhas = [
        "BACKUP DA CAMPANHA - TABULEIRINHO",
        `Gerado em ${dia}`,
        resumo,
        "",
        "O QUE É ESTE ARQUIVO",
        "- Este .zip é uma cópia da pasta \"dados\" do servidor do jogo: fichas, tokens, peças, grupos, mapas (com as imagens), desenhos, permissões e as configurações da mesa.",
        "- NÃO inclui o chat, nem o mapa em que cada jogador está agora, nem quem está conectado.",
        "- NÃO inclui o programa do jogo: só os dados. Para usar em outro computador, instale o Tabuleirinho antes.",
        "",
        "COMO APLICAR O BACKUP AO JOGO (PASSO A PASSO)",
        "1. DESLIGUE o servidor do jogo (na janela onde ele roda, aperte Ctrl + C). Nunca restaure com o servidor ligado.",
        "2. Abra a pasta do jogo e ache a pasta \"dados\" (ela fica dentro da pasta do projeto, ao lado de \"src\" e \"servidor\").",
        "3. SE a pasta \"dados\" já tem uma campanha que você quer guardar, faça uma cópia dela antes (ex.: renomeie para \"dados-antiga\") e crie uma pasta \"dados\" vazia.",
        "4. Extraia TODO o conteúdo deste .zip para dentro da pasta \"dados\". Devem ficar, direto dentro dela: mesa.json, permissoes.json, desenhos.json e as pastas fichas, tokens, pecas, grupos e mapas.",
        "5. Confira que NÃO ficou uma pasta extra no meio (ex.: dados/tabuleirinho-backup/mesa.json está ERRADO; o certo é dados/mesa.json).",
        "6. Ligue o servidor de novo (npm run servidor). No terminal deve aparecer quantas fichas, tokens e grupos foram carregados.",
        "7. Abra o jogo no navegador como mestre e confira se a campanha voltou (fichas, tokens, mapas e grupos).",
        "8. Se der certo, pode apagar este arquivo LEIA-ME.txt de dentro da pasta \"dados\" (ele é só uma instrução e o jogo o ignora).",
        "",
        "SE A PASTA DE DADOS FICA EM OUTRO LUGAR",
        "- Extraia o zip em qualquer pasta nova e ligue o servidor apontando para ela: DADOS=/caminho/da/pasta npm run servidor",
        "",
        "DICAS",
        "- Faça backup antes de mudanças grandes e guarde o .zip em outro lugar (nuvem ou pen drive), não só no computador do servidor.",
        "- O arquivo pode ficar grande por causa das imagens dos mapas.",
        "- Se algo não carregar, veja as mensagens no terminal do servidor e confira os nomes das pastas.",
        "",
    ];
    return linhas.join("\r\n");
}
