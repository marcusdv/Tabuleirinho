// =====================================================================
// O PAINEL DE ÁREA (HTML em index.html, `#area`; 2ª barra da pilha da esquerda): mostra uma PRÉVIA da área numa grade pequena (no topo) e escolhe a FORMA (cone, linha, esfera, cubo, emanação),
// o TAMANHO (em metros, com os tamanhos prontos do livro, numa linha só), a TRANSPARÊNCIA do preenchimento (0% a 99%) e a COR, que vem de uma paleta PRÓPRIA da Área, separada da do Desenho.
// Tem o botão "Limpar áreas". Quem liga a ferramenta ao mapa é o main.ts (callbacks); aqui moram só o desenho do painel e o que fica guardado no navegador (forma, tamanho de cada forma, cor e transparência).
// =====================================================================

import { casasDaArea, casasParaMetros, chaveDaCasa, conjuntoDeCasas, metrosParaCasas, precisaDeDirecao, type DadosDaArea, type FormaDeArea } from "../areas";
import { ALFA_MAX_AREA, ALFA_MIN_AREA, ALFA_PREENCHIMENTO_AREA, CHAVE_AREA_ALFA, CHAVE_AREA_COR, CHAVE_AREA_FORMA, CHAVE_AREA_RECENTES, CHAVE_AREA_TAMANHO, COR_INICIAL_AREA, CORES_FIXAS_DESENHO, CORES_RECENTES_INICIAIS, DADOS_DAS_FORMAS_DE_AREA, FORMAS_DE_AREA, MAX_TAMANHO_AREA } from "../config";
import { criarSeletorDeCor } from "./seletorDeCor";
import { estado } from "../estado";
import { guardarPreferencia, lerPreferencia } from "./preferencias";

export interface OpcoesPainelArea {
    /** Clicou no botão de uma forma (o main liga a ferramenta com ela; clicar na que já está ligada volta para "Mover"). */
    aoEscolherForma(forma: FormaDeArea): void;
    /** A forma mudou (ao abrir o site, ou por outro caminho que não o botão): a ferramenta se ajusta. */
    aoMudarForma(forma: FormaDeArea): void;
    /** O tamanho (em casas) da forma atual mudou. */
    aoMudarTamanho(casas: number): void;
    /** A transparência mudou: a nova opacidade do preenchimento (ALFA_MIN_AREA a ALFA_MAX_AREA). Também vale ao abrir o site. */
    aoMudarAlfa(alfa: number): void;
    /** A cor da Área mudou (0xRRGGBB). Também vale ao abrir o site. */
    aoMudarCor(cor: number): void;
    /** Clicou em "Limpar áreas". */
    aoLimpar(): void;
}

