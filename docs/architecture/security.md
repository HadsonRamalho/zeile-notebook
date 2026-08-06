# Segurança

## Segredo nunca em `NEXT_PUBLIC_*` 🔴

Qualquer variável `NEXT_PUBLIC_*` é inlined no bundle JavaScript servido ao cliente — nunca
recebe segredo. `GITHUB_TOKEN` (usado só para ler contagem de estrelas, zero escopo necessário
no PAT) é server-only por isso; um teste de guarda bloqueia qualquer `NEXT_PUBLIC_*` cujo nome
sugira segredo. Tabela completa de variáveis em [env-vars.md](env-vars.md).

## CORS por ambiente 🔴

Lista de origens permitidas vem de `CORS_ALLOWED_ORIGINS` (env, separado por vírgula), nunca
wildcard. Sem a variável definida, só `localhost:3000`, `127.0.0.1:3000` e `FRONTEND_URL` são
aceitos — suficiente para dev, insuficiente (e proposital) para produção sem configurar.

## Body limit por rota 🔴

1 MB global; override de 100 MB só nas rotas que legitimamente recebem payload grande:
`PUT /notebook/{id}/content` e `POST /notebook/{id}/snapshots`. 100 MB em toda rota, sem rate
limit, é vetor de negação de serviço barato — a combinação dos dois (body limit + rate limit
abaixo) é o que fecha o vetor.

## Rate limit 🔴

Janela fixa por IP, resposta 429 com `Retry-After`, nas rotas onde o custo de abuso é real e
distinto:

| Rota | Razão |
|---|---|
| `POST /user/login` | força bruta de credencial |
| `POST /user/forgot-password` | enumeração de e-mail cadastrado + custo de envio via `lettre` |
| Convite de time | spam de e-mail |
| Judge de challenge | custo de CPU (compilação + execução) |

O `judge_semaphore` já existente limita **concorrência**, não **taxa** — os dois mecanismos são
complementares, não substitutos.

## Erro de infraestrutura nunca vaza no 500 🔴

O cliente recebe mensagem genérica com código; o detalhe completo (nome de tabela, de
constraint, de coluna) vai só para o log estruturado do servidor. `details` é zerado em toda
resposta 5xx — inclusive `MISSING_ENV_VAR`, que citava o nome exato da variável faltante antes
desta regra. Combina com o mapeamento de erro Diesel por causa
([database.md](database.md), [rust-rules.md](rust-rules.md)).

## PII em log: decisão explícita de não regular ⚪

O Zeile coleta e-mail, nome, conteúdo de notebook e mensagem de chat, e **nada proíbe** logar
qualquer um deles hoje. Isso fica registrado como decisão, não omissão — se um caso concreto de
exposição aparecer (ex.: conteúdo de notebook em `console.log` do servidor), a resposta é regra
nova, não "sempre foi proibido".

## Mudou X ⇒ verifique Y

- Rota nova que aceita payload grande (upload, import) ⇒ body limit dedicado nessa rota
  específica, nunca subir o limite global.
- Rota nova de custo alto por requisição (envio de e-mail, execução de código, criação em massa)
  ⇒ considerar rate limit dedicado, seguindo a tabela acima como referência de razão.
- Nova var de ambiente com nome que poderia sugerir `NEXT_PUBLIC_*` por engano ⇒ conferir contra
  o teste de guarda e contra [env-vars.md](env-vars.md).
- `ApiError` nova que pode carregar detalhe sensível (mensagem de driver, path de arquivo) ⇒
  confirmar que o campo `details` da resposta 5xx é zerado para ela.
