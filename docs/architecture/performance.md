# Performance — canvas e render

Escopo: `features/notebook/components/blocks/free-drawing/` (`engine.ts`, 941 linhas,
`free-drawing-cell.tsx`, 2017 linhas) — a área de maior volume de decisão implícita de
performance no Zeile, e a única sem nenhuma instrumentação até esta etapa. `comment-guide.md`
categoria 2 já exigia comentário de trade-off **medido** para decisão de performance; o que
faltava era dizer o que medir e como.

## O que medir: tempo por operação discreta, via `performance.mark`/`measure` 🟡 (Q116)

Cada ação do canvas que pode custar caro — adicionar stroke, undo/redo, zoom, re-render em
mudança de ferramenta — é envolvida em `performance.mark(...)` no início e no fim, com
`performance.measure(...)` produzindo a duração. Não é FPS contínuo: medir frame time do loop
de render inteiro é mais caro de coletar e não é necessário para o trade-off que
`comment-guide.md` já pede — o número por operação já é o suficiente para justificar uma
decisão pontual no código (ex.: por que um `useMemo` existe em `engine.ts`).

Isso não captura jank entre duas operações discretas (ex.: um handler de scroll competindo com
o listener de desenho) — se esse tipo de regressão aparecer, é sinal de que a métrica por
operação não é mais suficiente, não de que o número coletado está errado.

## Budget declarado, gate no CI 🔴 (Q117)

Cada operação medida pelo Q116 tem um número-alvo (a calibrar durante a implementação, com
dados reais de `engine.test.ts` como baseline). Esse budget é verificado por um teste de
regressão de performance determinístico no CI — não por revisão humana lembrando de rodar um
benchmark manual antes do merge.

É o único item das cinco áreas novas (`crdt`, `sandbox`, `performance`, `a11y`, `desktop`) que
vira gate automático de CI, porque é também a área com maior histórico de regressão silenciosa:
nada em `engine.ts` hoje falha caso uma mudança dobre o custo de um stroke.

## Onde a métrica vive: dashboard, não só comentário 🟡 (Q118)

O comentário de trade-off no código (categoria 2 do `comment-guide.md`) continua obrigatório —
ele explica a decisão pontual no ponto onde ela foi tomada. O que se adiciona é um dashboard ou
log estruturado permanente, alimentado pelas medições do Q116, que permite comparar ao longo do
tempo. Um comentário isolado não detecta regressão cumulativa entre PRs distintos, cada um
pequeno demais para disparar o budget do Q117 individualmente — o dashboard é o que torna essa
tendência visível.

## Mudou X ⇒ verifique Y

- Operação nova adicionada ao canvas de desenho (nova ferramenta, novo tipo de gesto) ⇒ ganha
  `performance.mark`/`measure` própria e um budget declarado antes de sair de protótipo, não
  depois de reportado como lento.
- `engine.ts` ou `free-drawing-cell.tsx` tocados de forma que mude a complexidade de uma
  operação existente (novo loop sobre elementos, nova estrutura de dados) ⇒ o budget do Q117
  precisa ser reavaliado, não só reexecutado — o número-alvo pode ter deixado de fazer sentido.
- Regressão aparecer no dashboard sem PR isolado que a explique ⇒ é o efeito cumulativo que o
  Q118 existe para detectar; investigar como uma questão própria, não descartar como ruído.
