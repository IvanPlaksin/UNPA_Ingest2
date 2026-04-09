/**
 * GXE Runtime Integration Layer
 *
 * Bridges AOPEG plugin system with GXE Runtime Environment.
 *
 * @module runtime/integration
 */

const { AOPEGAdapter, EXECUTOR_TO_TOOL_MAP, TOOL_TO_EXECUTOR_MAP, RuntimeErrorCodes } = require('./AOPEGAdapter');
const { GraphFormatConverter } = require('./GraphFormatConverter');
const { createRuntimeRoutes, activeExecutions } = require('./runtimeRoutes');

module.exports = {
  // Main classes
  AOPEGAdapter,
  GraphFormatConverter,

  // Routes
  createRuntimeRoutes,
  activeExecutions,

  // Mapping tables
  EXECUTOR_TO_TOOL_MAP,
  TOOL_TO_EXECUTOR_MAP,

  // Constants
  RuntimeErrorCodes
};
