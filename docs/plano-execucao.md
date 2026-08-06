# Zeile — Plano de execução

Ordem em que as decisões do [catálogo](decisoes.md) são aplicadas, e o que ainda está aberto.
Este é o arquivo que muda a cada entrega.

---

### Os 13 docs de regra (Q6, ampliado por Q96/Q97)

```
docs/
  README.md                    índice + regra de precedência (Q3)
  padroes.md                   este documento
  permissions-design.md         (existe — status a corrigir, Q89)
  decisions/NNNN-*.md          ADRs (Q8)
  architecture/
    comment-guide.md           6 categorias, pt-BR (Q10-Q13)
    code-rules.md              naming, um-por-arquivo, tamanho (Q14-Q19)
    frontend-rules.md          features/, fronteiras, lint (Q20-Q27, Q33-Q36)
    rust-rules.md              camadas, extractors, erro (Q38-Q41, Q47-Q53)
    contracts.md               fronteira Rust→TS + geradores (Q28-Q32)
    database.md                migrations, timestamptz, seeds (Q54-Q59)
    security.md                env, CORS, rate limit (Q60-Q65)
    operability.md             health, shutdown, timeouts (Q67-Q72)
    testing.md                 quando e como testar (Q73-Q77)
    i18n.md                    ICU, chaves, isenções (Q42-Q46)
    env-vars.md                tabela de variáveis (Q61)
    crdt.md                    NOVO — Automerge, versão de doc (Q97)
    sandbox.md                 NOVO — execução não confiável (Q97)
    performance.md             NOVO — canvas/render, o que medir (Q97)
    a11y.md                    NOVO — foco, teclado, aria (Q97)
```

Cada regra nasce com severidade 🔴/🟡/⚪ (Q91) e cada doc tem uma seção
"mudou X ⇒ verifique Y" (Q92).

### Checklist de execução

Ordem imposta pelas dependências, já incorporando a branch `tauri` ([desktop-tauri.md](desktop-tauri.md)). Uma etapa = um PR,
salvo indicação. `[ ]` = pendente.

#### 1 · Colisões — bug latente, zero dependência

- [x] Unificar `cn`: `lib/utils.ts` (`twMerge(clsx(…))`) vs `lib/cn.ts` (só `twMerge`) → uma só
- [x] Unificar `NotebookMeta`: `lib/types.ts` (camelCase) vs `lib/api/notebook-service.ts` (snake_case)
- [x] Remover `publicSlug` redeclarado (`NotebookMeta` **e** `Notebook extends NotebookMeta`)
- [x] `lib/api.ts` → `lib/sandbox/` (não é API: é execução em sandbox)
- [x] `lib/hooks/` → `hooks/`
- [x] `use-local-storate.ts` → `use-local-storage.ts`

#### 2 · Rede de teste

- [x] Vitest configurado + script `test`/`test:watch`
- [x] `cargo test` no CI (passa com 0 testes, mas o passo existe)

#### 3 · Primeira leva de suítes (Q74, escritas conforme Q76)

- [x] `lib/permissions/engine.ts` — `can`/`effectiveKeys`/`targetLevel`: precedência de nível, deny vence allow no mesmo nível, `implied_by` transitivo e circular, catálogo vazio, default deny
- [x] **Teste de paridade TS ↔ Rust** — mesma regra de precedência está implementada duas vezes (`engine.ts` e `controllers/permissions.rs`) e nada garante que concordem → o Rust serializa o catálogo em `contracts/permission-catalog.json`, guardado por snapshot test (`UPDATE_PERMISSION_CATALOG_SNAPSHOT=1` regenera), e a suíte TS consome esse mesmo arquivo repetindo os 7 casos do Rust
- [x] `models/notebook.rs` — lógica Automerge
- [x] `lib/drawing-scene.ts` + `free-drawing/engine.ts` — inclusive a invariante de `drawing-scene.ts:50` ("só reescreve quando o conteúdo muda"), cuja quebra causa loop de eco
- [x] `lib/runtime/router.ts` (branch `tauri`) — decide para onde vai o dado do usuário
- [x] Serviço Postgres + `TEST_MIGRATION_DATABASE_URL` no job `rust-test` do CI — sem eles, `embedded_migrations_apply_from_scratch_and_are_idempotent` retornava cedo e passava sem verificar nada

#### 4 · Capacidade fail-closed (Q99, branch `tauri`) — [x] concluída

