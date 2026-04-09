/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Input Data Modal
 * Modal for entering input data before graph execution - Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback } from 'react';
import {
  X,
  Play,
  AlertCircle,
  Code,
  FileJson,
  Clipboard,
  Check,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface InputDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (input: unknown, variables?: Record<string, unknown>) => void;
  graphName?: string;
  entryNodeName?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE TEMPLATES
// ────────────────────────────────────────────────────────────────────────────

const EXAMPLE_TEMPLATES = [
  {
    name: 'Empty Object',
    value: '{}',
  },
  {
    name: 'Text Input',
    value: JSON.stringify({ text: 'Sample text to process', source: 'manual' }, null, 2),
  },
  {
    name: 'Document Input',
    value: JSON.stringify({
      content: 'Document content here...',
      metadata: {
        title: 'Sample Document',
        type: 'markdown',
        author: 'User',
      },
    }, null, 2),
  },
  {
    name: 'Work Item Input',
    value: JSON.stringify({
      workItemId: 12345,
      project: 'MyProject',
      includeRelated: true,
    }, null, 2),
  },
];

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────

export const InputDataModal: React.FC<InputDataModalProps> = ({
  isOpen,
  onClose,
  onExecute,
  graphName,
  entryNodeName,
}) => {
  const [inputJson, setInputJson] = useState('{}');
  const [variablesJson, setVariablesJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'input' | 'variables'>('input');
  const [copied, setCopied] = useState(false);

  // Validate JSON
  const validateJson = useCallback((json: string): boolean => {
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Handle execute
  const handleExecute = useCallback(() => {
    setError(null);

    // Validate input JSON
    if (!validateJson(inputJson)) {
      setError('Invalid input JSON');
      return;
    }

    // Validate variables JSON
    if (!validateJson(variablesJson)) {
      setError('Invalid variables JSON');
      return;
    }

    try {
      const input = JSON.parse(inputJson);
      const variables = JSON.parse(variablesJson);

      onExecute(input, Object.keys(variables).length > 0 ? variables : undefined);
      onClose();
    } catch (e) {
      setError('Failed to parse JSON');
    }
  }, [inputJson, variablesJson, validateJson, onExecute, onClose]);

  // Apply template
  const applyTemplate = useCallback((template: string) => {
    setInputJson(template);
    setError(null);
  }, []);

  // Copy to clipboard
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inputJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  }, [inputJson]);

  // Format JSON
  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(activeTab === 'input' ? inputJson : variablesJson);
      const formatted = JSON.stringify(parsed, null, 2);
      if (activeTab === 'input') {
        setInputJson(formatted);
      } else {
        setVariablesJson(formatted);
      }
      setError(null);
    } catch {
      setError('Cannot format invalid JSON');
    }
  }, [activeTab, inputJson, variablesJson]);

  if (!isOpen) return null;

  const currentJson = activeTab === 'input' ? inputJson : variablesJson;
  const setCurrentJson = activeTab === 'input' ? setInputJson : setVariablesJson;
  const isValid = validateJson(currentJson);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[700px] max-h-[80vh] bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#30363d]">
          <div>
            <h2 className="text-lg font-semibold text-[#f0f6fc]">Execute Graph</h2>
            {graphName && (
              <p className="text-sm text-[#8b949e] mt-0.5">{graphName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#30363d]">
          <button
            onClick={() => setActiveTab('input')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'input'
                ? 'text-[#f0f6fc] border-b-2 border-blue-500 bg-[#21262d]/50'
                : 'text-[#8b949e] hover:text-[#f0f6fc]'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileJson className="w-4 h-4" />
              Input Data
            </div>
          </button>
          <button
            onClick={() => setActiveTab('variables')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'variables'
                ? 'text-[#f0f6fc] border-b-2 border-blue-500 bg-[#21262d]/50'
                : 'text-[#8b949e] hover:text-[#f0f6fc]'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Code className="w-4 h-4" />
              Variables
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {/* Templates (only for input tab) */}
          {activeTab === 'input' && (
            <div className="mb-3">
              <label className="text-xs text-[#8b949e] mb-2 block">Quick Templates</label>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    onClick={() => applyTemplate(template.value)}
                    className="px-2 py-1 text-xs bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#30363d] border border-[#30363d] rounded transition-colors"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* JSON Editor */}
          <div className="flex-1 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#8b949e]">
                {activeTab === 'input' ? 'Input JSON' : 'Variables JSON'}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={formatJson}
                  className="px-2 py-1 text-xs text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors"
                >
                  Format
                </button>
                <button
                  onClick={copyToClipboard}
                  className="px-2 py-1 text-xs text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <textarea
              value={currentJson}
              onChange={(e) => {
                setCurrentJson(e.target.value);
                setError(null);
              }}
              className={`w-full h-[250px] p-3 bg-[#0d1117] border rounded-lg font-mono text-sm text-[#f0f6fc] resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500/50
                         ${!isValid ? 'border-red-500/50' : 'border-[#30363d]'}`}
              placeholder={activeTab === 'input' ? '{\n  "key": "value"\n}' : '{\n  "variable": "value"\n}'}
              spellCheck={false}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Entry node info */}
          {entryNodeName && (
            <div className="mt-3 text-xs text-[#6e7681]">
              Entry node: <span className="text-[#8b949e]">{entryNodeName}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#30363d]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={!validateJson(inputJson) || !validateJson(variablesJson)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
          >
            <Play className="w-4 h-4" />
            Execute
          </button>
        </div>
      </div>
    </div>
  );
};

export default InputDataModal;
