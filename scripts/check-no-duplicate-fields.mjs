#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const FILES = [
  "lib/api/generated/openapi-types.ts",
  "lib/api/generated/ws-message.ts",
  "lib/api/generated/error-codes.ts",
];

const FIELD_LINE = /^\s*(\w+)\??:\s/;

function normalize(name) {
  return name.toLowerCase().replace(/_/g, "");
}

function checkFile(relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) return [];

  const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
  const violations = [];
  const stack = [new Map()];

  for (const line of lines) {
    for (const ch of line) {
      if (ch === "{") stack.push(new Map());
      if (ch === "}") stack.pop();
    }

    const match = line.match(FIELD_LINE);
    if (!match) continue;

    const raw = match[1];
    const key = normalize(raw);
    const scope = stack[stack.length - 1];
    if (!scope) continue;

    const existing = scope.get(key);
    if (existing && existing !== raw) {
      violations.push(
        `${relPath}: "${existing}" e "${raw}" normalizam para "${key}"`,
      );
    } else {
      scope.set(key, raw);
    }
  }

  return violations;
}

const allViolations = FILES.flatMap(checkFile);

if (allViolations.length > 0) {
  console.error("Campos gerados que normalizam para o mesmo identificador:");
  for (const v of allViolations) {
    console.error(`  - ${v}`);
  }
  console.error(
    'Isso viola a regra "um conceito, uma grafia" (docs/decisoes.md) — unifique a grafia no Rust (rename_all no struct, nunca rename campo a campo) e regenere.',
  );
  process.exit(1);
}

console.log(
  "Nenhum par de campos gerados normaliza para o mesmo identificador.",
);
