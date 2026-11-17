// =====================================================================
// BARRA DE FERRAMENTAS (HTML): zoom, colunas e linhas, e recolher/expandir.
// A marcação HTML e o CSS ficam no index.html; aqui só ligamos os botões.
// =====================================================================

import {
    CHAVE_GRADE,
    ESPESSURA_GRADE_MAX,
    ESPESSURA_GRADE_MIN,
    ESPESSURA_GRADE_PADRAO,
    MAX_CASAS,
    MIN_CASAS,
    PASSO_ESPESSURA_GRADE,
    PASSO_ZOOM,
    ZOOM_MAX,
    ZOOM_MIN,
} from "../config";
import { guardarPreferencia, lerPreferencia } from "./preferencias";
import { restaurarPilha } from "./pilha";
import { estado } from "../estado";
import type { Camera } from "../tabuleiro/camera";
import type { GradeDaMesa } from "../estado";
import type { AjustesDaGrade } from "../tabuleiro/grade";

export interface OpcoesBarra {
    /** Pediu para adicionar/remover colunas e/ou linhas do tabuleiro. */
    aoMudarTamanhoTabuleiro(deltaColunas: number, deltaLinhas: number): void;
    /** Clicou em "Alinhar mapa" (liga ou desliga a ferramenta). */
    aoAlternarCalibragem(): void;
    /** O usuário escolheu um arquivo de imagem para ser o mapa. */
    aoEscolherMapa(arquivo: File): void;
    /** Clicou em "Voltar ao padrão" (zoom 100% e tamanho inicial do tabuleiro). */
    aoVoltarAoPadrao(): void;
    /** Os ajustes da grade mudaram e devem ser APLICADOS no desenho (mostrar, espessura ou cor). */
    aoMudarGrade(ajustes: AjustesDaGrade): void;
    /**
     * A pessoa quer mudar a espessura ou a cor da grade, que são da MESA. Online o pedido vai ao servidor e devolve true (a mudança só vale quando o servidor avisar todos); sem servidor
     * devolve false e a barra aplica na hora, guardando no navegador.
     */
    aoPedirGradeDaMesa(grade: GradeDaMesa): boolean;
    /** Esta pessoa pode mudar a espessura e a cor da grade? (Online, só o mestre; sem servidor, sempre.) */
    podeMudarGrade(): boolean;
}

export interface Barra {
    /** Atualiza os números exibidos e desativa botões que chegaram ao limite. */
    atualizar(): void;
    /** Destaca o botão "Alinhar mapa" enquanto a ferramenta está ligada. */
    marcarCalibragem(ligada: boolean): void;
    /** Os ajustes da grade guardados no navegador (a camada da grade os aplica ao ser criada). */
    ajustesDaGrade(): AjustesDaGrade;
    /** O servidor disse qual é a espessura e a cor da grade da mesa: aplica (sem guardar no navegador) e refaz os controles. */
    aplicarGradeDaMesa(grade: GradeDaMesa): void;
    /** Refaz os controles da grade (por exemplo, quando se descobre se esta pessoa é o mestre). */
    atualizarGrade(): void;
}

/** Atalho para buscar um elemento da página pelo id. */
function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

