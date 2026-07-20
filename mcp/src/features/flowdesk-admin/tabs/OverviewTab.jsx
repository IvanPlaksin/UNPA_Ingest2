/**
 * Overview — KPI cards, outcome mix, per-day trend, funnel, per-service table.
 */
import React, { useState } from 'react';
import {
  Box, Paper, Typography, Stack, ToggleButtonGroup, ToggleButton,
  Table, TableHead, TableRow, TableCell, TableBody, LinearProgress, Chip,
} from '@mui/material';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend, BarChart, Bar,
} from 'recharts';
import { getSessionStats } from '../api/adminClient';
import { Kpi, Loading, ErrorNote, useAutoRefresh, fmtCost, fmtPct } from '../components/common';

export default function OverviewTab() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState(null);
  const { loading, error, reload } = useAutoRefresh(async () => {
    setStats(await getSessionStats(days));
  }, 10000, [days]);

  if (loading && !stats) return <Loading />;

  const t = stats?.totals || {};
  const funnel = stats?.funnel || {};
  const negTotal = (stats?.byOutcome || []).filter((o) => ['escalated', 'abandoned', 'parked_abandoned', 'submit_failed'].includes(o.outcome))
    .reduce((a, o) => a + o.count, 0);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1">Last {stats?.windowDays || days} days</Typography>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          {[1, 7, 30, 90].map((d) => <ToggleButton key={d} value={d}>{d}d</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>
      <ErrorNote error={error} onRetry={reload} />

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', mb: 2, gap: 1.5 }}>
        <Kpi label="Sessions" value={t.sessions ?? 0} sub={`${t.turns ?? 0} turns`} />
        <Kpi label="Completion" value={fmtPct(t.completionRate)} sub={`${t.completed ?? 0} submitted`}
          color={t.completionRate >= 0.5 ? 'success.main' : 'warning.main'} />
        <Kpi label="Negative" value={negTotal} sub="escalated / abandoned / failed"
          color={negTotal ? 'error.main' : 'success.main'} />
        <Kpi label="Avg turns" value={(t.avgTurns ?? 0).toFixed(1)} />
        <Kpi label="Repair-heavy" value={t.repairHeavy ?? 0} sub="repair ≥ 3" />
        <Kpi label="LLM cost" value={fmtCost(t.llmCostUsd)} sub={`${t.llmCalls ?? 0} calls`} />
      </Stack>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 2, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Sessions per day</Typography>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={stats?.byDay || []}>
              <defs>
                <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="day" stroke="currentColor" fontSize={11} />
              <YAxis stroke="currentColor" fontSize={11} allowDecimals={false} />
              <RTooltip />
              <Legend />
              <Area type="monotone" dataKey="sessions" stroke="#3b82f6" fill="url(#gSess)" name="sessions" isAnimationActive={false} />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" name="completed" isAnimationActive={false} dot={false} />
              <Line type="monotone" dataKey="negative" stroke="#ef4444" name="negative" isAnimationActive={false} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 260 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Outcome mix</Typography>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats?.byOutcome || []} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" stroke="currentColor" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="outcome" stroke="currentColor" fontSize={11} width={110} />
              <RTooltip />
              <Bar dataKey="count" fill="#3b82f6" isAnimationActive={false} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>Funnel</Typography>
          {[['Started', funnel.started], ['Intent resolved', funnel.intentResolved], ['Submitted', funnel.submitted]].map(([label, v]) => (
            <Box key={label} sx={{ mb: 0.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption">{label}</Typography>
                <Typography variant="caption">{v ?? 0}{funnel.started ? ` (${Math.round(((v || 0) / funnel.started) * 100)}%)` : ''}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={funnel.started ? ((v || 0) / funnel.started) * 100 : 0} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          ))}
        </Paper>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Top services</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Service</TableCell><TableCell align="right">Sessions</TableCell>
              <TableCell align="right">Completed</TableCell><TableCell align="right">Negative</TableCell>
              <TableCell align="right">Failure rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(stats?.byService || []).map((s) => (
              <TableRow key={s.serviceId} hover>
                <TableCell><code>{s.serviceId}</code></TableCell>
                <TableCell align="right">{s.sessions}</TableCell>
                <TableCell align="right">{s.completed}</TableCell>
                <TableCell align="right">{s.negative ? <Chip size="small" color="error" label={s.negative} /> : 0}</TableCell>
                <TableCell align="right">{s.sessions ? fmtPct(s.negative / s.sessions) : '—'}</TableCell>
              </TableRow>
            ))}
            {!(stats?.byService || []).length && (
              <TableRow><TableCell colSpan={5}><Typography variant="caption" color="text.secondary">No sessions with a resolved service in this window.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
