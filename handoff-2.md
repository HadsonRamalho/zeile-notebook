# Handoff 2 — Roadmap de features (diff de histórico, templates, paleta, menções, blocos novos)

Contexto: depois da reinvenção do shell (rail + command palette) e de uma bateria de correções de UX/mobile/i18n, o usuário pediu uma lista de features possíveis dado o que já existe no projeto, e depois pediu esse handoff pra planejar a implementação de 8 delas. Este documento existe pra dar ponto de partida concreto (arquivos, decisões já tomadas por investigação de código, riscos verificados) antes de qualquer uma virar trabalho de implementação — nenhuma foi começada ainda.

## Achado importante que afeta os itens 5–8 (blocos novos)

**Adicionar um novo tipo de bloco é uma mudança só de frontend, não precisa de migração no backend.** Verifiquei isso no código, não é suposição:

- `lib/types.ts:4-10` define `BlockType` no frontend com `"text" | "code" | "component" | "drawing" | "free_drawing" | "database_schema"`.
- `rust-server/src/models/notebook.rs:21-26` define o enum Diesel `BlockType` (ligado a um enum do Postgres) com **apenas** `Text, Code, Component, Drawing` — faltam `free_drawing` e `database_schema`, que já existem e funcionam em produção no frontend.
- A explicação: `rust-server/src/controllers/sync.rs` (o controller que persiste/sincroniza o conteúdo real via Automerge CRDT) **não referencia esse enum em nenhum lugar**. O único uso de `BlockType::Text` no backend é em `rust-server/src/controllers/notebook.rs:49`, só para semear o bloco inicial de um notebook novo — não pra validar tipos.
- Conclusão prática: o conteúdo dos blocos (tipo, linguagem, texto) viaja dentro do documento Automerge, que é schema-less do ponto de vista do Postgres/Diesel. Isso já está provado pelos blocos `free_drawing`/`database_schema` existirem sem o enum do backend saber deles.

**O que isso significa pros itens 5-8**: dá pra adicionar bloco de SQL, HTTP, LaTeX e Typst só no frontend, sem tocar em `rust-server/src/schema.rs`, sem migração Diesel, sem `diesel print-schema`. Só fica de fora dessa regra qualquer feature que precise de uma rota HTTP nova no backend (ex.: se o bloco de HTTP precisar de um proxy pra evitar CORS — ver item 6).

## Checklist compartilhado para blocos novos (itens 5, 6, 7, 8)

Toda vez que um bloco novo entrar, esses são os pontos de extensão (view atual, sem mudar nenhum):

1. `lib/types.ts:4-10` — adicionar o novo valor em `BlockType`.
2. `components/notebook/blocks/<novo>/` — pasta nova com o componente da célula (ver padrão em `components/notebook/blocks/database-schema/` como referência mais recente: fullscreen toggle, `bg-card`, `UIOptions`-like limpeza de chrome externo quando aplicável).
3. `components/notebook/reorder/reorder-item.tsx:102-127` — dispatch por `block.type === "..."` que decide qual célula renderizar; adicionar o `case`/ramo novo aqui.
4. `components/notebook/reorder/reorder-tools.tsx` — `menuRegistry`, adicionar a entrada no menu "Adicionar bloco" (view `"diagrams"` ou nova view, dependendo de onde fizer sentido agrupar).
5. `components/notebook/notebook-page.tsx` — `getInitialCode()` (conteúdo default do bloco) e `getBlockTitle()` (nome default), estender os `switch`/`Record` pro novo tipo.
6. Se o bloco precisar de biblioteca WASM pesada (SQL via sql.js, Typst via typst.ts), seguir o padrão de carregamento dinâmico já usado no Excalidraw (`components/notebook/blocks/drawing/drawing-cell.tsx`, `dynamic(..., { ssr: false })`) e no Pyodide (`lib/pyodideStore.ts`) — nunca importar essas libs no topo do módulo, sempre lazy.
7. Estilo: seguir a receita já padronizada nesta sessão pros três blocos de diagrama — fundo `bg-card` no modo embutido / `bg-background` em fullscreen, painéis flutuantes com `bg-card/85 + backdrop-blur-lg + shadow-lg + border-border`, sem sombra em conteúdo estático.