export function criarBarra(camera: Camera, opcoes: OpcoesBarra): Barra {
    function atualizar(): void {
        pegar("zoom-valor").textContent = `${Math.round(camera.zoom * 100)}%`;
        // Campos digitáveis: não sobrescreve enquanto o usuário está digitando neles.
        const colunas = pegar<HTMLInputElement>("colunas-valor");
        const linhas = pegar<HTMLInputElement>("linhas-valor");
        if (document.activeElement !== colunas) colunas.value = String(estado.colunas);
        if (document.activeElement !== linhas) linhas.value = String(estado.linhas);

        pegar<HTMLButtonElement>("zoom-menos").disabled = camera.zoom <= ZOOM_MIN;
        pegar<HTMLButtonElement>("zoom-mais").disabled = camera.zoom >= ZOOM_MAX;
        pegar<HTMLButtonElement>("colunas-menos").disabled = estado.colunas <= MIN_CASAS;
        pegar<HTMLButtonElement>("colunas-mais").disabled = estado.colunas >= MAX_CASAS;
        pegar<HTMLButtonElement>("linhas-menos").disabled = estado.linhas <= MIN_CASAS;
        pegar<HTMLButtonElement>("linhas-mais").disabled = estado.linhas >= MAX_CASAS;
        // Sem mapa não há o que calibrar.
        pegar<HTMLButtonElement>("calibrar-alternar").disabled = estado.mapa === null;
    }

    function marcarCalibragem(ligada: boolean): void {
        const botao = pegar<HTMLButtonElement>("calibrar-alternar");
        botao.classList.toggle("ativo", ligada);
        botao.setAttribute("aria-pressed", String(ligada));
    }

    // Liga cada botão HTML à sua ação.
    pegar("zoom-mais").addEventListener("click", () => camera.aplicarZoom(camera.zoom * PASSO_ZOOM));
    pegar("zoom-menos").addEventListener("click", () => camera.aplicarZoom(camera.zoom / PASSO_ZOOM));
    pegar("zoom-ajustar").addEventListener("click", () => camera.ajustar());
    pegar("colunas-mais").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(1, 0));
    pegar("colunas-menos").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(-1, 0));
    pegar("linhas-mais").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(0, 1));
    pegar("linhas-menos").addEventListener("click", () => opcoes.aoMudarTamanhoTabuleiro(0, -1));
    pegar("calibrar-alternar").addEventListener("click", () => opcoes.aoAlternarCalibragem());

    // Digitar o número de colunas/linhas: ao confirmar (Enter ou sair do campo), manda a DIFERENÇA
    // para o mesmo caminho dos botões +/- (limites de MIN/MAX_CASAS, tokens puxados para dentro...).
    function ligarCampo(id: string, eixo: "colunas" | "linhas"): void {
        const campo = pegar<HTMLInputElement>(id);
        function aplicar(): void {
            const digitado = Math.round(Number(campo.value));
            // Vazio ou inválido: ignora e volta a mostrar o valor atual.
            if (campo.value.trim() !== "" && Number.isFinite(digitado)) {
                const delta = digitado - estado[eixo];
                if (delta !== 0) opcoes.aoMudarTamanhoTabuleiro(eixo === "colunas" ? delta : 0, eixo === "linhas" ? delta : 0);
            }
            campo.value = String(estado[eixo]); // mostra o valor realmente usado (já limitado)
        }
        campo.addEventListener("change", aplicar);
        campo.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                aplicar();
                campo.blur(); // devolve o foco: atalhos e o mouse voltam ao tabuleiro
            }
        });
    }
    ligarCampo("colunas-valor", "colunas");
    ligarCampo("linhas-valor", "linhas");

    pegar("voltar-padrao").addEventListener("click", () => opcoes.aoVoltarAoPadrao());
    pegar("reorganizar-telas").addEventListener("click", restaurarPilha); // as barras da pilha voltam à ordem de fábrica

    // "Escolher mapa": o botão aparente abre o seletor de arquivos do navegador
    // (o <input type="file"> fica escondido; o navegador só permite abri-lo por um clique do usuário).
    const campoArquivo = pegar<HTMLInputElement>("mapa-arquivo");
    pegar("mapa-escolher").addEventListener("click", () => campoArquivo.click());
    campoArquivo.addEventListener("change", () => {
        const arquivo = campoArquivo.files?.[0];
        if (arquivo) opcoes.aoEscolherMapa(arquivo);
        // Limpa a escolha: sem isso, escolher DE NOVO o mesmo arquivo não dispararia "change".
        campoArquivo.value = "";
    });

    // --- Ajustes da GRADE: mostrar/esconder (de cada pessoa, guardado no navegador) e espessura e cor (da MESA: online vêm do servidor). ---
    const botaoMostrarGrade = pegar<HTMLButtonElement>("grade-mostrar");
    const valorEspessura = pegar("grade-espessura-valor");
    const campoCorGrade = pegar<HTMLInputElement>("grade-cor");
    let ajustesGrade = lerAjustesDaGrade();
    function mostrarAjustesDaGrade(): void {
        botaoMostrarGrade.textContent = ajustesGrade.mostrar ? "Esconder grade" : "Mostrar grade";
        botaoMostrarGrade.setAttribute("aria-pressed", String(!ajustesGrade.mostrar));
        valorEspessura.textContent = `${String(ajustesGrade.espessura).replace(".", ",")} px`;
        pegar<HTMLButtonElement>("grade-espessura-menos").disabled = ajustesGrade.espessura <= ESPESSURA_GRADE_MIN;
        pegar<HTMLButtonElement>("grade-espessura-mais").disabled = ajustesGrade.espessura >= ESPESSURA_GRADE_MAX;
        campoCorGrade.value = ajustesGrade.cor ?? "#000000";
        pegar("grade-cor-auto").classList.toggle("escolhido", ajustesGrade.cor === null);
        // A espessura e a cor são da MESA: online só o mestre as muda (os outros veem o que o mestre escolheu). "Esconder grade" é de cada pessoa e fica sempre livre.
        const pode = opcoes.podeMudarGrade();
        const dicaDoMestre = pode ? "" : "Só o mestre muda a espessura e a cor da grade";
        for (const id of ["grade-espessura-menos", "grade-espessura-mais", "grade-cor-auto"]) {
            const botao = pegar<HTMLButtonElement>(id);
            botao.dataset.dica ??= botao.title; // (guarda a dica de fábrica para devolvê-la quando a pessoa puder mexer)
            if (!pode) botao.disabled = true;
            else if (id === "grade-cor-auto") botao.disabled = false; // (os de espessura já foram calculados acima, pelos limites)
            botao.title = dicaDoMestre || botao.dataset.dica;
        }
        campoCorGrade.disabled = !pode;
        campoCorGrade.title = dicaDoMestre;
    }
    function mudarGrade(mudancas: Partial<AjustesDaGrade>): void {
        const daMesa = "espessura" in mudancas || "cor" in mudancas;
        // Espessura e cor, online: pede ao servidor e espera ele avisar todos (nada muda aqui antes disso).
        if (daMesa && opcoes.aoPedirGradeDaMesa({ espessura: mudancas.espessura ?? ajustesGrade.espessura, cor: "cor" in mudancas ? (mudancas.cor ?? null) : ajustesGrade.cor })) return;
        ajustesGrade = { ...ajustesGrade, ...mudancas };
        mostrarAjustesDaGrade();
        guardarPreferencia(CHAVE_GRADE, JSON.stringify(ajustesGrade));
        opcoes.aoMudarGrade(ajustesGrade);
    }
    botaoMostrarGrade.addEventListener("click", () => mudarGrade({ mostrar: !ajustesGrade.mostrar }));
    pegar("grade-espessura-menos").addEventListener("click", () => mudarGrade({ espessura: Math.max(ESPESSURA_GRADE_MIN, ajustesGrade.espessura - PASSO_ESPESSURA_GRADE) }));
    pegar("grade-espessura-mais").addEventListener("click", () => mudarGrade({ espessura: Math.min(ESPESSURA_GRADE_MAX, ajustesGrade.espessura + PASSO_ESPESSURA_GRADE) }));
    campoCorGrade.addEventListener("input", () => mudarGrade({ cor: campoCorGrade.value })); // (o navegador só devolve "#rrggbb")
    pegar("grade-cor-auto").addEventListener("click", () => mudarGrade({ cor: null }));
    mostrarAjustesDaGrade();

    // (Abrir e fechar a barra é da PILHA de barras: ver ui/pilha.ts.)

    atualizar();
    return {
        atualizar,
        marcarCalibragem,
        ajustesDaGrade: () => ajustesGrade,
        aplicarGradeDaMesa(grade) {
            ajustesGrade = { ...ajustesGrade, espessura: grade.espessura, cor: grade.cor }; // (vale só nesta sessão: não vai para o armazenamento do navegador)
            mostrarAjustesDaGrade();
            opcoes.aoMudarGrade(ajustesGrade);
        },
        atualizarGrade: mostrarAjustesDaGrade,
    };
}

/** Lê os ajustes da grade guardados; qualquer coisa estranha (ou nada guardado) volta ao padrão. */
function lerAjustesDaGrade(): AjustesDaGrade {
    const padrao: AjustesDaGrade = { mostrar: true, espessura: ESPESSURA_GRADE_PADRAO, cor: null };
    try {
        const lido: unknown = JSON.parse(lerPreferencia(CHAVE_GRADE) ?? "null");
        if (typeof lido !== "object" || lido === null) return padrao;
        const { mostrar, espessura, cor } = lido as Record<string, unknown>;
        return {
            mostrar: typeof mostrar === "boolean" ? mostrar : padrao.mostrar,
            espessura: typeof espessura === "number" && espessura >= ESPESSURA_GRADE_MIN && espessura <= ESPESSURA_GRADE_MAX ? espessura : padrao.espessura,
            cor: typeof cor === "string" && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : null,
        };
    } catch {
        return padrao;
    }
}
