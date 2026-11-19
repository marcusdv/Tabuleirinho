// =====================================================================
// PROTOCOLO da rede: o formato das mensagens trocadas entre o navegador e o servidor (WebSocket, em JSON).
// Este arquivo é COMPARTILHADO (o servidor e o navegador usam o mesmo): sem PixiJS, sem HTML.
//
//   - PedidoDoCliente: o que o navegador PEDE (mover um token, escrever no chat, rolar dados...).
//   - EventoDoServidor: o que o servidor AVISA a todos depois de validar e aplicar um pedido.
//
// REGRA DE SEGURANÇA (BRAINSTORM.md): tudo que chega de um navegador é dado NÃO confiável. `lerPedido` confere a
// FORMA de cada pedido (tipos certos, nenhum campo a mais) e devolve um objeto limpo, ou null. O sentido
// (o token existe? essa posição cabe? o texto passa do limite?) é conferido depois, pelas regras de estado.ts.
// =====================================================================

import { FORMAS_DE_PING, MAX_ABAS_FICHA, MAX_CASAS, MAX_PONTOS_REGUA, MAX_ACOES_MESA, MAX_CARACTERES_APELIDO, MAX_CARACTERES_IMAGEM_TOKEN, MAX_CARACTERES_NOME_VARIAVEL, MAX_CARACTERES_QUANTIA_ACAO, MAX_CARACTERES_TEXTO_FICHA, MAX_GRUPOS, MAX_STATUS_TOKEN, MAX_TOKENS_ACAO_EM_GRUPO, MAX_VALOR_VARIAVEL_QUE_MUDA } from "./config.ts";
import { lerAcaoDaIniciativa, type AcaoDaIniciativa, type Iniciativa } from "./iniciativa.ts";
import { idDeUsuarioValido, LIMITE_MAXIMO_POR_JOGADOR, type NivelDeAcesso, type Permissoes, type TipoDeItem } from "./permissoes.ts";
import { limparDesenho, type Desenho, type NovoDesenho } from "./estado.ts";
import { limparTraco, MAX_TRACOS_FOG, type TracoDeFog } from "./fog.ts";
import type { AbaFicha, AcaoDaMesa, AcaoNova, Ficha, GradeDaMesa, Grupo, Mensagem, MudancasToken, Pasta, StatusDoToken, StatusNovo, Token, ValorDeStatus } from "./estado.ts";

/** Os tipos de ping: ponto comum, "?" (Sumiu), "X" (Perigo), duas setas (Avançar), escudo (Ajuda) e os outros que estão em `DADOS_DAS_FORMAS_DE_PING` (config.ts). */
export type FormaDePing = (typeof FORMAS_DE_PING)[number];

/** Uma casa (coluna, linha) da régua. */
export interface CasaDaRegua {
    col: number;
    row: number;
}

/** Um jogador conectado à mesa. */
export interface Jogador {
    id: number;
    apelido: string;
    usuario?: string; // o ID de usuário estável (o servidor o preenche; é o que as permissões usam)
    mestre?: boolean; // tem poder de MESTRE agora (o servidor preenche)
    /** Esta pessoa está NA MESMA CENA (no mesmo mapa) de quem recebe a lista? O servidor calcula para cada destinatário (assim os ids dos mapas não vazam). */
    naMinhaCena?: boolean;
    /** O mapa em que a pessoa está (o servidor só preenche para o MESTRE, que sabe os ids): a aba Mapas mostra "jogadores aqui". */
    mapa?: string | null;
    /** (só para o MESTRE) a pessoa foi levada a um mapa que NÃO tem permissão de ver. */
    semPermissao?: boolean;
}

/** Um mapa da BIBLIOTECA da mesa (a imagem fica num arquivo no servidor, nunca na mensagem): quem o escolhe baixa por `/mapas/<id>`. O `id` é gerado pelo servidor (16 caracteres hexadecimais). */
export interface RegistroDeMapa {
    id: string;
    nome: string;
    tipo: "png" | "jpeg" | "webp";
    largura: number; // pixels, lidos no cabeçalho da imagem
    altura: number;
    bytes: number;
    /** QUEM VÊ este mapa (pedido do dono, 17/11/2026): o mestre sempre vê; `todos` = todos os jogadores; senão, só os `usuarios` listados (nenhum = só o mestre). Quem não vê o mapa atual vê o tabuleiro vazio. Sem o campo: todos. */
    quemVe?: { todos: boolean; usuarios: string[] };
    /** O tamanho do tabuleiro DESTE mapa (cada mapa tem o seu; sem o campo vale o da mesa). */
    colunas?: number;
    linhas?: number;
    /** A grade (espessura e cor) DESTE mapa: cada mapa tem a sua (sem o campo vale a da mesa). */
    grade?: GradeDaMesa;
}

/** O formato de um id de mapa (o servidor gera; um pedido com outra coisa é recusado). */
export const ID_DE_MAPA = /^[0-9a-f]{16}$/;

