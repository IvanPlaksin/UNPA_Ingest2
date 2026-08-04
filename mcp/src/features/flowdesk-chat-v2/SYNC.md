# FlowDeskChatV2 ↔ AltioraChat — the sync rule, and why the old one failed

## The rule

**One build. Two consumers. Never a hand-copied source.**

| | Path | Role |
|---|---|---|
| **Package source** | `FlowDesk/…/Frontend/Components/flowdesk-chat-v2/src/` | The code. Edited here. |
| **Build output** | `…/flowdesk-chat-v2/dist/` | The only thing anyone consumes. |
| **Consumer — this repo** | `mcp/vendor/flowdesk-chat-v2/` | A COPY of `dist` + `package.json`. |
| **Consumer — Altiora portal** | `Frontend/Clients/shared/features` via `file:` | Resolves to the package dir. |
| **Dev/reference copy** | `mcp/src/features/flowdesk-chat-v2/` (this dir) | **Stale. See below.** |

Ship a change with **one** command — never by copying files by hand:

```bash
# 1. bump the version in the package's package.json (mandatory — see below)
# 2. then:
bash scripts/build-install-chat-v2.sh
```

It builds, installs the artifact into both consumers, and prints a byte-comparison of the
two so an out-of-sync install cannot pass unnoticed.

**The version bump is not a formality.** npm (`--install-links`) and Vite both cache a
same-version rebuild away: without a bump the build succeeds, the copy succeeds, and the
consumer keeps running the previous bundle. The script refuses to run if the version has
not moved.

## Why this document was rewritten (2026-07-30)

The previous rule was "two copies, keep them in step by hand; port the *change*, not the
*file*". It did not survive contact with reality. Measured drift at the moment it was
replaced — package versus this directory, shared files only:

| File | here | package | behind by |
|---|---|---|---|
| `styles/chat-v2.css` | 574 | 937 | **+363** |
| `components/AISettingsDialog.jsx` | 63 | 135 | +72 |
| `store/chat-store.js` | 509 | 579 | +70 |
| `components/MessageBubble.jsx` | 104 | 159 | +55 |
| `components/VoiceControls.jsx` | 55 | 107 | +52 |
| `components/ControlRenderer.jsx` | 135 | 185 | +50 |
| `components/LanguageSwitcher.jsx` | 25 | 74 | +49 |
| `components/AutocompleteControl.jsx` | 69 | 115 | +46 |
| `api/chat-client.js` | 276 | 315 | +39 |
| …7 more | | | ~100 |

Roughly **900 lines** behind across 16 files, plus a whole component
(`components/CardList.jsx`, the request/task rows) that never arrived here at all. The
CSS gap is the clearest symptom: `AISettingsDialog.jsx` exists in this directory, but the
57 `.fdv2-settings-*`, `.fdv2-lang-*`, `.fdv2-card-*` rules it needs do not — so the
component this copy would render is unstyled.

Drift ran the other way too, which is the more expensive half: `sessionEnded` — the
backend saying it closed its side of a conversation — was implemented **here** and never
reached the package, so for as long as that lasted the production component ignored a
contract the backend was emitting. (Fixed in 1.0.46.)

**The lesson: a hand-synchronised second copy is not a copy, it is a fork.** Nobody
notices, because both halves keep working — each host renders its own copy perfectly
well. The divergence surfaces only when someone compares them, which is exactly what
nobody does on a busy day.

## Status of this directory

`mcp/src/features/flowdesk-chat-v2/` is **no longer authoritative for anything shipped**.
It is kept for two reasons only:

- `FlowDeskChatV2.jsx` — the entry the mcp SPA's own route mounts.
- `__tests__/` — 9 vitest files. The package has none, so these are the only unit tests
  the component has anywhere.

Do **not** fix a production bug here and expect it to ship: nothing in this directory is
built or installed. Fix it in the package source.

The intended end state is to eliminate the fork by moving the package source into this
repo, so the code is edited here, built here, and only the artifact is installed into
Altiora. The tests and the SPA entry above move with it. Until that lands, this directory
is reference material with known gaps.

## Divergences that are deliberate (not drift)

Even once the source is single, these two build targets differ by design:

1. **Entry component.** `FlowDeskChatV2.jsx` (SPA route, `config/api.config`) vs
   `AltioraChat.jsx` (runtime-config props: `apiBaseUrl`, `userId`, `userProfile`,
   `getAuthHeaders`, `fetchImpl`, `eventSourceImpl`, `lang`, `onSubmitted`/`onError`/
   `onSessionStart`/`onOpenForm`/`onReveal`, voice + draft-panel toggles).
2. **Transport.** The SPA entry uses `fetch` + `API_BASE_URL` directly; the package goes
   through `config/runtime-config` (`apiUrl`, `getFetch`, `buildHeaders`, `getConfig`,
   `emit`). In `chat-client.js` and `AutocompleteControl.jsx` the package variant must
   call through those.
3. **Package-only modules.** `voice/*`, `index.js`, shadcn theme tokens in the CSS.

## Where the API base URL comes from

The package never hard-codes a URL: the host injects `apiBaseUrl` into a module-level
config (not React context — the Zustand store issues requests outside the React tree).
The Altiora hosts derive it with `getUnpaProxyBaseUrl()` from `VITE_API_BASE_URL`, i.e.
`{API base}/proxy/unpa`, because `UnpaProxyController` is an endpoint of the API and in
every deployed mode the API is a different host than the portal.
