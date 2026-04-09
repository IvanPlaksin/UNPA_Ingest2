/**
 * ForWhom_Determination — STRUCTURAL + CONSTRAINT for the For-Whom node (N13)
 * Used in EX SOP5 and other FlowDesk dialog graphs.
 */

const { StructuralGraphBuilder, FieldDataType } = require('../../schemas/structural-graph.schema');
const { ConstraintGraphBuilder } = require('../../schemas/constraint-graph.schema');

const GRAPH_IDS = {
  STRUCTURAL: 'ForWhom_Determination_Schema_v1',
  CONSTRAINT: 'ForWhom_Determination_Constraints_v1',
};

function createStructuralGraph() {
  return new StructuralGraphBuilder('ForWhom_Determination', {
    graphId: GRAPH_IDS.STRUCTURAL,
    namespace: 'FLOWDESK',
    label: { en: 'For-Whom Determination', fr: 'Determination du beneficiaire', ru: 'Определение получателя' },
  })
    .addEnum('forWhom', ['self_current', 'self_different', 'other_staff'], {
      label: {
        en: 'Who is this request for?',
        fr: 'Pour qui est cette demande?',
        ru: 'Для кого этот запрос?',
      },
      enumLabels: {
        self_current: { en: 'Myself at current duty station', fr: "Moi-meme au lieu d'affectation actuel" },
        self_different: { en: 'Myself at a different location', fr: 'Moi-meme a un autre lieu' },
        other_staff: { en: 'Another staff member', fr: 'Un autre membre du personnel' },
      },
      uiHints: { widget: 'radio', width: 'full' },
    })
    .build();
}

function createConstraintGraph(structuralGraphId) {
  return new ConstraintGraphBuilder('ForWhom_Determination_Constraints', structuralGraphId, {
    graphId: GRAPH_IDS.CONSTRAINT,
    namespace: 'FLOWDESK',
  })
    .required('forWhom', {
      errorMessage: {
        en: 'Please select who this request is for',
        fr: 'Veuillez selectionner pour qui est cette demande',
        ru: 'Пожалуйста, укажите для кого этот запрос',
      },
    })
    .build();
}

async function seed(memgraphService) {
  const structural = createStructuralGraph();
  const constraint = createConstraintGraph(structural.graphId);

  console.log(`Creating STRUCTURAL: ${structural.graphId} (${structural.nodes.length} nodes)`);
  await memgraphService.runQuery(
    'MERGE (g:GraphDefinition {graphId: $graphId}) ' +
    'SET g.name = $name, g.namespace = $namespace, g.graphType = $graphType, ' +
    'g.graphDimension = $graphDimension, g.nodes = $nodes, g.edges = $edges, ' +
    'g.nodeCount = $nodeCount, g.edgeCount = $edgeCount, ' +
    'g.createdAt = datetime(), g.updatedAt = datetime()',
    {
      graphId: structural.graphId,
      name: structural.name,
      namespace: structural.namespace,
      graphType: structural.graphType,
      graphDimension: structural.graphDimension,
      nodes: JSON.stringify(structural.nodes),
      edges: JSON.stringify(structural.edges),
      nodeCount: structural.nodes.length,
      edgeCount: structural.edges.length,
    }
  );

  console.log(`Creating CONSTRAINT: ${constraint.graphId} (${constraint.nodes.length} rules)`);
  await memgraphService.runQuery(
    'MERGE (g:GraphDefinition {graphId: $graphId}) ' +
    'SET g.name = $name, g.namespace = $namespace, g.graphType = $graphType, ' +
    'g.graphDimension = $graphDimension, g.structuralGraphId = $structuralGraphId, ' +
    'g.nodes = $nodes, g.edges = $edges, ' +
    'g.nodeCount = $nodeCount, g.edgeCount = $edgeCount, ' +
    'g.createdAt = datetime(), g.updatedAt = datetime()',
    {
      graphId: constraint.graphId,
      name: constraint.name,
      namespace: constraint.namespace,
      graphType: constraint.graphType,
      graphDimension: constraint.graphDimension,
      structuralGraphId: constraint.structuralGraphId,
      nodes: JSON.stringify(constraint.nodes),
      edges: JSON.stringify(constraint.edges),
      nodeCount: constraint.nodes.length,
      edgeCount: constraint.edges.length,
    }
  );

  console.log('Creating CONSTRAINS relationship...');
  await memgraphService.runQuery(
    'MATCH (c:GraphDefinition {graphId: $cid}) ' +
    'MATCH (s:GraphDefinition {graphId: $sid}) ' +
    'MERGE (c)-[:CONSTRAINS]->(s)',
    { cid: constraint.graphId, sid: structural.graphId }
  );

  return { structural, constraint };
}

module.exports = { GRAPH_IDS, createStructuralGraph, createConstraintGraph, seed };
