# Modo inbox — o que pede ação nas minhas PRs

Reconcilia o que está pendente nas PRs abertas: CI vermelho, conflito, e comentários — de
colaborador, de reviewer convidado, ou **do próprio usuário** deixando instrução na PR para o loop
aplicar. Prioridade sobre trabalho novo.

Leia `gates.md` antes. **Uma PR por tick**, com lock. Relatório no formato de `report.md`.

## 0. Escolher a PR

```bash
node "$SKILL/bin/pr-loop-state.mjs" --json            # ou --pr <n>
```

Ordem: o estado (`ci-red` → `conflict` → `needs-response` → `needs-triage` → `stale-base`) e, no
mesmo estado, **o fundo da stack primeiro** (`stackDepth` menor). O coletor já entrega ordenado.

Olhe `warnings[]` e `requestedMissing` antes de agir (`collector.md`). Coletor com `exit != 0` aborta
o tick.

## 1. Fase 0 — triagem (`isResolved=false AND isOutdated=true`)

Para cada thread a triar:

1. Leia o comentário e localize o alvo por `path` + `line` (outdated cai para `originalLine`).
2. Confira **contra o código atual** se o pedido ainda procede. Ache o commit que mudou aquilo:
   `git log -S '<trecho>' --oneline -- <path>` ou `git log -L <l>,<l>:<path>`.
3. Destino:
   - **Já corrigido** → responda citando o commit e **resolva**. `verdict: stale-fixed`.
   - **Ainda vive** → fila da fase 1, sem responder ainda.
   - **Indeterminado** → pergunte, **deixe aberta**. `verdict: indeterminate`.

Thread `reopened: true` (resposta humana depois do veredito) volta para a fase 1.

Toda resposta do loop **começa com `<!-- loop-eng-zeile -->`** (SKILL.md §"Máquina de estados").

```bash
# responder dentro da thread
gh api repos/HadsonRamalho/zeile-notebook/pulls/<n>/comments/<commentId>/replies \
  -f body=$'<!-- loop-eng-zeile -->\n<texto>'
# resolver
gh api graphql -f query='mutation($t:ID!){ resolveReviewThread(input:{threadId:$t}){ thread{ isResolved } } }' -F t=<threadId>
```

## 2. Fase 1 — comentários vivos: veredito por item

### `aplicar`

Válido e acionável. Entra no checklist. `verdict: applied`.

### `refutar`

O pedido está errado e dá para mostrar por quê: responda com a justificativa concreta (o `Q<n>`, a
seção do doc de `docs/architecture/`, `arquivo:linha`), **não mexa no código** e **não resolva** —
quem fecha é o humano. `verdict: rebutted`. Continua pendente (bloqueia `done-pending`) sem voltar à
fila. Pedido do **próprio usuário** raramente se refuta: se ele contraria regra documentada, o destino
é `escalar` — a divergência é entre ele e o repo, e é ele quem decide se a regra muda.

### `escalar`

Vai para `## Itens para discussão` com problema e alternativas, e entra em `escalations` (cheque
`decisions` antes). Escale quando o pedido:

- muda shape do doc Automerge, regra de permissão ou sandbox de execução;
- contraria regra documentada (`decisoes.md`, `docs/architecture/*`) ou pede um `Q` novo;
- remove/renomeia `errorCode`, ou exige migration destrutiva;
- tem impacto de performance em canvas/render sem medição;
- é incompatível com outro pedido na mesma PR.

O resto da PR continua enquanto a escalação espera.

### Ler o pedido

- O Zeile não tem códigos de regra como `B1`/`RB-*`: a referência é `Q<n>` e a severidade 🔴/🟡/⚪ —
  o coletor extrai os dois (`decisions`, `severity`). Pedido sem severidade declarada vale pelo que a
  regra correspondente diz.
- Leia a thread inteira (`commentCount > 1`), não só o primeiro comentário.
- Pedido sobre comentário de código só procede contra o `comment-guide.md`: fora das seis categorias,
  em pt-BR, ou referenciando PR/issue/commit. Pedido para **apagar** referência legítima (`Q<n>`, ADR,
  link permanente de padrão externo) é `refutar`.
