#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputFile = path.join(repoRoot, "lib/api/generated/error-codes.ts");
const check = process.argv.includes("--check");

function exportCodes() {
  const specPath = path.join(os.tmpdir(), `zeile-error-codes-${Date.now()}.json`);
  execFileSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      path.join(repoRoot, "rust-server/Cargo.toml"),
      "--quiet",
      "--",
      "export-error-codes",
      specPath,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  const codes = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  fs.rmSync(specPath);
  return codes;
}

const codes = exportCodes();

const header = `/**
 * @generated
 * Gerado por \`pnpm generate:error-codes\` a partir de
 * rust-server/src/models/error.rs (ApiError::ALL_ERROR_CODES). Não editar
 * à mão — rode o comando de novo e commite o resultado.
 */\n\n`;

const body = `export const ERROR_CODES = [
${codes.map((c) => `  "${c}",`).join("\n")}
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
`;

const generated = header + body;

const tmpFile = path.join(os.tmpdir(), `zeile-error-codes-${Date.now()}.ts`);
fs.writeFileSync(tmpFile, generated);
execFileSync("pnpm", ["biome", "format", "--write", tmpFile], {
  cwd: repoRoot,
  stdio: "inherit",
});
const formatted = fs.readFileSync(tmpFile, "utf-8");
fs.rmSync(tmpFile);

if (check) {
  const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf-8") : null;
  if (current !== formatted) {
    console.error(
      `${path.relative(repoRoot, outputFile)} está divergente de ApiError::ALL_ERROR_CODES.`,
    );
    console.error("Rode `pnpm generate:error-codes` e commite o resultado.");
    process.exit(1);
  }
  console.log("error-codes.ts confere com o Rust.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, formatted);
console.log(`Escrito ${path.relative(repoRoot, outputFile)}`);
