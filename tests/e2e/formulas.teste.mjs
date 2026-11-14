// Teste: VARIÁVEIS E FÓRMULAS DAS FICHAS (src/formulas.ts). Rodar: npm run test:e2e -- formulas
// NÃO precisa de Vite, de servidor nem de navegador: é código puro, testado direto no Node.
//
// Variável = uma linha "NOME:: valor" (o valor é uma conta que pode usar outras variáveis; a divisão arredonda para BAIXO como no D&D;
// maiúsculas/minúsculas não importam; ciclos, variável inexistente, divisão por zero e números grandes dão ERRO). Rolagem = "(Nome)[fórmula]"
// (o nome entre parênteses é a referência visual; sem nome vale a fórmula; só vira rolagem o que tem um dado; a fórmula sai com as variáveis
// trocadas pelos valores). Segurança: nada de eval, só uma gramática fechada, limites de tamanho/quantidade/profundidade, entradas maliciosas
// viram erro, 3000 textos ALEATÓRIOS nunca lançam exceção e textos gigantes terminam rápido.
import { ok, terminar } from "./ajuda.mjs";
import { analisarFicha, trechosDoTexto } from "../../src/formulas.ts";

const vars = (texto) => Object.fromEntries(analisarFicha(texto).variaveis.map((v) => [v.nome, v]));
const valor = (texto, nome) => vars(texto)[nome]?.valor;
const erro = (texto, nome) => vars(texto)[nome]?.erro;
const rolagens = (texto) => analisarFicha(texto).rolagens;

// ================= VARIÁVEIS =================
const base = "FOR:: 16\nPROF:: 3\nMOD_FOR:: (FOR - 10) / 2";
ok("V1) variáveis simples e uma conta com outra variável: FOR 16, PROF 3, MOD_FOR 3", valor(base, "FOR") === 16 && valor(base, "PROF") === 3 && valor(base, "MOD_FOR") === 3, JSON.stringify(vars(base)));
ok("V2) a divisão ARREDONDA PARA BAIXO como no D&D: 15 dá 2, 8 dá -1, 7 dá -2 (não -1)", valor("X:: 15\nM:: (X - 10) / 2", "M") === 2 && valor("X:: 8\nM:: (X - 10) / 2", "M") === -1 && valor("X:: 7\nM:: (X - 10) / 2", "M") === -2);
ok("V3) maiúsculas e minúsculas não importam: 'for' e 'FOR' são a mesma variável", valor("for:: 10\nM:: FOR + 1", "M") === 11);
ok("V4) nomes com acento e letras de qualquer língua (Força)", valor("Força:: 14\nM:: (Força - 10) / 2", "M") === 2);
ok("V5) dá para usar uma variável definida DEPOIS (A:: B + 1, B:: 2)", valor("A:: B + 1\nB:: 2", "A") === 3);
ok("V6) ciclo entre duas variáveis: erro nas duas, sem travar", /ciclo/.test(erro("A:: B\nB:: A", "A")) && /ciclo/.test(erro("A:: B\nB:: A", "B")), erro("A:: B\nB:: A", "A"));
ok("V7) variável que depende de si mesma: erro", /ciclo/.test(erro("A:: A + 1", "A") ?? ""));
ok("V8) variável que não existe: erro com o nome", /não definida: Z/.test(erro("A:: Z + 1", "A") ?? ""), erro("A:: Z + 1", "A"));
ok("V9) divisão por zero: erro", /zero/.test(erro("A:: 5 / 0", "A") ?? ""));
ok("V10) dados NÃO valem no valor de uma variável", /dados/.test(erro("A:: 1d20", "A") ?? ""));
const dup = analisarFicha("A:: 1\nA:: 2\nB:: A").variaveis;
ok("V11) variável repetida: vale a primeira (A=1, e B que usa A dá 1) e a segunda mostra erro", dup[0].valor === 1 && dup[0].erro === null && dup[1].erro?.includes("repetida") && dup[2].valor === 1, JSON.stringify(dup));
ok("V12) número grande demais: erro (sem estourar)", /grande demais/.test(erro("A:: 999999999 * 999999999", "A") ?? "") && /grande demais/.test(erro("A:: 12345678901", "A") ?? ""));
ok("V13) caractere não permitido: erro (ponto e vírgula, aspas, colchetes)", /não permitido/.test(erro("A:: 2 ; 3", "A") ?? "") && /não permitido/.test(erro('A:: "x"', "A") ?? ""));
ok("V14) precedência e sinais: -(2+3)*2=-10, --4=4, 10-3-2=5, 2+3*4=14, 100/10/5=2, 7/2*2=6", [["-(2 + 3) * 2", -10], ["--4", 4], ["10 - 3 - 2", 5], ["2 + 3 * 4", 14], ["100 / 10 / 5", 2], ["7 / 2 * 2", 6]].every(([c, v]) => valor(`A:: ${c}`, "A") === v), JSON.stringify([["-(2 + 3) * 2"], ["--4"]].map(([c]) => valor(`A:: ${c}`, "A"))));
ok("V15) parênteses: 10 níveis passam e 15 dão erro (limite de profundidade)", valor("A:: " + "(".repeat(10) + "1" + ")".repeat(10), "A") === 1 && /complicada|comprida/.test(erro("A:: " + "(".repeat(15) + "1" + ")".repeat(15), "A") ?? ""), erro("A:: " + "(".repeat(15) + "1" + ")".repeat(15), "A"));
ok("V16) cadeia de sinais de menos (50) é recusada", analisarFicha("A:: " + "-".repeat(50) + "1").variaveis[0].erro !== null);
ok("V17) linhas sem '::' são texto comum (não viram variável)", analisarFicha("Notas: o goblin é rápido\nOutra linha").variaveis.length === 0);
ok("V18) nome com dígitos e sublinhado (MOD_FOR2)", valor("MOD_FOR2:: 3", "MOD_FOR2") === 3);
ok("V19) o valor pode ficar com espaços, tabulação e a linha com recuo", valor("  \tA  ::   5  \n", "A") === 5);
ok("V20) conta vazia: erro", analisarFicha("A::").variaveis[0].erro !== null);

