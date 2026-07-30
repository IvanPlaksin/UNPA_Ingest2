/**
 * RulePropertiesPanel (P6) — edit the selected rule node.
 */
import React from 'react';
import {
  Box, TextField, MenuItem, Stack, Typography, Switch, FormControlLabel,
  Button, Chip, Autocomplete, Alert,
} from '@mui/material';
import { Trash2 } from 'lucide-react';
import { useRulesStore, CATEGORIES, APPLIES_TO } from './rulesStore';

export default function RulePropertiesPanel() {
  const nodes = useRulesStore((s) => s.nodes);
  const selectedId = useRulesStore((s) => s.selectedId);
  const updateRule = useRulesStore((s) => s.updateRule);
  const commitHistory = useRulesStore((s) => s.commitHistory);
  const removeRule = useRulesStore((s) => s.removeRule);

  const node = nodes.find((n) => n.id === selectedId);
  if (!node) {
    return <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a rule node to edit it, or add one from the palette.</Typography></Box>;
  }
  const d = node.data;
  const set = (patch) => updateRule(node.id, patch);

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2">Edit rule</Typography>
        <TextField size="small" label="Key" value={d.key || ''} onChange={(e) => set({ key: e.target.value })} onBlur={commitHistory} />
        <TextField size="small" label="Title" value={d.title || ''} onChange={(e) => set({ title: e.target.value })} onBlur={commitHistory} />
        {/* HYB-011b: on the agent's graph the node's TYPE decides which field the
            compiler reads (a Thesis compiles `assertion`, a Constraint `rule`), and
            an immutable constraint may not be edited casually — SUADA-COMPILE-001
            re-checks that every immutable constraint survived into the compiled
            prompt, so removing one breaks the compile rather than the wording. */}
        {d.nodeType && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            <Chip size="small" label={d.nodeType} />
            <Chip size="small" variant="outlined" label={`compiles: ${d.contentField || 'assertion'}`} />
            {d.status && d.status !== 'ACTIVE' && <Chip size="small" color="warning" variant="outlined" label={d.status} />}
            {d.immutable && <Chip size="small" color="error" label="immutable" />}
          </Stack>
        )}
        {d.immutable && (
          <Alert severity="warning" sx={{ py: 0 }}>
            An immutable constraint. The compiler verifies each of these reached the
            final prompt (SUADA-COMPILE-001) — editing it changes what the assistant
            may never do, and removing it fails the compile.
          </Alert>
        )}
        <TextField size="small" label="Rule text (the instruction)" multiline minRows={3} value={d.text || ''}
          onChange={(e) => set({ text: e.target.value })} onBlur={commitHistory}
          placeholder="e.g. Ask exactly one question per turn." />
        <TextField select size="small" label="Category" value={d.category || 'custom'} onChange={(e) => { set({ category: e.target.value }); commitHistory(); }}>
          {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <Autocomplete multiple size="small" options={APPLIES_TO} value={d.appliesTo || ['all']}
          onChange={(_, v) => { set({ appliesTo: v.length ? v : ['all'] }); commitHistory(); }}
          renderTags={(val, getTagProps) => val.map((o, i) => <Chip size="small" key={o} label={o} {...getTagProps({ index: i })} />)}
          renderInput={(params) => <TextField {...params} label="Applies to (chat nodes)" />} />
        <TextField size="small" type="number" label="Priority (lower = earlier)" value={d.priority ?? 100}
          onChange={(e) => set({ priority: Number(e.target.value) })} onBlur={commitHistory} />
        <FormControlLabel control={<Switch checked={d.enabled !== false} onChange={(e) => { set({ enabled: e.target.checked }); commitHistory(); }} />} label="Enabled" />
        <Button size="small" color="error" variant="outlined" startIcon={<Trash2 size={14} />} onClick={() => removeRule(node.id)}>Delete rule</Button>
      </Stack>
    </Box>
  );
}
