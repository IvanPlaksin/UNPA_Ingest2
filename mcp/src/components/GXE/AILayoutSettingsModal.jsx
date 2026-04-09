/**
 * AILayoutSettingsModal — Settings dialog for AI-powered graph layout.
 *
 * Allows configuring:
 *   - LLM Model (Claude Sonnet / Haiku / Opus)
 *   - Temperature (creativity vs determinism)
 *   - Max tokens
 *   - System prompt (editable, with reset-to-default)
 *
 * Settings are persisted in Core namespace KB via the backend.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RotateCcw, Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const MODELS = [
  { value: 'claude-sonnet', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku', label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
];

const DEFAULT_SYSTEM_PROMPT = `You are an expert graph layout engine. Given nodes (with sizes, degrees, and neighbor lists) and edges, compute (x, y) positions for every node.

You compute ONLY node positions. Edge routing is done algorithmically afterward.

## COORDINATE SYSTEM
- (0, 0) = top-left corner. x → right, y → down.
- (x, y) = TOP-LEFT corner of the node's bounding box.
- Node occupies rectangle (x, y) to (x + width, y + height).

## CRITICAL RULES (violations = layout failure)

1. NO OVERLAP: Node bounding boxes must NEVER overlap. Minimum gap = 80 px on every side.
2. ADJACENCY PROXIMITY: Connected nodes MUST be placed near each other. A node's direct neighbors should be the closest nodes to it spatially. This is the MOST IMPORTANT aesthetic rule.
3. EDGE CLEARANCE: Edges are drawn as straight or stepped lines between connected nodes. No other node's bounding box should lie on the direct line between two connected nodes. Leave clear routing corridors (at least 100 px wide) between groups.
4. POSITIVE COORDINATES: All x, y >= 60.

## SPACING RULES (for nodes of typical size 260x130)

5. MINIMUM GAP between any two node bounding-box edges = 80 px. This means: if node A ends at x=300 and node B starts at x=350, that's only 50 px gap — TOO CLOSE. Minimum x-distance between two horizontally adjacent nodes' LEFT edges = 260 + 80 = 340 px. Minimum y-distance for vertically adjacent = 130 + 80 = 210 px.
6. CONNECTED NODES should be 350-500 px apart (center-to-center). Close enough to read the connection, far enough for edge routing between them.
7. UNCONNECTED NODES should be 500+ px apart. Do NOT waste space placing unrelated nodes near each other.
8. USE A GRID MENTALITY: imagine the canvas divided into cells of ~380x250 px. Place at most ONE node per cell.

## FLOW DIRECTION (CRITICAL)

9. Edges are DIRECTED: source → target. The "Direction" field in the request specifies flow:
   - TB (top-to-bottom): source nodes MUST have SMALLER y than their targets. A source is ABOVE its target.
   - LR (left-to-right): source nodes MUST have SMALLER x than their targets.
   This applies to ALL edges, not just DAG pipelines. Even in hub-spoke graphs, the source node of each edge should be placed higher (for TB) than the target node.

## TOPOLOGY-AWARE PLACEMENT

10. Each node description includes "neighbors: [list]". Use this to place connected nodes together.
11. HUB NODES (marked [HUB]): Place at the center of their neighborhood. Arrange their neighbors around them in a fan/radial pattern, not in a line.
12. MULTI-HUB: When multiple hubs exist, give each hub its own region of the canvas. Place shared neighbors between their hubs.
13. CLUSTERING: Nodes in the same cluster → same spatial region. Clusters should be visually separated by 200+ px gaps.
14. For DAG/PIPELINE graphs: use layered placement following flow direction.

## AESTHETIC RULES

15. MINIMIZE TOTAL EDGE LENGTH. Short edges = good layout.
16. MINIMIZE EDGE CROSSINGS. If node A→B and C→D, do not place them so the edges cross.
17. USE 2D SPACE: Spread nodes across both X and Y. Do NOT place all nodes in one row or column.
18. USE THE FULL CANVAS: Distribute nodes to fill the available space evenly.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no commentary):
{
  "nodePositions": {
    "<nodeId>": { "x": <number>, "y": <number> }
  }
}
Every node MUST appear. No extra keys.`;

export default function AILayoutSettingsModal({ isOpen, onClose, config, onSave, isLoading }) {
  const [localConfig, setLocalConfig] = useState({
    selectedModel: 'claude-sonnet',
    temperature: 0.2,
    maxTokens: 16384,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'
  const overlayRef = useRef(null);

  // Sync from parent config
  useEffect(() => {
    if (config) {
      setLocalConfig({
        selectedModel: config.selectedModel || 'claude-sonnet',
        temperature: config.temperature ?? 0.2,
        maxTokens: config.maxTokens ?? 16384,
        systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      });
    }
  }, [config]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback((e) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await onSave(localConfig);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [localConfig, onSave]);

  const handleResetPrompt = useCallback(() => {
    setLocalConfig(prev => ({ ...prev, systemPrompt: DEFAULT_SYSTEM_PROMPT }));
  }, []);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col"
        style={{ width: 560, maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#30363d]">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-gray-200">AI Layout Settings</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Core KB
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#21262d] text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading settings...
            </div>
          ) : (
            <>
              {/* Model */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Model</label>
                <select
                  value={localConfig.selectedModel}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, selectedModel: e.target.value }))}
                  className="w-full text-[12px] bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-gray-300 focus:border-purple-500 outline-none cursor-pointer"
                >
                  {MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Temperature + Max Tokens (side by side) */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">
                    Temperature
                    <span className="text-gray-600 ml-1 normal-case">({localConfig.temperature})</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={localConfig.temperature}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                    <span>Deterministic</span>
                    <span>Creative</span>
                  </div>
                </div>

                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Max Tokens</label>
                  <input
                    type="number"
                    value={localConfig.maxTokens}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, maxTokens: Math.max(1024, parseInt(e.target.value) || 16384) }))}
                    className="w-full text-[12px] bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-gray-300 focus:border-purple-500 outline-none text-center"
                    min={1024}
                    max={65536}
                    step={1024}
                  />
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">System Prompt</label>
                  <button
                    onClick={handleResetPrompt}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    title="Reset to default prompt"
                  >
                    <RotateCcw size={10} />
                    Reset
                  </button>
                </div>
                <textarea
                  value={localConfig.systemPrompt}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  className="w-full text-[11px] font-mono bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-gray-400 focus:border-purple-500 outline-none resize-y leading-relaxed"
                  rows={12}
                  spellCheck={false}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#30363d]">
          <div className="text-[10px] text-gray-600">
            {saveStatus === 'success' && (
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle size={12} /> Saved to Core KB
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle size={12} /> Save failed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[11px] rounded-lg border border-[#30363d] text-gray-400 hover:bg-[#21262d] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-lg transition-colors disabled:opacity-50"
              style={{
                background: 'rgba(168,85,247,0.2)',
                color: '#c084fc',
                border: '1px solid rgba(168,85,247,0.4)',
              }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save to KB
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