- Pedido reincidente (o mesmo item já pedido antes nesta PR e não atendido) sobe para 🔴.

### Comentário top-level

`topLevelLive` são pedidos humanos soltos no corpo da PR (sem o marcador do loop, de autor não-bot).
Mesmo veredito dos três destinos; sem `isOutdated`, a única memória é `comments[<databaseId>]` no
estado — sem gravar, o pedido é eterno. Responda com `gh pr comment <n> --body-file` começando pelo
marcador. Comentário de bot (`vercel` etc.) é informativo e o coletor já o separa.

## 3. Fase 2 — corrigir

1. Checklist em `$WORK/checklist-pr-<n>.md`, com ondas por dependência e faixa de validação.
2. Ondas conforme `gates.md` §6; teto em `reviewRounds`, que persiste entre ticks.
3. Faixas completas de `gates.md` §1 **uma vez**, no fim. `75` = enfileirado: cede o tick sem push,
   mantendo o lock.
4. Commit por etapa: `fix(<escopo>): <o que o comentário pediu>` em pt-BR, no formato do hook.

Re-verificação é inline, relendo as seções "Mudou X ⇒ verifique Y" das áreas tocadas pela correção —
sem subagente de review (Q90).

## 4. Fase 3 — push e resposta

1. Guarda de push (`gates.md` §2).
2. Push.
3. Thread aplicada: responda o que mudou e em qual commit, e **resolva**.
4. Refutada / indeterminada: resposta, **sem** resolver.
5. Top-level humano tratado: resposta com o commit, veredito em `comments`.
6. Grave o shard (`gates.md` §4): `threads`, `comments`, `reviewRounds` e **`lastSeenReviewAt`** —
   este sempre, mesmo sem nada a fazer.
7. Libere o lock.

## 5. Casos especiais

**`ci-red`** — leia a falha real: `gh pr checks <n> --json name,state,bucket,link` e o log do job
(`gh run view <run-id> --log-failed`). Não adivinhe. Mapeamento:

| Check que falhou                 | Reproduza com                               | Causa usual                                         |
| -------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `frontend-test` (lint)           | `pnpm lint`                                 | formatação/ordem de import — `pnpm format`          |
| `frontend-test` (types:check)    | `pnpm types:check`                          | tipo gerado mudou e o consumidor não acompanhou     |
| `frontend-test` (test)           | `pnpm test`                                 | paridade de permissão, regressão real               |
| `frontend-test` (validate:i18n)  | `pnpm validate:i18n`                        | chave em um locale só, chave órfã, `errorCode` sem tradução |
| `rust-test` (fmt/clippy)         | faixa R                                     | `-D warnings`: lint novo do clippy estável também quebra |
| `rust-test` (check_schema)       | `check_schema.sh` com banco limpo           | migration sem `schema.rs` regenerado                |
| `Generators`                     | faixa G                                     | gerado não regenerado — rode `pnpm generate:*`, nunca edite |
| deploy de preview (Vercel)       | `pnpm build`                                | build do Next/Serwist                               |

Falha que não reproduz localmente (flaky, toolchain do runner mais nova) → reporte com o log; não
re-dispare às cegas mais de uma vez.

**`ci-running`** — não reprocesse. Modo `watch`.

**`conflict` e `stale-base`** — procedimento único na cascata #2 (`cascade.md`).

**`draft`** — reporte; tirar de draft é decisão do usuário.

**`no-ci`** — o CI do Zeile dispara em toda PR: ausência de check é anomalia (workflow quebrado, PR de
fork esperando aprovação). Investigue e reporte; **nunca** trate como pronta.

**PR sem branch local** — `git fetch origin <headRefName>` + `gh pr checkout <n>`; nunca assuma que a
branch local existe ou está atualizada.

## 6. Relatório

Formato em `report.md`: estado antes → depois, aplicados, refutados, triados, esperando reviewer,
faixas de gate com o resultado real, avisos do coletor, escalações desta passada e as abertas de
passadas anteriores.
