import React, { useEffect, useCallback, useState } from 'react';
import { Box, Button, Alert, CircularProgress, Typography } from '@mui/material';
import FormSection from './FormSection';
import { useFormState } from './hooks/useFormState';
import { useFormValidation } from './hooks/useFormValidation';
import { useDisplayConditions } from './hooks/useDisplayConditions';
import { useStructuralForm } from './hooks/useStructuralForm';

const MODES = { EMBEDDED: 'EMBEDDED', STANDALONE: 'STANDALONE' };

/**
 * Dynamic form renderer for FormDefinition graphs.
 *
 * EMBEDDED mode — parent handles submission via onSubmit callback.
 * STANDALONE mode — auto-submits to resume API via resumeToken.
 */
export default function FormRenderer({
  formId,
  formDefinition,
  structuralNodeData,   // NEW: { structuralGraphId, constraintGraphId } for STRUCTURAL forms
  schema,
  mode = MODES.EMBEDDED,
  resumeToken,
  initialData = {},
  contextData = {},
  onSubmit,
  onComplete,
  onChange,
  onValidationError,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  onCancel,
  showCancel = false,
  disabled = false,
  readOnly = false,
  layout = 'vertical',
  columns = 1,
  spacing = 2,
  apiBaseUrl = '/api/v1',
  locale = 'en',
  sx = {},
  className = ''
}) {
  // STRUCTURAL form loading (if structuralNodeData provided)
  const {
    isStructuralBased,
    loading: structuralLoading,
    error: structuralError,
    formDefinition: structuralDefinition,
  } = useStructuralForm(structuralNodeData, { locale });

  // Resolve which definition to use: structural takes priority
  const resolvedDefinition = isStructuralBased ? structuralDefinition : formDefinition;

  // Legacy form loading (formId or pre-resolved definition)
  const { definition, loadingDefinition, definitionError } = useFormDefinition(
    formId, resolvedDefinition, apiBaseUrl
  );

  const isLoading = loadingDefinition || (isStructuralBased && structuralLoading);
  const loadError = definitionError || structuralError;

  const { formData, setFieldValue, resetForm, isDirty } = useFormState(initialData, definition);

  const { errors, validateField, validateForm, isValid, validating } =
    useFormValidation(definition, formData, contextData);

  const { visibleFields, evaluateConditions } =
    useDisplayConditions(definition, formData, contextData);

  useEffect(() => { evaluateConditions(); }, [formData, evaluateConditions]);

  const handleFieldChange = useCallback((fieldName, value) => {
    setFieldValue(fieldName, value);
    validateField(fieldName, value);
    onChange?.(formData, fieldName);
  }, [setFieldValue, validateField, onChange, formData]);

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault();

    const validation = await validateForm();
    if (!validation.isValid) {
      onValidationError?.(validation.errors);
      return;
    }

    if (mode === MODES.EMBEDDED) {
      await onSubmit?.(formData);
    } else if (mode === MODES.STANDALONE) {
      if (!resumeToken) {
        console.error('FormRenderer: resumeToken required for STANDALONE mode');
        return;
      }
      try {
        const response = await fetch(`${apiBaseUrl}/runtime/signal/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: resumeToken,
            payload: formData,
            actorId: contextData.userId || 'anonymous'
          })
        });
        const result = await response.json();
        onComplete?.(result);
      } catch (error) {
        console.error('FormRenderer: Resume failed', error);
        onValidationError?.({ _form: error.message });
      }
    }
  }, [formData, mode, resumeToken, validateForm, onSubmit, onComplete, onValidationError, apiBaseUrl, contextData]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError) {
    return <Alert severity="error">Failed to load form: {loadError.message}</Alert>;
  }

  if (!definition) {
    return <Alert severity="warning">Form definition not found</Alert>;
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: 'flex', flexDirection: 'column', gap: spacing, ...sx }}
      className={className}
    >
      {definition.name && (
        <Typography variant="h6" component="h2">{definition.name}</Typography>
      )}
      {definition.description && (
        <Typography variant="body2" color="text.secondary">{definition.description}</Typography>
      )}
      {contextData.contextMessage && (
        <Alert severity="info" sx={{ mb: 2 }}>{contextData.contextMessage}</Alert>
      )}

      {definition.sections?.map((section) => (
        <FormSection
          key={section.id}
          section={section}
          formData={formData}
          errors={errors}
          visibleFields={visibleFields}
          contextData={contextData}
          onChange={handleFieldChange}
          disabled={disabled}
          readOnly={readOnly}
          layout={layout}
          columns={columns}
          apiBaseUrl={apiBaseUrl}
          dataSources={isStructuralBased ? structuralDefinition?.dataSources : undefined}
        />
      ))}

      {errors._form && <Alert severity="error">{errors._form}</Alert>}

      {!readOnly && (
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
          {showCancel && (
            <Button variant="outlined" onClick={onCancel} disabled={disabled}>
              {cancelLabel}
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={disabled || validating || !isValid}
          >
            {validating ? <CircularProgress size={20} /> : submitLabel}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function useFormDefinition(formId, formDefinition, apiBaseUrl) {
  const [definition, setDefinition] = useState(formDefinition || null);
  const [loading, setLoading] = useState(!formDefinition && !!formId);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (formDefinition) {
      setDefinition(formDefinition);
      setLoading(false);
      return;
    }
    if (!formId) { setLoading(false); return; }

    let cancelled = false;
    const loadDefinition = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiBaseUrl}/forms/${formId}/render`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) setDefinition(data.form);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadDefinition();
    return () => { cancelled = true; };
  }, [formId, formDefinition, apiBaseUrl]);

  return { definition, loadingDefinition: loading, definitionError: error };
}

FormRenderer.MODES = MODES;
