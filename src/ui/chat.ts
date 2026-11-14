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

import { DURACAO_ANIMACAO_CHAT, MAX_CARACTERES_MENSAGEM, MAX_CARTOES_ANIMADOS, MAX_DADOS_NO_CARTAO, SUAVIDADE_ROLAGEM_CHAT } from "../config";
import { detalheDaRolagem, formulaDosDados } from "../dados";
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
    const botaoNovas = pegar<HTMLButtonElement>("chat-novas");
    let novasNaoVistas = 0; // mensagens que chegaram enquanto a faixa estava rolada (fora da tela, à esquerda)
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

        // Rolagem de FICHA (ex.: o "Ataque com espada"): o NOME da rolagem (o golpe), EMBAIXO a criatura (o nome da ficha), embaixo disso o cálculo com o que saiu em cada dado, e o TOTAL
        // grande à direita. Tudo entra por textContent (os nomes vêm de uma ficha escrita por um jogador).
        if (mensagem.rolagemFicha) {
            const r = mensagem.rolagemFicha;
            cartao.classList.add("chat-rolagem", "chat-rolagem-ficha");

            const titulo = document.createElement("p");
            titulo.className = "chat-formula chat-titulo-ficha";
            const nome = document.createElement("strong");
            nome.textContent = r.nome;
            titulo.append(nome);
            titulo.title = r.nome;

            // A criatura (o nome da ficha) fica EMBAIXO do nome do golpe, e o cálculo embaixo dela.
            const criatura = document.createElement("p");
            criatura.className = "chat-criatura";
            criatura.textContent = r.ficha;
            criatura.title = r.ficha;

            const detalhe = document.createElement("p");
            detalhe.className = "chat-detalhe";
            detalhe.textContent = r.detalhe; // ex.: "1d20 [14] + 3 + 3": uma linha só, cortada com "…" se for comprida
            detalhe.title = r.detalhe;

            const informacoes = document.createElement("div");
            informacoes.className = "chat-rolagem-info";
            informacoes.append(cabecalho, titulo, criatura, detalhe);

            const total = document.createElement("div");
            total.className = "chat-total";
            total.textContent = String(r.total);

            cartao.append(informacoes, total);
            return cartao;
        }

        // Rolagem de dados: à esquerda a fórmula e cada dado; à direita o TOTAL, bem grande.
        if (mensagem.rolagem) {
            const rolagem = mensagem.rolagem;
            cartao.classList.add("chat-rolagem");

            const formula = document.createElement("p");
            formula.className = "chat-formula";
            const nome = document.createElement("strong");
            nome.textContent = formulaDosDados(rolagem.quantidade, rolagem.lados, rolagem.modificador);
            formula.append(nome);

            // Uma linha só, que o CSS corta com "…" se for comprida; a lista COMPLETA fica na dica do mouse.
            const detalhe = document.createElement("p");
            detalhe.className = "chat-detalhe";
            detalhe.textContent = detalheDaRolagem(rolagem, MAX_DADOS_NO_CARTAO);
            detalhe.title = detalheDaRolagem(rolagem, Infinity);

            const informacoes = document.createElement("div");
            informacoes.className = "chat-rolagem-info";
            informacoes.append(cabecalho, formula, detalhe);

            const total = document.createElement("div");
            total.className = "chat-total";
            total.textContent = String(rolagem.total);

            cartao.append(informacoes, total);
            return cartao;
        }

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

        // A faixa está ROLADA (o usuário está lendo mensagens antigas)? Então a mensagem nova NÃO arrasta a
        // faixa de volta ao início: ela entra na ponta esquerda (fora da tela) e a rolagem é compensada,
        // para as mensagens que o usuário está vendo continuarem exatamente onde estão.
        const rolada = faixa.scrollLeft > 1;
        const rolagemAntes = faixa.scrollLeft;

        // 1) Antes de mexer: guarda quanto cada cartão visível já está deslocado por uma animação em
        //    andamento (se chegou outra mensagem no meio), e cancela essas animações. Assim o
        //    movimento novo continua de onde o cartão está, sem pulo. (Com a faixa rolada os cartões
        //    antigos não se mexem na tela, então as animações deles seguem em paz.)
        const antigos = Array.from(faixa.querySelectorAll<HTMLElement>(".chat-mensagem")).slice(0, MAX_CARTOES_ANIMADOS);
        const deslocamentos = rolada ? [] : antigos.map(deslocamentoAtual);
        if (!rolada) for (const cartao of antigos) cartao.getAnimations().forEach((animacao) => animacao.cancel());

        // 2) A mais nova fica na ponta ESQUERDA: o cartão entra antes dos demais. No início da faixa ela
        //    continua no início; rolada, fica como está (compensada logo abaixo).
        if (!rolada) {
            pararRolagemSuave(); // uma rolagem da roda em andamento brigaria com a faixa no início
            faixa.scrollLeft = 0;
        }
        const criados = novas.map((mensagem) => {
            const cartao = criarCartao(mensagem);
            cartoes.set(mensagem.id, cartao);
            faixa.insertBefore(cartao, faixa.firstChild);
            return cartao;
        });
        const vao = parseFloat(getComputedStyle(faixa).columnGap) || 0;
        const espaco = criados.reduce((soma, cartao) => soma + cartao.offsetWidth + vao, 0); // o que os novos empurram para a direita
        if (rolada) {
            // O conteúdo andou `espaco` para a direita: rola o mesmo tanto e ninguém se mexe na tela.
            faixa.scrollLeft = rolagemAntes + espaco;
            if (rolandoSuave) alvoRolagem += espaco; // uma rolagem da roda em andamento continua rumo ao MESMO ponto
            atualizarRolagem();
            mostrarAvisoDeNovas(novas.length); // a mensagem nova está fora da tela: avisa com a setinha
            return;
        }
        atualizarRolagem(); // o conteúdo da faixa cresceu: o cursor encolhe e volta ao início
        if (reduzirMovimento()) return;

        // 3) FLIP. Os cartões antigos já estão na posição final (deslocados para a direita pelo
        //    espaço dos novos). Animamos cada um DE onde estava (deslocado para a esquerda por
        //    esse mesmo espaço) ATÉ o lugar dele.
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

    // --- Barra de rolagem própria (VERTICAL, no canto direito do chat, dentro da caixa) ---
    // As mensagens correm na HORIZONTAL, mas a barra é vertical: descer o cursor anda para as mensagens mais
    // antigas (para a direita). Trilha com um cursor: a altura dele é a fração visível da faixa e a posição,
    // o quanto já rolou.
    const trilha = pegar("chat-rolagem");
    const polegar = pegar("chat-polegar");
    const ALTURA_MIN_POLEGAR = 24; // px: o cursor nunca fica pequeno demais para pegar

    /** Quanto a faixa pode rolar (px). Zero ou quase = cabe tudo, não há o que rolar. */
    const rolagemMaxima = (): number => faixa.scrollWidth - faixa.clientWidth;

    /** Mede o cursor: altura proporcional ao que está visível e quanto sobra de trilha para ele andar. */
    function medidasDoPolegar(): { altura: number; livre: number } {
        const trilhaAltura = trilha.clientHeight;
        const altura = Math.max(ALTURA_MIN_POLEGAR, (trilhaAltura * faixa.clientWidth) / faixa.scrollWidth);
        return { altura, livre: Math.max(0, trilhaAltura - altura) };
    }

    /** Põe o cursor onde a faixa está (chamada quando a faixa rola, muda de tamanho ou ganha mensagens). */
    function atualizarRolagem(): void {
        const maxima = rolagemMaxima();
        trilha.classList.toggle("inativa", maxima <= 1);
        if (maxima <= 1) return;
        const { altura, livre } = medidasDoPolegar();
        polegar.style.height = `${altura}px`;
        polegar.style.transform = `translateY(${(faixa.scrollLeft / maxima) * livre}px)`;
        trilha.setAttribute("aria-valuenow", String(Math.round((faixa.scrollLeft / maxima) * 100)));
    }
    faixa.addEventListener("scroll", atualizarRolagem);
    new ResizeObserver(atualizarRolagem).observe(faixa); // janela redimensionada, chat mais estreito...

    // Arrastar o cursor: o quanto o mouse andou (para baixo) na trilha vira o quanto a faixa rola (para a direita).
    polegar.addEventListener("pointerdown", (evento) => {
        if (evento.button !== 0) return;
        evento.preventDefault();
        evento.stopPropagation(); // não é um clique na trilha
        polegar.setPointerCapture(evento.pointerId); // continua recebendo o mouse mesmo fora do cursor
        polegar.classList.add("arrastando");
        const inicioY = evento.clientY;
        const inicioRolagem = faixa.scrollLeft;
        const { livre } = medidasDoPolegar();

        const mover = (e: PointerEvent): void => {
            if (livre > 0) faixa.scrollLeft = inicioRolagem + ((e.clientY - inicioY) * rolagemMaxima()) / livre;
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
        const { altura, livre } = medidasDoPolegar();
        const y = evento.clientY - trilha.getBoundingClientRect().top - altura / 2;
        faixa.scrollTo({ left: (Math.min(Math.max(y, 0), livre) / livre) * rolagemMaxima(), behavior: "smooth" });
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

    // --- Aviso de mensagem nova (a setinha à esquerda) ---
    // Quando chega mensagem com a faixa rolada, ela fica fora da tela (à esquerda). A setinha avisa; clicar leva
    // até a mais recente. Ela some ao chegar ao início da faixa, por qualquer caminho (clique, roda, barra).
    function mostrarAvisoDeNovas(quantas: number): void {
        novasNaoVistas += quantas;
        const texto = novasNaoVistas === 1 ? "1 mensagem nova" : `${novasNaoVistas} mensagens novas`;
        botaoNovas.title = `${texto}: ir para a mais recente`;
        botaoNovas.setAttribute("aria-label", `${texto}: ir para a mais recente`);
        botaoNovas.hidden = false;
    }
    function esconderAvisoDeNovas(): void {
        novasNaoVistas = 0;
        botaoNovas.hidden = true;
    }
    botaoNovas.addEventListener("click", () => {
        pararRolagemSuave(); // uma rolagem da roda em andamento brigaria com a ida ao início
        esconderAvisoDeNovas();
        faixa.scrollTo({ left: 0, behavior: reduzirMovimento() ? "auto" : "smooth" });
        campo.focus(); // continua conversando sem precisar clicar de novo
    });
    faixa.addEventListener("scroll", () => {
        if (faixa.scrollLeft <= 1) esconderAvisoDeNovas(); // chegou ao início: as novas já estão à vista
    });

    // --- Rolagem SUAVE da roda do mouse ---
    // A roda costuma rolar na vertical; na faixa (horizontal) ela rola para os lados (para baixo = para a
    // direita, onde estão as mensagens mais antigas). Em vez de saltar, cada giro da roda só MUDA O ALVO e
    // a faixa o persegue a cada quadro, cobrindo uma fração da distância que falta (suavização
    // exponencial: rápida no começo, macia no fim). Vários giros seguidos somam no mesmo alvo.
    // Arrastar o cursor da barra, o teclado e a chegada de mensagens NÃO passam por aqui (são imediatos).
    let alvoRolagem = 0; // até onde a faixa deve chegar (px)
    let rolandoSuave = false;
    let ultimoQuadro = 0;

    function pararRolagemSuave(): void {
        rolandoSuave = false;
    }

    function passoRolagem(agora: number): void {
        if (!rolandoSuave) return;
        const dt = Math.min(agora - ultimoQuadro, 50); // um quadro atrasado não pode dar um salto enorme
        ultimoQuadro = agora;
        const falta = alvoRolagem - faixa.scrollLeft;
        if (Math.abs(falta) < 1) {
            faixa.scrollLeft = alvoRolagem; // chegou
            rolandoSuave = false;
            return;
        }
        // Fração do que falta que se cobre neste quadro (independe da taxa de quadros por segundo).
        const fracao = 1 - Math.exp(-dt / SUAVIDADE_ROLAGEM_CHAT);
        // Pelo menos 1 px por quadro: a posição da rolagem é arredondada em pixels e um passo menor não sairia do lugar.
        const passo = Math.sign(falta) * Math.max(1, Math.abs(falta) * fracao);
        faixa.scrollLeft += Math.abs(passo) > Math.abs(falta) ? falta : passo;
        requestAnimationFrame(passoRolagem);
    }

    function aoGirarRoda(evento: WheelEvent): void {
        if (evento.deltaY === 0) return;
        evento.preventDefault();
        // Algumas máquinas mandam o giro em "linhas" ou "páginas" em vez de pixels.
        const unidade = evento.deltaMode === 1 ? 40 : evento.deltaMode === 2 ? faixa.clientWidth : 1;
        const delta = evento.deltaY * unidade;
        if (reduzirMovimento() || SUAVIDADE_ROLAGEM_CHAT <= 0) {
            faixa.scrollLeft += delta; // sem animação (preferência do sistema)
            return;
        }
        if (!rolandoSuave) alvoRolagem = faixa.scrollLeft; // começa de onde a faixa está
        alvoRolagem = Math.min(Math.max(alvoRolagem + delta, 0), rolagemMaxima());
        if (!rolandoSuave) {
            rolandoSuave = true;
            ultimoQuadro = performance.now();
            requestAnimationFrame(passoRolagem);
        }
    }
    // A roda rola o chat sobre a faixa, e também sobre a setinha de "mensagem nova" e a barra de rolagem
    // (que ficam POR CIMA da faixa e, sem isto, engoliriam o giro quando o ponteiro estivesse em cima delas).
    for (const alvo of [faixa, botaoNovas, pegar("chat-barra")]) alvo.addEventListener("wheel", aoGirarRoda, { passive: false });
    // Quem rola por outro caminho (arrastar o cursor, setas do teclado, clicar na faixa) cancela a animação da roda.
    polegar.addEventListener("pointerdown", pararRolagemSuave);
    faixa.addEventListener("keydown", pararRolagemSuave);

    // Esc sai do campo (devolve o foco ao tabuleiro).
    campo.addEventListener("keydown", (e) => {
        if (e.key === "Escape") campo.blur();
    });

    atualizar();
    return { atualizar };
}
