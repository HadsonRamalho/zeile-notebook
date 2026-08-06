#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const LOCALES = ["en", "pt-br"];
const MESSAGES_DIR = path.join(repoRoot, "messages");
const ERROR_CODES_FILE = path.join(
  repoRoot,
  "lib/api/generated/error-codes.ts",
);
const API_ERRORS_NAMESPACE = "api_errors";

const ORPHAN_EXEMPT_PREFIXES = ["api_errors.", "login.errors.", "perm."];

const SOURCE_DIRS = [
  "app",
  "components",
  "context",
  "domain",
  "features",
  "hooks",
  "lib",
  "schemas",
  "stores",
  "types",
];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const EXCLUDED_DIR_SEGMENTS = [
  "node_modules",
  ".next",
  "generated",
  "vendor",
  ".source",
];

function loadMessages(locale) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function flattenKeys(obj, prefix = []) {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const nextPrefix = [...prefix, k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, nextPrefix));
    } else {
      keys.push(nextPrefix.join("."));
    }
  }
  return keys;
}

function checkParity(messagesByLocale) {
  const violations = [];
  const keysByLocale = new Map(
    LOCALES.map((locale) => [
      locale,
      new Set(flattenKeys(messagesByLocale.get(locale))),
    ]),
  );

  for (let i = 0; i < LOCALES.length; i++) {
    for (let j = 0; j < LOCALES.length; j++) {
      if (i === j) continue;
      const a = LOCALES[i];
      const b = LOCALES[j];
      const onlyInA = [...keysByLocale.get(a)].filter(
        (k) => !keysByLocale.get(b).has(k),
      );
      for (const key of onlyInA) {
        violations.push(`"${key}" existe em ${a}.json mas falta em ${b}.json`);
      }
    }
  }

  return violations;
}

function walkSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIR_SEGMENTS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectQuotedStringLiterals() {
  const literals = new Set();
  const stringLiteral = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;

  for (const dir of SOURCE_DIRS) {
    const fullDir = path.join(repoRoot, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of walkSourceFiles(fullDir)) {
      const content = fs.readFileSync(file, "utf-8");
      for (const match of content.matchAll(stringLiteral)) {
        literals.add(match[1] ?? match[2] ?? "");
      }
    }
  }

  return literals;
}

function checkOrphanKeys(messagesByLocale, literals) {
  const violations = [];
  const paths = flattenKeys(messagesByLocale.get("pt-br"));

  for (const fullPath of paths) {
    if (ORPHAN_EXEMPT_PREFIXES.some((prefix) => fullPath.startsWith(prefix))) {
      continue;
    }

    const segments = fullPath.split(".");
    let used = false;

    for (let dropCount = 1; dropCount < segments.length + 1; dropCount++) {
      const candidate = segments.slice(dropCount).join(".");
      if (candidate && literals.has(candidate)) {
        used = true;
        break;
      }
    }

    if (!used && literals.has(fullPath)) {
      used = true;
    }

    if (!used) {
      violations.push(fullPath);
    }
  }

  return violations;
}

function loadErrorCodes() {
  if (!fs.existsSync(ERROR_CODES_FILE)) return [];
  const content = fs.readFileSync(ERROR_CODES_FILE, "utf-8");
  const match = content.match(/ERROR_CODES = \[([\s\S]*?)\] as const/);
  if (!match) return [];
  return [...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

function checkErrorCodesHaveKeys(messagesByLocale, errorCodes) {
  const violations = [];
  for (const locale of LOCALES) {
    const apiErrors = messagesByLocale.get(locale)[API_ERRORS_NAMESPACE] ?? {};
    for (const code of errorCodes) {
      if (!(code in apiErrors)) {
        violations.push(
          `"${code}" não tem chave em ${API_ERRORS_NAMESPACE} de ${locale}.json`,
        );
      }
    }
  }
  return violations;
}

function report(title, violations) {
  if (violations.length === 0) {
    console.log(`✓ ${title}`);
    return true;
  }
  console.error(`✗ ${title}`);
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  return false;
}

const messagesByLocale = new Map(
  LOCALES.map((locale) => [locale, loadMessages(locale)]),
);

const parityViolations = checkParity(messagesByLocale);
const literals = collectQuotedStringLiterals();
const orphanViolations = checkOrphanKeys(messagesByLocale, literals);
const errorCodes = loadErrorCodes();
const errorCodeViolations = checkErrorCodesHaveKeys(
  messagesByLocale,
  errorCodes,
);

const results = [
  report("Paridade de chaves entre locales", parityViolations),
  report("Nenhuma chave órfã (definida mas não usada)", orphanViolations),
  report(
    "Todo errorCode gerado tem chave nos dois locales",
    errorCodeViolations,
  ),
];

if (results.some((ok) => !ok)) {
  process.exit(1);
}
