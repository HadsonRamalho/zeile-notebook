# Gates, estado e concorrência

Base compartilhada pelos modos `deliver`, `inbox`, `cascade`/`sweep` e pelos operacionais. O modo
`review` não usa nada daqui além do lock por PR (§3.1) — ele não roda gate e não toca o working tree.

## 1. Contrato de gate — as faixas espelham o CI

O Zeile não tem grafo de projetos: o CI decide o que roda pela **área do diff**
(`dorny/paths-filter` em `ci.yml`, `paths` em `generators.yml`). O gate local usa **a mesma divisão**
— nem mais estreita (seria gate que o CI reprova depois), nem mais larga sem motivo.

| Faixa | Entra quando o diff toca                                                            | Espelha                     |
| ----- | ----------------------------------------------------------------------------------- | --------------------------- |
| **0** | sempre                                                                              | varredura barata (§1.2)     |
| **F** | qualquer coisa fora de `rust-server/` (frontend, `scripts/`, `messages/`, config)   | job `frontend-test`         |
| **R** | `rust-server/**`, `Cargo.toml`, `Cargo.lock`                                        | job `rust-test`             |
| **G** | `rust-server/src/**`, `rust-server/Cargo.*`, `scripts/generate-*`, `scripts/check-no-duplicate-fields.mjs`, `lib/api/generated/**`, `package.json` | workflow `Generators` |
| **D** | `src-tauri/**`                                                                      | **nada** — o CI não cobre o desktop |

### 1.1 Antes: a lista de arquivos e a área

```bash
git fetch origin main
BASE=$(git merge-base origin/main HEAD)
git diff --name-only "$BASE" HEAD      # inclua também o que não está commitado: git status --porcelain
```

Classifique cada arquivo nas faixas acima. Um diff costuma cair em mais de uma (rota nova no Rust =
R + G + F, porque o tipo gerado muda e o frontend o consome).

Node tem de ser 22 (o CI usa 22): `node -v`. Major divergente gera falso positivo/negativo. Worktree
sem `node_modules` não roda faixa F nem G: `pnpm install --frozen-lockfile` antes, ou rode o gate em outro
clone — e diga no relatório de onde o gate saiu.

### 1.2 Faixa 0 — barata, antes de gastar CPU

Segundos, **fora da fila** de gate:

```bash
pnpm lint                     # biome check — o repo inteiro, é rápido; 0 erro
pnpm validate:i18n            # os três checks do Q45: paridade de locales, chave órfã, errorCode traduzido
pnpm check:no-duplicate-fields   # "um conceito, uma grafia" nos tipos gerados
cargo fmt --all --check --manifest-path rust-server/Cargo.toml   # só se a faixa R entra
```

Conserte o que ela aponta **antes** das faixas caras. `pnpm format` corrige formatação do biome;
`cargo fmt --all --manifest-path rust-server/Cargo.toml` a do Rust.

### 1.3 Faixa F — frontend

```bash
"$GL" run build --label F-types -- pnpm types:check     # next typegen && tsc --noEmit
"$GL" run test  --label F-test  -- pnpm test            # vitest run — a suíte inteira
```

A suíte inteira, sempre: o Vitest do Zeile roda em segundos a poucos minutos, e o teste de paridade
TS ↔ Rust (`domain/permissions/engine.parity.test.ts`) quebra por mudança fora do arquivo tocado.
`pnpm build` (Next + Serwist) **não** é gate local por default: quem constrói em PR é o deploy de
preview, e o check dele entra no `ci-red`. Rode `pnpm build` localmente quando o diff tocar
`next.config.mjs`, `middleware.ts`, `serwist.config.mjs`, `mdx-components.tsx` ou dependência no
`package.json` — o preview demora, e quebra de build ali é cara de descobrir depois do push.

### 1.4 Faixa R — Rust

```bash
"$GL" run build --label R-clippy --cost-gb 4 -- \
  cargo clippy --all-targets --manifest-path rust-server/Cargo.toml -- -D warnings
"$GL" run test --label R-test --cost-gb 5 -- \
  env TEST_MIGRATION_DATABASE_URL="$TEST_DB" cargo test --manifest-path rust-server/Cargo.toml
```

