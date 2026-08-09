# `lib/api/generated/`

Artefatos gerados a partir da superfície HTTP do `rust-server`. Nunca editar à mão — todo
arquivo aqui leva cabeçalho `@generated`. Regime completo em
[docs/decisoes.md#regime-do-artefato-gerado](../../../docs/decisoes.md#regime-do-artefato-gerado).

## Allowlist (Q28c/Q31) — o que atravessa a fronteira Rust → TS

Quatro categorias cruzam hoje, cada uma com seu próprio mecanismo de allowlist — ampliar o que
atravessa é sempre mudança de **config**, revisada em PR, nunca edição do arquivo gerado:

| Categoria | Allowlist | Mecanismo |
|---|---|---|
| DTOs de request/response | `components(schemas(...))` em `rust-server/src/routes/docs.rs` | `openapi-types.ts` — só o que está listado ali entra no `components.schemas` do OpenAPI |
| Payload de WebSocket | as raízes `WsServerMessage`/`WsClientMessage` em `rust-server/src/models/ws_message.rs` | `ws-message.ts` — `export_all_to` segue os campos a partir dessas duas raízes |
| Catálogo de `errorCode` | `ApiError::ALL_ERROR_CODES` em `rust-server/src/models/error.rs`, com teste que trava se divergir de `ApiError::error_code()` | `error-codes.ts` |
| Chaves de permissão | `sec/catalog/*` em `rust-server/src/sec/catalog/`, snapshot em `contracts/permission-catalog.json` (`UPDATE_PERMISSION_CATALOG_SNAPSHOT=1` regenera) | consumido hoje pela suíte de paridade TS↔Rust (`lib/permissions/engine.test.ts`), ainda não por um gerador de constantes — abertura registrada em Q31 |

Enums de domínio (`BlockType`, `Language`, `GrantEffect`, `GrantTargetKind`, `GrantSubjectKind`,
`UserRole`, `AuthProvider`) não têm allowlist própria: eles só existem no artefato gerado por
aparecerem como campo de algum DTO já listado em `components(schemas(...))` — não há como um enum
de domínio atravessar sem que um DTO already-allowlisted o referencie.

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

## `error-codes.ts`

Gerado por `pnpm generate:error-codes`, que roda `cargo run -- export-error-codes <tmp>` e formata
o array com `biome format`. A fonte é `ApiError::ALL_ERROR_CODES` em
`rust-server/src/models/error.rs` — uma constante mantida ao lado do `match` de
`ApiError::error_code()`, travada por `all_error_codes_matches_every_variant` (um `match` sem
wildcard sobre todas as variantes: adicionar uma variante nova sem atualizar o teste não compila).

### O que exige decisão humana

- Toda variante nova de `ApiError` precisa de uma entrada em `ALL_ERROR_CODES` — o teste
  `all_error_codes_matches_every_variant` força isso, mas é o autor do PR que escreve o código
  estável (`SCREAMING_SNAKE_CASE`), nunca o gerador.

### Estado de consumo

- `app/api/*/route.ts` consome `ErrorCode` via `routeError()` (`lib/api/route-error.ts`) desde o
  Q32 (etapa 11).
- `lib/api/handle-api-error.ts` **não** importa `ErrorCode`: `ApiClientError.code` é `string`
  porque cobre também `"UNKNOWN_ERROR"` (erro de rede, parse, ou qualquer código fora do catálogo)
  e é usado como chave de tradução — tipar como `ErrorCode` exigiria um cast no ponto de uso sem
  ganho de segurança real.
