/**
 * InsightsBar — GXE proactive insights notification bar.
 *
 * Migrated from Nexus/Insights (CONS-06).
 * Standalone: no nexusStore dependency; fetches via /advisor/insights API.
 * Tailwind + GXE dark theme, lucide-react icons.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Lightbulb, RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, Info, MessageCircle, Target, Zap,
  CheckCircle, ChevronUp,
} from 'lucide-react';
import api from '../../../services/api';

// ── Severity config ──
const SEVERITY = {
  high:   { icon: AlertTriangle, color: '#ef4444', bg: 'bg-red-500/15',   text: 'text-red-400'    },
  medium: { icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-500/15', text: 'text-amber-400'  },
  low:    { icon: Info,          color: '#3b82f6', bg: 'bg-blue-500/15',  text: 'text-blue-400'   },
};

const TYPE_ICONS = {
  warning:     AlertTriangle,
  opportunity: Lightbulb,
  suggestion:  MessageCircle,
};

// ── InsightCard ──
const InsightCard = ({ insight, isExpanded, onToggle, onAction, onShowOnGraph }) => {
  const sev = SEVERITY[insight.severity] || { icon: Info, color: '#94a3b8', bg: 'bg-slate-500/15', text: 'text-slate-400' };
  const SevIcon = sev.icon;
  const TypeIcon = TYPE_ICONS[insight.type] || Info;
  const hasAffected = insight.evidence?.affectedNodes?.length > 0;

  return (
    <div
      className={`relative p-2.5 rounded-lg cursor-pointer transition-colors border-l-[3px] ${
        isExpanded ? 'bg-[#30363d]' : 'bg-[#21262d] hover:bg-[#30363d]'
      }`}
      style={{ borderLeftColor: sev.color }}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <SevIcon size={12} className={sev.text} />
        <span className="flex-1 text-xs font-semibold text-gray-200 truncate">{insight.title}</span>
        <TypeIcon size={12} className="text-gray-500" />
      </div>

      {/* Description */}
      <p className={`mt-1 text-[11px] text-gray-400 leading-relaxed ${
        isExpanded ? '' : 'line-clamp-2'
      }`}>
        {insight.description}
      </p>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[#30363d]">
          {insight.evidence && (
            <div className="flex gap-2 text-[11px] mb-2">
              <span className="text-gray-500">Evidence:</span>
              <span className="text-gray-200 font-mono">
                {insight.evidence.metric}:{' '}
                {typeof insight.evidence.value === 'number'
                  ? insight.evidence.value.toFixed(3)
                  : insight.evidence.value}
                {insight.evidence.threshold != null && (
                  <span className="text-gray-500"> (threshold: {insight.evidence.threshold})</span>
                )}
              </span>
            </div>
          )}

          {hasAffected && (
            <div className="text-[11px] text-gray-400 mb-3">
              {insight.evidence.affectedNodes.length} node{insight.evidence.affectedNodes.length !== 1 ? 's' : ''} affected
            </div>
          )}

          <div className="flex gap-2">
            {hasAffected && (
              <button
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md border border-[#30363d] bg-[#161b22] text-gray-200 hover:border-[#58a6ff] transition-colors"
                onClick={(e) => { e.stopPropagation(); onShowOnGraph?.(insight.evidence.affectedNodes); }}
              >
                <Target size={11} /> Show on graph
              </button>
            )}
            {insight.suggestedAction && (
              <button
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md bg-indigo-600 border border-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                onClick={(e) => { e.stopPropagation(); onAction?.(insight.suggestedAction, insight); }}
              >
                <Zap size={11} /> {insight.suggestedAction.title}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expand indicator */}
      <div className="absolute top-2.5 right-2.5 text-gray-500">
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>
    </div>
  );
};

// ── useGxeInsights hook (self-contained) ──
const useGxeInsights = (namespace = 'GXE', autoRefreshMs = 5 * 60 * 1000) => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const resp = forceRefresh
        ? await api.post('/advisor/insights/refresh', { namespace })
        : await api.get('/advisor/insights', { params: { namespace } });
      if (mountedRef.current) {
        setInsights(resp.data?.insights || []);
        setLastUpdated(new Date().toISOString());
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to load insights');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const id = setInterval(() => load(false), autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs, load]);

  const timeSince = useCallback(() => {
    if (!lastUpdated) return null;
    const min = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    return `${Math.floor(min / 60)}h ago`;
  }, [lastUpdated]);

  const summary = {
    total: insights.length,
    high: insights.filter(i => i.severity === 'high').length,
    medium: insights.filter(i => i.severity === 'medium').length,
    low: insights.filter(i => i.severity === 'low').length,
  };

  return { insights, loading, error, summary, timeSince: timeSince(), refresh: () => load(true) };
};

// ── InsightsBar (main) ──
const InsightsBar = ({ namespace, onInsightAction, onShowOnGraph }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedInsightId, setExpandedInsightId] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const { insights, loading, error, summary, timeSince, refresh } = useGxeInsights(namespace);

  const visibleInsights = showAll ? insights : insights.slice(0, 3);
  const hasMore = insights.length > 3;

  return (
    <div className="border-b border-[#30363d] bg-[#161b22]">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#1c2128] transition-colors select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Lightbulb size={14} className="text-amber-400 flex-shrink-0" />
        <span className="text-[13px] font-semibold text-gray-200">Insights</span>

        {/* Severity badges */}
        <div className="flex gap-1.5 flex-1 ml-2">
          {summary.high > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-500/15 text-red-400">
              {summary.high}
            </span>
          )}
          {summary.medium > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400">
              {summary.medium}
            </span>
          )}
          {summary.low > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-blue-500/15 text-blue-400">
              {summary.low}
            </span>
          )}
          {summary.total === 0 && !loading && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-green-500/15 text-green-400">
              <CheckCircle size={10} /> OK
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {timeSince && (
            <span className="text-[10px] text-gray-500" title="Last updated">{timeSince}</span>
          )}
          <button
            className={`p-1 rounded text-gray-400 hover:bg-[#30363d] hover:text-gray-200 transition-colors disabled:cursor-not-allowed ${
              loading ? 'animate-spin' : ''
            }`}
            onClick={(e) => { e.stopPropagation(); refresh(); }}
            disabled={loading}
            title="Refresh insights"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {isExpanded ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3">
          {loading && insights.length === 0 && (
            <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-xs">
              <RefreshCw size={14} className="animate-spin" />
              Analyzing graph...
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between p-3 rounded-md bg-red-500/10 text-red-400 text-xs">
              <span>Warning: {error}</span>
              <button
                className="px-3 py-1 border border-red-400 rounded text-[11px] hover:bg-red-500/20 transition-colors"
                onClick={refresh}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && insights.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-5 text-gray-400 text-xs text-center">
              <CheckCircle size={20} className="text-green-400" />
              No issues detected. Graph looks healthy!
            </div>
          )}

          {insights.length > 0 && (
            <div className="flex flex-col gap-2">
              {visibleInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  isExpanded={expandedInsightId === insight.id}
                  onToggle={() => setExpandedInsightId(prev => prev === insight.id ? null : insight.id)}
                  onAction={onInsightAction}
                  onShowOnGraph={onShowOnGraph}
                />
              ))}
              {hasMore && (
                <button
                  className="py-2 rounded-md bg-[#21262d] text-gray-400 text-xs hover:bg-[#30363d] hover:text-gray-200 transition-colors"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? 'Show less' : `Show ${insights.length - 3} more...`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InsightsBar;
