// =====================================================================
// O ÍCONE de um tipo de ping no HTML (menu do botão direito e roda de pings): o SVG do dono (`public/images/svgs/pings/`) como MÁSCARA pintada com a cor do tipo.
// Os dados (arquivo e cor) vêm da tabela `DADOS_DAS_FORMAS_DE_PING` do config.ts, então um tipo novo não precisa de CSS.
// =====================================================================

import { DADOS_DAS_FORMAS_DE_PING, FORMAS_ESPECIAIS_DE_PING } from "../config";

export type FormaEspecialDePing = (typeof FORMAS_ESPECIAIS_DE_PING)[number];

const corCss = (cor: number): string => `#${cor.toString(16).padStart(6, "0")}`;

/** Um <span> com o ícone do tipo (o tamanho vem do contêiner; a cor é a do tipo). */
export function criarIconeDePing(forma: FormaEspecialDePing): HTMLSpanElement {
    const dados = DADOS_DAS_FORMAS_DE_PING[forma];
    const icone = document.createElement("span");
    icone.className = "icone-svg icone-ping";
    icone.style.setProperty("--icone", `url("/images/svgs/pings/${dados.arquivo}.svg")`);
    icone.style.color = corCss(dados.cor);
    icone.setAttribute("aria-hidden", "true");
    return icone;
}
