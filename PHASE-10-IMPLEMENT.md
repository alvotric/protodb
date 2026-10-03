Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML``   # PHASE 10 — BACKEND API & REAL DATA INTEGRATION — IMPLEMENTATION  You are implementing **PHASE 10 ONLY** in the current ProtoDB Admin repository.  Read this entire instruction file before changing anything.  The implementation must be based on the completed Phase 10 audit and the current repository source.  ---  # 0. NON-NEGOTIABLE RULES  ## Preserve existing Phase 4–9 work  Do NOT rewrite or replace working implementations unnecessarily.  Preserve and build on:  - real PostgreSQL schema introspection  - real Table View CRUD  - schema/DDL validation  - SQL Editor execution and policy/history  - S3-compatible Storage service  - PostgreSQL-backed sessions  - password hashing  - Phase 9 audit retrieval  - Phase 9 notification preference persistence  - Phase 9 profile persistence  - explicit demo/reference boundaries  Prefer reuse over parallel duplicate implementations.  Do not create a second competing implementation of a feature when a real service already exists.  ---  # 1. PHASE BOUNDARY  Implement **Phase 10 only**.  Phase 10 is:  **Backend API & Real Data Integration**  The goal is to replace remaining mock/non-goal boundaries with real backend infrastructure and complete the backend integration of pages built during Phases 2–9.  Phase 10 includes:  1. PostgreSQL connectivity/pooling  2. credential storage/encryption architecture  3. APIs backing pages 2–9  4. real authentication/session identity  5. realtime where useful, especially active connections/running queries  6. removal of remaining live-path mocks/non-goals  7. integration/browser/runtime verification  Do NOT start Phase 11.  Phase 11 remains responsible for:  - deployment pipeline  - hosting/deployment automation  - Sentry/equivalent production monitoring  - broad production performance optimization  - production-scale retention/index tuning  - broad production rate limiting  - final system-wide production hardening  Correctness/security defects that directly block Phase 10 must be fixed, but do not turn this into a Phase 11 project.  ---  # 2. CURRENT BASELINE  Expected current HEAD:  `8be23e1dec9d8abaf675da1e9eef1ea50bd99f13`  Previous relevant commits:  - Phase 8: `77d8b19e85bcd42d86b901bee23c1637a5e074c1`  - Phase 7: `c093b33261501b04998947cc743d462a44095753`  - Phase 6: `1ea1ef0b62b93829a1b74a059a335ae59ca4d8e9`  - Phase 5: `ae809f1`  Before modifying anything run:  ```powershell  git rev-parse HEAD  git status --short  git log -5 --oneline   ``

If HEAD differs:

*   do not reset
    
*   do not discard newer changes
    
*   record the difference
    
*   inspect the current implementation
    
*   adapt to the current source
    

3\. SOURCE OF TRUTH
===================

Use:

*   current repository
    
*   current Git history
    
*   current ROADMAP.md
    
*   current Phase 10 audit findings
    

Do not rely on assumptions from earlier implementations.

Before each major change, inspect the existing implementation and reuse it where possible.

Trace every feature through:

UI → state → API/action → service → DB/storage/provider → persistence → authorization → audit → refresh/realtime

A route existing does not prove the feature is complete.

4\. CURRENT AUDIT FINDINGS TO FIX
=================================

The Phase 10 audit identified these major issues:

### High priority

*   First-owner bootstrap race:/api/auth/setup uses a non-atomic count-then-insert flow that can allow multiple Owner accounts under concurrent requests.
    

### Medium priority

*   DATABASE\_DDL\_URL may point at a different DB than DATABASE\_URL.
    
*   DDL connection variables are not documented in .env.example.
    
*   TLS configuration allows insecure certificate verification behavior.
    
*   Public setup status can expose raw DB error messages.
    
*   Auth audit/session ordering can leave misleading authentication outcomes.
    
*   Dashboard still contains fixture activity/table data and ambiguous storage semantics.
    
*   Users/Roles has no live backend administration APIs.
    
*   No realtime mechanism exists.
    
*   Phase 10 DB/API/browser integration coverage is missing.
    
*   Audit indexes/retention are limited.
    

### Lower priority / boundary

*   No broad login rate limiting/lockout.
    
*   Some authenticated errors expose more DB detail than necessary.
    
*   README overstates some offline/demo availability.
    

Do not ignore any of these findings without documenting why the current architecture requires a different treatment.

5\. TASK 1 — FIRST OWNER BOOTSTRAP MUST BE ATOMIC
=================================================

Target:

