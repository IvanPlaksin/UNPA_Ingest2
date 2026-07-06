/**
 * ImportSqlResults
 *
 * Container for displaying agentic import results.
 * Four sub-tabs: Summary, Graphs, Anomalies, Process Log.
 */

import React, { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Box, Tabs, Tab, Typography, Chip, IconButton,
  Button, LinearProgress,
} from '@mui/material';
import {
  BarChart3, Network, ScrollText,
  ExternalLink, Download, X,
  CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';

import useImportSqlStore from '../../stores/importSqlStore';
import MiniGraphView from './MiniGraphView';
import ProcessLog from './ProcessLog';
import AnomaliesTab from './AnomaliesTab';

const TAB_CONFIG = [
  { id: 'summary',    label: 'Summary',     icon: BarChart3 },
  { id: 'graphs',     label: 'Graphs',      icon: Network },
  { id: 'anomalies',  label: 'Anomalies',   icon: AlertTriangle },
  { id: 'process',    label: 'Process Log', icon: ScrollText },
];

export default function ImportSqlResults({ onClose, onOpenInGXE, onRestartPhase }) {
  const [activeTab, setActiveTab] = useState('summary');

  const {
    sessionId,
    sessionSummary,
    graphs,
    phases,
    qualityScore,
    status,
    catalogEntries,
    catalogDuplicates,
    anomalies,
  } = useImportSqlStore(useShallow(state => ({
    sessionId:         state.agentSessionId,
    sessionSummary:    state.agentSummary,
    graphs:            state.agentGraphs,
    phases:            state.agentPhases,
    qualityScore:      state.agentQualityScore,
    status:            state.agentStatus,
    catalogEntries:    state.agentCatalogEntries,
    catalogDuplicates: state.agentCatalogDuplicates,
    anomalies:         state.agentAnomalies,
  })));

  const statusIcon = useMemo(() => {
    if (status === 'complete') return <CheckCircle2 className="text-green-500" size={20} />;
    if (status === 'partial')  return <AlertTriangle className="text-yellow-500" size={20} />;
    if (status === 'failed')   return <XCircle className="text-red-500" size={20} />;
    return null;
  }, [status]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary':
        return <SummaryTab summary={sessionSummary} qualityScore={qualityScore} catalogEntries={catalogEntries} catalogDuplicates={catalogDuplicates} />;
      case 'graphs':
        return <GraphsTab graphs={graphs} onOpenInGXE={onOpenInGXE} />;
      case 'anomalies':
        return <AnomaliesTab anomalies={anomalies} sessionId={sessionId} onTaskCreated={(anomalyId) => useImportSqlStore.getState().markAnomalyTaskCreated(anomalyId)} />;
      case 'process':
        return <ProcessLog phases={phases} onRestartPhase={onRestartPhase} />;
      default:
        return null;
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      bgcolor: '#0d1117',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 2,
        borderBottom: '1px solid #30363d',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {statusIcon}
          <Typography variant="h6" sx={{ color: '#e6edf3' }}>
            Import Results
          </Typography>
          {qualityScore != null && (
            <Chip
              label={`Quality: ${Math.round(qualityScore * 100)}%`}
              size="small"
              sx={{
                bgcolor: qualityScore >= 0.8 ? '#238636' : qualityScore >= 0.6 ? '#9e6a03' : '#da3633',
                color: 'white',
              }}
            />
          )}
          {sessionId && (
            <Typography sx={{ color: '#6e7681', fontSize: 13 }}>
              Session: {sessionId.slice(0, 8)}
            </Typography>
          )}
        </Box>

        <IconButton onClick={onClose} sx={{ color: '#8b949e' }}>
          <X size={20} />
        </IconButton>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          borderBottom: '1px solid #30363d',
          '& .MuiTab-root': { color: '#8b949e', minHeight: 48, textTransform: 'none' },
          '& .Mui-selected': { color: '#58a6ff' },
        }}
      >
        {TAB_CONFIG.map(tab => (
          <Tab
            key={tab.id}
            value={tab.id}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <tab.icon size={16} />
                {tab.label}
                {tab.id === 'anomalies' && anomalies?.length > 0 && (
                  <Chip
                    label={anomalies.length}
                    size="small"
                    sx={{
                      height: 18, minWidth: 18, fontSize: 12,
                      bgcolor: anomalies.some(a => a.severity === 'high') ? '#da3633' : '#9e6a03',
                      color: 'white',
                    }}
                  />
                )}
              </Box>
            }
          />
        ))}
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {renderTabContent()}
      </Box>

      {/* Footer Actions */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 1,
        p: 2,
        borderTop: '1px solid #30363d',
      }}>
        <Button
          variant="outlined"
          startIcon={<Download size={16} />}
          size="small"
          sx={{ color: '#8b949e', borderColor: '#30363d' }}
        >
          Export
        </Button>
        {graphs && onOpenInGXE && (
          <Button
            variant="contained"
            startIcon={<ExternalLink size={16} />}
            size="small"
            onClick={() => onOpenInGXE(graphs)}
            sx={{ bgcolor: '#238636', '&:hover': { bgcolor: '#2ea043' } }}
          >
            Open in GXE
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SummaryTab
// ═══════════════════════════════════════════════════════════════════

function SummaryTab({ summary, qualityScore, catalogEntries = [], catalogDuplicates = [] }) {
  if (!summary) return <Typography color="#8b949e">No summary available</Typography>;

  const metrics = [
    { label: 'Tables Processed',  value: summary.tablesProcessed },
    { label: 'Entities Found',    value: summary.entitiesDiscovered },
    { label: 'Relationships',     value: summary.relationshipsFound },
    { label: 'Business Rules',    value: summary.rulesExtracted },
    { label: 'Calculations',      value: summary.calculationsFound },
    { label: 'Lifecycles',        value: summary.lifecyclesDetected },
  ];

  return (
    <Box>
      {/* Quality Score Bar */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ color: '#8b949e', mb: 1 }}>
          Extraction Quality
        </Typography>
        <LinearProgress
          variant="determinate"
          value={(qualityScore || 0) * 100}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: '#21262d',
            '& .MuiLinearProgress-bar': {
              bgcolor: qualityScore >= 0.8 ? '#238636' : qualityScore >= 0.6 ? '#9e6a03' : '#da3633',
            },
          }}
        />
      </Box>

      {/* Metrics Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
        {metrics.map(metric => (
          <Box
            key={metric.label}
            sx={{
              p: 2,
              bgcolor: '#161b22',
              borderRadius: 2,
              border: '1px solid #30363d',
            }}
          >
            <Typography sx={{ color: '#8b949e', fontSize: 13 }}>
              {metric.label}
            </Typography>
            <Typography variant="h4" sx={{ color: '#e6edf3', mt: 0.5 }}>
              {metric.value || 0}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Duration & Tokens */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Chip
          label={`Duration: ${formatDuration(summary.durationMs)}`}
          size="small"
          sx={{ bgcolor: '#21262d', color: '#8b949e' }}
        />
        <Chip
          label={`Tokens: ${(summary.tokensUsed || 0).toLocaleString()}`}
          size="small"
          sx={{ bgcolor: '#21262d', color: '#8b949e' }}
        />
      </Box>

      {/* Catalog Integration */}
      {catalogEntries.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ color: '#8b949e', mb: 1 }}>
            Saved to Graph Catalog
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {catalogEntries.map(entry => (
              <Chip
                key={entry.entryId}
                label={entry.graphType}
                size="small"
                icon={<CheckCircle2 size={14} />}
                sx={{
                  bgcolor: '#238636',
                  color: 'white',
                  textTransform: 'capitalize',
                  '& .MuiChip-icon': { color: 'white' },
                }}
              />
            ))}
          </Box>
          {catalogDuplicates.length > 0 && (
            <Typography sx={{ color: '#8b949e', fontSize: 13, mt: 1 }}>
              {catalogDuplicates.length} graph(s) already existed in catalog
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GraphsTab
// ═══════════════════════════════════════════════════════════════════

function GraphsTab({ graphs, onOpenInGXE }) {
  const graphTypes = graphs ? Object.keys(graphs) : [];
  const [activeGraph, setActiveGraph] = useState(graphTypes[0] || null);

  if (!graphs || graphTypes.length === 0) {
    return <Typography color="#8b949e">No graphs generated</Typography>;
  }

  const currentGraph = graphs[activeGraph];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Graph Type Tabs */}
      <Tabs
        value={activeGraph}
        onChange={(_, v) => setActiveGraph(v)}
        variant="scrollable"
        sx={{
          mb: 2,
          '& .MuiTab-root': {
            color: '#8b949e',
            textTransform: 'capitalize',
            minWidth: 'auto',
            px: 2,
          },
          '& .Mui-selected': { color: '#a855f7' },
        }}
      >
        {graphTypes.map(type => (
          <Tab
            key={type}
            value={type}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {type.replace(/([A-Z])/g, ' $1').trim()}
                <Chip
                  label={graphs[type].nodes?.length || 0}
                  size="small"
                  sx={{ bgcolor: '#30363d', color: '#8b949e', height: 20 }}
                />
              </Box>
            }
          />
        ))}
      </Tabs>

      {/* Graph Preview */}
      <Box sx={{ flex: 1, minHeight: 300 }}>
        {currentGraph && (
          <MiniGraphView
            nodes={currentGraph.nodes}
            edges={currentGraph.edges}
            graphType={activeGraph}
          />
        )}
      </Box>

      {/* Open specific graph in GXE */}
      {onOpenInGXE && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            size="small"
            startIcon={<ExternalLink size={14} />}
            onClick={() => onOpenInGXE({ [activeGraph]: currentGraph })}
            sx={{ color: '#58a6ff' }}
          >
            Open {activeGraph} in GXE
          </Button>
        </Box>
      )}
    </Box>
  );
}

function formatDuration(ms) {
  if (!ms) return '0s';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
