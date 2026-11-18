// =====================================================================
// A VISÃO DE CADA CONEXÃO: o que cada pessoa pode fazer e o que ela RECEBE (tokens, fichas, valores de status, mapas, a lista de jogadores). É a regra ÚNICA de "quem vê o quê":
// todo aviso que depende de quem recebe deve passar por uma função daqui (assim um pedido novo não esquece o filtro e não vaza dados).
// Separado do servidor.ts em 17/11/2026 (arquitetura).
// =====================================================================

import { WebSocket } from "ws";
import { buscarToken, todosOsValoresDasFichas, valoresDaFichaComoObjeto, estado, pastaEAcima, type Desenho, type Ficha, type Pasta, type Token } from "../src/estado.ts";
import type { ValorDeStatus } from "../src/estado.ts";
import { nivelNaPasta, podeEditar, podeExcluir, podeLer, temPoderDeMestre, type NivelEfetivo } from "../src/permissoes.ts";
import { desenhosDoMapa } from "./desenhos.ts";
import { algumFogAtivo, fogDoMapa, sobOFog } from "./fog.ts";
import { mascaraParaTexto, type TracoDeFog } from "../src/fog.ts";
import { nivelDoUsuario, permissoes } from "./acesso.ts";
import { type RegistroDeMapa } from "../src/protocolo.ts";
import { listaDeMapas } from "./mapas.ts";
import { type Conexao, conexoes, enviar, erro, avisarCada } from "./conexoes.ts";
import { mapaAtual, mapaDaConexao, tamanhoDoMapa, gradeDoMapa, registroComCena } from "./cenas.ts";
import { ehFavoritoDe } from "./preferencias.ts";

export const SEM_PERMISSAO = "Você não tem permissão para isso.";

/** O nível de `c` sobre um token. As PEÇAS do tabuleiro seguem o MODELO delas (o token da bolsa). O mestre não passa por aqui. */
export function nivelNoToken(c: Conexao, token: Token): NivelEfetivo {
    const modelo = token.copiaDe === null ? token : buscarToken(token.copiaDe);
    return modelo ? nivelDoUsuario("tokens", modelo.id, c.usuario, modelo.grupos, pastaEAcima(modelo.pasta)) : null;
}

/**
 * O nível de `c` numa FICHA (pedido do dono, 17/11/2026): o que ele tem na PRÓPRIA ficha (dono, liberação direta, grupo ou PASTA da ficha) e, também, o que ele tem nos TOKENS LIGADOS a ela:
 * quem recebe um token para ler ou editar (direto, por grupo ou por pasta) tem o MESMO nível na ficha ligada a ele. O contrário NÃO vale: uma ficha compartilhada sozinha dá acesso só à ficha.
 * Vale o maior. (Ser dono do token não dá nada na ficha: ela tem o dono dela.)
 */
export function nivelNaFicha(c: Conexao, ficha: Ficha): NivelEfetivo {
    const proprio = nivelDoUsuario("fichas", ficha.id, c.usuario, ficha.grupos, pastaEAcima(ficha.pasta));
    if (proprio === "dono" || proprio === "editor") return proprio;
    let nivel: NivelEfetivo = proprio;
    for (const t of estado.tokens) {
        if (t.copiaDe !== null || t.ficha !== ficha.id) continue;
        const doToken = nivelNoToken(c, t);
        if (doToken === "editor") return "editor";
        if (doToken === "leitor") nivel = "leitor";
    }
    return nivel;
}

/** O que `c` recebe de uma PASTA: o mestre, todas; o jogador, só as que são dele ou que foram liberadas para ele (direto ou por uma pasta de cima), com o nível dele. */
export function pastaParaConexao(c: Conexao, pasta: Pasta): Pasta | null {
    if (c.mestre) return pasta;
    const nivel = nivelNaPasta(permissoes, pasta.id, c.usuario, pastaEAcima(pasta.id));
    return nivel === null ? null : { ...pasta, nivel };
}
/** Avisa cada conexão de uma pasta nova ou mudada (quem deixa de vê-la recebe a exclusão). */
export function avisarPasta(pasta: Pasta): void {
    avisarCada((c) => {
        const vista = pastaParaConexao(c, pasta);
        return vista ? { tipo: "pasta_definida", pasta: vista } : { tipo: "pasta_excluida", id: pasta.id };
    });
}

