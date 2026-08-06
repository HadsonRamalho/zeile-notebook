# 0005 — Fronteira entre `features/` e as pastas de topo

## Contexto

O frontend tinha quatro critérios concorrentes decidindo o que ia em `components/`: domínio,
camada, biblioteca, tela — nenhum vencia consistentemente, e a pasta `interface/` existia como
válvula de escape para o que não se encaixava em nenhum. `lib/hooks/` misturava hook de
plataforma com hook de domínio de notebook. Contexto de feature vivia em três casas diferentes:
`context/`, `lib/*-context.tsx`, `components/notebook/notebook-context.tsx`.

Depois de decidir que `features/<domínio>/` existiria (Q20) e que `lib/` seria só
infraestrutura sem estado e sem React (Q24), sobrou um ponto de sobreposição real: tipo,
lógica pura, store, contexto e hook podem legitimamente pertencer a uma feature específica **ou**
a uma pasta de topo compartilhada — e as duas decisões, sozinhas, não diziam qual.

## Alternativas

1. **Tudo que uma pasta de topo já aceitava continua na pasta de topo** — `types/`, `domain/`,
   `stores/`, `context/`, `hooks/` recebem qualquer coisa do respectivo tipo, sem exceção.
   Rejeitada: mantém `notebook-context` fora de `features/notebook/` mesmo sendo
   inequivocamente específico dela, e não dá destino a `use-automerge-sync` (só faz sentido
   dentro do domínio de notebook).
2. **Critério de "serve 2+ features" decide a pasta de topo; serve uma só, vai para a
   feature.** Explícito por pasta, com exemplo nomeado de cada lado.

## Decisão

Alternativa 2, na tabela abaixo — reproduzida também em
[frontend-rules.md](../architecture/frontend-rules.md#features-vs-pastas-de-topo):

| Pasta de topo | Fica lá quando | Vai para a feature quando |
|---|---|---|
| `types/` | contrato **gerado** ou tipo usado por 2+ features | tipo de UI só daquela feature |
| `domain/` | lógica pura serve 2+ features (`permissions/engine.ts`) | serve uma só (`drawing-scene.ts`, `free-drawing/engine.ts` → notebook) |
| `stores/` | cache de módulo WASM compartilhado (`pyodideStore`, `sqlDbStore`, `typstStore`) | — (nenhum store de feature identificado até agora) |
| `context/` | auth e tema | contexto de domínio (`notebook-context` → notebook) |
| `hooks/` | hook de plataforma (`use-online-status`, `use-is-touch-device`) | hook de domínio (`use-automerge-sync`, `use-presence`, `use-comments` → notebook) |

## Consequências

- Mover as árvores de diretório para valer essa fronteira expôs quatro acoplamentos
  cross-feature que já existiam e ficavam invisíveis com tudo em `components/`/`lib/` plano:
  `chat-conversation` (notebook + settings) foi para `components/chat/`; `DifficultyBadge`
  (notebook + challenges) para `components/challenges/`; `languageLabel`/`verdictTone` (lógica
  pura, notebook + challenges) para `domain/challenges/`; `queueRequest` (usado por
  `lib/api/base.ts`, que é infra, não feature) voltou de `features/notebook/lib/` para
  `lib/background-sync.ts`.
- `SolveEditor`, `VerdictBadge`, `LeaderboardTable`, `SubmissionResults` eram consumidos só pelo
  bloco de challenge dentro do notebook — foram para
  `features/notebook/components/blocks/challenge/`, não para `features/challenges/`, porque o
  critério é "quem consome", não "de que domínio o nome sugere que é".
- Fronteira enforçada por lint (`noRestrictedImports` no `biome.json`) — sem isso a tabela seria
  preferência de estilo, não regra; ver [frontend-rules.md](../architecture/frontend-rules.md).
- Foi o maior diff do plano de execução: 189 componentes, 10 hooks, 3 contexts movidos.

## Status

Aceita.
