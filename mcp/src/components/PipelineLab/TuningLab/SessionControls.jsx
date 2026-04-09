/**
 * @fileoverview Session Controls (Start/Stop/Options)
 * @module components/PipelineLab/TuningLab/SessionControls
 */

import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, RotateCcw, Settings, Pause, ChevronDown } from 'lucide-react';

const STRATEGIES = [
  { value: 'random', label: 'Random Search', description: 'Fast, good for exploration' },
  { value: 'grid', label: 'Grid Search', description: 'Systematic, exhaustive search' },
  { value: 'bayesian', label: 'Bayesian', description: 'Smart, learns from results' },
];

const METRICS = [
  { value: 'f1_score', label: 'F1 Score' },
  { value: 'entityRecall', label: 'Entity Recall' },
  { value: 'entityPrecision', label: 'Entity Precision' },
  { value: 'relationshipQuality', label: 'Relationship Quality' },
];

export default function SessionControls({ activeSession, status, onStart, onStop, onReset, loading }) {
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({
    maxIterations: 10,
    strategy: 'random',
    targetMetric: 'f1_score',
  });
  const optionsRef = useRef(null);

  const isRunning = activeSession?.state === 'running';
  const isPaused = activeSession?.state === 'paused';

  // Close options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStart = () => {
    onStart(options);
    setShowOptions(false);
  };

  return (
    <div className="flex items-center gap-2 relative" ref={optionsRef}>
      {/* Reset button */}
      <button
        onClick={onReset}
        disabled={loading || isRunning}
        className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Reset to defaults"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      {!isRunning && !isPaused ? (
        <>
          {/* Options button */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={`p-2 rounded-lg transition-colors ${
              showOptions
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            title="Tuning options"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500
                       text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Tuning
          </button>
        </>
      ) : (
        <button
          onClick={() => onStop(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500
                     text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Square className="w-4 h-4" />
          Stop & Apply Best
        </button>
      )}

      {/* Options dropdown */}
      {showOptions && (
        <div className="absolute top-full right-0 mt-2 p-4 bg-gray-800 rounded-lg shadow-xl
                        border border-gray-700 z-20 min-w-[280px]">
          <h4 className="text-sm font-medium text-white mb-4">Tuning Options</h4>

          <div className="space-y-4">
            {/* Max Iterations */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Max Iterations
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="3"
                  max="50"
                  step="1"
                  value={options.maxIterations}
                  onChange={(e) => setOptions({ ...options, maxIterations: parseInt(e.target.value) })}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="w-8 text-center text-cyan-400 font-mono">
                  {options.maxIterations}
                </span>
              </div>
            </div>

            {/* Strategy */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Optimization Strategy
              </label>
              <div className="space-y-2">
                {STRATEGIES.map((strategy) => (
                  <label
                    key={strategy.value}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      options.strategy === strategy.value
                        ? 'bg-cyan-600/20 border border-cyan-500/50'
                        : 'bg-gray-700/50 border border-transparent hover:bg-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      value={strategy.value}
                      checked={options.strategy === strategy.value}
                      onChange={(e) => setOptions({ ...options, strategy: e.target.value })}
                      className="mt-1 accent-cyan-500"
                    />
                    <div>
                      <span className="text-sm text-white">{strategy.label}</span>
                      <p className="text-xs text-gray-500">{strategy.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Target Metric */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Target Metric
              </label>
              <select
                value={options.targetMetric}
                onChange={(e) => setOptions({ ...options, targetMetric: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white border border-gray-600
                           focus:border-cyan-500 focus:outline-none"
              >
                {METRICS.map((metric) => (
                  <option key={metric.value} value={metric.value}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 pt-4 border-t border-gray-700 flex justify-end gap-2">
            <button
              onClick={() => setShowOptions(false)}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm
                         flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              Start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
