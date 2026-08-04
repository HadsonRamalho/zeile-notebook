#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_SERVER_DIR="$(dirname "$SCRIPT_DIR")"
cd "$RUST_SERVER_DIR"

DATABASE_URL="${SCHEMA_CHECK_DATABASE_URL:-${TEST_MIGRATION_DATABASE_URL:-}}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "SCHEMA_CHECK_DATABASE_URL (ou TEST_MIGRATION_DATABASE_URL) precisa apontar para um Postgres vazio." >&2
  exit 1
fi

diesel migration run --database-url "$DATABASE_URL" --migration-dir migrations >/dev/null

GENERATED="$(mktemp)"
trap 'rm -f "$GENERATED"' EXIT

diesel print-schema --database-url "$DATABASE_URL" > "$GENERATED"

if ! diff -u src/schema.rs "$GENERATED" >/tmp/schema-check.diff; then
  echo "src/schema.rs está divergente das migrations. Rode:" >&2
  echo "  diesel print-schema --database-url \"\$DATABASE_URL\" > rust-server/src/schema.rs" >&2
  echo "e commite o resultado. Diff:" >&2
  cat /tmp/schema-check.diff >&2
  exit 1
fi

echo "src/schema.rs confere com as migrations."