**`cargo test` sem `TEST_MIGRATION_DATABASE_URL` passa sem testar migration nenhuma** — os testes de
`db_migrations.rs` e de `domain/team/repository.rs` retornam cedo. Por isso o gate de R precisa de um
Postgres **descartável**, igual ao do CI (`postgres:16`, usuário `zeile`, senha `zeilepass`, banco
`zeile_migration_test`):

```bash
docker run --rm -d --name zeile-gate-pg -p 55432:5432 \
  -e POSTGRES_USER=zeile -e POSTGRES_PASSWORD=zeilepass -e POSTGRES_DB=zeile_migration_test postgres:16
TEST_DB=postgres://zeile:zeilepass@localhost:55432/zeile_migration_test
# ... gate ...
docker stop zeile-gate-pg
```

Porta 55432 para não colidir com o Postgres de desenvolvimento (`5432`, banco `zeile_db`), que o gate
**nunca** toca. Sem container runtime (ou com `--no-db`): rode o `cargo test` mesmo assim — pega o que
não depende de banco — e declare no relatório **"migrations: não rodou (sem Postgres)"**. Nunca o
apresente como cobertura de migration.

Se o diff tocou `rust-server/migrations/` ou `rust-server/src/schema.rs`, rode também o guard de
schema, com o mesmo banco descartável **recém-criado** (ele aplica todas as migrations do zero):

```bash
"$GL" run test --label R-schema -- \
  env SCHEMA_CHECK_DATABASE_URL="$TEST_DB" bash rust-server/scripts/check_schema.sh
```

Exige `diesel_cli` 2.3.10 com feature `postgres` (a versão do CI). Ausente → "não rodou: sem
diesel_cli", e o job `rust-test` do CI vira a única evidência — diga isso.

### 1.5 Faixa G — geradores

```bash
"$GL" run build --label G --cost-gb 4 -- bash -c '
  pnpm generate:openapi-types:check &&
  pnpm generate:ws-types:check &&
  pnpm generate:error-codes:check &&
  pnpm check:no-duplicate-fields'
```

Os três `--check` compilam e rodam o `rust-server` (`cargo run -- export-openapi`), por isso entram
na fila. Divergência **não** se corrige editando o gerado: rode o `pnpm generate:*` correspondente,
confira o diff e commite junto da mudança que o motivou (`contracts.md` §"Mudou X ⇒ verifique Y").

### 1.6 Faixa D — desktop

O CI não tem job para `src-tauri/`. Se o diff toca o desktop:

```bash
"$GL" run build --label D --cost-gb 4 -- cargo clippy --all-targets --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Exige as dependências de sistema do Tauri (webkit2gtk etc.). Faltou → "não rodou: dependência de
sistema", e diga no relatório e no corpo da PR que **nenhum** gate cobriu o desktop.

### 1.7 Regras que não se negociam

- **Sequencial dentro da sessão**: um passo por vez. Falhou → conserta e reinicia **aquela faixa**
  do começo, depois de repassar a faixa 0.
- **Faixa que não se aplica se declara**: "R: não se aplica (diff sem `rust-server/`)". Não é omissão.
- **Mudança só em `docs/`, `*.md` ou `.github/`**: faixa 0 (o biome ignora o que não é código) e
  nada mais — diga que não há suíte para esse tipo de arquivo, em vez de inventar um verde.
  `.github/workflows/` tocado: valide a sintaxe (`gh workflow view` não serve antes do push; use
  `actionlint` se existir) e diga que a prova real é o próprio run do CI.
- **Nada roda teste entre o commit e o merge além do CI.** O único hook do Zeile é `commit-msg`
  (formato da mensagem). O gate local mais o CI são a cobertura inteira.

### 1.8 Armadilhas que o gate pega e a revisão não

- Chave i18n nova em **um** locale só (`messages/en.json` vs `messages/pt-br.json`) — check 1.
- Chave removida da UI e esquecida no JSON — check 2 (chave órfã).
- Variante nova em `ApiError` sem `pnpm generate:error-codes` **e** chave em `api_errors` nos dois
  locales — check 3 e o `match` exaustivo do Q41.
- `#[utoipa::path]` alterado sem regenerar `openapi-types.ts` — faixa G.
- Enum de bloco com valor novo sem tratar em todo `switch` — `noFallthroughCasesInSwitch` (Q35) na
  faixa F. Não silencie com `default` genérico.
