// =====================================================================
// VARIÁVEIS E FÓRMULAS DAS FICHAS: lê o TEXTO de uma ficha e acha dois tipos de coisa.
//
//   VARIÁVEL   uma linha "NOME:: valor". O valor é uma conta que pode usar outras variáveis. Ex.:
//                  FOR:: 16
//                  PROF:: 3
//                  MOD_FOR:: (FOR - 10) / 2          (a divisão ARREDONDA PARA BAIXO, como no D&D: 15 dá 2 e 8 dá -1)
//
//   ROLAGEM    "(Nome)[fórmula]": o NOME entre parênteses (é o que aparece como referência visual, ex.: no menu do token) colado
//              à FÓRMULA entre colchetes. A fórmula mistura dados, números e variáveis. Sem nome, vale "[fórmula]". Só vira rolagem
//              o que tem um DADO dentro (1d20, 2d6, d8...): "[ ]" ou "[x]" num texto qualquer são ignorados. Ex.:
//                  (Ataque com espada)[1d20 + MOD_FOR + PROF]
//                  (Dano)[1d8 + MOD_FOR]
//
// SEGURANÇA (regras do BRAINSTORM.md): o texto vem de jogadores. Aqui NUNCA se usa `eval` nem `Function`: há um analisador próprio com
// uma gramática fechada (números, nomes de variáveis, dados, + - * / e parênteses; qualquer outro caractere é recusado). Tudo tem
// LIMITE (tamanho da fórmula, quantidade de variáveis e rolagens, profundidade, tamanho dos números, quantidade de dados), variáveis que
// dependem de si mesmas dão erro (não travam), e nenhuma função lança exceção: os problemas voltam como mensagens de erro.
//
// Este arquivo é COMPARTILHADO (o navegador mostra o resultado na ficha; o servidor vai usar o mesmo código para rolar): sem PixiJS, sem HTML.
// =====================================================================

import {
    DADOS_DISPONIVEIS,
    MAX_CARACTERES_FORMULA,
    MAX_CARACTERES_NOME_ROLAGEM,
    MAX_CARACTERES_NOME_VARIAVEL,
    MAX_PROFUNDIDADE_FORMULA,
    MAX_QUANTIDADE_DADOS,
    MAX_ROLAGENS_POR_FICHA,
    MAX_VALOR_FORMULA,
    MAX_VARIAVEIS_POR_FICHA,
} from "./config.ts";

// ---------------------------------------------------------------------
// 1) A conta, como uma árvore
// ---------------------------------------------------------------------

type Operador = "+" | "-" | "*" | "/";
export type No =
    | { tipo: "numero"; valor: number }
    | { tipo: "variavel"; nome: string } // sempre em MAIÚSCULAS (as variáveis não diferenciam maiúsculas de minúsculas)
    | { tipo: "dado"; quantidade: number; lados: number }
    | { tipo: "negativo"; dentro: No }
    | { tipo: "conta"; op: Operador; esquerda: No; direita: No };

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

// ---------------------------------------------------------------------
// 2) Leitura: texto -> pedaços (tokens)
// ---------------------------------------------------------------------

type Pedaco =
    | { tipo: "numero"; valor: number }
    | { tipo: "nome"; texto: string }
    | { tipo: "dado"; quantidade: number; lados: number }
    | { tipo: "simbolo"; texto: "+" | "-" | "*" | "/" | "(" | ")" };

// Cada regra começa no INÍCIO do que sobrou do texto (por isso o "^"). O "u" deixa "\p{L}" valer para qualquer letra (Força, Níveis).
const DADO = /^(\d*)[dD](\d+)(?![\p{L}\p{N}_])/u; // "d20", "2d6" (mas "DES" ou "D20X" não são dados)
const NUMERO = /^\d+/;
const NOME = /^[\p{L}_][\p{L}\p{N}_]*/u;

