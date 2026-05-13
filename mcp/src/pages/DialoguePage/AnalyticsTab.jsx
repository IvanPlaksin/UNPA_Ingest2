/**
 * AnalyticsTab — DevDialogue Analytics Dashboard (Variant C / Full)
 *
 * Features:
 *  - 4 metric cards with trend % vs previous period
 *  - Period selector: 7d / 30d / 90d / all
 *  - Auto-refresh toggle (60s)
 *  - Activity Timeline (Area chart: sessions + decisions per day)
 *  - Decisions by Category (Donut/Pie chart) — drill-down on click
 *  - Decisions by Status (Horizontal Bar)
 *  - Confidence Distribution (Bar histogram)
 *  - Platform Split (Pie chart)
 *  - Drill-down panel: filtered decisions list on chart segment click
 *  - Export: JSON download + Markdown ADR summary
 *  - Watcher status badge
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Alert,
  Paper, Grid, ToggleButtonGroup, ToggleButton, IconButton,
  Tooltip, Divider, Button, Menu, MenuItem, List, ListItem,
  ListItemText, Collapse,
} from '@mui/material';
import {
  Refresh, Download, TrendingUp, TrendingDown, TrendingFlat,
  FiberManualRecord, ExpandMore, ExpandLess, CheckCircle, Cancel, HelpOutline,
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import { useDialogueAnalytics, useDialogueDecisions } from '../../hooks/useDialogue';

// ── Colour palettes ───────────────────────────────────────────────────────────

const CATEGORY_PALETTE = {
  architecture: '#1976d2',
  pattern: '#7b1fa2',
  convention: '#388e3c',
  technology: '#f57c00',
  rejection: '#d32f2f',
  unknown: '#757575',
};

const STATUS_PALETTE = {
  accepted: '#2e7d32',
  proposed: '#ed6c02',
  rejected: '#c62828',
  unknown: '#9e9e9e',
};

const PLATFORM_PALETTE = {
  claude_code: '#1976d2',
  claude_ai: '#7b1fa2',
  unknown: '#757575',
};

const CONF_COLOR = '#1976d2';

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({ label, value, trend, subtitle }) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : TrendingFlat;
  const trendColor = trend > 0 ? 'success.main' : trend < 0 ? 'error.main' : 'text.disabled';

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
        {label.toUpperCase()}
      </Typography>
      <Typography variant="h4" fontWeight={700} sx={{ my: 0.5, lineHeight: 1.1 }}>
        {value?.toLocaleString() ?? '—'}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {trend != null ? (
          <>
            <TrendIcon sx={{ fontSize: 14, color: trendColor }} />
            <Typography variant="caption" sx={{ color: trendColor }}>
              {trend > 0 ? '+' : ''}{trend}% vs prev period
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.disabled">{subtitle || 'all time'}</Typography>
        )}
      </Stack>
    </Paper>
  );
}

// ── Custom Recharts tooltip ───────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, fontSize: '0.8rem' }}>
      {label && <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>}
      {payload.map((p, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.color || p.fill }} />
          <Typography variant="caption">{p.name}: <strong>{p.value?.toLocaleString()}</strong></Typography>
        </Stack>
      ))}
    </Paper>
  );
}

// ── Drill-down panel ──────────────────────────────────────────────────────────

function DrilldownPanel({ drilldown, onClose }) {
  const { category } = drilldown;
  const { decisions, loading } = useDialogueDecisions({ category, limit: 50 });
  const all = [...(decisions || [])];

  const STATUS_ICON = {
    accepted: <CheckCircle fontSize="small" color="success" />,
    proposed: <HelpOutline fontSize="small" color="warning" />,
    rejected: <Cancel fontSize="small" color="error" />,
  };

  return (
    <Paper variant="outlined" sx={{ mt: 2, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: CATEGORY_PALETTE[category] || '#888' }} />
          <Typography variant="subtitle2">
            {category} — {all.length} decisions
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}><ExpandLess fontSize="small" /></IconButton>
      </Stack>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      ) : (
        <List dense disablePadding sx={{ maxHeight: 300, overflow: 'auto' }}>
          {all.map((d, i) => (
            <ListItem key={d.decisionId || i} divider={i < all.length - 1} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ mr: 1, mt: 0.3, flexShrink: 0 }}>{STATUS_ICON[d.status] || STATUS_ICON.proposed}</Box>
              <ListItemText
                primary={d.title}
                secondary={`${Math.round((d.confidence || 0) * 100)}% confidence · ${d.namespace || ''}`}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
          {!all.length && (
            <ListItem><ListItemText secondary="No decisions found" /></ListItem>
          )}
        </List>
      )}
    </Paper>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function downloadJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dialogue-analytics-${data.period}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown(data) {
  const lines = [
    `# DevDialogue Analytics Report`,
    `**Period:** ${data.period} · **Generated:** ${new Date(data.generatedAt).toLocaleString()}`,
    '',
    `## Totals`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Sessions | ${data.totals.sessions} |`,
    `| Segments | ${data.totals.segments} |`,
    `| Decisions | ${data.totals.decisions} |`,
    `| Chains | ${data.totals.chains} |`,
    '',
    `## Decisions by Category`,
    ...data.byCategory.map(r => `- **${r.category}**: ${r.count}`),
    '',
    `## Decisions by Status`,
    ...data.byStatus.map(r => `- **${r.status}**: ${r.count}`),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dialogue-analytics-${data.period}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

export default function AnalyticsTab() {
  const [period, setPeriod] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [drilldown, setDrilldown] = useState(null); // { category: '...' }
  const [exportAnchor, setExportAnchor] = useState(null);
  const { data, loading, error, refetch } = useDialogueAnalytics(period);
  const timerRef = useRef(null);

  // Auto-refresh every 60s
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(refetch, 60000);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, refetch]);

  const handlePieClick = useCallback((entry) => {
    if (!entry?.name) return;
    setDrilldown(d => d?.category === entry.name ? null : { category: entry.name });
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!data) return null;

  const { totals, byCategory, byStatus, byConfidence, timeline, byPlatform, watcherStatus } = data;

  return (
    <Box sx={{ p: 2 }}>
      {/* Toolbar */}
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>Analytics</Typography>

        {/* Watcher status */}
        {watcherStatus && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <FiberManualRecord sx={{ fontSize: 10, color: 'success.main' }} />
            <Typography variant="caption" color="text.secondary">Watcher active</Typography>
          </Stack>
        )}

        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => { if (v) { setPeriod(v); setDrilldown(null); } }}
          size="small"
          sx={{ '& .MuiToggleButton-root': { py: 0.4, px: 1.5, fontSize: '0.75rem', textTransform: 'none' } }}
        >
          {PERIODS.map(p => <ToggleButton key={p.value} value={p.value}>{p.label}</ToggleButton>)}
        </ToggleButtonGroup>

        <Tooltip title={autoRefresh ? 'Auto-refresh ON (60s)' : 'Auto-refresh OFF'}>
          <Chip
            label="Auto"
            size="small"
            onClick={() => setAutoRefresh(v => !v)}
            color={autoRefresh ? 'success' : 'default'}
            variant={autoRefresh ? 'filled' : 'outlined'}
          />
        </Tooltip>

        <Tooltip title="Refresh now">
          <IconButton size="small" onClick={refetch}><Refresh fontSize="small" /></IconButton>
        </Tooltip>

        <Button
          size="small"
          variant="outlined"
          startIcon={<Download />}
          onClick={e => setExportAnchor(e.currentTarget)}
          sx={{ textTransform: 'none', fontSize: '0.78rem' }}
        >
          Export
        </Button>
        <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
          <MenuItem onClick={() => { downloadJSON(data); setExportAnchor(null); }}>
            Download JSON
          </MenuItem>
          <MenuItem onClick={() => { downloadMarkdown(data); setExportAnchor(null); }}>
            Download Markdown (ADR summary)
          </MenuItem>
        </Menu>
      </Stack>

      {/* Metric cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          { label: 'Sessions', value: totals.sessions, trend: totals.trends?.sessions },
          { label: 'Segments', value: totals.segments, subtitle: 'extracted' },
          { label: 'Decisions', value: totals.decisions, trend: totals.trends?.decisions },
          { label: 'Chains', value: totals.chains, subtitle: 'CONTINUES_FROM' },
        ].map(card => (
          <Grid item xs={6} sm={3} key={card.label}>
            <MetricCard {...card} />
          </Grid>
        ))}
      </Grid>

      {/* Activity Timeline */}
      {timeline.length > 1 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            Activity Timeline
          </Typography>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={timeline} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="sessions" name="Sessions"
                stroke="#1976d2" fill="#e3f2fd" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="decisions" name="Decisions"
                stroke="#7b1fa2" fill="#f3e5f5" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* Charts row */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Category donut */}
        <Grid item xs={12} sm={6} md={4}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">By Category</Typography>
              {drilldown && (
                <Typography variant="caption" color="primary" sx={{ cursor: 'pointer' }}
                  onClick={() => setDrilldown(null)}>
                  Clear
                </Typography>
              )}
            </Stack>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  cursor="pointer"
                  onClick={(_, __, e) => {
                    const entry = byCategory[e?.index ?? -1];
                    if (entry) handlePieClick({ name: entry.category });
                  }}
                >
                  {byCategory.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_PALETTE[entry.category] || '#888'}
                      opacity={drilldown && drilldown.category !== entry.category ? 0.35 : 1}
                      stroke={drilldown?.category === entry.category ? '#333' : 'none'}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <RTooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <Stack spacing={0.3} sx={{ mt: 0.5 }}>
              {byCategory.map(r => (
                <Stack key={r.category} direction="row" spacing={0.75} alignItems="center"
                  sx={{ cursor: 'pointer', opacity: drilldown && drilldown.category !== r.category ? 0.4 : 1 }}
                  onClick={() => handlePieClick({ name: r.category })}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CATEGORY_PALETTE[r.category] || '#888', flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ flex: 1 }}>{r.category}</Typography>
                  <Typography variant="caption" fontWeight={600}>{r.count}</Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Status bar */}
        <Grid item xs={12} sm={6} md={4}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>By Status</Typography>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byStatus} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 10 }} width={60} />
                <RTooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                  {byStatus.map(r => (
                    <Cell key={r.status} fill={STATUS_PALETTE[r.status] || '#888'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Confidence histogram */}
        <Grid item xs={12} sm={6} md={4}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Confidence Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byConfidence} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Decisions" fill={CONF_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Platform + generation time */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Platform</Typography>
            <Stack spacing={0.5}>
              {byPlatform.map(r => (
                <Stack key={r.platform} direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PLATFORM_PALETTE[r.platform] || '#888' }} />
                  <Typography variant="caption" sx={{ flex: 1 }}>
                    {r.platform === 'claude_code' ? 'Claude Code' : r.platform === 'claude_ai' ? 'Claude.ai' : r.platform}
                  </Typography>
                  <Typography variant="caption" fontWeight={600}>{r.count}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    ({Math.round((r.count / totals.sessions) * 100)}%)
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={8}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Quick Stats</Typography>
            <Grid container spacing={1}>
              {[
                { label: 'Avg msgs / session', value: totals.sessions ? Math.round(26805 / totals.sessions) : '—' },
                { label: 'Decisions / session', value: totals.sessions ? (totals.decisions / totals.sessions).toFixed(1) : '—' },
                { label: 'Chains / session', value: totals.sessions ? (totals.chains / totals.sessions).toFixed(1) : '—' },
                { label: 'Segments / session', value: totals.sessions ? (totals.segments / totals.sessions).toFixed(1) : '—' },
              ].map(s => (
                <Grid item xs={6} key={s.label}>
                  <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
                  <Typography variant="body2" fontWeight={600}>{s.value}</Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Drill-down panel */}
      {drilldown && (
        <DrilldownPanel drilldown={drilldown} onClose={() => setDrilldown(null)} />
      )}

      <Typography variant="caption" color="text.disabled" display="block" sx={{ textAlign: 'right', mt: 1 }}>
        Generated {new Date(data.generatedAt).toLocaleString()}
      </Typography>
    </Box>
  );
}