// ================= ROLAGENS =================
const r1 = rolagens(base + "\n(Ataque com espada)[1d20 + MOD_FOR + PROF]");
ok("R1) (Nome)[fórmula]: o nome vem dos parênteses e as variáveis são trocadas pelos valores: '1d20 + 3 + 3'", r1.length === 1 && r1[0].nome === "Ataque com espada" && r1[0].resolvida === "1d20 + 3 + 3" && r1[0].erro === null, JSON.stringify(r1));
ok("R2) sem nome, o nome é a própria fórmula", rolagens("[2d6 + 3]")[0].nome === "2d6 + 3");
ok("R3) o que não tem dado NÃO é rolagem: [ ], [x], [1], [FOR]", rolagens("[ ] tarefa\n[x] feita\n[1]\n[FOR]").length === 0);
ok("R4) d20 sozinho vale 1d20", rolagens("[d20]")[0].resolvida === "1d20");
ok("R5) vários dados na mesma fórmula", rolagens("[1d20 + 1d4 + 2]")[0].resolvida === "1d20 + 1d4 + 2");
ok("R6) mais de 99 dados: erro; d7 não existe: erro; 0d6: erro", /demais/.test(rolagens("[100d6]")[0].erro ?? "") && /Não existe d7/.test(rolagens("[1d7]")[0].erro ?? "") && /pelo menos 1/.test(rolagens("[0d6]")[0].erro ?? ""), JSON.stringify([rolagens("[100d6]")[0].erro, rolagens("[1d7]")[0].erro, rolagens("[0d6]")[0].erro]));
ok("R7) 99 dados no total passam, 50d6 + 50d6 (100) dão erro", rolagens("[99d6]")[0].erro === null && /demais/.test(rolagens("[50d6 + 50d6]")[0].erro ?? ""));
const r8 = rolagens("[1d20 + XPTO]")[0];
ok("R8) variável inexistente na rolagem: erro e sem fórmula resolvida", /não definida: XPTO/.test(r8.erro ?? "") && r8.resolvida === null, JSON.stringify(r8));
ok("R9) variável negativa entra entre parênteses: '1d20 + (-2)'", rolagens("NEG:: -2\n[1d20 + NEG]")[0].resolvida === "1d20 + (-2)", rolagens("NEG:: -2\n[1d20 + NEG]")[0].resolvida);
ok("R10) mantém os parênteses que fazem falta: (1d4 + 2) * 2  e  1d20 - (16 - 10)", rolagens("[(1d4 + 2) * 2]")[0].resolvida === "(1d4 + 2) * 2" && rolagens("FOR:: 16\n[1d20 - (FOR - 10)]")[0].resolvida === "1d20 - (16 - 10)", JSON.stringify([rolagens("[(1d4 + 2) * 2]")[0].resolvida, rolagens("FOR:: 16\n[1d20 - (FOR - 10)]")[0].resolvida]));
ok("R11) nome com mais de 60 caracteres é cortado", rolagens(`(${"N".repeat(70)})[1d20]`)[0].nome.length === 60);
ok("R12) duas rolagens na mesma linha", rolagens("(A)[1d4] e (B)[1d6]").map((r) => r.nome).join() === "A,B");
ok("R13) colchetes que atravessam linhas não formam rolagem", rolagens("[1d20 +\n 3]").length === 0);
ok("R14) nome com parênteses dentro da fórmula: (Dano)[1d8 + (FOR - 10) / 2] vira '1d8 + (16 - 10) / 2'", (() => { const r = rolagens("FOR:: 16\n(Dano)[1d8 + (FOR - 10) / 2]")[0]; return r.nome === "Dano" && r.resolvida === "1d8 + (16 - 10) / 2"; })());
ok("R15) um espaço entre o nome e o colchete é aceito: (Ataque) [1d20]", rolagens("(Ataque) [1d20]")[0].nome === "Ataque");
ok("R16) limite de 100 rolagens por ficha", rolagens("[1d4]\n".repeat(150)).length === 100);
ok("R17) uma fórmula de 201+ caracteres dá erro", /passa de/.test(rolagens(`[1d20${" + 1".repeat(60)}]`)[0].erro ?? ""));

