/**
 * SQL → GXE Translation Module
 *
 * Exports all components for converting SQL stored procedures
 * to GXE-executable graphs.
 */

const { SqlToGxeNodeMapper, BehavioralNodeType, SQL_TO_GXE_TYPE } = require('./node-mapper');
const { SqlProcedureTranslator, TranslationResult } = require('./procedure-translator');
const { GxeIntegrationService, IntegrationResult, DOMAIN } = require('./gxe-integration.service');

module.exports = {
  // Node mapping
  SqlToGxeNodeMapper,
  BehavioralNodeType,
  SQL_TO_GXE_TYPE,

  // Procedure translation
  SqlProcedureTranslator,
  TranslationResult,

  // Integration
  GxeIntegrationService,
  IntegrationResult,
  DOMAIN,
};