function ler(texto: string): Resultado<Pedaco[]> {
    if (texto.length > MAX_CARACTERES_FORMULA) return falha(`A conta passa de ${MAX_CARACTERES_FORMULA} caracteres.`);
    const pedacos: Pedaco[] = [];
    let resto = texto;
    while (resto.length > 0) {
        if (/^\s/.test(resto)) {
            resto = resto.slice(1);
            continue;
        }
        const dado = DADO.exec(resto);
        if (dado) {
            const quantidade = dado[1] === "" ? 1 : Number(dado[1]);
            if (dado[1].length > 3 || dado[2].length > 5) return falha("Número de dados ou de lados grande demais.");
            pedacos.push({ tipo: "dado", quantidade, lados: Number(dado[2]) });
            resto = resto.slice(dado[0].length);
            continue;
        }
        const numero = NUMERO.exec(resto);
        if (numero) {
            if (numero[0].length > 9) return falha("Número grande demais.");
            pedacos.push({ tipo: "numero", valor: Number(numero[0]) });
            resto = resto.slice(numero[0].length);
            continue;
        }
        const nome = NOME.exec(resto);
        if (nome) {
            if (nome[0].length > MAX_CARACTERES_NOME_VARIAVEL) return falha("Nome de variável comprido demais.");
            pedacos.push({ tipo: "nome", texto: nome[0] });
            resto = resto.slice(nome[0].length);
            continue;
        }
        const simbolo = resto[0];
        if ("+-*/()".includes(simbolo)) {
            pedacos.push({ tipo: "simbolo", texto: simbolo as "+" });
            resto = resto.slice(1);
            continue;
        }
        return falha(`Caractere não permitido: "${simbolo}".`); // qualquer outra coisa é recusada (nada de ponto, vírgula, aspas, colchetes...)
    }
    return { ok: true, valor: pedacos };
}

// ---------------------------------------------------------------------
// 3) Análise: pedaços -> árvore (descida recursiva, com os limites)
// ---------------------------------------------------------------------

/** Lê a conta inteira. Precedência: parênteses, depois * e /, depois + e -. */
export function analisarConta(texto: string): Resultado<No> {
    const lido = ler(texto);
    if (!lido.ok) return lido;
    const pedacos = lido.valor;
    if (pedacos.length === 0) return falha("A conta está vazia.");
    let posicao = 0;

    const espiar = (): Pedaco | undefined => pedacos[posicao];
    const eSimbolo = (p: Pedaco | undefined, ...opcoes: string[]): boolean => p?.tipo === "simbolo" && opcoes.includes(p.texto);

    function soma(profundidade: number): Resultado<No> {
        if (profundidade > MAX_PROFUNDIDADE_FORMULA) return falha("Conta complicada demais (parênteses ou operações demais).");
        let esquerda = produto(profundidade + 1);
        if (!esquerda.ok) return esquerda;
        while (eSimbolo(espiar(), "+", "-")) {
            const op = (pedacos[posicao++] as { texto: "+" | "-" }).texto;
            const direita = produto(profundidade + 1);
            if (!direita.ok) return direita;
            esquerda = { ok: true, valor: { tipo: "conta", op, esquerda: esquerda.valor, direita: direita.valor } };
            if (++operacoes > 2 * MAX_PROFUNDIDADE_FORMULA * 5) return falha("Conta comprida demais.");
        }
        return esquerda;
    }

    function produto(profundidade: number): Resultado<No> {
        if (profundidade > MAX_PROFUNDIDADE_FORMULA) return falha("Conta complicada demais (parênteses ou operações demais).");
        let esquerda = unario(profundidade + 1);
        if (!esquerda.ok) return esquerda;
        while (eSimbolo(espiar(), "*", "/")) {
            const op = (pedacos[posicao++] as { texto: "*" | "/" }).texto;
            const direita = unario(profundidade + 1);
            if (!direita.ok) return direita;
            esquerda = { ok: true, valor: { tipo: "conta", op, esquerda: esquerda.valor, direita: direita.valor } };
            if (++operacoes > 2 * MAX_PROFUNDIDADE_FORMULA * 5) return falha("Conta comprida demais.");
        }
        return esquerda;
    }

    function unario(profundidade: number): Resultado<No> {
        if (profundidade > MAX_PROFUNDIDADE_FORMULA) return falha("Conta complicada demais (parênteses ou operações demais).");
        const atual = espiar();
        if (eSimbolo(atual, "-")) {
            posicao++;
            const dentro = unario(profundidade + 1);
            return dentro.ok ? { ok: true, valor: { tipo: "negativo", dentro: dentro.valor } } : dentro;
        }
        if (eSimbolo(atual, "+")) {
            posicao++;
            return unario(profundidade + 1);
        }
        return primario(profundidade + 1);
    }

    function primario(profundidade: number): Resultado<No> {
        const atual = espiar();
        if (!atual) return falha("A conta termina antes da hora (falta um número ou variável).");
        posicao++;
        if (atual.tipo === "numero") return { ok: true, valor: { tipo: "numero", valor: atual.valor } };
        if (atual.tipo === "dado") return { ok: true, valor: { tipo: "dado", quantidade: atual.quantidade, lados: atual.lados } };
        if (atual.tipo === "nome") return { ok: true, valor: { tipo: "variavel", nome: atual.texto.toUpperCase() } };
        if (atual.texto === "(") {
            const dentro = soma(profundidade + 1);
            if (!dentro.ok) return dentro;
            if (!eSimbolo(espiar(), ")")) return falha('Falta fechar um parêntese ")".');
            posicao++;
            return dentro;
        }
        return falha(`Sobrou o símbolo "${atual.texto}" onde se esperava um número ou variável.`);
    }

    let operacoes = 0;
    const arvore = soma(0);
    if (!arvore.ok) return arvore;
    if (posicao < pedacos.length) return falha("Sobrou algo no fim da conta.");
    return arvore;
}

