# Cascata — os quatro sentidos

`/loop-eng-zeile cascade [--pr N]`. Também roda embutida no `inbox` e no `deliver` quando o estado
pede. O sentido #3 tem superfície própria: `/loop-eng-zeile sweep`.

## #1 — Stack de PRs dependentes

O Zeile já entregou em stack (etapa 14: `#136` → `#137` → `#138`, extractors → layer de permissão →
migração de domínio). Sem extensão de stack instalada, o procedimento é git puro:

- A PR filha tem `base` = branch da mãe. O CI roda nela normalmente (`ci.yml` não filtra base).
- Mudança na mãe: commit na mãe → push → na filha, `git fetch origin && git merge origin/<branch-mãe>`
  → gate das faixas afetadas → push. **Merge, nunca rebase**: a filha já está publicada.
- Ordem de trabalho: **fundo da stack primeiro** (`stackDepth` menor). Uma filha por vez no gate;
  não herde o verde da mãe.
- **Depois que a mãe é mergeada** (squash na `main`): a filha passa a carregar commits que a `main`
  já tem com outro hash. Retarget e reconcilie:

  ```bash
  gh pr edit <filha> --base main
  git fetch origin main && git merge origin/main     # conflitos aqui são os commits da mãe: resolva
                                                      # em favor do que está na main
  ```

  Depois, gate das faixas tocadas e push. O merge da mãe é do usuário — o loop só percebe e reconcilia.
- Conflito que exige decidir semântica **escala**.

## #2 — Base defasada (`stale-base` / `conflict`)

Procedimento **canônico** para os dois estados; `inbox.md` aponta para cá.

**Merge da `main` na branch, nunca rebase** — o histórico do Zeile confirma a prática
(`Merge remote-tracking branch 'origin/main' into ...`), e rebase em branch publicada exigiria
`--force`, que é invariante.

```bash
git fetch origin main
git rev-list --count HEAD..origin/main        # quanto a base andou
git diff --shortstat HEAD...origin/main       # tamanho do que vem
git merge origin/main
```

Depois do merge: faixas de gate que o **resultado** do merge toca (não só o diff original — um
`openapi-types.ts` regenerado na `main` pode quebrar o consumidor da sua PR), e só então push.
Conflito mecânico resolve-se aqui. Conflito em **artefato gerado** não se resolve à mão: aceite um
lado e **regenere** (`pnpm generate:*`, `diesel print-schema`). Conflito que exige decidir semântica
**escala**.

Acima de ~50 commits de drift, ou merge maior que a própria PR, **avise antes de mergear**.

## #3 — Padrão sistêmico (modo `sweep`)

`/loop-eng-zeile sweep [--pattern <descrição>]`

Achado que revela **padrão**, não caso isolado: o mesmo `try/catch` cru que o Q109 aboliu, a mesma
string hardcoded, o mesmo `TIMESTAMP` sem tz, o mesmo comentário pt-BR remanescente, o mesmo
`serde(rename)` campo a campo.

1. Localize as PRs abertas afetadas (busca pelo padrão no diff de cada uma).
2. **Não aplique em silêncio.** Registre em `cascades[<slug>]` e relate.
3. O item enfileirado entra no checklist da PR dona **quando ela for o alvo de um tick do `inbox`**.
4. Nunca mexa em PR `done-pending` sem perguntar.
5. Padrão que está na **`main`** e não no diff é dívida: proponha item novo em
   `docs/plano-execucao.md` (seção "Encaixáveis") **ao usuário** — não contrabandeie a correção numa
   PR de feature, e não edite o plano sem a aprovação dele. Aprovado, a correção nasce pelo `deliver`.

## #4 — Próximo item do plano

Fechada a unidade atual (PR aberta e entregue ao `inbox`), o `deliver` puxa o **próximo item da mesma
etapa** do `docs/plano-execucao.md`.

Uma etapa não deve ficar pela metade: se ela foi dividida em PRs por domínio (como a 20), os PRs dela
vão antes de começar a etapa seguinte. Quando a etapa fecha (o último item virou `[x]` e a etapa
ganha `— [x] concluída`), **reporte e pergunte antes de entrar na próxima** — mudança de etapa é ponto
natural de decisão, e a próxima pode depender de uma "Questão ainda aberta".