- Regra de permissão alterada de um lado só (TS ou Rust) — teste de paridade na faixa F.

## 2. Guarda de push (obrigatória)

Antes de **todo** push:

```bash
git rev-parse --abbrev-ref HEAD            # nunca main
git rev-parse --abbrev-ref @{upstream}     # deve ser origin/<headRefName da PR>
git status --porcelain                     # nada inesperado
```

Upstream que não casa com o `headRefName` da PR → **recuse o push** e reporte. Branch criada com
`git switch -c <nova> origin/main` nasce rastreando `origin/main`: rode `git branch --unset-upstream`
na hora e faça o primeiro push com `git push -u origin <branch>` só depois de confirmar o nome.

## 3. Locks

Dois eixos independentes: **quem trabalha aquela PR** (§3.1) e **quem usa a memória da máquina**
(§3.2). Ambos usam `mkdir`/`flock`, atômicos.

### 3.1 Lock por PR

```bash
mkdir -p "$WORK/locks"
if mkdir "$WORK/locks/pr-<n>.lock" 2>/dev/null; then
  printf 'clone=%s\nhost=%s\npid=%s\nsince=%s\nmode=%s\n' \
    "$(git rev-parse --show-toplevel)" "$(hostname)" "$$" "$(date -u +%FT%TZ)" "<modo>" \
    > "$WORK/locks/pr-<n>.lock/owner"
else
  cat "$WORK/locks/pr-<n>.lock/owner"   # outra sessão tem a PR: siga para a próxima
fi
```

- Adquira **antes** de mexer em qualquer arquivo da PR; libere (`rm -rf`) ao terminar ou abortar,
  inclusive quando o gate falha.
- Lock de outra sessão **não** se rouba: pule a PR e registre no relatório.
- **`deliver`** ainda não tem número de PR: use `deliver-<chave>.lock` (§4, chave da entrega) e troque
  pelo `pr-<n>.lock` quando a PR abrir.
- Lock suspeito: §3.3.

### 3.2 Fila de admissão de gate — a da máquina, não a do repo

O wrapper é `$SKILL/bin/gate-lock.sh`: fila FIFO, admissão por memória (orçamento de 8 GB, reserva
de 2 GB de `MemAvailable`, pressão de memória baixa), **um gate pesado por vez** e teto de memória
por scope systemd. A fila é **da máquina**, não do repositório: todo clone e toda worktree do Zeile
usam a mesma, em `~/.claude/loop-eng-zeile/gate/`.

```bash
GL="$(git rev-parse --show-toplevel)/.claude/skills/loop-eng-zeile/bin/gate-lock.sh"
```

Defina `GL` no início de **todo** comando de shell que chama o wrapper (cada chamada de Bash é um
shell novo). Variáveis de ajuste, todas opcionais:

| Variável               | Default                          | Efeito                                                 |
| ---------------------- | -------------------------------- | ------------------------------------------------------ |
| `ZEILE_GATE_QUEUE_DIR` | `~/.claude/loop-eng-zeile/gate`  | onde ficam fila, mutex e `gate-journal.tsv`            |
| `ZEILE_GATE_BUDGET_GB` | `8`                              | soma máxima dos custos dos gates rodando               |
| `ZEILE_GATE_RESERVE_GB`| `2`                              | `MemAvailable` mínimo além do custo do gate            |
| `ZEILE_GATE_MEMCAP`    | `1`                              | `0` desliga o teto de memória por scope systemd        |

Outra ferramenta da máquina que também roda gates pesados pode compartilhar a fila apontando para o
mesmo diretório; sem isso, as duas filas não se enxergam e podem somar mais memória que a máquina tem.

