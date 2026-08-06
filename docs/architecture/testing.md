# Testes

## Ferramentas 🔴

**Vitest** no frontend — ESM nativo, sem transpilação extra, `@testing-library/react` quando a
suíte alcançar componente de UI. **`#[cfg(test)]`** no Rust — zero dependência nova.

## Quando uma suíte é obrigatória 🔴

Só quando um **módulo de domínio** é criado ou tocado — não existe piso percentual de
cobertura. Partindo de uma base ampla de código sem teste, qualquer número mínimo seria chute e
incentivaria testar o que é fácil de testar em vez do que importa. Componente de UI **nunca** é
obrigado a ter suíte; se você escolher testar um, a suíte de caminho feliz sozinha é proibida
(ver regra de "como" abaixo).

Os quatro primeiros módulos cobertos, por serem as duas áreas de maior consequência
(autorização e integridade do documento do usuário):

- `lib/permissions/engine.ts` — precedência de nível, `deny` vence `allow` no mesmo nível,
  `implied_by` transitivo e circular, catálogo vazio, default deny.
- `sec/catalog/` + `controllers/permissions.rs` — **teste de paridade cross-linguagem**: a
  mesma regra de precedência está implementada duas vezes (TS e Rust) e nada além do teste
  garante que concordem. O Rust serializa o catálogo em `contracts/permission-catalog.json`
  (snapshot test, `UPDATE_PERMISSION_CATALOG_SNAPSHOT=1` regenera); a suíte TS consome o mesmo
  arquivo repetindo os casos do Rust.
- `models/notebook.rs` — lógica Automerge.
- `lib/drawing-scene.ts` + `free-drawing/engine.ts` — inclusive a invariante de
  `drawing-scene.ts:50` ("só reescreve quando o conteúdo muda"), cuja quebra causa loop de eco.

## Como uma suíte é escrita, quando existe 🔴

Cobre caminho feliz **e** caminho de exceção — erro, vazio, loading — sempre que ambos
existirem no módulo. Uma suíte que só testa o caminho feliz dá sensação de segurança sem pegar
o bug que motivou o teste em primeiro lugar.

## Rede de teste antes de reorganização 🔴

Nenhuma refatoração estrutural grande (mover diretório, quebrar arquivo grande por
responsabilidade) acontece antes de existir cobertura no que ela toca. Isso tornou a ordem das
etapas do plano de execução uma decisão de fato, não só de preferência — a suíte de
`lib/permissions/engine.ts` e `models/notebook.rs`, por exemplo, precisou existir antes da
quebra em camadas do Rust ([rust-rules.md](rust-rules.md)) e antes da reorganização em
`features/` ([frontend-rules.md](frontend-rules.md)).

## `cargo test` no CI depende de serviço real 🟡

O job `rust-test` do CI precisa de um serviço Postgres com
`TEST_MIGRATION_DATABASE_URL` — sem os dois,
`embedded_migrations_apply_from_scratch_and_are_idempotent` retorna cedo (sem banco para testar
contra) e o teste passa sem verificar nada. Se um teste de migration parece passar rápido
demais, confira se o serviço está mesmo configurado no job.

## Mudou X ⇒ verifique Y

- Módulo de domínio novo (frontend ou Rust) ⇒ pergunte se cabe numa das quatro áreas de maior
  consequência do repo (autorização, integridade de documento, execução de código, dado
  financeiro/pessoal) antes de decidir que a suíte pode esperar.
- Regra de precedência de permissão muda em `engine.ts` **ou** em `permissions.rs` ⇒ os dois
  precisam mudar juntos; o teste de paridade cross-linguagem acusa se um ficar atrás.
- Teste de migration novo ⇒ confirme que roda contra Postgres real no CI, não só compila.
