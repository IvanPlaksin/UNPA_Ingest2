/**
 * EC-008 — deleting a rule that other rules are attached to.
 *
 * The connections go with it; there is no other coherent answer, since an edge with
 * a missing end is a graph the validator rejects outright (DANGLING_EDGE). What was
 * missing is the operator being told. Silent deletion removes structure someone else
 * authored — "greeting-format depends on this rule" is a statement that stops being
 * true — and leaves no trace to find it by.
 *
 * So this is the one confirmation in EC-008, and it exists only when there is
 * something to lose: deleting an unconnected rule still goes straight through.
 */
import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, Box,
} from '@mui/material';
import { useRulesStore, EDGE_COLOR } from './rulesStore';

export default function DeleteRuleDialog({ nodeId, open, onClose, onConfirm }) {
  const nodes = useRulesStore((s) => s.nodes);
  const connections = useRulesStore((s) => s.connections);
  const list = open && nodeId ? connections(nodeId) : [];

  const node = nodes.find((n) => n.id === nodeId);
  const title = (node && node.data && (node.data.title || node.data.key)) || nodeId;
  const titleOf = (id) => {
    const n = nodes.find((x) => x.id === id);
    return (n && n.data && (n.data.title || n.data.key)) || id;
  };

  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Delete “{title}”?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {list.length
            ? `This will also break ${list.length} connection${list.length > 1 ? 's' : ''}:`
            : 'This rule is not connected to any other.'}
        </Typography>
        <Stack spacing={0.5}>
          {list.map((c) => (
            <Stack key={c.id} direction="row" spacing={0.5} alignItems="center">
              <Box component="span" sx={{ color: EDGE_COLOR[c.type], fontWeight: 700, width: 14 }}>{c.marker}</Box>
              <Typography variant="caption">
                {/* `verb` is already written from this rule's point of view in both
                    directions ("refines" / "refined by"). The incoming ones are
                    passive and need the copula to be a sentence — "this rule required
                    by X" is not English, and this list is read under time pressure. */}
                {`this rule ${c.outgoing || c.marker === '↔' ? '' : 'is '}${c.verb} ${titleOf(c.other)}`}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" color="error" variant="contained" onClick={onConfirm}>
          Delete anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
