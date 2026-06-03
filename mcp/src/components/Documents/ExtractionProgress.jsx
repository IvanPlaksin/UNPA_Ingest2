import React from 'react';
import SharedExtractionProgress from '../shared/ExtractionProgress';

export default function ExtractionProgress({ documentId, onComplete, onClose }) {
  return (
    <SharedExtractionProgress
      mode="poll"
      source={{ type: 'document', id: documentId }}
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}
