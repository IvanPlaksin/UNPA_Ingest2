'use strict';

module.exports = {
  hypothesis:       require('./hypothesis.service'),
  admiralty:        require('./admiralty.service'),
  confidenceDecay:  require('./confidence-decay.service'),
  inference:        require('./inference.service'),
  schemas: {
    hypothesis: require('./schemas/hypothesis-schema'),
    admiralty:  require('./schemas/admiralty-schema'),
    inference:  require('./schemas/inference-schema'),
  },
};
