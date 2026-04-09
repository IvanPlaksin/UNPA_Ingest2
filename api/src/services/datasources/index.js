const { DataSourceService } = require('./datasource.service');
const resolvers = require('./resolvers');

module.exports = { DataSourceService, ...resolvers };
