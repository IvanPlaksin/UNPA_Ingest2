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
  const setExecutions = useGxeManagerStore(state => state.setExecutions);
  const upsertExecution = useGxeManagerStore(state => state.upsertExecution);
  const updateExecutionStatus = useGxeManagerStore(state => state.updateExecutionStatus);
  const setStats = useGxeManagerStore(state => state.setStats);
  const setSseStatus = useGxeManagerStore(state => state.setSseStatus);
  const setLoading = useGxeManagerStore(state => state.setLoading);
  const setError = useGxeManagerStore(state => state.setError);

  const [newExecDialogOpen, setNewExecDialogOpen] = useState(false);
  const sseRef = useRef(null);

  // ─── Load initial data ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading('executions', true);
    setLoading('stats', true);
    try {
      const [execs, statsData] = await Promise.all([
        gxeService.fetchExecutions(),
        gxeService.fetchStats(),
      ]);
      console.log('[GxeManager] Loaded:', { execCount: execs?.executions?.length, statsKeys: Object.keys(statsData || {}) });
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
  }, [setExecutions, setStats, setLoading, setError]);

  // ─── SSE connection ────────────────────────────────────────────────
  const connectToSSE = useCallback(() => {
    setSseStatus('connecting');

    sseRef.current = gxeService.connectSSE({
      onConnected: () => setSseStatus('connected'),
      onExecution: (data) => {
        if (data.executionId) upsertExecution(data);
      },
      onStatus: (data) => {
        if (data.executionId && data.to) {
          updateExecutionStatus(data.executionId, data.to, data.metadata);
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

  useEffect(() => {
    loadData();
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
  }, [loadData, connectToSSE, setStats]);

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
