// =====================================================================
// CAIXAS ARRASTÁVEIS: o chat, a barra de dados, a barra de Ferramentas, o painel de Desenho e a bolsa podem ser movidos pela tela.
//
// Como funciona: cada caixa continua POSICIONADA pelo CSS de sempre (cantos, recuos, deslizes...). O arrasto só soma um DESLOCAMENTO por
// cima, pela propriedade CSS `translate` (que é separada do `transform`: não atrapalha nada que já existe). Assim as regras de layout não
// precisam saber que a caixa foi movida, e "voltar ao lugar" é só zerar o deslocamento.
//
//   - Cada caixa tem a sua ALÇA (o cabeçalho, a borda de cima do chat...): puxar por ela arrasta; clicar nela continua clicando (só vira arrasto depois de
//     mover alguns pixels, e o clique que sobraria do arrasto é engolido).
//   - A caixa NUNCA sai da tela: as bordas da janela são PAREDES (ela bate e não passa; nenhuma parte fica escondida). Se a janela do navegador
//     encolhe, ou a caixa muda de tamanho (recolher, expandir, os dados empurrando o chat), ela volta para dentro.
//   - Caixas que NÃO PODEM SE BATER (`bloqueadores`: hoje a barra de Ferramentas, o painel de Desenho e o de Dados): as outras são paredes também.
//     Ao arrastar, a caixa para ao encostar numa delas e desliza ao longo da borda; se uma caixa cresce (expandir) ou a janela encolhe e ela passa a
//     bater em outra, ela se afasta para o lugar livre mais próximo.
//   - O deslocamento fica guardado no navegador (localStorage, "x,y") e volta ao recarregar. O index.html o aplica ANTES da primeira
//     pintura (senão a caixa apareceria no lugar de fábrica por um instante e pularia): as chaves são as mesmas, `tabuleirinho.pos.<id>`.
//   - `restaurarPosicoes()` leva TODAS de volta ao lugar de fábrica (o botão "Reorganizar telas" da barra de Ferramentas).
// =====================================================================

import { guardarPreferencia, lerPreferencia } from "./preferencias";

const PREFIXO_CHAVE = "tabuleirinho.pos."; // (o mesmo prefixo do script do index.html)
const DISTANCIA_MINIMA = 4; // px que o mouse precisa andar para um clique virar arrasto

export interface OpcoesArrasto {
    /** A caixa que anda. */
    elemento: HTMLElement;
    /** A caixa que vai para a FRENTE quando esta é agarrada, se for outra que não `elemento` (ex.: a coluna que guarda a bolsa: o `z-index` vale no nível dela). */
    camada?: HTMLElement;
    /** Onde se agarra (o cabeçalho, a abinha...). Pode ser mais de um. */
    alca: HTMLElement | HTMLElement[];
    /** Outras caixas presas a esta (ex.: a barra de dados, que fica pendurada na esquerda do chat): a parede vale para o CONJUNTO. */
    incluir?: HTMLElement[];
    /** As caixas em que esta NÃO pode bater (são paredes para ela). Chamada a cada movimento: devolve as outras caixas do grupo. */
    bloqueadores?: () => HTMLElement[];
    /** Partes da alça que NÃO arrastam (botões, campos...): o clique nelas é delas. Padrão: botões, campos e links. */
    ignorar?: (alvo: HTMLElement) => boolean;
    /** Devolve true quando a caixa não deve ser movida agora (ex.: a bolsa em tela cheia). */
    desligado?: () => boolean;
}

interface Arrastavel {
    restaurar(): void;
    reaplicar(): void;
}
const todas: Arrastavel[] = [];

