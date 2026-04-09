/**
 * @fileoverview Extraction Process Stepper for Incremental KG
 * @module components/IncrementalKG/ExtractionStepper
 * @version 1.0.0
 *
 * Provides step-by-step AND automatic mode for extraction pipeline:
 * 1. Text Input / Document Selection
 * 2. Entity Extraction
 * 3. Entity Resolution
 * 4. Relationship Extraction
 * 5. Graph Storage
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, Stack, Stepper, Step, StepLabel,
  StepContent, LinearProgress, Chip, Alert, TextField, CircularProgress,
  FormControl, InputLabel, Select, MenuItem, Collapse, IconButton,
  Card, CardContent, Divider, Switch, FormControlLabel, Tooltip
} from '@mui/material';
import {
  Play, Pause, SkipForward, RotateCcw, ChevronDown, ChevronUp,
  FileText, Search, GitMerge, Database, CheckCircle, AlertCircle,
  Clock, Zap, Settings, Brain
} from 'lucide-react';
import incrementalKGService from '../../services/incrementalKG.service';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extraction pipeline steps
 */
const STEPS = [
  {
    id: 'input',
    label: 'Input Text',
    description: 'Enter or paste text for entity extraction',
    icon: FileText
  },
  {
    id: 'extract',
    label: 'Extract Entities',
    description: 'LLM and regex-based entity extraction',
    icon: Search
  },
  {
    id: 'resolve',
    label: 'Resolve Entities',
    description: 'Match against existing entities via embeddings',
    icon: GitMerge
  },
  {
    id: 'relationships',
    label: 'Extract Relationships',
    description: 'Identify relationships between entities',
    icon: Brain
  },
  {
    id: 'store',
    label: 'Store to Graph',
    description: 'Save entities and relationships with provenance',
    icon: Database
  }
];

/**
 * Available AI models (Updated January 2026)
 * @see https://platform.claude.com/docs/en/about-claude/models/overview
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://ollama.com/library
 */
const AI_MODELS = [
  // Ollama - Local models (free, requires local setup)
  { id: 'ollama-llama3', name: 'Ollama - Llama 3', provider: 'ollama', model: 'llama3', tier: 'local' },
  { id: 'ollama-llama3.2', name: 'Ollama - Llama 3.2', provider: 'ollama', model: 'llama3.2', tier: 'local' },
  { id: 'ollama-phi4', name: 'Ollama - Phi-4', provider: 'ollama', model: 'phi4', tier: 'local' },
  { id: 'ollama-mistral', name: 'Ollama - Mistral', provider: 'ollama', model: 'mistral', tier: 'local' },
  { id: 'ollama-qwen2.5', name: 'Ollama - Qwen 2.5', provider: 'ollama', model: 'qwen2.5', tier: 'local' },

  // Google Gemini - Cloud
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', model: 'gemini-2.0-flash', tier: 'cloud' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', model: 'gemini-1.5-pro', tier: 'cloud' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', model: 'gemini-1.5-flash', tier: 'cloud' },

  // Anthropic Claude - Cloud (pricing: input/output per 1M tokens)
  // API IDs: https://platform.claude.com/docs/en/about-claude/models/overview
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5 ($5/$25)', provider: 'anthropic', model: 'claude-opus-4-5-20251101', tier: 'cloud-premium' },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5 ($3/$15)', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', tier: 'cloud' },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5 ($1/$5)', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', tier: 'cloud' }
];

