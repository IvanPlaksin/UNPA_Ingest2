# V0 — Altiora Sections Recon (/tasks, /requests, /mail) for voice queries

Read-only recon of the Altiora .NET API + portal pages, so the voice assistant can **list + filter + detail** each section. All backend endpoints auto-scope to the acting user (token identity). Portal calls Altiora `/api` directly with the end-user JWT (not the `/api/proxy/unpa` chat path).

## TASKS — `/tasks` (YourTasks.tsx)

- **List:** `GET /api/Task/requestor/tasks/paged` (`TaskController.cs:528`) — params `page,pageSize,search,status,category,service,priority,sortKey,sortDirection`. Auto-scoped `AssignedTo = caller` (+ `AssignedOrgUnitId = PrimaryOrgUnitId`). Returns `PagedResult<UserTask>`.
- **Detail:** `GET /api/Task/{id}` (`TaskController.cs:233`) → UserTask + attachments/subtasks/notes. ⚠️ no per-record ownership check.
- **Metadata (filter options):** `GET /api/Task/requestor/tasks/metadata`.
- **Portal filters (exact):** search, category, service, status (Pending/InProgress/PendingReview/Suspended/Completed/Rejected), priority (Critical/High/Medium/Low). **Maps 1:1 to API params.**
- **Per-task fields:** label(title), requestTitle+category, priority, assignedUnit, status, dueDate; detail adds subtasks/notes/attachments.
- **Status semantics:** `status=Active` → server expands to Pending/PendingAuthorization/InProgress/PendingReview. `all` = no filter.
- **Client:** `taskService.getRequestorTasksPaged(...)` / `getTaskById(id)` (`shared/api/.../task-service.ts`).
- **Gaps:** no date-range, no assignee filter on this endpoint; enum-string exactness ("in progress"→`InProgress`); page hides `Waiting` client-side.

## REQUESTS — `/requests` (YourRequests.tsx → RequestsTable)

- **List:** `GET /api/Tickets` (`TicketsController.cs:82`) — params `page,pageSize,status,search,category,service,fromDate,toDate,sortKey,sortDirection,mineOnly`. `mineOnly=true` self-scopes (requester/assignee/beneficiary/watcher). Returns `PagedResult<Ticket>` `{items,totalCount,page,pageSize}`.
- **Detail:** `GET /api/Tickets/number/{ticketNumber}` (`TicketsController.cs:336`) → `TicketDetailsDto` (status, approver, comments, history, tasks). Natural for "tell me about ticket UNXYZ". (Also `GET /api/Tickets/{id}` with a `canView` gate.)
- **Metadata:** `GET /api/Tickets/metadata?mineOnly=true` → {Categories, Services}.
- **Portal filters (exact):** search, category, service, status (all/PendingAuthorization/Pending/InProgress/Completed/Declined/Rejected/Revoked), **date range** (fromDate/toDate), sort. Always `mineOnly:true`.
- **Per-request fields:** id (RFS#/ticket#), service+category, beneficiary, urgency, submitted, status, tasks, completed, watchers, rating.
- **Status aliasing:** ongoing→Pending/InProgress/Assigned/OnHold; all→no filter.
- **⭐ ALREADY PARTIALLY WIRED in the UNPA chat:** `MY_REQUESTS` intent → `handleMyRequests` (`interpreter-engine.js:398`) → `sr.list` tool → `ticket-list.backend.js` `GET /api/tickets` (`buildQuery` supports status/fromDate/toDate/service/search/mineOnly/page/pageSize; `STATUS_ALIASES` present). **Reuse this.** Detail-by-number is NOT yet a tool — needs a small new adapter tool wrapping `/api/tickets/number/{n}`.
- **Gaps:** `GET /Tickets` has no `urgency` param (only queue/search endpoints); detail-by-number needs a new tool.

## MAIL — `/mail/:folder?` (MailPage.tsx)

- **List:** `GET /api/messages?folder=&offset=&limit=&search=&sort=` (`MessagesController.cs:45`). Scoped by `RecipientEmail = caller`. Returns `Message[]`.
- **Detail:** `GET /api/messages/{id}` (`MessagesController.cs:63`) → full body/participants/attachments.
- **Counts/summary:** `GET /api/messages/unread-counts` (per-folder int), `GET /api/messages/stats` (per-folder Total+Unread) — great for voice summaries.
- **Portal filters (exact):** folder (Inbox/Sent/Trash; `archived` valid but no button), search (server LIKE over subject/body/fromName), sort (date asc/desc). Client-side date-bucket grouping (Today/Yesterday/…) is presentation only.
- **Per-message fields:** sender (or To: for sent), date, subject, body preview, unread flag (inbox), linked ticket badge (requestId).
- **Client:** `messageService.getMessages(...)` / `getMessage(id)` / `getFolderStats` / `getUnreadCounts`.
- **Gaps:** no server filter for read/unread (only counts), sender-address, date-range, or attachments — would need new query params or client-side filtering after a folder fetch.

## Cross-cutting for V3 (voice queries)

1. **New adapter tools** in `altiora-tools.adapter.js` (allowlist): `tasks.list`/`tasks.get`, `requests.get` (list already via `sr.list`), `mail.list`/`mail.get`/`mail.counts`. Each calls the Altiora endpoint under the **acting-user bearer** (same identity path as ticket submit/list; requires proxy-forwarded token).
2. **New router intents:** `QUERY_TASKS`, `QUERY_REQUESTS` (extend MY_REQUESTS or add detail), `QUERY_MAIL` — with LLM filter extraction (map spoken → exact enum/param), reusing the `MY_REQUESTS` FILTER_SCHEMA pattern.
3. **Voice-friendly formatting:** brief list summaries + counts; detail on explicit request.
4. **Feasibility:** list+filter is directly supported for all three (tasks/requests 1:1 with the page; mail = folder+search+sort). Detail supported (tasks by id, requests by number, mail by id). Known gaps: task date-range/assignee, request urgency-on-list, mail read-state/sender/date filters — either client-side post-filter or defer.
