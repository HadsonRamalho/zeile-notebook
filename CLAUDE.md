# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Zeile Notebook is a block-based interactive notebook platform (Markdown + UI + native code execution). Two parts in one repo:

- **Frontend** (`/`): Next.js 16 (App Router) + React 19 + fumadocs (docs site) + next-intl (pt-br/en). Root of the repo.
- **Backend** (`rust-server/`): Axum + Diesel(-async)/PostgreSQL REST API, separate Cargo crate. Handles auth, notebooks, teams, sync (Automerge CRDT), websockets, and sandboxed code execution.

## Commands

Frontend (run from repo root):
```
pnpm dev              # Next.js dev server
pnpm build            # next build + serwist (PWA) build
pnpm lint             # biome check
pnpm format           # biome format --write
pnpm types:check       # fumadocs-mdx + next typegen + tsc --noEmit
pnpm generate-docs    # node scripts/run-generate.mjs (OpenAPI docs generation from rust-server)
```
No test runner is configured for the frontend.

Backend (run from `rust-server/`):
```
cargo run                                    # start server on 0.0.0.0:3099
diesel setup                                 # apply migrations (needs DATABASE_URL in rust-server/.env)
cargo test                                    # run tests
cargo test <name>                             # run a single test
```
Swagger UI is served at `/docs` once the server is running (utoipa-generated).

### Regenerating generated artifacts after touching `rust-server/`

Any change to `rust-server/src/**` that affects an HTTP handler's `#[utoipa::path]`, a WebSocket
message type (`models/ws_message.rs`), `ApiError`, or the DB schema/migrations **must** be followed
by regenerating the corresponding TypeScript/Rust artifact and committing the result. `.github/workflows/generators.yml`
runs the `--check` variant of each of these on every PR touching `rust-server/src/**`, `Cargo.toml`/`Cargo.lock`,
or `lib/api/generated/**` — a stale generated file fails CI, it doesn't just warn.

```
pnpm generate:openapi-types        # lib/api/generated/openapi-types.ts — run after adding/changing a #[utoipa::path]
pnpm generate:ws-types             # lib/api/generated/ws-message.ts — run after touching models/ws_message.rs or ChatMessage
pnpm generate:error-codes          # lib/api/generated/error-codes.ts — run after adding/changing an ApiError variant
pnpm check:no-duplicate-fields     # guards that no two generated field names normalize to the same identifier
```

Each has a `:check` counterpart (`pnpm generate:openapi-types:check`, etc.) that regenerates in memory
and fails with a diff instead of writing — that's what CI runs. Run the non-`:check` version locally
and commit the diff before opening the PR. `rust-server/src/schema.rs` follows the same rule but has
its own guard (`rust-server/scripts/check_schema.sh`, run in the `rust-test` job of `ci.yml`): after
adding a migration, regenerate it with `diesel print-schema --database-url "$DATABASE_URL" > rust-server/src/schema.rs`.
Full regime and rationale: `docs/decisoes.md#regime-do-artefato-gerado`, `lib/api/generated/README.md`.

## Architecture

### Frontend
- `app/[lang]/...` — all routed pages live under the locale segment; `i18n/request.ts` restricts locales to `pt-br` (default) and `en`, messages in `messages/*.json`.
- `content/docs` + `source.config.ts` + `.source/` — fumadocs MDX docs collection (auto-generated `.source` files, don't hand-edit).
- `components/notebook/` — the notebook editor itself:
  - `blocks/` has one subfolder per executable block type (`rust`, `go`, `python`, `cpp`, `zig`, `tsx`, `drawing`, `text`, `default`), each compiled/run differently (native sandboxed execution for Rust/Go/C++/Zig via the backend, Pyodide in-browser for Python — see `lib/pyodideStore.ts`).
  - `collaboration/` — realtime presence, live cursors, chat; backed by `hooks/use-presence.ts` and the backend websocket controller.
  - `notebook-context.tsx` / `notebook-manager.tsx` — client-side notebook state; sync uses Automerge CRDT (`@automerge/automerge`, `hooks/use-automerge-sync.ts`) reconciled against the backend `sync` controller.
- `lib/api/*-service.ts` — one file per backend resource (auth, notebook, teams, admin, user, run-rust); all funnel through `lib/api/base.ts` and `lib/api/handle-api-error.ts`.
- `lib/schemas/*` — Zod schemas mirroring backend validation, paired with `lib/types/*-types.ts`.

### Backend (`rust-server/`)
- `src/routes/` defines route trees per resource (`notebook`, `team`, `user`, `admin`, `run_rust`, `docs`); assembled in `src/routes/mod.rs` → `init_routes()` called from `main.rs`.
- `src/controllers/` holds handler logic per resource; `websocket.rs` handles realtime presence/collab connections, `sync.rs` handles Automerge CRDT sync endpoints.
- `src/models/` — Diesel models; `src/schema.rs` is the Diesel-generated schema (regenerate via `diesel print-schema` after migrations, don't hand-edit).
- `src/sec/mod.rs` — static AST/regex analysis (`verify_code`) that blocks dangerous tokens/modules (`unsafe`, `fs::`, `process::`, `Command::`, etc.) before any user code is compiled/run. This is the first of several sandboxing layers described in the root `README.md` (bwrap container isolation, WASI for Rust, prlimit, per-session UUID workspaces). When touching code execution paths, preserve/extend this layered model rather than relying on a single check.
- Auth: JWT (`jsonwebtoken`) plus OAuth2; email via `lettre`; push notifications via `web-push`.
- `migrations/` — Diesel migrations; keep `src/schema.rs` in sync after adding one.

## Conventions
- Linting/formatting on the frontend is Biome (`biome.json`), not ESLint/Prettier — organize-imports assist is on, so don't hand-order imports.
- Package manager is pnpm (`pnpm-workspace.yaml`, `pnpm-lock.yaml` present) — don't use npm/yarn commands even though a `package-lock.json` also exists.
