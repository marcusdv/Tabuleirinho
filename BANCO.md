# BANCO.md — Usuários, mesas e convites (Tabuleirinho)

> **Estado: SÓ DESENHO. Nada disto está implementado.** Hoje o servidor não tem contas: a pessoa se identifica pelo apelido (`?nome=`), todos veem tudo e qualquer um mexe em qualquer token. Este arquivo descreve para onde vamos. Decisões de produto e ideias soltas continuam em `BRAINSTORM.md`; as regras de segurança também.

## Decisões já tomadas
- **Banco e login: Supabase** (Auth + Postgres com RLS + Edge Functions).
- **Risco aceito (decisão do dono):** projetos gratuitos do Supabase são pausados depois de um tempo sem atividade (a restauração é feita pelo painel). Os termos e limites do plano gratuito mudam: conferir a página de preços antes de depender deles.
- **O estado do jogo NÃO vai para o banco.** Tokens, fichas e chat continuam em arquivos na máquina de quem hospeda a mesa (`dados/`). O banco guarda só **quem é quem**: jogadores, mesas, participantes e convites.
- **O servidor de cada mestre não fala com o banco.** Ele só confere um **token assinado** (com a chave PÚBLICA). Assim, trocar de banco no futuro não muda o servidor.
- **O papel (mestre ou convidado) vale por MESA, não por usuário.** A mesma pessoa pode ser mestre numa mesa e convidada em outra.
- **O servidor nunca confia no que o navegador diz sobre o próprio papel.** O papel só vale se vier no token assinado.

## As tabelas

`auth.users` é do Supabase (email, senha com hash, `id` UUID). Nós não mexemos nela.

### `perfis` (o jogador)
| campo | o que é |
|---|---|
| `id` | o mesmo `id` de `auth.users` (chave) |
| `apelido` | nome mostrado na mesa e no chat |
| `criadoEm` | quando criou a conta |

Campos extras (avatar, cor, idioma...) entram aqui depois, sem mexer no resto. **Pedido do dono:** o usuário escolhe a **cor** e a **foto** (`avatar`: uma miniatura WebP pequena, com limite de bytes); a foto aparece no topo das mensagens do chat e nos cartões de rolagem (ver `BRAINSTORM.md`, seção do Chat). Em aberto: o avatar mora no próprio campo do banco ou num arquivo no Storage do Supabase, e como chega ao servidor do mestre sem inchar o token de entrada. Só o `id` circula pelo jogo; o apelido é só para mostrar (pode repetir).

### `mesas`
| campo | o que é |
|---|---|
| `id` | identificador da mesa |
| `nome` | nome da mesa |
| `donoId` | o jogador que a criou |
| `enderecoServidor` | onde está o servidor do mestre (ex.: o endereço do túnel) |
| `criadaEm` | quando foi criada |

### `participantes` (liga jogadores a mesas)
| campo | o que é |
|---|---|
| `mesaId` | qual mesa |
| `usuarioId` | qual jogador |
| `papel` | `mestre` ou `convidado` |
| `entrouEm` | quando entrou |

A chave é o par (`mesaId`, `usuarioId`): no máximo uma linha por pessoa em cada mesa.

### `convites`
| campo | o que é |
|---|---|
| `codigo` | texto aleatório e longo, impossível de adivinhar |
| `mesaId` | para qual mesa |
| `papel` | com que papel a pessoa entra |
| `expiraEm` | validade |
| `usosMax` e `usos` | quantas vezes pode ser usado, e quantas já foi |

## Como funciona cada situação

**Criar conta.** Cadastro pelo Supabase; criamos a linha em `perfis` com o apelido.

**Criar uma mesa.** O mestre cria a linha em `mesas` (ele é o `donoId`) e uma linha em `participantes` com `papel = mestre`. Ele roda o servidor na máquina dele e informa o endereço.

