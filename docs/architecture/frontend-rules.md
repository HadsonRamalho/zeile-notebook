# Organização do frontend

## `features/` vs pastas de topo 🔴

`features/<domínio>/` reúne `components/`, `hooks/` e `types/` co-locados. Sete features
existem hoje: `notebook`, `challenges`, `admin`, `home`, `notifications`, `settings`, `auth`.
`components/` no topo passa a ser só o genuinamente compartilhado: `ui/`, `layout/`, `nav/`,
`vendor/`.

As pastas de topo (`types/`, `domain/`, `stores/`, `context/`, `hooks/`) e as features se
sobrepõem em um ponto — a linha divisória:

| Pasta de topo | Fica lá quando | Vai para a feature quando |
|---|---|---|
| `types/` | é o contrato **gerado** (`lib/api/generated/`) ou tipo usado por 2+ features | é tipo de UI só daquela feature |
| `domain/` | a lógica pura serve 2+ features — `permissions/engine.ts` é o caso claro (permissão é transversal) | serve uma só — `drawing-scene.ts` e `free-drawing/engine.ts` pertencem a `features/notebook/` |
| `stores/` | store de runtime compartilhado (`pyodideStore`, `sqlDbStore`, `typstStore`) — cache de módulo WASM, não estado de feature | — |
| `context/` | auth e tema | contexto de domínio de uma feature vai para dentro dela (`notebook-context` está em `features/notebook/`) |
| `hooks/` | hook de plataforma (`use-online-status`, `use-is-touch-device`, `use-install-prompt`) | hook de domínio (`use-automerge-sync`, `use-presence`, `use-comments`) vai para a feature |

Acoplamento cross-feature que já existia antes da reorganização (só ficava invisível com tudo
plano) tem destino próprio, não fica em nenhuma das duas pastas por padrão:
`chat-conversation` (notebook + settings) → `components/chat/`; `DifficultyBadge` (notebook +
challenges) → `components/challenges/`; lógica pura compartilhada entre notebook e challenges
→ `domain/challenges/`.

## `lib/` é infraestrutura sem estado e sem React 🔴

Qualquer coisa que tenha estado React ou dependa de contexto de componente não é `lib/`. O
critério de saída de `lib/` para o topo já está na tabela acima (`types/`, `domain/`, `stores/`,
`context/`). Violação a evitar: tipo de domínio importando de componente de UI — aconteceu com
`lib/types.ts` importando `@/components/banner`; a correção certa é inverter a dependência
(o componente importa o tipo, nunca o contrário).

## `components/vendor/` 🔴

Código vendorizado (`skiper-ui/`, `animate-ui/`) é declaradamente isento de i18n, de
comentário, de tamanho de arquivo e de naming — não é código seu, é código de terceiro
mantido localmente. Precisa de `README.md` com origem, versão, e o que foi modificado
localmente, para que dê para saber se ainda cabe atualizar da fonte ou se já divergiu demais.

## Fronteiras de import, por lint 🔴

Sem enforcement automático, `features/` é nome de pasta, não fronteira — é o tipo de violação
que review humano não pega (o import fica no topo do arquivo, a atenção do revisor vai para o
meio). O `biome.json` proíbe, via `noRestrictedImports`:

- `types/`, `domain/` e `lib/` → `components/` ou `features/` (infraestrutura não depende de UI)
- `components/ui/` → `features/` (componente compartilhado não depende de feature específica)
- `features/a/` → `features/b/` (uma feature não importa de outra direto; o compartilhamento
  passa por `domain/`, `lib/` ou `context/`)

Ao cruzar pasta de topo, o import usa `@/` — path relativo só entre vizinhos na mesma pasta.

## `noExplicitAny: error` 🔴

Zero `any` tolerado. `lib/api/base.ts` é o ponto de maior retorno da regra: é a borda por onde
toda resposta HTTP entra na aplicação. Uso legítimo de tipo externo sem tipagem própria
(Babel no browser, Pyodide) vira interface mínima local, não `any` suprimido.

## `tsconfig.json` estrito 🔴

Quatro flags, todas ligadas: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`.

`exactOptionalPropertyTypes` é o par TypeScript da distinção que o Rust já faz com
`Option<Option<T>>` — "campo ausente" ≠ "campo presente e `null`". `noFallthroughCasesInSwitch`
importa porque todo `switch` sobre um enum de bloco (`block-content.tsx`) precisa acusar
compilação quando um valor novo é adicionado ao enum sem tratamento — ver a seção
"mudou X ⇒ verifique Y" de [contracts.md](contracts.md).

## Console 🟡

`console.log` proibido; `console.warn`/`console.error` permitidos. Motivo direto: o Zeile não
regula PII em log (ver [security.md](security.md)) e conteúdo de notebook do usuário aparecendo
em `console.log` do devtools é exposição desnecessária. `scripts/**` é isento — é ferramenta de
build, não código de produto.

## Mudou X ⇒ verifique Y

- Novo diretório de topo (`stores/`, `context/`, etc.) ganha um arquivo ⇒ confira contra a
  tabela de fronteira antes de decidir se pertence lá ou dentro de uma feature.
- Feature nova criada ⇒ o `biome.json` precisa da entrada de `noRestrictedImports` negando
  import de outras features, senão a fronteira não é enforçada para ela.
- Enum de bloco ganha valor novo ⇒ `noFallthroughCasesInSwitch` acusa todo `switch` que não
  trata o valor novo; não silencie com `default` genérico.