- [x] `capability` obrigatória no tipo: `createApi(cap: Capability)` sem default; remover `export const api = createApi()`. `resolve(capability)` também deixou de aceitar `undefined`, que era o fail-open de verdade
- [x] Furo 1: `"public"` existe no tipo e nenhum serviço usa — `getPublicNotebookBySlug` está sob `notebook-crud` (local) e roteia para `127.0.0.1` → `getPublicNotebookBySlug` e `fetchPublicNotebooks` passaram para um `createApi("public")`
- [x] Furo 2: `login-form.tsx` e `profile-form.tsx` importam `BASE_URL` direto, furando `resolve()` → `BASE_URL` deixou de ser exportado; ambos usam `resolve("auth")`. O login passa a conta por argumento porque o seletor de conta só mexe em estado do React, e o cookie pode estar desatualizado
- [x] Furo 3: `forgot-password-form.tsx` e `reset-password-form.tsx` usam o `api` sem capacidade → `createApi("auth")` em cada um
- [x] Furo 4: `app/api/search/route.ts` (rota de servidor) importa o cliente do browser → `fetch` direto, tipado, sem passar pelo cliente que lê cookie do browser
- [x] Furo 5: `exec-compiled` sem eixo de plataforma → resolvido pela etapa 12 (Q104, PR #117/#118)

`CAPABILITIES` virou array `as const` (o tipo deriva dele), e um teste garante que toda capacidade
está classificada como local ou exclusiva de nuvem — capacidade nova sem classificação quebra a suíte
em vez de virar remota por omissão.

#### 5 · Segurança 🔴

Entregue como stack de cinco PRs dependentes, um por bloco coeso, em vez de um PR único.

- [x] Separar bootstrap de roteamento (Q50) — pré-requisito de 6 e do `ready`. `bootstrap.rs` concentra pool, env, background tasks e TLS; `routes/mod.rs` só compõe rotas
- [x] `NEXT_PUBLIC_GITHUB_TOKEN` → `GITHUB_TOKEN` (Q60). A variável saiu do schema compartilhado de `lib/env.ts` por ser server-only, e um teste de guarda barra qualquer `NEXT_PUBLIC_*` com nome de segredo
- [x] CORS por env, métodos e headers restritos (Q62). Sem `CORS_ALLOWED_ORIGINS`, só localhost e `FRONTEND_URL`
- [x] Body limit 1 MB global + override 100 MB só em sync/upload (Q63). Não há rota HTTP de sync — o override ficou em `PUT /notebook/{id}/content` e `POST /notebook/{id}/snapshots`
- [x] Rate limit: login, forgot-password, convite de time, judge (Q64). Janela fixa por IP, 429 com `Retry-After`
- [x] Não vazar mensagem do Diesel em 500 (Q65). `details` também é zerado em toda resposta 5xx, o que fecha o `MISSING_ENV_VAR`
- [x] `health/live` + `health/ready`, fora de `/api` (Q67)
- [x] Erro descritivo no boot em vez de `.unwrap()` (Q69). `BootError` com mensagem acionável e exit code 1
- [x] Timeout em `reqwest` e `lettre`, valor por env (Q70). `get_smtp_data` deixou de dar `.unwrap()` e devolve `Result`
- [x] `request_id` no tracing (Q71). Header validado na entrada, span com método e rota, id devolvido na resposta
- [x] **Desktop (Q103)**: bind loopback via `BIND_ADDR` · Postgres embarcado `bundled` em vez de download em runtime · `jwt_secret` com `0600`, senha do PG gerada, `ZEILE_PG_DATA` exigido em vez de cair para `temp_dir()` · CSP definida no `tauri.conf.json`

**Em aberto, saindo desta etapa**: a CSP do `tauri.conf.json` só vale para conteúdo servido pelo próprio
Tauri, e a janela usa `WebviewUrl::External` apontando para o Next local — a CSP efetiva dessa página
teria de vir do header de resposta do Next, o que afeta também o deploy de nuvem. Tratar junto do Q61
(`docs/env-vars.md`), onde a origem da API por ambiente já vai estar declarada.

#### 6 · Shutdown gracioso 🔴 + simetria da sandbox 🔴

- [x] Backend: sinaliza · para de aceitar conexão · checkpoint de todo o `sync_registry` · close frame nos WS · drena o pool (Q68). `shutdown.rs` com um `watch` de disparo único; `axum::serve(...).with_graceful_shutdown` com teto de `SHUTDOWN_GRACE_SECS` (default 5s) para que o checkpoint aconteça mesmo com conexão pendurada; close frame 1001 ("going away") nos três handlers de WS; as 4 tasks de fundo morrem junto com o sinal
- [x] `POST /internal/shutdown` com token de sessão + peer loopback (Q102). Sem `ZEILE_SHELL_TOKEN` a rota responde 404 — no deploy de nuvem ela não existe; peer fora do loopback também é 404; token errado é 403, comparado em tempo constante
- [x] Shell: segurar o `ExitRequested` (é cancelável) → chamar shutdown → poll `ready` → SIGKILL só por timeout (Q98). Orçamento de 10s; HTTP/1.1 mínimo sobre `TcpStream` em vez de um cliente HTTP no bundle; o gate real é o `try_wait` do processo, e o frontend só é encerrado depois do backend
- [x] Compilar Go, Zig e C++ dentro do `bwrap`, como já se faz com Rust (Q106). `executor/sandbox.rs` concentra o envelope; medição em [docs/medicoes/compilacao-sandbox.md](medicoes/compilacao-sandbox.md)
- [x] Aplicar o `RunLimits` inteiro no `prlimit` — hoje só `cpu_secs` chega lá (Q107). `mem_kb` vira `--as`, e o teste lê o limite de dentro do processo filho (`ulimit -v`), não do comando montado

Os dois últimos entraram nesta etapa por serem 🔴 e por ficarem visíveis no momento em que o
repositório abrir: qualquer pessoa lê `compile_go` e vê que o `go build` roda no host. Não são
tema de shutdown; são a dívida que a escrita do diagrama de isolamento do README revelou.

**Saindo desta etapa, três coisas a registrar:**

1. **A hipótese do Q106 se confirmou**: o `bwrap` custa poucos milissegundos, não havia
   trade-off de performance. O que quase virou regressão foi outra coisa — pôr o `GOCACHE`
   dentro do workspace da sessão faz cada submissão recompilar a stdlib (50 ms → 2,8 s). A saída é
   a que o próprio Q106 previa: cache do servidor montado read-write em `/cache`
   (`ZEILE_BUILD_CACHE`), compartilhado entre sessões.
2. **Zig não foi medido nem exercitado por teste** — não há toolchain na máquina de medição. O
   envelope dele está escrito por simetria (cache local na sessão, global compartilhado), e a
   primeira execução real numa máquina com `zig` é verificação pendente.
3. **`env_clear` no envelope de compilação**: antes o compilador herdava o ambiente inteiro do
   servidor, `DATABASE_URL` e `JWT_SECRET` incluídos. Não era item de nenhuma questão; apareceu ao
   escrever o envelope.

#### 7 · Compatibilidade de versão (Q100)

- [x] Versão de contrato exposta no `health/ready` + aviso ao cliente velho demais. `contract_version` e `min_supported_contract_version` no payload; cliente que declara versão via header `X-Contract-Version` abaixo do mínimo recebe `client_contract_outdated: true` e gera `tracing::warn!`
- [x] **Guarda de downgrade de migration** — recusar o boot se o banco estiver migrado à frente do binário. `guard_against_migration_downgrade` compara a última versão aplicada com a mais recente embutida no binário antes de `run_pending_migrations`; testado contra Postgres real (aceita banco em dia, rejeita migration "do futuro")
- [x] Política de versão mínima suportada em ADR (governa o prazo do alias do Q29). [docs/decisions/0001-contract-version-policy.md](decisions/0001-contract-version-policy.md) — janela de 90 dias antes de subir `min_supported_contract_version`, amarrada à remoção do `serde alias`

#### 8 · Crates e gate de release (Q101)

- [x] `Cargo.toml` de workspace na raiz com `rust-server` + `src-tauri` — `src-tauri` passou para edition 2024 (igual ao `rust-server`) e `rust-version` foi de `1.77.2` para `1.85`, o piso real da edition 2024. Lockfiles por crate substituídos por um único `Cargo.lock` na raiz
- [x] Job de gate antes do `build` no `desktop-release.yml` — hoje um push de tag publica instalador para 3 SOs sem verificação. `gate` roda `types:check` + `test` do front e `cargo test` + `cargo check --workspace` do Rust; `build` passa a depender dele (`needs: gate`). **`pnpm lint` ficou fora por ora**: o repo tem 146 arquivos de fonte já rastreados com achados de `biome check` pré-existentes (fora do escopo desta etapa) — travar o release nisso agora violaria a ordem que a própria etapa 13 declara (limpeza antes do gate bloqueante). Entra quando a etapa 13 zerar o lint
- [x] Housekeeping: `description`/`authors`/`license` de scaffold em `src-tauri/Cargo.toml` preenchidos; `version` sincronizada com `package.json` (`1.0.2`, era `1.0.0`); `package.json` renomeado de `"docs"` para `"zeile-notebook"`
- [x] **Achado durante a etapa**: `public/sw.js` (gerado pelo build do serwist a partir de `app/sw.ts`) estava commitado por engano e inflava o lint sozinho com centenas de achados — removido do controle de versão e ignorado. `/target` também passou a ser ignorado na raiz, já que agora é o diretório de build único do workspace (antes só `rust-server/target` e `src-tauri/target`, individuais, estavam no `.gitignore`)
- [x] **`pnpm audit` do frontend, fora do escopo original do Q101 mas resolvido junto**: 79 vulnerabilidades (34 altas, 36 moderadas, 9 baixas) reportadas pelo GitHub. `next` foi de `16.1.6` para `16.2.12` (fecha a maioria: DoS, SSRF, bypass de middleware, XSS); `nanoid`, `lodash-es`, `immutable`, `dompurify`, `esbuild`, `brace-expansion`, `postcss` e `sharp` — todos transitivos, vindos de dentro de `@excalidraw/excalidraw`, `@serwist/*` e do próprio `next` — via `overrides` em `pnpm-workspace.yaml` (não mais em `package.json`: nesta versão do pnpm o campo `pnpm.*` do `package.json` foi descontinuado). `pnpm audit` zerado; `pnpm build`, `pnpm test` e `pnpm types:check` confirmados depois do bump

#### 9 · ⚠ MERGE da `tauri` na `main` — [x] concluída

Já aconteceu antes desta sessão: commit `761d999` ("Merge branch 'tauri'", 2026-07-29), 72 arquivos,
7002 inserções. Cobre `src-tauri/` inteiro e os pontos de conflito previstos — `lib/api/base.ts`,
`auth-context.tsx`, `login-form.tsx`, `signup-form.tsx`, `use-presence.ts` e os `*-service.ts`. A
branch local `tauri` (`aa268ac`) é ancestral de `main`; nada pendente para mesclar.

#### 10 · Enum e casing — destrava os geradores

- [x] Migration: `ALTER TYPE block_type_enum ADD VALUE IF NOT EXISTS` × 10 + enum Rust completo (Q30). `BlockType` ganhou `FreeDrawing`, `DatabaseSchema`, `Latex`, `Sql`, `Typst`, `Challenge`, `NotebookRef`, `TemplateRef`, `Chart`, `Mermaid` — os mesmos 14 valores que `lib/types.ts` já usava. **Achado**: `#[serde(rename_all = "lowercase")]` não insere `_` em variante de duas palavras (`FreeDrawing` virava `"freedrawing"`, não `"free_drawing"`); trocado para `"snake_case"`, idêntico para as 4 variantes antigas e correto para as novas. `diesel-derive-enum` mapeia pro Postgres por `snake_case` por padrão, independente do atributo serde — os dois lados já batiam por baixo, só o serde estava errado
- [x] `#[serde(rename_all = "camelCase")]` em todos os structs serializados (Q29) — dividido em 5 PRs por domínio (empilhadas via `gh stack`), cada uma cobrindo Rust + frontend do domínio, já que a saída muda sem dualidade. Enums de valor de domínio (`BlockType`, `GrantEffect`, `Tier`, etc.) ficaram de fora: é casing de variante, não de campo — fora do escopo literal do Q29. JWT (`Claims`, `ResetClaims`, `StateClaims`) e espelhos de API externa (`models/oauth.rs`: `GithubUser`, `GoogleUser`, `GithubEmail`) também ficaram de fora — não são JSON exposto ao cliente nem contrato nosso
  - [x] Auth/user (PR #89): `models/user.rs`, `controllers/user.rs`, `controllers/oauth/mod.rs` + frontend
  - [x] Times/permissões (PR #90): `models/team.rs`, `models/team_invitation.rs`, `models/permission_grant.rs`, `controllers/permissions.rs`, `sec/catalog/mod.rs` (+ `contracts/permission-catalog.json` regenerado) + frontend
  - [x] Notebook/blocos/comentários/atividade/pastas (PR #93): `models/notebook.rs`, `models/activity.rs`, `models/comment.rs`, `models/folder.rs`, `models/notebook_snapshot.rs`, `controllers/activity.rs`, `main.rs` (`CodeRequest`) + frontend. **Achado**: `Notebook.team_id` e `lib/types.ts`'s `NotebookMeta.team_id` estavam sem `camelCase` enquanto todos os campos vizinhos já tinham — inconsistência corrigida junto
  - [x] Challenges/chat/templates (PR #94): `models/challenge.rs`, `controllers/challenge.rs`, `models/chat.rs`, `models/template.rs`, `controllers/template.rs` + frontend
  - [x] Notificações/push/admin (PR #95): `models/notification.rs`, `models/notification_preference.rs`, `controllers/notifications.rs`, `models/push_subscription.rs`, `models/admin.rs`, `controllers/admin.rs` + frontend
- [x] `#[serde(alias = "<snake>")]` só na entrada, com data de remoção em ADR — aplicado em todo campo de entrada real que muda de nome; prazo de 90 dias documentado em [docs/decisions/0001-contract-version-policy.md](decisions/0001-contract-version-policy.md)
- [x] Aplicar "um conceito, uma grafia": remover `#[serde(rename)]` campo a campo, reconciliar `permission_grant.rs` com o resto — feito nos domínios já cobertos (`UpdateUserPassword`, `SessionResponse`, `RefreshPayload`, `InviteRequest` tinham rename campo a campo, consolidados para o blanket attribute)

#### 11 · Geradores e guards ([regime do artefato gerado](decisoes.md#regime-do-artefato-gerado)) — [x] concluída

- [x] Completar os `#[utoipa::path]` faltantes (`api_get_notebooks`, `api_rename_notebook`, …) — 130 handlers anotados, com `request_body`/`body` refletindo o tipo Rust real (PR #102)
- [x] `openapi-typescript` para a superfície HTTP: modelos + paths/métodos/status — `cargo run -- export-openapi` monta o `utoipa::OpenApi` em memória, sem subir servidor; ~100 schemas registrados em `components(schemas(...))` (PR #105)
- [x] `ts-rs`/`typeshare` para o que não passa por endpoint: payload de WebSocket, shape do doc Automerge — `WsServerMessage`/`WsClientMessage` em `models/ws_message.rs`; handlers migrados de `json!`/`format!` ad-hoc pro tipo real. Shape do doc Automerge já coberto por `Notebook`/`Block*` via `openapi-types.ts` (PR #106)
- [x] Allowlist: DTOs · enums de domínio · catálogo de `errorCode` · chaves de permissão (Q28c/Q31) — `ApiError::ALL_ERROR_CODES` travado por teste com `match` exaustivo; README de `lib/api/generated/` documenta as 4 allowlists (PR #107)
- [x] `errorCode` como contrato aditivo + `app/api/*/route.ts` no formato `{code, message, details}` (Q32) — `routeError()` em `lib/api/route-error.ts`; `app/api/search/route.ts` não emite erro, ficou fora (PR #108)
- [x] `--check` no CI, em workflow próprio com filtro de `paths` — `.github/workflows/generators.yml` (PR #109)
- [x] Check `schema.rs` ≡ migrations (Q56a) — achado no caminho: `diesel.toml` estava gitignorado (CI nunca teve `custom_type_derives`) e tanto `diesel migration run` quanto `print-schema` sobrescrevem o `file` do config como efeito colateral; isolado com `DIESEL_CONFIG_FILE` temporário (PR #103)
- [x] Check "nenhum par de campos gerados normaliza para o mesmo identificador" — `scripts/check-no-duplicate-fields.mjs`, por bloco de chaves (PR #110)

**Achado fora do escopo, registrado e não bloqueante**: `routes::rate_limit_global_test::anonymous_traffic_has_a_per_origin_ceiling` é flaky sob paralelismo do `cargo test` (rate limiter global com estado compartilhado) — passou no rerun, sem relação com o diff desta etapa.

#### 12 · Capacidade e erro estruturado — [x] concluída

- [x] Mapear erro Diesel por causa: unique → 409, not-found → 404, FK → 400 (Q39) — `From<diesel::result::Error> for ApiError` com `UniqueViolation`/`ForeignKeyViolation`/`NotFound`; mensagem genérica pro cliente, detalhe cru só no log (PR #112)
- [x] `match` exaustivo no `IntoResponse` (Q41) — sem `_ =>`; achado no caminho: `MultipleAuthorizationErrors` e `InvalidEmail` caíam no catch-all genérico de 500/400 por omissão, igual ao `DATABASE_ERROR` do Q39 (PR #112)
- [x] Proibir `let _ =` sobre `Result`; corrigir `api_create_notebook` (Q40) — o bloco inicial parava de ser criado em silêncio se `create_block` falhasse; auditoria das ~50 ocorrências restantes não achou outro caso do mesmo padrão (resto é descarte deliberado de efeito colateral ou já propaga erro via `?` antes do `let _`); `#[warn(clippy::let_underscore_must_use)]` adicionado — o `-D warnings` completo é da etapa 13 (PR #114)
- [x] `validator` nos DTOs de request (Q37) — cobria só auth e metade de `team.rs`; faltava em notebook/chat/comentário/pasta/convite/challenge/template/snapshot/push. Achado: `api_create_team` nunca chamava `.validate()` — nome de time vazio passava direto, o próprio bug que o Q37 descreve (PR #116)
- [x] `GET /capabilities` — o backend declara o que sabe fazer, por linguagem (Q104) — reaproveita os checks que os testes do executor já faziam (bwrap/prlimit, cargo+rustup+wasm32-wasip1+wasmtime pro Rust, go, clang++/g++, zig 0.15.x), cacheado por processo; resolve o Furo 5 da etapa 4 (PR #117). Frontend: `useExecutionCapabilities` cruza isso com a permissão de bloco pra rust/go/cpp/zig — não python (Pyodide) nem tsx (Babel no browser) — e falha aberta se o endpoint não responder (PR #118)
- [x] `run-rust.ts`: backend devolve `{ status, errorCode, … }`; remover os `includes()` em texto de compilador (Q105) — `CodeResponse` ganha `ExecStatus` (11 variantes) e `errorCode`; `MODULE_NOT_FOUND` e a detecção de bomba de compilação em C++ já eram lidos no backend, só não saíam como código estável (PR #119). Frontend ramifica por `status`/`errorCode` em vez de string do compilador (PR #120)
- [x] Sem `throw` raw no frontend (Q38) — único caso restante do padrão: `runTsxInSandbox` (era `lib/api.ts`, hoje `lib/sandbox/tsx-sandbox.ts`) lançava `Error` sem código e sem quem capturasse; virou `ApiClientError` com `BABEL_NOT_READY`, e `handleRunSimple` passou a capturar e mostrar por toast (PR #120)

#### 13 · Limpeza, depois ligar o gate — [x] concluída

Entregue como stack de PRs dependentes, não um PR único: cada regra do biome era um passo
mecânico separado, e misturar tudo teria tornado a review de ~250 arquivos ilegível.

- [x] `noExplicitAny: error` + limpar os usos (Q33) — eram 27 em arquivo rastreado, não 45
  (a estimativa original contava arquivos fora do controle de versão). `lib/api/base.ts`
  primeiro, como previsto; a maior parte do resto era `catch (e: any)` → `unknown` com
  `instanceof Error`, e dois casos de `window as any` (Babel, Pyodide) que viraram interfaces
  mínimas em vez de suprimidos
- [x] `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` +
  `noFallthroughCasesInSwitch` (Q35) — 143 erros em 62 arquivos. Maioria mecânica (`!` onde a
  guarda já provava não-nulo, `Record<string, any>` → `unknown`, prop opcional recebendo
  `| undefined` explícito), mas revelou dois bugs reais: paginação do admin nunca recarregava
  dados ao trocar de página (useEffect de mount único, corrigido com `useCallback` por seção),
  e `i18n/request.ts` tinha um `notFound()` redundante que rodava *antes* do fallback pt-br,
  fazendo locale ausente cair em 404 em vez de pt-br
- [x] `no-console` permitindo `warn`/`error` (Q34) + conjunto explícito no `biome.json` (Q36) —
  só um `console.log` real no app (`pwa-registration.tsx`, removido); `scripts/**` isento via
  override, já que é ferramenta de build, não código do produto
- [x] PR de limpeza do clippy antes de ligar `-D warnings` (Q53) — ~85 warnings, quase todos
  `let _ =` sobre `Result` (auditoria do Q40 já tinha justificado o padrão: descarte
  deliberado de efeito colateral best-effor); um caso não era — `api_create_team` descartava
  o resultado de `add_user_to_team`, então um time criado sem erro podia ficar sem admin se
  o insert falhasse. Virou `?`, propagando o erro como os outros passos da mesma função já
  faziam
- [x] Revisar os `biome-ignore` com justificativa concreta (Q13) — a maioria (sql-cell,
  history-diff-view, os que já eram a referência do próprio Q13) já estava correta; achou dois
  com texto-placeholder nunca preenchido (`<.>`) num `noStaticElementInteractions` de
  `text-block.tsx` — virou fix real (`role="button"` + `onKeyDown`) em vez de reescrever a
  desculpa
- [x] **Ligar o gate** (Q78/Q79) — `biome check` (0 erro), `types:check`, `vitest run`,
  `fmt --check`, `clippy -D warnings`, `cargo test` no `ci.yml`; `validate:types` (Q28b) e
  `validate:schema` (Q56) já existiam via `generators.yml` e `check_schema.sh` desde a etapa
  11, só não estavam documentados como parte do gate. **`validate:i18n` (Q45) não entrou** —
  não existe ainda; depende da etapa 16 rodar primeiro. Cada job roda condicionalmente por
  `paths` (`dorny/paths-filter`): PR só de frontend não dispara `rust-test` e vice-versa
  - **Achado que quase virou incidente**: `git add -A` durante a limpeza varreu ~6500 arquivos
    que nunca deveriam estar versionados — três cópias do skill `impeccable` (`.agents/`,
    `.claude/`, `.github/skills/`), 574 MB de artefatos de build do Rust em
    `docs/metrics-backup/`, e um `.env.bak` com segredos reais dentro de `backups/`. Nada
    tinha sido *push*ado ainda, então o commit raiz da stack foi reescrito (sem rebase
    interativo) antes de qualquer PR existir. `.gitignore` ganhou entradas para todo esse
    tipo de conteúdo
  - **`app/global.css` e `public/offline.html` não apareciam** na primeira verificação local
    do gate porque o escopo só olhava `.ts/.tsx/.js` — o CI real (que roda sobre `git ls-files`
    inteiro) achou 9 erros reais: `@apply`/`@custom-variant` do Tailwind precisam de
    `css.parser.tailwindDirectives: true` no `biome.json`, e o HTML estático tinha
    `lang="pt-br"` inválido e um SVG decorativo sem `aria-hidden`
- [x] `main` protegida (Q80) — exige `frontend-test` e `rust-test` verdes antes do merge,
  sem exigir review (solo dev), admin pode contornar em emergência, force-push e delete
  bloqueados
- [x] Hook de commit `<tipo>: <descrição>` + bloqueio de commit/push direto na `main` (Q82/Q83)
  — já existia, fora do controle de versão de propósito (`~/.claude/hooks/zeile-guard.sh` +
  `.git/hooks/commit-msg`); nada a fazer nesta etapa
- [x] Checklist curto no template de PR (Q84) — já existia (`.github/pull_request_template.md`),
  sem footer de referência como o Q84/Q85 pedia; nada a fazer

#### 14 · Camadas do Rust

- [ ] Três camadas: controller fino · regra de negócio e autorização · acesso a banco isolado (Q47)
- [ ] DTO de request/response separado do struct Diesel (Q48) — dissolve `models/notebook.rs` (1175 linhas) por responsabilidade
- [ ] Extractors `AuthUser` + `DbConn` (Q49)
- [ ] `require_permission(...)` como layer por rota — conserta por construção a ordem de `api_get_single_notebook` (Q51)

#### 15 · `features/` e pastas de topo — o maior diff

- [ ] `features/<domínio>/` com `components/`, `hooks/`, `types/` co-locados (Q20)
- [ ] `components/vendor/` isolada e isenta, com README de origem (Q21)
- [ ] `lib/` = infra sem estado e sem React; `types/`, `schemas/`, `stores/`, `domain/`, `context/` sobem (Q24)
- [ ] Dissolver `interface/` e a raiz solta de `components/`
- [ ] Fronteiras de import por lint + `@/` ao cruzar topo (Q26/Q27) — inclui inverter `lib/types.ts` → `@/components/banner`
- [ ] kebab-case + sufixo de papel; renomear os 8 camelCase (Q14)
- [ ] camelCase em função exportada: `RunTsxInSandbox` → `runTsxInSandbox` (Q19)
- [ ] Um componente público por arquivo; tipos por domínio coeso (Q16/Q18)

#### 16 · i18n em ondas

- [ ] Onda 1 — telas que o usuário sempre vê: auth, teams, settings, notificações (Q42)
- [ ] Onda 2 — editor e canvas: free-drawing, `layouts-canvas-tools`, `editor-header`, `run-rust`
- [ ] Servidor não produz texto de UI: `"Nova Página"`, `"Novo Bloco"`, `"# Notas…"` (Q43)
- [ ] Logs do servidor em en-US (Q44)
- [ ] ICU + chaves estáticas; mapa de enum→chave em objeto `as const` (Q46)
- [ ] **Ligar os 3 checks de i18n** (Q45): paridade · órfãs · todo `errorCode` com chave nos 2 locales

#### 17 · Escrever os docs normativos

- [ ] `docs/README.md` com índice + regra de precedência
- [ ] Os 13 docs de `docs/architecture/` (lista acima), cada regra com severidade 🔴/🟡/⚪ (Q91)
- [ ] Seção "mudou X ⇒ verifique Y" em cada doc (Q92)
- [ ] ADRs das decisões deste documento (Q8)
- [ ] `permissions-design.md`: corrigir o status "planejamento" (Q89)

#### 18 · Áreas de regra próprias

- [ ] `crdt.md` — versionamento do shape do doc, resolução de conflito, migração de doc persistido, e as três noções de "versão" (checkpoint × snapshot × history)
- [ ] `sandbox.md` — isolamento do iframe, Pyodide, sql.js, e limites de tempo/memória/rede do judge
- [ ] `performance.md` — o que medir em canvas/render, e como
- [ ] `a11y.md` — foco, navegação por teclado num editor, contraste, aria
- [ ] `desktop.md` — matriz de capacidades como fonte única, plataforma como eixo, empacotamento, versionamento, assinatura de código, dependência por distro

### Encaixáveis a qualquer momento após a etapa 3

Independentes entre si e do resto da ordem:

- [ ] Separar DDL de seed/backfill; padronizar nome de migration (Q55/Q58)
- [ ] Auditar `timestamptz` — sem tz hoje: `add_teams`, `add_team_invitations`, `create_push_subscriptions`, `add_permission_grants` (Q57)
- [ ] `pg_advisory_lock` + flag `RUN_MIGRATIONS` (Q54)
- [ ] `down.sql` com destrutividade declarada no cabeçalho (Q56b)
- [ ] Gatilho de volume para `CREATE INDEX CONCURRENTLY` (Q59)
- [ ] Idempotência do `backgroundSync` — auditar o que a fila reenvia (Q72)
- [ ] `wait_for_port` → `health/ready` com erro visível ao usuário em vez de tela branca
- [ ] `unsafe { set_var }` em `embedded_pg.rs`; `dotenvy::dotenv()` em segundo lugar; `BASE_URL` residual em `lib/api/base.ts`

#### 19 · Migração para Catcher (Q109)

Incremental, arquivo por arquivo — sem prazo de tolerância para `try/catch` cru em código
**novo ou tocado**; código legado intocado *também* é migrado, por estar fora do padrão —
mutirão em ondas, não uma exceção permanente como `components/vendor/*` (Q21).

- [ ] `lib/api/base.ts` primeiro — é onde `fetch` é envolvido à mão hoje; vira a borda que
  devolve `Result<T, ApiClientError>` para todo `lib/api/*-service.ts`
- [ ] `lib/api/*-service.ts` (auth, notebook, teams, admin, user, run-rust) — cada chamada
  passa a devolver `Result`, chamador decide `isOk()`/`isErr()` em vez de `try/catch`
- [ ] `lib/api/handle-api-error.ts` — passa a consumir o lado `Err` do `Result` em vez de
  receber uma exceção capturada
- [ ] Pontos que hoje reimplementam o padrão Q38 manualmente (`runTsxInSandbox` e afins) —
  ver se `catchErrorSync`/`catchError` substitui o `ApiClientError` construído à mão
- [ ] Levantar todo `try/catch` restante em `hooks/` e `components/notebook/`, mesmo fora do
  escopo de outras etapas, e migrar em onda própria — não fica pendente indefinidamente

### Questões ainda abertas

Não são pendências de decisão sua — são pontos que só fecham ao redigir cada doc ou ao
implementar. Ficam listados para não se perderem:

| Origem | Aberto |
|---|---|
| Q47/Q48 | Raiz da organização do Rust: por **camada** (`services/`, `repositories/`, `dto/`) ou por **módulo** (`domain/notebook/{controller,service,repository,dto,entity}.rs`) |
| Q20/Q24 | Linha divisória entre `features/<x>/` e as pastas de topo — ver a tabela em [decisoes.md](decisoes.md) |
| Q21 | Se a isenção de `vendor/` cobre também `any` (Q33) |
| Q12 | Se ADR conta como referência legítima em comentário (é versionada e perene, ao contrário de PR) |
| Q42 | Lista final de isenções de i18n — assumi nome próprio, nome de linguagem, nome de locale e código de exemplo |
| Q43 | Servidor devolve `title: null` ou o front manda o título traduzido; e o que fazer com notebooks já criados com pt-BR no banco |
| Q60 | Confirmar que nenhum build com `NEXT_PUBLIC_GITHUB_TOKEN` foi publicado — não sendo possível, rotacionar |
| Q70 | Se a regra de timeout cobre também o cliente (`lib/api/base.ts` faz `fetch` sem `AbortSignal.timeout`) |
| Q59 | Volume que dispara a exigência de `CONCURRENTLY` |
| Q89 | `permissions-design.md` está marcado "planejamento" mas o modelo está implementado (`sec/catalog/`, `permission_grants`, `engine.ts`) — atualizar status, e decidir se `§3 Decisões batidas` vira ADR retroativa |
| Q94 | Se PWA/service worker merece doc próprio ou se Q72 basta |

---

