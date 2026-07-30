# Production Portal Patch — "Explain this" KB Anchors (Phase 8)

**Target repo/app:** `d:/UN/Repos/FlowDesk/FlowDesk/Frontend/Clients/FlowDeskPortal` (React Router v7 SPA).
**Status:** STAGED — apply after PO sign-off (this is a live, user-facing change).
**Depends on:** `@flowdesk/chat-v2 >= 1.0.15` (exports `FloatingChatProvider`, `FloatingChatWindow`, `useKBAnchors`, `ExplainTrigger`).
**Backend prerequisite (already done in UNPA_Ingest):** `node api/scripts/seed-ui-anchors.js` seeds the 6 `UIAnchor` nodes + EXPLAINS edges into Memgraph. Re-run it against the **production** Memgraph before rollout.

The mechanism is verified end-to-end in the mcp demo (`/alt-chat-demo`). This patch lights it up in the real portal by (1) wrapping the app once, (2) adding `data-kb-anchor` to 6 existing elements, (3) wiring CI.

---

## 1. Wrap the app once (App.tsx / AppLayout)

The portal already mounts `AltioraChat` inline via `ChatInterface.tsx` (Home). Add the floating provider + window + auto-anchor scan at the layout level so ANY page's `data-kb-anchor` lights up and the floating explain window is available app-wide.

In `FlowDeskPortal/src/App.tsx`, inside `AppLayout` (the component that renders `<Routes>`):

```tsx
import { FloatingChatProvider, FloatingChatWindow, useKBAnchors } from "@flowdesk/chat-v2";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";

// The SAME props ChatInterface passes to <AltioraChat> (proxy base URL, user
// profile, auth headers, lang). Factor them into a shared const/hook so the
// floating window and the inline chat stay identical.
function ChatWiring({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  useKBAnchors(rootRef); // auto-injects the "?" trigger into every [data-kb-anchor]

  const chatProps = {
    apiBaseUrl: "/api/proxy/unpa/api/v1",           // same base ChatInterface uses
    userProfile: /* current user profile */ undefined,
    getAuthHeaders: /* same as ChatInterface */ undefined,
    lang: /* current i18n language */ "en",
    // Phase 5 SITE_NAVIGATE → real router; optional joyride spotlight on highlight.
    onNavigate: (n: { path: string; highlight?: string }) => {
      navigate(n.path);
      // if (n.highlight) startSingleStepTour(`[data-tour="${n.highlight}"]`);
    },
  };

  return (
    <FloatingChatProvider>
      <div ref={rootRef}>{children}</div>
      <FloatingChatWindow chatProps={chatProps} />
    </FloatingChatProvider>
  );
}

// Wrap the layout body:
//   <ChatWiring>{/* existing <Routes> … */}</ChatWiring>
```

Notes:
- `useKBAnchors(rootRef)` uses a `MutationObserver`, so anchors on lazily-rendered / route-switched pages are picked up automatically.
- The floating window stays OPEN after a SITE_NAVIGATE "Go there" (Option A, PO-ratified) — no close call in `onNavigate`.

---

## 2. Add `data-kb-anchor` to the 6 real elements

Reuse the existing `data-tour` anchored elements where possible (same DOM node gets both attributes). `data-kb-title` is the human label shown in the trigger's aria-label and the explain header.

| anchorId | Component / file (from recon) | Element to tag |
|----------|-------------------------------|----------------|
| `altiora.catalog.search` | `CatalogSearch.tsx` (`data-tour="portal-catalog-search"`, ~:532) | the search container |
| `altiora.chat.input` | `ChatPage.tsx` (`data-tour="portal-chat-input"`, ~:428) | the chat input wrapper |
| `altiora.requests.list` | `YourRequests` page (/requests) | the requests list container |
| `altiora.tasks.list` | `YourTasks` page (/tasks) | the tasks list container |
| `altiora.approvals.list` | `MyApprovals` page (/approvals) | the approvals list container |
| `altiora.mail` | `MailPage` (/mail) | the mail list container |

Example (catalog search — add the two attributes to the existing anchored element):

```tsx
<div
  data-tour="portal-catalog-search"
  data-kb-anchor="altiora.catalog.search"
  data-kb-title="Service Catalog Search"
  className="…"
>
  {/* existing content */}
</div>
```

The element must be able to host an absolutely-positioned child (the "?"); `useKBAnchors` sets `position: relative` if it's currently `static`.

---

## 3. CI drift check

Add to the portal's CI (or the monorepo CI) a step that points the validator at the portal source:

```bash
# from UNPA_Ingest/api
KB_ANCHOR_SCAN_ROOTS="../../FlowDesk/FlowDesk/Frontend/Clients/FlowDeskPortal/src" \
  node scripts/validate-kb-anchors.js
```

Policy (PO-ratified): **warn-first** — exit 1 (non-blocking) on any drift or missing-EXPLAINS. After the anchor set stabilizes, treat exit 1 as a build failure to enforce.

Once the 6 attributes above are added, the validator's `graph-only` list should go empty (all 6 matched); `no-EXPLAINS` will still list catalog/tasks/chat/mail until Phase 10 curates edges for them (they work via semantic fallback meanwhile).

---

## 4. Rollout checklist

1. `@flowdesk/chat-v2` bumped to ≥1.0.15 in the portal and installed.
2. `node api/scripts/seed-ui-anchors.js` run against **production** Memgraph.
3. App.tsx wrapped (section 1).
4. 6 `data-kb-anchor` attributes added (section 2).
5. CI step added (section 3).
6. Smoke test: load each page → a "?" appears on the anchored element → click → floating window opens with a contextual explanation (requests/approvals = curated; catalog/tasks/chat/mail = semantic/fallback).
