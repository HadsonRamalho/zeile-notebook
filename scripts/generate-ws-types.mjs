#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(repoRoot, "lib/api/generated");
const check = process.argv.includes("--check");

function exportTypes() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zeile-ws-types-"));
  execFileSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      path.join(repoRoot, "rust-server/Cargo.toml"),
      "--quiet",
      "--",
      "export-ws-types",
      tmpDir,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return tmpDir;
}

function readAllFiles(dir, base = dir) {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      entries.push(...readAllFiles(full, base));
    } else {
      entries.push(path.relative(base, full));
    }
  }
  return entries;
}

const header = `/**
 * @generated
 * Gerado por \`pnpm generate:ws-types\` a partir dos tipos Rust anotados com
 * #[derive(ts_rs::TS)] em rust-server/src/models/ws_message.rs (payload das
 * mensagens de texto do WebSocket) e chat.rs (ChatMessage). Não editar à
 * mão — rode o comando de novo e commite o resultado.
 */\n\n`;

const tmpDir = exportTypes();
const relFiles = readAllFiles(tmpDir).sort();

const generated = {};
for (const rel of relFiles) {
  const outPath = path.join(outDir, rel);
  const tmpFile = path.join(
    os.tmpdir(),
    `zeile-ws-fmt-${Date.now()}-${rel.replace(/[\\/]/g, "_")}`,
  );
  const raw = fs.readFileSync(path.join(tmpDir, rel), "utf-8");
  fs.writeFileSync(tmpFile, header + raw);
  execFileSync("pnpm", ["biome", "format", "--write", tmpFile], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  generated[outPath] = fs.readFileSync(tmpFile, "utf-8");
  fs.rmSync(tmpFile);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

if (check) {
  let ok = true;
  for (const [outPath, content] of Object.entries(generated)) {
    const current = fs.existsSync(outPath)
      ? fs.readFileSync(outPath, "utf-8")
      : null;
    if (current !== content) {
      console.error(
        `${path.relative(repoRoot, outPath)} está divergente dos tipos Rust.`,
      );
      ok = false;
    }
  }
  if (!ok) {
    console.error("Rode `pnpm generate:ws-types` e commite o resultado.");
    process.exit(1);
  }
  console.log("Tipos de WebSocket conferem com o Rust.");
  process.exit(0);
}

for (const [outPath, content] of Object.entries(generated)) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
  console.log(`Escrito ${path.relative(repoRoot, outPath)}`);
}
