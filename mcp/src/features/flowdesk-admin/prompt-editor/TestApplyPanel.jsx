/**
 * TestApplyPanel (P6) — validate the rules graph, preview the compiled prompt,
 * sandbox-test it against real chat turns (no side effects), and apply it live.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Button, Typography, Paper, Chip, TextField, Alert, CircularProgress,
  Divider, Accordion, AccordionSummary, AccordionDetails, IconButton, MenuItem, Tooltip,
} from '@mui/material';
import { ShieldCheck, FlaskConical, Rocket, FileText, ChevronDown, Plus, X, Dumbbell, GitCompare } from 'lucide-react';
import {
  promptValidate, promptCompile, promptSandbox, promptApply, promptActive, promptClear,
  promptSaveGraph, promptPromoteVersion, promptGetGraph, promptGetVersions,
} from '../api/adminClient';
import { useRulesStore } from './rulesStore';
import { diffLines, condense, diffNodes } from './promptDiff';

const OUTCOME_COLOR = { OUT_OF_SCOPE: 'default', NEW_INTENT: 'primary', DISAMBIGUATE: 'info', SLOT_FILL: 'primary', INFO_QUESTION: 'success', CONFIRM_YES: 'success', ERROR: 'error' };

export default function TestApplyPanel() {
  const toGraph = useRulesStore((s) => s.toGraph);
  const entryId = useRulesStore((s) => s.entryId);
  const version = useRulesStore((s) => s.version);
  const isEvolutio = useRulesStore((s) => s.isEvolutio);
  const isLiveForAgent = useRulesStore((s) => s.isLiveForAgent);
  // The node under the cursor in the editor: its contribution to the compiled text
  // is what an operator is actually trying to see when they press Compile.
  const selectedId = useRulesStore((s) => s.selectedId);
  const selectedNode = useRulesStore((s) => s.nodes.find((n) => n.id === s.selectedId) || null);
  // HYB-011c: the prompt is compiled per language (the language instruction is the
  // only part that varies), so the preview has to say which one it is showing.
  const [lang, setLang] = useState('en');
  const [compare, setCompare] = useState(null);
  const [cmpFrom, setCmpFrom] = useState(null);
  const [cmpTo, setCmpTo] = useState(null);
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
  const doCompile = () => run('compile', async () => setCompiled(await promptCompile(toGraph(), { language: lang, entryId, version })));
  const doSandbox = () => run('sandbox', async () => setSandbox(await promptSandbox({ graph: toGraph(), messages: msgs.filter((m) => m.trim()), lang: 'en' })));
  /**
   * "Make this live" means two different things, and the difference is not cosmetic.
   *
   * The STATE MACHINE reads a materialised active-prompt record, so applying means
   * compiling the graph into that record. The AGENT — which is what the live chat is
   * — has no such record: it compiles whatever version of its graph is CURRENT, every
   * turn. So on the agent's graph, applying means promoting a version, and calling
   * the state machine's apply here would write a record nobody reads while leaving
   * the agent on the old version. That is the same class of silent no-op that had a
   * prompt change do nothing for a full round of work (HYB-011a).
   */
  const doApply = () => run('apply', async () => {
    const v = await promptValidate(toGraph());
    if (!v.ok) { setValidation(v); throw new Error('Fix validation errors before applying'); }

    if (isEvolutio) {
      const saved = await promptSaveGraph({ entryId, name: undefined, nodes: toGraph().nodes, edges: toGraph().edges, changelog: 'applied from the editor' });
      const newVersion = saved.versionNumber ?? saved.currentVersion ?? version;
      await promptPromoteVersion(entryId, newVersion);
      setNote({
        sev: 'success',
        text: `Version ${newVersion} promoted — the chat compiles it on the next turn. `
          + 'There is no separate "active prompt" record on this path: the agent reads the current version directly.',
      });
      return;
    }

    const r = await promptApply({ graph: toGraph(), entryId, version, label: `applied ${new Date().toISOString().slice(0, 16)}` });
    setNote({ sev: 'success', text: `Applied as ${r.record.promptId} — live for all conversations (${r.record.ruleCount} rules).` });
    loadActive();
  });
  const doClear = () => run('clear', async () => { await promptClear(); setNote({ sev: 'info', text: 'Active prompt cleared — chat uses base prompts + overlays only.' }); loadActive(); });

  const LANGS = [['en', 'English'], ['ru', 'Русский'], ['fr', 'Français'], ['es', 'Español'], ['ar', 'العربية'], ['zh', '中文']];

  /**
   * HYB-011d — compare two versions, and show BOTH answers.
   *
   * The node list is the edit the operator thinks they made; the compiled diff is the
   * edit the model receives. They disagree often enough to matter: a node reworded in
   * a field the compiler does not read changes nothing, and a node left alone can move
   * in the compiled text because something above it did.
   */
  const doCompare = () => run('compare', async () => {
    if (!entryId) throw new Error('Save the graph first — a version has to exist to compare against.');
    const list = await promptGetVersions(entryId);
    const nums = (Array.isArray(list) ? list : []).map((v) => v.versionNumber ?? v.version).filter((n) => n != null).sort((a, b) => b - a);
    const to = cmpTo ?? nums[0] ?? version;
    const from = cmpFrom ?? nums.find((n) => n < to) ?? to;
    if (from === to) throw new Error('Only one version exists — nothing to compare it with yet.');

    const [ga, gb] = await Promise.all([promptGetGraph(entryId, from), promptGetGraph(entryId, to)]);
    const shape = (g) => ({ nodes: g.nodes || [], edges: g.edges || [] });
    const [ca, cb] = await Promise.all([
      promptCompile(shape(ga), { language: lang, entryId, version: from }),
      promptCompile(shape(gb), { language: lang, entryId, version: to }),
    ]);
    const textOf = (c) => (c && (c.text || (c.data && c.data.text))) || '';
    setCompare({
      from, to,
      nodes: diffNodes(ga.nodes, gb.nodes),
      lines: condense(diffLines(textOf(ca), textOf(cb))),
      tokensFrom: (ca.tokens || (ca.data && ca.data.tokens) || {}).tokens,
      tokensTo: (cb.tokens || (cb.data && cb.data.tokens) || {}).tokens,
    });
  });

  /**
   * What the SELECTED node contributed to the compiled prompt.
   *
   * Taken from the compiler's own `byNode` map rather than matched by text: the
   * compiler is the authority on what it emitted, and a node whose wording appears
   * twice would otherwise highlight the wrong line.
   */
  const contribution = (() => {
    if (!compiled || !selectedNode) return null;
    const byNode = compiled.byNode || (compiled.data && compiled.data.byNode) || null;
    const key = selectedNode.data?.key || selectedNode.id;
    const own = byNode ? (byNode[key] ?? null) : null;
    if (own) return String(own);
    // No entry means the node did NOT reach the prompt — retired, filtered by a
    // condition, or outside this language. That is worth saying out loud: it is the
    // most common reason an edited rule has no effect.
    return byNode ? '' : null;
  })();

  const tokens = compiled && (compiled.tokens || (compiled.data && compiled.data.tokens));
  const compiledText = compiled && (compiled.text || (compiled.data && compiled.data.text) || '');

  return (
    <Box sx={{ p: 1.5, overflow: 'auto', height: '100%' }}>
      <Stack spacing={1.5}>
        {isEvolutio && (
          <Alert severity="info" icon={<Rocket size={16} />}>
            This is the graph the live chat compiles. Applying promotes a version — there is
            no separate “active prompt” record on this path.
          </Alert>
        )}
        {!isEvolutio && active
          ? <Alert severity="success" icon={<Rocket size={16} />} action={<Button size="small" color="inherit" disabled={busy === 'clear'} onClick={doClear}>Clear</Button>}>
              Active prompt: <b>{active.promptId}</b> · {active.ruleCount} rules{active.label ? ` · ${active.label}` : ''}
            </Alert>
          : !isEvolutio && <Alert severity="info">No active graph prompt — the chat uses its base prompts + P5 overlays. Apply below to make this graph live.</Alert>}

        {note && <Alert severity={note.sev} onClose={() => setNote(null)}>{note.text}</Alert>}

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={busy === 'validate' ? <CircularProgress size={13} /> : <ShieldCheck size={14} />} onClick={doValidate}>Validate</Button>
          <Button size="small" variant="outlined" startIcon={busy === 'compile' ? <CircularProgress size={13} /> : <FileText size={14} />} onClick={doCompile}>Preview prompt</Button>
          <Button size="small" variant="contained" color="success" startIcon={busy === 'apply' ? <CircularProgress size={13} /> : <Rocket size={14} />} onClick={doApply}>Apply live</Button>
          <Button size="small" variant="outlined" startIcon={busy === 'compare' ? <CircularProgress size={13} /> : <GitCompare size={14} />} onClick={doCompare} disabled={!entryId}>Compare versions</Button>
          <Button size="small" variant="outlined" startIcon={<Dumbbell size={14} />}
            href={entryId ? `/dialogue-gym/arena?promptEntry=${entryId}${version ? `&promptVersion=${version}` : ''}` : '/dialogue-gym/arena'}
            target="_blank" rel="noopener"
            title={entryId ? 'Evaluate this prompt version with simulated users in Dialogue Gym' : 'Save the graph first to test a specific version'}>
            Test in Dialogue Gym
          </Button>
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

        {/* HYB-011c — the compile preview: which language, how many tokens, and what
            the selected node contributed. The prompt is compiled per language (only
            the language instruction varies), so a preview that does not name its
            language is a preview of something in particular pretending to be general. */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <TextField
            select size="small" label="Preview language" value={lang}
            onChange={(e) => setLang(e.target.value)} sx={{ width: 150 }}
          >
            {LANGS.map(([code, label]) => <MenuItem key={code} value={code}>{label}</MenuItem>)}
          </TextField>
          {tokens && (
            <Tooltip title={tokens.exact
              ? `Counted by the provider's own tokenizer (${tokens.model}).`
              : (tokens.note || 'Estimated — no provider tokenizer available.')}>
              <Chip
                size="small"
                color={tokens.exact ? 'default' : 'warning'}
                variant="outlined"
                label={`${tokens.tokens} tokens${tokens.exact ? '' : ' (est.)'}`}
              />
            </Tooltip>
          )}
          {tokens && tokens.tokens < 4500 && isLiveForAgent && (
            <Tooltip title="Below the provider's minimum cacheable length (~4.5k measured on Haiku 4.5). The runtime pads the prefix up to it; a prompt this short is not itself the problem, but nothing under the floor is ever cached.">
              <Chip size="small" color="info" variant="outlined" label="under the cache floor" />
            </Tooltip>
          )}
        </Stack>

        {compiled && (
          <Accordion defaultExpanded disableGutters>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Typography variant="subtitle2">
                Compiled prompt{compiled.ruleCount != null ? ` · ${compiled.ruleCount} rules` : ''} · {lang}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode && contribution !== null && (
                contribution === ''
                  ? (
                    <Alert severity="warning" sx={{ mb: 1, py: 0 }}>
                      “{selectedNode.data?.title || selectedNode.id}” did not reach this prompt —
                      retired, filtered out, or not part of this language. Editing it will change nothing.
                    </Alert>
                  )
                  : (
                    <Paper variant="outlined" sx={{ p: 1, mb: 1, bgcolor: 'success.softBg' }}>
                      <Typography variant="caption" color="text.secondary">
                        What “{selectedNode.data?.title || selectedNode.id}” contributed
                      </Typography>
                      <Box component="pre" sx={{ m: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{contribution}</Box>
                    </Paper>
                  )
              )}
              <Box component="pre" sx={{ m: 0, p: 1, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: 'action.hover', borderRadius: 1, maxHeight: 260, overflow: 'auto' }}>{compiledText}</Box>
            </AccordionDetails>
          </Accordion>
        )}

        {compare && (
          <Accordion defaultExpanded disableGutters>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Typography variant="subtitle2">
                v{compare.from} → v{compare.to}
                {compare.tokensFrom != null && compare.tokensTo != null
                  ? ` · ${compare.tokensFrom} → ${compare.tokensTo} tokens`
                  : ''}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {/* What the operator edited… */}
                <Box>
                  {compare.nodes.added.map((n) => <Typography key={`a${n.id}`} variant="caption" color="success.main" sx={{ display: 'block' }}>+ {n.title}</Typography>)}
                  {compare.nodes.removed.map((n) => <Typography key={`r${n.id}`} variant="caption" color="error" sx={{ display: 'block' }}>− {n.title}</Typography>)}
                  {compare.nodes.changed.map((n) => <Typography key={`c${n.id}`} variant="caption" sx={{ display: 'block' }}>~ {n.title} ({n.fields.join(', ')})</Typography>)}
                  {!compare.nodes.added.length && !compare.nodes.removed.length && !compare.nodes.changed.length
                    && <Typography variant="caption" color="text.secondary">No node differences.</Typography>}
                </Box>
                <Divider flexItem />
                {/* …and what the MODEL receives, which is the answer that counts. */}
                {compare.lines.every((l) => l.type === 'same' || l.type === 'gap')
                  ? <Alert severity="info" sx={{ py: 0 }}>The compiled prompt is identical — this change does not reach the model.</Alert>
                  : (
                    <Box component="pre" sx={{ m: 0, p: 1, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: 'action.hover', borderRadius: 1, maxHeight: 300, overflow: 'auto' }}>
                      {compare.lines.map((l, i) => (
                        <Box
                          key={i}
                          component="span"
                          sx={{
                            display: 'block',
                            color: l.type === 'add' ? 'success.main' : l.type === 'del' ? 'error.main' : l.type === 'gap' ? 'text.disabled' : 'text.primary',
                          }}
                        >
                          {l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}{l.text}
                        </Box>
                      ))}
                    </Box>
                  )}
              </Stack>
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
