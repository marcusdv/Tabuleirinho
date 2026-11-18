// =====================================================================
// SELETOR DE COR PRÓPRIO (HTML), com o NÍVEL DE TRANSPARÊNCIA DENTRO DA CAIXA do seletor (pedido do dono, 18/11/2026).
// O seletor nativo do navegador (<input type="color">) não tem transparência e não dá para mudar a caixa dele; este substitui só a CARA dele: um botão com a cor atual que abre uma caixa com
//   - o quadrado de saturação/brilho e o deslizante de matiz (as cores),
//   - o deslizante de TRANSPARÊNCIA (de 0% = opaco até 90%; só se `alfa` foi pedido),
//   - o código "#rrggbb" e uma prévia.
// O <input type="color"> original CONTINUA no HTML (escondido): é ele que guarda a cor ("#rrggbb") e avisa quem a usa pelo evento "input", então o resto do código não muda.
// A transparência vai à parte (`aoMudarAlfa`): o jogo guarda a OPACIDADE (alfa de 0.1 a 1; 1 = opaco).
// =====================================================================

export interface OpcoesSeletorDeCor {
    /** O <input type="color"> de verdade (fica escondido; guarda a cor e dispara "input"). */
    entrada: HTMLInputElement;
    /** Com este campo o seletor ganha o deslizante de transparência (a opacidade de partida, 0.1 a 1). Sem ele, só a cor. */
    alfa?: number;
    /** A pessoa mexeu na transparência: a nova opacidade (0.1 a 1). */
    aoMudarAlfa?(alfa: number): void;
}

export interface SeletorDeCor {
    /** Relê a cor do <input> escondido (quando outra parte do código mudou o valor dele). */
    atualizar(): void;
    /** Põe uma opacidade de fora (sem avisar `aoMudarAlfa`). */
    definirAlfa(alfa: number): void;
    /** Fecha a caixa, se estiver aberta. */
    fechar(): void;
}

const TRANSPARENCIA_MAX = 90; // % (o mínimo de opacidade é 10%: a cor nunca some de vez)
const limitarAlfa = (a: number): number => (Number.isFinite(a) ? Math.min(1, Math.max(0.1, Math.round(a * 100) / 100)) : 1);

// ----- conversões de cor -----
interface Hsv {
    h: number; // 0 a 360
    s: number; // 0 a 1
    v: number; // 0 a 1
}
function hexParaRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbParaHex(r: number, g: number, b: number): string {
    return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}
