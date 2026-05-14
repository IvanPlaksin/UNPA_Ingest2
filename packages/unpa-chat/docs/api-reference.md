# API Reference — @unpa/chat

Complete reference for all exported members of the package.

---

## Exports

```js
import {
  UnpaChat,           // Full-UI component
  useUnpaChat,        // Headless logic hook
  UnpaChatProvider,   // Context provider
  useUnpaChatContext, // Context consumer hook
} from '@unpa/chat';
```

---

## `<UnpaChat>` Component

The ready-to-use chat widget. Renders a message list, input area, choice buttons, and form slots inside a self-contained container.

**Source:** `src/UnpaChat.jsx`

### Props

#### Required

| Prop | Type | Description |
|------|------|-------------|
| `apiBaseUrl` | `string` | Base URL for all API calls. Appended before every endpoint path. Examples: `'/api/v1'`, `'/proxy'`, `'https://api.host/api/v1'`. No trailing slash. |
| `userId` | `string` | Authenticated user identifier. Sent with every message to associate sessions and personalise context. |

#### Optional — Conversation

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `graphId` | `string` | `undefined` | ID of the AOPEG dialog graph to run. If omitted, the backend selects the default graph. |
| `graphVersion` | `string` | `undefined` | Pinned graph version string. If omitted, the latest published version is used. |
| `sessionId` | `string` | auto (`'sess-xxxxxxxx'`) | Explicit session ID. Use to resume an existing session across page reloads. If omitted, a new session is created on mount. |
| `welcomeText` | `string` | Graph name from API | First bot message displayed on mount. Overrides the graph-name greeting fetched from the catalog. |
| `placeholder` | `string` | `'Type your message...'` | Placeholder text inside the text input. |
| `initialPrompt` | `string` | `undefined` | If set, this message is sent automatically after initialization, bypassing the user input. Useful for pre-filling a known intent. |

#### Optional — Appearance

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `'dark' \| 'light'` | `'dark'` | Sets the `.unpa-theme-dark` or `.unpa-theme-light` class on the root element, switching the full CSS variable palette. See [theming.md](theming.md). |
| `width` | `string \| number` | `'100%'` | Root element width. Numbers are treated as pixels. |
| `height` | `string \| number` | `'600px'` | Root element height. Numbers are treated as pixels. |
| `className` | `string` | `''` | Additional CSS class appended to `.unpa-chat-root`. |
| `style` | `object` | `{}` | Inline styles merged onto the root `<div>`. |

#### Optional — Integration

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `formRenderer` | `React.ComponentType` | `undefined` | Host application's FormRenderer component. Injected into `FormWidget` for structural forms (multi-field `wait_input` nodes). Without it, the package renders a built-in textarea/select fallback. See [custom-forms.md](custom-forms.md). |
| `onComplete` | `(result: ChatResponse) => void` | `undefined` | Called when the backend returns `isComplete: true`, signalling the dialog graph has reached its end node. Receives the full last API response. |
| `onError` | `(error: Error) => void` | `undefined` | Called when a `fetch` request fails or the backend returns `{ error: string }`. The component already displays an error message in the chat — this callback is for host-level error handling (logging, toasts, etc.). |

---

## `useUnpaChat(config)` Hook

Headless hook. Contains all chat logic (state, API calls, session management) with no UI.  
Use it to build a fully custom interface while reusing the conversation engine.

**Source:** `src/useUnpaChat.js`

### Config Object