*   app/api/auth/setup/route.ts
    
*   migrations/001\_protodb\_admin\_schema.sql
    
*   related auth/database helpers
    
*   Phase 10 tests
    

Current problem:

The route currently:

1.  checks whether user count is zero
    
2.  separately inserts the first Owner
    

Those operations are not atomic.

Two concurrent requests can both see zero and create multiple Owners.

Required result
---------------

Exactly one initial Owner must be creatable.

Concurrent first-run requests must never produce multiple Owners.

The invariant must be server/database enforced, not UI enforced.

Possible mechanisms:

*   transaction + lock
    
*   PostgreSQL advisory lock
    
*   durable bootstrap claim
    
*   database invariant/constraint
    
*   combination of the above
    

Choose the implementation that fits the existing schema.

Do not redesign the authentication architecture.

Must preserve
-------------

*   unique email
    
*   password hashing
    
*   session creation
    
*   existing role model
    
*   audit behavior
    
*   existing first-run UX
    

Required tests
--------------

Prove:

*   empty DB → exactly one Owner
    
*   second setup attempt is rejected
    
*   concurrent setup requests → exactly one Owner
    
*   second Owner cannot be created through setup
    

Prefer disposable PostgreSQL integration for the concurrency test.

6\. TASK 2 — AUTH SETUP/LOGIN ERROR SAFETY
==========================================

Target:

*   app/api/auth/setup/route.ts
    
*   app/api/auth/login/route.ts
    
*   lib/audit/log.ts
    
*   related auth helpers/tests
    

Current findings:

*   setup GET returns raw DB errors
    
*   setup inserts user → audit → session
    
*   audit failure can leave an Owner row without session
    
*   login creates session → audit
    
*   audit failure can result in HTTP failure after a valid session has already been created
    
*   setup/login use direct audit inserts rather than the Phase 9 helper
    

Required behavior
-----------------

Never expose raw DB/internal errors.

Return stable safe client-facing errors.

Detailed database errors belong server-side logs.

Make authentication outcome semantics truthful.

Preferred behavior:

*   primary auth operation determines authentication success
    
*   audit persistence should not transform successful authentication into a misleading auth failure
    
*   bootstrap must not become half-completed because an audit write failed
    
*   use the existing best-effort audit helper consistently unless there is a strong transaction-based reason not to
    
*   document the chosen ordering semantics
    

Do not make audit logging the source of truth for authentication.

Add tests
---------

Cover:

*   setup DB error
    
*   login DB error
    
*   audit write error
    
*   successful login with audit failure
    
*   failed login
    
*   suspended login
    
*   no secret/internal DB details in response JSON
    

7\. TASK 3 — STRENGTHEN AUTH INPUT VALIDATION
=============================================

Server-side validate:

*   email syntax
    
*   email normalization
    
*   reasonable email length
    
*   name length
    
*   password length bounds
    
*   required fields
    
*   malformed JSON
    

HTML validation is not sufficient.

Do not weaken existing password hashing.

Keep:

*   Node scrypt
    
*   random salt
    
*   timing-safe verification
    
*   random session tokens
    
*   hashed session tokens in DB
    
*   HttpOnly cookies
    
*   DB-backed expiry/revocation
    
*   server-derived identity and role
    

Do not introduce plaintext password storage.

8\. TASK 4 — DDL TARGET SAFETY
==============================

Target:

*   lib/db/client.ts
    
*   lib/db/ddl-client.ts
    
*   DDL services
    
*   .env.example
    
*   tests
    

Current issue:

DATABASE\_DDL\_URL can potentially point to a different database than DATABASE\_URL.

That means UI/schema reads could refer to Database A while DDL mutates Database B.

Required behavior
-----------------

The DDL path must fail closed if target identity cannot be safely established.

Make the relationship between:

*   DATABASE\_URL
    
*   DATABASE\_DDL\_URL
    

explicit.

Do not log connection strings.

Use non-secret DB identity information where possible.

Possible identity checks may use safe server/database identity information.

If identity comparison cannot be performed safely:

*   mark DDL configuration unavailable
    
*   return safe configuration error
    
*   do not guess
    
*   do not execute destructive DDL
    

Keep the separate DDL pool.

Do NOT collapse the two pools merely to avoid this problem.

9\. TASK 5 — DOCUMENT DDL CONFIGURATION
=======================================

Update .env.example.

