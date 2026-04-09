import { useState, useCallback, useMemo } from 'react';
import { extractDefaults } from '../utils/schemaDefaults';

export function useFormState(initialData, definition) {
  const defaults = useMemo(() => extractDefaults(definition), [definition]);

  const [formData, setFormData] = useState({ ...defaults, ...initialData });
  const [originalData] = useState({ ...defaults, ...initialData });

  const setFieldValue = useCallback((name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData({ ...defaults, ...initialData });
  }, [defaults, initialData]);

  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(originalData);
  }, [formData, originalData]);

  return { formData, setFieldValue, setFormData, resetForm, isDirty };
}
