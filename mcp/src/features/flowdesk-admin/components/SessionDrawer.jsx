/**
 * SessionDrawer — right-anchored session replay with sub-tabs:
 * Transcript · Timeline (node waterfall) · Draft · LLM · Triage.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Drawer, Box, Typography, Stack, Tabs, Tab, Chip, IconButton, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, Tooltip, TextField,
  MenuItem, Button, Alert, Collapse, Dialog, DialogTitle, DialogContent,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LabelList, Tooltip as RTooltip,
} from 'recharts';
import { X, Bot, User, ChevronDown, ChevronRight, ExternalLink, BarChart3 } from 'lucide-react';
import {
  getSession, getSessionTurns, triageSession, createBacklogFromSession, getQualityMeta, getLlmCall,
} from '../api/adminClient';
import { OutcomeChip, FlagChips, Loading, ErrorNote, fmtCost, fmtMs, fmtTs, fmtTsShort } from './common';
import AnalysisView from './AnalysisView';

const NODE_COLORS = {
  ROUTER: '#3b82f6', SLOT_EXTRACT: '#8b5cf6', QUESTION_PLANNER: '#06b6d4',
  INFO_ANSWER: '#22c55e', RESOLVE: '#f59e0b', RESOLVERS: '#f59e0b',
  PATCH: '#64748b', SUBMIT: '#22c55e', CONFIRM: '#22c55e',
  LOAD_DRAFT: '#94a3b8', ERROR: '#ef4444', OUT_OF_SCOPE: '#ef4444', VALIDATE: '#64748b',
  // The agent interpreter's trace is its TOOL calls, so they are actions on this
  // timeline exactly as the state machine's nodes are. Grouped by what they touch:
  // the catalogue (amber), the draft (slate/green), the interface (cyan).
  catalog_search: '#f59e0b', kb_search: '#f59e0b',
  draft_create: '#8b5cf6', draft_update: '#64748b', draft_submit: '#22c55e',
  emit_control: '#06b6d4', open_form: '#3b82f6', escalation_create: '#ef4444',
};

/** A stable colour for an action nobody has named yet — same action, same hue. */
function colorFor(action) {
  if (NODE_COLORS[action]) return NODE_COLORS[action];
  let h = 0;
  for (let i = 0; i < String(action).length; i += 1) h = (h * 31 + String(action).charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

/**
 * The layers a turn spends itself in. Ordered as they are read, not alphabetically:
 * the model first because it usually dominates, then the systems it waits on.
 */
const LAYERS = {
  llm:      { label: 'model',     color: '#8b5cf6' },
  altiora:  { label: 'Altiora',   color: '#f59e0b' },
  search:   { label: 'catalogue', color: '#06b6d4' },
  tool:     { label: 'tools',     color: '#64748b' },
  other:    { label: 'other',     color: '#94a3b8' },
};
const LAYER_ORDER = ['llm', 'altiora', 'search', 'tool', 'other'];

/** Which layer an operation belongs to, when the record does not say. */
function layerOf(name, kind) {
  if (kind && LAYERS[kind]) return kind;
  if (/^(catalog_search|kb_search)/.test(name) || /^services:/.test(name)) return 'search';
  return 'tool';
}

/**
 * Where the time went, across every layer of one or more turns.
 *
 * Three sources, because the runtime records in three places and each was blind
 * to the others:
 *   - `spans`     — the Altiora round trips, the searches, each model call;
 *                   everything timed in code (added 2026-07-29)
 *   - `nodeTrace` — the interpreter's own steps and the agent's tool calls
 *   - `llmCalls`  — the per-turn model total, used ONLY when the turn predates
 *                   spans, so old sessions still show their model time
 *
 * A turn recorded before spans existed still reads correctly; a turn recorded
 * after does not double-count, because the model is taken from spans then.
 */
function aggregateActions(turns) {
  const by = new Map();
  let total = 0;
  // `nested` operations (the vector search inside the catalogue call) are shown
  // but not summed: their milliseconds are already inside their parent's.
  const add = (name, kind, ms, isError, nested, callKey) => {
    const key = `${kind}:${name}`;
    const row = by.get(key) || { key, action: name, kind, totalMs: 0, count: 0, errors: 0, nested: !!nested };
    // Only meaningful for a single turn, where one row IS one call. Across the
    // whole session a row merges several calls and there is no single one to open.
    if (callKey) row.callKey = row.callKey && row.callKey !== callKey ? null : callKey;
    row.totalMs += ms;
    row.count += 1;
    if (isError) row.errors += 1;
    by.set(key, row);
    if (!nested) total += ms;
  };

  for (const t of turns || []) {
    const spans = t.spans || [];
    for (const sp of spans) add(sp.name, layerOf(sp.name, sp.kind), Number(sp.durationMs) || 0, sp.status === 'error', sp.nested, sp.callKey);
    // The tool trace, minus what a span already covers under the same name.
    const spanNames = new Set(spans.map((sp) => sp.name));
    for (const n of t.nodeTrace || []) {
      if (spanNames.has(n.node)) continue;
      add(n.node, layerOf(n.node, 'tool'), Number(n.durationMs) || 0, n.status === 'error');
    }
    // Model time: from spans when the turn has them, otherwise the old per-turn roll-up.
    if (!spans.some((sp) => sp.kind === 'llm')) {
      for (const c of t.llmCalls || []) {
        add(c.model ? `${c.method} · ${c.model}` : (c.method || 'llm'), 'llm', Number(c.latencyMs) || 0, !!c.error);
      }
    }
  }

  const rows = [...by.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    // "└" marks a step that happened inside another one, so a reader can see why
    // the bars add up to more than the measured total.
    .map((r) => ({ ...r, label: r.nested ? `└ ${r.action}` : r.action }));
  const byLayer = LAYER_ORDER
    .map((k) => ({
      kind: k,
      ...LAYERS[k],
      totalMs: rows.filter((r) => r.kind === k && !r.nested).reduce((a, r) => a + r.totalMs, 0),
      count: rows.filter((r) => r.kind === k && !r.nested).reduce((a, r) => a + r.count, 0),
    }))
    .filter((l) => l.count > 0);

  return { rows, byLayer, total, calls: rows.filter((r) => !r.nested).reduce((a, r) => a + r.count, 0) };
}

/** Wall clock the turns actually took — the yardstick every total is read against. */
function wallClock(turns) {
  return (turns || []).reduce((a, t) => a + (Number(t.durationMs) || 0), 0);
}

/**
 * What prompt caching did. `read` is preamble served from cache instead of being
 * re-read; `created` is what it cost to write it. Below Anthropic's minimum
 * cacheable prefix (~4,096 tokens on Haiku 4.5) both stay zero however correct
 * the markers are, so seeing them here is the only way to know it is working.
 */
function cacheTotals(turns) {
  let read = 0; let created = 0;
  for (const t of turns || []) {
    for (const sp of t.spans || []) {
      read += Number(sp.cacheReadTokens) || 0;
      created += Number(sp.cacheCreationTokens) || 0;
    }
  }
  return { read, created };
}

function DistributionTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const share = total ? Math.round((r.totalMs / total) * 100) : 0;
  return (
    <Box sx={{ px: 1, py: 0.75, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, boxShadow: 2 }}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, display: 'block' }}>{r.action}</Typography>
      <Typography variant="caption" sx={{ color: (LAYERS[r.kind] || LAYERS.other).color, display: 'block' }}>
        {(LAYERS[r.kind] || LAYERS.other).label}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {fmtMs(r.totalMs)} · {share}% · {r.count} call{r.count === 1 ? '' : 's'} · avg {fmtMs(r.totalMs / r.count)}
      </Typography>
      {r.errors > 0 && <Typography variant="caption" color="error" sx={{ display: 'block' }}>{r.errors} failed</Typography>}
      {r.callKey && <Typography variant="caption" color="primary" sx={{ display: 'block' }}>click to see the prompt and reply</Typography>}
    </Box>
  );
}

