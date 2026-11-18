// =====================================================================
// PAINEL DO FOG (HTML; 4ª barra da pilha da esquerda; SÓ DO MESTRE): liga o fog do mapa, escolhe o pincel (revelar ou cobrir) e o formato e o tamanho dele.
// A marcação e o CSS ficam no index.html e em css/fog.css; quem manda ao servidor é o main.ts (callbacks).
// =====================================================================

import { estado } from "../estado";
import { ESCALA_DO_PINCEL } from "../config";
import { casasDaForma, contornoDasCasas, type FormaDeFog } from "../fog";

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
    const ESCALA = ESCALA_DO_PINCEL;

    ativo.addEventListener("change", () => opcoes.aoAlternar(ativo.checked));
    const altura = pegar<HTMLInputElement>("fog-altura");
    const alturaValor = pegar("fog-altura-valor");
    const proporcional = pegar<HTMLButtonElement>("fog-proporcional");
    let juntos = true; // largura e altura mudam juntas (padrão)
    // Os deslizantes guardam só a POSIÇÃO na escala (0 a N−1); o tamanho de verdade (a metade do lado, em casas) fica nestas duas variáveis.
    let larguraAtual = 2;
    let alturaAtual = 2;
    for (const campo of [raio, altura]) {
        campo.min = "0";
        campo.max = String(ESCALA.length - 1);
        campo.step = "1";
    }
    /** A posição, na escala, do valor mais perto de `v`. */
    const indiceDe = (v: number): number => {
        let melhor = 0;
        for (let i = 1; i < ESCALA.length; i++) if (Math.abs(ESCALA[i] - v) < Math.abs(ESCALA[melhor] - v)) melhor = i;
        return melhor;
    };
    /** O valor válido (da escala) mais perto de `v`. */
    const limitar = (v: number): number => ESCALA[indiceDe(v)];
    /** Um passo para cima (+1) ou para baixo (−1) NA ESCALA (nos pequenos o passo é fino; nos grandes, grande). */
    const passo = (v: number, direcao: 1 | -1): number => ESCALA[Math.min(ESCALA.length - 1, Math.max(0, indiceDe(v) + direcao))];
    const texto = (v: number): string => String(v).replace(".", ",");
    /** Redesenha a PRÉVIA: o formato do pincel, na proporção largura × altura (o maior lado ocupa o quadradinho). Por casa vira um retângulo de casas inteiras; em "Área" mostra uma caixa tracejada. */
    function desenharPrevia(): void {
        const larg = larguraAtual;
        const alt = alturaAtual;
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
        let contorno: SVGElement | null = null; // (por casa: o traço é um desenho à parte, só com o contorno de FORA)
        if (porCasa && formaAtual !== "quadrado") {
            // Por casa: o círculo e o triângulo são feitos de CASAS inteiras (a mesma conta do pincel e do servidor), com só o contorno externo (sem as linhas entre as casas).
            figura = document.createElementNS(NS, "path");
            const ccx = nx % 2 === 1 ? 0.5 : 0; // (lado ímpar: o centro é o meio de uma casa; par: o canto entre casas)
            const ccy = ny % 2 === 1 ? 0.5 : 0;
            const fileiras = casasDaForma(formaAtual, ccx, ccy, nx / 2, ny / 2);
            let d = "";
            for (const f of fileiras) d += `M${cx + (f.col - ccx) * escala} ${cy + (f.row - ccy) * escala}h${f.largura * escala}v${escala}h${-f.largura * escala}z`;
            figura.setAttribute("d", d);
            let traco = "";
            for (const s of contornoDasCasas(fileiras)) traco += `M${cx + (s.x1 - ccx) * escala} ${cy + (s.y1 - ccy) * escala}L${cx + (s.x2 - ccx) * escala} ${cy + (s.y2 - ccy) * escala}`;
            contorno = document.createElementNS(NS, "path");
            contorno.setAttribute("d", traco);
            contorno.setAttribute("fill", "none");
            contorno.setAttribute("stroke", cor);
            contorno.setAttribute("stroke-width", "2");
            contorno.setAttribute("stroke-linecap", "square"); // (as quinas se encontram sem falha)
        } else if (formaAtual === "circulo") {
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
        figura.setAttribute("stroke", contorno ? "none" : cor);
        figura.setAttribute("stroke-width", "2");
        svg.appendChild(figura);
        if (contorno) svg.appendChild(contorno);
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
        // (no Puxar a caixa vem do arrasto no mapa: sem texto de dica embaixo da prévia)
        previaTexto.textContent = modoDeRevelar === "area" ? "" : `${casas(porCasa ? nx : nx)} × ${casas(porCasa ? ny : ny)} casas`;
    }
    /** Põe a largura e a altura (já limitadas) nos campos, nos números e no pincel. */
    function pôrTamanho(largura: number, alto: number): void {
        const l = limitar(largura);
        const a = limitar(alto);
        larguraAtual = l;
        alturaAtual = a;
        raio.value = String(indiceDe(l));
        altura.value = String(indiceDe(a));
        // (o valor do campo é só a posição na escala: quem usa leitor de tela ouve o tamanho de verdade, em casas)
        raio.setAttribute("aria-valuetext", `${texto(l * 2)} casas de largura`);
        altura.setAttribute("aria-valuetext", `${texto(a * 2)} casas de altura`);
        raioValor.textContent = texto(l);
        alturaValor.textContent = texto(a);
        for (const b of predefinidos) b.classList.toggle("ativo", Number(b.dataset.raio) === l && l === a);
        opcoes.aoMudarRaio(l, a);
        desenharPrevia();
    }
    /** Mudou a LARGURA (ou a ALTURA) para `v`: com "Proporcional" ligado a outra acompanha. */
    const mudouLargura = (v: number): void => pôrTamanho(v, juntos ? v : alturaAtual);
    const mudouAltura = (v: number): void => pôrTamanho(juntos ? v : larguraAtual, v);
    raio.addEventListener("input", () => mudouLargura(ESCALA[Number(raio.value)]));
    altura.addEventListener("input", () => mudouAltura(ESCALA[Number(altura.value)]));
    menos.addEventListener("click", () => mudouLargura(passo(larguraAtual, -1)));
    mais.addEventListener("click", () => mudouLargura(passo(larguraAtual, 1)));
    pegar("fog-altura-menos").addEventListener("click", () => mudouAltura(passo(alturaAtual, -1)));
    pegar("fog-altura-mais").addEventListener("click", () => mudouAltura(passo(alturaAtual, 1)));
    for (const b of predefinidos) b.addEventListener("click", () => pôrTamanho(Number(b.dataset.raio), Number(b.dataset.raio))); // (os tamanhos prontos valem para os dois)
    proporcional.addEventListener("click", () => {
        juntos = !juntos;
        proporcional.classList.toggle("ativo", juntos);
        proporcional.setAttribute("aria-pressed", String(juntos));
        if (juntos) pôrTamanho(larguraAtual, larguraAtual); // (ao religar, a altura volta a igualar a largura)
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
    pôrTamanho(larguraAtual, alturaAtual);

    // O deslizante da ALTURA é vertical (o próprio <input type="range"> girado por `writing-mode`). Se o navegador for antigo e não girar, ele ficaria DEITADO dentro de uma coluna
    // estreita: nesse caso a altura vira uma segunda linha horizontal, embaixo da largura (a classe `altura-deitada` refaz o encaixe no css/fog.css).
    const testeVertical = document.createElement("input");
    testeVertical.type = "range";
    testeVertical.style.cssText = "writing-mode:vertical-lr;position:absolute;left:-9999px;visibility:hidden"; // (só para medir; sai logo)
    document.body.appendChild(testeVertical);
    const giraSozinho = testeVertical.offsetHeight > testeVertical.offsetWidth;
    testeVertical.remove();
    pegar("fog-previa-grade").classList.toggle("altura-deitada", !giraSozinho);

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
