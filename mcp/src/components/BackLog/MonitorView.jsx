/**
 * MonitorView — Comprehensive analytics dashboard with 7 sub-views.
 * Sub-tabs: Tokens | Pipeline | Agents | Ranking | Sessions | Alerts | AI Insights
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Tabs,
  Tab,
  Button,
  TextField,
  Stack,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert
} from '@mui/material';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import api from '../../services/api';

// ── Constants ──────────────────────────────────────────────────────────────

const COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f', '#7b1fa2', '#00796b', '#f57c00', '#455a64'];

const SUB_TABS = ['Tokens', 'Pipeline', 'Agents', 'Ranking', 'Sessions', 'Alerts', 'AI Insights'];

const AI_PRESETS = [
  { key: 'bottlenecks', label: 'Bottlenecks' },
  { key: 'token_optimization', label: 'Token Optimization' },
  { key: 'review_patterns', label: 'Review Patterns' },
  { key: 'predict_completion', label: 'Predict Completion' },
  { key: 'efficiency_report', label: 'Efficiency Report' }
];

const STATUS_ORDER = ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'REVIEW', 'DONE'];

// ── Helpers ────────────────────────────────────────────────────────────────

function StatCard({ title, value, subtitle, color }) {
  return (
    <Card sx={{ flex: 1, minWidth: 180 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
        <Typography variant="h4" sx={{ color: color || '#1976d2', fontWeight: 700 }}>
          {value ?? '—'}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingOverlay() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

function fmt(n) {
  if (n == null) return '—';
  if (typeof n === 'number') return n.toLocaleString();
  return String(n);
}

function fmtCost(n) {
  if (n == null) return '—';
  return `$${Number(n).toFixed(4)}`;
}

// ── Sub-view: Tokens ───────────────────────────────────────────────────────

function TokensView({ data }) {
  if (!data) return <LoadingOverlay />;

  const { summary = {}, byModel = [], byEffort = [] } = data;

  const modelData = (Array.isArray(byModel) ? byModel : []).map(m => ({
    name: m.model || m.name || 'unknown',
    tokens: m.totalTokens || m.tokens || 0
  }));

  const effortRows = Array.isArray(byEffort) ? byEffort : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <StatCard title="Total Tokens" value={fmt(summary.totalTokens)} color="#1976d2" />
        <StatCard title="Total Cost" value={fmtCost(summary.totalCost)} color="#2e7d32" />
        <StatCard title="Avg per Task" value={fmt(summary.avgTokensPerTask)} color="#ed6c02" />
      </Stack>

      {modelData.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Tokens by Model</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={modelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="tokens" fill="#1976d2" name="Tokens" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {effortRows.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Token Usage by Effort Size</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Effort</TableCell>
                  <TableCell align="right">Tasks</TableCell>
                  <TableCell align="right">Avg Tokens</TableCell>
                  <TableCell align="right">Avg Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {effortRows.map((row, i) => (
                  <TableRow key={row.effort || i}>
                    <TableCell>
                      <Chip label={row.effort || '?'} size="small" sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell align="right">{fmt(row.count)}</TableCell>
                    <TableCell align="right">{fmt(row.avgTokens)}</TableCell>
                    <TableCell align="right">{fmtCost(row.avgCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

// ── Sub-view: Pipeline ─────────────────────────────────────────────────────

function PipelineView({ data }) {
  if (!data) return <LoadingOverlay />;

  const { statusFunnel = {}, verdicts = {}, iterationDistribution = [] } = data;

  const funnelData = STATUS_ORDER.map(s => ({
    name: s.replace('_', ' '),
    count: statusFunnel[s] || 0
  }));

  const verdictData = Object.entries(verdicts).map(([k, v]) => ({ name: k, value: v }));

  const iterData = Array.isArray(iterationDistribution)
    ? iterationDistribution
    : Object.entries(iterationDistribution).map(([k, v]) => ({ iterations: k, count: v }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Status Funnel</Typography>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={funnelData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" name="Tasks">
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Stack direction="row" spacing={2} flexWrap="wrap">
        {verdictData.length > 0 && (
          <Card sx={{ flex: 1, minWidth: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Review Verdicts</Typography>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={verdictData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {verdictData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {iterData.length > 0 && (
          <Card sx={{ flex: 1, minWidth: 320 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Tasks by Iteration Count</Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={iterData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="iterations" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#7b1fa2" name="Tasks" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}

// ── Sub-view: Agents ───────────────────────────────────────────────────────

function AgentsView({ data }) {
  if (!data) return <LoadingOverlay />;

  const {
    summary = {},
    topTools = [],
    memoryTypes = {}
  } = data;

  const toolData = (Array.isArray(topTools) ? topTools : []).slice(0, 10).map(t => ({
    name: t.tool || t.name || 'unknown',
    calls: t.calls || t.count || 0
  }));

  const memData = Object.entries(memoryTypes).map(([k, v]) => ({ name: k, value: v }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <StatCard title="Total Tool Calls" value={fmt(summary.totalToolCalls)} color="#1976d2" />
        <StatCard
          title="Decision Quality"
          value={summary.decisionQuality != null ? `${Number(summary.decisionQuality).toFixed(1)}%` : '—'}
          color="#2e7d32"
        />
        <StatCard
          title="Cache Hit Rate"
          value={summary.cacheHitRate != null ? `${Number(summary.cacheHitRate).toFixed(1)}%` : '—'}
          color="#ed6c02"
        />
      </Stack>

      {toolData.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Top 10 Tools by Usage</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={toolData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={160} />
                <Tooltip />
                <Bar dataKey="calls" fill="#00796b" name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {memData.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Memory Entry Types</Typography>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={memData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {memData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

// ── Sub-view: Ranking ──────────────────────────────────────────────────────

function RankingView({ data }) {
  if (!data) return <LoadingOverlay />;

  const items = Array.isArray(data) ? data : data.items || data.namespaces || [];
  const top10 = items.slice(0, 10);
  const maxScore = top10.reduce((mx, r) => Math.max(mx, r.score || r.count || 0), 1);

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>Top 10 — Ranked by Namespace</Typography>
        {top10.length === 0 && (
          <Typography color="text.secondary">No ranking data available.</Typography>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Tasks</TableCell>
              <TableCell sx={{ width: '40%' }}>Score</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {top10.map((row, i) => {
              const score = row.score || row.count || 0;
              return (
                <TableRow key={row.namespace || i}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <Chip label={row.namespace || row.name || '?'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{fmt(row.taskCount || row.count || score)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={(score / maxScore) * 100}
                        sx={{ flex: 1, height: 8, borderRadius: 4 }}
                      />
                      <Typography variant="caption" sx={{ minWidth: 32 }}>{fmt(score)}</Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Sub-view: Sessions ─────────────────────────────────────────────────────

function SessionsView({ data }) {
  if (!data) return <LoadingOverlay />;

  const statusMap = {
    running: { color: '#2e7d32', label: 'Running' },
    paused: { color: '#ed6c02', label: 'Paused' },
    queued: { color: '#1976d2', label: 'Queued' },
    completed: { color: '#455a64', label: 'Completed' }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        {Object.entries(statusMap).map(([key, { color, label }]) => (
          <StatCard
            key={key}
            title={label}
            value={fmt(data[key] ?? data.counts?.[key])}
            color={color}
          />
        ))}
      </Stack>

      {(data.maxParallel != null || data.config?.maxParallel != null) && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1">
              Max Parallel Sessions:{' '}
              <Chip
                label={data.maxParallel ?? data.config?.maxParallel}
                color="primary"
                size="small"
              />
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

// ── Sub-view: Alerts ───────────────────────────────────────────────────────

function AlertsView({ data }) {
  if (!data) return <LoadingOverlay />;

  const categories = data.categories || data.byCategory || {};
  const catData = Object.entries(categories).map(([k, v]) => ({
    name: k,
    count: typeof v === 'number' ? v : v.count || 0
  }));

  const recent = Array.isArray(data.recent) ? data.recent.slice(0, 10) : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {catData.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Notifications by Category</Typography>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={catData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" name="Count">
                  {catData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Recent Notifications</Typography>
          {recent.length === 0 ? (
            <Typography color="text.secondary">No recent notifications.</Typography>
          ) : (
            <Stack spacing={1}>
              {recent.map((n, i) => (
                <Alert
                  key={n.id || i}
                  severity={n.severity || n.level || 'info'}
                  sx={{ py: 0.5 }}
                >
                  <Typography variant="body2">
                    {n.message || n.text || JSON.stringify(n)}
                  </Typography>
                  {n.timestamp && (
                    <Typography variant="caption" color="text.secondary">
                      {new Date(n.timestamp).toLocaleString()}
                    </Typography>
                  )}
                </Alert>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

// ── Sub-view: AI Insights ──────────────────────────────────────────────────

function AIInsightsView() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');

  const runAnalysis = useCallback(async (body) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post('/monitor/ai-analyze', body);
      setResult(res.data?.analysis || res.data?.result || JSON.stringify(res.data, null, 2));
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePreset = (preset) => runAnalysis({ preset });

  const handleCustom = () => {
    if (!customPrompt.trim()) return;
    runAnalysis({ prompt: customPrompt.trim() });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Preset Analyses</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {AI_PRESETS.map(({ key, label }) => (
              <Button
                key={key}
                variant="outlined"
                size="small"
                disabled={loading}
                onClick={() => handlePreset(key)}
              >
                {label}
              </Button>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Custom Question</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask anything about the backlog, pipeline, tokens..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustom()}
              disabled={loading}
            />
            <Button
              variant="contained"
              onClick={handleCustom}
              disabled={loading || !customPrompt.trim()}
            >
              Analyze
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>AI Analysis</Typography>
            <Box
              sx={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                bgcolor: '#f5f5f5',
                p: 2,
                borderRadius: 1,
                maxHeight: 500,
                overflow: 'auto'
              }}
            >
              {result}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

// ── Data fetchers (mapped by tab index) ────────────────────────────────────

const TAB_FETCHERS = [
  () => api.get('/monitor/token-economics').then(r => r.data),
  () => api.get('/monitor/execution-pipeline').then(r => r.data),
  () => api.get('/monitor/agent-performance').then(r => r.data),
  () => api.get('/backlog/ranked-by-namespace').then(r => r.data),
  () => api.get('/sessions/status').then(r => r.data),
  () => api.get('/notifications/metrics').then(r => r.data),
  null // AI Insights fetches on demand
];

// ── Main Component ─────────────────────────────────────────────────────────

export default function MonitorView() {
  const [activeTab, setActiveTab] = useState(0);
  const [tabData, setTabData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTabData = useCallback(async (tabIndex) => {
    const fetcher = TAB_FETCHERS[tabIndex];
    if (!fetcher) return; // AI Insights tab handles its own fetching

    // Skip if already loaded
    if (tabData[tabIndex] !== undefined) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetcher();
      setTabData(prev => ({ ...prev, [tabIndex]: data }));
    } catch (err) {
      console.error(`MonitorView: failed to fetch tab ${tabIndex}`, err);
      setError(err.response?.data?.error || err.message || 'Failed to load data');
      setTabData(prev => ({ ...prev, [tabIndex]: null }));
    } finally {
      setLoading(false);
    }
  }, [tabData]);

  // Fetch on mount (tab 0) and when tab changes
  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabChange = (_e, newVal) => setActiveTab(newVal);

  const renderTab = () => {
    if (loading && tabData[activeTab] === undefined) return <LoadingOverlay />;

    switch (activeTab) {
      case 0: return <TokensView data={tabData[0]} />;
      case 1: return <PipelineView data={tabData[1]} />;
      case 2: return <AgentsView data={tabData[2]} />;
      case 3: return <RankingView data={tabData[3]} />;
      case 4: return <SessionsView data={tabData[4]} />;
      case 5: return <AlertsView data={tabData[5]} />;
      case 6: return <AIInsightsView />;
      default: return null;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 40 }}
        >
          {SUB_TABS.map((label, i) => (
            <Tab key={label} label={label} sx={{ minHeight: 40, textTransform: 'none' }} />
          ))}
        </Tabs>
      </Box>

      {error && activeTab !== 6 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', px: 1, pb: 2 }}>
        {renderTab()}
      </Box>
    </Box>
  );
}