// ---------------------------------------------------------------------
// 4) Contas: dá o VALOR (para as variáveis, que não têm dados) e o TEXTO com as variáveis trocadas pelos valores
// ---------------------------------------------------------------------

/** Confere que um número não passou do limite (para nenhuma conta estourar nem virar um valor absurdo). */
function dentroDoLimite(valor: number): Resultado<number> {
    return Math.abs(valor) > MAX_VALOR_FORMULA ? falha("O resultado da conta é grande demais.") : { ok: true, valor };
}

/**
 * Faz a conta. `valorDe` devolve o valor de uma variável (ou o erro dela). A divisão arredonda para BAIXO. Sem `rolar`, a conta NÃO pode ter
 * dados (é o caso do valor de uma VARIÁVEL); com `rolar` (quem sorteia: devolve a SOMA de `quantidade` dados de `lados` lados), os dados
 * são rolados na ordem em que aparecem na conta, da esquerda para a direita (é o caso de uma ROLAGEM).
 */
function calcular(no: No, valorDe: (nome: string) => Resultado<number>, rolar?: (quantidade: number, lados: number) => number): Resultado<number> {
    switch (no.tipo) {
        case "numero":
            return dentroDoLimite(no.valor);
        case "variavel":
            return valorDe(no.nome);
        case "dado":
            if (!rolar) return falha("O valor de uma variável não pode ter dados (os dados ficam nas rolagens).");
            return dentroDoLimite(rolar(no.quantidade, no.lados));
        case "negativo": {
            const dentro = calcular(no.dentro, valorDe, rolar);
            return dentro.ok ? dentroDoLimite(-dentro.valor) : dentro;
        }
        case "conta": {
            const a = calcular(no.esquerda, valorDe, rolar);
            if (!a.ok) return a;
            const b = calcular(no.direita, valorDe, rolar);
            if (!b.ok) return b;
            if (no.op === "+") return dentroDoLimite(a.valor + b.valor);
            if (no.op === "-") return dentroDoLimite(a.valor - b.valor);
            if (no.op === "*") return dentroDoLimite(a.valor * b.valor);
            if (b.valor === 0) return falha("Divisão por zero.");
            return dentroDoLimite(Math.floor(a.valor / b.valor)); // inteira, para baixo: (15-10)/2 = 2 e (8-10)/2 = -1
        }
    }
}

