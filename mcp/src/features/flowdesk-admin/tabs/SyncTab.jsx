/**
 * Sync & Integration — schema-sync live status (SignalR + poller), persisted
 * event history, env-flags snapshot, manual poll action.
 */
import React, { useState } from 'react';
import {
  Box, Paper, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, Chip, Button, TextField, MenuItem, Alert, CircularProgress, Tooltip,
} from '@mui/material';
import { RefreshCcw } from 'lucide-react';
import { getSyncStatus, getSyncEvents, pollSyncNow } from '../api/adminClient';
import { Loading, ErrorNote, useAutoRefresh, fmtTs } from '../components/common';

const EVENT_COLORS = {
  mark_stale: 'warning', poll_done: 'default', poll_check_error: 'error', poll_list_error: 'error',
  signalr_connected: 'success', signalr_closed: 'warning', signalr_connect_failed: 'error',
  signalr_unavailable: 'default', signalr_ignored: 'default', signalr_bad_payload: 'error',
  started: 'success', stopped: 'default', mark_stale_error: 'error',
};

export default function SyncTab() {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState(null);
  const [evFilter, setEvFilter] = useState('');
  const [pollBusy, setPollBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const { loading, error, reload } = useAutoRefresh(async () => {
    const [st, ev] = await Promise.all([
      getSyncStatus(),
      getSyncEvents({ event: evFilter || undefined, limit: 200 }).catch(() => []),
    ]);
    setStatus(st); setEvents(ev);
  }, 10000, [evFilter]);

  const doPoll = async () => {
    setPollBusy(true); setMsg(null);
    try {
      const r = await pollSyncNow();
      setMsg({ sev: r.errors ? 'warning' : 'success', text: `Poll done: checked ${r.checked}, stale ${r.stale}, errors ${r.errors}` });
      reload();
    } catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setPollBusy(false); }
  };

  const ss = status?.schemaSync;
  const sweeper = status?.sweeper;
  return (
    <Box>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !status ? <Loading /> : (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Schema sync</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                <Chip size="small" color={ss?.running ? 'success' : 'default'} label={ss?.running ? 'poller running' : 'poller stopped'} />
                <Chip size="small" color={ss?.signalrConnected ? 'success' : 'default'} variant="outlined"
                  label={ss?.signalrConnected ? 'SignalR connected' : 'SignalR off (polling covers)'} />
              </Stack>
              {ss?.reason && <Typography variant="caption" color="text.secondary">{ss.reason}</Typography>}
              <Box sx={{ mt: 1 }}>
                <Button size="small" variant="contained" startIcon={pollBusy ? <CircularProgress size={14} /> : <RefreshCcw size={14} />}
                  disabled={pollBusy} onClick={doPoll}>Poll versions now</Button>
              </Box>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Session sweeper</Typography>
              <Chip size="small" color={sweeper?.running ? 'success' : 'default'}
                label={sweeper?.running ? 'running' : 'not running'} sx={{ mb: 1 }} />
              {sweeper?.lastRun && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  last: {fmtTs(sweeper.lastRun.at)} — abandoned {sweeper.lastRun.abandoned}, parked-lost {sweeper.lastRun.parkedAbandoned},
                  pruned {sweeper.lastRun.turnsDeleted} turns{sweeper.lastRun.errors ? `, errors ${sweeper.lastRun.errors}` : ''}
                </Typography>
              )}
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 2, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Environment flags (read-only)</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 0.25 }}>
                {Object.entries(status?.env || {}).map(([k, v]) => (
                  <Tooltip key={k} title={k}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {k.replace('FLOWDESK_', '')}=<b>{v ?? '∅'}</b>
                    </Typography>
                  </Tooltip>
                ))}
              </Box>
            </Paper>
          </Stack>

          {msg && <Alert severity={msg.sev} onClose={() => setMsg(null)} sx={{ mb: 1 }}>{msg.text}</Alert>}

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Event history</Typography>
              <TextField select size="small" label="Event" value={evFilter} onChange={(e) => setEvFilter(e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">all</MenuItem>
                {Object.keys(EVENT_COLORS).map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
              </TextField>
            </Stack>
            <Table size="small">
              <TableHead><TableRow><TableCell>Time</TableCell><TableCell>Event</TableCell><TableCell>ousId</TableCell><TableCell>Reason</TableCell><TableCell>Detail</TableCell></TableRow></TableHead>
              <TableBody>
                {(events || []).map((e, i) => (
                  <TableRow key={i}>
                    <TableCell><Typography variant="caption">{fmtTs(e.ts)}</Typography></TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={EVENT_COLORS[e.event] || 'default'} label={e.event} /></TableCell>
                    <TableCell>{e.ousId ?? '—'}</TableCell>
                    <TableCell>{e.reason || '—'}</TableCell>
                    <TableCell><Typography variant="caption" fontFamily="monospace">{e.detail ? JSON.stringify(e.detail).slice(0, 120) : '—'}</Typography></TableCell>
                  </TableRow>
                ))}
                {!(events || []).length && (
                  <TableRow><TableCell colSpan={5}>
                    <Typography variant="caption" color="text.secondary">No persisted sync events yet (they start accumulating once the schema-sync service runs).</Typography>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
