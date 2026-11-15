// Teste: INICIATIVA, as regras (código puro, sem navegador nem servidor). Rodar: npm run test:e2e -- iniciativa-logica
// Ordenar (maior→menor, menor→maior, livre), empate (do jeito que chegou), mover (fora do critério vira "livre"), remover, valor, nome, passar a vez (rodadas), o MODO DE EDIÇÃO (a caixa
// começa em edição; adicionar alguém e limpar voltam a ela; só "confirmar" libera o "próximo turno"), limpar, limites e a leitura segura do que vem de fora (rede/arquivo).
import { iniciativa, novaIniciativa, aplicarAcaoDaIniciativa as ap, lerAcaoDaIniciativa, lerIniciativa, definirIniciativa, iniciativaComoObjeto, estaOrdenada } from "../../src/iniciativa.ts";
import { ok, terminar } from "./ajuda.mjs";

const zerar = () => Object.assign(iniciativa, novaIniciativa());
const nomes = () => iniciativa.entradas.map((e) => e.nome).join(",");
const add = (nome, valor, token = null) => ap({ acao: "adicionar", nome, valor, token });
const idDe = (nome) => iniciativa.entradas.find((e) => e.nome === nome)?.id;

ok("0a) a iniciativa nova COMEÇA em modo de edição, vazia, sem vez e na rodada 0", novaIniciativa().editando === true && novaIniciativa().entradas.length === 0 && novaIniciativa().vez === null && novaIniciativa().rodada === 0);
zerar();
add("Ana", 12); add("Beto", 18); add("Cris", 7);
ok("1a) por padrão ordena do MAIOR para o menor: Beto(18), Ana(12), Cris(7)", nomes() === "Beto,Ana,Cris", nomes());
ap({ acao: "ordenar", ordenacao: "menor" });
ok("1b) 'menor → maior' reordena: Cris, Ana, Beto", nomes() === "Cris,Ana,Beto", nomes());
ap({ acao: "ordenar", ordenacao: "livre" });
add("Dani", 99);
ok("1c) na ordenação LIVRE quem chega entra no fim, sem reordenar: Cris,Ana,Beto,Dani", nomes() === "Cris,Ana,Beto,Dani", nomes());
ap({ acao: "ordenar", ordenacao: "maior" });
ok("1d) voltar para 'maior → menor' ordena de novo: Dani,Beto,Ana,Cris", nomes() === "Dani,Beto,Ana,Cris", nomes());

zerar();
add("A", 10); add("B", 10); add("C", 10);
ok("2) EMPATE: ficam do jeito que chegaram (A,B,C), sem desempate automático", nomes() === "A,B,C", nomes());
ap({ acao: "valor", id: idDe("C"), valor: 10 });
ok("2b) mudar um valor para o mesmo número não bagunça o empate", nomes() === "A,B,C");

zerar();
add("A", 20); add("B", 15); add("C", 10);
ap({ acao: "mover", id: idDe("C"), para: 0 });
ok("3a) arrastar para FORA do critério muda sozinho para ordenação LIVRE e a lista fica C,A,B", iniciativa.ordenacao === "livre" && nomes() === "C,A,B", `${iniciativa.ordenacao} ${nomes()}`);
zerar();
add("A", 10); add("B", 10); add("C", 5);
ap({ acao: "mover", id: idDe("B"), para: 0 });
ok("3b) arrastar um EMPATADO para cima (A,B → B,A) continua dentro do critério: a ordenação NÃO vira livre", iniciativa.ordenacao === "maior" && nomes() === "B,A,C", `${iniciativa.ordenacao} ${nomes()}`);
ok("3c) 'estaOrdenada' confere o critério", estaOrdenada(iniciativa.entradas, "maior") && !estaOrdenada(iniciativa.entradas, "menor"));

zerar();
add("A", 3); add("B", 2); add("C", 1);
ok("4-) com a caixa em edição (começa assim) o 'próximo turno' é RECUSADO: é preciso confirmar antes", !ap({ acao: "proxima" }).ok && iniciativa.vez === null);
ap({ acao: "confirmar" });
ok("4a) confirmado, passar a vez a primeira vez começa o combate: vez em A, rodada 1", ap({ acao: "proxima" }).ok && iniciativa.vez === idDe("A") && iniciativa.rodada === 1);
ap({ acao: "proxima" }); ap({ acao: "proxima" });
ok("4b) depois de C, volta para A e a RODADA sobe para 2", ap({ acao: "proxima" }).ok && iniciativa.vez === idDe("A") && iniciativa.rodada === 2, `rodada ${iniciativa.rodada}`);
ap({ acao: "proxima" });
ok("5-) confirmada, a caixa NÃO está em edição", iniciativa.editando === false);
add("D", 0);
ok("5a) alguém CHEGAR põe a caixa de volta em EDIÇÃO", iniciativa.editando === true);
const bloqueada = ap({ acao: "proxima" });
ok("5b) em edição o 'Próximo turno' é RECUSADO com o motivo", !bloqueada.ok && /Confirme/.test(bloqueada.erro), JSON.stringify(bloqueada));
ap({ acao: "confirmar" });
ok("5c) depois de CONFIRMAR a vez passa de novo", ap({ acao: "proxima" }).ok);
ap({ acao: "editar" });
ok("5d) 'Editar' liga a edição à mão (o botão de passar a vez desliga)", iniciativa.editando === true && !ap({ acao: "proxima" }).ok);
ap({ acao: "confirmar" });

