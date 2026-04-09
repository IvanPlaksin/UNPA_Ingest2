import React from 'react';
import { useSearchParams } from 'react-router-dom';
import StructuralFormEditor from '../components/StructuralEditor/StructuralFormEditor';

export default function StructuralEditorPage() {
  const [searchParams] = useSearchParams();
  const graphId = searchParams.get('graphId');

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <StructuralFormEditor initialGraphId={graphId} />
    </div>
  );
}
