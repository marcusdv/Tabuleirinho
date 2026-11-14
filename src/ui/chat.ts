// =====================================================================
// CHAT (HTML): uma COLUNA fixa na borda direita da tela. As mensagens correm de CIMA para BAIXO:
// a mais NOVA fica EMBAIXO (como num aplicativo de conversa) e o campo de digitar fica no pé da coluna.
// A roda do mouse (ou a barra de rolagem do site) rola a lista para ver as antigas.
//
// Se a lista está no FIM (lendo o mais recente), a mensagem nova entra e a lista acompanha. Se a pessoa
// subiu para ler as antigas, a lista NÃO se mexe e aparece o botão "↓ Novas mensagens".
// A mensagem nova ENTRA com um fade e um pequeno deslize de baixo; quem pede "reduzir movimento" no sistema não vê animação.
//
// A marcação e o CSS ficam no index.html; aqui só ligamos os elementos.
// =====================================================================

import { DURACAO_ANIMACAO_CHAT, MAX_CARACTERES_MENSAGEM, MAX_DADOS_NO_CARTAO } from "../config";
import { detalheDaRolagem, formulaDosDados } from "../dados";
import { estado, type Mensagem } from "../estado";

export interface OpcoesChat {
    /** O usuário enviou uma mensagem (texto já sem espaços nas pontas e nunca vazio). */
    aoEnviar(texto: string): void;
    /** O painel do chat está à vista? (Ele fica escondido quando a aba "Bolsa" está aberta: então a lista não rola nem anima.) */
    visivel(): boolean;
    /** Chegaram mensagens enquanto o chat estava escondido (a aba "Chat" mostra o contador de não lidas). */
    aoChegarEscondida(quantas: number): void;
}

