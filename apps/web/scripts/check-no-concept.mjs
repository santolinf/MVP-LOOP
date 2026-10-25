// CI guard (Phase H): the prerendered homepage must contain no design-concept artefacts.
import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

const html = readFileSync(new URL("../build/client/index.html", import.meta.url), "utf8");
const hits = html.match(/concept|\?member=1|alert\(/gi);
if (hits) {
  process.stderr.write(`Prerendered / contains concept artefacts: ${[...new Set(hits)].join(", ")}\n`);
  process.exit(1);
}
process.stdout.write("prerender check ok\n");
