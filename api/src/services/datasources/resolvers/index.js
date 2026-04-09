const { BaseResolver } = require('./base.resolver');
const { StaticListResolver } = require('./static-list.resolver');
const { MemgraphQueryResolver } = require('./memgraph-query.resolver');
const { RestApiResolver } = require('./rest-api.resolver');
const { SqlQueryResolver } = require('./sql-query.resolver');
const { ComputedResolver } = require('./computed.resolver');

module.exports = {
  BaseResolver,
  StaticListResolver,
  MemgraphQueryResolver,
  RestApiResolver,
  SqlQueryResolver,
  ComputedResolver,
};
