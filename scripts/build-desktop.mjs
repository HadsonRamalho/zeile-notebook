import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  if (eq !== -1) return hit.slice(eq + 1);
  const idx = process.argv.indexOf(hit);
  const next = process.argv[idx + 1];
  return next && !next.startsWith("--") ? next : "";
}

const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
const DEFAULT_BUNDLES = {
  linux: "deb,rpm,appimage",
  win32: "nsis,msi",
  darwin: "dmg",
};

const target = arg("target");
const bundles = arg("bundles") || DEFAULT_BUNDLES[process.platform];

function hostTriple() {
  try {
    const out = execSync("rustc -vV", { encoding: "utf8" });
    return out.match(/^host:\s*(.+)$/m)?.[1]?.trim() ?? process.platform;
  } catch {
    return process.platform;
  }
}

function syncCargoVersion() {
  const path = join(root, "src-tauri", "Cargo.toml");
  const lines = readFileSync(path, "utf8").split("\n");
  let inPackage = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("[")) inPackage = lines[i].trim() === "[package]";
    if (inPackage && /^version\s*=/.test(lines[i])) {
      lines[i] = `version = "${version}"`;
      break;
    }
  }
  writeFileSync(path, lines.join("\n"));
}

const INSTALLER_EXT = [".deb", ".rpm", ".AppImage", ".msi", ".exe", ".dmg"];

function collect(bundleDir, destDir) {
  if (!existsSync(bundleDir)) return [];
  const copied = [];
  for (const format of readdirSync(bundleDir)) {
    const formatDir = join(bundleDir, format);
    if (!statSync(formatDir).isDirectory()) continue;
    for (const file of readdirSync(formatDir)) {
      if (!INSTALLER_EXT.some((ext) => file.endsWith(ext))) continue;
      const dest = join(destDir, file);
      copyFileSync(join(formatDir, file), dest);
      copied.push(dest);
    }
  }
  return copied;
}

console.log(`> Zeile Desktop build — versão ${version}${target ? ` — target ${target}` : ""}`);
syncCargoVersion();

const bundleDir = target
  ? join(root, "src-tauri", "target", target, "release", "bundle")
  : join(root, "src-tauri", "target", "release", "bundle");
const destDir = join(root, "dist", version, target || hostTriple());

rmSync(bundleDir, { recursive: true, force: true });
rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

const tauriArgs = ["tauri", "build"];
if (target) tauriArgs.push("--target", target);
if (bundles) tauriArgs.push("--bundles", bundles);
execSync(`pnpm ${tauriArgs.join(" ")}`, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    APPIMAGE_EXTRACT_AND_RUN: "1",
    NO_STRIP: "1",
  },
});

const artifacts = collect(bundleDir, destDir);
console.log(`\n> ${artifacts.length} artefato(s) em dist/${version}/${target || hostTriple()}:`);
for (const a of artifacts) {
  const mb = (statSync(a).size / 1024 / 1024).toFixed(1);
  console.log(`  ${a.slice(root.length + 1)}  (${mb}M)`);
}