/** Quantos dados a conta tem no total, e se algum é inválido (lados que não existem, quantidade 0...). Devolve a mensagem de erro, ou null. */
function problemaNosDados(no: No): string | null {
    let total = 0;
    const visitar = (n: No): string | null => {
        if (n.tipo === "dado") {
            if (!(DADOS_DISPONIVEIS as readonly number[]).includes(n.lados)) return `Não existe d${n.lados} (os dados são: ${DADOS_DISPONIVEIS.map((d) => `d${d}`).join(", ")}).`;
            if (n.quantidade < 1) return "A quantidade de dados precisa ser pelo menos 1.";
            total += n.quantidade;
            return total > MAX_QUANTIDADE_DADOS ? `São dados demais (no máximo ${MAX_QUANTIDADE_DADOS} por rolagem).` : null;
        }
        if (n.tipo === "negativo") return visitar(n.dentro);
        if (n.tipo === "conta") return visitar(n.esquerda) ?? visitar(n.direita);
        return null;
    };
    return visitar(no);
}

const PRIORIDADE: Record<Operador, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

/**
 * A conta escrita de novo, com cada variável trocada pelo seu valor (ex.: "1d20 + MOD_FOR + PROF" vira "1d20 + 3 + 3"). Põe só os
 * parênteses que fazem falta. Devolve o texto, ou o erro de uma variável que não existe.
 */
function mostrar(no: No, valorDe: (nome: string) => Resultado<number>, prioridadeDeFora = 0): Resultado<string> {
    switch (no.tipo) {
        case "numero":
            return { ok: true, valor: String(no.valor) };
        case "dado":
            return { ok: true, valor: `${no.quantidade}d${no.lados}` };
        case "variavel": {
            const v = valorDe(no.nome);
            if (!v.ok) return v;
            return { ok: true, valor: v.valor < 0 && prioridadeDeFora > 0 ? `(${v.valor})` : String(v.valor) };
        }
        case "negativo": {
            const dentro = mostrar(no.dentro, valorDe, 3);
            return dentro.ok ? { ok: true, valor: `-${dentro.valor}` } : dentro;
        }
        case "conta": {
            const p = PRIORIDADE[no.op];
            const a = mostrar(no.esquerda, valorDe, p);
            if (!a.ok) return a;
            // À direita de "-" e "/", uma conta da MESMA prioridade precisa de parênteses (a - (b - c) não é a - b - c).
            const b = mostrar(no.direita, valorDe, no.op === "-" || no.op === "/" ? p + 1 : p);
            if (!b.ok) return b;
            const texto = `${a.valor} ${no.op} ${b.valor}`;
            return { ok: true, valor: p < prioridadeDeFora ? `(${texto})` : texto };
        }
    }
}

// ---------------------------------------------------------------------
// 5) A ficha inteira
// ---------------------------------------------------------------------

/** Um pedaço do texto da ficha: de `inicio` (inclusive) até `fim` (exclusive), em caracteres. */
export interface PosicaoNoTexto {
    inicio: number;
    fim: number;
}

export interface VariavelFicha {
    /** De qual ABA da ficha é a linha da variável (0 = a primeira). As variáveis valem para a ficha inteira; as posições abaixo são DENTRO desta aba. */
    aba: number;
    nome: string; // como foi escrito (ex.: "MOD_FOR")
    conta: string; // o que vem depois dos "::" (ex.: "(FOR - 10) / 2")
    valor: number | null; // null se deu erro
    erro: string | null;
    /** Onde está o NOME no texto. */
    posNome: PosicaoNoTexto;
    /** Onde está o VALOR (a conta depois dos "::"). Pode estar vazio. */
    posConta: PosicaoNoTexto;
}

