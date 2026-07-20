import React from 'react';
import { Box } from '@mui/material';
import { AltioraChat } from '@flowdesk/chat-v2';
import '@flowdesk/chat-v2/styles.css';
import { API_BASE_URL } from '../config/api.config';
import './AltChatDemoPage.css';

/**
 * ALT CHAT DEMO — hosts the standalone AltioraChat component (@flowdesk/chat-v2)
 * inside Project Advisor.
 *
 * Deliberately chrome-free: no page header, and no `emptyState` injected, so the
 * component's own behaviour is on display — no title bar, and the built-in
 * "How can I help?" empty-state fallback. The `.alt-chat-scope` wrapper is a
 * positioned, full-height host (AltioraChat is position:absolute/inset:0) and
 * also supplies the shadcn theme tokens the component styles read.
 */
const DEMO_USER_ID = 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF';

export default function AltChatDemoPage() {
  return (
    <Box
      className="alt-chat-scope"
      sx={{ flex: 1, position: 'relative', minHeight: 0, bgcolor: 'background.default' }}
    >
      <AltioraChat
        apiBaseUrl={API_BASE_URL}
        userProfile={{ userId: DEMO_USER_ID, firstName: 'Ivan', lastName: 'Plaksin' }}
        lang="en"
        onSubmitted={({ srNumber }) => console.log('[AltioraChat] submitted SR:', srNumber)}
        onError={(e) => console.warn('[AltioraChat] error:', e.code, e.message)}
      />
    </Box>
  );
}
