import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Inbox, Loader2 } from 'lucide-react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';
import ExecutionRow from './ExecutionRow';

import './ExecutionList.css';

const ROW_HEIGHT = 100;

const GroupHeader = ({ label, count }) => (
  <div className="gxe-list__group-header">
    <span className="gxe-list__group-label">{label}</span>
    <span className="gxe-list__group-count">{count}</span>
  </div>
);

const EmptyState = ({ hasFilters }) => (
  <div className="gxe-list__empty">
    <Inbox size={48} className="gxe-list__empty-icon" />
    <h3>No executions found</h3>
    <p>
      {hasFilters
        ? 'Try adjusting your filters to see more results'
        : 'Executions will appear here when graphs are run'
      }
    </p>
  </div>
);

const LoadingState = () => (
  <div className="gxe-list__loading">
    <Loader2 size={24} className="spinning" />
    <span>Loading executions...</span>
  </div>
);

const ExecutionList = () => {
  const getFilteredExecutions = useGxeManagerStore(state => state.getFilteredExecutions);
  const getGroupedExecutions = useGxeManagerStore(state => state.getGroupedExecutions);
  const groupBy = useGxeManagerStore(state => state.groupBy);
  const filters = useGxeManagerStore(state => state.filters);
  const loading = useGxeManagerStore(state => state.loading.executions);
  const selectedExecutionId = useGxeManagerStore(state => state.selectedExecutionId);

  // Subscribe to executions.size as primitive to detect changes
  const executionsVersion = useGxeManagerStore(state => state.executions.size);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const executionsList = useMemo(() => {
    const result = getFilteredExecutions();
    console.log('[ExecutionList] size:', executionsVersion, 'filtered:', result.length, 'first:', result[0]?.executionId?.slice(0, 20));
    return result;
  }, [executionsVersion, filters, groupBy]);

  // Track newly added executions for animation
  const prevExecutionIds = useRef(new Set());
  const newExecutionIds = useRef(new Set());

  useEffect(() => {
    const currentIds = new Set(executionsList.map(e => e.executionId));
    newExecutionIds.current = new Set(
      [...currentIds].filter(id => !prevExecutionIds.current.has(id))
    );
    prevExecutionIds.current = currentIds;

    if (newExecutionIds.current.size > 0) {
      const timer = setTimeout(() => { newExecutionIds.current.clear(); }, 1500);
      return () => clearTimeout(timer);
    }
  }, [executionsList]);

  const hasFilters = useMemo(() => {
    return (
      filters.status?.length > 0 ||
      filters.graphId ||
      filters.search ||
      filters.dateFrom ||
      filters.dateTo
    );
  }, [filters]);

  // Build flat list with group headers if grouping is enabled
  const items = useMemo(() => {
    if (groupBy === 'none') {
      return executionsList.map(exec => ({ type: 'execution', data: exec }));
    }

    const grouped = getGroupedExecutions();
    const result = [];
    for (const group of grouped) {
      result.push({ type: 'header', data: { label: group.label, count: group.items.length } });
      for (const exec of group.items) {
        result.push({ type: 'execution', data: exec });
      }
    }
    return result;
  }, [executionsList, groupBy, getGroupedExecutions]);

  const Row = useCallback(({ index, style }) => {
    const item = items[index];

    if (item.type === 'header') {
      return (
        <div style={style}>
          <GroupHeader label={item.data.label} count={item.data.count} />
        </div>
      );
    }

    const execution = item.data;
    const isSelected = selectedExecutionId === execution.executionId;
    const isNew = newExecutionIds.current.has(execution.executionId);

    return (
      <div style={style}>
        <ExecutionRow execution={execution} isSelected={isSelected} isNew={isNew} />
      </div>
    );
  }, [items, selectedExecutionId]);

  if (loading && executionsList.length === 0) return <LoadingState />;
  if (executionsList.length === 0) return <EmptyState hasFilters={hasFilters} />;

  return (
    <div className="gxe-list" style={{ overflowY: 'auto' }}>
      {items.map((item, index) => {
        if (item.type === 'header') {
          return <GroupHeader key={`h-${index}`} label={item.data.label} count={item.data.count} />;
        }
        const execution = item.data;
        return (
          <ExecutionRow
            key={execution.executionId}
            execution={execution}
            isSelected={selectedExecutionId === execution.executionId}
            isNew={newExecutionIds.current.has(execution.executionId)}
          />
        );
      })}
    </div>
  );
};

export default ExecutionList;
