# Altiora Upstream Merge — Process Log (2026-07-24)

**Goal:** working Altiora on the latest upstream codebase, with our AI chat/voice
integration preserved. Repo: `D:\UN\Repos\FlowDesk\FlowDesk` (origin = UN DevOps TFS).

Companion: [ALTIORA_INTEGRATION_SURFACE.md](./ALTIORA_INTEGRATION_SURFACE.md) (the contract).

---

## Stage 1 — Fetch & measure scope
- `git fetch origin` → `origin/master` advanced `1ab19dba → 5cf16e2b` = **63 new upstream commits**.
- Local `master` was behind by 63, carrying the **live integration as uncommitted working tree**
  (not a branch). `RealAI` branch = obsolete `@unpa/chat` attempt — ignored.

## Stage 2 — Capture live integration (safety net)
- Branched `integration/unpa-chat-v2` off local `master` (`1ab19dba`).
- Added a `Frontend/Components/.gitignore` (`node_modules/`, `*.log`, `.vite/`) so the untracked
  vendored components stage without their 2289 `node_modules` files.
- Staged tracked modifications (`git add -u`) + new files (`UnpaProxyController.cs`,
  `PortalVoiceLauncher.tsx`, `Frontend/Components/**` minus node_modules) = **94 files, 0 node_modules**.
- Committed → **`26688d3e`** `integration(unpa): capture live AI chat/voice integration (chat-v2)`.
  The at-risk integration is now a reviewable commit. (Local only — not pushed.)

## Stage 3 — Merge upstream (no-commit)
- `git merge --no-commit --no-ff origin/master`.
- Backend `.cs` (incl. `Program.cs`, `TicketRepository.cs`, `ServiceDistributionController.cs`)
  **auto-merged cleanly**.
- **3 conflicts**, all frontend:
  1. `FlowDeskPortal/src/App.tsx` — import line. Resolved by **union**: kept upstream's
     `VersionCheckManager` + our `PortalVoiceLauncher` (both usages already present, lines 662/705).
  2. `FlowDeskAdmin/src/version_info.ts` — build-stamp date. Took upstream (`2026.07.20`).
  3. `Frontend/Clients/package-lock.json` — took upstream (`--theirs`), then
     `npm install --package-lock-only` to re-add our 2 `file:` `@flowdesk/*` deps. Result: valid
     JSON, no markers, contains both our link entries and upstream additions (`@fontsource/roboto`,
     `pdfjs-dist`).
- No leftover conflict markers anywhere (`git grep`).

## Stage 4 — Verify
- **Integration contract intact** (post-merge grep): `UnpaProxyController.cs` present;
  `ServiceDistributionController` `/schema/version` present; `Program.cs` `UnpaChat` HttpClient
  (`InfiniteTimeSpan`, line 225) + `access_token` query-token hook survived; `appsettings.json`
  `UnpaChat` block present; `ApiKeyMiddleware` `notificationHub` bypass present.
- **.NET build**: `dotnet build FlowDesk.API.csproj -c Debug` → **CoreCompile SUCCEEDED** (fresh
  `obj/Debug/net10.0/FlowDesk.API.dll` produced; 56 pre-existing nullable warnings, **0 CS errors**).
  The only 2 build "errors" were **MSB3027 file-lock**: `FlowDesk.API.exe` is held by the running
  dev server (PID 6360, :5000) — a runtime lock, not a code problem. Stop that process for a clean
  full build.
- **Frontend build** (`npm run build` = FlowDeskPortal `tsc -b && vite build`):
  - First attempt FAILED: `shared/features/src/PdfCanvasViewer.tsx` — `TS2307 Cannot find module
    'pdfjs-dist'`. **Not a merge error** — upstream added `pdfjs-dist` + this component in the 63
    commits; our node_modules (installed 2026-07-22, pre-merge) lacked it, and the lock was
    regenerated with `--package-lock-only` (no actual install).
  - Fix: `npm install` (added 4 packages incl. `pdfjs-dist`), then rebuilt.
  - Second attempt **SUCCEEDED**: `✓ built in 49.22s`, `tsc -b` typecheck passed (incl. merged
    `App.tsx`, `shared/features` ChatInterface + PortalVoiceLauncher, `@flowdesk/*` deps), PWA
    generated (118 precache entries), `pdfjs-dist` bundled. No unstaged/leftover changes afterward.

## Stage 5 — State at report time (NOT finalized)
- Branch `integration/unpa-chat-v2`, HEAD = capture commit `26688d3e`.
- Merge staged via `--no-commit`: `MERGE_HEAD = 5cf16e2b`, **273 files, +17371 / −2294**, all staged,
  no unmerged paths.
- **Merge commit NOT created; nothing pushed.** Awaiting confirmation.

## Stage 6 — Finalize merge commit
- Finalized the verified staged merge → **`2a9ec121`** `Merge upstream master (RP8/RP9) into
  integration/unpa-chat-v2` (parents `26688d3e` + `5cf16e2b`).

