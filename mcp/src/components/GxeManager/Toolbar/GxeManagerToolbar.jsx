import React, { useState, useCallback } from 'react';
import {
  Search, Filter, ChevronDown, Plus,
  RefreshCw, Wifi, WifiOff,
  SortAsc, SortDesc, Grid3X3, List
} from 'lucide-react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';
import { fetchExecutions, fetchStats } from '../../../services/gxeManager.service';

import './GxeManagerToolbar.css';

const STATUS_OPTIONS = [
  { value: 'RUNNING', label: 'Running' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const GROUP_BY_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'status', label: 'Status' },
  { value: 'graphId', label: 'Graph' },
  { value: 'triggerType', label: 'Trigger Type' },
  { value: 'priority', label: 'Priority' },
];

const SORT_BY_OPTIONS = [
  { value: 'createdAt', label: 'Created Time' },
  { value: 'startedAt', label: 'Start Time' },
  { value: 'priority', label: 'Priority' },
  { value: 'graphId', label: 'Graph Name' },
];

const LiveIndicator = () => {
  const sseConnected = useGxeManagerStore(state => state.sseConnected);
  const sseReconnecting = useGxeManagerStore(state => state.sseReconnecting);

  if (sseReconnecting) {
    return (
      <div className="gxe-toolbar__live gxe-toolbar__live--reconnecting">
        <RefreshCw size={14} className="spinning" />
        <span>Reconnecting...</span>
      </div>
    );
  }

  return (
    <div className={`gxe-toolbar__live ${sseConnected ? 'connected' : 'disconnected'}`}>
      {sseConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span>{sseConnected ? 'Live' : 'Disconnected'}</span>
    </div>
  );
};

const FilterDropdown = ({ isOpen, onClose }) => {
  const filters = useGxeManagerStore(state => state.filters);
  const setFilters = useGxeManagerStore(state => state.setFilters);
  const toggleStatusFilter = useGxeManagerStore(state => state.toggleStatusFilter);

  if (!isOpen) return null;

  return (
    <div className="gxe-toolbar__dropdown" onClick={e => e.stopPropagation()}>
      <div className="gxe-toolbar__dropdown-section">
        <h4>Status</h4>
        <div className="gxe-toolbar__checkbox-group">
          {STATUS_OPTIONS.map(opt => (
            <label key={opt.value} className="gxe-toolbar__checkbox">
              <input
                type="checkbox"
                checked={filters.status?.includes(opt.value) || false}
                onChange={() => toggleStatusFilter(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="gxe-toolbar__dropdown-section">
        <h4>Graph ID</h4>
        <input
          type="text"
          placeholder="Filter by graph..."
          value={filters.graphId || ''}
          onChange={e => setFilters({ graphId: e.target.value || null })}
          className="gxe-toolbar__input"
        />
      </div>
    </div>
  );
};

const GroupByDropdown = ({ isOpen, onClose }) => {
  const groupBy = useGxeManagerStore(state => state.groupBy);
  const setGroupBy = useGxeManagerStore(state => state.setGroupBy);

  if (!isOpen) return null;

  return (
    <div className="gxe-toolbar__dropdown gxe-toolbar__dropdown--narrow" onClick={e => e.stopPropagation()}>
      {GROUP_BY_OPTIONS.map(opt => (
        <button key={opt.value}
          className={`gxe-toolbar__dropdown-item ${groupBy === opt.value ? 'active' : ''}`}
          onClick={() => { setGroupBy(opt.value); onClose(); }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

const SortByDropdown = ({ isOpen, onClose }) => {
  const sortBy = useGxeManagerStore(state => state.sortBy);
  const sortDir = useGxeManagerStore(state => state.sortDir);
  const setSortBy = useGxeManagerStore(state => state.setSortBy);
  const toggleSortOrder = useGxeManagerStore(state => state.toggleSortOrder);

  if (!isOpen) return null;

  return (
    <div className="gxe-toolbar__dropdown gxe-toolbar__dropdown--narrow" onClick={e => e.stopPropagation()}>
      {SORT_BY_OPTIONS.map(opt => (
        <button key={opt.value}
          className={`gxe-toolbar__dropdown-item ${sortBy === opt.value ? 'active' : ''}`}
          onClick={() => { setSortBy(opt.value); onClose(); }}
        >
          {opt.label}
          {sortBy === opt.value && (
            sortDir === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />
          )}
        </button>
      ))}
      <div className="gxe-toolbar__dropdown-divider" />
      <button className="gxe-toolbar__dropdown-item" onClick={toggleSortOrder}>
        {sortDir === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
      </button>
    </div>
  );
};

const GxeManagerToolbar = ({ onNewExecution }) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [groupByOpen, setGroupByOpen] = useState(false);
  const [sortByOpen, setSortByOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filters = useGxeManagerStore(state => state.filters);
  const setFilters = useGxeManagerStore(state => state.setFilters);
  const setExecutions = useGxeManagerStore(state => state.setExecutions);
  const setStats = useGxeManagerStore(state => state.setStats);
  const groupBy = useGxeManagerStore(state => state.groupBy);

  const activeFilterCount = (filters.status?.length || 0) +
    (filters.graphId ? 1 : 0);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [execs, statsData] = await Promise.all([fetchExecutions(), fetchStats()]);
      setExecutions(execs.executions || execs || []);
      setStats(statsData);
    } finally {
      setRefreshing(false);
    }
  }, [setExecutions, setStats]);

  const handleSearch = useCallback((e) => {
    setFilters({ search: e.target.value });
  }, [setFilters]);

  const closeAllDropdowns = useCallback(() => {
    setFilterOpen(false);
    setGroupByOpen(false);
    setSortByOpen(false);
  }, []);

  return (
    <div className="gxe-toolbar" onClick={closeAllDropdowns}>
      <LiveIndicator />

      <div className="gxe-toolbar__search">
        <Search size={16} />
        <input type="text" placeholder="Search executions..."
          value={filters.search || ''} onChange={handleSearch} />
      </div>

      <div className="gxe-toolbar__dropdown-wrapper">
        <button className={`gxe-toolbar__btn ${activeFilterCount > 0 ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); setFilterOpen(!filterOpen); }}>
          <Filter size={16} /> <span>Filters</span>
          {activeFilterCount > 0 && <span className="gxe-toolbar__badge">{activeFilterCount}</span>}
          <ChevronDown size={14} />
        </button>
        <FilterDropdown isOpen={filterOpen} onClose={() => setFilterOpen(false)} />
      </div>

      <div className="gxe-toolbar__dropdown-wrapper">
        <button className={`gxe-toolbar__btn ${groupBy !== 'none' ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); setGroupByOpen(!groupByOpen); }}>
          <Grid3X3 size={16} /> <span>Group</span> <ChevronDown size={14} />
        </button>
        <GroupByDropdown isOpen={groupByOpen} onClose={() => setGroupByOpen(false)} />
      </div>

      <div className="gxe-toolbar__dropdown-wrapper">
        <button className="gxe-toolbar__btn"
          onClick={e => { e.stopPropagation(); setSortByOpen(!sortByOpen); }}>
          <List size={16} /> <span>Sort</span> <ChevronDown size={14} />
        </button>
        <SortByDropdown isOpen={sortByOpen} onClose={() => setSortByOpen(false)} />
      </div>

      <div className="gxe-toolbar__spacer" />

      <button className="gxe-toolbar__btn gxe-toolbar__btn--icon"
        onClick={handleRefresh} disabled={refreshing} title="Refresh">
        <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
      </button>

      <button className="gxe-toolbar__btn gxe-toolbar__btn--primary" onClick={onNewExecution}>
        <Plus size={16} /> <span>New Execution</span>
      </button>
    </div>
  );
};

export default GxeManagerToolbar;
