/**
 * Three-Layer Ontology Schema
 *
 * Defines the knowledge graph ontology with three semantic layers:
 * - Strategic Layer (z=-200): Business strategy, goals, KPIs
 * - Business Layer (z=0): Work items, documents, people, teams
 * - Code Layer (z=200): Files, classes, functions, commits
 *
 * @module services/graph/ontology.schema
 */

const {
  ENTITY_CATEGORIES,
  RELATIONSHIP_TYPES
} = require('../../config/un-entities.config');

/**
 * Node type definitions with full metadata
 */
const NODE_TYPES = {
  // ===== Strategic Layer (z=-200) =====
  Epic: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#9C27B0',
    shape: 'icosahedron',
    icon: 'flag',
    description: 'Large body of work broken down into features',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      status: { type: 'string', indexed: true },
      priority: { type: 'integer' },
      businessValue: { type: 'integer' },
      startDate: { type: 'datetime' },
      targetDate: { type: 'datetime' },
      createdAt: { type: 'datetime' },
      updatedAt: { type: 'datetime' }
    }
  },

  Feature: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#AB47BC',
    shape: 'icosahedron',
    icon: 'star',
    description: 'Product feature or capability',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      status: { type: 'string', indexed: true },
      priority: { type: 'integer' },
      effort: { type: 'integer' },
      createdAt: { type: 'datetime' },
      updatedAt: { type: 'datetime' }
    }
  },

  BusinessRule: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#7B1FA2',
    shape: 'octahedron',
    icon: 'gavel',
    description: 'Business logic rule or constraint',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      rule: { type: 'string', required: true },
      category: { type: 'string', indexed: true },
      source: { type: 'string' },
      confidence: { type: 'float' },
      createdAt: { type: 'datetime' }
    }
  },

  Concept: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#8E24AA',
    shape: 'dodecahedron',
    icon: 'lightbulb',
    description: 'Domain concept or terminology',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      definition: { type: 'string' },
      domain: { type: 'string', indexed: true },
      synonyms: { type: 'array' },
      createdAt: { type: 'datetime' }
    }
  },

  Strategy: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#6A1B9A',
    shape: 'icosahedron',
    icon: 'trending_up',
    description: 'Strategic initiative or direction',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      objectives: { type: 'array' },
      startDate: { type: 'datetime' },
      endDate: { type: 'datetime' },
      createdAt: { type: 'datetime' }
    }
  },

  Goal: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#4A148C',
    shape: 'tetrahedron',
    icon: 'target',
    description: 'Strategic goal or objective',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      targetValue: { type: 'string' },
      currentValue: { type: 'string' },
      deadline: { type: 'datetime' },
      createdAt: { type: 'datetime' }
    }
  },

  KPI: {
    layer: 'Strategic',
    zPosition: -200,
    color: '#7C4DFF',
    shape: 'octahedron',
    icon: 'analytics',
    description: 'Key Performance Indicator',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      metric: { type: 'string' },
      target: { type: 'float' },
      current: { type: 'float' },
      unit: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  // ===== Business Layer (z=0) =====
  WorkItem: {
    layer: 'Business',
    zPosition: 0,
    color: '#00BCD4',
    shape: 'sphere',
    icon: 'assignment',
    description: 'Azure DevOps Work Item',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      adoId: { type: 'integer', indexed: true },
      title: { type: 'string', required: true, indexed: true },
      type: { type: 'string', indexed: true },
      state: { type: 'string', indexed: true },
      areaPath: { type: 'string', indexed: true },
      iterationPath: { type: 'string' },
      assignedTo: { type: 'string', indexed: true },
      createdBy: { type: 'string' },
      description: { type: 'string' },
      acceptanceCriteria: { type: 'string' },
      priority: { type: 'integer' },
      effort: { type: 'integer' },
      createdAt: { type: 'datetime' },
      updatedAt: { type: 'datetime' },
      resolvedAt: { type: 'datetime' },
      closedAt: { type: 'datetime' }
    }
  },

  Task: {
    layer: 'Business',
    zPosition: 0,
    color: '#26C6DA',
    shape: 'sphere',
    icon: 'check_box',
    description: 'Task work item',
    inherits: 'WorkItem'
  },

  Bug: {
    layer: 'Business',
    zPosition: 0,
    color: '#EF5350',
    shape: 'sphere',
    icon: 'bug_report',
    description: 'Bug work item',
    inherits: 'WorkItem',
    properties: {
      reproSteps: { type: 'string' },
      severity: { type: 'string', indexed: true },
      foundIn: { type: 'string' },
      integratedIn: { type: 'string' }
    }
  },

  UserStory: {
    layer: 'Business',
    zPosition: 0,
    color: '#42A5F5',
    shape: 'sphere',
    icon: 'person',
    description: 'User Story work item',
    inherits: 'WorkItem'
  },

  Document: {
    layer: 'Business',
    zPosition: 0,
    color: '#0097A7',
    shape: 'box',
    icon: 'description',
    description: 'Document or artifact',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      title: { type: 'string', required: true, indexed: true },
      type: { type: 'string', indexed: true },
      path: { type: 'string' },
      mimeType: { type: 'string' },
      size: { type: 'integer' },
      hash: { type: 'string', indexed: true },
      language: { type: 'string' },
      createdAt: { type: 'datetime' },
      updatedAt: { type: 'datetime' }
    }
  },

  Person: {
    layer: 'Business',
    zPosition: 0,
    color: '#00ACC1',
    shape: 'sphere',
    icon: 'person',
    description: 'Person or user',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      email: { type: 'string', indexed: true },
      displayName: { type: 'string' },
      role: { type: 'string' },
      department: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  Team: {
    layer: 'Business',
    zPosition: 0,
    color: '#0288D1',
    shape: 'cylinder',
    icon: 'group',
    description: 'Team or organizational unit',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      areaPath: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  Organization: {
    layer: 'Business',
    zPosition: 0,
    color: '#01579B',
    shape: 'cylinder',
    icon: 'business',
    description: 'Organization or department',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      abbreviation: { type: 'string', indexed: true },
      type: { type: 'string' },
      parent: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  Process: {
    layer: 'Business',
    zPosition: 0,
    color: '#039BE5',
    shape: 'torus',
    icon: 'account_tree',
    description: 'Business process or workflow',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      steps: { type: 'array' },
      owner: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  // ===== Code Layer (z=200) =====
  File: {
    layer: 'Code',
    zPosition: 200,
    color: '#E91E63',
    shape: 'cube',
    icon: 'insert_drive_file',
    description: 'Source code file',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      path: { type: 'string', required: true, indexed: true },
      name: { type: 'string', indexed: true },
      extension: { type: 'string', indexed: true },
      language: { type: 'string', indexed: true },
      size: { type: 'integer' },
      lineCount: { type: 'integer' },
      hash: { type: 'string' },
      createdAt: { type: 'datetime' },
      updatedAt: { type: 'datetime' }
    }
  },

  Class: {
    layer: 'Code',
    zPosition: 200,
    color: '#EC407A',
    shape: 'cube',
    icon: 'class',
    description: 'Class definition',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      qualifiedName: { type: 'string', indexed: true },
      visibility: { type: 'string' },
      isAbstract: { type: 'boolean' },
      extends: { type: 'string' },
      implements: { type: 'array' },
      complexity: { type: 'integer' },
      lineStart: { type: 'integer' },
      lineEnd: { type: 'integer' },
      createdAt: { type: 'datetime' }
    }
  },

  Interface: {
    layer: 'Code',
    zPosition: 200,
    color: '#F06292',
    shape: 'cube',
    icon: 'extension',
    description: 'Interface definition',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      qualifiedName: { type: 'string', indexed: true },
      extends: { type: 'array' },
      lineStart: { type: 'integer' },
      lineEnd: { type: 'integer' },
      createdAt: { type: 'datetime' }
    }
  },

  Function: {
    layer: 'Code',
    zPosition: 200,
    color: '#AD1457',
    shape: 'octahedron',
    icon: 'functions',
    description: 'Function or method',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      qualifiedName: { type: 'string', indexed: true },
      signature: { type: 'string' },
      returnType: { type: 'string' },
      parameters: { type: 'array' },
      visibility: { type: 'string' },
      isAsync: { type: 'boolean' },
      isStatic: { type: 'boolean' },
      complexity: { type: 'integer' },
      lineStart: { type: 'integer' },
      lineEnd: { type: 'integer' },
      createdAt: { type: 'datetime' }
    }
  },

  Method: {
    layer: 'Code',
    zPosition: 200,
    color: '#C2185B',
    shape: 'octahedron',
    icon: 'code',
    description: 'Class method',
    inherits: 'Function',
    properties: {
      className: { type: 'string', indexed: true }
    }
  },

  Module: {
    layer: 'Code',
    zPosition: 200,
    color: '#880E4F',
    shape: 'cylinder',
    icon: 'view_module',
    description: 'Module or package',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      path: { type: 'string' },
      exports: { type: 'array' },
      createdAt: { type: 'datetime' }
    }
  },

  Commit: {
    layer: 'Code',
    zPosition: 200,
    color: '#D81B60',
    shape: 'sphere',
    icon: 'commit',
    description: 'Git/TFS commit or changeset',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      hash: { type: 'string', indexed: true },
      message: { type: 'string' },
      author: { type: 'string', indexed: true },
      authorEmail: { type: 'string' },
      date: { type: 'datetime', indexed: true },
      filesChanged: { type: 'integer' },
      insertions: { type: 'integer' },
      deletions: { type: 'integer' },
      createdAt: { type: 'datetime' }
    }
  },

  Changeset: {
    layer: 'Code',
    zPosition: 200,
    color: '#FF4081',
    shape: 'sphere',
    icon: 'history',
    description: 'TFVC changeset',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      changesetId: { type: 'integer', indexed: true },
      comment: { type: 'string' },
      author: { type: 'string', indexed: true },
      date: { type: 'datetime', indexed: true },
      changes: { type: 'array' },
      createdAt: { type: 'datetime' }
    }
  },

  Component: {
    layer: 'Code',
    zPosition: 200,
    color: '#F50057',
    shape: 'cube',
    icon: 'widgets',
    description: 'UI Component (React, Vue, etc.)',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      path: { type: 'string' },
      props: { type: 'array' },
      state: { type: 'array' },
      hooks: { type: 'array' },
      lineStart: { type: 'integer' },
      lineEnd: { type: 'integer' },
      createdAt: { type: 'datetime' }
    }
  },

  // ===== Technical Infrastructure (Business Layer) =====
  System: {
    layer: 'Business',
    zPosition: 0,
    color: '#00ACC1',
    shape: 'sphere',
    icon: 'computer',
    description: 'Software system or application',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      category: { type: 'string', indexed: true },
      version: { type: 'string' },
      vendor: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  API: {
    layer: 'Code',
    zPosition: 200,
    color: '#26A69A',
    shape: 'octahedron',
    icon: 'api',
    description: 'API endpoint or service',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      endpoint: { type: 'string', indexed: true },
      method: { type: 'string' },
      version: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  Database: {
    layer: 'Code',
    zPosition: 200,
    color: '#42A5F5',
    shape: 'cylinder',
    icon: 'storage',
    description: 'Database instance',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      type: { type: 'string', indexed: true },
      connectionString: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  },

  Table: {
    layer: 'Code',
    zPosition: 200,
    color: '#5C6BC0',
    shape: 'box',
    icon: 'table_chart',
    description: 'Database table or collection',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      schema: { type: 'string' },
      columns: { type: 'array' },
      createdAt: { type: 'datetime' }
    }
  },

  Technology: {
    layer: 'Code',
    zPosition: 200,
    color: '#7E57C2',
    shape: 'tetrahedron',
    icon: 'settings_applications',
    description: 'Technology, framework, or library',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      version: { type: 'string' },
      category: { type: 'string', indexed: true },
      createdAt: { type: 'datetime' }
    }
  },

  Project: {
    layer: 'Business',
    zPosition: 0,
    color: '#26C6DA',
    shape: 'icosahedron',
    icon: 'folder_special',
    description: 'Project or initiative',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      description: { type: 'string' },
      status: { type: 'string', indexed: true },
      startDate: { type: 'datetime' },
      endDate: { type: 'datetime' },
      createdAt: { type: 'datetime' }
    }
  },

  Entity: {
    layer: 'Business',
    zPosition: 0,
    color: '#78909C',
    shape: 'sphere',
    icon: 'category',
    description: 'Generic entity (fallback type)',
    properties: {
      id: { type: 'string', required: true, indexed: true },
      name: { type: 'string', required: true, indexed: true },
      type: { type: 'string' },
      description: { type: 'string' },
      createdAt: { type: 'datetime' }
    }
  }
};

