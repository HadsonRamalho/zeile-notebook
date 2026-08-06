# Zeile — Padrões de código

**A partir da etapa 17, [docs/README.md](README.md) é o índice citável em review** — regra de
precedência, severidade, e a lista dos docs de `docs/architecture/`. Este documento continua
existindo como o índice por **tempo de vida** (o que muda quando):

| Arquivo | O que tem | Muda quando |
|---|---|---|
| [decisoes.md](decisoes.md) | catálogo Q1–Q109, citável por número em review | uma decisão nova é tomada |
| [plano-execucao.md](plano-execucao.md) | as etapas de entrega, encaixáveis e questões abertas | a cada entrega |
| [desktop-tauri.md](desktop-tauri.md) | o que a branch desktop muda no escopo de regra | enquanto a `tauri` não entrar na `main` |
| [decisions/](decisions/) | ADRs — Contexto/Alternativas/Decisão/Consequências/Status | uma decisão com alternativas reais é tomada |

As regras do Zeile são próprias e auto-contidas. `decisoes.md` é a origem delas; os docs
normativos de `docs/architecture/` são a redação final e a referência a citar em review.

O diagnóstico inicial do repositório, que motivou estas decisões, foi descartado ao ser
superado pela execução das etapas 1 a 6.

## Bibliotecas de terceiros adotadas como padrão

| Biblioteca | Uso | Decisão | Consulta |
|---|---|---|---|
| [`@catcherjs/core`](https://github.com/AfranioCaires/catcher) | Tratamento de erro no frontend via `Result<T, E>` (`ok`/`err`, `catchError`) | [Q109](decisoes.md#padronização-do-tratamento-de-erros-no-frontend) | skill `catcher` (`.claude/skills/catcher`) |
