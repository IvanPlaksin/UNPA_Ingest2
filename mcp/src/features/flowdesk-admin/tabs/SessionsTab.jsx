/**
 * Sessions — server-paged browser with filters + replay drawer
 * (permalink /flowdesk-admin/sessions/:sessionId).
 */
import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Stack, TextField, MenuItem, Table, TableHead, TableRow,
  TableCell, TableBody, TablePagination, Typography, Chip, InputAdornment,
  IconButton, Tooltip,
} from '@mui/material';
import { Search, Sparkles } from 'lucide-react';
import { getSessions } from '../api/adminClient';
import { OutcomeChip, FlagChips, Loading, ErrorNote, useAutoRefresh, fmtCost, fmtTs } from '../components/common';
import SessionDrawer from '../components/SessionDrawer';

const OUTCOME_OPTIONS = ['', 'active', 'completed', 'escalated', 'parked', 'parked_abandoned', 'abandoned', 'submit_failed'];

export default function SessionsTab() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const drawerTab = searchParams.get('tab') || undefined;
  const [f, setF] = useState({ outcome: '', serviceId: '', userId: '', q: '', channel: '', flagged: '' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState(null);

  const { loading, error, reload } = useAutoRefresh(async () => {
    setData(await getSessions({ ...f, flagged: f.flagged || undefined, page: page + 1, pageSize }));
  }, 8000, [JSON.stringify(f), page, pageSize]);

  const set = (k) => (e) => { setPage(0); setF((x) => ({ ...x, [k]: e.target.value })); };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <TextField size="small" label="Search transcript" value={f.q} onChange={set('q')} sx={{ minWidth: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment> }} />
          <TextField select size="small" label="Outcome" value={f.outcome} onChange={set('outcome')} sx={{ minWidth: 150 }}>
            {OUTCOME_OPTIONS.map((o) => <MenuItem key={o} value={o}>{o || 'any'}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Service" value={f.serviceId} onChange={set('serviceId')} sx={{ minWidth: 160 }} />
          <TextField size="small" label="User" value={f.userId} onChange={set('userId')} sx={{ minWidth: 140 }} />
          <TextField select size="small" label="Channel" value={f.channel} onChange={set('channel')} sx={{ minWidth: 110 }}>
            <MenuItem value="">any</MenuItem><MenuItem value="text">text</MenuItem><MenuItem value="voice">voice</MenuItem>
          </TextField>
          <TextField select size="small" label="Flagged" value={f.flagged} onChange={set('flagged')} sx={{ minWidth: 120 }}>
            <MenuItem value="">all</MenuItem><MenuItem value="true">negative only</MenuItem>
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
                <TableCell align="right">Turns</TableCell><TableCell align="right">Repair</TableCell>
                <TableCell align="right">Cost</TableCell><TableCell>Ref</TableCell><TableCell>AI</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.items || []).map((s) => (
                <TableRow key={s.sessionId} hover sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/flowdesk-admin/sessions/${s.sessionId}`)}>
                  <TableCell><Typography variant="caption">{fmtTs(s.startedAt)}</Typography></TableCell>
                  <TableCell>{s.userDisplayName || s.userId || '—'}</TableCell>
                  <TableCell>{s.serviceId ? <code>{s.serviceId}</code> : '—'}</TableCell>
                  <TableCell><OutcomeChip outcome={s.outcome} /></TableCell>
                  <TableCell><FlagChips flags={s.flags} /></TableCell>
                  <TableCell align="right">{s.turns || 0}</TableCell>
                  <TableCell align="right">{s.repairSession || 0}</TableCell>
                  <TableCell align="right">{fmtCost(s.llmCostUsd)}</TableCell>
                  <TableCell>{s.srNumber ? <Chip size="small" color="success" label={s.srNumber} /> : (s.escalationId ? <Chip size="small" color="warning" label={s.escalationId} /> : '—')}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={s.analysisJson ? 'AI analysis (done — view result)' : 'Run AI analysis of this session'}>
                      <IconButton size="small" color={s.analysisJson ? 'success' : 'primary'}
                        onClick={() => navigate(`/flowdesk-admin/sessions/${s.sessionId}?tab=analysis`)}>
                        <Sparkles size={16} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!(data?.items || []).length && (
                <TableRow><TableCell colSpan={10}>
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    No sessions recorded yet. Telemetry starts capturing with the next chat turn (FLOWDESK_CHAT_TELEMETRY).
                  </Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination component="div" count={data?.total || 0} page={page} rowsPerPage={pageSize}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]} />
        </Paper>
      )}
      <SessionDrawer sessionId={sessionId} open={!!sessionId} initialTab={drawerTab}
        onClose={() => navigate('/flowdesk-admin/sessions')} onChanged={reload} />
    </Box>
  );
}
