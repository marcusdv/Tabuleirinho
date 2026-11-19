// =====================================================================
// A FERRAMENTA DE ÁREA (cone, linha, esfera, cubo, emanação; a geometria está em src/areas.ts e o painel em ui/painelArea.ts).
// Como se usa (todas as formas aceitam as duas maneiras):
//   - ARRASTAR: aperta onde a área começa, arrasta até onde ela deve apontar e SOLTA: a área é fixada.
//   - CLICAR DUAS VEZES (cone, linha e cubo, que têm direção): o 1º clique marca a origem, o mouse escolhe a direção (a área acompanha, ao vivo) e o 2º clique fixa.
//   - Esfera e emanação não têm direção: um clique (ou apertar, mexer e soltar) já coloca. A EMANAÇÃO sobre um TOKEN não cria um desenho: o token passa a EMANAR (a aura o acompanha; ver `aoEmanarToken`).
//   - Botão DIREITO cancela o que está sendo posicionado; Esc sai da ferramenta.
// Antes de apertar, um "FANTASMA" acompanha o mouse (só para você) mostrando como a área ficaria ali.
// Enquanto se posiciona, a área mostra a MEDIDA ("6 m\n4 quadrados", como a régua) e os outros da cena a veem ao vivo (`aoMudarPrevia`). Depois de fixada, a medida some.
// A área fixada é um desenho comum (`aoAdicionar`): fica até alguém apagar, com a borracha, o Ctrl+Z ou o botão "Limpar áreas".
// =====================================================================

import type { PointData } from "pixi.js";
import { direcaoAte, encaixarOrigem, precisaDeDirecao, type DadosDaArea, type FormaDeArea } from "../areas";
import { ALFA_PREENCHIMENTO_AREA, COR_INICIAL_DESENHO, PX_MIN_ARRASTO_AREA, TAMANHO_CASA } from "../config";
import type { EmanacaoDoToken } from "../areas";
import { limitar } from "../coordenadas";
import { estado, type NovoDesenho } from "../estado";
import type { Camera } from "./camera";
import type { FerramentaDeArrasto } from "./ferramenta";
import { criarVisualDeArea } from "./formaDeArea";

export interface OpcoesFerramentaDeArea {
    /** A área em posicionamento mudou (ou `null`: sumiu). É o que se manda aos outros, ao vivo (quem chama limita a frequência). */
    aoMudarPrevia(area: DadosDaArea | null): void;
    /** A área foi FIXADA: quem trata guarda como um desenho (estado, rede e histórico do Ctrl+Z). */
    aoAdicionar(novo: NovoDesenho): void;
    /** Há uma criatura (token) nesta casa? Devolve o id, o canto e o tamanho do corpo dela: a emanação sai do corpo inteiro. */
    corpoEm(col: number, row: number): { id: number; col: number; row: number; size: number } | null;
    /** A forma Emanação foi usada SOBRE um token: ele passa a emanar com estes parâmetros (quem trata envia ao servidor, ou aplica no modo local). */
    aoEmanarToken(idDoToken: number, emanacao: EmanacaoDoToken): void;
}

export interface FerramentaDeArea extends FerramentaDeArrasto {
    /** Liga/desliga a ferramenta (desligando, qualquer área em posicionamento some). */
    definirAtiva(ativa: boolean): void;
    definirForma(forma: FormaDeArea): void;
    /** O tamanho, em casas (comprimento, raio, lado ou alcance, conforme a forma). */
    definirTamanho(casas: number): void;
    definirCor(cor: number): void;
    /** A opacidade do preenchimento (a transparência escolhida no painel). */
    definirAlfa(alfa: number): void;
    /** O zoom mudou: o rótulo da medida depende dele. */
    redesenhar(): void;
    /** Esconde o fantasma (o mouse saiu do mapa). */
    esconderFantasma(): void;
    /** O texto da medida à vista ("6 m\n4 quadrados"), ou null. (Para os testes.) */
    readonly texto: string | null;
    /** A área que está à vista agora (o fantasma ou a que está sendo posicionada), ou null. (Para os testes.) */
    readonly previa: DadosDaArea | null;
}

