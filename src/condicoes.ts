// =====================================================================
// CONDIÇÕES do D&D 5.5: o catálogo de afecções que um token pode sofrer.
// Só dados (sem PixiJS nem HTML), para poder ser compartilhado com o servidor.
//
// O `id` é também o nome do arquivo do ícone em public/images/condicoes/
// (ex.: id "Cego" -> /images/condicoes/Cego.png). Os ids não têm acento
// porque são nomes de arquivo; o `nome` é o texto mostrado ao usuário.
// Para adicionar uma condição nova: coloque o PNG na pasta e inclua uma linha aqui.
//
// As DESCRIÇÕES são a tradução para português do resumo "Conditions" (imagem de
// referência enviada pelo dono do projeto). "Sangrando" não existe nessa imagem:
// usa o texto de "Death" (morrer e testes de morte), que é a regra de quem
// está sangrando até a morte. Ajuste se a sua mesa usar outra regra.
// Distâncias: a imagem usa pés; aqui estão em METROS (5 pés = 1,5 m, como no
// livro em português). "+1 pé por pé" vira "1 metro extra por metro" (a razão
// não muda com a unidade).
// =====================================================================

export interface Condicao {
    id: string; // nome do arquivo (sem a extensão .png), também usado no estado do token
    nome: string; // nome exibido, com acentos
    descricao: string[]; // uma linha por item da lista mostrada no balão de descrição
    /**
     * Como a condição aparece NO TOKEN:
     *   (sem valor)  ícone no anel de condições (o padrão, usado pela maioria)
     *   "x-vermelho" um X vermelho riscando o token (sem ocupar lugar no anel)
     * O ícone (arquivo PNG) existe de qualquer forma: é usado no menu e no balão.
     */
    visual?: "x-vermelho";
}

