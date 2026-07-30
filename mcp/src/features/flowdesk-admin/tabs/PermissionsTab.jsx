/**
 * FlowDesk Chat Admin — Permissions tab (Phase 9 ACT governance management).
 *
 * Manages WHO may invoke side-effecting chat actions (submitting a real Altiora
 * ticket). Effective allowlist = static env `FLOWDESK_ACT_USERS` (read-only)
 * UNION admin-managed grants (added/removed here). Fail-closed: if nobody is
 * listed, no user may act.
 */
import React, { useState } from 'react';
import {
  Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Stack, Chip, Typography, Box,
  TextField, Tooltip, IconButton, Switch, Alert, Divider,
} from '@mui/material';
import { UserPlus, Trash2, ShieldCheck, ShieldAlert, Globe } from 'lucide-react';
import { Loading, ErrorNote, useAutoRefresh, fmtTs } from '../components/common';
import { getActUsers, addActUser, setActUserEnabled, removeActUser, setActPermissionDefault } from '../api/adminClient';

export default function PermissionsTab() {
  const [data, setData] = useState(null);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState(null);
  const { loading, error, reload } = useAutoRefresh(async () => { setData(await getActUsers()); }, 0, []);

  const add = async () => {
    setBusy(true); setFormErr(null);
    try { await addActUser({ key: key.trim(), label: label.trim() || undefined }); setKey(''); setLabel(''); reload(); }
    catch (e) { setFormErr(e); } finally { setBusy(false); }
  };
  const toggle = async (u) => { await setActUserEnabled(u.key, !u.enabled); reload(); };
  const del = async (u) => { if (window.confirm(`Revoke ACT for "${u.key}"?`)) { await removeActUser(u.key); reload(); } };
  const toggleDefault = async (p) => {
    const next = !p.enabledForAll;
    if (next && !window.confirm(`Enable "${p.label}" for ALL users? This bypasses the per-user allowlist — every authenticated user will be able to ${p.label.toLowerCase()}.`)) return;
    await setActPermissionDefault(p.key, next); reload();
  };

  const env = data?.env || [];
  const dynamic = data?.dynamic || [];
  const effective = data?.effective || [];
  const permissions = data?.permissions || [];
  const failClosed = data?.failClosed;

  return (
    <Box>
      <Alert severity={failClosed ? 'warning' : 'info'} icon={failClosed ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />} sx={{ mb: 1.5 }}>
        <Typography variant="body2">
          <b>ACT permission</b> gates side-effecting chat actions — <b>submitting a real Altiora ticket</b> (Approve/Reject are speced, not yet wired).
          The gate is <b>fail-closed</b>: {failClosed
            ? 'nobody is on the allowlist, so NO user may act.'
            : `${effective.length} user(s) may act.`} Altiora still enforces its own permissions at the actual write.
        </Typography>
      </Alert>

      <ErrorNote error={error} onRetry={reload} />
      {loading || !data ? <Loading /> : (
        <>
          {/* Global per-permission defaults (enable/disable for ALL users) */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Globe size={16} />
              <Typography variant="subtitle2">Global defaults <Typography component="span" variant="caption" color="text.secondary">(enable/disable a permission for ALL users)</Typography></Typography>
            </Stack>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Permission</TableCell><TableCell>Description</TableCell>
                <TableCell align="center">Enabled for all</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {permissions.map((p) => (
                  <TableRow key={p.key} hover>
                    <TableCell>
                      <Typography variant="body2">{p.label}</Typography>
                      <code style={{ fontSize: 11, color: '#888' }}>{p.key}</code>
                      {!p.wired && <Chip size="small" variant="outlined" label="not wired" sx={{ ml: 0.5 }} />}
                    </TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{p.description}</Typography></TableCell>
                    <TableCell align="center">
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                        <Switch size="small" checked={!!p.enabledForAll} onChange={() => toggleDefault(p)} color="warning" />
                        {p.enabledForAll && <Chip size="small" color="warning" variant="outlined" label="ALL users" />}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!permissions.length && <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No permissions.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              When ON, the permission is granted to every authenticated user (the per-user allowlist below is bypassed). When OFF, only the allowlisted users below may act.
            </Typography>
          </Paper>

          {/* Static env allowlist (read-only) */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Env allowlist <Typography component="span" variant="caption" color="text.secondary">(FLOWDESK_ACT_USERS — read-only, set at deploy)</Typography></Typography>
            {env.length ? <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>{env.map((e) => <Chip key={e} size="small" variant="outlined" label={e} />)}</Stack>
              : <Typography variant="caption" color="text.secondary">none</Typography>}
          </Paper>

          {/* Add form */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Grant ACT to a user</Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
              <TextField size="small" label="userId (Altiora UUID) or email" value={key} onChange={(e) => setKey(e.target.value)} sx={{ minWidth: 320 }} />
              <TextField size="small" label="label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} sx={{ minWidth: 180 }} />
              <Button variant="contained" startIcon={<UserPlus size={15} />} disabled={busy || !key.trim()} onClick={add}>Grant</Button>
            </Stack>
            <ErrorNote error={formErr} />
          </Paper>

          {/* Managed grants */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>Managed grants ({dynamic.length})</Typography>
          <Paper variant="outlined">
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Key (userId / email)</TableCell><TableCell>Kind</TableCell><TableCell>Label</TableCell>
                <TableCell align="center">Enabled</TableCell><TableCell>Added by</TableCell><TableCell>Added</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {dynamic.map((u) => (
                  <TableRow key={u.key} hover>
                    <TableCell><code style={{ fontSize: 12 }}>{u.key}</code></TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={u.kind} /></TableCell>
                    <TableCell>{u.label || <Typography variant="caption" color="text.secondary">—</Typography>}</TableCell>
                    <TableCell align="center"><Switch size="small" checked={u.enabled} onChange={() => toggle(u)} /></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{u.addedBy || '—'}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{fmtTs(u.addedAt)}</Typography></TableCell>
                    <TableCell align="right"><Tooltip title="Revoke"><IconButton size="small" onClick={() => del(u)}><Trash2 size={15} /></IconButton></Tooltip></TableCell>
                  </TableRow>
                ))}
                {!dynamic.length && <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No managed grants — grant ACT to a user above.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Paper>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary">
            Effective allowlist ({effective.length}): {effective.join(', ') || '(empty — fail-closed)'}
          </Typography>
        </>
      )}
    </Box>
  );
}
