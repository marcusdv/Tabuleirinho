// =====================================================================
// PAINEL DO FOG (HTML; 4ª barra da pilha da esquerda; SÓ DO MESTRE): liga o fog do mapa, escolhe o pincel (revelar ou cobrir) e o formato e o tamanho dele.
// A marcação e o CSS ficam no index.html e em css/fog.css; quem manda ao servidor é o main.ts (callbacks).
// =====================================================================

import { estado } from "../estado";
import { RAIO_MAX_FOG, type FormaDeFog } from "../fog";

export type ModoDoPincel = "cobrir" | "revelar";

export interface OpcoesPainelFog {
    /** Ligou ou desligou o fog do mapa atual. */
    aoAlternar(ativo: boolean): void;
    /** Escolheu o pincel (ou null: voltou a Mover). */
    aoEscolher(modo: ModoDoPincel | null): void;
    /** Escolheu o formato do pincel. */
    aoEscolherForma(forma: FormaDeFog): void;
    /** Escolheu "livre" (padrão) ou "casa" (por tile: casas inteiras da grade). */
    aoEscolherAlinhamento(alinhamento: "livre" | "casa" | "area"): void;
    /** Mudou a largura ou a altura do pincel (as metades, em casas). */
    aoMudarRaio(raioX: number, raioY: number): void;
}

export interface PainelFog {
    /** Refaz o que depende do estado (a caixa "Fog neste mapa" e se os botões do pincel podem ser usados). */
    atualizar(): void;
    /** Destaca o pincel escolhido (null = nenhum). */
    marcar(modo: ModoDoPincel | null): void;
}

