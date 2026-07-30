# @flowdesk/voice-launcher

A round, pulsing button that starts a live voice conversation with the Altiora
assistant. Mount it once at the app root so it appears on every page (except
login). Filesystem-installed, like `@flowdesk/chat-v2`.

```jsx
import { VoiceLauncher } from '@flowdesk/voice-launcher';
import '@flowdesk/voice-launcher/styles.css';

<VoiceLauncher
  apiBaseUrl="/api/proxy/unpa/api/v1"
  userId={currentUser.id}
  getAuthHeaders={async () => ({ Authorization: `Bearer ${await getToken()}`, 'API-Key': API_KEY })}
  lang={i18n.language}
/>
```

Click the button to launch: a centered pulsing orb (listening / thinking /
speaking) streams voice both ways; click **End**, the backdrop, or press **Esc**
to stop. Barge-in is supported (speak over the assistant to interrupt).

Reuses the same backend voice endpoints as the chat (`/flowdesk/voice/*`); no
chat store or full chat bundle required. Theme the accent with the
`--fdvl-accent` CSS variable.
