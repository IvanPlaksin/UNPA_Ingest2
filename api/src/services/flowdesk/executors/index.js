'use strict';

const executors = [
  require('./validate-request'),
  require('./get-user-context'),
  require('./create-service-request'),
  require('./request-approval'),
  require('./update-sr-status'),
  require('./create-work-order'),
  require('./assign-handler'),
  require('./send-notification'),
];

module.exports = { executors };