export function criarFerramentaDeArea(camera: Camera, opcoes: OpcoesFerramentaDeArea): FerramentaDeArea {
    const visual = criarVisualDeArea(camera);

    let ativa = false;
    let forma: FormaDeArea = "cone";
    let casas = 3;
    let cor = COR_INICIAL_DESENHO;
    let alfa = ALFA_PREENCHIMENTO_AREA; // a opacidade do preenchimento

    // O gesto: `origem` é o ponto onde a área começou (cone, linha e cubo: já marcado; fica marcado entre os dois cliques); `pressionado` = o botão está apertado agora.
    let origem: { x: number; y: number } | null = null;
    let pressionado = false;
    let angulo = 0; // a direção atual (a última, enquanto o mouse está em cima da origem). Toda área nova NASCE apontando para a DIREITA (0), igual à prévia do painel: padronizado (pedido do dono, 19/11/2026)
    let origemNaTela: PointData | null = null;
    let ultimoPonto: PointData | null = null; // onde o mouse esteve por último (a prévia se refaz quando o tamanho ou a forma mudam)
    let areaAtual: DadosDaArea | null = null;
    let previaEnviada = false; // alguma prévia desta área já foi mandada aos outros? (então é preciso mandar o "sumiu" ao fixar ou cancelar, mesmo que o botão já tenha sido solto)
    let alvoAtual: number | null = null; // o token sob o mouse quando a forma é Emanação (a área à vista sai do corpo dele)

    /** Ponto da TELA -> ponto em casas, dentro do tabuleiro. */
    function emCasas(ponto: PointData): { x: number; y: number } {
        const m = camera.telaParaMundo(ponto);
        return { x: limitar(m.x / TAMANHO_CASA, 0, estado.colunas), y: limitar(m.y / TAMANHO_CASA, 0, estado.linhas) };
    }

    /** A área que o mouse em `ponto` produziria agora. */
    function montar(ponto: PointData): DadosDaArea {
        const p = emCasas(ponto);
        if (origem && precisaDeDirecao(forma)) {
            angulo = direcaoAte(origem, p, angulo);
            return { forma, x: origem.x, y: origem.y, angulo, casas, bloco: 1 };
        }
        alvoAtual = null;
        if (forma === "emanacao") {
            const corpo = opcoes.corpoEm(Math.floor(p.x), Math.floor(p.y));
            alvoAtual = corpo?.id ?? null;
            return corpo ? { forma, x: corpo.col, y: corpo.row, angulo: 0, casas, bloco: corpo.size } : { forma, x: Math.floor(p.x), y: Math.floor(p.y), angulo: 0, casas, bloco: 1 };
        }
        const o = encaixarOrigem(forma, p);
        return { forma, x: o.x, y: o.y, angulo, casas, bloco: 1 };
    }

    /** Mostra a área em `ponto`; `aoVivo` = também a manda aos outros (só enquanto a pessoa está posicionando de verdade, não no fantasma). */
    function mostrar(ponto: PointData, aoVivo: boolean): void {
        ultimoPonto = ponto;
        areaAtual = montar(ponto);
        visual.mostrar(areaAtual, cor, "", alfa);
        if (aoVivo) {
            previaEnviada = true;
            opcoes.aoMudarPrevia(areaAtual);
        }
    }

    function apagarPrevia(): void {
        const estavaAoVivo = origem !== null || pressionado || previaEnviada; // (soltar desmarca `pressionado` ANTES de fixar: sem `previaEnviada` o "sumiu" nunca saía e a prévia ficava presa na tela dos outros)
        previaEnviada = false;
        origem = null;
        pressionado = false;
        origemNaTela = null;
        areaAtual = null;
        angulo = 0; // (fixou ou cancelou: a próxima área volta a apontar para a direita)
        visual.mostrar(null, cor);
        if (estavaAoVivo) opcoes.aoMudarPrevia(null);
    }

    /** Fixa a área que está à vista como um desenho. */
    function fixar(): void {
        const area = areaAtual;
        const alvo = forma === "emanacao" ? alvoAtual : null;
        apagarPrevia();
        if (!area) return;
        // Emanação sobre um token: ele passa a emanar (a aura o acompanha); senão, a área vira um desenho fixo.
        if (alvo !== null) opcoes.aoEmanarToken(alvo, { casas, cor, alfa });
        else opcoes.aoAdicionar({ tipo: "area", cor, ...area, alfa });
    }

    return {
        get ativa() {
            return ativa;
        },
        // "Medindo" = há uma área sendo posicionada (botão apertado, ou entre os dois cliques): é o que faz o mouse repassar o movimento a esta ferramenta.
        get medindo() {
            return origem !== null || pressionado;
        },
        get texto() {
            return visual.texto;
        },
        get previa() {
            return areaAtual;
        },

        definirAtiva(nova) {
            ativa = nova;
            angulo = 0; // (ligou ou desligou: a forma que acompanha o mouse começa apontando para a direita)
            if (!nova) {
                apagarPrevia();
                ultimoPonto = null;
            }
        },
        definirForma(nova) {
            forma = nova;
            angulo = 0; // (escolheu outra forma: ela aparece apontando para a direita, como na prévia do painel)
            if (origem || pressionado) apagarPrevia(); // (trocou de forma no meio: recomeça)
            else if (ativa && ultimoPonto) mostrar(ultimoPonto, false);
        },
        definirTamanho(novo) {
            casas = novo;
            if (ativa && ultimoPonto && (origem || pressionado || areaAtual)) mostrar(ultimoPonto, origem !== null || pressionado); // (a prévia à vista se refaz com o tamanho novo)
        },
        definirCor(nova) {
            cor = nova;
            if (areaAtual) visual.mostrar(areaAtual, cor, "", alfa);
        },
        definirAlfa(nova) {
            alfa = nova;
            if (areaAtual) visual.mostrar(areaAtual, cor, "", alfa);
        },
        redesenhar: () => visual.redesenhar(),
        esconderFantasma() {
            if (origem === null && !pressionado) {
                areaAtual = null;
                visual.mostrar(null, cor);
            }
        },

        // O mouse anda SEM botão apertado: o fantasma acompanha (só para quem usa).
        passar(ponto) {
            if (!ativa || origem !== null || pressionado) return;
            mostrar(ponto, false);
        },

        comecar(ponto) {
            if (!ativa) return;
            // O 2º clique (cone, linha e cubo, com a origem já marcada): fixa na direção em que o mouse está.
            if (origem) {
                mostrar(ponto, false);
                fixar();
                return;
            }
            pressionado = true;
            origemNaTela = { x: ponto.x, y: ponto.y };
            if (precisaDeDirecao(forma)) origem = encaixarOrigem(forma, emCasas(ponto));
            mostrar(ponto, true);
        },

        arrastar(ponto) {
            if (!ativa || (origem === null && !pressionado)) return;
            mostrar(ponto, true);
        },

        soltar() {
            if (!pressionado) return; // (soltou depois do 2º clique, que já fixou: nada a fazer)
            pressionado = false;
            const andou = origemNaTela && ultimoPonto ? Math.hypot(ultimoPonto.x - origemNaTela.x, ultimoPonto.y - origemNaTela.y) >= PX_MIN_ARRASTO_AREA : false;
            if (!precisaDeDirecao(forma)) return fixar(); // esfera e emanação: soltar já fixa
            if (andou) return fixar(); // arrastou e soltou: fixa na direção
            // Só clicou: a origem fica marcada e a área acompanha o mouse até o 2º clique.
        },

        // Botão direito durante o posicionamento: cancela.
        cliqueDireito() {
            apagarPrevia();
        },
    };
}
