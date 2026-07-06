/**
 * IncidentsPanel — "Incidents & AI Response" section for /documents/dashboard.
 *
 * Lists detected problems (incidents raised by the circuit breaker / AI), each
 * with its response methodology, AI diagnosis, proposed remediation actions
 * (auto-applied or escalated for admin Approve/Reject), and a chat thread with
 * the autonomous Claude Code error-response agent.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Button, IconButton, Collapse, Divider,
  TextField, CircularProgress, Tooltip, LinearProgress,
} from '@mui/material';
import {
  AlertOctagon, Bot, ChevronRight, ChevronDown, Check, X as XIcon,
  RefreshCw, Send, Zap, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import {
  getIncidents, getIncident, decideIncidentAction, resolveIncident,
  chatIncident, getAiState, runAi,
} from '../../../services/documentIndex.service';

const SEV = { high: '#dc2626', medium: '#d97706', low: '#6b7280' };
const STATUS_COLOR = {
  open: '#d97706', escalated: '#dc2626', acknowledged: '#2563eb',
  resolved: '#16a34a', auto_resolved: '#16a34a',
};
const ACTION_STATUS = {
  auto_applicable: { label: 'will auto-apply', color: '#2563eb' },
  auto_applied:    { label: 'auto-applied', color: '#16a34a' },
  pending_approval:{ label: 'needs approval', color: '#dc2626' },
  approved:        { label: 'approved', color: '#16a34a' },
  rejected:        { label: 'rejected', color: '#6b7280' },
  failed:          { label: 'failed', color: '#dc2626' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

// ── one proposed remediation action ──────────────────────────────

function ActionRow({ incidentId, action, onChanged }) {
  const [busy, setBusy] = useState(false);
  const st = ACTION_STATUS[action.status] || { label: action.status, color: '#6b7280' };
  const decide = async (decision) => {
    setBusy(true);
    try { await decideIncidentAction(incidentId, action.id, decision); await onChanged(); }
    finally { setBusy(false); }
  };
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
      <Chip label={action.type} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem', fontFamily: 'monospace' }} />
      <Tooltip title={`criticality ${action.criticality}`}>
        <Box sx={{ width: 42 }}>
          <LinearProgress variant="determinate" value={action.criticality}
            sx={{ height: 5, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: action.criticality > 40 ? SEV.high : SEV.low } }} />
        </Box>
      </Tooltip>
      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap title={action.rationale}>
        {action.rationale}
      </Typography>
      <Chip label={st.label} size="small" sx={{ height: 17, fontSize: '0.58rem', color: '#fff', bgcolor: st.color }} />
      {action.source === 'ai' && <Chip label="AI" size="small" sx={{ height: 17, fontSize: '0.55rem' }} />}
      {action.status === 'pending_approval' && (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Approve & apply">
            <span><IconButton size="small" color="success" disabled={busy} onClick={() => decide('approve')}>
              {busy ? <CircularProgress size={12} /> : <Check size={14} />}</IconButton></span>
          </Tooltip>
          <Tooltip title="Reject">
            <span><IconButton size="small" color="error" disabled={busy} onClick={() => decide('reject')}><XIcon size={14} /></IconButton></span>
          </Tooltip>
        </Stack>
      )}
    </Stack>
  );
}

// ── one incident ─────────────────────────────────────────────────

function IncidentCard({ inc, onChanged }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [full, setFull] = useState(inc);
  useEffect(() => { setFull(inc); }, [inc]);

  const refetch = useCallback(async () => {
    try { const r = await getIncident(inc.id); if (r?.data) setFull(r.data); } catch { /* */ }
    onChanged?.();
  }, [inc.id, onChanged]);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    const text = msg; setMsg('');
    try { const r = await chatIncident(inc.id, text); if (r?.data?.incident) setFull(r.data.incident); }
    finally { setSending(false); }
  };

  const pending = (full.proposedActions || []).filter(a => a.status === 'pending_approval').length;
  const sevColor = SEV[full.severity] || SEV.low;
  const stColor = STATUS_COLOR[full.status] || '#6b7280';

  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} alignItems="center"
        sx={{ px: 1, py: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Box sx={{ width: 6, height: 6, borderRadius: 3, bgcolor: sevColor, flexShrink: 0 }} />
        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 190 }} title={full.title}>{full.title}</Typography>
        <Chip label={full.category} size="small" variant="outlined" sx={{ height: 17, fontSize: '0.55rem' }} />
        <Chip label={full.status} size="small" sx={{ height: 17, fontSize: '0.58rem', color: '#fff', bgcolor: stColor }} />
        <Box flex={1} />
        {pending > 0 && <Chip label={`${pending} to approve`} size="small" sx={{ height: 17, fontSize: '0.58rem', color: '#fff', bgcolor: SEV.high }} />}
        <Typography variant="caption" color="text.disabled">{full.errorCount}× · {timeAgo(full.lastSeen)}</Typography>
      </Stack>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2.5, py: 1, bgcolor: 'action.hover' }}>
          {full.description && <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>{full.description}</Typography>}
          {full.methodology && (
            <Typography variant="caption" component="div" color="text.secondary" sx={{ mb: 0.5 }}>
              <b>Methodology:</b> {full.methodology}
            </Typography>
          )}
          {full.aiDiagnosis && (
            <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
              <Bot size={11} style={{ verticalAlign: -1, marginRight: 4 }} /><b>AI diagnosis:</b> {full.aiDiagnosis}
            </Typography>
          )}

          {/* proposed actions */}
          <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mt: 1, textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.04em' }}>
            Proposed actions
          </Typography>
          {(full.proposedActions || []).length
            ? full.proposedActions.map(a => <ActionRow key={a.id} incidentId={full.id} action={a} onChanged={refetch} />)
            : <Typography variant="caption" color="text.disabled">none</Typography>}

          {/* chat */}
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.04em' }}>
            <Bot size={11} style={{ verticalAlign: -1, marginRight: 4 }} />Chat with AI responder
          </Typography>
          <Stack spacing={0.5} sx={{ maxHeight: 160, overflow: 'auto', mb: 0.5 }}>
            {(full.chat || []).map((m, i) => (
              <Box key={i} sx={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <Paper variant="outlined" sx={{ px: 1, py: 0.5, bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper', color: m.role === 'user' ? '#fff' : 'text.primary' }}>
                  <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Typography>
                </Paper>
              </Box>
            ))}
            {!full.chat?.length && <Typography variant="caption" color="text.disabled">Ask the AI about this incident…</Typography>}
          </Stack>
          <Stack direction="row" spacing={0.5}>
            <TextField size="small" fullWidth placeholder="Message the AI responder…" value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              disabled={sending} />
            <IconButton size="small" color="primary" disabled={sending || !msg.trim()} onClick={send}>
              {sending ? <CircularProgress size={14} /> : <Send size={15} />}
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" color="success" startIcon={<CheckCircle2 size={13} />}
              disabled={['resolved'].includes(full.status)} onClick={async () => { await resolveIncident(full.id); await refetch(); }}>
              Mark resolved
            </Button>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

// ── panel ────────────────────────────────────────────────────────

export default function IncidentsPanel() {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState({ summary: null, items: [] });
  const [ai, setAi] = useState(null);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [inc, aiState] = await Promise.all([getIncidents({ limit: 100 }), getAiState()]);
      setData(inc.data || { summary: null, items: [] });
      setAi(aiState.data || null);
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); timer.current = setInterval(load, 5000); return () => clearInterval(timer.current); }, [load]);

  const triggerAi = async () => {
    setRunning(true);
    try { await runAi(); await load(); } finally { setRunning(false); }
  };

  const s = data.summary || {};
  const openItems = (data.items || []).filter(i => !['resolved'].includes(i.status));

  return (
    <Paper variant="outlined">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.25, py: 0.75, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <ShieldAlert size={15} style={{ opacity: 0.7, color: s.escalated ? SEV.high : undefined }} />
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
          Incidents &amp; AI response
        </Typography>
        <Chip label={`${s.open || 0} open`} size="small" sx={{ height: 17, fontSize: '0.6rem', color: '#fff', bgcolor: (s.open ? SEV.medium : '#9ca3af') }} />
        {s.pendingApprovals > 0 && <Chip label={`${s.pendingApprovals} to approve`} size="small" sx={{ height: 17, fontSize: '0.6rem', color: '#fff', bgcolor: SEV.high }} />}
        <Box flex={1} />
        {ai && (
          <Tooltip title={ai.available ? `Claude Code agent ready · triggers at ${ai.rateThreshold} err/min` : 'AI binary/key unavailable — deterministic fallback active'}>
            <Chip icon={<Bot size={12} />} label={ai.available ? 'AI ready' : 'AI fallback'} size="small" variant="outlined"
              sx={{ height: 18, fontSize: '0.58rem', borderColor: ai.available ? '#16a34a' : '#d97706', color: ai.available ? '#16a34a' : '#d97706' }} />
          </Tooltip>
        )}
        <Tooltip title="Run the AI responder now">
          <span><Button size="small" variant="outlined" startIcon={running ? <CircularProgress size={12} /> : <Zap size={13} />}
            disabled={running} onClick={(e) => { e.stopPropagation(); triggerAi(); }} sx={{ py: 0, minWidth: 0 }}>Run AI</Button></span>
        </Tooltip>
      </Stack>

      <Collapse in={open} unmountOnExit>
        <Divider />
        <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
          {openItems.length
            ? openItems.map(inc => <IncidentCard key={inc.id} inc={inc} onChanged={load} />)
            : <Stack alignItems="center" sx={{ py: 2 }} spacing={0.5}>
                <CheckCircle2 size={18} color="#16a34a" />
                <Typography variant="caption" color="text.disabled">No open incidents</Typography>
              </Stack>}
        </Box>
      </Collapse>
    </Paper>
  );
}
