# ZEILE_DESKTOP.md — Plano: versão desktop, roteamento por capacidade e modo LAN

Plano de implementação para uma versão desktop do Zeile que funciona **sem servidor
externo**, mantendo em paralelo a versão web/nuvem, com uma **camada de roteamento por
capacidade** que decide, por requisição, se ela vai para o servidor nuvem ou para um
backend local. Como incremento final, um **modo LAN institucional** (professor hospeda,
alunos conectam sem internet) para a feature de desafios.

Princípio norteador: **uma única base de código**. A web continua idêntica (roteador
sempre resolve para `remote`/in-browser); o desktop e o host LAN plugam no mesmo código
via configuração de runtime.

---

## Modelo de identidade (base para todas as fases)

Autenticação da nuvem permanece **centralizada no servidor Zeile**. Duas classes de conta:

| tipo de conta | credencial vive em | desbloqueia |
|---|---|---|
| **conta Zeile (nuvem)** | servidor central Zeile | features com internet (compartilhar, times, publicar, sync entre dispositivos) |
| **conta local** | DB do backend local/self-hosted (loopback ou host LAN) | tudo que roda sem internet |

Contas locais são contas reais (register/login bcrypt já existem em
`rust-server/src/controllers/user.rs`, funcionam offline). Não há usuário-único sintético.
A mesma mecânica serve o desktop pessoal (1 usuário, bind `127.0.0.1`) e o host LAN
(N usuários, bind `0.0.0.0`) — muda só o *bind* e a política de acesso.

---

## Matriz de capacidades

O roteador não decide por string de path (frágil), e sim por **capacidade**. Cada
`*-service.ts` declara a capacidade de cada método.

| capability | web/nuvem | desktop local | LAN host | exige conta nuvem? |
|---|---|---|---|---|
| `auth` | remote | local | local (LAN) | não |
| `notebook-crud` | remote | local | local | não |
| `sync` (WS) | remote | local loopback | local LAN | não |
| `exec-python/js` | in-browser | in-browser | in-browser | não |
| `exec-compiled` | remote | local *(se toolchain)* | local | não |
| `challenges` | remote | local | local | não |
| `teams` / `grants` | remote | remote/off | local (turma) | sim (nuvem) / não (turma LAN) |
| `chat` | remote | off | local (opcional) | depende |
| `templates`/`public` | remote | remote (catálogo) | off | sim |
| `push` / `email` | remote | off | off | sim |

`resolve(cap)` decide com base em: runtime (web vs Tauri), conectividade, matriz de
capacidades locais (ex.: toolchain presente?), **tipo da conta ativa** (nuvem vs local),
e preferência do usuário. Capacidade que exige conta nuvem e o usuário não tem → rebaixada
para indisponível.

---

## Fase 0 — Fundação de roteamento (frontend)

**Objetivo:** introduzir a camada de abstração sem mudar o comportamento da web.

Tarefas:
- Criar `lib/runtime/router.ts`:
  - `type Capability` (enum das capacidades acima).
  - `type Target = { kind: "remote" | "local"; baseUrl: string; wsUrl: string; token: string }`.
  - `resolve(cap: Capability): Target`.
  - Detecção de runtime: `window.__TAURI__` ou flag de build `NEXT_PUBLIC_RUNTIME=desktop`.
- Adaptar `lib/api/base.ts`:
  - `http(path, { capability })` consulta `resolve(cap)` para obter `baseUrl` + `token`
    (em vez de `BASE_URL` fixo e cookie único).
  - Manter fallback: sem capability declarada → comportamento atual (remote).
- Adaptar `lib/notebook-socket.ts`: `wsUrl()` usa `resolve("sync").wsUrl`.
- Anotar cada `lib/api/*-service.ts` com sua capability (uma linha por método).

Critério de aceite: `NEXT_PUBLIC_RUNTIME` ausente → app web byte-a-byte igual ao atual;
suíte de tipos (`pnpm types:check`) e `pnpm lint` limpos.

Risco: token por alvo — o `auth_token` da nuvem ≠ o do backend local. O `Target` carrega
o token certo por alvo; não reutilizar o cookie único de hoje. Endereçado na Fase 2.

