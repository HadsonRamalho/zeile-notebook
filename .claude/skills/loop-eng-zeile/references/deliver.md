# Modo deliver — do plano à PR aberta

Leve **uma** unidade de trabalho até PR aberta, com gate limpo e auto-review aplicado. "Uma etapa = um
PR, salvo indicação" (`docs/plano-execucao.md`; Q93/Q95: um PR por bloco, na ordem das dependências).

Leia `gates.md` antes. O formato do relatório final está em `report.md`.

## Passo 1 — escolher a unidade

O Zeile não tem specs nem board: **a fila é o `docs/plano-execucao.md`**. Fonte, em ordem:

1. **O que o usuário nomeou** na invocação — número de etapa, texto de um item do plano, ou uma
   descrição de trabalho fora do plano (bug, ajuste). Vence tudo.
2. **Item `- [ ]` do plano**, cruzado com as PRs **abertas** (coletor: `stages` e `headRefName`) e com
   `deliveries` no estado. Entrada `in-progress` é trabalho de outra sessão ou de tick que morreu —
   aí o modo é `resume`, não `deliver`.

Ordem entre candidatos:

- O **"Checklist de execução"** é ordenado pelas dependências: não pule uma etapa pendente para pegar
  uma posterior. Etapa marcada `— [x] concluída` com bullets `[ ]` remanescentes (ex.: a etapa 14
  "concluída (parcial)") vale como pendente **só** se o próprio texto da etapa disser que o resto fica
  para entregas seguintes.
- A seção **"Encaixáveis a qualquer momento"** é independente da ordem: entra quando o checklist não
  tem item liberado, ou quando o usuário pedir.
- **"Questões ainda abertas"** não é fila: são decisões. Item que depende de uma delas **escala**.

Sem nada pendente e sem pedido do usuário: **pare e reporte** que o plano está fechado. Não invente
etapa. Etapa nova nasce de decisão do usuário, registrada no plano (e no catálogo, se for regra nova).

Não agrupe etapas. Uma etapa grande se divide em PRs por domínio, como a 19 e a 20 fizeram (ondas
`#151`–`#153`, `#154`–`#160`): regra de bolso, mais de ~15 arquivos de código ou ~600 linhas reais
num PR = grande demais, divida e diga no relatório como dividiu.

## Passo 2 — ler antes de escrever

Nesta ordem, integralmente:

1. O texto da etapa/item em `docs/plano-execucao.md` (o _quê_), incluindo o que entregas anteriores da
   mesma etapa registraram como decisão ("por decisão explícita, registrada no plano").
2. Cada `Q<n>` citado, em `docs/decisoes.md` (o _porquê_), e a ADR correspondente em
   `docs/decisions/` quando existir.
3. Os docs de `docs/architecture/` da área — a tabela de `docs/README.md` diz qual cobre o quê.
   **Leia a seção "Mudou X ⇒ verifique Y" de cada um**: ela é o checklist de acoplamento do repo (Q92).
4. `CLAUDE.md` local, se existir no clone (é mantido fora do versionamento).

Item vago (critério não observável, escopo que admite duas leituras) **não** se resolve inventando:
aponte o gap e pergunte. Cheque `decisions` no estado antes de escalar: pergunta já respondida não se
repergunta.

## Passo 3 — branch e registro

Formato: `<type>/<slug-curto>`, com `<type>` do commit-msg (`feat`, `fix`, `refactor`, `test`,
`docs`, `chore`) e slug em kebab-case, em inglês ou pt-BR sem acento, que diga o domínio:
`refactor/etapa21-domain-team`, `fix/timestamptz-audit`. (O histórico tem prefixos de área como
`types/` e `rust/`; o loop usa sempre o type — é o que casa com o título da PR.)

```bash
git fetch origin main
git switch -c <branch> origin/main
git branch --unset-upstream          # nasce rastreando origin/main: desfaça já (gates.md §2)
```

Se a unidade depende de outra PR em voo, crie a partir da branch daquela PR — isso é **stack**: leia
a cascata #1 em `cascade.md`.

Assim que a branch existe, grave `deliveries[<chave>] = { status: 'in-progress', source, branch,
startedAt }` (chave em `gates.md` §4) e troque o lock `deliver-<chave>` conforme §3.1. Registro só no
fim deixa branch órfã sem rastro quando a sessão morre no meio.

## Passo 4 — implementar

