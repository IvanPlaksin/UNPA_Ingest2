import React, { useMemo, useCallback } from 'react';
import FormRenderer from '../../Forms/FormRenderer';
import ChoiceButtons from './ChoiceButtons';
import { isStructuralNode, waitingNodeToFormDefinition, extractFormResponse } from '../utils/waitingNodeToForm';

/**
 * Renders the appropriate input widget for a waiting graph node.
 * - ≤6 simple choices → ChoiceButtons
 * - STRUCTURAL nodes → FormRenderer with structuralNodeData
 * - Text/form nodes → FormRenderer with static formDefinition
 */
export default function FormWidget({ waitingNode, choices, sessionState, isLoading, onSubmit, onChoiceClick }) {
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
      // STRUCTURAL: submit full multi-field object
      onSubmit(formData);
    } else {
      // Simple forms: extract single userInput string
      const value = extractFormResponse(formData);
      if (value) onSubmit(value);
    }
  }, [structural, onSubmit]);

  if (!formDef && !structural) return null;

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
