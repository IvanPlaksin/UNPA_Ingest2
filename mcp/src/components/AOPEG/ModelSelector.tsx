/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ModelSelector Component
 * Dropdown for selecting AI model in the Graph Builder chat
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  Cpu,
  Sparkles,
  Server,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { AIModel, ModelInfo } from '../../hooks/useGraphBuilderAgent';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface ModelSelectorProps {
  models: AIModel[];
  currentModelId: string | null;
  currentModelInfo: ModelInfo | null;
  onModelSelect: (modelId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER ICONS
// ────────────────────────────────────────────────────────────────────────────

const providerIcons: Record<string, React.ReactNode> = {
  gemini: <Sparkles className="w-4 h-4 text-blue-400" />,
  anthropic: <Cpu className="w-4 h-4 text-amber-400" />,
  ollama: <Server className="w-4 h-4 text-indigo-400" />,
};

const providerColors: Record<string, string> = {
  gemini: 'border-blue-500/30 bg-blue-500/10',
  anthropic: 'border-amber-500/30 bg-amber-500/10',
  ollama: 'border-indigo-500/30 bg-indigo-500/10',
};

const providerDisplayNames: Record<string, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  ollama: 'Meta Llama (Local)',
};

const tierBadges: Record<string, { label: string; color: string }> = {
  recommended: { label: 'Recommended', color: 'bg-emerald-500/20 text-emerald-400' },
  premium: { label: 'Premium', color: 'bg-amber-500/20 text-amber-400' },
  standard: { label: 'Standard', color: 'bg-slate-500/20 text-slate-400' },
  local: { label: 'Local', color: 'bg-cyan-500/20 text-cyan-400' },
};

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export function ModelSelector({
  models,
  currentModelId,
  currentModelInfo,
  onModelSelect,
  loading = false,
  disabled = false,
  compact = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Group models by provider
  const groupedModels = models.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, AIModel[]>);

  // Get current model display
  const currentModel = models.find(m => m.id === currentModelId);
  const displayName = currentModel?.displayName || currentModelInfo?.displayName || 'Select Model';
  const displayProvider = currentModel?.provider || currentModelInfo?.provider || '';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-selector')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (modelId: string) => {
    onModelSelect(modelId);
    setIsOpen(false);
  };

  return (
    <div className="model-selector relative">
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg
          border border-[#30363d] bg-[#161b22]
          hover:bg-[#21262d] hover:border-[#3d444d]
          transition-all duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${compact ? 'text-xs' : 'text-sm'}
        `}
      >
        {displayProvider && providerIcons[displayProvider]}
        <span className="text-gray-200 truncate max-w-[120px]">
          {loading ? 'Loading...' : displayName}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] max-h-[400px] overflow-y-auto
          bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl
          animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {Object.entries(groupedModels).map(([provider, providerModels]) => (
            <div key={provider}>
              {/* Provider Header */}
              <div className={`px-3 py-2 border-b border-[#30363d] ${providerColors[provider] || ''}`}>
                <div className="flex items-center gap-2">
                  {providerIcons[provider] || <Cpu className="w-4 h-4 text-gray-400" />}
                  <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                    {providerDisplayNames[provider] || provider}
                  </span>
                </div>
              </div>

              {/* Models */}
              {providerModels.map(model => {
                const isSelected = model.id === currentModelId;
                const isAvailable = model.available !== false;

                return (
                  <button
                    key={model.id}
                    onClick={() => isAvailable && handleSelect(model.id)}
                    disabled={!isAvailable}
                    className={`
                      w-full px-3 py-2 flex items-start gap-3 text-left
                      transition-colors duration-150
                      ${isSelected ? 'bg-blue-500/10' : 'hover:bg-[#21262d]'}
                      ${!isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {/* Selection Indicator */}
                    <div className="mt-0.5 w-4 h-4 flex-shrink-0">
                      {isSelected ? (
                        <Check className="w-4 h-4 text-blue-400" />
                      ) : !isAvailable ? (
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                      ) : null}
                    </div>

                    {/* Model Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isSelected ? 'text-blue-400' : 'text-gray-200'}`}>
                          {model.displayName}
                        </span>
                        {model.tier && tierBadges[model.tier] && (
                          <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${tierBadges[model.tier].color}`}>
                            {tierBadges[model.tier].label}
                          </span>
                        )}
                      </div>
                      {model.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {model.description}
                        </p>
                      )}
                      {!isAvailable && (
                        <p className="text-xs text-yellow-500/80 mt-0.5">
                          API key not configured
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}

          {models.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              No models available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ModelSelector;
