/**
 * PE-001 — the rule explorer.
 *
 * Twenty-two rules on a canvas of near-identical boxes is not a working instrument.
 * The operator arrives knowing a PHRASE ("something about escalation") or a KIND
 * ("the safety constraints") and has to find the rule that carries it; panning a
 * canvas to read each box in turn is the slowest possible way to do that.
 *
 * So: search over the text that actually compiles, filter by type / category /
 * status, and one click to select — the canvas, this list and the properties panel
 * all show the same selection, because they are three views of one store field.
 *
 * The search deliberately covers the COMPILED body, not just the title. A rule is
 * found by the words the model was given, which is what the operator remembers
 * reading in a transcript.
 */
import React, { useMemo, useState } from 'react';
import {
  Box, TextField, Stack, Typography, Chip, InputAdornment, IconButton, Tooltip,
  ToggleButton, ToggleButtonGroup, Collapse,
} from '@mui/material';
import { Search, X, Lock, Filter } from 'lucide-react';
import { useRulesStore, CATEGORIES } from './rulesStore';
import { useTourAnchor } from '@guided-ux/tour/react';

/** Order the bands appear in the compiled prompt — so the list reads like the prompt. */
const TYPE_ORDER = ['Narrative', 'Constraint', 'Persona', 'Thesis', 'ToolContract', 'Exemplar'];

const bodyOfNode = (d) => d.text || d.assertion || d.framing || d.register || d.rule || '';

function useFiltered(nodes, q, types, cats, status) {
  return useMemo(() => {
    const needle = q.trim().toLowerCase();
    return nodes.filter((n) => {
      const d = n.data || {};
      if (types.length && !types.includes(d.nodeType || 'Thesis')) return false;
      if (cats.length && !cats.includes(d.category || 'custom')) return false;
      if (status === 'immutable' && !d.immutable) return false;
      if (status === 'disabled' && d.enabled !== false) return false;
      if (status === 'enabled' && d.enabled === false) return false;
      if (!needle) return true;
      return [d.title, d.key, bodyOfNode(d), d.category]
        .some((s) => String(s || '').toLowerCase().includes(needle));
    });
  }, [nodes, q, types, cats, status]);
}

/** The matched fragment, in context — so a hit is legible without opening the rule. */
function Excerpt({ text, needle }) {
  if (!needle) return <>{text.slice(0, 90)}{text.length > 90 ? '…' : ''}</>;
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return <>{text.slice(0, 90)}{text.length > 90 ? '…' : ''}</>;
  const from = Math.max(0, i - 28);
  return (
    <>
      {from > 0 && '…'}
      {text.slice(from, i)}
      <Box component="span" sx={{ bgcolor: 'warning.light', color: 'warning.contrastText', borderRadius: 0.5, px: 0.25 }}>
        {text.slice(i, i + needle.length)}
      </Box>
      {text.slice(i + needle.length, i + needle.length + 42)}
      {text.length > i + needle.length + 42 && '…'}
    </>
  );
}

