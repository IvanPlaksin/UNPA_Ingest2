/**
 * Approval Workflow Controller
 *
 * REST API for the Approval Workflow PoC:
 * - Submit approval requests (triggers G0 orchestrator)
 * - Check request status
 * - Submit decisions (feeds wait_input nodes)
 */

const { v4: uuidv4 } = require('uuid');

let memgraphService = null;
let runtimeEngine = null;

async function getMemgraph() {
  if (!memgraphService) {
    memgraphService = require('../services/memgraph.service');
  }
  return memgraphService;
}

async function getRuntimeEngine() {
  if (!runtimeEngine) {
    try {
      const { RuntimeEngine } = require('../runtime/RuntimeEngine');
      const memgraph = await getMemgraph();
      const { GraphLoaderService } = require('../services/graph-definitions/graph-loader.service');
      const loader = new GraphLoaderService(null, memgraph);
      runtimeEngine = new RuntimeEngine({ graphLoader: loader, memgraphService: memgraph });
    } catch (err) {
      console.warn('[Approval] RuntimeEngine init failed:', err.message);
    }
  }
  return runtimeEngine;
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/v1/approval/submit
// ────────────────────────────────────────────────────────────────────────────

async function submitRequest(req, res) {
  try {
    const { requesterId, type, payload } = req.body;

    if (!requesterId) {
      return res.status(400).json({ error: 'requesterId is required' });
    }
    if (!payload || !payload.reason) {
      return res.status(400).json({ error: 'payload.reason is required' });
    }

    const memgraph = await getMemgraph();

    // Verify employee exists
    const empResult = await memgraph.runCypher(
      "MATCH (e:Employee {id: $id}) RETURN e",
      { id: requesterId }
    );

    const empRecords = empResult.records || empResult;
    if (!empRecords || empRecords.length === 0) {
      return res.status(404).json({ error: `Employee not found: ${requesterId}` });
    }

    // Create the approval request
    const requestId = `req-${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    await memgraph.runCypher(
      `CREATE (r:ApprovalRequest {
        id: $id,
        type: $type,
        status: 'pending',
        requesterId: $requesterId,
        amount: $amount,
        days: $days,
        reason: $reason,
        namespace: 'PROJECT',
        createdAt: $createdAt,
        updatedAt: $createdAt
      })`,
      {
        id: requestId,
        type: type || 'unknown',
        requesterId,
        amount: payload.amount || 0,
        days: payload.days || 0,
        reason: payload.reason,
        createdAt: now,
      }
    );

    // Link to requester
    await memgraph.runCypher(
      `MATCH (r:ApprovalRequest {id: $requestId}), (e:Employee {id: $employeeId})
       CREATE (r)-[:SUBMITTED_BY]->(e)`,
      { requestId, employeeId: requesterId }
    );

    // Try to execute the orchestrator graph
    let executionId = null;
    try {
      const engine = await getRuntimeEngine();
      if (engine) {
        const result = await engine.execute('APPROVAL-G0-ORCHESTRATOR-V1', {
          requesterId,
          type: type || '',
          payload: { ...payload, requestId },
        });
        executionId = result?.executionId || null;
      }
    } catch (err) {
      console.warn('[Approval] Graph execution skipped:', err.message);
    }

    res.status(201).json({
      requestId,
      status: 'submitted',
      type: type || 'pending_classification',
      executionId,
      message: executionId
        ? 'Request submitted and workflow started'
        : 'Request created (workflow engine not available)',
    });
  } catch (err) {
    console.error('[Approval] Submit error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/v1/approval/status/:requestId
// ────────────────────────────────────────────────────────────────────────────

async function getStatus(req, res) {
  try {
    const { requestId } = req.params;
    const memgraph = await getMemgraph();

    // Get request
    const reqResult = await memgraph.runCypher(
      `MATCH (r:ApprovalRequest {id: $id})
       OPTIONAL MATCH (r)-[:SUBMITTED_BY]->(e:Employee)
       RETURN r { .* } AS request, e { .id, .name, .email } AS requester`,
      { id: requestId }
    );

    const records = reqResult.records || reqResult;
    if (!records || records.length === 0) {
      return res.status(404).json({ error: `Request not found: ${requestId}` });
    }

    const row = records[0];
    const request = row.request || row.get?.('request');
    const requester = row.requester || row.get?.('requester');

    // Get decisions
    const decResult = await memgraph.runCypher(
      `MATCH (d:Decision {requestId: $id})
       OPTIONAL MATCH (d)-[:MADE_BY]->(e:Employee)
       RETURN d { .* } AS decision, e { .id, .name } AS decider
       ORDER BY d.decidedAt ASC`,
      { id: requestId }
    );

    const decRecords = decResult.records || decResult;
    const decisions = (decRecords || []).map(r => ({
      ...(r.decision || r.get?.('decision')),
      decider: r.decider || r.get?.('decider'),
    }));

    res.json({
      request,
      requester,
      decisions,
      decisionCount: decisions.length,
    });
  } catch (err) {
    console.error('[Approval] Status error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/v1/approval/decide/:requestId
// ────────────────────────────────────────────────────────────────────────────

async function decide(req, res) {
  try {
    const { requestId } = req.params;
    const { deciderId, decision, comment } = req.body;

    if (!deciderId) {
      return res.status(400).json({ error: 'deciderId is required' });
    }
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }

    const memgraph = await getMemgraph();

    // Verify request exists and is pending
    const reqResult = await memgraph.runCypher(
      "MATCH (r:ApprovalRequest {id: $id}) RETURN r.status AS status",
      { id: requestId }
    );

    const records = reqResult.records || reqResult;
    if (!records || records.length === 0) {
      return res.status(404).json({ error: `Request not found: ${requestId}` });
    }

    const status = records[0].status || records[0].get?.('status');
    if (status !== 'pending') {
      return res.status(409).json({
        error: `Request is already ${status}`,
        currentStatus: status,
      });
    }

    // Verify decider exists
    const deciderResult = await memgraph.runCypher(
      "MATCH (e:Employee {id: $id}) RETURN e.name AS name",
      { id: deciderId }
    );
    const deciderRecords = deciderResult.records || deciderResult;
    if (!deciderRecords || deciderRecords.length === 0) {
      return res.status(404).json({ error: `Decider not found: ${deciderId}` });
    }

    const now = new Date().toISOString();
    const decisionId = `dec-${uuidv4().slice(0, 8)}`;

    // Update request status
    await memgraph.runCypher(
      `MATCH (r:ApprovalRequest {id: $requestId})
       SET r.status = $decision, r.updatedAt = $now`,
      { requestId, decision, now }
    );

    // Create decision record
    await memgraph.runCypher(
      `CREATE (d:Decision {
        id: $id,
        requestId: $requestId,
        deciderId: $deciderId,
        decision: $decision,
        comment: $comment,
        decidedAt: $decidedAt,
        namespace: 'PROJECT'
      })`,
      {
        id: decisionId,
        requestId,
        deciderId,
        decision,
        comment: comment || '',
        decidedAt: now,
      }
    );

    // Create relationships
    await memgraph.runCypher(
      `MATCH (d:Decision {id: $decisionId}), (r:ApprovalRequest {id: $requestId})
       CREATE (d)-[:FOR_REQUEST]->(r)`,
      { decisionId, requestId }
    );
    await memgraph.runCypher(
      `MATCH (d:Decision {id: $decisionId}), (e:Employee {id: $deciderId})
       CREATE (d)-[:MADE_BY]->(e)`,
      { decisionId, deciderId }
    );

    res.json({
      success: true,
      decisionId,
      requestId,
      decision,
      comment: comment || '',
      decidedAt: now,
    });
  } catch (err) {
    console.error('[Approval] Decide error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/v1/approval/list
// ────────────────────────────────────────────────────────────────────────────

async function listRequests(req, res) {
  try {
    const { status, type, requesterId } = req.query;
    const memgraph = await getMemgraph();

    let cypher = 'MATCH (r:ApprovalRequest)';
    const params = {};
    const filters = [];

    if (status) {
      filters.push('r.status = $status');
      params.status = status;
    }
    if (type) {
      filters.push('r.type = $type');
      params.type = type;
    }
    if (requesterId) {
      filters.push('r.requesterId = $requesterId');
      params.requesterId = requesterId;
    }

    if (filters.length > 0) {
      cypher += ' WHERE ' + filters.join(' AND ');
    }

    cypher += ' RETURN r { .* } AS request ORDER BY r.createdAt DESC LIMIT 50';

    const result = await memgraph.runCypher(cypher, params);
    const records = result.records || result;
    const requests = (records || []).map(r => r.request || r.get?.('request'));

    res.json({ requests, count: requests.length });
  } catch (err) {
    console.error('[Approval] List error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/v1/approval/employees
// ────────────────────────────────────────────────────────────────────────────

async function listEmployees(req, res) {
  try {
    const memgraph = await getMemgraph();
    const result = await memgraph.runCypher(
      `MATCH (e:Employee)
       OPTIONAL MATCH (e)-[:REPORTS_TO]->(m:Employee)
       OPTIONAL MATCH (e)-[:WORKS_IN]->(d:Department)
       RETURN e { .* } AS employee, m.name AS managerName, d.name AS departmentName
       ORDER BY e.name`
    );
    const records = result.records || result;
    const employees = (records || []).map(r => ({
      ...(r.employee || r.get?.('employee')),
      managerName: r.managerName || r.get?.('managerName'),
      departmentName: r.departmentName || r.get?.('departmentName'),
    }));

    res.json({ employees, count: employees.length });
  } catch (err) {
    console.error('[Approval] Employees error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  submitRequest,
  getStatus,
  decide,
  listRequests,
  listEmployees,
};