**Convidar.**
1. O mestre gera um convite (linha em `convites`: código aleatório, validade, limite de usos).
2. Ele manda o link (algo como `.../convite/CODIGO`).
3. O convidado abre o link e faz login (ou cria a conta).
4. O site confere o código: existe, não expirou, ainda tem usos.
5. Se estiver tudo certo, cria a linha em `participantes` com `papel = convidado` e aumenta `usos`.

**Entrar para jogar.**
1. Em "minhas mesas", a pessoa clica em entrar.
2. A **Edge Function** confere se ela está em `participantes` daquela mesa; se não estiver, recusa.
3. Se estiver, a função **assina um token curto** com `usuarioId`, `mesaId` e `papel` (validade de minutos a uma hora, renovado enquanto a pessoa está logada).
4. O navegador abre a conexão com o servidor do mestre e envia o token.
5. O servidor do mestre confere a **assinatura** com a chave pública. Se for válida, sabe quem é a pessoa e qual o papel dela, **sem consultar o banco**.

**Durante o jogo.** O servidor usa `usuarioId` e `papel` do token e aplica o modelo de permissões da próxima seção. Toda permissão é decidida no servidor, nunca na interface.

## Permissões sobre tokens e fichas (decisão do dono)
- Um jogador pode ter **vários personagens**: várias fichas e vários tokens, e pode **controlar mais de um token** se o mestre lhe der essa permissão.
- O jogador também pode **criar o seu próprio token e a sua própria ficha**; ele é o dono do que cria.
- Ele **não pode interagir com o que não é dele nem lhe foi liberado**: nem mover, nem editar, nem excluir, nem rolar, nem abrir a ficha de outra pessoa.
- **O mestre pode tudo** na mesa dele.

**Onde isto fica guardado:** NÃO no banco do Supabase. Tokens e fichas são arquivos no servidor do mestre (`dados/tokens/`, `dados/fichas/`), então as permissões também ficam lá, dentro de cada arquivo:
- `donoId`: o `id` do jogador que criou (quando criado pelo mestre, o dono é o mestre).
- `controladoPor`: lista de `id`s de jogadores que o mestre liberou além do dono (campo opcional: arquivos antigos sem ele continuam válidos, só o dono e o mestre mexem).

**Regra de cada ação no servidor:** ela só vale se o `usuarioId` do token for o mestre, o `donoId` ou estiver em `controladoPor` daquele token ou ficha. Isso vale para `colocar_token`, `guardar_token`, `editar_token`, `excluir_token`, `editar_ficha`, `excluir_ficha` e `rolar_ficha`. Pedido sem permissão é recusado, sem revelar detalhes.

**Pontos a decidir quando for implementar:**
- Quem pode **ver** uma ficha: só o dono, os liberados e o mestre (o padrão sugerido). A bolsa de um jogador mostra só o que é dele.
- Liberar o controle de um token também libera a ficha ligada a ele? (A ligação ficha↔token ainda não existe.)
- Limite de tokens e fichas por jogador, para um convidado não encher a mesa (hoje o limite é global: `MAX_TOKENS` e `MAX_FICHAS`).
- O mestre pode **transferir** a posse (mudar o `donoId`) e **retirar** uma permissão a qualquer momento.

## Onde cada parte roda (e o que precisa de hospedagem)
- **O servidor do jogo É o site do jogo:** o `npm run servidor` (Node + `ws`) entrega a interface (a pasta `dist/` do `npm run build`) e cuida do WebSocket. Ele roda na **máquina de quem mestra**; não precisa de Vercel nem de hospedagem nenhuma.
- **Só o site central precisa ficar online o tempo todo:** cadastro, login, criação de mesa, convites e a emissão do token de entrada assinado.
- **Esse site central pode ser só páginas ESTÁTICAS** (HTML, JS e CSS gerados pelo Vite), sem backend próprio: o Supabase faz o trabalho de servidor (Auth = contas e login; Postgres = jogadores, mesas e convites; Edge Function = assina o token). Hospedagem gratuita serve: **Cloudflare Pages** (recomendada: o dono já usa a Cloudflare), Vercel ou GitHub Pages.
- **Continua em aberto o CAMINHO até o servidor do mestre:** os jogadores precisam conseguir chegar à máquina dele (túnel como o cloudflared, ou porta aberta no roteador). O site central só diz quem pode entrar e informa o endereço da mesa; o mestre precisa deixar o servidor ligado durante a sessão.

