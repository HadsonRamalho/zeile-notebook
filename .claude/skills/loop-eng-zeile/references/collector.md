# Coletor — `$SKILL/bin/pr-loop-state.mjs`

Fonte única do "em que ponto do ciclo cada PR está". **Read-only por contrato**: lê do GitHub e do
estado local, nunca escreve. Quem escreve é o orquestrador.

As premissas medidas de que o código depende (tetos de página, `line: null` em thread outdated, CI em
toda PR, marcador do loop) estão no cabeçalho do próprio arquivo — mude-as lá e aqui juntas.

```bash
SKILL="$(git rev-parse --show-toplevel)/.claude/skills/loop-eng-zeile"
node "$SKILL/bin/pr-loop-state.mjs" --help
```

## Flags

| Flag                    | Modos                         | Efeito                                                       |
| ----------------------- | ----------------------------- | ------------------------------------------------------------ |
| _(nenhuma)_             | inbox, deliver, ready, status | PRs abertas do usuário autenticado                           |
| `--author <login>`      | review                        | PRs abertas desse autor                                      |
| `--others`              | review, deliver               | PRs abertas de qualquer autor exceto o usuário               |
| `--pr <n>`              | inbox, review, cascade, watch | Restringe a PRs específicas; repetível                       |
| `--repo <owner>/<name>` | todos                         | Alvo explícito, para rodar fora do clone                     |
| `--state <dir>`         | todos                         | Diretório de estado alternativo (default `$WORK/state/`)     |
| `--limit <n>`           | todos                         | Teto de PRs buscadas (default 40). Corte vira `warnings[]`   |
| `--json`                | todos                         | Saída JSON completa (default: tabela compacta)               |

## Falhas, vazio e truncamento

- **`exit 1`** — falha (sem `gh`, sem rede, GraphQL com erro, timeout de 90 s). Mensagem em stderr e
  **nenhum JSON**. Aborte o tick.
- **`exit 0` com `prs: []`** — coleta válida e vazia.
- **`exit 0` com `warnings[]`** — dado cortado ou indisponível. Vazio depois de aviso **não** é "nada a
  fazer".

| `kind`                | Significa                                     | O que fazer                                |
| --------------------- | --------------------------------------------- | ------------------------------------------ |
| `search-truncated`    | mais PRs no escopo do que o teto              | Suba `--limit` ou estreite o escopo        |
| `threads-truncated`   | mais de 100 threads numa PR                   | Trate a PR com `--pr <n>` e diga no relatório |
| `reviews-truncated`   | mais de 40 reviews: `lastReviewAt` subestimado | Não confie em `awaiting-review` nela       |
| `checks-truncated`    | mais de 40 checks                             | Confirme com `gh pr checks <n> --json ...` |
| `comments-truncated`  | mais de 30 comentários top-level              | Leia a PR direto antes de fechar           |
| `merge-state-missing` | PR fora do teto de 200 abertas                | `conflict`/`stale-base` indetectáveis ali  |
| `state-unreadable`    | shard ilegível                                | **Pare**: idempotência perdida             |
| `state-version`       | estado escrito por versão mais nova           | **Não escreva**; atualize o coletor        |

## Saída

Campos por PR (`--json`):

- **Identidade**: `number`, `title`, `url`, `author`, `isDraft`, `baseRefName`, `headRefName`,
  `headRefOid`, `labels`, `stacked` (base ≠ `main`).
- **Estado**: `state` (SKILL.md §"Máquina de estados"), `mergeable`, `mergeStateStatus`,
  `reviewDecision` (informativo, **não** é gate), `stackParent`, `stackDepth`,
  `pendingReviewRequests` (logins/times com review pedido e ainda não feito).
- **Comentários**: `live`, `triage`, `awaitingReviewer`, `topLevel` + `topLevelLive`, `threads`,
  `unresolved`, `threadTotal`. Thread aberta pelo próprio loop (`fromLoop`) nunca é pendência.
- **Thread**: `path`, `line`, `decisions` (`Q<n>` citados), `severity` (`blocking`/`fix`/`suggestion`
  pelo emoji 🔴/🟡/⚪), `excerpt`, `author`, `fromBot`, `fromLoop`, `fromMe`, `commentId`,
  `verdict`/`verdictAt`, `reopened`, `commentCount`, `lastReplyAt`, `lastReplyAuthor`,
  `lastReplyFromLoop`.
- **Tempo**: `lastPushAt` (`committedDate` do head), `lastReviewAt`, `lastSeenReviewAt`,
  `reviewedSincePush`, `unseenReviewSincePush`. Review publicado pelo loop não conta.
- **CI**: `checks.verdict` (`green|red|pending|none`), `checks.failing[]`, `checks.pending[]`,
  `checks.passing`, `checks.skipped` (job filtrado por paths — não é falha nem pendência).
- **Rastreabilidade**: `stages` (números de "etapa N" no título, branch e corpo), `decisions` (`Q<n>`
  no título e corpo).

No topo: `repo`, `login`, `baseBranch`, `scope`, `workDir`, `stateSources`, `stateVersion`, `totals`,
`requestedMissing`, `warnings`.

## Consumo por modo

```bash
node "$SKILL/bin/pr-loop-state.mjs" --json              # inbox / default
node "$SKILL/bin/pr-loop-state.mjs" --json --pr 171     # uma PR
node "$SKILL/bin/pr-loop-state.mjs" --others --json     # review
node "$SKILL/bin/pr-loop-state.mjs"                     # status/ready: leitura humana
```

Ordenação pronta: estado (na ordem de prioridade), `stackDepth` crescente, número. Não reordene sem
motivo declarado.

## Limites

O coletor não sabe nada de gate, plano ou lock: quem cruza `stages` com `docs/plano-execucao.md`, quem
trava a PR e quem decide o que fazer com um estado é a skill. Regra de negócio não entra no script.
