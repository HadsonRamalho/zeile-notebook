# Zeile — A branch `tauri` (desktop) e o que ela muda

Análise do que a branch desktop acrescenta ao escopo de regra. As decisões que saíram daqui
(Q98–Q105) moram no [catálogo](decisoes.md); a ordem de execução, no
[plano](plano-execucao.md).

---

`origin/tauri` está 13 commits à frente de `main` (merge-base `3dee546`), com 72 arquivos e
~6850 inserções. Fases 0–3 do `ZEILE_DESKTOP.md` implementadas; Fase 4 (LAN) planejada.

### O que a branch já faz melhor que a `main`

Registrar isto importa porque contradiz a premissa de que as regras vêm de fora:

- **`ZEILE_DESKTOP.md` é o melhor documento do repositório.** Plano em fases com checkbox de
  estado real, decisões tomadas **com justificativa técnica** (SQLite rejeitado porque
  `diesel-async` não o suporta e `AsyncPgConnection` é usado em ~30 arquivos), "Decisões em
  aberto" explícitas, riscos marcados 🔴, e critério de aceite por fase — inclusive quando
  parcialmente atingido. É, de fato, o formato de ADR do Q8 já em uso.
- **`src-tauri/README.md` documenta caveat de plataforma com honestidade**: o soname do
  `libxml2` que quebra o Postgres embarcado em Arch, o risco de symlink na extração no
  Windows com as três alternativas, e a tabela de custo de certificado Authenticode.
- **Os commits seguem `<type>(scope): <descrição>`** — mais rigoroso que o formato escolhido
  no Q82, e todos dentro do vocabulário (`feat`, `fix`, `ci`, `docs`).
- **O roteador decide por capacidade, não por string de path** — e o documento diz por quê
  ("frágil") — é o mesmo raciocínio da regra que veda literal mágico em ponto de decisão.

Ou seja: Q2 ("processo humano com regras claras") tem base. As regras a escrever descrevem
em boa parte um método que já existe nesta branch e não chegou à `main`.

### 🔴 A contradição frontal: Q68 é derrotado pelo shell desktop

```rust
// src-tauri/src/lib.rs
fn kill_children(handle: &tauri::AppHandle) { … let _ = child.kill(); }   // SIGKILL
```

O Q68 decidiu graceful shutdown com **checkpoint final de todo o `sync_registry`** porque
entre dois ciclos do `checkpoint_loop` o documento Automerge vive só em memória. O shell
desktop mata o backend com SIGKILL no `ExitRequested`.

Consequência: no desktop a janela de perda **não é por deploy — é por fechar o aplicativo**.
Acontece em todo uso normal, não num evento raro de operação. E o dado perdido é local: não
há servidor nuvem de onde reconciliar.

O Q68 precisa de uma contraparte no shell: sinalizar shutdown ao backend, esperar o
checkpoint, e só então encerrar — com timeout, e SIGKILL apenas como último recurso.

### 🔴 Roteamento por capacidade: cinco furos verificados

O mecanismo é bom; a aplicação tem lacunas que fazem dado ir para o lugar errado.

| # | Furo | Consequência |
|---|---|---|
| 1 | **`capability` é opcional e o default resolve para `remote`.** `api = createApi()` sem capacidade → nuvem. | Fail-open-to-cloud: **esquecer** de declarar faz um app offline conversar com a nuvem, silenciosamente. O default deveria falhar, não escolher. |
| 2 | **`"public"` existe no tipo `Capability` e nenhum serviço a usa.** `getPublicNotebookBySlug` está em `notebook-service.ts`, que declara `notebook-crud` — capacidade **local**. | Com conta local no desktop, abrir notebook público roteia para `127.0.0.1:3099`, onde ele não existe. |
| 3 | **`forgot-password-form.tsx` e `reset-password-form.tsx` usam o `api` sem capacidade.** | O resultado (nuvem) está certo; o mecanismo, não — é implícito e quebra se o default mudar. Deveriam declarar `auth`, ou uma capacidade cloud-only própria. |
| 4 | **`login-form.tsx` e `profile-form.tsx` importam `BASE_URL` direto**, ignorando `resolve()`. | `BASE_URL` é a constante **remota**. O que passa por ali vai para a nuvem independentemente da conta ativa. |
| 5 | **`app/api/search/route.ts` (rota de servidor Next) importa o `api` do cliente**, que lê cookie via `cookies-next` e `navigator.onLine`. | No servidor `isDesktopRuntime()` é `false` e `getCookie` não vê o cookie do usuário. A verificar, mas o acoplamento está invertido. |

