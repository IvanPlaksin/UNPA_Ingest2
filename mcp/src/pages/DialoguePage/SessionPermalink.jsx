import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, Button, Stack, Divider,
  CircularProgress, Alert, Tooltip, IconButton,
} from '@mui/material';
import {
  ArrowBack, OpenInNew, ContentCopy, Check, Lightbulb,
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function SessionPermalink() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openState, setOpenState] = useState('idle'); // idle | loading | done | error
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/v1/dialogue/navigate/session/${sessionId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setData(d);
        else setError(d.error || 'Session not found');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const openInVSCode = async () => {
    setOpenState('loading');
    try {
      const res = await fetch(`${API_BASE}/api/v1/dialogue/navigate/open/${sessionId}`);
      const d = await res.json();
      setOpenState(d.success ? 'done' : 'error');
    } catch {
      window.open(`vscode://devdialogue.connector/open/${sessionId}`, '_self');
      setOpenState('done');
    }
    setTimeout(() => setOpenState('idle'), 3000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/dialogue')} sx={{ mt: 2 }}>
          Back to Timeline
        </Button>
      </Box>
    );
  }

  const { session, links } = data;
  const dateStr = session.createdAt
    ? new Date(session.createdAt).toLocaleString()
    : session.lastModified
      ? new Date(session.lastModified).toLocaleString()
      : '—';

  return (
    <Box sx={{ p: 3, maxWidth: 860, mx: 'auto' }}>
      {/* Nav */}
      <Button startIcon={<ArrowBack />} onClick={() => navigate('/dialogue')} size="small" sx={{ mb: 2 }}>
        Timeline
      </Button>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            {session.title || sessionId}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
            <Chip
              label={session.platform === 'claude_code' ? 'Claude Code' : session.platform === 'claude_ai' ? 'Claude.ai' : session.platform || 'unknown'}
              size="small"
              color={session.platform === 'claude_code' ? 'primary' : 'secondary'}
            />
            <Chip label={dateStr} size="small" variant="outlined" />
            {session.gitBranch && <Chip label={session.gitBranch} size="small" variant="outlined" />}
          </Stack>
        </Box>

        {/* Actions */}
        <Stack direction="row" spacing={1}>
          <Tooltip title={copied ? 'Copied!' : 'Copy permalink'}>
            <IconButton size="small" onClick={copyLink}>
              {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={openState === 'loading' ? <CircularProgress size={14} color="inherit" /> : openState === 'done' ? <Check /> : <OpenInNew />}
            onClick={openInVSCode}
            disabled={openState === 'loading'}
            color={openState === 'done' ? 'success' : 'primary'}
            size="small"
          >
            {openState === 'done' ? 'Opened' : openState === 'error' ? 'Check VS Code' : 'Open in Claude Code'}
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Summary */}
      {session.summary && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>Summary</Typography>
          <Typography variant="body2" color="text.primary" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {session.summary}
          </Typography>
        </Box>
      )}

      {/* Decisions */}
      {session.decisions?.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Lightbulb sx={{ fontSize: 16 }} /> Key Decisions ({session.decisions.length})
          </Typography>
          <Stack spacing={1}>
            {session.decisions.map((d, i) => (
              <Box key={d.decisionId || i} sx={{
                p: 1.5, borderRadius: 1, bgcolor: 'action.hover',
                borderLeft: '3px solid', borderColor: d.confidence > 0.7 ? 'success.main' : 'warning.main',
              }}>
                <Typography variant="body2">{d.text}</Typography>
                {d.confidence != null && (
                  <Chip
                    label={`${Math.round(d.confidence * 100)}% confidence`}
                    size="small"
                    color={d.confidence > 0.7 ? 'success' : 'default'}
                    sx={{ mt: 0.75, height: 18, fontSize: 10 }}
                  />
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Direct links */}
      <Divider sx={{ mb: 2 }} />
      <Typography variant="caption" color="text.disabled">Direct links</Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" gap={1}>
        <Button size="small" variant="outlined" href={links.openInVSCode}>
          vscode:// URI
        </Button>
        <Button size="small" variant="outlined" href={links.navigatorOpen} target="_blank">
          Navigator API
        </Button>
        <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center', fontFamily: 'monospace' }}>
          ID: {sessionId}
        </Typography>
      </Stack>
    </Box>
  );
}
