# Changelog — @unpa/chat

All notable changes to this package are documented here.

---

## [1.0.0] — 2026-05-14

Initial release.

### Added

**Core component**
- `<UnpaChat>` — embeddable chat widget with message list, input area, choice buttons, and form slots
- Full props surface: `apiBaseUrl`, `userId`, `graphId`, `graphVersion`, `sessionId`, `welcomeText`, `placeholder`, `initialPrompt`, `theme`, `width`, `height`, `className`, `style`, `formRenderer`, `onComplete`, `onError`
- Dark and light theme presets via `--unpa-*` CSS custom properties
- Auto-initialization: fetches graph metadata on mount, posts welcome message
- `initialPrompt` auto-send: fires immediately after initialization without user input

**Headless hook**
- `useUnpaChat(config)` — all chat logic with no UI dependency
- `sendMessage(text)` — user turn with optimistic UI update
- `submitForm(value, msg?)` — form submission; objects are JSON-stringified
- `handleChoiceClick(choice, msg?)` — marks selection, disables others, sends value
- `reset(newGraphId?)` — new session ID, clears history, re-initializes if `graphId` set
- `initialize(opts?)` — fetches graph info, posts first bot message; returns `GraphInfo`
- `dialogState` accumulation across all turns (session-scoped backend state)

**Context API**
- `<UnpaChatProvider value={...}>` — share one `useUnpaChat` instance across a subtree
- `useUnpaChatContext()` — consumer hook; throws if called outside a provider

**FormRenderer integration**
- `FormWidget` — delegates to host `FormRenderer` for structural nodes; built-in textarea/select fallback
- `waitingNodeToFormDefinition(waitingNode, sessionState?)` — converts `WaitingNode` to `FormDefinition`
- `isStructuralNode(waitingNode)` — detects structural (multi-field) graph forms
- `extractFormResponse(formData)` — normalizes FormRenderer output to string or object
- Session context fields: `service_code`, `location.name` / `dutyStation` appended as read-only

**API client** (`src/services/chatApi.js`)
- `sendChatMessage` — `POST /flowdesk/chat`
- `fetchGraphInfo` — `GET /graph-catalog/{graphId}`
- `fetchGraphCatalog` — `GET /graph-catalog?limit=100`
- `fetchGraphVersions` — `GET /flowdesk/graph-versions`
- `fetchUserContext` — `GET /flowdesk/user/{userId}/context`
- `fetchHealth` — `GET /flowdesk/health`

**Build**
- Rollup build: CJS (`dist/index.js`), ESM (`dist/index.esm.js`), extracted CSS (`dist/styles.css`)
- `prepare` script: auto-rebuilds on `npm install` from a local path
- All React / MUI / Emotion / lucide-react kept as peer dependencies

**Documentation**
- `README.md` — quick start, props table, headless hook snippet, build instructions
- `docs/api-reference.md` — complete API: props, hook, context, types, utilities, client functions
- `docs/theming.md` — CSS variable reference, class names, custom theme examples
- `docs/custom-forms.md` — FormRenderer integration, `FormDefinition` schema, built-in fallback
- `docs/api-contract.md` — all backend endpoints: request/response shapes, error handling
- `docs/examples.md` — 10 complete code examples covering all integration patterns
