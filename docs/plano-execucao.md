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

#### 4 · Capacidade fail-closed (Q99, branch `tauri`)

- [x] `capability` obrigatória no tipo: `createApi(cap: Capability)` sem default; remover `export const api = createApi()`. `resolve(capability)` também deixou de aceitar `undefined`, que era o fail-open de verdade
- [x] Furo 1: `"public"` existe no tipo e nenhum serviço usa — `getPublicNotebookBySlug` está sob `notebook-crud` (local) e roteia para `127.0.0.1` → `getPublicNotebookBySlug` e `fetchPublicNotebooks` passaram para um `createApi("public")`
- [x] Furo 2: `login-form.tsx` e `profile-form.tsx` importam `BASE_URL` direto, furando `resolve()` → `BASE_URL` deixou de ser exportado; ambos usam `resolve("auth")`. O login passa a conta por argumento porque o seletor de conta só mexe em estado do React, e o cookie pode estar desatualizado
- [x] Furo 3: `forgot-password-form.tsx` e `reset-password-form.tsx` usam o `api` sem capacidade → `createApi("auth")` em cada um
- [x] Furo 4: `app/api/search/route.ts` (rota de servidor) importa o cliente do browser → `fetch` direto, tipado, sem passar pelo cliente que lê cookie do browser
- [ ] Furo 5: `exec-compiled` sem eixo de plataforma → resolvido pela etapa 12 (Q104)

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

- [ ] Versão de contrato exposta no `health/ready` + aviso ao cliente velho demais
- [ ] **Guarda de downgrade de migration** — recusar o boot se o banco estiver migrado à frente do binário. Único risco que corrompe dado na máquina do usuário
- [ ] Política de versão mínima suportada em ADR (governa o prazo do alias do Q29)

#### 8 · Crates e gate de release (Q101)

- [ ] `Cargo.toml` de workspace na raiz com `rust-server` + `src-tauri` — reconciliar edition 2024 × 2021 e `rust-version`
- [ ] Job de gate antes do `build` no `desktop-release.yml` — hoje um push de tag publica instalador para 3 SOs sem verificação
- [ ] Housekeeping: `description`/`authors`/`license` de scaffold em `src-tauri/Cargo.toml`; `version` fixa vs `package.json` como fonte única; `package.json` ainda é `"name": "docs"`

#### 9 · ⚠ MERGE da `tauri` na `main`

Precisa acontecer **aqui**: depois das decisões 🔴 do desktop (4, 5, 6, 7, 8) e **antes** da etapa 15,
que move 189 componentes. A branch toca `lib/api/base.ts`, `auth-context.tsx`, `login-form.tsx`,
`signup-form.tsx`, `use-presence.ts` e os 15 `*-service.ts` — conflito sem resolução mecânica.

#### 10 · Enum e casing — destrava os geradores

- [ ] Migration: `ALTER TYPE block_type_enum ADD VALUE IF NOT EXISTS` × 10 + enum Rust completo (Q30)
- [ ] `#[serde(rename_all = "camelCase")]` em todos os structs serializados (Q29)
- [ ] `#[serde(alias = "<snake>")]` só na entrada, com data de remoção em ADR
- [ ] Aplicar "um conceito, uma grafia": remover `#[serde(rename)]` campo a campo, reconciliar `permission_grant.rs` com o resto

#### 11 · Geradores e guards ([regime do artefato gerado](decisoes.md#regime-do-artefato-gerado))

- [ ] Completar os `#[utoipa::path]` faltantes (`api_get_notebooks`, `api_rename_notebook`, …)
- [ ] `openapi-typescript` para a superfície HTTP: modelos + paths/métodos/status
- [ ] `ts-rs`/`typeshare` para o que não passa por endpoint: payload de WebSocket, shape do doc Automerge
- [ ] Allowlist: DTOs · enums de domínio · catálogo de `errorCode` · chaves de permissão (Q28c/Q31)
- [ ] `errorCode` como contrato aditivo + `app/api/*/route.ts` no formato `{code, message, details}` (Q32)
- [ ] `--check` no CI, em workflow próprio com filtro de `paths`
- [ ] Check `schema.rs` ≡ migrations (Q56a)
- [ ] Check "nenhum par de campos gerados normaliza para o mesmo identificador"

#### 12 · Capacidade e erro estruturado

- [ ] `GET /capabilities` — o backend declara o que sabe fazer, por linguagem (Q104)
- [ ] `run-rust.ts`: backend devolve `{ status, errorCode, … }`; remover os `includes()` em texto de compilador (Q105)
- [ ] `validator` nos DTOs de request (Q37)
- [ ] Mapear erro Diesel por causa: unique → 409, not-found → 404, FK → 400 (Q39)
- [ ] Proibir `let _ =` sobre `Result`; corrigir `api_create_notebook` (Q40)
- [ ] `match` exaustivo no `IntoResponse` (Q41)
- [ ] Sem `throw` raw no frontend (Q38)

#### 13 · Limpeza, depois ligar o gate

- [ ] `noExplicitAny: error` + limpar os 45 usos (Q33) — `lib/api/base.ts` primeiro
- [ ] `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noFallthroughCasesInSwitch` (Q35)
- [ ] `no-console` permitindo `warn`/`error` (Q34) + conjunto explícito no `biome.json` (Q36)
- [ ] PR de limpeza do clippy, **antes** de ligar `-D warnings` (Q53)
- [ ] Revisar os 30 `biome-ignore` com justificativa concreta (Q13)
- [ ] **Ligar o gate** (Q78/Q79): `biome check` 0 erro · `types:check` · `vitest run` · `validate:i18n` · `fmt --check` · `clippy -D warnings` · `cargo test` · `validate:types` · `validate:schema`
- [ ] `main` protegida, tudo por PR (Q80)
- [ ] Hook de commit `<type>: <descrição>` + branch `<área>/<tipo>/<slug>` (Q82/Q83)
- [ ] Checklist curto no template de PR (Q84)

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

