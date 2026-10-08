import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testsDir, "..");

/**
 * Maps the `@/` tsconfig alias to the repo root so node:test can import
 * DB-backed lib modules (e.g. lib/db/client.ts) without a bundler.
 * Test-only infrastructure; never imported by application code.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let rel = specifier.slice(2);
    if (!/\.[a-z0-9]+$/i.test(rel.split("/").pop())) {
      rel += ".ts";
    }
    return { url: pathToFileURL(path.join(root, rel)).href, shortCircuit: true };
  }
  return next(specifier, context);
}
