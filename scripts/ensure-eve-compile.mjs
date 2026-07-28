/**
 * Ensure `.eve/compile/compiled-agent-manifest.json` exists before Next/withEve.
 * Rebuilds via `eve build` + sync only when missing.
 *
 * Also clears a stale `.eve/next-dev-server.json` so withEve does not proxy
 * forever to a dead sidecar origin (common after crashed `eve dev` on Windows).
 *
 * If `EVE_BASE_URL` is pinned (see .env.local), also ensures that fixed-port
 * sidecar is up. Pinning bypasses withEve's internal spawn-on-random-port +
 * in-memory origin cache (node_modules/eve/dist/src/public/next/server.js),
 * which never re-validates once resolved — a sidecar that dies mid-session
 * otherwise leaves `next dev` proxying to a dead origin forever (the /chat
 * demo hangs on "opening sandbox session..." with no error). A pinned origin
 * fails fast (connection refused) instead, and can be restarted independently
 * of `next dev` via `npm run dev:eve:pinned`.
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = join(root, ".eve", "compile", "compiled-agent-manifest.json");
const registryPath = join(root, ".eve", "next-dev-server.json");
const sidecarLogPath = join(root, ".eve", "eve-dev-sidecar.log");

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function processAlive(pid) {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function originHealthy(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const url = new URL("/eve/v1/health", origin).href;
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal .env.local / .env reader — avoids a dotenv dependency for one key. */
function readEnvValue(name) {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(
      new RegExp(`^${name}=(.*)$`, "m"),
    );
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * When EVE_BASE_URL is pinned, make sure that fixed-port sidecar is actually
 * up — spawn it detached (survives this script exiting / `next dev` restarts)
 * if it isn't. Without this, withEve just proxies straight to the pinned URL
 * and a cold/dead sidecar means every chat turn hangs with connection refused
 * instead of a clear error.
 */
async function ensurePinnedEveSidecar() {
  const base = readEnvValue("EVE_BASE_URL");
  if (!base) return;

  if (await originHealthy(base)) {
    console.log(`[ensure-eve-compile] pinned eve sidecar ok at ${base}`);
    return;
  }

  const port = new URL(base).port || "2000";
  console.log(
    `[ensure-eve-compile] pinned eve sidecar not responding at ${base} — starting \`eve dev --port ${port}\`...`,
  );

  const { openSync } = await import("node:fs");
  const logFd = openSync(sidecarLogPath, "a");
  const child = spawn("npx", ["eve", "dev", "--no-ui", "--port", port], {
    cwd: root,
    detached: true,
    env: process.env,
    shell: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await originHealthy(base)) {
      console.log(`[ensure-eve-compile] pinned eve sidecar ready at ${base}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.warn(
    `[ensure-eve-compile] pinned eve sidecar did not become healthy within 30s — check ${sidecarLogPath}`,
  );
}

/**
 * Drop registry when pid is dead or /eve/v1/health fails so the next rewrite
 * path can spawn a fresh `eve dev` instead of hanging on a dead proxy target.
 */
async function clearStaleEveDevRegistry() {
  if (!existsSync(registryPath)) return;

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch {
    unlinkSync(registryPath);
    console.warn(
      "[ensure-eve-compile] removed corrupt .eve/next-dev-server.json",
    );
    return;
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.origin !== "string" ||
    typeof parsed.appRoot !== "string"
  ) {
    unlinkSync(registryPath);
    console.warn(
      "[ensure-eve-compile] removed invalid .eve/next-dev-server.json",
    );
    return;
  }

  const pidOk = processAlive(parsed.pid ?? null);
  const healthy = await originHealthy(parsed.origin);
  if (pidOk && healthy) {
    console.log(
      `[ensure-eve-compile] eve sidecar ok at ${parsed.origin} (pid ${parsed.pid})`,
    );
    return;
  }

  unlinkSync(registryPath);
  console.warn(
    `[ensure-eve-compile] cleared stale next-dev-server registry (pidAlive=${pidOk}, healthy=${healthy}, was ${parsed.origin})`,
  );
}

run("node", ["./scripts/patch-eve-package-resolve.mjs"]);
await clearStaleEveDevRegistry();
await ensurePinnedEveSidecar();

if (existsSync(manifest)) {
  console.log("[ensure-eve-compile] compile artifacts present");
  process.exit(0);
}

console.log("[ensure-eve-compile] missing compile — running eve build + sync");
run("npx", ["eve", "build"]);
run("node", ["./scripts/sync-eve-compile.mjs"]);