export interface RolagemFicha {
    /** O NOME, entre parênteses (referência visual). Sem nome, é a própria fórmula. */
    nome: string;
    /** A fórmula como foi escrita, entre colchetes. */
    formula: string;
    /** A fórmula com as variáveis trocadas pelos valores (ex.: "1d20 + 3 + 3"); null se deu erro. */
    resolvida: string | null;
    erro: string | null;
    /** Onde está o nome no texto, COM os parênteses (ex.: "(Ataque)"); null se a rolagem não tem nome. */
    posNome: PosicaoNoTexto | null;
    /** Onde está a fórmula no texto, COM os colchetes (ex.: "[1d20 + FOR]"). */
    posFormula: PosicaoNoTexto;
}

export interface AnaliseDaFicha {
    /** De qual aba é esta análise: as `rolagens` (e as posições delas) são só desta aba. */
    aba: number;
    /** TODAS as variáveis da ficha (de qualquer aba; `aba` diz de onde cada uma vem). Numa ficha de uma aba só, são as dela. */
    variaveis: VariavelFicha[];
    /** As rolagens DESTA aba (cada aba tem as suas). */
    rolagens: RolagemFicha[];
}

// A bandeira "d" faz o resultado trazer, de cada grupo, onde ele começa e termina (`indices`): é como achamos as POSIÇÕES no texto.
const LINHA_DE_VARIAVEL = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*::\s*(.*?)\s*$/du;
// "(Nome)" opcional, colado a "[fórmula]" (só espaços ou tabulações podem separar os dois). Nem o nome nem a fórmula atravessam linhas nem têm parênteses/colchetes dentro (a fórmula
// pode ter parênteses: eles só não podem estar no NOME).
const ROLAGEM = /(?:\(([^()[\]\n]{1,200})\)[ \t]*)?\[([^[\]\n]{1,400})\]/dgu;
const TEM_DADO = /(?:^|[^\p{L}\p{N}_])\d*[dD]\d+(?![\p{L}\p{N}_])/u;

