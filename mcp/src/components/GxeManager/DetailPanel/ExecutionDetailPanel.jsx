import React, { useState, useEffect } from 'react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';
import { fetchExecution } from '../../../services/gxeManager.service';

import DetailHeader from './DetailHeader';
import DetailTabBar from './DetailTabBar';
import ControlBar from '../ControlBar/ControlBar';
import OverviewTab from './tabs/OverviewTab';
import TimelineTab from './tabs/TimelineTab';
import NodeMapTab from './tabs/NodeMapTab';
import MetricsTab from './tabs/MetricsTab';
import LogsTab from './tabs/LogsTab';
import ContextTab from './tabs/ContextTab';

import './ExecutionDetailPanel.css';

const TAB_COMPONENTS = {
  overview: OverviewTab,
  timeline: TimelineTab,
  nodemap: NodeMapTab,
  metrics: MetricsTab,
  logs: LogsTab,
  context: ContextTab,
};

const ExecutionDetailPanel = () => {
  const selectedExecutionId = useGxeManagerStore(state => state.selectedExecutionId);
  const execution = useGxeManagerStore(state =>
    state.selectedExecutionId ? state.executions.get(state.selectedExecutionId) : null
  );
  const activeTab = useGxeManagerStore(state => state.activeTab);
  const clearSelection = useGxeManagerStore(state => state.clearSelection);

  const [detailedExecution, setDetailedExecution] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch detailed execution data when selection changes
  useEffect(() => {
    if (!selectedExecutionId) {
      setDetailedExecution(null);
      return;
    }

    let cancelled = false;
    const loadDetails = async () => {
      setLoading(true);
      try {
        const data = await fetchExecution(selectedExecutionId);
        if (!cancelled) setDetailedExecution(data);
      } catch (err) {
        console.error('Failed to load execution details:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDetails();
    return () => { cancelled = true; };
  }, [selectedExecutionId]);

  // Merge SSE-updated execution with detailed data
  const mergedExecution = execution
    ? { ...detailedExecution, ...execution }
    : detailedExecution;

  if (!mergedExecution) {
    return (
      <div className="gxe-detail gxe-detail--empty">
        <p>Select an execution to view details</p>
      </div>
    );
  }

  const TabComponent = TAB_COMPONENTS[activeTab] || OverviewTab;

  return (
    <div className="gxe-detail">
      <DetailHeader execution={mergedExecution} onClose={clearSelection} />
      <ControlBar execution={mergedExecution} />
      <DetailTabBar />
      <div className="gxe-detail__content">
        <TabComponent execution={mergedExecution} loading={loading} />
      </div>
    </div>
  );
};

export default ExecutionDetailPanel;
