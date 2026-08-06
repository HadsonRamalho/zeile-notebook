# Operabilidade

## `health/live` + `health/ready`, separados 🔴

Fora do prefixo `/api` — igual a `/metrics` e `/docs`. `live` responde sempre que o processo
está de pé; `ready` checa o pool de conexão com o banco. Sem a separação, um Postgres oscilando
faz o orquestrador **matar** um processo saudável em vez de tirá-lo do balanceador — os dois
problemas têm soluções opostas e um único endpoint não distingue entre eles.

`ready` também expõe `contract_version`/`min_supported_contract_version`
(ver [0001-contract-version-policy](../decisions/0001-contract-version-policy.md)) e é onde a
guarda de downgrade de migration recusa o boot se o banco estiver migrado à frente do binário.

## Erro descritivo no boot 🔴

Falha de inicialização (bind do listener, build do pool, `rustls_config`) vira `BootError` com
mensagem acionável e exit code definido — nunca `.unwrap()`. "porta 3099 já em uso" é
diagnóstico; um panic dentro do `tokio-postgres-rustls` não é.

## Timeout obrigatório em I/O externo 🔴

`reqwest` (GitHub, OAuth) e `lettre` (SMTP) têm timeout configurável por env
(`HTTP_CLIENT_TIMEOUT_SECS`, `SMTP_TIMEOUT_SECS`), nunca sem limite. Sem timeout, um provedor
lento prende um worker do tokio — e no fluxo de OAuth isso é o caminho crítico de autenticação,
não um efeito colateral.

**Aberto**: se a regra cobre também o cliente — `lib/api/base.ts` hoje faz `fetch` sem
`AbortSignal.timeout`. Sem decisão tomada; registrar aqui até fechar.

## `request_id` no tracing 🟡

Todo request ganha um `request_id` propagado no span de tracing (mais `notebook_id` nas rotas de
notebook), sem migrar para log estruturado JSON completo — é o suficiente para amarrar um erro à
requisição ou à sessão de WebSocket que o causou, o que mais dói no canal de colaboração, onde
vários clientes agem no mesmo documento simultaneamente.

## Shutdown gracioso completo 🔴

Sequência obrigatória, nesta ordem: sinaliza (watch de disparo único) → para de aceitar conexão
nova → checkpoint de todo o `sync_registry` → fecha os WebSocket com close frame (`1001 going
away`) → drena o pool. `axum::serve(...).with_graceful_shutdown` roda sob um teto
(`SHUTDOWN_GRACE_SECS`, default 5s) para que o checkpoint aconteça mesmo com conexão pendurada.

É a única peça do modelo original que perdia dado do usuário em produção: entre dois ciclos do
`checkpoint_loop`, o documento Automerge vivia só em memória (`sync_registry: DashMap`) — um
SIGTERM de deploy descartava tudo desde o último checkpoint, sem log e sem aviso a quem estava
editando.

No desktop, o shell segura o `ExitRequested` (é cancelável no Tauri) → chama o endpoint de
shutdown → faz poll em `health/ready` até cair → SIGKILL só por timeout (~10s). A janela só
fecha depois que o backend confirmou o checkpoint.

## Idempotência do `backgroundSync` 🟡 — auditoria pendente

`lib/background-sync.ts` enfileira **qualquer** requisição não-GET que falhe com `TypeError` e
reenvia depois, sem chave de idempotência. Riscos concretos ainda não fechados:
`POST /notebook/create` reenviado cria N notebooks; convite de time reenviado dispara N e-mails;
comentário e snapshot duplicados na reconexão. Nada hoje distingue "a requisição não chegou" de
"chegou e a resposta se perdeu na rede" — a fila trata os dois casos como o mesmo problema.

**Regra a aplicar quando a auditoria rodar**: toda rota na fila de reenvio recebe uma chave de
idempotência (gerada no cliente, no momento da fila, não no reenvio), e o servidor deduplica por
essa chave antes de executar o efeito. Auditoria em aberto (ver
[plano-execucao.md](../plano-execucao.md)) — a fila continua ativa hoje sem essa garantia.

## Mudou X ⇒ verifique Y

- Rota nova que a `backgroundSync` pode reenfileirar (qualquer não-GET) ⇒ considerar se o efeito
  é seguro para reenvio duplicado, mesmo antes da chave de idempotência existir.
- Chamada de I/O externo nova (novo provedor OAuth, novo serviço de e-mail) ⇒ timeout por env
  desde o primeiro commit, não como correção depois.
- Task de fundo nova spawnada no boot ⇒ o shutdown gracioso precisa de handle dela para poder
  esperar/cancelar; task solta sem handle é regressão do Q68.
