/**
 * Eve 0.27 on Windows + Next withEve: Nitro host runs from `.eve/dev-hosts/...`,
 * so resolvePackageBuildRoot() is null and resolvePackageRoot() becomes the app
 * root — then it looks for `src/internal/authored-module-map-loader.ts` in the
 * project and fails. Prefer the installed `eve` package `dist/` instead.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolvePackageJs() {
  try {
    return join(dirname(require.resolve("eve/package.json")), "dist/src/internal/application/package.js");
  } catch {
    return join(root, "node_modules/eve/dist/src/internal/application/package.js");
  }
}

const target = resolvePackageJs();
if (!existsSync(target)) {
  console.warn(`[patch-eve-package-resolve] skip — missing ${target}`);
  process.exit(0);
}

const marker = "resolveInstalledEveDistRoot";
let source = readFileSync(target, "utf8");
if (source.includes(marker)) {
  console.log("[patch-eve-package-resolve] already applied");
  process.exit(0);
}

const needle =
  "function resolvePackageSourceFilePath(e){let t=resolvePackageBuildRoot();return t===null?join(resolvePackageRoot(),e):join(t,rewriteSourceFilePathForBuild(e))}function resolvePackageSourceDirectoryPath(e){let t=resolvePackageBuildRoot();return join(t===null?resolvePackageRoot():t,e)}";

const replacement = `function ${marker}(){try{let e=require.resolve("eve/package.json"),t=dirname(e),n=join(t,"dist");if(existsSync(join(n,"src")))return n}catch{}return null}function resolvePackageSourceFilePath(e){let t=resolvePackageBuildRoot();if(t!==null)return join(t,rewriteSourceFilePathForBuild(e));let n=${marker}();return n===null?join(resolvePackageRoot(),e):join(n,rewriteSourceFilePathForBuild(e))}function resolvePackageSourceDirectoryPath(e){let t=resolvePackageBuildRoot();if(t!==null)return join(t,e);let n=${marker}();return join(n===null?resolvePackageRoot():n,e)}`;

if (!source.includes(needle)) {
  console.error("[patch-eve-package-resolve] unexpected eve package.js — patch needle not found");
  process.exit(1);
}

source = source.replace(needle, replacement);
writeFileSync(target, source);
console.log(`[patch-eve-package-resolve] patched ${target}`);
