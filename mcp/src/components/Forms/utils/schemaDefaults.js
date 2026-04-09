/**
 * Extract default values from form definition sections.
 */
export function extractDefaults(definition) {
  const result = {};
  if (!definition?.sections) return result;
  for (const section of definition.sections) {
    for (const field of section.fields || []) {
      if (field.defaultValue !== undefined) {
        result[field.name] = field.defaultValue;
      }
    }
  }
  return result;
}
