// Bundles frontend/tests/*.test.ts with esbuild (already a Vite dependency) and runs them with node:test.
import { readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(join(root, "frontend", "package.json"));
const esbuild = require("esbuild");
const testsDir = join(root, "frontend", "tests");
const out = mkdtempSync(join(tmpdir(), "asli-ts-tests-"));

const files = readdirSync(testsDir).filter((f) => f.endsWith(".test.ts"));
await esbuild.build({
  entryPoints: files.map((f) => join(testsDir, f)),
  bundle: true, format: "esm", platform: "node", outdir: out, outExtension: { ".js": ".mjs" },
  loader: { ".json": "json" }, logLevel: "warning",
});
const result = spawnSync(process.execPath, ["--test", ...files.map((f) => join(out, f.replace(/\.ts$/, ".mjs")))], { stdio: "inherit" });
process.exit(result.status ?? 1);
