/**
 * PE-006 — "what was the assistant told to do on this turn?"
 *
 * The operator's way into prompt work is a turn that went wrong, and until now that
 * question had no answer in the UI: a turn carried a version number and nothing
 * turned it back into rules.
 *
 * The wording throughout is IN FORCE, never "caused" or "affected". The rules listed
 * are a fact — the turn recorded a version, and the compiler is pure, so this is the
 * text the model was given. Which of them produced the behaviour is a hypothesis, and
 * the only thing that tests it is running the arena with the rule changed. An editor
 * that said "this rule caused it" would send people to rewrite innocent rules.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Alert, Collapse, Divider, Tooltip, IconButton, Button,
} from '@mui/material';
import { ChevronDown, ChevronRight, Bot, Zap, ExternalLink, Lock } from 'lucide-react';
import { promptRulesForTurn } from '../api/adminClient';
import { Loading, ErrorNote, fmtMs, fmtTsShort } from './common';
import { useTourAnchor } from '@guided-ux/tour/react';

/** Why the router sent the turn to the model, in words an operator can act on. */
const REASON_TEXT = {
  free_text: 'the user typed instead of clicking',
  control_rejected: 'the answer was refused and needed explaining',
  cascade_reset: 'answering reset fields that depended on it',
  repair_active: 'the repair ladder was up',
  not_fill_phase: 'the form was not being filled yet',
  no_prompt_hint: 'the field carries no question of its own',
  first_field: 'the first field of a form is introduced, not just asked',
  non_english: 'the session is not in English',
  large_form_offer: 'a long form was being offered',
  template: 'a template answered — no model call',
};

const STATUS_SEVERITY = { ok: 'success', template: 'info', unattributable: 'warning', unavailable: 'warning' };

function AuthorChip({ turn }) {
  if (!turn.turnAuthor) return <Chip size="small" variant="outlined" label="author not recorded" />;
  const isTemplate = turn.turnAuthor === 'template';
  return (
    <Tooltip title={REASON_TEXT[turn.routerReason] || turn.routerReason || ''}>
      <Chip
        size="small"
        color={isTemplate ? 'default' : 'primary'}
        variant={isTemplate ? 'outlined' : 'filled'}
        icon={isTemplate ? <Zap size={12} /> : <Bot size={12} />}
        label={isTemplate ? 'template' : 'model'}
      />
    </Tooltip>
  );
}

