/**
 * @fileoverview Current Metrics Display
 * @module components/PipelineLab/TuningLab/MetricsDisplay
 */

import React from 'react';
import { Activity, Target, GitBranch, Percent, CheckCircle, XCircle } from 'lucide-react';

const MetricCard = ({ icon: Icon, label, value, trend, color, subValue }) => (
  <div className="bg-gray-700/50 rounded-lg p-3">
    <div className="flex items-center gap-2 mb-1">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-gray-400">{label}</span>
    </div>
    <div className="flex items-baseline gap-2">
      <span className={`text-2xl font-bold ${color}`}>
        {value !== null && value !== undefined
          ? typeof value === 'number'
            ? `${(value * 100).toFixed(1)}%`
            : value
          : '—'}
      </span>
      {trend && (
        <span className={`text-xs ${
          trend === 'up' || trend === 'improving' ? 'text-green-400' :
          trend === 'down' || trend === 'declining' ? 'text-red-400' : 'text-gray-400'
        }`}>
          {trend === 'up' || trend === 'improving' ? '↑' :
           trend === 'down' || trend === 'declining' ? '↓' : '→'}
        </span>
      )}
    </div>
    {subValue && (
      <span className="text-xs text-gray-500">{subValue}</span>
    )}
  </div>
);

export default function MetricsDisplay({ metrics, session, evaluation }) {
  // Extract metrics from various possible structures
  const getMetricValue = (name) => {
    // From evaluation
    if (evaluation?.scores?.[name] !== undefined) return evaluation.scores[name];
    // From metrics aggregates
    if (metrics?.[name]?.current !== undefined) return metrics[name].current;
    if (metrics?.[name] !== undefined) return metrics[name];
    return null;
  };

  const getMetricTrend = (name) => {
    if (metrics?.[name]?.trend) return metrics[name].trend;
    return null;
  };

  const entityCoverage = getMetricValue('entityCoverage') || getMetricValue('entityRecall');
  const entityPrecision = getMetricValue('entityPrecision');
  const relationshipQuality = getMetricValue('relationshipQuality');
  const confidenceDistribution = getMetricValue('confidenceDistribution');
  const overallScore = evaluation?.overallScore || getMetricValue('overallScore');

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-medium text-white">Current Metrics</h3>
        </div>
        <div className="flex items-center gap-2">
          {session && (
            <span className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
              session.state === 'running'
                ? 'bg-green-500/20 text-green-400'
                : session.state === 'paused'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                session.state === 'running' ? 'bg-green-400 animate-pulse' :
                session.state === 'paused' ? 'bg-yellow-400' : 'bg-gray-400'
              }`} />
              {session.state === 'running' ? 'Running' :
               session.state === 'paused' ? 'Paused' : 'Idle'}
            </span>
          )}
          {evaluation?.passed !== undefined && (
            <span className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
              evaluation.passed
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {evaluation.passed
                ? <><CheckCircle className="w-3 h-3" /> Passed</>
                : <><XCircle className="w-3 h-3" /> Failed</>
              }
            </span>
          )}
        </div>
      </div>

      {/* Overall Score */}
      {overallScore !== null && overallScore !== undefined && (
        <div className="mb-4 p-3 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 rounded-lg border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Overall Score</span>
            <span className="text-3xl font-bold text-cyan-400">
              {(overallScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${overallScore * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Metric cards grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Target}
          label="Entity Coverage"
          value={entityCoverage}
          trend={getMetricTrend('entityCoverage')}
          color="text-cyan-400"
        />
        <MetricCard
          icon={Target}
          label="Entity Precision"
          value={entityPrecision}
          trend={getMetricTrend('entityPrecision')}
          color="text-blue-400"
        />
        <MetricCard
          icon={GitBranch}
          label="Relationship Quality"
          value={relationshipQuality}
          trend={getMetricTrend('relationshipQuality')}
          color="text-purple-400"
        />
        <MetricCard
          icon={Percent}
          label="Confidence Distribution"
          value={confidenceDistribution}
          trend={getMetricTrend('confidenceDistribution')}
          color="text-green-400"
        />
      </div>

      {/* Session info */}
      {session && (session.iteration > 0 || session.bestScore) && (
        <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between text-sm text-gray-400">
          <span>
            Iteration: <span className="text-white font-mono">{session.iteration || 0}</span>
          </span>
          {session.bestScore !== undefined && (
            <span>
              Best Score: <span className="text-cyan-400 font-mono">
                {(session.bestScore * 100).toFixed(1)}%
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
