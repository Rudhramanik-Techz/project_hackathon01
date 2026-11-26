// Runs the browser checker (frontend/src/lib/checker.ts) over tests/parity_cases.json and prints JSON results.
// Used by tests/test_parity.py to prove the TypeScript and Python engines agree.
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(join(root, "frontend", "package.json"));
const esbuild = require("esbuild");

const out = join(mkdtempSync(join(tmpdir(), "asli-parity-")), "checker.mjs");
await esbuild.build({
  entryPoints: [join(root, "frontend", "src", "lib", "checker.ts")],
  bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
});
const { Engine } = await import(pathToFileURL(out).href);

const rulesDir = join(root, "backend", "rules");
const files = {};
for (const name of readdirSync(rulesDir)) if (name.endsWith(".json")) files[name] = JSON.parse(readFileSync(join(rulesDir, name), "utf8"));
const engine = new Engine(files);

const cases = JSON.parse(readFileSync(join(root, "tests", "parity_cases.json"), "utf8"));
const results = cases.map((text) => {
  const norm = engine.normalise(text);
  const v = engine.evaluate(norm);
  return { normalised: norm, tier: v.tier, score: v.score, family: v.family, matched: v.matched.map((m) => m.id) };
});
process.stdout.write(JSON.stringify(results));