Mais um, de natureza diferente: **`exec-compiled` está em `LOCAL_CAPABILITIES` sem condição
de plataforma**, mas a execução compilada é `#[cfg(unix)]` e os handlers `/run*` respondem
"não suportado nesta plataforma" via `if !cfg!(unix)`. A matriz de capacidades conhece
runtime e tipo de conta, mas **não conhece plataforma**.

### Version skew: um eixo novo que atinge Q28, Q29, Q45 e Q54

Até aqui havia um servidor e um cliente sempre servido dele. Agora há **dois backends**
(nuvem e local) e um cliente **instalado**, que pode ter meses.

| Decisão | O que muda |
|---|---|
| **Q28** (contrato gerado) | O artefato gerado pressupõe uma versão de servidor. Um desktop instalado em março fala com uma nuvem de julho. O `--check` garante coerência **no repositório**, não em campo. |
| **Q29** (`serde alias` de transição) | O prazo de remoção do alias passa a depender de **clientes instalados**, não só da fila do `backgroundSync` no IndexedDB. A ADR precisa de política de versão mínima suportada. |
| **Q45** (`errorCode` → tradução) | Nuvem nova emitindo código que o cliente instalado não tem em `messages/*.json` ⇒ usuário vê a string crua. O check cobre o repo, não a combinação em campo. |
| **Q54** (migration no boot) | Agora roda **na máquina do usuário, a cada launch**. Instalar uma versão antiga depois de uma nova deixa o banco migrado além do que o binário conhece — e `run_pending_migrations` não detecta migration "do futuro". O `pg_advisory_lock` resolve concorrência, não downgrade. |
| **Q56** (`down.sql` classificado) | Ganha segundo sentido: no desktop **não há operador** para rodar rollback. |

### Duas crates Rust, sem workspace — Q53 e Q78 não cobrem nenhuma das duas

Não existe `Cargo.toml` na raiz. `rust-server` é `edition = "2024"`; `src-tauri` é
`edition = "2021"` com `rust-version = "1.77.2"`. O próprio CI reconhece a separação
(`rust-cache` com `workspaces: src-tauri` e `rust-server`).

Logo `cargo fmt --all --check` e `cargo clippy --all-targets` da raiz (Q53) **não alcançam
nenhum dos dois crates**. Precisa rodar duas vezes com `--manifest-path`, ou criar um
workspace raiz — e nesse caso reconciliar as duas editions.

### O pipeline de release não tem gate

`desktop-release.yml` dispara em tag `v*` e vai direto para o `tauri-action`. Não há
`biome check`, `types:check`, `cargo clippy`, nem teste. O Q78 escolheu gate em PR e em push
na `main` — **um push de tag contorna tudo e publica instalador** para Windows, macOS e Linux.

### Placeholders de scaffold empacotados

`src-tauri/Cargo.toml` mantém `description = "A Tauri App"`, `authors = ["you"]`,
`license = ""`. E `version = "1.0.0"` está fixo no arquivo enquanto o README declara o
`package.json` como fonte única (sincronizada por `build-desktop.mjs`) — mas o `package.json`
é `"name": "docs"`, `"version": "1.0.0"`. O produto desktop se chama "Zeile Notebook",
versiona `1.0.0`, e deriva de um pacote chamado `docs`.

### Superfície de segurança nova

| Achado | Nota |
|---|---|
| **`"csp": null`** em `tauri.conf.json` | CSP explicitamente desligada. |
| **`WebviewUrl::External("http://localhost:3000")`** | O app é um navegador apontado para origem HTTP, não `tauri://`. Sem isolamento de origem do Tauri. As `capabilities/default.json` (`core:default`, mínimo — bom) protegem a IPC, mas a página não roda em origem privilegiada. |
| **O backend continua fazendo bind em `0.0.0.0`** (`main.rs` inalterado) | Num laptop, o backend local e o Postgres embarcado ficam alcançáveis pela LAN. Combinado com CORS `Any/Any/Any`, que o Q62 ainda não corrigiu. |
| **`jwt_secret` em texto puro** em `app_local_data_dir/jwt_secret`, sem `0600` | O segredo em si é forte (dois UUID v4 = 256 bits de `getrandom`); a permissão do arquivo é o default. |
| **`embedded_pg`: `password: "zeile"` fixo** | E o data dir cai para `std::env::temp_dir()/zeile-pgdata` quando `ZEILE_PG_DATA` não está definido — local compartilhado e legível por outros usuários no Linux. |
| **`embedded_pg` baixa o binário do PostgreSQL em runtime, no 1º launch** | Cadeia de suprimento, e contradiz a premissa offline-first: a primeira execução exige internet. O README já nomeia a correção (feature `bundled`). |
| **`unsafe { std::env::set_var(…) }`** em contexto async | É `unsafe` na edition 2024 exatamente por isso: mutar env depois de haver threads é problemático. Melhor devolver a URL e passá-la adiante. |
| **`dotenvy::dotenv()` dentro de `embedded_pg::ensure_running()`** | Carregamento de env num segundo lugar. Relevante para o `env-vars.md` do Q61. |

