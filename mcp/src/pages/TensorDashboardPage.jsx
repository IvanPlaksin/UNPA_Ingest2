/**
 * TensorDashboard Page - Real-time performance monitoring dashboard
 * Split into Tensors and Databases tabs
 * Uses SSE (Server-Sent Events) for real-time tensor updates
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Container, Grid, Paper, Typography, Stack, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Alert, IconButton, Tooltip, CircularProgress,
  Tabs, Tab, Divider, Collapse
} from '@mui/material';
import {
  Gauge, Activity, AlertTriangle, Clock, Zap, Database,
  RefreshCw, TrendingUp, TrendingDown, Minus, Power, PowerOff,
  Link, ChevronDown, ChevronUp, Layers, Server, Radio, WifiOff
} from 'lucide-react';
import TensorGraph from '../components/Tensor/TensorGraph';
import TensorTimeline from '../components/Tensor/TensorTimeline';

const API_BASE = '/api/v1/tensors';
const SSE_URL = `${API_BASE}/stream`;

// Tab Panel component
function TabPanel({ children, value, index, ...props }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      {...props}
    >
      {value === index && children}
    </Box>
  );
}

const TensorDashboardPage = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTensor, setSelectedTensor] = useState(null);
  const [streamActive, setStreamActive] = useState(true);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [showConnections, setShowConnections] = useState(true);
  const eventSourceRef = useRef(null);

  // Manual fetch for initial load or manual refresh
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      if (!res.ok) throw new Error('Failed to fetch tensor status');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE connection for real-time updates
  useEffect(() => {
    if (!streamActive) {
      // Close existing connection when stream is paused
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Create SSE connection
    const eventSource = new EventSource(SSE_URL);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
      console.log('[TensorDashboard] SSE connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
        } else {
          setStatus(data);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        console.error('[TensorDashboard] SSE parse error:', e);
      }
    };

    eventSource.onerror = (e) => {
      console.error('[TensorDashboard] SSE error:', e);
      setConnected(false);
      setError('Stream connection lost. Reconnecting...');
      // EventSource will auto-reconnect
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [streamActive]);

  const handleNodeClick = (node) => {
    setSelectedTensor(node);
  };

  // Toggle tensor monitoring on/off
  const toggleMonitoring = useCallback(async () => {
    try {
      const endpoint = status?.enabled ? 'disable' : 'enable';
      const res = await fetch(`${API_BASE}/${endpoint}`, { method: 'POST' });
      if (res.ok) {
        fetchStatus();
      }
    } catch (e) {
      console.error('Failed to toggle monitoring:', e);
    }
  }, [status?.enabled, fetchStatus]);

  // Format duration
  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Get trend icon
  const getTrendIcon = (current, threshold) => {
    if (current > threshold * 1.5) return <TrendingUp size={14} color="#f44336" />;
    if (current > threshold) return <TrendingUp size={14} color="#ff9800" />;
    if (current < threshold * 0.5) return <TrendingDown size={14} color="#4caf50" />;
    return <Minus size={14} color="#9e9e9e" />;
  };

  // Prepare tensor timeline data from active and recent tensors
  const timelineTensors = useMemo(() => {
    const all = [];
    if (status?.active) {
      all.push(...status.active.map(t => ({ ...t, state: 'started' })));
    }
    // Get recent completed tensors from metrics
    if (status?.causalGraph?.nodes) {
      status.causalGraph.nodes.forEach(node => {
        if (node.metrics) {
          all.push({
            id: node.id,
            name: node.name,
            state: node.status === 'error' ? 'failed' : 'completed',
            startTime: Date.now() - (node.metrics.avg || 100),
            duration: node.metrics.avg || 100,
            context: {}
          });
        }
      });
    }
    return all;
  }, [status]);

  if (loading && !status) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Gauge size={32} />
          <Box>
            <Typography variant="h4" fontWeight="bold">Tensor Monitor</Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time performance monitoring and causal analysis
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Tooltip title={status?.enabled ? 'Disable tensor monitoring' : 'Enable tensor monitoring'}>
            <Chip
              icon={status?.enabled ? <Power size={14} /> : <PowerOff size={14} />}
              label={status?.enabled ? 'Monitoring ON' : 'Monitoring OFF'}
              color={status?.enabled ? 'success' : 'default'}
              variant={status?.enabled ? 'filled' : 'outlined'}
              onClick={toggleMonitoring}
              sx={{ cursor: 'pointer' }}
            />
          </Tooltip>
          <Divider orientation="vertical" flexItem />
          <Tooltip title={streamActive ? 'Click to pause stream' : 'Click to resume stream'}>
            <Chip
              icon={connected ? <Radio size={14} /> : <WifiOff size={14} />}
              label={streamActive ? (connected ? 'Live Stream' : 'Connecting...') : 'Paused'}
              color={connected ? 'success' : streamActive ? 'warning' : 'default'}
              size="small"
              onClick={() => setStreamActive(!streamActive)}
              sx={{ cursor: 'pointer' }}
            />
          </Tooltip>
          <Tooltip title="Manual refresh">
            <IconButton onClick={fetchStatus} size="small" disabled={connected}>
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Monitoring Disabled Warning */}
      {status && !status.enabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Tensor monitoring is currently disabled. Click "Monitoring OFF" to enable it.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(e, v) => setActiveTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={<Layers size={18} />}
            iconPosition="start"
            label="Tensors"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<Database size={18} />}
            iconPosition="start"
            label="Databases"
            sx={{ minHeight: 48 }}
          />
        </Tabs>
      </Paper>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TENSORS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <TabPanel value={activeTab} index={0}>
        <Grid container spacing={3}>
          {/* Summary Cards */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Zap size={18} color="#4caf50" />
                <Typography variant="subtitle2" color="text.secondary">Active Tensors</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold">
                {status?.summary?.activeTensors || 0}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Activity size={18} color="#2196f3" />
                <Typography variant="subtitle2" color="text.secondary">Tensor Types</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold">
                {status?.summary?.uniqueTypes || 0}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AlertTriangle size={18} color="#f44336" />
                <Typography variant="subtitle2" color="text.secondary">Alerts (5 min)</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold" color={status?.summary?.alertCount > 0 ? 'error.main' : 'text.primary'}>
                {status?.summary?.alertCount || 0}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Clock size={18} color="#ff9800" />
                <Typography variant="subtitle2" color="text.secondary">Total Operations</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold">
                {status?.summary?.totalTensors || 0}
              </Typography>
            </Paper>
          </Grid>

          {/* Tensor Timeline - NEW */}
          <Grid item xs={12}>
            <TensorTimeline
              tensors={timelineTensors}
              timeWindow={60000}
              height={200}
            />
          </Grid>

          {/* Causal Graph */}
          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                Tensor Causal Graph
              </Typography>
              <TensorGraph
                data={status?.causalGraph}
                onNodeClick={handleNodeClick}
                height={450}
              />
            </Paper>
          </Grid>

          {/* Selected Tensor Details / Active Tensors */}
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 2, height: 514, overflow: 'auto' }}>
              {selectedTensor ? (
                <>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    Tensor Details
                  </Typography>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Name</Typography>
                      <Typography variant="body1" fontWeight="bold">{selectedTensor.name}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Status</Typography>
                      <Chip
                        size="small"
                        label={selectedTensor.status}
                        color={selectedTensor.status === 'ok' ? 'success' : selectedTensor.status === 'error' ? 'error' : 'warning'}
                      />
                    </Box>
                    {selectedTensor.metrics && (
                      <>
                        <Box>
                          <Typography variant="caption" color="text.secondary">Total Calls</Typography>
                          <Typography variant="h5">{selectedTensor.metrics.count}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">Average Duration</Typography>
                          <Typography variant="h5">{formatDuration(selectedTensor.metrics.avg)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">P95 Duration</Typography>
                          <Typography variant="h5" color={selectedTensor.metrics.p95 > 1000 ? 'error.main' : 'text.primary'}>
                            {formatDuration(selectedTensor.metrics.p95)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">Errors</Typography>
                          <Typography variant="h5" color={selectedTensor.metrics.errors > 0 ? 'error.main' : 'text.primary'}>
                            {selectedTensor.metrics.errors}
                          </Typography>
                        </Box>
                      </>
                    )}
                  </Stack>
                </>
              ) : (
                <>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    Active Tensors
                  </Typography>
                  {status?.active?.length > 0 ? (
                    <Stack spacing={1}>
                      {status.active.slice(0, 10).map((tensor) => (
                        <Paper key={tensor.id} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box sx={{ overflow: 'hidden' }}>
                              <Typography variant="body2" fontWeight="bold" noWrap>
                                {tensor.name.split('.').pop()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {tensor.name}
                              </Typography>
                            </Box>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Clock size={12} />
                              <Typography variant="caption">
                                {formatDuration(Date.now() - tensor.startTime)}
                              </Typography>
                            </Stack>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No active tensors. Click a node in the graph to see details.
                    </Typography>
                  )}
                </>
              )}
            </Paper>
          </Grid>

          {/* Metrics Table */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                Tensor Metrics (Last 5 Minutes)
              </Typography>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Tensor Name</TableCell>
                      <TableCell align="right">Count</TableCell>
                      <TableCell align="right">Active</TableCell>
                      <TableCell align="right">Avg (ms)</TableCell>
                      <TableCell align="right">P95 (ms)</TableCell>
                      <TableCell align="right">Max (ms)</TableCell>
                      <TableCell align="right">Errors</TableCell>
                      <TableCell align="center">Trend</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {status?.metrics && Object.entries(status.metrics)
                      .sort((a, b) => (b[1].p95 || 0) - (a[1].p95 || 0))
                      .map(([name, metrics]) => (
                        <TableRow
                          key={name}
                          hover
                          sx={{
                            cursor: 'pointer',
                            bgcolor: metrics.errors > 0 ? 'rgba(244,67,54,0.1)' : undefined
                          }}
                          onClick={() => setSelectedTensor({ name, metrics, status: metrics.errors > 0 ? 'error' : metrics.p95 > 1000 ? 'slow' : 'ok' })}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">{name}</Typography>
                          </TableCell>
                          <TableCell align="right">{metrics.count}</TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small"
                              label={metrics.active || 0}
                              color={metrics.active > 0 ? 'primary' : 'default'}
                              sx={{ minWidth: 40 }}
                            />
                          </TableCell>
                          <TableCell align="right">{metrics.avg}</TableCell>
                          <TableCell
                            align="right"
                            sx={{ color: metrics.p95 > 1000 ? 'error.main' : metrics.p95 > 500 ? 'warning.main' : 'success.main' }}
                          >
                            {metrics.p95}
                          </TableCell>
                          <TableCell align="right">{metrics.max}</TableCell>
                          <TableCell align="right">
                            <Typography color={metrics.errors > 0 ? 'error.main' : 'text.primary'}>
                              {metrics.errors}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            {getTrendIcon(metrics.p95, 500)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Recent Alerts */}
          {status?.alerts?.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                  Recent Alerts
                </Typography>
                <Stack spacing={1}>
                  {status.alerts.slice(0, 10).map((alert, idx) => (
                    <Alert
                      key={idx}
                      severity={alert.type === 'slow' ? 'warning' : 'error'}
                      sx={{ py: 0.5 }}
                    >
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Typography variant="body2" fontWeight="bold">{alert.name}</Typography>
                        {alert.duration && (
                          <Typography variant="caption">
                            Duration: {formatDuration(alert.duration)} (threshold: {formatDuration(alert.threshold)})
                          </Typography>
                        )}
                        {alert.error && (
                          <Typography variant="caption" color="error">
                            {alert.error}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </Typography>
                      </Stack>
                    </Alert>
                  ))}
                </Stack>
              </Paper>
            </Grid>
          )}
        </Grid>
      </TabPanel>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* DATABASES TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <TabPanel value={activeTab} index={1}>
        <Grid container spacing={3}>
          {/* Database Summary Cards */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Server size={18} color="#9c27b0" />
                <Typography variant="subtitle2" color="text.secondary">Active Connections</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold">
                {status?.connections?.active?.length || 0}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Activity size={18} color="#2196f3" />
                <Typography variant="subtitle2" color="text.secondary">Active Queries</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold" color="primary.main">
                {status?.connections?.stats?.queries?.active || 0}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Zap size={18} color="#4caf50" />
                <Typography variant="subtitle2" color="text.secondary">Completed Queries</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold" color="success.main">
                {status?.connections?.stats?.queries?.completed || 0}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AlertTriangle size={18} color="#f44336" />
                <Typography variant="subtitle2" color="text.secondary">Failed Queries</Typography>
              </Stack>
              <Typography variant="h3" fontWeight="bold" color={status?.connections?.stats?.queries?.failed > 0 ? 'error.main' : 'text.primary'}>
                {status?.connections?.stats?.queries?.failed || 0}
              </Typography>
            </Paper>
          </Grid>

          {/* Connection Pool Status */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                Connection Pool
              </Typography>
              <Stack spacing={2}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="body2">Pool Utilization</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {status?.database?.stats?.activeQueries || 0} / {status?.database?.maxPoolSize || 30}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={(status?.database?.stats?.activeQueries || 0) / (status?.database?.maxPoolSize || 30) * 100}
                    sx={{
                      height: 10,
                      borderRadius: 5,
                      bgcolor: 'grey.800',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: (status?.database?.stats?.activeQueries || 0) > 20 ? 'error.main' : 'success.main',
                        borderRadius: 5
                      }
                    }}
                  />
                </Box>

                {/* Services breakdown */}
                {status?.connections?.stats?.byService && (
                  <Stack direction="row" spacing={2} flexWrap="wrap">
                    {Object.entries(status.connections.stats.byService).map(([service, count]) => (
                      <Chip
                        key={service}
                        label={`${service}: ${count}`}
                        color={service === 'memgraph' ? 'primary' : service === 'redis' ? 'error' : 'secondary'}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Grid>

          {/* Connection States */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                Connection States
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {status?.connections?.stats?.byState && Object.entries(status.connections.stats.byState).map(([state, count]) => (
                  <Box key={state} sx={{ textAlign: 'center', minWidth: 80 }}>
                    <Typography variant="h4" fontWeight="bold">{count}</Typography>
                    <Chip
                      size="small"
                      label={state}
                      color={
                        state === 'executing' ? 'warning' :
                        state === 'active' ? 'success' :
                        state === 'closed' ? 'default' : 'primary'
                      }
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>

          {/* Active Connections Table */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: showConnections ? 2 : 0, cursor: 'pointer' }}
                onClick={() => setShowConnections(!showConnections)}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Link size={18} />
                  <Typography variant="h6" fontWeight="bold">
                    Active Connections
                  </Typography>
                  <Chip
                    size="small"
                    label={status?.connections?.active?.length || 0}
                    color={status?.connections?.active?.length > 0 ? 'primary' : 'default'}
                  />
                </Stack>
                <IconButton size="small">
                  {showConnections ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </IconButton>
              </Stack>

              <Collapse in={showConnections}>
                {status?.connections?.active?.length > 0 ? (
                  <TableContainer sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Connection ID</TableCell>
                          <TableCell>Service</TableCell>
                          <TableCell>State</TableCell>
                          <TableCell align="right">Open Duration</TableCell>
                          <TableCell align="right">Queries</TableCell>
                          <TableCell>Active Query</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {status.connections.active.map((conn) => (
                          <TableRow
                            key={conn.id}
                            sx={{
                              bgcolor: conn.state === 'executing' ? 'rgba(33,150,243,0.1)' :
                                       conn.openDuration > 30000 ? 'rgba(255,152,0,0.1)' : undefined
                            }}
                          >
                            <TableCell>
                              <Typography variant="caption" fontFamily="monospace">
                                {conn.id.substring(0, 8)}...
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={conn.service}
                                color={conn.service === 'memgraph' ? 'primary' : conn.service === 'redis' ? 'error' : 'default'}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={conn.state}
                                color={
                                  conn.state === 'executing' ? 'warning' :
                                  conn.state === 'active' ? 'success' : 'default'
                                }
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                color={conn.openDuration > 30000 ? 'warning.main' : 'text.primary'}
                              >
                                {formatDuration(conn.openDuration)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">{conn.queryCount}</TableCell>
                            <TableCell>
                              {conn.activeQuery ? (
                                <Tooltip title={conn.activeQuery.query}>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        maxWidth: 250,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontFamily: 'monospace',
                                        bgcolor: 'action.hover',
                                        px: 1,
                                        py: 0.5,
                                        borderRadius: 1
                                      }}
                                    >
                                      {conn.activeQuery.query.substring(0, 60)}...
                                    </Typography>
                                    <Chip
                                      size="small"
                                      label={formatDuration(conn.activeQuery.duration)}
                                      color={conn.activeQuery.duration > 5000 ? 'error' : 'default'}
                                    />
                                  </Stack>
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No active connections at the moment
                  </Typography>
                )}
              </Collapse>
            </Paper>
          </Grid>

          {/* Query Statistics */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                Query Statistics
              </Typography>
              <Stack direction="row" spacing={4} flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Queries</Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {status?.connections?.stats?.queries?.total || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Active</Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary.main">
                    {status?.connections?.stats?.queries?.active || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Completed</Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {status?.connections?.stats?.queries?.completed || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Failed</Typography>
                  <Typography variant="h4" fontWeight="bold" color="error.main">
                    {status?.connections?.stats?.queries?.failed || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Success Rate</Typography>
                  <Typography
                    variant="h4"
                    fontWeight="bold"
                    color={
                      ((status?.connections?.stats?.queries?.completed || 0) /
                      Math.max(1, (status?.connections?.stats?.queries?.total || 1))) > 0.95
                        ? 'success.main'
                        : 'warning.main'
                    }
                  >
                    {(((status?.connections?.stats?.queries?.completed || 0) /
                      Math.max(1, (status?.connections?.stats?.queries?.total || 1))) * 100).toFixed(1)}%
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>
    </Container>
  );
};

export default TensorDashboardPage;
