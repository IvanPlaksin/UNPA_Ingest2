/**
 * FlowDesk Instance Manifest
 *
 * Single registration point for the FlowDesk instance.
 * The platform discovers this file via scanning /instances/<name>/index.js at startup.
 */
'use strict';

const { flowdeskPlugin } = require('./aopeg');
const flowdeskRoutes     = require('./routes/flowdesk.route');
const flowdeskConfigRoutes = require('./routes/flowdesk-config.route');

module.exports = {
  namespace: 'FLOWDESK',
  plugin: flowdeskPlugin,
  routes: [
    { path: '/api/v1/flowdesk',        router: flowdeskRoutes },
    { path: '/api/v1/flowdesk/config', router: flowdeskConfigRoutes },
  ],
  onRegister: async (_platform) => {
    // Instance-specific startup hooks go here
  },
};
