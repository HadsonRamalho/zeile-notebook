# Backend Rust

## Três camadas, raiz por módulo 🔴

Cada domínio vive em `domain/<nome>/`, com cinco arquivos por responsabilidade:

```
domain/notebook/
  controller.rs   # extrai request, chama o service, mapeia resposta — fino
  service.rs       # regra de negócio e autorização
  repository.rs    # acesso a banco isolado
  dto.rs           # request/response — nunca o struct Diesel
  entity.rs        # struct Diesel
```

A alternativa considerada era organizar por **camada** (`services/`, `repositories/`, `dto/`,
cada um com um arquivo por módulo dentro). A raiz por módulo venceu porque mantém junto o que
muda junto — alterar uma rota de notebook não abre cinco diretórios diferentes. `notebook` é o
domínio de referência (era `models/notebook.rs`, 1175 linhas, antes da quebra); os ~15 domínios
restantes de `controllers/`/`models/` migram para este padrão incrementalmente, um PR por
domínio.

`entity.rs` (struct Diesel) **nunca** é serializado como resposta de API direta — `dto.rs` é a
fronteira exposta ao cliente, e é exatamente onde o gerador do contrato (Q28,
[contracts.md](contracts.md)) precisa olhar.

## Extractors + permissão declarada na rota 🔴

`AuthUser` e `DbConn` são extractors do Axum — elimina as duas linhas de boilerplate
(extrair claim do JWT, obter conexão do pool) repetidas em cada handler.
`require_permission(...)` é um layer aplicado por rota, checado **antes** do handler correr —
conserta por construção o bug histórico de `api_get_single_notebook`, que buscava o recurso no
banco antes de checar se o usuário tinha permissão para vê-lo.

O alvo da permissão depende do path param da rota e do `TargetCtx` (5 níveis:
`global`/`team`/`notebook`/`block_type`/`block`) — o layer extrai isso da rota, não do handler.

## Erro estruturado 🔴

- **Mapear erro do Diesel pela causa real**, não por um catch-all: `UniqueViolation` → 409,
  `NotFound` → 404, `ForeignKeyViolation` → 400, cada um com `errorCode` próprio. Sem isso,
  qualquer violação de constraint (ex.: slug público duplicado) cai em 500 genérico vazando o
  nome da constraint ao cliente — ver [security.md](security.md).
- **`match` exaustivo no `IntoResponse`**, sem `_ => (500, "Unknown error")`. `ApiError` tem
  duas dezenas de variantes; o catch-all faz variante nova compilar e virar 500 silencioso em
  vez de forçar a decisão de status no ponto onde a variante é criada.
- **Proibir `let _ = resultado` sobre `Result`.** Descartar o erro em silêncio já causou bug
  real: `api_create_notebook` respondia 200 com um notebook sem bloco nenhum quando
  `create_block` falhava. `#[warn(clippy::let_underscore_must_use)]` pega isso automaticamente;
  descarte deliberado de efeito colateral best-effort continua permitido, mas precisa ser
  óbvio no código em volta (ou virar `.ok()` explícito, não `let _ =`).
- **Contraparte no frontend**: nenhum `throw` cru — todo erro do cliente é tipado com código
  (`ApiClientError`, migrando para `Result<T, E>` via Catcher, Q109). O par existe para que o
  mesmo hábito de "erro sempre carrega um código, nunca uma string solta" valha nos dois lados
  da fronteira.

## `validator` nos DTOs de request 🟡

Todo DTO de request usa `validator` (já era dependência, pouco usada). O TypeScript confia no
tipo gerado — não reimplementa a validação em zod para o que já é validado no Rust; zod continua
só em formulário, onde o dado nunca passou pelo backend ainda.

## Gate do clippy 🔴

`cargo fmt --all --check` + `cargo clippy -- -D warnings` + `cargo test`, bloqueantes no CI.
Boa parte do que o clippy pega sem review humano: `let _ = Result`, `.unwrap()` questionável,
`match` com braço `_` redundante.

## Mudou X ⇒ verifique Y

- `ApiError` ganha variante nova ⇒ o `match` exaustivo do `IntoResponse` força tratamento; o
  `errorCode` novo precisa de chave nos dois locales (Q45, [i18n.md](i18n.md)).
- Domínio novo (`controllers/`/`models/` fora de `domain/`) ⇒ migra para
  `domain/<nome>/{controller,service,repository,dto,entity}.rs` ao ser tocado, não só quando
  crescer.
- Rota nova que acessa recurso de usuário ⇒ `require_permission(...)` como layer, nunca checagem
  manual dentro do handler.
