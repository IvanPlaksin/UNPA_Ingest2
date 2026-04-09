import { useState, useCallback, useMemo, useRef } from 'react';
import { evaluatePredicate } from '../utils/predicateEvaluator';

export function useDisplayConditions(definition, formData, contextData) {
  const [visibleFields, setVisibleFields] = useState(new Set());
  const prevVisibleRef = useRef('');

  const fieldsWithConditions = useMemo(() => {
    const result = [];
    if (definition?.sections) {
      for (const section of definition.sections) {
        for (const field of section.fields || []) {
          if (field.conditions?.length > 0) {
            result.push({ name: field.name, conditions: field.conditions });
          }
        }
      }
    }
    return result;
  }, [definition]);

  const evaluateConditions = useCallback(() => {
    const context = { ...formData, $context: contextData };
    const visible = new Set();

    // Start with all fields visible
    if (definition?.sections) {
      for (const section of definition.sections) {
        for (const field of section.fields || []) {
          visible.add(field.name);
        }
      }
    }

    // Apply conditions
    for (const { name, conditions } of fieldsWithConditions) {
      for (const condition of conditions) {
        try {
          const result = evaluatePredicate(condition.expression, context);
          if (condition.effect === 'SHOW' && !result) {
            visible.delete(name);
          } else if (condition.effect === 'HIDE' && result) {
            visible.delete(name);
          }
        } catch (e) {
          console.warn(`Condition evaluation failed for ${name}:`, e);
        }
      }
    }

    // Only update state if visibility actually changed (prevents infinite re-render)
    const key = [...visible].sort().join(',');
    if (key !== prevVisibleRef.current) {
      prevVisibleRef.current = key;
      setVisibleFields(visible);
    }
  }, [definition, formData, contextData, fieldsWithConditions]);

  return { visibleFields, evaluateConditions };
}