/** "usar" = mover e usar o clique direito do tabuleiro (leitor ou mais); "editar" = configurações (editor ou dono); "excluir" = só o dono (e o mestre). */
export function podeNoToken(c: Conexao, token: Token, acao: "usar" | "editar" | "excluir"): boolean {
    if (c.mestre) return true;
    const nivel = nivelNoToken(c, token);
    return acao === "usar" ? podeLer(nivel) : acao === "editar" ? podeEditar(nivel) : podeExcluir(nivel);
}

/** "ler" = ver e rolar; "editar" = alterar o texto e os valores; "excluir" = só o dono (e o mestre). */
export function podeNaFicha(c: Conexao, ficha: Ficha, acao: "ler" | "editar" | "excluir"): boolean {
    if (c.mestre) return true;
    const nivel = nivelNaFicha(c, ficha);
    return acao === "ler" ? podeLer(nivel) : acao === "editar" ? podeEditar(nivel) : podeExcluir(nivel);
}

/**
 * Os valores de status de um token como `c` PODE VÊ-LOS (pedido do dono, 17/11/2026: "Quem vê" de cada status). O mestre vê todos. Para os outros, o valor de um status que ele não pode ver NÃO vai: chega
 * `{ oculto: true, atual: 0, max: 0 }` (a entrada existe só para o Dano e a Cura continuarem valendo; a interface não desenha barra nem conta para ela).
 */
export function valoresParaConexao(c: Conexao, token: Token): ValorDeStatus[] {
    if (c.mestre) return token.valores;
    const nivel = nivelNoToken(c, token);
    return token.valores.map((v) => {
        const q = token.status.find((s) => s.id === v.id)?.quemVe;
        const ve = !q || (nivel === "dono" ? q.dono : nivel === null ? q.outros : q.leitores);
        return ve ? v : { id: v.id, atual: 0, max: 0, oculto: true };
    });
}

/** Manda a cada conexão os valores de status de um token, já filtrados pelo "Quem vê". */
export function avisarValoresDoToken(token: Token, efeito?: "dano" | "cura"): void {
    // `efeito` (só quando uma ação acabou de ser aplicada) diz a TODOS o que animar no token (dano ou cura), mesmo para quem não vê o valor: a animação não depende dos números, então não denuncia a vida.
    avisarCada((c) => (pecaOcultaPelaFog(c, token) ? null : { tipo: "valores_atualizados", id: token.id, valores: valoresParaConexao(c, token), ...(efeito !== undefined && { efeito }) }));
}

/** A biblioteca que `c` recebe: o mestre, tudo; os outros, só os mapas que podem ver (sem a lista de quem vê). */
export function bibliotecaParaConexao(c: Conexao): RegistroDeMapa[] {
    if (c.mestre) return listaDeMapas().map(registroComCena); // (com o tamanho e a grade de cada cena)
    // O jogador não escolhe mapas (só o mestre o move): recebe só o mapa em que está (se pode vê-lo), sem a lista de quem vê.
    const meu = mapaDaConexao(c);
    return listaDeMapas().filter((m) => m.id === meu).map(({ quemVe: _quemVe, ...resto }) => registroComCena(resto));
}

