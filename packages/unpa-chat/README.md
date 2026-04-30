# @unpa/chat

Embeddable AI chat component for UNPA FlowDesk integration. Works with GXE RuntimeEngine dialog graphs via the UNPA ProjectAdvisor API.

---

## Installation from Local Folder

### Option 1 — Install directly by path

```bash
npm install /absolute/path/to/packages/unpa-chat
```

Example (Windows):
```bash
npm install D:\UN\Repos\UNPA\UNPA_Ingest\packages\unpa-chat
```

Example (Linux/macOS):
```bash
npm install /home/user/projects/UNPA_Ingest/packages/unpa-chat
```

### Option 2 — Add to package.json with relative path

In your project's `package.json`, add:

```json
{
  "dependencies": {
    "@unpa/chat": "file:../path/to/packages/unpa-chat"
  }
}
```

Then run:

```bash
npm install
```

> **Note:** After any changes to the package source, re-run `npm install` in the consumer project to pick up the latest build.

---

## Build the Package

Before installing, build the package from its source:

```bash
cd packages/unpa-chat
npm install
npm run build
```

This generates `dist/index.js`, `dist/index.esm.js`, and `dist/styles.css`.

---

## Peer Dependencies

Your project must have the following packages installed:

```bash
npm install react react-dom @mui/material @mui/icons-material @emotion/react @emotion/styled lucide-react
```

---

## Usage

### Import styles

In your app entry point (e.g. `main.jsx` or `App.jsx`):

```js
import '@unpa/chat/dist/styles.css';
```

### Full UI Component

```jsx
import { UnpaChat } from '@unpa/chat';

function App() {
  return (
    <UnpaChat
      apiBaseUrl="http://localhost:3010/api/v1"
      userId="user-123"
      graphId="flowdesk-intake"
      theme="dark"
      height="500px"
      onComplete={(result) => console.log('Completed:', result)}
      onError={(err) => console.error('Error:', err)}
    />
  );
}
```

### With FormRenderer (for dynamic forms from wait_input nodes)

If your project uses the UNPA FormRenderer for rich form rendering, pass it as a prop:

```jsx
import { UnpaChat } from '@unpa/chat';
import FormRenderer from './components/Forms/FormRenderer'; // from your project

function App() {
  return (
    <UnpaChat
      apiBaseUrl="http://localhost:3010/api/v1"
      userId="user-123"
      graphId="flowdesk-intake"
      formRenderer={FormRenderer}
    />
  );
}
```

Without `formRenderer`, the component falls back to plain HTML textarea/select inputs.

### Custom Form Renderer

For complex STRUCTURAL forms (multi-field forms from `workflow.wait_input` nodes with `structuralGraphId`), provide the host project's FormRenderer component. Without it, the package renders a basic textarea/select fallback.

```jsx
import { UnpaChat } from '@unpa/chat';
import FormRenderer from './components/Forms/FormRenderer'; // from your project

<UnpaChat
  apiBaseUrl="http://localhost:3010/api/v1"
  userId="user-123"
  graphId="flowdesk-intake"
  formRenderer={FormRenderer}
/>
```

If `formRenderer` is not provided, the component uses a built-in fallback with plain HTML `<textarea>` and `<select>` inputs — suitable for simple text/choice dialogs.

---

### Headless Hook (Custom UI)

```jsx
import { useUnpaChat } from '@unpa/chat';

function CustomChat() {
  const {
    messages,
    isLoading,
    dialogState,
    sessionId,
    sendMessage,
    submitForm,
    handleChoiceClick,
    reset,
    initialize,
  } = useUnpaChat({
    apiBaseUrl: 'http://localhost:3010/api/v1',
    userId: 'user-123',
    graphId: 'flowdesk-intake',
    onComplete: (result) => console.log('Done:', result),
    onError: (err) => console.error('Error:', err),
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.text}
        </div>
      ))}
      <input
        onKeyDown={(e) => e.key === 'Enter' && sendMessage(e.target.value)}
        disabled={isLoading}
      />
    </div>
  );
}
```

---

## Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiBaseUrl` | `string` | **required** | Base URL of the UNPA API (e.g. `'/api/v1'` or `'http://host/api/v1'`) |
| `userId` | `string` | **required** | Authenticated user ID |
| `graphId` | `string` | `undefined` | Dialog graph ID to load |
| `graphVersion` | `string` | `undefined` | Specific graph version number |
| `sessionId` | `string` | auto-generated | Override the session identifier |
| `welcomeText` | `string` | `"How can I help?"` | Initial bot message |
| `placeholder` | `string` | `"Type your message..."` | Input field placeholder |
| `theme` | `"dark"` \| `"light"` | `"dark"` | Color theme |
| `className` | `string` | `""` | Additional CSS class on the root element |
| `width` | `string \| number` | `"100%"` | Component width |
| `height` | `string \| number` | `"600px"` | Component height |
| `style` | `object` | `{}` | Additional inline styles on the root element |
| `formRenderer` | `React.ComponentType` | `undefined` | FormRenderer component from host project |
| `onComplete` | `function` | `undefined` | Called when the dialog graph reaches its end node |
| `onError` | `function` | `undefined` | Called on API or network errors |

---

## useUnpaChat Hook API

```ts
const {
  messages,           // { role: 'user'|'bot', text: string, choices?, waitingNode?, isError? }[]
  isLoading,          // boolean — true while waiting for API response
  dialogState,        // object — accumulated dialog state from backend
  sessionId,          // string — current session ID
  sendMessage,        // (text: string) => Promise<void>
  submitForm,         // (value: string | object, sourceMessage?) => Promise<void>
  handleChoiceClick,  // (choice: { value, label }, sourceMessage?) => Promise<void>
  reset,              // (newGraphId?: string) => Promise<void>
  initialize,         // (options?: { graphId?, welcomeText? }) => Promise<void>
} = useUnpaChat(config);
```

---

## Custom Theming via CSS Variables

Override variables on the root element:

```css
.unpa-chat-root {
  --unpa-bg-primary: #1a1a2e;
  --unpa-bg-secondary: #16213e;
  --unpa-bg-tertiary: #0f3460;
  --unpa-border: #333355;
  --unpa-text-primary: #eeeeee;
  --unpa-text-secondary: #aaaaaa;
  --unpa-accent: #4fc3f7;
  --unpa-accent-hover: #81d4fa;
  --unpa-user-bg: rgba(79, 195, 247, 0.1);
  --unpa-error-color: #ef5350;
}
```

---

## API Requirements

The component communicates with a UNPA ProjectAdvisor backend. Required endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/flowdesk/chat` | Send a message, receive dialog response |
| `GET` | `/api/v1/graph-catalog/:id` | Load graph metadata (for welcome message) |

See UNPA ProjectAdvisor documentation for full API reference.

---

## License

MIT
