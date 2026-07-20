/**
 * SessionDrawer — right-anchored session replay with sub-tabs:
 * Transcript · Timeline (node waterfall) · Draft · LLM · Triage.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Drawer, Box, Typography, Stack, Tabs, Tab, Chip, IconButton, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, Tooltip, TextField,
  MenuItem, Button, Alert, Collapse,
} from '@mui/material';
import { X, Bot, User, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import {
  getSession, getSessionTurns, triageSession, createBacklogFromSession, getQualityMeta,
} from '../api/adminClient';
import { OutcomeChip, FlagChips, Loading, ErrorNote, fmtCost, fmtMs, fmtTs, fmtTsShort } from './common';
import AnalysisView from './AnalysisView';

const NODE_COLORS = {
  ROUTER: '#3b82f6', SLOT_EXTRACT: '#8b5cf6', QUESTION_PLANNER: '#06b6d4',
  INFO_ANSWER: '#22c55e', RESOLVE: '#f59e0b', RESOLVERS: '#f59e0b',
  PATCH: '#64748b', SUBMIT: '#22c55e', CONFIRM: '#22c55e',
  LOAD_DRAFT: '#94a3b8', ERROR: '#ef4444', OUT_OF_SCOPE: '#ef4444', VALIDATE: '#64748b',
};

function Bubble({ role, text, meta }) {
  const isUser = role === 'user';
  if (!text) return null;
  return (
    <Stack direction="row" justifyContent={isUser ? 'flex-end' : 'flex-start'} sx={{ mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ maxWidth: '85%' }}>
        {!isUser && <Bot size={16} style={{ marginTop: 6, flexShrink: 0, opacity: 0.6 }} />}
        <Box sx={{
          px: 1.5, py: 1, borderRadius: 2,
          bgcolor: isUser ? 'primary.main' : 'action.hover',
          color: isUser ? 'primary.contrastText' : 'text.primary',
        }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Typography>
          {meta && <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mt: 0.25 }}>{meta}</Typography>}
        </Box>
        {isUser && <User size={16} style={{ marginTop: 6, flexShrink: 0, opacity: 0.6 }} />}
      </Stack>
    </Stack>
  );
}

function TranscriptView({ turns, voice }) {
  const merged = useMemo(() => {
    const t = (turns || []).map((x) => ({ kind: 'turn', ts: x.ts, x }));
    const v = (voice || []).map((x) => ({ kind: 'voice', ts: x.timestamp, x }));
    return [...t, ...v].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  }, [turns, voice]);
  if (!merged.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No recorded turns (telemetry may have been off, or the session predates it).</Typography>;
  return (
    <Box sx={{ p: 1.5 }}>
      {merged.map((m, i) => m.kind === 'turn' ? (
        <Box key={`t${i}`}>
          <Bubble role="user" text={m.x.userText} meta={`#${m.x.seq} · ${fmtTsShort(m.x.ts)} · ${m.x.route || ''}${m.x.error ? ` · ⚠ ${m.x.error}` : ''}`} />
          <Bubble role="assistant" text={m.x.agentText} meta={`${fmtMs(m.x.durationMs)}${m.x.llmCostUsd ? ` · ${fmtCost(m.x.llmCostUsd)}` : ''}${m.x.askingSlot ? ` · asks: ${m.x.askingSlot}` : ''}`} />
        </Box>
      ) : (
        <Bubble key={`v${i}`} role={m.x.role} text={m.x.content} meta={`voice · ${fmtTsShort(m.x.ts)}`} />
      ))}
    </Box>
  );
}

function TimelineView({ turns }) {
  const [open, setOpen] = useState({});
  if (!turns?.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No turns.</Typography>;
  return (
    <Box sx={{ p: 1.5 }}>
      {turns.map((t) => {
        const trace = t.nodeTrace || [];
        const max = Math.max(1, ...trace.map((n) => n.durationMs || 0));
        const isOpen = open[t.seq] !== false;
        return (
          <Box key={t.turnId || t.seq} sx={{ mb: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer' }}
              onClick={() => setOpen((o) => ({ ...o, [t.seq]: !isOpen }))}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Typography variant="body2" fontWeight={600}>Turn {t.seq}</Typography>
              <Chip size="small" variant="outlined" label={t.route || '?'} color={t.error ? 'error' : 'default'} />
              <Typography variant="caption" color="text.secondary">{fmtMs(t.durationMs)} · {fmtTsShort(t.ts)}</Typography>
              {t.error && <Chip size="small" color="error" label={t.error} />}
            </Stack>
            <Collapse in={isOpen}>
              <Box sx={{ pl: 3, pt: 0.5 }}>
                {trace.length ? trace.map((n, i) => (
                  <Stack key={i} direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                    <Typography variant="caption" sx={{ width: 130, flexShrink: 0, fontFamily: 'monospace' }}>{n.node}</Typography>
                    <Tooltip title={`${n.durationMs ?? '?'}ms · ${n.status}`}>
                      <Box sx={{
                        height: 8, borderRadius: 1,
                        width: `${Math.max(2, ((n.durationMs || 0) / max) * 60)}%`,
                        bgcolor: n.status === 'error' ? '#ef4444' : (NODE_COLORS[n.node] || '#64748b'),
                        opacity: 0.85,
                      }} />
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary">{fmtMs(n.durationMs)}</Typography>
                  </Stack>
                )) : <Typography variant="caption" color="text.secondary">no node trace</Typography>}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}

function DraftView({ draft }) {
  if (!draft) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No draft available (expired and no snapshot).</Typography>;
  const slots = Object.entries(draft.slots || {});
  const fmtVal = (v) => (v == null ? '—' : typeof v === 'object' ? (v.name || v.id || JSON.stringify(v)) : String(v));
  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={`service: ${draft.serviceId || '—'}`} />
        <Chip size="small" label={`status: ${draft.status}`} />
        {draft.srNumber && <Chip size="small" color="success" label={draft.srNumber} />}
        <Chip size="small" variant="outlined" label={`repair: ${draft.repair?.session ?? 0}`} />
      </Stack>
      <Table size="small">
        <TableHead><TableRow><TableCell>Slot</TableCell><TableCell>Value</TableCell><TableCell>Provenance</TableCell><TableCell>Flags</TableCell></TableRow></TableHead>
        <TableBody>
          {slots.map(([id, sv]) => (
            <TableRow key={id} hover>
              <TableCell><code>{id}</code></TableCell>
              <TableCell>{fmtVal(sv.value)}{sv.hint ? <Typography variant="caption" color="text.secondary"> (hint: {fmtVal(sv.hint)})</Typography> : null}</TableCell>
              <TableCell><Chip size="small" variant="outlined" label={sv.provenance} /></TableCell>
              <TableCell>
                {sv.stale && <Chip size="small" color="warning" label="stale" sx={{ mr: 0.5 }} />}
                {sv.pending && <Chip size="small" color="info" label="pending" />}
              </TableCell>
            </TableRow>
          ))}
          {!slots.length && <TableRow><TableCell colSpan={4}><Typography variant="caption" color="text.secondary">no slots filled</Typography></TableCell></TableRow>}
        </TableBody>
      </Table>
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Patch journal ({(draft.patches || []).length})</Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>#</TableCell><TableCell>Op</TableCell><TableCell>Slot</TableCell><TableCell>New value</TableCell><TableCell>Prov</TableCell><TableCell>At</TableCell></TableRow></TableHead>
        <TableBody>
          {(draft.patches || []).map((p, i) => (
            <TableRow key={i} sx={p.rejected ? { opacity: 0.5 } : undefined}>
              <TableCell>{i + 1}</TableCell><TableCell>{p.op}{p.rejected ? ' ✗' : ''}</TableCell>
              <TableCell><code>{p.slotId}</code></TableCell>
              <TableCell>{fmtVal(p.newValue)}</TableCell>
              <TableCell>{p.provenance}</TableCell>
              <TableCell><Typography variant="caption">{fmtTsShort(p.timestamp)}</Typography></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function LlmView({ turns }) {
  const calls = (turns || []).flatMap((t) => (t.llmCalls || []).map((c) => ({ ...c, seq: t.seq })));
  if (!calls.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No LLM calls recorded.</Typography>;
  const total = calls.reduce((a, c) => a + (c.costUsd || 0), 0);
  return (
    <Box sx={{ p: 1.5 }}>
      <Chip size="small" label={`total: ${fmtCost(total)} · ${calls.length} calls`} sx={{ mb: 1 }} />
      <Table size="small">
        <TableHead><TableRow><TableCell>Turn</TableCell><TableCell>Method</TableCell><TableCell>Model</TableCell><TableCell align="right">Latency</TableCell><TableCell align="right">Cost</TableCell><TableCell>Err</TableCell></TableRow></TableHead>
        <TableBody>
          {calls.map((c, i) => (
            <TableRow key={i} hover>
              <TableCell>{c.seq}</TableCell><TableCell>{c.method}</TableCell>
              <TableCell><Typography variant="caption">{c.model || '—'}</Typography></TableCell>
              <TableCell align="right">{fmtMs(c.latencyMs)}</TableCell>
              <TableCell align="right">{fmtCost(c.costUsd)}</TableCell>
              <TableCell>{c.error ? <Chip size="small" color="error" label={c.error} /> : null}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function TriageView({ session, onChanged }) {
  const [meta, setMeta] = useState({ statuses: [], rootCauses: [] });
  const [form, setForm] = useState({ qualityStatus: session.qualityStatus || 'new', rootCause: session.rootCause || '', reviewNote: session.reviewNote || '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { getQualityMeta().then(setMeta).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await triageSession(session.sessionId, { ...form, rootCause: form.rootCause || undefined });
      setMsg({ sev: 'success', text: 'Saved.' });
      onChanged?.();
    } catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const toBacklog = async () => {
    setBusy(true); setMsg(null);
    try {
      const item = await createBacklogFromSession(session.sessionId, { rootCause: form.rootCause || undefined });
      setMsg({ sev: 'success', text: `BackLog item created: ${item.backlogId}` });
      onChanged?.();
    } catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack spacing={1.5} sx={{ maxWidth: 480 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          <OutcomeChip outcome={session.outcome} />
          <FlagChips flags={session.flags} />
          {session.backlogId && <Chip size="small" color="info" label={session.backlogId} />}
        </Stack>
        <TextField select size="small" label="Quality status" value={form.qualityStatus}
          onChange={(e) => setForm((f) => ({ ...f, qualityStatus: e.target.value }))}>
          {(meta.statuses.length ? meta.statuses : ['new', 'reviewed', 'actioned', 'dismissed']).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Root cause" value={form.rootCause}
          onChange={(e) => setForm((f) => ({ ...f, rootCause: e.target.value }))}>
          <MenuItem value="">—</MenuItem>
          {(meta.rootCauses || []).map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Review note" multiline minRows={2} value={form.reviewNote}
          onChange={(e) => setForm((f) => ({ ...f, reviewNote: e.target.value }))} />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" disabled={busy} onClick={save}>Save triage</Button>
          <Button size="small" variant="outlined" disabled={busy || !!session.backlogId} onClick={toBacklog}>Create BackLog task</Button>
        </Stack>
        {msg && <Alert severity={msg.sev} onClose={() => setMsg(null)}>{msg.text}</Alert>}
        {session.reviewedBy && <Typography variant="caption" color="text.secondary">Last review: {session.reviewedBy} · {fmtTs(session.reviewedAt)}</Typography>}
      </Stack>
    </Box>
  );
}

export default function SessionDrawer({ sessionId, open, onClose, onChanged, initialTab }) {
  const [tab, setTab] = useState('transcript');
  const [detail, setDetail] = useState(null);
  const [turnsData, setTurnsData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !sessionId) return;
    setDetail(null); setTurnsData(null); setError(null); setTab(initialTab || 'transcript');
    Promise.all([getSession(sessionId), getSessionTurns(sessionId)])
      .then(([d, t]) => { setDetail(d); setTurnsData(t); })
      .catch(setError);
  }, [open, sessionId, initialTab]);

  const s = detail?.session;
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 720 } } }}>
      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>Session {sessionId}</Typography>
            {s && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                <OutcomeChip outcome={s.outcome} />
                {s.serviceId && <Chip size="small" variant="outlined" label={s.serviceId} />}
                {s.userDisplayName && <Chip size="small" variant="outlined" label={s.userDisplayName} />}
                <Typography variant="caption" color="text.secondary">{fmtTs(s.startedAt)} · {s.turns || 0} turns · {fmtCost(s.llmCostUsd)}</Typography>
                {s.srNumber && <Chip size="small" color="success" label={s.srNumber} icon={<ExternalLink size={12} />} />}
              </Stack>
            )}
          </Box>
          <IconButton onClick={onClose} size="small"><X size={18} /></IconButton>
        </Stack>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ minHeight: 36, borderBottom: 1, borderColor: 'divider' }}>
          {['transcript', 'timeline', 'draft', 'llm', 'analysis', 'triage'].map((k) => (
            <Tab key={k} value={k} label={k === 'analysis' ? 'AI analysis' : k} sx={{ minHeight: 36, py: 0, textTransform: 'capitalize' }} />
          ))}
        </Tabs>
        <Divider />
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <ErrorNote error={error} />
          {!detail && !error && <Loading />}
          {detail && tab === 'transcript' && <TranscriptView turns={turnsData?.turns} voice={turnsData?.voice} />}
          {detail && tab === 'timeline' && <TimelineView turns={turnsData?.turns} />}
          {detail && tab === 'draft' && <DraftView draft={detail.draft} />}
          {detail && tab === 'llm' && <LlmView turns={turnsData?.turns} />}
          {detail && tab === 'analysis' && s && <AnalysisView session={s} />}
          {detail && tab === 'triage' && s && <TriageView session={s} onChanged={onChanged} />}
        </Box>
      </Box>
    </Drawer>
  );
}
