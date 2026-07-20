/**
 * Tickets — submissions joined across systems: chat session → local SR /
 * real Altiora ticket, with on-demand live status fetch from Altiora.
 */
import React, { useState } from 'react';
import {
  Box, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Typography, Chip, Button, TablePagination, CircularProgress, Tooltip, Stack,
} from '@mui/material';
import { RefreshCcw } from 'lucide-react';
import { getTickets, getTicketLive } from '../api/adminClient';
import { Loading, ErrorNote, useAutoRefresh, fmtTs, fmtCost, Kpi } from '../components/common';
import SessionDrawer from '../components/SessionDrawer';

const ALTIORA_STATUS_COLORS = {
  New: 'info', Pending: 'default', 'Auth Pending': 'warning', 'In Progress': 'primary',
  Completed: 'success', Rejected: 'error', Declined: 'error', Approved: 'success',
};

export default function TicketsTab() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState(null);
  const [live, setLive] = useState({});   // ticketId -> {busy, data, error}
  const [selected, setSelected] = useState(null);

  const { loading, error, reload } = useAutoRefresh(async () => {
    setData(await getTickets({ page: page + 1, pageSize }));
  }, 15000, [page, pageSize]);

  const fetchLive = async (ticketId) => {
    setLive((l) => ({ ...l, [ticketId]: { busy: true } }));
    try {
      const d = await getTicketLive(ticketId);
      setLive((l) => ({ ...l, [ticketId]: { data: d } }));
    } catch (e) {
      setLive((l) => ({ ...l, [ticketId]: { error: e.message } }));
    }
  };

  const items = data?.items || [];
  const altioraCount = items.filter((s) => s.ticketId != null).length;

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Kpi label="Submissions" value={data?.total ?? '—'} sub="sessions with SR/ticket" />
        <Kpi label="Real Altiora tickets" value={altioraCount} sub="this page" color="success.main" />
      </Stack>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Submitted</TableCell><TableCell>Reference</TableCell><TableCell>Service</TableCell>
              <TableCell>User</TableCell><TableCell align="right">Turns</TableCell><TableCell align="right">Cost</TableCell>
              <TableCell>Altiora live status</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {items.map((s) => {
                const lv = live[s.ticketId] || {};
                const ticket = lv.data;
                const status = ticket?.status || ticket?.Status;
                return (
                  <TableRow key={s.sessionId} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(s.sessionId)}>
                    <TableCell><Typography variant="caption">{fmtTs(s.endedAt)}</Typography></TableCell>
                    <TableCell>
                      <Chip size="small" color="success" label={s.srNumber || `#${s.ticketId}`} />
                      {s.ticketId != null && <Typography variant="caption" sx={{ ml: 0.5 }} color="text.secondary">altiora #{s.ticketId}</Typography>}
                    </TableCell>
                    <TableCell>{s.serviceId ? <code>{s.serviceId}</code> : '—'}</TableCell>
                    <TableCell>{s.userDisplayName || s.userId || '—'}</TableCell>
                    <TableCell align="right">{s.turns || 0}</TableCell>
                    <TableCell align="right">{fmtCost(s.llmCostUsd)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {s.ticketId == null ? (
                        <Typography variant="caption" color="text.secondary">local SR (Memgraph)</Typography>
                      ) : status ? (
                        <Tooltip title={`${ticket?.ticketNumber || ticket?.TicketNumber || ''} · assigned org ${ticket?.assignedToOrgUnitId ?? ticket?.AssignedToOrgUnitId ?? '—'}`}>
                          <Chip size="small" color={ALTIORA_STATUS_COLORS[status] || 'default'} label={status} />
                        </Tooltip>
                      ) : lv.error ? (
                        <Tooltip title={lv.error}><Chip size="small" color="error" label="fetch failed" onClick={() => fetchLive(s.ticketId)} /></Tooltip>
                      ) : (
                        <Button size="small" variant="text" disabled={lv.busy}
                          startIcon={lv.busy ? <CircularProgress size={12} /> : <RefreshCcw size={12} />}
                          onClick={() => fetchLive(s.ticketId)}>status</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!items.length && (
                <TableRow><TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No submissions recorded yet.</Typography>
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
