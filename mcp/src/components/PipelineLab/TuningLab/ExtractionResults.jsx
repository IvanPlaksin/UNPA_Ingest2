/**
 * @fileoverview Extraction Results Display
 * @module components/PipelineLab/TuningLab/ExtractionResults
 */

import React, { useState } from 'react';
import { Box, Network, ChevronDown, ChevronUp, Tag, ArrowRight } from 'lucide-react';

const ENTITY_TYPE_COLORS = {
  SYSTEM: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  DATABASE: 'bg-green-500/20 text-green-400 border-green-500/50',
  TECHNOLOGY: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  ORGANIZATION: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
  MODULE: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
  API: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  PROCESS: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
  CONCEPT: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50',
  DOCUMENT: 'bg-red-500/20 text-red-400 border-red-500/50',
  WORK_ITEM_REF: 'bg-teal-500/20 text-teal-400 border-teal-500/50',
  DEFAULT: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
};

function EntityBadge({ entity }) {
  const colorClass = ENTITY_TYPE_COLORS[entity.type] || ENTITY_TYPE_COLORS.DEFAULT;
  const confidence = entity.confidence !== undefined ? (entity.confidence * 100).toFixed(0) : null;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${colorClass} text-sm`}>
      <Tag className="w-3 h-3" />
      <span className="font-medium">{entity.name}</span>
      <span className="text-xs opacity-70">{entity.type}</span>
      {confidence && (
        <span className="text-xs opacity-50">{confidence}%</span>
      )}
    </span>
  );
}

function RelationshipRow({ relationship }) {
  const confidence = relationship.confidence !== undefined
    ? (relationship.confidence * 100).toFixed(0) : null;

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="text-cyan-400 font-medium">{relationship.source}</span>
      <ArrowRight className="w-4 h-4 text-gray-500" />
      <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">
        {relationship.type}
      </span>
      <ArrowRight className="w-4 h-4 text-gray-500" />
      <span className="text-purple-400 font-medium">{relationship.target}</span>
      {confidence && (
        <span className="text-xs text-gray-500 ml-auto">{confidence}%</span>
      )}
    </div>
  );
}

export default function ExtractionResults({ results, loading }) {
  const [expandedSection, setExpandedSection] = useState('entities');

  if (!results && !loading) {
    return null;
  }

  const entities = results?.entities || [];
  const relationships = results?.relationships || [];

  // Group entities by type
  const entitiesByType = entities.reduce((acc, entity) => {
    const type = entity.type || 'UNKNOWN';
    if (!acc[type]) acc[type] = [];
    acc[type].push(entity);
    return acc;
  }, {});

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Box className="w-5 h-5 text-emerald-400" />
        <h3 className="text-lg font-medium text-white">Extraction Results</h3>
        {loading && (
          <span className="ml-2 w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
        )}
      </div>

      {loading && !results ? (
        <div className="text-center py-8 text-gray-500">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
          <p>Extracting entities and relationships...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Entities Section */}
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedSection(expandedSection === 'entities' ? null : 'entities')}
              className="w-full flex items-center justify-between p-3 bg-gray-700/50 hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-white">Entities</span>
                <span className="text-sm text-gray-400">({entities.length})</span>
              </div>
              {expandedSection === 'entities' ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSection === 'entities' && (
              <div className="p-3 space-y-3">
                {entities.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-2">No entities extracted</p>
                ) : (
                  Object.entries(entitiesByType).map(([type, typeEntities]) => (
                    <div key={type}>
                      <p className="text-xs text-gray-500 mb-1">{type} ({typeEntities.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {typeEntities.map((entity, idx) => (
                          <EntityBadge key={`${entity.name}-${idx}`} entity={entity} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Relationships Section */}
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedSection(expandedSection === 'relationships' ? null : 'relationships')}
              className="w-full flex items-center justify-between p-3 bg-gray-700/50 hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-white">Relationships</span>
                <span className="text-sm text-gray-400">({relationships.length})</span>
              </div>
              {expandedSection === 'relationships' ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSection === 'relationships' && (
              <div className="p-3">
                {relationships.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-2">No relationships extracted</p>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {relationships.map((rel, idx) => (
                      <RelationshipRow key={idx} relationship={rel} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="text-sm text-gray-400 text-center pt-2 border-t border-gray-700">
            Extracted {entities.length} entities and {relationships.length} relationships
          </div>
        </div>
      )}
    </div>
  );
}
