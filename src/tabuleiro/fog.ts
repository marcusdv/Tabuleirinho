// =====================================================================
// FOG (NÉVOA) NO TABULEIRO (PixiJS): a camada que cobre o mapa e o pincel do MESTRE. Ver `src/fog.ts` (a máscara, compartilhada com o servidor).
//
// A camada fica POR CIMA do mapa, da grade e dos desenhos e POR BAIXO dos tokens: os jogadores só recebem as peças que o servidor deixa ver, então a peça visível nunca fica sob o fog.
// Para os jogadores o fog é opaco; para o MESTRE é translúcido (ele vê o que está embaixo, e vê o que os jogadores não veem). A máscara vira uma imagem pequena (um pontinho por
// 1/8 de casa) esticada sobre o tabuleiro com suavização: as bordas do fog ficam macias. O pincel é uma FERRAMENTA DE ARRASTO (ver ferramenta.ts): pinta na hora, aqui, e junta as
// pinceladas em lotes para o main.ts mandar ao servidor (que é quem guarda e avisa os outros).
// =====================================================================

import { Container, Graphics, Sprite, Texture, type PointData } from "pixi.js";
import { TAMANHO_CASA } from "../config";
import { estado } from "../estado";
import { pintarTraco, RAIO_MAX_FOG, RAIO_MIN_FOG, SUB_FOG, type FormaDeFog, type MascaraDeFog, type TracoDeFog } from "../fog";
import type { Camera } from "./camera";
import type { FerramentaDeArrasto } from "./ferramenta";

const COR_DO_FOG = [11, 11, 18]; // (quase preto, levemente azulado)
const ALPHA_PARA_O_MESTRE = 0.55;
const MS_ENTRE_LOTES = 80; // as pinceladas são mandadas ao servidor em lotes, a cada tanto

export interface OpcoesFog {
    /** Um lote de pinceladas foi pintado aqui: o main.ts o manda ao servidor (online). */
    aoPintar(tracos: TracoDeFog[]): void;
}

export interface FogDoTabuleiro extends FerramentaDeArrasto {
    /** Redesenha a camada a partir de `estado.fog` (a máscara mudou por inteiro: troca de mapa, ligar/desligar, cobrir ou revelar tudo). */
    atualizar(): void;
    /** Aplica pinceladas que vieram do servidor (do mestre) na máscara que já temos. */
    aplicarTracos(tracos: readonly TracoDeFog[]): void;
    /** Liga o pincel: "cobrir" ou "revelar" (null = desliga). */
    definirModo(modo: "cobrir" | "revelar" | null): void;
    /** A metade da largura e a metade da altura do pincel, em casas. */
    definirRaio(raioX: number, raioY: number): void;
    /** O formato do pincel. */
    definirForma(forma: FormaDeFog): void;
    /** "livre" (padrão): o pincel pinta onde o mouse estiver. "casa": o pincel é sempre um quadrado que cobre casas INTEIRAS da grade. */
    definirAlinhamento(alinhamento: "livre" | "casa" | "area"): void;
    /** Mostra o contorno do pincel sobre o ponto da tela (antes de clicar); null o esconde. */
    pairar(ponto: PointData | null): void;
    /** Esconde a camada de fog (o mestre está configurando o mapa e precisa ver o mapa limpo). */
    ocultar(esconder: boolean): void;
}

