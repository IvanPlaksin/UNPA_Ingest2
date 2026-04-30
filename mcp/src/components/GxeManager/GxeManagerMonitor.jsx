import React, { useState, useEffect, useCallback, useRef } from 'react';
import useGxeManagerStore from '../../stores/gxeManagerStore';
import * as gxeService from '../../services/gxeManager.service';

import GxeManagerToolbar from './Toolbar/GxeManagerToolbar';
import StatsBar from './StatsBar/StatsBar';
import ExecutionList from './ExecutionList/ExecutionList';
import ExecutionDetailPanel from './DetailPanel/ExecutionDetailPanel';
import NewExecutionDialog from './ControlBar/dialogs/NewExecutionDialog';

import './GxeManagerMonitor.css';

const GxeManagerMonitor = () => {
  const detailPanelOpen = useGxeManagerStore(state => state.detailPanelOpen);
  const filters = useGxeManagerStore(state => state.filters);
  const setExecutions = useGxeManagerStore(state => state.setExecutions);
  const upsertExecution = useGxeManagerStore(state => state.upsertExecution);
  const updateExecutionStatus = useGxeManagerStore(state => state.updateExecutionStatus);
  const setStats = useGxeManagerStore(state => state.setStats);
  const setSseStatus = useGxeManagerStore(state => state.setSseStatus);
  const setLoading = useGxeManagerStore(state => state.setLoading);
  const setError = useGxeManagerStore(state => state.setError);

  const [newExecDialogOpen, setNewExecDialogOpen] = useState(false);
  const sseRef = useRef(null);
  const debounceRef = useRef(null);

  // ─── Build query params from current filters ──────────────────────
  const buildQueryParams = useCallback((currentFilters) => {
    const params = { limit: 200 };
    if (currentFilters.status?.length > 0) {
      params.status = currentFilters.status.join(',');
    }
    if (currentFilters.dateFrom) params.since = currentFilters.dateFrom;
    if (currentFilters.dateTo) params.until = currentFilters.dateTo;
    if (currentFilters.graphId) params.graphId = currentFilters.graphId;
    return params;
  }, []);

  // ─── Load data (respects filters) ─────────────────────────────────
  const loadData = useCallback(async (currentFilters) => {
    setLoading('executions', true);
    setLoading('stats', true);
    try {
      const params = buildQueryParams(currentFilters || {});
      const [execs, statsData] = await Promise.all([
        gxeService.fetchExecutions(params),
        gxeService.fetchStats(),
      ]);
      console.log('[GxeManager] Loaded:', { execCount: execs?.executions?.length, params });
      setExecutions(execs.executions || execs || []);
      setStats(statsData);
      setError(null);
    } catch (err) {
      console.error('[GxeManager] Failed to load data:', err);
      setError(err.message);
    } finally {
      setLoading('executions', false);
      setLoading('stats', false);
    }
  }, [setExecutions, setStats, setLoading, setError, buildQueryParams]);

  // ─── SSE connection ────────────────────────────────────────────────
  const connectToSSE = useCallback(() => {
    setSseStatus('connecting');

    sseRef.current = gxeService.connectSSE({
      onConnected: () => setSseStatus('connected'),
      onExecution: (data) => {
        if (data.executionId) upsertExecution(data);
      },
      onStatus: async (data) => {
        if (!data.executionId) return;
        // Status events carry partial data — fetch the full record
        try {
          const full = await gxeService.fetchExecution(data.executionId);
          if (full) upsertExecution(full);
        } catch {
          // Fallback: apply what we have
          if (data.status) updateExecutionStatus(data.executionId, data.status);
        }
      },
      onResult: (data) => {
        if (data.executionId) upsertExecution(data);
      },
      onError: () => {
        setSseStatus('error');
        setTimeout(() => { if (sseRef.current) connectToSSE(); }, 5000);
      },
    });
  }, [setSseStatus, upsertExecution, updateExecutionStatus]);

  // ─── Initial load + SSE ─────────────────────────────────────────────
  useEffect(() => {
    loadData(filters);
    connectToSSE();

    const interval = setInterval(async () => {
      try {
        const statsData = await gxeService.fetchStats();
        setStats(statsData);
      } catch { /* ignore */ }
    }, 30000);

    return () => {
      clearInterval(interval);
      gxeService.disconnectSSE();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectToSSE, setStats]);

  // ─── Re-fetch when server-side filters change ─────────────────────
  const filtersKey = JSON.stringify([filters.status, filters.graphId, filters.dateFrom, filters.dateTo]);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(filters), 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const handleNewExecution = useCallback(() => {
    setNewExecDialogOpen(true);
  }, []);

  console.log('[Monitor] Rendering, detailPanelOpen:', detailPanelOpen);

  return (
    <div className="gxe-manager-monitor">
      <GxeManagerToolbar onNewExecution={handleNewExecution} />
      <StatsBar />

      <div className="gxe-manager-monitor__main">
        <div className={`gxe-manager-monitor__list ${detailPanelOpen ? 'gxe-manager-monitor__list--narrow' : ''}`}>
          <ExecutionList />
        </div>

        {detailPanelOpen && (
          <div className="gxe-manager-monitor__detail">
            <ExecutionDetailPanel />
          </div>
        )}
      </div>

      {newExecDialogOpen && (
        <NewExecutionDialog
          onClose={() => setNewExecDialogOpen(false)}
          onSuccess={(execution) => {
            upsertExecution(execution);
          }}
        />
      )}
    </div>
  );
};

export default GxeManagerMonitor;
