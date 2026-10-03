# ProtoDB — Phase 5 Commit + Phase 6 Deep Audit

## Step 1 — Safely commit Phase 5

The current Phase 5 implementation is complete for this repair pass.

1. Check `git status`.
2. Review the complete diff.
3. Confirm the changes are Phase 5 changes only.
4. Do not discard, reset, revert, stash, or overwrite them.
5. Create this commit:

`Phase 5 — Schema Designer repair`

6. Confirm:
   - commit hash
   - clean/dirty worktree
   - changed files in the commit

Do not modify database data or permissions.

Phase 5 runtime verification is currently blocked because `DATABASE_DDL_URL` is not configured and there is no suitable authenticated Owner/runtime environment. Do not bypass authentication, guess credentials, grant permissions, or modify existing application tables to force verification.

## Step 2 — Phase 6 deep audit only

After the Phase 5 commit succeeds, audit **ONLY Phase 6 — SQL Editor**.

Use:
- current repository at the new Phase 5 commit
- official ProtoDB Admin Roadmap
- ProtoDB Phase 1–9 Gap & Repair Report

The repository is the source of truth for current implementation.
The roadmap is the intended Phase 6 scope.
The repair report is the known gap analysis.

## IMPORTANT

Do NOT implement Phase 6 yet.
Do NOT modify any files during the audit.
Do NOT modify database data.
Do NOT start Phase 7, 8, 9, 10, or 11.

## Inspect the complete SQL Editor implementation

Trace:

UI → editor state → API/service → PostgreSQL → results/error handling → persistence/history

Inspect:
- SQL editor page/workspace
- editor component
- syntax highlighting
- autocomplete
- query tabs/panes
- execute/run flow
- SQL API routes
- query execution service
- PostgreSQL connection handling
- result grid
- execution timing
- row count
- errors and line/position information
- query history
- saved queries
- saved-query persistence/API
- CSV export
- JSON export
- loading/empty/error states
- authentication
- authorization
- SQL safety
- audit logging
- mock/demo implementations
- dead/duplicate implementations

Pay special attention to whether execution is still simulated/mocked.

The earlier repair report identified:
- `components/queries/queries-workspace.tsx` uses `runMockQuery()`
- `lib/sql-mock-engine.ts` is a simulation
- there is no real SQL execution API/service yet
- history/saved queries/export may not be fully wired

Verify those findings against the current repository rather than assuming they are still true.

## Phase 6 roadmap comparison

Compare every Phase 6 roadmap requirement and classify it as:
- Implemented
- Partially implemented
- Missing
- Incorrect/Buggy
- Mocked

For every non-complete item provide:
1. exact file path
2. exact component/function/API/service
3. current behavior
4. roadmap requirement
5. required change
6. security/data-integrity considerations
7. existing code/services to reuse

## Security review

Pay particular attention to:
- SQL injection
- arbitrary SQL execution
- authorization boundaries
- query size/result limits
- statement timeout
- transaction behavior if applicable
- dangerous SQL statements
- error leakage
- connection handling
- audit logging
- export safety

Do not treat frontend warnings/confirmations as the security boundary.

## Persistence review

Verify whether:
- query history is actually persisted where required
- saved queries survive page reload
- saved queries are tied correctly to the authenticated user/workspace
- exports operate on real query results
- mock data is accidentally presented as real SQL execution

## Mock vs live review

Identify every SQL Editor mock/demo path and classify it as:
- live
- demo/reference
- dead/unused

Do not recommend replacing working code with another mock.

## Testing review

Inspect `package.json` and existing tests.

Determine:
- whether the repo has a test script
- whether SQL Editor tests exist
- what focused tests should be added
- what cannot be safely tested without a disposable PostgreSQL environment

Do NOT modify code or tests during this audit.

## Final output

Return exactly:

# PHASE 6 AUDIT REPORT

### A. Overall Phase 6 status
### B. Implemented
### C. Partially implemented
### D. Missing
### E. Incorrect/Buggy
### F. Mocked/Demo-only
### G. Exact files likely requiring changes
### H. Existing code/services to reuse
### I. Security risks
### J. Data-integrity / operational risks
### K. Persistence gaps
### L. Recommended implementation order
### M. Verification/test plan
### N. Environment blockers
### O. Confirmation that NO Phase 6 code was modified during this audit

Then STOP and wait for explicit approval before implementing Phase 6.
