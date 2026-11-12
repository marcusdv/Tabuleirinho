// =====================================================================
// EDITOR DE IMAGEM DO TOKEN (HTML + canvas): o usuário escolhe uma foto, ARRASTA para posicionar,
// dá ZOOM e confirma. O que está dentro do círculo vira a imagem do token.
//
// Para gastar pouca memória e pouco espaço, a foto grande só existe enquanto o editor está aberto:
//   1) ao abrir, fotos enormes já são REDUZIDAS na hora de decodificar (LADO_MAX_EDICAO_IMAGEM);
//   2) ao confirmar, a parte do círculo é copiada para um canvas pequeno (TAMANHO_IMAGEM_TOKEN) e
//      vira um WebP comprimido de poucos KB: é como tirar um "print" do recorte;
//   3) a foto grande é descartada (`bitmap.close()`); só a miniatura (um texto "data:image/webp...") fica.
//
// A marcação e o CSS ficam no index.html (ids "editor-imagem-*").
// =====================================================================

import {
    DIAMETRO_RECORTE,
    LADO_MAX_EDICAO_IMAGEM,
    QUALIDADE_IMAGEM_TOKEN,
    TAMANHO_IMAGEM_TOKEN,
    VISAO_RECORTE,
    ZOOM_MAX_RECORTE,
    ZOOM_MIN_RECORTE,
} from "../config";
import { limitar } from "../coordenadas";