function rgbParaHsv(r: number, g: number, b: number): Hsv {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rr) h = ((gg - bb) / d) % 6;
        else if (max === gg) h = (bb - rr) / d + 2;
        else h = (rr - gg) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvParaRgb({ h, s, v }: Hsv): [number, number, number] {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

let caixaAberta: { fechar(): void } | null = null; // só UMA caixa aberta por vez

export function criarSeletorDeCor(opcoes: OpcoesSeletorDeCor): SeletorDeCor {
    const { entrada } = opcoes;
    const comAlfa = opcoes.alfa !== undefined;
    let alfa = limitarAlfa(opcoes.alfa ?? 1);
    let hsv: Hsv = { h: 0, s: 1, v: 1 };

    // --- A CARA do seletor: um botão com a cor (sobre um xadrez, para a transparência aparecer) no lugar do campo nativo ---
    entrada.classList.add("seletor-cor-nativo");
    entrada.tabIndex = -1;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "seletor-cor-botao";
    botao.setAttribute("aria-haspopup", "dialog");
    botao.setAttribute("aria-expanded", "false");
    botao.setAttribute("aria-label", entrada.getAttribute("aria-label") ?? "Escolher cor");
    botao.title = entrada.title || "Escolher cor";
    const cara = document.createElement("span");
    cara.className = "seletor-cor-cara";
    botao.append(cara);
    entrada.insertAdjacentElement("beforebegin", botao);

    // --- A CAIXA que abre: montada SÓ ao abrir e tirada do HTML ao fechar (assim nada fica acumulando escondido) ---
    let caixa: HTMLDivElement | null = null;
    let quadrado: HTMLDivElement | null = null;
    let cursor: HTMLDivElement | null = null;
    let matiz: HTMLInputElement | null = null;
    let faixaAlfa: HTMLInputElement | null = null;
    let valorAlfa: HTMLElement | null = null;
    let codigo: HTMLInputElement | null = null;

    const hexAtual = (): string => rgbParaHex(...hsvParaRgb(hsv));
    /** Redesenha o que mudou: o botão sempre; a caixa só se estiver aberta. */
    function mostrar(): void {
        const hex = hexAtual();
        botao.style.setProperty("--cor", hex);
        botao.style.setProperty("--alfa", String(alfa));
        if (!caixa || !quadrado || !cursor || !matiz || !codigo) return;
        quadrado.style.backgroundColor = rgbParaHex(...hsvParaRgb({ h: hsv.h, s: 1, v: 1 }));
        cursor.style.left = `${hsv.s * 100}%`;
        cursor.style.top = `${(1 - hsv.v) * 100}%`;
        matiz.value = String(Math.round(hsv.h));
        if (document.activeElement !== codigo) codigo.value = hex;
        caixa.style.setProperty("--cor", hex);
        if (faixaAlfa && valorAlfa) {
            const t = Math.round((1 - alfa) * 100);
            faixaAlfa.value = String(t);
            valorAlfa.textContent = `${t}%`;
        }
    }
    /** A cor mudou aqui: guarda no <input> escondido e avisa (o evento "input" que o resto do código já ouve). */
    function aplicarCor(): void {
        const hex = hexAtual();
        mostrar();
        if (entrada.value.toLowerCase() === hex) return;
        valorNativo.set?.call(entrada, hex); // (sem passar pelo observador abaixo: já estamos em dia)
        entrada.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function montarCaixa(): HTMLDivElement {
        const c = document.createElement("div");
        c.className = "seletor-cor-caixa";
        c.setAttribute("role", "dialog");
        c.setAttribute("aria-label", botao.getAttribute("aria-label") ?? "Escolher cor");

        quadrado = document.createElement("div"); // saturação (→) e brilho (↑)
        quadrado.className = "seletor-cor-sv";
        cursor = document.createElement("div");
        cursor.className = "seletor-cor-cursor";
        quadrado.append(cursor);
        const sv = quadrado;
        function moverNoQuadrado(e: PointerEvent): void {
            const r = sv.getBoundingClientRect();
            hsv.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            hsv.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
            aplicarCor();
        }
        sv.addEventListener("pointerdown", (e) => {
            sv.setPointerCapture(e.pointerId);
            moverNoQuadrado(e);
        });
        sv.addEventListener("pointermove", (e) => {
            if (sv.hasPointerCapture(e.pointerId)) moverNoQuadrado(e);
        });

        matiz = document.createElement("input");
        matiz.type = "range";
        matiz.min = "0";
        matiz.max = "360";
        matiz.step = "1";
        matiz.className = "seletor-cor-matiz";
        matiz.setAttribute("aria-label", "Matiz");
        const mz = matiz;
        mz.addEventListener("input", () => {
            hsv.h = Number(mz.value);
            aplicarCor();
        });
        c.append(quadrado, matiz);

        if (comAlfa) {
            const linha = document.createElement("label");
            linha.className = "seletor-cor-linha";
            const nome = document.createElement("span");
            nome.textContent = "Transparência";
            valorAlfa = document.createElement("span");
            valorAlfa.className = "seletor-cor-valor";
            linha.append(nome, valorAlfa);
            faixaAlfa = document.createElement("input");
            faixaAlfa.type = "range";
            faixaAlfa.min = "0";
            faixaAlfa.max = String(TRANSPARENCIA_MAX);
            faixaAlfa.step = "5";
            faixaAlfa.className = "seletor-cor-alfa";
            faixaAlfa.setAttribute("aria-label", "Nível de transparência, em porcentagem (0% é opaco)");
            const fa = faixaAlfa;
            fa.addEventListener("input", () => {
                alfa = limitarAlfa(1 - Number(fa.value) / 100);
                mostrar();
                opcoes.aoMudarAlfa?.(alfa);
            });
            c.append(linha, faixaAlfa);
        }

        const rodape = document.createElement("div");
        rodape.className = "seletor-cor-rodape";
        codigo = document.createElement("input");
        codigo.type = "text";
        codigo.className = "seletor-cor-codigo";
        codigo.maxLength = 7;
        codigo.spellcheck = false;
        codigo.setAttribute("aria-label", "Código da cor (#rrggbb)");
        const cd = codigo;
        cd.addEventListener("change", () => {
            const texto = cd.value.trim();
            if (/^#?[0-9a-fA-F]{6}$/.test(texto)) {
                hsv = rgbParaHsv(...hexParaRgb(texto.startsWith("#") ? texto : `#${texto}`));
                aplicarCor();
            }
            cd.value = hexAtual();
        });
        rodape.append(codigo);
        c.append(rodape);
        return c;
    }

    // --- Abrir e fechar ---
    function posicionar(): void {
        if (!caixa) return;
        const b = botao.getBoundingClientRect();
        const w = caixa.offsetWidth || 220;
        const h = caixa.offsetHeight || 260;
        let esquerda: number;
        let topo: number;
        if (b.width >= 140) {
            // Botão largo (a barra de cor de uma janela): a caixa abre EMBAIXO dele (ou em cima, se não couber), sem cobrir o que está ao lado.
            esquerda = Math.min(Math.max(8, b.left), Math.max(8, window.innerWidth - w - 8));
            topo = b.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 6) : b.bottom + 6;
        } else {
            // Botão pequeno (de uma barra estreita): a caixa abre ao LADO dele (à direita; se não couber, à esquerda).
            esquerda = b.right + 10;
            if (esquerda + w > window.innerWidth - 8) esquerda = Math.max(8, b.left - w - 10);
            topo = Math.min(Math.max(8, b.top), Math.max(8, window.innerHeight - h - 8));
        }
        caixa.style.left = `${esquerda}px`;
        caixa.style.top = `${topo}px`;
    }
    function fora(e: PointerEvent): void {
        if (caixa && !caixa.contains(e.target as Node) && !botao.contains(e.target as Node)) fechar();
    }
    function teclas(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            e.stopPropagation(); // (o Esc só fecha a caixa: não faz mais nada por trás, como voltar a "Mover")
            e.preventDefault();
            fechar();
            botao.focus();
        }
    }
    function abrir(): void {
        caixaAberta?.fechar();
        atualizar();
        caixa = montarCaixa();
        document.body.append(caixa);
        mostrar();
        posicionar();
        botao.setAttribute("aria-expanded", "true");
        document.addEventListener("pointerdown", fora, true);
        document.addEventListener("keydown", teclas, true);
        window.addEventListener("resize", posicionar);
        caixaAberta = { fechar };
    }
    function fechar(): void {
        if (!caixa) return;
        caixa.remove();
        caixa = quadrado = cursor = matiz = faixaAlfa = valorAlfa = codigo = null;
        botao.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", fora, true);
        document.removeEventListener("keydown", teclas, true);
        window.removeEventListener("resize", posicionar);
        if (caixaAberta?.fechar === fechar) caixaAberta = null;
    }
    botao.addEventListener("click", () => (caixa ? fechar() : abrir()));

    function atualizar(): void {
        const hex = /^#[0-9a-fA-F]{6}$/.test(entrada.value) ? entrada.value.toLowerCase() : "#000000";
        if (hex !== hexAtual()) hsv = rgbParaHsv(...hexParaRgb(hex)); // (só relê se a cor mudou de fora: assim o matiz não "pula" nos cinzas)
        mostrar();
    }

    // Quem muda a cor POR CÓDIGO (clicar numa amostra, abrir um token para editar...) faz `entrada.value = "#..."`: o botão acompanha sozinho.
    const valorNativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") as PropertyDescriptor;
    Object.defineProperty(entrada, "value", {
        configurable: true,
        get() {
            return valorNativo.get?.call(entrada) as string;
        },
        set(novo: string) {
            valorNativo.set?.call(entrada, novo);
            atualizar();
        },
    });
    atualizar();

    return {
        atualizar,
        definirAlfa(novo) {
            alfa = limitarAlfa(novo);
            mostrar();
        },
        fechar,
    };
}

/** Troca a cara de TODOS os <input type="color"> de `raiz` que ainda não foram trocados (sem transparência: só a cor). Devolve quantos trocou. */
export function aplicarSeletoresDeCor(raiz: ParentNode = document): number {
    const campos = Array.from(raiz.querySelectorAll<HTMLInputElement>('input[type="color"]:not(.seletor-cor-nativo)'));
    for (const entrada of campos) criarSeletorDeCor({ entrada });
    return campos.length;
}
