/**
 * Query Profile Executor — queries UNStaffProfile from Memgraph
 *
 * Retrieves user profile, optionally including manager profile and SR history.
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';

export class QueryProfileExecutor extends BaseExecutor {
  readonly type = 'graph.query_profile';
  readonly displayName = 'Query User Profile';
  readonly description = 'Queries UNStaffProfile from knowledge graph with optional manager and history';
  readonly domain = 'workflow';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'User ID to look up' },
      include_manager: {
        type: 'boolean',
        default: false,
        description: 'Also load manager profile via REPORTS_TO relationship',
      },
      include_history: {
        type: 'boolean',
        default: false,
        description: 'Load service request history',
      },
    },
    required: ['user_id'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const userId = this.getRequiredParam<string>(parameters, 'user_id');
    const includeManager = this.getParam<boolean>(parameters, 'include_manager', false);
    const includeHistory = this.getParam<boolean>(parameters, 'include_history', false);

    try {
      const memgraph = require('../../../../services/memgraph.service');

      // Query user profile with optional manager
      const profileQuery = includeManager
        ? `MATCH (u:UNStaffProfile {user_id: $userId})
           OPTIONAL MATCH (u)-[:REPORTS_TO]->(m:UNStaffProfile)
           RETURN u, m`
        : `MATCH (u:UNStaffProfile {user_id: $userId})
           RETURN u`;

      const profileResult = await memgraph.executeCypher(profileQuery, { userId });

      if (!profileResult || profileResult.length === 0) {
        return this.error('USER_NOT_FOUND', `UNStaffProfile not found for user_id: ${userId}`, true);
      }

      const record = profileResult[0];
      const userNode = record.u?.properties || record.u || {};
      const profile = {
        user_id: userNode.user_id || userId,
        full_name: userNode.full_name || userNode.name || '',
        email: userNode.email || '',
        dept: userNode.dept || userNode.department || '',
        duty_station: userNode.duty_station || '',
        manager_id: userNode.manager_id || '',
        clearance_level: userNode.clearance_level || 'standard',
        contract_type: userNode.contract_type || '',
        contract_expiry: userNode.contract_expiry || '',
        budget_code: userNode.budget_code || '',
      };

      const result: Record<string, any> = { profile };

      // Manager profile
      if (includeManager && record.m) {
        const managerNode = record.m?.properties || record.m || {};
        result.manager = {
          user_id: managerNode.user_id || '',
          full_name: managerNode.full_name || managerNode.name || '',
          email: managerNode.email || '',
          dept: managerNode.dept || managerNode.department || '',
          duty_station: managerNode.duty_station || '',
        };
      }

      // SR history
      if (includeHistory) {
        const historyQuery = `
          MATCH (u:UNStaffProfile {user_id: $userId})-[:SUBMITTED]->(sr:ServiceRequest)
          RETURN sr
          ORDER BY sr.created_at DESC
          LIMIT 20`;

        const historyResult = await memgraph.executeCypher(historyQuery, { userId });
        result.sr_history = (historyResult || []).map((r: any) => {
          const sr = r.sr?.properties || r.sr || {};
          return {
            id: sr.id || sr.sr_id || '',
            category: sr.category || '',
            status: sr.status || '',
            created_at: sr.created_at || '',
            resolved_at: sr.resolved_at || '',
          };
        });
      }

      return this.success(
        result,
        { duration: Date.now() - startTime, includeManager, includeHistory },
        0.95,
      );
    } catch (error: any) {
      return this.error('QUERY_ERROR', `Failed to query profile: ${error.message}`, true);
    }
  }
}