// Em ordem alfabética pelo nome exibido, EXCETO "Morto", que fica sempre por último.
// É a ordem em que as condições aparecem no menu "Add condição".
export const CONDICOES: Condicao[] = [
    {
        id: "Agarrado",
        nome: "Agarrado",
        descricao: [
            "A velocidade é 0 e não pode ser aumentada.",
            "Atacar qualquer um que não seja quem o agarra: DESVANTAGEM.",
            "Quem agarra pode arrastá-lo gastando 1 metro extra de movimento por metro arrastado (a menos que o agarrado seja Miúdo ou 2+ tamanhos menor).",
        ],
    },
    {
        id: "Amedrontado",
        nome: "Amedrontado",
        descricao: [
            "DESVANTAGEM em testes e ataques enquanto a fonte do medo estiver na linha de visão.",
            "Não pode se aproximar da fonte do medo.",
        ],
    },
    {
        id: "Atordoado",
        nome: "Atordoado",
        descricao: [
            "Tem a condição Incapacitado.",
            "Falha automaticamente em testes de resistência de FOR e DES.",
            "Atacantes têm VANTAGEM.",
        ],
    },
    {
        id: "Caido",
        nome: "Caído",
        descricao: [
            "Gasta metade da velocidade de movimento para encerrar a condição.",
            "Precisa rastejar (1 metro extra por metro, ou 2 metros extras por metro em terreno difícil).",
            "Ataca com DESVANTAGEM.",
            "Atacantes têm VANTAGEM a até 1,5 metro e DESVANTAGEM a mais de 1,5 metro.",
        ],
    },
    {
        id: "Cego",
        nome: "Cego",
        descricao: ["Falha em testes que dependem da visão.", "Ataca com DESVANTAGEM; atacantes têm VANTAGEM."],
    },
    {
        id: "Concentracao",
        nome: "Concentração",
        descricao: [
            "Necessária para manter certas magias.",
            "Perdida ao ficar Incapacitado.",
            "Exige um teste de resistência de CON para manter (CD = 10 ou metade do dano sofrido) sempre que for ferido ou distraído.",
        ],
    },
    {
        id: "Contido",
        nome: "Contido",
        descricao: [
            "A velocidade é 0 e não pode ser aumentada.",
            "Ataca com DESVANTAGEM; atacantes têm VANTAGEM.",
            "DESVANTAGEM em testes de resistência de DES.",
        ],
    },
    {
        id: "Encantado",
        nome: "Encantado",
        descricao: [
            "O encantado não pode ferir quem o encantou.",
            "Quem o encantou tem VANTAGEM em testes sociais contra ele.",
        ],
    },
    {
        id: "Envenenado",
        nome: "Envenenado",
        descricao: ["DESVANTAGEM em jogadas de ataque e testes de habilidade."],
    },
    {
        id: "Exaustao",
        nome: "Exaustão",
        descricao: [
            "Acumula até 6 vezes; morre ao chegar a 6 acúmulos.",
            "Reduz os testes de d20 em 2 × o nº de acúmulos.",
            "Reduz a velocidade em 1,5 metro × o nº de acúmulos.",
            "Um descanso longo remove 1 acúmulo.",
        ],
    },
    {
        id: "Incapacitado",
        nome: "Incapacitado",
        descricao: [
            "Não pode realizar ações, ações bônus nem reações.",
            "Não pode falar.",
            "DESVANTAGEM em testes de iniciativa.",
        ],
    },
    {
        // Está na imagem de referência ("Unconscious"). O ícone (Inconsciente.png) foi GERADO
        // (a imagem não tem o arquivo): um rosto de olhos fechados com "Zz". Pode ser trocado.
        id: "Inconsciente",
        nome: "Inconsciente",
        descricao: [
            "Tem a condição Caído.",
            "Tem os efeitos da condição Paralisado (sem estar paralisado).",
            "A velocidade é 0 e não pode ser aumentada.",
            "Não tem consciência do que acontece ao redor.",
        ],
    },
    {
        id: "Invisivel",
        nome: "Invisível",
        descricao: [
            "VANTAGEM em testes de iniciativa.",
            "Não pode ser alvo de efeitos que exijam visão.",
            "Ataca com VANTAGEM; atacantes têm DESVANTAGEM.",
        ],
    },
    {
        id: "Paralisado",
        nome: "Paralisado",
        descricao: [
            "Tem os efeitos da condição Atordoado (sem estar atordoado).",
            "Atacantes causam acerto crítico automático se estiverem a até 1,5 metro.",
        ],
    },
    {
        id: "Petrificado",
        nome: "Petrificado",
        descricao: [
            "Tem os efeitos da condição Atordoado (sem estar atordoado).",
            "É transformado: o peso aumenta 10 vezes.",
            "A velocidade é 0 e não pode ser aumentada.",
            "Resistência a todo dano.",
            "Imune à condição Envenenado.",
        ],
    },
    {
        id: "Sangrando",
        nome: "Sangrando",
        descricao: [
            "Se o dano sofrido exceder o PV máximo em pelo menos o valor do PV máximo, morre. Caso contrário, fica Inconsciente.",
            "A menos que esteja Estável no início do turno, faz um teste de morte (sucesso com 10 ou mais; 1 = 2 falhas; 20 = +1 PV).",
            "Fica Estável após 3 sucessos ou morre após 3 falhas.",
            "Sofrer dano é 1 falha; dano de acerto crítico são 2 falhas.",
        ],
    },
    {
        id: "Surdo",
        nome: "Surdo",
        descricao: ["Não consegue ouvir nada.", "Falha em testes que dependem da audição."],
    },
    {
        // Sempre por ÚLTIMO na lista (pedido do dono do projeto), fora da ordem alfabética.
        // Não existe na imagem de referência: a descrição só explica o que é e como aparece
        // (sem regras inventadas). O ícone (Morto.png) foi gerado: um X vermelho com contorno escuro.
        id: "Morto",
        nome: "Morto",
        descricao: ["A criatura está morta.", "O token aparece riscado com um X vermelho."],
        visual: "x-vermelho",
    },
];

/** Procura uma condição pelo id. */
export function buscarCondicao(id: string): Condicao | undefined {
    return CONDICOES.find((c) => c.id === id);
}

/** Endereço do ícone de uma condição (a pasta "public" é servida na raiz do site). */
export function urlDoIcone(id: string): string {
    return `/images/condicoes/${id}.png`;
}
