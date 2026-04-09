/**
 * @fileoverview Parameter Controls with Sliders
 * @module components/PipelineLab/TuningLab/ParameterControls
 */

import React from 'react';
import { Sliders, Info } from 'lucide-react';

// Default tunable parameters if API doesn't provide them
const DEFAULT_PARAMS = [
  {
    path: 'entityExtraction.minConfidence',
    label: 'Entity Min Confidence',
    min: 0.1,
    max: 0.99,
    step: 0.05,
    description: 'Minimum confidence threshold for entity extraction',
  },
  {
    path: 'entityExtraction.llm.temperature',
    label: 'LLM Temperature',
    min: 0,
    max: 1,
    step: 0.1,
    description: 'LLM creativity (lower = more deterministic)',
  },
  {
    path: 'relationshipExtraction.coOccurrence.baseConfidence',
    label: 'Co-occurrence Base Confidence',
    min: 0.3,
    max: 0.8,
    step: 0.05,
    description: 'Base confidence for co-occurrence relationships',
  },
  {
    path: 'relationshipExtraction.patterns.minConfidence',
    label: 'Pattern Min Confidence',
    min: 0.3,
    max: 0.9,
    step: 0.05,
    description: 'Minimum confidence for pattern-based relationships',
  },
  {
    path: 'chunking.maxTokens',
    label: 'Chunk Max Tokens',
    min: 128,
    max: 2048,
    step: 64,
    description: 'Maximum tokens per chunk',
  },
  {
    path: 'chunking.overlapTokens',
    label: 'Chunk Overlap',
    min: 0,
    max: 256,
    step: 16,
    description: 'Token overlap between chunks',
  },
];

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * Format value for display
 */
function formatValue(value, param) {
  if (value === undefined || value === null) return '—';
  if (param.path.includes('Tokens')) return Math.round(value);
  if (typeof value === 'number') return value.toFixed(2);
  return value;
}

export default function ParameterControls({ config, parameters, onChange, disabled }) {
  // Use provided parameters or fallback to defaults
  const params = parameters?.length > 0 ? parameters : DEFAULT_PARAMS;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-medium text-white">Parameters</h3>
        {disabled && (
          <span className="ml-auto text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
            Locked during tuning
          </span>
        )}
      </div>

      {!config ? (
        <div className="text-center py-8 text-gray-500">
          Loading configuration...
        </div>
      ) : (
        <div className="space-y-5">
          {params.map((param) => {
            const currentValue = getNestedValue(config, param.path);
            const value = currentValue !== undefined ? currentValue : param.default ?? param.min;
            const isInteger = param.path.includes('Tokens');

            return (
              <div key={param.path} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <label className="text-gray-300 flex items-center gap-1">
                    {param.label || param.path}
                    {param.description && (
                      <span className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg z-10">
                          {param.description}
                        </span>
                      </span>
                    )}
                  </label>
                  <span className="text-cyan-400 font-mono text-sm">
                    {formatValue(value, param)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-10 text-right">
                    {isInteger ? Math.round(param.min) : param.min}
                  </span>
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={value}
                    onChange={(e) => {
                      const newValue = isInteger
                        ? parseInt(e.target.value, 10)
                        : parseFloat(e.target.value);
                      onChange(param.path, newValue);
                    }}
                    disabled={disabled}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                             disabled:opacity-50 disabled:cursor-not-allowed
                             accent-cyan-500"
                    style={{
                      background: disabled
                        ? '#374151'
                        : `linear-gradient(to right, #06B6D4 0%, #06B6D4 ${((value - param.min) / (param.max - param.min)) * 100}%, #374151 ${((value - param.min) / (param.max - param.min)) * 100}%, #374151 100%)`,
                    }}
                  />
                  <span className="text-xs text-gray-500 w-10">
                    {isInteger ? Math.round(param.max) : param.max}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
