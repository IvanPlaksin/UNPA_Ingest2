/**
 * Quality — the negative-experience flywheel: auto-flagged sessions feed,
 * triage workflow (root cause → note → BackLog task), root-cause Pareto.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, TextField, MenuItem, Chip, TablePagination,
} from '@mui/material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { getNegativeSessions } from '../api/adminClient';
import { OutcomeChip, FlagChips, Loading, ErrorNote, useAutoRefresh, fmtTs, Kpi } from '../components/common';
import SessionDrawer from '../components/SessionDrawer';

export default function QualityTab() {
  const navigate = useNavigate();
  const [f, setF] = useState({ qualityStatus: '', outcome: '' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);

  const { loading, error, reload } = useAutoRefresh(async () => {
    setData(await getNegativeSessions({ ...f, page: page + 1, pageSize }));
  }, 10000, [JSON.stringify(f), page, pageSize]);

  const items = data?.items || [];
  const pareto = useMemo(() => {
    const m = new Map();
    for (const s of items) {
      const k = s.rootCause || (s.qualityStatus === 'new' ? '(untriaged)' : '(no cause)');
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count);
  }, [items]);
  const untriaged = items.filter((s) => (s.qualityStatus || 'new') === 'new').length;
  const actioned = items.filter((s) => s.qualityStatus === 'actioned').length;

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Kpi label="Flagged (page)" value={data?.total ?? '—'} sub="bad outcome or quality flag" color="error.main" />
        <Kpi label="Untriaged" value={untriaged} color={untriaged ? 'warning.main' : 'success.main'} />
        <Kpi label="Actioned → BackLog" value={actioned} color="info.main" />
        <Paper variant="outlined" sx={{ p: 1, flex: '2 1 320px', minWidth: 280 }}>
          <Typography variant="caption" color="text.secondary">Root-cause Pareto (current page)</Typography>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={pareto} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="cause" width={130} fontSize={10} stroke="currentColor" />
              <RTooltip />
              <Bar dataKey="count" fill="#ef4444" isAnimationActive={false} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <TextField select size="small" label="Triage status" value={f.qualityStatus}
            onChange={(e) => { setPage(0); setF((x) => ({ ...x, qualityStatus: e.target.value })); }} sx={{ minWidth: 150 }}>
            <MenuItem value="">any</MenuItem>
            {['new', 'reviewed', 'actioned', 'dismissed'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Outcome" value={f.outcome}
            onChange={(e) => { setPage(0); setF((x) => ({ ...x, outcome: e.target.value })); }} sx={{ minWidth: 160 }}>
            <MenuItem value="">any</MenuItem>
            {['escalated', 'abandoned', 'parked_abandoned', 'submit_failed', 'completed', 'active'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Started</TableCell><TableCell>User</TableCell><TableCell>Service</TableCell>
                <TableCell>Outcome</TableCell><TableCell>Flags</TableCell>
                <TableCell>Triage</TableCell><TableCell>Root cause</TableCell><TableCell>BackLog</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.sessionId} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(s.sessionId)}>
                  <TableCell><Typography variant="caption">{fmtTs(s.startedAt)}</Typography></TableCell>
                  <TableCell>{s.userDisplayName || s.userId || '—'}</TableCell>
                  <TableCell>{s.serviceId ? <code>{s.serviceId}</code> : '—'}</TableCell>
                  <TableCell><OutcomeChip outcome={s.outcome} /></TableCell>
                  <TableCell><FlagChips flags={s.flags} /></TableCell>
                  <TableCell><Chip size="small" variant="outlined"
                    color={{ new: 'warning', reviewed: 'info', actioned: 'success', dismissed: 'default' }[s.qualityStatus || 'new']}
                    label={s.qualityStatus || 'new'} /></TableCell>
                  <TableCell>{s.rootCause ? s.rootCause.replace(/_/g, ' ') : '—'}</TableCell>
                  <TableCell>{s.backlogId ? <Chip size="small" color="info" label={s.backlogId} /> : '—'}</TableCell>
                </TableRow>
              ))}
              {!items.length && (
                <TableRow><TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    No negative sessions — either the system is healthy or telemetry has just been enabled.
                  </Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination component="div" count={data?.total || 0} page={page} rowsPerPage={pageSize}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50]} />
        </Paper>
      )}
      <SessionDrawer sessionId={selected} open={!!selected} onClose={() => setSelected(null)} onChanged={reload} />
    </Box>
  );
}
