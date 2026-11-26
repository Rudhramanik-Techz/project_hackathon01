// Fails if the gzipped JavaScript in frontend/dist exceeds the 300 KB budget.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT = 300 * 1024;
const dist = new URL("../frontend/dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let total = 0;
for (const file of walk(dist)) {
  if (!file.endsWith(".js")) continue;
  const size = gzipSync(readFileSync(file)).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${file.slice(dist.length)}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  total gzipped JS (limit ${LIMIT / 1024} KB)`);
if (total > LIMIT) {
  console.error("Bundle size budget exceeded.");
  process.exit(1);
}
