/**
 * @fileoverview Main Tuning Lab Panel Container
 * @module components/PipelineLab/TuningLab/TuningLabPanel
 *
 * Workflow:
 * 1. User enters text for extraction
 * 2. Click "Extract & Evaluate" to run pipeline
 * 3. View extraction results and metrics
 * 4. Optionally run auto-tuning to optimize parameters
 * 5. Apply recommendations or manually adjust parameters
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTuningApi } from '../../../hooks/useTuningApi';
import TextInputPanel from './TextInputPanel';
import ExtractionResults from './ExtractionResults';
import ParameterControls from './ParameterControls';
import OptimizationChart from './OptimizationChart';
import MetricsDisplay from './MetricsDisplay';
import RecommendationsTable from './RecommendationsTable';
import SessionControls from './SessionControls';
import ProviderSelector from './ProviderSelector';
import { AlertCircle, Beaker } from 'lucide-react';

export default function TuningLabPanel() {
  const api = useTuningApi();

  // Text input state
  const [inputText, setInputText] = useState('');
  const [extractionResults, setExtractionResults] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [activeProvider, setActiveProvider] = useState(null);

  // Config and tuning state
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [parameters, setParameters] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [lastEvaluation, setLastEvaluation] = useState(null);

  // Load config and parameters on mount (but don't poll)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [configRes, paramsRes] = await Promise.all([
          api.getConfig().catch(() => ({ config: {} })),
          api.getParameters().catch(() => ({ parameters: [] })),
        ]);
        setConfig(configRes.config);
        setParameters(paramsRes.parameters || []);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };
    loadInitialData();
  }, []);

  // Poll for status only when tuning is active
  useEffect(() => {
    if (!activeSession) return;

    const pollStatus = async () => {
      try {
        const statusRes = await api.getStatus();
        setStatus(statusRes.status || statusRes);

        if (statusRes.status?.active) {
          setActiveSession({
            id: statusRes.status.sessionId,
            state: statusRes.status.state,
            iteration: statusRes.status.currentIteration,
            bestScore: statusRes.status.bestScore,
          });

          if (statusRes.status.sessionId) {
            const historyRes = await api.getHistory(statusRes.status.sessionId).catch(() => ({ history: [] }));
            setHistory(historyRes.history || []);
          }
        } else {
          setActiveSession(null);
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    };

    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [activeSession, api]);

  // Handle extraction
  const handleExtraction = async () => {
    if (!inputText?.trim()) return;

    setIsExtracting(true);
    setExtractionResults(null);
    setLastEvaluation(null);

    try {
      // Call the tuning extract endpoint
      const response = await fetch('/api/v1/tuning/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Extraction failed');
      }

      setExtractionResults({
        entities: result.entities || [],
        relationships: result.relationships || [],
      });

      // Evaluate the extraction results
      const evalResult = await api.evaluate({
        pipelineResult: {
          entities: result.entities || [],
          relationships: result.relationships || [],
        },
      });
      setLastEvaluation(evalResult.evaluation);
      setMetrics(evalResult.evaluation?.scores || {});

    } catch (err) {
      console.error('Extraction failed:', err);
      // Show error to user
      setExtractionResults({ entities: [], relationships: [], error: err.message });
    } finally {
      setIsExtracting(false);
    }
  };

  // Handle auto-tuning start
  const handleStartTuning = async (options) => {
    if (!inputText?.trim()) {
      alert('Please enter text before starting tuning');
      return;
    }

    try {
      const result = await api.startAutoTuning({
        ...options,
        testText: inputText,
      });
      setActiveSession({
        id: result.sessionId || result.session?.id,
        state: 'running',
        iteration: 0,
      });
      setHistory(result.history || []);
    } catch (err) {
      console.error('Failed to start tuning:', err);
    }
  };

  // Handle stop tuning
  const handleStopTuning = async (applyBest = true) => {
    if (activeSession?.id) {
      try {
        await api.stopSession(activeSession.id, applyBest);
        setActiveSession(null);

        // Re-run extraction with new config if best was applied
        if (applyBest && inputText?.trim()) {
          setTimeout(() => handleExtraction(), 500);
        }
      } catch (err) {
        console.error('Failed to stop tuning:', err);
      }
    }
  };

  // Handle parameter change
  const handleParameterChange = async (path, value) => {
    try {
      const parts = path.split('.');
      let updates = {};
      let current = updates;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;

      await api.updateConfig(updates);

      // Reload config
      const configRes = await api.getConfig();
      setConfig(configRes.config);
    } catch (err) {
      console.error('Failed to update parameter:', err);
    }
  };

  // Handle get recommendations
  const handleGetRecommendations = async () => {
    if (!lastEvaluation && extractionResults) {
      // Need to evaluate first
      const evalResult = await api.evaluate({
        pipelineResult: extractionResults,
      });
      setLastEvaluation(evalResult.evaluation);
    }

    try {
      const result = await api.getRecommendations(lastEvaluation);
      setRecommendations(result.recommendations || []);
    } catch (err) {
      console.error('Failed to get recommendations:', err);
    }
  };

  // Handle reset config
  const handleResetConfig = async () => {
    try {
      await api.resetConfig();
      const configRes = await api.getConfig();
      setConfig(configRes.config);
    } catch (err) {
      console.error('Failed to reset config:', err);
    }
  };

  const isRunning = activeSession?.state === 'running';
  const hasResults = extractionResults !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Beaker className="w-6 h-6 text-cyan-400" />
            Tuning Lab
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Extract entities from text and optimize pipeline parameters
          </p>
        </div>
        {hasResults && (
          <SessionControls
            activeSession={activeSession}
            status={status}
            onStart={handleStartTuning}
            onStop={handleStopTuning}
            onReset={handleResetConfig}
            loading={api.loading}
            disabled={!inputText?.trim()}
          />
        )}
      </div>

      {/* Error display */}
      {api.error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-center gap-2 text-red-300">
          <AlertCircle className="w-5 h-5" />
          <span>{api.error}</span>
          <button
            onClick={() => api.clearError()}
            className="ml-auto text-sm underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Provider Selection and Text Input */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider Selector */}
        <div className="lg:col-span-1">
          <ProviderSelector
            api={api}
            onProviderChange={setActiveProvider}
          />
        </div>

        {/* Step 1: Text Input */}
        <div className="lg:col-span-2">
          <TextInputPanel
            text={inputText}
            onTextChange={setInputText}
            onStartExtraction={handleExtraction}
            loading={isExtracting}
            disabled={isRunning}
            activeProvider={activeProvider}
          />
        </div>
      </div>

      {/* Show results only after extraction */}
      {(hasResults || isExtracting) && (
        <>
          {/* Step 2: Extraction Results */}
          <ExtractionResults
            results={extractionResults}
            loading={isExtracting}
          />

          {/* Step 3: Metrics and Tuning */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-6">
              {/* Current Metrics */}
              <MetricsDisplay
                metrics={metrics}
                session={activeSession}
                evaluation={lastEvaluation}
              />

              {/* Optimization History Chart */}
              {history.length > 0 && (
                <OptimizationChart history={history} />
              )}
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Parameter Controls */}
              <ParameterControls
                config={config}
                parameters={parameters}
                onChange={handleParameterChange}
                disabled={isRunning}
              />

              {/* Recommendations */}
              <RecommendationsTable
                recommendations={recommendations}
                onRefresh={handleGetRecommendations}
                onApply={handleParameterChange}
                loading={api.loading}
              />
            </div>
          </div>
        </>
      )}

      {/* Initial state guidance */}
      {!hasResults && !isExtracting && (
        <div className="text-center py-12 text-gray-500">
          <Beaker className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">Enter text above to begin</p>
          <p className="text-sm mt-2">
            The system will extract entities and relationships, then you can tune the parameters
          </p>
        </div>
      )}
    </div>
  );
}
