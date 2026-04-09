/**
 * SLA Calculate Executor — calculate SLA deadlines from config
 *
 * SLA definitions (response/resolution hours) come from graph params.
 * Supports business hours calculation (optional).
 *
 * Example slaConfig (in graph node params):
 * {
 *   "critical": { "responseHours": 1,  "resolutionHours": 4 },
 *   "high":     { "responseHours": 4,  "resolutionHours": 24 },
 *   "medium":   { "responseHours": 8,  "resolutionHours": 48 },
 *   "low":      { "responseHours": 24, "resolutionHours": 168 }
 * }
 */

const { BaseExecutor } = require('../../plugin-base');

class SLACalculateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sla.calculate';
    this.displayName = 'Calculate SLA Deadlines';
    this.description = 'Calculate SLA response/resolution deadlines from configurable definitions';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        startTime: {
          type: 'string',
          description: 'ISO datetime or "now"',
          default: 'now',
        },
        slaConfig: {
          type: 'object',
          description: 'SLA definitions by key: { key: { responseHours, resolutionHours } }',
        },
        selector: {
          type: 'string',
          description: 'Key to select SLA tier (e.g., priority value like "critical")',
        },
        businessHours: {
          type: 'object',
          description: 'Business hours config (optional)',
          properties: {
            enabled: { type: 'boolean', default: false },
            start: { type: 'number', default: 9 },
            end: { type: 'number', default: 17 },
            excludeWeekends: { type: 'boolean', default: true },
          },
        },
      },
      required: ['slaConfig', 'selector'],
    };
  }

  async execute(parameters, context) {
    const slaConfig = this.getRequiredParam(parameters, 'slaConfig');
    const selector = this.getRequiredParam(parameters, 'selector');
    const startTime = this.getParam(parameters, 'startTime', 'now');
    const businessHours = this.getParam(parameters, 'businessHours', { enabled: false });

    // Get SLA tier
    const sla = slaConfig[selector];
    if (!sla) {
      return this.error(
        'SLA_NOT_FOUND',
        `No SLA config for selector: ${selector}. Available: ${Object.keys(slaConfig).join(', ')}`,
      );
    }

    const start = startTime === 'now' ? new Date() : new Date(startTime);
    if (isNaN(start.getTime())) {
      return this.error('INVALID_TIME', `Invalid startTime: ${startTime}`);
    }

    // Calculate deadlines
    const responseDeadline = sla.responseHours
      ? this._addHours(start, sla.responseHours, businessHours)
      : null;

    const resolutionDeadline = sla.resolutionHours
      ? this._addHours(start, sla.resolutionHours, businessHours)
      : null;

    return this.success({
      selector,
      sla: {
        responseHours: sla.responseHours || null,
        resolutionHours: sla.resolutionHours || null,
      },
      deadlines: {
        response: responseDeadline?.toISOString() || null,
        resolution: resolutionDeadline?.toISOString() || null,
      },
      startedAt: start.toISOString(),
      businessHoursApplied: !!businessHours.enabled,
    });
  }

  _addHours(start, hours, config) {
    if (!config.enabled) {
      return new Date(start.getTime() + hours * 60 * 60 * 1000);
    }

    // Business hours calculation
    const bhStart = config.start || 9;
    const bhEnd = config.end || 17;
    const bhPerDay = bhEnd - bhStart;
    const excludeWeekends = config.excludeWeekends !== false;

    const result = new Date(start);
    let remaining = hours;

    while (remaining > 0) {
      const day = result.getDay();
      const hour = result.getHours();

      // Skip weekends
      if (excludeWeekends && (day === 0 || day === 6)) {
        result.setDate(result.getDate() + 1);
        result.setHours(bhStart, 0, 0, 0);
        continue;
      }

      // Before business hours
      if (hour < bhStart) {
        result.setHours(bhStart, 0, 0, 0);
        continue;
      }

      // After business hours
      if (hour >= bhEnd) {
        result.setDate(result.getDate() + 1);
        result.setHours(bhStart, 0, 0, 0);
        continue;
      }

      // Within business hours
      const hoursLeftToday = bhEnd - hour;
      if (remaining <= hoursLeftToday) {
        result.setTime(result.getTime() + remaining * 60 * 60 * 1000);
        remaining = 0;
      } else {
        remaining -= hoursLeftToday;
        result.setDate(result.getDate() + 1);
        result.setHours(bhStart, 0, 0, 0);
      }
    }

    return result;
  }
}

module.exports = { SLACalculateExecutor };