/** Lê o texto de uma ficha e devolve as variáveis (com os valores já calculados) e as rolagens (com as fórmulas já resolvidas). Nunca lança erro. */
export function analisarFicha(texto: string): AnaliseDaFicha {
    // --- 1) as linhas "NOME:: valor" (as repetidas e as passadas do limite são ignoradas, com aviso)
    const definicoes = new Map<string, { nome: string; conta: string }>();
    const variaveis: VariavelFicha[] = [];
    let deslocamento = 0; // onde a linha atual começa no texto inteiro
    for (const linha of texto.split("\n")) {
        const inicioDaLinha = deslocamento;
        deslocamento += linha.length + 1; // (+1 do "\n")
        const achou = LINHA_DE_VARIAVEL.exec(linha);
        const lugarDoNome = achou?.indices?.[1];
        const lugarDaConta = achou?.indices?.[2];
        if (!achou || !lugarDoNome || !lugarDaConta) continue;
        if (variaveis.length >= MAX_VARIAVEIS_POR_FICHA) break;
        const [, nome, conta] = achou;
        const posNome = { inicio: inicioDaLinha + lugarDoNome[0], fim: inicioDaLinha + lugarDoNome[1] };
        const posConta = { inicio: inicioDaLinha + lugarDaConta[0], fim: inicioDaLinha + lugarDaConta[1] };
        const chave = nome.toUpperCase();
        if (nome.length > MAX_CARACTERES_NOME_VARIAVEL) {
            variaveis.push({ aba: 0, nome: nome.slice(0, MAX_CARACTERES_NOME_VARIAVEL) + "…", conta, valor: null, erro: "Nome de variável comprido demais.", posNome, posConta });
        } else if (definicoes.has(chave)) {
            variaveis.push({ aba: 0, nome, conta, valor: null, erro: "Variável repetida (vale a primeira).", posNome, posConta });
        } else {
            definicoes.set(chave, { nome, conta });
            variaveis.push({ aba: 0, nome, conta, valor: null, erro: null, posNome, posConta }); // o valor é calculado abaixo
        }
    }

    // --- 2) calcula cada variável (com memória e detecção de ciclo: A:: B e B:: A não travam, dão erro)
    const calculadas = new Map<string, Resultado<number>>();
    const emAndamento = new Set<string>();
    function valorDe(chave: string): Resultado<number> {
        const pronta = calculadas.get(chave);
        if (pronta) return pronta;
        const definicao = definicoes.get(chave);
        if (!definicao) return falha(`Variável não definida: ${chave}.`);
        if (emAndamento.has(chave)) return falha(`A variável ${chave} depende de si mesma (ciclo).`);
        emAndamento.add(chave);
        const arvore = analisarConta(definicao.conta);
        const resultado = arvore.ok ? calcular(arvore.valor, valorDe) : arvore;
        emAndamento.delete(chave);
        calculadas.set(chave, resultado);
        return resultado;
    }
    for (const v of variaveis) {
        if (v.erro) continue;
        const resultado = valorDe(v.nome.toUpperCase());
        if (resultado.ok) v.valor = resultado.valor;
        else v.erro = resultado.erro;
    }

    // --- 3) as rolagens "(Nome)[fórmula]" (só as que têm um dado dentro)
    const rolagens: RolagemFicha[] = [];
    for (const achou of texto.matchAll(ROLAGEM)) {
        if (rolagens.length >= MAX_ROLAGENS_POR_FICHA) break;
        const formula = achou[2].trim();
        const lugarDoNome = achou.indices?.[1];
        const lugarDaFormula = achou.indices?.[2];
        if (!TEM_DADO.test(formula) || !lugarDaFormula) continue; // "[ ]", "[x]", "[1]"...: não é rolagem
        const nome = (achou[1] ?? "").trim().slice(0, MAX_CARACTERES_NOME_ROLAGEM) || formula;
        // As posições de dentro do grupo vão de "depois do abre" até "antes do fecha": os parênteses/colchetes ficam um caractere de cada lado.
        const posNome = lugarDoNome ? { inicio: lugarDoNome[0] - 1, fim: lugarDoNome[1] + 1 } : null;
        const posFormula = { inicio: lugarDaFormula[0] - 1, fim: lugarDaFormula[1] + 1 };
        const arvore = analisarConta(formula);
        let resolvida: string | null = null;
        let erro: string | null = null;
        if (!arvore.ok) erro = arvore.erro;
        else {
            erro = problemaNosDados(arvore.valor);
            if (erro === null) {
                const escrita = mostrar(arvore.valor, valorDe);
                if (escrita.ok) resolvida = escrita.valor;
                else erro = escrita.erro;
            }
        }
        rolagens.push({ nome, formula, resolvida, erro, posNome, posFormula });
    }
    return { aba: 0, variaveis, rolagens };
}

/**
 * Analisa as ABAS de uma ficha (`textos` = o texto de cada aba, na ordem). As VARIÁVEIS valem para a ficha inteira (uma definida numa aba pode ser
 * usada nas outras), por isso o texto de todas as abas é analisado JUNTO (separado por uma quebra de linha: nenhuma variável nem rolagem
 * atravessa linhas, então nada se mistura entre abas). As ROLAGENS, ao contrário, são de cada aba: a análise da aba N só tem as rolagens que estão
 * no texto da aba N, e as posições (de variáveis e de rolagens) são DENTRO do texto da aba a que pertencem. Devolve uma análise por aba.
 * Os limites (100 variáveis e 100 rolagens) valem para a ficha toda.
 */
