import { useState, useCallback, useMemo } from 'react';
import { evaluatePredicate } from '../utils/predicateEvaluator';

export function useFormValidation(definition, formData, contextData) {
  const [errors, setErrors] = useState({});
  const [validating, setValidating] = useState(false);

  const fieldsWithValidations = useMemo(() => {
    const result = {};
    if (definition?.sections) {
      for (const section of definition.sections) {
        for (const field of section.fields || []) {
          result[field.name] = {
            required: field.required,
            validations: field.validations || []
          };
        }
      }
    }
    return result;
  }, [definition]);

  const validateField = useCallback((fieldName, value) => {
    const fieldDef = fieldsWithValidations[fieldName];
    if (!fieldDef) return null;

    const context = { ...formData, [fieldName]: value, $context: contextData };

    if (fieldDef.required && (value === undefined || value === null || value === '')) {
      const error = 'This field is required';
      setErrors(prev => ({ ...prev, [fieldName]: error }));
      return error;
    }

    for (const rule of fieldDef.validations) {
      try {
        const isValid = evaluatePredicate(rule.expression, context);
        if (!isValid) {
          setErrors(prev => ({ ...prev, [fieldName]: rule.message }));
          return rule.message;
        }
      } catch (e) {
        console.warn(`Validation failed for ${fieldName}:`, e);
      }
    }

    setErrors(prev => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    return null;
  }, [fieldsWithValidations, formData, contextData]);

  const validateForm = useCallback(async () => {
    setValidating(true);
    const newErrors = {};

    for (const [fieldName, fieldDef] of Object.entries(fieldsWithValidations)) {
      const value = formData[fieldName];
      if (fieldDef.required && (value === undefined || value === null || value === '')) {
        newErrors[fieldName] = 'This field is required';
        continue;
      }
      for (const rule of fieldDef.validations) {
        try {
          const context = { ...formData, $context: contextData };
          const isValid = evaluatePredicate(rule.expression, context);
          if (!isValid) {
            newErrors[fieldName] = rule.message;
            break;
          }
        } catch (e) {
          console.warn(`Validation failed for ${fieldName}:`, e);
        }
      }
    }

    setErrors(newErrors);
    setValidating(false);
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  }, [fieldsWithValidations, formData, contextData]);

  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  return { errors, validateField, validateForm, isValid, validating };
}
