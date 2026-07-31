# Zeile — Padrões de código: diagnóstico e decisões

Status: **decidido, não implementado.** Este documento registra o estado verificado do
repositório, as decisões tomadas sobre cada ponto, e a ordem em que serão aplicadas.

As regras do Zeile são próprias e auto-contidas. Este documento é a origem delas; os docs
normativos de `docs/architecture/` (ver Parte IV) são a redação final, e passam a ser a
referência a citar em review.

**Regra de precedência, que abre todos os docs normativos:** a regra documentada vence o padrão
do arquivo vizinho. Se o código em volta viola uma regra, siga a regra — não imite a violação.
Um mau exemplo presente no contexto não autoriza reproduzi-lo.

---

## Parte I — Diagnóstico do estado atual

### 1. Stack e tamanho

| | |
|---|---|
| Frontend | Next.js 16.1.6 (App Router) · React 19.2 · TS 5.9 `strict: true` · Tailwind 4 · Biome 2.3 · next-intl 4 |
| Backend | Rust edition 2024 · Axum 0.8 · Diesel-async + Postgres · utoipa (OpenAPI + Swagger) · Automerge 0.9 (CRDT) · WebSocket |
| Volume | 305 arquivos `.ts`/`.tsx` · 70 `.rs` · 62 `.sql` (31 migrations Diesel) · ~57.8k linhas |
| Ferramentas | Biome (lint+format), `types:check`, `generate-docs`. **Sem framework de teste.** |

### 2. Arquitetura de diretórios — frontend

Organização **por tipo de arquivo na raiz**, e dentro de `components/` um híbrido de quatro
critérios diferentes ao mesmo tempo:

```
app/[lang]/…          20 páginas · app/api/{github,search}/route.ts
components/           189 .tsx em ~30 subpastas
  ├─ notebook/        por DOMÍNIO (blocks/, chat/, folders/, permissions/, …)
  ├─ challenges/ docs/  por DOMÍNIO
  ├─ ui/ layout/ nav/  por CAMADA
  ├─ animate-ui/ ui/skiper-ui/ motion/  por BIBLIOTECA DE ORIGEM
  ├─ interface/{admin,settings,profile,…}  por TELA
  └─ layouts-canvas-tools.tsx (1041 linhas), banner.tsx, …  soltos na raiz
lib/                  68 arquivos: cliente HTTP + tipos + schemas + stores + utils + regra de negócio + contexts
hooks/                10 arquivos
lib/hooks/            1 arquivo  ← segunda casa para a mesma coisa
context/              1 arquivo (auth-context.tsx)  ← terceira casa para contexts
```

Contexts vivem em **três** lugares: `context/auth-context.tsx`, `lib/{search,tree}-context.tsx`,
`components/notebook/notebook-context.tsx`.

### 3. Colisões e duplicações verificadas

| Achado | Detalhe |
|---|---|
| **Duas funções `cn` diferentes** | `lib/utils.ts` → `twMerge(clsx(...))`; `lib/cn.ts` → só `twMerge`. Mesmo nome, comportamentos distintos. |
| **`NotebookMeta` definido duas vezes** | `lib/types.ts:` `{id,title,createdAt,folderId,tags,publicSlug}` vs `lib/api/notebook-service.ts:` `{id,user_id,team_id,is_public,publicSlug}`. Mesmo nome, shapes incompatíveis, casings diferentes. |
| **`lib/types.ts` + `lib/types/*.ts`** | Tipos de domínio na raiz e 11 arquivos na pasta. |
| **`lib/api.ts` não é API** | Contém `RunTsxInSandbox` / `RunPythonInSandbox` (execução em sandbox). Ao lado de `lib/api/` que é o cliente HTTP de verdade. O nome mente. |
| **`hooks/` vs `lib/hooks/`** | Sem critério que distinga. |
| **Typo em nome de arquivo** | `hooks/use-local-storate.ts` |

### 4. Nomenclatura

Duas convenções convivem sem critério:

- kebab-case: `auth-service.ts`, `handle-api-error.ts`, `notebook-anchor.ts`, `formatFullDate.ts`…
- camelCase: `appBadge.ts`, `backgroundSync.ts`, `cellResultsStore.ts`, `pendingImport.ts`, `pyodideStore.ts`, `sqlDbStore.ts`, `typstStore.ts`, `formatFullDate.ts`
- Funções exportadas em PascalCase: `RunTsxInSandbox`, `RunPythonInSandbox`

### 5. Contrato front ↔ back — não há fonte única

- `lib/types/*.ts` (11 arquivos) são **escritos à mão espelhando os structs Rust**.
- O casing atravessa a fronteira de forma inconsistente: o Rust renomeia parte dos campos
  (`#[serde(rename = "userId")]`) e deixa o resto em snake_case (`is_visible`, `user_id`,
  `target_kind`, `permission_key`, `team_id`). O frontend consome os dois estilos no mesmo objeto.
- **O servidor já expõe OpenAPI** (`utoipa` + `/api-docs/openapi.json` + Swagger em `/docs`),
  e `lib/env.ts` já tem a infraestrutura de geração (`NEXT_PUBLIC_MODE=JSON|API`,
  `getOpenAPIServices()`, `scripts/run-generate.mjs`, `outputDir: content/docs/api-reference/`).
  Mas os **tipos não são gerados dessa fonte** — só a documentação.
- Nem todos os handlers têm `#[utoipa::path]` (ex: `api_get_notebooks`, `api_rename_notebook`
  não têm), então o OpenAPI hoje é parcial.

**Drift de enum entre as duas pontas:**

| Conceito | Postgres / Rust | TypeScript |
|---|---|---|
| tipo de bloco | 4 valores (`text`, `code`, `component`, `drawing`) | **14** valores (+`free_drawing`, `database_schema`, `latex`, `sql`, `typst`, `challenge`, `notebook_ref`, `template_ref`, `chart`, `mermaid`) |
| linguagem | 6 valores | 7 (+`generic`) |

Ou seja: a tabela `blocks` **não é** a fonte de verdade do tipo de bloco (o documento
Automerge é), mas continua existindo um enum divergente no banco e no Rust.

### 6. Erros

O núcleo é bom, e é a base da regra de erro do Zeile:

- Backend: `ApiError` (thiserror) com `error_code()` → `{code, message, details}` estável, `IntoResponse` único.
- Frontend: `ApiClientError {message, code, details}` + `handleApiError({err, t, setError})` que
  traduz **pelo `code`** via next-intl — o frontend ramifica por código, nunca por mensagem.

Lacunas:

- `ApiError::Database(String)` — o erro do Diesel é convertido para string, perdendo o tipo (não há
  mapeamento por causa: violação de unicidade, não-encontrado e violação de FK caem todos no
  mesmo 500 genérico).
- Catch-all `_ => (500, "Unknown error")` em `IntoResponse`.
- Erros descartados: `let _ = models::notebook::create_block(...)` em `api_create_notebook` — se o
  bloco inicial falhar, o notebook é criado vazio e a requisição responde 200.
- Mensagens do servidor misturam idiomas: `ApiError` em en-US, mas `"Nova Página"`, `"Novo Bloco"`,
  `"# Notas\nComece a editar..."`, `"Falha ao instalar provedor de criptografia"`,
  `"Servidor rodando em"` em pt-BR.
- `app/api/github/route.ts` devolve `{error: "..."}` em pt-BR hardcoded — formato **diferente** do
  `{code, message, details}` do backend Rust. Duas formas de erro na mesma aplicação.

### 7. i18n

- `messages/{en,pt-br}.json`, 744 linhas cada (paridade de linhas ok).
- **50 arquivos** usam `useTranslations`/`getTranslations`, de ~250 arquivos de UI.
- Strings hardcoded confirmadas na UI: `"Você tem certeza?"`, `"Criar Novo Time"`, `"Notificações"`,
  `"Conectando ao servidor..."`, `"Modo Sandpack"` / `"Modo Nativo"`, `"Pincéis"`,
  `"Gestos de toque"`, `"Zoom out"`, `"Zoom in"`, `"Fit to screen"`, `"Fullscreen"`,
  `"Gráfico de dados"`, `"Olá React!"`. Note que há **pt-BR e en-US hardcoded lado a lado**.
- Classificado **🔴 bloqueante** na regra de i18n (Q42).

### 8. Comentários

- 205 linhas de comentário `//` em TS/TSX. **Todos em pt-BR.**
- **A qualidade já está aderente ao princípio "o porquê, não o quê"**.
  Exemplos genuinamente bons: `free-drawing-cell.tsx:228` (por que o estado vive naquele componente),
  `drawing-scene.ts:50` (por que só reescreve quando muda), `reorder-tools.tsx:60` (por que o botão
  deixou de depender de hover), `notebook-page.tsx:348` (por que deletar não pede confirmação).
- Não há conflito de princípio a resolver aqui — só a decisão de idioma (Q10).
- 30 `biome-ignore`, vários com justificativa vaga e repetida: `<Necessário pra gerenciar os arquivos>`,
  `<Necessário pra acessar a window>`.
- Comentários no Rust em pt-BR (`// porta configurável por env (default 3099)`,
  `// backplane multi-nó: escuta NOTIFY...`).

### 9. Tipos

- `strict: true` ✅ · `forceConsistentCasingInFileNames` ✅ · alias `@/*` ✅
- 45 usos de `any` em 26 arquivos. Padrões recorrentes: `details: Record<string, any>`,
  `catch (err: any)`, `body?: any` (em `lib/api/base.ts`), `props?: Record<string, any>`.
- Biome usa só `recommended` — não há regra explícita sobre `noExplicitAny` nem `no-console`.
- `console.error`/`console.log` espalhados sem política.

### 10. Backend Rust — separação de responsabilidades

Camadas existentes: `routes/` → `controllers/` → `models/`, mais `sec/` (permissões) e `executor/`, `file/`, `http/`.

