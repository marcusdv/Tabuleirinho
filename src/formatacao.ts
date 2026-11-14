// FORMATAÇÃO DO TEXTO DA FICHA (puro: sem DOM, sem imports; dá para testar direto no Node).
//
// O texto da ficha continua sendo TEXTO PURO (é assim que vai para o arquivo e para a rede). A formatação são MARCAS escritas no próprio texto,
// no estilo Markdown, e este módulo só as LÊ e devolve DADOS (listas de blocos e pedaços). Ele NUNCA devolve HTML:
// quem desenha (ui/editorFicha.ts) cria cada elemento com `document.createElement` e põe o texto por `textContent`.
// Por isso um texto como "<img src=x onerror=...>" aparece como letras na tela e jamais é executado.
//
// Marcas (todas opcionais):
//   "# Título"        título de nível 1 (o maior) ... "### Título" nível 3 (o menor). Precisa de um espaço depois dos "#", no começo da linha.
//   "**texto**"       negrito
//   "*texto*"         itálico
//   "***texto***"     negrito e itálico
// Marca sem par (um "*" sozinho) fica como texto comum. Não há links, imagens nem HTML: só estas quatro coisas.

/** Um pedaço de uma linha, com o estilo dele. */
export interface PedacoFormatado {
    texto: string;
    negrito: boolean;
    italico: boolean;
}

/** Uma linha do texto: `nivel` 0 = parágrafo comum; 1 a 3 = título (1 é o maior). */
export interface LinhaFormatada {
    nivel: number;
    pedacos: PedacoFormatado[];
}

/** O maior nível de título (de "#" até "###"). */
export const NIVEL_MAX_TITULO = 3;

/** Lê uma linha e separa os pedaços em negrito / itálico. Linear: cada marca procura o seu par uma vez à frente. */
export function lerPedacos(linha: string): PedacoFormatado[] {
    const pedacos: PedacoFormatado[] = [];
    let comum = ""; // o texto sem estilo que está sendo juntado
    const soltarComum = (): void => {
        if (comum !== "") pedacos.push({ texto: comum, negrito: false, italico: false });
        comum = "";
    };
    let i = 0;
    while (i < linha.length) {
        if (linha[i] === "*") {
            // Da marca maior para a menor: "***", "**", "*".
            let achou = false;
            for (const [marca, negrito, italico] of [["***", true, true], ["**", true, false], ["*", false, true]] as const) {
                if (!linha.startsWith(marca, i)) continue;
                const fim = linha.indexOf(marca, i + marca.length);
                if (fim <= i + marca.length) continue; // sem par, ou vazio ("****"): não é marca
                soltarComum();
                pedacos.push({ texto: linha.slice(i + marca.length, fim), negrito, italico });
                i = fim + marca.length;
                achou = true;
                break;
            }
            if (achou) continue;
        }
        comum += linha[i];
        i += 1;
    }
    soltarComum();
    return pedacos;
}

/** Uma linha "NOME:: valor" é uma VARIÁVEL (mesma regra do motor, formulas.ts): variáveis NÃO têm formatação (decisão do dono), então ficam como texto puro. */
export const ehLinhaDeVariavel = (linha: string): boolean => /^\s*[\p{L}_][\p{L}\p{N}_]*\s*::/u.test(linha);

/** Lê o texto inteiro: uma `LinhaFormatada` para cada linha (linhas vazias ficam com a lista de pedaços vazia). */
export function formatarTexto(texto: string): LinhaFormatada[] {
    return texto.split("\n").map((linha) => {
        if (ehLinhaDeVariavel(linha)) return { nivel: 0, pedacos: [{ texto: linha, negrito: false, italico: false }] }; // (sem título, negrito nem itálico)
        const titulo = /^(#{1,3}) (.*)$/.exec(linha);
        if (titulo) return { nivel: titulo[1].length, pedacos: lerPedacos(titulo[2]) };
        return { nivel: 0, pedacos: lerPedacos(linha) };
    });
}
