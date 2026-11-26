// Loads backend/rules/*.json into the bundle at build time: one source of truth for Python and the browser.
import { Engine } from "./checker";

const modules = import.meta.glob("../../../backend/rules/*.json", { eager: true, import: "default" });

const files: Record<string, unknown> = {};
for (const [path, data] of Object.entries(modules)) files[path.split("/").pop()!] = data;

export const engine = new Engine(files);
