'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const route = require('../src/routes/vectors.route');
console.log('vectors.route loaded OK, type:', typeof route, route.constructor?.name);
process.exit(0);
