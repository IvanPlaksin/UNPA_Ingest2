/**
 * @fileoverview AI Recommendations Table
 * @module components/PipelineLab/TuningLab/RecommendationsTable
 */

import React from 'react';
import { Lightbulb, RefreshCw, Check, ArrowRight, Sparkles } from 'lucide-react';

const PRIORITY_COLORS = {
  high: 'text-red-400 bg-red-500/20',
  medium: 'text-yellow-400 bg-yellow-500/20',
  low: 'text-green-400 bg-green-500/20',
};

export default function RecommendationsTable({ recommendations, onRefresh, onApply, loading }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-400" />
          <h3 className="text-lg font-medium text-white">AI Recommendations</h3>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Get recommendations"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!recommendations || recommendations.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No recommendations yet</p>
          <p className="text-sm mt-1">Click refresh to get AI-powered suggestions</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="p-3 bg-gray-700/50 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-cyan-400">
                    {rec.parameter || rec.area}
                  </span>
                  {rec.priority && (
                    <span className={`px-1.5 py-0.5 rounded text-xs ${PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.medium}`}>
                      {rec.priority}
                    </span>
                  )}
                </div>
                {rec.suggestedValue !== undefined && (
                  <button
                    onClick={() => onApply(rec.parameter, rec.suggestedValue)}
                    className="p-1.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 transition-colors"
                    title="Apply this recommendation"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Values */}
              {(rec.currentValue !== undefined || rec.suggestedValue !== undefined) && (
                <div className="flex items-center gap-2 text-sm mb-2">
                  <span className="text-gray-400">
                    Current:{' '}
                    <span className="text-white font-mono">
                      {formatValue(rec.currentValue)}
                    </span>
                  </span>
                  <ArrowRight className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-400">
                    Suggested:{' '}
                    <span className="text-green-400 font-mono">
                      {formatValue(rec.suggestedValue)}
                    </span>
                  </span>
                </div>
              )}

              {/* Reason */}
              {rec.reason && (
                <p className="text-xs text-gray-400 leading-relaxed">
                  {rec.reason}
                </p>
              )}

              {/* Expected Impact */}
              {rec.expectedImpact && (
                <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Expected: {rec.expectedImpact}
                </p>
              )}

              {/* Adjustments (for area recommendations) */}
              {rec.adjustments && rec.adjustments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-600">
                  <p className="text-xs text-gray-500 mb-1">Suggested adjustments:</p>
                  <ul className="space-y-1">
                    {rec.adjustments.map((adj, adjIdx) => (
                      <li key={adjIdx} className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">{adj.parameter}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 font-mono">{formatValue(adj.current)}</span>
                          <ArrowRight className="w-2 h-2 text-gray-600" />
                          <span className="text-green-400 font-mono">{formatValue(adj.suggested)}</span>
                          <button
                            onClick={() => onApply(adj.parameter, adj.suggested)}
                            className="p-0.5 rounded bg-green-600/20 hover:bg-green-600/40 text-green-400 ml-1"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Format value for display
 */
function formatValue(value) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(2);
  }
  return String(value);
}
