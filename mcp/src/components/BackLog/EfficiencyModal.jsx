/**
 * EfficiencyModal — Shows efficiency analysis results for a backlog task.
 * Displays: overall score gauge, metrics breakdown, recommendations list.
 * "Create Optimization Task" button at the bottom.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Stack,
  Alert,
  LinearProgress,
  Divider
} from '@mui/material';
import {
  Close,
  TipsAndUpdates,
  Speed,
  AddTask,
  CheckCircleOutline,
  WarningAmber,
  ErrorOutline
} from '@mui/icons-material';
import api from '../../services/api';

const SCORE_COLOR = (score) => {
  if (score >= 80) return '#2e7d32';
  if (score >= 60) return '#f57c00';
  if (score >= 40) return '#ed6c02';
  return '#d32f2f';
};

const SEVERITY_ICON = {
  high: <ErrorOutline fontSize="small" color="error" />,
  medium: <WarningAmber fontSize="small" color="warning" />,
  low: <TipsAndUpdates fontSize="small" color="info" />
};

function ScoreGauge({ score, size = 100 }) {
  const color = SCORE_COLOR(score);
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      {/* Background circle */}
      <CircularProgress
        variant="determinate"
        value={100}
        size={size}
        thickness={4}
        sx={{ color: 'action.disabledBackground', position: 'absolute' }}
      />
      {/* Score circle */}
      <CircularProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, score))}
        size={size}
        thickness={4}
        sx={{ color }}
      />
      <Box
        sx={{
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 700, color, lineHeight: 1 }}>
          {Math.round(score)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          / 100
        </Typography>
      </Box>
    </Box>
  );
}

function MetricRow({ label, value, maxValue = 100 }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const color = SCORE_COLOR(pct);
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, color }}>
          {typeof value === 'number' ? value.toFixed(1) : value}
          {maxValue !== 100 ? ` / ${maxValue}` : '%'}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, pct))}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: 'action.disabledBackground',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 }
        }}
      />
    </Box>
  );
}

export default function EfficiencyModal({ open, onClose, item }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (open && item?.backlogId) {
      runAnalysis();
    }
    // Reset state on close
    if (!open) {
      setAnalysis(null);
      setError('');
      setCreated(false);
    }
  }, [open, item?.backlogId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/efficiency/${item.backlogId}/analyze`);
      const data = res.data?.data || res.data || {};
      setAnalysis(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOptimizationTask = async () => {
    setCreating(true);
    try {
      await api.post('/backlog/items', {
        title: `Optimize: ${item.title} (efficiency score: ${Math.round(analysis.overallScore || 0)})`,
        description: [
          `Optimization task auto-created from efficiency analysis of ${item.backlogId}.`,
          '',
          'Recommendations:',
          ...(analysis.recommendations || []).map((r, i) => `${i + 1}. ${r.title || r.text || r}`)
        ].join('\n'),
        taskType: 'REFACTOR',
        targetType: item.targetType || 'SERVICE',
        targetPath: item.targetPath || '',
        priority: analysis.overallScore < 40 ? 'P1_HIGH' : 'P2_MEDIUM',
        effort: 'M',
        acceptanceCriteria: ['Efficiency score improved above current baseline'],
        tags: ['optimization', 'auto-generated'],
        relatedCodexRules: [],
        createdBy: 'efficiency-analyzer'
      });
      setCreated(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCreating(false);
    }
  };

  const metrics = analysis?.metrics || analysis?.breakdown || {};
  const recommendations = analysis?.recommendations || [];
  const overallScore = analysis?.overallScore ?? analysis?.score ?? 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Speed color="primary" />
          <Typography variant="h6" component="span">Efficiency Analysis</Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Analyzing {item?.backlogId}...
            </Typography>
          </Box>
        )}

        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {analysis && !loading && (
          <Stack spacing={2.5}>
            {/* Task info */}
            <Box>
              <Typography variant="caption" color="text.secondary">Task</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {item?.backlogId} - {item?.title}
              </Typography>
            </Box>

            {/* Overall Score Gauge */}
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
              <ScoreGauge score={overallScore} size={120} />
            </Box>

            <Typography
              variant="subtitle2"
              sx={{ textAlign: 'center', color: SCORE_COLOR(overallScore), fontWeight: 700 }}
            >
              {overallScore >= 80 ? 'Excellent' :
               overallScore >= 60 ? 'Good' :
               overallScore >= 40 ? 'Needs Improvement' : 'Poor'}
            </Typography>

            <Divider />

            {/* Metrics Breakdown */}
            {Object.keys(metrics).length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Metrics Breakdown
                </Typography>
                {Object.entries(metrics).map(([key, val]) => {
                  const value = typeof val === 'object' ? (val.score ?? val.value ?? 0) : val;
                  const label = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/_/g, ' ')
                    .replace(/^\w/, (c) => c.toUpperCase())
                    .trim();
                  return <MetricRow key={key} label={label} value={value} />;
                })}
              </Box>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  Recommendations
                </Typography>
                <List dense disablePadding>
                  {recommendations.map((rec, idx) => {
                    const title = typeof rec === 'string' ? rec : rec.title || rec.text || '';
                    const severity = typeof rec === 'object' ? rec.severity || 'low' : 'low';
                    return (
                      <ListItem
                        key={idx}
                        sx={{
                          px: 1,
                          py: 0.75,
                          borderRadius: 1,
                          mb: 0.5,
                          bgcolor: 'action.hover'
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {SEVERITY_ICON[severity] || SEVERITY_ICON.low}
                        </ListItemIcon>
                        <ListItemText
                          primary={title}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondary={typeof rec === 'object' ? rec.description : undefined}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                        {typeof rec === 'object' && rec.impact && (
                          <Chip
                            label={rec.impact}
                            size="small"
                            sx={{ fontSize: 11, height: 18, ml: 1 }}
                          />
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            )}

            {/* Created confirmation */}
            {created && (
              <Alert
                severity="success"
                icon={<CheckCircleOutline />}
                sx={{ mt: 1 }}
              >
                Optimization task created in BackLog
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose} color="inherit" size="small">
          Close
        </Button>
        <Stack direction="row" spacing={1}>
          {analysis && !created && (
            <Button
              variant="contained"
              size="small"
              color="secondary"
              onClick={handleCreateOptimizationTask}
              disabled={creating}
              startIcon={creating ? <CircularProgress size={14} /> : <AddTask />}
              sx={{ textTransform: 'none' }}
            >
              Create Optimization Task
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
