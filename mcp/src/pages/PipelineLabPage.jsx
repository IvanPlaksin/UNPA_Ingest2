/**
 * Unified Pipeline Lab Page
 *
 * Consolidated page for text processing pipeline visualization and testing.
 * Combines features from both PipelineLabPage and EnhancedPipelineLabPage:
 * - Real-time SSE pipeline processing
 * - 3D Knowledge Graph visualization
 * - Pipeline stage visualizer
 * - Knowledge reconstruction
 * - E2E Auto Validator
 * - Tuning Lab with provider switching
 * - AI Analysis panel
 *
 * @module pages/PipelineLabPage
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Tabs, Tab,
  LinearProgress, Alert, Stack, IconButton, Tooltip
} from '@mui/material';
import {
  Play, Zap, RotateCcw, Upload, Network, Sparkles,
  FlaskConical, Database, Award, Sliders, GitCompare, Microscope, Layers
} from 'lucide-react';

// Pipeline Lab Components
import PipelineStagesVisualizer from '../components/PipelineLab/PipelineStagesVisualizer';
import KnowledgeReconstruction from '../components/PipelineLab/KnowledgeReconstruction';
import E2EAutoValidator from '../components/PipelineLab/E2EAutoValidator';
import { TuningLabPanel } from '../components/PipelineLab/TuningLab';

// Enhanced Pipeline Components
import PipelineContainer from '../components/EnhancedPipelineLab/PipelineContainer';
import KnowledgeGraph3D from '../components/EnhancedPipelineLab/KnowledgeGraph3D';
import AnalysisPanel from '../components/EnhancedPipelineLab/AnalysisPanel';

// Incremental KG Components
import IncrementalKGPanel from '../components/IncrementalKG/IncrementalKGPanel';

// Services
import extractionService from '../services/extraction.service';

const SAMPLE_TEXT = `<div>The IMIS system handles budget calculations for UN operations.
It integrates with Umoja for financial reporting.</div>

<p>The <code>calculateBudget()</code> function implements the core allocation logic
based on ST/SGB/2019/1 guidelines. John Smith from OICT is responsible for maintenance.</p>

&nbsp;Contact: budget-team@un.org for questions about allocation processes.`;

// Tab Panel wrapper
const TabPanel = ({ children, value, index, sx = {} }) => (
  <Box
    role="tabpanel"
    hidden={value !== index}
    sx={{
      flex: 1,
      overflow: 'hidden',
      display: value === index ? 'flex' : 'none',
      flexDirection: 'column',
      ...sx
    }}
  >
    {value === index && children}
  </Box>
);

// Main tabs configuration
const MAIN_TABS = [
  { icon: Microscope, label: 'Real-time Pipeline', id: 'realtime' },
  { icon: Zap, label: 'Stage Visualizer', id: 'stages' },
  { icon: Database, label: 'Knowledge Reconstruction', id: 'knowledge' },
  { icon: Award, label: 'E2E Validator', id: 'validator' },
  { icon: Sliders, label: 'Tuning Lab', id: 'tuning' },
  { icon: Layers, label: 'Incremental KG', id: 'incremental-kg' }
];

export default function PipelineLabPage() {
  // Main tab state
  const [activeTab, setActiveTab] = useState(0);

  // Real-time pipeline state
  const [inputText, setInputText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [stageOutputs, setStageOutputs] = useState({});
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [error, setError] = useState(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState(0);
  const eventSourceRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Handle process pipeline
  const handleProcess = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsProcessing(true);
    setCurrentStage(0);
    setStageOutputs({});
    setGraphData({ nodes: [], links: [] });
    setError(null);
    setAnalysisReady(false);

    try {
      const { sessionId: newSessionId } = await extractionService.startPipeline(inputText);
      setSessionId(newSessionId);

      const eventSource = extractionService.subscribeToPipeline(newSessionId, {
        onStageStart: (data) => {
          setCurrentStage(data.stage);
          setStageOutputs(prev => ({
            ...prev,
            [data.stage]: { status: 'processing', output: null }
          }));
        },
        onStageComplete: (data) => {
          setStageOutputs(prev => ({
            ...prev,
            [data.stage]: { status: 'complete', output: data.output }
          }));

          if (data.stage === 9 && data.output) {
            setGraphData(data.output);
          }
        },
        onPipelineComplete: () => {
          setIsProcessing(false);
          setAnalysisReady(true);
          setRightPanelTab(1); // Switch to AI Analysis
        },
        onError: (message) => {
          setError(message);
          setIsProcessing(false);
        }
      });

      eventSourceRef.current = eventSource;
    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
    }
  }, [inputText]);

  // Handle reset
  const handleReset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setInputText('');
    setSessionId(null);
    setIsProcessing(false);
    setCurrentStage(0);
    setStageOutputs({});
    setGraphData({ nodes: [], links: [] });
    setError(null);
    setAnalysisReady(false);
    setRightPanelTab(0);
  }, []);

  // Handle load sample
  const handleLoadSample = useCallback(() => {
    setInputText(SAMPLE_TEXT);
  }, []);

  // Handle stage validation
  const handleValidateStage = useCallback((stageId, action) => {
    console.log(`Stage ${stageId}: ${action}`);
    setStageOutputs(prev => ({
      ...prev,
      [stageId]: { ...prev[stageId], validated: true, action }
    }));
  }, []);

  const progress = (currentStage / 9) * 100;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Paper sx={{ px: 3, py: 2, borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <FlaskConical size={28} />
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Pipeline Lab
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Visualize text transformations, test extraction, and tune parameters
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Main Tabs */}
      <Paper sx={{ borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ px: 2 }}
        >
          {MAIN_TABS.map((tab, idx) => (
            <Tab
              key={tab.id}
              icon={<tab.icon size={18} />}
              iconPosition="start"
              label={tab.label}
              sx={{ minHeight: 56 }}
            />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Content */}

      {/* Tab 0: Real-time Pipeline (from EnhancedPipelineLabPage) */}
      <TabPanel value={activeTab} index={0}>
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Panel - Input & Stages */}
          <Box sx={{
            width: '50%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: 1,
            borderColor: 'divider',
            minHeight: 0,
            overflow: 'hidden'
          }}>
            {/* Input Section */}
            <Paper sx={{ m: 2, p: 2, flexShrink: 0 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  Input Text
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleLoadSample}
                    disabled={isProcessing}
                  >
                    Load Sample
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Upload size={16} />}
                    disabled={isProcessing}
                  >
                    Upload
                  </Button>
                </Box>
              </Box>

              <TextField
                multiline
                rows={5}
                fullWidth
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste or type text to process..."
                disabled={isProcessing}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.85rem'
                  }
                }}
              />

              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={isProcessing ? <Zap size={18} /> : <Play size={18} />}
                  onClick={handleProcess}
                  disabled={isProcessing || !inputText.trim()}
                >
                  {isProcessing ? `Processing Stage ${currentStage}/9...` : 'Process Pipeline'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RotateCcw size={18} />}
                  onClick={handleReset}
                  disabled={isProcessing}
                >
                  Reset
                </Button>
              </Box>
            </Paper>

            {/* Progress Bar */}
            {(isProcessing || currentStage > 0) && (
              <Box sx={{ px: 2, mb: 1, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Pipeline Progress
                  </Typography>
                  <Typography variant="caption" color="primary">
                    {Math.round(progress)}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            )}

            {/* Error Alert */}
            {error && (
              <Box sx={{ px: 2, mb: 1, flexShrink: 0 }}>
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              </Box>
            )}

            {/* Pipeline Stages */}
            <PipelineContainer
              stageOutputs={stageOutputs}
              currentStage={currentStage}
              onValidate={handleValidateStage}
            />
          </Box>

          {/* Right Panel - Graph & Analysis */}
          <Box sx={{
            width: '50%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Tab Header */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs
                value={rightPanelTab}
                onChange={(_, v) => setRightPanelTab(v)}
                sx={{
                  minHeight: 48,
                  '& .MuiTab-root': { minHeight: 48, textTransform: 'none' }
                }}
              >
                <Tab
                  icon={<Network size={18} />}
                  iconPosition="start"
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      Knowledge Graph
                      {graphData.nodes.length > 0 && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            bgcolor: 'primary.main',
                            color: 'white',
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            fontSize: '0.7rem'
                          }}
                        >
                          {graphData.nodes.length}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <Tab
                  icon={<Sparkles size={18} />}
                  iconPosition="start"
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      AI Analysis
                      {analysisReady && (
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: 'success.main',
                            animation: 'pulse 2s infinite',
                            '@keyframes pulse': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.5 }
                            }
                          }}
                        />
                      )}
                    </Box>
                  }
                />
              </Tabs>
            </Box>

            {/* Tab Content */}
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Knowledge Graph Tab */}
              <Box
                sx={{
                  flex: 1,
                  display: rightPanelTab === 0 ? 'flex' : 'none',
                  flexDirection: 'column',
                  minHeight: 0
                }}
              >
                {/* Graph Toolbar */}
                <Box sx={{
                  p: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0
                }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    {[
                      { label: 'Strategic', color: '#FF6B9D' },
                      { label: 'Business', color: '#00D4FF' },
                      { label: 'Code', color: '#7B61FF' }
                    ].map(layer => (
                      <Box key={layer.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: layer.color
                        }} />
                        <Typography variant="caption">{layer.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      {graphData.nodes.length > 0
                        ? `${graphData.nodes.length} nodes | ${graphData.links.length} links`
                        : 'Waiting for data...'}
                    </Typography>
                    <Button size="small" variant="outlined" sx={{ minWidth: 'auto', px: 1 }}>
                      Reset
                    </Button>
                    <Button size="small" variant="outlined" sx={{ minWidth: 'auto', px: 1 }}>
                      Export
                    </Button>
                  </Box>
                </Box>

                {/* 3D Graph */}
                <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
                  <KnowledgeGraph3D
                    nodes={graphData.nodes}
                    links={graphData.links}
                    isReady={graphData.nodes.length > 0}
                  />
                </Box>
              </Box>

              {/* AI Analysis Tab */}
              <Box
                sx={{
                  flex: 1,
                  display: rightPanelTab === 1 ? 'flex' : 'none',
                  flexDirection: 'column',
                  minHeight: 0
                }}
              >
                <AnalysisPanel
                  sessionId={sessionId}
                  isReady={analysisReady}
                  onAnalysisComplete={() => {
                    console.log('Analysis complete');
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </TabPanel>

      {/* Tab 1: Pipeline Stages Visualizer */}
      <TabPanel value={activeTab} index={1} sx={{ p: 2 }}>
        <PipelineStagesVisualizer />
      </TabPanel>

      {/* Tab 2: Knowledge Reconstruction */}
      <TabPanel value={activeTab} index={2} sx={{ p: 2 }}>
        <KnowledgeReconstruction />
      </TabPanel>

      {/* Tab 3: E2E Auto Validator */}
      <TabPanel value={activeTab} index={3} sx={{ p: 2 }}>
        <E2EAutoValidator />
      </TabPanel>

      {/* Tab 4: Tuning Lab */}
      <TabPanel value={activeTab} index={4}>
        <Box sx={{ height: '100%', overflow: 'auto', bgcolor: 'background.default', p: 2 }}>
          <TuningLabPanel />
        </Box>
      </TabPanel>

      {/* Tab 5: Incremental Knowledge Graph */}
      <TabPanel value={activeTab} index={5}>
        <IncrementalKGPanel />
      </TabPanel>
    </Box>
  );
}
