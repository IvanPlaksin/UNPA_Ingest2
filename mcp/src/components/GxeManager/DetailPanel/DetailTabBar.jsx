import React from 'react';
import { BarChart3, Clock, GitBranch, Activity, FileText, Code, Workflow, Route } from 'lucide-react';
import useGxeManagerStore from '../../../stores/gxeManagerStore';

const TABS = [
  { id: 'overview',  label: 'Overview',  icon: BarChart3 },
  { id: 'graph',     label: 'Graph',     icon: Workflow },
  { id: 'process',   label: 'Process',   icon: Route },
  { id: 'timeline',  label: 'Timeline',  icon: Clock },
  { id: 'nodemap',   label: 'Node Map',  icon: GitBranch },
  { id: 'metrics',   label: 'Metrics',   icon: Activity },
  { id: 'logs',      label: 'Logs',      icon: FileText },
  { id: 'context',   label: 'Context',   icon: Code },
];

const DetailTabBar = () => {
  const activeTab = useGxeManagerStore(state => state.activeTab);
  const setActiveTab = useGxeManagerStore(state => state.setActiveTab);

  return (
    <div className="gxe-detail-tabs">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`gxe-detail-tabs__tab ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon size={14} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default DetailTabBar;
