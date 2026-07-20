/**
 * QuarantinePanel — sources parked out of the indexing pool.
 *
 * Two groups:
 *   - "Needs intervention" (mode = needs_fix): non-transient failures (403/WAF,
 *     bad config, parse errors) that will NOT self-heal. Retried only on a long
 *     cooldown; require a human fix (headers/credentials/config). Durable —
 *     survives API restart.
 *   - Auto/manual quarantines: transient spikes on exponential cooldown, or
 *     admin-set holds.
 *
 * Actions: retry now (lift quarantine) and clear a source's per-document
 * quarantine (parked individual documents that repeatedly failed enrich/download).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Paper, Stack, Typography, Chip, IconButton, Tooltip, Collapse, Divider, Box, CircularProgress,
} from '@mui/material';
import {
  ShieldAlert, ChevronRight, ChevronDown, RotateCw, FileWarning, Wrench, Clock,
} from 'lucide-react';
import { getQuarantine, unquarantineSource, clearDocQuarantine } from '../../../services/documentIndex.service';

const MODE_META = {
  needs_fix: { color: '#dc2626', label: 'Needs fix' },
  manual:    { color: '#7c3aed', label: 'Manual hold' },
  auto:      { color: '#d97706', label: 'Auto (transient)' },
};

function untilAgo(ms) {
  if (!ms) return '—';
  const diff = ms - Date.now();
  if (diff <= 0) return 'due now';
  const m = Math.round(diff / 60000);
  if (m < 60) return `retry in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `retry in ${h}h`;
  return `retry in ${Math.round(h / 24)}d`;
}

function Row({ q, onRetry, onClearDocs, busy }) {
  const m = MODE_META[q.mode] || MODE_META.auto;
  return (
    <Stack direction="row" spacing={1} alignItems="center"
      sx={{ px: 1.25, py: 0.6, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Chip label={m.label} size="small"
        sx={{ height: 18, fontSize: '0.58rem', fontWeight: 700, color: '#fff', bgcolor: m.color }} />
      {q.category && <Chip label={q.category} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.55rem' }} />}
      <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 220 }} title={q.name || q.sourceId}>
        {q.name || q.sourceId}
      </Typography>
      {q.reason && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }} title={q.reason}>
          {q.reason}
        </Typography>
      )}
      <Box flex={1} />
      {q.quarantinedDocs > 0 && (
        <Tooltip title="Documents individually parked (repeated enrich/download failure) — clear to retry them">
          <Chip icon={<FileWarning size={11} />} label={q.quarantinedDocs} size="small" variant="outlined"
            onClick={() => onClearDocs(q.sourceId)}
            sx={{ height: 18, fontSize: '0.58rem', cursor: 'pointer' }} />
        </Tooltip>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
        <Clock size={10} style={{ verticalAlign: -1, marginRight: 3, opacity: 0.5 }} />
        {q.trips ? `trip ${q.trips} · ` : ''}{untilAgo(q.openUntil)}
      </Typography>
      <Tooltip title="Retry now (lift quarantine)">
        <span><IconButton size="small" disabled={busy} onClick={() => onRetry(q.sourceId)}>
          {busy ? <CircularProgress size={12} /> : <RotateCw size={13} />}
        </IconButton></span>
      </Tooltip>
    </Stack>
  );
}

export default function QuarantinePanel() {
  const [data, setData] = useState({ needsIntervention: [], all: [] });
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    try { const r = await getQuarantine(); setData(r.data || { needsIntervention: [], all: [] }); }
    catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const act = async (fn, id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try { await fn(id); await load(); } catch { /* ignore */ }
    setBusy(b => ({ ...b, [id]: false }));
  };

  const needs = data.needsIntervention || [];
  const others = (data.all || []).filter(q => q.mode !== 'needs_fix');

  return (
    <Paper variant="outlined">
      <Stack direction="row" spacing={1} alignItems="center"
        sx={{ px: 1.25, py: 0.75, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <ShieldAlert size={15} style={{ opacity: 0.7, color: needs.length ? '#dc2626' : undefined }} />
        <Typography variant="caption" fontWeight={700}
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
          Quarantine &amp; needs intervention
        </Typography>
        <Chip icon={<Wrench size={11} />} label={`${needs.length} need fix`} size="small"
          sx={{ height: 18, fontSize: '0.6rem', color: '#fff', bgcolor: needs.length ? '#dc2626' : 'action.disabled' }} />
        {others.length > 0 && (
          <Chip label={`${others.length} auto/hold`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
        )}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Divider />
        {needs.length === 0 && others.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', p: 2, textAlign: 'center' }}>
            No sources quarantined — the pool is clear
          </Typography>
        ) : (
          <>
            {needs.length > 0 && (
              <>
                <Typography variant="caption" color="error" fontWeight={700}
                  sx={{ display: 'block', px: 1.25, pt: 0.75, fontSize: '0.58rem' }}>
                  REQUIRE A HUMAN FIX (headers / credentials / config) — won't self-heal
                </Typography>
                {needs.map(q => (
                  <Row key={q.sourceId} q={q} busy={busy[q.sourceId]}
                    onRetry={id => act(unquarantineSource, id)}
                    onClearDocs={id => act(clearDocQuarantine, id)} />
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" fontWeight={700}
                  sx={{ display: 'block', px: 1.25, pt: 0.75, fontSize: '0.58rem' }}>
                  TRANSIENT / MANUAL — self-heals on cooldown
                </Typography>
                {others.map(q => (
                  <Row key={q.sourceId} q={q} busy={busy[q.sourceId]}
                    onRetry={id => act(unquarantineSource, id)}
                    onClearDocs={id => act(clearDocQuarantine, id)} />
                ))}
              </>
            )}
          </>
        )}
      </Collapse>
    </Paper>
  );
}