| Camada | O que realmente faz |
|---|---|
| `routes/` | Declaração de rotas. Fino e coerente ✅ |
| `controllers/` | Handler HTTP **+ orquestração + regra de negócio + autorização**. 25 arquivos, até 1020 linhas (`websocket.rs`), 678 (`permissions.rs`), 666 (`challenge.rs`) |
| `models/` | Struct Diesel **+ DTO de request + DTO de response + enum de domínio + queries + lógica Automerge**. `models/notebook.rs` = **1175 linhas** com tudo isso junto |
| `sec/catalog/` | Catálogo de permissões com `init()` — fonte única, bem feito ✅ |

- **Não existe camada de service/use-case.** A regra de negócio está no controller.
- **Não existe repository separado do model.** Query e struct de persistência no mesmo arquivo.
- **Boilerplate repetido em quase todo handler** (dezenas de ocorrências):
  ```rust
  let id = extract_claims_from_header(&headers).await?.1.id;
  let conn = &mut get_conn(&state.pool).await
      .map_err(|e| ApiError::DatabaseConnection(e.1.0.to_string()))?;
  ```
  Deveria ser um extractor com injeção; hoje é copy-paste.
- `main.rs` declara DTOs (`CodeRequest`, `CodeResponse`) que não pertencem ao entrypoint.
- `routes/mod.rs` (601 linhas) mistura **bootstrap** (pool Diesel, TLS rustls, 4 `tokio::spawn` de
  background tasks, CORS, body limit) com **roteamento**.
- Chamada de autorização é manual e posicional em cada handler:
  `permissions::require(&pool, id, notebook_id, "notebook.view", &TargetCtx::default())`.
  A permissão é uma **string literal** no call site: um typo produz permissão que nunca casa.
- Ordem suspeita em `api_get_single_notebook`: busca o notebook **antes** de checar permissão.

### 11. Banco de dados e migrations

- 31 migrations Diesel, com `up.sql` + `down.sql`.
- **Nomenclatura inconsistente**: `2026-02-07-195046-0000_...` (com sufixo `-0000`) vs
  `2026-06-11-100000_...` (sem).
- **Migrations rodam automaticamente no boot** (`db_migrations::run_pending_migrations()` no `main`).
- **DDL, seed e backfill misturados** no mesmo mecanismo: `backfill_missing_role_grants`,
  `seed_team_admin_grants`, `seed_chat_delete_any_grant`.
- `ALTER TYPE ... ADD VALUE` sem `IF NOT EXISTS` em `add_zig_go_cpp_languages` (o de `drawing` tem).
- Sem ledger de drift, sem `rollback.sql` classificado por destrutividade, sem ciclo de shadow
  database — não há regime de migration nenhum.
- Timestamps: a verificar por coluna se são `timestamptz` (classificado **🔴** — ver Q57).
- `CREATE INDEX` sem `CONCURRENTLY` (relevante quando as tabelas tiverem volume).

### 12. Segurança — pontos concretos

| Achado | Gravidade |
|---|---|
| `NEXT_PUBLIC_GITHUB_TOKEN` — o token **só é usado server-side** (`app/api/github/route.ts`), mas o prefixo `NEXT_PUBLIC_` faz o Next.js **inlinar o valor no bundle do cliente**. Token exposto. | 🔴 |
| `CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)` em produção | 🔴 |
| `DefaultBodyLimit::max(100 MB)` global, sem limite por rota | 🟡 |
| Permissões referenciadas por string literal no call site (`"notebook.view"`) — typo = permissão que nunca casa | 🟡 |
| `ApiError::Database(e)` propaga a mensagem do Diesel para o cliente em 500 — vaza detalhe de schema | 🟡 |
| Sem rate limit em nenhuma rota (login, reset de senha, convite, judge de challenge) | 🟡 |

### 13. Resiliência e operabilidade

- **Não existem `health/live` nem `health/ready`** — e as duas noções são distintas: vivo ≠ pronto.
- `/metrics` e `/docs` já ficam **fora** do prefixo `/api` ✅ — é o comportamento correto.
- Sem graceful shutdown (`axum::serve` sem `with_graceful_shutdown`); 4 background tasks
  (`auto_delete_files`, `checkpoint_loop`, `backfill_search_text`, `caps_listen_loop`) morrem
  abruptamente — o `checkpoint_loop` persiste documentos Automerge, então há janela de perda.
- `.unwrap()` no bind do listener e no pool.
- Sem timeout em chamadas de I/O externo (`reqwest`, `lettre`).
- Observabilidade: `tracing` + `TraceLayer` ✅, mas sem `SERVICE_NAME` nem log estruturado
  com correlação de request.

### 14. Testes

**Correção ao diagnóstico original**, que registrava "zero testes": o backend **tem** 19 testes
passando em 4 módulos `#[cfg(test)]`, todos de 2026-07-10, na leva `feat(perms)`:
`controllers/permissions.rs` (precedência de nível, deny × allow, owner, baseline público),
`sec/catalog/mod.rs` (unicidade de chave, expansão de `general`, alvos de `implied_by`),
`controllers/grants.rs` e `db_migrations.rs`. O de migrations só roda se
`TEST_MIGRATION_DATABASE_URL` estiver definida — sem ela, retorna cedo e passa sem verificar nada.

O **frontend** é que tem zero: nenhum `*.test.ts` / `*.spec.ts`. A afirmação original valia para
ele, não para o repo.

### 15. CI e gate de qualidade

- Único workflow: `.github/workflows/deploy-backend.yml` — **deploy**.
- `lint` e `types:check` existem como script mas **não rodam no CI**.
- Sem `cargo clippy`, sem `cargo fmt --check`, sem `cargo build` no CI.
- Sem commitlint/husky. Commits recentes: mistura de `feat:`/`fix:`/`chore:` (aderente ao formato
  adotado no Q82) com `Atualizar o env.example` (fora dele).

### 16. Documentação

- `docs/permissions-design.md` — 13 KB, bem escrito, com "Decisões batidas". É o único.
- **Sem `CLAUDE.md`**, sem `AGENTS.md`, sem índice de docs, sem specs, sem ADRs.
- Dois READMEs (`README.md`, `README.ptbr.md`) + `rust-server/readme.md`.

---

## Parte II — Decisões tomadas

Registro incremental. Perguntas ainda abertas seguem na Parte III.

| # | Decisão | Consequência |
|---|---|---|
| **Q1** | **Regras próprias e auto-contidas**, dimensionadas para um app Next.js + Rust de um só serviço. | Fora de escopo por não se aplicar a esta arquitetura: fronteiras de módulo de monorepo, mensageria, regime de shadow database, níveis hierárquicos de especificação, prefixo `I` em interface. Vocabulário próprio; nenhuma regra é referenciada por ID importado. |
| **Q2** | **Sem specs e sem `CLAUDE.md`.** Processo essencialmente humano, com regras claras. | Resolve **Q5 → C** (documentar em `docs/`, `README` aponta), **Q7 → não** (sem `CLAUDE.md` aninhado), **Q86 → C** e **Q87/Q88 → não se aplicam** (Bloco Q encerrado, exceto Q89). As regras precisam ser legíveis por humano como texto normativo, não como contexto de IA. |
| **Q3** | **Sim, com essa força** — a regra documentada vence o padrão do arquivo vizinho; mau exemplo no contexto não autoriza reprodução. | Como não há `CLAUDE.md`, esta regra passa a ser a **abertura do doc de regras**. Efeito: componente novo não copia string hardcoded do vizinho; handler Rust novo não copia o boilerplate de auth+conn; tipo novo não copia casing misto. |
| **Q4** | **Testes primeiro.** | Rede antes de refatoração. Nenhuma reorganização de `components/`, nem quebra de `models/notebook.rs` (1175 linhas) ou `controllers/websocket.rs` (1020), acontece antes de existir cobertura no que ela toca. Torna o Bloco N a próxima decisão de fato. |
| **Q6** | **`docs/architecture/` por tema**, 9 arquivos + `docs/README.md` como índice e sede da regra de precedência (Q3). | Regra citável por nome em review (`comment-guide §2`). Custo: 9 arquivos a manter coerentes entre si. |
| **Q8** | **ADRs numeradas** em `docs/decisions/NNNN-*.md`, com Contexto / Alternativas / Decisão / Consequências / Status. | Preserva o raciocínio, não só o resultado. As decisões deste documento entram como as primeiras ADRs. `docs/permissions-design.md` §3 ("Decisões batidas") é candidato a virar ADR retroativa. |
| **Q9** | **Só docs no repo.** Nenhuma memória de IA duplicando regra. | Fonte única versionada. Coerente com Q2. |
| **Q91** | **Três níveis de severidade** 🔴 bloqueante / 🟡 corrigir / ⚪ sugestão. | É o que torna os 9 docs acionáveis em review humano. Cada regra escrita nasce com severidade declarada. |
| **Q28** | **Rust é a fonte de verdade.** Dois mecanismos: `openapi-typescript` sobre o OpenAPI do `utoipa` para a superfície HTTP (modelos **+** paths/métodos/status), e `ts-rs`/`typeshare` para o que não passa por endpoint (payload de WebSocket, shape do documento Automerge). | Dois artefatos, um guard cada. Cobre também o canal de colaboração, que hoje é o menos tipado e o mais arriscado. **Pendência criada**: completar os `#[utoipa::path]` faltantes (`api_get_notebooks`, `api_rename_notebook` e outros). |
| **Q28b** | **Regime inteiro, com `--check` no CI.** Gerado commitado · dir apagado e reescrito · detecção de órfão · `--check` que falha listando divergências · output passado pelo `biome format` · cabeçalho `@generated` · workflow dedicado com filtro de `paths` · teste de regressão do gerador. | O drift não é hipotético neste repo: já aconteceu sem guard. Build do front não passa a depender do toolchain Rust. |
| **Q28c** | **Atravessam os quatro**: DTOs de request/response, enums de domínio, catálogo de `errorCode`, chaves de permissão. | Resolve **Q31 → A** (chaves de permissão geradas, constantes nos dois lados). Destrava um check novo: *todo `errorCode` gerado tem chave em `en.json` e `pt-br.json`* — hoje, se não tiver, `handleApiError` mostra a string crua ao usuário. **Torna Q30 bloqueante** (ver abaixo). |
| **Q31** | **A — constantes geradas**, consequência de Q28c. | Elimina o typo silencioso em `require(…, "notebook.view", …)` e em `can(…, "notebook.view", …)`. |

