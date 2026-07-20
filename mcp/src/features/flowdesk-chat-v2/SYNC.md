# FlowDeskChatV2 ↔ AltioraChat — sync parity

Two copies of the same chat feature exist and **must be kept in step**:

| Copy | Path | Role |
|---|---|---|
| **Source** (`FlowDeskChatV2`) | `mcp/src/features/flowdesk-chat-v2/` (UNPA_Ingest) | Dev/reference — in-repo with the backend, unit-tested (vitest) |
| **Package** (`AltioraChat`, `@flowdesk/chat-v2`) | `FlowDesk/…/Frontend/Components/flowdesk-chat-v2/` | Production — embedded in the Altiora Portal via `AltioraChat` |

The package was extracted from the source and **has deliberately diverged** in three
areas — do NOT copy files blindly; port the *change*, adapting to these:

1. **Entry component.** Source = `FlowDeskChatV2.jsx` (route entry, `config/api.config`
   `API_BASE_URL`). Package = `AltioraChat.jsx` (runtime-config props: `apiBaseUrl`,
   `userId`, `userProfile`, `getAuthHeaders`, `fetchImpl`, `eventSourceImpl`, `lang`,
   `onSubmitted/onError/onSessionStart`, voice + draft-panel toggles).
2. **Transport.** Source uses `fetch` + `API_BASE_URL` directly. Package uses
   `config/runtime-config` (`apiUrl`, `getFetch`, `buildHeaders`, `getConfig`, `emit`).
   → In `chat-client.js` and `AutocompleteControl.jsx`, the package variant must call
   through those, not `fetch`/`API_BASE_URL`.
3. **Extras the package has and the source doesn't.** `voice/*`, host callbacks
   (`emit('onSubmitted'|'onError')`), shadcn theme tokens in the CSS.

## Files that carry the shared functionality (change BOTH)

`components/ControlRenderer.jsx`, `components/AutocompleteControl.jsx`,
`components/MessageBubble.jsx`, `store/chat-store.js`, `api/chat-client.js`,
`i18n/resources.js`, `styles/chat-v2.css`, entry (`FlowDeskChatV2.jsx` / `AltioraChat.jsx`),
and the package's `index.d.ts`.

## Rule when changing chat UI behavior

1. Make the change in the **source** first, unit-test it (vitest).
2. Port the same change into the **package**, adapting to the divergences above.
3. **Bump `package.json` version** in the package (mandatory — same-version rebuilds
   are cached away by npm `--install-links` + Vite and never reach the portal).
4. `npm run build` the package; `npm install @flowdesk/chat-v2 --install-links` in mcp.

## Current parity (2026-07-17) — both have

- `controls[]` turn-contract: `ControlRenderer` + `AutocompleteControl` (typeahead →
  `/flowdesk/directory/:type`) + `MessageBubble` render + store `sendControlAction` +
  `chat-client` `controlAction` in the POST body + `controls`/`tickets`/`breadcrumb` in
  message metadata.
- User profile: `userProfile` identity → store `user`/`setUser`, `userContext` sent on
  every turn.
- Personalized greeting by first name in the selected language (`seedGreeting`, i18n
  `greeting {{name}}`, 6 languages).
- Participant captions: agent = "Altiora" (`agentName`), user = localized "me"
  (`senderMe`), `.fdv2-sender`.
- Respond-in-selected-language: the frontend sends `lang`; the backend localizes (see
  `api/.../ui-strings.js` `agent.*` + `langInstruction`).

Package version at last sync: **1.0.4**.