---

## Fase 1 — Backend local empacotável (Rust)

**Objetivo:** o mesmo binário Axum roda como backend local, com DB embarcado.

Estratégia escolhida: **loopback HTTP** (o mesmo backend em `127.0.0.1:PORT`), para
reaproveitar 100% dos handlers e manter o contrato HTTP idêntico (os `*-service.ts` não
mudam além da capability).

Decisão de persistência (tomada):
- **SQLite: rejeitado.** `diesel-async` não suporta SQLite (só postgres/mysql); o
  `AsyncPgConnection` + deadpool é usado em ~30 arquivos, e há tipos PG-específicos
  (uuid, enums via `diesel-derive-enum` feature `postgres`). Portar exigiria reescrever
  toda a camada de dados.
- **PostgreSQL local: escolhido.** Mantém 100% do código. `main.rs` já faz bind em
  `0.0.0.0` com `PORT` por env (serve loopback e LAN). O único bloqueador de código era
  o TLS forçado em `establish_connection`.

Tarefas:
- [x] TLS opcional na conexão: `establish_connection` (`routes/mod.rs`) escolhe rustls vs
  `NoTls` por env `DATABASE_TLS` (default = TLS ligado, preserva o remoto). `DATABASE_TLS=off`
  conecta a um Postgres local em loopback sem TLS. Migrações (`db_migrations.rs`) usam libpq
  com `sslmode=prefer`, que já cai para não-TLS — sem mudança.
- [x] Caminhos cloud-only não abortam o boot offline (verificado): email
  (`controllers/email.rs`) retorna `ApiError::SendingEmail` limpo quando faltam
  `SMTP_USERNAME`/`SMTP_PASSWORD` (sem tocar a rede); `load_push_state` retorna `None`
  sem VAPID; OAuth só constrói o client dentro dos handlers (nunca no boot) e o frontend
  aponta o GitHub sempre para a nuvem, então o backend local nunca recebe essas rotas.
- [x] Corrigido o único ponto que rodava no boot forçando TLS: `run_caps_listener`
  (backplane multi-nó, `controllers/permissions.rs`) agora respeita `DATABASE_TLS` e usa
  `NoTls` no modo local — antes ficava em retry infinito contra um PG local plaintext.
- [ ] Provisionamento do Postgres embarcado (baixar/gerir/subir binário local) — movido
  para a **Fase 3** (empacotamento), onde é uma preocupação de bundling.

Critério de aceite (parcial, atingido): com um Postgres local, `DATABASE_TLS=off` +
`DATABASE_URL` de loopback, o backend sobe e register/login/CRUD funcionam sem internet
nem TLS. Compila limpo (`cargo check`).

Risco 🔴: execução compilada depende de `bwrap`/`prlimit`/`wasmtime` + toolchains
(Linux-only). MVP desktop pode desabilitar blocos compilados (Python/JS já rodam no
navegador). Ver Fase 3.

---

## Fase 2 — Conta local vs conta nuvem

**Objetivo:** materializar as duas classes de conta e integrá-las ao roteador.

Tarefas:
- [x] `resolve(cap)` considera a conta ativa: `AccountType` (`cloud`/`local`) em
  `lib/runtime/router.ts`, com `getActiveAccount`/`setActiveAccount` (cookie `zeile_account`).
  Só roteia local quando desktop **e** conta local **e** capacidade local-capaz.
- [x] Token por conta: cookies separados `auth_token` (nuvem) e `local_auth_token` (local);
  `tokenCookieName(account)` centraliza a escolha.
- [x] `context/auth-context.tsx` ciente da conta: expõe `account`; `signIn`/`register`
  aceitam `AccountType` (default = conta ativa), gravam o token no cookie certo e usam o
  cliente de capacidade `auth`. `signOut`/`deleteProfile`/`loadUserFromSession` operam sobre
  o cookie da conta ativa.
- [x] WS ciente da conta: `hooks/use-presence.ts` e `components/notebook/notebook-page.tsx`
  leem o token via `tokenCookieName()` (subprotocolo `access_token` inalterado).