| **Q30** | **Sincronizar: o Rust ganha os 14 valores.** Migration com `ALTER TYPE … ADD VALUE IF NOT EXISTS` para os 10 faltantes + enum Rust completo. | Desbloqueia a geração dos enums; o front fica intacto; o banco volta a validar o domínio. Custo aceito: tipo de bloco novo passa a exigir migration. Cuidado operacional: `ALTER TYPE … ADD VALUE` tem restrição de transação em PG < 12. |
| **Q29** | **camelCase no fio, com plano de transição.** `#[serde(rename_all = "camelCase")]` em todos os structs serializados; `#[serde(alias = "<snake>")]` aceitando a grafia antiga **só na entrada**, com prazo declarado em ADR. | Entrada aceita ambos → saída só camelCase. Protege a fila do `backgroundSync` já persistida no IndexedDB do usuário e permite deploy em duas etapas. **O alias precisa de data de remoção em ADR, senão fica para sempre.** |
| **Q32** | **Contrato aditivo + unificar o formato de erro.** `errorCode` estável, só aditivo, nunca traduzido; e `app/api/*/route.ts` do Next passa a devolver `{code, message, details}`. | Acaba com os dois contratos de erro na mesma aplicação. Destrava o check: todo `errorCode` gerado tem chave em `en.json` **e** `pt-br.json`. |
| **Q37** | **Rust valida a entrada; o TS confia no tipo gerado.** `validator` (já em `Cargo.toml`, quase não usado) em todo DTO de request; zod só em forms, como hoje. | Valida onde o dado é desconhecido, custo zero de runtime no cliente. Hoje o Rust confia só no `Deserialize`: nome de time vazio, `title` de 10 MB e e-mail malformado passam. |
| **NOVA** | **Um conceito, uma grafia.** Ver a regra completa abaixo. | 🔴 bloqueante. |

| **Q73** | **Sim — testes são a primeira frente** (consequência de Q4). | Maior lacuna do repo: 57,8k linhas, zero teste. |
| **Q74** | **Quatro alvos na primeira leva**: `lib/permissions/engine.ts` · `sec/catalog` + `controllers/permissions.rs` · `models/notebook.rs` (Automerge) · `lib/drawing-scene.ts` + `free-drawing/engine.ts`. | Cobre as duas áreas de maior consequência: autorização e integridade do documento do usuário. Inclui um **teste de paridade cross-linguagem** — hoje a mesma regra de precedência de permissão está implementada duas vezes (TS e Rust) e nada garante que concordem. Desbloqueia Q52 (quebrar `models/notebook.rs`). |
| **Q75** | **Vitest** (front) + `#[cfg(test)]` (Rust). | ESM nativo, sem transpilação extra; `@testing-library/react` quando chegar a UI. Zero dependência nova no Rust. |
| **Q76 + Q77** | **Duas regras distintas, ambas valem:** <br>**Q77 — quando** uma suíte é obrigatória: só módulo de domínio novo ou tocado (`lib/permissions`, `lib/export`, `lib/drawing-scene`, `models/notebook.rs`). Sem meta percentual. <br>**Q76 — como** a suíte é escrita, quando existe: cobre caminho felizes **e** caminhos de exceção (erro, vazio, loading), inclusive em componente de UI que você escolha testar. | Componente de UI nunca é *obrigado* a ter suíte; mas suíte de caminho feliz só é proibida. Evita a cobertura que dá sensação de segurança sem pegar bug. Sem número: partindo de 0% em 57,8k linhas, qualquer piso seria chute e incentivaria testar o fácil em vez do que importa. |

| **Q10** | **Comentários em pt-BR**, declarado como regra e não como dívida. Identificadores, mensagens de log e `errorCode` em **en-US**. | Explícito, não tolerado. Zero trabalho de tradução, zero convivência bilíngue. **Pré-resolve Q44 → en-US** para os logs do servidor (`"Servidor rodando em"`, `"Falha ao instalar provedor"`). Consequência aceita: barreira a contribuição externa. |
| **Q11** | **Seis categorias de "quando comentar"**: (1) implementação de padrão externo, com referência perene · (2) trade-off de performance **medido** · (3) invariante ou pré-condição não local · (4) violação intencional de convenção · (5) regex ou operação bitwise não trivial · (6) **decisão de UX/interação**. | A 6ª é o tipo de comentário mais frequente e mais valioso do Zeile (`reorder-tools.tsx:60`, `notebook-page.tsx:348`, `free-drawing-cell.tsx:386`). Sem ela, a regra proibiria justamente o que deveria premiar. |
| **Q12** | **Proibir referência a PR/issue/commit** em comentário (o git guarda) **e exigir link permanente** ao citar doc externo (DOI, número de RFC, URL arquivada). | Relevante porque o Zeile comenta comportamento de lib externa: Automerge, perfect-freehand, Excalidraw, sql.js, Pyodide, Typst. **Aberto**: se ADR conta como referência legítima (é versionada e perene, ao contrário de PR) — resolver ao escrever `comment-guide.md`. |
| **Q13** | **Justificativa concreta em `biome-ignore` + revisar os 30 existentes.** | O comentário diz *o que falha* sem o ignore, não que "é necessário". Padrão a seguir já existe no repo: `sql-cell.tsx:170`, `history-diff-view.tsx:90`. A revisão vai revelar quais viraram desnecessários — a maioria dos de `noExplicitAny` cai com Q33. Enquadra-se na categoria 4 do Q11. |
| **Q42** | **Regra 🔴 para código novo + mutirão em ondas no legado.** Onda 1: telas que o usuário sempre vê (auth, teams, settings, notificações). Onda 2: editor/canvas. | Hoje 50 de ~250 arquivos usam `useTranslations`, e há **pt-BR e en-US hardcoded lado a lado** — quem usa em `en` vê "Você tem certeza?" e quem usa em `pt` vê "Fit to screen". <br>**Assumido ao escrever `i18n.md`** (corrija se discordar): a regra vem com lista de isenções declaradas — nome próprio (`Anthropic`, `Scira AI`), nome de linguagem (`TypeScript`), nome de locale (`Português`) e código de exemplo. Sem isso o check do Q45 nunca poderia ser ligado. Explicitamente **não** isentos: `"Olá React!"` (texto de UI dentro de exemplo) e `"Gráfico de dados"` (`<title>` de SVG é a11y, precisa traduzir). |
| **Q43** | **O servidor não produz texto de UI.** `api_create_notebook` deixa de decidir `"Nova Página"` / `"Novo Bloco"` / `"# Notas\nComece a editar..."`. | Único jeito de o locale do usuário valer: hoje quem usa em `en` cria notebook em pt-BR. **Abertos, para a ADR**: (a) o servidor devolve `title: null` e a UI resolve, ou o front manda o título já traduzido — muda a assinatura de `createNotebook`; (b) o que fazer com os notebooks já criados com pt-BR gravado no banco. |
| **Q44** | **en-US** nos logs e mensagens internas do servidor. | Consequência de Q10. |
| **Q45** | **Três checks no CI**: paridade de chaves `en.json` ≡ `pt-br.json` · chaves órfãs · **todo `errorCode` gerado tem chave nos dois locales**. | O terceiro é o gap real e vale sozinho: `handleApiError` faz `t(errorCode)`, então código sem chave faz o usuário ver `USER_NOT_ACTIVE` cru na tela. Destravado pelo Q32 (`errorCode` gerado) e o de órfãs pelo Q46 (chave estática). |
| **Q46** | **ICU + chaves estáticas.** Plural/interpolação via ICU com params; chave sempre literal — nunca `t(`algo.${var}`)`. Mapa de chave por valor de enum vai num objeto `as const` explícito. | A chave estática é o pré-requisito do check de órfãs (Q45). ICU dá plural correto em pt-BR e en, que concatenação à mão não dá. |

| **Q60** | **Renomear `NEXT_PUBLIC_GITHUB_TOKEN` → `GITHUB_TOKEN`**, sem rotacionar. Toca `env.example`, `lib/env.ts:31` e `app/api/github/route.ts:17`. | Fecha a exposição futura. **Não** fecha a passada: qualquer build que rodou com a var setada gravou o valor literal no JS servido ao cliente. Item para a ADR: confirmar que nenhum build com a var foi publicado; não sendo possível descartar, rotacionar. O uso real (contagem de stars) precisa de zero escopo no PAT. |
| **Q61** | **`docs/env-vars.md`** declarando cada var (pública/secreta, obrigatória/opcional, runtime) **+ regra 🔴: `NEXT_PUBLIC_*` nunca recebe segredo.** | Montar a tabela já expõe duas incoerências reais: `NEXT_PUBLIC_WS_URL` está no `env.example` mas **não** no schema de `lib/env.ts`; e `lib/env.ts` declara `NEXT_PUBLIC_API` e `NEXT_PUBLIC_API_JSON_PATH` no schema mas **não os carrega** em `loadEnv()` — então `getOpenAPIServices()` chamaria `get()` num campo nunca validado. |
| **Q62 + Q63** | **CORS por env** (origem em lista, métodos e headers restritos) **+ body limit por rota**: 1 MB global, override de 100 MB só em `/notebook/{id}/sync` e upload. | 100 MB em toda rota, sem rate limit, é vetor de DoS barato. |
| **Q64** | **Rate limit** em `/user/login`, `/user/forgot-password`, convite de time e judge de challenge. | Razões distintas: força bruta · enumeração de e-mail + custo de envio via `lettre` · spam · CPU. O `judge_semaphore` existente limita **concorrência**, não taxa. |
| **Q65** | **Não vazar erro de infraestrutura no 500.** Logar completo, responder genérico com código. | Hoje `ApiError::Database(e)` serializa a mensagem do Diesel: o cliente recebe nome de tabela, de constraint e de coluna. Combina com Q39. |
| **Q66** | **Sem regra de PII em log** — decisão explícita, não omissão. | Fica registrado que o Zeile coleta e-mail, nome, conteúdo de notebook e mensagens de chat, e que nada proíbe logá-los. |