Document:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   DATABASE_URL  DATABASE_SSL  DATABASE_DDL_URL  DATABASE_DDL_SSL   `

Explain:

*   purpose
    
*   expected target relationship
    
*   live-feature requirements
    
*   security expectations
    

Do not put real credentials into .env.example.

Do not open .env.local.

10\. TASK 6 — FIX TLS CONFIGURATION
===================================

Current audit:

*   TLS defaults off
    
*   enabled mode uses rejectUnauthorized:false
    

This is not acceptable as the only secure remote-DB configuration.

Required behavior
-----------------

Support verified TLS.

When TLS is enabled:

*   certificate verification should be enabled by default
    
*   production-style configuration must not require rejectUnauthorized:false
    
*   invalid TLS configuration should fail clearly
    

Self-signed development certificates may be supported only through an explicitly documented development-only mechanism.

Do not encourage insecure TLS bypass in production documentation.

Add configuration tests for:

*   TLS disabled
    
*   TLS enabled with verification
    
*   explicit development self-signed configuration
    
*   invalid TLS settings
    

Never print certificate/key/credential values.

11\. TASK 7 — POOL FOUNDATION
=============================

Current architecture:

*   one main pg.Pool
    
*   one DDL pg.Pool
    

Main pool is currently bounded.

Preserve this architecture.

Review:

*   lazy initialization
    
*   client release
    
*   transaction rollback
    
*   pool error handling
    
*   timeouts
    
*   idle timeouts
    
*   Next.js/dev reload behavior
    
*   accidental duplicate pools
    

Do not introduce uncontrolled per-user dynamic pools.

Do not call:

pg\_stat\_activity

a Node pool metric.

Do not build fake pool history.

If pool metrics are not available, state that honestly.

Multi-workspace/per-user DB connection architecture should only be introduced when required by the actual credential/tenant model. Do not invent a fake multi-tenant implementation.

12\. TASK 8 — DASHBOARD REAL DATA
=================================

Target:

*   app/dashboard/page.tsx
    
*   lib/dashboard/stats-service.ts
    
*   components/dashboard/activity-feed.tsx
    
*   components/dashboard/tables-overview.tsx
    
*   related dashboard components
    

Current audit:

*   stats are live snapshots
    
*   activity is fixture data
    
*   tables overview is fixture data
    
*   database size is not S3 object Storage usage
    
*   no historical dashboard samples
    
*   cache ratio can display zero when no meaningful sample exists
    

Required behavior
-----------------

### Activity

Replace live dashboard activity fixtures with real persisted audit information where appropriate.

Do not fabricate activity.

Empty audit history should display as an honest empty state.

### Tables

Use the existing real schema service.

Do not duplicate schema queries.

### Storage metric

Do not call PostgreSQL database size “Storage used” if the UI means object Storage.

Choose explicit labels such as:

*   Database size
    
*   Object Storage usage
    

or show both.

### Cache hit ratio

Differentiate:

*   real value
    
*   zero
    
*   unavailable/no sample
    

Do not silently turn unavailable data into a numeric performance value.

### Historical charts

Do not create fake trend history.

Only show history when actual persisted samples exist.

13\. TASK 9 — DATABASE EXPLORER / TABLE VIEW
============================================

Preserve:

*   schema-service.ts
    
*   table-data-service.ts
    
*   current validators
    
*   identifier quoting
    
*   parameterized values
    
*   capability checks
    
*   existing demo/reference paths
    

Ensure the live paths have:

*   authentication
    
*   server-side authorization
    
*   safe errors
    
*   loading states
    
*   empty states
    
*   error/retry states
    
*   correct limits
    
*   no fixture merging
    
*   accurate live/demo labeling
    

For Table View verify:

*   pagination
    
*   sorting
    
*   filtering
    
*   inline updates
    
*   insert
    
*   delete
    
*   bulk delete
    
*   row detail
    
*   PK requirements
    
*   identifier validation
    
*   parameterization
    

Do not loosen any existing security restriction.

Add DB/API regression tests.

14\. TASK 10 — SCHEMA DESIGNER / DDL
====================================

Preserve:

*   DDL validation
    
*   protected schemas
    
*   allowed types/defaults
    
*   safe identifier quoting
    
*   server-side Owner/Admin authorization
    
*   FK transaction behavior
    

Complete:

*   target identity check
    
*   TLS configuration
    
*   error mapping
    
*   test coverage
    
*   partial-failure coverage
    
*   configuration documentation
    

Do not implement migration-history management merely as a substitute for the DDL feature.

Never run destructive DDL against an unknown database.

15\. TASK 11 — SQL EDITOR
=========================

Preserve:

*   one statement policy
    
*   SQL size limits
    
*   timeout
    
*   result/row limits
    
*   concurrency controls
    
*   safe error mapping
    
*   Owner/Admin authorization
    
*   per-user history
    
*   per-user saved queries
    

Add integration coverage for:

*   real PostgreSQL execution
    
*   role boundaries
    
*   timeout
    
*   result cap
    
*   history persistence
    
*   history ownership
    
*   saved query ownership
    
*   malformed requests
    
*   safe errors
    

Remember:

The SQL Editor executes with the privileges granted to DATABASE\_URL.

Do not pretend the application has a stronger privilege boundary than the DB credential actually provides.

Do not persist secrets intentionally.

16\. TASK 12 — STORAGE
======================

Preserve the existing S3-compatible architecture:

*   PostgreSQL metadata
    
*   provider object storage
    
*   upload reservations
    
*   quota handling
    
*   finalize workflow
    
*   signed URLs
    
*   private/public visibility
    
*   object metadata verification
    
*   cleanup
    

Complete:

*   live/unavailable/demo configuration semantics
    
*   integration tests
    
*   provider/DB lifecycle tests
    
*   public/private authorization tests
    
*   cancellation/finalization recovery
    
*   safe no-provider behavior
    

Logical buckets remain application metadata unless the current architecture explicitly provisions real provider buckets.

Never expose provider credentials.

Never silently convert partial provider configuration into fake live data.

17\. TASK 13 — LIVE USERS / ROLES
=================================

This is a major missing Phase 10 capability.

Current implementation:

lib/users/phase8-demo.ts

is fixture/local-state based.

The Phase 10 implementation must create a real backend without pretending the Phase 8 demo is authoritative.

Required live roster
--------------------

Read users from:

protodb\_admin.users

The authenticated session must determine the current actor.

Never trust a client-supplied actor ID.

Role administration
-------------------

Implement real server-authorized role changes based on the existing role/capability model.

Prevent:

*   self-escalation
    
*   unauthorized role changes
    
*   Viewer bypass
    
*   Editor/Admin/Owner privilege escalation
    
*   client-only authorization
    

Member lifecycle
----------------

Where supported by the existing product/schema, implement real persisted lifecycle operations such as:

*   active
    
*   suspended
    
*   reactivated
    
*   removal/deactivation
    

Do not invent destructive semantics without checking the existing model.

Final Owner invariant
---------------------

At least one Owner must remain.

This must be server/database enforced.

UI disabling alone is insufficient.

Test:

*   Owner cannot be demoted if they are the final Owner
    
*   final Owner cannot be removed/suspended in a way that leaves zero Owners
    
*   concurrent lifecycle operations cannot violate the invariant
    

Invitations
-----------

Implement durable invitation flow only where the current product requirements support it.

Use:

*   secure token generation
    
*   expiration
    
*   one-time use
    
*   server-side validation
    
*   safe storage
    

Do not expose raw invitation secrets in audit/logs.

Audit
-----

Audit:

*   role changes
    
*   lifecycle changes
    
*   invitations
    
*   other Users/Roles mutations
    

Record safe:

*   actor
    
*   action
    
*   resource
    
*   result
    
*   timestamp
    

Do not record:

*   password
    
*   session token
    
*   invitation secret
    
*   DB URL
    
*   S3 secret
    

RLS
---

Implement read-only inspection of actual PostgreSQL RLS/catalog metadata where supported.

Do not represent the Phase 8 demo matrix as real enforcement.

Clearly label visibility limitations if the DB role cannot inspect all policies.

Resource-scoped permissions
---------------------------

Do NOT create another fake permission matrix.

Only implement durable resource permissions when:

*   model is defined
    
*   ownership is defined
    
*   persistence exists
    
*   API authorization exists
    
*   tests prove isolation
    

If the current architecture cannot safely support this in Phase 10, leave it explicitly documented rather than fake.

18\. TASK 14 — CREDENTIAL STORAGE / ENCRYPTION
==============================================

The audit found no application-level credential management.

Current credentials are deployment environment variables.

This Phase 10 requirement must be handled carefully.

Do NOT
------

Never simply create:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   credentials.secret = plaintext   `