/**
 * The exact call: system prompt, conversation, reply.
 *
 * The panel can say a turn spent 2.8s in `claude-haiku #2`; this says what that
 * call WAS. The prompt is assembled from a graph, a contract, tool schemas and a
 * per-turn brief, so reading it from the code is guesswork — the only honest
 * source is what was sent. Kept for an hour; a miss says so plainly.
 */
function LlmCallDialog({ callKey, onClose }) {
  const [call, setCall] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!callKey) return;
    setCall(null); setError(null);
    getLlmCall(callKey).then(setCall).catch(setError);
  }, [callKey]);

  const block = (title, body, mono = true) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.5 }}>{title}</Typography>
      <Box sx={{
        p: 1, borderRadius: 1, bgcolor: 'action.hover', maxHeight: 320, overflow: 'auto',
        fontFamily: mono ? 'monospace' : undefined, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{body}</Box>
    </Box>
  );

  const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

  return (
    <Dialog open={!!callKey} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle1">Model call</Typography>
          {call && !call.missing && (
            <>
              <Chip size="small" variant="outlined" label={call.model || '—'} />
              <Typography variant="caption" color="text.secondary">
                {fmtMs(call.durationMs)}
                {call.cacheReadTokens ? ` · cache read ${call.cacheReadTokens}` : ''}
                {call.cacheCreationTokens ? ` · created ${call.cacheCreationTokens}` : ''}
              </Typography>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <ErrorNote error={error} />
        {!call && !error && <Loading />}
        {call && call.missing && (
          <Alert severity="info">{call.reason || 'Not in cache.'}</Alert>
        )}
        {call && !call.missing && (
          <>
            {Array.isArray(call.system)
              ? call.system.map((b, i) => block(
                i === 0 ? `System — cached prefix (${b.text.length} chars)` : 'System — per-language tail',
                b.text,
              ))
              : block('System prompt', asText(call.system))}
            {call.toolNames?.length ? block('Tools offered', call.toolNames.join(', '), false) : null}
            {block('Conversation sent', asText(call.messages))}
            {block('Reply', asText(call.response))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Time-per-action for the whole session, or for one turn while the cursor is on
 * it. Sticky and collapsible: the list scrolls underneath it, so the shape of the
 * session stays on screen while you read the turn that produced it.
 */
function ActionDistribution({ turns, selectedTurn, onClearSelection, open, onToggle }) {
  const scope = useMemo(() => (selectedTurn ? [selectedTurn] : turns), [selectedTurn, turns]);
  const { rows, byLayer, total, calls } = useMemo(() => aggregateActions(scope), [scope]);
  const wall = useMemo(() => wallClock(scope), [scope]);
  const cache = useMemo(() => cacheTotals(scope), [scope]);
  // Time the turn spent somewhere nothing measured — the model's own thinking on
  // an un-instrumented path, or plain overhead. Naming it keeps the bars honest:
  // they account for `total`, not for the whole turn.
  const unaccounted = Math.max(0, wall - total);
  const height = Math.min(320, Math.max(96, rows.length * 26 + 24));
  const [openCall, setOpenCall] = useState(null);

  return (
    <Box sx={{
      position: 'sticky', top: 0, zIndex: 3,
      bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider',
    }}>
      <Stack direction="row" alignItems="center" spacing={1}
        sx={{ px: 1.5, py: 0.75, cursor: 'pointer' }} onClick={onToggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BarChart3 size={14} style={{ opacity: 0.7 }} />
        <Typography variant="body2" fontWeight={600}>Time by action</Typography>
        {/* Clicking the chip clears the pick too — the panel is where you are
            looking when you decide you want the session back. */}
        <Chip size="small" variant={selectedTurn ? 'filled' : 'outlined'} color={selectedTurn ? 'primary' : 'default'}
          label={selectedTurn ? `Turn ${selectedTurn.seq}` : `whole session · ${(turns || []).length} turns`}
          onDelete={selectedTurn ? (e) => { e.stopPropagation(); onClearSelection(); } : undefined}
          onClick={selectedTurn ? (e) => { e.stopPropagation(); onClearSelection(); } : undefined} />
        <Box sx={{ flex: 1 }} />
        {/* The bars only account for tool time; a turn also spends time in the
            model. Showing both makes the difference between them visible, which
            is usually where a slow turn actually went. */}
        <Typography variant="caption" color="text.secondary" noWrap>
          {`${fmtMs(wall)} wall · ${fmtMs(total)} measured in ${calls} call${calls === 1 ? '' : 's'}`}
          {selectedTurn && selectedTurn.llmCostUsd ? ` · ${fmtCost(selectedTurn.llmCostUsd)}` : ''}
          {cache.read || cache.created ? ` · cache ${cache.read}↓/${cache.created}↑ tok` : ''}
        </Typography>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ px: 1, pb: 1 }}>
          {/* Layer roll-up first: the bottleneck is usually a LAYER, and only then
              a particular operation inside it. */}
          {byLayer.length > 0 && (
            <Box sx={{ px: 0.5, pb: 0.75 }}>
              <Stack direction="row" sx={{ height: 10, borderRadius: 1, overflow: 'hidden', mb: 0.5 }}>
                {byLayer.map((l) => (
                  <Tooltip key={l.kind} title={`${l.label}: ${fmtMs(l.totalMs)} · ${l.count} call${l.count === 1 ? '' : 's'}`}>
                    <Box sx={{ width: `${(l.totalMs / Math.max(1, wall)) * 100}%`, bgcolor: l.color, opacity: 0.85 }} />
                  </Tooltip>
                ))}
                {unaccounted > 0 && (
                  <Tooltip title={`unmeasured: ${fmtMs(unaccounted)} — turn time outside any recorded operation`}>
                    <Box sx={{ width: `${(unaccounted / Math.max(1, wall)) * 100}%`, bgcolor: 'action.disabled', opacity: 0.5 }} />
                  </Tooltip>
                )}
              </Stack>
              <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {byLayer.map((l) => (
                  <Stack key={l.kind} direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: l.color }} />
                    <Typography variant="caption" color="text.secondary">{l.label} {fmtMs(l.totalMs)}</Typography>
                  </Stack>
                ))}
                {unaccounted > 0 && (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.disabled' }} />
                    <Typography variant="caption" color="text.secondary">unmeasured {fmtMs(unaccounted)}</Typography>
                  </Stack>
                )}
              </Stack>
            </Box>
          )}
          {rows.length ? (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={176} tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                <RTooltip cursor={{ fillOpacity: 0.06 }} content={<DistributionTooltip total={total} />} />
                <Bar dataKey="totalMs" radius={[0, 3, 3, 0]} isAnimationActive={false}
                  // A model call with a recorded payload opens on click. Rows
                  // without one (an aggregate across turns, or a call older than
                  // the hour) stay inert rather than opening an empty dialog.
                  onClick={(d) => { if (d && d.payload && d.payload.callKey) setOpenCall(d.payload.callKey); }}
                  cursor="pointer">
                  {rows.map((r) => (
                    // An action that failed some of the time keeps its own colour —
                    // one bad call out of two does not make the action an error —
                    // and is outlined instead. The count is in the tooltip.
                    // Coloured by LAYER, so the eye groups the model calls, the
                    // Altiora round trips and the searches without reading names.
                    <Cell key={r.key} fill={(LAYERS[r.kind] || LAYERS.other).color} fillOpacity={0.8}
                      stroke={r.errors ? '#ef4444' : undefined} strokeWidth={r.errors ? 1.5 : 0} />
                  ))}
                  <LabelList dataKey="totalMs" position="right" formatter={fmtMs}
                    style={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
              {selectedTurn ? 'This turn called nothing — it answered from the model alone.' : 'No node trace recorded for this session.'}
            </Typography>
          )}
        </Box>
      </Collapse>
      <LlmCallDialog callKey={openCall} onClose={() => setOpenCall(null)} />
    </Box>
  );
}

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
  const [panelOpen, setPanelOpen] = useState(true);
  // Which turn is SELECTED. The panel shows that turn's own distribution while
  // one is picked, and the whole session when none is. Selection survives moving
  // the cursor away — reading a chart you had to keep hovering to hold in place
  // meant you could not point at the bars you were reading.
  const [selected, setSelected] = useState(null);
  const selectedTurn = useMemo(
    () => (selected == null ? null : (turns || []).find((t) => t.seq === selected) || null),
    [selected, turns],
  );
  if (!turns?.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No turns.</Typography>;
  return (
    <Box>
      <ActionDistribution
        turns={turns} selectedTurn={selectedTurn} onClearSelection={() => setSelected(null)}
        open={panelOpen} onToggle={() => setPanelOpen((v) => !v)}
      />
      <Box sx={{ p: 1.5 }}>
      {turns.map((t) => {
        const trace = t.nodeTrace || [];
        const max = Math.max(1, ...trace.map((n) => n.durationMs || 0));
        const isOpen = open[t.seq] !== false;
        const isSelected = selected === t.seq;
        return (
          <Box key={t.turnId || t.seq} sx={{
            mb: 1.5, borderRadius: 1,
            bgcolor: isSelected ? 'action.selected' : 'transparent',
            boxShadow: isSelected ? (theme) => `inset 3px 0 0 ${theme.palette.primary.main}` : 'none',
            transition: 'background-color 120ms',
          }}>
            {/* The row selects; the chevron alone expands. Two things to do with
                one record, and the chevron is already the affordance for one of
                them. */}
            <Stack direction="row" alignItems="center" spacing={1}
              sx={{ cursor: 'pointer', '&:hover': { bgcolor: isSelected ? 'transparent' : 'action.hover' }, borderRadius: 1, py: 0.25 }}
              onClick={() => setSelected((cur) => (cur === t.seq ? null : t.seq))}>
              <Box component="span" sx={{ display: 'flex', p: 0.25, borderRadius: 0.5, '&:hover': { bgcolor: 'action.selected' } }}
                onClick={(e) => { e.stopPropagation(); setOpen((o) => ({ ...o, [t.seq]: !isOpen })); }}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </Box>
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