/** O que o navegador PEDE ao servidor. */
export type PedidoDoCliente =
    | { tipo: "entrar"; apelido: string }
    | { tipo: "colocar_token"; id: number; col: number; row: number } // soltar um token no mapa (mover ou tirar da bolsa)
    | { tipo: "guardar_token"; id: number } // soltar um token na bolsa
    | { tipo: "alternar_condicao"; id: number; condicao: string } // liga/desliga uma condição (ex.: "morto") de um token; o servidor confere, grava e avisa todos
    | { tipo: "ajustar_valor_ficha"; ficha: number; nome: string; delta: number } // SOMAR `delta` (+ ou -) ao valor atual de uma variável que muda da ficha: o SERVIDOR limita ao intervalo, grava e avisa todos
    | { tipo: "iniciativa"; acao: AcaoDaIniciativa } // uma ação na ordem de COMBATE (adicionar, remover, mover, valor, ordenar, resetar, próxima vez...): o SERVIDOR aplica, guarda e avisa todos
    | { tipo: "arrastar_resultado"; token: number; mensagem: number; indice?: number; dado?: number } // o TOTAL de uma rolagem do chat (ou um DADO dela, `dado` = a posição) foi solto num token: ele perde essa quantidade do status marcado; o SERVIDOR lê o total da mensagem (o navegador não manda número)
    | { tipo: "aplicar_acao_varios"; tokens: number[]; acao: number; valor: string } // a mesma ação em VÁRIOS tokens de uma vez (dano ou cura em área): os dados são rolados UMA vez (o mesmo total para todos)
    | { tipo: "condicao_varios"; tokens: number[]; condicao: string; ligar: boolean } // LIGA ou desliga uma condição em vários tokens de uma vez
    | { tipo: "aplicar_acao"; token: number; acao: number; valor: string } // aplicar uma ação (Dano, Cura...) a um token: `valor` = um número ou dados ("2d6+3"); o SERVIDOR sorteia e aplica
    | { tipo: "definir_acoes"; acoes: AcaoNova[] } // mudar as AÇÕES da mesa inteira (criar, excluir)
    | { tipo: "definir_status"; status: StatusNovo[] } // mudar os STATUS (barras) da MESA INTEIRA: vale para todos os tokens e peças; o SERVIDOR guarda e avisa todos
    | { tipo: "definir_grade"; espessura: number; cor: string | null; alfa?: number } // mudar a espessura e a cor da grade da MESA (só o mestre): o servidor limpa, grava e avisa todos
    | { tipo: "definir_tamanho"; colunas: number; linhas: number } // mudar o tamanho do tabuleiro (trocar de mapa, botões de colunas/linhas, Alinhar mapa): o SERVIDOR é quem decide e avisa todos
    | { tipo: "colocar_modelo"; modelo: number; col: number; row: number; valores?: { id: number; atual: number }[]; condicoes?: string[] } // arrastar um token da BOLSA para o tabuleiro: o SERVIDOR cria uma PEÇA (cópia temporária); `valores`/`condicoes` só no "Desfazer" de uma remoção
    | { tipo: "enviar_mensagem"; texto: string }
    | { tipo: "rolar_dados"; lados: number; quantidade: number; modificador: number }
    | { tipo: "rolar_conta"; texto: string } // o "/r" do chat: uma conta com dados (o servidor confere, sorteia e manda o cartão)
    | { tipo: "criar_token"; nome: string; cor: number; corBorda: number; tamanho: number; imagem: string | null; ficha?: number | null } // o SERVIDOR dá o id e cria o arquivo (`ficha` = "Gerar um token" a partir de uma ficha)
    | { tipo: "editar_token"; id: number; mudancas: MudancasToken } // nome, tamanho, cores e/ou imagem
    | { tipo: "excluir_token"; id: number } // apaga o token E o arquivo dele
    | { tipo: "criar_ficha"; token?: number } // o SERVIDOR dá o id e cria o arquivo NA HORA (a ficha nasce vazia, "Ficha N"); com `token` (um token da bolsa SEM ficha), ela nasce com o NOME do token e já fica LIGADA a ele
    | { tipo: "editar_ficha"; id: number; versao: number; nome?: string; abas?: AbaFicha[] } // `versao` = a que a pessoa tinha na tela ao abrir; `abas` = a lista INTEIRA de abas (1 a 6)
    | { tipo: "excluir_ficha"; id: number } // apaga a ficha E o arquivo dela
    | { tipo: "marcar_ficha"; id: number; favorito?: boolean; grupos?: number[] } // estrela e/ou grupos da ficha: NÃO sobe a versão (não é o conteúdo)
    | { tipo: "criar_grupo"; nome: string; cor: number } // o SERVIDOR dá o id e cria o arquivo em dados/grupos/
    | { tipo: "editar_grupo"; id: number; nome?: string; cor?: number }
    | { tipo: "excluir_grupo"; id: number } // apaga o grupo E a marca dele em todos os tokens e fichas (os itens ficam)
    | { tipo: "rolar_ficha"; id: number; versao: number; aba: number; indice: number; token?: number | null } // rola a rolagem de posição `indice` da ABA `aba` da ficha SALVA (na versão `versao`)
    | { tipo: "definir_mapa"; id: string | null; colunas?: number; linhas?: number } // o MESTRE troca o mapa atual (null = nenhum); o servidor confere que ele existe e avisa todos
    | { tipo: "desenhar"; desenho: NovoDesenho; ref?: string } // um desenho novo (lápis ou forma) no mapa atual; o SERVIDOR confere, dá o id e o autor e avisa todos (`ref` volta junto, para quem desenhou reconhecer o seu)
    | { tipo: "apagar_desenhos"; ids: number[] } // apagar desenhos (a borracha, o Ctrl+Z, "Apagar tudo"): o servidor apaga só os que a pessoa pode (o mestre, todos; os outros, os próprios)
    | { tipo: "liberar"; item: TipoDeItem | "grupos" | "pastas"; id: number; usuario: string; nivel: NivelDeAcesso | null } // o MESTRE libera um token, uma ficha ou um GRUPO a um jogador como leitor ou editor (nivel null = tirar a liberação)
    | { tipo: "definir_limites"; tokens: number; fichas: number } // o MESTRE muda os limites por jogador (configuração da mesa)
    | { tipo: "criar_pasta"; tipoDaPasta: "tokens" | "fichas"; nome: string; pai: number | null } // PASTAS da bolsa: criar uma (o mestre, ou um jogador: vira o dono)
    | { tipo: "editar_pasta"; id: number; nome?: string; pai?: number | null } // renomear e/ou pôr dentro de outra pasta (o dono da pasta, um editor dela ou o mestre)
    | { tipo: "excluir_pasta"; id: number } // apagar (o que estava dentro sobe um nível; nada é apagado junto)
    | { tipo: "mover_para_pasta"; item: "tokens" | "fichas"; ids: number[]; pasta: number | null } // pôr itens numa pasta (arrastar na bolsa); null = raiz
    | { tipo: "fog_ativar"; mapa: string; ativo: boolean; cobrirTudo?: boolean } // o MESTRE liga/desliga o fog de um mapa (ao ligar, `cobrirTudo` o começa todo coberto)
    | { tipo: "fog_pintar"; tracos: TracoDeFog[] } // o MESTRE pinta o fog do mapa em que está (cobre ou revela, com um pincel redondo)
    | { tipo: "fog_preencher"; cobrir: boolean } // o MESTRE cobre ou revela o mapa inteiro
    | { tipo: "mover_jogadores" } // o MESTRE leva todos os jogadores para o mapa em que ele está
    | { tipo: "definir_quem_ve_mapa"; id: string; todos: boolean; usuarios: string[] } // o MESTRE escolhe quem vê um mapa da biblioteca (todos os jogadores, jogadores específicos ou só o mestre)
    | { tipo: "banir"; usuario: string; banir: boolean; nome?: string } // o MESTRE bane (ou desbane) um jogador da mesa: ele é desconectado e não consegue entrar de novo
    | { tipo: "definir_mestre"; usuario: string; mestre: boolean } // o MESTRE dá (ou tira) o poder de mestre a outro usuário (o dono do servidor nunca perde)
    | { tipo: "excluir_mapa"; id: string } // o MESTRE apaga um mapa da biblioteca (e o arquivo)
    | { tipo: "ping"; col: number; row: number; forma: FormaDePing; cor: number } // um PING no mapa (em casas, com fração: o ponto exato clicado) com a `cor` do desenho escolhida (0xRRGGBB); o SERVIDOR confere, limita a frequência e avisa quem está na mesma cena e vê aquele ponto
    | { tipo: "regua"; caminho: CasaDaRegua[] | null; cor: number } // a RÉGUA de quem mede (os pontos em casas; null = a medida sumiu) na `cor` do desenho escolhida: o servidor repassa a quem está na mesma cena
    | { tipo: "usar_cartao"; id: number; versao: number; aba: number; indice: number; token?: number | null }; // usa o CARTÃO de posição `indice` da ABA `aba` da ficha SALVA: o servidor calcula/rola as [expressões] e manda o cartão ao chat

