/**
 * RulePropertiesPanel (P6) — edit the selected rule node.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, TextField, MenuItem, Stack, Typography, Switch, FormControlLabel,
  Button, Chip, Autocomplete, Alert, Tooltip,
} from '@mui/material';
import { Trash2 } from 'lucide-react';
import { useRulesStore, CATEGORIES, APPLIES_TO } from './rulesStore';
import ConnectionsSection from './ConnectionsSection';
import ConditionSection from './ConditionSection';
import DeleteRuleDialog from './DeleteRuleDialog';

/**
 * EC-009 — the vocabulary a condition may use, fetched rather than restated.
 *
 * The API derives it from the schema, so a phase added there appears here with no
 * second edit and a phase removed there stops being offered. Hardcoding the lists in
 * the editor is how `appliesTo` once came to offer scopes the engine did not read:
 * the operator picks one, it saves, it validates, and the rule never applies.
 */
function useConditionVocabulary() {
  const [vocab, setVocab] = useState(null);
  useEffect(() => {
    let live = true;
    promptMeta()
      .then((m) => { if (live) setVocab((m && m.conditions) || {}); })
      // Offline: the section still renders the summary and can clear a condition; it
      // just cannot offer values it is not sure of.
      .catch(() => { if (live) setVocab({}); });
    return () => { live = false; };
  }, []);
  return vocab || {};
}
import { promptTurnsUnderRule, promptMeta } from '../api/adminClient';
import { useTourAnchor } from '@guided-ux/tour/react';

/**
 * PE-007 (variant a) — how many recorded turns had this rule IN FORCE.
 *
 * The set is exact: the turn recorded a prompt version, and the rule either compiled
 * into that version or it did not. What is NOT exact is influence, and the label says
 * "in force" for that reason — a panel reading "affected 240 turns" would be read as
 * causation and send someone to rewrite a rule that did nothing.
 *
 * Turns recorded before the provenance fix are shown separately rather than dropped.
 * They are most of the history, and hiding them would make every rule look rarely used.
 */
function InForceCounter({ nodeId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    if (!nodeId) return undefined;
    promptTurnsUnderRule(nodeId)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(e); });
    return () => { live = false; };
  }, [nodeId]);

  if (err) return null;
  if (!data) return <Typography variant="caption" color="text.secondary">counting turns…</Typography>;
  if (!data.versions?.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        This rule is in no compiled version yet — no recorded turn ran under it.
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <Tooltip title={data.conditional
        ? `Of the turns running these versions whose context we know, this many satisfied the rule's condition. Versions: ${data.versions.join(', ')}.`
        : `Present in the compiled prompt of version(s) ${data.versions.join(', ')}. In force means the model was given it — not that it caused anything.`}>
        <Chip size="small" variant="outlined" label={data.conditional
          // EC-012: for a conditional rule the denominator is the point. The gap
          // between the two numbers IS the condition doing its work, and a single
          // number would hide whether it fires constantly or almost never.
          ? `in force on ${data.turns} of ${data.turnsWithContext} turns`
          : `in force on ${data.turns} turns · ${data.sessions} sessions`} />
      </Tooltip>
      {data.conditional && data.withoutContext > 0 && (
        <Tooltip title="Turns on these same versions recorded before context tracking. The condition cannot be replayed for them, so they are neither counted nor assumed.">
          <Chip size="small" color="warning" variant="outlined" label={`${data.withoutContext} without context`} />
        </Tooltip>
      )}
      {data.unattributable > 0 && (
        <Tooltip title="Recorded before the provenance fix: stamped with the state-machine graph whichever interpreter ran. No rule can be attributed to them.">
          <Chip size="small" color="warning" variant="outlined" label={`${data.unattributable} unattributable`} />
        </Tooltip>
      )}
    </Stack>
  );
}

export default function RulePropertiesPanel() {
  const rootRef = useTourAnchor('editor.properties', {
    label: 'Rule properties', route: '/flowdesk-admin/prompt',
  });
  const nodes = useRulesStore((s) => s.nodes);
  const selectedId = useRulesStore((s) => s.selectedId);
  const updateRule = useRulesStore((s) => s.updateRule);
  const commitHistory = useRulesStore((s) => s.commitHistory);
  const removeRule = useRulesStore((s) => s.removeRule);

  const connections = useRulesStore((s) => s.connections);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const vocabulary = useConditionVocabulary();

  const node = nodes.find((n) => n.id === selectedId);
  if (!node) {
    return <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a rule node to edit it, or add one from the palette.</Typography></Box>;
  }
  const d = node.data;
  const set = (patch) => updateRule(node.id, patch);

  return (
    <Box sx={{ p: 1.5 }} ref={rootRef}>
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
        {d.nodeType && <InForceCounter nodeId={d.nodeId || node.id} />}
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
        {/* PE-002: WHY the rule exists, directly under WHAT it says.
            Required for a new rule and blocking, because the alternative is what the
            inherited 22 already demonstrate: a prompt nobody dares edit because no
            one can tell which sentences are load-bearing. Not required when editing
            an existing rule — that was Ivan's call, and the reason for a CHANGE is
            recorded on the version instead. */}
        <TextField
          size="small" multiline minRows={2}
          label={d.isNew ? 'Why this rule exists (required)' : 'Why this rule exists'}
          value={d.rationale || ''}
          onChange={(e) => set({ rationale: e.target.value })} onBlur={commitHistory}
          required={!!d.isNew}
          error={!!d.isNew && !String(d.rationale || '').trim()}
          helperText={d.isNew
            ? 'What problem it solves, and what would go wrong without it. Saved on the rule.'
            : (d.rationale ? '' : 'Inherited from the migration with no recorded intent.')}
          placeholder="e.g. Users asked twice because the assistant re-opened settled fields." />
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
        {/* EC-008 — only on the agent's graph. The legacy CHAT_PROMPT graph has no
            edge ontology, so offering relations there would let the operator author
            structure nothing reads. */}
        {d.nodeType && <ConditionSection nodeId={node.id} vocabulary={vocabulary} />}
        {d.nodeType && <ConnectionsSection nodeId={node.id} />}
        <Button size="small" color="error" variant="outlined" startIcon={<Trash2 size={14} />}
          onClick={() => {
            // Confirm only when there is something to lose. A rule nobody is attached
            // to deletes as it always did.
            if (connections(node.id).length) setConfirmDelete(true);
            else removeRule(node.id);
          }}>Delete rule</Button>
      </Stack>
      <DeleteRuleDialog
        nodeId={node.id} open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); removeRule(node.id); }}
      />
    </Box>
  );
}
