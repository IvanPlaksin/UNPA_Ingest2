import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

const JsonSection = ({ title, data, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) return null;

  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="gxe-ctx__section">
      <button className="gxe-ctx__header" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        <span className="gxe-ctx__copy" role="button" tabIndex={0} onClick={handleCopy} title="Copy JSON">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </span>
      </button>
      {open && (
        <pre className="gxe-ctx__json">{json}</pre>
      )}
    </div>
  );
};

const ContextTab = ({ execution }) => {
  const sections = [
    { title: 'Input Payload', data: execution.inputPayload, defaultOpen: true },
    { title: 'Variables', data: execution.variables },
    { title: 'Global Variables', data: execution.globalVariables },
    { title: 'Node States', data: execution.nodeStates },
    { title: 'Node Outputs', data: execution.nodeOutputs },
    { title: 'Metadata', data: execution.metadata },
    { title: 'Trigger Config', data: execution.triggerConfig },
  ];

  const hasSections = sections.some(s => s.data && (typeof s.data !== 'object' || Object.keys(s.data).length > 0));

  return (
    <div className="gxe-tab gxe-ctx">
      {!hasSections ? (
        <div className="gxe-tab__empty">No context data available</div>
      ) : (
        sections.map(s => (
          <JsonSection key={s.title} title={s.title} data={s.data} defaultOpen={s.defaultOpen} />
        ))
      )}

      <style>{`
        .gxe-ctx { display: flex; flex-direction: column; gap: 4px; }
        .gxe-ctx__section { border: 1px solid var(--nexus-border, #27272a); border-radius: 6px; overflow: hidden; }
        .gxe-ctx__header { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 10px; background: var(--nexus-bg-tertiary, #18181b); border: none; color: var(--nexus-text-secondary, #a1a1aa); font-size: 12px; font-weight: 500; cursor: pointer; text-align: left; }
        .gxe-ctx__header:hover { background: var(--nexus-bg-hover, #27272a); }
        .gxe-ctx__copy { margin-left: auto; padding: 2px 4px; background: none; border: 1px solid var(--nexus-border, #27272a); border-radius: 4px; color: var(--nexus-text-muted, #71717a); cursor: pointer; display: flex; align-items: center; }
        .gxe-ctx__copy:hover { color: var(--nexus-text-secondary, #a1a1aa); border-color: var(--nexus-text-muted, #71717a); }
        .gxe-ctx__json { margin: 0; padding: 10px 12px; background: var(--nexus-bg-primary, #0a0a0f); color: var(--nexus-text-primary, #e4e4e7); font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; }
      `}</style>
    </div>
  );
};

export default ContextTab;