/**
 * Get node type definition
 * @param {string} type - Node type name
 * @returns {Object|null} Node type definition
 */
function getNodeType(type) {
  return NODE_TYPES[type] || null;
}

/**
 * Get all node types for a layer
 * @param {string} layer - Layer name (Strategic, Business, Code)
 * @returns {Array} Array of node type definitions
 */
function getNodeTypesForLayer(layer) {
  return Object.entries(NODE_TYPES)
    .filter(([, def]) => def.layer === layer)
    .map(([name, def]) => ({ name, ...def }));
}

/**
 * Get layer for node type
 * @param {string} type - Node type name
 * @returns {string|null} Layer name
 */
function getLayerForNodeType(type) {
  const nodeDef = NODE_TYPES[type];
  return nodeDef ? nodeDef.layer : null;
}

/**
 * Get z-position for node type
 * @param {string} type - Node type name
 * @returns {number} Z position
 */
function getZPositionForNodeType(type) {
  const nodeDef = NODE_TYPES[type];
  return nodeDef ? nodeDef.zPosition : 0;
}

/**
 * Get all relationship types
 * @returns {Object} Relationship types
 */
function getRelationshipTypes() {
  return RELATIONSHIP_TYPES;
}

/**
 * Get relationships by category
 * @param {string} category - Category name
 * @returns {Array} Array of relationship types
 */
