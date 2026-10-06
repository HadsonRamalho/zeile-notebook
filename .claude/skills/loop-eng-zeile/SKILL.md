---
name: loop-eng-zeile
description: >-
  Loop engineering do Zeile — orquestrador de entrega de PRs e de reconciliação dos reviews
  recebidos no HadsonRamalho/zeile-notebook. Use ao invocar /loop-eng-zeile (inclusive sob /loop) e
  quando o pedido for "leva a etapa N até a PR", "entrega o próximo item do plano", "aplica os
  comentários das minhas PRs", "continua as PRs em voo", "revisa a PR X", "atualiza a stack",
  "libera os locks presos", "responde a escalação". Cinco modos de trabalho — deliver, inbox, review,
  cascade, status — mais os operacionais (locks, answer, ready, watch, resume, sweep). NÃO usar
  para review pontual de uma branch sem PR — isso é leitura direta com docs/README.md.
argument-hint: '[deliver|inbox|review|cascade|sweep|status|locks|answer|ready|watch|resume] [--pr N] [--author L] [--max N] [--dry-run] [--no-db] [--max-iters N]'
---

# Loop engineering — Zeile

**Orquestrador, não implementação.** Nada aqui reescreve regra, gate ou padrão de código: o fluxo
aplica o que o Zeile já decidiu (`docs/README.md`, `docs/decisoes.md`, `docs/architecture/*`, o CI
em `.github/workflows/`) e adiciona a única coisa que faltava — **saber em que ponto do ciclo cada
PR está e o que fazer a seguir**.

## Onde a ferramenta vive

A skill é **versionada** no repositório, em `.claude/skills/loop-eng-zeile/`: muda por PR, como
qualquer outro código do Zeile. O que é **de execução** — estado, locks, checklists, relatórios e a
fila de gate — fica fora da árvore, por máquina, para nunca entrar num commit e para sobreviver a
worktree e a `git clean`:

| Caminho                                               | Conteúdo                                         |
| ----------------------------------------------------- | ------------------------------------------------ |
| `.claude/skills/loop-eng-zeile/`                      | esta skill + `references/` (versionado)          |
| `.claude/skills/loop-eng-zeile/bin/pr-loop-state.mjs` | coletor de estado, read-only (versionado)        |
| `.claude/skills/loop-eng-zeile/bin/gate-lock.sh`      | fila de admissão de gate (versionado)            |
| `~/.claude/loop-eng-zeile/work/<owner>__<repo>/`      | estado, locks de PR, checklists e relatórios     |
| `~/.claude/loop-eng-zeile/gate/`                      | fila de gate da máquina (`ZEILE_GATE_QUEUE_DIR`) |

Resolva os caminhos assim, de qualquer lugar (clone ou worktree):

```bash
SKILL="$(git rev-parse --show-toplevel)/.claude/skills/loop-eng-zeile"
WORK="$HOME/.claude/loop-eng-zeile/work/$(gh repo view --json owner,name --jq '.owner.login + "__" + .name')"
GL="$SKILL/bin/gate-lock.sh"
```

Use a skill da árvore em que se está trabalhando: numa branch que altera a própria skill, a versão
da branch é a que vale.

Se algo de estado, lock, checklist ou relatório de execução precisar ser escrito dentro do repo, é
bug: reporte em vez de escrever. Mudança na **própria skill** é código: vai por branch e PR, como o
resto.

## Pré-condições (verificar antes de qualquer ação)

1. `gh --version` responde. Sem isso, pare e instrua https://cli.github.com/.
2. `gh repo view --json nameWithOwner` → tem de ser `HadsonRamalho/zeile-notebook`. Outro repo:
   avise que as regras (Q1–Q124, `docs/architecture/*`) e o plano de etapas são deste repo e
   pergunte antes de seguir.
3. Raiz via `git rev-parse --show-toplevel`. Nunca assumir caminho.
4. `git config core.hooksPath` responde `.githooks`. Sem isso o `commit-msg` do Zeile não roda e
   commit fora do formato passa calado: rode `git config core.hooksPath .githooks` (é configuração
   local do clone, documentada no próprio hook) e diga no relatório.
5. Toda leitura de `gh` usa `--json` / `--jq`. A saída textual pode ser reescrita por hook de shell
   e perder campos.
