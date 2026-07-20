/**
 * TestApplyPanel (P6) — validate the rules graph, preview the compiled prompt,
 * sandbox-test it against real chat turns (no side effects), and apply it live.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Button, Typography, Paper, Chip, TextField, Alert, CircularProgress,
  Divider, Accordion, AccordionSummary, AccordionDetails, IconButton,
} from '@mui/material';
import { ShieldCheck, FlaskConical, Rocket, FileText, ChevronDown, Plus, X } from 'lucide-react';
import {
  promptValidate, promptCompile, promptSandbox, promptApply, promptActive, promptClear,
} from '../api/adminClient';
import { useRulesStore } from './rulesStore';

const OUTCOME_COLOR = { OUT_OF_SCOPE: 'default', NEW_INTENT: 'primary', DISAMBIGUATE: 'info', SLOT_FILL: 'primary', INFO_QUESTION: 'success', CONFIRM_YES: 'success', ERROR: 'error' };

export default function TestApplyPanel() {
  const toGraph = useRulesStore((s) => s.toGraph);
  const entryId = useRulesStore((s) => s.entryId);
  const version = useRulesStore((s) => s.version);
  const [validation, setValidation] = useState(null);
  const [compiled, setCompiled] = useState(null);
  const [sandbox, setSandbox] = useState(null);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState(['I need to initiate the separation process', 'what is the weather today']);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);

  const loadActive = () => promptActive().then(setActive).catch(() => setActive(null));
  useEffect(() => { loadActive(); }, []);

  const run = async (kind, fn) => { setBusy(kind); setNote(null); try { await fn(); } catch (e) { setNote({ sev: 'error', text: e.message }); } finally { setBusy(''); } };

  const doValidate = () => run('validate', async () => setValidation(await promptValidate(toGraph())));
  const doCompile = () => run('compile', async () => setCompiled(await promptCompile(toGraph())));
  const doSandbox = () => run('sandbox', async () => setSandbox(await promptSandbox({ graph: toGraph(), messages: msgs.filter((m) => m.trim()), lang: 'en' })));
  const doApply = () => run('apply', async () => {
    const v = await promptValidate(toGraph());
    if (!v.ok) { setValidation(v); throw new Error('Fix validation errors before applying'); }
    const r = await promptApply({ graph: toGraph(), entryId, version, label: `applied ${new Date().toISOString().slice(0, 16)}` });
    setNote({ sev: 'success', text: `Applied as ${r.record.promptId} — live for all conversations (${r.record.ruleCount} rules).` });
    loadActive();
  });
  const doClear = () => run('clear', async () => { await promptClear(); setNote({ sev: 'info', text: 'Active prompt cleared — chat uses base prompts + overlays only.' }); loadActive(); });

  return (
    <Box sx={{ p: 1.5, overflow: 'auto', height: '100%' }}>
      <Stack spacing={1.5}>
        {active
          ? <Alert severity="success" icon={<Rocket size={16} />} action={<Button size="small" color="inherit" disabled={busy === 'clear'} onClick={doClear}>Clear</Button>}>
              Active prompt: <b>{active.promptId}</b> · {active.ruleCount} rules{active.label ? ` · ${active.label}` : ''}
            </Alert>
          : <Alert severity="info">No active graph prompt — the chat uses its base prompts + P5 overlays. Apply below to make this graph live.</Alert>}

        {note && <Alert severity={note.sev} onClose={() => setNote(null)}>{note.text}</Alert>}

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={busy === 'validate' ? <CircularProgress size={13} /> : <ShieldCheck size={14} />} onClick={doValidate}>Validate</Button>
          <Button size="small" variant="outlined" startIcon={busy === 'compile' ? <CircularProgress size={13} /> : <FileText size={14} />} onClick={doCompile}>Preview prompt</Button>
          <Button size="small" variant="contained" color="success" startIcon={busy === 'apply' ? <CircularProgress size={13} /> : <Rocket size={14} />} onClick={doApply}>Apply live</Button>
        </Stack>

        {validation && (
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" color={validation.ok ? 'success' : 'error'} label={validation.ok ? 'valid' : `${validation.errors.length} error(s)`} />
              {validation.warnings.length > 0 && <Chip size="small" color="warning" variant="outlined" label={`${validation.warnings.length} warning(s)`} />}
              <Typography variant="caption" color="text.secondary">{JSON.stringify(validation.stats)}</Typography>
            </Stack>
            {validation.errors.map((e, i) => <Typography key={i} variant="caption" color="error" sx={{ display: 'block' }}>• {e.message}</Typography>)}
            {validation.warnings.map((w, i) => <Typography key={i} variant="caption" color="warning.main" sx={{ display: 'block' }}>• {w.message}</Typography>)}
          </Paper>
        )}

        {compiled && (
          <Accordion defaultExpanded disableGutters>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}><Typography variant="subtitle2">Compiled prompt · {compiled.ruleCount} rules</Typography></AccordionSummary>
            <AccordionDetails>
              <Box component="pre" sx={{ m: 0, p: 1, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: 'action.hover', borderRadius: 1, maxHeight: 260, overflow: 'auto' }}>{compiled.text}</Box>
            </AccordionDetails>
          </Accordion>
        )}

        <Divider />
        <Typography variant="subtitle2"><FlaskConical size={14} style={{ verticalAlign: -2 }} /> Sandbox (drives real chat turns, no side effects)</Typography>
        {msgs.map((m, i) => (
          <Stack key={i} direction="row" spacing={0.5} alignItems="center">
            <TextField size="small" fullWidth value={m} placeholder={`User turn ${i + 1}`}
              onChange={(e) => setMsgs((x) => x.map((v, j) => (j === i ? e.target.value : v)))} />
            <IconButton size="small" onClick={() => setMsgs((x) => x.filter((_, j) => j !== i))}><X size={14} /></IconButton>
          </Stack>
        ))}
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<Plus size={13} />} onClick={() => setMsgs((x) => [...x, ''])} disabled={msgs.length >= 12}>Add turn</Button>
          <Button size="small" variant="contained" startIcon={busy === 'sandbox' ? <CircularProgress size={13} /> : <FlaskConical size={14} />}
            onClick={doSandbox} disabled={busy === 'sandbox' || !msgs.some((m) => m.trim())}>Run sandbox</Button>
        </Stack>

        {sandbox && (
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" color={sandbox.sideEffects.ticketsCreated === 0 && sandbox.sideEffects.memgraphWrites === 0 ? 'success' : 'warning'}
                label={`no side effects (tickets ${sandbox.sideEffects.ticketsCreated}, writes ${sandbox.sideEffects.memgraphWrites})`} />
              {sandbox.ruleCount != null && <Chip size="small" variant="outlined" label={`${sandbox.ruleCount} rules`} />}
            </Stack>
            {sandbox.transcript.map((t, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ display: 'block', color: 'primary.main' }}>▸ {t.user}</Typography>
                <Stack direction="row" spacing={0.5} alignItems="flex-start">
                  {t.route && <Chip size="small" variant="outlined" color={OUTCOME_COLOR[t.route] || 'default'} label={t.route} />}
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{t.agent || <em style={{ color: '#ef4444' }}>{t.error}</em>}</Typography>
                </Stack>
              </Box>
            ))}
          </Paper>
        )}
      </Stack>
    </Box>
  );
}
