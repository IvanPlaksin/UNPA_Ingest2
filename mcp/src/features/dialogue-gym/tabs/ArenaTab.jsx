/**
 * Dialogue Gym — Arena tab. Run a simulated dialogue (persona × scenario) and
 * browse recorded runs + bilingual transcripts.
 */
import React, { useEffect, useState } from 'react';
import {
  Paper, Table, TableHead, TableRow, TableCell, TableBody, Button, Stack, Chip, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box, Tooltip, IconButton, CircularProgress, Alert,
  ToggleButton, ToggleButtonGroup, Link,
} from '@mui/material';
import { Play, Shuffle, Eye, Gavel, RefreshCcw, ExternalLink } from 'lucide-react';
import { Loading, ErrorNote, useAutoRefresh, fmtTs } from '../../flowdesk-admin/components/common';
import {
  listRuns, getRunTurns, runArena, runArenaRandom, listPersonas, listScenarios, judgeRun,
  listPrompts, getPromptVersions,
} from '../api/dialogueGymClient';

const TERMINAL_COLOR = {
  service_matched: 'success', goal_achieved: 'success', max_turns: 'warning',
  gave_up: 'error', agent_error: 'error', directory_unavailable: 'error',
};

/**
 * PromptSelector — choose which CHAT_PROMPT the arena tests: the live production
 * prompt, a specific editor version, or raw custom text. Emits a promptConfig
 * consumed as runArena options.
 */
