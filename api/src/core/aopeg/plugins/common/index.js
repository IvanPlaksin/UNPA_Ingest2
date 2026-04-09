const { CommonPlugin, commonPlugin } = require('./common.plugin');
const executors = require('./executors');

module.exports = { CommonPlugin, commonPlugin, ...executors };
