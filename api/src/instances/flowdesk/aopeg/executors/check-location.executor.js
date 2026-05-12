/**
 * FlowDesk: Check if user has a known location (silent auto-advance node)
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');

let routing;
try {
  routing = require('../../services/graph-routing.js');
} catch {
  // graph-routing not available — location lookup from KG will be skipped
}

class CheckLocationExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.check_location';
    this.displayName = 'Check Location';
    this.description = 'Check if user has a known location in their profile. Silent node — auto-advances.';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        location: { type: 'object', description: 'Pre-set location if already known' },
        dutyStation: { type: 'string', description: 'Duty station name if already known' },
      },
    };
  }

  async execute(parameters, context) {
    const location = parameters.location;
    const dutyStation = parameters.dutyStation || parameters.duty_station;

    if (location || dutyStation) {
      return this.success({
        location: location || { name: dutyStation },
        has_location: true,
      });
    }

    // Try to load from user context via graph query
    if (routing) {
      try {
        await routing.init();
        const userId = parameters.userId || context?.executionContext?.sharedState?.get('userId');
        if (userId) {
          const ctx = await routing.getUserContext(userId);
          if (ctx?.location?.dutyStation) {
            return this.success({
              location: { name: ctx.location.dutyStation, country: ctx.location.country },
              has_location: true,
            });
          }
        }
      } catch (err) {
        const logger = context?.logger || console;
        logger.warn?.('check_location: failed to query user context from KG, falling back to no_location', err.message);
      }
    }

    return this.success({ location: null, has_location: false });
  }
}

module.exports = { CheckLocationExecutor };