---

## 1. Diff entre versões do histórico

**Onde plugar:**
- `hooks/use-automerge-sync.ts` — `buildAutomergeHistory()` (linha ~339) já retorna `AutomergeHistoryEntry[]` com `{ timestamp, message, doc }`, mais recente primeiro (`entries.reverse()` na linha ~375). Isso já é usado hoje só pra restaurar (`restoreState`), não pra comparar.
- `components/notebook/notebook-page.tsx` — já tem `previewIndex`/`handlePreviewOlder`/`handlePreviewNewer` (adicionados na sessão anterior, navegação ▲▼ entre versões). O diff naturalmente se encaixa ali: comparar `automergeHistory[previewIndex].doc` com `automergeHistory[previewIndex + 1].doc` (a versão anterior) ou com `doc` (o estado atual, se `previewIndex === 0`).
- `fast-diff` já é dependência do projeto (usado em `hooks/use-automerge-sync.ts` e `components/notebook/blocks/block-editor.tsx` pra diffar texto de bloco durante sync) — reaproveitar pro diff visual, não precisa de lib nova.

**Decisão de design pendente:** os dois documentos (`Notebook`) têm `blocks: Block[]`. Um diff completo precisa de duas camadas:
1. Diff estrutural (blocos adicionados/removidos/reordenados) — comparar por `block.id`.
2. Diff de conteúdo por bloco (texto mudou) — aplicar `fast-diff` no `.content` de blocos que existem nas duas versões.

Sugestão: um componente `HistoryDiffView` que lista blocos com badge "adicionado"/"removido"/"modificado", e dentro de "modificado" mostra o diff de texto com `fast-diff` (inserções em verde/primary, remoções em vermelho/destructive, sem tocar no resto do bloco se for um tipo não-textual como drawing/database_schema — nesses casos, só indicar "modificado" sem diff de conteúdo, não dá pra diffar um blob binário de forma legível).

**Onde mostrar:** provavelmente um botão "Comparar com anterior" dentro do `PreviewDialog` (`components/notebook/notebook-page.tsx`), abrindo um painel/modal com o diff — não empilhar isso na própria barra flutuante (ela já está cheia com os botões ▲▼/Cancelar/Restaurar).

---

## 2. Templates públicos

**O que já existe:**
- `cloneNotebook(id)` em `lib/api/notebook-service.ts:36-38` — clone já funciona, chamado hoje via `triggerClone`/`ControlActions` (`components/notebook/notebook-controls*.tsx`), só que **de dentro** do notebook aberto, não a partir do card na listagem.
- `fetchPublicNotebooks()` — feed público já existe, é a base da página Explorar redesenhada (`app/[lang]/explore/page.tsx`).
- Privacidade por notebook já existe (`updateNotebookVisibility`/`isPublic` em `context/auth`-adjacent, `notebook-context.tsx`) — todo notebook público já é, teoricamente, "clonável".

**Decisão de escopo a tomar com o usuário antes de implementar:** duas abordagens bem diferentes:
- **(a) Simples/rápida**: qualquer notebook público é implicitamente um "template". Só adicionar um botão "Usar como modelo" direto no card do Explorar (`app/[lang]/explore/page.tsx`, dentro do `<Card>` de cada `NotebookCard`), chamando `cloneNotebook` sem precisar abrir o notebook primeiro. Zero mudança de backend.
- **(b) Curada**: um notebook só é "template" se o autor marcar explicitamente (não basta ser público). Precisa de uma coluna nova (`is_template` ou reaproveitar `BlockMetadata`-like flag) no notebook, endpoint de filtro (`/notebook/all/templates` ou querystring), e uma seção separada "Modelos" na página Explorar (ou uma aba, reaproveitando o padrão `Tabs` já usado em perfil/configurações/time). Isso **é** uma migração de backend — diferente dos blocos novos, aqui a tabela `notebooks` (Diesel, normalizada) é realmente a fonte de verdade pros metadados (privacidade, dono, etc.), então uma coluna nova é uma migração real, com `diesel migration generate` + `diesel print-schema`.

