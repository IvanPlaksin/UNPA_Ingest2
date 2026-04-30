import React, { useState } from 'react';
import { Box, Typography, Paper, ToggleButtonGroup, ToggleButton, Divider, Chip } from '@mui/material';
import { UnpaChat } from '../components/UnpaChat';

const DEMO_USERS = [
  { id: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF', name: 'Alex Wani', label: 'UNDSS Sudan' },
  { id: '1D33EC61-C9D7-4E5D-AFDB-003799C0F1DE', name: 'Merce Llopis', label: 'UNLB Brindisi' },
  { id: '6B2594A9-A313-45EB-912B-001D83AA4D07', name: "Rachel O'Hanlon", label: 'UNIFIL Lebanon' },
];

const FLOWDESK_GRAPH_ID = '96092967-0088-477d-9fcb-f7d6965b8863';

export default function UnpaChatDemoPage() {
  const [theme, setTheme] = useState('dark');
  const [userId, setUserId] = useState(DEMO_USERS[0].id);
  const [chatKey, setChatKey] = useState(0);

  const selectedUser = DEMO_USERS.find(u => u.id === userId);

  const handleUserChange = (_, val) => {
    if (val) { setUserId(val); setChatKey(k => k + 1); }
  };

  return (
    <Box sx={{ height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column', p: 3, bgcolor: 'background.default' }}>
      <Typography variant="h5" gutterBottom>UnpaChat Component Demo</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Embeddable React chat component — extracted from FlowDeskDemo, backed by GXE dialog graphs.
      </Typography>

      <Divider sx={{ my: 2 }} />

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>User:</Typography>
          <ToggleButtonGroup value={userId} exclusive onChange={handleUserChange} size="small">
            {DEMO_USERS.map(u => (
              <ToggleButton key={u.id} value={u.id} sx={{ px: 1.5, py: 0.5, fontSize: 11 }}>
                {u.name}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>Theme:</Typography>
          <ToggleButtonGroup value={theme} exclusive onChange={(_, v) => { if (v) setTheme(v); }} size="small">
            <ToggleButton value="dark" sx={{ px: 1.5, py: 0.5, fontSize: 11 }}>Dark</ToggleButton>
            <ToggleButton value="light" sx={{ px: 1.5, py: 0.5, fontSize: 11 }}>Light</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Chip
          label={`${selectedUser?.name} — ${selectedUser?.label}`}
          size="small"
          color="primary"
          variant="outlined"
        />
      </Box>

      {/* Chat component */}
      <Paper
        elevation={2}
        sx={{
          flex: 1,
          minHeight: 500,
          overflow: 'hidden',
          borderRadius: 2,
          bgcolor: theme === 'dark' ? '#0d1117' : '#fff',
        }}
      >
        <UnpaChat
          key={chatKey}
          apiBaseUrl="/api/v1"
          userId={userId}
          graphId={FLOWDESK_GRAPH_ID}
          theme={theme}
          welcomeText={`Hello! I'm the FlowDesk AI Assistant. You are logged in as **${selectedUser?.name}** (${selectedUser?.label}). How can I help you today?`}
          placeholder="Type your request... (e.g. 'I need a new laptop')"
          onComplete={(result) => console.log('[UnpaChat] Complete:', result)}
          onError={(err) => console.error('[UnpaChat] Error:', err)}
          style={{ height: '100%' }}
        />
      </Paper>
    </Box>
  );
}