export default function RuleExplorer() {
  const rootRef = useTourAnchor('editor.explorer', {
    label: 'Rule explorer', route: '/flowdesk-admin/prompt',
  });
  const nodes = useRulesStore((s) => s.nodes);
  const selectedId = useRulesStore((s) => s.selectedId);
  const setSelected = useRulesStore((s) => s.setSelected);

  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [cats, setCats] = useState([]);
  const [status, setStatus] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useFiltered(nodes, q, types, cats, status);
  const grouped = useMemo(() => {
    const by = new Map();
    for (const n of filtered) {
      const t = (n.data && n.data.nodeType) || 'Rule';
      if (!by.has(t)) by.set(t, []);
      by.get(t).push(n);
    }
    // Inside a band the compiler orders by priority, so the list does too.
    for (const list of by.values()) list.sort((a, b) => (a.data?.priority ?? 100) - (b.data?.priority ?? 100));
    return [...by.entries()].sort(
      (a, b) => (TYPE_ORDER.indexOf(a[0]) + 1 || 99) - (TYPE_ORDER.indexOf(b[0]) + 1 || 99),
    );
  }, [filtered]);

  const usedCats = useMemo(
    () => [...new Set(nodes.map((n) => n.data?.category).filter(Boolean))].sort(),
    [nodes],
  );
  const usedTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.data?.nodeType).filter(Boolean))]
      .sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99)),
    [nodes],
  );

  const toggle = (list, setList) => (v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const filtering = !!q || types.length || cats.length || status !== 'all';

  return (
    <Box ref={rootRef} sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1, pb: 0.5 }}>
        <TextField
          size="small" fullWidth placeholder="Search rules…" value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
            endAdornment: (
              <InputAdornment position="end">
                {q && <IconButton size="small" onClick={() => setQ('')}><X size={13} /></IconButton>}
                <Tooltip title="Filters">
                  <IconButton size="small" aria-label="Filters" onClick={() => setFiltersOpen((v) => !v)}
                    color={types.length || cats.length || status !== 'all' ? 'primary' : 'default'}>
                    <Filter size={13} />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <Collapse in={filtersOpen}>
          <Box sx={{ pt: 1 }}>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
              {usedTypes.map((t) => (
                <Chip key={t} size="small" label={t} variant={types.includes(t) ? 'filled' : 'outlined'}
                  color={types.includes(t) ? 'primary' : 'default'} onClick={() => toggle(types, setTypes)(t)} />
              ))}
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
              {(usedCats.length ? usedCats : CATEGORIES).map((c) => (
                <Chip key={c} size="small" label={c} variant={cats.includes(c) ? 'filled' : 'outlined'}
                  color={cats.includes(c) ? 'secondary' : 'default'} onClick={() => toggle(cats, setCats)(c)} />
              ))}
            </Stack>
            <ToggleButtonGroup size="small" exclusive value={status}
              onChange={(_, v) => setStatus(v || 'all')} sx={{ '& .MuiToggleButton-root': { py: 0.15, px: 1, textTransform: 'none' } }}>
              <ToggleButton value="all">all</ToggleButton>
              <ToggleButton value="enabled">enabled</ToggleButton>
              <ToggleButton value="disabled">disabled</ToggleButton>
              <ToggleButton value="immutable">immutable</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Collapse>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {filtering ? `${filtered.length} of ${nodes.length} shown` : `${nodes.length} rules`}
          </Typography>
          {filtering && (
            <Chip size="small" variant="outlined" label="clear"
              onClick={() => { setQ(''); setTypes([]); setCats([]); setStatus('all'); }} />
          )}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, px: 0.5, pb: 1 }}>
        {!filtered.length && (
          <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
            Nothing matches. The search covers the rule text the model is given, its title and its category.
          </Typography>
        )}
        {grouped.map(([type, list]) => (
          <Box key={type} sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ px: 1, color: 'text.secondary', fontWeight: 600 }}>
              {type} · {list.length}
            </Typography>
            {list.map((n) => {
              const d = n.data || {};
              const isSel = n.id === selectedId;
              return (
                <Box key={n.id} onClick={() => setSelected(n.id)}
                  sx={{
                    px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer',
                    bgcolor: isSel ? 'action.selected' : 'transparent',
                    boxShadow: isSel ? (t) => `inset 3px 0 0 ${t.palette.primary.main}` : 'none',
                    '&:hover': { bgcolor: isSel ? 'action.selected' : 'action.hover' },
                  }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: isSel ? 600 : 400 }}>
                      {d.title || d.key || n.id}
                    </Typography>
                    {d.immutable && (
                      <Tooltip title="immutable constraint"><Box component="span" sx={{ display: 'flex', color: 'warning.main' }}><Lock size={11} /></Box></Tooltip>
                    )}
                    {d.enabled === false && <Chip size="small" variant="outlined" label="off" sx={{ height: 16, fontSize: 10 }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                    <Excerpt text={bodyOfNode(d)} needle={q.trim()} />
                  </Typography>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