// A ordem das caixas da frente para trás: a que a pessoa agarrou por último fica POR CIMA das outras (senão uma caixa arrastada para baixo da bolsa,
// por exemplo, ficaria com os botões inalcançáveis). Cada uma ganha um `z-index` de 10 a 10 + (quantas caixas há) - 1, acima do padrão (10) de quem
// nunca foi agarrado e abaixo das janelas (35 a 60).
const ordemDasCamadas: HTMLElement[] = [];
function trazerParaFrente(camada: HTMLElement): void {
    const posicao = ordemDasCamadas.indexOf(camada);
    if (posicao >= 0) ordemDasCamadas.splice(posicao, 1);
    ordemDasCamadas.push(camada);
    ordemDasCamadas.forEach((el, i) => (el.style.zIndex = String(11 + i)));
}

interface Retangulo {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Dois retângulos se sobrepõem de verdade? (Encostar na borda não conta; 0,5 px de tolerância.) */
function sobrepoe(a: Retangulo, b: Retangulo): boolean {
    return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
}

/**
 * Quanto a caixa (retângulo `r`, onde está AGORA) pode andar `d` pixels no eixo x ou y sem passar das paredes da janela nem bater nos
 * `obstaculos`: devolve o `d` já limitado (igual a `d` se o caminho está livre). Um obstáculo em que ela JÁ está batendo é ignorado, para ela
 * poder sair de dentro dele.
 */
function permitido(r: Retangulo, d: number, eixo: "x" | "y", obstaculos: Retangulo[]): number {
    const ini = eixo === "x" ? "left" : "top";
    const fim = eixo === "x" ? "right" : "bottom";
    const tela = eixo === "x" ? window.innerWidth : window.innerHeight;
    // As paredes da janela.
    if (d > 0) d = Math.min(d, tela - r[fim]);
    else d = Math.max(d, -r[ini]);
    // As outras caixas: só as que estão na "faixa" por onde ela passa (se não se cruzam no outro eixo, não há batida).
    for (const o of obstaculos) {
        const cruzaOutroEixo = eixo === "x" ? r.top < o.bottom - 0.5 && r.bottom > o.top + 0.5 : r.left < o.right - 0.5 && r.right > o.left + 0.5;
        if (!cruzaOutroEixo) continue;
        if (d > 0) {
            const folga = o[ini] - r[fim]; // quanto falta para encostar na borda da frente
            if (folga >= -0.5) d = Math.min(d, Math.max(folga, 0));
        } else if (d < 0) {
            const folga = o[fim] - r[ini];
            if (folga <= 0.5) d = Math.max(d, Math.min(folga, 0));
        }
    }
    return d;
}

/** Leva todas as caixas ao lugar de fábrica (e esquece as posições guardadas). */
export function restaurarPosicoes(): void {
    for (const a of todas) a.restaurar();
}

export function tornarArrastavel(opcoes: OpcoesArrasto): void {
    const { elemento } = opcoes;
    const camada = opcoes.camada ?? elemento;
    const chave = PREFIXO_CHAVE + elemento.id;
    const alcas = Array.isArray(opcoes.alca) ? opcoes.alca : [opcoes.alca];
    // Padrão: botões, campos e links DENTRO da alça são deles (a própria alça, mesmo sendo um botão como a abinha dos dados, arrasta).
    const ignorar =
        opcoes.ignorar ??
        ((alvo: HTMLElement) => {
            const interativo = alvo.closest<HTMLElement>("button, input, textarea, select, a");
            return interativo !== null && !alcas.includes(interativo);
        });

    // O deslocamento atual (em pixels, em relação ao lugar de fábrica).
    let x = 0;
    let y = 0;

    function aplicar(): void {
        elemento.style.translate = x === 0 && y === 0 ? "" : `${x}px ${y}px`;
    }

    function guardar(): void {
        guardarPreferencia(chave, x === 0 && y === 0 ? "" : `${x},${y}`);
    }

    /** O retângulo que tem de caber na tela: a caixa e as que estão presas a ela (as que estão escondidas ou sem tamanho não contam). */
    function conjunto(): { left: number; right: number; top: number; bottom: number } | null {
        let total: { left: number; right: number; top: number; bottom: number } | null = null;
        for (const el of [elemento, ...(opcoes.incluir ?? [])]) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            total = total
                ? { left: Math.min(total.left, r.left), right: Math.max(total.right, r.right), top: Math.min(total.top, r.top), bottom: Math.max(total.bottom, r.bottom) }
                : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }
        return total;
    }

