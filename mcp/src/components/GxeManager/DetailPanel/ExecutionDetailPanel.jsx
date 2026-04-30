import React, { useState, useEffect } from 'react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';
import { fetchExecution } from '../../../services/gxeManager.service';
import { getGraphById, listGraphs } from '../../../services/graphCatalog.service';

import DetailHeader from './DetailHeader';
import DetailTabBar from './DetailTabBar';
import OverviewTab from './tabs/OverviewTab';
import GraphTab from './tabs/GraphTab';
import ProcessTab from './tabs/ProcessTab';
import TimelineTab from './tabs/TimelineTab';
import NodeMapTab from './tabs/NodeMapTab';
import MetricsTab from './tabs/MetricsTab';
import LogsTab from './tabs/LogsTab';
import ContextTab from './tabs/ContextTab';

import './ExecutionDetailPanel.css';

const TAB_COMPONENTS = {
  overview: OverviewTab,
  graph: GraphTab,
  process: ProcessTab,
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
  const [catalogInfo, setCatalogInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch detailed execution data + catalog graph info
  useEffect(() => {
    if (!selectedExecutionId) {
      setDetailedExecution(null);
      setCatalogInfo(null);
      return;
    }

    let cancelled = false;
    const loadDetails = async () => {
      setLoading(true);
      try {
        const data = await fetchExecution(selectedExecutionId);
        if (!cancelled) setDetailedExecution(data);

        // Fetch catalog graph info (description, version, entryId)
        if (data?.graphId) {
          try {
            let graph = null;
            try { graph = await getGraphById(data.graphId); } catch { /* not found by entryId */ }
            if (!graph && data.metadata?.graphName) {
              const res = await listGraphs({ search: data.metadata.graphName, limit: 1 });
              graph = res?.data?.[0] || null;
            }
            if (!cancelled && graph) {
              setCatalogInfo({
                description: graph.description || null,
                catalogEntryId: graph.id,
                versionNumber: graph.currentVersion || graph.version || null,
              });
            }
          } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('Failed to load execution details:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDetails();
    return () => { cancelled = true; };
  }, [selectedExecutionId]);

  // Merge SSE-updated execution with catalog info
  const enrichment = catalogInfo ? {
    _graphDescription: catalogInfo.description,
    _catalogEntryId: catalogInfo.catalogEntryId,
    _resolvedVersion: catalogInfo.versionNumber,
  } : {};

  const mergedExecution = execution
    ? { ...detailedExecution, ...execution, ...enrichment }
    : detailedExecution ? { ...detailedExecution, ...enrichment } : null;

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
      <DetailTabBar />
      <div className="gxe-detail__content">
        <TabComponent execution={mergedExecution} loading={loading} />
      </div>
    </div>
  );
};

export default ExecutionDetailPanel;
