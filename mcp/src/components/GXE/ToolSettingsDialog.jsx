/**
 * ToolSettingsDialog — Modal dialog for editing bound tool parameters.
 *
 * Opens when clicking the inline tool button on a graph node.
 * Loads parameter schema from:
 *   1. AOPEG pluginRegistry (via /api/v1/tool-catalog/executor/:type/schema)
 *   2. MCP tool catalog (fallback)
 * Renders form fields via the project's FormRenderer (FormBuilder system).
 * Saves values back to the parent node's `parameters` object.
 *
 * Style: GXE dark theme, TOOL palette (#d97706 / #fbbf24).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Settings2, RotateCcw, Save, AlertTriangle, Loader2 } from 'lucide-react';
import { FormRenderer } from '../Forms';
import { schemaToFormDefinition, serializeFormValues, prepareInitialData } from './utils/schemaToFormDefinition';
import { useCatalogStore } from '../../stores/catalogStore';

// ── TOOL palette (mirrors HexNode / GXEVisualizerPage) ──
const TOOL_PALETTE = {
  bg: '#1a1a0e',
  border: '#d97706',
  text: '#fbbf24',
  glow: 'rgba(217,119,6,.5)',
};

// ── Schema fetching ──

async function fetchExecutorSchema(executorType, toolRef) {
  // Collect all possible IDs to try (AOPEG type, toolRef, normalized variants)
  const ids = [executorType, toolRef].filter(Boolean);

  // Also try normalizing locally (in case API normalization misses a variant)
  for (const raw of [executorType, toolRef].filter(Boolean)) {
    // "tool-flowdesk-check_location" → "flowdesk.check_location"
    if (raw.startsWith('tool-')) {
      ids.push(raw.slice(5).replace(/-/, '.'));
    }
    // "flowdesk.dialog.check-location" → "flowdesk.check_location" (strip "dialog." and normalize)
    if (raw.includes('.dialog.')) {
      ids.push(raw.replace('.dialog.', '.').replace(/-/g, '_'));
    }
  }

  const uniqueIds = [...new Set(ids)];
  console.debug('[ToolSettingsDialog] Trying IDs:', uniqueIds);

  for (const id of uniqueIds) {
    try {
      const res = await fetch(`/api/v1/tool-catalog/executor/${encodeURIComponent(id)}/schema`);
      if (res.ok) {
        const data = await res.json();
        console.debug('[ToolSettingsDialog] Schema found via:', id, data);
        return data;
      }
    } catch { /* continue to next */ }
  }

  console.warn('[ToolSettingsDialog] No schema found for any of:', uniqueIds);
  return null;
}

// ── Main Dialog ──

