const { WorkflowPlugin, workflowPlugin } = require('./workflow.plugin');
const executors = require('./executors');

module.exports = { WorkflowPlugin, workflowPlugin, ...executors };