Recomendo (b) pra evitar poluir o feed público com clones de teste marcados como público só pra compartilhar, mas (a) é a opção "hoje à tarde".

---

## 3. Paleta de comandos mais rica

**Onde:** `components/notebook/sidebar/notebook-command-palette.tsx`. Hoje a paleta é: input de busca + lista plana (`flat: FlatItem[]`) construída a partir de páginas pessoais + páginas de time + duas ações fixas ("criar novo caderno"/"criar novo time"). Navegação por teclado (`activeIndex`, ArrowUp/Down/Enter) já existe e é genérica — dá pra empurrar mais itens no mesmo array `flat` sem tocar na lógica de teclado.

**Limitação real a resolver primeiro:** a paleta é renderizada pelo `NotebookRail` (`components/notebook/sidebar/notebook-rail.tsx`), que é montado **uma vez, globalmente**, por `components/layout/app-rail-shell.tsx` — o mesmo componente aparece em `/notebook`, `/profile`, `/settings`, etc. Ele não sabe em qual notebook (se algum) o usuário está agora, nem tem acesso a `addBlock`/`handleAddBlock` (que vive dentro de `components/notebook/notebook-page.tsx`, isolado por página). Então:
- Ações "globais" (ir pra Configurações, ir pro Perfil, alternar tema, criar novo caderno/time — já tem) → fáceis, só adicionar ao array `flat` existente, sem mudança estrutural.
- Ações "contextuais ao notebook aberto" (criar bloco de código Rust aqui, exportar PDF deste notebook) → precisam de uma forma de o `NotebookRail`/palette saber "qual notebook está aberto e quais ações ele expõe agora". Duas rotas possíveis: (i) um contexto React tipo `NotebookPageActionsContext` que `notebook-page.tsx` popula quando montado, e a paleta lê; (ii) manter a paleta só com ações globais e deixar ações contextuais fora do escopo por enquanto.

Recomendo começar pelas ações globais (baixo risco, reaproveita 100% da paleta atual) e tratar ações contextuais como uma v2 separada, já que precisa de uma decisão de arquitetura (contexto vs. manter simples).

---

## 4. Menções no chat

**O que já existe:**
- `hooks/use-presence.ts` — `ChatMessage` (linha ~15) e `Collaborator` (linha ~5). Confirmei: **mensagens de chat são efêmeras** (`useState<ChatMessage[]>`, só broadcast via WebSocket, sem persistência em banco) — então "menções" aqui é uma feature 100% client-side pra v1, nenhuma migração de backend.
- `components/notebook/collaboration/collab-bar.tsx` — `ChatPanel` (input+lista de mensagens) e `usePresenceUsers`/`PresenceStack` (lista de colaboradores já normalizada, usada hoje só na aba de presença) — é exatamente a lista que um autocomplete de `@menção` precisa.
- `app/global.css` já tem `--animate-presence-pulse` (usado hoje quando um colaborador aparece pela primeira vez, em `components/notebook/collaboration/live-cursors.tsx`) — reaproveitável como "pulso" visual quando alguém é mencionado, sem CSS novo.

