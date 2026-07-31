/**
 * The build tools — a category of its own, separate from the view modes.
 *
 * The canvas previously offered only ways of LOOKING at the graph (Clean, Structure,
 * Conflicts, Coverage). Everything that MADE a graph lived in side panels, and the one
 * canvas gesture that did build something — dragging between two nodes — produced a
 * REFINES edge and then hid it, because the default view draws no edges at all. The
 * reasonable conclusion from the screen was that connections cannot be drawn here.
 *
 * So: pick the relation FIRST, then draw it. That is how every graph editor works, and
 * the reason is not fashion — a drag that always yields one type means re-typing every
 * connection afterwards, one at a time, in another panel.
 *
 * These relations are not annotation. REFINES orders the prompt (a refinement is
 * emitted after what it refines) and DEPENDS_ON survives trimming when the prompt is
 * cut to fit the budget — so what is drawn here governs what the model is given.
 */
import React from 'react';
import { Stack, Chip, Tooltip, Typography, Divider, Box } from '@mui/material';
import { Link2, MousePointer2 } from 'lucide-react';
import { useRulesStore, EDGE_TYPES, EDGE_LABEL, EDGE_COLOR } from './rulesStore';

const WHAT_IT_DOES = {
  REFINES: 'Narrows another rule — and is emitted after it, so the prompt reads parent then qualification.',
  DEPENDS_ON: 'Only meaningful with the other present. Kept when the prompt is trimmed to fit the budget.',
  CONFLICTS_WITH: 'The two cannot both hold. Validation refuses it until one is retired or they are separated.',
  ILLUSTRATES: 'An example of the other, grouped under it in the compiled prompt.',
};

export default function BuildTools() {
  const isEvolutio = useRulesStore((s) => s.isEvolutio);
  const connectType = useRulesStore((s) => s.connectType);
  const setConnectType = useRulesStore((s) => s.setConnectType);
  const edges = useRulesStore((s) => s.edges);

  if (!isEvolutio) return null;

  const count = (t) => edges.filter((e) => (e.data?.edgeType || e.type) === t).length;

  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <Tooltip title="Drag from the dot at the bottom of a rule to the dot at the top of another. The relation you draw is the one selected here.">
        <Stack direction="row" spacing={0.4} alignItems="center">
          <Link2 size={13} />
          <Typography variant="caption" color="text.secondary">Draw:</Typography>
        </Stack>
      </Tooltip>
      {EDGE_TYPES.map((t) => (
        <Tooltip key={t} title={WHAT_IT_DOES[t]}>
          <Chip
            size="small" clickable
            label={count(t) ? `${EDGE_LABEL[t].out} ${count(t)}` : EDGE_LABEL[t].out}
            onClick={() => setConnectType(t)}
            variant={connectType === t ? 'filled' : 'outlined'}
            sx={{
              height: 22,
              fontSize: 11,
              ...(connectType === t
                ? { bgcolor: EDGE_COLOR[t], color: '#0f172a', fontWeight: 700 }
                : { borderColor: EDGE_COLOR[t], color: EDGE_COLOR[t] }),
            }}
          />
        </Tooltip>
      ))}
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Tooltip title="Click a connection to edit its type, reverse it, or delete it. Delete key removes the selected one.">
        <Stack direction="row" spacing={0.4} alignItems="center" sx={{ color: 'text.secondary' }}>
          <MousePointer2 size={12} />
          <Typography variant="caption">click a line to edit it</Typography>
        </Stack>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
    </Stack>
  );
}