### Operabilidade: `wait_for_port` é um `ready` improvisado

O shell espera 30s pela porta 3000 e, no timeout, apenas `log::warn!` — **cria a janela de
qualquer forma**, resultando em tela branca sem erro ao usuário. Porta aberta ≠ pronto: no
primeiro launch o backend pode ainda estar baixando e inicializando o Postgres. É
precisamente o argumento do Q67 (`health/ready`), agora com um consumidor concreto.

### i18n e erro: `run-rust.ts` concentra dois problemas já decididos

- pt-BR hardcoded novo: `"Bloco compilado!"`, `"Código executado com sucesso."`,
  `"Erro de Execução"`, `"Falha relacionada a outro módulo. Tente compilar outros blocos
  primeiro :))"`, `"Erro: Não foi possível se comunicar com o servidor."` — entra na onda 2 do Q42.
- E, pior, **decide status fazendo `includes()` em texto de compilador**, em dois idiomas:
  `stderr.includes("Erro de Compilação Go:")`, `includes("Finished \`dev\` profile")`,
  `includes("file not found for module")`, `includes("Segurança:")`. É literal mágico em ponto
  de decisão, e quebra quando o cargo muda a frase. Pertence ao backend como `errorCode`
  estruturado (Q32), não ao cliente como heurística de string.

### O que o desktop acrescenta ao escopo de regra

Além das 4 áreas do Q97, o desktop pede:

- **`desktop.md`** — matriz de capacidades como fonte única, regra de que capacidade é
  obrigatória (não opcional), plataforma como terceiro eixo, empacotamento e versionamento,
  assinatura de código, dependência de runtime por distro.
- **Política de compatibilidade de versão** — cliente instalado × servidor; versão mínima
  suportada; o que acontece no downgrade de migration.
- E `lib/runtime/router.ts` entra na **primeira leva de testes (Q74)**: é lógica pura que
  decide para onde vai o dado do usuário, com o mesmo perfil de risco de
  `permissions/engine.ts`.

### Pendências de housekeeping da branch

Não valem pergunta, mas precisam entrar em algum PR:

- `src-tauri/Cargo.toml`: `description = "A Tauri App"`, `authors = ["you"]`, `license = ""` — placeholders de scaffold. E `version = "1.0.0"` fixo no arquivo, enquanto o README declara o `package.json` como fonte única.
- `package.json`: `"name": "docs"`, `"version": "1.0.0"`. O produto desktop se chama "Zeile Notebook" e deriva de um pacote chamado `docs`.
- `unsafe { std::env::set_var(…) }` em `embedded_pg.rs`, em contexto async — devolver a URL e passá-la adiante em vez de mutar o ambiente.
- `dotenvy::dotenv()` dentro de `embedded_pg::ensure_running()` — segundo lugar carregando env; reconciliar com o `env-vars.md` do Q61.
- `BASE_URL` continua exportado de `lib/api/base.ts` sem ser usado para montar URL — resíduo, e é justamente o que `login-form`/`profile-form` importam (furo 2 do Q99).
- `wait_for_port` no timeout apenas `log::warn!` e cria a janela: tela branca sem erro. Trocar pelo `health/ready` do Q67 e, falhando, mostrar erro ao usuário.

### ⚠ Restrição de sequenciamento que a branch impõe

`origin/tauri` está 13 commits à frente e toca 72 arquivos, entre eles `lib/api/base.ts`,
`context/auth-context.tsx`, `components/login-form.tsx`, `components/signup-form.tsx`,
`hooks/use-presence.ts` e os 15 `lib/api/*-service.ts`.

A **etapa 15** do checklist (Q20/Q24 — `features/` + pastas de topo) move 189 componentes,
10 hooks e 3 contexts. Fazer isso na `main` com a branch `tauri` aberta produz conflito
em quase todo arquivo que ela toca, sem resolução mecânica possível.

**Consequência: a `tauri` precisa entrar na `main` na etapa 9, antes da 15** — ou aceitar refazer
o trabalho de 13 commits sobre a nova estrutura. E como o desktop introduziu decisões 🔴
próprias (Q98, Q99, Q102, Q103), o merge deve vir depois delas, não antes.

O checklist consolidado, já com estas etapas na posição correta, está em [plano-execucao.md](plano-execucao.md).