- [x] Helper de disponibilidade: `isCapabilityAvailable(cap)` — capacidades cloud-only só
  disponíveis com conta nuvem + online. É a API que a UI usa para desabilitar features.
- [x] UI — seletor de conta: toggle "Conta Zeile vs Conta local" em `login-form.tsx` e
  `signup-form.tsx`, visível **só no desktop** (`isDesktopRuntime()` via estado client-only
  p/ evitar mismatch de hidratação); passa o `AccountType` para `signIn`/`register`. GitHub
  (cloud-only) ocultado quando a conta é local. Chaves i18n `account_cloud`/`account_local`
  em pt-br/en. Web inalterada (conta sempre nuvem → bloco cloud renderiza como antes).
- [ ] Gating visual amplo das demais features cloud-only (teams/chat/templates/publish) via
  `isCapabilityAvailable` — pendente (varre muitos componentes; primitivo pronto).

Critério de aceite: com conta local e sem internet, o usuário cria notebooks, edita,
executa Python/JS; features de nuvem aparecem desabilitadas com explicação. Plumbing
concluído e verificado (biome + types:check); resta a camada de UI.

---

## Fase 3 — Empacotamento desktop (Tauri)

**Objetivo:** app desktop instalável com o backend local embarcado.

Estratégia: **Tauri** (backend já é Rust) — Axum roda no processo nativo (ou sidecar),
ouvindo em loopback; o front Next.js é servido dentro do shell.

Setup do Tauri (Arch Linux):
```sh
sh <(curl https://create.tauri.app/sh)

sudo pacman -Syu
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool
```

Tarefas:
- [x] Scaffold Tauri v2 no repo (`src-tauri/`), integrado ao frontend Next existente
  (`@tauri-apps/cli` como devDep; `pnpm tauri`/`desktop:dev`/`desktop:build`).
  `webkit2gtk-4.1` já presente no host — sem necessidade de `sudo pacman`.
- [x] Backend local iniciado no `setup` (`src-tauri/src/lib.rs`): sobe o `rust-server`
  como processo filho com `DATABASE_TLS=off` + `PORT=3099` e o mata no `ExitRequested`.
  Caminho via `ZEILE_BACKEND_BIN`. Detecção de runtime desktop é automática
  (`window.__TAURI__` → `isDesktopRuntime()`), então não é preciso injetar
  `NEXT_PUBLIC_RUNTIME`. `cargo check` do crate limpo.
- [x] **Servir o frontend no bundle: Opção A escolhida (Next standalone + sidecar Node).**
  `next.config.mjs` usa `output: 'standalone'` sob `NEXT_DESKTOP=1` (web inalterada).
  `scripts/stage-desktop.mjs` monta `src-tauri/resources/{node, backend/rust-server, next/}`.
  `beforeBuildCommand` = build backend release + build Next standalone + staging.
  `lib.rs` sobe o Node (release) + backend, espera a porta 3000 e cria a janela
  programaticamente. Payload medido: **~280M** (node 118M, next 123M, backend 39M).
- [x] Backend empacotado como recurso do instalador (`resources/backend/rust-server`,
  com `chmod +x` em runtime); em dev continua o path relativo.
- [x] Provisionar o PostgreSQL local: feature `embedded-pg` no backend
  (`rust-server/src/embedded_pg.rs`, dep `postgresql_embedded`) baixa/sobe um PG local e
  define `DATABASE_URL`; honra `DATABASE_URL` externo como fallback. `prepare-desktop.mjs`
  builda com `--features embedded-pg`; `lib.rs` passa `ZEILE_PG_DATA`. Caveat: binário do PG
  liga `libxml2.so.2` (OK em Debian/Ubuntu/Fedora; falha em Arch com `.so.16` → usar
  fallback ou feature `bundled` p/ offline). Ver `src-tauri/README.md`.
- [ ] Decisão de escopo para `exec-compiled`:
  - (MVP) desabilitar blocos compilados; só Python/JS/TS (in-browser).
  - (Completo) bundlar toolchains + `wasmtime`/`bwrap` — alto esforço, Linux-only.
