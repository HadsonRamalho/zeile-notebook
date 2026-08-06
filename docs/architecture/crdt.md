# CRDT — Automerge

## As três noções de "versão" 🟡

Convivem sem glossário e é fácil confundir uma pela outra:

- **Checkpoint** — persistência periódica e automática do doc inteiro em
  `notebooks.document_data` (`checkpoint_notebook_data`,
  `rust-server/src/domain/notebook/repository.rs:634`), disparada pelo `checkpoint_loop`
  quando `dirty_since_save` está marcado (`controllers/websocket.rs:75`). Existe para
  durabilidade — não é uma ação do usuário, nem algo restaurável individualmente.
- **Snapshot** — ponto de restauração explícito, criado pelo usuário via
  `POST /notebook/{id}/snapshots` (`routes/notebook.rs:152`) e restaurável via
  `POST /notebook/{id}/snapshots/{snapshot_id}/restore`. É a única das três com intenção do
  usuário por trás.
- **History** — o log de changes do próprio Automerge (`getAllChanges`), reconstruído
  incrementalmente no cliente (`use-automerge-sync.ts:296-333`) porque o `getHistory()` nativo
  é O(n²) — cada entrada reaplica o log inteiro do zero. É o que alimenta o diff visual entre
  versões, não um mecanismo de durabilidade.

## `schema_version` no doc, upgrade automático no load 🔴 (Q110)

Todo doc Automerge persistido carrega um campo `schema_version`. Ao carregar
(`Automerge::load`, hoje sem tratamento de shape divergente), uma função de upgrade aplica,
em sequência, as transformações necessárias até a versão atual **antes** de o doc ser exposto
ao resto do sistema.

Sem isso, um doc com shape antigo simplesmente falha o load e é descartado silenciosamente —
o usuário perde acesso ao notebook sem erro visível. Toda mudança de shape do doc (campo
renomeado, estrutura de bloco alterada) passa a exigir a função de upgrade correspondente, não
só o campo novo — é o que fecha o item que o Q92 registrou como "sem guard".

## Conflito concorrente: merge automático + presence, sem lock 🟡 (Q111)

Dois usuários editando o mesmo bloco ao mesmo tempo continuam resolvidos 100% pelo merge do
Automerge (diff textual via `fast-diff`, aplicado como splices — `updateBlockContent`). Nenhum
lock otimista é introduzido: bloquear edição concorrente contradiz o motivo de o produto usar
CRDT.

O que muda: a UI de presence passa a indicar que outro usuário está/esteve editando o mesmo
bloco, para que uma mudança "aparecendo sob o cursor" tenha explicação visível, em vez de
parecer um bug.

## History é comprimida em snapshot automaticamente 🟡 (Q112)

Depois de um limiar de changes ou de tempo (a calibrar na implementação), a history acumulada
por `getAllChanges` é comprimida para um snapshot, em vez de crescer sem limite. Isso é
adicional ao snapshot manual do usuário — não o substitui, opera em paralelo, no plano interno.
Sem isso, o custo documentado em `use-automerge-sync.ts:279-289` (reconstrução incremental,
ainda O(n) total) cresce para sempre entre duas ações manuais do usuário.

## A defesa contra eco não é do CRDT, é do bloco de desenho ⚪

`drawing-cell.tsx:93-96` guarda a assinatura do último conteúdo sincronizado
(`lastSyncedSig`) para diferenciar "cheguei aqui por uma mudança remota" de "cheguei aqui por
uma mudança que eu mesmo mandei" — é a invariante que impede o loop `updateScene` ↔ `onChange`.
Não é mecanismo do Automerge; é responsabilidade do bloco que consome o doc, e continua sendo
tratado como tal — cada bloco que sincroniza estado bidirecional com o doc precisa da mesma
guarda, não só o de desenho.

## Mudou X ⇒ verifique Y

- Shape do doc Automerge muda (campo novo, bloco novo, estrutura renomeada) ⇒ função de upgrade
  de `schema_version` correspondente, `checkpoint_loop`, snapshots já persistidos, e
  `history-diff-view` (que reconstrói docs antigos a partir de changes antigas).
- Bloco novo que sincroniza estado bidirecional com o doc Automerge (como o de desenho) ⇒
  precisa da mesma guarda de assinatura de conteúdo que `drawing-cell.tsx` usa contra eco.
- Limiar de compressão de history (Q112) muda ⇒ confirmar que `buildAutomergeHistory` ainda
  reflete o que o snapshot automático já comprimiu, sem duplicar nem perder entradas.
