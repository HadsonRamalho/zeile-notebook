# `lib/api/generated/`

Artefatos gerados a partir da superfície HTTP do `rust-server`. Nunca editar à mão — todo
arquivo aqui leva cabeçalho `@generated`. Regime completo em
[docs/decisoes.md#regime-do-artefato-gerado](../../../docs/decisoes.md#regime-do-artefato-gerado).

## `openapi-types.ts`

Gerado por `pnpm generate:openapi-types`, que:

1. Roda `cargo run --manifest-path rust-server/Cargo.toml -- export-openapi <tmp>` — o binário
   monta o `utoipa::OpenApi` já registrado em `rust-server/src/routes/docs.rs` e serializa em
   JSON, sem subir servidor nem tocar banco.
2. Passa o JSON pelo [`openapi-typescript`](https://openapi-ts.dev/), ferramenta de mercado (ver
   Q28 em `docs/decisoes.md` — por que gerador próprio não se justifica indo Rust → TypeScript).
3. Formata o resultado com `biome format` antes de escrever o arquivo.

`pnpm generate:openapi-types:check` regenera em memória e falha se divergir do arquivo
commitado — é o guard usado no CI.

### Mapeamento

| OpenAPI (Rust/utoipa) | TypeScript gerado |
|---|---|
| `paths` | `export interface paths` — uma entrada por rota, métodos como chaves opcionais |
| `components.schemas.<Nome>` | `export interface components["schemas"]["<Nome>"]` |
| `operationId` (nome da função `api_*`/`verify_*`) | chave em `operations["<operationId>"]` |
| `responses` por status | `responses[<status>]["content"]["application/json"]` |

### O que exige decisão humana

- Toda rota nova precisa do `#[utoipa::path(...)]` no handler **e** de entrar na lista `paths(...)`
  de `rust-server/src/routes/docs.rs` — o gerador só vê o que o `ApiDoc` declara.
- Todo tipo exposto como `body` de resposta precisa derivar `utoipa::ToSchema` e estar na lista
  `components(schemas(...))` do mesmo `ApiDoc`.

### Limitações conhecidas

- Rotas de WebSocket (`/notebook/ws/*`) não passam por aqui — não são operações HTTP com
  request/response único. Ver a seção `ws-message.ts` abaixo.

## `ws-message.ts` e `serde_json/JsonValue.ts`

Gerado por `pnpm generate:ws-types`, que roda
`cargo run --manifest-path rust-server/Cargo.toml -- export-ws-types <tmp>` — o binário chama
`WsServerMessage::export_all_to` e `WsClientMessage::export_all_to` ([ts-rs](https://github.com/Aleph-Alpha/ts-rs),
ferramenta de mercado pela mesma razão do Q28: TypeScript é mais expressivo que Rust no que
importa aqui) sobre os tipos anotados com `#[derive(ts_rs::TS)]` em
`rust-server/src/models/ws_message.rs`, e formata o resultado com `biome format`.

Cobre o que **não** passa por endpoint HTTP: o payload de texto das duas conexões WebSocket
(`/notebook/ws/presence/{id}` e `/notebook/ws/combined/{notebook_id}`) — `WsServerMessage` (o que o
servidor manda) e `WsClientMessage` (o que o cliente manda). O canal binário dessas mesmas conexões
carrega os frames de sync do Automerge (CRDT), que são binários por natureza e não têm shape JSON
para gerar.

O shape do **documento** Automerge (blocos, metadados, tipo de bloco) não tem gerador próprio: é
exatamente `Notebook`/`Block*`/`BlockMetadata` de `rust-server/src/models/notebook.rs`, os mesmos
tipos que os endpoints REST de conteúdo (`PUT /notebook/{id}/content`, `GET /notebook/{id}/full`)
devolvem — já cobertos por `openapi-types.ts`. Duplicar esses tipos aqui criaria duas fontes para a
mesma grafia, exatamente o que a regra "um conceito, uma grafia" (`docs/decisoes.md`) veda.

`pnpm generate:ws-types:check` regenera em memória e falha se divergir do que está commitado.

### O que exige decisão humana

- Todo tipo que deve aparecer aqui precisa de `#[derive(ts_rs::TS)]` **e** ser alcançável a partir
  de `WsServerMessage`/`WsClientMessage` (via `export_all_to`, que segue os tipos dos campos
  transitivamente) — adicionar um tipo novo sem ligá-lo a uma dessas duas raízes não gera nada.
- `WsClientMessage::Presence` carrega o cursor/estado de presença como `serde_json::Value` livre de
  propósito: hoje é o cliente que decide o formato, o servidor só retransmite. Um shape fixo aqui é
  trabalho futuro, não uma lacuna do gerador.

### Limitações conhecidas

- O `ApiDoc` do `openapi-types.ts` usa o estilo minimalista já praticado no repo: a maioria das
  respostas declara só o status, sem `body`. O TS gerado para essas rotas tipa a resposta como
  vazia — não é um bug do gerador, é reflexo de a anotação Rust não declarar o schema.
