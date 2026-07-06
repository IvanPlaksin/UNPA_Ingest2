/**
 * @fileoverview Optimization History Chart
 * @module components/PipelineLab/TuningLab/OptimizationChart
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';

export default function OptimizationChart({ history }) {
  // Transform history data for chart
  const data = (history || []).map((item, index) => ({
    iteration: index + 1,
    score: item.score !== undefined ? (item.score * 100) : null,
    entityRecall: item.metrics?.entityRecall !== undefined
      ? (item.metrics.entityRecall * 100)
      : item.evaluation?.entityRecall !== undefined
        ? (item.evaluation.entityRecall * 100)
        : null,
    entityPrecision: item.metrics?.entityPrecision !== undefined
      ? (item.metrics.entityPrecision * 100)
      : item.evaluation?.entityPrecision !== undefined
        ? (item.evaluation.entityPrecision * 100)
        : null,
    f1: item.metrics?.f1_score !== undefined
      ? (item.metrics.f1_score * 100)
      : item.evaluation?.f1 !== undefined
        ? (item.evaluation.f1 * 100)
        : null,
  }));

  // Find best score
  const bestScore = data.reduce((best, item) =>
    (item.score || 0) > (best || 0) ? item.score : best, 0);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
        <p className="text-gray-400 text-sm mb-2">Iteration {label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value?.toFixed(1)}%
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-medium text-white">Optimization History</h3>
        </div>
        {data.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span className="text-gray-400">
              Best: <span className="text-cyan-400 font-mono">{bestScore?.toFixed(1)}%</span>
            </span>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
          <TrendingUp className="w-12 h-12 mb-3 opacity-30" />
          <p>No optimization history yet</p>
          <p className="text-sm mt-1">Start a tuning session to see progress</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="iteration"
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF', fontSize: 13 }}
              tickLine={{ stroke: '#4B5563' }}
            />
            <YAxis
              stroke="#9CA3AF"
              domain={[0, 100]}
              tick={{ fill: '#9CA3AF', fontSize: 13 }}
              tickLine={{ stroke: '#4B5563' }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="line"
            />

            {/* Reference line for best score */}
            {bestScore > 0 && (
              <ReferenceLine
                y={bestScore}
                stroke="#06B6D4"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
              />
            )}

            {/* Main score line */}
            <Line
              type="monotone"
              dataKey="score"
              stroke="#06B6D4"
              strokeWidth={2}
              dot={{ fill: '#06B6D4', r: 4 }}
              activeDot={{ r: 6, fill: '#06B6D4' }}
              name="Overall Score"
              connectNulls
            />

            {/* F1 Score */}
            <Line
              type="monotone"
              dataKey="f1"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: '#10B981', r: 3 }}
              name="F1 Score"
              connectNulls
            />

            {/* Recall (dashed) */}
            <Line
              type="monotone"
              dataKey="entityRecall"
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Recall"
              connectNulls
            />

            {/* Precision (dashed) */}
            <Line
              type="monotone"
              dataKey="entityPrecision"
              stroke="#EF4444"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="Precision"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Summary stats */}
      {data.length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">Iterations</p>
            <p className="text-lg font-semibold text-white">{data.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">First Score</p>
            <p className="text-lg font-semibold text-gray-400">
              {data[0]?.score?.toFixed(1) || '—'}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Last Score</p>
            <p className="text-lg font-semibold text-white">
              {data[data.length - 1]?.score?.toFixed(1) || '—'}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Improvement</p>
            <p className={`text-lg font-semibold ${
              (data[data.length - 1]?.score || 0) > (data[0]?.score || 0)
                ? 'text-green-400'
                : 'text-red-400'
            }`}>
              {data[0]?.score
                ? `${((data[data.length - 1]?.score || 0) - data[0].score).toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
