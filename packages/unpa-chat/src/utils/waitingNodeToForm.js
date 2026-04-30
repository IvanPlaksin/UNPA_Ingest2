/**
 * Convert a waiting graph node config to FormRenderer-compatible FormDefinition.
 */

export function isStructuralNode(waitingNode) {
  const data = waitingNode?.data || waitingNode;
  return Boolean(data?.structuralGraphId);
}

export function waitingNodeToFormDefinition(waitingNode, sessionState = {}) {
  if (!waitingNode) return null;

  const { nodeId, label, prompt, inputType, choices } = waitingNode;
  const fields = [];

  if (choices && choices.length > 0) {
    const options = choices.map(c => {
      if (typeof c === 'string') return { value: c.toLowerCase(), label: c };
      return { value: c.value || c.label?.toLowerCase(), label: c.label || c.value };
    });
    fields.push({
      id: `${nodeId}_choice`, name: 'userInput', type: 'select',
      label: prompt || label || 'Select an option', required: true,
      options, placeholder: 'Choose...', order: 0,
    });
  } else if (inputType === 'text' || inputType === 'search' || !inputType) {
    fields.push({
      id: `${nodeId}_text`, name: 'userInput',
      type: inputType === 'search' ? 'text' : 'textarea',
      label: prompt || label || 'Your response', required: true,
      placeholder: prompt || 'Type here...', rows: 2, order: 0,
    });
  } else {
    fields.push({
      id: `${nodeId}_form`, name: 'userInput', type: 'textarea',
      label: prompt || 'Provide details', required: true,
      placeholder: 'Enter details...', rows: 3, order: 0,
    });
  }

  const contextFields = [];
  if (sessionState.service_code) {
    contextFields.push({ id: `${nodeId}_ctx_service`, name: '_ctx_service', type: 'text', label: 'Service', defaultValue: sessionState.service_code, readOnly: true, order: 100 });
  }
  if (sessionState.location?.name || sessionState.dutyStation) {
    contextFields.push({ id: `${nodeId}_ctx_location`, name: '_ctx_location', type: 'text', label: 'Location', defaultValue: sessionState.location?.name || sessionState.dutyStation || '', readOnly: true, order: 101 });
  }

  return {
    id: `form_${nodeId}`,
    name: label || 'Input Required',
    description: prompt || null,
    status: 'ACTIVE',
    sections: [
      { id: `section_${nodeId}_main`, title: null, order: 0, fields },
      ...(contextFields.length > 0 ? [{ id: `section_${nodeId}_context`, title: 'Request Context', order: 1, collapsible: true, fields: contextFields }] : []),
    ],
  };
}

export function extractFormResponse(formData) {
  if (!formData) return null;
  if (formData.userInput) return formData.userInput;
  const keys = Object.keys(formData).filter(k => !k.startsWith('_ctx_'));
  return keys.length > 0 ? formData[keys[0]] : null;
}
