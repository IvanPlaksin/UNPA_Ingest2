/**
 * ПР-005 — which graph is open, which graph is LIVE, and how to change either.
 *
 * Two different verbs that the editor previously blurred into one. Opening a graph is
 * free and reversible. Making one live replaces the system prompt of a running
 * assistant for every user at once — so it is a separate action, behind a
 * confirmation that names what is being replaced.
 *
 * The selector also has to be able to say that it CANNOT act: when
 * FLOWDESK_AGENT_PROMPT_ENTRY_FORCE is set the environment wins, and a control that
 * quietly did nothing in that case would be worse than no control at all.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Button, Typography, Menu, MenuItem, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, Tooltip, CircularProgress, Divider,
} from '@mui/material';
import { GitBranch, Radio, Plus, Check } from 'lucide-react';
import {
  promptListGraphs, promptActiveEntry, promptSetActiveEntry, promptCreateGraph,
} from '../api/adminClient';
import { useRulesStore } from './rulesStore';
import { useTourAnchor } from '@guided-ux/tour/react';

export default function GraphSelector({ onOpenGraph, onCreated }) {
  // TOUR-003: the whole `prompt-activate` tour points here.
  const rootRef = useTourAnchor('editor.graphSelector', {
    label: 'Which graph is the system prompt', route: '/flowdesk-admin/prompt',
  });
  const entryId = useRulesStore((s) => s.entryId);
  const graphName = useRulesStore((s) => s.graphName);
  const isEvolutio = useRulesStore((s) => s.isEvolutio);
  const dirty = useRulesStore((s) => s.dirty);
  const toGraph = useRulesStore((s) => s.toGraph);

  const [anchor, setAnchor] = useState(null);
  const [graphs, setGraphs] = useState([]);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [makeLive, setMakeLive] = useState(null);   // the graph awaiting confirmation
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [copyCurrent, setCopyCurrent] = useState(true);

  const refresh = async () => {
    try {
      const [list, act] = await Promise.all([promptListGraphs(), promptActiveEntry()]);
      setGraphs(Array.isArray(list) ? list : []);
      setActive(act);
    } catch (e) { setErr(e.message || String(e)); }
  };

  useEffect(() => { if (isEvolutio) refresh(); }, [isEvolutio]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isEvolutio) return null;

  const liveId = active && active.entryId;
  const openIsLive = entryId && entryId === liveId;

  const confirmLive = async () => {
    setBusy(true); setErr(null);
    try {
      await promptSetActiveEntry(makeLive.id || makeLive.entryId);
      setMakeLive(null);
      await refresh();
    } catch (e) {
      // The API refuses a graph that cannot serve, and the reason is the useful part.
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const g = copyCurrent ? toGraph() : { nodes: [], edges: [] };
      const saved = await promptCreateGraph({
        name: newName.trim() || 'New prompt graph',
        nodes: g.nodes, edges: g.edges,
        changelog: copyCurrent ? `Created from "${graphName}"` : 'Created empty',
      });
      setCreating(false); setNewName('');
      await refresh();
      if (onCreated) onCreated(saved);
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center" ref={rootRef}>
        <Button size="small" variant="outlined" startIcon={<GitBranch size={14} />}
          onClick={(e) => { setAnchor(e.currentTarget); refresh(); }}>
          {graphName}
        </Button>
        {openIsLive ? (
          <Tooltip title="This graph is the system prompt the running assistant compiles.">
            <Chip size="small" color="success" icon={<Radio size={11} />} label="live" sx={{ height: 20 }} />
          </Tooltip>
        ) : (
          <Tooltip title="You are editing a graph the assistant does not use. Saving here changes nothing for users.">
            <Chip size="small" color="warning" variant="outlined" label="not live" sx={{ height: 20 }} />
          </Tooltip>
        )}
      </Stack>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <Typography variant="caption" sx={{ px: 2, py: 0.5, display: 'block', color: 'text.secondary' }}>
          Prompt graphs
        </Typography>
        {graphs.map((g) => {
          const id = g.id || g.entryId;
          const isLive = id === liveId;
          return (
            <MenuItem key={id} selected={id === entryId}
              onClick={() => { setAnchor(null); onOpenGraph(g); }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                {id === entryId ? <Check size={13} /> : <Box sx={{ width: 13 }} />}
                <Typography variant="body2" sx={{ flex: 1 }}>{g.name || id}</Typography>
                {isLive && <Chip size="small" color="success" label="live" sx={{ height: 17, fontSize: 9 }} />}
                {!isLive && active && active.editable && (
                  <Button size="small" sx={{ fontSize: 10, minWidth: 0 }}
                    onClick={(e) => { e.stopPropagation(); setAnchor(null); setMakeLive(g); }}>
                    make live
                  </Button>
                )}
              </Stack>
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); setCreating(true); setNewName(''); }}>
          <Plus size={13} />
          <Typography variant="body2" sx={{ ml: 1 }}>New graph…</Typography>
        </MenuItem>
        {active && active.notice && (
          <Typography variant="caption" sx={{ px: 2, py: 1, display: 'block', maxWidth: 320, color: 'warning.main' }}>
            {active.notice}
          </Typography>
        )}
      </Menu>

      {/* Making a graph live replaces the system prompt for every user at once. */}
      <Dialog open={!!makeLive} onClose={() => setMakeLive(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Make “{makeLive && (makeLive.name || makeLive.id)}” the system prompt?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Every conversation from the next turn onward will be governed by this graph.
            {liveId && <> The current one{graphs.find((g) => (g.id || g.entryId) === liveId)
              ? ` (“${graphs.find((g) => (g.id || g.entryId) === liveId).name}”)` : ''} stops being used.</>}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            The graph is validated and compiled in all nine dialogue contexts first. If any
            of them fails, nothing changes.
          </Typography>
          {err && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{err}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setMakeLive(null)}>Cancel</Button>
          <Button size="small" variant="contained" onClick={confirmLive} disabled={busy}>
            {busy ? <CircularProgress size={14} /> : 'Make it live'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>New prompt graph</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label="Name" sx={{ mt: 1 }}
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Assistant prompt with relations" />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
            <Chip size="small" clickable label="copy the open graph"
              color={copyCurrent ? 'primary' : 'default'}
              variant={copyCurrent ? 'filled' : 'outlined'}
              onClick={() => setCopyCurrent(true)} />
            <Chip size="small" clickable label="start empty"
              color={!copyCurrent ? 'primary' : 'default'}
              variant={!copyCurrent ? 'filled' : 'outlined'}
              onClick={() => setCopyCurrent(false)} />
          </Stack>
          {copyCurrent && dirty && (
            <Alert severity="info" sx={{ mt: 1, py: 0 }}>
              Unsaved edits on screen are included — the copy is what you see, not what
              was last saved.
            </Alert>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            A new graph is not live. It becomes the system prompt only when you say so.
          </Typography>
          {err && <Alert severity="error" sx={{ mt: 1, py: 0 }}>{err}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setCreating(false)}>Cancel</Button>
          <Button size="small" variant="contained" onClick={create} disabled={busy}>
            {busy ? <CircularProgress size={14} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
