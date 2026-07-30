/**
 * Dialogue Gym — Judge tab. Multi-criteria evaluations of arena runs.
 */
import React, { useState } from 'react';
import {
  Paper, Table, TableHead, TableRow, TableCell, TableBody, Stack, Chip, Typography, Box, Tooltip,
} from '@mui/material';
import { Loading, ErrorNote, useAutoRefresh, Kpi, fmtPct } from '../../flowdesk-admin/components/common';
import { listJudgeRecords } from '../api/dialogueGymClient';

const VERDICT_COLOR = { excellent: 'success', good: 'success', acceptable: 'info', poor: 'warning', failure: 'error' };
const INTENT_COLOR = { correct: 'success', partial: 'warning', incorrect: 'error', not_applicable: 'default' };

const scoreCell = (v) => (v == null ? <Typography variant="caption" color="text.secondary">—</Typography> : fmtPct(v));

export default function JudgeTab() {
  const [items, setItems] = useState([]);
  const { loading, error, reload } = useAutoRefresh(async () => {
    const list = await listJudgeRecords({ limit: 200 });
    setItems(list.items || []);
  }, 0, []);

  const byVerdict = items.reduce((a, r) => { a[r.overallVerdict] = (a[r.overallVerdict] || 0) + 1; return a; }, {});
  const intentCorrect = items.filter((r) => r.intentAccuracy === 'correct').length;
  const avg = items.length ? items.reduce((s, r) => s + (r.overallScore || 0), 0) / items.length : null;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Kpi label="records" value={items.length} />
        <Kpi label="avg score" value={avg == null ? '—' : fmtPct(avg)} />
        <Kpi label="intent correct" value={items.length ? `${intentCorrect}/${items.length}` : '—'} color="success.main" />
        {Object.entries(byVerdict).map(([v, n]) => <Kpi key={v} label={v} value={n} />)}
      </Stack>
      <ErrorNote error={error} onRetry={reload} />
      {loading ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Run</TableCell><TableCell>Verdict</TableCell><TableCell align="right">Overall</TableCell>
              <TableCell>Intent</TableCell><TableCell align="right">Ground</TableCell><TableCell align="right">Tone</TableCell>
              <TableCell align="right">Controls</TableCell><TableCell align="right">Helpful</TableCell><TableCell>Model</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.judgeId} hover>
                  <TableCell><Tooltip title={r.summaryNotes || ''}><code style={{ fontSize: 11 }}>{r.runId?.slice(0, 8)}</code></Tooltip></TableCell>
                  <TableCell><Chip size="small" color={VERDICT_COLOR[r.overallVerdict] || 'default'} label={r.overallVerdict} /></TableCell>
                  <TableCell align="right">{fmtPct(r.overallScore)}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={INTENT_COLOR[r.intentAccuracy] || 'default'} label={r.intentAccuracy} /></TableCell>
                  <TableCell align="right">{scoreCell(r.groundingScore)}</TableCell>
                  <TableCell align="right">{scoreCell(r.toneScore)}</TableCell>
                  <TableCell align="right">{scoreCell(r.controlsCorrectnessScore)}</TableCell>
                  <TableCell align="right">{scoreCell(r.helpfulnessScore)}</TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{String(r.judgeModel || '').replace('claude-', '')}</Typography></TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={9}><Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No judge records — judge runs from the Arena tab.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
