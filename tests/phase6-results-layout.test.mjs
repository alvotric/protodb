import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Layout-contract guard for the disappearing-results bug.
//
// Root cause (proven in headless Chrome against the built Tailwind bundle):
// the Queries workspace is a fixed-height grid (h-[75vh]) with
// overflow-hidden. Its two direct children defaulted to min-height:auto,
// so when the History list populated with records, the grid row's automatic
// minimum size grew past the workspace height. The row overflowed, the
// right column stretched with it, and overflow-hidden clipped the results
// row off the bottom — the editor stayed visible while results vanished.
//
// The contract below locks the fix: both direct grid children must allow
// shrinking (min-h-0) and the outer row must be explicitly bounded
// (grid-rows-[minmax(0,1fr)]), so excess content scrolls inside its own
// region (history list / editor / results table) instead of expanding the
// workspace. If you refactor these classNames, keep the constraint and
// update this test — do not just delete it.
const workspaceSource = readFileSync(
  new URL("../components/queries/queries-workspace.tsx", import.meta.url),
  "utf8"
);

test("workspace grid bounds its single row so children cannot expand it", () => {
  const outerGridLine = workspaceSource
    .split("\n")
    .find((line) => line.includes("grid-cols-[240px_1fr]"));
  assert.ok(outerGridLine, "outer workspace grid not found");
  assert.match(
    outerGridLine,
    /grid-rows-\[minmax\(0,1fr\)\]/,
    "outer grid row must be explicitly bounded or tall content re-expands it"
  );
});

test("both direct grid children allow shrinking below content size", () => {
  assert.ok(
    workspaceSource.includes('className="min-h-0 border-r border-border"'),
    "history sidebar wrapper must carry min-h-0 or its records push the grid row taller"
  );
  assert.ok(
    workspaceSource.includes('className="flex min-h-0 min-w-0 flex-col"'),
    "editor/results column must carry min-h-0 or it stretches past the workspace and clips results"
  );
});

test("results region keeps its own bounded scroll container", () => {
  assert.ok(
    workspaceSource.includes('aria-label="Query results"'),
    "dedicated results panel must remain identifiable"
  );
  assert.ok(
    workspaceSource.includes('className="min-h-0 flex-1"'),
    "results body must stay a bounded flex region so the table scrolls inside the panel"
  );
});
