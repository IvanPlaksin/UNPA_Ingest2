import React, { useEffect, useState } from 'react';
import { Paper, Box, Typography, FormControl, InputLabel, Select, MenuItem, Chip, Stack } from '@mui/material';
import api from '../../services/api';

const LABELS = {
  'claude-code': 'Claude Code (local CLI — no API key)',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic API',
  ollama: 'Ollama (local)',
};
const HINTS = {
  'claude-code': 'Uses the local Claude Code CLI. No API key / credit balance required.',
  gemini: 'Requires a configured Gemini key.',
  anthropic: 'Requires ANTHROPIC_API_KEY with available credits.',
  ollama: 'Requires a running local Ollama server.',
};

/**
 * Selector for the structured-generation (SDA) LLM provider.
 * Reads/writes GET|PUT /api/v1/settings/llm-provider — applied in-process immediately.
 */
export default function LLMProviderSelector() {
  const [provider, setProvider] = useState('claude-code');
  const [options, setOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    api.get('/settings/llm-provider')
      .then(({ data }) => { setProvider(data.provider); setOptions(data.options || []); })
      .catch(() => { /* keep defaults */ });
  }, []);

  const handleChange = async (e) => {
    const next = e.target.value;
    setSaving(true);
    try {
      await api.put('/settings/llm-provider', { provider: next });
      setProvider(next);
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
        <Box sx={{ minWidth: 260 }}>
          <Typography variant="subtitle2" fontWeight={700}>Structured Generation (SDA) LLM</Typography>
          <Typography variant="caption" color="text.secondary">
            Provider used for intent classification & task planning (StructuredOutputService).
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 300 }} disabled={saving}>
          <InputLabel>Provider</InputLabel>
          <Select label="Provider" value={provider} onChange={handleChange}>
            {options.map((o) => <MenuItem key={o} value={o}>{LABELS[o] || o}</MenuItem>)}
          </Select>
        </FormControl>
        {savedAt && <Chip size="small" color="success" variant="outlined" label={`saved ${savedAt}`} />}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {HINTS[provider]}
      </Typography>
    </Paper>
  );
}