| **Q68** | **Graceful shutdown completo**: sinaliza · para de aceitar conexão nova · checkpoint de todo o `sync_registry` · fecha os WS com close frame · drena o pool. | 🔴 **É o único item do diagnóstico que perde dado do usuário hoje.** Entre dois ciclos do `checkpoint_loop` o documento Automerge vive só em memória (`sync_registry: DashMap`); um SIGTERM de deploy descarta tudo desde o último checkpoint, sem log e sem aviso a quem estava editando. |
| **Q67** | **`health/live` + `health/ready` separados**, fora do prefixo `/api` (como o Zeile já faz com `/metrics` e `/docs`). `live` responde sempre; `ready` checa o pool. | Sem a separação, um Postgres oscilando faz o orquestrador **matar** um processo saudável em vez de tirá-lo do balanceador. Cobre também um caso de boot silencioso: hoje `routes/mod.rs` devolve `Router::new()` **vazio** se `DATABASE_URL` faltar — o servidor sobe, responde 404 em tudo, e nada sinaliza que está inútil. |
| **Q69** | **Erro descritivo no boot** em vez dos `.unwrap()` de inicialização (bind do listener, build do pool, `rustls_config`), com exit code definido. | "porta 3099 já em uso" é diagnóstico; panic dentro do `tokio-postgres-rustls` não é. |
| **Q70** | **Timeout obrigatório em I/O externo**, valor por env: `reqwest` (GitHub, OAuth) e `lettre` (SMTP). | Sem timeout, provedor lento prende um worker do tokio — e no OAuth isso é o caminho crítico de autenticação. **Aberto**: se a regra cobre também o cliente (`lib/api/base.ts` faz `fetch` sem `AbortSignal.timeout`). |
| **Q71** | **`request_id` no tracing** (mais `notebook_id` nas rotas de notebook), sem migrar para log estruturado JSON completo. | Hoje nada amarra um erro à requisição ou à sessão de WebSocket que o causou — o que mais dói justamente no canal de colaboração, onde vários clientes agem no mesmo documento. |
| **Q72** | **Idempotência do `backgroundSync`.** Auditar quais requisições a fila pode reenviar e garantir que o reenvio não duplique efeito. | `lib/api/base.ts` enfileira **qualquer** non-GET que falhe com `TypeError` e reenvia depois. Riscos concretos: `POST /notebook/create` → N notebooks; convite de time → N e-mails; comentário e snapshot duplicados. Nada hoje distingue "falhou antes de chegar" de "chegou e a resposta se perdeu". |

| **Q47 + Q48** | **Três camadas + DTO separado da entidade.** `controllers/` fino (extrai, chama, mapeia) · regra de negócio e autorização numa camada de serviço · acesso a banco isolado · e request/response DTO em arquivo próprio, separado do struct Diesel. | Dissolve `models/notebook.rs` (1175 linhas) **por responsabilidade**, não por tamanho. O DTO separado é exatamente a fronteira que o gerador do Q28 precisa enxergar. Q4 exige cobertura antes — e `models/notebook.rs` já está na primeira leva do Q74. <br>**Aberto ao escrever `rust-rules.md`**: se a raiz da organização é a **camada** (`services/`, `repositories/`, `dto/`, cada um com um arquivo por módulo) ou o **módulo** (`domain/notebook/{controller,service,repository,dto,entity}.rs`). A segunda mantém junto o que muda junto; a primeira é mais próxima do que já existe. |
| **Q49 + Q51** | **Extractor de auth + permissão declarada na rota.** `AuthUser` e `DbConn` como extractors Axum, e `require_permission(...)` como layer por rota, checado antes do handler correr. | Elimina as 2 linhas repetidas em dezenas de handlers **e conserta a ordem por construção**: fica impossível buscar o recurso antes de checar permissão (o bug de `api_get_single_notebook`). Usa as constantes geradas do Q31. <br>**Dificuldade conhecida**: o alvo da permissão depende de path param e o `TargetCtx` do Zeile tem 5 níveis (`global`/`team`/`notebook`/`block_type`/`block`) — o layer precisa extrair isso. Factível, não trivial; é a parte que exige projeto. |
| **Q50** | **Separar bootstrap de roteamento.** `bootstrap.rs` com pool, TLS, background tasks e layers; `routes/mod.rs` só compõe rotas. DTOs saem do `main.rs`. | Pré-requisito prático de Q68 (o shutdown precisa de handle das 4 tasks, hoje spawnadas soltas em 2 arquivos) e de Q67 (`ready` precisa alcançar o pool). |
| **Q52** | Coberto por Q47+Q48 (quebra por responsabilidade) — o limite numérico fica para o Q17. | — |
| **Q53** | **`cargo fmt --all --check` + `cargo clippy -D warnings` + `cargo test`** no CI. | Clippy pega sem review humano várias coisas do diagnóstico: `let _ = Result`, `.unwrap()` questionável, `match` com `_` redundante. **Ordem**: um PR de limpeza antes de ligar `-D warnings`, porque é a primeira vez que clippy roda em 70 arquivos. |

| **Q54** | **Migrations seguem no boot, com `pg_advisory_lock` + flag `RUN_MIGRATIONS`.** | Mantém a conveniência de dev e fica seguro em deploy rolling. Hoje duas instâncias subindo juntas chamariam `run_pending_migrations()` em paralelo — e o `caps_listen_loop` ("backplane multi-nó") indica que multi-instância está no horizonte. A flag permite separar depois sem mudar código. |
| **Q55 + Q58** | **Separar DDL de seed/backfill** (seeds e backfills viram tarefas idempotentes, fora de `migrations/`) **+ padronizar o nome** (formato do Diesel, sem sufixo `-0000` manual) **+ `IF NOT EXISTS` em `ALTER TYPE … ADD VALUE`.** | Hoje `backfill_missing_role_grants`, `seed_team_admin_grants` e `seed_chat_delete_any_grant` são migrations sem serem DDL — e seed que roda uma única vez na história não serve para time criado depois. A guarda do `ALTER TYPE` importa agora: **Q30 vai adicionar 10 `ADD VALUE`**, e só `add_drawing_block_type` tem `IF NOT EXISTS` hoje. |
| **Q56** | **Dois itens de regime de migration, próprios do Zeile**: (a) check `schema.rs` ≡ migrations no CI, no mesmo padrão `--check` do Q28b; (b) `down.sql` obrigatório e testado, com destrutividade declarada no cabeçalho (reversível / destrutiva / irreversível). | (a) `src/schema.rs` (494 linhas) é gerado, está commitado e **nada verifica** — editar à mão ou esquecer de regenerar faz o Rust compilar contra um schema que não é o do banco. Cai sob o regime de artefato gerado da Parte III. <br>(b) O `down.sql` de `add_zig_go_cpp_languages` é **irreversível por natureza**: `ALTER TYPE … DROP VALUE` não existe no Postgres. Isso precisa estar escrito, e Q30 vai criar 10 casos iguais. |
| **Q57** | **Auditar `timestamptz` nas 31 migrations** e corrigir o que estiver sem tz. | Já auditado: a divergência é **aleatória, não histórica**. Sem tz: `add_teams` (teams, team_roles, team_members), `add_team_invitations`, `create_push_subscriptions`, `add_permission_grants`. Com tz: `create_user`, `create_notebooks`, `create_chat_messages`, `create_challenges`, `create_notifications`. `add_permission_grants` e `create_chat_messages` são de julho, dois dias de diferença, e discordam. <br>Importa porque o Zeile grava `createdAt`/`updatedAt`/`editedAt`/`deletedAt`, renderiza data no cliente com `date-fns`, e o histórico (snapshots, activity) depende de ordem temporal correta. |
| **Q59** | **Regra com gatilho declarado**, não obrigação universal: acima de um volume a definir, `CREATE INDEX CONCURRENTLY` em arquivo de migration próprio, fora de transação. | `CONCURRENTLY` não roda em transação, então não combina com o modelo do Diesel sem configuração extra — obrigar sempre seria atrito puro em tabela vazia. Candidatas (crescem por uso, não por cadastro): `blocks`, `notebooks`, `chat_messages`, `notebook_activity`. Os índices GIN de `search_tsv` e o trgm de `search_text` foram criados sem `CONCURRENTLY`. |

| **Q20** | **`features/<domínio>/`** com `components/`, `hooks/` e `types/` co-locados. `components/` passa a ser só o compartilhado (`ui/`, `layout/`, `nav/`, `vendor/`). | Resolve **Q22 → contexts de feature vão para a feature** (acaba com as três casas: `context/`, `lib/*-context.tsx`, `components/notebook/notebook-context.tsx`) e **Q23 → `lib/hooks/` deixa de existir**; hook de feature mora com a feature. Torna a fronteira do Q26 óbvia: feature não importa de feature. Dissolve os quatro critérios concorrentes de `components/` (domínio, camada, biblioteca, tela) e a pasta `interface/`. **Custo aceito: é o maior diff do plano** — 189 componentes, 10 hooks, 3 contexts. Q4 (testes primeiro) se aplica aqui. |
| **Q21** | **`components/vendor/`**, declaradamente vendorizada e **isenta** de i18n (Q42), comentários (Q10/Q11), tamanho (Q17) e naming (Q14). `README.md` com origem, versão e o que foi modificado localmente. | Sem a isenção, a onda 2 do Q42 e a auditoria do Q13 baterariam em `skiper26.tsx` — 1217 linhas de código que não é seu. O README diz se ainda dá para atualizar da origem ou se já divergiu. **Aberto**: se a isenção cobre também Q33 (`any`). |
| **Q24** | **`lib/` = infraestrutura sem estado e sem React.** `types/` · `schemas/` · `stores/` · `domain/` · `context/` sobem para o topo. | `domain/` separado é exatamente o que Q74 quer testar (lógica pura, zero React). Torna a fronteira do Q26 verificável — e há violação **já presente**: `lib/types.ts` importa de `@/components/banner` e `@/components/mdx/callout`. |
| **Q25** | **Todas as colisões, num PR próprio**, sem esperar pela reorganização. | Os dois primeiros são bug real: `cn` errado ⇒ classe Tailwind não resolvida; `NotebookMeta` errado ⇒ campo `undefined` em runtime com o tipo afirmando que existe. Inclui `publicSlug` declarado duas vezes, `lib/api.ts` → `lib/sandbox/`, `lib/hooks/` → `hooks/`, e `use-local-storate` → `use-local-storage`. |
| **Q22 + Q23** | **Resolvidos por Q20.** Context e hook de feature moram na feature; só o genuinamente global fica em `context/` e `hooks/` de topo. | — |
| **Q15** | **Não adotar o prefixo `I`** — já descartado em Q1. | Mantém `Block`, `Notebook`, `Team`. |