| `kind`  | Custo default | Pesado | Uso no Zeile                                                 |
| ------- | ------------- | ------ | ------------------------------------------------------------ |
| `lint`  | 2 GB          | não    | (faixa 0 roda fora da fila)                                  |
| `build` | 3 GB          | não    | `types:check` · `clippy` e geradores com `--cost-gb 4`        |
| `test`  | 4 GB          | sim    | `pnpm test` · `cargo test` com `--cost-gb 5` · `check_schema` |
| `gate`  | 5 GB          | sim    | concessão para uma sequência inteira                          |

- Mais de um passo seguido → prefira **uma concessão** `"$GL" run gate --label pr-<n> --cost-gb 5 --
  bash "$WORK/gate-<n>.sh"`; dentro do script, cada `"$GL" run ...` roda direto (o wrapper reconhece
  o `GATE_LOCK_TICKET` herdado). `--cost-gb` da concessão = o do passo mais caro.
- Saída **75** = não admitido até o timeout. **Gate enfileirado, não reprovado**: encerre a passada,
  mantenha o lock da PR e retome no próximo tick do começo da faixa.
- Saída **137** com a nota `provável teto de memória` = "não rodou: teto de memória". O próximo passo
  é reduzir paralelismo (`CARGO_BUILD_JOBS`, `--maxWorkers` do Vitest), não subir o teto.
- `"$GL" status` mostra fila, orçamento e `MemAvailable`. Não improvise admissão própria com
  `free`/`sleep`, e não fure a fila porque "é rápido".

### 3.3 Lock órfão — qual sinal vale

- **Lock de PR**: o `pid` gravado é de shell efêmero e morre logo após o `mkdir`; pid morto **não**
  prova órfão. Cruze `clone=` e `since=` com as sessões vivas (`ListAgents`). `since` acima de ~2 h é suspeita, não veredito: mostre o `owner` inteiro e
  **pergunte** antes de remover.
- **Ticket da fila** (`queue/*.t` no diretório da fila): o próprio `gate-lock.sh` remove ticket cujo wrapper **e**
  filho morreram. Não remova à mão.

## 4. Estado: shardado, versionado, idempotente

`$WORK/state/`. Sem estado, o loop reprocessa o que já fez: responde duas vezes, re-resolve thread,
republica review. **Toda escrita externa consulta o estado antes.**

```
state/global.json        # o que não pertence a uma PR só
state/pr-<n>.json        # tudo de uma PR
```

```json
// state/global.json
{
  "version": 1,
  "repo": "HadsonRamalho/zeile-notebook",
  "escalations": [
    { "id": "esc-170-1", "pr": 170, "thread": "PRRT_...", "why": "...", "options": ["..."],
      "askedAt": "2026-10-05T18:00:00Z", "answeredAt": null, "answer": null }
  ],
  "deliveries": {
    "encaixavel-timestamptz": {
      "status": "in-progress|open|merged",
      "source": "docs/plano-execucao.md — Encaixáveis: Auditar timestamptz (Q57)",
      "branch": "fix/timestamptz-audit",
      "pr": 171,
      "startedAt": "...",
      "at": "..."
    }
  },
  "cascades": { "<slug-do-padrao>": { "pattern": "...", "found": [171], "queued": [], "reportedAt": "..." } },
  "decisions": { "esc-170-1": { "answer": "...", "at": "...", "appliesTo": ["etapa-21"] } },
  "handoff": { "note": "...", "at": "..." }
}
```

```json
// state/pr-171.json
{
  "pr": 171,
  "threads": { "PRRT_kwDO...": { "verdict": "applied|rebutted|indeterminate|stale-fixed", "commit": "9384ede", "at": "..." } },
  "comments": { "3345394926": { "verdict": "applied", "at": "..." } },
  "lastSeenReviewAt": "2026-10-05T17:40:00Z",
  "review": { "headOid": "abba785", "reviewId": 4987069998, "verdict": "ajustes", "blocking": 1, "important": 3, "inline": 4, "outOfHunk": 0, "at": "..." },
  "reviewRounds": 1
}
```

- **Chave de `deliveries`** = `etapa-<N>` para etapa inteira, `etapa-<N>-<slug>` para um item dela,
  `encaixavel-<slug>` para item da seção "Encaixáveis", e o slug da branch para trabalho fora do plano.