/** O que o servidor AVISA aos navegadores. */
export type EventoDoServidor =
    | { tipo: "estado_inicial"; voce: Jogador; colunas: number; linhas: number; status: StatusDoToken[]; acoes: AcaoDaMesa[]; tokens: Token[]; mensagens: Mensagem[]; fichas: Ficha[]; grupos: Grupo[]; valores: Record<string, Record<string, number>>; iniciativa: Iniciativa; mestre: boolean; mapa: string | null; mapas: RegistroDeMapa[]; grade: GradeDaMesa; permissoes: Permissoes | null; desenhos: Desenho[]; semPermissao?: boolean; pastas?: Pasta[] } // `permissoes`: o documento inteiro, SÓ para o mestre (null para os jogadores);  `grade`: a espessura e a cor da grade da mesa; `mestre`: esta conexão é a do MESTRE (por enquanto: a do computador do servidor); `mapa`: o id do mapa atual; `mapas`: a biblioteca
    | { tipo: "token_criado"; token: Token } // já gravado no disco do servidor; nasce guardado na bolsa
    | { tipo: "iniciativa_definida"; iniciativa: Iniciativa } // a ordem de combate inteira, como ficou depois de uma ação
    | { tipo: "valores_ficha"; id: number; valores: Record<string, number> } // os valores atuais das variáveis que mudam de uma ficha (NOME em MAIÚSCULAS -> valor): o SERVIDOR já limitou; cada navegador refaz as barras dos tokens dela
    | { tipo: "condicoes_atualizadas"; id: number; condicoes: string[] } // as condições de um token mudaram (a lista inteira, na ordem em que foram aplicadas)
    | { tipo: "valores_atualizados"; id: number; valores: ValorDeStatus[]; efeito?: "dano" | "cura" } // os valores (PV...) de uma peça mudaram (uma ação foi aplicada)
    | { tipo: "acoes_definidas"; acoes: AcaoDaMesa[] } // a lista de ações da mesa mudou
    | { tipo: "status_definidos"; status: StatusDoToken[]; pecas: { id: number; valores: ValorDeStatus[] }[] } // a regra dos status mudou para todos; `pecas`: os valores (PV...) de cada peça, que o servidor já refez
    | { tipo: "fog_definido"; ativo: boolean; colunas?: number; linhas?: number; bits?: string } // o fog do mapa em que você está (a máscara inteira, em base64; sem fog: só `ativo: false`)
    | { tipo: "fog_pintado"; tracos: TracoDeFog[] } // pinceladas novas do mestre (cada navegador as aplica na máscara que já tem)
    | { tipo: "pasta_definida"; pasta: Pasta } // uma pasta nova ou mudada (só chega a quem pode vê-la)
    | { tipo: "pasta_excluida"; id: number } // a pasta sumiu (apagada, ou esta pessoa deixou de poder vê-la)
    | { tipo: "mapa_definido"; mapa: string | null; colunas?: number; linhas?: number; grade?: GradeDaMesa; semPermissao?: boolean } // `semPermissao`: o mestre levou esta pessoa a um mapa que ela NÃO pode ver (tabuleiro vazio) // o mapa atual mudou (o id na biblioteca; null = nenhum)
    | { tipo: "mapas_definidos"; mapas: RegistroDeMapa[] } // a biblioteca mudou (enviaram ou apagaram um mapa): a lista inteira
    | { tipo: "grade_definida"; grade: GradeDaMesa } // a espessura e a cor da grade DO MAPA em que você está mudaram (já limpas)
    | { tipo: "tamanho_definido"; colunas: number; linhas: number } // o tamanho do tabuleiro mudou (já limitado ao permitido); cada navegador puxa para dentro os tokens que ficaram fora
    | { tipo: "peca_criada"; token: Token } // uma PEÇA nova no tabuleiro (cópia de um token da bolsa), já gravada no servidor
    | { tipo: "token_editado"; token: Token } // o token inteiro, como ficou
    | { tipo: "token_excluido"; id: number }
    | { tipo: "ficha_criada"; ficha: Ficha }
    | { tipo: "ficha_excluida"; id: number }
    | { tipo: "ficha_editada"; ficha: Ficha } // já gravada no disco do servidor (a ficha inteira, com a versão nova)
    | { tipo: "ficha_conflito"; ficha: Ficha } // só para quem pediu: a ficha mudou desde que ele a abriu; esta é a versão ATUAL // já gravada no disco do servidor
    | { tipo: "grupo_criado"; grupo: Grupo }
    | { tipo: "grupo_editado"; grupo: Grupo }
    | { tipo: "grupo_excluido"; id: number } // quem recebe tira o grupo também de todos os tokens e fichas (`excluirGrupo`)
    | { tipo: "jogadores"; lista: Jogador[] }
    | { tipo: "desenho_criado"; desenho: Desenho; ref?: string } // um desenho novo no mapa (com id e autor); `ref` é o que o autor mandou
    | { tipo: "desenhos_apagados"; ids: number[] }
    | { tipo: "desenhos_definidos"; desenhos: Desenho[] } // os desenhos do mapa inteiro (o mestre trocou de mapa)
    | { tipo: "permissoes"; permissoes: Permissoes } // SÓ para os mestres: o documento de permissões mudou (liberações, limites, mestres)
    | { tipo: "papel"; mestre: boolean } // SÓ para quem mudou de papel (foi promovido ou rebaixado): a interface se refaz
    | { tipo: "token_colocado"; id: number; col: number; row: number; valores?: ValorDeStatus[] } // `valores`: os status temporários (nascem ao sair da bolsa; o SERVIDOR os calcula lendo a ficha)
    | { tipo: "token_guardado"; id: number }
    | { tipo: "mensagem"; mensagem: Mensagem } // texto do chat OU cartão de rolagem (criados só pelo servidor)
    | { tipo: "ping"; col: number; row: number; forma: FormaDePing; cor: number; usuario: string; apelido: string; seu?: boolean } // um ping de alguém da sua cena (`seu`: foi você que pingou)
    | { tipo: "regua"; usuario: string; apelido: string; caminho: CasaDaRegua[] | null; cor: number } // a régua de alguém da sua cena (null = sumiu: ele soltou a ferramenta, saiu ou mudou de mapa)
    | { tipo: "erro"; motivo: string };

