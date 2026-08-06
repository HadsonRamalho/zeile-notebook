# Fronteira Rust → TypeScript

## Rust é a fonte de verdade 🔴

Dois mecanismos geram o contrato do lado TypeScript a partir do Rust, nunca o contrário:

- **`openapi-typescript`** sobre o OpenAPI que o `utoipa` monta em memória (`cargo run --
  export-openapi`, sem subir servidor) — cobre a superfície HTTP inteira: modelos **e**
  paths/métodos/status. Saída: `lib/api/generated/openapi-types.ts`.
- **`ts-rs`/`typeshare`** para o que não passa por endpoint HTTP: payload de WebSocket
  (`WsServerMessage`/`WsClientMessage`, de `models/ws_message.rs`) e o shape do documento
  Automerge (já coberto por `Notebook`/`Block*` via `openapi-types.ts`).

A direção é Rust → TypeScript porque o TypeScript é mais expressivo exatamente onde importa
aqui — union type, campo opcional, literal type — então gerar nessa direção não perde
informação. TS → Rust perderia genéricos e não alcançaria regra de validação declarada em
código; não é o caso do Zeile.

## Regime do artefato gerado 🔴

Vale para todo gerador do projeto — o contrato Rust→TS acima, `rust-server/src/schema.rs`
(Diesel) e qualquer gerador futuro. Oito propriedades obrigatórias:

1. **Três passes sem vazamento entre eles**: configuração declarativa (o que atravessa) → passe
   de análise (fonte → representação intermediária, sem conhecer a sintaxe de destino) → passe
   de emissão (representação → texto, sem tocar a fonte). A saída é função determinística da
   representação intermediária — é isso que viabiliza a comparação byte-a-byte do item 3.
2. **O gerado é commitado.** O diretório de saída é apagado e reescrito a cada execução, com
   detecção de arquivo órfão (existe e não é mais gerado ⇒ reportado como divergência).
3. **Modo `--check`** que regenera em memória e falha listando os arquivos divergentes, com a
   instrução de correção na própria mensagem ("rode `generate:*` e commite"). É o guard de CI.
4. **O output passa pelo formatador do destino antes de commitar** — `biome format` para `.ts`
   gerado, `rustfmt` para `.rs` gerado. Sem isso o formatador e o guard de drift discordam.
5. **Allowlist em configuração, nunca edição do gerado.** Ampliar o que atravessa é mudança de
   config revisada em PR. Todo arquivo gerado leva cabeçalho `@generated`.
6. **Workflow de CI dedicado, filtrado por `paths`** — o grafo de dependências do TypeScript não
   cruza para `rust-server/`, então um workflow comum nunca dispararia só com mudança no Rust.
7. **O gerador tem teste de regressão próprio** — é código de produção, define o contrato.
8. **README com tabela de mapeamento**, o que exige decisão humana, e limitações conhecidas —
   ser explícito sobre o que o gerador *não* infere evita confiança indevida no artefato.
   `lib/api/generated/README.md` é a referência.

As quatro allowlists cobertas hoje: DTOs de request/response, enums de domínio, catálogo de
`errorCode`, chaves de permissão.

## `errorCode` é contrato aditivo 🔴

`errorCode` nunca é traduzido no backend, é só aditivo (nunca removido nem renomeado — sob a
política de versão de [0001-contract-version-policy](../decisions/0001-contract-version-policy.md)),
e todo `#[utoipa::path]` que devolve erro reflete o tipo Rust real via `request_body`/`body`.
`app/api/*/route.ts` (rotas de servidor do Next) devolve o mesmo formato `{code, message,
details}` — acaba com dois contratos de erro dentro da mesma aplicação.

`ApiError::ALL_ERROR_CODES` é travado por teste com `match` exaustivo — variante nova em
`ApiError` sem `errorCode` correspondente quebra a suíte, não o cliente em produção. O terceiro
check do Q45 ([i18n.md](i18n.md)) fecha a outra ponta: todo `errorCode` gerado precisa de chave
de tradução nos dois locales, senão o usuário vê o código cru na tela.

## Casing: camelCase no fio 🔴

Todo struct serializado para o cliente leva `#[serde(rename_all = "camelCase")]` — nunca
`#[serde(rename = "…")]` campo a campo. `#[serde(alias = "<snake>")]` é aceito **só na
entrada**, durante a janela de transição, com prazo de remoção amarrado à
[política de versão de contrato](../decisions/0001-contract-version-policy.md).

Fora do escopo desta regra: enum de valor de domínio (`BlockType`, `GrantEffect`, `Tier`) — é
casing de **variante**, não de campo; JWT (`Claims`, `ResetClaims`, `StateClaims`) e espelho de
API externa (`GithubUser`, `GoogleUser`) — não são contrato nosso.

### "Um conceito, uma grafia" 🔴

Um campo não existe em duas grafias — não no fio, não no tipo gerado, não no código do cliente.
Um conceito tem exatamente um nome; diferença de casing não cria um segundo campo. A regra veda,
especificamente:

1. `#[serde(rename)]` campo a campo para fazer casing — casing é decisão de `rename_all` no
   struct inteiro, nunca de campo.
2. Dois structs do mesmo domínio com `rename_all` divergente.
3. Tipo TS com as duas grafias como campos distintos, ou o mesmo campo redeclarado em interface
   derivada.
4. Adaptador que traduz grafia e mantém as duas vivas — se existe uma função mapeando
   `user_id → userId`, ela é dívida, não solução; o `serde` já resolve isso na origem.
5. O `alias` da transição de casing virar campo no tipo **gerado** — `alias` é exclusivamente
   entrada; se aparecer no artefato gerado, o gerador está errado.

**Enforcement**: o `--check` do regime de artefato gerado (item 3 acima) afirma que nenhum par
de campos do artefato gerado normaliza para o mesmo identificador
(`scripts/check-no-duplicate-fields.mjs`). Falha de guard, não de review.

## Enum de bloco sincronizado 🔴

O Rust (Postgres) e o TypeScript compartilham a mesma lista de 14 valores de `block_type`.
Adicionar um tipo de bloco novo exige, na mesma entrega: migration
(`ALTER TYPE block_type_enum ADD VALUE IF NOT EXISTS`), variante no enum Rust, regeneração do
tipo TS, e tratamento no `switch` de `block-content.tsx` —
`noFallthroughCasesInSwitch` ([frontend-rules.md](frontend-rules.md)) acusa esse último ponto
automaticamente.

## Mudou X ⇒ verifique Y

- `#[utoipa::path]` novo ou alterado ⇒ `pnpm generate:openapi-types`, commitar o diff.
- `models/ws_message.rs` ou `ChatMessage` mudou ⇒ `pnpm generate:ws-types`.
- `ApiError` ganha variante ⇒ `pnpm generate:error-codes` + chave nos dois locales do Q45.
- Migration adiciona coluna/tabela nova ⇒ `diesel print-schema` para `schema.rs`,
  `scripts/check_schema.sh` confirma.
- Enum de bloco muda ⇒ migration, enum Rust, tipo gerado, `switch` de `block-content.tsx` —
  ver a seção acima.