function RuleRow({ rule, onOpen }) {
  const [open, setOpen] = useState(false);
  const long = (rule.text || '').length > 150;
  return (
    <Box sx={{ mb: 0.75, borderLeft: 2, borderColor: rule.immutable ? 'warning.main' : 'divider', pl: 1 }}>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {long && (
          <Box component="span" sx={{ display: 'flex', cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </Box>
        )}
        <Chip size="small" variant="outlined" label={rule.type || '?'} />
        {/* Named because several nodes also carry a legacy `text` copy that compiles
            to nothing — editing that one is the mistake this panel exists to stop. */}
        <Tooltip title="the field this node type compiles">
          <Chip size="small" variant="outlined" label={rule.compilesField} sx={{ fontFamily: 'monospace' }} />
        </Tooltip>
        {rule.category && <Chip size="small" variant="outlined" label={rule.category} />}
        {rule.immutable && <Chip size="small" color="warning" variant="outlined" icon={<Lock size={11} />} label="immutable" />}
        {onOpen && (
          <Tooltip title="Open this rule in the prompt editor">
            <IconButton size="small" onClick={() => onOpen(rule)}><ExternalLink size={13} /></IconButton>
          </Tooltip>
        )}
      </Stack>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
        {long && !open ? `${rule.text.slice(0, 150)}…` : rule.text}
      </Typography>
    </Box>
  );
}

/**
 * EC-014 — the rules that were NOT in this prompt, and why.
 *
 * The operator's real question is "where is my rule", and a list of what was present
 * answers it only by omission — he has to already know the rule's name, scan for it,
 * fail to find it, and then guess. This puts the absence on the same screen as the
 * presence, with the reason one click away and phrased as the comparison he would
 * otherwise do by hand.
 *
 * Collapsed by default: on a healthy turn the interesting list is the one above.
 */
function MissingRules({ state, onOpen }) {
  const [open, setOpen] = useState(false);
  const missing = state.excluded || [];
  if (!missing.length) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" alignItems="center" spacing={0.75}
        sx={{ cursor: 'pointer', py: 0.25 }} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Typography variant="caption" color="text.secondary">
          {missing.length} rule{missing.length > 1 ? 's' : ''} in this version did not reach the model
        </Typography>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={0.5} sx={{ pl: 2.5, pt: 0.5 }}>
          {/* Without a recorded context the conditional answers below are guesses,
              and saying so beats a confident sentence built on nothing. */}
          {!state.contextRecorded && (
            <Typography variant="caption" color="warning.main">
              This turn recorded no context, so conditions cannot be replayed exactly.
            </Typography>
          )}
          {missing.map((m) => (
            <Box key={m.nodeId}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{m.title}</Typography>
                {onOpen && (
                  <IconButton size="small" onClick={() => onOpen({ nodeId: m.nodeId })}>
                    <ExternalLink size={11} />
                  </IconButton>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 0.5 }}>
                └─ {m.explanation}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function TurnBlock({ turn, onOpenRule }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || state || loading) return;
    setLoading(true);
    promptRulesForTurn(turn)
      .then(setState)
      .catch(setErr)
      .finally(() => setLoading(false));
  }, [open, state, loading, turn]);

  return (
    <Box sx={{ mb: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1}
        sx={{ cursor: 'pointer', py: 0.4, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
        onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Typography variant="body2" fontWeight={600}>Turn {turn.seq}</Typography>
        <AuthorChip turn={turn} />
        {turn.promptGraphVersion != null && (
          <Chip size="small" variant="outlined" label={`prompt v${turn.promptGraphVersion}`} />
        )}
        <Typography variant="caption" color="text.secondary">
          {fmtMs(turn.durationMs)} · {fmtTsShort(turn.ts)}
        </Typography>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ pl: 3, pt: 0.5 }}>
          {turn.routerReason && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              router: {REASON_TEXT[turn.routerReason] || turn.routerReason}
            </Typography>
          )}
          <ErrorNote error={err} />
          {loading && <Loading />}
          {state && (
            <>
              {state.notice && (
                <Alert severity={STATUS_SEVERITY[state.status] || 'info'} sx={{ mb: 1, py: 0.25 }}>
                  {state.notice}
                </Alert>
              )}
              {state.status === 'ok' && (
                <>
                  <Stack direction="row" spacing={1} sx={{ mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                    <Chip size="small" label={`${state.ruleCount} rules in force`} />
                    {state.hashMatches === true && (
                      <Tooltip title="The rebuilt rules hash to exactly what this turn recorded.">
                        <Chip size="small" color="success" variant="outlined" label="matches the record" />
                      </Tooltip>
                    )}
                  </Stack>
                  {state.rules.map((r) => <RuleRow key={r.nodeId} rule={r} onOpen={onOpenRule} />)}
                  <MissingRules state={state} onOpen={onOpenRule} />
                </>
              )}
            </>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function PromptForTurnView({ turns, onOpenRule }) {
  const rulesRef = useTourAnchor('session.turn.rules', { label: 'Rules in force on a turn' });
  if (!turns?.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No turns.</Typography>;

  const withAuthor = turns.filter((t) => t.turnAuthor).length;
  const templates = turns.filter((t) => t.turnAuthor === 'template').length;
  const legacy = turns.filter((t) => t.promptGraphEntryId && !t.promptProvenanceSource).length;

  return (
    <Box sx={{ p: 1.5 }} ref={rulesRef}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
        {withAuthor > 0 && <Chip size="small" variant="outlined" label={`${templates} template · ${withAuthor - templates} model`} />}
        {legacy > 0 && (
          <Tooltip title="Recorded before the provenance fix: stamped with the state-machine graph whichever interpreter ran.">
            <Chip size="small" color="warning" variant="outlined" label={`${legacy} unattributable`} />
          </Tooltip>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        The rules a turn ran under — what the assistant was told, not what made it answer as it did.
      </Typography>
      <Divider sx={{ mb: 1 }} />
      {turns.map((t) => <TurnBlock key={t.turnId || t.seq} turn={t} onOpenRule={onOpenRule} />)}
    </Box>
  );
}