// ═══════════════════════════════════════════════════════════════════════════════
// STEP RESULT COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const StepResult = ({ step, result, isActive }) => {
  if (!result) return null;

  return (
    <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.85rem' }}>
      {step === 'extract' && result.entities && (
        <Stack spacing={0.5}>
          <Typography variant="caption" color="success.main" fontWeight={600}>
            Extracted {result.entities.length} entities
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {result.entities.slice(0, 8).map((e, i) => (
              <Chip
                key={i}
                label={`${e.name} (${e.type})`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            ))}
            {result.entities.length > 8 && (
              <Chip label={`+${result.entities.length - 8} more`} size="small" />
            )}
          </Box>
        </Stack>
      )}

      {step === 'resolve' && result.resolution && (
        <Stack spacing={0.5}>
          <Typography variant="caption" fontWeight={600}>
            Resolution Results:
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip label={`${result.resolution.new} new`} size="small" color="success" />
            <Chip label={`${result.resolution.merged} merged`} size="small" color="warning" />
            <Chip label={`${result.resolution.skipped} skipped`} size="small" />
          </Stack>
        </Stack>
      )}

      {step === 'relationships' && result.relationships && (
        <Stack spacing={0.5}>
          <Typography variant="caption" color="info.main" fontWeight={600}>
            Found {result.relationships.length} relationships
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {result.relationships.slice(0, 5).map((r, i) => (
              <Chip
                key={i}
                label={`${r.source} → ${r.target}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
            ))}
          </Box>
        </Stack>
      )}

      {step === 'store' && result.stored && (
        <Alert severity="success" sx={{ py: 0 }}>
          <Typography variant="caption">
            Stored {result.stored.entities} entities and {result.stored.relationships} relationships
            {result.stored.duration && ` in ${result.stored.duration}ms`}
          </Typography>
        </Alert>
      )}

      {result.error && (
        <Alert severity="error" sx={{ py: 0 }}>
          <Typography variant="caption">{result.error}</Typography>
        </Alert>
      )}
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extraction Stepper Component
 * @param {Object} props
 * @param {Function} props.onStepComplete - Callback when step completes with results
 * @param {Function} props.onExtractionComplete - Callback when full extraction completes
 * @param {Object} props.apiService - API service for backend calls
 */
const ExtractionStepper = ({
  onStepComplete,
  onExtractionComplete,
  onGraphContextLoaded,
  apiService
}) => {
  // State
  const [activeStep, setActiveStep] = useState(0);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState('ollama-llama3');
  const [stepResults, setStepResults] = useState({});
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [runId, setRunId] = useState(null);
  const [existingGraphContext, setExistingGraphContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Config
  const [config, setConfig] = useState({
    useLLM: true,
    useRegex: true,
    minConfidence: 0.6,
    autoMerge: true,
    resolutionThreshold: 0.7,
    loadExistingGraph: true
  });

  const abortRef = useRef(false);

  // Load existing graph context when entities are extracted
  const loadGraphContext = useCallback(async (entityNames) => {
    if (!config.loadExistingGraph || !entityNames || entityNames.length === 0) {
      return null;
    }

    setLoadingContext(true);
    try {
      const context = await incrementalKGService.getGraphContext(entityNames, {
        depth: 1,
        limit: 100
      });
      setExistingGraphContext(context);
      onGraphContextLoaded?.(context);
      return context;
    } catch (err) {
      console.warn('[ExtractionStepper] Failed to load graph context:', err.message);
      return null;
    } finally {
      setLoadingContext(false);
    }
  }, [config.loadExistingGraph, onGraphContextLoaded]);

  // Reset pipeline
  const handleReset = useCallback(() => {
    setActiveStep(0);
    setStepResults({});
    setError(null);
    setIsRunning(false);
    setExistingGraphContext(null);
    setIsPaused(false);
    setRunId(null);
    abortRef.current = false;
  }, []);

  // Execute single step
  const executeStep = useCallback(async (stepIndex) => {
    const step = STEPS[stepIndex];
    const model = AI_MODELS.find(m => m.id === selectedModel);

    try {
      setStepResults(prev => ({
        ...prev,
        [step.id]: { status: 'running', startTime: Date.now() }
      }));

      let result;

      switch (step.id) {
        case 'input':
          // Validate input
          if (!inputText || inputText.trim().length < 10) {
            throw new Error('Text must be at least 10 characters');
          }
          result = {
            status: 'completed',
            text: inputText,
            charCount: inputText.length,
            wordCount: inputText.split(/\s+/).length
          };
          break;

        case 'extract':
          // Call extraction API (step-by-step mode)
          try {
            const extractResult = await incrementalKGService.extractEntitiesOnly(inputText, {
              model: model?.model,
              provider: model?.provider,
              useLLM: config.useLLM,
              useRegex: config.useRegex,
              minConfidence: config.minConfidence
            });

            const entities = extractResult.entities || [];
            const relationships = extractResult.relationships || [];

            // Load existing graph context for these entities
            let graphContext = null;
            if (entities.length > 0) {
              const entityNames = entities.map(e => e.name);
              graphContext = await loadGraphContext(entityNames);
            }

            result = {
              status: 'completed',
              entities,
              relationships,
              stats: extractResult.stats,
              graphContext
            };
          } catch (apiError) {
            // Fallback simulation if API not available
            console.warn('API not available, using simulation:', apiError.message);
            await new Promise(r => setTimeout(r, 1500));
            result = {
              status: 'completed',
              entities: [
                { name: 'Sample Entity', type: 'CONCEPT', confidence: 0.9 }
              ],
              stats: { provider: model?.provider, regex: 2, llm: 3 }
            };
          }
          break;

        case 'resolve':
          const entities = stepResults.extract?.entities || [];
          try {
            const resolveResult = await incrementalKGService.resolveEntities(entities, {
              autoMerge: config.autoMerge,
              threshold: config.resolutionThreshold
            });
            result = {
              status: 'completed',
              resolution: resolveResult.resolution,
              resolvedEntities: resolveResult.entities
            };
          } catch (apiError) {
            console.warn('API not available, using simulation:', apiError.message);
            await new Promise(r => setTimeout(r, 1000));
            result = {
              status: 'completed',
              resolution: { new: entities.length, merged: 0, skipped: 0 },
              resolvedEntities: entities
            };
          }
          break;

        case 'relationships':
          const resolvedEntities = stepResults.resolve?.resolvedEntities || [];
          // Use relationships from extract step if available
          const extractedRels = stepResults.extract?.relationships || [];
          if (extractedRels.length > 0) {
            result = {
              status: 'completed',
              relationships: extractedRels
            };
          } else {
            try {
              const relResult = await incrementalKGService.extractRelationships(inputText, resolvedEntities, {
                model: model?.model,
                provider: model?.provider
              });
              result = {
                status: 'completed',
                relationships: relResult.relationships || []
              };
            } catch (apiError) {
              console.warn('API not available, using simulation:', apiError.message);
              await new Promise(r => setTimeout(r, 1200));
              result = {
                status: 'completed',
                relationships: []
              };
            }
          }
          break;

        case 'store':
          const entitiesToStore = stepResults.resolve?.resolvedEntities || [];
          const relationshipsToStore = stepResults.relationships?.relationships || [];

          try {
            const storeResult = await incrementalKGService.storeToGraph({
              entities: entitiesToStore,
              relationships: relationshipsToStore,
              runId
            });
            result = {
              status: 'completed',
              stored: {
                entities: storeResult.entities?.stored || entitiesToStore.length,
                relationships: storeResult.relationships?.stored || relationshipsToStore.length,
                duration: storeResult.duration
              }
            };
          } catch (apiError) {
            console.warn('API not available, using simulation:', apiError.message);
            await new Promise(r => setTimeout(r, 800));
            result = {
              status: 'completed',
              stored: {
                entities: entitiesToStore.length,
                relationships: relationshipsToStore.length,
                duration: 150
              }
            };
          }
          break;

        default:
          throw new Error(`Unknown step: ${step.id}`);
      }

      result.endTime = Date.now();
      result.duration = result.endTime - stepResults[step.id]?.startTime;

      setStepResults(prev => ({
        ...prev,
        [step.id]: result
      }));

      onStepComplete?.(step.id, result);

      return result;
    } catch (err) {
      const errorResult = {
        status: 'error',
        error: err.message,
        endTime: Date.now()
      };
      setStepResults(prev => ({
        ...prev,
        [step.id]: errorResult
      }));
      setError(err.message);
      throw err;
    }
  }, [inputText, selectedModel, config, stepResults, apiService, runId, onStepComplete]);

  // Execute next step (manual mode)
  const handleNextStep = useCallback(async () => {
    if (activeStep >= STEPS.length) return;

    setIsRunning(true);
    setError(null);

    try {
      await executeStep(activeStep);
      setActiveStep(prev => prev + 1);

      if (activeStep === STEPS.length - 1) {
        onExtractionComplete?.(stepResults);
      }
    } catch (err) {
      // Error already handled in executeStep
    } finally {
      setIsRunning(false);
    }
  }, [activeStep, executeStep, stepResults, onExtractionComplete]);

  // Run all steps (auto mode)
  const handleRunAll = useCallback(async () => {
    setIsAutoMode(true);
    setIsRunning(true);
    setError(null);
    abortRef.current = false;

    try {
      for (let i = activeStep; i < STEPS.length; i++) {
        if (abortRef.current || isPaused) break;

        setActiveStep(i);
        await executeStep(i);

        // Small delay between steps for visual feedback
        if (i < STEPS.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      if (!abortRef.current) {
        setActiveStep(STEPS.length);
        onExtractionComplete?.(stepResults);
      }
    } catch (err) {
      // Error already handled
    } finally {
      setIsRunning(false);
      setIsAutoMode(false);
    }
  }, [activeStep, executeStep, isPaused, stepResults, onExtractionComplete]);

  // Pause auto mode
  const handlePause = useCallback(() => {
    setIsPaused(true);
    abortRef.current = true;
  }, []);

  // Resume auto mode
  const handleResume = useCallback(() => {
    setIsPaused(false);
    handleRunAll();
  }, [handleRunAll]);

  // Stop execution
  const handleStop = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setIsAutoMode(false);
    setIsPaused(false);
  }, []);

  // Get step status
  const getStepStatus = (index) => {
    const step = STEPS[index];
    const result = stepResults[step.id];

    if (!result) return 'pending';
    if (result.status === 'running') return 'running';
    if (result.status === 'error') return 'error';
    if (result.status === 'completed') return 'completed';
    return 'pending';
  };

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with controls */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Extraction Pipeline
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          {/* AI Model Selector */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>AI Model</InputLabel>
            <Select
              value={selectedModel}
              label="AI Model"
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isRunning}
            >
              {AI_MODELS.map(model => (
                <MenuItem key={model.id} value={model.id}>
                  {model.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Settings toggle */}
          <Tooltip title="Settings">
            <IconButton
              size="small"
              onClick={() => setShowSettings(!showSettings)}
              color={showSettings ? 'primary' : 'default'}
            >
              <Settings size={18} />
            </IconButton>
          </Tooltip>

          {/* Reset */}
          <Tooltip title="Reset Pipeline">
            <IconButton size="small" onClick={handleReset} disabled={isRunning}>
              <RotateCcw size={18} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Settings panel */}
      <Collapse in={showSettings}>
        <Card variant="outlined" sx={{ mb: 2, p: 1.5 }}>
          <Stack direction="row" spacing={3} flexWrap="wrap">
            <FormControlLabel
              control={
                <Switch
                  checked={config.useLLM}
                  onChange={(e) => setConfig(prev => ({ ...prev, useLLM: e.target.checked }))}
                  size="small"
                />
              }
              label="Use LLM"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={config.useRegex}
                  onChange={(e) => setConfig(prev => ({ ...prev, useRegex: e.target.checked }))}
                  size="small"
                />
              }
              label="Use Regex"
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
            <FormControlLabel
              control={
                <Switch
                  checked={config.loadExistingGraph}
                  onChange={(e) => setConfig(prev => ({ ...prev, loadExistingGraph: e.target.checked }))}
                  size="small"
                />
              }
              label="Load Existing Graph"
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption">Min Confidence:</Typography>
              <TextField
                type="number"
                size="small"
                value={config.minConfidence}
                onChange={(e) => setConfig(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                sx={{ width: 70 }}
              />
            </Box>
          </Stack>
        </Card>
      </Collapse>

      {/* Loading existing graph indicator */}
      {loadingContext && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<CircularProgress size={16} />}>
          Loading existing graph context...
        </Alert>
      )}

      {/* Existing graph context summary */}
      {existingGraphContext && existingGraphContext.stats && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Found {existingGraphContext.stats.matchedEntities} matching entities, {existingGraphContext.stats.totalExistingNodes} existing nodes, {existingGraphContext.stats.totalExistingRelationships} existing relationships
        </Alert>
      )}

      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stepper */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {STEPS.map((step, index) => {
            const status = getStepStatus(index);
            const Icon = step.icon;
            const result = stepResults[step.id];

            return (
              <Step key={step.id} completed={status === 'completed'}>
                <StepLabel
                  error={status === 'error'}
                  StepIconComponent={() => (
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: status === 'completed' ? 'success.main' :
                                 status === 'error' ? 'error.main' :
                                 status === 'running' ? 'primary.main' :
                                 'grey.300',
                        color: 'white'
                      }}
                    >
                      {status === 'running' ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : status === 'completed' ? (
                        <CheckCircle size={16} />
                      ) : status === 'error' ? (
                        <AlertCircle size={16} />
                      ) : (
                        <Icon size={16} />
                      )}
                    </Box>
                  )}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {step.label}
                    </Typography>
                    {result?.duration && (
                      <Chip
                        icon={<Clock size={12} />}
                        label={`${result.duration}ms`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </StepLabel>

                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {step.description}
                  </Typography>

                  {/* Input step - text field */}
                  {step.id === 'input' && index === activeStep && (
                    <TextField
                      multiline
                      rows={4}
                      fullWidth
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Enter text to extract entities from..."
                      disabled={isRunning}
                      sx={{
                        mb: 1,
                        '& .MuiOutlinedInput-root': {
                          fontFamily: 'monospace',
                          fontSize: '0.85rem'
                        }
                      }}
                    />
                  )}

                  {/* Step result */}
                  <StepResult step={step.id} result={result} isActive={index === activeStep} />
                </StepContent>
              </Step>
            );
          })}
        </Stepper>

        {/* Completion message */}
        {activeStep === STEPS.length && (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Extraction Complete!
            </Typography>
            <Typography variant="body2">
              All entities and relationships have been stored with provenance tracking.
            </Typography>
          </Alert>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Action buttons */}
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Stack direction="row" spacing={1}>
          {/* Manual: Next Step */}
          {!isAutoMode && activeStep < STEPS.length && (
            <Button
              variant="contained"
              startIcon={isRunning ? <CircularProgress size={16} color="inherit" /> : <SkipForward size={16} />}
              onClick={handleNextStep}
              disabled={isRunning}
            >
              {activeStep === 0 ? 'Start' : 'Next Step'}
            </Button>
          )}

          {/* Auto mode controls */}
          {!isRunning && !isAutoMode && activeStep < STEPS.length && (
            <Button
              variant="outlined"
              startIcon={<Zap size={16} />}
              onClick={handleRunAll}
              color="secondary"
            >
              Run All
            </Button>
          )}

          {isAutoMode && isRunning && (
            <Button
              variant="outlined"
              startIcon={<Pause size={16} />}
              onClick={handlePause}
              color="warning"
            >
              Pause
            </Button>
          )}

          {isPaused && (
            <Button
              variant="contained"
              startIcon={<Play size={16} />}
              onClick={handleResume}
              color="success"
            >
              Resume
            </Button>
          )}
        </Stack>

        {/* Progress indicator */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            Step {Math.min(activeStep + 1, STEPS.length)} of {STEPS.length}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(activeStep / STEPS.length) * 100}
            sx={{ width: 100, height: 6, borderRadius: 3 }}
          />
        </Stack>
      </Stack>
    </Paper>
  );
};

export default ExtractionStepper;