/** A pessoa está num mapa que NÃO pode ver? (o mestre a levou para lá) */
export const semPermissaoNoMapa = (c: Conexao): boolean => !c.mestre && c.mapaVisto !== null && mapaDaConexao(c) === null;
/** Manda a UMA conexão o mapa em que ela está (a imagem e o tamanho do tabuleiro dele) e os desenhos dele. */
export function avisarMapaDe(c: Conexao, comTamanho = true): void {
    if (!c.jogador || c.ws.readyState !== WebSocket.OPEN) return;
    const mapa = mapaDaConexao(c);
    const tamanho = tamanhoDoMapa(mapa);
    // Foi levado a um mapa que NÃO pode ver: o tabuleiro vem vazio e o evento diz isso (`semPermissao`): o navegador mostra uma faixa FIXA até ele sair dali (pedido do dono, 17/11/2026).
    const semPermissao = semPermissaoNoMapa(c);
    enviar(c.ws, { tipo: "mapa_definido", mapa, grade: gradeDoMapa(mapa), ...(semPermissao && { semPermissao: true }), ...(comTamanho && { colunas: tamanho.colunas, linhas: tamanho.linhas }) });
    const doMapa = desenhosVisiveisPara(c, mapa);
    c.desenhosVistos = doMapa.map((d) => d.id).join(",");
    enviar(c.ws, { tipo: "desenhos_definidos", desenhos: doMapa }); // (cada mapa tem os seus desenhos; o fog esconde os que estão sob ele)
    enviarFogDe(c);
    reconciliarPecas(c);
}

// ---------------------------------------------------------------------
// O FOG na visão de cada pessoa (pedido do dono, 17/11/2026): o jogador NÃO recebe as peças dos outros nem os desenhos que estão sob o fog (o servidor nem envia a posição deles); o
// mestre vê tudo. As peças do próprio jogador e as que o mestre liberou para ele continuam visíveis, e ele sempre vê os desenhos que ele mesmo fez.
// ---------------------------------------------------------------------

/** A PEÇA está escondida de `c` pelo fog? (o centro dela sob o fog ligado do mapa dela; vale para TODAS as peças, até as do próprio jogador: pedido do dono, 18/11/2026) */
export function pecaOcultaPelaFog(c: Conexao, token: Token): boolean {
    if (c.mestre || token.copiaDe === null || token.guardado || !algumFogAtivo()) return false;
    return sobOFog(token.mapa, token.col + token.size / 2, token.row + token.size / 2);
}
/** O ponto "representativo" de um desenho, em casas (as coordenadas dos desenhos já são em casas): o centro da forma, ou o 1º ponto do traço. */
function pontoDoDesenho(d: Desenho): { col: number; row: number } {
    if (d.tipo === "livre") return { col: d.pontos[0]?.x ?? 0, row: d.pontos[0]?.y ?? 0 };
    return { col: d.x + d.largura / 2, row: d.y + d.altura / 2 };
}
/** O desenho está escondido de `c` pelo fog do mapa dele? (o autor sempre vê o dele) */
export function desenhoOcultoPara(c: Conexao, d: Desenho, mapa: string | null): boolean {
    if (c.mestre || d.autor === c.usuario || !algumFogAtivo()) return false;
    const p = pontoDoDesenho(d);
    return sobOFog(mapa, p.col, p.row);
}
export const desenhosVisiveisPara = (c: Conexao, mapa: string | null): Desenho[] => desenhosDoMapa(mapa).filter((d) => !desenhoOcultoPara(c, d, mapa));
/** Reenvia a lista de desenhos a um jogador SÓ se o que o fog deixa ver mudou desde a última vez (pintar o fog muitas vezes por segundo não pode reenviar tudo a cada pincelada). */
function atualizarDesenhosDoJogador(c: Conexao, mapa: string | null): void {
    const visiveis = desenhosVisiveisPara(c, mapa);
    const assinatura = visiveis.map((d) => d.id).join(",");
    if (assinatura === c.desenhosVistos) return;
    c.desenhosVistos = assinatura;
    enviar(c.ws, { tipo: "desenhos_definidos", desenhos: visiveis });
}

/** Manda a `c` o fog do mapa em que ele está (a máscara inteira; sem fog, só `ativo: false`). */
export function enviarFogDe(c: Conexao): void {
    if (!c.jogador || c.ws.readyState !== WebSocket.OPEN) return;
    const f = fogDoMapa(mapaDaConexao(c));
    enviar(c.ws, f && f.ativo ? { tipo: "fog_definido", ativo: true, colunas: f.mascara.colunas, linhas: f.mascara.linhas, bits: mascaraParaTexto(f.mascara) } : { tipo: "fog_definido", ativo: false });
}
/**
 * Compara as peças que `c` DEVERIA ver com as que o servidor já escondeu dele (`pecasEscondidas`) e manda a diferença: a peça que saiu do fog aparece (`peca_criada`) e a que entrou nele some
 * (`token_excluido`). Chamada depois de cada pedido (veja `tratar`), então cobre mover peças, pintar o fog, trocar liberações... Só o mestre não passa por aqui.
 */
export function reconciliarPecas(c: Conexao): void {
    if (c.mestre || !c.jogador || c.ws.readyState !== WebSocket.OPEN) return;
    const escondidasAgora = new Set<number>();
    for (const t of estado.tokens) {
        if (t.copiaDe === null || t.guardado) continue;
        const visto = tokenParaConexao(c, t);
        if (visto) {
            if (c.pecasEscondidas.has(t.id)) enviar(c.ws, { tipo: "peca_criada", token: visto }); // saiu do fog: aparece
        } else {
            escondidasAgora.add(t.id);
            if (!c.pecasEscondidas.has(t.id)) enviar(c.ws, { tipo: "token_excluido", id: t.id }); // entrou no fog: some
        }
    }
    c.pecasEscondidas = escondidasAgora;
}
export function reconciliarTodos(): void {
    if (!algumFogAtivo() && ![...conexoes].some((c) => c.pecasEscondidas.size > 0 && !c.mestre)) return;
    for (const c of conexoes) reconciliarPecas(c);
}
/** O fog do mapa `id` mudou de estado (ligou, desligou, foi preenchido): quem está nele recebe a máscara, e os desenhos e as peças são reconferidos. */
export function avisarFogDoMapa(id: string | null): void {
    for (const c of conexoes) {
        if (!c.jogador || c.ws.readyState !== WebSocket.OPEN || mapaDaConexao(c) !== id) continue;
        enviarFogDe(c);
        if (!c.mestre) atualizarDesenhosDoJogador(c, id);
    }
    reconciliarTodos();
}
/** Pinceladas novas: quem está no mapa as aplica na máscara que já tem; os desenhos e as peças dos jogadores são reconferidos. */
export function avisarFogPintado(id: string | null, tracos: TracoDeFog[]): void {
    for (const c of conexoes) {
        if (!c.jogador || c.ws.readyState !== WebSocket.OPEN || mapaDaConexao(c) !== id) continue;
        enviar(c.ws, { tipo: "fog_pintado", tracos });
        if (!c.mestre) atualizarDesenhosDoJogador(c, id);
    }
    reconciliarTodos();
}

/** Manda a quem está no mapa `id` (ou a todos, sem `id`) o mapa dele de novo. */
export function avisarMapaAtual(comTamanho: boolean, id?: string | null): void {
    for (const c of conexoes) if (id === undefined || c.mapaVisto === id || (c.mestre && mapaAtual === id)) avisarMapaDe(c, comTamanho);
    avisarMapasDefinidos();
    avisarJogadores();
}

/** Manda a cada um a lista de quem está na mesa, marcando quem está NA CENA DELE (o mesmo mapa). */
export function avisarJogadores(): void {
    avisarCada((c) => {
        const meu = mapaDaConexao(c);
        // O MESTRE também recebe o mapa de cada um (a aba Mapas mostra "jogadores aqui"); os jogadores, não (os ids dos mapas não vazam).
        return { tipo: "jogadores", lista: [...conexoes].flatMap((x) => (x.jogador ? [{ ...x.jogador, naMinhaCena: mapaDaConexao(x) === meu, ...(c.mestre && { mapa: x.mestre ? mapaAtual : x.mapaVisto, semPermissao: !x.mestre && x.mapaVisto !== null && mapaDaConexao(x) === null }) }] : [])) };
    });
}

