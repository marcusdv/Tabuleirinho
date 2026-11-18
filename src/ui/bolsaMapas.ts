// =====================================================================
// A ABA "MAPAS" DA BOLSA (HTML): a biblioteca de mapas da mesa. Online, o servidor guarda as imagens (`dados/mapas/`); o MESTRE envia, troca e apaga mapas, e todos veem o mapa atual.
//   - Lista: o nome, o tamanho em pixels e em MB, e o selo "Atual" no mapa que está à vista.
//   - "Usar" (mestre): troca o mapa atual para todos. "Excluir" (mestre): apaga da biblioteca (com a caixa de confirmar). "+ Enviar mapa" (mestre): abre o seletor de arquivos.
//   - Sem o servidor (modo local), a aba só explica que os mapas compartilhados precisam do modo online (o botão "Escolher mapa" da barra Tabuleiro continua valendo, só nesta aba).
// Este módulo só desenha e avisa: quem manda no servidor é o `main.ts` (callbacks). Todo texto que vem do servidor (nomes) entra por `textContent`, nunca como HTML. A aba em si (a classe `aba-mapas`) é ligada pelo `ui/bolsa.ts`.
// =====================================================================

import { LADO_MAPA_RECOMENDADO, LADO_MINIATURA_MAPA, MAX_BYTES_MAPA } from "../config";
import { estado } from "../estado";
import type { RegistroDeMapa } from "../protocolo";

export interface OpcoesBolsaMapas {
    /** O mestre escolheu um arquivo de imagem para enviar. */
    aoEnviar(arquivo: File): void;
    /** O mestre clicou em "Usar" num mapa da biblioteca. */
    aoUsar(mapa: RegistroDeMapa): void;
    /** O mestre clicou em "Excluir" num mapa da biblioteca (quem recebe pergunta antes). */
    aoExcluir(mapa: RegistroDeMapa): void;
    /** O mestre clicou em "Mover jogadores": todos os jogadores vão para o mapa em que ele está. */
    aoMoverJogadores(): void;
    /** O mestre mudou QUEM VÊ um mapa: todos os jogadores, ou só os `usuarios` (vazio = só o mestre). */
    aoMudarQuemVe(mapa: RegistroDeMapa, todos: boolean, usuarios: string[]): void;
    /** Os nomes dos jogadores (não mestres) que estão AGORA neste mapa (para o aviso "jogadores aqui"). */
    jogadoresNoMapa(idDoMapa: string): { nome: string; semPermissao: boolean }[];
    /** Os jogadores que o mestre conhece (para a lista do menu "Quem vê"). */
    jogadoresConhecidos(): { usuario: string; nome: string }[];
}

export interface BolsaMapas {
    /** Refaz a aba com o que o estado tem agora. `online`: há conexão com o servidor (sem ela os mapas compartilhados não existem). */
    atualizar(online: boolean): void;
    /** Uma frase curta embaixo do botão (ex.: "Enviando…" ou o motivo de uma recusa). */
    mostrarAviso(texto: string, ehErro?: boolean): void;
}

function pegar<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

const formatarMB = (bytes: number): string => `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB`;

// ---------------------------------------------------------------
// MINIATURAS dos mapas (só o MESTRE as vê, só o mapa, sem ícones; pedido do dono, 18/11/2026). O navegador baixa a imagem do mapa (o servidor a entrega com cache), a REDUZ para
// `LADO_MINIATURA_MAPA` px e guarda o resultado na memória: cada mapa é gerado uma vez. Um de cada vez (fila), para não baixar vários mapas grandes juntos.
// ---------------------------------------------------------------
const miniaturas = new Map<string, string>(); // id do mapa -> endereço (blob:) da miniatura pronta
const miniaturasFalhas = new Set<string>(); // os que não deu para gerar (não insiste)
let filaDeMiniaturas: Promise<void> = Promise.resolve();

async function gerarMiniatura(id: string): Promise<string | null> {
    try {
        const resposta = await fetch(`/mapas/${id}`);
        if (!resposta.ok) return null;
        const original = await resposta.blob();
        // createImageBitmap já decodifica REDUZIDO (não guarda a imagem enorme inteira na memória).
        const bruto = await createImageBitmap(original);
        const fator = Math.min(1, LADO_MINIATURA_MAPA / Math.max(bruto.width, bruto.height));
        const largura = Math.max(1, Math.round(bruto.width * fator));
        const altura = Math.max(1, Math.round(bruto.height * fator));
        const pequeno = await createImageBitmap(bruto, { resizeWidth: largura, resizeHeight: altura, resizeQuality: "high" });
        bruto.close();
        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;
        canvas.getContext("2d")?.drawImage(pequeno, 0, 0);
        pequeno.close();
        const miniatura = await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, "image/webp", 0.8));
        return miniatura ? URL.createObjectURL(miniatura) : null;
    } catch {
        return null; // (sem miniatura: o cartão continua funcionando)
    }
}

/** Põe a miniatura do mapa `id` em `imagem` (na hora, se já está pronta; senão entra na fila). */
function pedirMiniatura(id: string, imagem: HTMLImageElement): void {
    const pronta = miniaturas.get(id);
    if (pronta) {
        imagem.src = pronta;
        return;
    }
    if (miniaturasFalhas.has(id)) return;
    filaDeMiniaturas = filaDeMiniaturas.then(async () => {
        if (!miniaturas.has(id) && !miniaturasFalhas.has(id)) {
            const url = await gerarMiniatura(id);
            if (url) miniaturas.set(id, url);
            else miniaturasFalhas.add(id);
        }
        const feita = miniaturas.get(id);
        if (feita) imagem.src = feita; // (se o cartão foi refeito enquanto isso, a próxima montagem já acha no cache)
    });
}

/** Um mapa foi apagado: sua miniatura sai da memória. */
function esquecerMiniatura(id: string): void {
    const url = miniaturas.get(id);
    if (url) URL.revokeObjectURL(url);
    miniaturas.delete(id);
    miniaturasFalhas.delete(id);
}

