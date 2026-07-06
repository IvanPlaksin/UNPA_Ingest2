import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Switch, Divider,
  Alert, CircularProgress, Button, Tooltip, Stack,
  Chip, IconButton, Collapse,
} from '@mui/material';
import { ShieldAlert, RotateCcw, ChevronDown, ChevronRight, Info } from 'lucide-react';

const API_BASE = 'http://localhost:3010/api/v1/llm-access';

// Provider display config
const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', short: 'Claude',  color: '#e97333', bg: 'rgba(233,115,51,0.12)' },
  azure:     { label: 'Azure',     short: 'Azure',   color: '#0078d4', bg: 'rgba(0,120,212,0.12)'  },
  gemini:    { label: 'Gemini',    short: 'Gemini',  color: '#4285f4', bg: 'rgba(66,133,244,0.12)' },
  ollama:    { label: 'Ollama',    short: 'Ollama',  color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
};

const PROVIDER_ORDER = ['anthropic', 'azure', 'gemini', 'ollama'];

// ── Global provider row ────────────────────────────────────────────────────────

function GlobalProviderHeader({ providerGlobals, activeProviders, onToggle, busyKeys }) {
  return (
    <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ShieldAlert size={15} color="#ef4444" />
          <Typography variant="subtitle2" fontWeight={700}>Global Provider Switches</Typography>
          <Tooltip title="Disabling a provider here blocks ALL services from using it, regardless of service-level settings." placement="right">
            <IconButton size="small" sx={{ p: 0.25 }}>
              <Info size={13} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Master switches — override all per-service settings below
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
        {PROVIDER_ORDER.filter(pId => activeProviders.has(pId)).map(pId => {
          const cfg = PROVIDER_CONFIG[pId] || { label: pId, color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
          const enabled = providerGlobals[pId] !== false;
          const key = `provider:${pId}`;
          const busy = busyKeys.has(key);
          return (
            <Box
              key={pId}
              sx={{
                flex: '1 1 120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                p: 1.5,
                borderRight: '1px solid',
                borderColor: 'divider',
                bgcolor: enabled ? cfg.bg : 'transparent',
                transition: 'background 0.2s',
                opacity: busy ? 0.6 : 1,
                '&:last-child': { borderRight: 'none' },
              }}
            >
              <Typography variant="caption" fontWeight={700} sx={{ color: cfg.color }}>
                {cfg.label}
              </Typography>
              {busy
                ? <CircularProgress size={18} thickness={5} sx={{ color: cfg.color }} />
                : (
                  <Switch
                    checked={enabled}
                    onChange={e => onToggle(key, e.target.checked)}
                    size="small"
                    sx={{
                      '& .MuiSwitch-thumb': { bgcolor: enabled ? cfg.color : undefined },
                      '& .MuiSwitch-track': { bgcolor: enabled ? `${cfg.color}66` : undefined },
                    }}
                  />
                )
              }
              <Chip
                label={enabled ? 'ON' : 'OFF'}
                size="small"
                sx={{
                  fontSize: '0.6rem', fontWeight: 700, height: 16,
                  bgcolor: enabled ? cfg.bg : 'transparent',
                  color: enabled ? cfg.color : 'text.disabled',
                  border: 'none',
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

// ── Service group matrix row ───────────────────────────────────────────────────

function ServiceRow({ group, providerGlobals, onToggle, busyKeys, allProviders }) {
  const [expanded, setExpanded] = useState(false);
  const activeProviders = PROVIDER_ORDER.filter(pId => group.providers.includes(pId));

  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      {/* Row content */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', minHeight: 56 }}>
        {/* Label column */}
        <Box
          sx={{
            width: 220,
            flexShrink: 0,
            px: 2,
            py: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            borderRight: '1px solid',
            borderColor: 'divider',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
          onClick={() => setExpanded(v => !v)}
        >
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ color: 'text.disabled', flexShrink: 0 }}>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </Box>
            <Typography variant="body2" fontWeight={600} noWrap>
              {group.label}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 2.5, lineHeight: 1.3, display: 'block' }} noWrap>
            {group.description}
          </Typography>
        </Box>

        {/* Provider cells */}
        {PROVIDER_ORDER.filter(pId => allProviders.has(pId)).map(pId => {
          const supported = group.providers.includes(pId);
          const cfg = PROVIDER_CONFIG[pId] || { color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
          const globalOff = providerGlobals[pId] === false;
          const svcKey = `svc:${group.id}:${pId}`;
          const svcEnabled = group.providerStates?.[pId] !== false;
          const effectivelyEnabled = !globalOff && svcEnabled;
          const busy = busyKeys.has(svcKey);

          return (
            <Box
              key={pId}
              sx={{
                flex: '1 1 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid',
                borderColor: 'divider',
                bgcolor: !supported
                  ? 'action.disabledBackground'
                  : (effectivelyEnabled ? cfg.bg : 'transparent'),
                transition: 'background 0.2s',
                opacity: globalOff ? 0.4 : 1,
                '&:last-child': { borderRight: 'none' },
              }}
            >
              {!supported ? (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                  —
                </Typography>
              ) : busy ? (
                <CircularProgress size={16} thickness={5} sx={{ color: cfg.color }} />
              ) : (
                <Tooltip
                  title={
                    globalOff
                      ? `"${pId}" is globally disabled — enable it in the header first`
                      : `${group.label} → ${pId}: ${svcEnabled ? 'Enabled' : 'Disabled'}`
                  }
                  placement="top"
                >
                  <span>
                    <Switch
                      checked={svcEnabled}
                      disabled={globalOff}
                      onChange={e => onToggle(svcKey, e.target.checked)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-thumb': { bgcolor: (svcEnabled && !globalOff) ? cfg.color : undefined },
                        '& .MuiSwitch-track': { bgcolor: (svcEnabled && !globalOff) ? `${cfg.color}66` : undefined },
                      }}
                    />
                  </span>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Expanded files list */}
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ bgcolor: 'action.hover', px: 3, py: 1, pl: 5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
            Affected files:
          </Typography>
          {group.files.map(f => (
            <Typography key={f} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.6 }}>
              api/src/{f}
            </Typography>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LLMAccessControlPage() {
  const [data, setData] = useState(null);      // { providers, serviceGroups, providerGlobals, state }
  const [busyKeys, setBusyKeys] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChanged, setLastChanged] = useState(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  const handleToggle = useCallback(async (key, enabled) => {
    setBusyKeys(prev => new Set(prev).add(key));

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const newState = { ...prev.state, [key]: enabled };
      // Update providerGlobals
      const newProviderGlobals = { ...prev.providerGlobals };
      if (key.startsWith('provider:')) {
        const pId = key.split(':')[1];
        newProviderGlobals[pId] = enabled;
      }
      // Update serviceGroups
      const newGroups = prev.serviceGroups.map(grp => {
        if (key.startsWith(`svc:${grp.id}:`)) {
          const pId = key.split(':')[2];
          return {
            ...grp,
            providerStates: { ...grp.providerStates, [pId]: enabled },
          };
        }
        return grp;
      });
      return { ...prev, state: newState, providerGlobals: newProviderGlobals, serviceGroups: newGroups };
    });

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { enabled: confirmed } = await res.json();
      if (confirmed !== enabled) {
        // Server disagrees — refetch
        await fetchState();
      }
      setLastChanged({ key, enabled: confirmed, at: new Date().toLocaleTimeString() });
    } catch (err) {
      // Revert — full refetch
      await fetchState();
      setError(`Failed to toggle "${key}": ${err.message}`);
    } finally {
      setBusyKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [fetchState]);

  const handleResetAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastChanged({ key: '(all)', enabled: true, at: new Date().toLocaleTimeString() });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Collect all providers that appear in at least one service group
  const allProviders = React.useMemo(() => {
    if (!data) return new Set(PROVIDER_ORDER);
    const set = new Set();
    for (const grp of (data.serviceGroups || [])) {
      for (const pId of (grp.providers || [])) set.add(pId);
    }
    return set;
  }, [data]);

  const activeProviderList = PROVIDER_ORDER.filter(pId => allProviders.has(pId));

  const disabledCount = data
    ? Object.values(data.state).filter(v => v === false).length
    : 0;

  return (
    <Box sx={{ p: 3, height: '100%', overflowY: 'auto', maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShieldAlert size={20} color="#ef4444" />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={700}>LLM Access Control</Typography>
          <Typography variant="caption" color="text.secondary">
            Matrix: service group × provider. Changes apply immediately in-process and persist to Redis.
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1} alignItems="center">
          {disabledCount > 0 && (
            <Chip label={`${disabledCount} blocked`} size="small" color="warning" variant="outlined" />
          )}
          {lastChanged && (
            <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 220, textAlign: 'right' }}>
              Last: <strong>{lastChanged.key.replace('svc:', '')}</strong> → {lastChanged.enabled ? 'ON' : 'OFF'} {lastChanged.at}
            </Typography>
          )}
          <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} onClick={handleResetAll} disabled={loading}>
            Enable All
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !data && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <>
          {/* Global provider switches */}
          <GlobalProviderHeader
            providerGlobals={data.providerGlobals}
            activeProviders={allProviders}
            onToggle={handleToggle}
            busyKeys={busyKeys}
          />

          {/* Matrix table */}
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            {/* Column headers */}
            <Box sx={{ display: 'flex', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ width: 220, flexShrink: 0, px: 2, py: 1, borderRight: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Service Group
                </Typography>
              </Box>
              {activeProviderList.map(pId => {
                const cfg = PROVIDER_CONFIG[pId] || { label: pId, color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
                const globalOff = data.providerGlobals[pId] === false;
                return (
                  <Box
                    key={pId}
                    sx={{
                      flex: '1 1 0',
                      py: 1,
                      px: 0.5,
                      textAlign: 'center',
                      borderRight: '1px solid',
                      borderColor: 'divider',
                      bgcolor: globalOff ? 'action.disabledBackground' : cfg.bg,
                      '&:last-child': { borderRight: 'none' },
                    }}
                  >
                    <Typography variant="caption" fontWeight={700} sx={{ color: globalOff ? 'text.disabled' : cfg.color }}>
                      {cfg.label}
                    </Typography>
                    {globalOff && (
                      <Typography variant="caption" display="block" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                        globally off
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Service rows */}
            {data.serviceGroups.map(grp => (
              <ServiceRow
                key={grp.id}
                group={grp}
                providerGlobals={data.providerGlobals}
                onToggle={handleToggle}
                busyKeys={busyKeys}
                allProviders={allProviders}
              />
            ))}
          </Paper>

          {/* Footer legend */}
          <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              <strong>— </strong>= provider not used by this service. &nbsp;
              <strong>Faded row</strong> = provider globally disabled (override). &nbsp;
              Click a service name to expand its affected files. &nbsp;
              <strong>Service toggle</strong> is independent from global — both must be ON for calls to succeed.
            </Typography>
          </Paper>
        </>
      )}
    </Box>
  );
}