6. Coletor com `exit != 0` **aborta o tick**. Erro não é resultado vazio (`references/collector.md`).
7. Toolchain: `node` 22 (o CI usa 22), `pnpm` (versão do `packageManager` do `package.json`),
   `cargo` estável com `rustfmt`/`clippy`. Ferramenta ausente não bloqueia o tick — bloqueia o gate
   daquela faixa, que sai no relatório como **não rodado**, com o motivo.

## Modos

| Modo      | Invocação                                                | Faz                                                                          |
| --------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `deliver` | `/loop-eng-zeile deliver [<etapa\|item\|descrição>]`      | Item do plano → código → gate → auto-review → PR. `references/deliver.md`    |
| `inbox`   | `/loop-eng-zeile inbox [--pr N]`                          | CI vermelho, conflito e comentários das minhas PRs. `references/inbox.md`    |
| `review`  | `/loop-eng-zeile review [--pr N] [--author L] [--max N]`  | Revisa PRs de terceiros e publica como comentário. `references/review.md`    |
| `cascade` | `/loop-eng-zeile cascade [--pr N]`                        | Stack, base defasada, padrão sistêmico, próximo item. `references/cascade.md` |
| `status`  | `/loop-eng-zeile status`                                  | Coletor + locks + escalações abertas. Read-only puro.                         |
| ops       | `locks` · `answer` · `ready` · `watch` · `resume`         | Manutenção do próprio loop. `references/ops.md`                               |

Sem modo explícito, o default é **`inbox` primeiro**; `deliver` só entra **se o inbox não achou nada
acionável** neste tick. PR aberta com pendência tem prioridade sobre trabalho novo, e um tick escreve
em uma PR só. Argumento que é número de etapa, item do plano ou descrição de trabalho, sem modo
nomeado, é `deliver`.

Leia antes de rodar qualquer modo que escreva algo:

- **`references/gates.md`** — faixas de gate, guarda de push, locks, esquema de estado, commits,
  ondas de correção e ritmo sob `/loop`.
- **`references/collector.md`** — flags, saída, avisos de truncamento e semântica de falha do coletor.
- **`references/report.md`** — o formato único de relatório.

## Flags

- **`--pr N`** (inbox, review, cascade, watch, locks) — restringe a essa PR; repetível.
- **`--author <login>`** (review) — restringe ao autor. Ausente → `review-requested:@me`, com
  fallback para PRs abertas de outros autores.
- **`--max N`** (review) — teto do lote. Default 3, máximo 5.
- **`--dry-run`** (todo modo que escreve) — produz plano, checklist e relatório em `$WORK` e **não
  escreve nada** fora dele: sem commit, sem push, sem comentário, sem mutação no GitHub.
- **`--no-db`** (deliver, inbox) — declara que não há Postgres para o `cargo test` de migration e
  para `check_schema.sh`. O relatório registra esses passos como **não rodados**; sem a flag e sem
  banco é a mesma coisa, descoberta no meio do caminho.
- **`--max-iters N`** (deliver, inbox) — teto de ondas de correção. Default 3 (`gates.md` §6).

## Máquina de estados por PR

Produzida pelo coletor (`--json` para consumir). Um estado por PR, na ordem abaixo — **o primeiro que
casa vence, e esta ordem é a mesma de `CLASSIFIERS` no coletor**. Divergência entre esta tabela e o
código é defeito.

| Estado            | Condição                                                          | Ação                                                        |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `ci-red`          | algum check falhando (CI, Generators, deploy de preview)          | Consertar antes de qualquer outra coisa                     |
| `conflict`        | `mergeStateStatus: DIRTY` / `mergeable: CONFLICTING`              | Cascata #2; conflito não trivial **escala**                 |
| `needs-response`  | comentário vivo, top-level humano, ou review não visto            | Modo inbox                                                  |
| `needs-triage`    | só threads a triar (outdated, não resolvidas)                     | Fase 0 do inbox                                             |
| `stale-base`      | `mergeStateStatus: BEHIND`                                        | Cascata #2 (merge da `main`)                                |
| `ci-running`      | check pendente                                                    | Observar (`watch`), não reprocessar                         |
| `awaiting-review` | review pedido a alguém e ainda não feito depois do último push    | Esperar; reportar quem está pedido                          |
| `draft`           | `isDraft`                                                         | Reportar; tirar de draft é decisão do usuário               |
| `no-ci`           | nenhum check existe                                               | Investigar por que o CI não disparou — **nunca** "pronta"   |
| `done-pending`    | `unresolved == 0` + checks **verdes**                             | **Para e reporta** — merge é manual                         |
| `needs-attention` | sobra: pendência que só o humano destrava                         | Reportar o que espera resposta e parar                      |