const pegar = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function criarPainelFog(opcoes: OpcoesPainelFog): PainelFog {
    const ativo = pegar<HTMLInputElement>("fog-ativo");
    const raio = pegar<HTMLInputElement>("fog-raio");
    const raioValor = pegar("fog-raio-valor");
    const botoes = [...document.querySelectorAll<HTMLButtonElement>("#fog-botoes button")];
    let atual: ModoDoPincel | null = null;
    let formaAtual: FormaDeFog = "circulo";
    let modoDeRevelar: "livre" | "casa" | "area" = "livre";
    const previa = pegar("fog-previa");
    const previaTexto = pegar("fog-previa-texto");
    const NS = "http://www.w3.org/2000/svg";
    const LADO_PREVIA = 112; // o quadradinho da prévia, em px

    const formas = [...document.querySelectorAll<HTMLButtonElement>("#fog-formas button")];
    const predefinidos = [...document.querySelectorAll<HTMLButtonElement>("#fog-tamanhos button")];
    const menos = pegar<HTMLButtonElement>("fog-raio-menos");
    const mais = pegar<HTMLButtonElement>("fog-raio-mais");
    const PASSO = 0.5;
    const raioMax = Math.min(Number(raio.max), RAIO_MAX_FOG);

    ativo.addEventListener("change", () => opcoes.aoAlternar(ativo.checked));
    const altura = pegar<HTMLInputElement>("fog-altura");
    const alturaValor = pegar("fog-altura-valor");
    const proporcional = pegar<HTMLButtonElement>("fog-proporcional");
    let juntos = true; // largura e altura mudam juntas (padrão)
    const limitar = (v: number): number => Math.min(raioMax, Math.max(Number(raio.min), v));
    const texto = (v: number): string => String(v).replace(".", ",");
    /** Redesenha a PRÉVIA: o formato do pincel, na proporção largura × altura (o maior lado ocupa o quadradinho). Por casa vira um retângulo de casas inteiras; em "Área" mostra uma caixa tracejada. */
    function desenharPrevia(): void {
        const larg = Number(raio.value);
        const alt = Number(altura.value);
        const porCasa = modoDeRevelar === "casa";
        const nx = porCasa ? Math.max(1, Math.round(larg * 2)) : larg * 2;
        const ny = porCasa ? Math.max(1, Math.round(alt * 2)) : alt * 2;
        // A GRADE da prévia: cada quadradinho é 1 CASA. A escala mostra o pincel mais 1 casa de folga de cada lado (no mínimo 4 casas no quadradinho).
        const emArea = modoDeRevelar === "area";
        const casasVisiveis = Math.max(4, Math.ceil(Math.max(nx, ny)) + 2);
        const escala = emArea ? 14 : LADO_PREVIA / casasVisiveis;
        const w = emArea ? 56 : nx * escala;
        const h = emArea ? 42 : ny * escala;
        const cx = LADO_PREVIA / 2;
        const cy = LADO_PREVIA / 2;
        const cor = atual === "cobrir" ? "#ff7a45" : "#ffd23f";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${LADO_PREVIA} ${LADO_PREVIA}`);
        svg.setAttribute("width", String(LADO_PREVIA));
        svg.setAttribute("height", String(LADO_PREVIA));
        // As linhas passam pelas BORDAS do pincel (assim dá para contar as casas dele). Com casas muito pequenas, só uma linha a cada 5.
        const grade = document.createElementNS(NS, "path");
        const passo = escala < 4 ? 5 * escala : escala;
        const ox = cx - w / 2;
        const oy = cy - h / 2;
        let tracos = "";
        for (let x = ox - Math.floor(ox / passo) * passo; x <= LADO_PREVIA; x += passo) tracos += `M${x} 0V${LADO_PREVIA}`;
        for (let y = oy - Math.floor(oy / passo) * passo; y <= LADO_PREVIA; y += passo) tracos += `M0 ${y}H${LADO_PREVIA}`;
        grade.setAttribute("d", tracos);
        grade.setAttribute("stroke", "#ffffff");
        grade.setAttribute("stroke-opacity", "0.13");
        grade.setAttribute("stroke-width", "1");
        svg.appendChild(grade);
        let figura: SVGElement;
        if (formaAtual === "circulo") {
            figura = document.createElementNS(NS, "ellipse");
            figura.setAttribute("cx", String(cx));
            figura.setAttribute("cy", String(cy));
            figura.setAttribute("rx", String(w / 2));
            figura.setAttribute("ry", String(h / 2));
        } else if (formaAtual === "triangulo") {
            figura = document.createElementNS(NS, "polygon");
            figura.setAttribute("points", `${cx},${cy - h / 2} ${cx + w / 2},${cy + h / 2} ${cx - w / 2},${cy + h / 2}`);
        } else {
            figura = document.createElementNS(NS, "rect");
            figura.setAttribute("x", String(cx - w / 2));
            figura.setAttribute("y", String(cy - h / 2));
            figura.setAttribute("width", String(w));
            figura.setAttribute("height", String(h));
        }
        figura.setAttribute("fill", cor);
        figura.setAttribute("fill-opacity", "0.25");
        figura.setAttribute("stroke", cor);
        figura.setAttribute("stroke-width", "2");
        svg.appendChild(figura);
        if (emArea) {
            // Na Área, a caixa arrastada aparece tracejada em volta do formato.
            const caixa = document.createElementNS(NS, "rect");
            caixa.setAttribute("x", String(cx - w / 2));
            caixa.setAttribute("y", String(cy - h / 2));
            caixa.setAttribute("width", String(w));
            caixa.setAttribute("height", String(h));
            caixa.setAttribute("fill", "none");
            caixa.setAttribute("stroke", cor);
            caixa.setAttribute("stroke-width", "1");
            caixa.setAttribute("stroke-dasharray", "4 3");
            svg.appendChild(caixa);
        }
        previa.replaceChildren(svg);
        const casas = (v: number): string => String(v).replace(".", ",");
        previaTexto.textContent = modoDeRevelar === "area" ? "Arraste uma caixa no mapa (o formato cabe nela)" : `${casas(porCasa ? nx : nx)} × ${casas(porCasa ? ny : ny)} casas`;
    }
    /** Põe a largura e a altura (já limitadas) nos campos, nos números e no pincel. */
    function pôrTamanho(largura: number, alto: number): void {
        const l = limitar(largura);
        const a = limitar(alto);
        raio.value = String(l);
        altura.value = String(a);
        raioValor.textContent = texto(l);
        alturaValor.textContent = texto(a);
        for (const b of predefinidos) b.classList.toggle("ativo", Number(b.dataset.raio) === l && l === a);
        opcoes.aoMudarRaio(l, a);
        desenharPrevia();
    }
    /** Mudou a LARGURA (ou a ALTURA) para `v`: com "Proporcional" ligado a outra acompanha. */
    const mudouLargura = (v: number): void => pôrTamanho(v, juntos ? v : Number(altura.value));
    const mudouAltura = (v: number): void => pôrTamanho(juntos ? v : Number(raio.value), v);
    raio.addEventListener("input", () => mudouLargura(Number(raio.value)));
    altura.addEventListener("input", () => mudouAltura(Number(altura.value)));
    menos.addEventListener("click", () => mudouLargura(Number(raio.value) - PASSO));
    mais.addEventListener("click", () => mudouLargura(Number(raio.value) + PASSO));
    pegar("fog-altura-menos").addEventListener("click", () => mudouAltura(Number(altura.value) - PASSO));
    pegar("fog-altura-mais").addEventListener("click", () => mudouAltura(Number(altura.value) + PASSO));
    for (const b of predefinidos) b.addEventListener("click", () => pôrTamanho(Number(b.dataset.raio), Number(b.dataset.raio))); // (os tamanhos prontos valem para os dois)
    proporcional.addEventListener("click", () => {
        juntos = !juntos;
        proporcional.classList.toggle("ativo", juntos);
        proporcional.setAttribute("aria-pressed", String(juntos));
        if (juntos) pôrTamanho(Number(raio.value), Number(raio.value)); // (ao religar, a altura volta a igualar a largura)
    });
    const alinhamentos = [...document.querySelectorAll<HTMLButtonElement>("#fog-alinhamento button")];
    for (const b of alinhamentos) {
        b.addEventListener("click", () => {
            for (const o of alinhamentos) {
                o.classList.toggle("ativo", o === b);
                o.setAttribute("aria-pressed", String(o === b));
            }
            // (por casa, o formato é sempre o quadrado: os botões de formato ficam travados)
            const modo = b.dataset.alinhamento as "livre" | "casa" | "area";
            modoDeRevelar = modo;
            desenharPrevia();
                        opcoes.aoEscolherAlinhamento(modo);
            if (atual === null && estado.fog.ativo) opcoes.aoEscolher("revelar"); // (sem pincel escolhido, usar um modo já liga o Revelar)
        });
    }
    for (const b of formas) {
        b.addEventListener("click", () => {
            for (const o of formas) {
                o.classList.toggle("ativo", o === b);
                o.setAttribute("aria-pressed", String(o === b));
            }
            formaAtual = b.dataset.forma as FormaDeFog;
            desenharPrevia();
            opcoes.aoEscolherForma(formaAtual);
        });
    }
    for (const b of botoes) {
        // Clicar no pincel que já está ligado o desliga (volta a Mover), como nas outras ferramentas.
        b.addEventListener("click", () => opcoes.aoEscolher(atual === b.dataset.fog ? null : (b.dataset.fog as ModoDoPincel)));
    }
    pôrTamanho(Number(raio.value), Number(altura.value));

    function atualizar(): void {
        ativo.checked = estado.fog.ativo;
        for (const b of botoes) b.disabled = !estado.fog.ativo;
    }
    atualizar();

    return {
        atualizar,
        marcar(modo) {
            atual = modo;
            desenharPrevia(); // (a cor da prévia segue o pincel: amarelo revela, laranja cobre)
            for (const b of botoes) {
                const ligado = b.dataset.fog === modo;
                b.classList.toggle("ativo", ligado);
                b.setAttribute("aria-pressed", String(ligado));
            }
        },
    };
}
