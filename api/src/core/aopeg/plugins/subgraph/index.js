const { SubgraphPlugin, subgraphPlugin } = require('./subgraph.plugin');
const executors = require('./executors');

module.exports = { SubgraphPlugin, subgraphPlugin, ...executors };