/** Limite do texto de um pedido ANTES de qualquer outra conta (o estado.ts aplica o limite de verdade). */
const TEXTO_MAX_BRUTO = 1000;

const eInteiro = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor);
/** Uma cor 0xRRGGBB (inteiro de 0 a 16777215). */
const eCor = (valor: unknown): valor is number => eInteiro(valor) && valor >= 0 && valor <= 0xffffff;
const eNumero = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor);
const eTexto = (valor: unknown, maximo: number): valor is string => typeof valor === "string" && valor.length <= maximo;

/** Uma lista de ids de grupos: só inteiros, no máximo MAX_GRUPOS (o sentido, se o grupo existe, é conferido por `limparGrupos`). null se for outra coisa. */
function lerListaDeIds(bruto: unknown): number[] | null {
    if (!Array.isArray(bruto) || bruto.length > MAX_GRUPOS || !bruto.every(eInteiro)) return null;
    return [...(bruto as number[])];
}

/** A lista de status de um token: no máximo MAX_STATUS_TOKEN itens, cada um com nome e variável (texto curto), cor (inteiro) e, se já existia, o id. O estado.ts (`limparStatus`) limpa o conteúdo. null se for outra coisa. */
function lerListaDeStatus(bruto: unknown): StatusNovo[] | null {
    if (!Array.isArray(bruto) || bruto.length > MAX_STATUS_TOKEN) return null;
    const lista: StatusNovo[] = [];
    for (const s of bruto) {
        if (typeof s !== "object" || s === null || Array.isArray(s)) return null;
        const x = s as Record<string, unknown>;
        if (!eTexto(x.nome, TEXTO_MAX_BRUTO) || !eTexto(x.variavel, TEXTO_MAX_BRUTO) || !eInteiro(x.cor)) return null;
        if (x.id !== undefined && !eInteiro(x.id)) return null;
        if ((x.mostrar !== undefined && typeof x.mostrar !== "boolean") || (x.numeros !== undefined && typeof x.numeros !== "boolean") || (x.mostrarNome !== undefined && typeof x.mostrarNome !== "boolean")) return null;
        let quemVe: { dono: boolean; leitores: boolean; outros: boolean } | undefined;
        if (x.quemVe !== undefined) {
            const q = x.quemVe as Record<string, unknown> | null;
            if (typeof q !== "object" || q === null || typeof q.dono !== "boolean" || typeof q.leitores !== "boolean" || typeof q.outros !== "boolean") return null;
            quemVe = { dono: q.dono, leitores: q.leitores, outros: q.outros };
        }
        let grupos: number[] | null | undefined;
        if (x.grupos !== undefined && x.grupos !== null) {
            if (!Array.isArray(x.grupos) || x.grupos.length > MAX_GRUPOS || !x.grupos.every(eInteiro)) return null; // (a lista de grupos em que o status vale; o estado.ts descarta os que não existem)
            grupos = [...(x.grupos as number[])];
        } else grupos = x.grupos;
        lista.push({ ...(x.id !== undefined && { id: x.id }), nome: x.nome, variavel: x.variavel, cor: x.cor, ...(x.mostrar !== undefined && { mostrar: x.mostrar }), ...(x.mostrarNome !== undefined && { mostrarNome: x.mostrarNome }), ...(x.numeros !== undefined && { numeros: x.numeros }), ...(grupos !== undefined && { grupos }), ...(x.semGrupo === true && { semGrupo: true }), ...(x.recebeArrasto === true && { recebeArrasto: true }), ...(quemVe !== undefined && { quemVe }), ...(x.posicao === "cima" && { posicao: "cima" as const }) }); // (`posicao`: só "cima" muda algo; o resto vale embaixo)
    }
    return lista;
}

