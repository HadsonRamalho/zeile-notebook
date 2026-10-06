# Modos operacionais — manutenção do próprio loop

Cinco modos curtos que existem porque o fluxo tem estado: lock, escalação pendente, tick
interrompido, CI em voo e PR que chegou ao fim. Nenhum roda gate nem toca código de produção.

## `locks` — inventário e liberação

`/loop-eng-zeile locks [--pr N]`

**Lock de PR** (`$WORK/locks/pr-<n>.lock/owner` e `deliver-<chave>.lock`): liste `clone`, `host`,
`pid`, `since`, `mode`, e classifique pelo critério de `gates.md` §3.3:

- **ativo** — há sessão viva naquele `clone`. Não toque; relate.
- **suspeito** — nenhuma sessão viva aparente, ou `since` > 2 h. **Pergunte** antes de liberar,
  mostrando o `owner` inteiro.

O pid gravado é de shell efêmero: `kill -0` diria "morto" sempre. Cruze com `ListAgents`. Tempo
sozinho nunca autoriza remover.

**Fila de gate**: `"$GL" status` (`gates.md` §3.2). Ticket órfão o próprio wrapper remove; não
remova à mão. Libere sempre por lock, nunca `rm -rf locks/*`.

## `answer` — fechar escalação

`/loop-eng-zeile answer [<id>]`

1. Liste as escalações com `answeredAt: null` de `global.json`: PR, pergunta, data.
2. Para a respondida, preencha `answeredAt` e `answer`, e crie `decisions[<id>]` com `appliesTo`
   (etapas/PRs que a decisão alcança).
3. Se a resposta é **decisão de regra** (algo que deveria virar `Q<n>` no catálogo ou ADR), diga isso
   ao usuário: o estado do loop não é o lugar de regra do repo — `docs/decisoes.md` é. Propor o texto
   é ok; editar o catálogo só com o pedido dele.
4. Diga qual PR volta a ser acionável — e pare. Aplicar é trabalho do modo dono da PR.

## `ready` — o que espera merge

`/loop-eng-zeile ready`

Para cada PR em `done-pending`: número, título, etapa, base, `headRefOid`, e o que falta — merge, ou
merge da mãe antes (stack). Lembre que a PR é squash-mergeada: o título vira o commit na `main` e
precisa estar no formato do commit-msg (o loop já o criou assim; PR aberta à mão pode não estar).
`no-ci` nunca entra nesta lista.

## `watch` — observar um run de CI

`/loop-eng-zeile watch --pr N`

Para PR em `ci-running`: `gh pr checks <n> --json name,state,bucket,link` até concluir, a ~480 s.
Verde → devolve a PR ao modo dono e encerra. Vermelho → `ci-red`. Não use como poll genérico.

## `resume` — retomar tick interrompido

`/loop-eng-zeile resume`

1. **Diagnostique antes de mexer**: `git status --porcelain`, `git log --oneline origin/main..HEAD`,
   `$WORK/checklist-*.md`, `deliveries` em `in-progress`, locks órfãos, container `zeile-gate-pg`
   esquecido (`docker ps --filter name=zeile-gate-pg`).
2. **Relate o que achou** e o que pretende fazer, antes de escrever.
3. Retome do **início da etapa** interrompida: complete-a e commite, ou reverta o parcial. Nunca
   deixe etapa meio-commitada.
4. Rode as faixas de gate de novo — verde anterior à interrupção não vale.
5. Libere locks órfãos com o critério de `locks`; pare o container de gate esquecido.

Rastro que não permite reconstruir com segurança o que a sessão morta fez (push feito, thread não
respondida) → **pergunte** em vez de refazer.