export interface PainelArea {
    /** A forma escolhida agora. */
    readonly forma: FormaDeArea;
    /** O tamanho (em casas) da forma escolhida. */
    readonly casas: number;
    /** Escolhe a forma pelo código (o menu do botão direito): só muda o painel e chama `aoMudarForma`. */
    definirForma(forma: FormaDeArea): void;
    /** Escolhe o tamanho (em casas) da forma atual (as áreas rápidas do menu do botão direito). */
    definirTamanho(casas: number): void;
    /** O tamanho guardado de uma forma, em casas. */
    tamanhoDe(forma: FormaDeArea): number;
    /** A ferramenta de área está ligada? (o botão da forma escolhida fica dourado) */
    marcar(ligada: boolean): void;
    /** A opacidade do preenchimento escolhida no painel. */
    readonly alfa: number;
    /** A cor escolhida na paleta da Área (0xRRGGBB). */
    readonly cor: number;
    /** Uma área foi fixada com esta cor: ela vai para a frente da pilha de cores recentes. */
    usarCor(cor: number): void;
    /** Atualiza o que depende do estado (o botão "Limpar áreas" só vale com áreas no mapa). */
    atualizar(): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

const corCss = (cor: number): string => `#${cor.toString(16).padStart(6, "0")}`;
/** "4,5" (com vírgula, no padrão do livro em português). */
const comVirgula = (metros: number): string => metros.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function criarPainelArea(opcoes: OpcoesPainelArea): PainelArea {
    const caixaDasFormas = pegar("area-formas");
    const titulo = pegar("area-medida-titulo");
    const campo = pegar<HTMLInputElement>("area-metros");
    const menos = pegar<HTMLButtonElement>("area-menos");
    const mais = pegar<HTMLButtonElement>("area-mais");
    const amostras = pegar("area-amostras");
    const seletor = pegar<HTMLInputElement>("area-cor");
    const prontos = pegar("area-prontos");
    const faixaTransparencia = pegar<HTMLInputElement>("area-transparencia");
    const valorTransparencia = pegar<HTMLOutputElement>("area-transparencia-valor");
    const previa = pegar<HTMLCanvasElement>("area-previa");
    const dica = pegar("area-dica");
    const limpar = pegar<HTMLButtonElement>("area-limpar");

    // O que estava guardado: a forma e o tamanho de cada forma (conferidos: o armazenamento pode estar estragado).
    const guardada = lerPreferencia(CHAVE_AREA_FORMA);
    let forma: FormaDeArea = (FORMAS_DE_AREA as readonly string[]).includes(guardada ?? "") ? (guardada as FormaDeArea) : "cone";
    const tamanhos = {} as Record<FormaDeArea, number>;
    for (const f of FORMAS_DE_AREA) {
        const valor = Number(lerPreferencia(CHAVE_AREA_TAMANHO + f));
        tamanhos[f] = Number.isInteger(valor) && valor >= 1 && valor <= MAX_TAMANHO_AREA ? valor : DADOS_DAS_FORMAS_DE_AREA[f].padrao;
    }
    // A cor (lembrada): a paleta da Área é PRÓPRIA (as recentes começam iguais às do Desenho, mas daí em diante são separadas).
    const corGuardada = lerPreferencia(CHAVE_AREA_COR);
    let cor = corGuardada !== null && /^#[0-9a-f]{6}$/i.test(corGuardada) ? parseInt(corGuardada.slice(1), 16) : COR_INICIAL_AREA;
    // As cores RECENTES também são lembradas (conferidas uma a uma); a cor atual sempre entra na pilha, para voltar MARCADA na paleta depois de recarregar (antes a pilha recomeçava do zero e uma cor livre escolhida parecia esquecida).
    const recentesGuardadas = (lerPreferencia(CHAVE_AREA_RECENTES) ?? "").split(",").filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => parseInt(c.slice(1), 16));
    const recentes = (recentesGuardadas.length > 0 ? recentesGuardadas : [...CORES_RECENTES_INICIAIS]).slice(0, CORES_RECENTES_INICIAIS.length);
    while (recentes.length < CORES_RECENTES_INICIAIS.length) recentes.push(CORES_RECENTES_INICIAIS[recentes.length]);
    if (!recentes.includes(cor) && !CORES_FIXAS_DESENHO.includes(cor)) {
        recentes.unshift(cor);
        recentes.length = CORES_RECENTES_INICIAIS.length;
    }
    // A opacidade do preenchimento (lembrada; o que vem do armazenamento é conferido).
    const alfaGuardada = Number(lerPreferencia(CHAVE_AREA_ALFA));
    let alfa = lerPreferencia(CHAVE_AREA_ALFA) !== null && Number.isFinite(alfaGuardada) && alfaGuardada >= ALFA_MIN_AREA && alfaGuardada <= ALFA_MAX_AREA ? alfaGuardada : ALFA_PREENCHIMENTO_AREA;
    let ligada = false;