in PostgreSQL.

First establish
---------------

*   credential owner/scope
    
*   target/workspace relationship
    
*   credential types
    
*   encryption boundary
    
*   key source
    
*   encryption algorithm/library
    
*   rotation strategy
    
*   masking
    
*   authorization
    
*   decryption boundary
    
*   deletion lifecycle
    
*   audit behavior
    

Use authenticated encryption or a standard envelope-encryption design.

Encryption keys must not be stored alongside plaintext credentials.

Credentials must never be sent to the browser.

Credentials must never appear in logs/errors.

Important architecture constraint
---------------------------------

The current product is a single configured target deployment.

Do NOT invent fake multi-workspace isolation.

Where true multi-workspace credential support requires a larger architecture, implement only the safe foundation and explicitly document the unresolved boundary.

Do not claim complete multi-tenant credential isolation unless it actually exists.

19\. TASK 15 — AUDIT LOGGING
============================

Preserve Phase 9 audit retrieval and helper behavior unless a targeted change is necessary.

Add appropriate Phase 10 mutation coverage.

Consider auditing:

*   logout
    
*   suspended login attempts
    
*   saved-query create
    
*   saved-query delete
    
*   role changes
    
*   lifecycle changes
    
*   invitations
    
*   credential changes
    
*   other Phase 10 mutations
    