| **Q26 + Q27** | **Fronteiras enforçadas por lint** + `@/` obrigatório ao cruzar pasta de topo (relativo só entre vizinhos). Proibido: `types/`/`domain/`/`lib/` → `components/`/`features/` · `components/ui/` → `features/` · `features/a/` → `features/b/` (passa por `domain/`, `lib/` ou `context/`). | Sem enforcement, `features/` é nome de pasta, não fronteira — e é o tipo de regra que humano não pega em review (o import fica no topo, o revisor olha o meio). **Violação já presente**: `lib/types.ts` importa `@/components/banner` e `@/components/mdx/callout`, ou seja o tipo de domínio depende de componente de UI. A correção é inverter: os props saem do componente e viram tipo em `types/`. |
| **Q14** | **kebab-case + sufixo de papel** (`-service`, `-types`, `-schema`, `-store`, `-context`, `use-` para hook). Renomear os 8 camelCase. | Os 8 já vão se mover de pasta no Q24 — renomear no mesmo PR custa zero extra. `forceConsistentCasingInFileNames` já está ligado. |
| **Q16 + Q18** | **Tipos agrupados por domínio coeso** (não granularidade máxima — Q1 descartou) **+ um componente público por arquivo** (subcomponentes privados podem ficar juntos). | Formaliza o que `types/notebook-types.ts` e `types/team-types.ts` já fazem bem, e nomeia o que `lib/types.ts` faz mal (20 definições, 3 domínios, importando de `components/`). `free-drawing-cell.tsx` fica conforme: exporta 1 componente, os internos são privados. |
| **Q17 + Q19** | **🟡 função > 50 linhas · ⚪ arquivo > 400 linhas** (com plano de quebra dos maiores) **+ camelCase em função exportada**, PascalCase só para componente e classe. | Severidades do Q91. Renomeios: `RunTsxInSandbox` → `runTsxInSandbox`, `RunPythonInSandbox` → `runPythonInSandbox` — e ambos vão para `lib/sandbox/` no Q25. Destino dos 10 maiores: `free-drawing-cell.tsx` (1966) e `layouts-canvas-tools.tsx` (1041) e `notebook-page.tsx` (812) → `features/`; `skiper26.tsx` (1217) → `vendor/`, isento; `models/notebook.rs` (1175) e `controllers/websocket.rs` (1020) → Q47/Q48; `free-drawing/engine.ts` (933) → puro, entra no Q74. |

