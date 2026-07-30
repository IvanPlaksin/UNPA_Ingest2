/**
 * Dialogue Gym — Scenarios tab. CRUD + ground-truth ratification.
 */
import React, { useEffect, useState } from 'react';
import {
  Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Stack, Chip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box, Tooltip, IconButton,
} from '@mui/material';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { Loading, ErrorNote, useAutoRefresh } from '../../flowdesk-admin/components/common';
import {
  listScenarios, createScenario, updateScenario, deleteScenario, verifyGroundTruth, getMeta,
} from '../api/dialogueGymClient';

const EMPTY = {
  name: '', description: '', userGoal: '', initialMessage: '', expectedServiceCode: '',
  category: 'typical', domain: 'EO-HR', difficulty: 'easy', maxTurns: 20, tags: '', source: 'manual',
};

function ScenarioDialog({ open, initial, enums, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setF(initial ? { ...EMPTY, ...initial, tags: (initial.tags || []).join(', ') } : EMPTY); setErr(null);
  }, [initial, open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const sel = (k, opts) => (
    <TextField select size="small" label={k} value={f[k]} onChange={set(k)} fullWidth>
      {(opts || []).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
    </TextField>
  );
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = {
        ...f, maxTurns: Number(f.maxTurns) || 20,
        expectedServiceCode: f.expectedServiceCode || null,
        tags: String(f.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      };
      if (initial?.scenarioId) await updateScenario(initial.scenarioId, body);
      else await createScenario(body);
      onSaved();
    } catch (e) { setErr(e); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial?.scenarioId ? 'Edit scenario' : 'New scenario'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <TextField size="small" label="name" value={f.name} onChange={set('name')} fullWidth />
          <TextField size="small" label="userGoal" value={f.userGoal} onChange={set('userGoal')} fullWidth multiline minRows={2} />
          <TextField size="small" label="initialMessage (first user utterance)" value={f.initialMessage} onChange={set('initialMessage')} fullWidth multiline minRows={2} />
          <Stack direction="row" spacing={1.5}>
            {sel('category', enums?.CATEGORIES)}
            {sel('difficulty', enums?.DIFFICULTIES)}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="domain" value={f.domain} onChange={set('domain')} fullWidth />
            <TextField size="small" label="maxTurns" type="number" value={f.maxTurns} onChange={set('maxTurns')} sx={{ width: 120 }} />
          </Stack>
          <TextField size="small" label="expectedServiceCode (ground truth)" value={f.expectedServiceCode || ''} onChange={set('expectedServiceCode')} fullWidth />
          <TextField size="small" label="tags (comma-separated)" value={f.tags} onChange={set('tags')} fullWidth />
          <ErrorNote error={err} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !f.name || !f.userGoal || !f.initialMessage}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function VerifyDialog({ open, scenario, onClose, onSaved }) {
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { setCode(scenario?.expectedServiceCode || ''); setNotes(''); setErr(null); }, [scenario, open]);
  const save = async () => {
    setSaving(true); setErr(null);
    try { await verifyGroundTruth(scenario.scenarioId, { expectedServiceCode: code || null, groundTruthNotes: notes, verifiedBy: 'ui' }); onSaved(); }
    catch (e) { setErr(e); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Ratify ground truth</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">{scenario?.name}</Typography>
          <Typography variant="caption" color="text.secondary">"{scenario?.initialMessage}"</Typography>
          <TextField size="small" label="expectedServiceCode (empty = no single service)" value={code} onChange={(e) => setCode(e.target.value)} fullWidth />
          <TextField size="small" label="notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth />
          <ErrorNote error={err} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Mark verified'}</Button>
      </DialogActions>
    </Dialog>
  );
}

const CAT_COLOR = { typical: 'default', edge_case: 'warning', red_team: 'error', regression: 'info' };

export default function ScenariosTab() {
  const [items, setItems] = useState([]);
  const [enums, setEnums] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [verify, setVerify] = useState(null);
  const { loading, error, reload } = useAutoRefresh(async () => {
    const [list, meta] = await Promise.all([listScenarios({ limit: 500 }), enums ? null : getMeta()]);
    setItems(list.items || []);
    if (meta) setEnums(meta.enums);
  }, 0, []);

  const del = async (s) => { if (window.confirm(`Delete scenario "${s.name}"?`)) { await deleteScenario(s.scenarioId); reload(); } };
  const verified = items.filter((s) => s.groundTruthVerified).length;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{items.length} scenarios · {verified} verified</Typography>
        <Button size="small" variant="contained" startIcon={<Plus size={15} />} onClick={() => setDlg({})}>New scenario</Button>
      </Stack>
      <ErrorNote error={error} onRetry={reload} />
      {loading ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Name</TableCell><TableCell>Category</TableCell><TableCell>Domain</TableCell>
              <TableCell>Difficulty</TableCell><TableCell>Expected service (GT)</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.scenarioId} hover>
                  <TableCell>
                    <Typography variant="body2">{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">"{s.initialMessage}"</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={CAT_COLOR[s.category] || 'default'} label={s.category} /></TableCell>
                  <TableCell>{s.domain}</TableCell>
                  <TableCell>{s.difficulty}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {s.expectedServiceCode ? <code style={{ fontSize: 12 }}>{s.expectedServiceCode}</code> : <Typography variant="caption" color="text.secondary">none</Typography>}
                      {s.groundTruthVerified
                        ? <Tooltip title={`verified by ${s.verifiedBy || '?'}`}><Chip size="small" color="success" variant="outlined" label="✓ GT" /></Tooltip>
                        : <Chip size="small" color="warning" variant="outlined" label="unverified" />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Ratify ground truth"><IconButton size="small" onClick={() => setVerify(s)}><ShieldCheck size={15} /></IconButton></Tooltip>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg(s)}><Pencil size={15} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" onClick={() => del(s)}><Trash2 size={15} /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No scenarios.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <ScenarioDialog open={!!dlg} initial={dlg && dlg.scenarioId ? dlg : null} enums={enums} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); reload(); }} />
      <VerifyDialog open={!!verify} scenario={verify} onClose={() => setVerify(null)} onSaved={() => { setVerify(null); reload(); }} />
    </Box>
  );
}
