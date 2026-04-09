/**
 * @fileoverview Enhanced Incremental Knowledge Graph Panel
 * @module components/IncrementalKG/IncrementalKGPanel
 * @version 2.0.0
 *
 * Main panel for the Incremental Knowledge Graph extraction pipeline.
 * Features:
 * - Step-by-step AND automatic extraction modes
 * - 3D graph visualization with NEW vs EXISTING differentiation
 * - AI model selection (Ollama, Gemini, Claude)
 * - Real-time progress tracking
 * - Round management and history
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Tabs, Tab,
  LinearProgress, Alert, Stack, Chip, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Card, CardContent, Grid, Divider, CircularProgress, FormControl,
  InputLabel, Select, MenuItem, Switch, FormControlLabel, Collapse
} from '@mui/material';
import {
  Play, Square, RotateCcw, Upload, Database, GitBranch,
  Layers, TrendingUp, Clock, CheckCircle, AlertCircle, Activity,
  Settings, Zap, Eye, Brain, Network, ChevronDown, ChevronUp
} from 'lucide-react';
import incrementalKGService from '../../services/incrementalKG.service';
import IncrementalKG3DGraph from './IncrementalKG3DGraph';
import ExtractionStepper from './ExtractionStepper';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const AI_MODELS = [
  // Ollama - Local models
  { id: 'ollama-llama3', name: 'Ollama - Llama 3', provider: 'ollama', model: 'llama3', tier: 'local' },
  { id: 'ollama-llama3.2', name: 'Ollama - Llama 3.2', provider: 'ollama', model: 'llama3.2', tier: 'local' },
  { id: 'ollama-phi4', name: 'Ollama - Phi-4', provider: 'ollama', model: 'phi4', tier: 'local' },
  { id: 'ollama-mistral', name: 'Ollama - Mistral', provider: 'ollama', model: 'mistral', tier: 'local' },
  { id: 'ollama-qwen2.5', name: 'Ollama - Qwen 2.5', provider: 'ollama', model: 'qwen2.5', tier: 'local' },

  // Google Gemini - Cloud
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', model: 'gemini-2.0-flash', tier: 'cloud' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', model: 'gemini-1.5-pro', tier: 'cloud' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', model: 'gemini-1.5-flash', tier: 'cloud' },

  // Anthropic Claude - Cloud (актуальные модели на январь 2026)
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5 ($5/$25)', provider: 'anthropic', model: 'claude-opus-4-5-20251101', tier: 'cloud-premium' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5 ($3/$15)', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', tier: 'cloud' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5 ($1/$5)', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', tier: 'cloud' }
];

const SAMPLE_TEXTS = {
  un: `The IMIS system handles budget calculations for UN operations.
It integrates with Umoja for financial reporting based on ST/SGB/2019/1 guidelines.
John Smith from OICT is responsible for the calculateBudget() function maintenance.
The system connects to the central Oracle database for data persistence.
The Security Council resolution 2024/15 references peacekeeping operations in MINUSMA.`,

  tech: `The React application uses Redux for state management and connects to a PostgreSQL database.
The API is built with Express.js and uses JWT for authentication.
The deployment pipeline runs on GitHub Actions with Docker containerization.
Maria Garcia maintains the authentication module and the user dashboard component.`
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'primary', compact = false }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent sx={{ py: compact ? 1.5 : 2, '&:last-child': { pb: compact ? 1.5 : 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary">
            {title}
          </Typography>
          <Typography variant={compact ? 'h5' : 'h4'} fontWeight={700} color={`${color}.main`}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {Icon && (
          <Box sx={{ p: compact ? 0.5 : 1, borderRadius: 2, bgcolor: `${color}.main`, opacity: 0.15 }}>
            <Icon size={compact ? 18 : 24} color={`var(--mui-palette-${color}-main)`} />
          </Box>
        )}
      </Stack>
    </CardContent>
  </Card>
);

const RoundHistoryTable = ({ rounds }) => (
  <TableContainer>
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Round</TableCell>
          <TableCell>Status</TableCell>
          <TableCell align="right">Docs</TableCell>
          <TableCell align="right">Entities</TableCell>
          <TableCell align="right">Merged</TableCell>
          <TableCell align="right">Relations</TableCell>
          <TableCell>Duration</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rounds.map((round) => (
          <TableRow key={round.roundNumber}>
            <TableCell>#{round.roundNumber}</TableCell>
            <TableCell>
              <Chip
                size="small"
                label={round.status}
                color={round.status === 'completed' ? 'success' : 'warning'}
              />
            </TableCell>
            <TableCell align="right">{round.documentsProcessed}</TableCell>
            <TableCell align="right">{round.entities?.total || 0}</TableCell>
            <TableCell align="right">{round.entities?.merged || 0}</TableCell>
            <TableCell align="right">{round.relationships?.total || 0}</TableCell>
            <TableCell>{round.duration || '-'}</TableCell>
          </TableRow>
        ))}
        {rounds.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} align="center">
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No extraction rounds yet
              </Typography>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </TableContainer>
);

const QuickModePanel = ({
  inputText,
  setInputText,
  selectedModel,
  setSelectedModel,
  config,
  setConfig,
  isProcessing,
  onProcess,
  onReset,
  lastResult,
  error,
  setError
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      {/* Input Section */}
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Quick Extraction
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setInputText(SAMPLE_TEXTS.un)}
              disabled={isProcessing}
            >
              UN Sample
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setInputText(SAMPLE_TEXTS.tech)}
              disabled={isProcessing}
            >
              Tech Sample
            </Button>
            <IconButton size="small" onClick={onReset} disabled={isProcessing}>
              <RotateCcw size={16} />
            </IconButton>
          </Stack>
        </Stack>

        {/* Model and Settings Row */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>AI Model</InputLabel>
            <Select
              value={selectedModel}
              label="AI Model"
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isProcessing}
            >
              {AI_MODELS.map(model => (
                <MenuItem key={model.id} value={model.id}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Brain size={14} />
                    <span>{model.name}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="text"
            onClick={() => setShowAdvanced(!showAdvanced)}
            endIcon={showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          >
            Advanced
          </Button>
        </Stack>

        {/* Advanced Settings */}
        <Collapse in={showAdvanced}>
          <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, mb: 2 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <FormControlLabel
                control={
                  <Switch
                    checked={config.useLLM}
                    onChange={(e) => setConfig(prev => ({ ...prev, useLLM: e.target.checked }))}
                    size="small"
                  />
                }
                label="LLM"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.useRegex}
                    onChange={(e) => setConfig(prev => ({ ...prev, useRegex: e.target.checked }))}
                    size="small"
                  />
                }
                label="Regex"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.autoMerge}
                    onChange={(e) => setConfig(prev => ({ ...prev, autoMerge: e.target.checked }))}
                    size="small"
                  />
                }
                label="Auto Merge"
              />
              <Chip
                label={`Confidence: ${config.minConfidence}`}
                size="small"
                variant="outlined"
              />
            </Stack>
          </Box>
        </Collapse>

        <TextField
          multiline
          rows={4}
          fullWidth
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste text to extract entities and relationships..."
          disabled={isProcessing}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }
          }}
        />

        <Button
          variant="contained"
          fullWidth
          startIcon={isProcessing ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
          onClick={onProcess}
          disabled={isProcessing || !inputText.trim()}
          sx={{ mt: 2 }}
        >
          {isProcessing ? 'Processing...' : 'Extract & Store'}
        </Button>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Result */}
      {lastResult && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Extraction Result
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Entities"
                value={lastResult.entities?.total || 0}
                subtitle={`${lastResult.entities?.new || 0} new, ${lastResult.entities?.merged || 0} merged`}
                icon={Database}
                color="primary"
                compact
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Relationships"
                value={lastResult.relationships?.total || 0}
                subtitle={`${lastResult.relationships?.new || 0} new`}
                icon={GitBranch}
                color="secondary"
                compact
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Duration"
                value={`${lastResult.duration || 0}ms`}
                icon={Clock}
                color="info"
                compact
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                title="Status"
                value={lastResult.success ? 'Success' : 'Failed'}
                icon={lastResult.success ? CheckCircle : AlertCircle}
                color={lastResult.success ? 'success' : 'error'}
                compact
              />
            </Grid>
          </Grid>

          {lastResult.stats && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Provider: {lastResult.stats.provider || 'N/A'} |
                Regex: {lastResult.stats.regex || 0} |
                LLM: {lastResult.stats.llm || 0} |
                Merged: {lastResult.stats.merged || 0}
              </Typography>
            </Box>
          )}
        </Paper>
      )}
    </Stack>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const IncrementalKGPanel = () => {
  // State - General
  const [activeTab, setActiveTab] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const [error, setError] = useState(null);

  // State - Data
  const [rounds, setRounds] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // State - Input
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState('ollama-llama3');
  const [config, setConfig] = useState({
    useLLM: true,
    useRegex: true,
    minConfidence: 0.6,
    autoMerge: true,
    resolutionThreshold: 0.7
  });

  // State - Graph Data
  const [graphData, setGraphData] = useState({
    newEntities: [],
    newRelationships: [],
    existingEntities: [],
    existingRelationships: []
  });

  const eventSourceRef = useRef(null);

  // Load initial data
  useEffect(() => {
    loadRounds();
    loadStats();
    loadGraphData();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadRounds = async () => {
    try {
      const data = await incrementalKGService.getRounds();
      setRounds(data.rounds || []);
    } catch (err) {
      console.error('Failed to load rounds:', err);
    }
  };

  const loadStats = async () => {
    try {
      const data = await incrementalKGService.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadGraphData = async () => {
    try {
      // Load recent entities for visualization
      const [entities, relationships] = await Promise.all([
        incrementalKGService.getEntities({ limit: 100 }),
        incrementalKGService.getRelationships({ limit: 200 })
      ]);

      // Separate new vs existing based on round
      const currentRoundNum = stats?.provenance?.currentRound || 0;

      setGraphData({
        newEntities: entities.entities?.filter(e => e.extractionRound === currentRoundNum) || [],
        newRelationships: relationships.relationships?.filter(r => r.extractionRound === currentRoundNum) || [],
        existingEntities: entities.entities?.filter(e => e.extractionRound < currentRoundNum) || [],
        existingRelationships: relationships.relationships?.filter(r => r.extractionRound < currentRoundNum) || []
      });
    } catch (err) {
      console.error('Failed to load graph data:', err);
    }
  };

  // Handle quick text processing
  const handleQuickProcess = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsProcessing(true);
    setError(null);
    setLastResult(null);

    try {
      const model = AI_MODELS.find(m => m.id === selectedModel);
      const result = await incrementalKGService.processText(inputText, {
        sourceId: `manual_input_${Date.now()}`,
        sourceType: 'MANUAL',
        model: model?.model,
        provider: model?.provider,
        ...config
      });

      setLastResult(result);

      // Update graph data with new extraction
      if (result.entities) {
        setGraphData(prev => ({
          ...prev,
          newEntities: result.entities.details || [],
          newRelationships: result.relationships?.details || []
        }));
      }

      loadRounds();
      loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, selectedModel, config]);

  // Handle step completion from stepper
  const handleStepComplete = useCallback((stepId, result) => {
    if (stepId === 'extract' && result.entities) {
      setGraphData(prev => ({
        ...prev,
        newEntities: result.entities,
        // Also update relationships from extraction if available
        ...(result.relationships ? { newRelationships: result.relationships } : {})
      }));

      // If graph context was loaded during extraction, update existing data
      if (result.graphContext) {
        setGraphData(prev => ({
          ...prev,
          existingEntities: result.graphContext.existingNodes || prev.existingEntities,
          existingRelationships: result.graphContext.existingRelationships || prev.existingRelationships
        }));
      }
    }
    if (stepId === 'relationships' && result.relationships) {
      setGraphData(prev => ({
        ...prev,
        newRelationships: result.relationships
      }));
    }
  }, []);

  // Handle extraction complete from stepper
  const handleExtractionComplete = useCallback((results) => {
    setLastResult({
      success: true,
      entities: {
        total: results.resolve?.resolution?.new + results.resolve?.resolution?.merged || 0,
        new: results.resolve?.resolution?.new || 0,
        merged: results.resolve?.resolution?.merged || 0
      },
      relationships: {
        total: results.relationships?.relationships?.length || 0,
        new: results.store?.stored?.relationships || 0
      },
      duration: Object.values(results).reduce((sum, r) => sum + (r?.duration || 0), 0)
    });
    loadRounds();
    loadStats();
    loadGraphData();
  }, []);

  // Handle graph context loaded from stepper (existing graph nodes for incremental visualization)
  const handleGraphContextLoaded = useCallback((context) => {
    if (!context) return;

    console.log('[IncrementalKGPanel] Graph context loaded:', context);

    // Update existing entities and relationships from context
    setGraphData(prev => ({
      ...prev,
      existingEntities: context.existingNodes || [],
      existingRelationships: context.existingRelationships || []
    }));
  }, []);

  // API service for stepper
  const stepperApiService = useMemo(() => ({
    extractEntities: async (text, options) => {
      // Call backend extraction step
      const response = await fetch('/api/v1/incremental-kg/process/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          stepOnly: 'extract',
          ...options
        })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    resolveEntities: async (entities, options) => {
      const response = await fetch('/api/v1/incremental-kg/process/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entities, ...options })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    extractRelationships: async (text, entities, options) => {
      const response = await fetch('/api/v1/incremental-kg/process/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, entities, ...options })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    storeToGraph: async (data) => {
      const response = await fetch('/api/v1/incremental-kg/process/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.data;
    }
  }), []);

  // Handle reset
  const handleReset = () => {
    setInputText('');
    setLastResult(null);
    setError(null);
    setGraphData({
      newEntities: [],
      newRelationships: [],
      existingEntities: graphData.existingEntities,
      existingRelationships: graphData.existingRelationships
    });
  };

  // Handle node click in graph
  const handleNodeClick = useCallback((node) => {
    console.log('Node clicked:', node);
    // Could open details panel or highlight connections
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <Layers size={24} />
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Incremental Knowledge Graph
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Extract entities with provenance tracking and entity resolution
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center">
            {/* Current round indicator */}
            <Chip
              icon={<Activity size={14} />}
              label={`Round #${stats?.provenance?.currentRound || 0}`}
              color="primary"
              variant="outlined"
              size="small"
            />

            {/* Total entities */}
            <Chip
              icon={<Database size={14} />}
              label={`${stats?.provenance?.totals?.entities || 0} entities`}
              size="small"
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Main Content - Split Layout */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Controls and Stepper */}
        <Box sx={{ width: '45%', borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
              <Tab label="Quick Mode" icon={<Zap size={14} />} iconPosition="start" sx={{ minHeight: 48 }} />
              <Tab label="Step-by-Step" icon={<Activity size={14} />} iconPosition="start" sx={{ minHeight: 48 }} />
              <Tab label="Statistics" icon={<TrendingUp size={14} />} iconPosition="start" sx={{ minHeight: 48 }} />
              <Tab label="History" icon={<Clock size={14} />} iconPosition="start" sx={{ minHeight: 48 }} />
            </Tabs>
          </Box>

          {/* Tab Content */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {/* Tab 0: Quick Mode */}
            {activeTab === 0 && (
              <QuickModePanel
                inputText={inputText}
                setInputText={setInputText}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                config={config}
                setConfig={setConfig}
                isProcessing={isProcessing}
                onProcess={handleQuickProcess}
                onReset={handleReset}
                lastResult={lastResult}
                error={error}
                setError={setError}
              />
            )}

            {/* Tab 1: Step-by-Step Mode */}
            {activeTab === 1 && (
              <ExtractionStepper
                onStepComplete={handleStepComplete}
                onExtractionComplete={handleExtractionComplete}
                onGraphContextLoaded={handleGraphContextLoaded}
                apiService={stepperApiService}
              />
            )}

            {/* Tab 2: Statistics */}
            {activeTab === 2 && (
              <Stack spacing={3}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <StatCard
                      title="Total Rounds"
                      value={stats?.provenance?.totalRounds || 0}
                      subtitle={`${stats?.provenance?.completedRounds || 0} completed`}
                      icon={Layers}
                      color="primary"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <StatCard
                      title="Total Entities"
                      value={stats?.provenance?.totals?.entities || 0}
                      icon={Database}
                      color="success"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <StatCard
                      title="Entities Merged"
                      value={stats?.provenance?.totals?.merged || 0}
                      subtitle={stats?.provenance?.overallMergeRate || '0%'}
                      icon={GitBranch}
                      color="warning"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <StatCard
                      title="Total Relationships"
                      value={stats?.provenance?.totals?.relationships || 0}
                      icon={Network}
                      color="info"
                    />
                  </Grid>
                </Grid>

                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                    Pipeline Configuration
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={`LLM: ${stats?.config?.useLLM ? 'ON' : 'OFF'}`} size="small" />
                    <Chip label={`Regex: ${stats?.config?.useRegex ? 'ON' : 'OFF'}`} size="small" />
                    <Chip label={`Min Confidence: ${stats?.config?.minConfidence || 0.6}`} size="small" />
                    <Chip label={`Auto Merge: ${stats?.config?.autoMerge ? 'ON' : 'OFF'}`} size="small" />
                    <Chip label={`Resolution: ${stats?.config?.resolutionThreshold || 0.7}`} size="small" />
                  </Box>
                </Paper>
              </Stack>
            )}

            {/* Tab 3: History */}
            {activeTab === 3 && (
              <Paper>
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600}>
                      Extraction Rounds
                    </Typography>
                    <Button size="small" onClick={loadRounds}>
                      Refresh
                    </Button>
                  </Stack>
                </Box>
                <RoundHistoryTable rounds={rounds} />
              </Paper>
            )}
          </Box>
        </Box>

        {/* Right Panel - 3D Graph Visualization */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: '#0F172A' }}>
          <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={1}>
                <Eye size={16} />
                <Typography variant="subtitle2" fontWeight={600}>
                  Knowledge Graph Visualization
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Chip
                  size="small"
                  label={`New: ${graphData.newEntities.length}`}
                  sx={{ bgcolor: '#00FF88', color: 'black', fontWeight: 600 }}
                />
                <Chip
                  size="small"
                  label={`Connected: ${graphData.existingEntities.length}`}
                  variant="outlined"
                />
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ flex: 1 }}>
            <IncrementalKG3DGraph
              newEntities={graphData.newEntities}
              newRelationships={graphData.newRelationships}
              existingEntities={graphData.existingEntities}
              existingRelationships={graphData.existingRelationships}
              currentRound={stats?.provenance?.currentRound || 0}
              isProcessing={isProcessing}
              onNodeClick={handleNodeClick}
              height="100%"
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default IncrementalKGPanel;