function PromptSelector({ value, onChange }) {
  const [graphs, setGraphs] = useState([]);
  const [versions, setVersions] = useState([]);
  const mode = value.promptSource || 'production';

  useEffect(() => { listPrompts().then(setGraphs).catch(() => setGraphs([])); }, []);
  useEffect(() => {
    if (value.promptEntryId) getPromptVersions(value.promptEntryId).then(setVersions).catch(() => setVersions([]));
    else setVersions([]);
  }, [value.promptEntryId]);

  const setMode = (_, m) => { if (m) onChange({ promptSource: m, promptEntryId: value.promptEntryId, promptVersionNumber: value.promptVersionNumber, systemPromptText: value.systemPromptText }); };

  return (
    <Box sx={{ mt: 1.5, p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">System prompt:</Typography>
        <ToggleButtonGroup value={mode} exclusive size="small" onChange={setMode}>
          <ToggleButton value="production" sx={{ py: 0.2, px: 1 }}>Production</ToggleButton>
          <ToggleButton value="version" sx={{ py: 0.2, px: 1 }}>Version</ToggleButton>
          <ToggleButton value="custom_text" sx={{ py: 0.2, px: 1 }}>Custom</ToggleButton>
        </ToggleButtonGroup>
        {mode === 'version' && (
          <>
            <TextField select size="small" label="graph" value={value.promptEntryId || ''} sx={{ minWidth: 200 }}
              onChange={(e) => onChange({ promptSource: 'version', promptEntryId: e.target.value, promptVersionNumber: null })}>
              {graphs.map((g) => <MenuItem key={g.entryId} value={g.entryId}>{g.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="version" value={value.promptVersionNumber ?? ''} sx={{ minWidth: 200 }} disabled={!value.promptEntryId}
              onChange={(e) => onChange({ promptSource: 'version', promptEntryId: value.promptEntryId, promptVersionNumber: Number(e.target.value) })}>
              {versions.map((v) => <MenuItem key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber}{v.isProduction ? ' (prod)' : ''} — {v.changelog || ''}</MenuItem>)}
            </TextField>
            {value.promptEntryId && (
              <Link href={`/flowdesk-admin/prompt?entry=${value.promptEntryId}${value.promptVersionNumber ? `&version=${value.promptVersionNumber}` : ''}`} target="_blank" rel="noopener"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12 }}>
                <ExternalLink size={13} /> Open in Prompt Editor
              </Link>
            )}
          </>
        )}
      </Stack>
      {mode === 'production' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Uses the current live prompt (shared by AltioraChat + voice assistant).</Typography>}
      {mode === 'custom_text' && (
        <TextField size="small" fullWidth multiline minRows={4} placeholder="Raw system prompt text (A/B experiment)…" sx={{ mt: 1 }}
          value={value.systemPromptText || ''} onChange={(e) => onChange({ promptSource: 'custom_text', systemPromptText: e.target.value })} />
      )}
    </Box>
  );
}

function RunPanel({ personas, scenarios, onRan }) {
  const [personaId, setPersonaId] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [maxTurns, setMaxTurns] = useState(6);
  const [token, setToken] = useState('');
  const [prompt, setPrompt] = useState({ promptSource: 'production' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [last, setLast] = useState(null);

  // Deep-link from the Prompt Editor ("Test in Dialogue Gym"): preselect the version.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const entry = q.get('promptEntry');
    if (entry) setPrompt({ promptSource: 'version', promptEntryId: entry, promptVersionNumber: q.get('promptVersion') ? Number(q.get('promptVersion')) : null });
  }, []);

  const run = async (random) => {
    setBusy(true); setErr(null); setLast(null);
    try {
      const opts = {
        maxTurns: Number(maxTurns) || 6,
        altioraUserToken: token || undefined,
        promptSource: prompt.promptSource,
        promptEntryId: prompt.promptEntryId || undefined,
        promptVersionNumber: prompt.promptVersionNumber ?? undefined,
        systemPromptText: prompt.promptSource === 'custom_text' ? (prompt.systemPromptText || undefined) : undefined,
      };
      const res = random
        ? await runArenaRandom({ options: opts })
        : await runArena({ personaId, scenarioId, options: opts });
      setLast(res.metrics || res.run);
      onRan();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Run a dialogue</Typography>
      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }} alignItems="center">
        <TextField select size="small" label="persona" value={personaId} onChange={(e) => setPersonaId(e.target.value)} sx={{ minWidth: 200 }}>
          {personas.map((p) => <MenuItem key={p.personaId} value={p.personaId}>{p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="scenario" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} sx={{ minWidth: 220 }}>
          {scenarios.map((s) => <MenuItem key={s.scenarioId} value={s.scenarioId}>{s.name}</MenuItem>)}
        </TextField>
        <TextField size="small" label="maxTurns" type="number" value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} sx={{ width: 100 }} />
        <Button variant="contained" startIcon={busy ? <CircularProgress size={14} /> : <Play size={15} />} disabled={busy || !personaId || !scenarioId} onClick={() => run(false)}>Run</Button>
        <Button variant="outlined" startIcon={<Shuffle size={15} />} disabled={busy} onClick={() => run(true)}>Random pair</Button>
      </Stack>
      <PromptSelector value={prompt} onChange={setPrompt} />
      <TextField size="small" label="Altiora user token (optional — acts as real user for LOV/directory/user-scoped data)" value={token} onChange={(e) => setToken(e.target.value)} fullWidth sx={{ mt: 1.5 }} type="password" />
      {busy && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Running a live dialogue (real LLMs) — this can take ~40–60s…</Typography>}
      <ErrorNote error={err} />
      {last && <Alert severity={last.serviceIdentified ? 'success' : 'info'} sx={{ mt: 1 }}>
        Done — terminal={last.terminalCondition}, serviceIdentified={String(last.serviceIdentified)}, identified={last.identifiedServiceCode || 'none'} (expected {last.expectedServiceCode || 'none'})
      </Alert>}
    </Paper>
  );
}

function TranscriptDialog({ runId, onClose }) {
  const [turns, setTurns] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!runId) return;
    setTurns(null); setErr(null);
    getRunTurns(runId).then(setTurns).catch(setErr);
  }, [runId]);
  return (
    <Dialog open={!!runId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Transcript — {runId?.slice(0, 8)}</DialogTitle>
      <DialogContent dividers>
        <ErrorNote error={err} />
        {!turns ? <Loading /> : turns.map((t) => (
          <Box key={t.turnId} sx={{ mb: 1.5, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">turn {t.turnIndex}{t.route ? ` · ${t.route}` : ''}{t.identifiedService ? ` · svc:${t.identifiedService}` : ''}</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>👤 {t.userMessage}</Typography>
            {t.userMessageRu && <Typography variant="body2" color="text.secondary">🇷🇺 {t.userMessageRu}</Typography>}
            <Typography variant="body2" sx={{ mt: 0.5 }}>🤖 {t.agentResponse}</Typography>
            {t.agentResponseRu && <Typography variant="body2" color="text.secondary">🇷🇺 {t.agentResponseRu}</Typography>}
          </Box>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

export default function ArenaTab() {
  const [runs, setRuns] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [view, setView] = useState(null);
  const [judging, setJudging] = useState(null);
  const { loading, error, reload } = useAutoRefresh(async () => {
    const [r, p, s] = await Promise.all([
      listRuns({ limit: 100 }),
      personas.length ? null : listPersonas({ enabled: true, limit: 500 }),
      scenarios.length ? null : listScenarios({ enabled: true, limit: 500 }),
    ]);
    setRuns(r.items || []);
    if (p) setPersonas(p.items || []);
    if (s) setScenarios(s.items || []);
  }, 0, []);

  const doJudge = async (runId) => { setJudging(runId); try { await judgeRun(runId, {}); reload(); } finally { setJudging(null); } };

  return (
    <Box>
      <RunPanel personas={personas} scenarios={scenarios} onRan={reload} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{runs.length} runs</Typography>
        <Button size="small" startIcon={<RefreshCcw size={14} />} onClick={reload}>Refresh</Button>
      </Stack>
      <ErrorNote error={error} onRetry={reload} />
      {loading ? <Loading /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Run</TableCell><TableCell>Scenario</TableCell><TableCell>Persona</TableCell>
              <TableCell>Prompt</TableCell><TableCell>Outcome</TableCell><TableCell>Service</TableCell><TableCell>Started</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.runId} hover>
                  <TableCell><code style={{ fontSize: 11 }}>{r.runId.slice(0, 8)}</code></TableCell>
                  <TableCell>{r.scenarioId?.replace('dg-scn-', '')}</TableCell>
                  <TableCell>{r.personaId?.replace('dg-persona-', '')}</TableCell>
                  <TableCell>
                    <Tooltip title={r.promptEntryId ? `${r.promptEntryId}@v${r.promptVersionNumber ?? 'latest'}` : ''}>
                      <Chip size="small" variant="outlined" label={r.promptSource === 'version' ? `v${r.promptVersionNumber ?? '?'}` : (r.promptSource || 'production')} />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" color={TERMINAL_COLOR[r.terminalCondition] || 'default'} label={r.terminalCondition || r.status} />
                    {r.status === 'aborted' && <Chip size="small" color="error" label="aborted" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>
                    {r.serviceIdentified === true && <Chip size="small" color="success" variant="outlined" label={r.identifiedServiceCode || 'matched'} />}
                    {r.serviceIdentified === false && <Typography variant="caption" color="text.secondary">{r.identifiedServiceCode || 'none'}</Typography>}
                  </TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{fmtTs(r.startedAt)}</Typography></TableCell>
                  <TableCell align="right">
                    <Tooltip title="View transcript"><IconButton size="small" onClick={() => setView(r.runId)}><Eye size={15} /></IconButton></Tooltip>
                    <Tooltip title="Judge (LLM)"><span><IconButton size="small" disabled={judging === r.runId} onClick={() => doJudge(r.runId)}>{judging === r.runId ? <CircularProgress size={14} /> : <Gavel size={15} />}</IconButton></span></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!runs.length && <TableRow><TableCell colSpan={8}><Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>No runs yet — run a dialogue above.</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      )}
      <TranscriptDialog runId={view} onClose={() => setView(null)} />
    </Box>
  );
}
