/**
 * Validate Executor — validates user permissions and eligibility
 *
 * Checks UNStaffProfile against action requirements, quotas, and custom rules.
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';

interface ValidationRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'exists';
  value: unknown;
  message?: string;
}

const CLEARANCE_LEVELS: Record<string, number> = {
  basic: 1,
  standard: 2,
  elevated: 3,
  admin: 4,
  security: 5,
};

const ACTION_CLEARANCE: Record<string, number> = {
  submit_sr: 1,
  view_sr: 1,
  approve_request: 3,
  access_system: 2,
  modify_budget: 4,
  admin_action: 5,
};

export class ValidateExecutor extends BaseExecutor {
  readonly type = 'workflow.validate';
  readonly displayName = 'Validate Permissions';
  readonly description = 'Validates user permissions and eligibility for an action';
  readonly domain = 'workflow';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'User ID to validate' },
      action: {
        type: 'string',
        description: 'Action to validate: submit_sr, approve_request, access_system, etc.',
      },
      resource: {
        type: 'object',
        description: 'Resource context (category, duty_station, cost)',
      },
      rules: {
        type: 'array',
        items: { type: 'object' },
        description: 'Additional validation rules',
      },
    },
    required: ['user_id', 'action'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const userId = this.getRequiredParam<string>(parameters, 'user_id');
    const action = this.getRequiredParam<string>(parameters, 'action');
    const resource = this.getParam<Record<string, unknown>>(parameters, 'resource', {});
    const rules = this.getParam<ValidationRule[]>(parameters, 'rules', []);

    const violations: string[] = [];
    const warnings: string[] = [];

    try {
      const memgraph = require('../../../../services/memgraph.service');

      // Load user profile
      const profileQuery = `MATCH (u:UNStaffProfile {user_id: $userId}) RETURN u`;
      const profileResult = await memgraph.executeCypher(profileQuery, { userId });

      if (!profileResult || profileResult.length === 0) {
        return this.success(
          {
            valid: false,
            user_profile: null,
            violations: [`User profile not found: ${userId}`],
            warnings: [],
          },
          { duration: Date.now() - startTime },
          0.5,
        );
      }

      const userNode = profileResult[0].u?.properties || profileResult[0].u || {};
      const userProfile = {
        name: userNode.full_name || userNode.name || '',
        dept: userNode.dept || userNode.department || '',
        duty_station: userNode.duty_station || '',
        role: userNode.role || 'staff',
        clearance_level: userNode.clearance_level || 'standard',
        contract_type: userNode.contract_type || '',
        contract_expiry: userNode.contract_expiry || '',
        budget_code: userNode.budget_code || '',
      };

      // Check 1: Contract not expired
      if (userProfile.contract_type === 'expired') {
        violations.push('User contract has expired');
      } else if (userProfile.contract_expiry) {
        const expiry = new Date(userProfile.contract_expiry);
        if (expiry < new Date()) {
          violations.push('User contract has expired');
        } else if (expiry.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000) {
          warnings.push('User contract expires within 30 days');
        }
      }

      // Check 2: Duty station match
      if (resource.duty_station && userProfile.duty_station) {
        if (userProfile.duty_station !== resource.duty_station) {
          warnings.push(`User duty station (${userProfile.duty_station}) differs from resource (${resource.duty_station})`);
        }
      }

      // Check 3: Clearance level
      const requiredClearance = ACTION_CLEARANCE[action] || 1;
      const userClearance = CLEARANCE_LEVELS[userProfile.clearance_level] || 2;
      if (userClearance < requiredClearance) {
        violations.push(`Insufficient clearance: requires ${requiredClearance}, user has ${userClearance} (${userProfile.clearance_level})`);
      }

      // Check 4: Monthly SR quota (for submit_sr)
      if (action === 'submit_sr') {
        try {
          const quotaQuery = `
            MATCH (u:UNStaffProfile {user_id: $userId})-[:SUBMITTED]->(sr:ServiceRequest)
            WHERE sr.created_at >= datetime() - duration('P30D')
            RETURN count(sr) as srCount`;
          const quotaResult = await memgraph.executeCypher(quotaQuery, { userId });
          const monthlyCount = quotaResult?.[0]?.srCount || 0;

          if (monthlyCount >= 50) {
            violations.push(`Monthly SR quota exceeded: ${monthlyCount}/50`);
          } else if (monthlyCount >= 40) {
            warnings.push(`Approaching monthly SR quota: ${monthlyCount}/50`);
          }
        } catch {
          // Quota check failed — non-blocking
          warnings.push('Could not verify monthly SR quota');
        }
      }

      // Check 5: Budget limit (if cost specified)
      if (resource.cost && typeof resource.cost === 'number') {
        const cost = resource.cost as number;
        if (userClearance < 3 && cost > 5000) {
          violations.push(`Budget limit exceeded: $${cost} requires elevated clearance`);
        } else if (userClearance < 4 && cost > 25000) {
          violations.push(`Budget limit exceeded: $${cost} requires admin clearance`);
        }
      }

      // Check 6: Custom rules
      for (const rule of rules) {
        const fieldValue = (userProfile as any)[rule.field];
        const ruleResult = this.evaluateRule(rule, fieldValue);
        if (!ruleResult.passed) {
          violations.push(rule.message || `Rule failed: ${rule.field} ${rule.operator} ${rule.value}`);
        }
      }

      return this.success(
        {
          valid: violations.length === 0,
          user_profile: userProfile,
          violations,
          warnings,
        },
        { duration: Date.now() - startTime, action, checksRun: 6 + rules.length },
        violations.length === 0 ? 1.0 : 0.3,
      );
    } catch (error: any) {
      return this.error('VALIDATION_ERROR', `Validation failed: ${error.message}`, true);
    }
  }

  private evaluateRule(rule: ValidationRule, fieldValue: unknown): { passed: boolean } {
    switch (rule.operator) {
      case 'eq':
        return { passed: fieldValue === rule.value };
      case 'neq':
        return { passed: fieldValue !== rule.value };
      case 'gt':
        return { passed: (fieldValue as number) > (rule.value as number) };
      case 'gte':
        return { passed: (fieldValue as number) >= (rule.value as number) };
      case 'lt':
        return { passed: (fieldValue as number) < (rule.value as number) };
      case 'lte':
        return { passed: (fieldValue as number) <= (rule.value as number) };
      case 'in':
        return { passed: Array.isArray(rule.value) && rule.value.includes(fieldValue) };
      case 'not_in':
        return { passed: Array.isArray(rule.value) && !rule.value.includes(fieldValue) };
      case 'exists':
        return { passed: fieldValue !== undefined && fieldValue !== null && fieldValue !== '' };
      default:
        return { passed: true };
    }
  }
}
