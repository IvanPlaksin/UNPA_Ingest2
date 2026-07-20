/**
 * AnalysisView (P5) — the session-analysis AI agent panel inside SessionDrawer.
 * Runs the LLM analysis on demand, shows the verdict / problems / schema-clarity
 * findings, and lets the admin APPLY the recommended prompt changes as overlays:
 * global (general functionality) or service-scoped (this schema only).
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Stack, Typography, Chip, Button, TextField, Alert,
  CircularProgress, LinearProgress, Table, TableHead, TableRow, TableCell,
  TableBody, Divider, Switch, Tooltip,
} from '@mui/material';
import { Sparkles, RefreshCcw, Check } from 'lucide-react';
import {
  analyzeSession, applyPromptOverlay, getPromptOverlays, setPromptOverlayActive,
} from '../api/adminClient';
import { ErrorNote, fmtTs } from './common';

const VERDICT_META = {
  achieved:           { color: 'success', label: 'goal achieved' },
  partially_achieved: { color: 'warning', label: 'partially achieved' },
  not_achieved:       { color: 'error',   label: 'not achieved' },
  indeterminate:      { color: 'default', label: 'indeterminate' },
};
const CATEGORY_META = {
  general_functionality: { color: 'error',   label: 'general functionality' },
  schema_specific:       { color: 'warning', label: 'schema-specific' },
  schema_clarity:        { color: 'info',    label: 'schema clarity' },
  llm_behavior:          { color: 'secondary', label: 'LLM behavior' },
  integration_error:     { color: 'error',   label: 'integration' },
  user_behavior:         { color: 'default', label: 'user behavior' },
};

function RecommendationCard({ title, scopeLabel, rec, onApply, applied, disabled, disabledReason }) {
  const [text, setText] = useState(rec?.proposedText || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setText(rec?.proposedText || ''); setMsg(null); }, [rec?.proposedText]);

  if (!rec?.needed) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 260, opacity: 0.7 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" color="text.secondary">No change recommended.</Typography>
      </Paper>
    );
  }
  const apply = async () => {
    setBusy(true); setMsg(null);
    try {
      const overlay = await onApply(text);
      setMsg({ sev: 'success', text: `Applied as ${overlay.overlayId} — active immediately (no deploy).` });
    } catch (e) { setMsg({ sev: 'error', text: e.message }); } finally { setBusy(false); }
  };
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 260, borderColor: 'primary.main' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Chip size="small" variant="outlined" label={scopeLabel} />
      </Stack>
      {rec.rationale && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{rec.rationale}</Typography>}
      <TextField size="small" fullWidth multiline minRows={3} maxRows={10} value={text}
        onChange={(e) => setText(e.target.value)} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 12 } }} />
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <Tooltip title={disabled ? (disabledReason || '') : ''}>
          <span>
            <Button size="small" variant="contained" startIcon={busy ? <CircularProgress size={12} /> : <Check size={14} />}
              disabled={busy || applied || disabled || text.trim().length < 10} onClick={apply}>
              {applied ? 'Applied' : 'Apply prompt change'}
            </Button>
          </span>
        </Tooltip>
      </Stack>
      {msg && <Alert severity={msg.sev} sx={{ mt: 1 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
    </Paper>
  );
}

function OverlaysList({ serviceId, refreshKey }) {
  const [items, setItems] = useState(null);
  const load = () => getPromptOverlays({}).then((all) => setItems(
    all.filter((o) => o.scope === 'global' || (serviceId && o.serviceId === serviceId))
  )).catch(() => setItems([]));
  useEffect(() => { load(); }, [serviceId, refreshKey]); // eslint-disable-line

  if (!items?.length) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Active prompt overlays (global + this service)</Typography>
      <Table size="small">
        <TableHead><TableRow><TableCell>Id</TableCell><TableCell>Scope</TableCell><TableCell>Text</TableCell><TableCell>By / when</TableCell><TableCell>Active</TableCell></TableRow></TableHead>
        <TableBody>
          {items.map((o) => (
            <TableRow key={o.overlayId} sx={o.active ? undefined : { opacity: 0.5 }}>
              <TableCell><code>{o.overlayId}</code></TableCell>
              <TableCell><Chip size="small" variant="outlined" label={o.scope === 'global' ? 'global' : o.serviceId} /></TableCell>
              <TableCell><Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>{(o.text || '').slice(0, 160)}{(o.text || '').length > 160 ? '…' : ''}</Typography></TableCell>
              <TableCell><Typography variant="caption" color="text.secondary">{o.updatedBy}<br />{fmtTs(o.createdAt)}</Typography></TableCell>
              <TableCell>
                <Switch size="small" checked={!!o.active}
                  onChange={(e) => setPromptOverlayActive(o.overlayId, e.target.checked).then(load)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function AnalysisView({ session }) {
  const sessionId = session.sessionId;
  const serviceId = session.serviceId || null;
  const [result, setResult] = useState(null);   // {analysis, cached, analyzedAt, model}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [appliedScopes, setAppliedScopes] = useState({});
  const [overlaysKey, setOverlaysKey] = useState(0);

  // Show the cached analysis instantly when the session already carries one.
  useEffect(() => {
    setResult(null); setError(null); setAppliedScopes({});
    if (session.analysisJson) {
      try { setResult({ analysis: JSON.parse(session.analysisJson), cached: true, analyzedAt: session.analyzedAt, model: session.analysisModel }); } catch { /* re-run */ }
    }
  }, [sessionId]); // eslint-disable-line

  const run = async (force) => {
    setBusy(true); setError(null);
    try { setResult(await analyzeSession(sessionId, force)); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  const applyRec = (scope) => async (text) => {
    const rec = scope === 'global' ? a.generalPromptRecommendation : a.schemaPromptRecommendation;
    const overlay = await applyPromptOverlay({
      scope, serviceId: scope === 'service' ? serviceId : undefined,
      text, rationale: rec?.rationale, sourceSessionId: sessionId,
    });
    setAppliedScopes((s) => ({ ...s, [scope]: true }));
    setOverlaysKey((k) => k + 1);
    return overlay;
  };

  const a = result?.analysis;
  const verdict = a && (VERDICT_META[a.successAssessment?.userGoalAchieved] || VERDICT_META.indeterminate);

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Button size="small" variant={a ? 'outlined' : 'contained'} disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : (a ? <RefreshCcw size={14} /> : <Sparkles size={14} />)}
          onClick={() => run(!!a)}>
          {busy ? 'Analyzing…' : a ? 'Re-analyze' : 'Run AI analysis'}
        </Button>
        {result && (
          <Typography variant="caption" color="text.secondary">
            {result.cached ? 'cached' : 'fresh'} · {fmtTs(result.analyzedAt)} · {result.model}
          </Typography>
        )}
      </Stack>
      <ErrorNote error={error} onRetry={() => run(true)} />
      {busy && !a && <LinearProgress sx={{ mb: 2 }} />}
      {!a && !busy && !error && (
        <Typography variant="body2" color="text.secondary">
          The AI agent will review the full transcript, the final draft state and the invoked form schema,
          assess whether the user got what they needed, and propose prompt changes — global (system behavior)
          or scoped to this service's schema.
        </Typography>
      )}

      {a && (
        <>
          {/* Verdict */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
              <Chip color={verdict.color} label={verdict.label} />
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <LinearProgress variant="determinate" value={(a.successAssessment?.score ?? 0) * 100}
                  color={verdict.color === 'default' ? 'primary' : verdict.color} sx={{ height: 8, borderRadius: 4 }} />
              </Box>
              <Typography variant="caption">{Math.round((a.successAssessment?.score ?? 0) * 100)}%</Typography>
            </Stack>
            <Typography variant="body2">{a.successAssessment?.summary}</Typography>
          </Paper>

          {/* Problems */}
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Problems found ({(a.problems || []).length})</Typography>
          {(a.problems || []).length === 0 && <Typography variant="caption" color="text.secondary">None — the dialogue ran clean.</Typography>}
          {(a.problems || []).map((p, i) => {
            const meta = CATEGORY_META[p.category] || { color: 'default', label: p.category };
            return (
              <Paper key={i} variant="outlined" sx={{ p: 1, mb: 0.75 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Chip size="small" color={meta.color} variant="outlined" label={meta.label} sx={{ flexShrink: 0 }} />
                  <Box>
                    <Typography variant="body2">{p.description}</Typography>
                    {(p.evidenceTurns || []).length > 0 && (
                      <Typography variant="caption" color="text.secondary">evidence: turns {(p.evidenceTurns || []).join(', ')}</Typography>
                    )}
                  </Box>
                </Stack>
              </Paper>
            );
          })}

          {/* Schema clarity */}
          {(a.schemaClarityFindings || []).length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Schema clarity review</Typography>
              <Table size="small">
                <TableHead><TableRow><TableCell>Field</TableCell><TableCell>Issue</TableCell><TableCell>Suggestion</TableCell></TableRow></TableHead>
                <TableBody>
                  {a.schemaClarityFindings.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell><code>{f.slotId}</code></TableCell>
                      <TableCell><Typography variant="caption">{f.issue}</Typography></TableCell>
                      <TableCell><Typography variant="caption">{f.suggestion}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Recommendations → apply as overlays */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Recommended prompt changes</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <RecommendationCard title="System prompt (global)" scopeLabel="all conversations"
              rec={a.generalPromptRecommendation} onApply={applyRec('global')} applied={!!appliedScopes.global} />
            <RecommendationCard title="Schema prompt" scopeLabel={serviceId || 'this service'}
              rec={a.schemaPromptRecommendation} onApply={applyRec('service')} applied={!!appliedScopes.service}
              disabled={!serviceId} disabledReason="No service was resolved in this session — schema-scoped guidance has no target." />
          </Stack>

          <OverlaysList serviceId={serviceId} refreshKey={overlaysKey} />
        </>
      )}
    </Box>
  );
}
