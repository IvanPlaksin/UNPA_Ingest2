import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';
import * as wsApi from '../services/workspace.service';

/**
 * Normalize both old-style SSE events ({ phase, progress, message })
 * and new unified pipeline events ({ status, steps, overallProgress, currentStep })
 * into a single shape.
 */
function mergeSSEEvent(prev, data) {
  const next = { ...prev };

  // New unified pipeline format
  if (data.steps !== undefined || data.overallProgress !== undefined) {
    if (data.overallProgress !== undefined) next.overallProgress = data.overallProgress;
    if (data.steps) next.steps = data.steps;
    if (data.currentStep) next.phase = data.currentStep.name;
    if (data.status === 'running') next.isRunning = true;
    if (data.summary) next.summary = data.summary;
    if (data.error) next.error = data.error;
    if (data.result) next.result = data.result;
    next.logEntries = buildLogEntries(next.steps, next.summary);
    return next;
  }

  // Old workspace format
  if (data.phase) { next.phase = data.phase; next.isRunning = true; }
  if (typeof data.progress === 'number') next.overallProgress = data.progress;
  if (data.message) next.details = data.message;
  if (data.current && data.total) next.details = `${data.current}/${data.total}`;
  if (data.count) next.details = `${data.count} items`;
  if (data.drafts !== undefined) next.details = `${data.drafts} drafts, ${data.edges || 0} edges`;
  if (data.error) next.error = data.error;
  if (data.result) next.result = data.result;
  return next;
}

function coerceMsg(v) {
  if (!v && v !== 0) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message || v.toString();
  try { return JSON.stringify(v); } catch { return String(v); }
}

function buildLogEntries(steps = [], summary = null) {
  const entries = [];
  for (const step of steps) {
    if (step.status === 'failed' || step.error != null) {
      const msg = coerceMsg(step.error) || 'Step failed (no error details)';
      entries.push({ level: 'error', step: step.name, message: msg });
    }
    if (step.result?.method?.includes('fallback')) {
      entries.push({ level: 'warn', step: step.name, message: `AI fallback to regex (method: ${step.result.method})` });
    }
  }
  if (summary?.errors) {
    for (const e of summary.errors) {
      const msg = coerceMsg(e.message) || 'Unknown error';
      const alreadyShown = entries.some(x => x.step === e.step && x.message === msg);
      if (!alreadyShown) entries.push({ level: 'error', step: e.step || '?', message: msg });
    }
  }
  return entries;
}

const INITIAL_STATE = {
  phase: 'queued',
  overallProgress: 0,
  steps: [],
  summary: null,
  details: '',
  error: null,
  result: null,
  isRunning: false,
  isDone: false,
  isFailed: false,
  isCancelled: false,
  logEntries: [],
};

/**
 * useExtractionProgress
 *
 * Abstracts HTTP polling (documents) and SSE (workspace/documents with jobId)
 * into a single unified progress state.
 *
 * @param {object}   params
 * @param {'poll'|'sse'} params.mode
 * @param {object}   params.source   - { type: 'document'|'workspace', id, jobId? }
 * @param {function} [params.onComplete]
 * @param {function} [params.onCancel]
 */
export function useExtractionProgress({ mode, source, onComplete, onCancel } = {}) {
  const [state, setState] = useState(INITIAL_STATE);

  const pollRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef   = useRef(onCancel);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onCancelRef.current   = onCancel;   }, [onCancel]);

  // ── Reset on source change ──────────────────────────────────
  useEffect(() => {
    setState(INITIAL_STATE);
  }, [source?.id, source?.jobId]);

  // ── Poll mode ───────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'poll' || !source?.id) return;

    const fetchProgress = async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE_URL}/documents/${source.id}/extraction/progress`
        );
        const prog = data.data;
        const steps = prog.steps || [];
        const logEntries = buildLogEntries(steps, prog.summary);
        const isDone   = prog.status === 'completed';
        const isFailed = prog.status === 'failed';

        setState({
          phase:           prog.currentStep?.name || prog.status || 'queued',
          overallProgress: prog.overallProgress ?? 0,
          steps,
          summary:         prog.summary || null,
          details:         prog.currentStep?.label || '',
          error:           isFailed ? (prog.summary?.errors?.[0]?.error || 'Extraction failed') : null,
          result:          prog.summary || null,
          isRunning:       !isDone && !isFailed && prog.status !== 'queued',
          isDone,
          isFailed,
          isCancelled:     false,
          logEntries,
        });

        if (isDone) {
          clearInterval(pollRef.current);
          onCompleteRef.current?.(prog.summary);
        } else if (isFailed) {
          clearInterval(pollRef.current);
        }
      } catch (e) {
        if (e.response?.status !== 404) {
          setState(s => ({
            ...s,
            error:    e.response?.data?.error || e.message,
            isFailed: true,
            isRunning: false,
          }));
          clearInterval(pollRef.current);
        }
      }
    };

    fetchProgress();
    pollRef.current = setInterval(fetchProgress, 1500);
    return () => clearInterval(pollRef.current);
  }, [mode, source?.id]);

  // ── SSE mode ────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'sse' || !source?.id || !source?.jobId) return;

    const url = source.type === 'document'
      ? `${API_BASE_URL}/documents/${source.id}/extract/${source.jobId}/progress`
      : `${API_BASE_URL}/workspaces/${source.id}/extract/${source.jobId}/progress`;

    const es = new EventSource(url);

    es.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.progress?.phase) {
          setState(s => ({ ...s, phase: data.progress.phase }));
        }
      } catch { /* ignore */ }
    });

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState(s => mergeSSEEvent(s, data));
      } catch { /* ignore */ }
    });

    es.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase === 'completed' || data.status === 'completed') {
          setState(s => ({
            ...s, phase: 'completed', overallProgress: 100,
            isDone: true, isRunning: false,
            result: data.result || s.result,
          }));
          onCompleteRef.current?.(data.result);
        } else if (data.phase === 'failed') {
          setState(s => ({
            ...s, phase: 'failed', isFailed: true, isRunning: false,
            error: data.error || 'Extraction failed',
          }));
        } else if (data.phase === 'cancelled') {
          setState(s => ({ ...s, phase: 'cancelled', isCancelled: true, isRunning: false }));
          onCancelRef.current?.();
        }
      } catch { /* ignore */ }
      es.close();
    });

    es.onerror = () => {
      if (source.type === 'workspace') {
        wsApi.getExtractionStatus(source.id, source.jobId).then(res => {
          if (res.data?.status === 'completed') {
            setState(s => ({ ...s, phase: 'completed', overallProgress: 100, isDone: true, isRunning: false }));
            onCompleteRef.current?.();
          } else if (res.data?.status === 'failed') {
            setState(s => ({
              ...s, phase: 'failed', isFailed: true, isRunning: false,
              error: res.data.failedReason || 'Failed',
            }));
          }
        }).catch(() => {});
      }
      es.close();
    };

    return () => es.close();
  }, [mode, source?.id, source?.jobId, source?.type]);

  // ── Cancel action ───────────────────────────────────────────
  const cancel = useCallback(async () => {
    if (!source?.id || !source?.jobId) return;
    try { await wsApi.cancelExtraction(source.id, source.jobId); } catch { /* ignore */ }
  }, [source?.id, source?.jobId]);

  return { ...state, cancel };
}

export default useExtractionProgress;
