// =====================================================================
// PINGS: o que aparece no mapa quando alguém "pinga" um ponto (botão direito > Ping): anéis que pulsam, um SÍMBOLO no centro (o ponto comum ou o símbolo do tipo: ?, caveira, setas, !, mira, espadas...) e o
// NOME de quem pingou. Se esse ponto está FORA da área livre da tela, uma SETA na borda aponta para ele por alguns segundos (e acompanha o mapa se você mexer a câmera).
// Nada é guardado: o ping some sozinho.
//   - A seta aparece só quando o ponto do ping NÃO está à vista (atrás de um painel ou fora da janela), e não quando o mapa está visível, mesmo ao lado dos painéis.
//   - Os anéis e o símbolo vivem no mundo (por cima de tudo, como a régua); a seta vive na TELA (no palco, por cima do mundo); ela se ajusta à área livre entre os painéis.
//   - A cor do ping comum é a do desenho que a pessoa tinha escolhido; os outros tipos têm cor fixa (a tabela `DADOS_DAS_FORMAS_DE_PING` do config.ts): "?" amarelo, caveira vermelha, setas verdes, escudo azul, coração verde, grupo violeta...
//   - O símbolo SOBE DO CHÃO: o ponto clicado é o chão; o símbolo começa enterrado (escondido por uma máscara que só deixa ver o que está acima do chão) e sobe, com um pulinho no fim.
//   - Os símbolos são os SVGs do dono (`public/images/svgs/pings/`): lidos, pintados na cor do tipo, com um contorno escuro por trás, e guardados como textura.
// =====================================================================

import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { ALTURA_SIMBOLO_PING, DADOS_DAS_FORMAS_DE_PING, FORMAS_ESPECIAIS_DE_PING, MARGEM_SETA_PING, MS_PING_VISIVEL, MS_SETA_PING, MS_SUBIDA_PING, TAMANHO_CASA } from "../config";
import type { FormaDePing } from "../protocolo";
import type { Camera } from "./camera";

export interface Pings {
    /** Mostra um ping no ponto (col, row) (em casas, com fração), do tipo `forma`, com o nome de quem pingou. `cor` é a do desenho dele (só o ping comum a usa). */
    mostrar(col: number, row: number, forma: FormaDePing, cor: number, nome: string): void;
    /** Tira todos os pings da tela (trocou de mapa). */
    limpar(): void;
    /** Quantas SETAS de ping estão à vista agora (só para os testes). */
    readonly setasVisiveis: number;
    /** Quantos pings estão na tela agora (só para os testes). */
    readonly naTela: number;
}

interface PingAtivo {
    col: number;
    row: number;
    cor: number; // a cor de verdade (já escolhida pela forma)
    nasceu: number; // ms, no relógio do `quadro`
    aneis: Graphics; // no mundo
    marca: Container; // no mundo: o símbolo e o nome (mantém o mesmo tamanho NA TELA em qualquer zoom)
    simbolo: Container; // dentro da marca: o que SOBE do chão
    repouso: number; // a altura (em px de tela, negativa = para cima) em que o símbolo fica depois de subir
    seta: Container; // na tela
    setaForma: Graphics;
    nomeSeta: Text;
}

const NUMERO_DE_ANEIS = 3;
const CICLO_ANEL_MS = 1100; // quanto cada anel leva para crescer e sumir (os anéis saem defasados)
const CONTORNO = 0x1a1a1f;

/** A cor de verdade de um ping: o comum usa a do desenho; os outros têm a sua (tabela do config.ts). */
function corDaForma(forma: FormaDePing, cor: number): number {
    return forma === "comum" ? cor : DADOS_DAS_FORMAS_DE_PING[forma].cor;
}

/** O símbolo desenhado à mão: um ponto. É o do ping COMUM e a reserva dos outros tipos enquanto a imagem (SVG) ainda não carregou. */
function criarSimbolo(cor: number): Container {
    const simbolo = new Container();
    const g = new Graphics();
    g.circle(0, 0, 8).fill(cor).stroke({ width: 3, color: CONTORNO });
    simbolo.addChild(g);
    return simbolo;
}

// --- As texturas dos símbolos (a partir dos SVGs) ---

