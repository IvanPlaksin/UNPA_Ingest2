/**
 * useGuidedAnalysis — self-contained hook for GXE Guided Mode.
 *
 * Migrated from Nexus/Modes/GuidedMode/useGuidedAnalysis.js (CONS-13).
 * No nexusStore dependency — uses local React state + direct API calls.
 */

import { useState, useCallback, useRef } from 'react';
import api from '../../../services/api';

const PHASES = ['understand', 'discover', 'evaluate', 'act'];

export function useGuidedAnalysis(namespace = 'GXE') {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('understand');
  const [data, setData] = useState({
    structuralAnalysis: null,
    candidates: [],
    selectedCandidates: [],
    discoveryResult: null,
    evaluationResult: null,
    approvedClusters: [],
    actionResult: null,
  });
  const [events, setEvents] = useState([]);
  const eventIdRef = useRef(0);

  // ── Event helpers ──
  const addEvent = useCallback((evt) => {
    const id = `evt-${++eventIdRef.current}`;
    const event = { id, timestamp: Date.now(), ...evt };
    setEvents(prev => [...prev, event]);
    return id;
  }, []);

  const updateEvent = useCallback((eventId, updates) => {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updates } : e));
  }, []);

  // ── Merge data ──
  const mergeData = useCallback((patch) => {
    setData(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Phase: Understand ──
  const runUnderstand = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = Date.now();
    const evId = addEvent({ type: 'structural_analysis', title: 'Structural Analysis', status: 'running', phase: 'understand' });

    try {
      const resp = await api.post('/subgraph/analyze', { namespace });
      const result = resp.data;
      const analysis = result.analysis || result;

      updateEvent(evId, {
        status: 'done',
        duration: Date.now() - start,
        subtitle: `${analysis.nodeCount || 0} nodes, ${analysis.edgeCount || 0} edges`,
      });

      mergeData({ structuralAnalysis: result });
      return result;
    } catch (err) {
      updateEvent(evId, { status: 'error', duration: Date.now() - start, error: err.message });
      setError(err.message);

      // Client-side fallback: compute from nodes/edges if available
      return null;
    } finally {
      setLoading(false);
    }
  }, [namespace, addEvent, updateEvent, mergeData]);

  // ── Phase: Discover ──
  const runDiscover = useCallback(async (strategy = 'community') => {
    setLoading(true);
    setError(null);
    const start = Date.now();
    const evId = addEvent({ type: 'community_detection', title: 'Community Detection', subtitle: `Strategy: ${strategy}`, status: 'running', phase: 'discover' });

    try {
      const resp = await api.post('/subgraph/segment', { namespace, strategy });
      const result = resp.data;
      const clusterCount = result.clusters?.length || 0;

      updateEvent(evId, {
        status: 'done',
        duration: Date.now() - start,
        subtitle: `Found ${clusterCount} cluster(s)`,
      });

      mergeData({ candidates: result.clusters || [], discoveryResult: result });
      return result;
    } catch (err) {
      updateEvent(evId, { status: 'error', duration: Date.now() - start, error: err.message });
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [namespace, addEvent, updateEvent, mergeData]);

  // ── Phase: Evaluate ──
  const runEvaluate = useCallback(async (clusters = []) => {
    setLoading(true);
    setError(null);
    const start = Date.now();
    const evId = addEvent({ type: 'coherence_evaluation', title: 'Coherence Evaluation', subtitle: `Evaluating ${clusters.length} cluster(s)...`, status: 'running', phase: 'evaluate' });

    try {
      const resp = await api.post('/subgraph/evaluate', { namespace, clusters });
      const result = resp.data;
      const evals = result.evaluations || [];
      const avgScore = evals.length > 0
        ? (evals.reduce((s, e) => s + (e.coherenceScore || 0), 0) / evals.length).toFixed(2)
        : 'N/A';

      updateEvent(evId, {
        status: 'done',
        duration: Date.now() - start,
        subtitle: `${evals.length} evaluated, avg coherence: ${avgScore}`,
      });

      mergeData({ evaluationResult: result });
      return result;
    } catch (err) {
      updateEvent(evId, { status: 'error', duration: Date.now() - start, error: err.message });
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [namespace, addEvent, updateEvent, mergeData]);

  // ── Phase: Act ──
  const runAct = useCallback(async (clusters, options = {}) => {
    setLoading(true);
    setError(null);
    const start = Date.now();

    addEvent({ type: 'checkpoint', title: 'Checkpoint Created', status: 'done', phase: 'act', duration: 0 });

    try {
      const resp = await api.post('/subgraph/consolidate', { namespace, clusters, ...options });
      const result = resp.data;

      addEvent({
        type: 'complete',
        title: 'Analysis Complete',
        subtitle: `${result.actions?.filter(a => a.success).length || 0} cluster(s) processed`,
        status: 'done',
        phase: 'act',
        duration: Date.now() - start,
      });

      mergeData({ actionResult: result });
      return result;
    } catch (err) {
      addEvent({ type: 'error', title: 'Act Phase Failed', status: 'error', phase: 'act', error: err.message });
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [namespace, addEvent, mergeData]);

  // ── Rollback ──
  const rollback = useCallback(async (checkpointId) => {
    setLoading(true);
    setError(null);
    const start = Date.now();
    const evId = addEvent({ type: 'checkpoint', title: 'Rolling Back', subtitle: `Checkpoint: ${checkpointId}`, status: 'running', phase: 'act' });

    try {
      await api.post('/subgraph/rollback', { namespace, checkpointId });
      updateEvent(evId, { status: 'done', duration: Date.now() - start, title: 'Rollback Complete' });
    } catch (err) {
      updateEvent(evId, { status: 'error', duration: Date.now() - start, error: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [namespace, addEvent, updateEvent]);

  // ── Navigation ──
  const goToNextPhase = useCallback(() => {
    const idx = PHASES.indexOf(phase);
    if (idx < PHASES.length - 1) setPhase(PHASES[idx + 1]);
  }, [phase]);

  const goToPreviousPhase = useCallback(() => {
    const idx = PHASES.indexOf(phase);
    if (idx > 0) setPhase(PHASES[idx - 1]);
  }, [phase]);

  const goToPhase = useCallback((p) => setPhase(p), []);

  const restart = useCallback(() => {
    setPhase('understand');
    setData({
      structuralAnalysis: null, candidates: [], selectedCandidates: [],
      discoveryResult: null, evaluationResult: null, approvedClusters: [], actionResult: null,
    });
    setEvents([]);
    setError(null);
  }, []);

  return {
    loading, error, phase, data, events,
    mergeData,
    runUnderstand, runDiscover, runEvaluate, runAct, rollback,
    goToNextPhase, goToPreviousPhase, goToPhase, restart,
  };
}

export default useGuidedAnalysis;
