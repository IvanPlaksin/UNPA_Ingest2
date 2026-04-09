import React, { useState, useEffect, useRef, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Gauge, AlertTriangle, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Zap, Clock, TrendingUp, Radio
} from 'lucide-react';
import {
  Box, Paper, Typography, Stack, CircularProgress,
  Collapse, IconButton, Chip, LinearProgress, Tooltip
} from '@mui/material';

const API_BASE = '/api/v1/tensors';
const SSE_URL = `${API_BASE}/stream`;

const TensorMonitorWidget = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);

  // SSE connection for real-time updates
  useEffect(() => {
    const eventSource = new EventSource(SSE_URL);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      startTransition(() => setConnected(true));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.error) {
          startTransition(() => {
            setStatus(data);
            setLoading(false);
          });
        }
      } catch (e) {
        console.error('[TensorWidget] SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      startTransition(() => setConnected(false));
      // EventSource will auto-reconnect
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, []);

  // Calculate overall health
  const getOverallHealth = () => {
    if (!status) return 'unknown';
    const { alerts, summary } = status;
    if (alerts?.length > 5) return 'error';
    if (alerts?.length > 0 || summary?.activeTensors > 10) return 'warning';
    return 'ok';
  };

  const getHealthColor = (health) => {
    switch (health) {
      case 'ok': return '#4caf50';
      case 'warning': return '#ff9800';
      case 'error': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getHealthIcon = () => {
    const health = getOverallHealth();
    const color = getHealthColor(health);
    if (health === 'ok') return <CheckCircle size={14} color={color} />;
    if (health === 'warning') return <AlertTriangle size={14} color={color} />;
    return <XCircle size={14} color={color} />;
  };

  // Mini indicators for collapsed state
  const getMiniStats = () => {
    if (!status?.summary) return null;
    const { activeTensors, alertCount, uniqueTypes } = status.summary;

    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title="Active tensors">
          <Chip
            size="small"
            label={activeTensors}
            icon={<Zap size={10} />}
            sx={{
              height: 18,
              fontSize: '0.65rem',
              '& .MuiChip-icon': { ml: 0.5 },
              bgcolor: activeTensors > 5 ? 'warning.main' : 'success.main',
              color: 'white'
            }}
          />
        </Tooltip>
        {alertCount > 0 && (
          <Tooltip title="Alerts">
            <Chip
              size="small"
              label={alertCount}
              sx={{
                height: 18,
                fontSize: '0.65rem',
                bgcolor: 'error.main',
                color: 'white'
              }}
            />
          </Tooltip>
        )}
      </Stack>
    );
  };

  const handleNavigate = () => {
    navigate('/tensor-dashboard');
  };

  if (loading && !status) {
    return (
      <Paper variant="outlined" sx={{ bgcolor: 'background.default', overflow: 'hidden' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary' }}>
            <Gauge size={16} />
            <Typography variant="subtitle2" fontWeight="bold">Tensor Monitor</Typography>
          </Stack>
          <CircularProgress size={14} />
        </Stack>
      </Paper>
    );
  }

  const MetricItem = ({ label, value, icon: Icon, color, suffix = '' }) => (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Icon size={12} color={color || '#9e9e9e'} />
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Stack>
      <Typography variant="caption" fontWeight="bold" color={color || 'text.primary'}>
        {value}{suffix}
      </Typography>
    </Stack>
  );

  // Get top slow metrics
  const getTopMetrics = () => {
    if (!status?.metrics) return [];
    return Object.entries(status.metrics)
      .filter(([_, m]) => m.count > 0)
      .sort((a, b) => b[1].p95 - a[1].p95)
      .slice(0, 3);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        bgcolor: 'background.default',
        overflow: 'hidden',
        borderColor: getOverallHealth() === 'error' ? 'error.main' : undefined
      }}
    >
      {/* Clickable header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'text.secondary' }}>
          <Gauge size={16} />
          <Typography variant="subtitle2" fontWeight="bold">Tensor Monitor</Typography>
          {/* SSE connection indicator */}
          <Tooltip title={connected ? 'Live stream active' : 'Connecting...'}>
            <Radio size={10} color={connected ? '#4caf50' : '#ff9800'} />
          </Tooltip>
          {getHealthIcon()}
          {!expanded && getMiniStats()}
        </Stack>
        <IconButton size="small" sx={{ p: 0.5 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </IconButton>
      </Stack>

      {/* Collapsible content */}
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 1.5 }}>
          {status?.summary && (
            <>
              <MetricItem
                label="Active Tensors"
                value={status.summary.activeTensors}
                icon={Zap}
                color={status.summary.activeTensors > 5 ? '#ff9800' : '#4caf50'}
              />
              <MetricItem
                label="Tensor Types"
                value={status.summary.uniqueTypes}
                icon={Activity}
              />
              <MetricItem
                label="Alerts (5 min)"
                value={status.summary.alertCount}
                icon={AlertTriangle}
                color={status.summary.alertCount > 0 ? '#f44336' : undefined}
              />
            </>
          )}

          {/* Database connection */}
          {status?.database && (
            <Box sx={{ mt: 1, mb: 1 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                DB Pool: {status.database.stats?.activeQueries || 0} active / {status.database.maxPoolSize} max
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(status.database.stats?.activeQueries || 0) / status.database.maxPoolSize * 100}
                sx={{
                  mt: 0.5,
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'grey.800',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: status.database.stats?.activeQueries > 20 ? 'error.main' : 'success.main'
                  }
                }}
              />
            </Box>
          )}

          {/* Top slow operations */}
          {getTopMetrics().length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', display: 'block', mb: 0.5 }}>
                Slowest (p95):
              </Typography>
              {getTopMetrics().map(([name, metrics]) => (
                <Stack key={name} direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.6rem',
                      color: metrics.p95 > 1000 ? 'error.main' : metrics.p95 > 500 ? 'warning.main' : 'success.main'
                    }}
                  >
                    {metrics.p95}ms
                  </Typography>
                </Stack>
              ))}
            </Box>
          )}

          {/* View Dashboard button */}
          <Box
            onClick={handleNavigate}
            sx={{
              mt: 1.5,
              py: 0.5,
              textAlign: 'center',
              bgcolor: 'primary.main',
              borderRadius: 1,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'primary.dark' }
            }}
          >
            <Typography variant="caption" color="white" fontWeight="bold">
              Open Dashboard
            </Typography>
          </Box>

          <Typography variant="caption" display="block" textAlign="right" color="text.disabled" sx={{ mt: 1, fontSize: '0.6rem' }}>
            Updated: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '-'}
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default TensorMonitorWidget;
