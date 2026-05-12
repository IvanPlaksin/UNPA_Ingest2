'use strict';

const executors = [
  require('./validate-request.js'),
  require('./get-user-context.js'),
  require('./create-service-request.js'),
  require('./request-approval.js'),
  require('./update-sr-status.js'),
  require('./create-work-order.js'),
  require('./assign-handler.js'),
  require('./send-notification.js'),
];

module.exports = { executors };
