# This directory is NOT a copy of `@flowdesk/chat-v2`

The package source moved out of Altiora and into this repo on 2026-07-30. It now lives at:

    packages/flowdesk-chat-v2/          ← the source, and the only one
    packages/flowdesk-chat-v2/SHIP.md   ← how to build and install it

Altiora holds no source: `Frontend/Components/flowdesk-chat-v2/` is `dist` +
`package.json`, installed by `scripts/build-install-chat-v2.sh`.

**Do not fix a shipped bug here.** Nothing in this directory is built or installed into
anything. A change made here reaches no user.

## What this directory actually is

The mcp SPA's own chat entry, plus the component's tests:

- `FlowDeskChatV2.jsx` — mounted at route `/flowdesk-v2` (`mcp/src/App.jsx`). It talks to
  the API directly through `config/api.config`, rather than through the package's injected
  `apiBaseUrl`, which is why it is a separate entry rather than a call to `AltioraChat`.
- `__tests__/` and `components/__tests__/` etc. — 19 vitest files, the only unit tests the
  component has anywhere. `__tests__/altiora-chat-handoff.test.jsx` deliberately runs
  against the BUILT package (`@flowdesk/chat-v2`), not against any source.

  Run them with: `npx vitest run --config vitest.fdv2.config.js` (from `mcp/`).

The remaining files here are the stale remains of the old hand-synchronised copy — by the
time that arrangement was abandoned they were ~900 lines behind the package across 16
files, and missing `CardList.jsx` entirely. They are kept only because the entry above
imports them. Treat them as this SPA route's private implementation, not as the component.

The step that would remove the last duplication is folding `FlowDeskChatV2.jsx` into the
package — letting the SPA route mount `AltioraChat` the way `mcp/src/pages/AltChatDemoPage.jsx`
already does — and moving the tests alongside the source. See `packages/flowdesk-chat-v2/SHIP.md`
for the reasoning about why two copies were never going to stay in step.