Do NOT log every read indiscriminately.

Never store:

*   passwords
    
*   tokens
    
*   raw credentials
    
*   connection strings
    
*   S3 secrets
    
*   raw SQL containing secrets
    

Actor identity must come from the server session.

Do not falsely claim complete forensic coverage.

20\. TASK 16 — AUDIT INDEX / RETENTION BOUNDARY
===============================================

The current audit table primarily has time-based indexing.

Phase 10 may add correctness-focused indexes for actual audit filters where justified.

Potential query dimensions include:

*   actor
    
*   action
    
*   resource
    
*   result
    
*   time
    

Do not turn this into broad production-scale performance work.

Do not invent an automatic purge/retention policy without a product rule.

If retention remains undefined, document it.

21\. TASK 17 — REALTIME / FRESHNESS
===================================

Current state:

*   request-time snapshots
    
*   manual refresh
    
*   no SSE
    
*   no WebSocket
    
*   no polling loop
    

The roadmap requires realtime where useful, especially:

*   active connections
    
*   running queries
    

Preferred mechanism
-------------------

Start with bounded polling unless streaming is clearly justified.

Polling must have:

*   explicit interval
    
*   cleanup
    
*   cancellation
    
*   no overlapping requests
    
*   stale state
    
*   error state
    
*   recovery
    
*   reasonable server load
    

Do not use unlimited or aggressive intervals.

Active connections
------------------

Use the actual current PostgreSQL source.

Do not call pg\_stat\_activity Node pool telemetry.

Running queries
---------------

A request that waits for final SQL completion is not a realtime running-query feed.

If implementing running-query visibility, create a reliable status model using current PostgreSQL activity where feasible.

Include:

*   request/query identifier
    
*   start state
    
*   running state
    
*   completion
    
*   failure
    
*   timeout
    
*   cleanup
    

Never fabricate running query state.

UI labels
---------

Clearly distinguish:

*   Live
    
*   Refreshing
    
*   Stale
    
*   Unavailable
    

Do not display historical telemetry unless real samples exist.

Tests
-----

Test:

*   polling/stream startup
    
*   cleanup
    
*   no duplicated polling
    
*   stale transitions
    
*   error recovery
    
*   request overlap prevention
    
*   running query cleanup
    
*   component unmount
    

22\. TASK 18 — SAFE ERROR MODEL
===============================

Review API errors across:

*   auth
    
*   dashboard
    
*   schema
    
*   table data
    
*   DDL
    
*   SQL
    
*   Storage
    
*   Users/Roles
    
*   audit/settings
    

Use stable safe responses.

