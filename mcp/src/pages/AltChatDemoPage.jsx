import React, { useRef } from 'react';
import { Box } from '@mui/material';
import { AltioraChat, FloatingChatProvider, FloatingChatWindow, useKBAnchors } from '@flowdesk/chat-v2';
import '@flowdesk/chat-v2/styles.css';
import { VoiceLauncher } from '@flowdesk/voice-launcher';
import '@flowdesk/voice-launcher/styles.css';
import { API_BASE_URL } from '../config/api.config';
import './AltChatDemoPage.css';

/**
 * ALT CHAT DEMO — hosts the standalone AltioraChat component (@flowdesk/chat-v2)
 * inside Project Advisor.
 *
 * Phase 8 demonstrates the REAL "Explain this" anchor flow (replacing the earlier
 * hardcoded launcher): the mock-portal tiles carry `data-kb-anchor` ids that match
 * seeded UIAnchor nodes, and `useKBAnchors` auto-injects the always-visible "?"
 * trigger. Clicking "?" opens the floating chat and fires the Phase 4 zero-query
 * explain (graph-driven for anchors with EXPLAINS edges, semantic fallback else).
 */
const DEMO_USER_ID = 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF';

const CHAT_PROPS = {
  apiBaseUrl: API_BASE_URL,
  userProfile: { userId: DEMO_USER_ID, firstName: 'Ivan', lastName: 'Plaksin' },
  lang: 'en',
  onSubmitted: ({ srNumber }) => console.log('[AltioraChat] submitted SR:', srNumber),
  onError: (e) => console.warn('[AltioraChat] error:', e.code, e.message),
  // Phase 5: SITE_NAVIGATE. In the Altiora Portal this is wired to React Router:
  // `onNavigate={(n) => navigate(n.path)}` (+ optional joyride spotlight on n.highlight).
  onNavigate: (n) => console.log('[AltioraChat] navigate →', n.path, n.highlight ? `(highlight: ${n.highlight})` : ''),
};

const DEMO_TILES = [
  { anchorId: 'altiora.requests.list', title: 'Your Requests', note: 'curated EXPLAINS edges' },
  { anchorId: 'altiora.catalog.search', title: 'Service Catalog Search', note: 'semantic fallback' },
  { anchorId: 'altiora.approvals.list', title: 'Pending Approvals', note: 'curated EXPLAINS edge' },
];

function DemoBody() {
  const tilesRef = useRef(null);
  // Auto-inject the "?" trigger into every [data-kb-anchor] under this container.
  useKBAnchors(tilesRef);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div ref={tilesRef} className="alt-demo-anchors">
        {DEMO_TILES.map((tile) => (
          <div
            key={tile.anchorId}
            className="alt-demo-tile"
            data-kb-anchor={tile.anchorId}
            data-kb-title={tile.title}
          >
            <strong>{tile.title}</strong>
            <span>{tile.note}</span>
          </div>
        ))}
      </div>
      <Box className="alt-chat-scope" sx={{ flex: 1, position: 'relative', minHeight: 0, bgcolor: 'background.default' }}>
        <AltioraChat {...CHAT_PROPS} />
      </Box>
    </Box>
  );
}

export default function AltChatDemoPage() {
  return (
    <FloatingChatProvider>
      <DemoBody />
      <FloatingChatWindow chatProps={CHAT_PROPS} />
      {/* Voice launcher (@flowdesk/voice-launcher) — the round pulsing button. */}
      <VoiceLauncher apiBaseUrl={API_BASE_URL} userId={DEMO_USER_ID} lang="en" />
    </FloatingChatProvider>
  );
}