- `threads` é a memória de "já tratei". `applied`/`stale-fixed` encerram; `rebutted`/`indeterminate`
  continuam pendentes sem voltar à fila. Resposta **humana** (sem o marcador do loop) posterior ao `at`
  reabre. Grave o `at` **depois** de postar a resposta.
- `comments` é o mesmo para comentário top-level, chaveado pelo `databaseId`.
- `lastSeenReviewAt` — grave sempre que ler os reviews de uma PR, mesmo sem nada a fazer.
- `review` — registro do modo `review`, com `headOid`: "já revisei esta PR neste head?".
- `reviewRounds` sobrevive ao tick: o teto de ondas é por PR e por ciclo, não por invocação.
- `escalations` volta em todo relatório até `answeredAt`; a resposta vira `decisions`.

Protocolo de escrita: tenha o lock da PR; leia o shard, altere, grave em `*.tmp` e `mv`.
`global.json` exige `locks/global.lock` (mesmo `mkdir`) pelo menor tempo possível. `version` maior
que a suportada pelo coletor → **não escreva**; reporte e pare.

## 5. Commits

- Formato do hook `.githooks/commit-msg`: `<type>: <descrição>` ou `<type>(<escopo>): <descrição>`,
  types `feat|fix|refactor|test|docs|chore`. Subject até **72** colunas (o hook avisa acima disso),
  imperativo no presente da 3ª pessoa como o histórico ("corrige", "migra", "fecha"), em **pt-BR**,
  sem ponto final. Escopo é a área: `notebook`, `auth`, `types`, `api`, `rust`, `i18n`, `desktop`...
- Corpo em pt-BR explicando o **porquê**, quebrado em ~72 colunas. Referencie a etapa e os `Q<n>` que
  a mudança aplica — no commit e na PR, **não** em comentário de código além do `Q<n>`/ADR.
- **Um commit por etapa do checklist**, nunca um monolito no fim. A PR é squash-mergeada, mas os
  commits viram a lista do corpo do squash — eles são lidos.
- **Sem trailer de co-author.**
- Nunca um commit cujo diff seja só comentário, salvo quando o escopo é exatamente esse (ex.:
  traduzir comentários pt-BR remanescentes para en-US, `comment-guide.md`).

## 6. Correção em ondas

1. Checklist priorizado em `$WORK/checklist-pr-<n>.md` (ou `checklist-<chave>.md` no deliver), com
   ondas, arquivos-alvo, faixa de validação e dependências. Onda N só começa depois da N-1.
2. Etapas que compartilham arquivo vão em sequência. Subagente só para etapas de arquivos
   **disjuntos** e só quando há ~4+ etapas independentes; ele corrige, valida com a faixa 0 e
   `types:check`/`clippy` do que tocou, **não commita**, **não roda suíte** e não introduz comentário.
3. Fechada a onda, o orquestrador roda os testes da área tocada — `pnpm vitest run <arquivos
   relacionados>` ou `cargo test --manifest-path rust-server/Cargo.toml <módulo>` — e commita por
   etapa. As **faixas completas** (§1) rodam **uma vez**, no fim, antes do push.
4. Parada: limpo, `--max-iters` (default 3, contado em `reviewRounds`), ou **ausência de progresso**
   — os mesmos achados em duas iterações seguidas. Sem progresso, pare e reporte.

## 7. Ritmo sob `/loop`

- Cada tick é **uma passada**: coletor → alvo → age → reporta.
- **Uma PR por tick** nos modos que escrevem. No modo default, `deliver` só entra se o `inbox` não
  achou nada.
- `noop: true` quando nada mudou; `noop: false` quando houve commit, push, comentário ou escalação.
- Ritmo: 1200–1800 s por default. ~480 s só enquanto observa um run de CI que acabou de disparar
  (modo `watch`) e depois de tick encerrado por gate enfileirado (saída 75).
- Encerrar o loop quando não há PR acionável **e** não há item pendente no plano que o usuário tenha
  liberado, ou quando tudo que resta são escalações esperando o usuário.
