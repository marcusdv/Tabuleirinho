// Configuração do Vite. Só o necessário para o MODO ONLINE no desenvolvimento: o navegador abre a página no Vite
// (porta 5173) e conecta em /ws; o Vite repassa essa conexão ao servidor do jogo (servidor/servidor.ts).
// Assim a página e o WebSocket têm o MESMO endereço (e a verificação de origem do servidor funciona).
import { defineConfig } from "vite";
import { PORTA_SERVIDOR } from "./src/config.ts";

export default defineConfig({
    server: {
        proxy: {
            "/ws": { target: `ws://127.0.0.1:${PORTA_SERVIDOR}`, ws: true },
        },
    },
});
