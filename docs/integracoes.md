# Zeile — Integrações: Google e ClickUp

Plano das duas integrações, em fases. Uma fase = um bloco coeso de trabalho; três PRs no total,
indicados no cabeçalho de cada fase. `[ ]` = pendente.

As decisões abaixo já estão batidas — este documento é o registro delas e a ordem de execução, não
uma proposta em aberto. O que continua indefinido está em [Questões abertas](#questões-abertas).

---

## Ponto de partida

O que já existe no repositório e condiciona o plano:

| Existe | Onde | Consequência |
|---|---|---|
| `AuthProvider::Google` no enum | `rust-server/src/models/user.rs:24` | não há migration de enum a fazer |
| Coluna `users.google_id` | `rust-server/src/schema.rs:430` | não há migration de coluna a fazer |
| `update_user_provider(provider, …)` | `rust-server/src/models/user.rs:219` | já é genérico por provider |
| Fluxo OAuth completo, **hardcoded no GitHub** | `rust-server/src/controllers/oauth.rs` | login, link de conta e callback existem; URLs, parsing e leitura de e-mail estão presos ao GitHub |
| `oauth_configured()` global | `oauth.rs:52` | checa `API_URL` + `GITHUB_CLIENT_*` de uma vez; precisa virar por provider |
| Catálogo de permissões com paridade TS↔Rust | `rust-server/src/sec/catalog/`, `contracts/permission-catalog.json` | permissão nova entra no catálogo Rust e o snapshot test propaga |
| Blocos de referência | `components/notebook/blocks/notebook-ref/`, `template-ref/` | o `clickup_ref` nasce como irmão deles |
| Nada de integrações de terceiros | — | tabela, criptografia de token e tela de Conexões são construção nova |

**Não existe hoje** criptografia de segredo em repouso no banco. A Fase 2 é onde isso nasce.

---

## Decisões

### Google

| # | Decisão |
|---|---|
| G1 | Escopo do primeiro PR: **login/cadastro + link de conta**, paridade completa com o GitHub |
| G2 | E-mail já cadastrado por outro método: **vincula automaticamente** quando o Google devolve `email_verified: true` |
| G3 | `email_verified: false` é **recusado**, sem exceção |
| G4 | **Aberto a qualquer conta Google** — sem allowlist de domínio, sem uso do claim `hd` |
| G5 | `oauth.rs` é **generalizado** num provider abstrato; GitHub e Google viram implementações |
| G6 | Desvincular um provider é livre; remover o **último** meio de login exige **definir senha antes** |
| G7 | `GET /api/auth/providers` é a fonte única de quais botões o front renderiza |
| G8 | Escopos pedidos: `openid email profile`, nada além. O access token do Google é **descartado** após o callback |

### ClickUp

| # | Decisão |
|---|---|
| C1 | Autenticação **OAuth por usuário** — cada pessoa conecta a própria conta, tasks são criadas em nome dela |
| C2 | Camada **genérica de integrações** desde já: tabela `integrations`, tokens cifrados em repouso, refresh automático, tela de Conexões |
| C3 | Vínculo **time → N listas**, uma marcada como default |
| C4 | Configurar vínculo exige a permissão nova `team.integrations.manage` |
| C5 | Duas superfícies: **bloco `clickup_ref`** (leitura) e **ação de UI** "criar task" (escrita, que insere o bloco) |
| C6 | O doc Automerge guarda **somente o id**; título e status vêm do backend com cache |
| C7 | Direção **única** Zeile → ClickUp. Sem webhooks, sem bidirecional |
| C8 | Criar task com **título + descrição** apenas. Assignee, prioridade, due date e custom fields ficam fora da v1 |

### Transversais

| # | Decisão |
|---|---|
| T1 | Ambas as features valem **só no modo servidor**; ficam escondidas no desktop/Tauri, que não tem `API_URL` público para o callback |
| T2 | Chave de cifra dos tokens em `INTEGRATIONS_ENC_KEY` (AES-256-GCM), exigida no boot pela Fase 2 |
| T3 | TTL do cache de task/lista do ClickUp: **60 s** |
| T4 | O grant `team.integrations.manage` nasce junto dos demais na criação de time — o gap conhecido de times criados em runtime nascerem sem grants vale para ele |
| T5 | Toda mudança de README vai nos dois idiomas, na mesma PR; a UI passa por `next-intl` (pt-br + en) |

---

## Fase 0 · Provider de OAuth genérico — **PR 1**

Refactor puro, sem mudança de comportamento observável. Existe para que o Google não seja um
segundo `oauth.rs` copiado, e porque o ClickUp da Fase 2 consome a mesma abstração.

- [x] Extrair de `controllers/oauth.rs` um provider abstrato com: `client_id`/`client_secret` por env, `auth_url`, `token_url`, escopos, parsing do userinfo e resolução do e-mail primário verificado
- [x] GitHub vira a primeira implementação, com o passo extra de `GET /user/emails` que só ele precisa
- [x] `oauth_configured()` passa a ser por provider; `oauth_unavailable()` passa a citar qual provider faltou
- [x] Rotas parametrizadas: `/api/user/auth/callback/{provider}` e `/api/user/link/{provider}/callback`, no lugar dos caminhos com `github` literal
- [x] Manter as rotas antigas do GitHub respondendo — os caminhos são idênticos aos de antes, então o callback registrado no GitHub App continua válido, e um teste guarda isso
- [x] Testes do fluxo GitHub antes do refactor, para provar que ele não mudou

**Dois defeitos corrigidos no caminho**, ambos visíveis ao extrair: a troca de código usava
sempre o `redirect_uri` do login, o que quebraria o fluxo de vínculo assim que o provider
validasse a igualdade; e `FRONTEND_URL`/`API_URL`/conexão eram `.unwrap()`, ou seja, 500 em vez
de redirect de erro.

**Sai daqui**: o GitHub continua funcionando idêntico, e adicionar provider passa a ser escrever uma
implementação, não um arquivo.

## Fase 1 · Google — **PR 1**

- [x] Implementação Google do provider: `accounts.google.com/o/oauth2/v2/auth`, token endpoint, userinfo com `sub`, `email`, `email_verified`, `name`, `picture`
- [x] Escopos `openid email profile` (G8); o access token não é persistido
- [x] Login/cadastro: `sub` → `users.google_id`; conta nova nasce com `primary_provider = Google`
- [x] **Resolução de conflito de e-mail (G2/G3)**: `email_verified: false` → recusa com `{provider}_email_not_verified`; verificado e e-mail já existente → vincula o id externo à conta e loga; verificado e inexistente → cria conta. A regra vale para os dois providers, então o antigo `wrong_login_method` do GitHub deixa de existir
- [x] Login por id externo antes do e-mail — quem troca o e-mail no provider continua entrando na mesma conta
- [x] Link de conta: `POST /api/user/link/{provider}` (autenticado, devolve a URL) + callback
- [x] Desvincular provider (G6): `DELETE /api/user/link/{provider}` recusa com 409 `LAST_LOGIN_METHOD` quando é o último meio de login
- [x] `primary_provider` **não muda** ao vincular um segundo método — é histórico do cadastro
- [x] `GET /api/auth/providers` (G7) devolve a lista de providers configurados
- [x] `GET /api/user/auth/methods` diz à UI o que a conta tem hoje: senha, providers vinculados e o primário
- [x] Env novas documentadas: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Front: botão do Google no login e card de conexões no perfil, com strings em pt-br e en
- [ ] Tela de consentimento do Google publicada e domínio verificado — bloqueia o uso em produção fora do modo de teste

**Três correções de segurança que não estavam no plano** e que o trabalho tornou obrigatórias:

1. **`state` passa a ser validado.** O `CsrfToken` era gerado e descartado — qualquer callback
   forjado era aceito. Agora o `state` é um JWT assinado (provider + propósito + nonce + validade
   de 10 min) e o nonce é conferido contra um cookie `HttpOnly`/`SameSite=Lax` emitido no início
   do fluxo. Sem isso, o Google entraria com o mesmo furo que o GitHub tinha.
2. **O vínculo passa a exigir sessão.** `api_link_github_callback` descobria de quem era a conta
   pelo e-mail que o provider devolvia, sem olhar quem estava logado. Agora o dono vem do `state`
   assinado, emitido por um endpoint autenticado, e vincular a um id externo já usado por outra
   conta é recusado.
3. **Vincular deixou de apagar a senha.** `update_user_provider` gravava `password_hash = NULL` e
   trocava o `primary_provider`. Quem vinculasse o GitHub perdia o login por senha sem ser avisado
   — o oposto de G6. Foi substituída por `link_provider_account`, que só grava a coluna do id
   externo (e o avatar, se a conta não tiver um).

**Verificação**: conta nova por Google · conta existente por senha vinculando Google · conta existente
por GitHub vinculando Google · e-mail não verificado recusado · tentativa de desvincular o único método.

## Fase 2 · Camada de integrações + conexão ClickUp — **PR 2**

Onde nasce a infraestrutura que hoje não existe. Genérica por decisão (C2), mas com um só provider
implementado.

- [ ] Migration `integrations`: `id`, `provider`, `scope` (`user` \| `team`), `user_id`, `team_id`, `external_account_id`, `access_token_enc`, `refresh_token_enc`, `expires_at`, `created_at`, `updated_at`. Unicidade por (`provider`, `scope`, dono). `timestamptz` em todas as colunas de tempo
- [ ] Cifra AES-256-GCM com `INTEGRATIONS_ENC_KEY` (T2), nonce por registro; erro acionável no boot se a chave faltar, no mesmo padrão de `BootError`
- [ ] Token nunca sai do backend — não existe endpoint que devolva o valor decifrado
- [ ] Refresh automático antes de expirar, com uma tentativa e falha marcando a conexão como "reautenticar"
- [ ] OAuth ClickUp por usuário (C1): iniciar, callback, gravar conexão, desconectar
- [ ] Cliente HTTP do ClickUp com timeout por env, tratamento de 429 e erro tipado — nada de `.unwrap()`
- [ ] Tela de **Conexões** nas configurações do usuário: conectar, ver conta ligada, desconectar
- [ ] `lib/api/integrations-service.ts`, no padrão dos demais serviços
- [ ] Env novas: `CLICKUP_CLIENT_ID`, `CLICKUP_CLIENT_SECRET`, `INTEGRATIONS_ENC_KEY`

**Ponto de atenção**: desconectar o ClickUp deixa órfãos os blocos que referenciam tasks daquele
workspace. O comportamento de render nesse caso está definido na Fase 4.

## Fase 3 · Vínculo lista ↔ time — **PR 2**

- [ ] Migration `team_integration_lists`: `team_id`, `provider`, `external_list_id`, `name` em cache, `is_default`, `created_by`, timestamps. Uma lista default por time, garantida por índice parcial único
- [ ] Permissão `team.integrations.manage` no catálogo Rust (`sec/catalog/team.rs`), `tier: Granular`, `implied_by: ["team.manage"]`, label `perm.team.integrations.manage` traduzida nos dois idiomas; snapshot do catálogo regenerado
- [ ] O grant entra no conjunto default da criação de time (T4)
- [ ] Endpoints de listar/adicionar/remover vínculo e marcar default, todos atrás da permissão
- [ ] UI nas configurações do time: escolher listas entre as que a conexão do usuário enxerga
- [ ] Vínculo é por time, mas a **leitura das listas disponíveis** usa a conexão pessoal de quem está configurando — quem não conectou vê um estado vazio com chamada para conectar

## Fase 4 · Bloco `clickup_ref` — **PR 3**

- [ ] Novo membro em `BlockType` (`lib/types.ts`) e no switch de `blocks/block-content.tsx`, no padrão de `notebook_ref`
- [ ] Conteúdo do bloco no CRDT: **apenas** `{ provider, kind: "task" | "list", id }` (C6)
- [ ] `GET /api/integrations/clickup/task/{id}` e `.../list/{id}` resolvem título, status e URL, com cache de 60 s (T3) por id, no servidor
- [ ] Estados de render: carregando · resolvido · sem conexão ClickUp (convite a conectar) · sem acesso à task (placeholder neutro, sem vazar título) · erro/rate limit (último valor em cache, com marca de desatualizado)
- [ ] Inserção por colagem de URL do ClickUp, além do menu de blocos
- [ ] Refresh sob demanda: ao montar o bloco, ao expirar o cache e por ação explícita. Sem WS, sem polling (C7)

**Regra que não se negocia**: dois leitores do mesmo notebook podem ter acessos diferentes no
ClickUp. O que decide o que cada um vê é a conexão de quem está lendo, resolvida no servidor a cada
requisição — nunca o conteúdo do documento.

## Fase 5 · Criar task — **PR 3**

- [ ] Ação no menu do notebook e na seleção de texto: "criar task no ClickUp"
- [ ] Formulário com título + descrição apenas (C8); descrição pré-preenchida com o texto selecionado e um link de volta ao notebook
- [ ] Lista alvo: a default do time, com troca entre as listas vinculadas
- [ ] `POST /api/integrations/clickup/tasks`, executado com o token do usuário autor
- [ ] Ao criar, insere um bloco `clickup_ref` apontando para a task nova
- [ ] Erros tratados na UI: sem conexão · sem lista vinculada · sem permissão no ClickUp · rate limit

---

## Fora de escopo, declarado

Não são esquecimento; foram cortados na decisão:

- Sincronização bidirecional e webhooks do ClickUp (C7) — reabre quando "o status ficou velho" virar reclamação real
- Assignee, prioridade, due date e custom fields na criação (C8)
- Token de workspace por time como alternativa ao OAuth pessoal (C1)
- Allowlist de domínio Google (G4)
- Ambas as integrações no desktop/Tauri (T1)
- Jira, Linear, Notion — a camada da Fase 2 é genérica para recebê-los, mas nenhum está planejado

## Riscos

| Risco | Fase | Mitigação |
|---|---|---|
| Vínculo automático por e-mail verificado (G2) é a decisão de maior superfície de segurança: confia no `email_verified` do Google | 1 | recusa dura quando não verificado; nenhum outro caminho vincula conta sem passar por aqui |
| Rotas de callback do GitHub mudarem de forma quebram o GitHub App já registrado | 0 | rotas antigas continuam respondendo |
| `INTEGRATIONS_ENC_KEY` perdida torna toda conexão ilegível | 2 | falha no boot se ausente; documentar que a rotação exige reconectar todo mundo |
| Rate limit da API do ClickUp com muitos blocos num notebook | 4 | cache de 60 s por id no servidor, compartilhado entre leitores; resolução em lote quando houver vários ids na mesma página |
| Quem configurou o vínculo sai da empresa e o token pessoal morre | 3 | o vínculo é do time e sobrevive; a leitura passa a usar a conexão de quem está lendo |

## Questões abertas

Não bloqueiam o início; fecham durante a implementação.

| Fase | Aberto |
|---|---|
| — | Contas que vincularam o GitHub antes desta mudança tiveram a senha apagada por `update_user_provider`; nada as recupera além do fluxo de "esqueci minha senha" |
| 2 | Rotação de `INTEGRATIONS_ENC_KEY`: reconexão manual de todos, ou versionar a chave por registro |
| 2 | Se `scope: team` entra na tabela desde já (só `user` é usado hoje) ou fica de fora até existir um caso |
| 4 | Se a resolução em lote entra já na v1 ou só quando houver medição de custo |
| 4 | O que fazer com um bloco cuja task foi apagada no ClickUp: manter placeholder ou marcar o bloco como quebrado |
| 5 | Se o link de volta ao notebook usa a URL pública ou a interna quando o notebook não é público |