    /**
     * Empurra a caixa para dentro da tela: as bordas da janela são paredes. Se ela for maior que a janela, vale o canto superior esquerdo
     * (o topo e a esquerda ficam à vista). Devolve true se precisou mexer.
     */
    function limitar(): boolean {
        const r = conjunto();
        if (!r) return false; // (escondida: não dá para medir)
        let dx = 0;
        let dy = 0;
        if (r.right > window.innerWidth) dx = window.innerWidth - r.right;
        if (r.left + dx < 0) dx = -r.left;
        if (r.bottom > window.innerHeight) dy = window.innerHeight - r.bottom;
        if (r.top + dy < 0) dy = -r.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return false;
        x += dx;
        y += dy;
        aplicar();
        return true;
    }

    // Lê o que ficou guardado ("x,y"; qualquer outra coisa é ignorada).
    const lido = (lerPreferencia(chave) ?? "").split(",").map(Number);
    if (lido.length === 2 && lido.every((n) => Number.isFinite(n))) {
        x = lido[0];
        y = lido[1];
        aplicar();
    }

    let comeco: { mouseX: number; mouseY: number; x: number; y: number; r0: Retangulo; alca: HTMLElement } | null = null;
    let arrastando = false; // passou da distância mínima: agora é arrasto de verdade
    let engolirClique = false;

    // O movimento e o soltar são ouvidos no DOCUMENTO inteiro enquanto o botão está apertado (não só dentro da alça): senão, num cabeçalho pequeno
    // (o da barra de Ferramentas, ou a faixa de 8 px do chat), o mouse saía da alça na primeira mexida rápida e o arrasto nem começava, com a
    // caixa parecendo "travada". O ponteiro só é CAPTURADO quando o arrasto começa de verdade: capturar já no clique mandaria o "click" para a
    // alça em vez de para o título ou botão em que se clicou (e o duplo clique no cabeçalho pararia de funcionar).
    function aoMover(e: PointerEvent): void {
        if (!comeco) return;
        const dx = e.clientX - comeco.mouseX;
        const dy = e.clientY - comeco.mouseY;
        if (!arrastando) {
            if (Math.hypot(dx, dy) < DISTANCIA_MINIMA) return;
            arrastando = true;
            try {
                comeco.alca.setPointerCapture(e.pointerId); // o arrasto continua mesmo se o mouse sair da janela do navegador
            } catch {
                /* (o ponteiro pode já ter terminado: tudo bem) */
            }
            elemento.classList.add("arrastando-caixa");
        }
        // Anda primeiro na horizontal e depois na vertical, cada uma parando nas paredes e nas outras caixas (assim, ao bater numa caixa a
        // sua DESLIZA ao longo da borda, em vez de travar). `r0` é onde a caixa estava ao agarrar; `ret` dá onde ela está com o deslocamento (ox, oy).
        const { r0 } = comeco;
        const ret = (ox: number, oy: number): Retangulo => ({
            left: r0.left + ox - comeco!.x,
            right: r0.right + ox - comeco!.x,
            top: r0.top + oy - comeco!.y,
            bottom: r0.bottom + oy - comeco!.y,
        });
        const obstaculos = rectsDosBloqueadores();
        x += permitido(ret(x, y), comeco.x + dx - x, "x", obstaculos);
        y += permitido(ret(x, y), comeco.y + dy - y, "y", obstaculos);
        aplicar();
    }