export interface Chat {
    /** Sincroniza a lista com estado.mensagens (só acrescenta o que é novo, com animação). */
    atualizar(): void;
    /** O chat voltou a ficar à vista (a pessoa abriu a aba "Chat"): leva a lista ao fim, onde está a mensagem mais recente. */
    mostrou(): void;
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

/** Até quantos pixels do fim da lista ainda contam como "estou lendo o mais recente". */
const FOLGA_DO_FIM = 40;

/** Um grupo de dados iguais que saiu numa rolagem (ex.: o "2d6" de "2d6 + 3"). */
interface GrupoDeDados {
    lados: number;
    resultados: number[];
}

/** O cartão é CRÍTICO (um único d20 e deu 20), FALHA CRÍTICA (um único d20 e deu 1) ou comum? Com mais de um d20 (vantagem etc.) não destaca o cartão. */
function marcaDoCartao(grupos: GrupoDeDados[]): "critico" | "falha" | null {
    const d20 = grupos.filter((g) => g.lados === 20).flatMap((g) => g.resultados);
    if (d20.length !== 1) return null;
    return d20[0] === 20 ? "critico" : d20[0] === 1 ? "falha" : null;
}

/**
 * A BANDEJA de dados: cada dado vira uma peça com o valor (grande) e o tipo ("d20", pequeno). O valor máximo do dado fica verde e o 1 fica vermelho.
 * `modificador` (se não for 0) vira uma etiqueta no fim. Mostra no máximo `maximo` peças e termina com "+N" (a lista completa vai na dica do mouse).
 * Tudo entra por textContent/createElement.
 */
function montarBandeja(grupos: GrupoDeDados[], modificador: number, maximo: number): HTMLElement {
    const bandeja = document.createElement("div");
    bandeja.className = "chat-dados";
    let mostrados = 0;
    let total = 0;
    for (const g of grupos) total += g.resultados.length;
    for (const g of grupos) {
        for (const valor of g.resultados) {
            if (mostrados >= maximo) break;
            const peca = document.createElement("span");
            peca.className = "chat-dado";
            if (valor === g.lados) peca.classList.add("maximo");
            else if (valor === 1 && g.lados >= 4) peca.classList.add("minimo");
            const numero = document.createElement("b");
            numero.textContent = String(valor);
            const tipo = document.createElement("small");
            tipo.textContent = `d${g.lados}`;
            peca.append(numero, tipo);
            bandeja.append(peca);
            mostrados += 1;
        }
    }
    if (total > mostrados) {
        const resto = document.createElement("span");
        resto.className = "chat-dado chat-dado-resto";
        resto.textContent = `+${total - mostrados}`;
        resto.title = grupos.map((g) => `d${g.lados}: ${g.resultados.join(", ")}`).join(" | "); // a lista COMPLETA
        bandeja.append(resto);
    }
    if (modificador !== 0) {
        const etiqueta = document.createElement("span");
        etiqueta.className = "chat-modificador";
        etiqueta.textContent = modificador > 0 ? `+${modificador}` : String(modificador);
        bandeja.append(etiqueta);
    }
    return bandeja;
}

/** Aplica a marca de crítico/falha ao cartão: só classes (brilho e cor do número). Não há mensagem escrita. */
function aplicarMarca(cartao: HTMLElement, marca: "critico" | "falha" | null): void {
    if (marca) cartao.classList.add(marca === "critico" ? "chat-critico" : "chat-falha-critica");
}

/**
 * A área do ÍCONE de quem rolou (jogador ou monstro), no canto superior direito do cartão de rolagem. Por enquanto só existe o ÍCONE PADRÃO (uma
 * silhueta cinza), porque ainda não há foto de perfil nem imagem de token ligada à rolagem. Quando houver, é aqui que a imagem entra (a área já
 * é um círculo de tamanho fixo). O desenho é um SVG estático criado por createElementNS (nada vindo do jogador vira HTML); o nome vai só na dica.
 */
function criarAvatar(nome: string): HTMLElement {
    const area = document.createElement("div");
    area.className = "chat-avatar";
    area.title = nome;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const cabeca = document.createElementNS(ns, "circle");
    cabeca.setAttribute("cx", "12");
    cabeca.setAttribute("cy", "9");
    cabeca.setAttribute("r", "4");
    const ombros = document.createElementNS(ns, "path");
    ombros.setAttribute("d", "M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z");
    svg.append(cabeca, ombros);
    area.append(svg);
    return area;
}

export function criarChat(opcoes: OpcoesChat): Chat {
    const faixa = pegar("chat-faixa");
    const formulario = pegar<HTMLFormElement>("chat-form");
    const campo = pegar<HTMLInputElement>("chat-texto");
    const botaoNovas = pegar<HTMLButtonElement>("chat-novas");
    let novasNaoVistas = 0; // mensagens que chegaram enquanto a lista estava rolada para cima (fora da tela, embaixo)
    const contador = pegar("chat-contador");
    // O navegador impede de digitar (ou colar) além do limite: o texto é cortado em MAX_CARACTERES_MENSAGEM.
    campo.maxLength = MAX_CARACTERES_MENSAGEM;

    /** Mostra "N/72" (caracteres usados / limite) e dá destaque quando o limite é atingido. */
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

            const total = document.createElement("div");
            total.className = "chat-total";
            total.textContent = String(r.total);

            // A bandeja com os dados de cada termo; a conta (com o que saiu) e o TOTAL grande ficam no rodapé.
            const grupos = r.dados.map((d) => ({ lados: d.lados, resultados: d.resultados }));
            const bandeja = montarBandeja(grupos, 0, MAX_DADOS_NO_CARTAO);
            const linha = document.createElement("div");
            linha.className = "chat-linha";
            linha.append(bandeja, total);
            aplicarMarca(cartao, marcaDoCartao(grupos));
            cartao.append(criarAvatar(mensagem.autor), cabecalho, titulo, criatura, linha);
            cartao.append(detalhe); // a conta (com os bônus fixos) fica embaixo, em cinza
            return cartao;
        }

        // Rolagem de dados: a fórmula em cima, a BANDEJA com cada dado (e o modificador), e o rodapé com a conta e o TOTAL grande.
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

            const total = document.createElement("div");
            total.className = "chat-total";
            total.textContent = String(rolagem.total);

