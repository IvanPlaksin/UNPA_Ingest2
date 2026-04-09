/**
 * @fileoverview LLM Provider Selector Component
 * @module components/PipelineLab/TuningLab/ProviderSelector
 */

import React, { useState, useEffect } from 'react';
import { Cpu, Cloud, Check, X, RefreshCw, Zap } from 'lucide-react';

export default function ProviderSelector({ api, onProviderChange }) {
  const [providers, setProviders] = useState([]);
  const [activeProvider, setActiveProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(null);

  // Load providers on mount
  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const result = await api.getProviders();
      setProviders(result.providers || []);
      setActiveProvider(result.active);
    } catch (err) {
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProvider = async (name) => {
    if (name === activeProvider || switching) return;

    setSwitching(name);
    try {
      await api.selectProvider(name);
      setActiveProvider(name);
      onProviderChange?.(name);
    } catch (err) {
      console.error('Failed to switch provider:', err);
    } finally {
      setSwitching(null);
    }
  };

  const getProviderIcon = (provider) => {
    if (provider.type === 'local') {
      return <Cpu className="w-5 h-5" />;
    }
    return <Cloud className="w-5 h-5" />;
  };

  const getStatusColor = (provider) => {
    if (!provider.available) return 'text-red-400';
    if (provider.name === activeProvider) return 'text-green-400';
    return 'text-gray-400';
  };

  const getStatusIcon = (provider) => {
    if (!provider.available) return <X className="w-4 h-4 text-red-400" />;
    if (provider.name === activeProvider) return <Check className="w-4 h-4 text-green-400" />;
    return null;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h3 className="text-lg font-medium text-white">AI Provider</h3>
        </div>
        <button
          onClick={loadProviders}
          disabled={loading}
          className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.name}
            onClick={() => handleSelectProvider(provider.name)}
            disabled={!provider.available || switching}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
              provider.name === activeProvider
                ? 'bg-cyan-900/30 border-cyan-500/50'
                : provider.available
                  ? 'bg-gray-700/50 border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                  : 'bg-gray-800/50 border-gray-700 opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={getStatusColor(provider)}>
                {getProviderIcon(provider)}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${provider.name === activeProvider ? 'text-cyan-400' : 'text-white'}`}>
                    {provider.name.charAt(0).toUpperCase() + provider.name.slice(1)}
                  </span>
                  {provider.type === 'local' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">
                      Local
                    </span>
                  )}
                  {provider.type === 'cloud' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400">
                      Cloud
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{provider.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {switching === provider.name ? (
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                getStatusIcon(provider)
              )}
            </div>
          </button>
        ))}

        {providers.length === 0 && !loading && (
          <div className="text-center py-4 text-gray-500">
            No providers configured
          </div>
        )}

        {loading && providers.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2" />
            Loading providers...
          </div>
        )}
      </div>

      {/* Active provider info */}
      {activeProvider && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">
            Active: <span className="text-cyan-400 font-medium">{activeProvider}</span>
          </p>
        </div>
      )}
    </div>
  );
}
