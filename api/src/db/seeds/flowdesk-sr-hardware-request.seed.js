/**
 * SR_HardwareRequest — STRUCTURAL + CONSTRAINT seed for FlowDesk
 *
 * Based on the For-Whom Determination pattern from EX SOP 4 graph
 * (graphId: f181451b-590c-4adc-a8a1-cfdeef0569d1, node N36).
 *
 * Usage:
 *   node api/scripts/seed-sr-hardware-request.js [--dry-run] [--verify]
 */

const { StructuralGraphBuilder, FieldDataType } = require('../../schemas/structural-graph.schema');
const { ConstraintGraphBuilder } = require('../../schemas/constraint-graph.schema');

const GRAPH_IDS = {
  STRUCTURAL: 'SR_HardwareRequest_Schema_v1',
  CONSTRAINT: 'SR_HardwareRequest_Constraints_v1',
};

// Target FlowDesk graph and node for integration
const FLOWDESK_TARGET = {
  graphId: 'f181451b-590c-4adc-a8a1-cfdeef0569d1', // EX SOP 4 (latest)
  nodeId: 'N36', // Request Specification
};

function createStructuralGraph() {
  return new StructuralGraphBuilder('SR_HardwareRequest', {
    graphId: GRAPH_IDS.STRUCTURAL,
    namespace: 'FLOWDESK',
    label: { en: 'IT Hardware Request', fr: 'Demande de materiel IT', ru: 'Запрос IT оборудования' },
  })
    // Section 1: Requestor (auto-filled)
    .addField('requestorName', FieldDataType.STRING, {
      label: { en: 'Requestor Name', fr: 'Nom du demandeur', ru: 'Имя заявителя' },
      uiHints: { width: 'half', readonly: true },
    })
    .addField('requestorEmail', FieldDataType.EMAIL, {
      label: { en: 'Requestor Email', fr: 'Email du demandeur' },
      uiHints: { width: 'half', readonly: true },
    })
    .addField('requestorIndex', FieldDataType.STRING, {
      label: { en: 'Staff Index Number', fr: "Numero d'index" },
      uiHints: { width: 'half', readonly: true },
    })
    .addField('requestorDutyStation', FieldDataType.STRING, {
      label: { en: 'Current Duty Station', fr: "Lieu d'affectation actuel" },
      uiHints: { width: 'half', readonly: true },
    })

    // Section 2: For-Whom Determination
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

    // Section 3: Beneficiary (conditional) — DataSource-backed search
    .addDataSourceField('beneficiaryIndex', 'DS_StaffDirectory_v1', {
      label: { en: 'Beneficiary', fr: 'Beneficiaire', ru: 'Получатель' },
      searchable: true,
      dataSourceOptions: {
        minSearchLength: 2,
        debounceMs: 300,
        showMetadata: true,
        metadataTemplate: '${department} - ${dutyStation}',
      },
      uiHints: { widget: 'autocomplete', width: 'full', placeholder: { en: 'Search by name or index number' } },
    })

    // Section 4: Delivery Location (conditional) — DataSource-backed select
    .addDataSourceField('deliveryLocation', 'DS_UNDutyStations_v1', {
      label: { en: 'Delivery Location', fr: 'Lieu de livraison', ru: 'Место доставки' },
      uiHints: { widget: 'select', width: 'half' },
    })
    .addField('otherLocationDetails', FieldDataType.TEXT, {
      label: { en: 'Other Location Details', fr: 'Details du lieu' },
      description: { en: 'Specify building, floor, room number' },
      uiHints: { width: 'full', rows: 2 },
    })

    // Section 5: Equipment — DataSource-backed select
    .addDataSourceField('equipmentType', 'DS_EquipmentTypes_v1', {
      label: { en: 'Equipment Type', fr: "Type d'equipement", ru: 'Тип оборудования' },
      uiHints: { widget: 'select', width: 'half' },
    })
    .addField('otherEquipmentDescription', FieldDataType.STRING, {
      label: { en: 'Other Equipment Description' },
      uiHints: { width: 'half' },
    })
    .addField('quantity', FieldDataType.INTEGER, {
      label: { en: 'Quantity', fr: 'Quantite' },
      defaultValue: 1,
      uiHints: { width: 'quarter' },
    })

    // Section 6: Justification
    .addEnum('priority', ['low', 'medium', 'high', 'critical'], {
      label: { en: 'Priority', fr: 'Priorite' },
      enumLabels: {
        low: { en: 'Low - Can wait 2+ weeks', fr: 'Basse' },
        medium: { en: 'Medium - Within 2 weeks', fr: 'Moyenne' },
        high: { en: 'High - Within 1 week', fr: 'Haute' },
        critical: { en: 'Critical - Urgent business need', fr: 'Critique' },
      },
      uiHints: { widget: 'select', width: 'half' },
    })
    .addField('justification', FieldDataType.TEXT, {
      label: { en: 'Business Justification', fr: 'Justification' },
      description: {
        en: 'Explain why this equipment is needed and how it supports your work',
        fr: "Expliquez pourquoi cet equipement est necessaire",
      },
      uiHints: { widget: 'textarea', width: 'full', rows: 4 },
    })
    .addField('currentEquipmentAssetTag', FieldDataType.STRING, {
      label: { en: 'Current Equipment Asset Tag (if replacement)' },
      description: { en: 'If replacing existing equipment, enter the asset tag' },
      uiHints: { width: 'half' },
    })

    // Section 7: Additional
    .addField('specialRequirements', FieldDataType.TEXT, {
      label: { en: 'Special Requirements', fr: 'Exigences particulieres' },
      description: { en: 'Any special software, configuration, or accessibility requirements' },
      uiHints: { widget: 'textarea', width: 'full', rows: 3 },
    })

    .build();
}

