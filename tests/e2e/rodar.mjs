// Executor dos testes e2e: roda cada arquivo `*.teste.mjs` desta pasta (um por vez) e mostra o resumo.
//   npm run test:e2e                 todos
//   npm run test:e2e -- chat bolsa   só os que têm esses nomes no arquivo
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pasta = fileURLToPath(new URL(".", import.meta.url));
const filtros = process.argv.slice(2);
const arquivos = readdirSync(pasta)
    .filter((f) => f.endsWith(".teste.mjs"))
    .filter((f) => filtros.length === 0 || filtros.some((x) => f.includes(x)))
    .sort();

if (arquivos.length === 0) {
    console.log("Nenhum teste encontrado para:", filtros.join(" "));
    process.exit(1);
}

const resultados = [];
for (const arquivo of arquivos) {
    const inicio = Date.now();
    const saida = await new Promise((resolve) => {
        const filho = spawn("node", [pasta + arquivo], { stdio: ["ignore", "pipe", "pipe"] });
        let texto = "";
        filho.stdout.on("data", (d) => (texto += d));
        filho.stderr.on("data", (d) => (texto += d));
        filho.on("close", (codigo) => resolve({ codigo, texto }));
    });
    const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
    // Só as linhas que importam quando algo falha (o resto fica fora para o resultado ser curto).
    const linhasFalhas = saida.texto.split("\n").filter((l) => l.startsWith("FAIL") || /Error|erros de JS: \[/.test(l));
    resultados.push({ arquivo, ok: saida.codigo === 0, segundos, linhasFalhas });
    console.log(`${saida.codigo === 0 ? "PASS" : "FAIL"}  ${arquivo.padEnd(28)} ${segundos}s`);
    for (const l of linhasFalhas) console.log("        " + l);
}

const falhos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - falhos}/${resultados.length} arquivos de teste passaram.`);
process.exit(falhos ? 1 : 0);
