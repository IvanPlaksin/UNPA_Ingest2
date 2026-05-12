'use strict';

module.exports = {
  polarity:       require('./polarity.service'),
  temporal:       require('./temporal.service'),
  retraction:     require('./retraction.service'),
  edgeProperties: require('./edge-properties.service'),
  schema:         require('./schemas/edge-schema'),
};
