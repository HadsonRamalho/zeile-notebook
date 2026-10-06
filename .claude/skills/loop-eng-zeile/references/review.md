# Modo review — revisar PRs de terceiros

`/loop-eng-zeile review [--pr N] [--author <login>] [--max N] [--dry-run]`

Revisa PRs de colaboradores e publica o resultado no GitHub como **comentário**. Não roda gate e não
toca o working tree — por isso convive com o `deliver`. Relatório no formato de `report.md`.

Hoje o Zeile tem um mantenedor: na maioria das passadas o lote sai vazio, e isso é resultado válido
("nenhuma PR de terceiro aberta"), não falha.

## Invariantes deste modo

- **Não roda lint, build nem teste.** É review de leitura.
- **Não faz checkout.** Lê por `gh pr diff` e `gh pr view --json`.
- **Não aprova nem rejeita.** `event: COMMENT`, sempre.
- **Não revisa PR minha.** PR própria é do `inbox` — e uma revisão do loop na própria PR viraria
  comentário que o próprio `inbox` leria como pedido.
- **Não republica no mesmo head.** `review.headOid` no shard responde "já revisei neste head?".
- **Lock por PR**: siga com as que conseguiu travar e relate as que ficaram de fora.
- **Sem subagente** (Q90): uma PR por vez, inline. `--max` default 3, teto 5.

## 1. Selecionar o lote

```bash
gh pr list --repo HadsonRamalho/zeile-notebook --search "review-requested:@me" --state open --limit 50 \
  --json number,title,author,headRefName,baseRefName,isDraft,updatedAt
node "$SKILL/bin/pr-loop-state.mjs" --others --json          # fallback, ou --author <login>
```

Dedup: duas PRs do mesmo autor para a mesma etapa (`stages` do coletor) ou com a mesma branch de
origem refeita — revise a mais recente e diga qual foi preterida. Ordem: pediram review para mim >
sem nenhum review > mais antiga sem atividade. Draft só se o usuário pedir. Anuncie o lote **antes**
de começar.

## 2. Revisar

Para cada PR, nesta ordem:

1. Leia o corpo e identifique a etapa e os `Q<n>` que ela diz aplicar. Leia esses trechos de
   `docs/plano-execucao.md` e `docs/decisoes.md` **antes** do código.
2. `gh pr diff <n>` inteiro. Classifique os arquivos pelas áreas da tabela de `docs/README.md`.
3. Para cada área tocada, aplique as regras 🔴/🟡 do doc de `docs/architecture/` correspondente e
   percorra a seção "Mudou X ⇒ verifique Y" — é o checklist de review que o repo escolheu no lugar de
   subagentes (Q90). Os quatro ripples do Q90 sempre (`deliver.md` §7).
4. Prioridade dos achados: aderência à etapa/decisão citada 🔴 → regras 🔴 da área → artefato gerado
   editado à mão / não regenerado 🔴 → regras 🟡 em código tocado → comentário fora do
   `comment-guide.md` 🟡 → ⚪.
5. Regra documentada vence o padrão do arquivo vizinho: "o código em volta faz igual" não absolve.

Cada achado: `arquivo:linha`, a referência (`Q<n>` ou `<doc>.md §<seção>`) e o ajuste concreto.

## 3. Consolidar

Um relatório por PR em `$WORK/report-pr-<n>.md`:

```markdown
<!-- loop-eng-zeile -->
## Review

**Veredito:** 🔴 bloquear / 🟡 ajustes / ✅ sem achados
**Etapa:** <N ou "fora do plano"> — ✅ aderente / 🟡 divergente / 🔴 escopo diferente do declarado
**Achados:** 🔴 N · 🟡 N · ⚪ N · in-line M

### 🔴 Bloqueantes

1. `Q<n>` `arquivo:linha` — <ajuste concreto no imperativo>

### 🟡 Corrigir

1. `<doc>.md §<seção>` `arquivo:linha` — <ajuste>

### ⚪ Sugestões

- (opcional)
```

Um achado = uma linha; mesmo defeito em N locais = N in-line + **uma** entrada com a contagem; seção
vazia = `nenhum`; veredito 🔴 se qualquer bloqueante. In-line, uma linha:
`<ref> — <o que está errado> → <fix concreto>`. Sem preâmbulo, sem elogio, sem "considere". Dúvida
genuína vira `[❓]` + a pergunta.

## 4. Publicar

Com `--dry-run`, para aqui. Senão, **uma** chamada por PR:

```bash
gh api repos/HadsonRamalho/zeile-notebook/pulls/<n>/reviews -X POST --input "$WORK/payload-<n>.json"
```

```json
{
  "commit_id": "<headRefOid>",
  "event": "COMMENT",
  "body": "<o resumo em markdown, começando pelo marcador>",
  "comments": [{ "path": "features/notebook/x.tsx", "line": 42, "side": "RIGHT", "body": "<!-- loop-eng-zeile -->\nQ109 — try/catch cru em código novo → devolver Result" }]
}
```

**Valide cada linha contra os hunks `RIGHT`** antes de montar o payload: um comentário fora de hunk
derruba a chamada inteira. Achado fora do diff vai para o corpo, com `arquivo:linha`. Push durante a
revisão → recolete o head e revalide.

Depois de publicar, grave `review` no shard (`headOid`, `reviewId`, veredito, contagens).

## 5. Relatar

Por PR: número, autor, veredito, contagem 🔴/🟡/⚪, in-line publicados, achados no corpo por caírem
fora de hunk, caminho do relatório local. Mais o que foi deduplicado e o que ficou de fora (por
`--max`, por lock, por `headOid` igual).
