import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const srcDir = join(root, "packages", "auth-js", "dist");
const destDir = join(root, "examples", "external-auth-example", "vendor", "auth-js");

mkdirSync(destDir, { recursive: true });

const entries = readdirSync(srcDir).filter((name) => name.endsWith(".js"));
if (entries.length === 0) {
  console.error(`No built .js files found in ${srcDir}. Run "npm run build:auth-js" first.`);
  process.exit(1);
}

for (const name of entries) {
  copyFileSync(join(srcDir, name), join(destDir, name));
}

console.log(`Synced ${entries.length} file(s) to examples/external-auth-example/vendor/auth-js/`);
