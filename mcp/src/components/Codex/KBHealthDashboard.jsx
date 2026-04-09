import React from 'react';
import {
  Box, Card, CardContent, Typography, Grid, LinearProgress, Chip, Tooltip, CircularProgress
} from '@mui/material';
import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useKBHealth } from '../../hooks/useKBHealth';

const METRIC_META = {
  coverage:     { label: 'Coverage',     desc: 'Information Types with nodes' },
  consistency:  { label: 'Consistency',  desc: 'Absence of contradictions' },
  freshness:    { label: 'Freshness',    desc: 'Nodes updated within 30 days' },
  connectivity: { label: 'Connectivity', desc: 'Graph connectedness' },
  accuracy:     { label: 'Accuracy',     desc: 'Validation score' },
  usefulness:   { label: 'Usefulness',   desc: 'Query success rate' }
};

function scoreColor(s) {
  if (s >= 0.8) return 'success';
  if (s >= 0.6) return 'warning';
  return 'error';
}

function StatusIcon({ status }) {
  if (status === 'healthy')  return <CheckCircle size={20} color="#4caf50" />;
  if (status === 'warning')  return <AlertTriangle size={20} color="#ff9800" />;
  return <AlertCircle size={20} color="#f44336" />;
}

function MetricCard({ name, data }) {
  const meta = METRIC_META[name] || { label: name, desc: '' };
  const pct = Math.round((data?.score || 0) * 100);
  const color = scoreColor(data?.score || 0);

  return (
    <Card sx={{ height: '100%', bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">{meta.label}</Typography>
          <Chip label={`${pct}%`} size="small" color={color} sx={{ fontWeight: 'bold', fontFamily: 'monospace' }} />
        </Box>
        <LinearProgress variant="determinate" value={pct} color={color} sx={{ height: 6, borderRadius: 3, mb: 1 }} />
        <Tooltip title={data?.details || meta.desc}>
          <Typography variant="caption" color="text.disabled" noWrap>{data?.details || meta.desc}</Typography>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

function HealthRing({ score, status }) {
  const pct = Math.round((score || 0) * 100);
  const r = 45, C = 2 * Math.PI * r;
  const offset = C - (score || 0) * C;
  const col = status === 'healthy' ? '#4caf50' : status === 'warning' ? '#ff9800' : '#f44336';

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <svg width="120" height="120" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h4" fontWeight="bold" fontFamily="monospace">{pct}</Typography>
        <Typography variant="caption" color="text.disabled">Health</Typography>
      </Box>
    </Box>
  );
}

export default function KBHealthDashboard() {
  const { health, loading, error } = useKBHealth(true, 60000);

  if (loading && !health) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Box sx={{ p: 2, color: 'error.main' }}>Error: {error}</Box>;

  const { healthScore, metrics, status, computedAt } = health || {};

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3 }}>
        <HealthRing score={healthScore} status={status} />
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <StatusIcon status={status} />
            <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>KB: {status}</Typography>
          </Box>
          <Typography variant="body2" color="text.disabled">
            {computedAt ? new Date(computedAt).toLocaleString() : 'N/A'}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2}>
        {Object.entries(metrics || {}).map(([k, v]) => (
          <Grid item xs={12} sm={6} md={4} key={k}><MetricCard name={k} data={v} /></Grid>
        ))}
      </Grid>
    </Box>
  );
}
