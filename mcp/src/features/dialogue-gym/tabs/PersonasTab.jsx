/**
 * Dialogue Gym — Personas tab. CRUD over simulated-user personas.
 */
import React, { useEffect, useState } from 'react';
import {
  Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Stack, Chip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Slider, Box, Tooltip, IconButton,
} from '@mui/material';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Loading, ErrorNote, useAutoRefresh } from '../../flowdesk-admin/components/common';
import { listPersonas, createPersona, updatePersona, deletePersona, getMeta } from '../api/dialogueGymClient';

const EMPTY = {
  name: '', description: '', domainKnowledge: 'symptom_only', patience: 5,
  verbosity: 'normal', cooperativeness: 'cooperative', language: 'en', persona: '', enabled: true,
};

function PersonaDialog({ open, initial, enums, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { setF(initial ? { ...EMPTY, ...initial } : EMPTY); setErr(null); }, [initial, open]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const sel = (k, opts) => (
    <TextField select size="small" label={k} value={f[k]} onChange={set(k)} fullWidth>
      {(opts || []).map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
    </TextField>
  );
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { ...f, patience: Number(f.patience) };
      if (initial?.personaId) await updatePersona(initial.personaId, body);
      else await createPersona(body);
      onSaved();
    } catch (e) { setErr(e); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial?.personaId ? 'Edit persona' : 'New persona'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <TextField size="small" label="name" value={f.name} onChange={set('name')} fullWidth />
          <TextField size="small" label="description" value={f.description} onChange={set('description')} fullWidth />
          <Stack direction="row" spacing={1.5}>
            {sel('domainKnowledge', enums?.DOMAIN_KNOWLEDGE)}
            {sel('cooperativeness', enums?.COOPERATIVENESS)}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            {sel('verbosity', enums?.VERBOSITY)}
            {sel('language', enums?.LANGUAGES)}
          </Stack>
          <Box sx={{ px: 1 }}>
            <Typography variant="caption" color="text.secondary">patience: {f.patience}</Typography>
            <Slider size="small" min={1} max={10} value={Number(f.patience)} onChange={(_, v) => setF((s) => ({ ...s, patience: v }))} valueLabelDisplay="auto" />
          </Box>
          <TextField size="small" label="persona (few-shot instruction for the simulator)" value={f.persona} onChange={set('persona')} fullWidth multiline minRows={3} />
          <ErrorNote error={err} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !f.name}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PersonasTab() {
  const [items, setItems] = useState([]);
  const [enums, setEnums] = useState(null);
  const [dlg, setDlg] = useState(null); // null=closed, {}=new, {persona}=edit
  const { loading, error, reload } = useAutoRefresh(async () => {
    const [list, meta] = await Promise.all([listPersonas({ limit: 500 }), enums ? null : getMeta()]);
    setItems(list.items || []);
    if (meta) setEnums(meta.enums);
  }, 0, []);

  const del = async (p) => { if (window.confirm(`Delete persona "${p.name}"?`)) { await deletePersona(p.personaId); reload(); } };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{items.length} personas</Typography>
        <Button size="small" variant="contained" startIcon={<Plus size={15} />} onClick={() => setDlg({})}>New persona</Button>
      </Stack>
      <ErrorNote error={error} onRetry={reload} />
      {loading ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Name</TableCell><TableCell>Knowledge</TableCell><TableCell>Coop.</TableCell>
              <TableCell>Verbosity</TableCell><TableCell>Lang</TableCell><TableCell align="center">Patience</TableCell>
              <TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.personaId} hover>
                  <TableCell>
                    <Typography variant="body2">{p.name}</Typography>
                    {p.description && <Typography variant="caption" color="text.secondary">{p.description}</Typography>}
                  </TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={p.domainKnowledge} /></TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={p.cooperativeness === 'adversarial' ? 'error' : p.cooperativeness === 'withholding' ? 'warning' : 'default'} label={p.cooperativeness} /></TableCell>
                  <TableCell>{p.verbosity}</TableCell>
                  <TableCell>{p.language}</TableCell>
                  <TableCell align="center">{p.patience}</TableCell>
                  <TableCell>{p.isBuiltin && <Chip size="small" variant="outlined" label="builtin" sx={{ mr: 0.5 }} />}{!p.enabled && <Chip size="small" color="default" label="disabled" />}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg(p)}><Pencil size={15} /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" onClick={() => del(p)}><Trash2 size={15} /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && <TableRow><TableCell colSpan={8}><Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No personas — create one or run the seed script.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <PersonaDialog open={!!dlg} initial={dlg && dlg.personaId ? dlg : null} enums={enums} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); reload(); }} />
    </Box>
  );
}
