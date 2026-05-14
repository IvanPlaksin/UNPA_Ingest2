# Examples — @unpa/chat

Complete, runnable code examples for common integration scenarios.

---

## 1. Basic integration

Minimal setup with `<UnpaChat>`:

```jsx
import '@unpa/chat/dist/styles.css';
import { UnpaChat } from '@unpa/chat';

function App() {
  return (
    <div style={{ padding: '24px' }}>
      <UnpaChat
        apiBaseUrl="/api/v1"
        userId="user-123"
      />
    </div>
  );
}
```

With a specific graph and completion handler:

```jsx
<UnpaChat
  apiBaseUrl="/api/v1"
  userId="user-123"
  graphId="laptop-provisioning"
  height="500px"
  onComplete={(result) => {
    console.log('Graph completed:', result.state);
    // redirect, close modal, etc.
  }}
  onError={(err) => {
    console.error('Chat error:', err.message);
  }}
/>
```

---

## 2. Light theme

```jsx
<UnpaChat
  apiBaseUrl="/api/v1"
  userId={currentUser.id}
  graphId="onboarding"
  theme="light"
  height="480px"
/>
```

---

## 3. Custom theme via CSS

```css
/* In your app's global stylesheet, loaded after styles.css */
.my-branded-chat.unpa-chat-root {
  --unpa-accent:       #e4002b;   /* brand red */
  --unpa-accent-hover: #ff1744;
  --unpa-bg-primary:   #1a1a1a;
  --unpa-bg-secondary: #252525;
  --unpa-bg-tertiary:  #2e2e2e;
  --unpa-radius:       4px;
  --unpa-radius-sm:    2px;
}
```

```jsx
<UnpaChat
  apiBaseUrl="/api/v1"
  userId="user-1"
  theme="dark"
  className="my-branded-chat"
/>
```

---

## 4. Embedded in a modal or sidebar

```jsx
import { useState } from 'react';
import { UnpaChat } from '@unpa/chat';
import '@unpa/chat/dist/styles.css';

function SupportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open AI Assistant</button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24,
          width: 380, height: 560, zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <UnpaChat
            apiBaseUrl="/api/v1"
            userId="user-1"
            graphId="support"
            width="100%"
            height="100%"
            onComplete={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
```

---

## 5. Auto-send initial prompt

Opens a graph and immediately sends a pre-filled message, skipping the first user turn:

```jsx
<UnpaChat
  apiBaseUrl="/api/v1"
  userId="user-1"
  graphId="asset-request"
  initialPrompt="I need equipment for my new hire"
  welcomeText="Welcome! Processing your request..."
/>
```

---

## 6. Restoring a session

Pass the same `sessionId` to resume a previous conversation after a page reload:

```jsx
const savedSessionId = localStorage.getItem('chatSessionId');

<UnpaChat
  apiBaseUrl="/api/v1"
  userId="user-1"
  sessionId={savedSessionId}
/>
```

To persist the session ID from the headless hook:

```jsx
const { sessionId } = useUnpaChat({ ... });
useEffect(() => {
  localStorage.setItem('chatSessionId', sessionId);
}, [sessionId]);
```

---

## 7. Headless hook — custom UI

Build a fully custom interface while reusing all chat logic:

```jsx
import { useState, useEffect } from 'react';
import { useUnpaChat } from '@unpa/chat';

function CustomChat({ userId }) {
  const [input, setInput] = useState('');
  const {
    messages,
    isLoading,
    sessionId,
    sendMessage,
    handleChoiceClick,
    reset,
    initialize,
  } = useUnpaChat({
    apiBaseUrl: '/api/v1',
    userId,
    graphId: 'laptop-provisioning',
    onComplete: (result) => console.log('done', result),
  });

  useEffect(() => { initialize(); }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) { sendMessage(input.trim()); setInput(''); }
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg msg-${msg.role}`}>
            <p>{msg.text}</p>
            {msg.choices && !msg.formSubmitted && msg.choices.map(c => (
              <button
                key={c.value}
                onClick={() => handleChoiceClick(c, msg)}
                disabled={c.disabled || isLoading}
                className={c.selected ? 'selected' : ''}
              >
                {c.label}
              </button>
            ))}
          </div>
        ))}
        {isLoading && <div className="msg-typing">Thinking...</div>}
      </div>

      <div className="input-row">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={isLoading}
          placeholder="Type a message..."
        />
        <button
          onClick={() => { sendMessage(input.trim()); setInput(''); }}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
        <button onClick={() => reset()}>New session</button>
      </div>
      <small>Session: {sessionId}</small>
    </div>
  );
}
```

---

## 8. Headless hook with FormRenderer

Inject a custom FormRenderer into the headless flow:

```jsx
import { useUnpaChat } from '@unpa/chat';
import { waitingNodeToFormDefinition, extractFormResponse, isStructuralNode } from '@unpa/chat/src/utils/waitingNodeToForm';
import { MyFormRenderer } from './MyFormRenderer';

function ChatWithForms({ userId }) {
  const chat = useUnpaChat({ apiBaseUrl: '/api/v1', userId });

  useEffect(() => { chat.initialize(); }, []);

  return (
    <div>
      {chat.messages.map((msg, i) => (
        <div key={i}>
          <p><strong>{msg.role}:</strong> {msg.text}</p>

          {/* Choice buttons */}
          {msg.choices && !msg.formSubmitted && (
            <div>
              {msg.choices.map(c => (
                <button key={c.value} onClick={() => chat.handleChoiceClick(c, msg)} disabled={c.disabled}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Form widget */}
          {msg.waitingNode && !msg.formSubmitted && (
            <MyFormRenderer
              definition={waitingNodeToFormDefinition(msg.waitingNode, chat.dialogState)}
              isLoading={chat.isLoading}
              onSubmit={(data) => chat.submitForm(extractFormResponse(data), msg)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 9. Context provider — shared state across components

Share a single hook instance across a component tree without prop drilling:

```jsx
import { useUnpaChat, UnpaChatProvider, useUnpaChatContext } from '@unpa/chat';

// Root: create the hook and share it
function ChatRoot({ userId }) {
  const chat = useUnpaChat({ apiBaseUrl: '/api/v1', userId });

  useEffect(() => { chat.initialize(); }, []);

  return (
    <UnpaChatProvider value={chat}>
      <ChatHeader />
      <MessagePanel />
      <InputPanel />
    </UnpaChatProvider>
  );
}

// Any descendant can consume
function ChatHeader() {
  const { sessionId, isLoading, reset } = useUnpaChatContext();
  return (
    <header>
      <span>{isLoading ? 'Thinking...' : `Session: ${sessionId}`}</span>
      <button onClick={() => reset()}>Restart</button>
    </header>
  );
}

function MessagePanel() {
  const { messages } = useUnpaChatContext();
  return (
    <ul>
      {messages.map((msg, i) => <li key={i}>{msg.role}: {msg.text}</li>)}
    </ul>
  );
}

function InputPanel() {
  const [input, setInput] = useState('');
  const { sendMessage, isLoading } = useUnpaChatContext();

  return (
    <div>
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button
        onClick={() => { sendMessage(input); setInput(''); }}
        disabled={isLoading}
      >
        Send
      </button>
    </div>
  );
}
```

---

## 10. Behind a proxy (production deployment)

When deploying behind FlowDeskProxy or any reverse proxy:

```jsx
// The proxy runs at /api, forwarding to the GXE API internally.
// The browser never sees the GXE API origin.
<UnpaChat
  apiBaseUrl="/api/v1"
  userId={user.id}
  graphId="support-triage"
/>
```

Vite dev server proxy config (`vite.config.js`):

```js
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:9000',  // FlowDeskProxy
        changeOrigin: true,
      },
    },
  },
};
```

See [FLOWDESK_CHAT_INTEGRATION.md](../../docs/FLOWDESK_CHAT_INTEGRATION.md) for FlowDeskProxy setup.