| **Q33 + Q36** | **`noExplicitAny: error` + limpar os 45** + conjunto explícito no `biome.json` refletindo as regras automatizáveis deste documento. | `lib/api/base.ts` é o de maior retorno: é a borda por onde toda resposta entra no app (`body?: any`, `details: Record<string, any>`). Vários dos 30 `biome-ignore` do Q13 caem junto, encurtando aquela auditoria. Coerente com Q78, que vai exigir 0 erro de lint. |
| **Q35** | **Conjunto completo no tsconfig**: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noFallthroughCasesInSwitch`. | `exactOptionalPropertyTypes` é o par TS da distinção que o Rust faz com `Option<Option<T>>` — "ausente" ≠ "presente e null" — e portanto sustenta o Q29. `noFallthroughCasesInSwitch` importa porque Q30 vai adicionar 10 valores a enums que já têm `switch`. `noUncheckedIndexedAccess` vai acusar `match[1].length` em `extractTOCFromBlocks`, o `stack.pop() as string` em `engine.ts` (onde o `as` já é o sintoma) e os acessos por índice em `free-drawing/engine.ts`. **Custo aceito: 4 regras de uma vez em 305 arquivos que nunca as tiveram.** |
| **Q34** | **Proibir `console.log`, permitir `warn`/`error`.** | Preserva os `console.error` legítimos de `lib/env.ts` e `lib/api.ts`. Relevante porque Q66 decidiu não regular PII — e `console.log` com conteúdo de notebook aparece no devtools do usuário. |
| **Q38** | **Sem `throw` raw no frontend**: erro sempre tipado com código. | Caso concreto: `lib/api.ts` faz `throw new Error("O Babel ainda está sendo carregado…")` — pt-BR hardcoded (viola Q42), sem código (não dá para traduzir nem ramificar), lançado de `lib/` para a UI tratar como puder. Passa a seguir o padrão que `handleApiError` já usa para o backend. |
| **Q39** | **Mapear erro Diesel por causa**: `UniqueViolation` → 409, `NotFound` → 404, `ForeignKeyViolation` → 400, com códigos próprios. | Hoje slug público duplicado devolve 500 `DATABASE_ERROR` vazando o nome da constraint; passa a ser 409 traduzível e acionável. Combina com Q65 e com o check de `errorCode` → tradução do Q45. |
| **Q40** | **Proibir `let _ =` sobre `Result`**, com auditoria das ocorrências. | O caso conhecido faz `api_create_notebook` responder 200 e entregar um notebook sem bloco nenhum se `create_block` falhar. Clippy pega (`let_underscore_must_use`) — logo Q53 cobre o enforcement. |
| **Q41** | **`match` exaustivo no `IntoResponse`**, sem o catch-all `_ => (500, "Unknown error")`. | `ApiError` tem 21 variantes; hoje adicionar uma nova compila e ela silenciosamente vira 500 genérico. Sem o `_`, o compilador força a decisão de status. |

| **Q78 + Q79** | **Gate completo**, em PR (obrigatório para merge) e em push na `main`. <br>**Frontend**: `biome check` (0 erro) · `types:check` · `vitest run` · `validate:i18n` (3 checks do Q45). <br>**Rust**: `cargo fmt --check` · `cargo clippy -D warnings` · `cargo test`. <br>**Fronteira, em workflow próprio com filtro de `paths`**: `validate:types` (Q28b) · `validate:schema` (Q56). | Os dois últimos exigem workflow separado porque o grafo do TS não cruza a fronteira de linguagem — `rust-server/` não está nele. **Ordem imposta**: os PRs de limpeza (clippy, `any`, as 4 regras do tsconfig) precisam vir antes de o gate ficar bloqueante, senão o estado normal do CI é vermelho. |
| **Q80** | **`main` protegida, tudo por PR.** | Sem proteção o gate do Q78 é contornável por push direto — e há commits direto na `main` no histórico. Sendo solo, você abre e aprova os próprios PRs; o valor está no gate rodar antes do merge, não no revisor. |
| **Q82 + Q83** | **`<type>: <description>`** com `feat|fix|refactor|test|docs|chore`, com enforcement por hook git. **Branch `<área>/<tipo>/<slug>`** — sem task ID, já que não há tracker. | Os commits recentes já quase seguem (`feat:`, `fix:`, `chore:`); o fora de padrão é `"Atualizar o env.example"`. Áreas naturais: `notebook`, `teams`, `challenges`, `auth`, `rust`, `contracts`, `docs` — e a área sinaliza qual dos 9 docs do Q6 se aplica. |
| **Q84 + Q85** | **Checklist curto no template de PR, sem footer de referência.** | Coerente com o Q78: o que seria checklist humano de contrato (tipo gerado sincronizado, `errorCode` com tradução, `down.sql` classificado) é justamente o que os guards `validate:types`, `validate:i18n` e `validate:schema` verificam automaticamente. O humano não precisa reafirmar o que o CI prova. **Consequência aceita**: a ligação entre uma ADR e o código que a implementa não fica registrada no commit. |

| **Q90 + Q92** | **Nenhum subagente.** Cada doc de regra ganha uma seção "mudou X ⇒ verifique Y" com os pontos de acoplamento reais do Zeile. | Em vez de subagentes de review, um checklist documentado. Os quatro pontos de ripple reais, e três deles já ganham guard automático nas outras decisões: <br>• `sec/catalog/` muda ⇒ `domain/permissions/engine.ts` (segunda implementação da mesma regra), constantes geradas, seeds de grant, **teste de paridade do Q74** <br>• enum de bloco muda ⇒ migration, enum Rust, tipo gerado, `switch` em `block-content.tsx` — **`noFallthroughCasesInSwitch` do Q35 acusa** <br>• formato do doc Automerge muda ⇒ `checkpoint_loop`, snapshots gravados, `history-diff-view`, e **os docs já persistidos** (sem migração de doc = corrupção) — este é o único **sem** guard <br>• `ApiError` ganha variante ⇒ **match exaustivo do Q41**, `errorCode` gerado, chave nos dois locales do Q45 |
| **Q93 + Q95** | **Um PR por bloco, na ordem das dependências.** Ver o plano consolidado no fim deste documento. | Cada PR revisável; nada depende do que ainda não existe. |
| **Q94** | **Fora de escopo: apenas `components/vendor/*`.** | Consequências de não excluir os demais: <br>• decompor `free-drawing-cell.tsx` (1966) e `layouts-canvas-tools.tsx` (1041) **fica em escopo** — mas Q17 marcou arquivo > 400 como ⚪, então acontece de carona no movimento para `features/`, não como PR próprio <br>• PWA/service worker **fica em escopo** sem ter ganhado área de regra em Q97 — **aberto**: se merece doc próprio ou se Q72 (idempotência) já basta <br>• migrar comentários deixou de ser questão: Q10 tornou pt-BR a regra, então os 205 estão conformes, não tolerados |
| **Q96 + Q97** | **Quatro áreas próprias do Zeile entram no escopo de regra**: CRDT/Automerge · sandbox de execução · performance de canvas/render · acessibilidade. | Eleva os docs do Q6 de **9 para 13**. Justificativas: <br>• **CRDT** é a área de maior consequência e a de menor regra — nada versiona o shape do doc, três noções de "versão" convivem (checkpoint, snapshot, history), e a defesa contra eco só existe como comentário em `drawing-cell.tsx:92` <br>• **Sandbox**: `lib/api.ts` monta isolamento artesanal (`Object.defineProperty(window,'parent',…)` + importmap de esm.sh) sem `sandbox` attr documentado; e o judge do Rust executa código de usuário sem limite documentado de tempo/memória/rede <br>• **Performance**: Q11 categoria 2 exige trade-off **medido**, mas nada diz o que medir nem como — e há 2899 linhas de canvas com decisões implícitas <br>• **A11y**: o editor é todo mouse/touch, e o único caso a11y do diagnóstico (`<title>` de `chart-svg.tsx`) só foi tratado porque Q42 decidiu não isentá-lo |
| **Q89** | Pendente — ver "Questões ainda abertas". | — |

### Fronteira entre `features/` (Q20) e as pastas de topo (Q24) — a definir

As duas decisões se sobrepõem em um ponto e precisam de uma linha divisória explícita no
`frontend-rules.md`:

| Pasta de topo | Fica lá quando | Vai para a feature quando |
|---|---|---|
| `types/` | é o contrato **gerado** (Q28) ou tipo usado por 2+ features | é tipo de UI só daquela feature |
| `domain/` | a lógica pura serve 2+ features — `permissions/engine.ts` é o caso claro (permissão é transversal) | serve uma só — `drawing-scene.ts` e `free-drawing/engine.ts` provavelmente pertencem a `features/notebook/` |
| `stores/` | store de runtime compartilhado (`pyodideStore`, `sqlDbStore`, `typstStore`) — são caches de módulo WASM, não estado de feature | — |
| `context/` | auth e tema | `notebook-context` vai para `features/notebook/` |
| `hooks/` | `use-online-status`, `use-is-touch-device`, `use-install-prompt` — plataforma, não domínio | `use-automerge-sync`, `use-presence`, `use-comments` vão para `features/notebook/` |

### Regra nova — "um conceito, uma grafia" 🔴

**Um campo não existe em duas grafias.** Não no fio, não no tipo gerado, não no código do
cliente. Um conceito tem exatamente um nome, e a diferença de casing não cria um segundo campo.

Estado que a regra proíbe, medido hoje:

| conceito | camelCase | snake_case |
|---|---|---|
| `notebookId` | 221 | 4 |
| `teamId` | 170 | 15 |
| `userId` | 48 | 16 |
| `createdAt` | 38 | 7 |
| `isPublic` | 36 | 2 |
| `updatedAt` | 14 | 5 |
| `blockType` | 10 | 2 |
| `targetKind` | 10 | 9 |

A origem é identificável: `folder.rs`, `template.rs`, `chat.rs` e `notebook_snapshot.rs`
camelCasam **campo por campo** com `#[serde(rename = "…")]`, enquanto `permission_grant.rs`
declara `rename_all = "snake_case"` no struct inteiro. Alguém converteu à mão, módulo por
módulo, e o módulo de permissões ficou de fora — daí `targetKind` 10 × `target_kind` 9.

O que a regra veda, especificamente:

1. **`#[serde(rename)]` campo a campo para fazer casing.** Casing é decisão de struct
   (`rename_all`), nunca de campo. `rename` fica reservado para quando o nome no fio é
   genuinamente *outro nome*, não a mesma palavra em outra grafia.
2. **Dois structs do mesmo domínio com `rename_all` divergentes.** É o caso `permission_grant.rs`
   × resto.
3. **Tipo TS com as duas grafias como campos distintos**, e redeclaração redundante do mesmo
   campo em interface derivada (`publicSlug` aparece em `NotebookMeta` **e** em
   `Notebook extends NotebookMeta`).
4. **Adaptador que traduz grafia e mantém as duas vivas.** Se existe uma função que mapeia
   `user_id → userId`, ela é dívida, não solução — o serde já faz isso na origem.
5. **O `alias` da transição (Q29) não vira campo no tipo gerado.** `alias` é exclusivamente
   entrada; o tipo TS gerado enxerga só a grafia canônica. Se um alias aparecer no artefato
   gerado, o gerador está errado.

**Enforcement**: como o gerador é a fonte única, o `--check` do Q28b pode afirmar que nenhum par
de campos do artefato gerado normaliza para o mesmo identificador. Falha de guard, não de review.

### Duas dependências que Q28 cria

**Q29 (casing) deixa de ser cosmético.** Gerar do Rust significa que o TS gerado reproduz
fielmente o que o `serde` produz — inclusive `userId` (via `#[serde(rename)]`) ao lado de
`user_id`, `is_public`, `team_id` **no mesmo objeto**. O gerador torna a inconsistência explícita e
permanente em vez de acidental. O lado bom: padronizar é uma linha por struct
(`#[serde(rename_all = "camelCase")]`), e o guard de `--check` prova que o front acompanhou.

**Q30 (enum de bloco) vira pré-requisito.** Gerar os enums do Rust hoje **pioraria** o frontend:
o Rust/Postgres tem 4 valores de `block_type`, o front precisa de 14. Não há como gerar antes de
decidir quem é a fonte de verdade do tipo de bloco.

---


---

## Parte III — Regime do artefato gerado

Regra do Zeile para todo artefato produzido por gerador — o contrato Rust→TS (Q28), o
`schema.rs` do Diesel (Q56) e qualquer gerador futuro. Oito propriedades, todas obrigatórias:

1. **Três passes sem vazamento entre eles.** Uma configuração declarativa (o que atravessa),
   um passe de análise (fonte → representação intermediária, sem conhecer a sintaxe de destino)
   e um passe de emissão (representação → texto de destino, sem tocar a fonte). A saída é função
   determinística da representação intermediária — é isso que torna possível a comparação
   byte-a-byte do item 3.
2. **O gerado é commitado.** O diretório de saída é apagado e reescrito a cada execução, com
   detecção de arquivo órfão: arquivo que existe e não é mais gerado é reportado como divergência,
   não ignorado.
3. **Modo `--check`.** Regenera em memória e falha listando os arquivos divergentes, com a
   instrução de correção na própria mensagem ("rode `generate:*` e commite"). É o guard de CI.
4. **O output passa pelo formatador do destino antes de ser commitado.** Sem isso o formatador
   e o guard de drift discordam: um quer reformatar, o outro chama a reformatação de drift. Para
   `.ts` gerado, `biome format`; para `.rs` gerado, `rustfmt`.
5. **Allowlist em configuração, nunca edição do gerado.** Ampliar o que atravessa é mudança de
   config revisada em PR. Todo arquivo gerado leva cabeçalho `@generated`.
6. **Workflow de CI dedicado, com filtro de `paths`.** O grafo de dependências do TypeScript não
   cruza a fronteira de linguagem — `rust-server/` não está nele —, então um workflow comum nunca
   dispararia quando só o lado Rust mudasse.
7. **O gerador tem teste de regressão próprio.** Ele é código de produção: define o contrato.
8. **README com tabela de mapeamento, o que exige decisão humana, e limitações conhecidas.** Ser
   explícito sobre o que o gerador *não* infere é o que evita confiança indevida no artefato.

### Por que ferramenta de mercado, e não gerador próprio

Indo **Rust → TypeScript**, o TypeScript é mais expressivo que o Rust exatamente no que importa
aqui: union type, campo opcional, literal type. Quase tudo que o `serde` produz tem representação
TS direta, então não há perda de informação que justifique escrever um gerador.

O cálculo se inverteria na direção oposta (TS → Rust), onde um esquema intermediário perde
genéricos, não distingue `foo?: T` de `foo: T | null`, e não alcança regras de validação
declaradas em código. Não é o caso do Zeile.

### Aplicação ao `schema.rs`

`rust-server/src/schema.rs` (494 linhas) é gerado pelo Diesel a partir das migrations, está
commitado, e **nada verifica que corresponde a elas**. Editar à mão ou esquecer de regenerar faz
o Rust compilar contra um schema que não é o do banco. O mesmo regime `--check` deste capítulo
resolve — é o item (a) do Q56.

---

## Parte IV — Plano consolidado

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

Ordem imposta pelas dependências, já incorporando a branch `tauri` (Parte V). Uma etapa = um PR,
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

- [ ] Backend: sinaliza · para de aceitar conexão · checkpoint de todo o `sync_registry` · close frame nos WS · drena o pool (Q68)
- [ ] `POST /internal/shutdown` com token de sessão + peer loopback (Q102)
- [ ] Shell: segurar o `ExitRequested` (é cancelável) → chamar shutdown → poll `ready` → SIGKILL só por timeout (Q98)
- [ ] Compilar Go, Zig e C++ dentro do `bwrap`, como já se faz com Rust (Q106)
- [ ] Aplicar o `RunLimits` inteiro no `prlimit` — hoje só `cpu_secs` chega lá (Q107)

Os dois últimos entraram nesta etapa por serem 🔴 e por ficarem visíveis no momento em que o
repositório abrir: qualquer pessoa lê `compile_go` e vê que o `go build` roda no host. Não são
tema de shutdown; são a dívida que a escrita do diagrama de isolamento do README revelou.

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

#### 11 · Geradores e guards (Parte III)

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
| Q20/Q24 | Linha divisória entre `features/<x>/` e as pastas de topo — ver a tabela acima |
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

## Parte V — A branch `tauri` (desktop) e o que ela muda

`origin/tauri` está 13 commits à frente de `main` (merge-base `3dee546`), com 72 arquivos e
~6850 inserções. Fases 0–3 do `ZEILE_DESKTOP.md` implementadas; Fase 4 (LAN) planejada.

### O que a branch já faz melhor que a `main`

Registrar isto importa porque contradiz a premissa de que as regras vêm de fora:

- **`ZEILE_DESKTOP.md` é o melhor documento do repositório.** Plano em fases com checkbox de
  estado real, decisões tomadas **com justificativa técnica** (SQLite rejeitado porque
  `diesel-async` não o suporta e `AsyncPgConnection` é usado em ~30 arquivos), "Decisões em
  aberto" explícitas, riscos marcados 🔴, e critério de aceite por fase — inclusive quando
  parcialmente atingido. É, de fato, o formato de ADR do Q8 já em uso.
- **`src-tauri/README.md` documenta caveat de plataforma com honestidade**: o soname do
  `libxml2` que quebra o Postgres embarcado em Arch, o risco de symlink na extração no
  Windows com as três alternativas, e a tabela de custo de certificado Authenticode.
- **Os commits seguem `<type>(scope): <descrição>`** — mais rigoroso que o formato escolhido
  no Q82, e todos dentro do vocabulário (`feat`, `fix`, `ci`, `docs`).
- **O roteador decide por capacidade, não por string de path** — e o documento diz por quê
  ("frágil") — é o mesmo raciocínio da regra que veda literal mágico em ponto de decisão.

Ou seja: Q2 ("processo humano com regras claras") tem base. As regras a escrever descrevem
em boa parte um método que já existe nesta branch e não chegou à `main`.

### 🔴 A contradição frontal: Q68 é derrotado pelo shell desktop

```rust
// src-tauri/src/lib.rs
fn kill_children(handle: &tauri::AppHandle) { … let _ = child.kill(); }   // SIGKILL
```

O Q68 decidiu graceful shutdown com **checkpoint final de todo o `sync_registry`** porque
entre dois ciclos do `checkpoint_loop` o documento Automerge vive só em memória. O shell
desktop mata o backend com SIGKILL no `ExitRequested`.

Consequência: no desktop a janela de perda **não é por deploy — é por fechar o aplicativo**.
Acontece em todo uso normal, não num evento raro de operação. E o dado perdido é local: não
há servidor nuvem de onde reconciliar.

O Q68 precisa de uma contraparte no shell: sinalizar shutdown ao backend, esperar o
checkpoint, e só então encerrar — com timeout, e SIGKILL apenas como último recurso.

### 🔴 Roteamento por capacidade: cinco furos verificados

O mecanismo é bom; a aplicação tem lacunas que fazem dado ir para o lugar errado.

| # | Furo | Consequência |
|---|---|---|
| 1 | **`capability` é opcional e o default resolve para `remote`.** `api = createApi()` sem capacidade → nuvem. | Fail-open-to-cloud: **esquecer** de declarar faz um app offline conversar com a nuvem, silenciosamente. O default deveria falhar, não escolher. |
| 2 | **`"public"` existe no tipo `Capability` e nenhum serviço a usa.** `getPublicNotebookBySlug` está em `notebook-service.ts`, que declara `notebook-crud` — capacidade **local**. | Com conta local no desktop, abrir notebook público roteia para `127.0.0.1:3099`, onde ele não existe. |
| 3 | **`forgot-password-form.tsx` e `reset-password-form.tsx` usam o `api` sem capacidade.** | O resultado (nuvem) está certo; o mecanismo, não — é implícito e quebra se o default mudar. Deveriam declarar `auth`, ou uma capacidade cloud-only própria. |
| 4 | **`login-form.tsx` e `profile-form.tsx` importam `BASE_URL` direto**, ignorando `resolve()`. | `BASE_URL` é a constante **remota**. O que passa por ali vai para a nuvem independentemente da conta ativa. |
| 5 | **`app/api/search/route.ts` (rota de servidor Next) importa o `api` do cliente**, que lê cookie via `cookies-next` e `navigator.onLine`. | No servidor `isDesktopRuntime()` é `false` e `getCookie` não vê o cookie do usuário. A verificar, mas o acoplamento está invertido. |

Mais um, de natureza diferente: **`exec-compiled` está em `LOCAL_CAPABILITIES` sem condição
de plataforma**, mas a execução compilada é `#[cfg(unix)]` e os handlers `/run*` respondem
"não suportado nesta plataforma" via `if !cfg!(unix)`. A matriz de capacidades conhece
runtime e tipo de conta, mas **não conhece plataforma**.

### Version skew: um eixo novo que atinge Q28, Q29, Q45 e Q54

Até aqui havia um servidor e um cliente sempre servido dele. Agora há **dois backends**
(nuvem e local) e um cliente **instalado**, que pode ter meses.

| Decisão | O que muda |
|---|---|
| **Q28** (contrato gerado) | O artefato gerado pressupõe uma versão de servidor. Um desktop instalado em março fala com uma nuvem de julho. O `--check` garante coerência **no repositório**, não em campo. |
| **Q29** (`serde alias` de transição) | O prazo de remoção do alias passa a depender de **clientes instalados**, não só da fila do `backgroundSync` no IndexedDB. A ADR precisa de política de versão mínima suportada. |
| **Q45** (`errorCode` → tradução) | Nuvem nova emitindo código que o cliente instalado não tem em `messages/*.json` ⇒ usuário vê a string crua. O check cobre o repo, não a combinação em campo. |
| **Q54** (migration no boot) | Agora roda **na máquina do usuário, a cada launch**. Instalar uma versão antiga depois de uma nova deixa o banco migrado além do que o binário conhece — e `run_pending_migrations` não detecta migration "do futuro". O `pg_advisory_lock` resolve concorrência, não downgrade. |
| **Q56** (`down.sql` classificado) | Ganha segundo sentido: no desktop **não há operador** para rodar rollback. |

### Duas crates Rust, sem workspace — Q53 e Q78 não cobrem nenhuma das duas

Não existe `Cargo.toml` na raiz. `rust-server` é `edition = "2024"`; `src-tauri` é
`edition = "2021"` com `rust-version = "1.77.2"`. O próprio CI reconhece a separação
(`rust-cache` com `workspaces: src-tauri` e `rust-server`).

Logo `cargo fmt --all --check` e `cargo clippy --all-targets` da raiz (Q53) **não alcançam
nenhum dos dois crates**. Precisa rodar duas vezes com `--manifest-path`, ou criar um
workspace raiz — e nesse caso reconciliar as duas editions.

### O pipeline de release não tem gate

`desktop-release.yml` dispara em tag `v*` e vai direto para o `tauri-action`. Não há
`biome check`, `types:check`, `cargo clippy`, nem teste. O Q78 escolheu gate em PR e em push
na `main` — **um push de tag contorna tudo e publica instalador** para Windows, macOS e Linux.

### Placeholders de scaffold empacotados

`src-tauri/Cargo.toml` mantém `description = "A Tauri App"`, `authors = ["you"]`,
`license = ""`. E `version = "1.0.0"` está fixo no arquivo enquanto o README declara o
`package.json` como fonte única (sincronizada por `build-desktop.mjs`) — mas o `package.json`
é `"name": "docs"`, `"version": "1.0.0"`. O produto desktop se chama "Zeile Notebook",
versiona `1.0.0`, e deriva de um pacote chamado `docs`.

### Superfície de segurança nova

| Achado | Nota |
|---|---|
| **`"csp": null`** em `tauri.conf.json` | CSP explicitamente desligada. |
| **`WebviewUrl::External("http://localhost:3000")`** | O app é um navegador apontado para origem HTTP, não `tauri://`. Sem isolamento de origem do Tauri. As `capabilities/default.json` (`core:default`, mínimo — bom) protegem a IPC, mas a página não roda em origem privilegiada. |
| **O backend continua fazendo bind em `0.0.0.0`** (`main.rs` inalterado) | Num laptop, o backend local e o Postgres embarcado ficam alcançáveis pela LAN. Combinado com CORS `Any/Any/Any`, que o Q62 ainda não corrigiu. |
| **`jwt_secret` em texto puro** em `app_local_data_dir/jwt_secret`, sem `0600` | O segredo em si é forte (dois UUID v4 = 256 bits de `getrandom`); a permissão do arquivo é o default. |
| **`embedded_pg`: `password: "zeile"` fixo** | E o data dir cai para `std::env::temp_dir()/zeile-pgdata` quando `ZEILE_PG_DATA` não está definido — local compartilhado e legível por outros usuários no Linux. |
| **`embedded_pg` baixa o binário do PostgreSQL em runtime, no 1º launch** | Cadeia de suprimento, e contradiz a premissa offline-first: a primeira execução exige internet. O README já nomeia a correção (feature `bundled`). |
| **`unsafe { std::env::set_var(…) }`** em contexto async | É `unsafe` na edition 2024 exatamente por isso: mutar env depois de haver threads é problemático. Melhor devolver a URL e passá-la adiante. |
| **`dotenvy::dotenv()` dentro de `embedded_pg::ensure_running()`** | Carregamento de env num segundo lugar. Relevante para o `env-vars.md` do Q61. |

### Operabilidade: `wait_for_port` é um `ready` improvisado

O shell espera 30s pela porta 3000 e, no timeout, apenas `log::warn!` — **cria a janela de
qualquer forma**, resultando em tela branca sem erro ao usuário. Porta aberta ≠ pronto: no
primeiro launch o backend pode ainda estar baixando e inicializando o Postgres. É
precisamente o argumento do Q67 (`health/ready`), agora com um consumidor concreto.

### i18n e erro: `run-rust.ts` concentra dois problemas já decididos

- pt-BR hardcoded novo: `"Bloco compilado!"`, `"Código executado com sucesso."`,
  `"Erro de Execução"`, `"Falha relacionada a outro módulo. Tente compilar outros blocos
  primeiro :))"`, `"Erro: Não foi possível se comunicar com o servidor."` — entra na onda 2 do Q42.
- E, pior, **decide status fazendo `includes()` em texto de compilador**, em dois idiomas:
  `stderr.includes("Erro de Compilação Go:")`, `includes("Finished \`dev\` profile")`,
  `includes("file not found for module")`, `includes("Segurança:")`. É literal mágico em ponto
  de decisão, e quebra quando o cargo muda a frase. Pertence ao backend como `errorCode`
  estruturado (Q32), não ao cliente como heurística de string.

### O que o desktop acrescenta ao escopo de regra

Além das 4 áreas do Q97, o desktop pede:

- **`desktop.md`** — matriz de capacidades como fonte única, regra de que capacidade é
  obrigatória (não opcional), plataforma como terceiro eixo, empacotamento e versionamento,
  assinatura de código, dependência de runtime por distro.
- **Política de compatibilidade de versão** — cliente instalado × servidor; versão mínima
  suportada; o que acontece no downgrade de migration.
- E `lib/runtime/router.ts` entra na **primeira leva de testes (Q74)**: é lógica pura que
  decide para onde vai o dado do usuário, com o mesmo perfil de risco de
  `permissions/engine.ts`.

### Decisões do desktop

| # | Decisão | Consequência |
|---|---|---|
| **Q98** 🔴 | **SIGTERM → poll em `health/ready` até cair → SIGKILL só por timeout (~10s)**, e a janela só fecha depois. | Fecha a janela de perda no caso normal (fechar o app), que no desktop é todo uso. Depende de Q68 (checkpoint no shutdown) e Q67 (`ready`) — ambos já decididos. <br>**Dois pontos de projeto**: (a) `ExitRequested` é **cancelável** no Tauri — o shell precisa segurar o fechamento enquanto espera, senão a janela morre antes do checkpoint; (b) **não existe SIGTERM no Windows**, então o mecanismo portável tem de ser outro (endpoint local de shutdown ou pipe). Ver Q102. |
| **Q99** 🔴 | **`capability` obrigatória por tipo** (`createApi(cap: Capability)` sem default; remover `export const api = createApi()`) **+ auditar os 5 furos**. | Fail-closed pelo compilador, não por disciplina. **Mas 3 dos 5 furos não são erro de tipo** e precisam de correção explícita: `"public"` sob `notebook-crud` (roteia notebook público para `127.0.0.1`), `app/api/search` importando o cliente numa rota de servidor, e `exec-compiled` sem eixo de plataforma. Os outros dois o typecheck acusa: `login-form`/`profile-form` importando `BASE_URL`, e os forms de senha usando o `api` sem capacidade. <br>Confirma `lib/runtime/router.ts` na **primeira leva de testes do Q74**. |
| **Q100** | **Três peças**: (1) handshake de versão de contrato exposto no `health/ready`, com aviso ao cliente velho demais; (2) **guarda de downgrade de migration** — comparar o último aplicado com os embutidos no binário e recusar o boot com mensagem clara; (3) política de versão mínima suportada em ADR, que passa a governar o prazo do `serde alias` do Q29. | (2) é o único dos três que corrompe dado na máquina do usuário: `run_pending_migrations` não detecta migration "do futuro", então instalar v2 depois de v3 é comportamento indefinido. O `pg_advisory_lock` do Q54 resolve concorrência, não downgrade. |
| **Q101** | **`Cargo.toml` de workspace na raiz** com `members = ["rust-server", "src-tauri"]` **+ job de gate antes do `build` no `desktop-release.yml`**. | Resolve o Q53, que hoje **não alcança nenhum dos dois crates** (não há `Cargo.toml` na raiz). <br>**Exige reconciliar**: `rust-server` é edition 2024, `src-tauri` é 2021 com `rust-version = "1.77.2"`. <br>E fecha o furo de publicar sem verificar: hoje um push de tag `v*` gera instalador para Linux, macOS e Windows sem lint, typecheck ou teste. |
| **Q102** | **Endpoint local de shutdown protegido por token de sessão.** O shell gera um UUID no boot e o passa por env (`ZEILE_SHELL_TOKEN`); `POST /internal/shutdown` exige o header **e** peer address de loopback. | Um mecanismo idêntico nos três sistemas, resolvendo a ausência de SIGTERM no Windows. **Só é seguro depois de Q103 (bind loopback) e Q62 (CORS por origem)** — um endpoint que mata o servidor não pode estar exposto na rede. |
| **Q103** | **Os quatro itens de segurança do desktop**: bind loopback (env `BIND_ADDR`, `0.0.0.0` só no perfil LAN da Fase 4) · Postgres embarcado via feature `bundled` em vez de download em runtime · `jwt_secret` com `0600`, senha do PG gerada em vez de `"zeile"` fixo, e `ZEILE_PG_DATA` exigido em vez de cair para `temp_dir()` · CSP definida no `tauri.conf.json`. | O `bundled` resolve três coisas de uma vez: cadeia de suprimento, a premissa offline-first (hoje o 1º launch exige internet) e o caveat do `libxml2` em Arch. As `capabilities/default.json` já estão mínimas (`core:default`) — o problema é a página não rodar em origem privilegiada e a CSP estar `null`, num app que interpreta markdown, LaTeX, Mermaid, SVG e executa TSX em iframe. **Definir a CSP é o de maior retorno**; trocar o modelo de serving (sair do sidecar Node) é projeto grande e fica fora daqui. |
| **Q104** | **Capacidade resolvida em runtime pelo backend**: `GET /capabilities` devolve o que ele realmente sabe fazer, por linguagem. O front desabilita bloco por bloco com base na resposta. | A plataforma não era a pergunta certa: no Linux `exec-compiled` depende de `bwrap`/`prlimit`/`wasmtime` **e** da toolchain de cada linguagem — são quatro respostas, não uma, e duas máquinas Linux divergem. Elimina heurística de plataforma no cliente e serve à Fase 4, onde o host do professor pode ter só parte das toolchains. |
| **Q105** | **O backend devolve status estruturado** (`{ status, errorCode, stdout, stderr }`); o cliente ramifica por código, nunca por substring. | Remove `stderr.includes("Erro de Compilação Go:")`, `includes("Finished \`dev\` profile")`, `includes("file not found for module")` e `includes("Segurança:")`. É literal mágico decidindo fluxo: quebra quando o cargo muda a frase — e o backend já sabe a resposta — foi ele que invocou o compilador. Encaixa em Q32 (`errorCode` aditivo) + Q45 (chave nos dois locales). |

### Decisões da sandbox de execução

Levantadas ao escrever o diagrama de isolamento do README, lendo `src/sec/mod.rs`,
`src/executor/mod.rs` e `src/file/mod.rs` em vez da lista de camadas que já estava documentada.
As duas são 🔴 e entram na etapa 6.

| # | Decisão | Consequência |
|---|---|---|
| **Q106** 🔴 | **A compilação de Go, Zig e C++ passa a acontecer dentro do `bwrap`**, com o mesmo envelope já usado em `compile_rust`: `--unshare-all --die-with-parent --new-session`, bind read-only de `/usr` `/lib` `/bin`, `/tmp` novo, e o workspace da sessão montado em `/app`. | Hoje a etapa de execução é idêntica para todas as linguagens, mas a de **compilação não é**: `compile_rust` roda sob `bwrap`; `compile_cpp` só sob `prlimit --cpu=10 --as=2147483648`; `compile_go` e `compile_zig` invocam o compilador direto no host. Isso importa porque **compilador executa código** — `build.rs`, macros, diretivas de linker, `#cgo`. O `verify_*_code` barra o óbvio, mas é blocklist textual, não prova, e é justamente a camada que o resto do modelo assume como falível. <br>**Hipótese registrada**: a assimetria é resíduo de medição antiga de performance, não decisão de projeto. Então a entrega **precisa vir com número** — tempo de compilação por linguagem antes e depois, na mesma máquina. Se o custo for real, a resposta é reaproveitar o sandbox (bind read-only do toolchain, cache do `go build`), não abrir mão dele. |
| **Q107** 🔴 | **O `RunLimits` inteiro chega ao `prlimit`**: `mem_kb` vira `--as`, e o campo deixa de existir sem efeito. | `RunLimits` declara `cpu_secs`, `mem_kb` e `wall_ms`. Em `file/mod.rs` só o `--cpu` é montado; `wall_ms` é honrado pelo `timeout` do tokio; **`mem_kb` não é aplicado em lugar nenhum** — nem o default de 1 GiB, nem o valor por desafio que `challenge_judge.rs:37` calcula com `mem_limit_kb.max(4096)`. Ou seja: o teto de memória por submissão existe no tipo, no juiz e na documentação, e não existe no processo. Uma alocação grande hoje é contida pelo cgroup do host, se houver, ou por nada. <br>Fechar isso é uma linha de argumento no comando — o que custa é o teste que prova o limite ativo, e é ele que impede a regressão silenciosa de novo. |

### Pendências de housekeeping da branch

Não valem pergunta, mas precisam entrar em algum PR:

- `src-tauri/Cargo.toml`: `description = "A Tauri App"`, `authors = ["you"]`, `license = ""` — placeholders de scaffold. E `version = "1.0.0"` fixo no arquivo, enquanto o README declara o `package.json` como fonte única.
- `package.json`: `"name": "docs"`, `"version": "1.0.0"`. O produto desktop se chama "Zeile Notebook" e deriva de um pacote chamado `docs`.
- `unsafe { std::env::set_var(…) }` em `embedded_pg.rs`, em contexto async — devolver a URL e passá-la adiante em vez de mutar o ambiente.
- `dotenvy::dotenv()` dentro de `embedded_pg::ensure_running()` — segundo lugar carregando env; reconciliar com o `env-vars.md` do Q61.
- `BASE_URL` continua exportado de `lib/api/base.ts` sem ser usado para montar URL — resíduo, e é justamente o que `login-form`/`profile-form` importam (furo 2 do Q99).
- `wait_for_port` no timeout apenas `log::warn!` e cria a janela: tela branca sem erro. Trocar pelo `health/ready` do Q67 e, falhando, mostrar erro ao usuário.

### ⚠ Restrição de sequenciamento que a branch impõe

`origin/tauri` está 13 commits à frente e toca 72 arquivos, entre eles `lib/api/base.ts`,
`context/auth-context.tsx`, `components/login-form.tsx`, `components/signup-form.tsx`,
`hooks/use-presence.ts` e os 15 `lib/api/*-service.ts`.

A **etapa 15** do checklist (Q20/Q24 — `features/` + pastas de topo) move 189 componentes,
10 hooks e 3 contexts. Fazer isso na `main` com a branch `tauri` aberta produz conflito
em quase todo arquivo que ela toca, sem resolução mecânica possível.

**Consequência: a `tauri` precisa entrar na `main` na etapa 9, antes da 15** — ou aceitar refazer
o trabalho de 13 commits sobre a nova estrutura. E como o desktop introduziu decisões 🔴
próprias (Q98, Q99, Q102, Q103), o merge deve vir depois delas, não antes.

O checklist consolidado, já com estas etapas na posição correta, está na **Parte IV**.
