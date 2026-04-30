import React, { useMemo } from 'react';
import {
  Play, Pause, Clock, CheckCircle, XCircle,
  AlertTriangle, Activity, TrendingUp, Hourglass
} from 'lucide-react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';

import './StatsBar.css';

const STATUS_CONFIG = {
  running:   { key: 'RUNNING',   label: 'Running',   icon: Play,           colorClass: 'running' },
  waiting:   { key: 'WAITING',   label: 'Waiting',   icon: Hourglass,      colorClass: 'waiting' },
  paused:    { key: 'PAUSED',    label: 'Paused',    icon: Pause,          colorClass: 'paused' },
  queued:    { key: 'QUEUED',    label: 'Queued',    icon: Clock,          colorClass: 'queued' },
  completed: { key: 'COMPLETED', label: 'Completed', icon: CheckCircle,    colorClass: 'completed' },
  failed:    { key: 'FAILED',    label: 'Failed',    icon: XCircle,        colorClass: 'failed' },
  cancelled: { key: 'CANCELLED', label: 'Cancelled', icon: AlertTriangle,  colorClass: 'cancelled' },
};

const StatItem = ({ config, count, isActive, onClick }) => {
  const Icon = config.icon;
  return (
    <button
      className={`gxe-stats-item gxe-stats-item--${config.colorClass} ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title={`Filter by ${config.label}`}
    >
      <Icon size={16} className="gxe-stats-item__icon" />
      <span className="gxe-stats-item__count">{count}</span>
      <span className="gxe-stats-item__label">{config.label}</span>
    </button>
  );
};

const StatsBar = () => {
  const filters = useGxeManagerStore(state => state.filters);
  const toggleStatusFilter = useGxeManagerStore(state => state.toggleStatusFilter);
  const alerts = useGxeManagerStore(state => state.alerts);
  const getFilteredStats = useGxeManagerStore(state => state.getFilteredStats);
  const executionsVersion = useGxeManagerStore(state => state.executions.size);

  // Compute stats from loaded executions (not from server /stats endpoint)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredStats = useMemo(() => getFilteredStats(), [executionsVersion, filters]);

  const activeStatuses = filters.status || [];
  const byStatus = filteredStats.byStatus || {};

  const handleStatClick = (statusKey) => {
    toggleStatusFilter(statusKey);
  };

  const handleClearFilters = () => {
    activeStatuses.forEach(status => {
      toggleStatusFilter(status);
    });
  };

  return (
    <div className="gxe-stats-bar">
      <div className="gxe-stats-bar__items">
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <StatItem
            key={key}
            config={config}
            count={byStatus[config.key] || 0}
            isActive={activeStatuses.includes(config.key)}
            onClick={() => handleStatClick(config.key)}
          />
        ))}
      </div>

      <div className="gxe-stats-bar__divider" />

      <div className="gxe-stats-bar__total">
        <span className="gxe-stats-bar__total-value">{filteredStats.total || 0}</span>
        <span className="gxe-stats-bar__total-label">loaded</span>
      </div>

      {alerts.length > 0 && (
        <div className="gxe-stats-bar__alerts">
          <AlertTriangle size={14} />
          <span>{alerts.length}</span>
        </div>
      )}

      {activeStatuses.length > 0 && (
        <button
          className="gxe-stats-bar__clear"
          onClick={handleClearFilters}
          title="Clear all filters"
        >
          Clear ({activeStatuses.length})
        </button>
      )}
    </div>
  );
};

export default StatsBar;
