// =====================================================================
// PERMISSÕES (código COMPARTILHADO entre navegador e servidor: sem DOM, sem PixiJS; imports com ".ts").
//
// A regra geral (decidida com o dono em 17/11/2026, ver `BRAINSTORM.md`, "PAPÉIS E PERMISSÕES"):
//   - O MESTRE controla tudo. Quem cria um token ou uma ficha é o seu DONO (e o mestre também controla).
//   - O mestre pode LIBERAR um token, uma ficha ou um grupo inteiro a um jogador em dois níveis:
//       * LEITOR: token = move e usa o clique direito do tabuleiro (dano, cura, condição), SEM as configurações dele; ficha = lê e rola, sem editar.
//       * EDITOR: edita (token: nome, imagem, tamanho, ficha, status; ficha: texto e valores).
//   - EXCLUIR é só do DONO e do MESTRE (o editor não exclui).
//   - O jogador só vê (e só recebe do servidor) o que é dele ou foi liberado. No TABULEIRO todos veem todas as peças.
// Tudo isto vive num DOCUMENTO ÚNICO no servidor (`dados/permissoes.json`). O SERVIDOR é quem decide (o navegador só esconde o que não pode, para ficar bonito).
// A identidade é um ID DE USUÁRIO estável (hoje, nos testes, vem do nome; depois virá da conta): as regras nunca olham para o nome.
// =====================================================================

/** O nível de acesso que o mestre dá a alguém sobre um item (o dono é separado: ele não precisa de nível). */
export type NivelDeAcesso = "leitor" | "editor";

/** Os tipos de item que têm permissão. (Peças do tabuleiro não têm: usam as do modelo delas.) */
export type TipoDeItem = "tokens" | "fichas";

/** O que se sabe sobre UM item: quem é o dono e a quem o mestre liberou, em que nível (id do usuário -> nível). */
export interface PermissoesDoItem {
    dono: string | null; // null = item do mestre (sem dono jogador)
    acessos: Record<string, NivelDeAcesso>;
}

/** Os limites que o mestre ajusta na configuração da mesa (por jogador; o mestre não tem limite). */
export interface LimitesDaMesa {
    tokensPorJogador: number;
    fichasPorJogador: number;
}

/** O documento inteiro (`dados/permissoes.json`). */
export interface Permissoes {
    versao: 1;
    /** O DONO do servidor (o único que transfere a posse), ou null enquanto ninguém a reivindicou. */
    dono: string | null;
    /** Usuários com poder de MESTRE, além do dono (promovidos pelo dono ou por outro mestre). */
    mestres: string[];
    /** Os BANIDOS da mesa (o mestre bane na aba Jogadores): não conseguem entrar e são desconectados. O nome fica guardado só para a lista de banidos (o banimento vale pelo id). */
    banidos: { usuario: string; nome: string }[];
    limites: LimitesDaMesa;
    /** id do token (modelo) -> permissões. Quem não está aqui é do mestre. */
    tokens: Record<string, PermissoesDoItem>;
    fichas: Record<string, PermissoesDoItem>;
    /** Liberação por GRUPO: id do grupo -> (id do usuário -> nível). Vale para os tokens e as fichas que estão no grupo. */
    grupos: Record<string, Record<string, NivelDeAcesso>>;
}

export const LIMITE_PADRAO_TOKENS_POR_JOGADOR = 5;
export const LIMITE_PADRAO_FICHAS_POR_JOGADOR = 5;
/** Os limites que o mestre pode escolher (um teto, para ninguém digitar um número absurdo). */
export const LIMITE_MAXIMO_POR_JOGADOR = 100;
/** O id do usuário: texto curto e simples (letras, números, "_" e "-"), para servir de chave de objeto e de nome de arquivo sem surpresa. */
const ID_DE_USUARIO = /^[a-z0-9_-]{1,60}$/;

export function permissoesVazias(): Permissoes {
    return {
        versao: 1,
        dono: null,
        mestres: [],
        banidos: [],
        limites: { tokensPorJogador: LIMITE_PADRAO_TOKENS_POR_JOGADOR, fichasPorJogador: LIMITE_PADRAO_FICHAS_POR_JOGADOR },
        tokens: {},
        fichas: {},
        grupos: {},
    };
}

/** Um id de usuário válido? (Quem chama gera o id a partir do nome; aqui só se confere.) */
export function idDeUsuarioValido(id: unknown): id is string {
    return typeof id === "string" && ID_DE_USUARIO.test(id);
}

/** Transforma um nome (ou um apelido) num id de usuário: minúsculas, sem acento, só letras e números, com "_" no lugar do resto. (Provisório: nos testes o nome é a identidade.) */
export function idDeUsuarioDoNome(nome: string): string {
    const base = nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50);
    return `u_${base || "anonimo"}`;
}

const eNivel = (valor: unknown): valor is NivelDeAcesso => valor === "leitor" || valor === "editor";
const eObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** Confere um mapa "usuário -> nível" que veio de FORA (um arquivo que alguém pode ter editado à mão): fica só o que é válido. */
function limparAcessos(bruto: unknown): Record<string, NivelDeAcesso> {
    const limpo: Record<string, NivelDeAcesso> = {};
    if (!eObjeto(bruto)) return limpo;
    for (const [usuario, nivel] of Object.entries(bruto)) if (idDeUsuarioValido(usuario) && eNivel(nivel)) limpo[usuario] = nivel;
    return limpo;
}

