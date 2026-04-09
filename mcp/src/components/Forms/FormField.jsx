import React from 'react';
import TextField from './fields/TextField';
import NumberField from './fields/NumberField';
import SelectField from './fields/SelectField';
import MultiSelectField from './fields/MultiSelectField';
import DateField from './fields/DateField';
import BooleanField from './fields/BooleanField';
import TextareaField from './fields/TextareaField';
import FileField from './fields/FileField';
import AutocompleteField from './fields/AutocompleteField';
import DataSourceSelect from './fields/DataSourceSelect';

const FIELD_COMPONENTS = {
  text: TextField,
  email: TextField,
  url: TextField,
  password: TextField,
  number: NumberField,
  select: SelectField,
  multiselect: MultiSelectField,
  date: DateField,
  datetime: DateField,
  boolean: BooleanField,
  checkbox: BooleanField,
  textarea: TextareaField,
  file: FileField,
  autocomplete: AutocompleteField,
  hidden: () => null
};

function getTypeSpecificProps(field, apiBaseUrl) {
  switch (field.type) {
    case 'email': return { type: 'email' };
    case 'url': return { type: 'url' };
    case 'password': return { type: 'password' };
    case 'number': return { min: field.min, max: field.max, step: field.step };
    case 'select':
    case 'multiselect':
    case 'autocomplete':
      return { dataSourceId: field.dataSourceId, options: field.options, apiBaseUrl };
    case 'date': return { type: 'date' };
    case 'datetime': return { type: 'datetime-local' };
    case 'textarea': return { rows: field.rows || 4, maxLength: field.maxLength };
    case 'file': return { accept: field.accept, multiple: field.multiple };
    default: return {};
  }
}

export default function FormField({
  field, value, error, onChange,
  disabled, readOnly, contextData, apiBaseUrl,
  formValues, dataSources
}) {
  // DataSource-backed field takes priority
  const dataSourceSpec = dataSources?.[field.name];
  const hasDS = !!dataSourceSpec && dataSourceSpec.type !== 'error';

  if (hasDS) {
    return (
      <DataSourceSelect
        name={field.name}
        label={field.label || field.name}
        value={value ?? field.defaultValue ?? ''}
        onChange={onChange}
        error={!!error}
        helperText={error || field.placeholder}
        required={field.required}
        disabled={disabled || field.disabled}
        dataSourceSpec={dataSourceSpec}
        formValues={formValues}
        uiHints={field.uiHints || {}}
        fullWidth
      />
    );
  }

  const FieldComponent = FIELD_COMPONENTS[field.type] || TextField;

  const commonProps = {
    name: field.name,
    label: field.label || field.name,
    value: value ?? field.defaultValue ?? '',
    onChange,
    error: !!error,
    helperText: error || field.placeholder,
    required: field.required,
    disabled: disabled || field.disabled,
    readOnly,
    placeholder: field.placeholder,
    fullWidth: true
  };

  const typeProps = getTypeSpecificProps(field, apiBaseUrl);

  return <FieldComponent {...commonProps} {...typeProps} />;
}
