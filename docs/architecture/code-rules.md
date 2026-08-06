# Naming, tamanho e granularidade

## Naming 🔴

- **kebab-case + sufixo de papel** para todo arquivo: `-service`, `-types`, `-schema`,
  `-store`, `-context`, e `use-` para hook. `forceConsistentCasingInFileNames` está ligado no
  `tsconfig.json` — casing errado quebra em CI mesmo em máquina case-insensitive.
- **camelCase em função exportada**, PascalCase reservado para componente React e classe.
  `RunTsxInSandbox` → `runTsxInSandbox` é o exemplo histórico do repo.
- **Sem prefixo `I` em interface.** `Block`, `Notebook`, `Team` — não `IBlock`.
- **Um conceito, uma grafia**, entre TypeScript e Rust. Ver a regra completa e o enforcement
  automático em [contracts.md](contracts.md) — nasceu ali porque o caso raiz é o campo gerado a
  partir do `serde`, mas a proibição vale para naming em geral: nenhuma função, adaptador ou
  tipo deve conviver com duas grafias do mesmo campo.

## Tamanho 🟡 função / ⚪ arquivo

- 🟡 **Função com mais de 50 linhas** é candidata a quebra — corrigir quando o arquivo for
  tocado, não abrir PR só para isso.
- ⚪ **Arquivo com mais de 400 linhas** é sugestão de quebra, não bloqueio. Arquivo de terceiro
  em `components/vendor/*` está isento (Q21).

Nenhuma das duas é um número absoluto: existe para sinalizar "olhe aqui", não para travar CI.
Os maiores arquivos do repo no momento em que a regra foi escrita —
`free-drawing-cell.tsx` (1966 linhas), `layouts-canvas-tools.tsx` (1041),
`models/notebook.rs` (1175), `controllers/websocket.rs` (1020) — não foram quebrados só por
tamanho; quebraram por responsabilidade quando a etapa que os tocava (features/, camadas do
Rust) passou por eles. `skiper26.tsx` (1217, vendor) segue isento.

## Um componente público por arquivo 🟡

Um arquivo `.tsx` exporta **um** componente. Subcomponentes privados, usados só ali, podem
morar no mesmo arquivo sem exportação — `free-drawing-cell.tsx` é a referência: exporta
`FreeDrawingCell`, os internos (`ToolButton`, `BrushPalette`, `LayerRow`, …) ficam privados no
mesmo arquivo.

## Tipos agrupados por domínio coeso 🟡

Tipo fica junto do domínio a que pertence — nem um arquivo `types.ts` genérico por feature nem
um arquivo por tipo. `types/notebook-types.ts` e `types/team-types.ts` são a referência. O mau
exemplo histórico do repo era `lib/types.ts`: 20 definições de 3 domínios diferentes,
**importando de `components/`** (violação de fronteira, resolvida junto — ver
[frontend-rules.md](frontend-rules.md)).

## Mudou X ⇒ verifique Y

- Arquivo novo ⇒ nome em kebab-case com o sufixo certo; se exporta componente, é o único
  componente público do arquivo.
- Struct Rust ganha `#[serde(rename)]` campo a campo ⇒ pare — é sinal de "um conceito, uma
  grafia" sendo violado; a decisão de casing é de `rename_all` no struct, nunca campo a campo.
- Função passando de ~50 linhas no PR atual ⇒ considere quebrar antes de abrir o PR, não depois.
