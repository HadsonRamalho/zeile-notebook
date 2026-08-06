# Modelo de permissões do Zeile — Design

Status: **implementado** — fases 1 a 6 da seção 11 concluídas; a fase 7 (projeção
server-side para permissão confidencial) está deliberadamente adiada até surgir um caso real
de sigilo. Este documento descreve o modelo de permissões como ele existe hoje: catálogo
atômico versionado, grants por recurso, avaliação em tempo real e coesão front/back. As
decisões da seção 3 têm ADR retroativa em
[0003-permission-model](decisions/0003-permission-model.md).

## 1. Motivação e estado atual

Hoje as permissões vivem como **colunas booleanas fixas** em `team_roles`
(`can_read`, `can_write`, `can_manage_privacy`, `can_manage_clones`,
`can_invite_users`, `can_remove_users`, `can_manage_permissions`, `can_manage_team`).

Limitações que este redesenho resolve:

- Cada permissão nova exige **coluna + migração** (ex.: `add_manage_team_permission`).
- Não há como mirar um **recurso específico** (Notebook-1, Bloco-X) nem um **tipo de
  bloco** (só Rust, só Go).
- A avaliação é **grosseira e única**: `get_user_notebook_permissions` devolve um saco
  de bools e o `websocket_handler` checa só `can_read` **uma vez no connect**.

## 2. Requisitos

1. Catálogo de permissões versionado, fracionado por módulo/recurso.
2. Permissões atômicas sobre cada possibilidade de cada módulo.
3. Avaliação em tempo real contra a conexão ao documento (perdeu a permissão → o
   recurso some/desabilita ao vivo).
4. Distinção entre permissões **gerais** (fácil manuseio) e **granulares/atômicas**.
5. Coesão front/back: se o backend proíbe, o frontend não renderiza.

### Regras de escopo

- Permissões só existem **dentro de um Time** ou de **notebooks de propriedade do
  usuário**.
- Notebook público: o dono define **permissões gerais** aplicáveis a qualquer usuário
  logado (**exceto exclusão**).

## 3. Decisões batidas

| Tema | Decisão |
|------|---------|
| Catálogo | Em **código Rust**, fracionado por módulo, validado no boot. Grants ficam em **dados**, não em schema. |
| Storage | Tabela única `permission_grants`. `team_roles` fica fino (id, team_id, name). |
| Geral vs granular | `tier: General \| Granular` no catálogo + mapa `implied_by` (geral expande em granulares). |
| Transporte realtime | **Reusar o WebSocket existente** (sync Automerge + presence). Sem SSE. |
| Enforcement | Push é só UX. Backend **revalida** em toda operação privilegiada. |
| `view` confidencial | `Cosmetic \| Confidential` por permissão no catálogo. **Default cosmético**; só o confidencial paga projeção server-side. |
| Fan-out de invalidação | **In-memory via `SyncRegistry` agora**; LISTEN/NOTIFY do Postgres como ponto de extensão isolado (multi-instância). |
| Fonte de verdade front/back | Catálogo Rust gera `permissions.generated.ts` (pipeline análogo ao `pnpm generate-docs`). |

## 4. Catálogo de permissões

Canônico em código, fracionado por módulo:

```
rust-server/src/sec/catalog/
  mod.rs         # registra + valida o catálogo no boot
  notebook.rs
  blocks.rs
  team.rs
  chat.rs
```

Cada permissão é **atômica**, com chave pontilhada hierárquica e metadados:

```rust
perm! {
    key: "notebook.blocks.rust.execute",
    tier: Granular,                         // General | Granular
    targets: [BlockType, Block, Notebook],  // onde pode ser mirada
    label: "perm.notebook.blocks.rust.execute", // chave i18n
    implied_by: ["notebook.blocks.execute"],     // expansão geral -> granular
    view: None,                             // Some(Cosmetic|Confidential) só p/ perms de leitura
}
```

Validações no boot (server não sobe se falhar): chaves duplicadas, `implied_by`
apontando pra chave inexistente, `targets` inválido, perm de `view` sem marca
`Cosmetic|Confidential`.

### Exemplos de chaves

```
notebook.edit_name
notebook.blocks.add
notebook.blocks.rust.add
notebook.blocks.rust.execute
notebook.blocks.go.view          # perm de leitura -> tem marca view
team.edit_name
team.roles.edit_role_name
team.roles.create_role
team.roles.edit_role_permissions
chat.messages.send               # bloqueável por chat específico via target
```

### Geral vs granular (requisito 4)

- A UI mostra os toggles **gerais** por padrão; os **granulares** ficam num "modo
  avançado".
- Uma permissão `General` (ex.: `notebook.view`) **expande** para o conjunto granular
  via `implied_by` (`notebook.blocks.*.view`).
- Um `deny` granular **sobrepõe** o `allow` geral → habilita "vê tudo, exceto blocos
  Go" e "bloquear mensagens deste usuário neste chat específico".

## 5. Modelo de dados