/**
 * Confere a FORMA de um pedido que veio da rede (já convertido de JSON). Devolve um pedido limpo (só os campos
 * conhecidos) ou null se for qualquer outra coisa. Nunca lança erro, não importa o que chegue.
 */
/** Uma lista de ids de tokens para uma ação em ÁREA: de 1 a MAX_TOKENS_ACAO_EM_GRUPO números inteiros, sem repetir. Qualquer outra coisa invalida o pedido. */
function lerIdsDeTokens(bruto: unknown): number[] | null {
    if (!Array.isArray(bruto) || bruto.length < 1 || bruto.length > MAX_TOKENS_ACAO_EM_GRUPO) return null;
    const ids: number[] = [];
    for (const id of bruto) {
        if (!eInteiro(id) || ids.includes(id)) return null;
        ids.push(id);
    }
    return ids;
}

export function lerPedido(bruto: unknown): PedidoDoCliente | null {
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
    const p = bruto as Record<string, unknown>;
    switch (p.tipo) {
        case "entrar":
            return eTexto(p.apelido, TEXTO_MAX_BRUTO) ? { tipo: "entrar", apelido: p.apelido } : null;
        case "colocar_token":
            return eInteiro(p.id) && eInteiro(p.col) && eInteiro(p.row) ? { tipo: "colocar_token", id: p.id, col: p.col, row: p.row } : null;
        case "alternar_condicao":
            return eInteiro(p.id) && eTexto(p.condicao, 40) ? { tipo: "alternar_condicao", id: p.id, condicao: p.condicao } : null;
        case "guardar_token":
            return eInteiro(p.id) ? { tipo: "guardar_token", id: p.id } : null;
        case "ajustar_valor_ficha":
            return eInteiro(p.ficha) && eTexto(p.nome, MAX_CARACTERES_NOME_VARIAVEL) && eInteiro(p.delta) && Math.abs(p.delta) <= 2 * MAX_VALOR_VARIAVEL_QUE_MUDA ? { tipo: "ajustar_valor_ficha", ficha: p.ficha, nome: p.nome, delta: p.delta } : null;
        case "iniciativa": {
            const acao = lerAcaoDaIniciativa(p.acao);
            return acao ? { tipo: "iniciativa", acao } : null;
        }
        case "arrastar_resultado":
            return eInteiro(p.token) && eInteiro(p.mensagem) && (p.indice === undefined || eInteiro(p.indice)) && (p.dado === undefined || eInteiro(p.dado)) ? { tipo: "arrastar_resultado", token: p.token, mensagem: p.mensagem, ...(p.indice !== undefined && { indice: p.indice }), ...(p.dado !== undefined && { dado: p.dado }) } : null; // (`indice`: qual número de um CARTÃO foi arrastado)
        case "aplicar_acao_varios": {
            const ids = lerIdsDeTokens(p.tokens);
            return ids && eInteiro(p.acao) && eTexto(p.valor, MAX_CARACTERES_QUANTIA_ACAO) ? { tipo: "aplicar_acao_varios", tokens: ids, acao: p.acao, valor: p.valor } : null;
        }
        case "condicao_varios": {
            const ids = lerIdsDeTokens(p.tokens);
            return ids && eTexto(p.condicao, 40) && typeof p.ligar === "boolean" ? { tipo: "condicao_varios", tokens: ids, condicao: p.condicao, ligar: p.ligar } : null;
        }
        case "aplicar_acao":
            return eInteiro(p.token) && eInteiro(p.acao) && eTexto(p.valor, MAX_CARACTERES_QUANTIA_ACAO) ? { tipo: "aplicar_acao", token: p.token, acao: p.acao, valor: p.valor } : null;
        case "definir_acoes": {
            if (!Array.isArray(p.acoes) || p.acoes.length > MAX_ACOES_MESA) return null;
            const acoes: AcaoNova[] = [];
            for (const a of p.acoes) {
                const x = typeof a === "object" && a !== null ? (a as Record<string, unknown>) : null;
                if (!x || !eTexto(x.nome, TEXTO_MAX_BRUTO) || !eInteiro(x.status) || (x.efeito !== "reduzir" && x.efeito !== "aumentar")) return null;
                if (x.id !== undefined && !eInteiro(x.id)) return null;
                acoes.push({ ...(x.id !== undefined && { id: x.id }), nome: x.nome, status: x.status, efeito: x.efeito });
            }
            return { tipo: "definir_acoes", acoes };
        }
        case "definir_status": {
            const status = lerListaDeStatus(p.status);
            return status === null ? null : { tipo: "definir_status", status };
        }
        case "definir_mapa":
            // `colunas` e `linhas` (as duas ou nenhuma): o tamanho do tabuleiro que acompanha o mapa. Vão JUNTOS no mesmo evento, para cada navegador trocar a imagem e o tamanho de uma vez, só depois de a imagem chegar.
            if (!(p.id === null || (typeof p.id === "string" && ID_DE_MAPA.test(p.id)))) return null;
            if (p.colunas === undefined && p.linhas === undefined) return { tipo: "definir_mapa", id: p.id };
            return eInteiro(p.colunas) && eInteiro(p.linhas) ? { tipo: "definir_mapa", id: p.id, colunas: p.colunas, linhas: p.linhas } : null;
        case "desenhar": {
            const desenho = limparDesenho(p.desenho);
            if (!desenho || (p.ref !== undefined && !eTexto(p.ref, 24))) return null;
            return { tipo: "desenhar", desenho, ...(p.ref !== undefined && { ref: p.ref as string }) };
        }
        case "apagar_desenhos": {
            if (!Array.isArray(p.ids) || p.ids.length < 1 || p.ids.length > 5000 || !p.ids.every(eInteiro)) return null;
            return { tipo: "apagar_desenhos", ids: [...(p.ids as number[])] };
        }
        case "liberar":
            return (p.item === "tokens" || p.item === "fichas" || p.item === "grupos" || p.item === "pastas") && eInteiro(p.id) && idDeUsuarioValido(p.usuario) && (p.nivel === null || p.nivel === "leitor" || p.nivel === "editor")
                ? { tipo: "liberar", item: p.item, id: p.id, usuario: p.usuario, nivel: p.nivel }
                : null;
        case "definir_limites":
            return eInteiro(p.tokens) && eInteiro(p.fichas) && p.tokens >= 0 && p.fichas >= 0 && p.tokens <= LIMITE_MAXIMO_POR_JOGADOR && p.fichas <= LIMITE_MAXIMO_POR_JOGADOR ? { tipo: "definir_limites", tokens: p.tokens, fichas: p.fichas } : null;
        case "definir_quem_ve_mapa":
            return typeof p.id === "string" && ID_DE_MAPA.test(p.id) && typeof p.todos === "boolean" && Array.isArray(p.usuarios) && p.usuarios.length <= 100 && p.usuarios.every((u) => idDeUsuarioValido(u))
                ? { tipo: "definir_quem_ve_mapa", id: p.id, todos: p.todos, usuarios: [...new Set(p.usuarios as string[])] }
                : null;
        case "banir":
            return idDeUsuarioValido(p.usuario) && typeof p.banir === "boolean" && (p.nome === undefined || eTexto(p.nome, 40)) ? { tipo: "banir", usuario: p.usuario, banir: p.banir, ...(p.nome !== undefined && { nome: p.nome as string }) } : null;
        case "definir_mestre":
            return idDeUsuarioValido(p.usuario) && typeof p.mestre === "boolean" ? { tipo: "definir_mestre", usuario: p.usuario, mestre: p.mestre } : null;
        case "fog_ativar":
            return typeof p.mapa === "string" && (ID_DE_MAPA.test(p.mapa) || p.mapa === "_") && typeof p.ativo === "boolean" && (p.cobrirTudo === undefined || typeof p.cobrirTudo === "boolean")
                ? { tipo: "fog_ativar", mapa: p.mapa, ativo: p.ativo, ...(p.cobrirTudo !== undefined && { cobrirTudo: p.cobrirTudo }) }
                : null;
        case "fog_pintar": {
            if (!Array.isArray(p.tracos) || p.tracos.length < 1 || p.tracos.length > MAX_TRACOS_FOG) return null;
            const tracos = p.tracos.map(limparTraco);
            return tracos.every((t) => t !== null) ? { tipo: "fog_pintar", tracos: tracos as TracoDeFog[] } : null;
        }
        case "ping": {
            // O ponto em casas (com fração). Só confere a forma e o tamanho do número; o servidor limita ao tabuleiro da cena.
            const limite = MAX_CASAS + 1;
            const forma = (FORMAS_DE_PING as readonly unknown[]).includes(p.forma) ? (p.forma as FormaDePing) : null;
            return forma && eCor(p.cor) && eNumero(p.col) && eNumero(p.row) && p.col >= -limite && p.col <= limite && p.row >= -limite && p.row <= limite ? { tipo: "ping", col: p.col, row: p.row, forma, cor: p.cor } : null;
        }
        case "regua": {
            if (!eCor(p.cor)) return null;
            if (p.caminho === null) return { tipo: "regua", caminho: null, cor: p.cor };
            if (!Array.isArray(p.caminho) || p.caminho.length < 1 || p.caminho.length > MAX_PONTOS_REGUA + 1) return null;
            const caminho: CasaDaRegua[] = [];
            for (const c of p.caminho as unknown[]) {
                if (typeof c !== "object" || c === null || Array.isArray(c)) return null;
                const { col, row } = c as Record<string, unknown>;
                if (!eInteiro(col) || !eInteiro(row) || col < 0 || col >= MAX_CASAS || row < 0 || row >= MAX_CASAS) return null;
                caminho.push({ col, row });
            }
            return { tipo: "regua", caminho, cor: p.cor };
        }
        case "fog_preencher":
            return typeof p.cobrir === "boolean" ? { tipo: "fog_preencher", cobrir: p.cobrir } : null;
        case "criar_pasta":
            return (p.tipoDaPasta === "tokens" || p.tipoDaPasta === "fichas") && eTexto(p.nome, 200) && (p.pai === null || eInteiro(p.pai)) ? { tipo: "criar_pasta", tipoDaPasta: p.tipoDaPasta, nome: p.nome, pai: p.pai as number | null } : null;
        case "editar_pasta":
            if (!eInteiro(p.id) || (p.nome !== undefined && !eTexto(p.nome, 200)) || (p.pai !== undefined && p.pai !== null && !eInteiro(p.pai))) return null;
            return { tipo: "editar_pasta", id: p.id, ...(p.nome !== undefined && { nome: p.nome as string }), ...(p.pai !== undefined && { pai: p.pai as number | null }) };
        case "excluir_pasta":
            return eInteiro(p.id) ? { tipo: "excluir_pasta", id: p.id } : null;
        case "mover_para_pasta":
            return (p.item === "tokens" || p.item === "fichas") && Array.isArray(p.ids) && p.ids.length >= 1 && p.ids.length <= 500 && p.ids.every((x) => eInteiro(x)) && (p.pasta === null || eInteiro(p.pasta))
                ? { tipo: "mover_para_pasta", item: p.item, ids: [...new Set(p.ids as number[])], pasta: p.pasta as number | null }
                : null;
        case "mover_jogadores":
            return { tipo: "mover_jogadores" };
        case "excluir_mapa":
            return typeof p.id === "string" && ID_DE_MAPA.test(p.id) ? { tipo: "excluir_mapa", id: p.id } : null;
        case "definir_grade":
            return typeof p.espessura === "number" && Number.isFinite(p.espessura) && (p.cor === null || (typeof p.cor === "string" && p.cor.length <= 7)) ? { tipo: "definir_grade", espessura: p.espessura, cor: p.cor, ...(typeof p.alfa === "number" && Number.isFinite(p.alfa) && { alfa: p.alfa }) } : null; // (o sentido e os limites: `limparGradeDaMesa`)
        case "definir_tamanho":
            return eInteiro(p.colunas) && eInteiro(p.linhas) ? { tipo: "definir_tamanho", colunas: p.colunas, linhas: p.linhas } : null;
        case "colocar_modelo": {
            if (!eInteiro(p.modelo) || !eInteiro(p.col) || !eInteiro(p.row)) return null;
            let valores: { id: number; atual: number }[] | undefined;
            if (p.valores !== undefined) {
                if (!Array.isArray(p.valores) || p.valores.length > MAX_STATUS_TOKEN) return null;
                valores = [];
                for (const v of p.valores) {
                    const x = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
                    if (!eInteiro(x.id) || !eInteiro(x.atual)) return null;
                    valores.push({ id: x.id, atual: x.atual });
                }
            }
            let condicoes: string[] | undefined;
            if (p.condicoes !== undefined) {
                if (!Array.isArray(p.condicoes) || p.condicoes.length > 40 || !p.condicoes.every((c) => eTexto(c, 40))) return null;
                condicoes = [...(p.condicoes as string[])];
            }
            return { tipo: "colocar_modelo", modelo: p.modelo, col: p.col, row: p.row, ...(valores && { valores }), ...(condicoes && { condicoes }) };
        }
        case "enviar_mensagem":
            return eTexto(p.texto, TEXTO_MAX_BRUTO) ? { tipo: "enviar_mensagem", texto: p.texto } : null;
        case "rolar_conta":
            return eTexto(p.texto, TEXTO_MAX_BRUTO) ? { tipo: "rolar_conta", texto: p.texto } : null;
        case "rolar_dados":
            return eInteiro(p.lados) && eInteiro(p.quantidade) && eInteiro(p.modificador)
                ? { tipo: "rolar_dados", lados: p.lados, quantidade: p.quantidade, modificador: p.modificador }
                : null;
        case "criar_token":
            return eTexto(p.nome, TEXTO_MAX_BRUTO) &&
                eInteiro(p.cor) &&
                eInteiro(p.corBorda) &&
                eInteiro(p.tamanho) &&
                (p.imagem === null || eTexto(p.imagem, MAX_CARACTERES_IMAGEM_TOKEN)) &&
                (p.ficha === undefined || p.ficha === null || eInteiro(p.ficha))
                ? { tipo: "criar_token", nome: p.nome, cor: p.cor, corBorda: p.corBorda, tamanho: p.tamanho, imagem: p.imagem, ...(p.ficha !== undefined && { ficha: p.ficha }) }
                : null;
        case "editar_token": {
            if (!eInteiro(p.id) || typeof p.mudancas !== "object" || p.mudancas === null || Array.isArray(p.mudancas)) return null;
            const m = p.mudancas as Record<string, unknown>;
            const mudancas: MudancasToken = {};
            // Só entram os campos conhecidos; um campo presente com o tipo errado invalida o pedido inteiro.
            if (m.nome !== undefined) { if (!eTexto(m.nome, TEXTO_MAX_BRUTO)) return null; mudancas.nome = m.nome; }
            if (m.size !== undefined) { if (!eInteiro(m.size)) return null; mudancas.size = m.size; }
            if (m.cor !== undefined) { if (!eInteiro(m.cor)) return null; mudancas.cor = m.cor; }
            if (m.corBorda !== undefined) { if (!eInteiro(m.corBorda)) return null; mudancas.corBorda = m.corBorda; }
            if (m.imagem !== undefined) {
                if (m.imagem !== null && !eTexto(m.imagem, MAX_CARACTERES_IMAGEM_TOKEN)) return null;
                mudancas.imagem = m.imagem;
            }
            if (m.favorito !== undefined) { if (typeof m.favorito !== "boolean") return null; mudancas.favorito = m.favorito; }
            if (m.grupos !== undefined) { const g = lerListaDeIds(m.grupos); if (g === null) return null; mudancas.grupos = g; }
            if (m.ficha !== undefined) { if (m.ficha !== null && !eInteiro(m.ficha)) return null; mudancas.ficha = m.ficha; }
            return { tipo: "editar_token", id: p.id, mudancas };
        }
        case "excluir_token":
            return eInteiro(p.id) ? { tipo: "excluir_token", id: p.id } : null;
        case "marcar_ficha": {
            if (!eInteiro(p.id)) return null;
            if (p.favorito !== undefined && typeof p.favorito !== "boolean") return null;
            const grupos = p.grupos === undefined ? undefined : lerListaDeIds(p.grupos);
            if (grupos === null) return null;
            return { tipo: "marcar_ficha", id: p.id, ...(p.favorito !== undefined && { favorito: p.favorito }), ...(grupos !== undefined && { grupos }) };
        }
        case "criar_grupo":
            return eTexto(p.nome, TEXTO_MAX_BRUTO) && eInteiro(p.cor) ? { tipo: "criar_grupo", nome: p.nome, cor: p.cor } : null;
        case "editar_grupo":
            if (!eInteiro(p.id) || (p.nome !== undefined && !eTexto(p.nome, TEXTO_MAX_BRUTO)) || (p.cor !== undefined && !eInteiro(p.cor))) return null;
            return { tipo: "editar_grupo", id: p.id, ...(p.nome !== undefined && { nome: p.nome }), ...(p.cor !== undefined && { cor: p.cor }) };
        case "excluir_grupo":
            return eInteiro(p.id) ? { tipo: "excluir_grupo", id: p.id } : null;
        case "criar_ficha":
            if (p.token !== undefined && !eInteiro(p.token)) return null;
            return { tipo: "criar_ficha", ...(p.token !== undefined && { token: p.token }) }; // qualquer outro campo que venha junto é descartado
        case "excluir_ficha":
            return eInteiro(p.id) ? { tipo: "excluir_ficha", id: p.id } : null;
        case "rolar_ficha":
            return eInteiro(p.id) && eInteiro(p.versao) && eInteiro(p.aba) && eInteiro(p.indice) && (p.token === undefined || p.token === null || eInteiro(p.token))
                ? { tipo: "rolar_ficha", id: p.id, versao: p.versao, aba: p.aba, indice: p.indice, ...(p.token !== undefined && { token: p.token }) }
                : null;
        case "usar_cartao":
            return eInteiro(p.id) && eInteiro(p.versao) && eInteiro(p.aba) && eInteiro(p.indice) && (p.token === undefined || p.token === null || eInteiro(p.token))
                ? { tipo: "usar_cartao", id: p.id, versao: p.versao, aba: p.aba, indice: p.indice, ...(p.token !== undefined && { token: p.token }) }
                : null;
        case "editar_ficha": {
            if (!eInteiro(p.id) || !eInteiro(p.versao)) return null;
            if (p.nome !== undefined && !eTexto(p.nome, TEXTO_MAX_BRUTO)) return null;
            // (a limpeza só ENCURTA o texto, então este limite bruto já é o de verdade; o sentido — inclusive o limite da SOMA dos textos — é conferido por montarEdicaoDaFicha)
            let abas: AbaFicha[] | undefined;
            if (p.abas !== undefined) {
                if (!Array.isArray(p.abas) || p.abas.length < 1 || p.abas.length > MAX_ABAS_FICHA) return null;
                abas = [];
                for (const bruta of p.abas as unknown[]) {
                    if (typeof bruta !== "object" || bruta === null) return null;
                    const { nome, texto } = bruta as Record<string, unknown>;
                    if (!eTexto(nome, TEXTO_MAX_BRUTO) || !eTexto(texto, MAX_CARACTERES_TEXTO_FICHA)) return null;
                    abas.push({ nome, texto }); // (só estes dois campos: qualquer outro é descartado)
                }
            }
            if (abas && abas.reduce((soma, aba) => soma + aba.texto.length, 0) > MAX_CARACTERES_TEXTO_FICHA) return null; // (a SOMA das abas também tem o limite: recusa antes de qualquer trabalho)
            return { tipo: "editar_ficha", id: p.id, versao: p.versao, ...(p.nome !== undefined && { nome: p.nome }), ...(abas !== undefined && { abas }) };
        }
        default:
            return null; // tipo desconhecido: só existe o que está na lista acima
    }
}

/** Apelido limpo: sem caracteres de controle, espaços aparados e cortado ao máximo. Vazio vira "Jogador N". */
export function limparApelido(apelido: string, id: number): string {
    const limpo = apelido.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES_APELIDO).trim();
    return limpo === "" ? `Jogador ${id}` : limpo;
}
