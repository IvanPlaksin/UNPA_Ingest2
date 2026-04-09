const { ExtractionPlugin, extractionPlugin } = require('./extraction.plugin');
const executors = require('./executors');

module.exports = { ExtractionPlugin, extractionPlugin, ...executors };
