/**
 * RankingPanel — AI-powered backlog ranking with namespace grouping and detailed rationale.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Chip, LinearProgress,
  CircularProgress, Divider, Stack, Alert, Collapse, IconButton
} from '@mui/material';
import { AutoAwesome, PlaylistPlay, Refresh, Save, ExpandMore, ExpandLess } from '@mui/icons-material';
import api from '../../services/api';

const PRIORITY_COLORS = {
  P0_CRITICAL: '#d32f2f', P1_HIGH: '#f57c00', P2_MEDIUM: '#1976d2', P3_LOW: '#757575'
};
const NS_COLORS = {
  CORE: '#1976d2', CODEX: '#7b1fa2', GXE: '#00796b', FLOWDESK: '#f57c00'
};

function scoreColor(score) {
  if (score > 0.7) return 'success';
  if (score > 0.4) return 'warning';
  return 'error';
}
function scoreHex(score) {
  if (score > 0.7) return '#2e7d32';
  if (score > 0.4) return '#ed6c02';
  return '#d32f2f';
}

function TaskCard({ item, idx }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
          <Typography variant="body2" sx={{ fontWeight: 800, color: scoreHex(item.score ?? 0), minWidth: 28 }}>
            #{idx + 1}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>{item.title}</Typography>
          <Chip label={item.backlogId} size="small" variant="outlined" sx={{ fontSize: 12, height: 20 }} />
          <Chip label={item.priority} size="small" sx={{
            fontSize: 12, height: 20,
            bgcolor: (PRIORITY_COLORS[item.priority] || '#555') + '22',
            color: PRIORITY_COLORS[item.priority] || '#555', fontWeight: 700
          }} />
          {item.effort && <Chip label={item.effort} size="small" variant="outlined" sx={{ fontSize: 12, height: 20 }} />}
          <Chip label={item.namespace || 'CORE'} size="small" sx={{
            fontSize: 12, height: 20,
            bgcolor: (NS_COLORS[item.namespace] || '#555') + '22',
            color: NS_COLORS[item.namespace] || '#555', fontWeight: 600
          }} />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <LinearProgress variant="determinate" value={(item.score ?? 0) * 100} color={scoreColor(item.score ?? 0)} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
            {((item.score ?? 0) * 100).toFixed(0)}%
          </Typography>
        </Stack>
        {item.rationale && (
          <Stack direction="row" alignItems="center" sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{item.rationale}</Typography>
            <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ ml: 0.5 }}>
              {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          </Stack>
        )}
        <Collapse in={expanded}>
          <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.6 }}>
              {item.detailedRationale || 'No detailed rationale available.'}
            </Typography>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

function NamespaceSection({ namespace, tasks }) {
  const color = NS_COLORS[namespace] || '#555';
  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip label={namespace} size="small" sx={{ bgcolor: color + '22', color, fontWeight: 700 }} />
        <Typography variant="caption" color="text.secondary">{tasks.length} tasks</Typography>
      </Stack>
      <Stack spacing={1}>
        {tasks.map((item, idx) => <TaskCard key={item.backlogId} item={item} idx={idx} />)}
      </Stack>
    </Box>
  );
}

export default function RankingPanel() {
  const [grouped, setGrouped] = useState({});
  const [plan, setPlan] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

  const fetchRanked = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rankedRes, planRes] = await Promise.all([
        api.get('/backlog/ranked-by-namespace'),
        api.get('/backlog/execution-plan')
      ]);
      setGrouped(rankedRes.data?.data || {});
      setPlan(planRes.data?.data || null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRanked(); }, [fetchRanked]);

  const runAnalysis = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await api.post('/backlog/analyze');
      setAiResult(res.data?.data || res.data);
    } catch (err) {
      setAiResult({ error: err.response?.data?.error || err.message });
    } finally {
      setAiLoading(false);
    }
  };

  const saveRankings = async () => {
    setSaveMsg('');
    try {
      const res = await api.post('/backlog/rank/save');
      const d = res.data?.data || {};
      setSaveMsg(`Saved ${d.saved}/${d.total} rankings to KB`);
    } catch (err) {
      setSaveMsg('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const totalTasks = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">BackLog Ranking</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" startIcon={<Refresh />} onClick={fetchRanked}>Refresh</Button>
          <Button variant="outlined" size="small" startIcon={<Save />} onClick={saveRankings}>Save to KB</Button>
          <Button variant="contained" size="small"
            startIcon={aiLoading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesome />}
            onClick={runAnalysis} disabled={aiLoading}>
            AI Analysis
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {saveMsg && <Alert severity={saveMsg.startsWith('Error') ? 'error' : 'success'} sx={{ mb: 2 }} onClose={() => setSaveMsg('')}>{saveMsg}</Alert>}

      {/* Namespace-grouped ranked tasks */}
      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
        Ranked Tasks ({totalTasks}) — grouped by namespace
      </Typography>

      {Object.keys(grouped).length === 0 && (
        <Typography variant="body2" color="text.disabled">No ranked items available.</Typography>
      )}

      {Object.entries(grouped).map(([ns, tasks]) => (
        <NamespaceSection key={ns} namespace={ns} tasks={tasks} />
      ))}

      {/* AI Analysis */}
      {(aiLoading || aiResult) && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>AI Analysis</Typography>
          {aiLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Analyzing backlog...</Typography>
            </Box>
          )}
          {aiResult && !aiLoading && (
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                {aiResult.error ? (
                  <Alert severity="error">{aiResult.error}</Alert>
                ) : (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {typeof aiResult === 'string' ? aiResult : aiResult.analysis || JSON.stringify(aiResult, null, 2)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Execution Plan */}
      {plan && Array.isArray(plan) && plan.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }} />
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <PlaylistPlay fontSize="small" color="action" />
            <Typography variant="subtitle2" color="text.secondary">Execution Plan</Typography>
          </Stack>
          <Stack spacing={1.5}>
            {plan.map((batch, bIdx) => (
              <Card key={bIdx} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.75, display: 'block' }}>
                    Batch {batch.batch || bIdx + 1} {batch.note ? `— ${batch.note}` : ''}
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(batch.tasks || []).map((task, tIdx) => (
                      <Chip key={tIdx} label={task} size="small" variant="outlined" sx={{ fontSize: 13 }} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