**Implementação sugerida:**
1. No input do `ChatPanel`, detectar `@` seguido de texto e mostrar um dropdown filtrando `usePresenceUsers()` (mesmo padrão de filtro por texto já usado no `notebook-command-palette.tsx`).
2. Ao renderizar mensagens, fazer parse de `@Nome` no texto e estilizar como chip (`bg-primary/10 text-primary`, mesma linguagem visual do resto do app).
3. Quando a mensagem renderizada contém uma menção ao usuário atual, disparar o pulso visual (`animate-presence-pulse`) no avatar dele na aba de Presença, e opcionalmente um `toast` (já usamos `sonner` em vários lugares).
4. Notificação push quando mencionado — implementado depois, ver item 9 (pedido explícito posterior, muda o gatilho de detecção de menção pra também rodar no backend, não só no cliente).

---

## 5. Bloco de SQL

- Runtime: SQLite via WASM no navegador (ex.: `sql.js` ou `@sqlite.org/sqlite-wasm`) — client-only, sem sandboxing de servidor, então não entra no modelo de segurança do `rust-server/src/sec/mod.rs` (que é só pra código que compila/executa no backend: Rust/Go/C++/Zig).
- Cada bloco de SQL provavelmente precisa de um "banco" próprio em memória (por bloco, ou por notebook?) — decisão de produto: um bloco de SQL isolado (cada um cria sua própria tabela de exemplo) é mais simples; um "banco compartilhado por notebook" (várias células de SQL manipulando o mesmo schema) é mais poderoso mas precisa de um estado compartilhado entre blocos, parecido com o que `NotebookContext` já faz pra outras coisas.
- UI: editor de query (reaproveitar `BlockEditor`/CodeMirror já usado nos blocos de código, só sem linguagem "de verdade" ou com um modo SQL do CodeMirror — `@codemirror/lang-sql` existe e segue o mesmo padrão dos outros `@codemirror/lang-*` já importados em `components/notebook/blocks/block-editor.tsx`) + botão "Executar" (mesmo componente `RunButton` já usado nos blocos de código) + tabela de resultado.
- Aplicar o hook `useIsTouchDevice()` (`hooks/use-is-touch-device.ts`, criado na sessão anterior) pro autoFocus do editor, mesmo padrão dos outros blocos de código.

---

## 6. Bloco de biblioteca de requisições HTTP (importar OpenAPI)

Esse é o mais parecido com uma feature de produto nova de verdade, não só "mais um bloco":

- **CORS**: chamadas `fetch` direto do navegador pra APIs de terceiros vão bater em CORS na maioria dos casos reais. Se quisermos que funcione de forma confiável (não só "funciona pra APIs que já permitem CORS"), precisa de uma rota de proxy no backend (`rust-server/src/routes/`, um controller novo tipo `run_http_request` que repassa a requisição) — **essa parte é a única deste roadmap que não é puramente frontend**, mesmo com a descoberta do item de blocos novos, porque aqui o servidor precisa fazer a chamada de rede por nós, não é sobre persistir um tipo de bloco.
- **Import de OpenAPI**: dado uma URL ou arquivo de spec (JSON/YAML), popular uma "coleção" de requisições dentro do bloco. O projeto já gera sua própria doc OpenAPI a partir do rust-server (`utoipa`, `pnpm generate-docs`, mencionado no `CLAUDE.md` e servido em `/docs` via Swagger UI) — bom candidato pra usar como exemplo/dogfood ao testar o import (importar a própria API do Zeile).
- Estrutura de dados: provavelmente o `block.content` guarda um JSON serializado com `{ requests: [{ method, url, headers, body, name }], activeRequestId }` — parecido com uma collection do Postman/Insomnia, mas achatada.
- UI: como é bastante estado (lista de requisições + request ativo + resposta), talvez mereça um componente de duas colunas (lista de requests à esquerda, request/response à direita) — diferente do padrão "célula única" dos outros blocos; vale um `/impeccable shape` rápido antes de implementar, já que é o bloco com mais superfície de UI da lista.

---

## 7. Bloco de LaTeX

