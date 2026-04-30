import React, { useMemo, useCallback } from 'react';
import ChoiceButtons from './ChoiceButtons';
import { isStructuralNode, waitingNodeToFormDefinition, extractFormResponse } from '../utils/waitingNodeToForm';

/**
 * Renders the appropriate input widget for a waiting graph node.
 *
 * FormRenderer is injected via prop to keep the package decoupled from
 * the host project's form library. Pass the FormRenderer component from
 * your project (e.g. import FormRenderer from '@your-project/Forms/FormRenderer').
 *
 * If FormRenderer is not provided, falls back to a plain textarea/select.
 */
export default function FormWidget({
  waitingNode,
  choices,
  sessionState,
  isLoading,
  onSubmit,
  onChoiceClick,
  FormRenderer,
}) {
  const structural = isStructuralNode(waitingNode);

  const formDef = useMemo(
    () => structural ? null : waitingNodeToFormDefinition(waitingNode, sessionState),
    [waitingNode, sessionState, structural]
  );

  const structuralNodeData = useMemo(
    () => structural ? (waitingNode?.data || waitingNode) : null,
    [waitingNode, structural]
  );

  const handleFormSubmit = useCallback((formData) => {
    if (structural) {
      onSubmit(formData);
    } else {
      const value = extractFormResponse(formData);
      if (value) onSubmit(value);
    }
  }, [structural, onSubmit]);

  // Simple choices: render as button group
  if (choices && choices.length > 0 && choices.length <= 6 && !choices.some(c => c.disabled)) {
    return (
      <ChoiceButtons
        choices={choices}
        onChoiceClick={onChoiceClick}
        isLoading={isLoading}
        label={waitingNode.label}
        prompt={waitingNode.prompt}
      />
    );
  }

  // Use injected FormRenderer if available
  if (FormRenderer && (formDef || structural)) {
    const formStyle = {
      marginTop: 8,
      padding: '10px 14px',
      background: 'rgba(99,102,241,0.06)',
      borderRadius: 10,
      border: '1px solid rgba(99,102,241,0.15)',
    };
    const formSx = {
      '& .MuiTypography-h6': { fontSize: 13, fontWeight: 600, color: '#6366f1' },
      '& .MuiTypography-body2': { fontSize: 11 },
      '& .MuiButton-contained': { fontSize: 11, py: 0.5, px: 2 },
    };
    return (
      <div style={formStyle}>
        <FormRenderer
          formDefinition={structural ? undefined : formDef}
          structuralNodeData={structuralNodeData}
          mode="EMBEDDED"
          onSubmit={handleFormSubmit}
          submitLabel="Send"
          showCancel={false}
          disabled={isLoading}
          layout="vertical"
          spacing={1}
          sx={formSx}
        />
      </div>
    );
  }

  // Fallback: plain textarea/select when no FormRenderer provided
  if (!formDef && !structural) return null;

  const field = formDef?.sections?.[0]?.fields?.[0];
  if (!field) return null;

  const inputStyle = {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  if (field.options) {
    return (
      <div style={inputStyle}>
        <label style={{ fontSize: 11, color: '#8b949e' }}>{field.label}</label>
        <select
          disabled={isLoading}
          onChange={e => onSubmit(e.target.value)}
          defaultValue=""
          style={{ padding: '6px 8px', borderRadius: 6, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d', fontSize: 12 }}
        >
          <option value="" disabled>{field.placeholder || 'Choose...'}</option>
          {field.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div style={inputStyle}>
      <label style={{ fontSize: 11, color: '#8b949e' }}>{field.label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <textarea
          rows={field.rows || 2}
          placeholder={field.placeholder || 'Type here...'}
          disabled={isLoading}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const val = e.target.value.trim();
              if (val) { onSubmit(val); e.target.value = ''; }
            }
          }}
        />
        <button
          disabled={isLoading}
          onClick={e => {
            const textarea = e.currentTarget.previousSibling;
            const val = textarea.value.trim();
            if (val) { onSubmit(val); textarea.value = ''; }
          }}
          style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
