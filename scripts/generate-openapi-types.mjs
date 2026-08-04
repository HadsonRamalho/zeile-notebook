#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputFile = path.join(repoRoot, "lib/api/generated/openapi-types.ts");
const check = process.argv.includes("--check");

function exportOpenApiSpec() {
  const specPath = path.join(os.tmpdir(), `zeile-openapi-${Date.now()}.json`);
  execFileSync(
    "cargo",
    [
      "run",
      "--manifest-path",
      path.join(repoRoot, "rust-server/Cargo.toml"),
      "--quiet",
      "--",
      "export-openapi",
      specPath,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
  fs.rmSync(specPath);
  return spec;
}

const header = `/**
 * @generated
 * Gerado por \`pnpm generate:openapi-types\` a partir do OpenAPI exportado
 * pelo rust-server (\`cargo run -- export-openapi\`). Não editar à mão —
 * rode o comando de novo e commite o resultado.
 *
 * Mapeamento: veja lib/api/generated/README.md
 */\n\n`;

const spec = exportOpenApiSpec();
const ast = await openapiTS(spec);
const generated = header + astToString(ast);

const tmpFile = path.join(os.tmpdir(), `zeile-openapi-types-${Date.now()}.ts`);
fs.writeFileSync(tmpFile, generated);
execFileSync("pnpm", ["biome", "format", "--write", tmpFile], {
  cwd: repoRoot,
  stdio: "inherit",
});
const formatted = fs.readFileSync(tmpFile, "utf-8");
fs.rmSync(tmpFile);

if (check) {
  const current = fs.existsSync(outputFile)
    ? fs.readFileSync(outputFile, "utf-8")
    : null;
  if (current !== formatted) {
    console.error(
      `${path.relative(repoRoot, outputFile)} está divergente do OpenAPI do rust-server.`,
    );
    console.error("Rode `pnpm generate:openapi-types` e commite o resultado.");
    process.exit(1);
  }
  console.log("openapi-types.ts confere com o OpenAPI do rust-server.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, formatted);
console.log(`Escrito ${path.relative(repoRoot, outputFile)}`);
