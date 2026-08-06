# Sandbox — execução não confiável

Cobre as duas metades do mesmo problema: código de usuário executado no navegador (TSX via
iframe, Python via Pyodide, SQL via sql.js) e código de usuário compilado/executado no servidor
(`executor/sandbox.rs`, `bwrap`/`prlimit`). São modelos de ameaça diferentes — o dano do lado
cliente fica local ao navegador de quem executa; o do lado servidor é compartilhado entre
sessões — mas listados lado a lado para que a assimetria entre eles seja decisão, não acidente.

## Servidor: isolamento por camada, já simétrico entre linguagens 🔴

`compile_rust`, `compile_go`, `compile_zig` e `compile_cpp` rodam todos dentro do mesmo envelope
`bwrap` (`--unshare-all --die-with-parent --new-session`, bind read-only de `/usr` `/lib` `/bin`,
workspace da sessão montado em `/app`), decidido em Q106 e registrado em
[0006-sandbox-compile-symmetry](../decisions/0006-sandbox-compile-symmetry.md). `env_clear()`
remove o ambiente do processo servidor (`DATABASE_URL`, `JWT_SECRET` incluídos) antes de invocar
o compilador. `RunLimits` (`cpu_secs`, `mem_kb`, `wall_ms`) é aplicado por completo via `prlimit`
(`--cpu`, `--as`) e `timeout` do tokio — Q107.

Este é o lado de referência: qualquer garantia nova do lado cliente que pretenda ter paridade
com o servidor testa a hipótese contra este parágrafo primeiro.

## Cliente: Web Worker + timeout para TSX e Pyodide 🔴 (Q113)

Hoje nenhum dos dois roda isolado de tempo: `runTsxInSandbox` (`lib/sandbox/tsx-sandbox.ts`) só
isola via `iframe`, sem timeout; `runPythonInSandbox` (`lib/sandbox/python-sandbox.ts`) roda
`pyodide.runPythonAsync` direto na thread principal, sem limite algum — um `while True` do
usuário trava a aba.

Os dois passam a rodar em Web Worker, com `terminate()` disparado por timeout — o equivalente
de cliente ao `wall_ms` que o servidor já impõe via `prlimit`. sql.js (`stores/sql-db-store.ts`)
entra na mesma auditoria: se uma query do usuário puder rodar por tempo arbitrário, precisa do
mesmo tratamento.

## `allow-same-origin` é proibido no iframe TSX, para sempre 🔴 (Q114)

O iframe de preview hoje usa `sandbox="allow-scripts"` (`tsx-editor.tsx:51`). Isso é
correto **enquanto `allow-same-origin` nunca for adicionado** — a combinação dos dois anula o
isolamento: o conteúdo do iframe passa a poder acessar o DOM da página pai. Um teste de guarda
falha se essa combinação aparecer no atributo `sandbox` de qualquer iframe do editor.

A neutralização adicional de `window.parent` (`Object.defineProperty(window, 'parent', { get:
() => undefined })`, `tsx-sandbox.ts:69`) continua existindo como defesa em profundidade, não
como substituto do atributo correto.

## Rede: `esm.sh` no importmap do TSX é um gap conhecido, não fechado ⚪

`tsx-sandbox.ts:58-59` resolve `react`/`react-dom` via CDN em runtime, dentro do próprio
`iframeHtml`. Isso é rede irrestrita para o preview de TSX — fora do escopo desta etapa (nenhuma
Q fecha isso), mas registrado aqui para não ficar invisível: qualquer decisão futura de travar
o `sandbox.md` mais a fundo revisita este ponto primeiro.

## Paridade cliente↔servidor declarada com gaps explícitos 🟡 (Q115)

Toda garantia nova do lado servidor exige a mesma pergunta do lado cliente — mesmo que a
resposta seja "não se aplica, e é por isso":

| Garantia | Servidor | Cliente |
|---|---|---|
| Tempo (`wall_ms`/timeout) | `prlimit --cpu` + `timeout` do tokio | Worker + `terminate()` (Q113) |
| Memória | `prlimit --as` | **Gap aceito** — Worker não impõe teto de heap do V8/WASM; dano fica local à aba do próprio usuário |
| Rede | `env_clear()` remove credenciais; sem egress arbitrário do compilador | **Gap conhecido** — `esm.sh` no importmap do TSX (acima); Pyodide baixa pacotes por import |
| Filesystem | `bwrap` com bind read-only, workspace isolado por sessão | Não se aplica — não há filesystem real no navegador |
| Isolamento de processo | `--unshare-all --die-with-parent --new-session` | iframe `sandbox="allow-scripts"` (sem `allow-same-origin`, Q114) + Worker |

## Mudou X ⇒ verifique Y

- Novo campo em `RunLimits` (servidor) ⇒ atualizar a tabela de paridade acima; decidir e
  registrar o equivalente do lado cliente, mesmo que seja "gap aceito".
- Novo bloco executável no cliente (linguagem nova via WASM, por exemplo) ⇒ entra na mesma
  auditoria de Worker + timeout do Q113 antes de sair de protótipo.
- Import de CDN novo em qualquer sandbox de cliente ⇒ mesmo tratamento do gap de `esm.sh`
  documentado aqui — não adicionar silenciosamente.
- Atributo `sandbox` de iframe tocado em qualquer bloco ⇒ o teste de guarda do Q114 precisa
  continuar cobrindo esse iframe, não só o do TSX.
