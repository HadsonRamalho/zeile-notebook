# Zeile Desktop (Tauri)

Shell desktop que embarca o backend Rust local e carrega o frontend Next.js. Parte da
Fase 3 do `ZEILE_DESKTOP.md`.

## Como funciona (Opção A — Next standalone como sidecar Node)

- No `setup` (`src/lib.rs`), o app sobe o backend local (`DATABASE_TLS=off`, `PORT=3099` —
  loopback sem TLS, ver Fase 1) e, **em release**, o servidor Next standalone via Node
  (`PORT=3000`). Espera a porta 3000 responder (até 30s) e só então cria a janela
  apontando para `http://localhost:3000`. Ambos os processos são mortos no `ExitRequested`.
- Em **dev** o servidor Next vem do `beforeDevCommand` (`pnpm dev`); o `lib.rs` só sobe o
  backend (path via `ZEILE_BACKEND_BIN`, default `../rust-server/target/debug/rust-server`).
- Em **release** os binários e o payload do frontend são recursos empacotados
  (`resources/{node, backend/rust-server, next/}`), montados pelo `scripts/stage-desktop.mjs`.
- Como o frontend detecta `window.__TAURI__`, `isDesktopRuntime()` fica `true` e o roteador
  (`lib/runtime/router.ts`) resolve as capacidades local-capazes para `127.0.0.1:3099`.

## Rodar em dev

Pré-requisitos: `webkit2gtk-4.1` (presente), um PostgreSQL local, e o backend compilado.

```sh
cargo build --manifest-path rust-server/Cargo.toml
export DATABASE_URL="postgres://USER:PASS@127.0.0.1:5432/zeile?sslmode=disable"
pnpm desktop:dev
```

## Empacotar (produção)

`beforeBuildCommand` (roda automaticamente em qualquer `tauri build`):
`cargo build --release` (backend) → `NEXT_DESKTOP=1 pnpm build` (Next standalone) →
`node scripts/stage-desktop.mjs` → bundle.

O staging empacota o frontend como **`resources/next.tar.gz`** (preservando a árvore de
symlinks do pnpm, que é relativa e resolve ao extrair — evita o bug de symlink quebrado do
bundler) + `resources/node` + `resources/backend/rust-server`. O `lib.rs` extrai o tarball
no primeiro launch para `app_local_data_dir/next` (com `.stamp` de versão p/ reextrair em
upgrades). Recursos ~195M; instalador `.deb`/`.rpm` ~94M.

### Build versionado (host OS)

```sh
pnpm desktop:release                       # host OS, formatos padrão, → dist/<versão>/<triple>/
pnpm desktop:release -- --bundles deb      # só .deb
pnpm desktop:release -- --target <triple>  # arch específica (toolchain necessária)
```

`scripts/build-desktop.mjs` usa a versão do `package.json` como **fonte única** (sincroniza
`src-tauri/Cargo.toml`; o `tauri.conf.json` lê `../package.json`), limpa artefatos antigos e
coleta os instaladores em `dist/<versão>/<triple>/`.

### Multi-OS (Windows/macOS/Linux)

Cross-compile entre OSes não é viável numa máquina só. Use o workflow
`.github/workflows/desktop-release.yml` (matriz `tauri-action`, um runner por OS), disparado
por tag `v*` → cria um GitHub Release em rascunho. Cobre Linux (`deb`/`rpm`/`appimage`),
macOS (`dmg`) e Windows (`nsis`/`msi`).

O pipeline é cross-platform: a orquestração vive em `scripts/prepare-desktop.mjs` (Node,
sem sintaxe de shell POSIX), `stage-desktop.mjs` usa os nomes de binário por plataforma
(`node.exe`/`rust-server.exe` no Windows) e `lib.rs` resolve os caminhos com `.exe` via
`cfg!(windows)`.

**Ponto a validar no Windows (sem máquina Windows aqui):** o frontend é empacotado como
`next.tar.gz` e extraído no 1º launch via `tar`. Windows 10 1803+ traz `tar.exe` (bsdtar).
O risco é a **criação de symlinks na extração** (a árvore do pnpm) exigir Developer Mode /
privilégio no Windows. Se falhar, alternativas: (a) ativar Developer Mode; (b) gerar o
standalone com `node-linker=hoisted` (sem symlinks); (c) dereferenciar a árvore no staging.
Validar `pnpm desktop:release` num Windows real antes de publicar o alvo.

## PostgreSQL embarcado

Backend buildado com `--features embedded-pg` (o `prepare-desktop.mjs` já faz isso):
`rust-server/src/embedded_pg.rs` baixa/instala/sobe um PostgreSQL local no startup, cria o
banco `zeile` e define `DATABASE_URL`/`DATABASE_TLS=off`. Data dir persistente via
`ZEILE_PG_DATA` (o `lib.rs` passa `app_local_data_dir/pg`).

**Fallback:** se `DATABASE_URL` já estiver definido, o embarcado é ignorado e usa-se o
Postgres externo — útil no dev, no host LAN, ou quando o embarcado não roda.

**Caveat de distro (importante):** os binários baixados (theseus/zonky) ligam contra
`libxml2.so.2`. Debian/Ubuntu/Fedora (alvos `.deb`/`.rpm`) têm essa soname → OK. **Arch e
outras rolling têm `libxml2.so.16`** → o embarcado falha no initdb. No dev Arch, use o
fallback (`DATABASE_URL` para um Postgres local) ou um shim de compat. Para offline total
(LAN), avaliar a feature `bundled` do `postgresql_embedded` (embute o PG no binário).

## AppImage

Incluído nos alvos Linux (`deb`, `rpm`, `appimage`). O `failed to run linuxdeploy` que
ocorria antes é resolvido pelas envs `APPIMAGE_EXTRACT_AND_RUN=1` e `NO_STRIP=1`, aplicadas
em `scripts/build-desktop.mjs` e no workflow de CI.

É o formato recomendado para distros não-Debian/Fedora (Arch, Garuda, openSUSE...), já que
`.deb`/`.rpm` não são instaláveis nativamente nelas. Validado rodando em Garuda (Arch).

## Execução de código compilado por plataforma

`exec-compiled` (Rust/Go/C++/Zig) depende de `bwrap`/`prlimit`/`wasmtime` — Linux. O código
de execução está atrás de `#[cfg(unix)]` (o `pre_exec`/`setpgid` em `file/mod.rs`) e os
handlers `/run*` (`http/mod.rs`) retornam "não suportado nesta plataforma" via
`if !cfg!(unix)`. No Windows/macOS-não-unix os blocos compilados ficam indisponíveis;
Python/JS continuam (rodam no webview, sem backend). Compila em todas as plataformas.

## Build no Windows — dependências

- Rust + **MSVC Build Tools** ("Desktop development with C++").
- Node 20+ e pnpm.
- **Perl (Strawberry) + NASM** — o `Cargo.toml` do backend tem `openssl-sys` (vendored) e
  `pq-sys` (bundled), que compilam OpenSSL/libpq do zero. O CI instala NASM via
  `ilammy/setup-nasm`; Perl já vem nos runners Windows.
- WebView2: só runtime (não precisa p/ buildar).

Depois: `pnpm install` → `pnpm desktop:release` (gera `nsis`/`msi` em `dist/<versão>/`).

## Verificado neste ambiente (headless)

`cargo check` do crate compila; `NEXT_DESKTOP=1 pnpm build` gera `.next/standalone`;
`stage-desktop.mjs` monta os recursos corretamente. O `tauri build`/`dev` completo com
janela GUI deve ser rodado na máquina do usuário.