## O que NÃO vai para o banco (decisão do dono)
- **Grupos e favoritos de tokens e fichas** são organização do JOGO, não de contas: ficam só em **arquivos locais** (`dados/grupos/`, e os campos `favorito`/`grupos` dentro de cada token e ficha), na máquina de quem hospeda. **Nada disso entra no Supabase.**
- **Favoritos por jogador (futuro):** quando houver contas, a estrela passa a ser de cada usuário (hoje vale para a mesa toda). Também fica FORA do banco, chaveada pelo `usuarioId` que vem no token assinado; **em aberto** se mora num arquivo no servidor do mestre (ex.: `dados/favoritos/<usuarioId>.json`) ou no navegador do jogador.
- **Grupos × permissões:** hoje não há regra de quem cria/edita/exclui grupos (qualquer um na mesa); com contas isso entra nas regras de permissão do servidor (ver "Permissões sobre tokens e fichas").

## Quem protege o quê
- **Banco (RLS):** cada pessoa lê só o próprio perfil e as mesas em que participa; só o mestre cria convites e remove participantes; ninguém se promove a mestre editando a própria linha.
- **Edge Function:** é a ÚNICA que assina tokens. A chave privada de assinatura fica só nela.
- **Servidor do mestre:** só confere a assinatura e aplica as regras do jogo. **Não tem nenhuma chave do banco.**
- **A chave `service_role` do Supabase NUNCA vai para o navegador nem para a máquina do mestre** (ela ignora todas as regras de acesso).

## Casos que pedem cuidado
- **Expulsar alguém:** o mestre apaga a linha em `participantes`; a pessoa só perde o acesso quando o token vencer (por isso ele é curto). Para ser imediato, o servidor também mantém uma lista local de bloqueados.
- **Convite vazado:** validade e limite de usos limitam o estrago, e o mestre pode apagar o convite.
- **Saída do dono da mesa:** decidir se a mesa acaba ou passa para outro (liga com a pergunta dos co-mestres).
- **Apelido repetido:** sem problema, tudo usa o `id`.
- **Supabase pausado:** quem já tem um token válido continua entrando até ele vencer; ninguém novo entra e ninguém renova o token. O mestre (ou o dono do projeto) precisa restaurar o projeto pelo painel.

## Por que cresce bem
- Campos novos do jogador vão em `perfis`, sem tocar nas mesas.
- Um papel novo (ex.: "espectador") é só um valor novo em `papel`.
- Trocar o Supabase por outro banco não muda o servidor do mestre: ele só confere um token assinado.

## Ordem sugerida de implementação
1. **Servidor primeiro, sem Supabase:** identificar cada conexão pelo `id` (e não pelo apelido), aceitar um token no formato final assinado por uma **chave de teste** e ter papéis. Dá para testar tudo localmente.
2. Primeiras permissões: `donoId` e `controladoPor` em tokens e fichas, e a regra de cada ação no servidor (ver "Permissões sobre tokens e fichas").
3. Criar o projeto no Supabase, as tabelas com RLS e a Edge Function que assina o token (só muda quem assina).
4. Tela de login e "minhas mesas" no site.

## Perguntas em aberto
- Pode haver **co-mestres** numa mesma mesa, ou só um mestre? (Muda `participantes` e o que acontece quando o dono sai.)
- ~~Vários personagens por jogador, dono do token/ficha, controlar mais de um token com permissão~~: **decidido** (ver "Permissões sobre tokens e fichas").
- Qual a validade ideal do token de entrada e como renovar sem derrubar a conexão?
- Os dados do jogo ficam só na máquina do mestre: se ela some, a mesa some. Decidir como fazer backup (ver `BRAINSTORM.md`).
