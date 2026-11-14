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
// referência enviada pelo dono do projeto; revisadas contra a versão corrigida da imagem em
// 14/11/2026). Na imagem, "AV" = vantagem e "DA" = desvantagem; os textos usam VANTAGEM e DESVANTAGEM.
// "Concentração" aparece na imagem só como regra citada (não é uma condição), mas continua no catálogo. "Sangrando" não existe nessa imagem:
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
            "DESVANTAGEM em jogadas de ataque contra qualquer alvo que não seja quem o agarra.",
            "Quem agarra pode arrastá-lo ou carregá-lo quando se move, mas cada metro custa 1 metro extra, a menos que o agarrado seja Miúdo ou duas ou mais categorias de tamanho menor que quem agarra.",
        ],
    },
    {
        id: "Amedrontado",
        nome: "Amedrontado",
        descricao: [
            "DESVANTAGEM em testes de habilidade e jogadas de ataque enquanto a fonte do medo estiver na linha de visão.",
            "Não pode se aproximar voluntariamente da fonte do medo.",
        ],
    },
    {
        id: "Atordoado",
        nome: "Atordoado",
        descricao: [
            "Tem a condição Incapacitado.",
            "Falha automaticamente em testes de resistência de FOR e DES.",
            "Jogadas de ataque contra a criatura têm VANTAGEM.",
        ],
    },
    {
        id: "Caido",
        nome: "Caído",
        descricao: [
            "As únicas opções de movimento são rastejar ou gastar metade da velocidade para se levantar e encerrar a condição.",
            "Não consegue se levantar se a velocidade for 0.",
            "DESVANTAGEM em jogadas de ataque.",
            "Jogadas de ataque contra a criatura têm VANTAGEM se o atacante estiver a até 1,5 metro; caso contrário, têm DESVANTAGEM.",
        ],
    },
    {
        id: "Cego",
        nome: "Cego",
        descricao: [
            "Não consegue enxergar: falha automaticamente em qualquer teste de habilidade que exija visão.",
            "Jogadas de ataque contra a criatura têm VANTAGEM, e as jogadas de ataque dela têm DESVANTAGEM.",
        ],
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
            "A velocidade é 0.",
            "Jogadas de ataque contra a criatura têm VANTAGEM, e as jogadas de ataque dela têm DESVANTAGEM.",
            "DESVANTAGEM em testes de resistência de DES.",
        ],
    },
    {
        id: "Encantado",
        nome: "Encantado",
        descricao: [
            "Não pode atacar quem o encantou nem escolhê-lo como alvo de habilidades danosas ou efeitos mágicos.",
            "Quem o encantou tem VANTAGEM em qualquer teste de habilidade para interagir socialmente com ele.",
        ],
    },
    {
        id: "Envenenado",
        nome: "Envenenado",
        descricao: [
            "DESVANTAGEM em jogadas de ataque e testes de habilidade.",
        ],
    },
    {
        id: "Exaustao",
        nome: "Exaustão",
        descricao: [
            "Testes de d20 são reduzidos em 2 × o nível de exaustão.",
            "A velocidade é reduzida em 1,5 metro × o nível de exaustão.",
            "Um descanso longo remove 1 nível de exaustão.",
            "Morre se o nível de exaustão chegar a 6.",
        ],
    },
    {
        id: "Incapacitado",
        nome: "Incapacitado",
        descricao: [
            "Não pode realizar ações, ações bônus nem reações.",
            "A concentração é interrompida.",
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
            "Tem as condições Incapacitado e Caído, e larga o que estiver segurando. Quando a condição termina, continua Caído.",
            "A velocidade é 0 e não pode ser aumentada.",
            "Jogadas de ataque contra a criatura têm VANTAGEM.",
            "Falha automaticamente em testes de resistência de FOR e DES.",
            "Qualquer jogada de ataque que o acerte é um acerto crítico se o atacante estiver a até 1,5 metro.",
            "Não tem consciência do que acontece ao redor.",
        ],
    },
    {
        id: "Invisivel",
        nome: "Invisível",
        descricao: [
            "VANTAGEM em testes de iniciativa.",
            "Não é afetado por nenhum efeito que exija que o alvo seja visto, a menos que o criador do efeito consiga vê-lo. Qualquer equipamento que esteja usando também fica oculto.",
            "Jogadas de ataque contra a criatura têm DESVANTAGEM, e as jogadas de ataque dela têm VANTAGEM. Perde esse benefício contra criaturas que a enxerguem.",
        ],
    },
    {
        id: "Paralisado",
        nome: "Paralisado",
        descricao: [
            "Tem a condição Incapacitado.",
            "A velocidade é 0.",
            "Falha automaticamente em testes de resistência de FOR e DES.",
            "Jogadas de ataque contra a criatura têm VANTAGEM.",
            "Qualquer jogada de ataque que a acerte é um acerto crítico se o atacante estiver a até 1,5 metro.",
        ],
    },
    {
        id: "Petrificado",
        nome: "Petrificado",
        descricao: [
            "É transformado numa substância inanimada (geralmente pedra), junto com os objetos não mágicos que veste e carrega. O peso aumenta 10 vezes e a criatura deixa de envelhecer.",
            "Tem a condição Incapacitado.",
            "A velocidade é 0.",
            "Falha automaticamente em testes de resistência de FOR e DES.",
            "Resistência a todo dano.",
            "Imunidade a veneno.",
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
        descricao: [
            "Não consegue ouvir e falha automaticamente em testes de habilidade que exijam audição.",
        ],
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