function limparItens(bruto: unknown): Record<string, PermissoesDoItem> {
    const limpo: Record<string, PermissoesDoItem> = {};
    if (!eObjeto(bruto)) return limpo;
    for (const [id, item] of Object.entries(bruto)) {
        if (!/^\d{1,9}$/.test(id) || !eObjeto(item)) continue;
        limpo[id] = { dono: idDeUsuarioValido(item.dono) ? item.dono : null, acessos: limparAcessos(item.acessos) };
    }
    return limpo;
}

const limiteValido = (valor: unknown, padrao: number): number =>
    typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0 ? Math.min(valor, LIMITE_MAXIMO_POR_JOGADOR) : padrao;

/** Confere o documento inteiro que veio de FORA (arquivo ou pedido): devolve um documento limpo (campos desconhecidos somem; o que está errado volta ao padrão). Nunca lança erro. */
export function limparPermissoes(bruto: unknown): Permissoes {
    const base = permissoesVazias();
    if (!eObjeto(bruto)) return base;
    const grupos: Record<string, Record<string, NivelDeAcesso>> = {};
    if (eObjeto(bruto.grupos)) for (const [id, acessos] of Object.entries(bruto.grupos)) if (/^\d{1,9}$/.test(id)) grupos[id] = limparAcessos(acessos);
    const limites = eObjeto(bruto.limites) ? bruto.limites : {};
    return {
        versao: 1,
        dono: idDeUsuarioValido(bruto.dono) ? bruto.dono : null,
        mestres: Array.isArray(bruto.mestres) ? [...new Set(bruto.mestres.filter(idDeUsuarioValido))] : [],
        banidos: Array.isArray(bruto.banidos)
            ? bruto.banidos.flatMap((b): { usuario: string; nome: string }[] => {
                  const x = b as Record<string, unknown> | null;
                  return typeof x === "object" && x !== null && idDeUsuarioValido(x.usuario) ? [{ usuario: x.usuario, nome: typeof x.nome === "string" ? x.nome.slice(0, 40) : x.usuario }] : [];
              })
            : [],
        limites: {
            tokensPorJogador: limiteValido(limites.tokensPorJogador, base.limites.tokensPorJogador),
            fichasPorJogador: limiteValido(limites.fichasPorJogador, base.limites.fichasPorJogador),
        },
        tokens: limparItens(bruto.tokens),
        fichas: limparItens(bruto.fichas),
        grupos,
    };
}

/** O que alguém tem sobre um item: o DONO, ou um nível liberado, ou nada (null). O mestre não passa por aqui: quem chama confere o papel antes. */
export type NivelEfetivo = "dono" | NivelDeAcesso | null;

/**
 * O nível de `usuario` sobre o item `id` do tipo `tipo`. Vale o MAIOR entre: ser o dono, a liberação do próprio item e as liberações dos GRUPOS do item
 * (`gruposDoItem`: os ids dos grupos a que ele pertence). Editor vale mais que leitor.
 */
export function nivelNoItem(permissoes: Permissoes, tipo: TipoDeItem, id: number, usuario: string, gruposDoItem: readonly number[]): NivelEfetivo {
    const item = permissoes[tipo][String(id)];
    if (item?.dono === usuario) return "dono";
    let nivel: NivelDeAcesso | null = item?.acessos[usuario] ?? null;
    for (const grupo of gruposDoItem) {
        const doGrupo = permissoes.grupos[String(grupo)]?.[usuario];
        if (doGrupo === "editor" || (doGrupo === "leitor" && nivel === null)) nivel = doGrupo;
    }
    return nivel;
}

/** Quem tem pelo menos o nível de LEITOR (vê, move o token, rola a ficha). */
export const podeLer = (nivel: NivelEfetivo): boolean => nivel !== null;
/** Quem edita: o dono e o editor. */
export const podeEditar = (nivel: NivelEfetivo): boolean => nivel === "dono" || nivel === "editor";
/** Quem exclui: SÓ o dono (e o mestre, que quem chama confere antes). O editor NÃO exclui. */
export const podeExcluir = (nivel: NivelEfetivo): boolean => nivel === "dono";

/** Quantos itens deste tipo `usuario` possui (para o limite por jogador). */
export function quantosDoDono(permissoes: Permissoes, tipo: TipoDeItem, usuario: string): number {
    return Object.values(permissoes[tipo]).filter((item) => item.dono === usuario).length;
}

/** O limite por jogador deste tipo (a configuração da mesa). */
export const limiteDoTipo = (permissoes: Permissoes, tipo: TipoDeItem): number => (tipo === "tokens" ? permissoes.limites.tokensPorJogador : permissoes.limites.fichasPorJogador);

/** O usuário tem poder de MESTRE? (O dono do servidor e os mestres promovidos.) Isto vale para identidades de verdade; nos testes o `?papel=mestre` faz esse papel. */
/** Este usuário está banido da mesa? */
export const estaBanido = (permissoes: Permissoes, usuario: string): boolean => permissoes.banidos.some((b) => b.usuario === usuario);

export const temPoderDeMestre = (permissoes: Permissoes, usuario: string): boolean => permissoes.dono === usuario || permissoes.mestres.includes(usuario);
