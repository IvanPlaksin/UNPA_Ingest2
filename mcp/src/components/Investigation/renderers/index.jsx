import React from 'react';
import LocateRenderer from './LocateRenderer';
import ConnectRenderer from './ConnectRenderer';
import ExpandRenderer from './ExpandRenderer';
import SynthesizeRenderer from './SynthesizeRenderer';
import MatrixRenderer from './MatrixRenderer';
import StructureRenderer from './StructureRenderer';
import TimelineRenderer from './TimelineRenderer';
import ResolveRenderer from './ResolveRenderer';
import TextRenderer from './TextRenderer';
import ProfileRenderer from './ProfileRenderer';
import ImpactRenderer from './ImpactRenderer';

export const ARTIFACT_RENDERERS = {
  LOCATE:    LocateRenderer,
  CONNECT:   ConnectRenderer,
  EXPAND:    ExpandRenderer,
  PROFILE:   ProfileRenderer,
  IMPACT:    ImpactRenderer,
  SYNTHESIZE: SynthesizeRenderer,
  MATRIX:    MatrixRenderer,
  STRUCTURE: StructureRenderer,
  TIMELINE:  TimelineRenderer,
  RESOLVE:   ResolveRenderer,
  TEXT:      TextRenderer,
};

/**
 * Unified renderer for any artifact type.
 *
 * @param {object} artifact — { primitiveType, content }
 * @param {boolean} compact — condensed layout (used in ToolDialog preview)
 */
export function ArtifactRenderer({ artifact, compact = false }) {
  if (!artifact) return null;
  const Renderer = ARTIFACT_RENDERERS[artifact.primitiveType];
  if (!Renderer) {
    return (
      <pre style={{ fontSize: 11, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
        {JSON.stringify(artifact.content, null, 2)}
      </pre>
    );
  }
  return <Renderer content={artifact.content} compact={compact} />;
}
