/**
 * EC-008 — the connections of one rule, read from both ends.
 *
 * Until now edges existed in the ontology and nowhere in the editor: the graph could
 * express "this rule refines that one" and no operator could say it. This is the
 * section that lets them, and the two decisions worth knowing are both about what it
 * REFUSES to show.
 *
 * ONE LIST, NOT TWO. "This rule refines X" and "Y refines this rule" are the same
 * fact read from opposite ends. Split into incoming/outgoing lists, the operator has
 * to keep track of which list he is looking at to know what he is reading; merged,
 * with a direction marker, it reads as prose either way.
 *
 * NO APPLIES_WHEN. A condition is stored as a self-loop edge, and if it appeared here
 * it would read as "this rule refines itself" — a nonsense the operator would tidy
 * away, deleting the condition that decides when the rule applies. He would see no
 * error; he would find out from a live conversation taking the wrong branch weeks
 * later. Conditions get their own section (EC-009); this one filters them out.
 */
import React, { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Chip, IconButton, MenuItem, TextField,
  Button, Alert, Tooltip, Divider,
} from '@mui/material';
import { X, Plus, Link2 } from 'lucide-react';
import {
  useRulesStore, EDGE_TYPES, EDGE_LABEL, EDGE_COLOR, conflictWouldBlock,
} from './rulesStore';

/** What each relation is FOR, in the words of someone deciding whether to use it. */
const EDGE_HELP = {
  REFINES: 'This rule narrows or sharpens another one. The other stays; this adds detail.',
  DEPENDS_ON: 'This rule only makes sense when the other is present. Retiring the other breaks this.',
  CONFLICTS_WITH: 'The two cannot both hold. Recording it does not resolve it — see below.',
  ILLUSTRATES: 'This is an example of the other, not an instruction in its own right.',
};

export default function ConnectionsSection({ nodeId }) {
  const nodes = useRulesStore((s) => s.nodes);
  const edges = useRulesStore((s) => s.edges);
  const addConnection = useRulesStore((s) => s.addConnection);
  const removeConnection = useRulesStore((s) => s.removeConnection);
  const updateConnection = useRulesStore((s) => s.updateConnection);
  const setSelected = useRulesStore((s) => s.setSelected);
  const connections = useRulesStore((s) => s.connections);

  const [adding, setAdding] = useState(false);
  const [type, setType] = useState('REFINES');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');

  const list = useMemo(() => connections(nodeId), [edges, nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const titleOf = (id) => {
    const n = nodes.find((x) => x.id === id);
    return (n && n.data && (n.data.title || n.data.key)) || id;
  };
  const others = nodes.filter((n) => n.id !== nodeId);

  // Mirrors the validator's own three conditions rather than guessing from one — see
  // `conflictWouldBlock`.
  const conflictWillBlock = type === 'CONFLICTS_WITH' && target
    && conflictWouldBlock(nodes, edges, nodeId, target);

  const submit = () => {
    if (!target) return;
    addConnection({ source: nodeId, target, type, reason });
    setAdding(false); setTarget(''); setReason(''); setType('REFINES');
  };

  return (
    <Box>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Link2 size={14} />
        <Typography variant="subtitle2">Connections</Typography>
        <Chip size="small" variant="outlined" label={list.length} />
      </Stack>

      {!list.length && !adding && (
        <Typography variant="caption" color="text.secondary">
          Not connected to any other rule.
        </Typography>
      )}

      <Stack spacing={0.5}>
        {list.map((c) => (
          <Stack key={c.id} direction="row" alignItems="center" spacing={0.5}>
            <Tooltip title={c.outgoing ? 'from this rule' : 'to this rule'}>
              <Box component="span" sx={{ color: EDGE_COLOR[c.type], fontWeight: 700, width: 14 }}>{c.marker}</Box>
            </Tooltip>
            <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 82 }}>{c.verb}</Typography>
            <Typography
              variant="caption"
              sx={{ flex: 1, cursor: 'pointer', textDecoration: 'underline dotted' }}
              onClick={() => setSelected(c.other)}
            >
              {titleOf(c.other)}
            </Typography>
            {c.type === 'CONFLICTS_WITH' && (
              <Tooltip title={c.reason || 'No reason recorded — whoever meets this next cannot resolve it.'}>
                <Chip size="small" color={c.reason ? 'default' : 'warning'} variant="outlined"
                  label={c.reason ? 'why' : 'why?'} sx={{ height: 18, fontSize: 10 }} />
              </Tooltip>
            )}
            <IconButton size="small" onClick={() => removeConnection(c.id)} aria-label={`remove ${c.verb} ${c.other}`}>
              <X size={12} />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      {adding ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <TextField select size="small" label="Relation" value={type}
            onChange={(e) => setType(e.target.value)} helperText={EDGE_HELP[type]}>
            {EDGE_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{EDGE_LABEL[t].out}</MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Which rule" value={target}
            onChange={(e) => setTarget(e.target.value)}>
            {others.map((n) => (
              <MenuItem key={n.id} value={n.id}>{(n.data && (n.data.title || n.data.key)) || n.id}</MenuItem>
            ))}
          </TextField>
          {type === 'CONFLICTS_WITH' && (
            <TextField size="small" multiline minRows={2} label="Why they conflict"
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. one asks for a single question per turn, the other for a summary of all remaining fields." />
          )}
          {conflictWillBlock && (
            <Alert severity="warning" sx={{ py: 0 }}>
              Both rules are active and unconditional, so this records a conflict the
              graph cannot satisfy — validation will refuse it until one is retired,
              they are merged, or they are separated by mutually exclusive conditions.
            </Alert>
          )}
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={submit} disabled={!target}>Add</Button>
            <Button size="small" onClick={() => { setAdding(false); setTarget(''); setReason(''); }}>Cancel</Button>
          </Stack>
        </Stack>
      ) : (
        <Button size="small" startIcon={<Plus size={13} />} onClick={() => setAdding(true)} sx={{ mt: 0.5 }}>
          Connect to a rule
        </Button>
      )}

      {/* Re-typing an existing connection in place: rare, but the alternative is
          delete-and-recreate, which loses the reason text with no warning. */}
      {list.some((c) => c.type === 'CONFLICTS_WITH' && !c.reason) && (
        <Alert severity="info" sx={{ mt: 1, py: 0 }}>
          A conflict with no reason recorded.{' '}
          <Box component="span" sx={{ cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => {
              const c = list.find((x) => x.type === 'CONFLICTS_WITH' && !x.reason);
              const why = window.prompt('Why do these two conflict?');
              if (why) updateConnection(c.id, { reason: why });
            }}>Add one.</Box>
        </Alert>
      )}
    </Box>
  );
}