const TAMANHO_TEXTURA = 128; // o lado da textura (px): com folga para o contorno e nítida em telas de alta densidade
const MARGEM_TEXTURA = 10;
const texturas = new Map<FormaDePing, Texture>();
let preparando: Promise<void> | null = null;

const hexCss = (cor: number): string => `#${cor.toString(16).padStart(6, "0")}`;

/** O SVG do dono pintado na cor pedida: toda cor em hexadecimal do arquivo (preto `#000000`, azul-escuro `#1C274C`...) vira a cor do tipo (os ícones são de uma cor só; `none` fica como está). Se o arquivo não declara cor nenhuma (preto padrão), a cor entra no <svg>. */
function pintarSvg(texto: string, cor: number): string {
    const css = hexCss(cor);
    const pintado = texto.replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, css);
    if (pintado !== texto) return pintado;
    return /<svg\b[^>]*\sfill=/.test(texto) ? texto : texto.replace(/<svg\b/, `<svg fill="${css}"`);
}

async function carregarImagem(svg: string): Promise<HTMLImageElement> {
    const endereco = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
        const imagem = new Image();
        imagem.src = endereco;
        await imagem.decode();
        return imagem;
    } finally {
        URL.revokeObjectURL(endereco);
    }
}

/** Lê os SVGs dos tipos de ping e faz uma textura de cada: o símbolo colorido sobre um contorno escuro (para ler em qualquer mapa). Roda uma vez, ao criar os pings. */
function prepararTexturas(): Promise<void> {
    preparando ??= (async () => {
        // Todos em PARALELO (um de cada vez demorava: o último tipo ficava sem imagem por um bom tempo).
        await Promise.all(FORMAS_ESPECIAIS_DE_PING.map(async (forma) => {
            try {
                const resposta = await fetch(`/images/svgs/pings/${DADOS_DAS_FORMAS_DE_PING[forma].arquivo}.svg`);
                if (!resposta.ok) return;
                const texto = await resposta.text();
                const [colorido, escuro] = await Promise.all([carregarImagem(pintarSvg(texto, corDaForma(forma, 0))), carregarImagem(pintarSvg(texto, CONTORNO))]);
                const tela = document.createElement("canvas");
                tela.width = TAMANHO_TEXTURA;
                tela.height = TAMANHO_TEXTURA;
                const g = tela.getContext("2d");
                if (!g) return;
                const lado = TAMANHO_TEXTURA - 2 * MARGEM_TEXTURA;
                // O contorno: a versão escura desenhada em volta, em vários ângulos.
                for (let i = 0; i < 20; i++) {
                    const angulo = (i / 20) * Math.PI * 2;
                    g.drawImage(escuro, MARGEM_TEXTURA + Math.cos(angulo) * 6, MARGEM_TEXTURA + Math.sin(angulo) * 6, lado, lado);
                }
                g.drawImage(colorido, MARGEM_TEXTURA, MARGEM_TEXTURA, lado, lado);
                texturas.set(forma, Texture.from(tela));
            } catch {
                /* sem a imagem, o ping usa o símbolo desenhado à mão (criarSimbolo) */
            }
        }));
    })();
    return preparando;
}

/** O símbolo de um tipo: o SVG do dono se já carregou; senão (ou para o ponto comum) o ponto. Centrado em (0,0) e com `ALTURA_SIMBOLO_PING` de altura. */
function simboloDe(forma: FormaDePing, cor: number): Container {
    const textura = texturas.get(forma);
    if (!textura) return criarSimbolo(cor);
    const imagem = new Sprite(textura);
    imagem.anchor.set(0.5);
    imagem.scale.set(ALTURA_SIMBOLO_PING / (TAMANHO_TEXTURA - 2 * MARGEM_TEXTURA)); // (o desenho em si ocupa o miolo da textura; a margem é do contorno)
    const caixa = new Container();
    caixa.addChild(imagem);
    return caixa;
}

/**
 * `estaVisivel(x, y)`: o ponto (em pixels do canvas) está À VISTA? Quem cria decide (o main.ts pergunta ao navegador o que está no TOPO daquele ponto: se for o mapa, está visível; um painel, um menu ou o fim da janela
 * o escondem). A seta só aparece quando o ping NÃO está à vista.
 */
