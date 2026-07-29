import { execSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const isWin = process.platform === "win32";
const backendName = isWin ? "rust-server.exe" : "rust-server";
const nodeName = isWin ? "node.exe" : "node";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const resources = join(root, "src-tauri", "resources");
const backendDir = join(resources, "backend");
const nextArchive = join(resources, "next.tar.gz");

const standalone = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");
const backendBin = join(root, "rust-server", "target", "release", backendName);

if (!existsSync(standalone)) {
  console.error(
    "Falta .next/standalone. Rode 'NEXT_DESKTOP=1 pnpm build' antes do staging.",
  );
  process.exit(1);
}
if (!existsSync(backendBin)) {
  console.error(
    "Falta o binário do backend. Rode 'cargo build --release --manifest-path rust-server/Cargo.toml'.",
  );
  process.exit(1);
}

rmSync(nextArchive, { force: true });
rmSync(backendDir, { recursive: true, force: true });
rmSync(join(resources, nodeName), { force: true });
mkdirSync(backendDir, { recursive: true });

cpSync(staticDir, join(standalone, ".next", "static"), { recursive: true });
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}

function materializeDanglingLinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (existsSync(full)) continue;
      const source = join(root, relative(standalone, full));
      rmSync(full, { force: true });
      if (!existsSync(source)) {
        console.warn(`link sem alvo removido: ${relative(standalone, full)}`);
        continue;
      }
      cpSync(realpathSync(source), full, { recursive: true, dereference: true });
    } else if (entry.isDirectory()) {
      materializeDanglingLinks(full);
    }
  }
}

materializeDanglingLinks(standalone);

const tar = spawnSync(
  "tar",
  ["czf", nextArchive, "-C", standalone, "."],
  { stdio: "inherit" },
);
if (tar.status !== 0) {
  console.error("falha ao criar next.tar.gz (tar ausente? Windows 10 1803+ tem tar.exe)");
  process.exit(tar.status ?? 1);
}

const stagedBackend = join(backendDir, backendName);
copyFileSync(backendBin, stagedBackend);
if (!isWin) chmodSync(stagedBackend, 0o755);

const stagedNode = join(resources, nodeName);
copyFileSync(process.execPath, stagedNode);
if (!isWin) chmodSync(stagedNode, 0o755);

let size = "?";
try {
  size = execSync(`du -sh "${resources}"`).toString().trim().split("\t")[0];
} catch {}
console.log(`Recursos do desktop montados em ${resources} (${size})`);
