/**
 * FloatingPromptEditor - Draggable/resizable floating window for GXE generation prompt management
 * Features: version dropdown, effectiveness metrics, default toggle, save new versions
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Save, Star, FileText, Loader2, ChevronDown, BarChart3, Clock, Hash, Zap } from 'lucide-react';
import {
  listGenerationPrompts,
  getGenerationPromptMetrics,
  setDefaultGenerationPrompt as apiSetDefault
} from '../../services/gxe.service';

const STORAGE_KEY = 'gxe-prompt-editor-state';

const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return null;
};

const savePanelState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore */ }
};

/** Score color badge */
const scoreBadge = (score) => {
  if (score == null) return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'N/A' };
  const s = parseFloat(score);
  if (s >= 0.8) return { bg: 'bg-green-500/20', text: 'text-green-400', label: s.toFixed(2) };
  if (s >= 0.6) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: s.toFixed(2) };
  return { bg: 'bg-red-500/20', text: 'text-red-400', label: s.toFixed(2) };
};

const FloatingPromptEditor = ({ open, onClose, onSave, onSetDefault }) => {
  const savedState = loadSavedState();

  const [position, setPosition] = useState(savedState?.position || { x: 200, y: 80 });
  const [size, setSize] = useState(savedState?.size || { width: 700, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Prompt management state
  const [promptContent, setPromptContent] = useState('');
  const [promptName, setPromptName] = useState('');
  const [generationPrompts, setGenerationPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [selectedPromptMetrics, setSelectedPromptMetrics] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const dropdownRef = useRef(null);

  // Derived state
  const selectedPrompt = generationPrompts.find(p => p.id === selectedPromptId);
  const isDefault = selectedPrompt?.isDefault === true;
  const nextVersion = generationPrompts.length > 0
    ? Math.max(...generationPrompts.map(v => parseInt(v.version) || 0)) + 1
    : 1;
  const isDirty = selectedPrompt
    ? promptContent !== (selectedPrompt.content || '')
    : promptContent.length > 0;

  // Load prompts on open
  useEffect(() => {
    if (open) {
      loadPrompts();
    }
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Persist position/size
  useEffect(() => {
    const t = setTimeout(() => savePanelState({ position, size }), 100);
    return () => clearTimeout(t);
  }, [position, size]);

  const loadPrompts = async () => {
    setLoadingPrompts(true);
    try {
      const result = await listGenerationPrompts(50);
      if (result.success) {
        const prompts = result.data || [];
        setGenerationPrompts(prompts);
        // Auto-select the default prompt
        const defaultPrompt = prompts.find(p => p.isDefault);
        if (defaultPrompt) {
          selectPrompt(defaultPrompt);
        } else if (prompts.length > 0) {
          selectPrompt(prompts[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load generation prompts:', e);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const selectPrompt = (prompt) => {
    setSelectedPromptId(prompt.id);
    setPromptContent(prompt.content || '');
    setPromptName(prompt.name || '');
    setDropdownOpen(false);
    loadMetrics(prompt.id);
  };

  const loadMetrics = async (promptId) => {
    if (!promptId) return;
    setLoadingMetrics(true);
    try {
      const result = await getGenerationPromptMetrics(promptId);
      if (result.success) {
        setSelectedPromptMetrics(result.data);
      } else {
        setSelectedPromptMetrics(null);
      }
    } catch (e) {
      console.error('Failed to load prompt metrics:', e);
      setSelectedPromptMetrics(null);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const handleSave = async () => {
    if (!promptContent.trim()) return;
    setSaving(true);
    try {
      const name = promptName.trim() || `GXE Prompt v${nextVersion}`;
      await onSave(promptContent, name, { source: 'editor' });
      await loadPrompts();
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedPromptId) return;
    setSettingDefault(true);
    try {
      await onSetDefault(selectedPromptId);
      await loadPrompts();
    } finally {
      setSettingDefault(false);
    }
  };

  // Drag handlers
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => setPosition({
      x: Math.max(0, e.clientX - dragStart.current.x),
      y: Math.max(0, e.clientY - dragStart.current.y)
    });
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  // Resize handlers
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = { width: size.width, height: size.height, x: e.clientX, y: e.clientY };
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e) => {
      setSize({
        width: Math.max(500, resizeStart.current.width + (e.clientX - resizeStart.current.x)),
        height: Math.max(400, resizeStart.current.height + (e.clientY - resizeStart.current.y))
      });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizing]);

  if (!open) return null;

  // Metrics summary
  const metrics = selectedPromptMetrics;
  const totalUses = metrics?.totalUses ?? 0;
  const avgScore = metrics?.avgScore;
  const avgLatency = metrics?.avgLatency;
  const byType = metrics?.byInputType || [];

  return (
    <div
      className="fixed z-[60] bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
    >
      {/* ── Header (drag handle) ── */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[#0d1117] border-b border-[#30363d] cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-sm font-medium text-[#e6edf3] shrink-0">Generation Prompt</span>

          {/* Version dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#21262d] hover:bg-[#30363d] text-xs text-[#e6edf3] border border-[#30363d] min-w-[180px] max-w-[300px]"
            >
              {loadingPrompts ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : selectedPrompt ? (
                <>
                  <span className="font-mono">v{selectedPrompt.version}</span>
                  <span className="text-[#8b949e] truncate">- {selectedPrompt.name || 'Unnamed'}</span>
                  {isDefault && <Star className="w-3 h-3 text-yellow-400 shrink-0" />}
                </>
              ) : (
                <span className="text-[#8b949e]">Select prompt...</span>
              )}
              <ChevronDown className="w-3 h-3 text-[#8b949e] ml-auto shrink-0" />
            </button>

            {dropdownOpen && (
              <div
                className="absolute top-full left-0 mt-1 w-[340px] bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 max-h-[300px] overflow-y-auto"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {generationPrompts.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[#8b949e]">No prompts found</div>
                ) : (
                  generationPrompts.map((p) => {
                    const sc = scoreBadge(p.avgScore);
                    return (
                      <div
                        key={p.id}
                        className={`px-3 py-2 hover:bg-[#21262d] cursor-pointer border-b border-[#21262d] last:border-0 ${
                          p.id === selectedPromptId ? 'bg-purple-500/10' : ''
                        }`}
                        onClick={() => selectPrompt(p)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-[#e6edf3]">v{p.version}</span>
                          <span className="text-xs text-[#8b949e] truncate flex-1">{p.name || 'Unnamed'}</span>
                          {p.isDefault && (
                            <span className="flex items-center gap-0.5 px-1 py-0.5 text-[9px] bg-yellow-500/20 text-yellow-300 rounded">
                              <Star className="w-2.5 h-2.5" /> DEFAULT
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-[#6e7681]">
                          <span>{p.usageCount ?? 0} uses</span>
                          <span className={`px-1 rounded ${sc.bg} ${sc.text}`}>{sc.label}</span>
                          {p.avgLatency != null && (
                            <span>{(p.avgLatency / 1000).toFixed(1)}s</span>
                          )}
                          <span className="ml-auto">
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {isDirty && (
            <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-300 rounded shrink-0">modified</span>
          )}
        </div>

        <button onClick={onClose} className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Metrics Panel ── */}
      {selectedPrompt && (
        <div className="px-3 py-2 bg-[#0d1117]/60 border-b border-[#21262d]">
          {loadingMetrics ? (
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading metrics...
            </div>
          ) : (
            <>
              {/* Summary row */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5 text-[#8b949e]">
                  <Hash className="w-3 h-3" />
                  <span className="text-[#e6edf3] font-medium">{totalUses}</span> uses
                </div>
                <div className="flex items-center gap-1.5 text-[#8b949e]">
                  <BarChart3 className="w-3 h-3" />
                  Avg score:
                  {(() => {
                    const sc = scoreBadge(avgScore);
                    return <span className={`ml-1 px-1 rounded ${sc.bg} ${sc.text}`}>{sc.label}</span>;
                  })()}
                </div>
                <div className="flex items-center gap-1.5 text-[#8b949e]">
                  <Clock className="w-3 h-3" />
                  Avg latency:
                  <span className="text-[#e6edf3] ml-1">
                    {avgLatency != null ? `${(avgLatency / 1000).toFixed(1)}s` : 'N/A'}
                  </span>
                </div>
                {isDefault && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-300 rounded ml-auto">
                    <Star className="w-3 h-3" /> DEFAULT
                  </span>
                )}
              </div>

              {/* By input type breakdown */}
              {byType.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {byType.map((t, i) => {
                    const sc = scoreBadge(t.avgScore);
                    return (
                      <div key={i} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-[#21262d] rounded text-[10px]">
                        <span className="text-[#8b949e]">{t.inputType || 'unknown'}:</span>
                        <span className="text-[#e6edf3]">{t.count}</span>
                        <span className={`px-1 rounded ${sc.bg} ${sc.text}`}>{sc.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Name input */}
        <div className="px-3 py-1.5 border-b border-[#21262d]">
          <input
            type="text"
            value={promptName}
            onChange={(e) => setPromptName(e.target.value)}
            className="w-full bg-transparent text-sm text-[#e6edf3] placeholder-[#484f58] outline-none"
            placeholder="Prompt name (e.g. GXE Custom v3)..."
          />
        </div>

        {/* Textarea */}
        <textarea
          value={promptContent}
          onChange={(e) => setPromptContent(e.target.value)}
          className="flex-1 bg-[#0d1117] text-[#e6edf3] text-sm font-mono p-3 resize-none outline-none border-none"
          placeholder="Enter system prompt for AI graph generation..."
          spellCheck={false}
        />
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[#30363d] bg-[#0d1117]">
        <span className="text-[11px] text-[#8b949e]">
          {promptContent.length} chars
        </span>
        <div className="flex items-center gap-2">
          {/* Set Default button */}
          {selectedPromptId && !isDefault && (
            <button
              onClick={handleSetDefault}
              disabled={settingDefault}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300 border border-yellow-600/30 disabled:opacity-40"
            >
              {settingDefault ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
              Set Default
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !promptContent.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save as v{nextVersion}
          </button>
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100"
        onMouseDown={handleResizeStart}
      >
        <svg viewBox="0 0 16 16" className="w-full h-full text-[#484f58]">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" />
          <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
};

export default FloatingPromptEditor;