export function criarPings(app: Application, camera: Camera, estaVisivel: (x: number, y: number) => boolean): Pings {
    void prepararTexturas(); // (já deixa os SVGs prontos para o primeiro ping)

    const camadaDoMundo = new Container();
    camera.mundo.addChild(camadaDoMundo);
    const camadaDaTela = new Container();
    camadaDaTela.eventMode = "none"; // (a seta nunca rouba o mouse do mapa)
    app.stage.addChild(camadaDaTela);

    const ativos: PingAtivo[] = [];
    let relogio = 0;

    /** A parte da tela que NÃO está coberta pelos painéis (é onde o ping pode ser visto). */
    function areaLivre(): { x0: number; x1: number; y0: number; y1: number } {
        const coberta = camera.areaCoberta?.() ?? { esquerda: 0, direita: 0 };
        let x0 = coberta.esquerda;
        let x1 = app.screen.width - coberta.direita;
        if (x1 - x0 < 200) {
            x0 = 0;
            x1 = app.screen.width; // painéis ocupam quase tudo (janela minúscula): vale a janela toda
        }
        return { x0, x1, y0: 0, y1: app.screen.height };
    }

    function remover(p: PingAtivo): void {
        p.aneis.destroy();
        p.marca.destroy({ children: true });
        p.seta.destroy({ children: true });
        ativos.splice(ativos.indexOf(p), 1);
        if (ativos.length === 0) app.ticker.remove(quadro);
    }

    function quadro(tk: { deltaMS: number }): void {
        relogio += tk.deltaMS;
        const z = camera.zoom;
        const area = areaLivre();
        for (const p of [...ativos]) {
            const idade = relogio - p.nasceu;
            if (idade >= MS_PING_VISIVEL) {
                remover(p);
                continue;
            }
            const cx = p.col * TAMANHO_CASA;
            const cy = p.row * TAMANHO_CASA;
            const geral = Math.min(1, (MS_PING_VISIVEL - idade) / 700); // some suavemente no fim

            // --- os anéis, no mundo: três anéis que crescem e esmaecem ---
            const g = p.aneis;
            g.clear();
            for (let i = 0; i < NUMERO_DE_ANEIS; i++) {
                const atraso = i * (CICLO_ANEL_MS / NUMERO_DE_ANEIS);
                if (idade < atraso) continue; // o anel ainda não nasceu
                const fase = ((idade - atraso) % CICLO_ANEL_MS) / CICLO_ANEL_MS; // 0 a 1
                g.circle(cx, cy, (0.15 + fase * 1.5) * TAMANHO_CASA).stroke({ width: 4 / z, color: p.cor, alpha: (1 - fase) * 0.95 * geral });
            }

            // --- o símbolo e o nome, no mundo, com o tamanho fixo na tela (escala 1/zoom) ---
            p.marca.position.set(cx, cy);
            p.marca.scale.set(1 / z);
            p.marca.alpha = geral;
            // O símbolo SOBE do chão: começa enterrado (a máscara só deixa ver o que está acima do chão, y < 0) e sobe até o repouso, passando um pouco e voltando (pulinho).
            const t = Math.min(1, idade / MS_SUBIDA_PING);
            const c1 = 1.9; // (a força do pulinho)
            const suave = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); // "ease out back": 0 → 1 passando um pouco de 1
            const enterrado = ALTURA_SIMBOLO_PING / 2 + 4; // (a posição inicial: o símbolo inteiro abaixo do chão)
            p.simbolo.y = enterrado + (p.repouso - enterrado) * suave;
            p.simbolo.alpha = Math.min(1, t * 4);

            // --- a seta, na tela: só se o ponto caiu fora da área livre, e só pelos primeiros MS_SETA_PING ---
            const tela = camera.mundoParaTela(cx, cy);
            const dentro = estaVisivel(tela.x, tela.y); // (à vista: nenhuma seta)
            if (dentro || idade > MS_SETA_PING) {
                p.seta.visible = false;
                continue;
            }
            // O ponto da borda: do centro da área livre até o ping, parando na borda (com uma margem para dentro).
            const centroX = (area.x0 + area.x1) / 2;
            const centroY = (area.y0 + area.y1) / 2;
            const dx = tela.x - centroX;
            const dy = tela.y - centroY;
            const meiaLargura = (area.x1 - area.x0) / 2 - MARGEM_SETA_PING;
            const meiaAltura = (area.y1 - area.y0) / 2 - MARGEM_SETA_PING;
            const escala = Math.min(dx !== 0 ? meiaLargura / Math.abs(dx) : Infinity, dy !== 0 ? meiaAltura / Math.abs(dy) : Infinity);
            p.seta.visible = true;
            p.seta.position.set(centroX + dx * escala, centroY + dy * escala);
            p.setaForma.rotation = Math.atan2(dy, dx); // a ponta aponta para o ping
            // O nome fica do lado de DENTRO da seta (para não sair da tela).
            const norma = Math.hypot(dx, dy) || 1;
            p.nomeSeta.position.set((-dx / norma) * 34, (-dy / norma) * 34);
            // Pulsa de leve, e esmaece no último segundo.
            const restante = Math.min(1, (MS_SETA_PING - idade) / 800);
            p.seta.alpha = (0.75 + 0.25 * Math.sin(idade / 140)) * restante;
        }
    }

    const estiloDoNome = { fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: "700" as const, fill: 0xffffff, stroke: { color: CONTORNO, width: 4, join: "round" as const } };

    return {
        mostrar(col, row, forma, corDoDesenho, nome) {
            const cor = corDaForma(forma, corDoDesenho);
            const aneis = new Graphics();
            camadaDoMundo.addChild(aneis);

            // A marca: o ponto do chão é a origem (0,0). A sombra achatada fica NO chão; o símbolo sobe de dentro do chão (máscara: só se vê o que está acima dele); o nome fica logo ABAIXO do chão.
            const marca = new Container();
            const sombra = new Graphics();
            sombra.ellipse(0, 0, 15, 5).fill({ color: 0x000000, alpha: 0.35 });
            const simbolo = simboloDe(forma, cor);
            // Se este ping nasceu ANTES de a imagem do tipo terminar de carregar (os primeiros segundos da página), ele começa com o ponto e troca pelo símbolo assim que ela chega.
            if (forma !== "comum" && !texturas.has(forma)) {
                void prepararTexturas().then(() => {
                    if (!texturas.has(forma) || !ativos.some((a) => a.simbolo === simbolo)) return;
                    for (const antigo of simbolo.removeChildren()) antigo.destroy();
                    simbolo.addChild(...simboloDe(forma, cor).removeChildren());
                });
            }
            const repouso = -(ALTURA_SIMBOLO_PING / 2 + 6); // (o símbolo "flutua" um pouco acima do chão)
            simbolo.y = ALTURA_SIMBOLO_PING / 2 + 4;
            const chao = new Graphics();
            chao.rect(-120, -200, 240, 200).fill(0xffffff); // (acima do chão: y de -200 a 0)
            simbolo.mask = chao;
            marca.addChild(sombra, chao, simbolo);
            if (nome) {
                const rotulo = new Text({ text: nome, style: estiloDoNome });
                rotulo.anchor.set(0.5, 0);
                rotulo.position.set(0, 9);
                marca.addChild(rotulo);
            }
            camadaDoMundo.addChild(marca);
            camera.mundo.addChild(camadaDoMundo); // (traz para o topo do mundo: por cima dos tokens)

            // A seta: um triângulo apontando para +x (a rotação o vira para o ping), com contorno escuro para ler em qualquer mapa.
            const seta = new Container();
            const setaForma = new Graphics();
            setaForma.poly([16, 0, -10, -13, -4, 0, -10, 13]).fill(cor).stroke({ width: 2, color: CONTORNO, join: "round" });
            const nomeSeta = new Text({ text: nome, style: estiloDoNome });
            nomeSeta.anchor.set(0.5);
            seta.addChild(setaForma, nomeSeta);
            seta.visible = false;
            camadaDaTela.addChild(seta);

            if (ativos.length === 0) app.ticker.add(quadro);
            ativos.push({ col, row, cor, nasceu: relogio, aneis, marca, simbolo, repouso, seta, setaForma, nomeSeta });
        },
        limpar() {
            for (const p of [...ativos]) remover(p);
        },
        get setasVisiveis() {
            return ativos.filter((p) => p.seta.visible).length;
        },
        get naTela() {
            return ativos.length;
        },
    };
}
