/**
 * A connection, selected on the canvas.
 *
 * Drawing one was possible before this; doing anything with it afterwards was not.
 * A connection dragged between two nodes came out as REFINES and there was no way to
 * say it was actually a conflict, no way to reverse it when it went the wrong way
 * round, and no way to delete it except by finding one of its endpoints and using the
 * properties panel of that node. On a canvas, the thing you clicked is the thing you
 * should be able to edit.
 */
import React from 'react';
import {
  Box, Stack, Typography, MenuItem, TextField, Button, Chip, Alert, Divider, Tooltip,
} from '@mui/material';
import { Trash2, ArrowLeftRight, Link2 } from 'lucide-react';
import {
  useRulesStore, EDGE_TYPES, EDGE_LABEL, EDGE_COLOR, conflictWouldBlock,
} from './rulesStore';

const EDGE_HELP = {
  REFINES: 'Narrows or sharpens the other rule. It also makes this one compile AFTER the rule it refines.',
  DEPENDS_ON: 'Only meaningful while the other is present — and it is kept when the prompt is trimmed to fit.',
  CONFLICTS_WITH: 'The two cannot both hold. Recording it does not resolve it.',
  ILLUSTRATES: 'An example of the other, grouped under it in the prompt.',
};

export default function EdgePropertiesPanel() {
  const edge = useRulesStore((s) => s.selectedEdge());
  const nodes = useRulesStore((s) => s.nodes);
  const edges = useRulesStore((s) => s.edges);
  const updateConnection = useRulesStore((s) => s.updateConnection);
  const removeConnection = useRulesStore((s) => s.removeConnection);
  const flipConnection = useRulesStore((s) => s.flipConnection);
  const setSelected = useRulesStore((s) => s.setSelected);

  if (!edge) return null;

  const label = EDGE_LABEL[edge.type] || { out: edge.type, symmetric: false };
  const willBlock = edge.type === 'CONFLICTS_WITH'
    && conflictWouldBlock(nodes, edges, edge.source, edge.target);

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Link2 size={14} color={EDGE_COLOR[edge.type]} />
          <Typography variant="subtitle2">Connection</Typography>
        </Stack>

        {/* The sentence first: it is what the connection MEANS, and it is what the
            operator is checking when they click one. */}
        <Typography variant="body2">
          <Box component="span" sx={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
            onClick={() => setSelected(edge.source)}>{edge.sourceTitle}</Box>
          {' '}<b>{label.out}</b>{' '}
          <Box component="span" sx={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
            onClick={() => setSelected(edge.target)}>{edge.targetTitle}</Box>
        </Typography>

        <TextField select size="small" label="Relation" value={edge.type}
          onChange={(e) => updateConnection(edge.id, { edgeType: e.target.value })}
          helperText={EDGE_HELP[edge.type]}>
          {EDGE_TYPES.map((t) => <MenuItem key={t} value={t}>{EDGE_LABEL[t].out}</MenuItem>)}
        </TextField>

        {edge.type === 'CONFLICTS_WITH' && (
          <TextField size="small" multiline minRows={2} label="Why they conflict"
            value={edge.reason}
            onChange={(e) => updateConnection(edge.id, { reason: e.target.value })}
            placeholder="e.g. one asks for a single question per turn, the other for a full summary."
            helperText={edge.reason ? '' : 'A conflict nobody explained cannot be resolved by whoever meets it next.'} />
        )}

        {willBlock && (
          <Alert severity="warning" sx={{ py: 0 }}>
            Both rules are active and unconditional, so this records a conflict the graph
            cannot satisfy — validation will refuse it until one is retired, they are
            merged, or they are separated by mutually exclusive conditions.
          </Alert>
        )}

        {edge.type === 'REFINES' && (
          <Typography variant="caption" color="text.secondary">
            This also changes the ORDER of the prompt: a refinement is emitted after the
            rule it refines.
          </Typography>
        )}

        <Divider />
        <Stack direction="row" spacing={1}>
          {/* Drawn the wrong way round is the commonest mistake with a directed edge,
              and delete-and-redraw loses the reason text with no warning. */}
          <Tooltip title={label.symmetric
            ? 'A conflict reads the same both ways; reversing it changes nothing.'
            : `Make it: ${edge.targetTitle} ${label.out} ${edge.sourceTitle}`}>
            <span>
              <Button size="small" variant="outlined" startIcon={<ArrowLeftRight size={13} />}
                onClick={() => flipConnection(edge.id)} disabled={label.symmetric}>
                Reverse
              </Button>
            </span>
          </Tooltip>
          <Button size="small" color="error" variant="outlined" startIcon={<Trash2 size={13} />}
            onClick={() => removeConnection(edge.id)}>
            Delete
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Press <Chip size="small" variant="outlined" label="Delete" sx={{ height: 16, fontSize: 9 }} /> on
          the canvas to remove the selected connection.
        </Typography>
      </Stack>
    </Box>
  );
}