`team_roles` perde as colunas booleanas e vira apenas
`(id, team_id, name, created_at)`. Membros continuam referenciando `role_id`.

```sql
CREATE TYPE grant_subject_kind AS ENUM ('role', 'user', 'principal');
CREATE TYPE grant_target_kind  AS ENUM ('team', 'notebook', 'block', 'block_type', 'chat', 'global');
CREATE TYPE grant_effect       AS ENUM ('allow', 'deny');

CREATE TABLE permission_grants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_kind      grant_subject_kind NOT NULL,
    subject_id        UUID,           -- role_id ou user_id
    subject_principal VARCHAR,        -- 'authenticated' | 'anonymous'
    scope_team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,  -- NULL p/ notebook público de usuário
    permission_key    VARCHAR NOT NULL,   -- validado contra o catálogo em runtime
    target_kind       grant_target_kind NOT NULL,
    target_id         UUID,           -- notebook/block/chat específico
    target_value      VARCHAR,        -- ex.: block_type = 'rust'
    effect            grant_effect NOT NULL DEFAULT 'allow',
    created_at        TIMESTAMP NOT NULL DEFAULT now(),

    CHECK (
        (subject_kind = 'principal' AND subject_principal IS NOT NULL AND subject_id IS NULL)
        OR (subject_kind IN ('role','user') AND subject_id IS NOT NULL AND subject_principal IS NULL)
    )
);

CREATE INDEX idx_grants_lookup
    ON permission_grants (permission_key, target_kind, target_id, target_value);
CREATE INDEX idx_grants_subject
    ON permission_grants (subject_kind, subject_id, subject_principal);
```

### Como as regras de escopo caem no modelo

- **Time**: grants com `scope_team_id` preenchido, `subject_kind='role'` (ou `'user'`
  p/ override individual).
- **Notebook público de usuário**: grants com `subject_kind='principal'`,
  `subject_principal='authenticated'`, `target_kind='notebook'`, `scope_team_id=NULL`.
  O endpoint de edição de permissões públicas **rejeita `notebook.delete`** (carve-out).
- **Dono de notebook de usuário**: allow-all implícito (não precisa de grants).

### Migração dos bools atuais

Cada coluna vira uma linha de grant `target_kind='team'`, `effect='allow'`, por role:
`can_read → notebook.view`, `can_write → notebook.edit` (+ granulares implicadas),
`can_manage_team → team.manage`, etc. Depois, drop das colunas.

## 6. Motor de avaliação

Função central, resolvida **por conexão** e recomputada em invalidação:

```rust
fn capabilities(user: Option<Uuid>, ctx: &NotebookCtx) -> CapabilitySet;
fn can(caps: &CapabilitySet, key: &str, target: TargetCtx) -> bool;
```

Precedência:

1. Dono de notebook de usuário, ou role com `team.manage` → **allow-all** (menos
   carve-outs).
2. Junta grants candidatos: role do user no time dono + grants diretos do user +
   principal `authenticated` (se público).
3. Ordena por **especificidade do alvo**:
   `block(id)` > `block_type(value)` > `notebook(id)` > `team` > `global`.
4. No nível mais específico com match, **`deny` vence `allow`**. Sem match, desce ao
   próximo nível. Nada em nível nenhum → **default-deny**.

## 7. Realtime — WebSocket, não SSE

Reusar o WS por notebook já existente (`SyncRegistry` + presence rooms). O canal de
permissão pega carona no socket já autenticado.

Fluxo de invalidação:

```
admin edita role/grant  ->  backend persiste
                         ->  broadcast_capability_change(affected)   [ponto único de fan-out]
                         ->  SyncRegistry emite `capabilities_updated` aos peers afetados no notebook
                         ->  cliente recomputa CapabilitySet (ou recebe o novo embutido)
                         ->  re-render (esconde bloco / remove botão)
```

`broadcast_capability_change` é o **único** ponto de fan-out. Hoje: in-memory sobre a
`SyncRegistry` (cobre 1 processo). Multi-instância (futuro): trocar a implementação
dessa função por **Postgres LISTEN/NOTIFY** (ou Redis pub/sub) sem tocar no resto.

> O push é **affordance de UX**. O enforcement **não depende** dele: o backend
> revalida `can(...)` em toda operação privilegiada. Se o push se perde, a segurança
> se mantém.

## 8. Enforcement em camadas (defesa em profundidade)

1. **Connect gate**: resolve `CapabilitySet` no upgrade do WS; recusa sem
   `notebook.view`.
2. **Enforcement de ação/escrita**: todo endpoint mutante e o executor de código
   revalidam `can(...)`. Botão sumir no front é cosmético; o endpoint (`run_rust`
   etc.) é quem barra de fato.
3. **Frontend**: `useCan(key, target?)` / `<Can>` guard substitui os checks ad-hoc de
   `can_write`. Puramente UX.

## 9. Confidencialidade de leitura (o ponto difícil)

Duas classes de permissão de `view`, marcadas **no catálogo** (não no grant — é
garantia de segurança, não opção de admin):

