/**
 * Ensure `.eve/compile/compiled-agent-manifest.json` exists before Next/withEve.
 * Rebuilds via `eve build` + sync only when missing.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = join(root, ".eve", "compile", "compiled-agent-manifest.json");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("node", ["./scripts/patch-eve-package-resolve.mjs"]);

if (existsSync(manifest)) {
  console.log("[ensure-eve-compile] compile artifacts present");
  process.exit(0);
}

console.log("[ensure-eve-compile] missing compile — running eve build + sync");
run("npx", ["eve", "build"]);
run("node", ["./scripts/sync-eve-compile.mjs"]);
