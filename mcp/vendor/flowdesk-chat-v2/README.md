# @flowdesk/chat-v2 — `AltioraChat`

Conversational service-request intake, packaged as a standalone React component.
A user describes what they need in plain language; the component talks to the
ProjectAdvisor backend, drives the interpreter graph, and builds up a live
service-request draft (optional side panel) until the request is submitted.

The exported component is **`AltioraChat`** (the npm package is still named
`@flowdesk/chat-v2`).

- **Self-contained.** Ships its own i18next instance (6 UN languages, RTL for
  Arabic), Zustand store, markdown renderer and REST/SSE client. The host only
  provides React and a backend URL.
- **Theme-aware.** Every colour, radius and font resolves through the host's
  shadcn/Tailwind design tokens (`--primary`, `--background`, `--border`,
  `--radius`, …). Dropped into **FlowDeskPortal** it adopts the portal's brand
  blue, Roboto type and light/dark switch automatically — no configuration.
- **Backend-agnostic within FlowDesk.** The API base URL, user identity, auth
  headers and lifecycle callbacks are all runtime props.

---

## Requirements

| Peer dependency | Version |
| --------------- | ------- |
| `react`         | 18.2+ or 19 |
| `react-dom`     | 18.2+ or 19 |

Everything else (`zustand`, `i18next`, `react-i18next`, `react-markdown`,
`remark-gfm`) is bundled into the package — nothing else to install or
reconcile.

A running ProjectAdvisor API is required at runtime; the component calls
`{apiBaseUrl}/flowdesk/*` (chat, draft, schema, SSE progress stream).

---

## Installation (local folder, no npm registry)

The package lives at
`FlowDesk/Frontend/Components/flowdesk-chat-v2` and is installed **from the
folder**, not from a registry.

### The React-duplication caveat (read this first)

A plain `npm install <path>` installs a local dependency as a **symlink**. The
package directory contains its own `node_modules/react` (a build-time
dependency), and a symlinked package resolves modules against *its own*
`node_modules` — so the component ends up using a **second copy of React**. The
result at runtime is:

> Invalid hook call … you might have more than one copy of React

Pick **one** of the two supported install methods below; both were verified to
render the component against a single React copy.

### Method A — `--install-links` (recommended, works with any bundler)

`--install-links` copies the package into `node_modules` as a real directory and
**does not** bring the package's own `node_modules` along, so React resolves to
the host's copy.

```bash
# from the consuming project (e.g. FlowDeskPortal)
npm install ../../Components/flowdesk-chat-v2 --install-links
```

This writes a `file:` dependency to your `package.json`:

```jsonc
{
  "dependencies": {
    "@flowdesk/chat-v2": "file:../../Components/flowdesk-chat-v2"
  }
}
```

> Re-run the same `npm install … --install-links` command after every rebuild of
> the component — a copied (non-symlinked) dependency does not update on its own.

### Method B — plain symlink + Vite `dedupe` (Vite projects only)

If you prefer the default symlink install, force the bundler to collapse the two
React copies into one. For a Vite app (FlowDeskPortal, Agent, BI, BO):

```bash
npm install ../../Components/flowdesk-chat-v2
```

```js
// vite.config.ts
export default defineConfig({
  // …
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
```

Verified: with `resolve.dedupe` set, a symlinked install builds and runs against
a single React. Without it, you get the invalid-hook-call error above.

### Build the component before installing

The package is consumed from its built `dist/`. If `dist/` is missing or stale:

```bash
cd FlowDesk/Frontend/Components/flowdesk-chat-v2
npm install      # first time only — pulls build tooling
npm run build    # emits dist/ (ESM + CJS + CSS + index.d.ts)
```

---

## Usage

Import the component **and its stylesheet** once:

```jsx
import { AltioraChat } from '@flowdesk/chat-v2';
import '@flowdesk/chat-v2/styles.css';

export default function SupportPage() {
  return (
    // The component is position:absolute; inset:0 — give it a positioned,
    // sized wrapper so it fills a region rather than the whole viewport.
    <div style={{ position: 'relative', height: '100vh' }}>
      <AltioraChat apiBaseUrl="https://your-host/api/v1" />
    </div>
  );
}
```

### Custom empty state

Inject your own pre-conversation content via the `emptyState` prop or as
children. When neither is supplied, the component shows a plain "How can I
help?".

```jsx
<div style={{ position: 'relative', height: '100vh' }}>
  <AltioraChat
    apiBaseUrl="https://your-host/api/v1"
    emptyState={
      <div>
        <h1>Welcome to Altiora</h1>
        <p>Ask for anything — access, equipment, travel, support.</p>
      </div>
    }
  />
</div>

{/* …or equivalently as children: */}
<AltioraChat apiBaseUrl="https://your-host/api/v1">
  <MyWelcomeBanner />
</AltioraChat>
```