- O mais barato dos quatro: `katex` (biblioteca pura, sem WASM, ~pequena) + textarea/CodeMirror pro código-fonte + preview renderizado ao lado ou embaixo (decisão de layout: lado a lado em telas largas, empilhado em mobile — mesma lógica responsiva já usada em vários blocos, ex. `free-drawing-cell.tsx`).
- Sem sandboxing, sem preocupação de segurança (KaTeX não executa código arbitrário, só tipografia matemática).
- Adicionar `katex` ao `package.json` (única lib nova necessária pra este item).

---

## 8. Bloco de Typst

- Mais pesado que LaTeX: precisa de um compilador Typst em WASM no navegador (ex.: `@myriaddreamin/typst.ts`). Vale checar o tamanho do bundle antes de comprometer — carregar isso sempre que o notebook abre (mesmo sem um bloco Typst) seria um regresso de performance; **carregamento dinâmico obrigatório** (mesmo padrão do Excalidraw/Pyodide, nunca import estático).
- Output: Typst compila pra SVG/PNG/PDF no client. SVG é o mais barato de renderizar inline.
- Menor prioridade sugerida dos 4 blocos novos (5-8), pelo tamanho da lib e por Typst ainda ser uma ferramenta de nicho comparado a LaTeX/SQL — mas incluído porque foi pedido explicitamente.

---

## Ordem sugerida (risco/esforço crescente, não obrigatória)

1. Menções no chat (4) — só frontend, infra de presença já pronta.
2. Paleta de comandos, parte global (3) — só frontend, baixo risco.
3. Bloco de LaTeX (7) — lib pequena, sem sandboxing, sem novo padrão de UI.
4. Diff entre versões (1) — só frontend, mas precisa de um componente de diff novo (mais trabalho de UI que os anteriores).
5. Templates públicos (2) — decidir (a) vs (b) com o usuário antes de começar; (a) é rápido, (b) é migração de backend.
6. Bloco de SQL (5) — WASM novo, decisão de "banco por bloco vs. por notebook" a tomar antes.
7. Bloco de Typst (8) — WASM maior, cuidado com bundle size.
8. Bloco de HTTP/OpenAPI (6) — o único que precisa de rota nova no backend (proxy), maior superfície de UI; vale um `/impeccable shape` antes de codar.

## Como validar cada entrega

Mesma rotina de sempre neste projeto:
```bash
pnpm types:check
pnpm exec biome check --write <arquivos mexidos>
pnpm build
```
Pra blocos novos que carregam WASM, testar também que o carregamento é **lazy** (o bloco não pesa no bundle inicial se o usuário nunca adiciona um desse tipo) — inspecionar o output de `pnpm build` pra confirmar que a lib aparece num chunk separado, não no bundle principal.

## Não fazer sem confirmar com o usuário

- Não migrar o backend pelos itens 5, 7, 8 (SQL/LaTeX/Typst) — confirmado que não precisa.
- Não decidir sozinho entre a opção (a) e (b) de templates públicos — é uma escolha de produto (feed poluído vs. mais trabalho de backend), perguntar antes de codar.

---

## 9. Notificações Push (implementado em 2026-07-09)

Pedido explícito do usuário, então a restrição anterior deste documento ("não implementar push sem pedido explícito") foi superada por esse pedido. Diferente dos itens 1-8, esta é uma feature **full-stack**: cruza frontend e backend porque o gatilho (menção no chat) só existe no servidor (via WebSocket de presença), e o envio de push exige uma chave privada que nunca pode chegar ao navegador.

### Requisitos para a integração completa (mapeamento feito antes de codar)

