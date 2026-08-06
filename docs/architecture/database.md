# Banco de dados

## Migrations no boot, com trava de concorrência 🔴

Migrations continuam rodando embutidas no boot (`db_migrations::run_pending_migrations`) — é a
conveniência de dev, e fica seguro em deploy rolling **com** duas peças: `pg_advisory_lock`
antes de rodar, e uma flag `RUN_MIGRATIONS` que permite desligar a corrida embutida quando o
deploy passar a rodar migration como passo separado. Sem a trava, duas instâncias subindo juntas
chamam `run_pending_migrations()` em paralelo — e o `caps_listen_loop` (backplane multi-nó)
indica que multi-instância está no horizonte, não é hipotético.

**Status real**: a trava e a flag ainda não foram implementadas — `main.rs` chama
`run_pending_migrations` sem lock. Fica registrado como item pendente (ver
[plano-execucao.md](../plano-execucao.md)), não como decisão revertida.

## `up.sql`/`down.sql` idempotentes 🔴

Todo `up.sql` precisa ser seguro para re-execução: `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, tipo novo guardado por
`DO $$ BEGIN IF NOT EXISTS (...) THEN CREATE TYPE ...; END IF; END $$;`, backfill de dado
guardado por `WHERE NOT EXISTS (...)` na chave lógica. Motivo concreto: o Diesel normaliza o
timestamp da pasta de migration removendo hífens (`2026-07-09-024044-0000` →
`202607090240440000`); se `__diesel_schema_migrations` tiver uma versão gravada de forma
diferente da que o Diesel computa, ele considera a migration pendente e **re-executa o
`up.sql`** — sem idempotência isso é `panic` de "already exists" travando o boot em loop.

`down.sql` é obrigatório e testado, com a destrutividade declarada no cabeçalho do arquivo:
`-- reversível`, `-- destrutiva` ou `-- irreversível`. `ALTER TYPE … ADD VALUE` não tem
contraparte de remoção no Postgres — todo `down.sql` de migration de enum é irreversível por
natureza, e isso precisa estar escrito, não implícito.

## DDL separado de seed/backfill 🟡

Seed e backfill (dado que roda uma vez na história, ou que popula default para linha existente)
não são DDL e não moram em `migrations/`. `backfill_missing_role_grants`,
`seed_team_admin_grants` e `seed_chat_delete_any_grant` são o exemplo do problema: são
migrations sem serem DDL, e um seed que roda uma vez não serve para time criado depois do seed
já ter corrido. Nome de migration segue o formato padrão do Diesel — sem sufixo manual como
`-0000` adicionado à mão.

## `timestamptz`, sempre 🔴

Toda coluna de timestamp usa `timestamptz`, nunca `timestamp` sem timezone. O Zeile grava
`createdAt`/`updatedAt`/`editedAt`/`deletedAt`, renderiza data no cliente com `date-fns`, e o
histórico (snapshots, activity feed) depende de ordem temporal correta — `timestamp` sem tz é
ambíguo entre servidor e cliente em fusos diferentes.

**Auditoria conhecida, ainda não corrigida**: `add_teams` (`teams`, `team_roles`,
`team_members`), `add_team_invitations`, `create_push_subscriptions` e `add_permission_grants`
usam `TIMESTAMP` sem tz. A divergência é aleatória, não histórica — `add_permission_grants` e
`create_chat_messages` são migrations de dois dias de diferença e discordam entre si. Corrigir é
uma migration de `ALTER COLUMN ... TYPE timestamptz`, pendente (ver
[plano-execucao.md](../plano-execucao.md)).

## `CREATE INDEX CONCURRENTLY` acima de um volume ⚪

Regra com gatilho, não obrigação universal: `CONCURRENTLY` não roda em transação, então exigir
sempre seria atrito puro em tabela vazia. Acima de um volume a definir, o índice novo em
`blocks`, `notebooks`, `chat_messages` ou `notebook_activity` (as tabelas que crescem por uso,
não por cadastro) vai em migration própria, fora de transação. Os índices GIN de `search_tsv`
e o trigrama de `search_text` foram criados sem `CONCURRENTLY` — aceitável enquanto o volume
for baixo, reavaliar quando crescer.

## Erro do Diesel mapeado por causa 🔴

Consequência também descrita em [rust-rules.md](rust-rules.md) e [security.md](security.md):
`UniqueViolation` → 409, `NotFound` → 404, `ForeignKeyViolation` → 400, sem vazar a mensagem
crua do driver ao cliente.

## Mudou X ⇒ verifique Y

- Migration nova adiciona `TIMESTAMP` sem `tz` ⇒ bloqueante — use `timestamptz` desde o início,
  não conserte depois.
- Migration de enum (`ALTER TYPE ... ADD VALUE`) ⇒ `down.sql` documenta que é irreversível.
- Seed ou backfill novo ⇒ vira tarefa idempotente fora de `migrations/`, não uma migration.
- `schema.rs` desalinhado após migration ⇒ `diesel print-schema --database-url "$DATABASE_URL" >
  rust-server/src/schema.rs`, conferido pelo guard do Q56a ([contracts.md](contracts.md)).