### With authentication and lifecycle hooks

```jsx
import { AltioraChat } from '@flowdesk/chat-v2';
import '@flowdesk/chat-v2/styles.css';
import { useAuth } from '@shared/features';       // host's own auth
import { useNavigate } from 'react-router-dom';

function ChatRoute() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 64px)' }}>
      <AltioraChat
        apiBaseUrl={import.meta.env.VITE_API_URL}
        userId={user.oid}
        getAuthHeaders={async () => ({ Authorization: `Bearer ${await getToken()}` })}
        lang="en"
        onSubmitted={({ srNumber }) => navigate(`/requests/${srNumber}`)}
        onError={(e) => console.warn('[chat]', e.code, e.message)}
      />
    </div>
  );
}
```

### Theming

The component reads the shadcn CSS variables already defined on your app root
(`shared/ui/src/base.css` in the FlowDesk monorepo). It needs **no** Tailwind
configuration and does **not** have to appear in your `tailwind.config` content
globs — the styles ship pre-built in `styles.css`.

To re-theme just the chat, override any bridged token on a wrapper:

```css
.my-chat-scope {
  --primary: 262 83% 58%;   /* violet send button + accents, this instance only */
  --radius: 1rem;
}
```

```jsx
<div className="my-chat-scope" style={{ position: 'relative', height: '100%' }}>
  <AltioraChat apiBaseUrl="…" />
</div>
```

Dark mode follows the portal's convention: the component styles react to a
`.dark` class on an ancestor (`<html>`), exactly as `ThemeContext` toggles it.
No prop required.

---

## Component specification

### `<AltioraChat />` props

| Prop | Type | Default | Required | Description |
| ---- | ---- | ------- | :------: | ----------- |
| `apiBaseUrl` | `string` | — | ✅ | Base URL of the ProjectAdvisor API, including the version prefix and **without** a trailing slash, e.g. `https://host/api/v1`. All calls are made beneath `{apiBaseUrl}/flowdesk/*`. |
| `userId` | `string` | `"fdv2-demo-user"` | | Identity the service request is raised for. Use the authenticated user id (e.g. Azure AD oid). |
| `getAuthHeaders` | `() => Record<string,string> \| Promise<…>` | `null` | | Extra headers added to every REST call. May be async so a token can be refreshed lazily. **Not** applied to the SSE progress stream (EventSource cannot send headers — see Notes). |
| `fetchImpl` | `typeof fetch` | `globalThis.fetch` | | Replacement `fetch` implementation (custom retry, tracing, interceptors). |
| `eventSourceImpl` | `typeof EventSource` | `globalThis.EventSource` | | Replacement `EventSource` for the progress stream (e.g. a polyfill that supports headers). |
| `lang` | `'en'\|'fr'\|'es'\|'ar'\|'ru'\|'zh'` | user/`'en'` | | Initial UI language. Applied once per change; the in-UI switcher owns it afterwards. Persisted to `localStorage` (`fdv2-lang`). |
| `serviceId` | `string \| null` | `null` | | Pre-select a service so the draft panel starts populated. Applied **only** while the conversation is empty — never wipes a live thread. |
| `showDraftPanel` | `boolean` | `false` | | Show the live service-request draft side panel. Hidden by default. |
| `showLanguageSwitcher` | `boolean` | `true` | | Show the language dropdown in the composer toolbar (right of the input). |
| `showVoiceControls` | `boolean` | `true` | | Show the **Live Chat** button in the composer toolbar. Visible-but-disabled placeholder until the live-chat backend ships; set `false` to hide it. |
| `emptyState` | `ReactNode` | — | | Pre-conversation content, shown until the first message. May also be passed as **children**. Falls back to a plain "How can I help?" when omitted. |
| `className` | `string` | — | | Extra class on the root element (styling / scoping hook). |
| `onSubmitted` | `(e: SubmittedEvent) => void` | — | | Fired once a service request has been created. |
| `onError` | `(e: ChatErrorInfo) => void` | — | | Fired on any turn failure, **after** the in-chat error message is shown. |
| `onSessionStart` | `(s: ChatSession) => void` | — | | Fired when a new session begins. |

`apiBaseUrl` is the only required prop. All booleans default to `true` (full
experience); the rest are opt-in integration seams.

### Callback payloads

