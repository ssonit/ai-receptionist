/**
 * `eve build` publishes compile artifacts under `.output/.eve/`.
 * Next/withEve runtime reads `.eve/compile/` at the app root.
 * Sync after build so local chat can load the agent bundle.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromBase = join(root, ".output", ".eve");
const toBase = join(root, ".eve");

const folders = ["compile", "discovery"];

if (!existsSync(join(fromBase, "compile", "compiled-agent-manifest.json"))) {
  console.error(
    "[sync-eve-compile] missing .output/.eve/compile — run `npx eve build` first",
  );
  process.exit(1);
}

mkdirSync(toBase, { recursive: true });

for (const name of folders) {
  const from = join(fromBase, name);
  const to = join(toBase, name);
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`[sync-eve-compile] ${name} -> .eve/${name}`);
}