Where useful include:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "error": {      "code": "STABLE_CODE",      "message": "Safe client-facing message"    }  }   `

Do not expose:

*   raw PostgreSQL errors
    
*   connection strings
    
*   filesystem paths
    
*   DB credentials
    
*   S3 credentials
    
*   session tokens
    
*   password information
    

Detailed internal diagnostics should remain server-side.

Do not break existing client error handling without adding compatible handling.

23\. TASK 19 — DEMO/MOCK BOUNDARIES
===================================

After implementation search for:

*   lib/mock-data.ts
    
*   phase8-demo.ts
    
*   sql-mock-engine.ts
    
*   fixture arrays
    
*   static charts
    
*   localStorage
    
*   demo mode
    
*   hardcoded metrics
    

Allowed remaining demo/reference uses include:

*   /components showcase
    
*   explicit Database demo/reference
    
*   explicit Schema demo/reference
    
*   SQL simulator when the real DB is genuinely unavailable
    
*   explicit Storage demo/reference
    
*   browser-local Schema node positions
    

Not allowed in the live path:

*   dashboard activity
    
*   dashboard table overview
    
*   Users/Roles live roster
    
*   live lifecycle mutations
    
*   live audit/health telemetry
    
*   live Table View data
    
*   live Schema Explorer data
    
*   live SQL result data
    
*   live Storage metadata
    

Do not merge fixtures into live state.

Do not delete demo/reference code blindly.

24\. TASK 20 — SETTINGS / ACCOUNT
=================================

Preserve real:

*   profile persistence
    
*   notification preferences
    
*   server-derived identity
    

Only implement additional account/workspace functionality when backed by real schema and authorization.

Do NOT create fake:

*   password change
    
*   account deletion
    
*   workspace deletion
    
*   connected account operations
    

A disabled action must never show success.

25\. TASK 21 — DOCUMENTATION
============================

Update as necessary:

*   README.md
    
*   ROADMAP.md
    
*   .env.example
    

Documentation must distinguish:

*   live
    
*   demo/reference
    
*   unavailable
    
*   snapshot
    
*   historical
    
*   realtime
    

Correct inaccurate claims such as:

*   offline authenticated demo without DB
    
*   DB size being Object Storage usage
    
*   PostgreSQL activity being Node pool metrics
    
*   manual refresh being realtime
    
*   Users/Roles being real before backend implementation
    
*   encrypted credential storage before encryption exists
    

Do not document Phase 11 work as completed.

26\. TASK 22 — PHASE 10 TEST FOUNDATION
=======================================

Add:

test:phase10

Prefer separate test layers.

Unit
----

Cover:

*   bootstrap validation
    
*   bootstrap concurrency policy
    
*   authorization matrix
    
*   safe error mapping
    
*   DDL target config
    
*   TLS config
    
*   realtime state logic
    

API
---

Cover:

*   unauthenticated 401s
    
*   expired sessions
    
*   suspended users
    
*   role boundaries
    
*   malformed inputs
    
*   invalid IDs
    
*   account scope
    
*   safe error responses
    
*   audit behavior
    

PostgreSQL integration
----------------------

Use ONLY disposable PostgreSQL infrastructure.

Cover:

*   migrations
    
*   first-owner concurrency
    
*   session creation
    
*   login
    
*   logout
    
*   revocation
    
*   profile persistence
    
*   notification persistence
    
*   audit retrieval
    
*   table CRUD
    
*   DDL
    
*   SQL execution
    
*   history ownership
    
*   role behavior
    
*   final Owner invariant
    
*   RLS/catalog inspection
    

Storage integration
-------------------

Use disposable MinIO/S3-compatible test infrastructure.

Cover:

*   upload
    
*   finalize
    
*   cancel
    
*   rename
    
*   delete
    
*   private/public
    
*   quota
    
*   DB/provider consistency
    

Browser/runtime
---------------

Where current tooling supports it, cover:

*   setup
    
*   login
    
*   logout
    
*   protected routes
    
*   role restrictions
    
*   real/demo mode
    
*   loading
    
*   empty
    
*   error
    
*   settings persistence
    
*   Users/Roles behavior
    
*   realtime freshness
    

Do not add a huge test framework unnecessarily.

Use the smallest justified dependency.

27\. TASK 23 — EXISTING TEST REGRESSION
=======================================

Run and preserve:

*   Phase 5 tests
    
*   Phase 6 tests
    
*   Phase 7 tests
    
*   Phase 8 tests
    
*   Phase 9 tests
    
*   Phase 10 tests
    

Do not silently weaken existing tests to make failures disappear.

When behavior changes intentionally:

1.  update the relevant test
    
2.  add regression coverage
    
3.  explain the reason
    

28\. TASK 24 — BUILD / TYPECHECK / LINT
=======================================

After implementation run available project checks.

At minimum where supported:

*   TypeScript/build
    
*   lint
    
*   Phase 5 tests
    
*   Phase 6 tests
    
*   Phase 7 tests
    
*   Phase 8 tests
    
*   Phase 9 tests
    
*   Phase 10 tests
    

Report exact results:

*   passed
    
*   failed
    
*   skipped
    
*   blocked
    

Do not claim “all good” from a partial run.

29\. TASK 25 — SAFE RUNTIME VERIFICATION
========================================

Only use explicitly disposable infrastructure.

Never assume configured infrastructure is disposable.

Required sequence
-----------------

1.  Check Git state.
    
2.  Start app with disposable configuration.
    
3.  Verify unauthenticated API behavior.
    
4.  Apply migrations only to disposable DB.
    
5.  Verify migration idempotency.
    
6.  Create first Owner.
    
7.  Run concurrent bootstrap test.
    
8.  Verify exactly one Owner.
    
9.  Login.
    
10.  Reload.
    
11.  Logout.
    
12.  Verify revoked session.
    
13.  Verify suspended behavior.
    
14.  Verify role boundaries.
    
15.  Verify disposable CRUD.
    
16.  Verify DDL target identity.
    
17.  Verify DDL partial failure handling.
    
18.  Verify SQL timeout/result limits.
    
19.  Verify SQL history ownership.
    
20.  Verify Storage lifecycle.
    
21.  Verify public/private Storage security.
    
22.  Verify audit record creation/retrieval.
    
23.  Verify notification persistence.
    
24.  Verify profile persistence.
    
25.  Verify Users/Roles.
    
26.  Verify final Owner invariant.
    
27.  Verify RLS catalog reads.
    
28.  Verify realtime freshness.
    
29.  Run all test suites.
    
30.  Verify no production resource was touched.
    

If no disposable DB/provider exists:

*   do not use production credentials
    
*   do not apply migrations
    
*   do not perform destructive tests
    
*   report runtime verification as blocked
    

30\. ACCEPTANCE CRITERIA
========================

Phase 10 is complete only when applicable criteria are satisfied.

Authentication/security
-----------------------

*   First Owner creation is concurrency-safe.
    
*   Multiple Owners cannot be created through bootstrap.
    
*   Public setup does not expose raw DB errors.
    
*   Auth failures return safe errors.
    
*   Audit failure cannot create misleading auth result.
    
*   Auth validation is server-side.
    
*   DDL target mismatch cannot silently mutate another target.
    
*   DDL configuration is documented.
    
*   TLS configuration supports verified remote connections.
    
*   Credentials never reach browser/log/error output.
    

PostgreSQL
----------

*   Main pool remains shared.
    
*   DDL pool remains shared.
    
*   Client/transaction cleanup is correct.
    
*   No uncontrolled duplicate pools introduced.
    
*   Target identity semantics are explicit.
    
*   Pool metrics are not confused with PostgreSQL activity metrics.
    

Dashboard
---------

*   Activity is real or honestly empty/unavailable.
    
*   Tables overview uses real schema data.
    
*   Storage metric is correctly labeled.
    
*   Cache ratio distinguishes unavailable from zero.
    
*   No fake history exists.
    
*   Live/refresh/stale semantics are explicit.
    

Database/Schema/SQL
-------------------

*   Live Explorer is backed by real DB data.
    
*   Table CRUD remains authorized and parameterized.
    
*   DDL target safety is enforced.
    
*   SQL Editor remains bounded.
    
*   Query ownership remains enforced.
    
*   Safe errors are used.
    

Storage
-------

*   Provider-backed live path remains intact.
    
*   DB metadata remains persistent.
    
*   Public/private access remains correct.
    
*   Demo fallback is explicitly separated from live functionality.
    
*   Provider secrets stay server-side.
    

Users/Roles
-----------

*   Live roster API exists.
    
*   Server-side role changes exist.
    
*   Lifecycle changes persist.
    
*   Final Owner invariant is enforced.
    
*   Invitations are secure if implemented.
    
*   Audit events exist for appropriate mutations.
    
*   RLS inspection is based on real PostgreSQL metadata.
    
*   Demo matrix is not presented as real enforcement.
    

Credentials
-----------

*   No plaintext credential table exists.
    
*   Credential ownership/scope is defined.
    
*   Encryption boundary is defined and implemented safely.
    
*   Encryption keys are not stored with plaintext secrets.
    
*   Credentials never reach browser code.
    
*   Any unresolved multi-workspace limitation is explicit.
    

Realtime
--------

*   Active connection freshness is truthful.
    
*   Running-query status is truthful where implemented.
    
*   Polling/stream cleanup works.
    
*   No duplicate polling.
    
*   Stale/error states exist.
    
*   No fabricated history.
    

Audit
-----

*   Phase 9 audit retrieval still works.
    
*   Phase 9 notification preferences still persist.
    
*   Phase 10 mutations are appropriately audited.
    
*   Secrets do not appear in audit rows.
    
*   Audit retrieval remains authorized and bounded.
    

Testing
-------

*   Phase 5 passes.
    
*   Phase 6 passes.
    
*   Phase 7 passes or optional integration is clearly skipped.
    
*   Phase 8 passes.
    
*   Phase 9 passes.
    
*   Phase 10 suite exists and passes.
    
*   Disposable PostgreSQL coverage exists for critical auth/persistence.
    
*   Storage integration uses disposable infrastructure.
    
*   Browser/runtime verification exists where supported.
    

31\. THINGS YOU MUST NOT DO
===========================

Do NOT:

*   rewrite the application
    
*   replace PostgreSQL
    
*   replace the existing auth architecture without necessity
    
*   remove all demo components blindly
    
*   fabricate historical data
    
*   fabricate health data
    
*   fabricate Users/Roles persistence
    
*   call pg\_stat\_activity Node pool metrics
    
*   expose DB/S3 credentials
    
*   store plaintext credentials
    
*   weaken authorization
    
*   trust client-provided actor identity
    
*   remove server-side role checks
    
*   introduce uncontrolled per-user pools
    
*   apply migrations to production
    
*   run destructive DDL on unknown targets
    
*   create fake realtime
    
*   create fake audit history
    
*   start Phase 11
    

32\. REQUIRED FINAL REPORT
==========================

At the end provide:

Phase 10 Implementation Summary
-------------------------------

Describe what was actually implemented.

Files Changed
-------------

List exact paths and purpose.

Migrations
----------

List:

*   created
    
*   modified
    
*   purpose
    
*   compatibility concerns
    

APIs Added/Changed
------------------

List routes, methods and behavior.

Security Fixes
--------------

Describe:

*   bootstrap fix
    
*   auth fixes
    
*   DDL target fix
    
*   TLS fix
    
*   safe error fixes
    
*   authorization fixes
    

Dashboard
---------

Describe:

*   live sources
    
*   activity source
    
*   table source
    
*   storage semantics
    
*   refresh/freshness semantics
    

Users/Roles
-----------

Describe:

*   live roster
    
*   role administration
    
*   lifecycle
    
*   invitations
    
*   final Owner protection
    
*   RLS inspection
    
*   resource permissions
    
*   remaining limitations
    

Credential Architecture
-----------------------

Describe exactly what is implemented.

Do not print secret values.

Realtime
--------

Describe:

*   mechanism
    
*   interval/streaming
    
*   freshness
    
*   cleanup
    
*   limitations
    

Mock/Demo Boundary
------------------

List every remaining demo/reference path and explain why it remains.

Tests
-----

For each:

*   Phase 5
    
*   Phase 6
    
*   Phase 7
    
*   Phase 8
    
*   Phase 9
    
*   Phase 10
    
*   DB integration
    
*   Storage integration
    
*   Browser/runtime
    

Report:

*   passed
    
*   failed
    
*   skipped
    
*   blocked
    

Build / Typecheck / Lint
------------------------

Give exact results.

Runtime Verification
--------------------

State exactly what was verified.

Do not claim runtime verification if infrastructure was unavailable.

Remaining Phase 10 Work
-----------------------

Only genuine Phase 10 gaps.

Explicit Phase 11 Deferrals
---------------------------

Only Phase 11 work.

Final Status
------------

Use exactly one:

*   Phase 10 Complete
    
*   Phase 10 Substantially Complete — Runtime Verification Blocked
    
*   Phase 10 Incomplete
    

Do not claim complete merely because the pages render.

33\. STOP CONDITIONS
====================

Stop before unsafe actions when:

*   only production credentials are available
    
*   DB cannot be proven disposable
    
*   Storage cannot be proven disposable
    
*   migration would affect production
    
*   destructive DDL would affect unknown data
    
*   credential architecture cannot be safely implemented without inventing unsupported tenancy
    
*   required external infrastructure is unavailable
    

When blocked:

*   complete safe static/unit work
    
*   report exact blocker
    
*   do not guess
    
*   do not fabricate
    

34\. FINAL IMPLEMENTATION PRINCIPLE
===================================

The existing application already contains substantial reusable live foundations.

Do not replace them.

The implementation priority is:

1.  secure first-owner bootstrap
    
2.  auth/error correctness
    
3.  DDL target/TLS safety
    
4.  test foundation
    
5.  dashboard real semantics
    
6.  existing page integration/regression
    
7.  live Users/Roles
    
8.  credential architecture
    
9.  realtime
    
10.  runtime verification
    
11.  Phase 11 remains separate
    

The objective is not to make the UI merely appear complete.

The objective is:

**real backend behavior + correct persistence + server-side authorization + truthful live/demo boundaries + safe errors + tests + runtime verification.**

Preserve working Phase 4–9 implementations.

Do not fabricate missing infrastructure.

Do not cross into Phase 11.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML