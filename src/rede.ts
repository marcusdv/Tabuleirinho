// =====================================================================
// REDE (navegador): a conexão com o servidor por WebSocket (protótipo; o servidor está em servidor/servidor.ts).
//
// Este módulo só cuida da CONEXÃO: conecta, se apresenta ("entrar"), manda pedidos e entrega os eventos recebidos a
// quem o criou (`aoReceber`). O que fazer com cada evento (mover o token, mostrar a mensagem...) é com o main.ts.
// Se a conexão cai, tenta de novo (esperando cada vez mais, até 8 s).
//
// O modo online é OPCIONAL: só liga com `?online` no endereço (ex.: http://127.0.0.1:5173/?online&nome=Ana). Sem isso o
// programa funciona local, como sempre funcionou.
// =====================================================================

import type { EventoDoServidor, PedidoDoCliente } from "./protocolo";

export interface OpcoesRede {
    /** Como a pessoa quer ser chamada na mesa (o servidor limpa e corta o apelido). */
    apelido: string;
    /** Chegou um evento do servidor (já convertido de JSON). */
    aoReceber(evento: EventoDoServidor): void;
    /** A conexão ficou ativa (true, depois de receber o estado inicial) ou caiu (false). */
    aoMudarConexao(conectada: boolean): void;
}

export interface Rede {
    /** true enquanto conectado e apresentado: só então as ações vão para o servidor (senão valem só localmente). */
    readonly ativa: boolean;
    /** Manda um pedido ao servidor (ignorado se não há conexão ativa). */
    enviar(pedido: PedidoDoCliente): void;
}

export function criarRede(opcoes: OpcoesRede): Rede {
    let ws: WebSocket | null = null;
    let ativa = false;
    let espera = 500; // ms até a próxima tentativa de conexão

    function conectar(): void {
        const protocolo = location.protocol === "https:" ? "wss" : "ws";
        // O mesmo endereço que entregou a página: no desenvolvimento o Vite repassa /ws ao servidor.
        const socket = new WebSocket(`${protocolo}://${location.host}/ws`);
        ws = socket;

        socket.addEventListener("open", () => {
            espera = 500;
            const entrar: PedidoDoCliente = { tipo: "entrar", apelido: opcoes.apelido };
            socket.send(JSON.stringify(entrar));
        });

        socket.addEventListener("message", (mensagem: MessageEvent<unknown>) => {
            let evento: EventoDoServidor;
            try {
                evento = JSON.parse(String(mensagem.data)) as EventoDoServidor;
            } catch {
                return; // lixo: ignora
            }
            if (evento.tipo === "estado_inicial") ativa = true; // a partir daqui as ações vão para o servidor
            opcoes.aoReceber(evento);
            if (evento.tipo === "estado_inicial") opcoes.aoMudarConexao(true);
        });

        socket.addEventListener("close", () => {
            if (ws === socket) ws = null;
            if (ativa) {
                ativa = false;
                opcoes.aoMudarConexao(false);
            }
            setTimeout(conectar, espera);
            espera = Math.min(espera * 2, 8000);
        });
    }
    conectar();

    return {
        get ativa() {
            return ativa;
        },
        enviar(pedido) {
            if (ativa && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(pedido));
        },
    };
}
