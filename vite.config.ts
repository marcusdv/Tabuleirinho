// Configuração do Vite. Só o necessário para o MODO ONLINE no desenvolvimento: o navegador abre a página no Vite
// (porta 5173) e conecta em /ws; o Vite repassa essa conexão ao servidor do jogo (servidor/servidor.ts).
// Assim a página e o WebSocket têm o MESMO endereço (e a verificação de origem do servidor funciona).
import { defineConfig } from "vite";
import { PORTA_SERVIDOR } from "./src/config.ts";

// A porta do servidor é a de `config.ts`, mas dá para trocá-la só para este Vite, sem mexer em nada: PORTA_SERVIDOR=3791 npm run dev
// (útil para testar com um servidor temporário enquanto o servidor "de verdade", na porta padrão, continua ligado).
const portaDoServidor = Number(process.env.PORTA_SERVIDOR) || PORTA_SERVIDOR;

export default defineConfig({
    server: {
        proxy: {
            "/ws": { target: `ws://127.0.0.1:${portaDoServidor}`, ws: true },
        },
    },
});