export function analisarAbas(textos: readonly string[]): AnaliseDaFicha[] {
    const inicios: number[] = []; // onde o texto de cada aba começa no texto juntado
    let proximo = 0;
    for (const texto of textos) {
        inicios.push(proximo);
        proximo += texto.length + 1; // (+1 da quebra de linha que separa as abas)
    }
    const juntada = analisarFicha(textos.join("\n"));
    const abaDe = (posicao: number): number => {
        let aba = 0;
        for (let i = 0; i < inicios.length; i++) if (inicios[i] <= posicao) aba = i;
        return aba;
    };
    const deslocar = (pos: PosicaoNoTexto, desconto: number): PosicaoNoTexto => ({ inicio: pos.inicio - desconto, fim: pos.fim - desconto });
    const variaveis = juntada.variaveis.map((v): VariavelFicha => {
        const aba = abaDe(v.posNome.inicio);
        return { ...v, aba, posNome: deslocar(v.posNome, inicios[aba]), posConta: deslocar(v.posConta, inicios[aba]) };
    });
    return textos.map((_, aba) => ({
        aba,
        variaveis,
        rolagens: juntada.rolagens
            .filter((r) => abaDe(r.posFormula.inicio) === aba)
            .map((r): RolagemFicha => ({ ...r, posNome: r.posNome && deslocar(r.posNome, inicios[aba]), posFormula: deslocar(r.posFormula, inicios[aba]) })),
    }));
}

// ---------------------------------------------------------------------
// 6) O que COLORIR no texto
// ---------------------------------------------------------------------

/** As categorias de cor do editor: o nome e o valor de uma variável; o NOME de uma rolagem (a "palavra" com função) e a sua fórmula. */
export type TipoDeTrecho = "variavel-nome" | "variavel-valor" | "rolagem-nome" | "rolagem-formula";

export interface TrechoDoTexto extends PosicaoNoTexto {
    tipo: TipoDeTrecho;
    /** A mensagem de erro deste trecho (variável inexistente, dado inválido...), ou null se está tudo certo. Vira sublinhado vermelho. */
    erro: string | null;
    /** O que mostrar ao passar o mouse: o valor da variável, a fórmula já calculada da rolagem ou o erro. */
    dica: string;
    /** Se é parte de uma rolagem: a posição dela em `analise.rolagens` (o painel lateral usa para destacar a certa). Senão, null. */
    rolagem: number | null;
}

/** Os pedaços do texto que merecem cor, em ordem, a partir da análise (que já sabe onde cada coisa está). */
export function trechosDoTexto(analise: AnaliseDaFicha): TrechoDoTexto[] {
    const trechos: TrechoDoTexto[] = [];
    for (const v of analise.variaveis) {
        if (v.aba !== analise.aba) continue; // (as variáveis de OUTRAS abas valem aqui, mas não estão neste texto: nada a colorir)
        const dica = v.erro ?? `${v.nome} = ${v.valor}`;
        trechos.push({ tipo: "variavel-nome", ...v.posNome, erro: v.erro, dica, rolagem: null });
        if (v.posConta.fim > v.posConta.inicio) trechos.push({ tipo: "variavel-valor", ...v.posConta, erro: v.erro, dica, rolagem: null });
    }
    analise.rolagens.forEach((r, indice) => {
        const dica = r.erro ?? `${r.nome}: ${r.resolvida}`;
        if (r.posNome) trechos.push({ tipo: "rolagem-nome", ...r.posNome, erro: r.erro, dica, rolagem: indice });
        trechos.push({ tipo: "rolagem-formula", ...r.posFormula, erro: r.erro, dica, rolagem: indice });
    });
    return trechos.sort((a, b) => a.inicio - b.inicio);
}

// ---------------------------------------------------------------------
// 7) ROLAR uma rolagem da ficha
// ---------------------------------------------------------------------

/** Os dados de UM termo da fórmula (ex.: o "2d6" de "2d6 + 3") e o que saiu em cada um. */
export interface DadosRolados {
    quantidade: number;
    lados: number;
    resultados: number[];
}

