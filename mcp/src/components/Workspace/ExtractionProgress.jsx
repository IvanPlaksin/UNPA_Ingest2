import React from 'react';
import SharedExtractionProgress from '../shared/ExtractionProgress';

export default function ExtractionProgress({ workspaceId, jobId, onComplete, onCancel }) {
  return (
    <SharedExtractionProgress
      mode="sse"
      source={{ type: 'workspace', id: workspaceId, jobId }}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
