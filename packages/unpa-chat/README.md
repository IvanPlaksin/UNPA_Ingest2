# @unpa/chat

Embeddable AI chat component for FlowDesk integration. Connects to the GXE RuntimeEngine API and drives conversational dialog graphs — choices, structured forms, and free-text input — from a single React component.

---

## Quick Start

### 1. Install peer dependencies

```bash
npm install react react-dom \
  @mui/material @mui/icons-material \
  @emotion/react @emotion/styled \
  lucide-react
```

### 2. Install the package

**From a local build** (most common):
```bash
npm install "file:/path/to/UNPA_Ingest/packages/unpa-chat"
```

**From a tarball** (received from the UNPA team):
```bash
npm install ./unpa-chat-1.0.0.tgz
```

### 3. Import styles

```js
// In your app entry point (main.jsx / index.js)
import '@unpa/chat/dist/styles.css';
```

### 4. Use the component

```jsx
import { UnpaChat } from '@unpa/chat';

function App() {
  return (
    <UnpaChat
      apiBaseUrl="/api/v1"       // API base URL or proxy path
      userId="user-123"          // current user ID
      graphId="laptop-provisioning"
      theme="dark"
      height="500px"
      onComplete={(result) => console.log('done', result)}
    />
  );
}
```

---

## Component Props

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `apiBaseUrl` | `string` | — | ✓ | API base URL, e.g. `'/api/v1'` or `'https://host/api/v1'` |
| `userId` | `string` | — | ✓ | Authenticated user ID |
| `graphId` | `string` | `undefined` | | Dialog graph ID to load |
| `graphVersion` | `string` | `undefined` | | Specific graph version |
| `sessionId` | `string` | auto-generated | | Override the session identifier |
| `welcomeText` | `string` | auto from graph | | Initial bot message |
| `placeholder` | `string` | `'Type your message...'` | | Input placeholder text |
| `initialPrompt` | `string` | `undefined` | | Message sent automatically on mount |
| `theme` | `'dark' \| 'light'` | `'dark'` | | Color theme preset |
| `className` | `string` | `''` | | Additional CSS class on the root element |
| `width` | `string \| number` | `'100%'` | | Width (CSS value or pixels) |
| `height` | `string \| number` | `'600px'` | | Height (CSS value or pixels) |
| `style` | `object` | `{}` | | Inline styles on the root element |
| `formRenderer` | `React.ComponentType` | `undefined` | | Host app's FormRenderer for structural forms |
| `onComplete` | `(result) => void` | `undefined` | | Called when the graph reaches its end node |
| `onError` | `(error) => void` | `undefined` | | Called on API or network errors |

---

## Headless Hook

Use `useUnpaChat` to build a fully custom UI with the same logic:

```jsx
import { useUnpaChat } from '@unpa/chat';

function CustomChat() {
  const {
    messages,
    isLoading,
    sendMessage,
    handleChoiceClick,
    submitForm,
    reset,
  } = useUnpaChat({
    apiBaseUrl: '/api/v1',
    userId: 'user-123',
    graphId: 'laptop-provisioning',
  });

  return (/* your custom UI */);
}
```

---

## Build the Package

If modifying source:

```bash
cd packages/unpa-chat
npm install          # install devDependencies
npm run build        # Rollup → dist/
```

Output: `dist/index.js` (CJS), `dist/index.esm.js` (ESM), `dist/styles.css`.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/api-reference.md](docs/api-reference.md) | Complete API: props, hook, types, utilities |
| [docs/theming.md](docs/theming.md) | CSS variables, class names, custom themes |
| [docs/custom-forms.md](docs/custom-forms.md) | FormRenderer integration and structural forms |
| [docs/api-contract.md](docs/api-contract.md) | Backend endpoints this package calls |
| [docs/examples.md](docs/examples.md) | Full code examples for common scenarios |

For backend setup and proxy configuration, see the main project:
[docs/FLOWDESK_CHAT_INTEGRATION.md](../../docs/FLOWDESK_CHAT_INTEGRATION.md)

---

## License

MIT
