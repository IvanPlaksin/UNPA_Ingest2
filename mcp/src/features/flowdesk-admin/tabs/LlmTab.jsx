/**
 * LLM Telemetry — cost/latency per day, per-model/method breakdown,
 * slowest-turn outliers (jump to session replay).
 */
import React, { useState } from 'react';
import {
  Box, Paper, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, ToggleButtonGroup, ToggleButton, Chip,
} from '@mui/material';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend,
} from 'recharts';
import { getLlmStats } from '../api/adminClient';
import { Loading, ErrorNote, useAutoRefresh, fmtCost, fmtMs, Kpi } from '../components/common';
import SessionDrawer from '../components/SessionDrawer';

export default function LlmTab() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const { loading, error, reload } = useAutoRefresh(async () => {
    setStats(await getLlmStats(days));
  }, 15000, [days]);

  if (loading && !stats) return <Loading />;
  const totalCost = (stats?.byDay || []).reduce((a, d) => a + (d.costUsd || 0), 0);
  const totalTurns = (stats?.byDay || []).reduce((a, d) => a + (d.turns || 0), 0);
  const totalTokens = (stats?.byDay || []).reduce((a, d) => a + (d.tokens || 0), 0);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
          <Kpi label="Turns" value={totalTurns} sub={`${stats?.windowDays || days}d window`} />
          <Kpi label="LLM cost" value={fmtCost(totalCost)} sub={totalCost === 0 && totalTokens > 0 ? 'provider reports tokens only' : undefined} />
          <Kpi label="Tokens" value={totalTokens.toLocaleString()} />
          <Kpi label="Models seen" value={(stats?.byModel || []).length} />
        </Stack>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          {[1, 7, 30].map((d) => <ToggleButton key={d} value={d}>{d}d</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>
      <ErrorNote error={error} onRetry={reload} />

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Cost & latency per day</Typography>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={stats?.byDay || []}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="day" stroke="currentColor" fontSize={11} />
            <YAxis yAxisId="cost" stroke="currentColor" fontSize={11} tickFormatter={(v) => `$${v.toFixed(2)}`} />
            <YAxis yAxisId="ms" orientation="right" stroke="currentColor" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}s`} />
            <RTooltip formatter={(v, name) => name.includes('cost') ? fmtCost(v) : fmtMs(v)} />
            <Legend />
            <Bar yAxisId="cost" dataKey="costUsd" name="costUsd" fill="#3b82f6" isAnimationActive={false} radius={[3, 3, 0, 0]} />
            <Line yAxisId="ms" dataKey="avgTurnMs" name="avg turn ms" stroke="#f59e0b" isAnimationActive={false} dot={false} />
            <Line yAxisId="ms" dataKey="avgLlmLatencyMs" name="avg LLM ms" stroke="#8b5cf6" isAnimationActive={false} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Paper>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>By model / method</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Model</TableCell><TableCell>Method</TableCell><TableCell align="right">Calls</TableCell><TableCell align="right">Avg latency</TableCell><TableCell align="right">Tokens</TableCell><TableCell align="right">Cost</TableCell><TableCell align="right">Errors</TableCell></TableRow></TableHead>
            <TableBody>
              {(stats?.byModel || []).map((m, i) => (
                <TableRow key={i}>
                  <TableCell><Typography variant="caption">{m.model}</Typography></TableCell>
                  <TableCell>{m.method}</TableCell>
                  <TableCell align="right">{m.calls}</TableCell>
                  <TableCell align="right">{fmtMs(m.avgLatencyMs)}</TableCell>
                  <TableCell align="right">{(m.tokens || 0).toLocaleString()}</TableCell>
                  <TableCell align="right">{fmtCost(m.costUsd)}</TableCell>
                  <TableCell align="right">{m.errors ? <Chip size="small" color="error" label={m.errors} /> : 0}</TableCell>
                </TableRow>
              ))}
              {!(stats?.byModel || []).length && <TableRow><TableCell colSpan={7}><Typography variant="caption" color="text.secondary">no calls in window</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>

        <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Slowest turns (click → replay)</Typography>
          <Table size="small">
            <TableHead><TableRow><TableCell>Session</TableCell><TableCell>Turn</TableCell><TableCell>Route</TableCell><TableCell align="right">Duration</TableCell><TableCell align="right">LLM part</TableCell></TableRow></TableHead>
            <TableBody>
              {(stats?.slowestTurns || []).map((t, i) => (
                <TableRow key={i} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(t.sessionId)}>
                  <TableCell><Typography variant="caption" fontFamily="monospace">{String(t.sessionId).slice(0, 12)}…</Typography></TableCell>
                  <TableCell>{t.seq}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={t.route || '?'} /></TableCell>
                  <TableCell align="right">{fmtMs(t.durationMs)}</TableCell>
                  <TableCell align="right">{fmtMs(t.llmLatencyMs)}</TableCell>
                </TableRow>
              ))}
              {!(stats?.slowestTurns || []).length && <TableRow><TableCell colSpan={5}><Typography variant="caption" color="text.secondary">no turns in window</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
      <SessionDrawer sessionId={selected} open={!!selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