    // --- Os botões das formas (criados da tabela do config.ts) ---
    const botoesDasFormas = new Map<FormaDeArea, HTMLButtonElement>();
    const icones: Record<FormaDeArea, string> = { cone: "icone-cone", linha: "icone-linha", circulo: "icone-circulo", cubo: "icone-quadrado", emanacao: "icone-emanacao" };
    for (const f of FORMAS_DE_AREA) {
        const dados = DADOS_DAS_FORMAS_DE_AREA[f];
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "botao-largo";
        botao.dataset.forma = f;
        botao.title = dados.dica;
        botao.setAttribute("aria-pressed", "false");
        const icone = document.createElement("span");
        icone.className = `icone-svg ${icones[f]}`;
        icone.setAttribute("aria-hidden", "true");
        botao.append(icone, dados.nome); // (o nome entra como TEXTO)
        botao.addEventListener("click", () => opcoes.aoEscolherForma(f));
        caixaDasFormas.append(botao);
        botoesDasFormas.set(f, botao);
    }

    // --- O tamanho ---
    function mudarTamanho(casas: number): void {
        const novo = Math.min(MAX_TAMANHO_AREA, Math.max(1, Math.round(casas)));
        tamanhos[forma] = novo;
        guardarPreferencia(CHAVE_AREA_TAMANHO + forma, String(novo));
        opcoes.aoMudarTamanho(novo);
        mostrarTamanho();
    }
    menos.addEventListener("click", () => mudarTamanho(tamanhos[forma] - 1));
    mais.addEventListener("click", () => mudarTamanho(tamanhos[forma] + 1));
    // Digitar os metros: vale ao sair do campo ou apertar Enter (arredonda para casas inteiras e mostra o valor certo).
    campo.addEventListener("change", () => mudarTamanho(metrosParaCasas(Number(campo.value.replace(",", ".")))));
    campo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") campo.blur();
        e.stopPropagation(); // (digitando aqui, as teclas não são atalhos do mapa)
    });

    // --- A transparência (como no seletor de cor do app: 0% é opaco) ---
    function mostrarTransparencia(): void {
        const transparencia = Math.round((1 - alfa) * 100);
        faixaTransparencia.value = String(transparencia);
        valorTransparencia.textContent = `${transparencia}%`;
    }
    faixaTransparencia.addEventListener("input", () => {
        alfa = Math.min(ALFA_MAX_AREA, Math.max(ALFA_MIN_AREA, Math.round((1 - Number(faixaTransparencia.value) / 100) * 100) / 100));
        guardarPreferencia(CHAVE_AREA_ALFA, String(alfa));
        mostrarTransparencia();
        desenharPrevia();
        opcoes.aoMudarAlfa(alfa);
    });

    // --- A cor: a pilha das últimas usadas + branco e preto fixos + o seletor livre ---
    function criarAmostra(c: number): HTMLButtonElement {
        const amostra = document.createElement("button");
        amostra.className = "amostra";
        amostra.classList.toggle("escolhida", c === cor);
        amostra.dataset.cor = corCss(c);
        amostra.style.background = corCss(c);
        amostra.title = corCss(c);
        amostra.setAttribute("aria-label", `Cor ${corCss(c)}`);
        amostra.addEventListener("click", () => escolherCor(c));
        return amostra;
    }
    const renderizarAmostras = (): void => amostras.replaceChildren(...[...recentes, ...CORES_FIXAS_DESENHO].map(criarAmostra));
    function escolherCor(nova: number): void {
        cor = nova;
        seletor.value = corCss(nova);
        seletorDeCor.atualizar();
        renderizarAmostras();
        guardarPreferencia(CHAVE_AREA_COR, corCss(nova));
        desenharPrevia();
        opcoes.aoMudarCor(nova);
    }
    const seletorDeCor = criarSeletorDeCor({ entrada: seletor }); // (o mesmo seletor do site, sem transparência: ela é o deslizante acima)
    seletor.addEventListener("input", () => escolherCor(parseInt(seletor.value.slice(1), 16)));
    /** Uma área foi fixada com `c`: vai para a frente da pilha (a mais antiga sai). */
    function usarCor(c: number): void {
        if (CORES_FIXAS_DESENHO.includes(c)) return;
        const posicao = recentes.indexOf(c);
        if (posicao >= 0) recentes.splice(posicao, 1);
        recentes.unshift(c);
        recentes.length = Math.min(recentes.length, CORES_RECENTES_INICIAIS.length);
        guardarPreferencia(CHAVE_AREA_RECENTES, recentes.map(corCss).join(","));
        renderizarAmostras();
    }

    /** Mostra o tamanho da forma escolhida (campo, tamanhos prontos e prévia). */
    function mostrarTamanho(): void {
        const casas = tamanhos[forma];
        campo.value = String(casasParaMetros(casas));
        menos.disabled = casas <= 1;
        mais.disabled = casas >= MAX_TAMANHO_AREA;
        for (const botao of prontos.querySelectorAll<HTMLButtonElement>("button")) botao.classList.toggle("ativo", metrosParaCasas(Number(botao.dataset.metros)) === casas);
        desenharPrevia();
    }

    /** Mostra o que depende da forma (título do tamanho, tamanhos prontos, dica e os botões). */
    function mostrarForma(): void {
        const dados = DADOS_DAS_FORMAS_DE_AREA[forma];
        titulo.textContent = dados.medida;
        prontos.replaceChildren(
            ...dados.prontos.map((metros) => {
                const botao = document.createElement("button");
                botao.type = "button";
                botao.dataset.metros = String(metros);
                botao.textContent = comVirgula(metros); // (sem o " m": cabem todos numa linha só; a dica diz os metros e as casas)
                botao.title = `${comVirgula(metros)} m = ${metrosParaCasas(metros)} ${metrosParaCasas(metros) === 1 ? "casa" : "casas"}`;
                botao.addEventListener("click", () => mudarTamanho(metrosParaCasas(metros)));
                return botao;
            }),
        );
        dica.textContent = precisaDeDirecao(forma)
            ? "Clique na origem e depois na direção (ou arraste e solte). Botão direito cancela."
            : forma === "emanacao"
              ? "Clique na criatura: o corpo do token sob o mouse define de onde ela sai."
              : "Clique no centro (ou arraste para ajustar e solte). Botão direito cancela.";
        if (forma === "emanacao") dica.textContent = "Clique num TOKEN: ele passa a emanar e a aura o acompanha. Clique numa casa vazia para uma emanação fixa.";
        for (const [f, botao] of botoesDasFormas) {
            const escolhida = f === forma;
            botao.classList.toggle("ativo", escolhida && ligada);
            botao.setAttribute("aria-pressed", String(escolhida && ligada));
        }
        mostrarTamanho();
    }

    // --- A prévia: a forma numa grade pequena (cone, linha e cubo apontam para a direita) ---
    function desenharPrevia(): void {
        const ctx = previa.getContext("2d");
        if (!ctx) return;
        const casas = tamanhos[forma];
        // A área com a origem longe das bordas (as casas de coordenada negativa não existem): o desenho é só deslocado depois.
        const base = 60;
        const area: DadosDaArea = { forma, x: forma === "linha" ? base + 0.5 : base, y: forma === "linha" ? base + 0.5 : base, angulo: 0, casas, bloco: 1 };
        const lista = casasDaArea(area);
        if (lista.length === 0) {
            ctx.clearRect(0, 0, previa.width, previa.height);
            return;
        }
        let col0 = Infinity, col1 = -Infinity, row0 = Infinity, row1 = -Infinity;
        for (const c of lista) {
            col0 = Math.min(col0, c.col);
            col1 = Math.max(col1, c.col);
            row0 = Math.min(row0, c.row);
            row1 = Math.max(row1, c.row);
        }
        // A origem também entra na caixa (o cone, por exemplo, começa fora das casas). 1 casa de margem em volta.
        col0 = Math.min(col0, Math.floor(area.x)) - 1;
        row0 = Math.min(row0, Math.floor(area.y)) - 1;
        col1 = Math.max(col1, Math.ceil(area.x)) + 1;
        row1 = Math.max(row1, Math.ceil(area.y)) + 1;
        const lado = Math.max(col1 - col0 + 1, row1 - row0 + 1, 5); // quantas casas cabem no quadrado da prévia
        const tamanhoDaCasa = previa.width / lado;
        const deslocX = ((lado - (col1 - col0 + 1)) / 2 - col0) * tamanhoDaCasa;
        const deslocY = ((lado - (row1 - row0 + 1)) / 2 - row0) * tamanhoDaCasa;
        ctx.clearRect(0, 0, previa.width, previa.height);
        // a grade
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= lado; i++) {
            ctx.moveTo(i * tamanhoDaCasa, 0);
            ctx.lineTo(i * tamanhoDaCasa, previa.height);
            ctx.moveTo(0, i * tamanhoDaCasa);
            ctx.lineTo(previa.width, i * tamanhoDaCasa);
        }
        ctx.stroke();
        // as casas
        const cssCor = corCss(cor);
        ctx.globalAlpha = Math.min(1, alfa + 0.1);
        ctx.fillStyle = cssCor;
        for (const c of lista) ctx.fillRect(c.col * tamanhoDaCasa + deslocX, c.row * tamanhoDaCasa + deslocY, tamanhoDaCasa, tamanhoDaCasa);
        // o contorno (só os lados que dão para fora)
        ctx.globalAlpha = Math.min(1, alfa + 0.35);
        ctx.strokeStyle = cssCor;
        ctx.lineWidth = 2;
        const conjunto = conjuntoDeCasas(lista);
        ctx.beginPath();
        for (const { col, row } of lista) {
            const x = col * tamanhoDaCasa + deslocX;
            const y = row * tamanhoDaCasa + deslocY;
            if (!conjunto.has(chaveDaCasa(col, row - 1))) { ctx.moveTo(x, y); ctx.lineTo(x + tamanhoDaCasa, y); }
            if (!conjunto.has(chaveDaCasa(col, row + 1))) { ctx.moveTo(x, y + tamanhoDaCasa); ctx.lineTo(x + tamanhoDaCasa, y + tamanhoDaCasa); }
            if (!conjunto.has(chaveDaCasa(col - 1, row))) { ctx.moveTo(x, y); ctx.lineTo(x, y + tamanhoDaCasa); }
            if (!conjunto.has(chaveDaCasa(col + 1, row))) { ctx.moveTo(x + tamanhoDaCasa, y); ctx.lineTo(x + tamanhoDaCasa, y + tamanhoDaCasa); }
        }
        ctx.stroke();
        // a origem
        if (forma !== "emanacao") {
            ctx.globalAlpha = 1;
            ctx.fillStyle = cssCor;
            ctx.strokeStyle = "#1a1a1f";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(area.x * tamanhoDaCasa + deslocX, area.y * tamanhoDaCasa + deslocY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // --- Limpar ---
    limpar.addEventListener("click", () => opcoes.aoLimpar());

    function atualizar(): void {
        limpar.disabled = !estado.desenhos.some((d) => d.tipo === "area");
    }

    // O estado inicial: o painel se mostra e a ferramenta é avisada do que estava guardado.
    seletor.value = corCss(cor);
    seletorDeCor.atualizar();
    renderizarAmostras();
    mostrarTransparencia();
    mostrarForma();
    opcoes.aoMudarForma(forma);
    opcoes.aoMudarTamanho(tamanhos[forma]);
    opcoes.aoMudarAlfa(alfa);
    opcoes.aoMudarCor(cor);
    atualizar();

    return {
        get forma() {
            return forma;
        },
        get casas() {
            return tamanhos[forma];
        },
        definirForma(nova) {
            if (nova !== forma) {
                forma = nova;
                guardarPreferencia(CHAVE_AREA_FORMA, nova);
                opcoes.aoMudarForma(nova);
                opcoes.aoMudarTamanho(tamanhos[nova]);
            }
            mostrarForma();
        },
        definirTamanho: mudarTamanho,
        tamanhoDe: (f) => tamanhos[f],
        marcar(estaLigada) {
            ligada = estaLigada;
            mostrarForma();
        },
        get alfa() {
            return alfa;
        },
        get cor() {
            return cor;
        },
        usarCor,
        atualizar,
    };
}
