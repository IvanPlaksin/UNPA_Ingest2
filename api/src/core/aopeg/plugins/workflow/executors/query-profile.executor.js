/**
 * Query Profile Executor — queries UNStaffProfile from Memgraph
 */

const { BaseExecutor } = require('../../plugin-base');

class QueryProfileExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'graph.query_profile';
    this.displayName = 'Query User Profile';
    this.description = 'Queries UNStaffProfile from knowledge graph with optional manager and history';
    this.domain = 'workflow';

    this.parameterSchema = {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        include_manager: { type: 'boolean', default: false },
        include_history: { type: 'boolean', default: false },
      },
      required: ['user_id'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();
    // BACKLOG-0045: accept both user_id and userId
    const userId = parameters.user_id || parameters.userId;
    if (!userId) return this.error('MISSING_PARAM', 'user_id or userId is required', true);
    const includeManager = this.getParam(parameters, 'include_manager', false);
    const includeHistory = this.getParam(parameters, 'include_history', false);
    // BACKLOG-0045: configurable label (default: UNStaffProfile, FlowDesk uses Staff)
    const label = parameters.label || parameters.nodeLabel || 'UNStaffProfile';

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      // Try configured label first, fallback to alternative labels
      const labels = [label, ...(label === 'UNStaffProfile' ? ['Staff'] : ['UNStaffProfile'])];
      let profileResult = null;

      for (const tryLabel of labels) {
        const profileQuery = includeManager
          ? `MATCH (u:${tryLabel} {id: $userId}) OPTIONAL MATCH (u)-[:REPORTS_TO]->(m:${tryLabel}) RETURN u, m`
          : `MATCH (u:${tryLabel} {id: $userId}) RETURN u`;

        profileResult = await memgraph.executeQuery(profileQuery, { userId });
        if (profileResult.records && profileResult.records.length > 0) break;

        // Also try user_id field
        const altQuery = includeManager
          ? `MATCH (u:${tryLabel} {user_id: $userId}) OPTIONAL MATCH (u)-[:REPORTS_TO]->(m:${tryLabel}) RETURN u, m`
          : `MATCH (u:${tryLabel} {user_id: $userId}) RETURN u`;
        profileResult = await memgraph.executeQuery(altQuery, { userId });
        if (profileResult.records && profileResult.records.length > 0) break;
      }

      if (!profileResult || !profileResult.records || profileResult.records.length === 0) {
        return this.error('USER_NOT_FOUND', `Profile not found for user_id: ${userId} (tried labels: ${labels.join(', ')})`, true);
      }

      const record = profileResult.records[0];
      const userNode = record.get ? record.get('u') : record._fields?.[0];
      const props = userNode?.properties || userNode || {};
      const profile = {
        user_id: props.user_id || userId,
        full_name: props.full_name || props.name || '',
        email: props.email || '',
        dept: props.dept || props.department || '',
        duty_station: props.duty_station || '',
        manager_id: props.manager_id || '',
        clearance_level: props.clearance_level || 'standard',
        contract_type: props.contract_type || '',
        contract_expiry: props.contract_expiry || '',
        budget_code: props.budget_code || '',
      };

      const result = { profile };

      if (includeManager) {
        const managerNode = record.get ? record.get('m') : record._fields?.[1];
        if (managerNode) {
          const mProps = managerNode.properties || managerNode || {};
          result.manager = {
            user_id: mProps.user_id || '',
            full_name: mProps.full_name || mProps.name || '',
            email: mProps.email || '',
            dept: mProps.dept || mProps.department || '',
            duty_station: mProps.duty_station || '',
          };
        }
      }

      if (includeHistory) {
        const historyQuery = `
          MATCH (u:UNStaffProfile {user_id: $userId})-[:SUBMITTED]->(sr:ServiceRequest)
          RETURN sr
          ORDER BY sr.created_at DESC
          LIMIT 20`;
        const historyResult = await memgraph.executeQuery(historyQuery, { userId });
        result.sr_history = (historyResult.records || []).map(r => {
          const sr = (r.get ? r.get('sr') : r._fields?.[0]) || {};
          const p = sr.properties || sr;
          return {
            id: p.id || p.sr_id || '',
            category: p.category || '',
            status: p.status || '',
            created_at: p.created_at || '',
            resolved_at: p.resolved_at || '',
          };
        });
      }

      return this.success(
        result,
        { duration: Date.now() - startTime, includeManager, includeHistory },
        0.95,
      );
    } catch (error) {
      return this.error('QUERY_ERROR', `Failed to query profile: ${error.message}`, true);
    }
  }
}

module.exports = { QueryProfileExecutor };
