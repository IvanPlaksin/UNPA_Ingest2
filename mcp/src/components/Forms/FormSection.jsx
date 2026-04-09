import React, { useState } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import FormField from './FormField';

const WIDTH_MAP = {
  full: '100%',
  half: 'calc(50% - 8px)',
  third: 'calc(33.333% - 8px)',
  quarter: 'calc(25% - 8px)',
};

export default function FormSection({
  section, formData, errors, visibleFields, contextData,
  onChange, disabled, readOnly, layout, columns, apiBaseUrl,
  dataSources
}) {
  const [expanded, setExpanded] = useState(
    !section.collapsible || section.defaultExpanded !== false
  );

  // Filter visible + sort by order
  const sectionFields = (section.fields || [])
    .filter(field => visibleFields.has(field.name) || visibleFields.size === 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (sectionFields.length === 0) return null;

  // Check if any field has explicit width — if so, use flex-wrap layout
  const hasFieldWidths = sectionFields.some(f => f.width && f.width !== 'full');

  const containerStyles = hasFieldWidths
    ? { display: 'flex', flexWrap: 'wrap', gap: '16px' }
    : layout === 'grid'
      ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 2 }
      : { display: 'flex', flexDirection: layout === 'horizontal' ? 'row' : 'column', gap: 2, flexWrap: 'wrap' };

  return (
    <Box sx={{ p: 2 }}>
      {section.title && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            mb: section.collapsible ? 0 : 2,
            cursor: section.collapsible ? 'pointer' : 'default'
          }}
          onClick={() => section.collapsible && setExpanded(!expanded)}
        >
          <Typography variant="subtitle1" fontWeight="medium">
            {section.title}
          </Typography>
          {section.collapsible && (
            <IconButton size="small">
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          )}
        </Box>
      )}
      <Collapse in={expanded}>
        <Box sx={containerStyles}>
          {sectionFields.map(field => {
            const fieldWidth = hasFieldWidths
              ? (WIDTH_MAP[field.width] || '100%')
              : undefined;

            return (
              <Box
                key={field.id || field.name}
                sx={fieldWidth ? { width: fieldWidth, minWidth: 140, flexShrink: 0 } : undefined}
              >
                <FormField
                  field={field}
                  value={formData[field.name]}
                  error={errors[field.name]}
                  onChange={(value) => onChange(field.name, value)}
                  disabled={disabled}
                  readOnly={readOnly}
                  contextData={contextData}
                  apiBaseUrl={apiBaseUrl}
                  formValues={formData}
                  dataSources={dataSources}
                />
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