```ts
interface UseChatConfig {
  apiBaseUrl:        string;           // required
  userId:            string;           // required
  graphId?:          string;
  graphVersion?:     string;
  initialSessionId?: string;
  onComplete?:       (result: ChatResponse) => void;
  onError?:          (error: Error) => void;
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `apiBaseUrl` | `string` | ✓ | Same as the component prop |
| `userId` | `string` | ✓ | Same as the component prop |
| `graphId` | `string` | | Same as the component prop |
| `graphVersion` | `string` | | Same as the component prop |
| `initialSessionId` | `string` | | Explicit session ID (component uses `sessionId` prop; hook uses `initialSessionId`) |
| `onComplete` | `function` | | Called on `isComplete: true` from the API |
| `onError` | `function` | | Called on any fetch or API error |

### Return Value

```ts
interface UseChatReturn {
  messages:          Message[];
  isLoading:         boolean;
  dialogState:       Record<string, unknown>;
  sessionId:         string;
  sendMessage:       (text: string) => Promise<void>;
  submitForm:        (value: string | object, sourceMessage?: Message) => Promise<void>;
  handleChoiceClick: (choice: Choice, sourceMessage?: Message) => Promise<void>;
  reset:             (newGraphId?: string) => Promise<void>;
  initialize:        (options?: { graphId?: string; welcomeText?: string }) => Promise<GraphInfo | void>;
}
```

| Member | Type | Description |
|--------|------|-------------|
| `messages` | `Message[]` | Ordered conversation history. Each item is a `Message` object (see [Types](#types) below). |
| `isLoading` | `boolean` | `true` while an API request is in flight. Input is disabled and choices are non-interactive during this state. |
| `dialogState` | `object` | Accumulated state object returned by the backend with each response (`data.state`). Contains session-scoped values such as `service_code`, `location`, `dutyStation`. Used to inject context into form fields. |
| `sessionId` | `string` | Current session identifier. Changes on every `reset()` call. |
| `sendMessage(text)` | `async` | Appends a user message, sends it to the API, appends the bot response. No-ops if `isLoading` is true or text is empty. |
| `submitForm(value, msg?)` | `async` | Sends a form value (string or object). If `msg` is provided, marks it as `formSubmitted: true` to hide the form widget. Object values are JSON-stringified before sending. |
| `handleChoiceClick(choice, msg?)` | `async` | Marks the selected choice as `selected`, disables the others, appends the choice label as a user message, and sends `choice.value` to the API. |
| `reset(newGraphId?)` | `async` | Generates a new session ID, clears messages and state. If `newGraphId` or the configured `graphId` is set, fetches the graph name and posts a welcome message. |
| `initialize(opts?)` | `async` | Fetches graph info and posts the first bot message. Called automatically by `UnpaChat` on mount. Call manually in headless mode. Returns the graph info object or `void` on error. |

---

## `UnpaChatProvider` / `useUnpaChatContext`

Context utilities for sharing a single `useUnpaChat` instance across a component subtree.

**Source:** `src/UnpaChatContext.jsx`

### `<UnpaChatProvider value={...}>`

Wraps children with a context that holds a `useUnpaChat` return value.

```jsx
import { useUnpaChat, UnpaChatProvider } from '@unpa/chat';

function ChatRoot() {
  const chat = useUnpaChat({ apiBaseUrl: '/api/v1', userId: 'user-1' });

  return (
    <UnpaChatProvider value={chat}>
      <MessagePanel />
      <StatusBar />
      <InputPanel />
    </UnpaChatProvider>
  );
}
```

### `useUnpaChatContext()`

Reads the context value. Throws `Error('useUnpaChatContext must be used within UnpaChatProvider')` if called outside a provider.

```jsx
import { useUnpaChatContext } from '@unpa/chat';

function StatusBar() {
  const { isLoading, sessionId } = useUnpaChatContext();
  return <span>{isLoading ? 'Thinking...' : `Session: ${sessionId}`}</span>;
}
```

---

## Types

### `Message`

```ts
interface Message {
  role:          'user' | 'bot';
  text:          string;
  choices:       Choice[] | null;
  waitingNode:   WaitingNode | null;
  isError:       boolean;
  formSubmitted?: boolean;  // set to true by submitForm() to hide the form widget
}
```

| Field | Description |
|-------|-------------|
| `role` | `'user'` for messages typed by the user (or submitted via choice/form); `'bot'` for API responses and error messages. |
| `text` | Rendered message text. Bot messages may contain `**bold**` markers (stripped by `ChatMessage`). |
| `choices` | Array of choice options if the graph node offered a quick-select list. `null` if no choices. |
| `waitingNode` | Non-null when the graph is paused at a `wait_input` node. Carries the form/input definition (see `WaitingNode`). |
| `isError` | `true` for error messages injected by the hook when an API call fails. |
| `formSubmitted` | `true` after the form in this message has been submitted. Used to hide the form widget. |

### `Choice`

```ts
interface Choice {
  value:     string;   // sent to the API
  label:     string;   // displayed to the user
  selected?: boolean;  // set after the user clicks this choice
  disabled?: boolean;  // set on all choices after any one is clicked
}
```

### `WaitingNode`

The graph node that paused execution to wait for user input.

```ts
interface WaitingNode {
  nodeId:    string;
  label:     string;
  prompt:    string | undefined;
  inputType: 'text' | 'search' | 'textarea' | string;
  choices:   RawChoice[] | undefined;
}

