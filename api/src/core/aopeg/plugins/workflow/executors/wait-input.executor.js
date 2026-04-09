/**
 * Wait Input Executor — pauses graph execution waiting for human input.
 *
 * Supports two output formats:
 *   - Legacy: { status: 'WAIT_FOR_INPUT', ... } (backward compat)
 *   - New:    { __type: 'WAIT_FOR_SIGNAL', contract: AsyncSignalContract }
 *
 * The new format is used when:
 *   - resolutionMode is specified (SINGLE/QUORUM/VOTE)
 *   - formId is specified (FormDefinition from KB)
 *   - useSignalContract: true is set
 *
 * NodeRunner automatically wraps legacy format in AsyncSignalContract,
 * so both paths converge in SignalOrchestrator.
 */

const { BaseExecutor } = require('../../plugin-base');
const { randomUUID } = require('node:crypto');

// Signal system imports (lazy to avoid circular deps)
let _signalImports = null;
function getSignalImports() {
  if (!_signalImports) {
    _signalImports = require('../../../../runtime/signals');
  }
  return _signalImports;
}

class WaitInputExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.wait_input';
    this.displayName = 'Wait for Input';
    this.description = 'Pauses graph execution and waits for human input before continuing. Supports SINGLE, QUORUM, and VOTE resolution modes.';
    this.domain = 'workflow';

    this.parameterSchema = {
      type: 'object',
      properties: {
        // Legacy fields (backward compat)
        expected_inputs: { type: 'array', description: 'Expected input fields from the user' },
        recipients: { type: 'array', items: { type: 'string' }, description: 'User IDs or role templates' },
        timeout_hours: { type: 'number', default: 48 },
        timeout_action: { type: 'string', enum: ['auto_approve', 'auto_reject', 'escalate', 'cancel', 'CONTINUE_DEFAULT', 'FAIL', 'ESCALATE', 'SKIP'], default: 'cancel' },
        prompt: { type: 'string', description: 'Message to display to recipients' },
        // New fields (AsyncSignalContract)
        formId: { type: 'string', description: 'FormDefinition ID from KB (CORE namespace)' },
        formSchema: { type: 'object', description: 'Inline JSON Schema for expected input' },
        contextMessage: { type: 'string', description: 'Message explaining what input is needed' },
        contextData: { type: 'object', description: 'Additional context for form prefill/display' },
        resolutionMode: { type: 'string', enum: ['SINGLE', 'QUORUM', 'VOTE'], description: 'How to resolve multiple responses' },
        quorumRequired: { type: 'number', description: 'For QUORUM: responses needed' },
        voteOptions: { type: 'array', description: 'For VOTE: [{value, label}]' },
        useSignalContract: { type: 'boolean', default: false, description: 'Force new WAIT_FOR_SIGNAL format' },
      },
      required: [],
    };
  }

  async execute(parameters, context) {
    const globalVars = context.globalVariables;
    const variablesObj = globalVars instanceof Map
      ? Object.fromEntries(globalVars)
      : (globalVars || {});

    // Determine if we should use new signal contract format
    const useNewFormat = parameters.useSignalContract ||
                         parameters.formId ||
                         parameters.resolutionMode;

    if (useNewFormat) {
      return this._executeWithSignalContract(parameters, context, variablesObj);
    }

    // Legacy format
    return this._executeLegacy(parameters, context, variablesObj);
  }

  // ── New format: __type: 'WAIT_FOR_SIGNAL' ──

  _executeWithSignalContract(parameters, context, variablesObj) {
    const {
      SignalType, ResolutionMode, TimeoutAction, ParticipantType,
    } = getSignalImports();

    const recipients = (parameters.recipients || [])
      .map(r => this._resolveTemplate(r, variablesObj));
    const timeoutHours = parameters.timeout_hours || parameters.timeoutHours || 48;
    const timeoutAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000).toISOString();

    // Build payload schema
    let payloadSchema = { type: 'object' };
    if (parameters.formSchema) {
      payloadSchema = parameters.formSchema;
    } else if (parameters.expected_inputs) {
      payloadSchema = this._expectedInputsToSchema(parameters.expected_inputs);
    }

    // Build participants
    const participants = recipients.map(refId => ({
      type: ParticipantType.HUMAN_USER,
      refId,
      weight: 1.0,
    }));

    // Build resolution policy
    const mode = parameters.resolutionMode || 'SINGLE';
    const resolutionPolicy = {
      mode: ResolutionMode[mode] || ResolutionMode.SINGLE,
      participants,
    };

    if (mode === 'QUORUM') {
      resolutionPolicy.quorumRequired = parameters.quorumRequired ||
        Math.ceil(participants.length / 2);
      resolutionPolicy.quorumStrategy = 'FIRST_WINS';
    }

    if (mode === 'VOTE') {
      resolutionPolicy.voteOptions = parameters.voteOptions || [
        { value: 'APPROVE', label: 'Approve' },
        { value: 'REJECT', label: 'Reject' },
      ];
      resolutionPolicy.resolutionStrategy = 'MAJORITY';
      resolutionPolicy.tieBreak = 'ESCALATE';
    }

    // Map legacy timeout actions
    const timeoutAction = this._mapTimeoutAction(
      parameters.timeout_action || parameters.timeoutAction || 'FAIL'
    );

    return {
      __type: 'WAIT_FOR_SIGNAL',
      contract: {
        signalType: SignalType.USER_INPUT,
        payloadSchema,
        timeoutAt,
        timeoutAction,
        contextRef: {
          execution_id: context.executionId,
          node_id: context.nodeId,
        },
        resolutionPolicy,
        formId: parameters.formId || null,
        contextMessage: parameters.contextMessage || parameters.prompt || '',
        metadata: {
          contextData: parameters.contextData || {},
          createdBy: context.userId || 'system',
        },
      },
    };
  }

  // ── Legacy format: { status: 'WAIT_FOR_INPUT' } ──

  _executeLegacy(parameters, context, variablesObj) {
    const expectedInputs = this.getRequiredParam(parameters, 'expected_inputs');
    const recipients = this.getRequiredParam(parameters, 'recipients');
    const timeoutHours = this.getParam(parameters, 'timeout_hours', 48);
    const timeoutAction = this.getParam(parameters, 'timeout_action', 'cancel');
    const prompt = this.getParam(parameters, 'prompt', '');

    if (!expectedInputs.length) {
      return this.error('INVALID_INPUT', 'expected_inputs array cannot be empty', true);
    }
    if (!recipients.length) {
      return this.error('INVALID_INPUT', 'recipients array cannot be empty', true);
    }

    const resolvedRecipients = recipients.map(r => this._resolveTemplate(r, variablesObj));
    const resumeToken = randomUUID();
    const timeoutAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    return {
      status: 'WAIT_FOR_INPUT',
      resume_token: resumeToken,
      expected_inputs: expectedInputs,
      recipients: resolvedRecipients,
      timeout_at: timeoutAt.toISOString(),
      timeout_action: timeoutAction,
      prompt,
    };
  }

  // ── Helpers ──

  _resolveTemplate(template, variables) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value = variables;
      for (const key of keys) {
        value = value?.[key];
      }
      return value != null ? String(value) : match;
    });
  }

  _expectedInputsToSchema(expectedInputs) {
    const properties = {};
    const required = [];
    for (const field of expectedInputs) {
      if (typeof field === 'string') {
        properties[field] = { type: 'string' };
      } else if (typeof field === 'object' && field.name) {
        properties[field.name] = { type: field.type || 'string' };
        if (field.required) required.push(field.name);
      }
    }
    return { type: 'object', properties, required };
  }

  _mapTimeoutAction(action) {
    const mapping = {
      cancel: 'FAIL',
      auto_approve: 'CONTINUE_DEFAULT',
      auto_reject: 'FAIL',
      escalate: 'ESCALATE',
      CONTINUE_DEFAULT: 'CONTINUE_DEFAULT',
      FAIL: 'FAIL',
      ESCALATE: 'ESCALATE',
      SKIP: 'SKIP',
    };
    return mapping[action] || 'FAIL';
  }
}

module.exports = { WaitInputExecutor };