Roteie pela área e **leia a regra na fonte**, não confie no resumo:

| Toca                                         | Fonte de verdade                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `app/`, `components/`, `features/`, `hooks/`, `stores/`, `context/` | `frontend-rules.md`, `code-rules.md`, `i18n.md`, `a11y.md` |
| `lib/api/*`, tratamento de erro no frontend  | `frontend-rules.md` + Q109 (`Result` do `@catcherjs/core`; skill `catcher` se instalada) |
| `lib/api/generated/*`, `contracts/`          | `contracts.md` — **gerado, nunca editado**                               |
| `rust-server/src/**`                         | `rust-rules.md` (camadas `domain/<nome>/{controller,service,repository,dto,entity}.rs`, extractors, `ApiError`) |
| `rust-server/migrations/`, `schema.rs`       | `database.md`                                                            |
| `sec/`, `domain/permissions/`                | `permissions-design.md`, ADR 0003 — **escala** mudança de regra           |
| `executor/`, `lib/sandbox/`                  | `sandbox.md`, ADR 0006                                                    |
| doc Automerge, blocos, history/snapshot      | `crdt.md` — **escala** mudança de shape                                   |
| canvas de desenho, render                    | `performance.md`                                                          |
| `src-tauri/`                                 | `desktop.md`, `docs/desktop-tauri.md`                                     |
| variável de ambiente                         | `env-vars.md`, `security.md`                                              |

Não negociável na implementação:

- **Comentário só nas seis categorias do `comment-guide.md`, em en-US.** Nunca referência a PR,
  issue ou commit; `Q<n>` e ADR são referência legítima. Comentário pt-BR sobrevivente em arquivo
  tocado se traduz no mesmo PR.
- **"Um conceito, uma grafia"** (🔴, `code-rules.md`): nada de `serde(rename)` campo a campo; casing
  é `rename_all` no struct, camelCase no fio.
- **String de UI** sempre via `useTranslations`, chave estática, nos **dois** locales
  (`messages/en.json` e `messages/pt-br.json`). Enum → `Record<Enum, string>` de chave.
- **Erro no frontend** devolve `Result`; sem `try/catch` cru em código novo ou tocado (Q109).
- **Erro no Rust** é variante de `ApiError` com `errorCode` estável e aditivo; variante nova pede
  `pnpm generate:error-codes` + chave em `api_errors` nos dois locales.
- **Rota que acessa recurso de usuário** usa `require_permission(...)` como layer, nunca checagem
  manual no handler.
- **Rota alterada** (`#[utoipa::path]`) → `pnpm generate:openapi-types`; payload de WebSocket →
  `pnpm generate:ws-types`. O frontend consome `components["schemas"][...]`, não tipo escrito à mão.
- **Migration**: `timestamptz` desde o início, `down.sql` com a destrutividade declarada no cabeçalho,
  seed/backfill fora de `migrations/`, `schema.rs` regenerado por `diesel print-schema`.
- **I/O externo** com timeout por env; task de fundo nova com handle para o shutdown gracioso.
- Feature nova em `features/` → entrada de `noRestrictedImports` no `biome.json`.

**Atualize o plano no mesmo PR**: marque o item `[x]` em `docs/plano-execucao.md` e, quando a entrega
tomou uma decisão de escopo (algo deixado de fora deliberadamente, um achado no caminho), registre-a
no texto da etapa, como as etapas 19 e 20 fizeram. Decisão nova de **regra** não entra no plano: vira
escalação, e o usuário decide se ganha um `Q`.

## Passo 5 — testes

`testing.md` manda, e é mais preciso que um piso de cobertura:

- Suíte é **obrigatória** quando um **módulo de domínio** é criado ou tocado. Componente de UI nunca é
  obrigado a ter suíte.
- Quando a suíte existe, cobre **caminho feliz e caminho de exceção** (erro, vazio, loading) sempre que
  ambos existirem. Suíte só de caminho feliz é proibida.
- Áreas de maior consequência (autorização, integridade de documento, execução de código, dado
  pessoal) — pergunte se o módulo cai numa delas antes de decidir que a suíte pode esperar.
- Regra de permissão muda em `engine.ts` **ou** em `permissions.rs` → os dois mudam juntos, e o teste
  de paridade acusa.
- Refatoração estrutural grande só depois de existir cobertura no que ela toca.
- Teste sem asserção de comportamento não conta: asserte o efeito observável.

