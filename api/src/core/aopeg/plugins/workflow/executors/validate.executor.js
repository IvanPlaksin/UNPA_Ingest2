/**
 * Validate Executor — validates user permissions and eligibility
 */

const { BaseExecutor } = require('../../plugin-base');

const CLEARANCE_LEVELS = { basic: 1, standard: 2, elevated: 3, admin: 4, security: 5 };
const ACTION_CLEARANCE = {
  submit_sr: 1, view_sr: 1, approve_request: 3, access_system: 2, modify_budget: 4, admin_action: 5,
};

class ValidateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.validate';
    this.displayName = 'Validate Permissions';
    this.description = 'Validates user permissions and eligibility for an action';
    this.domain = 'workflow';

    this.parameterSchema = {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        action: { type: 'string' },
        resource: { type: 'object' },
        rules: { type: 'array', items: { type: 'object' } },
      },
      required: ['user_id', 'action'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();
    const userId = this.getRequiredParam(parameters, 'user_id');
    const action = this.getRequiredParam(parameters, 'action');
    const resource = this.getParam(parameters, 'resource', {});
    const rules = this.getParam(parameters, 'rules', []);

    const violations = [];
    const warnings = [];

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      const profileResult = await memgraph.executeQuery(
        'MATCH (u:UNStaffProfile {user_id: $userId}) RETURN u', { userId }
      );

      if (!profileResult.records || profileResult.records.length === 0) {
        return this.success(
          { valid: false, user_profile: null, violations: [`User profile not found: ${userId}`], warnings: [] },
          { duration: Date.now() - startTime }, 0.5,
        );
      }

      const record = profileResult.records[0];
      const userNode = record.get ? record.get('u') : record._fields?.[0];
      const props = userNode?.properties || userNode || {};
      const userProfile = {
        name: props.full_name || props.name || '',
        dept: props.dept || props.department || '',
        duty_station: props.duty_station || '',
        role: props.role || 'staff',
        clearance_level: props.clearance_level || 'standard',
        contract_type: props.contract_type || '',
        contract_expiry: props.contract_expiry || '',
        budget_code: props.budget_code || '',
      };

      // Check 1: Contract
      if (userProfile.contract_type === 'expired') {
        violations.push('User contract has expired');
      } else if (userProfile.contract_expiry) {
        const expiry = new Date(userProfile.contract_expiry);
        if (expiry < new Date()) violations.push('User contract has expired');
        else if (expiry.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000)
          warnings.push('User contract expires within 30 days');
      }

      // Check 2: Duty station match
      if (resource.duty_station && userProfile.duty_station &&
          userProfile.duty_station !== resource.duty_station)
        warnings.push(`User duty station (${userProfile.duty_station}) differs from resource (${resource.duty_station})`);

      // Check 3: Clearance level
      const requiredClearance = ACTION_CLEARANCE[action] || 1;
      const userClearance = CLEARANCE_LEVELS[userProfile.clearance_level] || 2;
      if (userClearance < requiredClearance)
        violations.push(`Insufficient clearance: requires ${requiredClearance}, user has ${userClearance} (${userProfile.clearance_level})`);

      // Check 4: Budget limit
      if (resource.cost && typeof resource.cost === 'number') {
        if (userClearance < 3 && resource.cost > 5000) violations.push(`Budget limit exceeded: $${resource.cost} requires elevated clearance`);
        else if (userClearance < 4 && resource.cost > 25000) violations.push(`Budget limit exceeded: $${resource.cost} requires admin clearance`);
      }

      // Check 5: Custom rules
      for (const rule of rules) {
        const fieldValue = userProfile[rule.field];
        if (!this._evaluateRule(rule, fieldValue))
          violations.push(rule.message || `Rule failed: ${rule.field} ${rule.operator} ${rule.value}`);
      }

      return this.success(
        { valid: violations.length === 0, user_profile: userProfile, violations, warnings },
        { duration: Date.now() - startTime, action, checksRun: 5 + rules.length },
        violations.length === 0 ? 1.0 : 0.3,
      );
    } catch (error) {
      return this.error('VALIDATION_ERROR', `Validation failed: ${error.message}`, true);
    }
  }

  _evaluateRule(rule, fieldValue) {
    switch (rule.operator) {
      case 'eq': return fieldValue === rule.value;
      case 'neq': return fieldValue !== rule.value;
      case 'gt': return fieldValue > rule.value;
      case 'gte': return fieldValue >= rule.value;
      case 'lt': return fieldValue < rule.value;
      case 'lte': return fieldValue <= rule.value;
      case 'in': return Array.isArray(rule.value) && rule.value.includes(fieldValue);
      case 'not_in': return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
      case 'exists': return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
      default: return true;
    }
  }
}

module.exports = { ValidateExecutor };