Escolhas que não são óbvias, e por quê:

- **Review humano não é pré-condição de `done-pending`.** O Zeile tem um mantenedor e nenhum bot de
  review: exigir "review posterior ao push" deixaria toda PR presa em `awaiting-review` para sempre.
  `awaiting-review` só existe quando há **pedido de review** pendente (`reviewRequests`).
- **O CI roda em toda PR**, de qualquer base e também em draft (`ci.yml` dispara em
  `pull_request` sem filtro de base nem de draft). PR empilhada **tem** CI. `no-ci` é anomalia
  (workflow que não disparou), não estado normal de stack.
- **Jobs pulados contam como verdes.** `frontend-test` e `rust-test` são filtrados por
  `dorny/paths-filter`, e `Generators` só dispara por `paths`: conclusão `SKIPPED` ou workflow
  ausente é o CI dizendo "não se aplica", não falha. É exatamente por isso que o gate local (`gates.md`
  §1) decide as faixas pela **mesma** divisão de paths.

Os predicados que sustentam a tabela:

- **thread viva** = `isResolved=false AND isOutdated=false AND` veredito não terminal.
- **thread a triar** = `isResolved=false AND isOutdated=true`. Só a verificação contra o código atual
  diz se ainda vale.
- **esperando reviewer** = veredito `rebutted` ou `indeterminate`. Conta como pendente (bloqueia
  `done-pending`) e **não** volta para a fila de ação. Resposta humana posterior ao veredito reabre.
- **comentário do próprio loop** = corpo com o marcador `<!-- loop-eng-zeile -->`. O loop posta com o
  login do usuário, então **autor não distingue** o usuário do loop — o marcador sim. Todo comentário,
  resposta e review que o loop publica **começa** com o marcador; sem ele o loop lê a própria resposta
  como pedido novo e gira.
- **comentário de bot** (`vercel` e afins) = informativo, nunca acionável.
- **review não visto** = review com `submittedAt` maior que o `committedDate` do head **e** maior
  que `lastSeenReviewAt` do estado.
- **check verde** = existe check e nenhum falhando nem pendente. Ausência de check não é verde.

## Invariantes de segurança (não destraváveis)

Não cedem a pedido na invocação. Se o usuário pedir um destes, responda o que a regra protege e o
que dá para fazer no lugar; se ele reafirmar, ele executa a ação, não o loop.

- **Nunca faz merge.** O fluxo para em `done-pending` e reporta.
- **Nunca pusha sem conferir `git rev-parse --abbrev-ref @{upstream}` contra o `headRefName` da PR.**
  Branch criada de `origin/main` nasce rastreando a `main`; push cego escreve na `main`.
- **Nunca push na `main`**, nem commit direto nela. Todo trabalho vai por branch e PR.
- **Nunca `--no-verify`** em commit ou push, e nunca desligar `core.hooksPath`.
- **Nunca `--force` / `--force-with-lease`** em branch com PR aberta.
- **Nunca enfraquecer teste para passar**: sem `.skip`/`.only`/`#[ignore]`, sem asserção removida,
  sem trocar asserção por `toBeDefined()`.
- **Nunca declarar verde um gate que não rodou.** Inclui a saída `75` do `gate-lock.sh` (gate
  enfileirado) e o `cargo test` sem `TEST_MIGRATION_DATABASE_URL`, que **passa sem testar nada**
  (`docs/architecture/testing.md` §"`cargo test` no CI depende de serviço real").
