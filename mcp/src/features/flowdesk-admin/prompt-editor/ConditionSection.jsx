/**
 * EC-009 — "Applies when": the scope of a rule, as a property of the rule.
 *
 * Underneath, a condition is an APPLIES_WHEN edge from the node to itself. That is a
 * storage decision (it kept the ontology unchanged, and conditions are ORed per node
 * exactly as multiple edges are), and it is one the operator must never meet. A
 * self-loop shown as structure reads as nonsense, gets tidied away, and the rule
 * silently starts applying everywhere. So: no edge is named here, and the Connections
 * section filters this type out.
 *
 * ONE GROUP, AND [AND] ONLY. Keys within a condition are ANDed. The schema also ORs
 * multiple conditions per node, and the editor deliberately does not offer that: a
 * rule that needs "or" is nearly always two rules with different wording that have
 * been glued together, and offering the operator an "or" button is teaching him to
 * glue. If a real case turns up it is a request for an extension, not a default.
 */
import React, { useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Chip, MenuItem, TextField, Button, Alert, Divider,
  Autocomplete, Tooltip,
} from '@mui/material';
import { Filter, X } from 'lucide-react';
import { useRulesStore } from './rulesStore';
import { summarise, diagnoseCondition, CONDITION_KEYS } from './conditionText';

const LABEL = {
  phase: 'Where the conversation is',
  toolContext: 'What just happened',
  serviceCategory: 'Service family',
  language: 'Language',
};

export default function ConditionSection({ nodeId, vocabulary }) {
  const condition = useRulesStore((s) => s.conditionOf(nodeId));
  const setCondition = useRulesStore((s) => s.setCondition);
  const count = useRulesStore((s) => s.conditionCount(nodeId));
  const [open, setOpen] = useState(false);

  const vocab = vocabulary || {};
  const draft = condition || {};
  const diag = useMemo(() => diagnoseCondition(draft), [draft]);

  const set = (key, values) => {
    const next = { ...draft };
    if (!values || !values.length) delete next[key];
    else next[key] = values;
    setCondition(nodeId, Object.keys(next).length ? next : null);
  };

  const has = Object.keys(draft).some((k) => CONDITION_KEYS.includes(k));

  return (
    <Box>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Filter size={14} />
        <Typography variant="subtitle2">Applies when</Typography>
        {has && (
          <Tooltip title="Remove the condition — the rule goes back to applying on every turn.">
            <Chip size="small" variant="outlined" label="always" icon={<X size={11} />}
              onClick={() => setCondition(nodeId, null)} sx={{ height: 20, fontSize: 10 }} />
          </Tooltip>
        )}
      </Stack>

      {/* The summary IS the interface for most visits: an operator opening a rule
          wants to know when it speaks, not to re-choose it. */}
      <Typography variant="caption" color={has ? 'text.primary' : 'text.secondary'}>
        {summarise(draft)}
      </Typography>

      {/* Authored elsewhere (the schema ORs them; this editor writes one). Editing
          here would silently drop the others and change when the rule applies, so it
          says so and stays out of the way. */}
      {count > 1 && (
        <Alert severity="info" sx={{ mt: 1, py: 0 }}>
          This rule has {count} conditions, ORed together. Only the first is shown; the
          others are saved untouched.
        </Alert>
      )}
      {diag.error && (
        <Alert severity="error" sx={{ mt: 1, py: 0 }}>
          {diag.error}
        </Alert>
      )}
      {!diag.error && diag.warning && (
        <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
          {diag.warning}
        </Alert>
      )}

      {!open ? (
        <Button size="small" sx={{ mt: 0.5 }} onClick={() => setOpen(true)}>
          {has ? 'Change when it applies' : 'Limit when it applies'}
        </Button>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {['phase', 'toolContext', 'language'].map((key) => {
            const values = (vocab[key] && vocab[key].values) || [];
            return (
              <TextField
                key={key} select size="small" label={LABEL[key]}
                SelectProps={{ multiple: true, renderValue: (v) => (v.length ? v.join(', ') : 'any') }}
                value={draft[key] || []}
                onChange={(e) => set(key, e.target.value)}
                helperText={draft[key] ? '' : 'any'}
              >
                {values.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
              </TextField>
            );
          })}
          {/* No enum by design — the catalogue supplies these, so the editor takes
              free text rather than inventing a closed list that would go stale. */}
          <Autocomplete
            multiple freeSolo size="small"
            options={(vocab.serviceCategory && vocab.serviceCategory.suggestions) || []}
            value={draft.serviceCategory || []}
            onChange={(_, v) => set('serviceCategory', v)}
            renderTags={(val, getTagProps) => val.map((o, i) => (
              <Chip size="small" key={o} label={o} {...getTagProps({ index: i })} />
            ))}
            renderInput={(params) => (
              <TextField {...params} label={LABEL.serviceCategory}
                helperText={draft.serviceCategory ? '' : 'any — e.g. EO-HR'} />
            )}
          />
          <Button size="small" onClick={() => setOpen(false)}>Done</Button>
        </Stack>
      )}
    </Box>
  );
}