1. **Par de chaves VAPID** (autenticação do servidor perante os serviços de push do navegador — FCM/Mozilla/etc.). Não depende de nenhuma conta externa nem segredo do usuário — é só um par de chaves EC (`prime256v1`) gerado localmente.
2. **Tabela no banco** para guardar as `PushSubscription` que cada navegador registra (`endpoint`, `p256dh`, `auth`, por `user_id`) — sem isso não tem para quem mandar o push depois.
3. **Endpoints HTTP autenticados** para o frontend registrar/remover a subscription (`POST`/`DELETE /notebook/push/subscribe`).
4. **Um gatilho real no backend** que decida *quando* mandar um push. O candidato óbvio dado o que já existe é "fui mencionado no chat" (`@Nome`), mas isso não era trivial: o WebSocket de presença (`websocket_presence_handler`) só repassava mensagens de chat como texto opaco, sem nunca saber a identidade autenticada (`user_id`) nem o nome de quem estava conectado em cada sessão — só existia um `session_id` aleatório por conexão. Foi necessário ensinar o servidor a rastrear `(user_id, name)` por sessão dentro de uma sala de presença para poder cruzar "quem tem esse nome mencionado" com "qual `user_id` real notificar".
5. **Service worker preparado para reagir a push** (`push`/`notificationclick`) — sem isso a subscription existe mas nada aparece na tela quando o payload chega.
6. **UI para o usuário conceder permissão e ativar/desativar** — a permissão do navegador (`Notification.requestPermission()`) só pode ser pedida a partir de uma ação do próprio usuário, não pode ser automática.

### O que foi implementado (sem precisar de nada do usuário)

**Backend (`rust-server/`):**
- `diesel migration generate create_push_subscriptions` + `diesel migration run` já aplicada no Postgres local (`migrations/2026-07-09-024044-0000_create_push_subscriptions/`) — tabela `push_subscriptions(id, user_id, endpoint, p256dh, auth, created_at)`, `UNIQUE(endpoint)`, índice em `user_id`. `src/schema.rs` já regenerado (`diesel print-schema`).
  - Nota lateral: `diesel.toml` tinha `custom_type_derives = [..., "Clone"]` configurado mas nunca exercitado (arquivo local, fora do git) — isso quebrava a compilação assim que o schema era regenerado, porque colidia com o `Clone` que os enums (`BlockType`, `Language` etc.) já derivam em `models/`. Removido o `"Clone"` de lá; não é uma mudança de comportamento, só corrige uma inconsistência dormente do ambiente local.
