import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Select, MenuItem, Button, Chip, FormControl, InputLabel,
  List, ListItem, ListItemText, Alert, CircularProgress, LinearProgress, Divider, Stack, Tooltip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import { listGraphs, getGraphById } from '../services/graphCatalog.service';
import { verifyGraph } from '../services/gxe.service';

const GRADE_COLORS = { A: '#2e7d32', B: '#689f38', C: '#f9a825', D: '#ef6c00', F: '#c62828' };
const DIMENSION_LABELS = {
  structure: 'Structure', executors: 'Executors', templates: 'Templates',
  branches: 'Branches', dynamicTemplates: 'Dynamic (mock)', soundness: 'Soundness (Petri)',
};

function GradeBadge({ grade }) {
  const color = GRADE_COLORS[grade] || '#757575';
  return (
    <Box sx={{
      width: 64, height: 64, borderRadius: 2, bgcolor: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 34, fontWeight: 700, boxShadow: 2,
    }}>{grade || '?'}</Box>
  );
}

function LevelChip({ name, level }) {
  let icon, color, label;
  if (!level) { return null; }
  if (level.skipped) { icon = <RemoveCircleOutlineIcon fontSize="small" />; color = 'default'; label = `${name}: skipped`; }
  else if (level.pass) { icon = <CheckCircleIcon fontSize="small" />; color = 'success'; label = `${name}: pass`; }
  else { icon = <ErrorIcon fontSize="small" />; color = 'error'; label = `${name}: fail`; }
  const tip = level.reason ? `${label} (${level.reason})` : label;
  return <Tooltip title={tip}><Chip size="small" icon={icon} color={color} label={label} variant="outlined" /></Tooltip>;
}

function IssueIcon({ severity }) {
  if (severity === 'error') return <ErrorIcon color="error" fontSize="small" />;
  return <WarningAmberIcon sx={{ color: 'warning.main' }} fontSize="small" />;
}

export default function GraphVerifierPage() {
  const [graphs, setGraphs] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listGraphs({ limit: 200 });
        const items = res?.data || res?.graphs || res || [];
        setGraphs(Array.isArray(items) ? items : []);
      } catch (e) {
        setError(`Failed to load catalog: ${e.message}`);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const runVerify = async () => {
    if (!selectedId) return;
    setVerifying(true); setError(null); setResult(null);
    try {
      const graph = await getGraphById(selectedId);
      const g = graph?.data || graph;
      const res = await verifyGraph({ nodes: g.nodes || [], edges: g.edges || [], processIR: g.processIR });
      setResult(res);
    } catch (e) {
      setError(`Verification failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const errors = (result?.issues || []).filter(i => i.severity === 'error');
  const warnings = (result?.issues || []).filter(i => i.severity === 'warning');

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>Graph Verifier</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Runs the full ExecutableGraphVerifier stack — L1 (structure + executor existence), L2
        (branch discipline + template refs), L2.5 (mock dry-run), L3 (Petri soundness) — and grades A–F.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 320 }} disabled={loadingList}>
            <InputLabel>Catalog graph</InputLabel>
            <Select label="Catalog graph" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {graphs.map((g) => (
                <MenuItem key={g.id || g.entryId} value={g.id || g.entryId}>
                  {g.name} {g.namespace ? `· ${g.namespace}` : ''} {g.type ? `(${g.type})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained" startIcon={verifying ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
            disabled={!selectedId || verifying} onClick={runVerify}
          >Verify</Button>
          {loadingList && <CircularProgress size={20} />}
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
            <GradeBadge grade={result.grade} />
            <Box>
              <Chip
                label={result.pass ? 'PASS' : 'FAIL'}
                color={result.pass ? 'success' : 'error'}
                sx={{ fontWeight: 700, mb: 0.5 }}
              />
              <Typography variant="body2" color="text.secondary">
                Weighted score: {(result.score ?? 0).toFixed(3)} · {errors.length} errors · {warnings.length} warnings
              </Typography>
            </Box>
          </Stack>

          <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Levels</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <LevelChip name="L1" level={result.levels?.l1} />
            <LevelChip name="L2" level={result.levels?.l2} />
            <LevelChip name="L2.5" level={result.levels?.l2_5} />
            <LevelChip name="L3" level={result.levels?.l3} />
          </Stack>

          {result.scores && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Dimension scores</Typography>
              {Object.entries(result.scores).map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ width: 140 }}>{DIMENSION_LABELS[k] || k}</Typography>
                  <LinearProgress variant="determinate" value={Math.round((v ?? 0) * 100)}
                    sx={{ flex: 1, height: 8, borderRadius: 1 }}
                    color={v >= 0.85 ? 'success' : v >= 0.5 ? 'warning' : 'error'} />
                  <Typography variant="caption" sx={{ width: 40, textAlign: 'right' }}>{Math.round((v ?? 0) * 100)}%</Typography>
                </Box>
              ))}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Issues {result.issues?.length ? `(${result.issues.length})` : ''}
          </Typography>
          {(!result.issues || result.issues.length === 0) ? (
            <Alert severity="success" variant="outlined">No issues — the graph passed every active check.</Alert>
          ) : (
            <List dense>
              {[...errors, ...warnings].map((issue, i) => (
                <ListItem key={i} alignItems="flex-start" sx={{ py: 0.5 }}>
                  <Box sx={{ mr: 1, mt: 0.4 }}><IssueIcon severity={issue.severity} /></Box>
                  <ListItemText
                    primary={
                      <span>
                        <Chip size="small" label={issue.code} sx={{ mr: 1, height: 20 }} />
                        {issue.message}{issue.nodeId ? ` [${issue.nodeId}]` : ''}
                      </span>
                    }
                    secondary={issue.suggestion ? `→ ${issue.suggestion}` : null}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      )}
    </Box>
  );
}
