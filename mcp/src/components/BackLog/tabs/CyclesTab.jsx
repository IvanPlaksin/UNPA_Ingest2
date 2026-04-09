/**
 * CyclesTab — Shows execution cycles (iterations) with plan, memory, review for each.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Stack, Button,
  Accordion, AccordionSummary, AccordionDetails, LinearProgress,
  CircularProgress, Alert, Divider, List, ListItem, ListItemIcon,
  ListItemText, TextField
} from '@mui/material';
import {
  ExpandMore, PlayArrow, CheckCircle, Cancel, Schedule,
  Memory, Article, RateReview, Replay, ThumbUp, ThumbDown
} from '@mui/icons-material';
import api from '../../../services/api';

const PHASE_COLORS = {
  PLANNING: '#1976d2',
  AWAITING_APPROVAL: '#ed6c02',
  EXECUTING: '#2e7d32',
  REVIEW: '#7b1fa2',
  AWAITING_RETURN: '#d32f2f',
  COMPLETED: '#2e7d32',
  REJECTED: '#d32f2f'
};

const ENTRY_ICONS = {
  DECISION: <Article fontSize="small" color="primary" />,
  FINDING: <Memory fontSize="small" color="info" />,
  STEP: <PlayArrow fontSize="small" color="success" />,
  ERROR: <Cancel fontSize="small" color="error" />,
  NOTE: <Schedule fontSize="small" color="action" />
};

export default function CyclesTab({ backlogId, onRefresh }) {
  const [cycles, setCycles] = useState([]);
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState('PLANNING');

  const fetchCycles = useCallback(async () => {
    try {
      const res = await api.get(`/backlog/items/${backlogId}/cycles`);
      setCycles(res.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [backlogId]);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  const loadDetail = async (cycleId) => {
    if (details[cycleId]) return;
    try {
      const res = await api.get(`/backlog/cycles/${cycleId}`);
      setDetails(prev => ({ ...prev, [cycleId]: res.data?.data }));
    } catch (err) {
      console.error(err);
    }
  };

  const startCycle = async () => {
    setStarting(true);
    try {
      await api.post(`/backlog/items/${backlogId}/cycles`, { mode });
      fetchCycles();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setStarting(false);
    }
  };

  const approvePlan = async (cycleId) => {
    try {
      await api.post(`/backlog/cycles/${cycleId}/plan/approve`);
      setDetails(prev => { const n = { ...prev }; delete n[cycleId]; return n; });
      fetchCycles();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  const returnToWork = async (cycleId) => {
    try {
      await api.post(`/backlog/cycles/${cycleId}/return`);
      fetchCycles();
      if (onRefresh) onRefresh();
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  if (loading) return <Box sx={{ p: 2 }}><CircularProgress size={24} /></Box>;

  return (
    <Box sx={{ p: 2 }}>
      {/* Start new cycle */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Chip
          label="PLANNING" size="small" variant={mode === 'PLANNING' ? 'filled' : 'outlined'}
          onClick={() => setMode('PLANNING')} color="primary"
        />
        <Chip
          label="AUTONOMOUS" size="small" variant={mode === 'AUTONOMOUS' ? 'filled' : 'outlined'}
          onClick={() => setMode('AUTONOMOUS')} color="warning"
        />
        <Button variant="contained" size="small" startIcon={starting ? <CircularProgress size={14} color="inherit" /> : <PlayArrow />}
          onClick={startCycle} disabled={starting}>
          Start Cycle
        </Button>
      </Stack>

      {cycles.length === 0 && (
        <Typography variant="body2" color="text.disabled">No execution cycles yet.</Typography>
      )}

      {/* Cycles list (newest first) */}
      {[...cycles].reverse().map((cycle) => (
        <Accordion key={cycle.id} onChange={() => loadDetail(cycle.id)}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
              <Chip label={`Iteration ${cycle.iteration}`} size="small" variant="outlined" />
              <Chip label={cycle.mode} size="small"
                sx={{ bgcolor: cycle.mode === 'AUTONOMOUS' ? '#ed6c0222' : '#1976d222', fontSize: 10 }} />
              <Chip label={cycle.phase} size="small"
                sx={{ bgcolor: (PHASE_COLORS[cycle.phase] || '#555') + '22', color: PHASE_COLORS[cycle.phase], fontWeight: 700, fontSize: 10 }} />
              <Box sx={{ flex: 1 }} />
              {cycle.memoryCount > 0 && <Chip label={`${cycle.memoryCount} notes`} size="small" variant="outlined" sx={{ fontSize: 10 }} />}
              {cycle.planStatus && <Chip label={`Plan: ${cycle.planStatus}`} size="small" variant="outlined" sx={{ fontSize: 10 }} />}
              {cycle.reviewVerdict && <Chip
                label={cycle.reviewVerdict}
                size="small"
                icon={cycle.reviewVerdict === 'APPROVED' ? <ThumbUp sx={{ fontSize: 12 }} /> : <ThumbDown sx={{ fontSize: 12 }} />}
                color={cycle.reviewVerdict === 'APPROVED' ? 'success' : 'error'}
                sx={{ fontSize: 10 }}
              />}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <CycleDetail
              detail={details[cycle.id]}
              cycle={cycle}
              onApprovePlan={() => approvePlan(cycle.id)}
              onReturn={() => returnToWork(cycle.id)}
              onTransition={async (cId, phase) => {
                try {
                  await api.post(`/backlog/cycles/${cId}/transition`, { phase });
                  setDetails(prev => { const n = { ...prev }; delete n[cId]; return n; });
                  fetchCycles();
                } catch (err) { alert(err.response?.data?.error || err.message); }
              }}
              onTriggerAiReview={async (cId) => {
                try {
                  const res = await api.post(`/backlog/cycles/${cId}/ai-review`);
                  setDetails(prev => { const n = { ...prev }; delete n[cId]; return n; });
                  fetchCycles();
                  if (res.data?.data?.review) {
                    alert(`AI Review: ${res.data.data.review.verdict}`);
                  }
                } catch (err) { alert(err.response?.data?.error || err.message); }
              }}
            />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

function CycleDetail({ detail, cycle, onApprovePlan, onReturn, onTransition, onTriggerAiReview }) {
  if (!detail) return <CircularProgress size={20} />;

  const { memory, plan, review } = detail;

  return (
    <Box>
      {/* Plan */}
      {plan && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Plan</Typography>
          <Card variant="outlined">
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              {plan.rationale && (
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  {plan.rationale}
                </Typography>
              )}
              <List dense disablePadding>
                {(plan.steps || []).map((step, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <Typography variant="caption" fontWeight={700}>{step.order || i + 1}.</Typography>
                    </ListItemIcon>
                    <ListItemText primary={step.description} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip label={`Status: ${plan.status}`} size="small" variant="outlined" />
                {plan.status === 'DRAFT' && cycle.phase === 'AWAITING_APPROVAL' && (
                  <Button size="small" variant="contained" color="success" onClick={onApprovePlan}>
                    Approve Plan
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Agent Memory */}
      {memory && memory.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Agent Memory ({memory.length})</Typography>
          <List dense>
            {memory.map((entry, i) => (
              <ListItem key={i} disableGutters sx={{ alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                  {ENTRY_ICONS[entry.entryType] || ENTRY_ICONS.NOTE}
                </ListItemIcon>
                <ListItemText
                  primary={entry.content}
                  secondary={entry.reasoning ? `Reasoning: ${entry.reasoning}` : null}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <Chip label={entry.entryType} size="small" sx={{ fontSize: 9, height: 18, ml: 1 }} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Review */}
      {review && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Review</Typography>
          <Card variant="outlined" sx={{
            borderColor: review.verdict === 'APPROVED' ? 'success.main' : 'error.main',
            borderWidth: 2
          }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Chip
                label={review.verdict}
                size="small"
                color={review.verdict === 'APPROVED' ? 'success' : 'error'}
                sx={{ mb: 1 }}
              />
              {review.summary && (
                <Typography variant="body2" sx={{ mb: 1 }}>{review.summary}</Typography>
              )}
              {review.strengths?.length > 0 && (
                <Box sx={{ mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={700} color="success.main">Strengths:</Typography>
                  {review.strengths.map((s, i) => (
                    <Typography key={i} variant="caption" display="block" sx={{ pl: 1 }}>+ {s}</Typography>
                  ))}
                </Box>
              )}
              {review.weaknesses?.length > 0 && (
                <Box sx={{ mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={700} color="error.main">Weaknesses:</Typography>
                  {review.weaknesses.map((w, i) => (
                    <Typography key={i} variant="caption" display="block" sx={{ pl: 1 }}>- {w}</Typography>
                  ))}
                </Box>
              )}
              {review.recommendations?.length > 0 && (
                <Box>
                  <Typography variant="caption" fontWeight={700} color="info.main">Recommendations:</Typography>
                  {review.recommendations.map((r, i) => (
                    <Typography key={i} variant="caption" display="block" sx={{ pl: 1 }}>* {r}</Typography>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
          {cycle.phase === 'AWAITING_RETURN' && (
            <Button variant="contained" color="warning" size="small" startIcon={<Replay />} onClick={onReturn} sx={{ mt: 1 }}>
              Return to Work
            </Button>
          )}
        </Box>
      )}

      {!plan && !memory?.length && !review && (
        <Typography variant="body2" color="text.disabled">No details yet for this cycle.</Typography>
      )}

      {/* Phase Action Buttons */}
      {cycle.phase === 'EXECUTING' && (
        <Divider sx={{ my: 1 }} />
      )}
      {cycle.phase === 'EXECUTING' && (
        <Button variant="contained" color="secondary" size="small" startIcon={<RateReview />}
          onClick={() => onTransition && onTransition(cycle.id, 'REVIEW')}>
          Submit for Review
        </Button>
      )}
      {cycle.phase === 'REVIEW' && !review && (
        <Box sx={{ mt: 1 }}>
          <Divider sx={{ mb: 1 }} />
          <Button variant="contained" color="info" size="small" startIcon={<RateReview />}
            onClick={() => onTriggerAiReview && onTriggerAiReview(cycle.id)}>
            Run AI Review
          </Button>
        </Box>
      )}
    </Box>
  );
}