/** O resultado de rolar uma rolagem da ficha: o que vai para o cartão do chat. Só dados simples (vai pela rede). */
export interface RolagemDeFicha {
    /** O NOME da rolagem (a referência visual, entre parênteses no texto da ficha). */
    nome: string;
    /** O nome da ficha. */
    ficha: string;
    /** A fórmula com as variáveis trocadas pelos valores, ex.: "1d20 + 3 + 3". */
    formula: string;
    /** A mesma fórmula com o que saiu em cada dado, ex.: "1d20 [14] + 3 + 3". */
    detalhe: string;
    /** Os dados de cada termo, na ordem em que aparecem na fórmula. */
    dados: DadosRolados[];
    total: number;
}

/**
 * Rola a rolagem de posição `indice` de uma ficha JÁ ANALISADA (`analisarFicha`; quem rola muitas vezes guarda a análise e não a refaz).
 * `sortear` devolve um número de 0 (incluso) a 1 (excluso), como Math.random: no servidor é o sorteio seguro. Nunca lança erro: uma rolagem que
 * não existe, ou que tem erro (variável inexistente, dado inválido...), volta como mensagem.
 */
export function rolarDaAnalise(analise: AnaliseDaFicha, indice: number, nomeDaFicha: string, sortear: () => number): Resultado<RolagemDeFicha> {
    const rolagem = Number.isSafeInteger(indice) ? analise.rolagens[indice] : undefined;
    if (!rolagem) return falha("Essa rolagem não existe.");
    if (rolagem.erro !== null || rolagem.resolvida === null) return falha(rolagem.erro ?? "Essa rolagem tem um erro.");
    const arvore = analisarConta(rolagem.formula);
    if (!arvore.ok) return arvore;

    // Os valores das variáveis, que a análise já calculou (as repetidas e as com erro não entram: dão erro na rolagem que as usa).
    const valores = new Map<string, number>();
    for (const v of analise.variaveis) if (v.erro === null && v.valor !== null) valores.set(v.nome.toUpperCase(), v.valor);
    const valorDe = (chave: string): Resultado<number> => {
        const valor = valores.get(chave);
        return valor === undefined ? falha(`Variável não definida: ${chave}.`) : { ok: true, valor };
    };

    const dados: DadosRolados[] = [];
    const rolar = (quantidade: number, lados: number): number => {
        const resultados: number[] = [];
        for (let i = 0; i < quantidade; i++) {
            // sortear() em [0,1) vezes `lados` vai de 0 a lados-1,999...; floor + 1 dá de 1 até `lados`, todos igualmente prováveis (o Math.min
            // protege caso o sorteador devolva exatamente 1).
            resultados.push(Math.min(lados, Math.floor(sortear() * lados) + 1));
        }
        dados.push({ quantidade, lados, resultados });
        return resultados.reduce((soma, r) => soma + r, 0);
    };
    const total = calcular(arvore.valor, valorDe, rolar);
    if (!total.ok) return total;

    // "1d20 + 3" vira "1d20 [14] + 3": cada "NdM" da fórmula ganha, depois dele, o que saiu (na mesma ordem em que os dados foram rolados).
    let proximo = 0;
    const detalhe = rolagem.resolvida.replace(/\d+d\d+/g, (termo) => `${termo} [${(dados[proximo++]?.resultados ?? []).join(", ")}]`);
    return { ok: true, valor: { nome: rolagem.nome, ficha: nomeDaFicha, formula: rolagem.resolvida, detalhe, dados, total: total.valor } };
}

/** Atalho: analisa o texto e rola (o modo local, que não guarda a análise). */
export function rolarDaFicha(texto: string, indice: number, nomeDaFicha: string, sortear: () => number): Resultado<RolagemDeFicha> {
    return rolarDaAnalise(analisarFicha(texto), indice, nomeDaFicha, sortear);
}