```ts
interface SubmittedEvent {
  srNumber: string;          // service-request number issued by the backend
  sessionId: string;
  serviceId: string | null;
  result: unknown;           // raw turn payload
}

interface ChatErrorInfo {
  code: 'NETWORK' | 'SERVER' | 'TIMEOUT' | 'SSE_DISCONNECT';
  message: string;
}

interface ChatSession {
  id: string;
  serviceId: string | null;
  schemaVersion: string | null;
  status: 'idle' | 'active' | 'draft' | 'confirmed' | 'submitted' | 'escalated';
}
```

### Backend contract

The component expects these endpoints under `apiBaseUrl`:

| Method & path | Purpose |
| ------------- | ------- |
| `POST /flowdesk/chat` | One conversation turn → `{ response, choices, state, executionLog, spawnResult, isComplete }`. Body: `{ sessionId, userId, message, lang }` or `{ sessionId, userId, choice, lang }`. |
| `GET /flowdesk/draft/:sessionId` | Current DraftSR mirror (`404` = no draft yet). |
| `PATCH /flowdesk/draft/:sessionId` | Inline slot edit. Body: `{ patches: [{ op, slotId, value, provenance }] }`. |
| `GET /flowdesk/schema/:serviceId` | Compiled SchemaSnapshot — labels, phases, `dependsOn` (`404` = no schema). |
| `GET /flowdesk/chat/:sessionId/stream` | SSE progress channel (`connected`, `turn:start`, `node:start`, `node:done`, `turn:done`). Cosmetic — losing it never loses data. |

### Additional exports (escape hatches)

Most integrations need only the default/named component. For custom chrome or
imperative control, the package also exports:

```ts
import {
  useChatStore, useChatActions, useMessages, useSession, useDraft, useSchema, useUI,
  configureChat, getConfig,          // runtime config (if calling the API directly)
  chatClient, ChatError, SSE_EVENTS, // REST/SSE client + error type
  i18n, LANGUAGES, setLang, currentLang, currentDir, dirFor,
} from '@flowdesk/chat-v2';
```

- **Store hooks** read live conversation state — e.g. render your own header from
  `useSession()`, or a custom draft drawer from `useDraft()`.
- **`i18n.addResourceBundle(...)`** adds or overrides translations.
- Full TypeScript definitions ship in `dist/index.d.ts`.

---

## Attached documents

The composer has a paperclip: the user attaches a PDF or a photo, it is stored
against the conversation, and the assistant reads it into the request's fields
once a service has been chosen. `showAttachments={false}` removes the button.

**One thing the host must do.** The chat puts the documents on the ticket by
itself only when the request is submitted *in the chat*. When it hands off to the
wizard it cannot: `onOpenForm` fires and the component resets to a fresh
conversation, so once the wizard produces a ticket the chat no longer knows which
conversation the files belong to. Link them from the submit callback, passing the
same object you were handed:

```jsx
import AltioraChat, { linkStagedAttachments } from '@flowdesk/chat-v2';

<AltioraChat
  onOpenForm={(openForm) => openWizard(openForm, async ({ ticketId }) => {
    await linkStagedAttachments(openForm, ticketId);
  })}
/>
```

`openForm` carries `sessionId` and `stagedAttachments[]` for this. It returns
`null` when nothing was attached, and is safe to call twice — the server skips
what it has already linked. Omit it and the documents are retired unlinked after
48 hours.

> **Do not merge `stagedAttachments` into `prefill.attachments`.** The wizard reads
> that key, but on create it forwards any entry without file bytes straight into
> the ticket DTO, where the attachment id collides with the staged row's primary
> key and the ticket is never created.

## Notes & limitations

- **SSE auth.** `EventSource` cannot send custom headers, so `getAuthHeaders`
  does not apply to the progress stream; it is opened with `withCredentials`
  (cookie auth) and the session id in the path. Because progress is purely
  cosmetic, an unauthenticated stream degrades to a plain "Thinking…" indicator
  rather than failing the turn. Inject `eventSourceImpl` if you need
  header-based auth on the stream.
- **Layout.** The root is `position: absolute; inset: 0`. Always mount it inside
  a positioned, sized container. There is **no title bar**; the composer carries
  a right-hand toolbar (language switcher + Live Chat), and a floating **New
  Chat** button sits at the bottom-right of the conversation once a thread
  exists. The draft side panel is **hidden by default** (`showDraftPanel`).
- **Live Chat** is a placeholder (disabled) until the live-chat backend lands.
- **Session persistence.** Only the session id is persisted (to
  `sessionStorage`), so a refresh keeps the thread; message content is
  intentionally never persisted.

## Building & scripts

```bash
npm run build     # production build → dist/ (ESM, CJS, CSS, index.d.ts)
npm run dev       # rebuild on change (watch)
```

Build tooling: Vite library mode. `react`/`react-dom` are externalized; all
other dependencies are bundled. Hand-written types live in `src/index.d.ts` and
are copied to `dist/` on build.
