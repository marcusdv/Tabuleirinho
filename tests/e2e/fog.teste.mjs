// Teste e2e: o FOG na interface (modo LOCAL). Rodar: npm run test:e2e -- fog   (precisa do servidor: npm run dev)
// Pedido do dono (17/11/2026): só o MESTRE edita o fog: um painel "Fog" (liga o fog do mapa, pincel de revelar/cobrir com tamanho, cobrir/revelar tudo); a camada cobre o mapa e some
// quando se desliga; o jogador não vê o painel. (A parte de rede, peças e desenhos escondidos é testada no `fog-servidor`.)
import { abrirPagina, lancar, ok, recolherDados, terminar } from "./ajuda.mjs";

const nav = await lancar();
const p = await nav.newPage({ viewport: { width: 1400, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(String(e)));
await abrirPagina(p);
await recolherDados(p);
const fog = () => p.evaluate(() => { const f = window.__tabuleirinho.estado.fog; return { ativo: f.ativo, tem: !!f.mascara, colunas: f.mascara?.colunas, linhas: f.mascara?.linhas }; });
// Sem o botão "Cobrir tudo" (o checkbox "Fog neste mapa" já tira e põe o fog), o teste volta tudo ao coberto pelo estado da página (só para preparar o cenário).
const cobrirTudo = async () => { await p.evaluate(() => { const m = window.__tabuleirinho.estado.fog.mascara; m.bits.fill(0xff); }); await p.waitForTimeout(100); };
// Ligar/desligar o "Fog neste mapa" pede confirmação: o helper clica na caixinha e confirma.
const alternarFog = async () => { await p.click("#fog-ativo"); await p.waitForTimeout(250); await p.click("#confirmar-ok"); await p.waitForTimeout(250); };
const coberto = (col, row) => p.evaluate(([c, r]) => { const m = window.__tabuleirinho.estado.fog.mascara; if (!m) return null; const sub = 8; const i = Math.floor(r * sub) * m.colunas * sub + Math.floor(c * sub); return (m.bits[i >> 3] & (1 << (i & 7))) !== 0; }, [col, row]);

ok("1a) o painel 'Fog' existe na pilha da esquerda (a 3ª barra)", (await p.locator("#fog .cabecalho h1").textContent()) === "Fog" && (await p.locator("#pilha .caixa-pilha").count()) === 3);
ok("1b) começa sem fog", !(await fog()).ativo);
await p.click("#fog .cabecalho");
await p.waitForTimeout(450);
ok("1c) o pincel só funciona com o fog ligado (os botões começam desabilitados)", await p.locator('#fog-botoes button[data-fog="revelar"]').isDisabled());

await p.click("#fog-ativo");
await p.waitForTimeout(300);
ok("1d) ligar o fog PEDE CONFIRMAÇÃO (e cancelar deixa o fog desligado e a caixinha desmarcada)", (await p.locator("#confirmar-titulo").textContent()) === "Ligar o fog neste mapa?");
await p.click("#confirmar-cancelar");
await p.waitForTimeout(300);
ok("1e) cancelar mantém o fog desligado", !(await fog()).ativo && !(await p.locator("#fog-ativo").isChecked()));
await alternarFog();
const f = await fog();
ok("2a) ligar 'Fog neste mapa' cria a máscara do tamanho do tabuleiro (18×10), toda COBERTA", f.ativo && f.colunas === 18 && f.linhas === 10 && (await coberto(5, 5)) === true && (await coberto(1, 1)) === true, JSON.stringify(f));
ok("2b) os botões do pincel passam a valer", !(await p.locator('#fog-botoes button[data-fog="revelar"]').isDisabled()));

// pincel de REVELAR: arrasta sobre o tabuleiro (zoom 100%, origem 124,80; casa = 64 px)
ok("3a) ao ligar o fog com a barra aberta, o REVELAR já vem selecionado", (await p.locator('#fog-botoes button[data-fog="revelar"]').getAttribute("aria-pressed")) === "true");
// A origem do tabuleiro na tela vem da CÂMERA de verdade (ela muda conforme o layout), nada de coordenadas fixas.
const cam = await p.evaluate(() => { const c = window.__tabuleirinho.camera; return { x: c.mundo.x, y: c.mundo.y, z: c.zoom }; });
const casa = (c, r) => ({ x: cam.x + (c + 0.5) * 64 * cam.z, y: cam.y + (r + 0.5) * 64 * cam.z });
const a = casa(8, 4), b = casa(11, 4);
await p.mouse.move(a.x, a.y); await p.mouse.down();
for (let i = 1; i <= 10; i++) await p.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
await p.mouse.up();
await p.waitForTimeout(300);
ok("3b) arrastar com o pincel REVELA o trecho pintado", (await coberto(9.5, 4.5)) === false && (await coberto(10.5, 4.5)) === false);
ok("3c) ...e o resto continua coberto", (await coberto(1, 1)) === true && (await coberto(16, 8)) === true);

// tamanho do pincel
await p.fill("#fog-raio", "5");
ok("4a) o tamanho do pincel aparece no painel", (await p.locator("#fog-raio-valor").innerText()) === "5");
await p.click('#fog-botoes button[data-fog="cobrir"]');
const c1 = casa(9, 5);
await p.mouse.click(c1.x, c1.y);
await p.waitForTimeout(300);
ok("4b) o pincel de COBRIR (raio 5) fecha de novo, e um raio maior cobre uma área maior", (await coberto(9.5, 4.5)) === true && (await coberto(12.5, 4.5)) === true);

// botões de tamanho (+ e −), tamanhos prontos e formatos
await p.click("#fog-raio-mais");
ok("4c) o botão + aumenta o tamanho em 0,5", (await p.locator("#fog-raio-valor").innerText()) === "5,5");
await p.click("#fog-raio-menos"); await p.click("#fog-raio-menos");
ok("4d) o botão − diminui", (await p.locator("#fog-raio-valor").innerText()) === "4,5");
await p.click('#fog-tamanhos button[data-raio="12"]');
ok("4e) os tamanhos prontos valem (12) e o escolhido fica destacado", (await p.locator("#fog-raio-valor").innerText()) === "12" && (await p.locator('#fog-tamanhos button[data-raio="12"].ativo').count()) === 1);
await cobrirTudo();
await p.click('#fog-tamanhos button[data-raio="2"]');
await p.click('#fog-formas button[data-forma="quadrado"]');
ok("4f) o formato escolhido fica marcado", (await p.locator('#fog-formas button[aria-pressed="true"]').getAttribute("data-forma")) === "quadrado");
await p.click('#fog-botoes button[data-fog="revelar"]');
const q = casa(4, 4);
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(300);
ok("4g) o pincel QUADRADO (raio 2) revela o canto (um círculo não chegaria)", (await coberto(6.3, 6.3)) === false && (await coberto(6.8, 6.8)) === true);
await p.click('#fog-formas button[data-forma="circulo"]');
await cobrirTudo();
await p.mouse.click(q.x, q.y);
await p.waitForTimeout(300);
ok("4h) o pincel redondo NÃO revela o mesmo canto", (await coberto(6.3, 6.3)) === true);

ok("4m0) a PRÉVIA do pincel existe no painel e mostra o tamanho (1 × 1 depois do 'pronto' de 0,5; aqui, o formato e as casas)", (await p.locator("#fog-previa svg").count()) === 1 && /casas/.test(await p.locator("#fog-previa-texto").innerText()));
// largura × altura independentes
await p.click('#fog-alinhamento button[data-alinhamento="livre"]');
await p.click("#fog-proporcional");
await p.click('#fog-tamanhos button[data-raio="1"]');
await p.fill("#fog-altura", "4");
ok("4m) sem 'Proporcional', largura e altura são independentes (1 × 4)", (await p.locator("#fog-raio-valor").innerText()) === "1" && (await p.locator("#fog-altura-valor").innerText()) === "4");
await p.click("#fog-altura-mais");
ok("4n) o + da altura só mexe na altura", (await p.locator("#fog-altura-valor").innerText()) === "4,5" && (await p.locator("#fog-raio-valor").innerText()) === "1");
await p.click('#fog-formas button[data-forma="quadrado"]');
await cobrirTudo();
// (clicar no pincel que já está ligado o DESLIGA: só clica se o Revelar não estiver selecionado)
if ((await p.locator('#fog-botoes button[data-fog="revelar"]').getAttribute("aria-pressed")) !== "true") await p.click('#fog-botoes button[data-fog="revelar"]');
const h = casa(13, 5);
await p.mouse.click(h.x, h.y);
await p.waitForTimeout(300);
ok("4o) um pincel 1 × 4,5 revela uma faixa ALTA e estreita", (await coberto(13.5, 8.2)) === false && (await coberto(13.5, 1.8)) === false && (await coberto(15.2, 5.5)) === true);
await p.click("#fog-proporcional");
ok("4p) religar 'Proporcional' iguala a altura à largura", (await p.locator("#fog-altura-valor").innerText()) === "1");

// modo "Área": arrastar uma caixa
await cobrirTudo();
await p.click('#fog-alinhamento button[data-alinhamento="area"]');
const a1 = casa(2, 2), a2 = casa(6, 4);
await p.mouse.move(a1.x - 20, a1.y - 20); await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(a1.x - 20 + ((a2.x - a1.x) * i) / 8, a1.y - 20 + ((a2.y - a1.y) * i) / 8);
await p.mouse.up();
await p.waitForTimeout(300);
ok("4q) no modo Área, arrastar uma caixa revela a caixa INTEIRA", (await coberto(3, 2.7)) === false && (await coberto(5, 3.5)) === false && (await coberto(1.5, 2.7)) === true && (await coberto(7, 3)) === true);
ok("4q2) na Área os botões de formato continuam valendo", !(await p.locator('#fog-formas button[data-forma="circulo"]').isDisabled()));
await p.click('#fog-formas button[data-forma="circulo"]');
await cobrirTudo();
await p.mouse.move(a1.x - 20, a1.y - 20); await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(a1.x - 20 + ((a2.x - a1.x) * i) / 8, a1.y - 20 + ((a2.y - a1.y) * i) / 8);
await p.mouse.up();
await p.waitForTimeout(300);
ok("4q3) na Área com CÍRCULO, o centro da caixa é revelado e o canto dela continua coberto", (await coberto(4.19, 3.19)) === false && (await coberto(2.4, 2.4)) === true);
await cobrirTudo();
await p.click('#fog-formas button[data-forma="triangulo"]');
await p.mouse.move(a1.x - 20, a1.y - 20); await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(a1.x - 20 + ((a2.x - a1.x) * i) / 8, a1.y - 20 + ((a2.y - a1.y) * i) / 8);
await p.mouse.up();
await p.waitForTimeout(300);
ok("4q4) na Área com TRIÂNGULO, a base é larga e o topo estreito (o canto de cima fica coberto)", (await coberto(2.6, 4.0)) === false && (await coberto(2.6, 2.4)) === true);
await p.click('#fog-alinhamento button[data-alinhamento="livre"]');

// sem pincel escolhido, clicar num modo (Livre/Por casa/Área) liga o Revelar
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
await p.click('#fog-alinhamento button[data-alinhamento="area"]');
ok("4r) sem pincel, clicar em 'Área' seleciona o Revelar", (await p.locator('#fog-botoes button[data-fog="revelar"]').getAttribute("aria-pressed")) === "true");
await p.click('#fog-alinhamento button[data-alinhamento="livre"]');

// "Revelar" livre (padrão) × por casa
ok("4i) o padrão é 'Livre'", (await p.locator('#fog-alinhamento button[aria-pressed="true"]').getAttribute("data-alinhamento")) === "livre");
await cobrirTudo();
await p.click('#fog-alinhamento button[data-alinhamento="casa"]');
ok("4j) por casa, os botões de formato continuam valendo (círculo, quadrado e triângulo)", !(await p.locator('#fog-formas button[data-forma="triangulo"]').isDisabled()) && !(await p.locator('#fog-formas button[data-forma="circulo"]').isDisabled()));
await p.click('#fog-formas button[data-forma="quadrado"]');
await p.click('#fog-tamanhos button[data-raio="0.5"]');
const t = casa(10, 6);
await p.mouse.click(t.x + 20, t.y - 20);
await p.waitForTimeout(300);
ok("4k) por casa, um clique revela a casa INTEIRA (10, 6) e só ela", (await coberto(10.05, 6.05)) === false && (await coberto(10.95, 6.95)) === false && (await coberto(11.05, 6.5)) === true && (await coberto(9.95, 6.5)) === true);
// por casa com CÍRCULO: a caixa é de casas inteiras (2 × 2) e o círculo fica dentro dela (o canto da caixa continua coberto)
await cobrirTudo();
await p.click('#fog-formas button[data-forma="circulo"]');
await p.click('#fog-tamanhos button[data-raio="1"]'); // (raio 1 = 2 × 2 casas)
const c2 = casa(10, 6);
await p.mouse.click(c2.x + 32, c2.y + 32); // (no canto entre as casas 10-11 × 6-7)
await p.waitForTimeout(300);
ok("4l) por casa com CÍRCULO: o centro da caixa de 2 × 2 casas é revelado e o canto dela continua coberto", (await coberto(11, 7)) === false && (await coberto(10.05, 6.05)) === true && (await coberto(11.95, 7.95)) === true);
await p.click('#fog-alinhamento button[data-alinhamento="livre"]');

// esc volta a Mover
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
ok("5a) Esc volta a 'Mover' (o pincel desliga)", (await p.locator('#fog-botoes button[aria-pressed="true"]').count()) === 0);
// a camada
const camadaVisivel = () => p.evaluate(() => window.__tabuleirinho.fogVisivel?.() ?? null);
await alternarFog();
ok("6a) desligar o fog o remove (a máscara some)", !(await fog()).ativo && !(await fog()).tem);
await alternarFog();
ok("6b) ligar de novo põe um fog NOVO, todo coberto", (await fog()).ativo && (await coberto(1, 1)) === true && (await coberto(9.5, 4.5)) === true);

// o jogador não vê o painel
await p.evaluate(() => document.body.classList.add("jogador"));
ok("7) o jogador NÃO vê o painel do Fog", !(await p.locator("#fog").isVisible()));
await p.evaluate(() => document.body.classList.remove("jogador"));

ok("8) nenhum erro de JavaScript", erros.length === 0, erros.join(" | "));
process.exitCode = terminar(erros);
await nav.close();