## Stage 9 — Commit component update + push
- Committed the `@flowdesk/chat-v2` 1.0.30 drift → **`a2fedfe1`** (12 files, incl. new
  `ReviewTable.jsx`). Working tree clean.
- **Pushed** branch `integration/unpa-chat-v2` → origin (UN TFS) as a **new branch** (`master`
  untouched). Tracking `origin/integration/unpa-chat-v2`.
- Final branch tip = `a2fedfe1`; 4 commits ahead of `origin/master`: capture `26688d3e`,
  merge-RP8/RP9 `2a9ec121`, merge-delta `1338a1d2`, chat-v2 1.0.30 `a2fedfe1`.

## Stage 10 — Merge into master + push (mainline)
- `git checkout master` → ff-only to `origin/master` (`c94d1a1f`) → `git merge --no-ff
  integration/unpa-chat-v2` → merge commit **`25d55ca6`** (parents `a2fedfe1` + `c94d1a1f`). No
  conflicts (branch already contained `c94d1a1f`).
- **Pushed** `master` → origin (UN TFS): `c94d1a1f..25d55ca6 master -> master` (fast-forward, no
  force). Local `master` == `origin/master` == `25d55ca6`.
- Integration is now on **mainline `master`**. `integration/unpa-chat-v2` is fully merged (kept as
  a ref).

## Stage 7 — Second pull (fresh changes)
- `git fetch` → origin/master advanced `5cf16e2b → c94d1a1f` = **5 new commits**.
- Net delta touched only: `Database/09_Maintenance/01_ServiceCatalog_Add_DisplayOrder_RP09.sql`
  (renamed from typo `._RP09sql`), deleted `Database/09_Maintenance/script.cmd`, `build.number`.
  **Zero code (.cs/.tsx) changes** — the `DisplayOrder` ALTER TABLE already shipped in RP8/RP9
  (`08_Alterations/83`); this is just the idempotent apply/maintenance script + a build bump.
- Merged clean (no conflicts) → **`1338a1d2`**. Branch now **ahead of origin/master by 3, behind
  by 0** — fully up to date.
- Detected working-tree drift: vendored `@flowdesk/chat-v2` `1.0.28 → 1.0.30` (our own component
  re-sync: handoff `completeWithThanks`, MessageBubble, i18n, chat-store, styles). Left UNCOMMITTED
  and untouched by the merge (delta doesn't touch `Frontend/Components`). It is the user's in-progress
  integration work, to commit separately when ready.
- No re-verification needed: the delta is non-code, so the builds verified at `2a9ec121` still hold.

## State after second pull
- Branch `integration/unpa-chat-v2` @ **`1338a1d2`** = upstream `c94d1a1f` + our integration.
- Uncommitted: only the `@flowdesk/chat-v2` 1.0.30 drift (user's work). Nothing pushed.

## Stage 8 — Apply new SQL migrations to local test DB
- **Runner / connection:** Altiora's `Database/08_Alterations/script.cmd` applies every `*.sql` in
  name order via `sqlcmd -S . -d FlowDesk`. Authoritative connection is
  `appsettings.Development.json`: **`Server=localhost,1433; Database=FlowDesk; User=_webuser;
  Password=12345678`** — targeted that (the DB the running app uses), not the `.cmd`'s `-S .`.
- **22 SQL scripts added by the pull:** `01_Tables/{87,90}` (fresh-build defs, not run on existing
  DB), `08_Alterations/{72..86}` (16 incremental RP8/RP9), `09_Maintenance/{01..04}` (RP9 mirrors).
  All idempotent (`IF NOT EXISTS`/`COL_LENGTH IS NULL` guards). Dependencies satisfied by name order
  (76→77, 73→74, 79_Users→80).
- **Pre-check:** connected OK (server `GSCBUNOPSGCWDQC`, db `FlowDesk`); all RP8/RP9 objects MISSING
  (clean pre-RP8 state; legacy `OrganizationUnitServiceCardLayouts` also absent).
- **Executed** `08_Alterations/72..86` in order (SQL auth, `-b` stop-on-error) → all succeeded;
  then `09_Maintenance/01..04` → correctly detected as no-ops. **FAIL=0.**
- **Applied objects:** role `DASHBOARDCROSS` + perm `dashboard:view:cross`; tables
  `UserAccessLogGuestAffiliations`, `OrganizationUnitsServiceCategories`, `OrganizationUnitCardLayouts`;
  columns `OrganizationUnitServices.{CategoryId, ShowCompletionEstimate, AllowSelfAuthorization}`,
  `Users.Preferences`, `UsersHistory.Preferences`, `Tasks.NotifyFocalPointsOnDefaultAssignment`,
  `ServiceCatalog.DisplayOrder`; index `IX_Tickets_Status_CompletedAt_DurationStats`. Backfills
  (guest affiliations, org-unit description, rejection-cause, InProgress normalize) ran (0 rows —
  clean DB, except WorkOrderJson roots reconciled: 2).
- **Post-check:** 13/13 objects verified `OK`.
- ⚠️ Code dependency flagged by script 84/02: `TicketRepository.cs` queue filter must include
  `'In Progress'` (with space) — already present in the merged upstream code (shipped together).
