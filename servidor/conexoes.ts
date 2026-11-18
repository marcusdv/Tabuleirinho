// =====================================================================
// AS CONEXÕES: quem está ligado ao servidor (cada aba do navegador), o limite anti-spam de cada um e as funções de ENVIAR eventos (a um, a todos, ou a cada um com o seu filtro).
// Separado do servidor.ts em 17/11/2026 (arquitetura).
// =====================================================================

import { WebSocket } from "ws";
import { MS_RECARGA_CHAT, MS_RECARGA_ROLAGEM, RAJADA_CHAT, RAJADA_ROLAGENS } from "../src/config.ts";
import { gastar, type Balde } from "../src/limite.ts";
import { type EventoDoServidor, type Jogador } from "../src/protocolo.ts";

// Para os TESTES automáticos (que rolam e escrevem muito rápido): SEM_LIMITE_SPAM=1 desliga o limite anti-spam. Em uso normal fica ligado.
export const SEM_LIMITE_SPAM = process.env.SEM_LIMITE_SPAM === "1";

/** Uma conexão aberta. `jogador` é null até a pessoa se apresentar (pedido "entrar"). */
export interface Conexao {
    id: number;
    ws: WebSocket;
    jogador: Jogador | null;
    inicioDaJanela: number; // para o limite de mensagens por segundo
    mensagensNaJanela: number;
    baldeRolagens: Balde; // LIMITE ANTI-SPAM: rolagens de dados e de fichas (as duas dividem o mesmo balde)
    baldeChat: Balde; // LIMITE ANTI-SPAM: mensagens do chat
    papel: "mestre" | "jogador" | null; // o papel pedido no endereço (null = faltou ou foi recusado: a conexão não entra)
    recusa: string | null; // o motivo de a conexão ser recusada ao entrar (sem papel, por exemplo)
    usuario: string; // o ID de usuário estável (hoje vem do apelido; depois virá da conta): é ele que as permissões usam
    desenhosVistos: string; // os ids dos desenhos que o fog deixou ver da última vez (para só reenviar a lista quando mudar)
    pecasEscondidas: Set<number>; // as PEÇAS que o servidor já escondeu desta pessoa por causa do fog (ver `reconciliarPecas` em visao.ts)
    mapaVisto: string | null; // o mapa em que ESTA conexão está (cada jogador tem o seu; o mestre sempre está no `mapaAtual`). null = nenhum
    mestre: boolean; // é o MESTRE? Por enquanto (os papéis vêm depois das cenas): quem se conecta DO PRÓPRIO COMPUTADOR do servidor (endereço 127.0.0.1). Só o mestre envia, troca e apaga mapas; o servidor confere sempre.
}

export const podeRolar = (c: Conexao): boolean => SEM_LIMITE_SPAM || gastar(c.baldeRolagens, RAJADA_ROLAGENS, MS_RECARGA_ROLAGEM);

export const podeEscrever = (c: Conexao): boolean => SEM_LIMITE_SPAM || gastar(c.baldeChat, RAJADA_CHAT, MS_RECARGA_CHAT);

export const conexoes = new Set<Conexao>();

export let proximoIdDeConexao = 1;
/** Um id novo para uma conexão que acabou de chegar. */
export const novoIdDeConexao = (): number => proximoIdDeConexao++;

export const listaDeJogadores = (): Jogador[] => [...conexoes].flatMap((c) => (c.jogador ? [c.jogador] : []));

export function enviar(ws: WebSocket, evento: EventoDoServidor): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(evento));
}

/** Manda o evento a TODOS que já se apresentaram (inclusive quem fez o pedido: assim todos veem a mesma coisa). */
export function avisarTodos(evento: EventoDoServidor): void {
    const texto = JSON.stringify(evento);
    for (const c of conexoes) if (c.jogador && c.ws.readyState === WebSocket.OPEN) c.ws.send(texto);
}

export const erro = (ws: WebSocket, motivo: string): void => enviar(ws, { tipo: "erro", motivo });

/** Manda a cada conexão o que `montar` devolver para ela (null = não manda nada a essa). */
export function avisarCada(montar: (c: Conexao) => EventoDoServidor | null): void {
    for (const c of conexoes) {
        if (!c.jogador || c.ws.readyState !== WebSocket.OPEN) continue;
        const evento = montar(c);
        if (evento) c.ws.send(JSON.stringify(evento));
    }
}
