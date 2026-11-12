// =====================================================================
// CHAT (HTML): fixo embaixo da tela. As mensagens correm da ESQUERDA para a
// DIREITA, em vez de empilhar de baixo para cima: a mais NOVA entra na ponta
// ESQUERDA e empurra as anteriores para a direita (as mais antigas saem pela
// direita). A roda do mouse rola a faixa na horizontal para ver as antigas, e uma
// barra de rolagem PRÓPRIA, em cima do chat, mostra e controla a posição.
//
// ANIMAÇÕES: a mensagem nova ENTRA com um fade e um pequeno deslize, e as que já
// estavam DESLIZAM suavemente para a direita para abrir espaço (técnica "FLIP": o
// navegador já põe tudo na posição final e animamos cada cartão a partir de onde
// ele estava, o que roda na placa de vídeo e não dá "pulo"). Quem pede "reduzir
// movimento" no sistema não vê animação.
//
// Por enquanto é só a interface: escrever e apertar Enter (ou "Enviar") coloca a
// mensagem na faixa. Depois, o chat também terá as rolagens de dados.
// A marcação e o CSS ficam no index.html; aqui só ligamos os elementos.
// =====================================================================

import { DURACAO_ANIMACAO_CHAT, MAX_CARACTERES_MENSAGEM, MAX_CARTOES_ANIMADOS } from "../config";
import { estado, type Mensagem } from "../estado";

export interface OpcoesChat {
    /** O usuário enviou uma mensagem (texto já sem espaços nas pontas e nunca vazio). */
    aoEnviar(texto: string): void;
}

