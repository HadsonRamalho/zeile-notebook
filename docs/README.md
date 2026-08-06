# Zeile — Documentação normativa

Índice dos documentos que regem como o código do Zeile é escrito. Cada um cobre um tema;
juntos, são a redação final das decisões registradas em [decisoes.md](decisoes.md).

## Regra de precedência

**A regra documentada vence o padrão do arquivo vizinho.** Se o código em volta viola uma
regra, siga a regra — não imite a violação. Um mau exemplo presente no contexto não autoriza
reproduzi-lo.

Quando dois documentos parecem se sobrepor, o mais específico ao tema vence (ex.: `contracts.md`
sobre casing de campo gerado vence `code-rules.md` sobre naming genérico).

## Severidade

Toda regra nasce com um nível:

- 🔴 **bloqueante** — falha de review ou de CI; não se mescla enquanto viola.
- 🟡 **corrigir** — não bloqueia o PR atual, mas é dívida declarada; corrige-se na próxima vez
  que o arquivo for tocado.
- ⚪ **sugestão** — preferência registrada, sem enforcement.

## Índice

| Documento | Tema |
|---|---|
| [padroes.md](padroes.md) | Índice histórico por tempo de vida do documento (catálogo, plano, docs desktop) |
| [decisoes.md](decisoes.md) | Catálogo Q1–Q109, citável por número em review — a origem de tudo abaixo |
| [plano-execucao.md](plano-execucao.md) | As etapas de entrega e o que ainda está aberto |
| [permissions-design.md](permissions-design.md) | Design do modelo de permissões: catálogo, grants, motor de avaliação |
| [desktop-tauri.md](desktop-tauri.md) | O que a versão desktop (Tauri) muda no escopo de regra |
| [decisions/](decisions/) | ADRs — Contexto / Alternativas / Decisão / Consequências / Status, para decisões com alternativas reais |
| [architecture/comment-guide.md](architecture/comment-guide.md) | Quando comentar, em que idioma, como referenciar coisa externa |
| [architecture/code-rules.md](architecture/code-rules.md) | Naming, tamanho de arquivo/função, um componente por arquivo, "um conceito uma grafia" |
| [architecture/frontend-rules.md](architecture/frontend-rules.md) | `features/` vs pastas de topo, fronteiras de import, lint e tsconfig estritos |
| [architecture/rust-rules.md](architecture/rust-rules.md) | Camadas do backend, extractors, erro estruturado, clippy |
| [architecture/contracts.md](architecture/contracts.md) | Fronteira Rust → TypeScript, regime do artefato gerado, casing |
| [architecture/database.md](architecture/database.md) | Migrations, seeds, `timestamptz`, índices |
| [architecture/security.md](architecture/security.md) | Variáveis de ambiente e segredos, CORS, rate limit, erro sem vazamento |
| [architecture/operability.md](architecture/operability.md) | Health checks, shutdown gracioso, timeouts, idempotência |
| [architecture/testing.md](architecture/testing.md) | Quando uma suíte é obrigatória e como ela deve ser escrita |
| [architecture/i18n.md](architecture/i18n.md) | Tradução: ICU, chaves estáticas, isenções, os três checks de CI |
| [architecture/env-vars.md](architecture/env-vars.md) | Toda variável de ambiente do projeto, pública/secreta, obrigatória/opcional |
| [architecture/crdt.md](architecture/crdt.md) | Automerge: checkpoint × snapshot × history, migração de shape, conflito concorrente |
| [architecture/sandbox.md](architecture/sandbox.md) | Isolamento de execução não confiável, cliente e servidor, e a paridade entre os dois |
| [architecture/performance.md](architecture/performance.md) | O que medir em canvas/render, budget e onde a métrica vive |
| [architecture/a11y.md](architecture/a11y.md) | Foco, navegação por teclado, contraste, aria — e onde a regra deliberadamente não se aplica |
| [architecture/desktop.md](architecture/desktop.md) | Capacidade como fonte única, empacotamento, assinatura, versionamento do desktop |

## "Mudou X ⇒ verifique Y"

Cada doc de `architecture/` termina com uma seção curta apontando os pontos de acoplamento
reais do Zeile — o que mais tocar quando aquele tema muda. Existe para compensar a ausência
deliberada de checklist de revisão automatizada por subagente (Q90): em vez de um agente lendo
o diff, um humano lê a seção certa.
