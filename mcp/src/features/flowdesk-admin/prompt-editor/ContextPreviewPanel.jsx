/**
 * EC-011 — the prompt as the model will actually receive it, in a chosen context.
 *
 * Conditions turned one prompt into nine, and until this panel existed an operator
 * could write one and have no way to see its effect: the compile preview always
 * showed the unconditional prompt, and reported — convincingly, in a green box —
 * that nothing had been excluded.
 *
 * NINE CONTEXTS, NOT FOUR DROPDOWNS. The same list the coverage report uses, derived
 * from `computePhase`. Four independent dropdowns would let the operator assemble
 * `fill + no_draft` — a turn that cannot occur — and then tune the prompt for it.
 *
 * COMPARE IS THE POINT. "What does the model see while filling the form" is the
 * question people ask; "what is DIFFERENT between filling and confirming" is the
 * question they actually need answered, and holding two prompts in your head to
 * answer it is how differences get missed. Rules that differ sort to the top.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, MenuItem, TextField, Chip, Alert, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, Button, Tooltip, Switch,
  FormControlLabel,
} from '@mui/material';
import { useRulesStore } from './rulesStore';
import { promptPreview } from '../api/adminClient';
import { Loading } from '../components/common';

/** Why a rule is not in this prompt, in words rather than a code. */
const REASON = {
  condition: 'its condition does not hold here',
  status: 'it is not active',
  engine_node: 'it is scoped to another part of the assistant',
  unknown: 'reason not recorded',
};

const STATE_COLOR = { in: 'success', out: 'default', unknown: 'warning' };

export default function ContextPreviewPanel() {
  const nodes = useRulesStore((s) => s.nodes);
  const edges = useRulesStore((s) => s.edges);
  const isEvolutio = useRulesStore((s) => s.isEvolutio);
  const toGraph = useRulesStore((s) => s.toGraph);

  const [names, setNames] = useState([]);
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [comparing, setComparing] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const contexts = comparing && secondary ? [primary, secondary] : [primary];

  // The list of contexts comes back with the first preview rather than from a second
  // endpoint — it is the same nine every time, and one round trip is enough.
  const run = async () => {
    if (!primary) return;
    setBusy(true); setErr(null);
    try {
      setData(await promptPreview({ graph: toGraph(), contexts, source: 'agent' }));
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    // Seeded from the coverage vocabulary the API serves with the first call.
    if (!primary && names.length) setPrimary(names[0]);
  }, [names, primary]);

  useEffect(() => {
    let live = true;
    if (!isEvolutio) return undefined;
    promptPreview({ graph: toGraph(), source: 'agent' })
      .then((d) => {
        if (!live) return;
        setData(d);
        // Every context the API knows about, taken from what it returns.
        if (d && d.allContexts) setNames(d.allContexts);
      })
      .catch((e) => { if (live) setErr(e.message || String(e)); });
    return () => { live = false; };
  }, [isEvolutio]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isEvolutio) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Contexts apply to the agent&apos;s prompt graph. The state-machine graph compiles
          once per chat node instead — see Scope.
        </Typography>
      </Box>
    );
  }

  const cols = (data && data.contexts) || [];

  return (
    <Box sx={{ p: 1.5, height: '100%', overflow: 'auto' }}>
      <Stack spacing={1}>
        <Typography variant="subtitle2">What the model is given</Typography>

        <TextField select size="small" label="Context" value={primary}
          onChange={(e) => setPrimary(e.target.value)}>
          {names.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>

        <FormControlLabel
          control={<Switch size="small" checked={comparing} onChange={(e) => setComparing(e.target.checked)} />}
          label={<Typography variant="caption">Compare with another context</Typography>} />

        {comparing && (
          <TextField select size="small" label="…and" value={secondary}
            onChange={(e) => setSecondary(e.target.value)}>
            {names.filter((n) => n !== primary).map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
        )}

        <Button size="small" variant="contained" onClick={run} disabled={busy || !primary}>
          {busy ? 'Compiling…' : 'Show'}
        </Button>

        {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
        {busy && <Loading />}

        {cols.map((c) => (
          <Box key={c.name}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{c.name}</Typography>
            {c.error ? (
              // A context the graph will not compile in is the finding, not an empty
              // panel: a live turn in that branch would fail outright.
              <Alert severity="error" sx={{ mt: 0.5, py: 0 }}>{c.error}</Alert>
            ) : (
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip size="small" variant="outlined" label={`${c.included.length} rules`} />
                <Tooltip title="Identical across contexts, so the provider can cache it.">
                  <Chip size="small" variant="outlined" label={`core ${c.layers?.coreTokens ?? '—'}`} />
                </Tooltip>
                <Tooltip title="Re-sent and re-charged every turn — conditional text sits after the cached prefix.">
                  <Chip size="small" color={c.layers?.conditionalTokens ? 'warning' : 'default'}
                    variant="outlined" label={`conditional ${c.layers?.conditionalTokens ?? 0}`} />
                </Tooltip>
                {c.excluded.length > 0 && (
                  <Chip size="small" variant="outlined" label={`${c.excluded.length} left out`} />
                )}
              </Stack>
            )}
          </Box>
        ))}

        {data && data.rules && data.rules.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {cols.length > 1
                ? 'Rules that differ between the two contexts are listed first.'
                : 'Every rule, and whether it reaches this context.'}
            </Typography>
            <Table size="small" sx={{ '& td, & th': { px: 0.5, py: 0.25 } }}>
              <TableHead>
                <TableRow>
                  <TableCell><Typography variant="caption">Rule</Typography></TableCell>
                  {cols.map((c) => (
                    <TableCell key={c.name} align="center">
                      <Typography variant="caption">{c.phase}</Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rules.map((r) => (
                  <TableRow key={r.nodeId} hover>
                    <TableCell>
                      <Typography variant="caption">{r.title}</Typography>
                    </TableCell>
                    {r.cells.map((cell, i) => (
                      <TableCell key={i} align="center">
                        {cell.state === 'in' ? (
                          <Chip size="small" color="success" variant="outlined" label="in"
                            sx={{ height: 18, fontSize: 10 }} />
                        ) : (
                          <Tooltip title={REASON[cell.reason] || REASON.unknown}>
                            <Chip size="small" color={STATE_COLOR[cell.state]} variant="outlined"
                              label="out" sx={{ height: 18, fontSize: 10 }} />
                          </Tooltip>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {cols.length === 1 && cols[0] && !cols[0].error && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">The compiled prompt</Typography>
            <Box component="pre" sx={{
              fontSize: 11, whiteSpace: 'pre-wrap', bgcolor: 'action.hover',
              p: 1, borderRadius: 1, maxHeight: 320, overflow: 'auto', m: 0,
            }}>{cols[0].text}</Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
