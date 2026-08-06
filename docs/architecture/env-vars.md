# Variáveis de ambiente

Regra 🔴: **`NEXT_PUBLIC_*` nunca recebe segredo** — é inlined no bundle servido ao cliente. Ver
[security.md](security.md).

Fonte: `env.example` (frontend) e `rust-server/.env.example` (backend). Este documento é a
tabela; os `.env.example` são o template a copiar.

## Frontend (`env.example`)

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_MODE` | pública | sim | `JSON`, `API` ou `NO_ENDPOINTS` — modo de geração dos docs de API |
| `NEXT_PUBLIC_API` | pública | se `MODE=API` | URL base da API geral, para docs OpenAPI e requisições gerais |
| `NEXT_PUBLIC_API_JSON_PATH` | pública | se `MODE=JSON` | caminho do JSON OpenAPI local |
| `NEXT_PUBLIC_RUST_NOTEBOOK_API` | pública | sim | backend para operações de notebook e execução de código |
| `NEXT_PUBLIC_WS_URL` | pública | sim | WebSocket para sync Automerge e presence. Protocolo é normalizado no código (http/https/ws/wss aceitos na env); em produção a página é HTTPS, então o backend precisa aceitar `wss://` |
| `GITHUB_TOKEN` | **secreta** | não | PAT do GitHub, zero escopo necessário (só lê contagem de estrelas). Server-only — nunca prefixar com `NEXT_PUBLIC_` |

## Backend (`rust-server/.env.example`)

### Núcleo

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `DATABASE_URL` | secreta | sim | connection string do Postgres |
| `JWT_SECRET` | secreta | sim | chave de assinatura do JWT |
| `RUST_LOG` | pública | não (default `info,tower_http=warn`) | filtro de log por target; evitar `tower_http=debug` fora de sessão de debug (emite evento por request) |
| `DATABASE_POOL_SIZE` | pública | não (default 10) | tamanho do pool de conexão |
| `DATABASE_TLS` | pública | não | liga TLS na conexão com o Postgres |
| `TEST_MIGRATION_DATABASE_URL` | secreta | só no job `rust-test` do CI | banco descartável para o teste de migration — sem ela o teste retorna cedo sem verificar nada ([testing.md](testing.md)) |

### URLs e OAuth

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `FRONTEND_URL` | pública | sim | URL pública do frontend, para redirecionamento pós-OAuth |
| `CORS_ALLOWED_ORIGINS` | pública | não | origens permitidas por CORS, separadas por vírgula; sem ela só localhost e `FRONTEND_URL` |
| `API_URL` | pública | sim | URL pública do backend, para callback de OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | secreta | não | provedor OAuth GitHub; sem os dois, não aparece em `GET /api/auth/providers` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secreta | não | provedor OAuth Google, mesma regra |

### E-mail (SMTP)

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `SMTP_USERNAME` / `SMTP_PASSWORD` | secreta | sim para convite de time | credencial SMTP via `lettre` |
| `SMTP_TIMEOUT_SECS` | pública | não (default 15, máx. 120) | timeout de I/O do SMTP ([operability.md](operability.md)) |

### Web Push (VAPID)

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `VAPID_PRIVATE_KEY` | secreta | sim para push | chave privada VAPID, base64url cru |
| `VAPID_PUBLIC_KEY` | pública | sim para push | par público — precisa bater com `NEXT_PUBLIC_VAPID_PUBLIC_KEY` do frontend |
| `VAPID_SUBJECT` | pública | sim para push | claim `sub` do VAPID (`mailto:`) |
| `VAPID_PRIVATE_KEY_PATH` | secreta | não | alternativa a `VAPID_PRIVATE_KEY` — caminho de `.pem` EC `prime256v1`; só usada se a outra não estiver definida |

### Sandbox de execução

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `WASMTIME_PATH` | pública | não | caminho do binário `wasmtime`, default resolve do `PATH` do sistema |
| `GO_PATH` / `ZIG_PATH` / `CPP_PATH` | pública | não | caminho dos compiladores, default resolve do sistema |
| `ZEILE_BUILD_CACHE` | pública | não (default `files/.build-cache`) | cache de compilação Go/Zig montado read-write no sandbox, compartilhado entre sessões — sem ele, cada sessão recompila a stdlib |

### Operabilidade

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `HTTP_CLIENT_TIMEOUT_SECS` | pública | não (default 10, máx. 120) | timeout de I/O externo (GitHub, OAuth) |
| `SHUTDOWN_GRACE_SECS` | pública | não (default 5) | teto de espera para o checkpoint no shutdown gracioso ([operability.md](operability.md)) |
| `PRESENCE_FLUSH_MS` | pública | não (default 200) | intervalo de broadcast de presence; menor = cursor mais suave, mais CPU |
| `CHECKPOINT_SECS` | pública | não (default 60) | intervalo de persistência de notebook ativo — `AutoCommit::save()` completo por documento sujo |
| `ZEILE_LOG_RETENTION_DAYS` | pública | não (default 3) | retenção dos logs por execução em `logs/` |
| `ZEILE_RATE_LIMIT_OFF` | pública | não (default `false`) | desliga o teto global de requisições — só para teste de carga |
| `ZEILE_METRICS_TOKEN` | secreta | não | token para `GET /api/metrics` fora do loopback, via header `x-zeile-metrics-token`; sem ele só loopback e admin |

### Desktop

| Variável | Pública/secreta | Obrigatória | Descrição |
|---|---|---|---|
| `BIND_ADDR` | pública | não (default loopback) | endereço de bind do servidor — o shell desktop passa loopback explícito; `0.0.0.0` só no perfil LAN |
| `ZEILE_PG_DATA` | pública | sim no desktop | diretório de dados do Postgres embarcado — sem ela, cai em `temp_dir()` (perigoso: dado apagado em qualquer limpeza de temp) |
| `ZEILE_SHELL_TOKEN` | secreta | sim no desktop | token de sessão para `POST /internal/shutdown`, gerado pelo shell no boot; sem ela a rota responde 404 |

## Mudou X ⇒ verifique Y

- Variável nova ⇒ entra em `env.example`/`rust-server/.env.example` **e** nesta tabela, na
  mesma seção temática, com pública/secreta e obrigatória/opcional declarados.
- Variável nova com nome que poderia ser confundido com `NEXT_PUBLIC_*` ⇒ confirmar contra o
  teste de guarda ([security.md](security.md)) antes de nomear.
- Variável que hoje é opcional passa a obrigatória (ou vice-versa) ⇒ atualizar a tabela no
  mesmo PR — ela é o que alguém lê antes de perguntar "isso trava o boot ou não?".
