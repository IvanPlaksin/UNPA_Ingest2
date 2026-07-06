/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI Usage Widget
 * Displays current AI API limits and usage by provider
 * Similar design to ServiceStatusWidget
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Sparkles,
  Server,
  DollarSign,
  Zap,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from 'lucide-react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  CircularProgress,
  LinearProgress,
  Tooltip,
  IconButton,
  Collapse,
} from '@mui/material';
import { API_BASE_URL } from '../../config/api.config';

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 60000; // 60 seconds (1 minute)

const PROVIDER_CONFIG = {
  gemini: {
    name: 'Gemini',
    icon: Sparkles,
    color: '#4285f4',
    bgColor: 'rgba(66, 133, 244, 0.1)',
  },
  anthropic: {
    name: 'Claude',
    icon: Cpu,
    color: '#d97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
  },
  ollama: {
    name: 'Llama',
    icon: Server,
    color: '#6366f1',
    bgColor: 'rgba(99, 102, 241, 0.1)',
  },
};

// ────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ────────────────────────────────────────────────────────────────────────────

async function fetchAIStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/ainfra/status`);
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    throw new Error(data.error || 'Failed to fetch status');
  } catch (error) {
    console.error('[AIUsageWidget] Error fetching status:', error);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR COMPONENT
// ────────────────────────────────────────────────────────────────────────────

const UsageBar = ({ value, max, label, color, showPercent = true }) => {
  const percent = max ? Math.min((value / max) * 100, 100) : 0;
  const isWarning = percent >= 70;
  const isCritical = percent >= 90;

  const barColor = isCritical ? '#ef4444' : isWarning ? '#f59e0b' : color;

  return (
    <Tooltip
      title={`${label}: ${value?.toLocaleString() || 0} / ${max === 'unlimited' ? 'Unlimited' : max?.toLocaleString() || 0}`}
      arrow
    >
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={max === 'unlimited' ? 0 : percent}
          sx={{
            height: 4,
            borderRadius: 2,
            bgcolor: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': {
              bgcolor: barColor,
              borderRadius: 2,
            },
          }}
        />
        {showPercent && max !== 'unlimited' && (
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6rem',
              color: isCritical ? 'error.main' : isWarning ? 'warning.main' : 'text.disabled',
            }}
          >
            {percent.toFixed(0)}%
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER ROW COMPONENT
// ────────────────────────────────────────────────────────────────────────────

const ProviderRow = ({ provider, usage, config }) => {
  const providerInfo = PROVIDER_CONFIG[provider] || {
    name: provider,
    icon: Cpu,
    color: '#94a3b8',
    bgColor: 'rgba(107, 114, 128, 0.1)',
  };
  const Icon = providerInfo.icon;

  const isEnabled = config?.enabled !== false;
  const hasUsage = usage && (usage.requests > 0 || usage.tokens?.total > 0);

  // Parse usage data
  const tokenUsage = usage?.tokens?.total || 0;
  const tokenLimit = config?.dailyTokenLimit || usage?.tokens?.limit;
  const costUsage = parseFloat(usage?.cost?.total?.replace('$', '') || 0);
  const costLimit = config?.dailyBudgetUsd || parseFloat(usage?.cost?.limit?.replace('$', '') || 0);
  const rpmCurrent = usage?.currentRPM || 0;
  const rpmLimit = config?.rpmLimit || usage?.rpmLimit || 60;

  if (!isEnabled) return null;

  return (
    <Box
      sx={{
        p: 1,
        mb: 0.5,
        borderRadius: 1,
        bgcolor: providerInfo.bgColor,
        border: '1px solid',
        borderColor: `${providerInfo.color}20`,
      }}
    >
      {/* Provider Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Icon size={12} style={{ color: providerInfo.color }} />
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: providerInfo.color, fontSize: '0.7rem' }}
          >
            {providerInfo.name}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
          {usage?.requests || 0} req
        </Typography>
      </Stack>

      {/* Usage Bars */}
      <Stack direction="row" spacing={1} alignItems="center">
        {/* Token Usage */}
        <Tooltip title="Token Usage" arrow>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1 }}>
            <Zap size={10} style={{ color: '#94a3b8' }} />
            <UsageBar
              value={tokenUsage}
              max={tokenLimit === 'unlimited' ? 'unlimited' : tokenLimit}
              label="Tokens"
              color={providerInfo.color}
            />
          </Stack>
        </Tooltip>

        {/* Cost (only for paid providers) */}
        {costLimit > 0 && (
          <Tooltip title="Budget Usage" arrow>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1 }}>
              <DollarSign size={10} style={{ color: '#94a3b8' }} />
              <UsageBar
                value={costUsage}
                max={costLimit}
                label="Cost"
                color="#10b981"
              />
            </Stack>
          </Tooltip>
        )}

        {/* RPM */}
        <Tooltip title={`Rate: ${rpmCurrent}/${rpmLimit} RPM`} arrow>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 40 }}>
            <TrendingUp size={10} style={{ color: '#94a3b8' }} />
            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
              {rpmCurrent}/{rpmLimit}
            </Typography>
          </Stack>
        </Tooltip>
      </Stack>
    </Box>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN WIDGET COMPONENT
// ────────────────────────────────────────────────────────────────────────────

const AIUsageWidget = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await fetchAIStatus();
      if (data) {
        setStatus(data);
        setError(null);
      } else {
        setError('Unable to fetch status');
      }
    } catch (e) {
      console.error('[AIUsageWidget] Fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Loading state
  if (loading && !status) {
    return (
      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, color: 'text.secondary' }}>
          <Cpu size={16} />
          <Typography variant="subtitle2" fontWeight="bold">AI Usage</Typography>
        </Stack>
        <Box sx={{ textAlign: 'center', py: 1 }}>
          <CircularProgress size={20} />
        </Box>
      </Paper>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderColor: 'warning.main', bgcolor: 'warning.lighter' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'warning.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="subtitle2" fontWeight="bold">AI Usage</Typography>
        </Stack>
        <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
          {error}
        </Typography>
      </Paper>
    );
  }

  const { config, usage, alerts } = status || {};
  const providers = config?.providers || {};
  const usageData = usage?.providers || {};

  // Count active alerts
  const activeAlerts = alerts?.filter(a => !a.acknowledged)?.length || 0;

  // Получаем общее состояние для пиктограммы в заголовке
  const getOverallStatus = () => {
    if (!status) return 'error';
    if (activeAlerts > 0) return 'warning';
    const enabledProviders = Object.entries(providers).filter(([_, p]) => p?.enabled !== false);
    if (enabledProviders.length === 0) return 'warning';
    return 'ok';
  };

  const getOverallIcon = () => {
    const overall = getOverallStatus();
    if (overall === 'ok') return <CheckCircle size={14} color="#4caf50" />;
    if (overall === 'warning') return <AlertTriangle size={14} color="#ff9800" />;
    return <AlertTriangle size={14} color="#f44336" />;
  };

  // Мини-индикаторы провайдеров для свёрнутого состояния
  const getMiniIndicators = () => {
    if (!status) return null;
    return (
      <Stack direction="row" spacing={0.5}>
        {Object.entries(PROVIDER_CONFIG).map(([key, providerInfo]) => {
          const isEnabled = providers[key]?.enabled !== false;
          const hasUsage = usageData[key]?.requests > 0;
          if (!isEnabled) return null;
          return (
            <Box
              key={key}
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: hasUsage ? providerInfo.color : 'text.disabled',
                opacity: hasUsage ? 1 : 0.5,
              }}
            />
          );
        })}
      </Stack>
    );
  };

  return (
    <Paper variant="outlined" sx={{ bgcolor: 'background.default', overflow: 'hidden' }}>
      {/* Header */}
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
          <Cpu size={16} />
          <Typography variant="subtitle2" fontWeight="bold">AI Usage</Typography>
          {/* Пиктограмма общего состояния */}
          {getOverallIcon()}
          {/* Бейдж с алертами */}
          {activeAlerts > 0 && (
            <Box
              sx={{
                px: 0.5,
                py: 0.1,
                borderRadius: 1,
                bgcolor: 'error.main',
                color: 'white',
                fontSize: '0.6rem',
                fontWeight: 'bold',
              }}
            >
              {activeAlerts}
            </Box>
          )}
          {/* Мини-индикаторы когда свёрнуто */}
          {!expanded && getMiniIndicators()}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                fetchStatus();
              }}
              sx={{ p: 0.5 }}
            >
              <RefreshCw size={12} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" sx={{ p: 0.5 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </IconButton>
        </Stack>
      </Stack>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          {/* Provider Rows */}
          {Object.keys(PROVIDER_CONFIG).map((provider) => (
            <ProviderRow
              key={provider}
              provider={provider}
              usage={usageData[provider]}
              config={providers[provider]}
            />
          ))}

          {/* Config Set Name */}
          {config?.name && (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                textAlign: 'right',
                color: 'text.disabled',
                fontSize: '0.6rem',
                mt: 0.5,
              }}
            >
              Config: {config.name}
            </Typography>
          )}

          {/* Last Updated */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'right',
              color: 'text.disabled',
              fontSize: '0.6rem',
            }}
          >
            Updated: {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '-'}
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default AIUsageWidget;
