# Zeile — Padrões de código

Este documento é o índice. O conteúdo está dividido por tempo de vida:

| Arquivo | O que tem | Muda quando |
|---|---|---|
| [decisoes.md](decisoes.md) | catálogo Q1–Q107, citável por número em review | uma decisão nova é tomada |
| [plano-execucao.md](plano-execucao.md) | as 18 etapas, encaixáveis e questões abertas | a cada entrega |
| [desktop-tauri.md](desktop-tauri.md) | o que a branch desktop muda no escopo de regra | enquanto a `tauri` não entrar na `main` |
| [publicacao.md](publicacao.md) | o que decidir antes de abrir o repositório | até o repositório virar público |

**Regra de precedência, que abre todos os docs normativos:** a regra documentada vence o padrão
do arquivo vizinho. Se o código em volta viola uma regra, siga a regra — não imite a violação.
Um mau exemplo presente no contexto não autoriza reproduzi-lo.

As regras do Zeile são próprias e auto-contidas. `decisoes.md` é a origem delas; os docs
normativos de `docs/architecture/` (listados na etapa 17 do plano) são a redação final, e
passam a ser a referência a citar em review quando existirem.

O diagnóstico inicial do repositório, que motivou estas decisões, foi descartado ao ser
superado pela execução das etapas 1 a 6.
