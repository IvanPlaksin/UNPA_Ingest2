'use strict';
/**
 * Seed: Laptop Provisioning graph → Memgraph Catalog
 *
 * Stores the laptop-provisioning dialog graph in the knowledge base
 * so camel-chat.service.js can load it from catalog, not static JSON.
 *
 * Graph: WF-START → L2-ASSISTANT → C-OUTCOME → [L3-CREATE-SR|L3-CANCEL] → [L4-NOTIFY→] WF-END
 * Namespace: FLOWDESK
 * Type: EXECUTABLE
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');
let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

// ── Graph definition in RuntimeEngine-compatible format ───────────────────────
const NODES = [
  {
    id: 'WF-START',
    data: { tool: 'workflow.start', executorId: 'workflow.start', label: 'Start', kind: 'input' },
    parameters: {}
  },
  {
    id: 'L2-ASSISTANT',
    data: { tool: 'flowdesk.laptop_assistant', executorId: 'flowdesk.laptop_assistant', label: 'Laptop Q&A Assistant', kind: 'executor' },
    parameters: {}
  },
  {
    id: 'C-OUTCOME',
    data: { tool: 'workflow.condition', executorId: 'workflow.condition', label: 'Check Outcome', kind: 'condition' },
    parameters: {
      expression: 'L2_ASSISTANT.branch',
      note: 'L2-ASSISTANT returns branch="confirmed"|"cancelled"'
    }
  },
  {
    id: 'L3-CREATE-SR',
    data: { tool: 'flowdesk.create_service_request', executorId: 'flowdesk.create_service_request', label: 'Create Service Request', kind: 'executor' },
    parameters: { serviceCode: 'IT-LAPTOP', priority: 'P2_MEDIUM' }
  },
  {
    id: 'L3-CANCEL',
    data: { tool: 'workflow.set_variable', executorId: 'workflow.set_variable', label: 'Mark Cancelled', kind: 'executor' },
    parameters: {
      name: 'final_message',
      value: 'Your laptop request has been cancelled. Feel free to start a new request anytime.'
    }
  },
  {
    id: 'L4-NOTIFY',
    data: { tool: 'flowdesk.send_notification', executorId: 'flowdesk.send_notification', label: 'Send Notification', kind: 'executor' },
    parameters: { channel: 'email', templateId: 'laptop_request_created' }
  },
  {
    id: 'WF-END',
    data: { tool: 'workflow.end', executorId: 'workflow.end', label: 'End', kind: 'output' },
    parameters: {}
  }
];

const EDGES = [
  { id: 'e1', source: 'WF-START',     target: 'L2-ASSISTANT', sourceNodeId: 'WF-START',    targetNodeId: 'L2-ASSISTANT' },
  { id: 'e3', source: 'L2-ASSISTANT', target: 'C-OUTCOME',    sourceNodeId: 'L2-ASSISTANT', targetNodeId: 'C-OUTCOME'    },
  { id: 'e4', source: 'C-OUTCOME',    target: 'L3-CREATE-SR', label: 'confirmed', sourceNodeId: 'C-OUTCOME', targetNodeId: 'L3-CREATE-SR' },
  { id: 'e5', source: 'C-OUTCOME',    target: 'L3-CANCEL',    label: 'cancelled', sourceNodeId: 'C-OUTCOME', targetNodeId: 'L3-CANCEL'    },
  { id: 'e6', source: 'L3-CREATE-SR', target: 'L4-NOTIFY',    sourceNodeId: 'L3-CREATE-SR', targetNodeId: 'L4-NOTIFY'    },
  { id: 'e7', source: 'L4-NOTIFY',    target: 'WF-END',        sourceNodeId: 'L4-NOTIFY',   targetNodeId: 'WF-END'       },
  { id: 'e8', source: 'L3-CANCEL',    target: 'WF-END',        sourceNodeId: 'L3-CANCEL',   targetNodeId: 'WF-END'       }
];

async function seed() {
  console.log('Seeding laptop-provisioning graph to Memgraph catalog...\n');

  // Check if already exists
  const existing = await mg().runQuery(
    'MATCH (c:CatalogEntry {name: $name, namespace: $ns}) RETURN c.entryId AS id',
    { name: 'laptop-provisioning', ns: 'FLOWDESK' }
  );
  if (existing.length > 0) {
    console.log('  SKIP — already exists (entryId:', existing[0].id, ')');
    console.log('  To re-seed: delete with MATCH (c:CatalogEntry {name:"laptop-provisioning"}) DETACH DELETE c');
    process.exit(0);
  }

  const entryId  = uuidv4();
  const graphId  = uuidv4();
  const versionId = uuidv4();
  const now = new Date().toISOString();
  const nodesJson = JSON.stringify(NODES);
  const edgesJson = JSON.stringify(EDGES);

  // CatalogEntry
  await mg().runQuery(`
    CREATE (c:CatalogEntry {
      entryId: $entryId, name: $name, description: $desc,
      type: 'EXECUTABLE', namespace: $ns, graphKey: 'laptop-provisioning',
      tags: ['flowdesk','dialog','camel','laptop','provisioning'],
      visibility: 'PUBLIC', isPublic: true, createdBy: 'seed',
      createdAt: $now, updatedAt: $now, currentVersion: 1,
      usageCount: 0, qualityScore: 1.0
    })
  `, { entryId, name: 'laptop-provisioning',
       desc: 'Laptop Provisioning AI Assistant — multi-turn Q&A via CaMeL-protected input (FD-PORTAL-001)',
       ns: 'FLOWDESK', now });

  // GraphDefinition
  await mg().runQuery(`
    CREATE (g:GraphDefinition {
      graphId: $graphId, name: 'laptop-provisioning',
      nodes: $nodes, edges: $edges,
      nodeCount: $nc, edgeCount: $ec,
      namespace: 'FLOWDESK', graphType: 'EXECUTABLE',
      graphSubType: 'dialog', graphDimension: 'EXECUTION',
      requiredParams: '{}',
      toolIds: $toolIds,
      contentHash: $hash,
      validatedAt: $now, wasAutoFixed: false
    })
  `, {
    graphId, nodes: nodesJson, edges: edgesJson,
    nc: NODES.length, ec: EDGES.length, now,
    toolIds: NODES.map(n => n.data.tool).join(','),
    hash: require('crypto').createHash('sha256').update(nodesJson + edgesJson).digest('hex')
  });

  // GraphVersion
  await mg().runQuery(`
    CREATE (v:GraphVersion {
      versionId: $vid, versionNumber: 1,
      changelog: 'FD-PORTAL-001 — initial laptop provisioning graph with CaMeL security',
      createdAt: $now, createdBy: 'seed'
    })
  `, { vid: versionId, now });

  // Relationships
  await mg().runQuery(`
    MATCH (c:CatalogEntry {entryId: $eid})
    MATCH (g:GraphDefinition {graphId: $gid})
    MATCH (v:GraphVersion {versionId: $vid})
    CREATE (c)-[:DEFINES]->(g)
    CREATE (g)-[:HAS_VERSION]->(v)
  `, { eid: entryId, gid: graphId, vid: versionId });

  // Link to CatalogRoot if it exists
  await mg().runQuery(`
    MATCH (root:CatalogRoot {id: 'catalog-root'})
    MATCH (c:CatalogEntry {entryId: $eid})
    MERGE (root)-[:CONTAINS]->(c)
  `, { eid: entryId }).catch(() => { /* no CatalogRoot is OK */ });

  console.log('  ✅ CatalogEntry     created:', entryId);
  console.log('  ✅ GraphDefinition  created:', graphId);
  console.log('  ✅ GraphVersion     created:', versionId);
  console.log('  ✅ Relationships    created: DEFINES + HAS_VERSION');

  // Verify
  const check = await mg().runQuery(
    'MATCH (c:CatalogEntry {entryId:$eid})-[:DEFINES]->(g:GraphDefinition) RETURN c.name, g.graphType, g.nodeCount, g.edgeCount',
    { eid: entryId }
  );
  console.log('\n  Verification:', JSON.stringify(check[0]));
}

seed().then(() => process.exit(0)).catch(e => { console.error('ERR:', e.message); process.exit(1); });