Ferramentas: Vitest no frontend (arquivo `*.test.ts` ao lado do módulo), `#[cfg(test)]` no Rust.
Teste de migration precisa de Postgres real (`gates.md` §1.4).

## Passo 6 — gate

Faixas de `gates.md` §1, nesta ordem: **0** sempre → **F**, **R**, **G**, **D** conforme a área do
diff. Faixa 0 achou algo → conserte antes das caras. Falhou uma faixa → conserte o **lado certo**
(teste desatualizado vs bug real), nunca enfraqueça o teste, e reinicie a faixa. Voltou `75` → gate
**enfileirado**: encerre a passada com o lock na mão e retome no próximo tick.

## Passo 7 — auto-review (inline, sem subagente)

O Zeile decidiu **não** ter review por subagente (Q90): o review é a leitura das seções "Mudou X ⇒
verifique Y". Antes de abrir a PR:

1. Para cada doc de `docs/architecture/` cuja área o diff toca, percorra a seção "Mudou X ⇒
   verifique Y" item a item e confirme no diff. Os quatro pontos de ripple do Q90 sempre:
   `sec/catalog/` ⇒ `engine.ts` + constantes geradas + seeds de grant + teste de paridade; enum de bloco
   ⇒ migration + enum Rust + tipo gerado + `switch` de `block-content.tsx`; shape do doc Automerge ⇒
   `checkpoint_loop` + snapshots + `history-diff-view` + docs persistidos; `ApiError` ⇒ `match`
   exaustivo + `errorCode` gerado + chave nos dois locales.
2. Leia o diff inteiro (`git diff origin/main...HEAD`) com as regras 🔴 da área na mão: o que viola,
   corrija; o que é 🟡 em código **tocado**, corrija também (é "na próxima vez que o arquivo for
   tocado" — é agora).
3. Classifique cada achado em `aplicar` / `escalar` (critérios de `inbox.md` §2). Corrija em ondas
   (`gates.md` §6), commitando por etapa, e repasse as faixas afetadas.
4. Repita até limpo, `--max-iters` ou ausência de progresso.

Guarde o resultado em `$WORK/self-review-<branch>.md` — o corpo da PR usa.

## Passo 8 — push e PR

Guarda de push (`gates.md` §2), `git push -u origin <branch>`, e:

```bash
gh pr create --base main --head <branch> --title "<título>" --body-file "$WORK/pr-body-<branch>.md"
```

**Título** = o header do commit principal, no formato do commit-msg, com a etapa entre parênteses
quando houver: `refactor(types): types/team-types.ts deriva de openapi-types.ts (etapa 20)`. A PR é
squash-mergeada e o título vira o commit na `main` — ele precisa passar no mesmo formato.

**Corpo** segue `.github/pull_request_template.md`, em pt-BR, com o checklist **preenchido com o que
de fato rodou**:

```markdown
<!-- loop-eng-zeile -->
## Resumo

- <o que muda e por quê, no domínio do problema; cite a etapa e os Q<n>>
- <decisão de escopo tomada nesta entrega, se houver — o que ficou de fora e por quê>

## Como testar

- <passos para verificar na prática>
- Gate local: 0 ✅ · F <res> · R <res> (migrations: <res>) · G <res> · D <res>

## Checklist

- [x] Rodei `pnpm lint` e `pnpm types:check` localmente
- [x] Rodei `cargo fmt --check` e `cargo clippy` no que toquei do Rust
- [ ] ... (marque só o que é verdade; item que não se aplica: risque com ~~ e diga "não se aplica")
```

`[x]` em item que não rodou é gate declarado verde sem ter rodado — invariante. PR com mudança visual
leva screenshot ou vídeo; sem como capturar, diga que falta.

Não abra como draft por default: o CI roda em draft igual, mas draft sinaliza "não está pronta" e o
loop o trata como estado próprio.

## Passo 9 — fechar o ciclo

- `deliveries[<chave>]` de `in-progress` para `{ status: 'open', pr, branch, at }`.
- Troque o lock `deliver-<chave>` pelo `pr-<n>` e libere ao terminar.
- Relate no formato de `report.md`: PR aberta, faixas que rodaram com o resultado real, achados do
  auto-review aplicados/escalados, e o que ficou de fora — **o quê** e **por quê**.
- A PR passa a ser do modo `inbox`. Merge é manual; depois dele, `deliveries[<chave>].status =
  'merged'` na próxima passada que perceber.