export function criarBolsaMapas(opcoes: OpcoesBolsaMapas): BolsaMapas {
    const botaoEnviar = pegar<HTMLButtonElement>("bolsa-mapas-enviar");
    const campoArquivo = pegar<HTMLInputElement>("bolsa-mapas-arquivo");
    const aviso = pegar("bolsa-mapas-aviso");
    const explicacao = pegar("bolsa-mapas-explicacao");
    const lista = pegar("bolsa-mapas-lista");
    const campoBusca = pegar<HTMLInputElement>("bolsa-mapas-busca");
    const botaoMover = pegar<HTMLButtonElement>("bolsa-mapas-mover");
    const botaoConfigurar = pegar<HTMLButtonElement>("bolsa-mapas-configurar");
    const janela = pegar("mapas-tabuleiro");
    const tituloJanela = pegar("mapas-tabuleiro-titulo");
    const notaJanela = pegar("mapas-tabuleiro-nota");
    const grade = pegar("mapas-tabuleiro-grade");
    let online = false;
    let mapaDaJanela: RegistroDeMapa | null = null; // o mapa cuja configuração a janela mostra (null = o único tabuleiro do modo local)

    // ---------------------------------------------------------------
    // A JANELA DO TABULEIRO (colunas, linhas, mapa de fundo, grade), FORA da caixa do chat: abre pelo ⚙ de cada mapa (pedido do dono, 17/11/2026). As configurações valem para o mapa em
    // que o mestre ESTÁ; para outro mapa os controles ficam travados e a nota diz para usar o mapa primeiro.
    // ---------------------------------------------------------------
    function atualizarJanela(): void {
        const outroMapa = online && mapaDaJanela !== null && estado.mapaId !== mapaDaJanela.id;
        tituloJanela.textContent = mapaDaJanela ? `Tabuleiro: ${mapaDaJanela.nome}` : "Tabuleiro"; // (o nome vem de fora: textContent)
        notaJanela.hidden = !outroMapa;
        grade.toggleAttribute("inert", outroMapa);
        grade.classList.toggle("travada", outroMapa);
    }
    function abrirJanela(mapa: RegistroDeMapa | null): void {
        mapaDaJanela = mapa;
        janela.hidden = false;
        atualizarJanela();
    }
    function fecharJanela(): void {
        janela.hidden = true;
    }
    pegar("mapas-tabuleiro-fechar").addEventListener("click", fecharJanela);
    pegar("mapas-tabuleiro-ok").addEventListener("click", fecharJanela); // (o OK no pé da janela)
    document.addEventListener("keydown", (e) => {
        // (Esc dentro de um campo da janela só sai do campo, como sempre; fora dele fecha a janela.)
        if (e.key === "Escape" && !janela.hidden && !(e.target instanceof HTMLInputElement)) fecharJanela();
    });
    botaoConfigurar.addEventListener("click", () => (janela.hidden ? abrirJanela(null) : fecharJanela()));
    botaoMover.addEventListener("click", () => opcoes.aoMoverJogadores());

    botaoEnviar.title = `Enviar uma imagem (PNG, JPEG ou WebP, até ${MAX_BYTES_MAPA / 1048576} MB) para a biblioteca e usá-la como o mapa de todos`;
    botaoEnviar.addEventListener("click", () => campoArquivo.click());
    campoArquivo.addEventListener("change", () => {
        const arquivo = campoArquivo.files?.[0];
        campoArquivo.value = ""; // (escolher o mesmo arquivo de novo também dispara)
        if (arquivo) opcoes.aoEnviar(arquivo);
    });

    function mostrarAviso(texto: string, ehErro = false): void {
        aviso.textContent = texto;
        if (ehErro) aviso.dataset.erro = "";
        else delete aviso.dataset.erro;
    }

    /** O menu flutuante de QUEM VÊ um mapa: "Mestre" (sempre, travada), "Todos os jogadores" e uma caixa por jogador conhecido. Cada marcação vale na hora. */
    let menuQuem: HTMLElement | null = null;
    function fecharMenuQuem(): void {
        menuQuem?.remove();
        menuQuem = null;
        document.removeEventListener("pointerdown", fecharAoApertarFora, true);
    }
    function fecharAoApertarFora(e: PointerEvent): void {
        if (menuQuem && !menuQuem.contains(e.target as Node) && !(e.target as HTMLElement).closest(".bolsa-mapa-quem")) fecharMenuQuem();
    }
    function abrirMenuQuemVe(mapa: RegistroDeMapa, botao: HTMLElement): void {
        const reabrir = menuQuem !== null;
        fecharMenuQuem();
        if (reabrir && botao.getAttribute("aria-expanded") === "true") {
            botao.setAttribute("aria-expanded", "false");
            return;
        }
        botao.setAttribute("aria-expanded", "true");
        let todos = mapa.quemVe?.todos ?? true;
        let usuarios = [...(mapa.quemVe?.usuarios ?? [])];
        const menu = document.createElement("div");
        menu.className = "status-menu-grupos"; // (o mesmo visual do menu de grupos e de "Quem vê" dos status)
        menu.setAttribute("role", "menu");
        const linha = (texto: string, ligado: boolean, travada: boolean, aoMudar: (v: boolean) => void): HTMLElement => {
            const rotulo = document.createElement("label");
            const campo = document.createElement("input");
            campo.type = "checkbox";
            campo.checked = ligado;
            campo.disabled = travada;
            campo.addEventListener("change", () => {
                aoMudar(campo.checked);
                opcoes.aoMudarQuemVe(mapa, todos, usuarios);
                desenhar();
            });
            const nome = document.createElement("span");
            nome.textContent = texto; // (o nome do jogador vem de fora: textContent)
            rotulo.append(campo, nome);
            return rotulo;
        };
        const desenhar = (): void => {
            const conhecidos = opcoes.jogadoresConhecidos();
            const linhas = [
                linha("Mestre", true, true, () => undefined),
                linha("Todos os jogadores", todos, false, (v) => (todos = v)),
                ...conhecidos.map((j) => linha(j.nome, todos || usuarios.includes(j.usuario), todos, (v) => (usuarios = v ? [...usuarios, j.usuario] : usuarios.filter((u) => u !== j.usuario)))),
            ];
            if (conhecidos.length === 0) {
                const vazio = document.createElement("p");
                vazio.className = "status-menu-vazio";
                vazio.textContent = "Nenhum jogador conhecido ainda: eles aparecem aqui depois de entrar na mesa.";
                linhas.push(vazio);
            }
            menu.replaceChildren(...linhas);
        };
        desenhar();
        document.body.append(menu);
        const r = botao.getBoundingClientRect();
        const caixa = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - caixa.width - 4))}px`;
        menu.style.top = `${r.bottom + caixa.height + 8 > window.innerHeight ? Math.max(4, r.top - caixa.height - 4) : r.bottom + 4}px`;
        menuQuem = menu;
        document.addEventListener("pointerdown", fecharAoApertarFora, true);
    }

    function criarLinha(mapa: RegistroDeMapa, ehMestre: boolean): HTMLLIElement {
        const atual = estado.mapaId === mapa.id;
        const item = document.createElement("li");
        item.className = "bolsa-mapa" + (atual ? " atual" : "");
        item.dataset.id = mapa.id;

        if (ehMestre) {
            // A MINIATURA (só o mestre): só o mapa, sem ícones nem nada por cima. Antes de ficar pronta, a caixa já tem o tamanho certo (a proporção da imagem).
            const miniatura = document.createElement("img");
            miniatura.className = "bolsa-mapa-miniatura";
            miniatura.alt = ""; // (decorativa: o nome do mapa já está logo abaixo)
            miniatura.decoding = "async";
            miniatura.draggable = false;
            miniatura.style.aspectRatio = `${mapa.largura} / ${mapa.altura}`;
            pedirMiniatura(mapa.id, miniatura);
            item.append(miniatura);
        }

        const nome = document.createElement("span");
        nome.className = "bolsa-mapa-nome";
        nome.textContent = mapa.nome;
        nome.title = mapa.nome;
        const info = document.createElement("span");
        info.className = "bolsa-mapa-info";
        info.textContent = `${mapa.largura}×${mapa.altura} px · ${formatarMB(mapa.bytes)}`;
        if (Math.max(mapa.largura, mapa.altura) > LADO_MAPA_RECOMENDADO) {
            // Mapa muito grande: muitos computadores o reduzem e ele pesa no desempenho. O mestre é aconselhado a excluí-lo (só um conselho).
            info.textContent += " · ⚠ grande demais";
            info.title = `Mapa grande demais (acima de ${LADO_MAPA_RECOMENDADO} px): recomendamos excluí-lo para não prejudicar o desempenho. Muitas placas de vídeo o reduzem.`;
            item.classList.add("grande-demais");
        }

        const acoes = document.createElement("div");
        acoes.className = "bolsa-mapa-acoes";
        if (atual) {
            const selo = document.createElement("span");
            selo.className = "bolsa-mapa-selo";
            selo.textContent = "Atual";
            acoes.append(selo);
        } else if (ehMestre) {
            const usar = document.createElement("button");
            usar.type = "button";
            usar.className = "bolsa-mapa-usar";
            usar.textContent = "Usar";
            usar.title = `Ir para "${mapa.nome}" (os jogadores continuam onde estão, até você clicar em "Mover jogadores")`;
            usar.addEventListener("click", () => opcoes.aoUsar(mapa));
            acoes.append(usar);
        }
        if (ehMestre) {
            // QUEM VÊ este mapa (um menu suspenso com caixas, como o dos status): todos os jogadores, jogadores específicos ou só o mestre.
            const q = mapa.quemVe ?? { todos: true, usuarios: [] };
            const quem = document.createElement("button");
            quem.type = "button";
            quem.className = "bolsa-mapa-quem";
            quem.title = "Quem vê este mapa (o mestre sempre vê)";
            quem.setAttribute("aria-haspopup", "menu");
            quem.textContent = q.todos ? "Todos ▾" : q.usuarios.length === 0 ? "Só o mestre ▾" : `${q.usuarios.length} jogador${q.usuarios.length === 1 ? "" : "es"} ▾`;
            quem.addEventListener("click", () => abrirMenuQuemVe(mapa, quem));
            acoes.append(quem);
        }
        if (ehMestre) {
            const configurar = document.createElement("button");
            configurar.type = "button";
            configurar.className = "bolsa-mapa-config";
            configurar.textContent = "⚙";
            configurar.title = `Configurar o tabuleiro de "${mapa.nome}" (colunas, linhas, mapa de fundo, grade)`;
            configurar.setAttribute("aria-label", `Configurar o tabuleiro do mapa ${mapa.nome}`);
            configurar.addEventListener("click", () => abrirJanela(mapa));
            acoes.append(configurar);
        }
        if (ehMestre) {
            const excluir = document.createElement("button");
            excluir.type = "button";
            excluir.className = "bolsa-mapa-excluir";
            excluir.textContent = "✕";
            excluir.title = `Excluir "${mapa.nome}" da biblioteca`;
            excluir.setAttribute("aria-label", `Excluir o mapa ${mapa.nome}`);
            excluir.addEventListener("click", () => opcoes.aoExcluir(mapa));
            acoes.append(excluir);
        }
        // O layout é EMPILHADO (cabe na coluna estreita): o nome em cima; embaixo dele o tamanho, bem pequeno e apagado; depois "jogadores aqui" (se há jogadores neste mapa); e por último o menu e os botões.
        const aqui = opcoes.jogadoresNoMapa(mapa.id);
        item.append(nome, info);
        if (aqui.length > 0) {
            const aviso = document.createElement("span");
            aviso.className = "bolsa-mapa-aqui";
            const sem = aqui.filter((j) => j.semPermissao).length;
            // O TOTAL ao lado do aviso e, entre eles, quantos NÃO têm permissão de ver este mapa (o tabuleiro deles fica vazio).
            aviso.textContent = `(jogadores aqui: ${aqui.length}${sem > 0 ? ` · ${sem} sem permissão` : ""})`;
            aviso.classList.toggle("com-problema", sem > 0);
            aviso.title = `Jogadores neste mapa: ${aqui.map((j) => j.nome + (j.semPermissao ? " (sem permissão para ver)" : "")).join(", ")}`; // (os nomes vêm de fora: textContent / title)
            item.append(aviso);
        }
        item.append(acoes);
        return item;
    }

    /** Sem acento nem maiúsculas: a pesquisa acha "Caverna" digitando "caverna" ou "cáverna". */
    const normalizar = (texto: string): string => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    campoBusca.addEventListener("input", () => atualizar(online));

    function atualizar(estaOnline: boolean): void {
        online = estaOnline;
        const ehMestre = online && estado.mestre;
        botaoEnviar.hidden = !ehMestre;
        botaoMover.hidden = !ehMestre;
        botaoConfigurar.hidden = online; // (online, a configuração abre pelo ⚙ de cada mapa; sem servidor há um tabuleiro só)
        if (mapaDaJanela !== null && !estado.mapas.some((m) => m.id === mapaDaJanela?.id)) fecharJanela(); // (o mapa foi apagado)
        atualizarJanela();
        lista.hidden = !online;
        campoBusca.hidden = !online || estado.mapas.length === 0; // (a pesquisa só faz sentido com mapas na biblioteca)
        explicacao.hidden = false;
        if (!online) {
            explicacao.textContent = 'Os mapas compartilhados ficam no servidor: abra o jogo no modo online (?online) para enviar mapas e escolher o de todos. Neste modo, "Escolher mapa" (na janela do tabuleiro) troca o mapa só nesta aba.';
            lista.replaceChildren();
            return;
        }
        const busca = normalizar(campoBusca.value.trim());
        const visiveis = busca === "" ? estado.mapas : estado.mapas.filter((m) => normalizar(m.nome).includes(busca));
        if (estado.mapas.length === 0) explicacao.textContent = ehMestre ? 'Nenhum mapa ainda. Use "+ Enviar mapa".' : "Nenhum mapa na biblioteca ainda.";
        else if (visiveis.length === 0) explicacao.textContent = `Nenhum mapa encontrado para "${campoBusca.value.trim()}".`; // (o texto vem de quem digitou: textContent)
        else explicacao.hidden = true;
        for (const id of [...miniaturas.keys()]) if (!estado.mapas.some((m) => m.id === id)) esquecerMiniatura(id); // (mapas apagados)
        lista.replaceChildren(...visiveis.map((m) => criarLinha(m, ehMestre)));
    }

    atualizar(false);
    return { atualizar, mostrarAviso };
}
