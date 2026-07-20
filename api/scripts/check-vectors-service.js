'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const svc = require('../src/services/vectors.service');
console.log('vectors.service loaded OK');
console.log('Exports:', Object.keys(svc).join(', '));
process.exit(0);
