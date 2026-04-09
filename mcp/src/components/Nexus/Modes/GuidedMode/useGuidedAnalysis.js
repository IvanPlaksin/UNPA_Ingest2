import { useState, useCallback } from 'react';
import { useNexusStore } from '../../../../stores/nexusStore';
import { runUnderstandPhase, runDiscoverPhase, runEvaluatePhase, runActPhase, rollbackToCheckpoint, validateSubgraph } from '../../../../services/nexus.service';

/**
 * Hook for managing Guided Mode analysis state.
 * Emits analysis events to nexusStore for the BottomPanel Analysis tab.
 */
export const useGuidedAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const namespace = useNexusStore(state => state.namespace);
  const guidedPhase = useNexusStore(state => state.guidedPhase);
  const guidedData = useNexusStore(state => state.guidedData);

  const setGuidedPhase = useNexusStore(state => state.setGuidedPhase);
  const setGuidedData = useNexusStore(state => state.setGuidedData);
  const resetGuidedMode = useNexusStore(state => state.resetGuidedMode);
  const setInsights = useNexusStore(state => state.setInsights);

  // Analysis event emitters
  const addAnalysisEvent = useNexusStore(state => state.addAnalysisEvent);
  const updateAnalysisEvent = useNexusStore(state => state.updateAnalysisEvent);
  const setIsAnalyzing = useNexusStore(state => state.setIsAnalyzing);
  const queueCollapse = useNexusStore(state => state.queueCollapse);

  // ── Phase: Understand ──
  const runUnderstand = useCallback(async () => {
    setLoading(true);
    setError(null);

    const startTime = Date.now();
    const eventId = addAnalysisEvent({
      type: 'structural_analysis',
      title: 'Structural Analysis',
      subtitle: `Analyzing namespace "${namespace}"...`,
      status: 'running',
      phase: 'understand',
    });

    try {
      const result = await runUnderstandPhase(namespace);
      const analysis = result.analysis || result;

      updateAnalysisEvent(eventId, {
        status: 'done',
        duration: Date.now() - startTime,
        subtitle: `${analysis.nodeCount || 0} nodes, ${analysis.edgeCount || 0} edges`,
        output: {
          nodeCount: analysis.nodeCount,
          edgeCount: analysis.edgeCount,
          density: analysis.density,
          hubCount: analysis.hubNodes?.length || 0,
          components: analysis.connectedComponents?.count,
        },
        nodeRefs: analysis.hubNodes?.slice(0, 3).map(h => h.id || h),
      });

      setGuidedData({ structuralAnalysis: result });
      if (result.insights) {
        setInsights(result.insights);
        addAnalysisEvent({
          type: 'info',
          title: 'Insights Loaded',
          subtitle: `${result.insights.length || 0} insight(s)`,
          status: 'done',
          phase: 'understand',
          duration: 0,
        });
      }
      return result;
    } catch (err) {
      console.error('[GuidedAnalysis] Understand phase failed:', err);
      updateAnalysisEvent(eventId, {
        status: 'error',
        duration: Date.now() - startTime,
        error: err.message,
      });
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespace, setGuidedData, setInsights, addAnalysisEvent, updateAnalysisEvent]);

  // ── Phase: Discover ──
  const runDiscover = useCallback(async (strategy = 'community') => {
    setLoading(true);
    setError(null);

    const startTime = Date.now();
    const eventId = addAnalysisEvent({
      type: 'community_detection',
      title: 'Community Detection',
      subtitle: `Strategy: ${strategy}`,
      status: 'running',
      phase: 'discover',
    });

    try {
      const result = await runDiscoverPhase(namespace, { strategy });
      const clusterCount = result.clusters?.length || 0;
      const totalNodes = result.totalNodes || result.clusters?.reduce((s, c) => s + (c.nodeCount || 0), 0) || 0;

      updateAnalysisEvent(eventId, {
        status: 'done',
        duration: Date.now() - startTime,
        subtitle: `Found ${clusterCount} cluster(s) covering ${totalNodes} nodes`,
        output: {
          clusterCount,
          totalNodes,
          method: result.method || strategy,
        },
      });

      setGuidedData({
        candidates: result.clusters,
        discoveryResult: result,
      });
      return result;
    } catch (err) {
      console.error('[GuidedAnalysis] Discover phase failed:', err);
      updateAnalysisEvent(eventId, {
        status: 'error',
        duration: Date.now() - startTime,
        error: err.message,
      });
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespace, setGuidedData, addAnalysisEvent, updateAnalysisEvent]);

  // ── Phase: Evaluate ──
  const runEvaluate = useCallback(async (clusters = []) => {
    setLoading(true);
    setError(null);

    const startTime = Date.now();
    const eventId = addAnalysisEvent({
      type: 'coherence_evaluation',
      title: 'Coherence Evaluation',
      subtitle: `Evaluating ${clusters.length} cluster(s)...`,
      status: 'running',
      phase: 'evaluate',
    });

    try {
      const result = await runEvaluatePhase(namespace, clusters);
      const evals = result.evaluations || [];
      const avgScore = evals.length > 0
        ? (evals.reduce((s, e) => s + (e.coherenceScore || 0), 0) / evals.length).toFixed(2)
        : 'N/A';

      updateAnalysisEvent(eventId, {
        status: 'done',
        duration: Date.now() - startTime,
        subtitle: `${evals.length} evaluated, avg coherence: ${avgScore}`,
        output: {
          evaluated: evals.length,
          avgScore,
          scores: evals.map(e => ({ name: e.name || e.id, score: e.coherenceScore })),
        },
      });

      setGuidedData({ evaluationResult: result });
      return result;
    } catch (err) {
      console.error('[GuidedAnalysis] Evaluate phase failed:', err);
      updateAnalysisEvent(eventId, {
        status: 'error',
        duration: Date.now() - startTime,
        error: err.message,
      });
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespace, setGuidedData, addAnalysisEvent, updateAnalysisEvent]);

  // ── Phase: Act ──
  const runAct = useCallback(async (clusters, options = {}) => {
    setLoading(true);
    setError(null);
    setIsAnalyzing(true);

    const startTime = Date.now();

    addAnalysisEvent({
      type: 'checkpoint',
      title: 'Checkpoint Created',
      subtitle: 'Saving graph state before consolidation',
      status: 'done',
      phase: 'act',
      duration: 0,
    });

    // Emit per-cluster events via onLog/onProgress callbacks
    const clusterEvents = {};
    const wrappedOptions = {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
      },
      onLog: (log) => {
        options.onLog?.(log);
        // Map log messages to analysis events
        if (log.type === 'info' && log.message?.includes('Processing')) {
          const clusterName = log.message.match(/"([^"]+)"/)?.[1] || 'Cluster';
          const evtId = addAnalysisEvent({
            type: 'consolidation',
            title: `Consolidating "${clusterName}"`,
            subtitle: log.message,
            status: 'running',
            phase: 'act',
          });
          clusterEvents[clusterName] = { id: evtId, start: Date.now() };
        } else if (log.type === 'success' && log.message?.includes('consolidated')) {
          const clusterName = log.message.match(/"([^"]+)"/)?.[1] || 'Cluster';
          const tracked = clusterEvents[clusterName];
          if (tracked) {
            updateAnalysisEvent(tracked.id, {
              status: 'done',
              duration: Date.now() - tracked.start,
              subtitle: log.message,
              output: { clusterName },
            });
          }
        } else if (log.type === 'error') {
          const clusterName = log.message?.match(/"([^"]+)"/)?.[1];
          const tracked = clusterName && clusterEvents[clusterName];
          if (tracked) {
            updateAnalysisEvent(tracked.id, {
              status: 'error',
              duration: Date.now() - tracked.start,
              error: log.message,
            });
          } else {
            addAnalysisEvent({
              type: 'error',
              title: 'Consolidation Error',
              subtitle: log.message,
              status: 'error',
              phase: 'act',
            });
          }
        }
      },
    };

    try {
      const result = await runActPhase(namespace, clusters, wrappedOptions);

      // Queue visual collapses on the GXE canvas for each successful consolidation
      for (const action of (result.actions || [])) {
        if (action.success && action.result?.subgraphId) {
          const cluster = clusters.find(c => c.id === action.clusterId);
          if (cluster?.nodeIds?.length) {
            queueCollapse(cluster.nodeIds, action.result);
          }
        }
      }

      // ── AI Validation of created subgraphs ──
      const validationResults = [];
      for (const action of (result.actions || [])) {
        if (action.success && action.result?.subgraphId) {
          const valEventId = addAnalysisEvent({
            type: 'ai_validation',
            title: `Validating "${action.clusterName}"`,
            subtitle: 'AI quality assessment...',
            status: 'running',
            phase: 'act',
          });
          const valStart = Date.now();
          try {
            const valResult = await validateSubgraph(namespace, action.result.subgraphId);
            const v = valResult.validation || {};
            validationResults.push({ clusterName: action.clusterName, subgraphId: action.result.subgraphId, ...v });
            updateAnalysisEvent(valEventId, {
              status: 'done',
              duration: Date.now() - valStart,
              subtitle: `Quality: ${((v.qualityScore || 0) * 100).toFixed(0)}% (${v.method || 'unknown'})`,
              output: v,
            });
          } catch (err) {
            console.warn('[GuidedAnalysis] Validation failed:', err.message);
            updateAnalysisEvent(valEventId, {
              status: 'error',
              duration: Date.now() - valStart,
              error: err.message,
            });
          }
        }
      }

      // Emit completion event with before/after stats + validations
      addAnalysisEvent({
        type: 'complete',
        title: 'Analysis Complete',
        subtitle: `${result.actions?.filter(a => a.success).length || 0} cluster(s) processed`,
        status: 'done',
        phase: 'act',
        duration: Date.now() - startTime,
        output: {
          beforeStats: result.beforeStats,
          afterStats: result.afterStats,
          actions: result.actions,
          errors: result.errors,
          validations: validationResults,
        },
      });

      setGuidedData({ actionResult: result });
      return result;
    } catch (err) {
      console.error('[GuidedAnalysis] Act phase failed:', err);
      addAnalysisEvent({
        type: 'error',
        title: 'Act Phase Failed',
        status: 'error',
        phase: 'act',
        duration: Date.now() - startTime,
        error: err.message,
      });
      setError(err.message);
      throw err;
    } finally {
      setIsAnalyzing(false);
      setLoading(false);
    }
  }, [namespace, setGuidedData, addAnalysisEvent, updateAnalysisEvent, setIsAnalyzing, queueCollapse]);

  // ── Rollback ──
  const rollback = useCallback(async (checkpointId) => {
    setLoading(true);
    setError(null);

    const startTime = Date.now();
    const eventId = addAnalysisEvent({
      type: 'checkpoint',
      title: 'Rolling Back',
      subtitle: `Checkpoint: ${checkpointId}`,
      status: 'running',
      phase: 'act',
    });

    try {
      await rollbackToCheckpoint(namespace, checkpointId);
      updateAnalysisEvent(eventId, {
        status: 'done',
        duration: Date.now() - startTime,
        title: 'Rollback Complete',
      });
    } catch (err) {
      console.error('[GuidedAnalysis] Rollback failed:', err);
      updateAnalysisEvent(eventId, {
        status: 'error',
        duration: Date.now() - startTime,
        error: err.message,
      });
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespace, addAnalysisEvent, updateAnalysisEvent]);

  const PHASES = ['understand', 'discover', 'evaluate', 'act'];

  const goToNextPhase = useCallback(() => {
    const idx = PHASES.indexOf(guidedPhase);
    if (idx < PHASES.length - 1) setGuidedPhase(PHASES[idx + 1]);
  }, [guidedPhase, setGuidedPhase]);

  const goToPreviousPhase = useCallback(() => {
    const idx = PHASES.indexOf(guidedPhase);
    if (idx > 0) setGuidedPhase(PHASES[idx - 1]);
  }, [guidedPhase, setGuidedPhase]);

  const goToPhase = useCallback((phase) => setGuidedPhase(phase), [setGuidedPhase]);
  const restart = useCallback(() => { resetGuidedMode(); setError(null); }, [resetGuidedMode]);

  return {
    loading,
    error,
    phase: guidedPhase,
    data: guidedData,
    runUnderstand,
    runDiscover,
    runEvaluate,
    runAct,
    rollback,
    goToNextPhase,
    goToPreviousPhase,
    goToPhase,
    restart,
  };
};

export default useGuidedAnalysis;