function createConstraintGraph(structuralGraphId) {
  return new ConstraintGraphBuilder('SR_HardwareRequest_Constraints', structuralGraphId, {
    graphId: GRAPH_IDS.CONSTRAINT,
    namespace: 'FLOWDESK',
  })
    // Required fields
    .required('forWhom', {
      errorMessage: { en: 'Please specify who this request is for', fr: 'Veuillez preciser pour qui est cette demande' },
    })
    .required('equipmentType', { errorMessage: { en: 'Please select equipment type' } })
    .required('priority', { errorMessage: { en: 'Please select priority level' } })
    .required('justification', { errorMessage: { en: 'Business justification is required' } })

    // Conditional visibility: For-Whom
    .visibleIf('beneficiaryIndex', { field: 'forWhom', operator: 'eq', value: 'other_staff' })
    .visibleIf('deliveryLocation', { field: 'forWhom', operator: 'neq', value: 'self_current' })
    .visibleIf('otherLocationDetails', { field: 'deliveryLocation', operator: 'eq', value: 'OTHER' })
    .visibleIf('otherEquipmentDescription', { field: 'equipmentType', operator: 'eq', value: 'other' })

    // Conditional required
    .requiredIf('beneficiaryIndex', { field: 'forWhom', operator: 'eq', value: 'other_staff' }, {
      errorMessage: { en: 'Please select the beneficiary' },
    })
    .requiredIf('deliveryLocation', { field: 'forWhom', operator: 'neq', value: 'self_current' }, {
      errorMessage: { en: 'Please select delivery location' },
    })
    .requiredIf('otherLocationDetails', { field: 'deliveryLocation', operator: 'eq', value: 'OTHER' }, {
      errorMessage: { en: 'Please specify the delivery location details' },
    })
    .requiredIf('otherEquipmentDescription', { field: 'equipmentType', operator: 'eq', value: 'other' }, {
      errorMessage: { en: 'Please describe the equipment you need' },
    })

    // Validation
    .minLength('justification', 50, {
      errorMessage: {
        en: 'Justification must be at least 50 characters. Please provide more detail.',
        fr: 'La justification doit comporter au moins 50 caracteres.',
      },
    })
    .maxLength('justification', 2000)
    .range('quantity', 1, 10, {
      minErrorMessage: { en: 'Quantity must be at least 1' },
      maxErrorMessage: { en: 'Maximum 10 items per request. For larger orders, contact procurement.' },
    })
    .pattern('currentEquipmentAssetTag', '^[A-Z]{2}-[0-9]{5}$', {
      errorMessage: { en: 'Asset tag must be in format XX-00000 (e.g., NY-12345)' },
    })

    // Cross-field: high/critical priority needs 100+ chars justification
    .custom(['priority', 'justification'],
      'priority !== "high" && priority !== "critical" || justification.length >= 100',
      { errorMessage: { en: 'High or Critical priority requests require at least 100 characters of justification' } }
    )

    .build();
}

async function seed(memgraphService) {
  const structural = createStructuralGraph();
  const constraint = createConstraintGraph(structural.graphId);

  console.log(`Creating STRUCTURAL graph: ${structural.graphId} (${structural.nodes.length} nodes, ${structural.edges.length} edges)`);
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

  console.log(`Creating CONSTRAINT graph: ${constraint.graphId} (${constraint.nodes.length} rules)`);
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

  console.log('Seed complete.');
  return { structural, constraint };
}

module.exports = { GRAPH_IDS, FLOWDESK_TARGET, createStructuralGraph, createConstraintGraph, seed };
