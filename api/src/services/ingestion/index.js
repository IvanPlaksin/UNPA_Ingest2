/**
 * Ingestion Module
 */

const { DocumentParser, documentParser } = require('./document-parser');
const { DocumentChunker, documentChunker } = require('./document-chunker');
const { IngestionPipeline, ingestionPipeline } = require('./ingestion-pipeline');

module.exports = {
  DocumentParser,
  documentParser,

  DocumentChunker,
  documentChunker,

  IngestionPipeline,
  ingestionPipeline
};