- **`Cosmetic`** (default): manda o doc completo, esconde no render. Barato. Entrega
  organização visual, **não** sigilo — o dado está no cliente (inspecionável). A UI de
  gerência rotula como "oculta visualmente".
- **`Confidential`** (opt-in): exige **projeção server-side** — o servidor mantém o
  doc completo e sincroniza um doc **filtrado** por capability (remove blocos negados
  antes de emitir o sync Automerge). Custo: merge de volta não-trivial (provável
  read-only sobre blocos filtrados) e/ou cripto por-campo. A UI rotula como "acesso
  bloqueado".

Estratégia: **começa tudo cosmético** (já entrega os 5 requisitos pro caso comum);
promove pra `Confidential` só quando um caso real de sigilo aparecer (mudança local +
projeção só daquele tipo). Migração cosmético→confidencial é barata; o contrário é
irrelevante.

## 10. Coesão front/back

O catálogo Rust gera `permissions.generated.ts` (pipeline análogo ao
`pnpm generate-docs`). Entrega:

- Chaves **tipadas** no `useCan`.
- A **tela de gerência de permissões se renderiza a partir do catálogo** (agrupa geral
  vs granular, labels i18n, rótulo cosmético/confidencial).
- Uma única fonte de verdade → zero divergência front/back.

## 11. Fases de implementação (status)

1. **[FEITO] Catálogo**: `sec/catalog/` fracionado, macro `perm!`, validação no boot.
2. **[FEITO] Storage**: migração `permission_grants` + backfill dos bools (up/down
   validados em Postgres). Colunas booleanas de `team_roles` **removidas** pela
   migração `2026-08-02-140000-0000_drop_team_role_bools`: a tabela é
   `(id, team_id, name, created_at)` e os grants são a única fonte de verdade. Os
   oito bools continuam no contrato HTTP, derivados dos grants em `RolePermissions`.
3. **[FEITO] Motor**: `capabilities()` / `can()` + testes de precedência.
4. **[FEITO] Enforcement backend**: connect gate do websocket (view/edit) + endpoint
   `GET /notebook/{id}/capabilities` + revalidação em rename/visibility/delete.
   Executor `/run*` escopado por notebook: `enforce_execute` (`src/http/mod.rs`) exige
   `notebook_id` no payload e checa `notebook.blocks.{lang}.execute` nas quatro
   linguagens. Falta mirar bloco específico — o `TargetCtx` ainda vai com
   `block_id: None`, então só o tipo de bloco é alvo.
5. **[FEITO] Realtime**: sinal `capabilities_updated` via canal de presence +
   `broadcast_capability_change[_for_team]` in-memory, disparado em
   `update_team_role` e `remove_user_from_team`.
6. **[FEITO] Frontend**: motor TS espelhado (`lib/permissions/engine.ts`),
   `useCapabilities` + `<Can>`/`useCan`, catálogo via `GET /permissions/catalog`,
   refetch automático ao receber `capabilities_updated`.
7. **[PENDENTE — sob demanda] Confidencial**: projeção server-side pros tipos
   marcados. Deliberadamente adiado até surgir um caso real de sigilo.

### Migrações idempotentes (obrigatório)

As migrações rodam embutidas no boot (`db_migrations::run_pending_migrations`). Se
`__diesel_schema_migrations` tiver uma versão divergente da que o Diesel computa (ele
normaliza o timestamp da pasta removendo hífens, ex.: `2026-07-09-024044-0000` →
`202607090240440000`), o Diesel considera a migração pendente e **re-executa o
`up.sql`**. Para que isso seja um no-op seguro em vez de um panic (`already exists`)
que trava o boot em loop, todo `up.sql` **deve ser idempotente**:

- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`;
- tipos via `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname=...) THEN CREATE TYPE ...; END IF; END $$;`;
- backfills de dados guardados com `WHERE NOT EXISTS (...)` no nível da chave lógica,
  para não duplicar linhas em uma re-execução.

### Nota de deploy

A migração `2026-07-10-120000-0000_add_permission_grants` precisa ser aplicada em
produção (`diesel migration run`). O backfill converte os cargos existentes em grants
sem perda; notebooks públicos ganham baseline `notebook.view` implícito no motor
(não dependem de grant explícito para continuar visíveis).

A migração `2026-08-02-140000-0000_drop_team_role_bools` é destrutiva: antes de
derrubar as colunas ela ressincroniza os grants de time a partir dos bools (até
então a edição de um cargo escrevia só nas colunas, então cargos editados depois do
backfill de julho têm grants defasados — é essa passada que recupera a intenção do
admin). Rodar com backup do banco; o `down.sql` reconstrói as colunas a partir dos
grants, mas grants criados depois do drop viram bools só se tiverem chave canônica.

## Questões em aberto

- Formato exato do payload `capabilities_updated` (delta de grants vs. `CapabilitySet`
  completo).
- Cache/TTL do `CapabilitySet` por conexão vs. recomputar a cada invalidação.
- UX de "override individual de usuário" dentro de um role (grant `subject_kind='user'`
  com `scope_team_id`).
