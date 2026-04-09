/**
 * WorkSpace Module Index
 *
 * Exports all workspace-related services.
 */

'use strict';

const workspaceService = require('./workspace.service');
const draftService = require('./draft.service');
const sourceService = require('./source.service');
const { createReadOnlyProxy, ReadOnlyProxyService, ALLOWED_KB_NAMESPACES } = require('./readonly-proxy.service');

module.exports = {
  workspaceService,
  draftService,
  sourceService,
  createReadOnlyProxy,
  ReadOnlyProxyService,
  ALLOWED_KB_NAMESPACES,
  getWorkspaceService: require('./workspace.service').getWorkspaceService,
  getDraftService: require('./draft.service').getDraftService,
  getSourceService: require('./source.service').getSourceService,
  DRAFT_TYPE_LABELS: require('./draft.service').DRAFT_TYPE_LABELS,
  TYPE_TO_FAMILY: require('./draft.service').TYPE_TO_FAMILY,
  SOURCE_TYPES: require('./source.service').SOURCE_TYPES,
  DOCUMENT_TYPES: require('./source.service').DOCUMENT_TYPES
};