function getRelationshipsByCategory(category) {
  return Object.entries(RELATIONSHIP_TYPES)
    .filter(([, def]) => def.category === category)
    .map(([name, def]) => ({ name, ...def }));
}

/**
 * Validate node against schema
 * @param {string} type - Node type
 * @param {Object} properties - Node properties
 * @returns {Object} Validation result
 */
function validateNode(type, properties) {
  const nodeDef = NODE_TYPES[type];
  if (!nodeDef) {
    return { valid: false, errors: [`Unknown node type: ${type}`] };
  }

  const errors = [];
  const propDefs = nodeDef.properties || {};

  // Check required properties
  for (const [prop, def] of Object.entries(propDefs)) {
    if (def.required && (properties[prop] === undefined || properties[prop] === null)) {
      errors.push(`Missing required property: ${prop}`);
    }
  }

  // Check property types
  for (const [prop, value] of Object.entries(properties)) {
    const def = propDefs[prop];
    if (def && value !== undefined && value !== null) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      const expectedType = def.type === 'integer' ? 'number' :
                          def.type === 'float' ? 'number' :
                          def.type === 'datetime' ? 'string' : def.type;

      if (actualType !== expectedType && expectedType !== 'array') {
        errors.push(`Property ${prop} should be ${def.type}, got ${actualType}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate Cypher for node creation
 * @param {string} type - Node type
 * @param {Object} properties - Node properties
 * @returns {Object} Cypher query and params
 */
function generateNodeCypher(type, properties) {
  const nodeDef = NODE_TYPES[type];
  if (!nodeDef) {
    throw new Error(`Unknown node type: ${type}`);
  }

  // Add layer label
  const labels = ['KnowledgeQuantum', type];

  const propList = Object.keys(properties)
    .filter(k => properties[k] !== undefined)
    .map(k => `${k}: $${k}`)
    .join(', ');

  const cypher = `
    MERGE (n:${labels.join(':')} {id: $id})
    SET n += {${propList}}
    RETURN n
  `;

  return { cypher, params: properties };
}

/**
 * Generate Cypher for relationship creation
 * @param {string} fromId - Source node ID
 * @param {string} toId - Target node ID
 * @param {string} relType - Relationship type
 * @param {Object} properties - Relationship properties
 * @returns {Object} Cypher query and params
 */
function generateRelationshipCypher(fromId, toId, relType, properties = {}) {
  const relDef = RELATIONSHIP_TYPES[relType];
  if (!relDef) {
    throw new Error(`Unknown relationship type: ${relType}`);
  }

  const propList = Object.keys(properties)
    .filter(k => properties[k] !== undefined)
    .map(k => `${k}: $${k}`)
    .join(', ');

  const propsClause = propList ? ` {${propList}}` : '';

  const cypher = `
    MATCH (a {id: $fromId}), (b {id: $toId})
    MERGE (a)-[r:${relType}${propsClause}]->(b)
    RETURN r
  `;

  return {
    cypher,
    params: { fromId, toId, ...properties }
  };
}

/**
 * Get schema summary
 * @returns {Object} Schema summary
 */
function getSchemaSummary() {
  const nodesByLayer = {};
  for (const [name, def] of Object.entries(NODE_TYPES)) {
    if (!nodesByLayer[def.layer]) {
      nodesByLayer[def.layer] = [];
    }
    nodesByLayer[def.layer].push(name);
  }

  const relsByCategory = {};
  for (const [name, def] of Object.entries(RELATIONSHIP_TYPES)) {
    if (!relsByCategory[def.category]) {
      relsByCategory[def.category] = [];
    }
    relsByCategory[def.category].push(name);
  }

  return {
    nodeTypes: Object.keys(NODE_TYPES).length,
    relationshipTypes: Object.keys(RELATIONSHIP_TYPES).length,
    layers: Object.keys(nodesByLayer),
    nodesByLayer,
    relationshipsByCategory: relsByCategory
  };
}

module.exports = {
  NODE_TYPES,
  getNodeType,
  getNodeTypesForLayer,
  getLayerForNodeType,
  getZPositionForNodeType,
  getRelationshipTypes,
  getRelationshipsByCategory,
  validateNode,
  generateNodeCypher,
  generateRelationshipCypher,
  getSchemaSummary
};