/** Manda a cada um a biblioteca que ele pode ver. */
export function avisarMapasDefinidos(): void {
    avisarCada((c) => ({ tipo: "mapas_definidos", mapas: bibliotecaParaConexao(c) }));
}

/** O que `c` recebe sobre um token: as PEÇAS do tabuleiro todos veem; um token da BOLSA só quem tem acesso (o dono, os liberados e o mestre). Um modelo de uma peça que está no mapa vai SEM a ficha e marcado `somenteMapa` (os grupos ficam: valem para os status) (não aparece na bolsa). Quem não é mestre recebe também o `nivel` dele (a interface esconde o que ele não pode). */
export function tokenParaConexao(c: Conexao, token: Token): Token | null {
    if (pecaOcultaPelaFog(c, token)) return null; // (sob o fog: o jogador nem recebe a peça)
    const visto = tokenParaConexaoSemEstrela(c, token);
    return visto && visto.copiaDe === null ? { ...visto, favorito: ehFavoritoDe(c.usuario, "tokens", token.id) } : visto; // (a estrela é de cada pessoa)
}

export function tokenParaConexaoSemEstrela(c: Conexao, token: Token): Token | null {
    if (c.mestre) return token;
    const nivel = nivelNoToken(c, token);
    const valores = valoresParaConexao(c, token);
    if (token.copiaDe !== null) return { ...token, valores, ...(nivel !== null && { nivel }) }; // (a peça do mapa todos veem, mesmo sem nível; os status só para quem pode vê-los)
    if (podeLer(nivel)) return { ...token, valores, ...(nivel !== null && { nivel }) };
    if (estado.tokens.some((p) => p.copiaDe === token.id)) return { ...token, ficha: null, favorito: false, somenteMapa: true }; // (os GRUPOS ficam: o cliente os usa para saber quais status, e portanto quais ações como Dano e Cura, valem para a peça; são só números, não revelam a ficha)
    return null;
}

export function fichaParaConexao(c: Conexao, ficha: Ficha): Ficha | null {
    const visto = fichaParaConexaoSemEstrela(c, ficha);
    return visto ? { ...visto, favorito: ehFavoritoDe(c.usuario, "fichas", ficha.id) } : null; // (a estrela é de cada pessoa)
}

export function fichaParaConexaoSemEstrela(c: Conexao, ficha: Ficha): Ficha | null {
    if (c.mestre) return ficha;
    const nivel = nivelNaFicha(c, ficha);
    return podeLer(nivel) && nivel !== null ? { ...ficha, nivel } : null;
}

/**
 * Depois de mudar o que uma pessoa pode ver (liberar, tirar a liberação, virar mestre): refaz a visão DELA dos itens indicados. Um item que ela passou a ver chega inteiro (`token_editado` /
 * `ficha_editada` fazem "criar ou trocar"); um token que deixou de ver vira só o modelo "somente mapa" (se há peça dele no mapa) ou é tirado; uma ficha que deixou de ver é tirada.
 */
