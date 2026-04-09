import React from 'react';
import { Chip } from '@mui/material';

const STATUS_CONFIG = {
  CREATED:    { label: 'Created',    color: 'default' },
  PROFILING:  { label: 'Profiling',  color: 'info' },
  READY:      { label: 'Ready',      color: 'primary' },
  EXTRACTING: { label: 'Extracting', color: 'warning' },
  PAUSED:     { label: 'Paused',     color: 'default' },
  REVIEW:     { label: 'Review',     color: 'secondary' },
  PROMOTED:   { label: 'Promoted',   color: 'success' },
  ARCHIVED:   { label: 'Archived',   color: 'default' },
  // Draft statuses
  DRAFT:            { label: 'Draft',      color: 'default' },
  VALIDATED:        { label: 'Validated',  color: 'info' },
  READY_TO_PROMOTE: { label: 'Ready',     color: 'primary' },
  REJECTED:         { label: 'Rejected',  color: 'error' },
  CONFLICT:         { label: 'Conflict',  color: 'warning' },
  MERGED:           { label: 'Merged',    color: 'success' },
  // Source statuses
  PENDING:    { label: 'Pending',    color: 'default' },
  PROFILED:   { label: 'Profiled',   color: 'info' },
  PROCESSING: { label: 'Processing', color: 'warning' },
  DONE:       { label: 'Done',       color: 'success' },
  ERROR:      { label: 'Error',      color: 'error' },
};

const StatusChip = ({ status, size = 'small', ...props }) => {
  const config = STATUS_CONFIG[status] || { label: status, color: 'default' };
  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant="outlined"
      {...props}
    />
  );
};

export default StatusChip;