type RawChoice = string | { value: string; label: string };
```

| Field | Description |
|-------|-------------|
| `nodeId` | Internal graph node ID. Used as a key for form field IDs. |
| `label` | Human-readable node label, used as a fallback title. |
| `prompt` | Displayed above the input field. |
| `inputType` | Controls what input type is rendered in the fallback UI. |
| `choices` | Raw choice list from the graph node. Normalized to `{ value, label }` by the form utilities. |

### `ChatResponse`

What the API returns and what `onComplete` / `sendMessage` resolves with.

```ts
interface ChatResponse {
  response:     string;
  choices:      Choice[] | null;
  state:        Record<string, unknown>;
  executionLog: ExecutionLogEntry[];
  isComplete:   boolean;
  engineStatus: string;
  spawnResult?: unknown;
}
```

### `ExecutionLogEntry`

```ts
interface ExecutionLogEntry {
  node:        string;
  status:      'completed' | 'waiting' | 'skipped' | 'error';
  label?:      string;
  inputState?: {
    prompt?:    string;
    inputType?: string;
    choices?:   RawChoice[];
  };
}
```

---

## Utility Functions

These are not re-exported from `index.js` but are available if imported directly.

### `generateSessionId()` → `string`

**Source:** `src/utils/sessionId.js`

Returns a random session identifier in the format `'sess-xxxxxxxx'` (8 alphanumeric characters). Used internally by `useUnpaChat` on every `reset()`.

```js
import { generateSessionId } from '@unpa/chat/src/utils/sessionId';
generateSessionId(); // → 'sess-k4j7n2qx'
```

---

### `isStructuralNode(waitingNode)` → `boolean`

**Source:** `src/utils/waitingNodeToForm.js`

Returns `true` if the waiting node is a structural form (has `data.structuralGraphId` or `structuralGraphId`). Structural nodes use a dedicated FormRenderer to render multi-field forms instead of a single textarea.

```js
import { isStructuralNode } from '@unpa/chat/src/utils/waitingNodeToForm';
isStructuralNode({ structuralGraphId: 'form-123' }); // → true
isStructuralNode({ inputType: 'text' });              // → false
```

---

### `waitingNodeToFormDefinition(waitingNode, sessionState?)` → `FormDefinition | null`

**Source:** `src/utils/waitingNodeToForm.js`

Converts a `WaitingNode` to a `FormDefinition` object compatible with the host application's FormRenderer.

```ts
function waitingNodeToFormDefinition(
  waitingNode:  WaitingNode | null,
  sessionState?: Record<string, unknown>
): FormDefinition | null
```

Returns `null` if `waitingNode` is falsy.

**Input type → field type mapping:**

| `waitingNode.choices` | `waitingNode.inputType` | Generated field type |
|----------------------|------------------------|----------------------|
| non-empty array | any | `select` |
| empty / undefined | `'text'` | `textarea` |
| empty / undefined | `'search'` | `text` |
| empty / undefined | `undefined` | `textarea` |
| empty / undefined | other | `textarea` |

**Session context fields** (appended as read-only if present in `sessionState`):

| `sessionState` key | Field label |
|--------------------|-------------|
| `service_code` | "Service" |
| `location.name` or `dutyStation` | "Location" |

See [custom-forms.md](custom-forms.md) for the full `FormDefinition` schema.

---

### `extractFormResponse(formData)` → `string | object | null`

**Source:** `src/utils/waitingNodeToForm.js`

Extracts the user's answer from a FormRenderer submission object.

```ts
function extractFormResponse(
  formData: Record<string, unknown> | null
): string | object | null
```

**Logic:**
1. Returns `formData.userInput` if present.
2. Otherwise returns the first value whose key does not start with `'_ctx_'`.
3. Returns `null` if `formData` is falsy or all keys are context (`_ctx_*`).

```js
extractFormResponse({ userInput: 'Developer laptop' });          // → 'Developer laptop'
extractFormResponse({ myField: 'value', _ctx_service: 'IT' });  // → 'value'
extractFormResponse({ _ctx_service: 'IT' });                     // → null
```

---

## API Client Functions

These are not re-exported from `index.js` but can be used directly.

**Source:** `src/services/chatApi.js`

All functions accept `apiBaseUrl` as the first argument. All calls use the browser `fetch` API (no additional HTTP client needed).

| Function | Signature | Endpoint |
|----------|-----------|----------|
| `sendChatMessage` | `(apiBaseUrl, params) → Promise<ChatResponse>` | `POST {apiBaseUrl}/flowdesk/chat` |
| `fetchGraphInfo` | `(apiBaseUrl, graphId) → Promise<GraphInfo>` | `GET {apiBaseUrl}/graph-catalog/{graphId}` |
| `fetchGraphCatalog` | `(apiBaseUrl) → Promise<Graph[]>` | `GET {apiBaseUrl}/graph-catalog?limit=100` |
| `fetchGraphVersions` | `(apiBaseUrl) → Promise<Version[]>` | `GET {apiBaseUrl}/flowdesk/graph-versions` |
| `fetchUserContext` | `(apiBaseUrl, userId) → Promise<UserContext>` | `GET {apiBaseUrl}/flowdesk/user/{userId}/context` |
| `fetchHealth` | `(apiBaseUrl) → Promise<object>` | `GET {apiBaseUrl}/flowdesk/health` |

`sendChatMessage` throws an `Error` if the response contains `{ error: string }`.  
Other functions throw on non-ok HTTP status only if they have explicit `throw` statements (see `fetchUserContext`).

For the full request/response contract, see [api-contract.md](api-contract.md).