- **Nunca editar artefato gerado à mão**: `lib/api/generated/*` só via `pnpm generate:*`,
  `rust-server/src/schema.rs` só via `diesel print-schema`, `contracts/permission-catalog.json` só
  via `UPDATE_PERMISSION_CATALOG_SNAPSHOT=1` (`docs/architecture/contracts.md` §"Regime do artefato
  gerado").
- **Nunca rodar migration, `diesel migration redo/revert` ou `database reset` contra banco que não
  seja descartável** — o único banco que o gate toca é o de teste, criado para isso.
- **Nunca resolver thread** cujo achado foi refutado ou cuja verificação ficou indeterminada.
- **Nunca `gh pr review --approve` / `--request-changes`.** Review publicado sai como `COMMENT`.
- **Nunca commitar com trailer de co-author.** O histórico do Zeile não tem nenhum.
- **Nunca escrever estado, lock, checklist ou relatório de execução dentro do repositório.**

## Defaults (destraváveis por pedido explícito na invocação)

Cedem a pedido explícito, que **aparece no relatório** como decisão do usuário, com a consequência:

- **Gate pela divisão de paths do CI, nunca menos** (`gates.md` §1): diff fora de `rust-server/` paga a
  faixa F inteira; diff em `rust-server/`/`Cargo.*` paga a faixa R inteira; diff que o workflow
  `Generators` filtra paga a faixa G. Rodar só o arquivo tocado não é gate.
- **Passos de gate em sequência**, um comando por vez dentro da sessão.
- **Todo comando de gate caro passa por `gate-lock.sh run`** (`gates.md` §3.2) — `cargo clippy`,
  `cargo test`, `pnpm types:check`, `pnpm test`, os `generate:*:check` (que compilam o Rust). A fila
  é da **máquina**, compartilhada por todos os clones e worktrees.
- **Comentário só nas seis categorias, em en-US** (`docs/architecture/comment-guide.md`). O loop não
  narra o próprio fix, e nunca referencia PR, issue ou commit em comentário de código — referência a
  `Q<n>` e a ADR é legítima, porque é versionada e perene.
- **Uma PR por tick** nos modos que escrevem.
- **Nenhum subagente de review** (Q90). O review é inline, guiado pelas seções "Mudou X ⇒ verifique
  Y" de cada doc de `docs/architecture/` — esta é a decisão do repo, não uma economia do loop.
  Subagente só em ondas de correção com arquivos disjuntos, e só quando a onda tem mais de ~4 etapas
  independentes.

## Precedência de regras

Do mais forte ao mais fraco. Em conflito, o de cima ganha:

1. Os invariantes de segurança acima.
2. Pedido explícito do usuário na invocação — sobrepõe os defaults, nunca os invariantes.
3. `docs/decisoes.md` (Q1–Q124) e as ADRs de `docs/decisions/`.
4. `docs/architecture/*` — o mais específico ao tema vence (`docs/README.md` §"Regra de precedência").
5. `docs/plano-execucao.md` — ordem e escopo das etapas.
6. O padrão do arquivo vizinho — **o mais fraco de todos**. Regra documentada vence código existente.

Severidade é a do repo: 🔴 bloqueante, 🟡 corrigir, ⚪ sugestão (`docs/README.md` §"Severidade").

## Quando parar e perguntar (escalação)

Traga ao usuário, com o problema claro e alternativas descritas, antes de implementar:

- Mudança no **shape do documento Automerge** — é o único ponto de ripple **sem guard**
  (Q90/`crdt.md`): sem função de upgrade de `schema_version`, docs já persistidos corrompem.
- Mudança na **regra de permissão** (`sec/catalog/`, `domain/permissions/engine.ts`) ou na
  **sandbox de execução** (`executor/`, `lib/sandbox/`) — áreas de maior consequência e com
  CODEOWNERS dedicado.
- Migration destrutiva, `ALTER TYPE ... ADD VALUE`, ou qualquer coisa que peça janela de deploy.
- `errorCode` removido ou renomeado (contrato aditivo, ADR 0001).
- Pedido que **contraria** regra documentada, ou que exige decisão nova no catálogo (um `Q` novo).
- Conflito de merge não trivial, ou dois pedidos incompatíveis na mesma PR.
- Impacto de performance em canvas/render sem medição (`performance.md`, Q117).

O resto do trabalho continua enquanto a pergunta espera. A escalação vira registro em `escalations`
e volta em todo relatório até ser respondida — a resposta se registra com o modo `answer`.

## Autorizações desta invocação

Autorizado sem perguntar a cada vez: **commit e push na branch de trabalho**, **abrir e atualizar a
PR**, **responder e resolver threads**, e **publicar review como comentário** no modo `review`.

Fora dessa lista, escrita em serviço externo pede confirmação: label, milestone, pedido de review a
alguém, issue nova, mudança de configuração do repo. O que nunca é autorizado está nos invariantes.

## Sob `/loop`

Uma passada por tick, `noop` quando nada mudou, e encerrar quando só restarem escalações esperando o
usuário (`gates.md` §7).