- [ ] UI da Fase 2 (toggle conta local/nuvem + gating), agora testável sob `tauri dev`.

Critério de aceite: instalador roda em máquina sem Zeile instalado; cria conta local,
edita e executa (ao menos Python/JS) totalmente offline. **Parcial:** scaffold + boot do
backend prontos e compilando; falta o serving de produção, o Postgres e o instalador.
`tauri dev`/`build` não executados neste ambiente (headless, sem display).

---

## Fase 4 — Modo LAN institucional (incremento sobre as fases anteriores)

**Objetivo:** professor hospeda; alunos conectam pela LAN, resolvem desafios e submetem,
sem internet.

Pré-requisitos: Fases 0–2 (roteamento + contas locais + backend local). O host LAN é o
backend local com bind `0.0.0.0` e auth multiusuário real.

O que já funciona offline (confirmado no código):
- Register/login local (bcrypt, sem verificação de e-mail nem OAuth).
- Judge automático (`controllers/challenge_judge.rs`): compila e executa sob
  `bwrap --unshare-all` (sem rede) e `cargo build --offline`. Modos `io`, `reference`,
  `property`.
- Submissão carrega só `{language, code}`; polling 202 + poll.
- Nenhuma URL externa no caminho de desafio/login.

Tarefas:
- **Perfil "LAN host":** flag para bind `0.0.0.0`, auth real ativa, porta configurável.
- **Lacuna de acesso (principal trabalho de produto):** hoje notebook público concede
  `notebook.view` mas **não** `notebook.blocks.{lang}.execute` (teste
  `public_baseline_allows_view_not_edit`). Sem grant explícito o aluno vê mas não submete.
  Criar conceito de **turma/sessão** (reusar modelo de *team* + grants de `permissions.rs`)
  com fluxo de um clique que concede `execute` ao principal `authenticated` ou aos membros
  da turma. Aditivo, não reescrita.
- **Descoberta do host:** mDNS/`zeile.local` ou QR/link com IP na lousa.
- **Reset de senha offline:** Gmail SMTP não funciona sem internet; professor como admin
  reseta senha de aluno.

Critério de aceite: numa LAN sem internet, alunos criam contas locais no host do professor,
veem os desafios, submetem código, são corrigidos automaticamente e aparecem no leaderboard.

Risco 🔴: provisionamento do host (Linux-only) — PostgreSQL/SQLite + toolchains
(`cargo` + target `wasm32-wasip1` + `wasmtime`, `go`, `clang++`, `zig`) + `bwrap`/`prlimit`
pré-instalados offline. Sala só com Python/JS elimina essa dependência.

---

## Ordem de execução e dependências

```
Fase 0 (roteamento) ──► Fase 1 (backend local) ──► Fase 2 (contas) ──► Fase 3 (Tauri)
                                                          └──────────► Fase 4 (LAN)
```

Fase 4 depende de 0–2, mas **não** de 3 (o host LAN pode ser o binário Rust rodando
direto, sem shell Tauri).

## Decisões em aberto

- SQLite vs Postgres embarcado (Fase 1).
- Escopo de `exec-compiled` no desktop: MVP (só in-browser) vs completo (bundlar toolchains).
- Política de "dono" por notebook para sync (um notebook não sincroniza com nuvem e local
  ao mesmo tempo sem regra de merge).
- Modelo exato de turma/sessão na Fase 4 (novo modelo vs extensão de *team*).

## Arquivos-chave (referência)

Frontend: `lib/api/base.ts`, `lib/notebook-socket.ts`, `hooks/use-automerge-sync.ts`,
`lib/pyodideStore.ts`, `lib/api.ts`, `lib/api/challenge-service.ts`, `context/auth-context.tsx`,
`lib/backgroundSync.ts`.

Backend: `rust-server/src/routes/mod.rs`, `rust-server/src/controllers/{user,jwt,sync,challenge,challenge_judge,permissions,email,oauth}.rs`,
`rust-server/src/{http,executor,file}/mod.rs`, `rust-server/src/sec/mod.rs`,
`rust-server/src/db_migrations.rs`, `rust-server/src/schema.rs`, `rust-server/Cargo.toml`.
