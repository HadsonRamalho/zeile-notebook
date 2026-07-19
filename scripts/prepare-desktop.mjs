import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: isWin,
  });
  if (r.status !== 0) {
    console.error(`> falhou: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

run("cargo", [
  "build",
  "--release",
  "--manifest-path",
  "rust-server/Cargo.toml",
  "--features",
  "embedded-pg",
]);
run("pnpm", ["build"], { NEXT_DESKTOP: "1" });
run("node", ["scripts/stage-desktop.mjs"]);