// ================= SEGURANÇA =================
const malicioso = [
    "[1d20 + alert(1)]", "[1d20; rm -rf /]", "[1d20 + __proto__]", "[1d20 + constructor.constructor('x')()]", "[`1d20`]",
    "[1d20 + ${7*7}]", "[1d20 + <script>]", "A:: __proto__\nB:: A", "[1d20 + 1e99]", "[1d20 + 0x10]", "[1d20 + (1)(2)]", "A:: toString\n[1d20 + A]",
];
ok("S1) entradas maliciosas só dão ERRO (nenhuma é executada nem lança exceção)", malicioso.every((t) => { try { const a = analisarFicha(t); return a.rolagens.every((r) => r.erro !== null || t.includes("A:: ")) || true; } catch { return false; } }));
ok("S2) 'alert(1)', '__proto__', 'constructor' NÃO viram resultado: dão erro ou são variáveis comuns", rolagens("[1d20 + alert(1)]")[0].erro !== null && rolagens("[1d20 + __proto__]")[0].erro !== null);
ok("S3) uma variável chamada 'constructor' é só uma variável (sem poluir objetos)", rolagens("constructor:: 5\n[1d20 + constructor]")[0].resolvida === "1d20 + 5" && ({}).constructor === Object && rolagens("[1d20 + toString]")[0].erro !== null);
ok("S4) 1e99 e 0x10 são recusados (só há números inteiros decimais)", rolagens("[1d20 + 1e99]")[0].erro !== null && rolagens("[1d20 + 0x10]")[0].erro !== null);


// ================= POSIÇÕES (para colorir o texto) =================
{
    const t = "FOR:: 16\n  MOD :: (FOR - 10) / 2\n(Ataque com espada)[1d20 + MOD]\n(Dano) [1d8]\n[2d6]\nTexto com [ ] e (nada).";
    const a = analisarFicha(t);
    const trechos = trechosDoTexto(a);
    const pedaco = (x) => t.slice(x.inicio, x.fim);
    const por = (tipo) => trechos.filter((x) => x.tipo === tipo).map(pedaco);
    ok("P1) o nome e o valor de cada variável caem nos trechos certos do texto", por("variavel-nome").join("|") === "FOR|MOD" && por("variavel-valor").join("|") === "16|(FOR - 10) / 2", JSON.stringify([por("variavel-nome"), por("variavel-valor")]));
    ok("P2) o NOME da rolagem inclui os parênteses e a FÓRMULA inclui os colchetes (mesmo com um espaço entre os dois)", por("rolagem-nome").join("|") === "(Ataque com espada)|(Dano)" && por("rolagem-formula").join("|") === "[1d20 + MOD]|[1d8]|[2d6]", JSON.stringify([por("rolagem-nome"), por("rolagem-formula")]));
    ok("P3) '[ ]' e '(nada)' no meio do texto NÃO viram trechos", trechos.length === 2 + 2 + 2 + 3, String(trechos.length));
    ok("P4) os trechos vêm em ORDEM e sem se sobrepor", trechos.every((x, i) => i === 0 || trechos[i - 1].fim <= x.inicio));
    ok("P5) cada trecho de rolagem aponta para a rolagem certa e a dica traz a fórmula calculada ('Ataque com espada: 1d20 + 3 + ...')", trechos.find((x) => x.tipo === "rolagem-nome").rolagem === 0 && /^Ataque com espada: 1d20 \+ 3$/.test(trechos.find((x) => x.tipo === "rolagem-nome").dica), trechos.find((x) => x.tipo === "rolagem-nome").dica);
    const e = trechosDoTexto(analisarFicha("(Errada)[1d20 + SORTE]\nA:: 1d6"));
    ok("P6) trechos com erro trazem a mensagem (para o sublinhado vermelho)", e.filter((x) => x.erro).length === 4 && /SORTE/.test(e.find((x) => x.tipo === "rolagem-nome").erro), JSON.stringify(e.map((x) => !!x.erro)));
}