// remover: quem tinha a vez; a vez passa para quem estava logo depois
zerar();
add("A", 3); add("B", 2); add("C", 1);
ap({ acao: "confirmar" });
ap({ acao: "proxima" }); // vez em A
ap({ acao: "remover", id: idDe("A") });
ok("6a) remover quem está com a VEZ passa a vez para o seguinte (B)", iniciativa.vez === idDe("B") && nomes() === "B,C", `${nomes()} vez=${iniciativa.entradas.find((e) => e.id === iniciativa.vez)?.nome}`);
ap({ acao: "proxima" }); // C
ap({ acao: "remover", id: idDe("C") });
ok("6b) remover o ÚLTIMO com a vez leva a vez para quem ficou no fim (B)", iniciativa.vez === idDe("B"));
ap({ acao: "remover", id: idDe("B") });
ok("6c) remover o último personagem deixa a vez vazia", iniciativa.vez === null && iniciativa.entradas.length === 0);
ok("6d) remover quem não existe é recusado", !ap({ acao: "remover", id: 99999 }).ok);

// quem morre NÃO tem a vez pulada: nada no módulo olha condição nenhuma (só os jogadores passam a vez)
zerar();
add("Vivo", 10, 5); add("Morto", 8, 6);
ap({ acao: "confirmar" });
ap({ acao: "proxima" }); ap({ acao: "proxima" });
ok("7) a vez vai para um personagem mesmo que ele esteja morto: o jogo nunca pula sozinho", iniciativa.vez === idDe("Morto"));

// nomes e valores
zerar();
add("  Goblin   \u0007  Chefe  ", 5000);
ok("8a) nome limpo (controles viram espaço, espaços juntados) e valor limitado a ±1000", iniciativa.entradas[0].nome === "Goblin Chefe" && iniciativa.entradas[0].valor === 1000, JSON.stringify(iniciativa.entradas[0]));
add("", -5000);
ok("8b) nome vazio vira 'Criatura' e o valor negativo é limitado a -1000", iniciativa.entradas.at(-1).nome === "Criatura" && iniciativa.entradas.at(-1).valor === -1000);
ap({ acao: "nome", id: iniciativa.entradas[0].id, nome: "x".repeat(100) });
ok("8c) nome acima de 24 caracteres é cortado", iniciativa.entradas[0].nome.length === 24);
ap({ acao: "confirmar" });
ap({ acao: "resetar" });
ok("9) LIMPAR ('resetar') apaga a lista, a vez e a rodada e a caixa volta a ficar em EDIÇÃO", iniciativa.entradas.length === 0 && iniciativa.vez === null && iniciativa.rodada === 0 && iniciativa.editando === true);
ok("9b) passar a vez com a lista vazia é recusado", !ap({ acao: "proxima" }).ok);

zerar();
for (let i = 0; i < 60; i++) add("P" + i, i);
ok("10) o limite de 60 personagens: o 61º é recusado e nada muda", !add("Extra", 1).ok && iniciativa.entradas.length === 60);

// leitura segura do que vem de fora
ok("11a) ações inválidas são recusadas (tipo errado, campo faltando, acao desconhecida, valor não inteiro)", [null, 5, {}, { acao: "x" }, { acao: "valor", id: 1, valor: 1.5 }, { acao: "adicionar", nome: 3, valor: 1, token: null }, { acao: "mover", id: "1", para: 0 }].every((x) => lerAcaoDaIniciativa(x) === null));
ok("11b) ações válidas passam e campos extras são descartados", JSON.stringify(lerAcaoDaIniciativa({ acao: "valor", id: 2, valor: 7, extra: "x" })) === JSON.stringify({ acao: "valor", id: 2, valor: 7 }) && lerAcaoDaIniciativa({ acao: "proxima", lixo: 1 }).acao === "proxima");
const lixo = lerIniciativa({ entradas: [{ id: 1, nome: "A", valor: 3, token: 9 }, { id: 1, nome: "dup", valor: 1 }, { id: -2, nome: "neg", valor: 1 }, { id: 3, nome: "B", valor: "x" }, null, 7], vez: 99, rodada: 1e9, ordenacao: "xyz", editando: "sim", proximoId: 0 });
ok("11c) a leitura de um estado estragado fica só com o que vale: 1 entrada, vez inválida vira null, rodada limitada, 'editando' estranho = em edição, proximoId > maior id", lixo.entradas.length === 1 && lixo.vez === null && lixo.rodada === 9999 && lixo.ordenacao === "maior" && lixo.editando === true && lixo.proximoId === 2, JSON.stringify(lixo));
ok("11c2) um estado SEM o campo 'editando' lê como em edição (a caixa começa em edição)", lerIniciativa({ entradas: [] }).editando === true && lerIniciativa({ entradas: [], editando: false }).editando === false);
ok("11d) um valor que não é objeto devolve null (e `definirIniciativa` deixa a iniciativa vazia)", lerIniciativa("oi") === null && (definirIniciativa("oi"), iniciativa.entradas.length === 0));
zerar();
add("X", 1);
const copia = iniciativaComoObjeto();
copia.entradas[0].nome = "mudou";
ok("12) 'iniciativaComoObjeto' devolve uma CÓPIA (mexer nela não muda o estado)", iniciativa.entradas[0].nome === "X");
process.exitCode = terminar();