export function sincronizarVisaoDe(usuario: string, idsDeTokens: number[], idsDeFichasPedidas: number[]): void {
    // As fichas LIGADAS a esses tokens também mudam de visibilidade (o acesso ao token vale para a ficha dele; ver `nivelNaFicha`).
    const idsDeFichas = [...new Set([...idsDeFichasPedidas, ...idsDeTokens.flatMap((id) => { const f = buscarToken(id)?.ficha; return f == null ? [] : [f]; })])];
    for (const c of conexoes) {
        if (!c.jogador || c.usuario !== usuario || c.ws.readyState !== WebSocket.OPEN) continue;
        for (const id of idsDeTokens) {
            const token = buscarToken(id);
            if (!token) continue;
            const visto = tokenParaConexao(c, token);
            enviar(c.ws, visto ? { tipo: "token_editado", token: visto } : { tipo: "token_excluido", id });
        }
        for (const id of idsDeFichas) {
            const ficha = estado.fichas.find((f) => f.id === id);
            if (!ficha) continue;
            const vista = fichaParaConexao(c, ficha);
            if (vista) {
                enviar(c.ws, { tipo: "ficha_editada", ficha: vista });
                enviar(c.ws, { tipo: "valores_ficha", id, valores: valoresDaFichaComoObjeto(id) });
            } else enviar(c.ws, { tipo: "ficha_excluida", id });
        }
    }
}

/** Igual a `sincronizarVisaoDe`, para TODOS os usuários conectados (quando os grupos de um item mudam, quem tem acesso pelo grupo ganha ou perde o item). */
export function sincronizarVisaoDeTodos(idsDeTokens: number[], idsDeFichas: number[]): void {
    for (const usuario of new Set([...conexoes].map((c) => c.usuario))) if (usuario !== "") sincronizarVisaoDe(usuario, idsDeTokens, idsDeFichas);
}

/** O documento de permissões vai SÓ aos mestres (a aba "Jogadores" o mostra). */
export function avisarPermissoes(): void {
    for (const c of conexoes) if (c.jogador && c.mestre) enviar(c.ws, { tipo: "permissoes", permissoes });
}

/** O mestre mudou: refaz o papel de quem estava conectado com esse usuário, a visão dele e a lista de jogadores. */
export function atualizarPapeisConectados(): void {
    for (const c of conexoes) {
        if (!c.jogador) continue;
        const antes = c.mestre;
        c.mestre = c.papel === "mestre" || temPoderDeMestre(permissoes, c.usuario);
        c.jogador.mestre = c.mestre;
        if (antes !== c.mestre) {
            enviar(c.ws, { tipo: "papel", mestre: c.mestre });
            sincronizarVisaoDe(c.usuario, estado.tokens.filter((t) => t.copiaDe === null).map((t) => t.id), estado.fichas.map((f) => f.id));
            if (c.mestre) enviar(c.ws, { tipo: "permissoes", permissoes });
        }
    }
    avisarJogadores();
}

export function avisarToken(tipo: "token_criado" | "token_editado" | "peca_criada", token: Token): void {
    avisarCada((c) => {
        const visto = tokenParaConexao(c, token);
        return visto ? { tipo, token: visto } : null;
    });
}

export function avisarFicha(tipo: "ficha_criada" | "ficha_editada", ficha: Ficha): void {
    avisarCada((c) => {
        const vista = fichaParaConexao(c, ficha);
        return vista ? { tipo, ficha: vista } : null;
    });
}

/** Os valores atuais das variáveis que mudam, SÓ das fichas que `c` pode ver (ficha -> NOME -> valor). */
export function valoresVisiveisPara(c: Conexao): Record<string, Record<string, number>> {
    const todos = todosOsValoresDasFichas();
    const visiveis: Record<string, Record<string, number>> = {};
    for (const ficha of estado.fichas) if (podeNaFicha(c, ficha, "ler") && todos[String(ficha.id)]) visiveis[String(ficha.id)] = todos[String(ficha.id)];
    return visiveis;
}

/** Os valores atuais de uma ficha: quem VÊ a ficha recebe todos; os outros recebem só as barras (valores) das peças dela no tabuleiro. */
export function avisarValoresDaFicha(id: number): void {
    const ficha = estado.fichas.find((f) => f.id === id);
    if (ficha) avisarCada((c) => (podeNaFicha(c, ficha, "ler") ? { tipo: "valores_ficha", id, valores: valoresDaFichaComoObjeto(id) } : null));
    for (const t of estado.tokens) if (t.ficha === id && t.copiaDe !== null && !t.guardado) avisarValoresDoToken(t);
}
