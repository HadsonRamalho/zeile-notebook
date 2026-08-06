# 0002 — O servidor não decide texto de UI ao criar notebook

## Contexto

`api_create_notebook`, `api_create_team_page` e `api_clone_notebook` decidiam o título do
notebook novo e o conteúdo do bloco inicial: `"Nova Página"`, `"Novo Bloco"`,
`"# Notas\nComece a editar..."` — sempre em pt-BR, hardcoded no Rust. Um usuário com locale
`en` criava notebook com título em português, porque o servidor não sabia (e não tinha meio de
saber) o locale de quem pediu.

O catálogo de decisões (Q43) registrou o problema e deixou duas alternativas abertas para esta
ADR.

## Alternativas

1. **O servidor devolve `title: null`, a UI resolve.** O cliente decide o texto de fallback a
   mostrar quando o título é nulo, em todo lugar que lista ou abre um notebook. Motivo de
   rejeição: multiplica o ponto de decisão — lista de notebooks, breadcrumb, aba do navegador,
   busca — cada um precisaria saber renderizar "sem título" no locale certo, e o dado gravado
   no banco fica `null` para sempre até o usuário renomear.
2. **O cliente manda o título e o conteúdo do bloco inicial já traduzidos**, no corpo da
   requisição. O servidor grava exatamente o que recebeu, sem decidir nada. Assinatura de
   `createNotebook`, `createTeamPage` e `cloneNotebook` muda para aceitar o payload.

## Decisão

Alternativa 2. `CreateNotebookRequest` (título, título do bloco, conteúdo do bloco) e
`CloneNotebookRequest` (título) passam a ser o corpo das três rotas. O frontend resolve os
valores via `useTranslations("notebook_defaults")` antes de chamar o serviço — a mesma chave
serve para notebook pessoal, página de time e clone (`"Cópia de \"{title}\""`, interpolando o
título do original).

Ficou fora do escopo: notebooks já criados com pt-BR gravado no banco antes desta mudança
continuam com o título antigo — não há migração de dado, porque o título já é editável pelo
usuário e reescrever em massa arriscaria sobrescrever um título que o usuário já personalizou.

## Consequências

- `createNotebook`/`createTeamPage`/`cloneNotebook` (frontend) e os três handlers Rust
  correspondentes têm assinatura nova, aditiva no payload — quebra qualquer chamador que não
  passe os campos novos (nenhum resta no frontend próprio; um cliente externo teria que
  atualizar).
- O servidor deixa de ter qualquer string de UI hardcoded nesses três handlers — consistente
  com a regra geral de [i18n.md](../architecture/i18n.md).
- O texto continua existindo só em `messages/{locale}.json`, nunca duplicado no Rust — reduz a
  chance de os dois lados divergirem (compare com a categoria de bug que motivou "um conceito,
  uma grafia" em [contracts.md](../architecture/contracts.md), mesmo não sendo o mesmo
  mecanismo).

## Status

Aceita.