const ToolSettingsDialog = ({ nodeId, toolRef, executorType, parameters, onSave, onClose }) => {
  const loadCatalog = useCatalogStore(s => s.loadCatalog);
  const catalogTools = useCatalogStore(s => s.tools);

  // Schema loading state
  const [schemaData, setSchemaData] = useState(null);    // { schema, displayName, description, source }
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState(null);

  // Local parameters for FormRenderer (flattened to dot-notation for nested objects)
  const [localParams, setLocalParams] = useState(() => ({ ...(parameters || {}) }));
  const [dirty, setDirty] = useState(false);

  // Prepare initial data with dot-notation for nested objects (once schema loads)
  const initialFormData = useMemo(() => {
    if (!schemaData?.schema) return localParams;
    return prepareInitialData(parameters || {}, schemaData.schema);
  }, [schemaData, parameters]);

  // Load schema on mount
  useEffect(() => {
    let cancelled = false;
    setSchemaLoading(true);
    setSchemaError(null);

    fetchExecutorSchema(executorType, toolRef)
      .then(data => {
        if (cancelled) return;
        if (data) {
          setSchemaData(data);
        } else {
          setSchemaError(`No schema found for "${executorType || toolRef}"`);
        }
      })
      .catch(err => {
        if (!cancelled) setSchemaError(err.message);
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });

    return () => { cancelled = true; };
  }, [executorType, toolRef]);

  // Also ensure catalog is loaded (for metadata)
  useEffect(() => {
    if (catalogTools.length === 0) loadCatalog();
  }, [catalogTools.length, loadCatalog]);

  // Convert JSON Schema → FormDefinition for FormRenderer
  const formDefinition = useMemo(() => {
    if (!schemaData?.schema) return null;
    return schemaToFormDefinition(schemaData.schema, {
      name: '',  // Name shown in dialog header, not in form
      description: '',
      sectionTitle: 'Parameters',
    });
  }, [schemaData]);

  // Handle form changes (from FormRenderer onChange — receives (formData, fieldName))
  const handleFormChange = useCallback((formData, _fieldName) => {
    setLocalParams({ ...formData });
    setDirty(true);
  }, []);

  // Handle form submit (from FormRenderer onSubmit)
  const handleFormSubmit = useCallback((formData) => {
    const serialized = schemaData?.schema
      ? serializeFormValues(formData, schemaData.schema)
      : formData;
    onSave(nodeId, serialized);
    setDirty(false);
    onClose();
  }, [nodeId, schemaData, onSave, onClose]);

  const handleSave = useCallback(() => {
    const serialized = schemaData?.schema
      ? serializeFormValues(localParams, schemaData.schema)
      : localParams;
    onSave(nodeId, serialized);
    setDirty(false);
    onClose();
  }, [nodeId, localParams, schemaData, onSave, onClose]);

  const handleReset = useCallback(() => {
    setLocalParams({ ...(parameters || {}) });
    setDirty(false);
  }, [parameters]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const displayName = schemaData?.displayName || toolRef || 'Tool Settings';
  const description = schemaData?.description || '';
  const source = schemaData?.source;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Dialog */}
      <div
        className="relative w-[520px] max-h-[80vh] flex flex-col rounded-xl border-2 overflow-hidden shadow-2xl"
        style={{
          backgroundColor: '#161b22',
          borderColor: TOOL_PALETTE.border,
          boxShadow: `0 0 40px ${TOOL_PALETTE.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: TOOL_PALETTE.border + '60', backgroundColor: TOOL_PALETTE.bg }}
        >
          <Settings2 className="w-4 h-4" style={{ color: TOOL_PALETTE.text }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium" style={{ color: TOOL_PALETTE.text }}>
              {displayName}
            </div>
            <div className="text-[10px] font-mono text-gray-500 truncate">
              {executorType || toolRef}
              {source && <span className="ml-2 text-gray-600">({source})</span>}
            </div>
          </div>
          <span
            className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ backgroundColor: TOOL_PALETTE.border + '25', color: TOOL_PALETTE.text }}
          >tool</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#30363d] transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Tool description */}
        {description && (
          <div className="px-4 py-2 border-b border-[#30363d] bg-[#0d1117]">
            <p className="text-[11px] text-gray-400 leading-relaxed">{description}</p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Loading state */}
          {schemaLoading && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
              <span className="text-xs text-gray-500">Loading tool schema...</span>
            </div>
          )}

          {/* Schema loaded — render form via FormRenderer */}
          {!schemaLoading && formDefinition && (
            <FormRenderer
              formDefinition={formDefinition}
              mode="EMBEDDED"
              initialData={initialFormData}
              onSubmit={handleFormSubmit}
              onChange={handleFormChange}
              submitLabel="Save"
              layout="vertical"
              spacing={2}
            />
          )}

          {/* No schema — fallback JSON editor with diagnostic info */}
          {!schemaLoading && !formDefinition && (
            <div className="py-4">
              {schemaError && (
                <div className="flex items-center gap-2 mb-3 text-amber-500/70">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px]">{schemaError}</span>
                </div>
              )}
              <div className="mb-3 p-2 rounded bg-[#0d1117] border border-[#30363d] text-[10px] font-mono text-gray-500 space-y-0.5">
                <div>toolRef: <span className="text-gray-400">{toolRef || '(empty)'}</span></div>
                <div>executorType: <span className="text-gray-400">{executorType || '(empty)'}</span></div>
                <div>schemaData: <span className="text-gray-400">{schemaData ? 'loaded' : 'null'}</span></div>
              </div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                Parameters (JSON)
              </label>
              <textarea
                value={JSON.stringify(localParams, null, 2)}
                onChange={(e) => {
                  try {
                    setLocalParams(JSON.parse(e.target.value));
                    setDirty(true);
                  } catch { /* allow invalid while typing */ }
                }}
                rows={8}
                className="w-full px-2.5 py-1.5 text-[11px] font-mono rounded-md bg-[#0d1117] border border-[#30363d] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer — only when NOT using FormRenderer (which has its own submit) */}
        {!schemaLoading && (
          <div
            className="flex items-center gap-2 px-4 py-3 border-t border-[#30363d]"
            style={{ backgroundColor: '#0d1117' }}
          >
            <button
              onClick={handleReset}
              disabled={!dirty}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-md bg-[#21262d] border border-[#30363d] text-gray-400 hover:bg-[#30363d] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[11px] rounded-md bg-[#21262d] border border-[#30363d] text-gray-400 hover:bg-[#30363d] transition-colors"
            >
              Cancel
            </button>
            {!formDefinition && (
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-4 py-1.5 text-[11px] font-medium rounded-md border transition-colors"
                style={{
                  backgroundColor: dirty ? TOOL_PALETTE.border + '30' : TOOL_PALETTE.border + '15',
                  borderColor: TOOL_PALETTE.border,
                  color: TOOL_PALETTE.text,
                }}
              >
                <Save className="w-3 h-3" /> Save
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolSettingsDialog;
