/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMMUTABLE GRAPH CONTROLLER
 * API endpoints for bi-temporal versioned graph system
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const memgraphService = require('../services/memgraph.service');

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function generateVersionName(epoch, sequence) {
  return `v${epoch}.${sequence}`;
}

function generateContentHash(properties) {
  const json = JSON.stringify(properties, Object.keys(properties).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

function generateChainHash(previousHash, contentHash) {
  return crypto.createHash('sha256').update(`${previousHash}:${contentHash}`).digest('hex');
}

// In-memory god mode sessions (should be stored in DB in production)
const godModeSessions = new Map();

// ════════════════════════════════════════════════════════════════════════════
// NODE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

async function createNode(req, res) {
  try {
    const { namespace, projectId, nodeType, properties, validTimeStart, changeReason, changeSource } = req.body;

    const entityId = uuidv4();
    const versionId = uuidv4();
    const now = new Date().toISOString();
    const contentHash = generateContentHash(properties);

    const query = `
      CREATE (n:NodeVersion {
        versionId: $versionId,
        entityId: $entityId,
        namespace: $namespace,
        projectId: $projectId,
        nodeType: $nodeType,
        properties: $properties,
        status: 'ACTIVE',
        versionName: $versionName,
        sequenceNumber: 1,
        ttStart: datetime($now),
        ttEnd: null,
        vtStart: datetime($vtStart),
        vtEnd: null,
        changeType: 'CREATE',
        changeReason: $changeReason,
        changedBy: $changedBy,
        contentHash: $contentHash,
        chainHash: $contentHash
      })
      RETURN n
    `;

    const result = await memgraphService.executeQuery(query, {
      versionId,
      entityId,
      namespace: namespace || 'PROJECT',
      projectId: projectId || null,
      nodeType,
      properties: JSON.stringify(properties),
      versionName: generateVersionName(9000, 1),
      now,
      vtStart: validTimeStart || now,
      changeReason: changeReason || 'Initial creation',
      changedBy: changeSource || 'system',
      contentHash
    });

    const node = result.records[0]?.get('n')?.properties;
    if (node) {
      node.properties = JSON.parse(node.properties);
    }

    res.json({ success: true, data: node });
  } catch (error) {
    console.error('createNode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getNode(req, res) {
  try {
    const { entityId } = req.params;
    const { includeLineage } = req.query;

    const query = `
      MATCH (n:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      RETURN n
      LIMIT 1
    `;

    const result = await memgraphService.executeQuery(query, { entityId });
    const node = result.records[0]?.get('n')?.properties;

    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    node.properties = JSON.parse(node.properties || '{}');

    const response = { node };

    if (includeLineage === 'true') {
      const lineageQuery = `
        MATCH (n:NodeVersion {entityId: $entityId})
        RETURN n
        ORDER BY n.sequenceNumber DESC
        LIMIT 1000
      `;
      const lineageResult = await memgraphService.executeQuery(lineageQuery, { entityId });
      response.lineage = {
        entityId,
        versions: lineageResult.records.map(r => {
          const v = r.get('n').properties;
          v.properties = JSON.parse(v.properties || '{}');
          return v;
        }),
        mergeHistory: []
      };
    }

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('getNode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function updateNode(req, res) {
  try {
    const { entityId } = req.params;
    const { properties, changeReason, validTimeStart, godMode } = req.body;

    // Get current version
    const currentQuery = `
      MATCH (n:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      RETURN n
    `;
    const currentResult = await memgraphService.executeQuery(currentQuery, { entityId });
    const current = currentResult.records[0]?.get('n')?.properties;

    if (!current) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const now = new Date().toISOString();
    const newVersionId = uuidv4();
    const newSequence = (current.sequenceNumber || 1) + 1;
    const contentHash = generateContentHash(properties);
    const chainHash = generateChainHash(current.chainHash, contentHash);

    // Supersede old version and create new
    const updateQuery = `
      MATCH (old:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      SET old.status = 'SUPERSEDED', old.ttEnd = datetime($now)
      CREATE (new:NodeVersion {
        versionId: $versionId,
        entityId: $entityId,
        namespace: old.namespace,
        projectId: old.projectId,
        nodeType: old.nodeType,
        properties: $properties,
        status: 'ACTIVE',
        versionName: $versionName,
        sequenceNumber: $sequenceNumber,
        ttStart: datetime($now),
        ttEnd: null,
        vtStart: datetime($vtStart),
        vtEnd: null,
        changeType: 'UPDATE',
        changeReason: $changeReason,
        changedBy: $changedBy,
        contentHash: $contentHash,
        chainHash: $chainHash
      })
      CREATE (old)-[:SUPERSEDED_BY]->(new)
      RETURN new
    `;

    const result = await memgraphService.executeQuery(updateQuery, {
      entityId,
      versionId: newVersionId,
      properties: JSON.stringify(properties),
      versionName: generateVersionName(9000, newSequence),
      sequenceNumber: newSequence,
      now,
      vtStart: validTimeStart || now,
      changeReason: changeReason || 'Update',
      changedBy: 'system',
      contentHash,
      chainHash
    });

    const node = result.records[0]?.get('new')?.properties;
    if (node) {
      node.properties = JSON.parse(node.properties);
    }

    res.json({ success: true, data: node });
  } catch (error) {
    console.error('updateNode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function deprecateNode(req, res) {
  try {
    const { entityId } = req.params;
    const { reason } = req.body;

    const query = `
      MATCH (n:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      SET n.status = 'DEPRECATED', n.changeReason = $reason
      RETURN n
    `;

    const result = await memgraphService.executeQuery(query, {
      entityId,
      reason: reason || 'Deprecated'
    });

    const node = result.records[0]?.get('n')?.properties;
    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    node.properties = JSON.parse(node.properties || '{}');
    res.json({ success: true, data: { node, orphanedEdgesCount: 0 } });
  } catch (error) {
    console.error('deprecateNode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function mergeNodes(req, res) {
  try {
    const { entityIdA, entityIdB, mergeReason } = req.body;

    // Simplified merge - creates new node, deprecates old ones
    const mergeId = uuidv4();
    const mergedEntityId = uuidv4();
    const now = new Date().toISOString();

    // Get both nodes
    const getQuery = `
      MATCH (a:NodeVersion {entityId: $entityIdA, status: 'ACTIVE'})
      MATCH (b:NodeVersion {entityId: $entityIdB, status: 'ACTIVE'})
      RETURN a, b
    `;
    const nodesResult = await memgraphService.executeQuery(getQuery, { entityIdA, entityIdB });

    if (nodesResult.records.length === 0) {
      return res.status(404).json({ success: false, error: 'One or both nodes not found' });
    }

    const nodeA = nodesResult.records[0].get('a').properties;
    const nodeB = nodesResult.records[0].get('b').properties;

    // Merge properties
    const propsA = JSON.parse(nodeA.properties || '{}');
    const propsB = JSON.parse(nodeB.properties || '{}');
    const mergedProps = { ...propsA, ...propsB };

    // Create merge record and merged node
    const mergeQuery = `
      MATCH (a:NodeVersion {entityId: $entityIdA, status: 'ACTIVE'})
      MATCH (b:NodeVersion {entityId: $entityIdB, status: 'ACTIVE'})
      SET a.status = 'MERGED', b.status = 'MERGED'
      CREATE (m:NodeVersion {
        versionId: $versionId,
        entityId: $mergedEntityId,
        namespace: a.namespace,
        projectId: a.projectId,
        nodeType: a.nodeType,
        properties: $properties,
        status: 'ACTIVE',
        versionName: $versionName,
        sequenceNumber: 1,
        ttStart: datetime($now),
        changeType: 'MERGE',
        changeReason: $mergeReason,
        changedBy: 'system',
        contentHash: $contentHash
      })
      CREATE (mr:MergeRecord {
        mergeId: $mergeId,
        entityIdA: $entityIdA,
        entityIdB: $entityIdB,
        mergedEntityId: $mergedEntityId,
        mergeReason: $mergeReason,
        mergedBy: 'system',
        mergedAt: datetime($now)
      })
      RETURN m, mr
    `;

    const contentHash = generateContentHash(mergedProps);
    const result = await memgraphService.executeQuery(mergeQuery, {
      entityIdA,
      entityIdB,
      mergedEntityId,
      versionId: uuidv4(),
      properties: JSON.stringify(mergedProps),
      versionName: generateVersionName(9000, 1),
      now,
      mergeReason: mergeReason || 'Merge',
      mergeId,
      contentHash
    });

    const mergedNode = result.records[0]?.get('m')?.properties;
    const mergeRecord = result.records[0]?.get('mr')?.properties;

    if (mergedNode) {
      mergedNode.properties = JSON.parse(mergedNode.properties);
    }

    res.json({
      success: true,
      data: { mergedNode, mergeRecord, migratedEdges: 0 }
    });
  } catch (error) {
    console.error('mergeNodes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getNodeLineage(req, res) {
  try {
    const { entityId } = req.params;

    const query = `
      MATCH (n:NodeVersion {entityId: $entityId})
      RETURN n
      ORDER BY n.sequenceNumber DESC
      LIMIT 1000
    `;

    const result = await memgraphService.executeQuery(query, { entityId });
    const versions = result.records.map(r => {
      const v = r.get('n').properties;
      v.properties = JSON.parse(v.properties || '{}');
      return v;
    });

    res.json({
      success: true,
      data: { entityId, versions, mergeHistory: [] }
    });
  } catch (error) {
    console.error('getNodeLineage error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function verifyNodeChain(req, res) {
  try {
    const { entityId } = req.params;

    const query = `
      MATCH (n:NodeVersion {entityId: $entityId})
      RETURN n
      ORDER BY n.sequenceNumber ASC
      LIMIT 1000
    `;

    const result = await memgraphService.executeQuery(query, { entityId });
    const versions = result.records.map(r => r.get('n').properties);

    // Verify chain
    const errors = [];
    let previousHash = null;

    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      if (i > 0 && previousHash) {
        const expectedChain = generateChainHash(previousHash, v.contentHash);
        if (v.chainHash !== expectedChain) {
          errors.push(`Version ${v.versionName}: Chain hash mismatch`);
        }
      }
      previousHash = v.chainHash;
    }

    res.json({
      success: true,
      data: {
        valid: errors.length === 0,
        chainLength: versions.length,
        errors
      }
    });
  } catch (error) {
    console.error('verifyNodeChain error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EDGE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

async function createEdge(req, res) {
  try {
    const { sourceEntityId, targetEntityId, edgeType, namespace, properties, changeReason } = req.body;

    const edgeId = uuidv4();
    const versionId = uuidv4();
    const now = new Date().toISOString();

    const query = `
      CREATE (e:EdgeVersion {
        versionId: $versionId,
        edgeId: $edgeId,
        sourceEntityId: $sourceEntityId,
        targetEntityId: $targetEntityId,
        edgeType: $edgeType,
        namespace: $namespace,
        properties: $properties,
        status: 'ACTIVE',
        versionName: $versionName,
        ttStart: datetime($now),
        changeType: 'CREATE',
        changeReason: $changeReason,
        changedBy: 'system'
      })
      RETURN e
    `;

    const result = await memgraphService.executeQuery(query, {
      versionId,
      edgeId,
      sourceEntityId,
      targetEntityId,
      edgeType,
      namespace: namespace || 'PROJECT',
      properties: JSON.stringify(properties || {}),
      versionName: generateVersionName(9000, 1),
      now,
      changeReason: changeReason || 'Initial creation'
    });

    const edge = result.records[0]?.get('e')?.properties;
    if (edge) {
      edge.properties = JSON.parse(edge.properties);
    }

    res.json({ success: true, data: edge });
  } catch (error) {
    console.error('createEdge error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getEdge(req, res) {
  try {
    const { edgeId } = req.params;

    const query = `
      MATCH (e:EdgeVersion {edgeId: $edgeId, status: 'ACTIVE'})
      RETURN e
      LIMIT 1
    `;

    const result = await memgraphService.executeQuery(query, { edgeId });
    const edge = result.records[0]?.get('e')?.properties;

    if (!edge) {
      return res.status(404).json({ success: false, error: 'Edge not found' });
    }

    edge.properties = JSON.parse(edge.properties || '{}');
    res.json({ success: true, data: edge });
  } catch (error) {
    console.error('getEdge error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function deprecateEdge(req, res) {
  try {
    const { edgeId } = req.params;
    const { reason } = req.body;

    const query = `
      MATCH (e:EdgeVersion {edgeId: $edgeId, status: 'ACTIVE'})
      SET e.status = 'DEPRECATED', e.changeReason = $reason
      RETURN e
    `;

    const result = await memgraphService.executeQuery(query, {
      edgeId,
      reason: reason || 'Deprecated'
    });

    const edge = result.records[0]?.get('e')?.properties;
    if (!edge) {
      return res.status(404).json({ success: false, error: 'Edge not found' });
    }

    edge.properties = JSON.parse(edge.properties || '{}');
    res.json({ success: true, data: edge });
  } catch (error) {
    console.error('deprecateEdge error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getConnectedEdges(req, res) {
  try {
    const { entityId } = req.params;
    const { status } = req.query;

    let query = `
      MATCH (e:EdgeVersion)
      WHERE (e.sourceEntityId = $entityId OR e.targetEntityId = $entityId)
    `;

    if (status) {
      query += ` AND e.status = $status`;
    }

    query += ` RETURN e LIMIT 500`;

    const result = await memgraphService.executeQuery(query, { entityId, status });
    const edges = result.records.map(r => {
      const e = r.get('e').properties;
      e.properties = JSON.parse(e.properties || '{}');
      return e;
    });

    res.json({ success: true, data: edges });
  } catch (error) {
    console.error('getConnectedEdges error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPORAL QUERIES
// ════════════════════════════════════════════════════════════════════════════

async function queryNodes(req, res) {
  try {
    const { namespace, projectId, nodeType, validTime, transactionTime, versionName } = req.query;

    let conditions = ['n.status = "ACTIVE"'];
    const params = {};

    if (namespace) {
      conditions.push('n.namespace = $namespace');
      params.namespace = namespace;
    }
    if (projectId) {
      conditions.push('n.projectId = $projectId');
      params.projectId = projectId;
    }
    if (nodeType) {
      conditions.push('n.nodeType = $nodeType');
      params.nodeType = nodeType;
    }
    if (versionName) {
      conditions.push('n.versionName = $versionName');
      params.versionName = versionName;
    }

    const query = `
      MATCH (n:NodeVersion)
      WHERE ${conditions.join(' AND ')}
      RETURN n
      ORDER BY n.ttStart DESC
      LIMIT 100
    `;

    const result = await memgraphService.executeQuery(query, params);
    const nodes = result.records.map(r => {
      const n = r.get('n').properties;
      n.properties = JSON.parse(n.properties || '{}');
      return n;
    });

    res.json({ success: true, data: nodes });
  } catch (error) {
    console.error('queryNodes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GOD MODE
// ════════════════════════════════════════════════════════════════════════════

async function activateGodMode(req, res) {
  try {
    const { reason, durationMinutes = 30 } = req.body;
    const userId = req.headers['x-user-id'] || 'system';

    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const session = {
      sessionId,
      userId,
      namespace: 'PROJECT',
      reason,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isActive: true,
      remainingMinutes: durationMinutes
    };

    godModeSessions.set(sessionId, session);

    // Store in DB
    const query = `
      CREATE (g:GodModeSession {
        sessionId: $sessionId,
        userId: $userId,
        namespace: 'PROJECT',
        reason: $reason,
        startedAt: datetime($startedAt),
        expiresAt: datetime($expiresAt),
        isActive: true
      })
      RETURN g
    `;

    await memgraphService.executeQuery(query, {
      sessionId,
      userId,
      reason,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    res.json({ success: true, data: session });
  } catch (error) {
    console.error('activateGodMode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function deactivateGodMode(req, res) {
  try {
    const userId = req.headers['x-user-id'] || 'system';

    // Deactivate in DB
    const query = `
      MATCH (g:GodModeSession {userId: $userId, isActive: true})
      SET g.isActive = false, g.deactivatedAt = datetime($now)
      RETURN g
    `;

    await memgraphService.executeQuery(query, {
      userId,
      now: new Date().toISOString()
    });

    // Clear from memory
    for (const [key, session] of godModeSessions.entries()) {
      if (session.userId === userId) {
        godModeSessions.delete(key);
      }
    }

    res.json({ success: true, data: { deactivatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('deactivateGodMode error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getGodModeStatus(req, res) {
  try {
    const userId = req.headers['x-user-id'] || 'system';

    const query = `
      MATCH (g:GodModeSession {userId: $userId, isActive: true})
      RETURN g
      LIMIT 1
    `;

    const result = await memgraphService.executeQuery(query, { userId });
    const session = result.records[0]?.get('g')?.properties;

    if (!session) {
      return res.json({ success: true, data: { active: false } });
    }

    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    const remainingMinutes = Math.max(0, Math.floor((expiresAt - now) / 60000));

    res.json({
      success: true,
      data: {
        ...session,
        isActive: remainingMinutes > 0,
        remainingMinutes
      }
    });
  } catch (error) {
    console.error('getGodModeStatus error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function markForDeletion(req, res) {
  try {
    const { entityId } = req.params;
    const { entityType, reason } = req.body;

    const pendingId = uuidv4();
    const now = new Date();
    const waitSeconds = 5;
    const confirmDeadline = new Date(now.getTime() + waitSeconds * 1000);

    const query = `
      CREATE (p:PendingDeletion {
        pendingId: $pendingId,
        entityId: $entityId,
        entityType: $entityType,
        reason: $reason,
        markedAt: datetime($now),
        confirmDeadline: datetime($deadline),
        waitSeconds: $waitSeconds
      })
      RETURN p
    `;

    await memgraphService.executeQuery(query, {
      pendingId,
      entityId,
      entityType,
      reason: reason || 'Deletion requested',
      now: now.toISOString(),
      deadline: confirmDeadline.toISOString(),
      waitSeconds
    });

    res.json({
      success: true,
      data: {
        pendingId,
        entityId,
        entityType,
        markedAt: now.toISOString(),
        confirmDeadline: confirmDeadline.toISOString(),
        waitSeconds
      }
    });
  } catch (error) {
    console.error('markForDeletion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function confirmDeletion(req, res) {
  try {
    const { entityId } = req.params;

    // Check pending deletion
    const checkQuery = `
      MATCH (p:PendingDeletion {entityId: $entityId})
      RETURN p
    `;

    const checkResult = await memgraphService.executeQuery(checkQuery, { entityId });
    const pending = checkResult.records[0]?.get('p')?.properties;

    if (!pending) {
      return res.status(400).json({
        success: false,
        error: 'No pending deletion for this entity'
      });
    }

    // Create tombstone and mark as deleted
    const tombstoneId = uuidv4();
    const now = new Date().toISOString();

    const deleteQuery = `
      MATCH (p:PendingDeletion {entityId: $entityId})
      MATCH (n:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      SET n.status = 'DELETED'
      CREATE (t:Tombstone {
        tombstoneId: $tombstoneId,
        originalId: $entityId,
        deletedAt: datetime($now),
        deletedBy: 'system'
      })
      DELETE p
      RETURN t
    `;

    await memgraphService.executeQuery(deleteQuery, {
      entityId,
      tombstoneId,
      now
    });

    res.json({
      success: true,
      data: { deleted: true, tombstoneId }
    });
  } catch (error) {
    console.error('confirmDeletion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getAuditTrail(req, res) {
  try {
    const { entityId } = req.params;

    const query = `
      MATCH (a:GodModeAuditRecord {entityId: $entityId})
      RETURN a
      ORDER BY a.performedAt DESC
      LIMIT 500
    `;

    const result = await memgraphService.executeQuery(query, { entityId });
    const records = result.records.map(r => r.get('a').properties);

    res.json({ success: true, data: records });
  } catch (error) {
    console.error('getAuditTrail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getSessionAuditTrail(req, res) {
  try {
    const { sessionId } = req.params;

    const query = `
      MATCH (a:GodModeAuditRecord {sessionId: $sessionId})
      RETURN a
      ORDER BY a.performedAt DESC
      LIMIT 500
    `;

    const result = await memgraphService.executeQuery(query, { sessionId });
    const records = result.records.map(r => r.get('a').properties);

    res.json({ success: true, data: records });
  } catch (error) {
    console.error('getSessionAuditTrail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SSE ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

function sseEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial connected event
  sendEvent({ type: 'connected', timestamp: new Date().toISOString() });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    sendEvent({ type: 'ping', timestamp: new Date().toISOString() });
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
}

function sseGodModeEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: 'connected', timestamp: new Date().toISOString() });

  const keepAlive = setInterval(() => {
    sendEvent({ type: 'ping', timestamp: new Date().toISOString() });
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
}

module.exports = {
  // Node operations
  createNode,
  getNode,
  updateNode,
  deprecateNode,
  mergeNodes,
  getNodeLineage,
  verifyNodeChain,
  // Edge operations
  createEdge,
  getEdge,
  deprecateEdge,
  getConnectedEdges,
  // Temporal queries
  queryNodes,
  // God mode
  activateGodMode,
  deactivateGodMode,
  getGodModeStatus,
  markForDeletion,
  confirmDeletion,
  getAuditTrail,
  getSessionAuditTrail,
  // SSE
  sseEvents,
  sseGodModeEvents
};
