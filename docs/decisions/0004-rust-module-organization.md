# 0004 — Organização do Rust: raiz por módulo, não por camada

## Contexto

`models/notebook.rs` chegou a 1175 linhas misturando struct Diesel, DTO de request/response e
regra de negócio no mesmo arquivo, sem separação de responsabilidade. `controllers/websocket.rs`
tinha o mesmo problema em 1020 linhas. O catálogo (Q47/Q48) já tinha decidido **que** camadas
existiriam — controller fino, serviço de negócio e autorização, acesso a banco isolado, DTO
separado da entidade — mas deixou aberta a raiz de diretório: por camada ou por módulo.

## Alternativas

1. **Por camada**: `services/`, `repositories/`, `dto/` no topo de `src/`, cada um com um
   arquivo por domínio dentro (`services/notebook.rs`, `repositories/notebook.rs`, …). Mais
   próximo da estrutura que já existia (`controllers/`, `models/` já eram pastas por camada).
   Rejeitada: alterar uma rota de notebook abre até cinco diretórios diferentes; o que muda
   junto (regra de negócio de notebook, acesso a banco de notebook, DTO de notebook) fica
   espalhado por arquivos que só se relacionam pelo nome do arquivo, não pela pasta.
2. **Por módulo**: `domain/<nome>/{controller,service,repository,dto,entity}.rs`. O nome do
   domínio é a pasta; a camada é o nome do arquivo dentro dela.

## Decisão

Alternativa 2. `domain/notebook/` foi o primeiro módulo migrado — mesmo arquivo de 1175 linhas
citado no diagnóstico original — e serviu de prova de conceito para os extractors (`AuthUser`,
`DbConn`) e o layer `require_permission(...)`, que hoje são infraestrutura reaproveitável por
qualquer domínio, não específica de notebook.

## Consequências

- `Notebook` (entidade Diesel) deixou de ser serializado como resposta de API direta;
  `NotebookDto` é a fronteira nova, e `lib/api/generated/openapi-types.ts` foi regenerado a
  partir dela — ver [contracts.md](../architecture/contracts.md).
- `require_permission(...)` como layer corrige por construção um bug que existia em
  `api_get_single_notebook`: buscava o notebook no banco antes de checar se o usuário tinha
  permissão para vê-lo. A ordem errada deixa de ser possível representar.
- **Migração incremental, não big-bang**: só `notebook` está em `domain/` até este documento;
  os ~15 domínios restantes de `controllers/`/`models/` (team, user, chat, challenge, etc.)
  migram um PR por domínio, repetindo o padrão aqui estabelecido — não fica pendente
  indefinidamente, mas também não bloqueia entrega em lote.
- Entregue como stack de PRs dependentes (extractors → layer de permissão → migração do
  domínio), porque o layer já usa os extractors e a migração já usa o layer — nenhum dos três
  é revisável isolado do anterior.

## Status

Aceita.
