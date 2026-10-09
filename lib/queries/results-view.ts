/**
 * Single decision point for the Query Results panel state.
 *
 * The panel state depends ONLY on the execution outcome and the loading
 * flag. It deliberately takes no history state, history-loading flag, or
 * tab/selection input, so a query-history refresh (or any unrelated UI
 * update or rerender) cannot change what the results panel shows. The
 * results panel in `components/queries/query-results.tsx` branches on
 * this value.
 */
export type ResultsView = "loading" | "empty" | "error" | "script" | "single";

export function resolveResultsView(
  outcome: { ok: boolean; kind?: unknown } | null,
  loading: boolean
): ResultsView {
  if (loading) return "loading";
  if (!outcome) return "empty";
  if (!outcome.ok) return "error";
  if (outcome.kind === "script") return "script";
  return "single";
}