            const grupos = [{ lados: rolagem.lados, resultados: rolagem.resultados }];
            const bandeja = montarBandeja(grupos, rolagem.modificador, MAX_DADOS_NO_CARTAO);
            const linha = document.createElement("div");
            linha.className = "chat-linha";
            linha.append(bandeja, total);
            aplicarMarca(cartao, marcaDoCartao(grupos));
            cartao.append(criarAvatar(mensagem.autor), cabecalho, formula, linha);
            cartao.append(detalhe); // (escondido por CSS nas rolagens comuns: a bandeja e a etiqueta do modificador já mostram tudo)
            return cartao;
        }

        // Se alguém escrever "<b>oi</b>", aparece exatamente assim, sem virar código.
        const texto = document.createElement("p");
        texto.textContent = mensagem.texto;

        cartao.append(cabecalho, texto);
        return cartao;
    }

    /** A lista está no fim (lendo as mais recentes)? */
    const noFim = (): boolean => faixa.scrollHeight - faixa.scrollTop - faixa.clientHeight <= FOLGA_DO_FIM;

    /** Leva a lista ao fim (a mensagem mais recente). */
    function irParaOFim(suave: boolean): void {
        faixa.scrollTo({ top: faixa.scrollHeight, behavior: suave && !reduzirMovimento() ? "smooth" : "auto" });
    }

    /**
     * Sincroniza a lista com estado.mensagens. As mensagens novas entram no FIM (a mais nova embaixo), com animação.
     * Se a pessoa estava lendo as antigas (lista rolada para cima), a lista não se mexe e o botão de "novas" aparece.
     */
    function atualizar(): void {
        // Mensagens que saíram do estado (passaram do limite): o cartão sai da lista.
        const ids = new Set(estado.mensagens.map((m) => m.id));
        for (const [id, cartao] of cartoes) {
            if (!ids.has(id)) {
                cartao.remove();
                cartoes.delete(id);
            }
        }

        const novas = estado.mensagens.filter((m) => !cartoes.has(m.id)); // da mais antiga para a mais nova
        if (novas.length === 0) return;

        const escondido = !opcoes.visivel(); // (aba "Bolsa" aberta: a lista não tem tamanho, não dá para medir nem rolar)
        const acompanhar = escondido || cartoes.size === 0 || noFim(); // lista vazia ou já no fim: segue as novas
        const criados = novas.map((mensagem) => {
            const cartao = criarCartao(mensagem);
            cartoes.set(mensagem.id, cartao);
            faixa.append(cartao); // a mais nova fica EMBAIXO
            return cartao;
        });

        if (escondido) {
            opcoes.aoChegarEscondida(novas.length); // sem animação: ninguém está vendo (ao abrir a aba, o chat vai ao fim: ver `mostrou`)
        } else if (acompanhar) {
            irParaOFim(false);
            if (!reduzirMovimento()) {
                // Os cartões novos entram com fade e um pequeno deslize vindo da ESQUERDA. (Nunca deslizar na vertical: um cartão fora do fim da
                // lista, mesmo por 0,3 s, faz a lista ter o que rolar e a barra de rolagem piscar. O eixo horizontal é cortado, então não pisca.)
                for (const cartao of criados) {
                    cartao.animate([{ opacity: 0, transform: "translateX(-24px) scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: DURACAO_ANIMACAO_CHAT, easing: CURVA });
                }
            }
        } else {
            mostrarAvisoDeNovas(novas.length); // a mensagem nova está fora da tela (embaixo): avisa com o botão
        }
    }

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

    // --- Aviso de mensagem nova (o botão embaixo da lista) ---
    // Quando chega mensagem com a lista rolada para cima, ela fica fora da tela. O botão avisa; clicar leva até a mais recente.
    // Ele some ao chegar ao fim da lista, por qualquer caminho (clique, roda, barra).
    function mostrarAvisoDeNovas(quantas: number): void {
        novasNaoVistas += quantas;
        const texto = novasNaoVistas === 1 ? "1 mensagem nova" : `${novasNaoVistas} mensagens novas`;
        botaoNovas.textContent = `↓ ${novasNaoVistas === 1 ? "1 nova" : `${novasNaoVistas} novas`}`;
        botaoNovas.title = `${texto}: ir para a mais recente`;
        botaoNovas.setAttribute("aria-label", `${texto}: ir para a mais recente`);
        botaoNovas.hidden = false;
    }
    function esconderAvisoDeNovas(): void {
        novasNaoVistas = 0;
        botaoNovas.hidden = true;
    }
    botaoNovas.addEventListener("click", () => {
        esconderAvisoDeNovas();
        irParaOFim(true);
        campo.focus(); // continua conversando sem precisar clicar de novo
    });
    faixa.addEventListener("scroll", () => {
        if (noFim()) esconderAvisoDeNovas(); // chegou ao fim: as novas já estão à vista
    });

    // Esc sai do campo (devolve o foco ao tabuleiro).
    campo.addEventListener("keydown", (e) => {
        if (e.key === "Escape") campo.blur();
    });

    function mostrou(): void {
        esconderAvisoDeNovas();
        irParaOFim(false);
    }

    atualizar();
    return { atualizar, mostrou };
}