- `src/models/push_subscription.rs` — `PushSubscription`/`NewPushSubscription` (Diesel) + `PushSubscriptionRequest`/`PushUnsubscribeRequest` (DTOs de entrada, no formato exato do `PushSubscription.toJSON()` do navegador) + `upsert_push_subscription`/`delete_push_subscription`/`get_push_subscriptions_for_user`.
- `src/models/state.rs` — novo `PushState { client: HyperWebPushClient, vapid_builder: PartialVapidSignatureBuilder, subject: String }`, campo `push: Option<PushState>` em `AppState` (fica `None` se as env vars de VAPID não estiverem configuradas — o servidor sobe normalmente sem push nesse caso, em vez de falhar).
- `src/controllers/push.rs` — `load_push_state()` (lê `VAPID_PRIVATE_KEY_PATH`/`VAPID_SUBJECT`, carrega a chave privada PEM uma vez no boot), `send_push_to_user(...)` (busca as subscriptions do usuário-alvo, monta e envia via `web_push`, e **apaga do banco** qualquer subscription que o serviço de push responder como inválida/expirada — 404/410), `api_subscribe_push`/`api_unsubscribe_push`.
- `src/routes/notebook.rs` — `POST`/`DELETE /notebook/push/subscribe` (autenticado, mesmo padrão de `extract_claims_from_header` dos outros endpoints).
- `src/controllers/sync.rs` — `PresenceRoom.subscribers` passou de `HashMap<Uuid, Sender>` para `HashMap<Uuid, PresenceMember>`, onde `PresenceMember` guarda `tx` + `user_id: Option<Uuid>` (da autenticação da conexão) + `name: Option<String>` (preenchido a partir da própria mensagem `"type":"presence"` que o cliente já manda).
- `src/controllers/websocket.rs` (`handle_presence_socket`) — ao receber `"type":"chat"`, procura `@Nome` no texto contra os nomes conhecidos dos outros membros conectados na sala; para cada `user_id` autenticado mencionado, dispara `send_push_to_user` numa task separada (não bloqueia o relay da mensagem). O relay de mensagens em si continua idêntico ao anterior.
- `.env`/`.env.example` (`rust-server/`) — `VAPID_PRIVATE_KEY_PATH`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`. Chave real gerada localmente com `openssl ecparam` e guardada em `rust-server/vapid_private.pem` (git-ignorado, adicionado `*.pem` ao `.gitignore` do backend).
- `cargo check`/`cargo build` rodam limpos (só 2 warnings pré-existentes, sem relação com esta feature). Confirmei pelo log do próprio processo que o VAPID carrega com sucesso no boot ("Web Push configurado").

**Frontend:**
- `hooks/use-push-subscription.ts` — pede permissão, assina via `pushManager.subscribe`, manda a subscription pro backend, expõe `subscribe`/`unsubscribe`/`isSubscribed`/`permission`/`isSupported`.
- `lib/api/push-service.ts` — `subscribeToPush`/`unsubscribeFromPush`.
- `app/sw.ts` — listeners `push` (mostra a notificação com `self.registration.showNotification`) e `notificationclick` (foca a aba já aberta do caderno mencionado, ou abre uma nova).
- `components/interface/settings/settings-form.tsx` — toggle "Notificações push" na aba Geral das Configurações (só aparece se `isSupported`; desabilitado com aviso se o navegador já negou a permissão).
- `.env`/`.env.local` (raiz) — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, mesmo valor da chave pública do backend.

### O que falta / precisa de mim (ou do usuário) antes de considerar "pronto"

1. **Reiniciar o `rust-server` rodando** — existe um processo `target/release/rust-server` já de pé (PID visto durante a implementação, ~24min de uptime) que não foi tocado de propósito, pra não interromper o que já está rodando. Ele não tem o código novo. Precisa de um restart (ou redeploy) pra essas rotas existirem de verdade.
2. **Testar de ponta a ponta num navegador real** — eu implementei e validei compilação/tipos/build, mas não consigo clicar em "Permitir" num prompt de notificação nem confirmar visualmente que o push chega. Fluxo de teste: abrir um caderno em duas contas/abas diferentes, ativar notificações em Configurações nas duas, mencionar uma da outra no chat, conferir se a notificação aparece (inclusive com a aba em segundo plano/fechada).
3. **Chaves VAPID de produção** — as chaves atuais são só para o ambiente local (arquivo `.pem` git-ignorado). Em produção, gerar um novo par (mesmo comando `openssl`) e configurar `VAPID_PRIVATE_KEY_PATH`/`VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` no ambiente do servidor de produção, e `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (mesmo valor da pública) no ambiente do frontend de produção — isso eu não tenho como fazer, não tenho acesso à infraestrutura de produção.
4. **Decisão de produto: escopo dos gatilhos.** Hoje o único evento que dispara push é "fui mencionado no chat". Extender pra outros eventos (alguém editou um caderno que compartilho, convite de time aceito, etc.) é escopo novo — cada um precisa de um ponto de disparo próprio no backend (o chat já tinha o ponto de entrada mais óbvio porque é tempo real e já passa pelo servidor; edição de bloco, por exemplo, hoje só passa pelo CRDT/Automerge, que não tem noção de "isso é uma notícia relevante pra notificar" sem trabalho adicional de design).
5. **HTTPS em produção** — a Push API e Service Workers exigem contexto seguro (`https://` ou `localhost`); não é um passo extra a fazer, só uma pré-condição a confirmar que já é atendida na infra de produção do Zeile.