export function criarFog(camera: Camera, opcoes: OpcoesFog): FogDoTabuleiro {
    const camada = new Container();
    camada.visible = false;
    camera.mundo.addChild(camada);
    const imagem = new Sprite();
    camada.addChild(imagem);
    // O anel que mostra o tamanho do pincel enquanto se arrasta.
    const anel = new Graphics();
    anel.visible = false;
    camera.mundo.addChild(anel);

    let canvas: HTMLCanvasElement | null = null;
    let textura: Texture | null = null;
    let pedidoDeDesenho = 0;
    let modo: "cobrir" | "revelar" | null = null;
    let raio = 2; // metade da largura
    let raioAltura = 2; // metade da altura
    let fimDaArea: { x: number; y: number } | null = null;
    let forma: FormaDeFog = "circulo";
    let escondido = false;
    let alinhamento: "livre" | "casa" | "area" = "livre";
    let inicioDaArea: { x: number; y: number } | null = null; // modo "Área": onde o arrasto começou (em casas)
    let arrastando = false;
    let ultimo: { x: number; y: number } | null = null;
    let lote: TracoDeFog[] = [];
    let temporizador: number | undefined;

    /** Desenha a máscara toda no canvas (um pontinho por pixel) e atualiza a textura. */
    function desenhar(): void {
        pedidoDeDesenho = 0;
        const { ativo, mascara } = estado.fog;
        camada.visible = ativo && mascara !== null && !escondido;
        if (!ativo || !mascara) return;
        const w = mascara.colunas * SUB_FOG;
        const h = mascara.linhas * SUB_FOG;
        if (!canvas || canvas.width !== w || canvas.height !== h) {
            canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            textura?.destroy(true);
            textura = Texture.from(canvas);
            imagem.texture = textura;
        }
        const contexto = canvas.getContext("2d");
        if (!contexto) return;
        const dados = contexto.createImageData(w, h);
        const px = dados.data;
        const bits = mascara.bits;
        for (let i = 0; i < w * h; i++) {
            if ((bits[i >> 3] & (1 << (i & 7))) !== 0) {
                const k = i * 4;
                px[k] = COR_DO_FOG[0];
                px[k + 1] = COR_DO_FOG[1];
                px[k + 2] = COR_DO_FOG[2];
                px[k + 3] = 255;
            }
        }
        contexto.putImageData(dados, 0, 0);
        textura?.source.update();
        imagem.width = mascara.colunas * TAMANHO_CASA;
        imagem.height = mascara.linhas * TAMANHO_CASA;
        imagem.alpha = estado.mestre ? ALPHA_PARA_O_MESTRE : 1;
    }
    /** Várias pinceladas seguidas pedem UM redesenho (no próximo quadro). */
    function pedirDesenho(): void {
        if (!pedidoDeDesenho) pedidoDeDesenho = window.requestAnimationFrame(desenhar);
    }

    function enviarLote(): void {
        window.clearTimeout(temporizador);
        temporizador = undefined;
        if (lote.length === 0) return;
        const enviar = lote;
        lote = [];
        opcoes.aoPintar(enviar);
    }

    /** O que o pincel pinta com o mouse em (x, y), em casas: no modo livre é o que está escolhido; "por casa" vira uma caixa de N × M casas inteiras, alinhada à grade, com o formato escolhido dentro dela. */
    function pincelEm(x: number, y: number): { x: number; y: number; raio: number; raioY: number; forma: FormaDeFog } {
        if (alinhamento === "livre") return { x, y, raio, raioY: raioAltura, forma };
        const nx = Math.max(1, Math.round(raio * 2)); // a largura, em casas inteiras
        const ny = Math.max(1, Math.round(raioAltura * 2)); // a altura, em casas inteiras
        // (lado ímpar: o centro é o meio de uma casa; lado par: o centro é o canto entre casas)
        const centro = (v: number, n: number): number => (n % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
        return { x: centro(x, nx), y: centro(y, ny), raio: nx / 2, raioY: ny / 2, forma }; // (por casa o formato escolhido vale: círculo, quadrado ou triângulo, dentro de uma caixa de casas inteiras)
    }
    let ultimaCasa = "";

    /** O retângulo (centro e metades) entre dois pontos, em casas. */
    function caixaEntre(a: { x: number; y: number }, b: { x: number; y: number }): TracoDeFog {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, raio: Math.max(RAIO_MIN_FOG, Math.abs(a.x - b.x) / 2), raioY: Math.max(RAIO_MIN_FOG, Math.abs(a.y - b.y) / 2), cobrir: modo === "cobrir", forma: forma === "quadrado" ? "retangulo" : forma }; // (a caixa arrastada vale para o formato escolhido: o círculo vira elipse e o triângulo ocupa a caixa)
    }
    function desenharCaixa(t: TracoDeFog): void {
        anel.clear();
        const cor = modo === "cobrir" ? 0xff7a45 : 0xffd23f;
        const cx = t.x * TAMANHO_CASA;
        const cy = t.y * TAMANHO_CASA;
        const r = t.raio * TAMANHO_CASA;
        const ry = (t.raioY ?? t.raio) * TAMANHO_CASA;
        // (o contorno tem o formato escolhido; a caixa pontilhada em volta mostra o que está sendo arrastado)
        if (t.forma === "circulo") anel.ellipse(cx, cy, r, ry);
        else if (t.forma === "triangulo") anel.poly([cx, cy - ry, cx + r, cy + ry, cx - r, cy + ry]);
        else anel.rect(cx - r, cy - ry, 2 * r, 2 * ry);
        anel.fill({ color: cor, alpha: 0.18 }).stroke({ width: 2 / Math.max(camera.zoom, 0.2), color: cor, alpha: 0.95 });
        anel.visible = true;
    }

    /** Põe uma pincelada (em casas) na máscara daqui e no lote que vai ao servidor. */
    function pincelar(x: number, y: number): void {
        const mascara: MascaraDeFog | null = estado.fog.mascara;
        if (!mascara || !modo) return;
        const p = pincelEm(x, y);
        if (alinhamento === "casa") {
            // (por casa, a mesma casa não precisa ser pintada de novo enquanto o mouse não sair dela)
            const chave = `${p.x},${p.y},${p.raio},${p.raioY},${modo}`;
            if (chave === ultimaCasa) return;
            ultimaCasa = chave;
        }
        const traco: TracoDeFog = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, raio: p.raio, raioY: p.raioY, cobrir: modo === "cobrir", forma: p.forma };
        pintarTraco(mascara, traco);
        lote.push(traco);
        pedirDesenho();
        if (temporizador === undefined) temporizador = window.setTimeout(enviarLote, MS_ENTRE_LOTES);
    }
    const emCasas = (ponto: PointData): { x: number; y: number } => {
        const m = camera.telaParaMundo(ponto);
        return { x: m.x / TAMANHO_CASA, y: m.y / TAMANHO_CASA };
    };
    function desenharAnel(x: number, y: number): void {
        anel.clear();
        const p = pincelEm(x, y);
        const cx = p.x * TAMANHO_CASA;
        const cy = p.y * TAMANHO_CASA;
        const r = p.raio * TAMANHO_CASA;
        const ry = p.raioY * TAMANHO_CASA;
        if (p.forma === "quadrado") anel.rect(cx - r, cy - ry, 2 * r, 2 * ry);
        else if (p.forma === "triangulo") anel.poly([cx, cy - ry, cx + r, cy + ry, cx - r, cy + ry]);
        else anel.ellipse(cx, cy, r, ry);
        const cor = modo === "cobrir" ? 0xff7a45 : 0xffd23f;
        anel.fill({ color: cor, alpha: 0.12 }).stroke({ width: 2 / Math.max(camera.zoom, 0.2), color: cor, alpha: 0.95 });
        anel.visible = true;
    }

    return {
        get ativa() {
            return modo !== null;
        },
        get medindo() {
            return arrastando;
        },
        comecar(ponto) {
            if (!modo || !estado.fog.ativo) return;
            arrastando = true;
            ultimaCasa = "";
            const c = emCasas(ponto);
            if (alinhamento === "area") {
                inicioDaArea = c; // (a área só vale ao SOLTAR; até lá aparece o contorno)
                fimDaArea = c;
                desenharCaixa(caixaEntre(c, c));
                return;
            }
            ultimo = c;
            pincelar(c.x, c.y);
            desenharAnel(c.x, c.y);
        },
        arrastar(ponto) {
            if (!arrastando) return;
            const c = emCasas(ponto);
            if (alinhamento === "area" && inicioDaArea) {
                fimDaArea = c;
                return desenharCaixa(caixaEntre(inicioDaArea, c));
            }
            desenharAnel(c.x, c.y);
            // Entre o ponto anterior e este, uma pincelada a cada 1/3 do raio: o traço sai contínuo mesmo com o mouse rápido.
            const passo = Math.max(0.15, raio / 3);
            const dx = c.x - (ultimo?.x ?? c.x);
            const dy = c.y - (ultimo?.y ?? c.y);
            const n = Math.floor(Math.hypot(dx, dy) / passo);
            for (let i = 1; i <= n; i++) pincelar((ultimo?.x ?? c.x) + (dx * i) / n, (ultimo?.y ?? c.y) + (dy * i) / n);
            if (n > 0) ultimo = c;
        },
        soltar() {
            if (alinhamento === "area" && inicioDaArea && fimDaArea && estado.fog.mascara && modo) {
                const traco = caixaEntre(inicioDaArea, fimDaArea);
                traco.x = Math.round(traco.x * 100) / 100;
                traco.y = Math.round(traco.y * 100) / 100;
                pintarTraco(estado.fog.mascara, traco);
                lote.push(traco);
                pedirDesenho();
            }
            inicioDaArea = null;
            arrastando = false;
            ultimo = null;
            anel.visible = false;
            enviarLote();
        },
        atualizar: desenhar,
        aplicarTracos(tracos) {
            const mascara = estado.fog.mascara;
            if (!mascara) return;
            for (const t of tracos) pintarTraco(mascara, t);
            pedirDesenho();
        },
        definirModo(novo) {
            modo = novo;
            if (!novo) {
                arrastando = false;
                anel.visible = false;
                enviarLote();
            }
        },
        definirRaio(x, y) {
            raio = Math.min(RAIO_MAX_FOG, Math.max(RAIO_MIN_FOG, x));
            raioAltura = Math.min(RAIO_MAX_FOG, Math.max(RAIO_MIN_FOG, y));
        },
        definirForma(nova) {
            forma = nova;
        },
        definirAlinhamento(novo) {
            alinhamento = novo;
        },
        pairar(ponto) {
            if (arrastando) return; // (arrastando, o contorno acompanha o arrasto)
            if (!ponto || !modo || !estado.fog.ativo || alinhamento === "area") {
                anel.visible = false;
                return;
            }
            const c = emCasas(ponto);
            desenharAnel(c.x, c.y);
        },
        ocultar(esconder) {
            escondido = esconder;
            desenhar();
        },
    };
}
