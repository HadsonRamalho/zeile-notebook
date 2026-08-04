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

- O `ApiDoc` atual usa o estilo minimalista já praticado no repo: a maioria das respostas declara
  só o status, sem `body`. O TS gerado para essas rotas tipa a resposta como `unknown`/vazia — não
  é um bug do gerador, é reflexo de a anotação Rust não declarar o schema.
- Rotas de WebSocket (`/notebook/ws/*`) não passam por aqui — não são operações HTTP com
  request/response único. Ver `lib/api/generated/README.md` da seção ts-rs/typeshare para esse caso.