    function soltou(): void {
        document.removeEventListener("pointermove", aoMover);
        document.removeEventListener("pointerup", soltou);
        document.removeEventListener("pointercancel", soltou);
        if (!comeco) return;
        comeco = null;
        if (arrastando) {
            arrastando = false;
            elemento.classList.remove("arrastando-caixa");
            guardar();
            // O navegador ainda dispara um "click" depois de soltar (ex.: no botão ▴, que fica dentro do cabeçalho): este não vale.
            engolirClique = true;
            setTimeout(() => (engolirClique = false), 0);
        }
    }

    for (const alca of alcas) {
        alca.classList.add("alca-arrastar");
        alca.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || opcoes.desligado?.()) return;
            const alvo = e.target;
            if (alvo instanceof HTMLElement && ignorar(alvo)) return;
            trazerParaFrente(camada); // a caixa agarrada passa por cima das outras
            const r = elemento.getBoundingClientRect();
            comeco = { mouseX: e.clientX, mouseY: e.clientY, x, y, r0: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, alca };
            arrastando = false;
            document.addEventListener("pointermove", aoMover);
            document.addEventListener("pointerup", soltou);
            document.addEventListener("pointercancel", soltou);
        });
        alca.addEventListener("click", (e) => {
            if (engolirClique) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        }, true);
    }

    /** Os retângulos das outras caixas do grupo (as escondidas ou sem tamanho não contam). */
    function rectsDosBloqueadores(): Retangulo[] {
        return (opcoes.bloqueadores?.() ?? [])
            .filter((el) => el !== elemento)
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0);
    }

    /**
     * Se a caixa está BATENDO em outra (ela cresceu, a janela encolheu, a posição guardada não cabe mais...), leva-a para o lugar livre mais
     * próximo: encostada ao lado, em cima ou embaixo da outra, dentro das paredes e sem bater em nenhuma. Sem lugar livre, deixa como está.
     */
    function afastarDasOutras(): boolean {
        const obstaculos = rectsDosBloqueadores();
        const r = elemento.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || !obstaculos.some((o) => sobrepoe(r, o))) return false;
        const candidatos: { dx: number; dy: number }[] = [];
        for (const o of obstaculos) {
            candidatos.push({ dx: o.left - r.right, dy: 0 }, { dx: o.right - r.left, dy: 0 }, { dx: 0, dy: o.top - r.bottom }, { dx: 0, dy: o.bottom - r.top });
        }
        const livres = candidatos
            .map((c) => ({ ...c, quadro: { left: r.left + c.dx, right: r.right + c.dx, top: r.top + c.dy, bottom: r.bottom + c.dy } }))
            .filter((c) => c.quadro.left >= -0.5 && c.quadro.top >= -0.5 && c.quadro.right <= window.innerWidth + 0.5 && c.quadro.bottom <= window.innerHeight + 0.5)
            .filter((c) => !obstaculos.some((o) => sobrepoe(c.quadro, o)))
            .sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
        if (livres.length === 0) return false;
        x += livres[0].dx;
        y += livres[0].dy;
        aplicar();
        return true;
    }

    /** Confere as paredes e as outras caixas e, se a caixa teve de andar, guarda o lugar novo. */
    function conferir(): void {
        const pelaParede = limitar();
        const pelasOutras = afastarDasOutras();
        if (pelaParede || pelasOutras) guardar();
    }
    window.addEventListener("resize", conferir);
    // A caixa mudou de tamanho (recolher, expandir...), ou terminou de deslizar (o chat, quando os dados o empurram): confere as paredes de novo.
    new ResizeObserver(conferir).observe(elemento);
    elemento.addEventListener("transitionend", conferir);
    requestAnimationFrame(conferir); // ao carregar: o lugar guardado pode não caber mais (outra janela, outro tamanho)

    todas.push({
        restaurar() {
            x = 0;
            y = 0;
            aplicar();
            guardar();
        },
        reaplicar: conferir,
    });
}