export interface EditorImagem {
    /**
     * Abre o editor com o arquivo escolhido. Devolve a miniatura recortada (texto "data:image/webp;base64,...")
     * quando o usuário confirma, ou null se cancelar (ou se o arquivo não abrir).
     * `corFundo` (0xRRGGBB) é a cor de preenchimento do token: aparece atrás das partes transparentes da imagem,
     * como vai aparecer no token.
     */
    editar(arquivo: File, corFundo: number): Promise<string | null>;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/** Decodifica a imagem já reduzida (se for enorme) e com a rotação da foto aplicada. */
async function decodificar(arquivo: File): Promise<ImageBitmap> {
    const opcoes: ImageBitmapOptions = { imageOrientation: "from-image" };
    const original = await createImageBitmap(arquivo, opcoes);
    const maior = Math.max(original.width, original.height);
    if (maior <= LADO_MAX_EDICAO_IMAGEM) return original;

    // Foto grande demais: decodifica de novo já no tamanho reduzido e solta a grande.
    const fator = LADO_MAX_EDICAO_IMAGEM / maior;
    const largura = Math.round(original.width * fator);
    const altura = Math.round(original.height * fator);
    original.close();
    return createImageBitmap(arquivo, { ...opcoes, resizeWidth: largura, resizeHeight: altura, resizeQuality: "high" });
}

export function criarEditorImagem(): EditorImagem {
    const janela = pegar("editor-imagem");
    const tela = pegar<HTMLCanvasElement>("editor-imagem-tela");
    const controleZoom = pegar<HTMLInputElement>("editor-imagem-zoom");
    const aviso = pegar("editor-imagem-aviso");
    const botaoCancelar = pegar<HTMLButtonElement>("editor-imagem-cancelar");
    const botaoUsar = pegar<HTMLButtonElement>("editor-imagem-usar");

    const V = VISAO_RECORTE; // lado da área de edição
    const D = DIAMETRO_RECORTE; // diâmetro do círculo de recorte
    tela.width = V;
    tela.height = V;
    tela.style.width = `${V}px`;
    tela.style.height = `${V}px`;
    controleZoom.min = String(ZOOM_MIN_RECORTE);
    controleZoom.max = String(ZOOM_MAX_RECORTE);
    const ctx = tela.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";

    let bitmap: ImageBitmap | null = null;
    let fundo = "#1a1a1f"; // cor atrás da imagem (o preenchimento do token)
    let resolver: ((miniatura: string | null) => void) | null = null;
    let sessao = 0; // muda a cada abertura: respostas atrasadas de uma abertura anterior são ignoradas

    // O ENQUADRAMENTO: (cx, cy) é o ponto da IMAGEM (em pixels dela) que fica no centro do círculo, e
    // `escala` é quantos pixels de tela vale cada pixel da imagem. Zoom 1 = a imagem mal cobre o círculo.
    let cx = 0;
    let cy = 0;
    let escala = 1;
    let escalaMin = 1;

    /**
     * Limita até onde a imagem pode ser arrastada. Por eixo, com `meio` = metade do círculo em pixels da imagem:
     *  - imagem MAIOR que o círculo: o círculo não sai da imagem (centro entre `meio` e `tamanho - meio`);
     *  - imagem MENOR que o círculo (zoom out): a imagem não sai do círculo (os limites se invertem).
     * Nos dois casos o intervalo é contínuo: quando a imagem tem exatamente o tamanho do círculo, vira um ponto só.
     */
    function limitarCentro(): void {
        if (!bitmap) return;
        const meio = D / 2 / escala;
        const faixa = (tamanho: number): [number, number] => [Math.min(meio, tamanho - meio), Math.max(meio, tamanho - meio)];
        const [minX, maxX] = faixa(bitmap.width);
        const [minY, maxY] = faixa(bitmap.height);
        cx = limitar(cx, minX, maxX);
        cy = limitar(cy, minY, maxY);
    }

    function definirZoom(zoom: number): void {
        const z = limitar(zoom, ZOOM_MIN_RECORTE, ZOOM_MAX_RECORTE);
        escala = escalaMin * z;
        controleZoom.value = String(z);
        limitarCentro();
        desenhar();
    }

    function desenhar(): void {
        ctx.fillStyle = fundo;
        ctx.fillRect(0, 0, V, V);
        if (!bitmap) return;
        ctx.drawImage(bitmap, V / 2 - cx * escala, V / 2 - cy * escala, bitmap.width * escala, bitmap.height * escala);
        // Escurece o que está FORA do círculo (regra "par-ímpar": o retângulo menos o círculo).
        ctx.beginPath();
        ctx.rect(0, 0, V, V);
        ctx.arc(V / 2, V / 2, D / 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
        ctx.fill("evenodd");
        ctx.beginPath();
        ctx.arc(V / 2, V / 2, D / 2, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
    }

    /** O "print": copia só a parte do círculo para um canvas pequeno e comprime. */
    function gerarMiniatura(): string {
        const S = TAMANHO_IMAGEM_TOKEN;
        const saida = document.createElement("canvas");
        saida.width = S;
        saida.height = S;
        const c = saida.getContext("2d")!;
        c.imageSmoothingQuality = "high";
        c.beginPath();
        c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
        c.clip(); // fora do círculo fica transparente (o WebP guarda a transparência)
        // Desenha a imagem INTEIRA, já na escala e na posição do recorte: com zoom out sobram áreas vazias
        // (que ficam transparentes), e quem desenhar fora do canvas é cortado sozinho.
        const lado = D / escala; // o lado do quadrado do círculo, em pixels da imagem
        const k = S / lado; // quantos pixels da miniatura vale cada pixel da imagem
        c.drawImage(bitmap!, -(cx - lado / 2) * k, -(cy - lado / 2) * k, bitmap!.width * k, bitmap!.height * k);
        return saida.toDataURL("image/webp", QUALIDADE_IMAGEM_TOKEN);
    }

    /** Fecha a janela, joga fora a foto grande e responde a quem abriu. */
    function terminar(miniatura: string | null): void {
        sessao++;
        janela.hidden = true;
        document.removeEventListener("keydown", aoTeclar, true);
        bitmap?.close(); // libera a memória da foto grande
        bitmap = null;
        const responder = resolver;
        resolver = null;
        responder?.(miniatura);
    }

    /** Esc fecha SÓ o editor (a captura impede que a bolsa por baixo também feche). */
    function aoTeclar(e: KeyboardEvent): void {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        terminar(null);
    }

    // --- Arrastar para posicionar ---
    let arrastando = false;
    let ultimo = { x: 0, y: 0 };
    tela.addEventListener("pointerdown", (e) => {
        if (!bitmap || e.button !== 0) return;
        arrastando = true;
        ultimo = { x: e.clientX, y: e.clientY };
        tela.setPointerCapture(e.pointerId);
        tela.style.cursor = "grabbing";
    });
    tela.addEventListener("pointermove", (e) => {
        if (!arrastando) return;
        // Arrastar a imagem para a direita faz o centro da imagem andar para a ESQUERDA.
        cx -= (e.clientX - ultimo.x) / escala;
        cy -= (e.clientY - ultimo.y) / escala;
        ultimo = { x: e.clientX, y: e.clientY };
        limitarCentro();
        desenhar();
    });
    const soltou = (): void => {
        arrastando = false;
        tela.style.cursor = "grab";
    };
    tela.addEventListener("pointerup", soltou);
    tela.addEventListener("pointercancel", soltou);

    // --- Zoom: roda do mouse e controle deslizante ---
    tela.addEventListener(
        "wheel",
        (e) => {
            if (!bitmap) return;
            e.preventDefault();
            definirZoom((escala / escalaMin) * Math.exp(-e.deltaY * 0.0015));
        },
        { passive: false },
    );
    controleZoom.addEventListener("input", () => {
        if (bitmap) definirZoom(Number(controleZoom.value));
    });

    botaoCancelar.addEventListener("click", () => terminar(null));
    botaoUsar.addEventListener("click", () => {
        if (bitmap) terminar(gerarMiniatura());
    });

    return {
        async editar(arquivo, corFundo) {
            if (resolver) terminar(null); // já havia um aberto: cancela o antigo
            fundo = `#${corFundo.toString(16).padStart(6, "0")}`;
            const minhaSessao = ++sessao;
            const resposta = new Promise<string | null>((resolve) => (resolver = resolve));

            // Abre já, em estado "carregando"; a foto é decodificada em seguida.
            janela.hidden = false;
            botaoUsar.disabled = true;
            controleZoom.disabled = true;
            aviso.textContent = "Carregando a imagem…";
            tela.style.cursor = "default";
            bitmap = null;
            desenhar();
            document.addEventListener("keydown", aoTeclar, true);
            botaoCancelar.focus();

            if (!arquivo.type.startsWith("image/")) {
                aviso.textContent = "Esse arquivo não é uma imagem.";
                return resposta;
            }
            try {
                const lida = await decodificar(arquivo);
                if (minhaSessao !== sessao) {
                    lida.close(); // o editor foi fechado enquanto a foto carregava
                    return resposta;
                }
                bitmap = lida;
            } catch {
                if (minhaSessao === sessao) aviso.textContent = "Não foi possível abrir essa imagem (formato não suportado ou arquivo com defeito).";
                return resposta;
            }

            // Enquadramento inicial: a imagem cobre o círculo e o centro dela fica no círculo.
            escalaMin = D / Math.min(bitmap.width, bitmap.height);
            cx = bitmap.width / 2;
            cy = bitmap.height / 2;
            aviso.textContent = "";
            botaoUsar.disabled = false;
            controleZoom.disabled = false;
            tela.style.cursor = "grab";
            definirZoom(1);
            botaoUsar.focus();
            return resposta;
        },
    };
}
