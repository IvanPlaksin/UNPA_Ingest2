# Shipping `@flowdesk/chat-v2`

**The source lives here. It is built here. Altiora receives only the artifact.**

| | Path |
|---|---|
| **Source** (the only one) | `packages/flowdesk-chat-v2/src/` |
| **Build output** | `packages/flowdesk-chat-v2/dist/` — git-ignored, it is not the deliverable |
| **Consumer — mcp SPA** | `mcp/vendor/flowdesk-chat-v2/` — `dist` + `package.json`, committed |
| **Consumer — Altiora portal** | `FlowDesk/…/Frontend/Components/flowdesk-chat-v2/` — `dist` + `package.json`, committed |

Altiora holds **no source**. `Frontend/Components/flowdesk-chat-v2/` contains `dist/`,
`package.json` and `README.md`, nothing else, and `package.json` declares
`files: ["dist", "README.md"]` so no source can creep back in through an install.

## The one command

```bash
# 1. bump the version in packages/flowdesk-chat-v2/package.json  (mandatory)
# 2. then:
bash scripts/build-install-chat-v2.sh
```

It builds, copies `dist/` + `package.json` into both consumers, runs
`npm install @flowdesk/chat-v2 --install-links` in `mcp/`, and byte-compares the two
installs. It exits non-zero if they differ, so a half-finished install cannot pass as a
success.

**The version bump is not a formality.** npm (`--install-links`) and Vite both cache a
same-version rebuild away: without a bump the build succeeds, the copy succeeds, and the
consumer keeps running the previous bundle. The script refuses to start if either
consumer already carries the version being built.

After installing into Altiora, run `npm install` once in `FlowDesk/…/Frontend/Clients` so
its workspace picks the new version up through the `file:` link.

## Why it is arranged this way

The component used to have its source in Altiora and a hand-synchronised "reference copy"
in this repo, with a document instructing everyone to change both. Measured when that
arrangement was finally abandoned, the two had drifted **~900 lines apart across 16
files** (+363 in the CSS alone), and a whole component — the request/task card rows — had
reached only one of them. Drift ran the other way too, which cost more: `sessionEnded`,
the backend's way of saying it had closed its side of a conversation, existed only in the
copy that was never built, so the component that actually shipped ignored a contract the
backend was already emitting.

Nobody noticed for months, and that is the point worth remembering: **a hand-synchronised
second copy is not a copy, it is a fork.** Both halves keep working — each host renders
its own perfectly well — so the divergence surfaces only when somebody sits down and
compares them, which is exactly what nobody does on a busy day. The fix is structural: one
source, one build, and consumers that receive a binary they cannot edit.

## Deliberate divergence that remains

`mcp/src/features/flowdesk-chat-v2/` still exists. It is **not** a copy of this package
and must not be treated as one: it is the mcp SPA's own entry (`FlowDeskChatV2.jsx`,
route `/flowdesk-v2`) which talks to the API directly via `config/api.config` instead of
through this package's injected `apiBaseUrl`, plus the vitest suite. Its 19 test files are
the only unit tests the component has anywhere, and one of them
(`altiora-chat-handoff.test.jsx`) deliberately runs against the BUILT package rather than
any source.

Folding that entry into this package — so the SPA route mounts `AltioraChat` the way
`AltChatDemoPage` already does — is the remaining step that would leave exactly one copy
of everything.

## Where the API base URL comes from

The package never hard-codes a URL: the host injects `apiBaseUrl` into a module-level
config (not React context — the Zustand store issues requests outside the React tree).
The Altiora hosts derive it with `getUnpaProxyBaseUrl()` from `VITE_API_BASE_URL`, i.e.
`{API base}/proxy/unpa`, because `UnpaProxyController` is an endpoint of the API and in
every deployed mode the API is a different host than the portal.