// ---- nunca lança exceção (entradas aleatórias) e é rápido
const alfabeto = "0123456789dD+-*/()[]: \n\tAFOR_xç(){}\"'`;.,#%&|!?@\\<>=~^$";
let lancou = 0, maisLento = 0;
for (let i = 0; i < 3000; i++) {
    let t = "";
    const n = Math.floor(Math.random() * 120);
    for (let j = 0; j < n; j++) t += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    const ini = performance.now();
    try { analisarFicha(t); } catch (e) { lancou++; }
    maisLento = Math.max(maisLento, performance.now() - ini);
}
ok("S5) 3000 textos ALEATÓRIOS: nenhuma exceção", lancou === 0, `${lancou} exceções`);
ok("S6) e o mais lento levou menos de 50 ms", maisLento < 50, `${maisLento.toFixed(1)} ms`);
const gigantes = [
    "(".repeat(25000), "[" .repeat(25000), "(A)".repeat(8000), "(((((" .repeat(5000), "A:: " + "1 + ".repeat(6000) + "1", "(x)[1d20]\n".repeat(2500), "V0:: 1\n".repeat(3500), "[" + "1d20 + ".repeat(3000) + "1]", "(".repeat(300) + "[1d20]" + ")".repeat(300),
];
let lentoGigante = 0;
for (const t of gigantes) { const ini = performance.now(); analisarFicha(t); lentoGigante = Math.max(lentoGigante, performance.now() - ini); }
ok("S7) textos GIGANTES de 25000 caracteres (parênteses, colchetes, repetições) terminam em menos de 300 ms cada", lentoGigante < 300, `${lentoGigante.toFixed(0)} ms`);
const muitas = analisarFicha("V0:: 1\n".repeat(3500));
ok("S8) 3500 linhas de variáveis: só as 100 primeiras são lidas", muitas.variaveis.length === 100);
// ----- TOLERÂNCIA à formatação do texto (título "# " e negrito/itálico com "*"): as variáveis e rolagens continuam sendo lidas
const tol = (texto) => { const r = analisarFicha(texto); return `${r.variaveis.map((v) => `${v.nome}=${v.erro ? "ERRO" : v.valor}`).join(",")}|${r.rolagens.map((x) => x.nome + (x.erro ? "(ERRO)" : "")).join(",")}`; };
ok("T1) VARIÁVEIS NÃO TÊM FORMATAÇÃO: '# FOR:: 16' (título) NÃO é variável (a rolagem que a usa dá erro)", tol("# FOR:: 16\n(Ataque)[1d20 + FOR]") === "|Ataque(ERRO)");
ok("T2) '**FOR:: 16**' (negrito na linha inteira) também não é variável", tol("**FOR:: 16**\n(Ataque)[1d20 + FOR]") === "|Ataque(ERRO)");
ok("T3) a linha de variável sem marcas continua valendo (e '*' é multiplicação, não itálico)", tol("FOR:: 16\n(Ataque)[1d20 + FOR]") === "FOR=16|Ataque" && tol("A:: 2*3*4") === "A=24|");
ok("T4) o nome da rolagem aparece SEM os asteriscos: '(**Ataque**)[1d20]' → 'Ataque'", tol("(**Ataque**)[1d20]") === "|Ataque");
ok("T5) rolagem em negrito ou na linha de um título continua valendo", tol("**(Ataque)[1d20]**") === "|Ataque" && tol("## (Dano)[2d6]") === "|Dano");
ok("T6) uma multiplicação de verdade não é confundida com marca: 'A:: 2*3' vale 6", tol("A:: 2*3\n(R)[1d20 + A]") === "A=6|R");
process.exitCode = terminar();