export interface Chat {
    /** Sincroniza a faixa com estado.mensagens (só acrescenta o que é novo, com animação). */
    atualizar(): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/** Hora de uma mensagem, ex.: "14:05". */
const formatarHora = (ms: number): string => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Curva da animação: começa rápida e termina devagar (movimento "suave"). */
const CURVA = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** O usuário pediu menos movimento nas configurações do sistema? */
const reduzirMovimento = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Quantos pixels um elemento está deslocado AGORA por uma animação de transform (0 se nenhuma). */
function deslocamentoAtual(elemento: HTMLElement): number {
    const transformacao = getComputedStyle(elemento).transform;
    return transformacao === "none" ? 0 : new DOMMatrixReadOnly(transformacao).m41; // m41 = deslocamento em x
}

export function criarChat(opcoes: OpcoesChat): Chat {
    const faixa = pegar("chat-faixa");
    const formulario = pegar<HTMLFormElement>("chat-form");
    const campo = pegar<HTMLInputElement>("chat-texto");
    const contador = pegar("chat-contador");
    // O navegador impede de digitar (ou colar) além do limite: o texto é cortado em MAX_CARACTERES_MENSAGEM.
    campo.maxLength = MAX_CARACTERES_MENSAGEM;

    /** Mostra "N/40" (caracteres usados / limite) e dá destaque quando o limite é atingido. */
    function atualizarContador(): void {
        contador.textContent = `${campo.value.length}/${MAX_CARACTERES_MENSAGEM}`;
        contador.classList.toggle("no-limite", campo.value.length >= MAX_CARACTERES_MENSAGEM);
    }
    campo.addEventListener("input", atualizarContador);
    atualizarContador();

    // Os cartões que estão na tela, por id da mensagem. Permite acrescentar só o novo (sem refazer tudo).
    const cartoes = new Map<number, HTMLElement>();

    /** Monta o cartão de uma mensagem. O texto entra por textContent (nunca como HTML). */
    function criarCartao(mensagem: Mensagem): HTMLElement {
        const cartao = document.createElement("div");
        cartao.className = "chat-mensagem";

        const cabecalho = document.createElement("div");
        cabecalho.className = "chat-cabecalho";
        const autor = document.createElement("strong");
        autor.textContent = mensagem.autor;
        const hora = document.createElement("time");
        hora.textContent = formatarHora(mensagem.hora);
        cabecalho.append(autor, hora);

        // Se alguém escrever "<b>oi</b>", aparece exatamente assim, sem virar código.
        const texto = document.createElement("p");
        texto.textContent = mensagem.texto;

        cartao.append(cabecalho, texto);
        return cartao;
    }

    /**
     * Sincroniza a faixa com estado.mensagens. As mensagens novas entram na ponta ESQUERDA
     * (a mais nova mais à esquerda) e empurram as anteriores para a direita, com animação.
     */
    function atualizar(): void {
        // Mensagens que saíram do estado (passaram do limite): o cartão sai da faixa.
        const ids = new Set(estado.mensagens.map((m) => m.id));
        for (const [id, cartao] of cartoes) {
            if (!ids.has(id)) {
                cartao.remove();
                cartoes.delete(id);
            }
        }
        atualizarRolagem();

        const novas = estado.mensagens.filter((m) => !cartoes.has(m.id)); // da mais antiga para a mais nova
        if (novas.length === 0) return;

        // 1) Antes de mexer: guarda quanto cada cartão visível já está deslocado por uma animação em
        //    andamento (se chegou outra mensagem no meio), e cancela essas animações. Assim o
        //    movimento novo continua de onde o cartão está, sem pulo.
        const antigos = Array.from(faixa.querySelectorAll<HTMLElement>(".chat-mensagem")).slice(0, MAX_CARTOES_ANIMADOS);
        const deslocamentos = antigos.map(deslocamentoAtual);
        for (const cartao of antigos) cartao.getAnimations().forEach((animacao) => animacao.cancel());

        // 2) A mais nova fica na ponta ESQUERDA: a faixa volta ao início e o cartão entra antes dos demais.
        faixa.scrollLeft = 0;
        const criados = novas.map((mensagem) => {
            const cartao = criarCartao(mensagem);
            cartoes.set(mensagem.id, cartao);
            faixa.insertBefore(cartao, faixa.firstChild);
            return cartao;
        });
        atualizarRolagem(); // o conteúdo da faixa cresceu: o cursor encolhe e volta ao início
        if (reduzirMovimento()) return;

        // 3) FLIP. Os cartões antigos já estão na posição final (deslocados para a direita pelo
        //    espaço dos novos). Animamos cada um DE onde estava (deslocado para a esquerda por
        //    esse mesmo espaço) ATÉ o lugar dele.
        const vao = parseFloat(getComputedStyle(faixa).columnGap) || 0;
        const espaco = criados.reduce((soma, cartao) => soma + cartao.offsetWidth + vao, 0);
        const opcoesAnimacao = { duration: DURACAO_ANIMACAO_CHAT, easing: CURVA };
        antigos.forEach((cartao, i) => {
            cartao.animate([{ transform: `translateX(${deslocamentos[i] - espaco}px)` }, { transform: "translateX(0)" }], opcoesAnimacao);
        });
        // Os cartões novos entram com fade e um pequeno deslize vindo da esquerda.
        for (const cartao of criados) {
            const deslize = Math.min(cartao.offsetWidth, 48);
            cartao.animate(
                [
                    { opacity: 0, transform: `translateX(${-deslize}px) scale(0.92)` },
                    { opacity: 1, transform: "none" },
                ],
                opcoesAnimacao,
            );
        }
    }

    // --- Barra de rolagem própria (em cima do chat) ---
    // Trilha com um cursor: a largura dele é a fração visível da faixa e a posição, o quanto já rolou.
    const trilha = pegar("chat-rolagem");
    const polegar = pegar("chat-polegar");
    const LARGURA_MIN_POLEGAR = 24; // px: o cursor nunca fica pequeno demais para pegar

    /** Quanto a faixa pode rolar (px). Zero ou quase = cabe tudo, não há o que rolar. */
    const rolagemMaxima = (): number => faixa.scrollWidth - faixa.clientWidth;

    /** Mede o cursor: largura proporcional ao que está visível e quanto sobra de trilha para ele andar. */
    function medidasDoPolegar(): { largura: number; livre: number } {
        const trilhaLargura = trilha.clientWidth;
        const largura = Math.max(LARGURA_MIN_POLEGAR, (trilhaLargura * faixa.clientWidth) / faixa.scrollWidth);
        return { largura, livre: Math.max(0, trilhaLargura - largura) };
    }

    /** Põe o cursor onde a faixa está (chamada quando a faixa rola, muda de tamanho ou ganha mensagens). */
    function atualizarRolagem(): void {
        const maxima = rolagemMaxima();
        trilha.classList.toggle("inativa", maxima <= 1);
        if (maxima <= 1) return;
        const { largura, livre } = medidasDoPolegar();
        polegar.style.width = `${largura}px`;
        polegar.style.transform = `translateX(${(faixa.scrollLeft / maxima) * livre}px)`;
        trilha.setAttribute("aria-valuenow", String(Math.round((faixa.scrollLeft / maxima) * 100)));
    }
    faixa.addEventListener("scroll", atualizarRolagem);
    new ResizeObserver(atualizarRolagem).observe(faixa); // janela redimensionada, chat mais estreito...

    // Arrastar o cursor: o quanto o mouse andou na trilha vira o quanto a faixa rola.
    polegar.addEventListener("pointerdown", (evento) => {
        if (evento.button !== 0) return;
        evento.preventDefault();
        evento.stopPropagation(); // não é um clique na trilha
        polegar.setPointerCapture(evento.pointerId); // continua recebendo o mouse mesmo fora do cursor
        polegar.classList.add("arrastando");
        const inicioX = evento.clientX;
        const inicioRolagem = faixa.scrollLeft;
        const { livre } = medidasDoPolegar();

        const mover = (e: PointerEvent): void => {
            if (livre > 0) faixa.scrollLeft = inicioRolagem + ((e.clientX - inicioX) * rolagemMaxima()) / livre;
        };
        const soltar = (): void => {
            polegar.classList.remove("arrastando");
            polegar.removeEventListener("pointermove", mover);
            polegar.removeEventListener("pointerup", soltar);
            polegar.removeEventListener("pointercancel", soltar);
        };
        polegar.addEventListener("pointermove", mover);
        polegar.addEventListener("pointerup", soltar);
        polegar.addEventListener("pointercancel", soltar);
    });

    // Clicar na trilha (fora do cursor): vai até aquele ponto, com o cursor centrado no clique.
    trilha.addEventListener("pointerdown", (evento) => {
        if (evento.button !== 0 || rolagemMaxima() <= 1) return;
        const { largura, livre } = medidasDoPolegar();
        const x = evento.clientX - trilha.getBoundingClientRect().left - largura / 2;
        faixa.scrollTo({ left: (Math.min(Math.max(x, 0), livre) / livre) * rolagemMaxima(), behavior: "smooth" });
    });

    // Enter dentro do campo (ou o botão "Enviar") dispara o "submit" do formulário.
    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault(); // sem isso a página recarregaria
        const texto = campo.value.trim();
        if (texto === "") return;
        if (texto.length > MAX_CARACTERES_MENSAGEM) return; // (o campo já limita; isto protege envios por código)
        opcoes.aoEnviar(texto);
        campo.value = "";
        atualizarContador();
        campo.focus(); // continua digitando sem precisar clicar de novo
    });

    // A roda do mouse costuma rolar na vertical; na faixa (horizontal) ela rola para os lados
    // (para baixo = para a direita, onde estão as mensagens mais antigas).
    faixa.addEventListener(
        "wheel",
        (evento) => {
            if (evento.deltaY === 0) return;
            faixa.scrollLeft += evento.deltaY;
            evento.preventDefault();
        },
        { passive: false },
    );

    // Esc sai do campo (devolve o foco ao tabuleiro).
    campo.addEventListener("keydown", (e) => {
        if (e.key === "Escape") campo.blur();
    });

    atualizar();
    return { atualizar };
}
