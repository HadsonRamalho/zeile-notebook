# 0003 — Modelo de permissões: catálogo em código, grants em dados

## Contexto

O modelo antigo de permissão vivia como colunas booleanas fixas em `team_roles` (`can_read`,
`can_write`, `can_manage_privacy`, `can_manage_clones`, `can_invite_users`, `can_remove_users`,
`can_manage_permissions`, `can_manage_team`). Três limitações concretas motivaram o redesenho:
permissão nova exigia coluna **e** migração; não havia como mirar um recurso específico
(notebook, bloco, tipo de bloco); e a avaliação era grosseira e única —
`get_user_notebook_permissions` devolvia um saco de bools, checado uma vez no connect do
WebSocket, nunca revalidado por ação.

Esta é uma ADR retroativa: as decisões abaixo já estavam registradas informalmente na seção 3
("Decisões batidas") de [permissions-design.md](../permissions-design.md) e implementadas antes
de existir o regime de ADR do Zeile (Q8). Preservada aqui porque cada uma tinha alternativa real
descartada, não só a opção óbvia.

## Alternativas e decisão, por tema

**Onde vive o catálogo de permissões.**
- Alternativa descartada: catálogo em tabela de banco, editável em runtime.
- Decisão: catálogo em **código Rust**, fracionado por módulo (`sec/catalog/{notebook,blocks,
  team,chat}.rs`), validado no boot (chave duplicada, `implied_by` para chave inexistente,
  `targets` inválido — servidor não sobe se falhar). Permissão nova é código revisado em PR, não
  dado editável por um admin sem review.

**Onde vivem os grants.**
- Alternativa descartada: manter coluna booleana por permissão, uma migração por permissão
  nova.
- Decisão: tabela única `permission_grants`, schema fixo
  (`subject_kind`/`subject_id`/`scope_team_id`/`permission_key`/`target_kind`/`target_id`/
  `target_value`/`effect`). `team_roles` fica só `(id, team_id, name, created_at)`. Permissão
  nova é uma linha, não uma coluna.

**Geral vs. granular.**
- Alternativa descartada: toda permissão é atômica desde o primeiro toggle — a UI de gerência
  vira uma lista plana de dezenas de checkboxes.
- Decisão: `tier: General | Granular` no catálogo, com `implied_by` expandindo o geral no
  conjunto granular equivalente. A UI mostra os toggles gerais por padrão; granular fica em modo
  avançado. Um `deny` granular sobrepõe o `allow` geral no mesmo nível.

**Transporte de invalidação em tempo real.**
- Alternativa descartada: canal dedicado via Server-Sent Events.
- Decisão: reusar o WebSocket já existente (sync Automerge + presence). O canal de permissão
  pega carona no socket já autenticado — zero conexão nova por cliente.

**Enforcement do push em tempo real.**
- Decisão explícita, não default: o push é **affordance de UX** (esconde botão, desabilita
  bloco). O backend **revalida** `can(...)` em toda operação privilegiada, independente do
  push ter chegado. Se o push se perder, a segurança se mantém — só a UI fica desatualizada até
  o próximo refetch.

**Confidencialidade de leitura (`view`).**
- Alternativa descartada: toda permissão de leitura negada já implica projeção server-side
  (filtrar o documento antes de sincronizar).
- Decisão: duas classes marcadas **no catálogo**, não no grant — `Cosmetic` (default: manda o
  documento completo, esconde no render; barato, mas não é sigilo, o dado está no cliente
  inspecionável) e `Confidential` (opt-in: projeção server-side de fato). Começa tudo
  `Cosmetic`; promove para `Confidential` só quando um caso real de sigilo aparecer — migração
  cosmético→confidencial é barata, o contrário não compensa adiantar.

**Fan-out de invalidação multi-instância.**
- Decisão: in-memory via `SyncRegistry` agora (cobre um processo); LISTEN/NOTIFY do Postgres (ou
  Redis pub/sub) como ponto de extensão isolado — troca a implementação de
  `broadcast_capability_change` sem tocar no resto, quando multi-instância deixar de ser
  hipotético.

**Fonte de verdade front/back.**
- Decisão: o catálogo Rust gera `permissions.generated.ts`, pipeline análogo a
  `pnpm generate-docs` — mesmo regime do artefato gerado de [contracts.md](../architecture/contracts.md).

## Consequências

- As sete fases descritas na seção 11 de `permissions-design.md` estão implementadas — catálogo,
  storage (colunas booleanas antigas já removidas por migração de drop), motor
  (`capabilities()`/`can()` com teste de paridade cross-linguagem, [testing.md](../architecture/testing.md)),
  enforcement backend, realtime, frontend espelhado. Só a fase 7 (projeção confidencial) está
  pendente, deliberadamente.
- `TargetCtx` ainda não mira bloco específico em todas as rotas — o executor de código escopa por
  tipo de bloco, não por bloco individual (`block_id: None`). Registrado como lacuna conhecida,
  não decisão.
- O formato exato do payload `capabilities_updated` (delta de grants vs. `CapabilitySet`
  completo) e o cache/TTL do `CapabilitySet` por conexão continuam em aberto — ver "Questões em
  aberto" de `permissions-design.md`.

## Status

Aceita. Reflete o estado implementado; revisar se a fase 7 (confidencial) for priorizada.
