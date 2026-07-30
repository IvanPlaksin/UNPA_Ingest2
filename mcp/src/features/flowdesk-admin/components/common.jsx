/**
 * FlowDesk Chat Admin — shared UI atoms (KPI cards, outcome chips, hooks).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paper, Typography, Chip, Box, CircularProgress } from '@mui/material';

export const OUTCOME_META = {
  active:            { color: 'info',    label: 'active' },
  completed:         { color: 'success', label: 'completed' },
  escalated:         { color: 'warning', label: 'escalated' },
  parked:            { color: 'default', label: 'parked' },
  parked_abandoned:  { color: 'error',   label: 'parked (lost)' },
  abandoned:         { color: 'error',   label: 'abandoned' },
  submit_failed:     { color: 'error',   label: 'submit failed' },
  error_terminated:  { color: 'error',   label: 'error' },
};

// Mirrors the derived flags in api chat-admin.service sessionView(). No
// 'negative CSAT' entry: the chat has no rating collection point, so the API
// never emits that flag (TASK-FLOWDESK-BUG-002). FlagChips falls back to the raw
// flag name for anything not listed, so an unknown flag still renders.
export const FLAG_LABELS = {
  repair_heavy: 'repair ≥3',
  out_of_scope_loop: 'out-of-scope loop',
  error_turns: 'error turns',
};

export function OutcomeChip({ outcome }) {
  const meta = OUTCOME_META[outcome || 'active'] || { color: 'default', label: outcome };
  return <Chip size="small" color={meta.color} label={meta.label} variant={outcome ? 'filled' : 'outlined'} />;
}

export function FlagChips({ flags = [] }) {
  return flags.map((f) => (
    <Chip key={f} size="small" variant="outlined" color="warning" label={FLAG_LABELS[f] || f} sx={{ mr: 0.5 }} />
  ));
}

export function Kpi({ label, value, sub, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 120, flex: '1 1 120px' }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{label}</Typography>
      <Typography variant="h6" sx={{ color: color || 'text.primary', lineHeight: 1.3 }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 3, color: 'text.secondary' }}>
      <CircularProgress size={18} /> <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, my: 1, borderColor: 'error.main' }}>
      <Typography variant="body2" color="error">
        {String(error.message || error)}{' '}
        {onRetry && <a href="#retry" onClick={(e) => { e.preventDefault(); onRetry(); }}>retry</a>}
      </Typography>
    </Paper>
  );
}

/** Poll `loadFn` on an interval (SourcesDashboard pattern). */
export function useAutoRefresh(loadFn, intervalMs = 5000, deps = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const load = useCallback(async () => {
    try { setError(null); await loadFn(); } catch (e) { setError(e); } finally { setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    if (intervalMs) {
      timer.current = setInterval(load, intervalMs);
      return () => clearInterval(timer.current);
    }
    return undefined;
  }, [load, intervalMs]);
  return { loading, error, reload: load };
}

export const fmtCost = (v) => (v == null ? '—' : `$${Number(v).toFixed(4)}`);
export const fmtMs = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
export const fmtPct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const fmtTs = (v) => (v ? new Date(v).toLocaleString() : '—');
export const fmtTsShort = (v) => (v ? new Date(v).toLocaleTimeString() : '—');
